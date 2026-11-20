"""Render startup: migrate then exec Uvicorn (one web service, one origin)."""
import os
import subprocess
import sys
from urllib.parse import urlsplit
from app.config import settings


def main():
    origin = settings.public_origin or settings.render_external_url
    if urlsplit(origin).scheme != "https" or not urlsplit(origin).netloc:
        raise SystemExit("Set PUBLIC_ORIGIN to the HTTPS app URL (Render sets RENDER_EXTERNAL_URL automatically).")
    if not settings.session_cookie_secure:
        raise SystemExit("SESSION_COOKIE_SECURE must be true for deployment.")
    if not settings.serve_frontend:
        raise SystemExit("SERVE_FRONTEND must be true for this deployment.")
    if not settings.database_url.startswith("postgresql+psycopg://"):
        raise SystemExit("Deployment requires the Neon PostgreSQL DATABASE_URL.")
    port = int(os.environ.get("PORT", "10000"))
    if not 1 <= port <= 65535:
        raise SystemExit("Invalid PORT")
    # Free Render services have no separate pre-deploy command; run before serving.
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], check=True)
    os.execvp(sys.executable, [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", str(port), "--proxy-headers"])


if __name__ == "__main__":
    main()
