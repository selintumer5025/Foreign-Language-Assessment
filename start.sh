#!/usr/bin/env bash
set -euo pipefail

# Build the frontend assets before starting the backend service
npm install --prefix frontend
npm run build --prefix frontend

# Start the FastAPI backend
exec uvicorn backend.main:app --host 0.0.0.0 --port "${PORT:-8000}"
