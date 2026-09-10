#!/usr/bin/env bash
#
# Ship main to the EC2 box.
#
#   ./deploy/deploy.sh
#
# Run it from your own machine — the security group only admits SSH from a known IP, so
# this cannot be run from CI or from anywhere else without opening port 22 wider than it
# should be.
#
# Everything here is idempotent. Running it twice deploys the same commit twice and
# changes nothing the second time.

set -euo pipefail

HOST="${TICO_HOST:-ubuntu@54.75.53.43}"
KEY="${TICO_KEY:-$HOME/.ssh/tico-ai.pem}"
URL="${TICO_URL:-https://54-75-53-43.sslip.io}"
REMOTE_DIR="${TICO_REMOTE_DIR:-~/tico-ai}"

say() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
die() { printf '\n\033[31mFAILED: %s\033[0m\n' "$1" >&2; exit 1; }

# --------------------------------------------------------------- before we touch prod
say "checking what is about to ship"

git -C "$(dirname "$0")/../.." fetch -q origin
LOCAL=$(git -C "$(dirname "$0")/../.." rev-parse --short HEAD)
REMOTE=$(git -C "$(dirname "$0")/../.." rev-parse --short origin/main)

[ "$LOCAL" = "$REMOTE" ] || die "local HEAD ($LOCAL) is not origin/main ($REMOTE). Push first."
git -C "$(dirname "$0")/../.." diff --quiet || die "uncommitted changes. Commit or stash them."

echo "  shipping $REMOTE"
git -C "$(dirname "$0")/../.." log --oneline -3

# The offline suite is what CI runs. If it fails here it will fail there, and finding out
# after the container is rebuilt means a broken production while you debug.
say "running the tests that CI runs"
( cd "$(dirname "$0")/.." && env/python.exe -m pytest -q ) || die "tests failed; not deploying"

# ------------------------------------------------------------- let ourselves back in
# Home IPs rotate, and port 22 is deliberately not open to the world — so the first
# symptom of a new IP is the deploy hanging for twenty seconds and dying.
#
# Rather than leave that as a manual step you rediscover every few weeks, authorize the
# current IP if it is not already allowed. Adding a rule that exists is not an error worth
# stopping for, so a duplicate is swallowed.
#
# Skipped entirely when the AWS CLI is absent or unauthenticated: this is a convenience,
# and a deploy should not fail because a credential for a different tool expired.
say "checking ssh access"

MY_IP=$(curl -sf -m 10 https://checkip.amazonaws.com | tr -d '[:space:]' || true)

if [ -n "$MY_IP" ] && command -v aws >/dev/null && aws sts get-caller-identity >/dev/null 2>&1; then
  SG="${TICO_SG:-sg-0c40de5865652f214}"
  if aws ec2 describe-security-groups --group-ids "$SG"        --query "SecurityGroups[].IpPermissions[?FromPort==\`22\`].IpRanges[].CidrIp"        --output text 2>/dev/null | tr '	' '
' | grep -qx "$MY_IP/32"; then
    echo "  $MY_IP already allowed"
  else
    echo "  adding $MY_IP to $SG"
    aws ec2 authorize-security-group-ingress --group-id "$SG"       --protocol tcp --port 22 --cidr "$MY_IP/32"       --output text >/dev/null 2>&1 && echo "  added" || echo "  could not add (may already exist)"
  fi
else
  echo "  skipped — no working aws cli. If ssh times out, allow your IP on port 22 manually."
fi

# ------------------------------------------------------------------------- the deploy
say "deploying to $HOST"

# The box holds a *copy* of ai-backend/, not a clone — there is no .git on it. So the code
# goes up with rsync rather than a pull.
#
# `.env` is excluded and never overwritten: the box's copy holds the production database
# URL, the real model key and the CORS origins, and none of that exists locally. Losing it
# means a container that will not start.
# tar over ssh, not rsync — Git Bash on Windows ships no rsync, and this is the one
# machine the security group lets in, so it has to work here.
#
# `.env` is excluded and never overwritten: the box's copy holds the production database
# URL, the real model key and the CORS origins, none of which exist locally. Losing it
# means a container that will not start.
tar -cz   --exclude='.env'   --exclude='env'   --exclude='__pycache__'   --exclude='.pytest_cache'   --exclude='*.pyc'   --exclude='.git'   -C "$(dirname "$0")/.." . | ssh -i "$KEY" -o ConnectTimeout=20 "$HOST" "mkdir -p ~/tico-ai && tar -xz -C ~/tico-ai"

ssh -i "$KEY" -o ConnectTimeout=20 "$HOST" bash -s <<'REMOTE_SCRIPT'
set -euo pipefail
cd ~/tico-ai

# Production fails fast on a missing key, which is deliberate — but finding that out from a
# dead container is worse than finding it out here.
grep -q '^GOOGLE_API_KEY=.\+' .env || { echo "GOOGLE_API_KEY missing from .env"; exit 1; }
grep -q '^DATABASE_URL=.\+'   .env || { echo "DATABASE_URL missing from .env";   exit 1; }

echo "-- rebuilding"
docker compose -f docker-compose-prod.yml up -d --build

echo "-- pruning old images"
docker image prune -f >/dev/null

echo "-- waiting for the container to answer"
for i in $(seq 1 45); do
  if curl -sf http://127.0.0.1:8000/v1/health >/dev/null; then
    echo "   up after ${i}s"
    exit 0
  fi
  sleep 1
done

echo "container did not become healthy in 45s. Last 40 log lines:"
docker compose -f docker-compose-prod.yml logs --tail=40
exit 1
REMOTE_SCRIPT

# ------------------------------------------------------------------------- verify it
say "verifying from outside"

HEALTH=$(curl -sf -m 20 "$URL/v1/health") || die "$URL is not answering"
echo "  $HEALTH"

echo "$HEALTH" | grep -q '"environment":"production"' || die "not running in production mode"
echo "$HEALTH" | grep -q '"database":"ok"'            || die "cannot reach the database"

# The deployed build should be the commit we just pushed. `version` only exists on builds
# from 2026-09-10 onward, so its absence means the container did not actually rebuild.
echo "$HEALTH" | grep -q '"version"' || die "no version field — the container is stale"

ROUTES=$(curl -sf -m 20 "$URL/openapi.json" | grep -o '"/v1/[a-z/{}_]*"' | sort -u | wc -l)
echo "  $ROUTES routes published"
[ "$ROUTES" -ge 13 ] || die "expected at least 13 routes, saw $ROUTES"

printf '\n\033[32m== deployed %s to %s\033[0m\n\n' "$REMOTE" "$URL"
