# PEMS backend — FastAPI/uvicorn, single worker (runs the 15-min rollup scheduler).
# Build context is the project root (see docker-compose.yml): `docker build -f backend/Dockerfile .`
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app/backend

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./

RUN useradd --create-home --shell /bin/bash pems \
    && chown -R pems:pems /app
USER pems

EXPOSE 4040

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -fsS "http://localhost:${APP_PORT:-4040}/api/health" || exit 1

# APP_HOST/APP_PORT come from the environment (see docker-compose.yml) — .env is not
# baked into the image, it's supplied at run time via env_file.
CMD ["python", "run.py"]
