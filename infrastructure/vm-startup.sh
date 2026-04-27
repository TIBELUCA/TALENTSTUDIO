#!/usr/bin/env bash
set -euo pipefail

##############################################################################
# QuotePilot — VM Startup Script
# Runs automatically on first boot via Compute Engine metadata
# Installs: Docker, Docker Compose, nginx, certbot, Google Cloud SDK
##############################################################################

export DEBIAN_FRONTEND=noninteractive

LOG_FILE="/var/log/quotepilot-startup.log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "$(date) — QuotePilot VM startup script begin"

apt-get update -y
apt-get upgrade -y

apt-get install -y \
  ca-certificates \
  curl \
  gnupg \
  lsb-release \
  software-properties-common \
  nginx \
  certbot \
  python3-certbot-nginx \
  jq \
  unzip \
  htop \
  apt-transport-https

# ─── INSTALL DOCKER ─────────────────────────────────────────────────────────
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

systemctl enable docker
systemctl start docker

usermod -aG docker "${SUDO_USER:-$(logname 2>/dev/null || echo ubuntu)}" 2>/dev/null || true

# ─── INSTALL GOOGLE CLOUD SDK ───────────────────────────────────────────────
if ! command -v gcloud &>/dev/null; then
  curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg | \
    gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg

  echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] \
    https://packages.cloud.google.com/apt cloud-sdk main" | \
    tee /etc/apt/sources.list.d/google-cloud-sdk.list > /dev/null

  apt-get update -y
  apt-get install -y google-cloud-cli
fi

# ─── CONFIGURE DOCKER FOR ARTIFACT REGISTRY ─────────────────────────────────
gcloud auth configure-docker europe-west1-docker.pkg.dev --quiet 2>/dev/null || true

# ─── APP DIRECTORY ───────────────────────────────────────────────────────────
mkdir -p /opt/quotepilot
chown -R "${SUDO_USER:-$(logname 2>/dev/null || echo ubuntu)}:" /opt/quotepilot 2>/dev/null || true

# ─── NGINX ───────────────────────────────────────────────────────────────────
systemctl stop nginx 2>/dev/null || true

cat > /etc/nginx/sites-available/quotepilot <<'NGINX_CONF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

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
        proxy_send_timeout 86400;

        client_max_body_size 50M;
    }
}
NGINX_CONF

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/quotepilot /etc/nginx/sites-enabled/quotepilot

nginx -t && systemctl enable nginx && systemctl start nginx

cat > /etc/cron.d/certbot-renew <<'CRON'
0 3 * * * root certbot renew --quiet --deploy-hook "systemctl reload nginx"
CRON

echo "$(date) — QuotePilot VM startup script complete"
echo "VM is ready. Next: upload .env, docker-compose.prod.yml, and run deploy."
