# Deploying the AI backend to EC2

Scheduled for **6 September** and carrying the whole stubbed API, not just `/health` —
per `docs/roadmap.html`. Two reasons it is this early:

- Nginx, Gunicorn, systemd and TLS always take longer the first time. Discovering that on
  the 14th is how a working backend fails to reach a judge.
- The moment it is up, the client team has a real URL. Nine days of integration instead
  of two.

Everything below is a one-time setup except the last section, which you will run on every
deploy. Budget an hour for the first pass.

---

## 0. Before you start

You need an AWS account and a domain (or a subdomain) you can point at an IP. Without a
domain you can still run on HTTP over the raw IP, but browsers will block requests from
the HTTPS Vercel site to an HTTP API — so plan on the domain.

The local `aws` CLI is installed but its credentials are invalid. Fix that first if you
want to drive AWS from the terminal:

```bash
aws configure          # access key, secret, region eu-west-1
aws sts get-caller-identity   # must print your account, not an error
```

Or just use the console. Nothing below requires the CLI.

---

## 1. Launch the instance

| Setting | Value | Why |
| --- | --- | --- |
| AMI | Ubuntu Server 24.04 LTS | matches AGENTS.md |
| Type | `t3.micro` | free tier; enough for stubs and the demo |
| Region | `eu-west-1` (Ireland) | same region as the Supabase project — keeps DB latency low |
| Key pair | create one, save the `.pem` | your only way in |
| Storage | 16 GB gp3 | 8 GB fills up fast once Docker images accumulate |

**Security group** — this is the part worth getting right:

| Port | Source | Note |
| --- | --- | --- |
| 22 (SSH) | **your IP only** | never `0.0.0.0/0` |
| 80 (HTTP) | `0.0.0.0/0` | certbot needs it, and it redirects to 443 |
| 443 (HTTPS) | `0.0.0.0/0` | the real entry point |

**Do not open 8000.** The container binds to `127.0.0.1:8000`, so it is unreachable from
outside regardless — but an open 8000 plus one careless compose edit is a plaintext API on
the public internet.

Then allocate an **Elastic IP** and associate it. Without one the public IP changes on
every stop/start, and your client team's `AI_SERVICE_URL` silently dies overnight.

---

## 2. Point the domain

An `A` record for `api.yourdomain.com` → the Elastic IP. Verify before continuing, because
certbot fails confusingly if DNS has not propagated:

```bash
dig +short api.yourdomain.com     # must print your Elastic IP
```

---

## 3. Set up the box

```bash
ssh -i your-key.pem ubuntu@api.yourdomain.com
```

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx git

