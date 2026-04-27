#!/usr/bin/env bash
set -euo pipefail

##############################################################################
# QuotePilot — GCP Infrastructure Provisioning Script
#
# Prerequisites:
#   1. Install Google Cloud SDK: https://cloud.google.com/sdk/docs/install
#   2. Authenticate: gcloud auth login
#   3. Have a billing account ready
#
# Usage:
#   chmod +x infrastructure/gcp-setup.sh
#   ./infrastructure/gcp-setup.sh
#
# This script creates:
#   - GCP project with billing
#   - VPC network + subnet
#   - Firewall rules (SSH, HTTP, HTTPS)
#   - Cloud SQL PostgreSQL 16 (private IP)
#   - Compute Engine VM e2-standard-4
#   - Artifact Registry repository
#   - Static external IP for the VM
##############################################################################

echo "============================================"
echo "  QuotePilot — GCP Infrastructure Setup"
echo "============================================"
echo ""

# ─── CONFIGURATION ──────────────────────────────────────────────────────────
PROJECT_ID="${GCP_PROJECT_ID:-quotepilot-prod}"
REGION="${GCP_REGION:-europe-west1}"
ZONE="${GCP_ZONE:-europe-west1-b}"
BILLING_ACCOUNT="${GCP_BILLING_ACCOUNT:-}"

VPC_NAME="quotepilot-vpc"
SUBNET_NAME="quotepilot-subnet"
SUBNET_RANGE="10.0.0.0/24"
PRIVATE_IP_RANGE_NAME="google-managed-services"
PRIVATE_IP_RANGE="10.1.0.0/16"

SQL_INSTANCE_NAME="quotepilot-db"
SQL_TIER="db-custom-2-4096"
SQL_DB_NAME="quotepilot"
SQL_USER="quotepilot"
SQL_PASSWORD="${SQL_PASSWORD:-$(openssl rand -base64 24)}"

VM_NAME="quotepilot-vm"
VM_MACHINE_TYPE="e2-standard-4"
VM_BOOT_DISK_SIZE="50GB"
VM_IMAGE_FAMILY="ubuntu-2404-lts-amd64"
VM_IMAGE_PROJECT="ubuntu-os-cloud"
STATIC_IP_NAME="quotepilot-ip"

ARTIFACT_REPO="quotepilot-docker"

# ─── HELPERS ────────────────────────────────────────────────────────────────
info()  { echo -e "\n\033[1;34m→ $1\033[0m"; }
ok()    { echo -e "  \033[1;32m✓ $1\033[0m"; }
warn()  { echo -e "  \033[1;33m⚠ $1\033[0m"; }

# ─── 1. CREATE PROJECT ─────────────────────────────────────────────────────
info "Creating GCP project: $PROJECT_ID"
if gcloud projects describe "$PROJECT_ID" &>/dev/null; then
  warn "Project $PROJECT_ID already exists, skipping creation"
else
  gcloud projects create "$PROJECT_ID" --name="QuotePilot Production"
  ok "Project created"
fi

gcloud config set project "$PROJECT_ID"

if [ -n "$BILLING_ACCOUNT" ]; then
  info "Linking billing account"
  gcloud billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT"
  ok "Billing linked"
else
  warn "No GCP_BILLING_ACCOUNT set. Link billing manually:"
  echo "  gcloud billing projects link $PROJECT_ID --billing-account=YOUR_ACCOUNT_ID"
  echo ""
  read -p "Press Enter after billing is linked, or Ctrl+C to abort..."
fi

# ─── 2. ENABLE APIS ────────────────────────────────────────────────────────
info "Enabling required APIs"
gcloud services enable \
  compute.googleapis.com \
  sqladmin.googleapis.com \
  servicenetworking.googleapis.com \
  artifactregistry.googleapis.com \
  cloudresourcemanager.googleapis.com

ok "APIs enabled"

# ─── 3. CREATE VPC NETWORK ─────────────────────────────────────────────────
info "Creating VPC network: $VPC_NAME"
if gcloud compute networks describe "$VPC_NAME" &>/dev/null; then
  warn "VPC $VPC_NAME already exists"
else
  gcloud compute networks create "$VPC_NAME" \
    --subnet-mode=custom \
    --bgp-routing-mode=regional
  ok "VPC created"
fi

info "Creating subnet: $SUBNET_NAME ($SUBNET_RANGE)"
if gcloud compute networks subnets describe "$SUBNET_NAME" --region="$REGION" &>/dev/null; then
  warn "Subnet $SUBNET_NAME already exists"
else
  gcloud compute networks subnets create "$SUBNET_NAME" \
    --network="$VPC_NAME" \
    --region="$REGION" \
    --range="$SUBNET_RANGE"
  ok "Subnet created"
