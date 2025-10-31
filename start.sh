#!/usr/bin/env bash
set -euo pipefail

# Ensure Python backend dependencies are available before starting the service
python -m pip install --upgrade pip
python -m pip install --requirement backend/requirements.txt

# Build the frontend assets before starting the backend service
npm install --prefix frontend
npm run build --prefix frontend

# Start the FastAPI backend
exec uvicorn backend.main:app --host 0.0.0.0 --port "${PORT:-8000}"