# Docker, from Docker's own repo — Ubuntu's packaged docker.io is old enough to lack
# `docker compose` as a subcommand.
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
newgrp docker      # or log out and back in
```

---

## 4. Get the code

```bash
git clone https://github.com/Justxd22/TICO.git
cd TICO/ai-backend
```

Create `.env` on the server. **Never commit it and never scp your local one** — it holds
the database password.

```bash
nano .env
```

```bash
DATABASE_URL=postgresql+psycopg2://postgres.rkopujievemxjzspteyk:PASSWORD@aws-1-eu-west-1.pooler.supabase.com:5432/postgres
SUPABASE_URL=https://rkopujievemxjzspteyk.supabase.co
JWT_SECRET=
JWT_AUDIENCE=authenticated
GOOGLE_API_KEY=
ENVIRONMENT=production
LOG_LEVEL=INFO
DAILY_MODEL_CALL_CAP=200
CORS_ORIGINS=https://your-vercel-app.vercel.app
```

**`GOOGLE_API_KEY` must be a real key or the service will not boot.** Verified by
building and running this image: with `ENVIRONMENT=production` and an empty key, every
Gunicorn worker exits with

```
ValueError: Missing required environment variable: GOOGLE_API_KEY is required in production.
[ERROR] Worker failed to boot.
```

That guard is deliberate — a production service that silently runs without a model is
worse than one that refuses to start. But it means **getting the key from
aistudio.google.com/apikey is a prerequisite for the deploy, not a later step.**

Three more things people get wrong here:

- **`CORS_ORIGINS` must be the real Vercel URL.** `localhost:3000` is the default and the
  browser will block every call from production with a CORS error that looks like the
  server being down.
- **`ENVIRONMENT=production` is load-bearing.** It disables `/docs` and makes missing auth
  config a hard 503 instead of quietly serving a demo user — a dev-mode server on a public
  IP serves everyone as `demo-student-1`.
- **Port 5432, not 6543.** psycopg2 needs the session pooler.

```bash
chmod 600 .env
```

---

## 5. Start it

```bash
docker compose -f docker-compose-prod.yml up -d --build
```

First build takes a few minutes. Then check it locally on the box:

```bash
curl -s localhost:8000/v1/health
# {"data":{"status":"ok","environment":"production","database":"ok"},"meta":{...}}
```

`"database":"ok"` proves the Supabase connection works from EC2, which is the single most
likely thing to be wrong.

---

## 6. Nginx and TLS

```bash
sudo cp nginx/tico-ai.conf /etc/nginx/sites-available/tico-ai
sudo nano /etc/nginx/sites-available/tico-ai     # set server_name to api.yourdomain.com
sudo ln -s /etc/nginx/sites-available/tico-ai /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.yourdomain.com
```

Certbot edits the config to add the 443 block and the redirect, and installs a renewal
timer. Do not hand-write the TLS block.

```bash
curl -s https://api.yourdomain.com/v1/health
```

---

## 7. Survive a reboot

`restart: always` in the compose file handles the container. Docker itself needs enabling:

```bash
sudo systemctl enable docker
```

Reboot once now and confirm it comes back. Finding out it does not on the 14th is not the
moment.

```bash
sudo reboot
# wait, then:
curl -s https://api.yourdomain.com/v1/health
```

> **On `gunicorn.service`.** AGENTS.md mentions systemd, and the course runs Gunicorn under
> a unit file directly. Running it in Docker with `restart: always` gives the same
> property — survives crashes and reboots — with one fewer moving part, since the Docker
> daemon is already a systemd service. Both are correct; this repo does it with Docker.

---

## 8. Tell the client team

```
AI backend is live: https://api.yourdomain.com
Set AI_SERVICE_URL to it in Vercel's environment variables.

All 11 endpoints answer. Anything with `X-TICO-Stub: 1` is still fixtures — the
shape is final, the behaviour is fake. That header disappears as each milestone lands
and no call signature changes when it does.

Interactive docs are disabled in production. Generate typed calls instead:
    cd ai-backend && python scripts/gen_client_types.py
```

---

## Deploying again (every time after this)

```bash
ssh -i your-key.pem ubuntu@api.yourdomain.com
cd TICO/ai-backend
git pull
docker compose -f docker-compose-prod.yml up -d --build
curl -s localhost:8000/v1/health
```

Roughly a minute. `.env` is untouched by `git pull` because it is gitignored.

---

## When something is wrong

```bash
docker compose -f docker-compose-prod.yml logs -f --tail=100   # app logs
sudo tail -f /var/log/nginx/tico-ai.error.log                  # nginx
docker compose -f docker-compose-prod.yml ps                   # is it even up
```

| Symptom | Almost always |
| --- | --- |
| 502 from nginx | container is down or crashed on boot — check the app logs |
| `"database":"unreachable"` | wrong password, or port 6543 instead of 5432 |
| Every request 401 | `SUPABASE_URL` wrong, or JWKS unreachable from the box |
| CORS error in the browser | `CORS_ORIGINS` is not the exact Vercel origin |
| SSE arrives all at once | the `/v1/tico/messages` nginx block is missing or below `/` |
| Disk full | `docker system prune -a` — old images accumulate on every deploy |
