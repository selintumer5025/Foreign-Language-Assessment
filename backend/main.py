"""ASGI entrypoint for the backend service.

This module exposes the FastAPI application for ASGI servers such as Uvicorn.
"""

from backend.app.main import app

__all__ = ["app"]
