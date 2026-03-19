#!/usr/bin/env bash
# infra/setup-tls.sh — Obtain & auto-renew Let's Encrypt TLS certs via Certbot
#
# Prerequisites:
#   - Domain DNS pointing to this server
#   - Ports 80/443 open
#   - Docker running (uses certbot/certbot image)
#
# Usage:
#   DOMAIN=app.example.com EMAIL=admin@example.com ./setup-tls.sh

set -euo pipefail

DOMAIN="${DOMAIN:?Set DOMAIN env var (e.g. app.example.com)}"
EMAIL="${EMAIL:?Set EMAIL env var for Let's Encrypt notifications}"
WEBROOT="/var/www/certbot"

mkdir -p "$WEBROOT"

echo "══════════════════════════════════════════════════════════"
echo "  OpenClaw TLS Setup"
echo "  Domain: ${DOMAIN}"
echo "  Email:  ${EMAIL}"
echo "══════════════════════════════════════════════════════════"

# ── Step 1: Obtain certificate ────────────────────────────────
echo ""
echo "[1/3] Requesting certificate from Let's Encrypt..."

docker run --rm \
  -v "/etc/letsencrypt:/etc/letsencrypt" \
  -v "/var/lib/letsencrypt:/var/lib/letsencrypt" \
  -v "${WEBROOT}:/var/www/certbot" \
  -p 80:80 \
  certbot/certbot certonly \
    --standalone \
    --non-interactive \
    --agree-tos \
    --email "$EMAIL" \
    -d "$DOMAIN"

echo "[1/3] Certificate obtained ✓"

# ── Step 2: Update nginx config ──────────────────────────────
echo ""
echo "[2/3] Generating production nginx config..."

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NGINX_TLS="${SCRIPT_DIR}/nginx_tls.conf"

# Replace ${DOMAIN} placeholder in template
sed "s/\${DOMAIN}/${DOMAIN}/g" "$NGINX_TLS" > "${SCRIPT_DIR}/../nginx.conf.tls"

echo "  Written to nginx.conf.tls"
echo "  To activate: cp nginx.conf.tls nginx.conf && docker compose restart nginx"
echo "[2/3] Config ready ✓"

# ── Step 3: Set up auto-renewal cron ─────────────────────────
echo ""
echo "[3/3] Setting up auto-renewal..."

CRON_CMD="0 3 * * * docker run --rm -v /etc/letsencrypt:/etc/letsencrypt -v /var/lib/letsencrypt:/var/lib/letsencrypt -v ${WEBROOT}:/var/www/certbot certbot/certbot renew --quiet && docker compose -f $(cd "$SCRIPT_DIR/.." && pwd)/docker-compose.yml restart nginx"

# Add to crontab if not already present
(crontab -l 2>/dev/null | grep -v "certbot.*renew" || true; echo "$CRON_CMD") | crontab -

echo "  Auto-renewal cron added (daily at 3 AM)"
echo "[3/3] Auto-renewal configured ✓"

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  TLS setup complete!"
echo ""
echo "  Next steps:"
echo "    1. cp nginx.conf.tls nginx.conf"
echo "    2. Mount cert volume in docker-compose.yml:"
echo "       nginx:"
echo "         volumes:"
echo "           - /etc/letsencrypt:/etc/letsencrypt:ro"
echo "           - ./nginx.conf:/etc/nginx/nginx.conf"
echo "    3. docker compose restart nginx"
echo "══════════════════════════════════════════════════════════"
