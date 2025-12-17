# Admin deployment

The admin panel is part of the main BWonderComics site and is served at `/admin/` by the backend.

For deployment instructions, use:
- `deploy/README.md`

Security basics:
- Serve over HTTPS.
- Restrict `/admin/` (reverse-proxy auth, VPN/IP allowlist) if the server is public.

