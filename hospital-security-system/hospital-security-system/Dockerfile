# Legacy API-only build. For the complete frontend + API use the root Dockerfile.
FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 APP_ENV=production DEMO_MODE=false DATA_DIR=/data
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && useradd --uid 10001 --no-create-home medguard \
    && mkdir -p /data && chown medguard:medguard /data
COPY app ./app
COPY manage.py ./
USER 10001
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-proxy-headers"]
