#!/usr/bin/env bash
set -euo pipefail

##############################################################################
# QuotePilot — SSL/HTTPS Setup with Let's Encrypt
#
# Run this ON THE VM after DNS is configured and pointing to the VM's IP.
#
# Usage:
#   sudo ./setup-ssl.sh your-domain.com your@email.com
##############################################################################

DOMAIN="${1:-}"
EMAIL="${2:-}"

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
  echo "Usage: sudo $0 <domain> <email>"
  echo "Example: sudo $0 app.quotepilot.com admin@quotepilot.com"
  exit 1
fi

echo "→ Setting up HTTPS for: $DOMAIN"

# ─── STEP 1: HTTP-only config for ACME challenge ──────────────────────────
echo "→ Configuring nginx for HTTP-only (ACME challenge)..."
mkdir -p /var/www/html

cat > /etc/nginx/sites-available/quotepilot <<'HTTPEOF'
server {
    listen 80;
    listen [::]:80;
    server_name __DOMAIN__;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
        client_max_body_size 50M;
    }
}
HTTPEOF

sed -i "s/__DOMAIN__/${DOMAIN}/g" /etc/nginx/sites-available/quotepilot

nginx -t
systemctl reload nginx
echo "  ✓ nginx HTTP config active"

# ─── STEP 2: Obtain certificate ───────────────────────────────────────────
echo "→ Requesting certificate from Let's Encrypt..."
certbot certonly \
  --webroot \
  -w /var/www/html \
  -d "$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --non-interactive

echo "  ✓ Certificate obtained"

# ─── STEP 3: Install full HTTPS config ────────────────────────────────────
echo "→ Installing HTTPS nginx config..."

cat > /etc/nginx/sites-available/quotepilot <<'HTTPSEOF'
server {
    listen 80;
    listen [::]:80;
    server_name __DOMAIN__;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name __DOMAIN__;

    ssl_certificate /etc/letsencrypt/live/__DOMAIN__/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/__DOMAIN__/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header X-XSS-Protection "1; mode=block" always;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
HTTPSEOF

sed -i "s/__DOMAIN__/${DOMAIN}/g" /etc/nginx/sites-available/quotepilot

nginx -t && systemctl reload nginx
echo "  ✓ HTTPS config active"

# ─── STEP 4: Auto-renewal cron ────────────────────────────────────────────
echo "→ Setting up auto-renewal cron..."
cat > /etc/cron.d/certbot-renew <<'CRON'
0 3 * * * root certbot renew --quiet --deploy-hook "systemctl reload nginx"
CRON

echo ""
echo "✓ HTTPS configured for $DOMAIN"
echo "  Certificate: /etc/letsencrypt/live/$DOMAIN/"
echo "  Auto-renewal: daily at 3:00 AM"
echo ""
