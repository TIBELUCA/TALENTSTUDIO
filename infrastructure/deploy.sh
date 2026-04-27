#!/usr/bin/env bash
set -euo pipefail

##############################################################################
# QuotePilot — Deployment Script
#
# Usage:
#   ./infrastructure/deploy.sh                  # Build + push + deploy
#   ./infrastructure/deploy.sh --build-only     # Only build and push image
#   ./infrastructure/deploy.sh --deploy-only    # Only deploy (image already pushed)
#
# Environment variables (or set in .env.deploy):
#   GCP_PROJECT_ID   — GCP project ID
#   GCP_REGION       — GCP region (default: europe-west1)
#   GCP_ZONE         — GCP zone (default: europe-west1-b)
#   VM_NAME          — VM instance name (default: quotepilot-vm)
#   IMAGE_TAG        — Docker image tag (default: latest)
##############################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ -f "$SCRIPT_DIR/.env.deploy" ]; then
  source "$SCRIPT_DIR/.env.deploy"
elif [ -f "$SCRIPT_DIR/.env.deploy.template" ]; then
  echo "  ℹ  No .env.deploy found. Copy .env.deploy.template to .env.deploy and customize."
fi

PROJECT_ID="${GCP_PROJECT_ID:-quotepilot-prod}"
REGION="${GCP_REGION:-europe-west1}"
ZONE="${GCP_ZONE:-europe-west1-b}"
VM="${VM_NAME:-quotepilot-vm}"
REPO="quotepilot-docker"
IMAGE_TAG="${IMAGE_TAG:-latest}"
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/quotepilot:${IMAGE_TAG}"

BUILD_ONLY=false
DEPLOY_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --build-only)  BUILD_ONLY=true ;;
    --deploy-only) DEPLOY_ONLY=true ;;
  esac
done

info()  { echo -e "\n\033[1;34m→ $1\033[0m"; }
ok()    { echo -e "  \033[1;32m✓ $1\033[0m"; }
fail()  { echo -e "  \033[1;31m✗ $1\033[0m"; exit 1; }

# ─── BUILD & PUSH ──────────────────────────────────────────────────────────
if [ "$DEPLOY_ONLY" = false ]; then
  info "Authenticating Docker with Artifact Registry"
  gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
  ok "Docker authenticated"

  info "Building Docker image: $IMAGE_URI"
  cd "$PROJECT_ROOT"
  docker build -t "$IMAGE_URI" -f Dockerfile .
  ok "Image built"

  info "Pushing image to Artifact Registry"
  docker push "$IMAGE_URI"
  ok "Image pushed"
fi

if [ "$BUILD_ONLY" = true ]; then
  echo ""
  ok "Build complete. Image: $IMAGE_URI"
  exit 0
fi

# ─── PREFLIGHT CHECKS ──────────────────────────────────────────────────────
info "Running preflight checks on VM"
gcloud compute ssh "$VM" --zone="$ZONE" --command="
  if [ ! -f /opt/quotepilot/.env ]; then
    echo '✗ Missing /opt/quotepilot/.env — copy .env.production.template and fill values first'
    exit 1
  fi
  if [ ! -f /opt/quotepilot/docker-compose.prod.yml ]; then
    echo '✗ Missing /opt/quotepilot/docker-compose.prod.yml — upload it first'
    exit 1
  fi
  echo '✓ Preflight checks passed'
" || fail "Preflight checks failed — see errors above"

# ─── DEPLOY TO VM ──────────────────────────────────────────────────────────
info "Deploying to VM: $VM (zone: $ZONE)"

gcloud compute ssh "$VM" --zone="$ZONE" --command="
  set -e

  echo '→ Configuring Docker auth for Artifact Registry...'
  gcloud auth configure-docker ${REGION}-docker.pkg.dev --quiet 2>/dev/null || true

  echo '→ Pulling image: ${IMAGE_URI}...'
  docker pull ${IMAGE_URI}

  echo '→ Stopping current container...'
  cd /opt/quotepilot
  docker compose -f docker-compose.prod.yml down 2>/dev/null || true

  echo '→ Persisting image reference...'
  sed -i '/^DOCKER_IMAGE=/d' /opt/quotepilot/.env 2>/dev/null || true
  echo 'DOCKER_IMAGE=${IMAGE_URI}' >> /opt/quotepilot/.env

  echo '→ Starting new container...'
  DOCKER_IMAGE='${IMAGE_URI}' docker compose -f docker-compose.prod.yml up -d

  echo '→ Waiting for health check...'
  for i in \$(seq 1 30); do
    if curl -sf http://localhost:5000/api/health > /dev/null 2>&1; then
      echo '✓ Application is healthy!'
      exit 0
    fi
    sleep 2
  done

  echo '⚠ Health check timed out — check logs with: docker compose -f docker-compose.prod.yml logs'
  exit 1
"

ok "Deployment complete!"

EXTERNAL_IP=$(gcloud compute addresses describe quotepilot-ip \
  --region="$REGION" --format="value(address)" 2>/dev/null || echo "unknown")

echo ""
echo "============================================"
echo "  Deployment successful!"
echo "============================================"
echo "  Image:  $IMAGE_URI"
echo "  VM:     $VM"
echo "  IP:     $EXTERNAL_IP"
echo "  Health: https://$EXTERNAL_IP/api/health"
echo "============================================"