fi

# ─── 4. FIREWALL RULES ─────────────────────────────────────────────────────
info "Creating firewall rules"

create_fw_rule() {
  local name="$1" allow="$2" source="$3" desc="$4"
  if gcloud compute firewall-rules describe "$name" &>/dev/null; then
    warn "Firewall rule $name already exists"
  else
    gcloud compute firewall-rules create "$name" \
      --network="$VPC_NAME" \
      --allow="$allow" \
      --source-ranges="$source" \
      --description="$desc"
    ok "Firewall rule $name created"
  fi
}

create_fw_rule "${VPC_NAME}-allow-ssh"   "tcp:22"  "35.235.240.0/20"  "Allow SSH via IAP only"
create_fw_rule "${VPC_NAME}-allow-http"  "tcp:80"  "0.0.0.0/0"        "Allow HTTP"
create_fw_rule "${VPC_NAME}-allow-https" "tcp:443" "0.0.0.0/0"        "Allow HTTPS"
create_fw_rule "${VPC_NAME}-allow-icmp"  "icmp"    "0.0.0.0/0"        "Allow ICMP ping"

# ─── 5. PRIVATE SERVICE ACCESS (for Cloud SQL) ─────────────────────────────
info "Configuring private service access for Cloud SQL"

if gcloud compute addresses describe "$PRIVATE_IP_RANGE_NAME" --global &>/dev/null; then
  warn "Private IP range $PRIVATE_IP_RANGE_NAME already allocated"
else
  gcloud compute addresses create "$PRIVATE_IP_RANGE_NAME" \
    --global \
    --purpose=VPC_PEERING \
    --prefix-length=16 \
    --network="$VPC_NAME"
  ok "Private IP range allocated"
fi

if gcloud services vpc-peerings list --network="$VPC_NAME" --service=servicenetworking.googleapis.com 2>/dev/null | grep -q "servicenetworking"; then
  warn "VPC peering already exists"
else
  gcloud services vpc-peerings connect \
    --service=servicenetworking.googleapis.com \
    --ranges="$PRIVATE_IP_RANGE_NAME" \
    --network="$VPC_NAME"
  ok "VPC peering established"
fi

# ─── 6. CLOUD SQL INSTANCE ─────────────────────────────────────────────────
info "Creating Cloud SQL instance: $SQL_INSTANCE_NAME (this may take 5-10 minutes)"

if gcloud sql instances describe "$SQL_INSTANCE_NAME" &>/dev/null; then
  warn "Cloud SQL instance $SQL_INSTANCE_NAME already exists"
else
  gcloud sql instances create "$SQL_INSTANCE_NAME" \
    --database-version=POSTGRES_16 \
    --tier="$SQL_TIER" \
    --region="$REGION" \
    --network="projects/$PROJECT_ID/global/networks/$VPC_NAME" \
    --no-assign-ip \
    --storage-size=20GB \
    --storage-auto-increase \
    --backup-start-time="03:00" \
    --availability-type=zonal \
    --maintenance-window-day=SUN \
    --maintenance-window-hour=4
  ok "Cloud SQL instance created"
fi

info "Setting up database user and database"
gcloud sql users set-password "$SQL_USER" \
  --instance="$SQL_INSTANCE_NAME" \
  --password="$SQL_PASSWORD" 2>/dev/null || \
gcloud sql users create "$SQL_USER" \
  --instance="$SQL_INSTANCE_NAME" \
  --password="$SQL_PASSWORD"

if gcloud sql databases describe "$SQL_DB_NAME" --instance="$SQL_INSTANCE_NAME" &>/dev/null; then
  warn "Database $SQL_DB_NAME already exists"
else
  gcloud sql databases create "$SQL_DB_NAME" --instance="$SQL_INSTANCE_NAME"
  ok "Database created"
fi

SQL_PRIVATE_IP=$(gcloud sql instances describe "$SQL_INSTANCE_NAME" \
  --format="value(ipAddresses[0].ipAddress)")
ok "Cloud SQL private IP: $SQL_PRIVATE_IP"

# ─── 7. STATIC EXTERNAL IP ─────────────────────────────────────────────────
info "Reserving static external IP"
if gcloud compute addresses describe "$STATIC_IP_NAME" --region="$REGION" &>/dev/null; then
  warn "Static IP $STATIC_IP_NAME already reserved"
else
  gcloud compute addresses create "$STATIC_IP_NAME" --region="$REGION"
  ok "Static IP reserved"
fi

EXTERNAL_IP=$(gcloud compute addresses describe "$STATIC_IP_NAME" \
  --region="$REGION" --format="value(address)")
