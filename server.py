import http.server
import socketserver
import json
import os
import uuid
import base64
import re
import shutil
import secrets
import hashlib
import hmac
import time
from datetime import datetime
from http import cookies
from urllib.parse import urlparse, parse_qs
from urllib.parse import unquote
import xml.etree.ElementTree as ET
from xml.dom import minidom

PORT = int(os.environ.get("PORT", "8000"))
HOST = os.environ.get("HOST", "")
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ALLOWED_IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.gif', '.webp'}


def safe_path(path):
    """Return an absolute path under BASE_DIR or raise ValueError."""
    normalized = os.path.realpath(os.path.join(BASE_DIR, path.replace('/', os.sep)))
    if not normalized.startswith(BASE_DIR):
        raise ValueError("Invalid path")
    return normalized


def safe_under(base_dir, rel_path):
    """Return an absolute path under base_dir or raise ValueError."""
    normalized = os.path.realpath(os.path.join(base_dir, rel_path.replace('/', os.sep)))
    base_dir_real = os.path.realpath(base_dir)
    if not normalized.startswith(base_dir_real):
        raise ValueError("Invalid path")
    return normalized


def extract_numbers(filename):
    match = re.search(r'(\d+)', filename)
    return int(match.group(1)) if match else -1


# ----------------------- AUTH / COMMENT CONFIG -----------------------
SESSION_COOKIE_NAME = "bb_session"
SESSION_TTL_SECONDS = 60 * 60 * 24 * 7  # 7 days
APP_SECRET = os.environ.get("APP_SECRET") or os.environ.get("REMARK_SECRET") or "change-me"

REGISTRATION_MODE = (os.environ.get("REGISTRATION_MODE") or "open").strip().lower()
INVITE_CODE = (os.environ.get("INVITE_CODE") or "").strip()

DATA_ROOT = (os.environ.get("DATA_ROOT") or "").strip()
DATA_DIR = safe_path('data') if not DATA_ROOT else os.path.realpath(DATA_ROOT)
COMMENTS_DIR = safe_path('comments') if not DATA_ROOT else os.path.realpath(os.path.join(DATA_DIR, "comments"))
USERS_FILE = os.path.join(DATA_DIR, 'users.json')

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(COMMENTS_DIR, exist_ok=True)

DEFAULT_SERIES_ID = "battle-bros"


def sanitize_series_id(value):
    value = (value or "").strip().lower()
    value = re.sub(r'[^a-z0-9_-]+', '-', value).strip('-')
    return value[:64]


def is_premium_role(role):
    role = (role or "").strip().lower()
    return role in ("admin", "premium")


_premium_prefix_cache = {}
_series_index_cache = {}


def _infer_folder_from_pages(pages):
    for path in pages or []:
        if not isinstance(path, str):
            continue
        norm = path.strip().strip('/')
        if '/' not in norm:
            continue
        return norm.rsplit('/', 1)[0]
    return None


def _get_series_data_path(series_id):
    series_id = sanitize_series_id(series_id) or DEFAULT_SERIES_ID
    if series_id == DEFAULT_SERIES_ID:
        return os.path.join(BASE_DIR, 'admin', 'data.json')
    return os.path.join(BASE_DIR, 'admin', 'series', series_id, 'data.json')


def _load_series_index():
    path = os.path.join(BASE_DIR, 'admin', 'series.json')
    try:
        mtime = os.path.getmtime(path)
    except OSError:
        return {}

    cached = _series_index_cache.get("value")
    if cached and cached.get("mtime") == mtime:
        return cached.get("data") or {}

    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if not isinstance(data, dict):
            data = {}
    except Exception:
        data = {}

    _series_index_cache["value"] = {"mtime": mtime, "data": data}
    return data


