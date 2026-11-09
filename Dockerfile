FROM node:22-alpine AS frontend
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend ./frontend
RUN npm run build

FROM python:3.11-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    APP_ENV=production \
    DEMO_MODE=false \
    DATA_DIR=/data \
    STATIC_DIR=/app/static
WORKDIR /app
COPY hospital-security-system/hospital-security-system/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt \
    && groupadd --gid 10001 medguard \
    && useradd --uid 10001 --gid 10001 --no-create-home medguard \
    && mkdir -p /data && chown medguard:medguard /data
COPY hospital-security-system/hospital-security-system/app ./app
COPY hospital-security-system/hospital-security-system/manage.py ./manage.py
COPY --from=frontend /build/frontend/dist ./static
USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-proxy-headers", "--limit-concurrency", "50"]