ok "External IP: $EXTERNAL_IP"

# ─── 8. ARTIFACT REGISTRY ──────────────────────────────────────────────────
info "Creating Artifact Registry repository"
if gcloud artifacts repositories describe "$ARTIFACT_REPO" \
    --location="$REGION" &>/dev/null; then
  warn "Repository $ARTIFACT_REPO already exists"
else
  gcloud artifacts repositories create "$ARTIFACT_REPO" \
    --repository-format=docker \
    --location="$REGION" \
    --description="QuotePilot Docker images"
  ok "Artifact Registry repository created"
fi

# ─── 9. SERVICE ACCOUNT (least-privilege) ──────────────────────────────────
SA_NAME="quotepilot-vm-sa"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

info "Creating service account: $SA_NAME"
if gcloud iam service-accounts describe "$SA_EMAIL" &>/dev/null; then
  warn "Service account $SA_EMAIL already exists"
else
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name="QuotePilot VM Service Account"
  ok "Service account created"
fi

info "Granting minimal IAM roles to service account"
for role in \
  "roles/artifactregistry.reader" \
  "roles/logging.logWriter" \
  "roles/monitoring.metricWriter"; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="$role" \
    --condition=None \
    --quiet 2>/dev/null
done
ok "IAM roles granted (artifactregistry.reader, logging.logWriter, monitoring.metricWriter)"

# ─── 10. COMPUTE ENGINE VM ─────────────────────────────────────────────────
info "Creating VM: $VM_NAME ($VM_MACHINE_TYPE)"

if gcloud compute instances describe "$VM_NAME" --zone="$ZONE" &>/dev/null; then
  warn "VM $VM_NAME already exists"
else
  gcloud compute instances create "$VM_NAME" \
    --zone="$ZONE" \
    --machine-type="$VM_MACHINE_TYPE" \
    --network-interface="network=$VPC_NAME,subnet=$SUBNET_NAME,address=$EXTERNAL_IP" \
    --image-family="$VM_IMAGE_FAMILY" \
    --image-project="$VM_IMAGE_PROJECT" \
    --boot-disk-size="$VM_BOOT_DISK_SIZE" \
    --boot-disk-type=pd-ssd \
    --tags=http-server,https-server \
    --service-account="$SA_EMAIL" \
    --scopes=cloud-platform \
    --metadata-from-file=startup-script=infrastructure/vm-startup.sh
  ok "VM created"
fi

# ─── SAVE CREDENTIALS TO SECURE FILE ───────────────────────────────────────
CREDENTIALS_FILE="infrastructure/.credentials-${PROJECT_ID}.env"
cat > "$CREDENTIALS_FILE" <<CREDS
SQL_PRIVATE_IP=$SQL_PRIVATE_IP
SQL_USER=$SQL_USER
SQL_PASSWORD=$SQL_PASSWORD
SQL_DATABASE=$SQL_DB_NAME
DATABASE_URL=postgresql://${SQL_USER}:${SQL_PASSWORD}@${SQL_PRIVATE_IP}:5432/${SQL_DB_NAME}
EXTERNAL_IP=$EXTERNAL_IP
ARTIFACT_REGISTRY=${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPO}
CREDS
chmod 600 "$CREDENTIALS_FILE"

# ─── SUMMARY ───────────────────────────────────────────────────────────────
echo ""
echo "============================================"
echo "  Infrastructure provisioning complete!"
echo "============================================"
echo ""
echo "  Project:         $PROJECT_ID"
echo "  Region:          $REGION / $ZONE"
echo "  VPC:             $VPC_NAME ($SUBNET_RANGE)"
echo "  Cloud SQL:       $SQL_INSTANCE_NAME (private IP: $SQL_PRIVATE_IP)"
echo "  VM:              $VM_NAME ($VM_MACHINE_TYPE)"
echo "  VM External IP:  $EXTERNAL_IP"
echo "  Artifact Reg:    ${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPO}"
echo ""
echo "  ⚠  Credentials saved to: $CREDENTIALS_FILE"
echo "     (chmod 600 — readable only by you)"
echo "  ⚠  Point your domain's DNS A record to: $EXTERNAL_IP"
echo ""
echo "  Next steps:"
echo "    1. Configure DNS: A record → $EXTERNAL_IP"
echo "    2. SSH into VM:   gcloud compute ssh $VM_NAME --zone=$ZONE"
echo "    3. Create .env:   Copy .env.production.template and fill values"
echo "       Use DATABASE_URL from: $CREDENTIALS_FILE"
echo "    4. Deploy:        ./infrastructure/deploy.sh"
echo ""
