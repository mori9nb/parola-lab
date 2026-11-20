"""Serve the compiled React app on the API origin in the deployment image."""
from pathlib import Path
from fastapi.staticfiles import StaticFiles


def mount_frontend(app, directory):
    directory = Path(directory)
    if not (directory / "index.html").is_file():
        raise RuntimeError("Frontend build is missing; use Dockerfile.render for deployment")
    # Mount last so /api and /health always reach FastAPI first.
    app.mount("/", StaticFiles(directory=str(directory), html=True), name="frontend")