def _is_series_premium_only(series_id):
    series_id = sanitize_series_id(series_id) or DEFAULT_SERIES_ID
    data = _load_series_index()
    series = data.get("series") if isinstance(data, dict) else None
    if not isinstance(series, list):
        return False
    for item in series:
        if not isinstance(item, dict):
            continue
        if sanitize_series_id(item.get("id")) != series_id:
            continue
        return bool(item.get("premiumOnly"))
    return False


def _compute_premium_prefixes(series_id):
    data_path = _get_series_data_path(series_id)
    try:
        mtime = os.path.getmtime(data_path)
    except OSError:
        return set()

    series_mtime = None
    try:
        series_mtime = os.path.getmtime(os.path.join(BASE_DIR, 'admin', 'series.json'))
    except OSError:
        series_mtime = None

    cached = _premium_prefix_cache.get(series_id)
    if cached and cached.get("mtime") == mtime and cached.get("series_mtime") == series_mtime:
        return cached.get("prefixes", set())

    try:
        with open(data_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception:
        prefixes = set()
        _premium_prefix_cache[series_id] = {"mtime": mtime, "series_mtime": series_mtime, "prefixes": prefixes}
        return prefixes

    chapters = data.get("chapters") if isinstance(data, dict) else {}
    chapter_folders = data.get("chapterFolders") if isinstance(data, dict) else {}
    chapter_meta = data.get("chapterMeta") if isinstance(data, dict) else {}
    if not isinstance(chapters, dict):
        chapters = {}
    if not isinstance(chapter_folders, dict):
        chapter_folders = {}
    if not isinstance(chapter_meta, dict):
        chapter_meta = {}

    prefixes = set()
    if _is_series_premium_only(series_id):
        if series_id == DEFAULT_SERIES_ID:
            prefixes.add("/chapters/")
        else:
            prefixes.add(f"/comics/{series_id}/chapters/")
    for chapter_name, meta in chapter_meta.items():
        if not isinstance(meta, dict):
            continue
        if not meta.get("premium"):
            continue

        folder = chapter_folders.get(chapter_name)
        if not folder and chapter_name in chapters:
            folder = _infer_folder_from_pages(chapters.get(chapter_name) or [])
        if not folder:
            continue
        folder = str(folder).strip().strip('/')
        if not folder:
            continue
        prefixes.add(f"/{folder}/")

    _premium_prefix_cache[series_id] = {"mtime": mtime, "series_mtime": series_mtime, "prefixes": prefixes}
    return prefixes


def _series_id_from_request_path(path):
    path = (path or "").lstrip('/')
    if path.startswith("chapters/"):
        return DEFAULT_SERIES_ID
    if path.startswith("comics/"):
        parts = path.split('/', 3)
        if len(parts) >= 2:
            return sanitize_series_id(parts[1]) or DEFAULT_SERIES_ID
    return DEFAULT_SERIES_ID


def _is_premium_request_path(path):
    parsed = urlparse(path)
    clean_path = unquote(parsed.path or "")
    series_id = _series_id_from_request_path(clean_path)
    prefixes = _compute_premium_prefixes(series_id)
    return any(clean_path.startswith(prefix) for prefix in prefixes)


def load_json_file(path, default):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return default
    except json.JSONDecodeError:
        return default


def save_json_file(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)


def hash_password(password):
    salt = secrets.token_hex(16)
    derived = hashlib.pbkdf2_hmac(
        'sha256', password.encode('utf-8'), salt.encode('utf-8'), 120_000
    ).hex()
    return f"{salt}${derived}"


def verify_password(password, stored):
    try:
        salt, derived = stored.split('$', 1)
    except ValueError:
        return False
    check = hashlib.pbkdf2_hmac(
        'sha256', password.encode('utf-8'), salt.encode('utf-8'), 120_000
    ).hex()
    return hmac.compare_digest(check, derived)


def sign_payload(payload):
    body = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(',', ':')).encode('utf-8')
    ).decode('ascii')
    signature = hmac.new(APP_SECRET.encode('utf-8'), body.encode('ascii'), hashlib.sha256).hexdigest()
    return f"{body}.{signature}"


