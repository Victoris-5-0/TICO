# TICO AI backend.
#
# Gunicorn with uvicorn workers, per AGENTS.md. Nginx terminates TLS in front of this on
# EC2; in dev you talk to it directly on 8000.

FROM python:3.12-slim AS base

# PYTHONUNBUFFERED matters more than it looks: without it, logs sit in a buffer and a
# container that dies takes its last words with it — exactly the ones you need.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Requirements first, as their own layer. Application code changes every push;
# dependencies change rarely, so this turns most rebuilds into seconds.
#
# No build-essential or libpq-dev: psycopg2-BINARY ships manylinux wheels with libpq
# statically linked. Switching to plain `psycopg2` would need both, and roughly triple
# the image.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/
COPY content/ ./content/
COPY gunicorn_conf.py .

# Run as a non-root user. If this process is ever compromised, the blast radius should
# not include the container's filesystem.
RUN useradd --create-home --shell /usr/sbin/nologin tico \
    && chown -R tico:tico /app
USER tico

EXPOSE 8000

# Uses /v1/health, which really does check the database — a health check that only
# proves the process is alive will happily report a service that cannot serve anything.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/v1/health', timeout=4).status == 200 else 1)"

CMD ["gunicorn", "-c", "gunicorn_conf.py", "app.main:app"]
