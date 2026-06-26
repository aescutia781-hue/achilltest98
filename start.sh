#!/bin/bash

# Achilltest - Instalador todo en uno
# Uso: bash start.sh

set -e

echo ""
echo "======================================"
echo "   ACHILLTEST - Instalando..."
echo "======================================"
echo ""

# IP del servidor
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

# 1. Instalar Docker
echo "[1/7] Instalando Docker..."
apt-get update -qq
apt-get install -y -qq curl git
curl -fsSL https://get.docker.com | sh
echo "✓ Docker listo"

# 2. Swap para Playwright
echo "[2/7] Configurando swap..."
if ! swapon --show | grep -q swap; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile > /dev/null
  swapon /swapfile
  echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi
echo "✓ Swap listo"

# 3. Copiar proyecto a /opt/achilltest
echo "[3/7] Preparando proyecto..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ "$SCRIPT_DIR" != "/opt/achilltest" ]; then
  rm -rf /opt/achilltest
  cp -r "$SCRIPT_DIR" /opt/achilltest
fi
cd /opt/achilltest
echo "✓ Proyecto en /opt/achilltest"

# 4. Parchear Dockerfiles (npm ci requiere package-lock.json que no existe)
echo "[4/7] Arreglando Dockerfiles..."
sed -i 's/RUN npm ci --omit=dev/RUN npm install --omit=dev/g' backend/Dockerfile 2>/dev/null || true
sed -i 's/RUN npm ci --omit=dev/RUN npm install --omit=dev/g' backend/Dockerfile.worker 2>/dev/null || true
sed -i 's/RUN npm ci/RUN npm install/g' frontend/Dockerfile 2>/dev/null || true
echo "✓ Dockerfiles arreglados"

# 5. Crear .env
echo "[5/7] Creando configuracion..."
if [ ! -f .env ]; then
  JWT=$(openssl rand -hex 64)
  ENC=$(openssl rand -hex 32)
  PG=$(openssl rand -hex 16)

  cat > .env << ENVEOF
POSTGRES_USER=achilltest
POSTGRES_PASSWORD=${PG}
POSTGRES_DB=achilltest
DATABASE_URL=postgresql://achilltest:${PG}@postgres:5432/achilltest
REDIS_URL=redis://redis:6379
JWT_SECRET=${JWT}
JWT_EXPIRES_IN=7d
ENCRYPTION_KEY=${ENC}
SERVER_ENCRYPTION_KEY=${ENC}
FRONTEND_URL=http://${SERVER_IP}:3000
NEXT_PUBLIC_API_URL=http://${SERVER_IP}:3001
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-haiku-4-5
RESEND_API_KEY=
EMAIL_FROM=Achilltest <noreply@achilltest.io>
MP_ACCESS_TOKEN=
MP_CURRENCY=MXN
MP_PRICE_STARTER=1380
MP_PRICE_TEAMMATE=2252
MP_PLAN_STARTER_ID=
MP_PLAN_TEAMMATE_ID=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_OAUTH_REDIRECT_URI=http://${SERVER_IP}:3001/api/github/oauth/callback
JIRA_CLIENT_ID=
JIRA_CLIENT_SECRET=
JIRA_OAUTH_REDIRECT_URI=http://${SERVER_IP}:3001/api/jira/oauth/callback
WORKER_CONCURRENCY=3
NODE_ENV=production
LOG_LEVEL=info
SCREENSHOT_DIR=/tmp/achilltest-screenshots
REPORTS_DIR=/tmp/achilltest-reports
ENVEOF
  echo "✓ .env creado"
else
  echo "✓ .env ya existe, se conserva"
fi

# 6. Levantar Docker Compose
echo "[6/7] Levantando servicios (esto tarda ~10 min la primera vez)..."
docker compose up -d --build

# Esperar Postgres
echo "   Esperando PostgreSQL..."
for i in {1..40}; do
  docker compose exec -T postgres pg_isready -U achilltest &>/dev/null && break
  printf "."
  sleep 3
done
echo ""
echo "✓ PostgreSQL listo"

# 7. Migraciones
echo "[7/7] Aplicando migraciones..."
for f in $(ls backend/src/db/migrations/*.sql 2>/dev/null | sort); do
  docker compose exec -T postgres psql -U achilltest -d achilltest < "$f" &>/dev/null || true
  echo "   ✓ $(basename $f)"
done

# Resultado
echo ""
echo "======================================"
echo "   ✅ ACHILLTEST CORRIENDO"
echo "======================================"
echo ""
echo "   URL: http://${SERVER_IP}:3000"
echo ""
echo "   Comandos utiles:"
echo "   cd /opt/achilltest"
echo "   docker compose ps          # ver estado"
echo "   docker compose logs -f     # ver logs"
echo "   docker compose restart     # reiniciar"
echo ""
