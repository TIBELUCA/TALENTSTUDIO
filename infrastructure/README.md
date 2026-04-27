# QuotePilot — Deployment su Google Cloud Platform

Guida completa per il deployment di QuotePilot su GCP con VM Compute Engine, Cloud SQL PostgreSQL e rete VPC privata.

## Architettura

```
                    Internet
                       │
                   [DNS A Record]
                       │
              ┌────────▼────────┐
              │   Static IP     │
              │   (pubblico)    │
              └────────┬────────┘
                       │
         ┌─────────────▼─────────────┐
         │     Compute Engine VM     │
         │     e2-standard-4         │
         │  ┌──────────────────────┐ │
         │  │  nginx (80/443)      │ │
         │  │  ↓ reverse proxy     │ │
         │  │  Docker container    │ │
         │  │  QuotePilot (:5000)  │ │
         │  └──────────────────────┘ │
         └─────────────┬─────────────┘
                       │
              ─────── VPC ───────
              │  Rete privata   │
              │  10.0.0.0/24    │
              └────────┬────────┘
                       │ (IP privato)
         ┌─────────────▼─────────────┐
         │     Cloud SQL             │
         │     PostgreSQL 16         │
         │     (backup automatici)   │
         └───────────────────────────┘
```

## Prerequisiti

1. **Account Google Cloud** con billing attivo
2. **Google Cloud SDK** installato localmente:
   ```bash
   # macOS
   brew install google-cloud-sdk

   # Linux
   curl https://sdk.cloud.google.com | bash

   # Verifica
   gcloud version
   ```
3. **Docker** installato localmente (per build immagini)
4. **Dominio** con accesso alla gestione DNS

## Primo Setup (una tantum)

### 1. Autenticarsi con GCP

```bash
gcloud auth login
gcloud auth application-default login
```

### 2. Configurare le variabili

Prima di eseguire lo script, impostare le variabili necessarie:

```bash
# Obbligatorio: ID del billing account
# Trovi l'ID in: https://console.cloud.google.com/billing
export GCP_BILLING_ACCOUNT="XXXXXX-XXXXXX-XXXXXX"

# Opzionale: personalizza questi valori (defaults mostrati)
export GCP_PROJECT_ID="quotepilot-prod"
export GCP_REGION="europe-west1"
export GCP_ZONE="europe-west1-b"

# Password database (se non impostata, viene generata automaticamente)
export SQL_PASSWORD="$(openssl rand -base64 24)"
```

### 3. Eseguire il provisioning

```bash
chmod +x infrastructure/gcp-setup.sh
./infrastructure/gcp-setup.sh
```

Lo script crea automaticamente:
- Progetto GCP con billing
- VPC con subnet privata
- Firewall rules (SSH, HTTP, HTTPS)
- Cloud SQL PostgreSQL 16 con IP privato
- VM e2-standard-4 con Docker, nginx, certbot
- Artifact Registry per le immagini Docker
- IP statico pubblico

**⚠ IMPORTANTE:** Salva l'output dello script! Contiene la `DATABASE_URL` e la password del database.

### 4. Configurare il DNS

Aggiungi un record **A** nel tuo provider DNS:

```
Tipo: A
Nome: @ (o sottodominio, es. "app")
Valore: <IP_STATICO_DALLA_OUTPUT>
TTL: 300
```

### 5. Preparare l'environment sulla VM

```bash
# SSH nella VM
gcloud compute ssh quotepilot-vm --zone=europe-west1-b

# Creare la directory di lavoro
cd /opt/quotepilot

# Copiare i file necessari (dal tuo PC locale, in un altro terminale)
gcloud compute scp infrastructure/docker-compose.prod.yml \
  quotepilot-vm:/opt/quotepilot/docker-compose.prod.yml \
  --zone=europe-west1-b

gcloud compute scp infrastructure/.env.production.template \
  quotepilot-vm:/opt/quotepilot/.env \
  --zone=europe-west1-b

gcloud compute scp infrastructure/setup-ssl.sh \
  quotepilot-vm:/opt/quotepilot/setup-ssl.sh \
  --zone=europe-west1-b
```

### 6. Configurare le variabili d'ambiente sulla VM

```bash
# SSH nella VM
gcloud compute ssh quotepilot-vm --zone=europe-west1-b

cd /opt/quotepilot
nano .env
# Compilare tutti i valori (DATABASE_URL, SESSION_SECRET, ecc.)
```

### 7. Primo deployment