def verify_token(token):
    if not token or '.' not in token:
        return None
    try:
        body, signature = token.split('.', 1)
        expected = hmac.new(APP_SECRET.encode('utf-8'), body.encode('ascii'), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, signature):
            return None
        payload = json.loads(base64.urlsafe_b64decode(body.encode('ascii')).decode('utf-8'))
        if payload.get('exp', 0) < int(time.time()):
            return None
        return payload
    except Exception:
        return None


def sanitize_target(target_id):
    target_id = (target_id or '').strip()
    if not target_id or len(target_id) > 120 or not re.match(r'^[A-Za-z0-9._:-]+$', target_id):
        raise ValueError("Invalid targetId")
    return target_id


def public_user(user):
    return {
        'id': user['id'],
        'email': user['email'],
        'displayName': user['displayName'],
        'role': user.get('role', 'user'),
        'createdAt': user.get('createdAt')
    }


class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def _read_json(self):
        content_length = int(self.headers.get('Content-Length', 0))
        data = self.rfile.read(content_length) if content_length else b''
        return json.loads(data.decode('utf-8')) if data else {}

    def _json(self, status, payload, headers=None):
        self.send_response(status)
        self.send_header('Content-type', 'application/json')
        if headers:
            for name, value in headers:
                self.send_header(name, value)
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode('utf-8'))

    # ----------------------- AUTH HELPERS -----------------------
    def _get_users(self):
        data = load_json_file(USERS_FILE, {'users': []})
        return data.get('users', [])

    def _save_users(self, users):
        save_json_file(USERS_FILE, {'users': users})

    def _get_session_payload(self):
        raw_cookie = self.headers.get('Cookie')
        if not raw_cookie:
            return None
        try:
            jar = cookies.SimpleCookie()
            jar.load(raw_cookie)
            token = jar.get(SESSION_COOKIE_NAME)
            if not token:
                return None
            return verify_token(token.value)
        except Exception:
            return None

    def _get_current_user(self):
        payload = self._get_session_payload()
        if not payload:
            return None
        users = self._get_users()
        for user in users:
            if user.get('id') == payload.get('uid'):
                return user
        return None

    def _require_admin(self):
        user = self._get_current_user()
        if not user or (user.get('role') or '').lower() != 'admin':
            self._json(403, {'error': 'Admin access required'})
            return None
        return user

    def _set_session_cookie(self, token):
        forwarded_proto = (self.headers.get("X-Forwarded-Proto") or "").lower()
        secure_flag = os.environ.get("COOKIE_SECURE", "").strip().lower() in ("1", "true", "yes") or forwarded_proto == "https"
        secure = "; Secure" if secure_flag else ""
        cookie = f"{SESSION_COOKIE_NAME}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={SESSION_TTL_SECONDS}{secure}"
        return ('Set-Cookie', cookie)

    def _clear_session_cookie(self):
        cookie = f"{SESSION_COOKIE_NAME}=deleted; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
        return ('Set-Cookie', cookie)

    def do_POST(self):
        try:
            admin_only = {
                '/api/save',
                '/api/upload-images',
                '/api/delete-image',
                '/api/rename-image',
                '/api/renumber-chapter',
                '/api/list-images',
                '/api/create-chapter',
                '/api/upload-media',
                '/api/list-media',
                '/api/admin/users/role',
            }
            if self.path in admin_only and not self._require_admin():
                return

            if self.path == '/api/save':
                self.handle_save()
            elif self.path == '/api/upload-images':
                self.handle_upload_images()
            elif self.path == '/api/delete-image':
                self.handle_delete_image()
            elif self.path == '/api/rename-image':
                self.handle_rename_image()
            elif self.path == '/api/renumber-chapter':
                self.handle_renumber_chapter()
            elif self.path == '/api/list-images':
                self.handle_list_images()
            elif self.path == '/api/create-chapter':
                self.handle_create_chapter()
            elif self.path == '/api/upload-media':
                self.handle_upload_media()
            elif self.path == '/api/list-media':
                self.handle_list_media()
            elif self.path == '/api/register':
                self.handle_register()
            elif self.path == '/api/login':
                self.handle_login()
            elif self.path == '/api/logout':
                self.handle_logout()
            elif self.path == '/api/comments':
                self.handle_post_comment()
            elif self.path == '/api/admin/users/role':
                self.handle_admin_set_user_role()
            else:
                self.send_response(404)
                self.end_headers()
        except Exception as e:
            print(f"Error handling {self.path}: {e}")
            self._json(500, {'error': str(e)})

    def do_GET(self):
        if self.path.startswith('/api/comments'):
            self.handle_get_comments()
            return
        if self.path == '/api/session':
            self.handle_session()
            return
        if self.path == '/api/admin/users':
            self.handle_admin_list_users()
            return

        if _is_premium_request_path(self.path):
            user = self._get_current_user()
            if not user or not is_premium_role(user.get('role')):
                self.send_response(403)
                self.send_header('Content-type', 'text/plain; charset=utf-8')
                self.end_headers()
                self.wfile.write(b'Premium content. Please sign in with a premium account.\n')
                return
        super().do_GET()

    def do_HEAD(self):
        if _is_premium_request_path(self.path):
            user = self._get_current_user()
            if not user or not is_premium_role(user.get('role')):
                self.send_response(403)
                self.send_header('Content-type', 'text/plain; charset=utf-8')
                self.end_headers()
                return
        super().do_HEAD()

    # ----------------------- AUTH -----------------------
    def handle_register(self):
        data = self._read_json()
        email = (data.get('email') or '').strip().lower()
        password = data.get('password') or ''
        display_name = (data.get('displayName') or '').strip() or email.split('@')[0]
        invite_code = (data.get('inviteCode') or '').strip()

        if not email or '@' not in email or len(email) > 120:
            self._json(400, {'error': 'Valid email is required'})
            return
        if len(password) < 8 or len(password) > 128:
            self._json(400, {'error': 'Password must be between 8 and 128 characters'})
            return

        if REGISTRATION_MODE not in ("open", "invite", "closed"):
            self._json(500, {'error': 'Server misconfigured: invalid REGISTRATION_MODE'})
            return

        if REGISTRATION_MODE == "closed":
            self._json(403, {'error': 'Registration is closed'})
            return

        if REGISTRATION_MODE == "invite":
            if not INVITE_CODE:
                self._json(500, {'error': 'Server misconfigured: INVITE_CODE is required for invite mode'})
                return
            if invite_code != INVITE_CODE:
                self._json(403, {'error': 'Invalid invite code'})
                return

        users = self._get_users()
        if any(u.get('email') == email for u in users):
            self._json(409, {'error': 'Email already registered'})
            return

        role = 'admin' if len(users) == 0 else 'user'

        user = {
            'id': str(uuid.uuid4()),
            'email': email,
            'displayName': display_name[:60],
            'password': hash_password(password),
            'role': role,
            'createdAt': datetime.utcnow().isoformat() + 'Z'
        }
        users.append(user)
        self._save_users(users)

        token = sign_payload({
            'uid': user['id'],
            'exp': int(time.time()) + SESSION_TTL_SECONDS,
            'nonce': secrets.token_hex(8)
        })
        self._json(200, {'user': public_user(user)}, headers=[self._set_session_cookie(token)])

    def handle_login(self):
        data = self._read_json()
        email = (data.get('email') or '').strip().lower()
        password = data.get('password') or ''

        if not email or not password:
            self._json(400, {'error': 'Email and password are required'})
            return

        users = self._get_users()
        user = next((u for u in users if u.get('email') == email), None)
        if not user or not verify_password(password, user.get('password', '')):
            self._json(401, {'error': 'Invalid credentials'})
            return

        token = sign_payload({
            'uid': user['id'],
            'exp': int(time.time()) + SESSION_TTL_SECONDS,
            'nonce': secrets.token_hex(8)
        })
        self._json(200, {'user': public_user(user)}, headers=[self._set_session_cookie(token)])

    def handle_logout(self):
        self._json(200, {'status': 'ok'}, headers=[self._clear_session_cookie()])

    def handle_session(self):
        user = self._get_current_user()
        if not user:
            self._json(200, {'user': None})
            return
        self._json(200, {'user': public_user(user)})

    # ----------------------- ADMIN USERS -----------------------
    def handle_admin_list_users(self):
        if not self._require_admin():
            return
        users = self._get_users()
        self._json(200, {'users': [public_user(u) for u in users]})

    def handle_admin_set_user_role(self):
        if not self._require_admin():
            return

        data = self._read_json()
        user_id = (data.get('userId') or '').strip()
        role = (data.get('role') or '').strip().lower()

        if not user_id:
            self._json(400, {'error': 'userId is required'})
            return
        if role not in ('user', 'premium', 'admin'):
            self._json(400, {'error': 'Invalid role'})
            return

        users = self._get_users()
        target = next((u for u in users if u.get('id') == user_id), None)
        if not target:
            self._json(404, {'error': 'User not found'})
            return

        target['role'] = role
        self._save_users(users)
        self._json(200, {'user': public_user(target)})

    # ----------------------- JSON SAVE (existing) -----------------------
    def handle_save(self):
        data = self._read_json()

        filename = data.get('filename')
        content = data.get('content')

        if not filename or content is None:
            self._json(400, {'error': 'Missing filename or content'})
            return

        if '..' in filename or filename.startswith('/') or filename.startswith('\\'):
            self._json(403, {'error': 'Invalid filename'})
            return

        file_path = os.path.join(BASE_DIR, filename)
        normalized_path = os.path.realpath(file_path)

        if not normalized_path.startswith(BASE_DIR):
            self._json(403, {'error': 'Invalid path'})
            return

        os.makedirs(os.path.dirname(normalized_path), exist_ok=True)

        with open(normalized_path, 'w', encoding='utf-8') as f:
            if filename.endswith('.json'):
                json.dump(content, f, indent=2)
            else:
                f.write(content)

        if filename == 'posts.json':
            self.generate_rss(content)

        self._json(200, {'status': 'success', 'message': f'Saved {filename}'})

    # ----------------------- IMAGE UPLOAD -----------------------
    def handle_upload_images(self):
        data = self._read_json()
        chapter_folder = (data.get('chapterFolder') or '').strip().strip('/')
        files = data.get('files') or []

        if not chapter_folder or not isinstance(files, list):
            self._json(400, {'error': 'chapterFolder and files are required'})
            return

        try:
            dest_dir = safe_path(chapter_folder)
        except ValueError:
            self._json(400, {'error': 'Invalid chapter path'})
            return

        os.makedirs(dest_dir, exist_ok=True)

        existing_numbers = []
        for name in os.listdir(dest_dir):
            if os.path.splitext(name)[1].lower() in ALLOWED_IMAGE_EXTENSIONS:
                num = extract_numbers(name)
                if num >= 1:
                    existing_numbers.append(num)
        next_number = max(existing_numbers) + 1 if existing_numbers else 1

        stored_paths = []
        errors = []

        for idx, file_info in enumerate(files):
            name = file_info.get('name') or f'file_{idx}'
            ext = os.path.splitext(name)[1].lower()
            if ext not in ALLOWED_IMAGE_EXTENSIONS:
                errors.append({'file': name, 'error': 'Unsupported file type'})
                continue

            b64_data = file_info.get('data')
            if not b64_data:
                errors.append({'file': name, 'error': 'Missing data'})
                continue

            try:
                raw = base64.b64decode(b64_data)
            except Exception:
                errors.append({'file': name, 'error': 'Invalid base64 data'})
                continue

            new_name = f"{next_number:02d}{ext}"
            next_number += 1

            try:
                with open(os.path.join(dest_dir, new_name), 'wb') as f:
                    f.write(raw)
                stored_paths.append(f"{chapter_folder}/{new_name}")
            except Exception as e:
                errors.append({'file': name, 'error': str(e)})

        status = 200 if stored_paths else 400
        self._json(status, {'paths': stored_paths, 'errors': errors})

    # ----------------------- IMAGE DELETE -----------------------
    def handle_delete_image(self):
        data = self._read_json()
        rel_path = (data.get('path') or '').strip().strip('/')
        if not rel_path:
            self._json(400, {'error': 'path is required'})
            return

        try:
            abs_path = safe_path(rel_path)
        except ValueError:
            self._json(400, {'error': 'Invalid path'})
            return

        if not os.path.exists(abs_path):
            self._json(404, {'error': 'File not found'})
            return

        try:
            os.remove(abs_path)
        except Exception as e:
            self._json(500, {'error': str(e)})
            return

        self._json(200, {'status': 'deleted', 'path': rel_path})

    # ----------------------- IMAGE RENAME -----------------------
    def handle_rename_image(self):
        data = self._read_json()
        src = (data.get('from') or '').strip().strip('/')
        dest = (data.get('to') or '').strip().strip('/')

        if not src or not dest:
            self._json(400, {'error': 'from and to are required'})
            return

        try:
            abs_src = safe_path(src)
            abs_dest = safe_path(dest)
        except ValueError:
            self._json(400, {'error': 'Invalid path'})
            return

        if not os.path.exists(abs_src):
            self._json(404, {'error': 'Source file not found'})
            return

        if os.path.exists(abs_dest):
            self._json(409, {'error': 'Destination already exists'})
            return

        os.makedirs(os.path.dirname(abs_dest), exist_ok=True)

        try:
            os.replace(abs_src, abs_dest)
        except Exception as e:
            self._json(500, {'error': str(e)})
            return

        self._json(200, {'status': 'renamed', 'from': src, 'to': dest})

    # ----------------------- CHAPTER RENUMBER -----------------------
    def handle_renumber_chapter(self):
        data = self._read_json()
        chapter_folder = (data.get('chapterFolder') or '').strip().strip('/')
        order = data.get('order') or []

        if not chapter_folder or not isinstance(order, list) or not order:
            self._json(400, {'error': 'chapterFolder and non-empty order are required'})
            return

        try:
            target_dir = safe_path(chapter_folder)
        except ValueError:
            self._json(400, {'error': 'Invalid chapter path'})
            return

        os.makedirs(target_dir, exist_ok=True)

        moves = []
        for idx, rel_path in enumerate(order):
            rel_path = (rel_path or '').strip().strip('/')
            try:
                abs_src = safe_path(rel_path)
            except ValueError:
                self._json(400, {'error': f'Invalid path: {rel_path}'})
                return

            if not os.path.exists(abs_src):
                self._json(404, {'error': f'File not found: {rel_path}'})
                return

            ext = os.path.splitext(abs_src)[1].lower()
            if ext not in ALLOWED_IMAGE_EXTENSIONS:
                self._json(400, {'error': f'Unsupported file type for {rel_path}'})
                return

            new_name = f"{idx + 1:02d}{ext}"
            new_rel = f"{chapter_folder}/{new_name}"
            abs_dest = safe_path(new_rel)
            moves.append((abs_src, abs_dest, new_rel))

        # Two-phase rename to avoid collisions
        temp_moves = []
        for abs_src, _, _ in moves:
            temp_name = abs_src + f".tmp-{uuid.uuid4().hex}"
            shutil.move(abs_src, temp_name)
            temp_moves.append(temp_name)

        new_paths = []
        try:
            for temp_src, (_, abs_dest, new_rel) in zip(temp_moves, moves):
                os.makedirs(os.path.dirname(abs_dest), exist_ok=True)
                shutil.move(temp_src, abs_dest)
                new_paths.append(new_rel)
        except Exception as e:
            self._json(500, {'error': str(e)})
            return

        self._json(200, {'status': 'renumbered', 'paths': new_paths})

    # ----------------------- LIST IMAGES -----------------------
    def handle_list_images(self):
        data = self._read_json()
        chapter_folder = (data.get('chapterFolder') or '').strip().strip('/')

        if not chapter_folder:
            self._json(400, {'error': 'chapterFolder is required'})
            return

        try:
            target_dir = safe_path(chapter_folder)
        except ValueError:
            self._json(400, {'error': 'Invalid chapter path'})
            return

        if not os.path.exists(target_dir):
            self._json(200, {'paths': []})
            return

        files = []
        for name in os.listdir(target_dir):
            ext = os.path.splitext(name)[1].lower()
            if ext in ALLOWED_IMAGE_EXTENSIONS:
                files.append(name)

        files.sort(key=lambda n: (extract_numbers(n), n))
        paths = [f"{chapter_folder}/{name}" for name in files]

        self._json(200, {'paths': paths})

    # ----------------------- CREATE CHAPTER FOLDER -----------------------
    def handle_create_chapter(self):
        data = self._read_json()
        chapter_folder = (data.get('chapterFolder') or '').strip().strip('/')

        if not chapter_folder:
            self._json(400, {'error': 'chapterFolder is required'})
            return

        try:
            dest_dir = safe_path(chapter_folder)
            os.makedirs(dest_dir, exist_ok=True)
        except ValueError:
            self._json(400, {'error': 'Invalid chapter path'})
            return
        except Exception as e:
            self._json(500, {'error': str(e)})
            return

        self._json(200, {'status': 'ok', 'folder': chapter_folder})

    # ----------------------- MEDIA UPLOAD -----------------------
    def handle_upload_media(self):
        data = self._read_json()
        file_info = data.get('file') or {}
        name = (file_info.get('name') or '').strip()
        b64_data = file_info.get('data')

        if not name or not b64_data:
            self._json(400, {'error': 'file (name, data) is required'})
            return

        ext = os.path.splitext(name)[1].lower()
        if ext not in ALLOWED_IMAGE_EXTENSIONS:
            self._json(400, {'error': 'Unsupported file type'})
            return

        try:
            raw = base64.b64decode(b64_data)
        except Exception:
            self._json(400, {'error': 'Invalid base64 data'})
            return

        dest_dir = safe_path('media')
        os.makedirs(dest_dir, exist_ok=True)

        # Ensure unique filename
        base_name = re.sub(r'[^a-zA-Z0-9_-]', '_', os.path.splitext(name)[0]) or 'media'
        candidate = f"{base_name}{ext}"
        counter = 1
        while os.path.exists(os.path.join(dest_dir, candidate)):
            candidate = f"{base_name}_{counter}{ext}"
            counter += 1

        dest_path = os.path.join(dest_dir, candidate)
        try:
            with open(dest_path, 'wb') as f:
                f.write(raw)
        except Exception as e:
            self._json(500, {'error': str(e)})
            return

        rel_path = f"media/{candidate}"
        self._json(200, {'path': rel_path})

    # ----------------------- LIST MEDIA FILES -----------------------
    def handle_list_media(self):
        media_dir = safe_path('media')
        if not os.path.exists(media_dir):
            self._json(200, {'paths': []})
            return

        paths = []
        for root, _, files in os.walk(media_dir):
            for name in files:
                ext = os.path.splitext(name)[1].lower()
                if ext in ALLOWED_IMAGE_EXTENSIONS:
                    abs_path = os.path.join(root, name)
                    rel = os.path.relpath(abs_path, BASE_DIR).replace(os.sep, '/')
                    paths.append(rel)

        paths.sort()
        self._json(200, {'paths': paths})

    def generate_rss(self, posts):
        try:
            rss = ET.Element('rss', version='2.0')
            channel = ET.SubElement(rss, 'channel')

            ET.SubElement(channel, 'title').text = 'Battle Bros Comics Updates'
            ET.SubElement(channel, 'link').text = 'https://bwondercomics.com'
            ET.SubElement(channel, 'description').text = 'Latest updates from the Battle Bros universe.'
            ET.SubElement(channel, 'language').text = 'en-us'

            sorted_posts = sorted(
                [p for p in posts if p.get('share', True)],
                key=lambda x: x.get('date', ''),
                reverse=True
            )

            for post in sorted_posts:
                item = ET.SubElement(channel, 'item')
                ET.SubElement(item, 'title').text = post.get('title', 'Untitled Update')
                ET.SubElement(item, 'link').text = f"https://bwondercomics.com/feed.html#{post.get('id')}"
                ET.SubElement(item, 'guid').text = post.get('id')

                date_str = post.get('date', '')
                try:
                    dt = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                    pubDate = dt.strftime("%a, %d %b %Y %H:%M:%S +0000")
                except Exception:
                    pubDate = date_str

                ET.SubElement(item, 'pubDate').text = pubDate

                description = post.get('content', '')
                if post.get('image'):
                    description = f'<img src="{post.get("image")}" /><br/>{description}'

                ET.SubElement(item, 'description').text = description

            xml_str = minidom.parseString(ET.tostring(rss)).toprettyxml(indent="  ")

            with open(os.path.join(BASE_DIR, 'rss.xml'), 'w', encoding='utf-8') as f:
                f.write(xml_str)

            print("RSS feed generated successfully.")

        except Exception as e:
            print(f"Error generating RSS: {e}")

    # ----------------------- COMMENTS -----------------------
    def handle_get_comments(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query or '')
        target_id = params.get('targetId', [None])[0]
        try:
            target_id = sanitize_target(target_id)
        except ValueError:
            self._json(400, {'error': 'targetId is required'})
            return

        try:
            comments_path = safe_under(COMMENTS_DIR, f"{target_id}.json")
        except ValueError:
            self._json(400, {'error': 'Invalid targetId'})
            return
        comments = load_json_file(comments_path, [])
        self._json(200, {'comments': comments})

    def handle_post_comment(self):
        user = self._get_current_user()
        if not user:
            self._json(401, {'error': 'Not authenticated'})
            return

        data = self._read_json()
        message = (data.get('message') or '').strip()
        target_id = data.get('targetId')

        if not message or len(message) > 2000:
            self._json(400, {'error': 'Message must be between 1 and 2000 characters'})
            return

        try:
            target_id = sanitize_target(target_id)
        except ValueError:
            self._json(400, {'error': 'Invalid targetId'})
            return

        try:
            comments_path = safe_under(COMMENTS_DIR, f"{target_id}.json")
        except ValueError:
            self._json(400, {'error': 'Invalid targetId'})
            return
        comments = load_json_file(comments_path, [])

        new_comment = {
            'id': str(uuid.uuid4()),
            'userId': user['id'],
            'displayName': user.get('displayName') or 'User',
            'message': message,
            'createdAt': datetime.utcnow().isoformat() + 'Z'
        }
        comments.append(new_comment)
        save_json_file(comments_path, comments)

        self._json(200, {'comment': new_comment})


print(f"Starting Battle Bros Server on port {PORT}...")
print(f"Bind host: {HOST or '0.0.0.0'}")
print(f"Registration mode: {REGISTRATION_MODE}")
print(f"Data dir: {DATA_DIR}")
print(f"Comments dir: {COMMENTS_DIR}")
print("Press Ctrl+C to stop.")

os.chdir(BASE_DIR)

class BattleBrosTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


with BattleBrosTCPServer((HOST, PORT), CustomHandler) as httpd:
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
