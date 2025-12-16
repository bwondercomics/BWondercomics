from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool
from starlette.responses import Response
from uuid import UUID

from .settings import settings
from .routes import files as file_routes
from .routes import admin as admin_routes
from .routes import auth as auth_routes
from .routes import comments as comments_routes
from .premium import is_premium_request_path
from .umami_proxy import proxy_to_umami
from .security import verify_token
from .validation import is_premium_role


app = FastAPI(title="BWonderComics API")


@app.exception_handler(RequestValidationError)
async def handle_validation_error(_request: Request, _exc: RequestValidationError):
    return JSONResponse(status_code=400, content={"error": "Invalid request"})


@app.middleware("http")
async def premium_gate(request: Request, call_next):
    if is_premium_request_path(request.url.path):
        token = request.cookies.get(settings.session_cookie_name)
        payload = verify_token(token)
        uid = payload.get("uid") if payload else None
        if not uid:
            return PlainTextResponse(
                "Premium content. Please sign in with a premium account.\n",
                status_code=403,
            )

        async def _load_role() -> str | None:
            from .db import SessionLocal
            from .models import User

            def _query():
                db = SessionLocal()
                try:
                    try:
                        user_id = UUID(str(uid))
                    except Exception:
                        return None
                    user = db.get(User, user_id)
                    return user.role if user else None
                finally:
                    db.close()

            return await run_in_threadpool(_query)

        role = await _load_role()
        if not is_premium_role(role):
            return PlainTextResponse(
                "Premium content. Please sign in with a premium account.\n",
                status_code=403,
            )

    return await call_next(request)


app.include_router(auth_routes.router)
app.include_router(comments_routes.router)
app.include_router(admin_routes.router)
app.include_router(file_routes.router)


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.get("/analytics.js")
def analytics_script(request: Request):
    website_id = settings.umami_website_id
    if settings.umami_proxy_path:
        script_url = f"{settings.umami_proxy_path}/script.js"
    else:
        base_url = (settings.umami_base_url or "").strip().rstrip("/")
        if not base_url:
            forwarded_proto = (request.headers.get("X-Forwarded-Proto") or "").split(",")[0].strip().lower()
            proto = forwarded_proto if forwarded_proto in ("http", "https") else "http"

            host = (request.headers.get("X-Forwarded-Host") or request.headers.get("Host") or "").split(",")[0].strip()
            hostname = host
            if host.startswith("[") and "]" in host:
                hostname = host[1 : host.index("]")]
            elif ":" in host:
                hostname = host.split(":", 1)[0]
            hostname = hostname or "localhost"
            base_url = f"{proto}://{hostname}:{settings.umami_port}"
        script_url = f"{base_url}/script.js" if base_url else ""

    payload = f"""(function(){{
  var websiteId = {website_id!r};
  var src = {script_url!r};
  if (!websiteId || !src) return;
  if (document.querySelector('script[data-website-id=\"' + websiteId + '\"]')) return;

  var s = document.createElement('script');
  s.async = true;
  s.defer = true;
  s.src = src;
  s.setAttribute('data-website-id', websiteId);
  document.head.appendChild(s);
}})();
"""

    return Response(
        content=payload,
        media_type="application/javascript; charset=utf-8",
        headers={"Cache-Control": "no-store"},
    )


if settings.umami_proxy_path:
    @app.api_route(settings.umami_proxy_path, methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])
    @app.api_route(
        settings.umami_proxy_path + "/{rest:path}",
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
    )
    async def umami_proxy(request: Request, rest: str = ""):
        method = request.method.upper()
        incoming_path = request.url.path
        incoming_query = f"?{request.url.query}" if request.url.query else ""
        client_ip = request.client.host if request.client else ""

        body = None
        if method in {"POST", "PUT", "PATCH"}:
            body = await request.body()

        status, _reason, headers, resp_body = await run_in_threadpool(
            proxy_to_umami,
            method,
            incoming_path,
            incoming_query,
            list(request.headers.items()),
            client_ip,
            body,
        )

        response = Response(content=resp_body, status_code=status)
        for name, value in headers:
            if name.lower() == "set-cookie":
                response.headers.append(name, value)
            else:
                response.headers[name] = value
        return response


# Keep the site static-first: mount the repository root as the web root.
# API routes take precedence because this mount is registered last.
app.mount("/", StaticFiles(directory=str(settings.base_dir), html=True), name="static")