```bash
# Dal tuo PC locale (nella root del progetto)
chmod +x infrastructure/deploy.sh
./infrastructure/deploy.sh
```

### 8. Configurare HTTPS

Dopo che il DNS si è propagato (verifica con `dig YOUR_DOMAIN.com`):

```bash
# SSH nella VM
gcloud compute ssh quotepilot-vm --zone=europe-west1-b

cd /opt/quotepilot
chmod +x setup-ssl.sh
sudo ./setup-ssl.sh your-domain.com your@email.com
```

## Deploy successivi

Per ogni aggiornamento dell'applicazione:

```bash
# Build + push + deploy (completo)
./infrastructure/deploy.sh

# Solo build e push immagine
./infrastructure/deploy.sh --build-only

# Solo deploy (immagine già pushata)
./infrastructure/deploy.sh --deploy-only

# Deploy di una versione specifica
IMAGE_TAG=v1.2.3 ./infrastructure/deploy.sh
```

## Gestione quotidiana

### Accesso alla VM

SSH è limitato a Google IAP (Identity-Aware Proxy) per sicurezza. Usa sempre `gcloud compute ssh` che gestisce il tunnel IAP automaticamente:

```bash
gcloud compute ssh quotepilot-vm --zone=europe-west1-b
```

### Logs dell'applicazione

```bash
# SSH nella VM, poi:
cd /opt/quotepilot
docker compose -f docker-compose.prod.yml logs -f
docker compose -f docker-compose.prod.yml logs --tail=100
```

### Restart applicazione

```bash
cd /opt/quotepilot
docker compose -f docker-compose.prod.yml restart
```

### Status

```bash
cd /opt/quotepilot
docker compose -f docker-compose.prod.yml ps
curl -s http://localhost:5000/api/health | jq
```

### Database (Cloud SQL)

```bash
# Connettersi al DB dalla VM (usa l'IP privato)
psql "postgresql://quotepilot:PASSWORD@PRIVATE_IP:5432/quotepilot"

# Backup manuale
gcloud sql export sql quotepilot-db gs://YOUR_BUCKET/backup-$(date +%Y%m%d).sql \
  --database=quotepilot

# Backup automatici sono configurati alle 03:00 UTC
```

## Struttura file

```
infrastructure/
├── README.md                      ← Questa guida
├── gcp-setup.sh                   ← Script provisioning infrastruttura
├── vm-startup.sh                  ← Startup script VM (Docker, nginx, certbot)
├── deploy.sh                      ← Script di deployment
├── setup-ssl.sh                   ← Configurazione HTTPS/Let's Encrypt
├── docker-compose.prod.yml        ← Docker Compose per produzione
├── .env.production.template       ← Template variabili d'ambiente
└── nginx/
    └── quotepilot.conf            ← Configurazione nginx di riferimento
```

## Costi stimati (mensili, europe-west1)

| Risorsa | Specifica | Costo stimato |
|---------|-----------|---------------|
| Compute Engine | e2-standard-4 (4 vCPU, 16 GB) | ~$100/mese |
| Cloud SQL | db-custom-2-4096 (2 vCPU, 4 GB) | ~$70/mese |
| Boot disk | 50 GB SSD | ~$8/mese |
| SQL storage | 20 GB SSD | ~$3/mese |
| Static IP | 1 indirizzo | ~$3/mese |
| Network egress | Variabile | ~$5-15/mese |
| **Totale** | | **~$190-200/mese** |

## Troubleshooting

### L'app non si avvia

```bash
# Controlla i log del container
docker compose -f docker-compose.prod.yml logs app

# Verifica che .env sia corretto
cat /opt/quotepilot/.env

# Verifica connessione al database
docker compose -f docker-compose.prod.yml exec app node -e \
  "const pg=require('pg');const p=new pg.Pool({connectionString:process.env.DATABASE_URL});p.query('SELECT 1').then(()=>console.log('DB OK')).catch(e=>console.error('DB FAIL:',e.message))"
```

### Cloud SQL non raggiungibile

```bash
# Dalla VM, verifica che il peering VPC funzioni
ping CLOUD_SQL_PRIVATE_IP

# Verifica che il firewall non blocchi
gcloud compute firewall-rules list --filter="network=quotepilot-vpc"
```

### Certificato SSL scaduto

```bash
sudo certbot renew --force-renewal
sudo systemctl reload nginx
```

### Spazio disco pieno

```bash
# Pulire immagini Docker non utilizzate
docker system prune -a -f

# Verificare spazio
df -h
```
