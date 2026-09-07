"""Gunicorn configuration.

    gunicorn -c gunicorn_conf.py app.main:app

FastAPI is ASGI, so the workers must be uvicorn's. Plain `sync` workers cannot run it at
all, and `gevent` would break the SSE endpoint.
"""

import multiprocessing
import os

bind = f"0.0.0.0:{os.getenv('PORT', '8000')}"

# The usual (2 x cores) + 1 is tuned for CPU-bound work. This service is almost entirely
# waiting — on Postgres, and on Gemini for several seconds at a time — so it is capped by
# the database pool, not the CPU. A t3.micro has 2 cores; 4 workers is plenty and leaves
# room under Supabase's pooler connection limit.
workers = int(os.getenv("WEB_CONCURRENCY", min(4, multiprocessing.cpu_count() * 2 + 1)))
worker_class = "uvicorn.workers.UvicornWorker"

# Longer than the default 30s on purpose: a mission-generation call can legitimately take
# 20-30 seconds. Too low here and Gunicorn kills its own worker mid-generation, which
# looks exactly like a model failure and is not one.
timeout = 120
graceful_timeout = 30

# Slightly above a typical 60s upstream idle timeout, so the connection is closed by us
# rather than dropped by something in front of us.
keepalive = 65

accesslog = "-"
errorlog = "-"
loglevel = os.getenv("LOG_LEVEL", "info").lower()

# Request id first: it is how a report from a classroom becomes a log query.
access_log_format = '%({X-Request-ID}i)s %(h)s "%(r)s" %(s)s %(b)s %(M)sms'

# Recycle workers periodically. Cheap insurance against a slow leak in a long-running
# LangGraph process; the jitter stops every worker restarting at once.
max_requests = 1000
max_requests_jitter = 100
