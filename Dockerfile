# --- Stage 1: Build Frontend ---
FROM node:20-slim AS fe
WORKDIR /fe
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# --- Stage 2: Python Runtime ---
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 \
    PORT=8080 \
    PROBLEMS_DIR=/app/problems \
    MATERIALS_DIR=/app/materials \
    STATIC_DIR=/app/static

WORKDIR /app
COPY backend/pyproject.toml ./
RUN pip install --no-cache-dir uv && uv pip install --system -r pyproject.toml
COPY backend/app ./app
COPY problems ./problems
COPY materials ./materials
COPY --from=fe /fe/dist ./static

CMD exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --ws-ping-interval 20 --ws-ping-timeout 20
