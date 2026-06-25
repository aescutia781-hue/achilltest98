#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
#
#    █████╗  ██████╗██╗  ██╗██╗██╗     ██╗  ████████╗███████╗███████╗████████╗
#   ██╔══██╗██╔════╝██║  ██║██║██║     ██║  ╚══██╔══╝██╔════╝██╔════╝╚══██╔══╝
#   ███████║██║     ███████║██║██║     ██║     ██║   █████╗  ███████╗   ██║
#   ██╔══██║██║     ██╔══██║██║██║     ██║     ██║   ██╔══╝  ╚════██║   ██║
#   ██║  ██║╚██████╗██║  ██║██║███████╗███████╗██║   ███████╗███████║   ██║
#   ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝╚═╝   ╚══════╝╚══════╝   ╚═╝
#
#   Instalador oficial — achilltest.io
#   QA Automation con IA para América Latina
#
# ─────────────────────────────────────────────────────────────────────────────
#   USO (desde el VPS como root):
#
#   curl -fsSL https://achilltest.io/install.sh | bash
#
#   O descargarlo y correrlo manualmente:
#   wget https://achilltest.io/install.sh && chmod +x install.sh && ./install.sh
#
# ─────────────────────────────────────────────────────────────────────────────
#   Lo que hace este script:
#     1. Verifica prerequisitos del sistema
#     2. Pregunta datos esenciales (GitHub PAT, dominio, API keys)
#     3. Instala todas las dependencias del sistema (Docker, etc.)
#     4. Clona el repo privado de Achilltest
#     5. Genera .env con secretos únicos
#     6. Levanta todos los servicios con Docker
#     7. Aplica las migraciones SQL
#     8. Verifica que todo funcione
#     9. Te muestra la URL de acceso
#
#   Idempotente: se puede correr varias veces sin romper nada.
#   Versión: 1.0.0
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── COLORES ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()     { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }
ok()      { echo -e "  ${GREEN}✓${NC} $1"; }
warn()    { echo -e "  ${YELLOW}⚠${NC}  $1"; }
fail()    { echo -e "\n${RED}✗ ERROR:${NC} $1\n"; exit 1; }
header()  { echo -e "\n${PURPLE}${BOLD}━━━ $1 ━━━${NC}"; }
ask()     { echo -e "${CYAN}?${NC} $1"; }
info()    { echo -e "  ${BLUE}→${NC} $1"; }

# ── BANNER ──────────────────────────────────────────────────────────────────
clear
echo -e "${PURPLE}${BOLD}"
cat << 'BANNER'
     _        _     _ _ _ _            _
    / \   ___| |__ (_) | | |_ ___  ___| |_
   / _ \ / __| '_ \| | | | __/ _ \/ __| __|
  / ___ \ (__| | | | | | | ||  __/\__ \ |_
 /_/   \_\___|_| |_|_|_|_|\__\___||___/\__|

BANNER
echo -e "${NC}"
echo -e "${BOLD}  Instalador oficial — achilltest.io${NC}"
echo -e "  QA Automation con IA para América Latina"
echo -e "  ─────────────────────────────────────────"
echo ""

# ── VARIABLES GLOBALES ──────────────────────────────────────────────────────
APP_USER="achilltest"
APP_DIR="/opt/achilltest"
ENV_FILE="$APP_DIR/.env"
GITHUB_REPO=""
GITHUB_PAT=""
DOMAIN=""
SERVER_IP=""
ANTHROPIC_KEY=""
RESEND_KEY=""
MP_TOKEN=""
SKIP_OPTIONAL=false

# ═══════════════════════════════════════════════════════════════════════════
# FASE 0: PRECHECKS
# ═══════════════════════════════════════════════════════════════════════════
header "VERIFICANDO SISTEMA"

# Root
[ "$EUID" -ne 0 ] && fail "Debes correr este script como root.\n  Intenta: sudo bash install.sh"

# Ubuntu
if [ ! -f /etc/os-release ] || ! grep -qi "ubuntu" /etc/os-release; then
  fail "Este instalador solo funciona en Ubuntu 20.04 / 22.04 LTS."
fi
UBUNTU_VERSION=$(lsb_release -rs 2>/dev/null || echo "desconocida")
ok "Sistema: Ubuntu $UBUNTU_VERSION"

# RAM mínima (4GB)
TOTAL_RAM_GB=$(free -g | awk '/^Mem:/ {print $2}')
if [ "$TOTAL_RAM_GB" -lt 4 ]; then
  warn "Detectamos solo ${TOTAL_RAM_GB}GB de RAM. Achilltest necesita al menos 4GB (recomendado 8GB)."
  read -rp "  ¿Continuar de todos modos? [s/N]: " yn
  [[ ! $yn =~ ^[SsYy]$ ]] && exit 1
fi
ok "RAM: ${TOTAL_RAM_GB}GB"

# Disco libre (mínimo 10GB)
FREE_DISK_GB=$(df -BG / | awk 'NR==2 {print $4}' | tr -d 'G')
if [ "$FREE_DISK_GB" -lt 10 ]; then
  fail "Disco libre insuficiente: ${FREE_DISK_GB}GB disponibles. Necesitas al menos 10GB."
fi
ok "Disco libre: ${FREE_DISK_GB}GB"

# Detectar IP pública
SERVER_IP=$(curl -s -4 --max-time 5 ifconfig.me 2>/dev/null || \
            curl -s -4 --max-time 5 icanhazip.com 2>/dev/null || \
            hostname -I | awk '{print $1}')
ok "IP del servidor: $SERVER_IP"

# ═══════════════════════════════════════════════════════════════════════════
# FASE 1: RECOLECTAR DATOS ESENCIALES
# ═══════════════════════════════════════════════════════════════════════════
header "CONFIGURACIÓN INICIAL"

echo ""
echo -e "  Vamos a preguntarte ${BOLD}solo lo esencial${NC} para arrancar."
echo -e "  Las integraciones opcionales (Jira, GitHub OAuth, etc.) las podés"
echo -e "  configurar después editando ${CYAN}/opt/achilltest/.env${NC}"
echo ""

# ── GitHub (obligatorio) ────────────────────────────────────────────────────
echo -e "${BOLD}  📦 Repositorio de Achilltest${NC}"
echo ""
echo -e "  Tu repo es PRIVADO. Para clonarlo, necesitamos un"
echo -e "  Personal Access Token (PAT) de GitHub."
echo ""
echo -e "  Cómo crear el PAT (30 segundos):"
info "Ir a: https://github.com/settings/tokens/new"
info "Note (nombre): achilltest-installer"
info "Expiration: 7 days (se usa UNA vez y se descarta)"
info "Scopes: marcar solo ✓ repo"
info "Click 'Generate token' → copiar el token (empieza con ghp_)"
echo ""

while true; do
  ask "Usuario de GitHub (ej: angelarturo):"
  read -rp "  > " GITHUB_USER
  [ -n "$GITHUB_USER" ] && break
  warn "El usuario no puede estar vacío."
done

while true; do
  ask "Nombre del repo (ej: achilltest):"
  read -rp "  > " GITHUB_REPO_NAME
  [ -n "$GITHUB_REPO_NAME" ] && break
  warn "El nombre del repo no puede estar vacío."
done

while true; do
  ask "Personal Access Token de GitHub (ghp_...):"
  read -rsp "  > " GITHUB_PAT
  echo ""
  if [[ "$GITHUB_PAT" == ghp_* ]] || [[ "$GITHUB_PAT" == github_pat_* ]]; then
    break
  fi
  warn "El PAT debe empezar con 'ghp_' o 'github_pat_'. Intentá de nuevo."
done

GITHUB_REPO="https://${GITHUB_PAT}@github.com/${GITHUB_USER}/${GITHUB_REPO_NAME}.git"

# Verificar que el PAT y el repo sean válidos ANTES de continuar
log "Verificando acceso al repositorio..."
if ! git ls-remote "$GITHUB_REPO" HEAD &>/dev/null 2>&1; then
  fail "No se pudo acceder al repo.\n  Verificá:\n  - Que el usuario y nombre del repo sean correctos\n  - Que el PAT tenga permiso 'repo'\n  - Que el repo exista en GitHub"
fi
ok "Repo verificado: ${GITHUB_USER}/${GITHUB_REPO_NAME} ✓"

echo ""

# ── Dominio (opcional) ──────────────────────────────────────────────────────
echo -e "${BOLD}  🌐 Dominio${NC}"
echo ""
echo -e "  Podés usar un dominio ahora (si ya lo tenés apuntando a esta IP)"
echo -e "  o dejar vacío para usar la IP (${CYAN}http://${SERVER_IP}:3000${NC})."
echo ""
ask "Tu dominio (ej: achilltest.io) o ENTER para usar IP:"
read -rp "  > " DOMAIN
echo ""

if [ -n "$DOMAIN" ]; then
  # Quitar https:// si lo puso
  DOMAIN=$(echo "$DOMAIN" | sed 's|https\?://||g' | sed 's|/.*||g')
  FRONTEND_URL="https://${DOMAIN}"
  info "Se usará: $FRONTEND_URL"
  warn "Asegurate de que DNS ya apunte a $SERVER_IP antes de continuar."
else
  FRONTEND_URL="http://${SERVER_IP}:3000"
  info "Se usará: $FRONTEND_URL (podés cambiar a dominio después)"
fi

# ── Anthropic API Key (recomendado) ─────────────────────────────────────────
echo -e "${BOLD}  🤖 Anthropic API Key (Repair Agent)${NC}"
echo ""
echo -e "  El Repair Agent es el feature diferencial de Achilltest."
echo -e "  Sin la key funciona todo lo demás, pero el Repair Agent queda desactivado."
echo ""
echo -e "  Cómo obtenerla:"
info "Ir a: https://console.anthropic.com/settings/keys"
info "Crear key → cargar al menos \$5 USD"
info "La key empieza con: sk-ant-"
echo ""
ask "Anthropic API Key (sk-ant-...) o ENTER para configurar después:"
read -rp "  > " ANTHROPIC_KEY
echo ""

if [ -n "$ANTHROPIC_KEY" ]; then
  ok "Anthropic API Key configurada"
else
  warn "Repair Agent desactivado por ahora. Configuralo después en .env"
fi

# ── Resend Email (opcional) ──────────────────────────────────────────────────
echo -e "${BOLD}  📧 Email transaccional (Resend)${NC}"
echo ""
echo -e "  Sin esto los emails (bienvenida, verificación, reset) se"
echo -e "  loguean a consola en lugar de enviarse. Perfecto para pruebas."
echo ""
ask "Resend API Key (re_...) o ENTER para modo DEV (log a consola):"
read -rp "  > " RESEND_KEY
echo ""

if [ -n "$RESEND_KEY" ]; then
  ok "Resend configurado"
else
  warn "Modo DEV: los emails se logean en lugar de enviarse"
  info "Podés ver los emails con: ./manage.sh verify-emails"
fi

# ── Mercado Pago (opcional) ──────────────────────────────────────────────────
echo -e "${BOLD}  💳 Mercado Pago${NC}"
echo ""
echo -e "  Para el billing. Podés empezar con el token de sandbox (TEST-xxx)"
echo -e "  y cambiar a producción cuando estés listo."
echo ""
ask "MP Access Token (TEST-xxx o APP_USR-xxx) o ENTER para configurar después:"
read -rp "  > " MP_TOKEN
echo ""

if [ -n "$MP_TOKEN" ]; then
  ok "Mercado Pago configurado"
else
  warn "Billing desactivado por ahora. Configuralo después en .env"
fi

# ── Resumen antes de instalar ────────────────────────────────────────────────
echo ""
echo -e "${PURPLE}${BOLD}━━━ RESUMEN — Lo que se va a instalar ━━━${NC}"
echo ""
echo -e "  Repo:         ${CYAN}${GITHUB_USER}/${GITHUB_REPO_NAME}${NC}"
echo -e "  Directorio:   ${CYAN}${APP_DIR}${NC}"
echo -e "  URL:          ${CYAN}${FRONTEND_URL}${NC}"
echo -e "  Anthropic:    $([ -n "$ANTHROPIC_KEY" ] && echo "${GREEN}✓ configurado${NC}" || echo "${YELLOW}⚠ configurar después${NC}")"
echo -e "  Resend:       $([ -n "$RESEND_KEY" ] && echo "${GREEN}✓ configurado${NC}" || echo "${YELLOW}⚠ modo DEV (log a consola)${NC}")"
echo -e "  Mercado Pago: $([ -n "$MP_TOKEN" ] && echo "${GREEN}✓ configurado${NC}" || echo "${YELLOW}⚠ configurar después${NC}")"
echo ""
echo -e "  El instalador va a tardar ${BOLD}~15-20 minutos${NC} la primera vez."
echo -e "  No interrumpas el proceso mientras corre."
echo ""
read -rp "  ¿Continuar con la instalación? [S/n]: " confirm
[[ $confirm =~ ^[Nn]$ ]] && echo "Instalación cancelada." && exit 0
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# FASE 2: SISTEMA
# ═══════════════════════════════════════════════════════════════════════════
header "ACTUALIZANDO SISTEMA"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq 2>/dev/null
ok "Repos actualizados"

apt-get upgrade -y -qq 2>/dev/null
ok "Sistema actualizado"

# ── Herramientas base ────────────────────────────────────────────────────────
header "INSTALANDO DEPENDENCIAS"

apt-get install -y -qq \
  curl wget git nano htop ufw \
  ca-certificates gnupg lsb-release \
  unzip jq postgresql-client \
  fail2ban 2>/dev/null

ok "Git, htop, ufw, jq, fail2ban instalados"

# ═══════════════════════════════════════════════════════════════════════════
# FASE 3: DOCKER
# ═══════════════════════════════════════════════════════════════════════════
header "INSTALANDO DOCKER"

if command -v docker &>/dev/null; then
  ok "Docker ya instalado: $(docker --version | cut -d' ' -f3 | tr -d ',')"
else
  log "Instalando Docker (esto toma ~2 minutos)..."

  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null
  chmod a+r /etc/apt/keyrings/docker.gpg

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | tee /etc/apt/sources.list.d/docker.list > /dev/null

  apt-get update -qq 2>/dev/null
  apt-get install -y -qq \
    docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin 2>/dev/null

  systemctl enable docker &>/dev/null
  systemctl start docker
  ok "Docker instalado: $(docker --version | cut -d' ' -f3 | tr -d ',')"
fi

ok "Docker Compose: $(docker compose version --short 2>/dev/null || echo 'ok')"

# ── Usuario de la app ────────────────────────────────────────────────────────
if id "$APP_USER" &>/dev/null; then
  ok "Usuario '$APP_USER' ya existe"
else
  useradd -m -s /bin/bash "$APP_USER"
  ok "Usuario '$APP_USER' creado"
fi
usermod -aG docker "$APP_USER"
ok "Usuario '$APP_USER' tiene acceso a Docker"

# ═══════════════════════════════════════════════════════════════════════════
# FASE 4: SWAP + FIREWALL
# ═══════════════════════════════════════════════════════════════════════════
header "CONFIGURANDO SISTEMA"

# Swap (crítico para Playwright)
if swapon --show 2>/dev/null | grep -q swap; then
  ok "Swap ya configurado"
else
  log "Creando 4GB de swap (necesario para Playwright)..."
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile > /dev/null
  swapon /swapfile
  grep -q "/swapfile" /etc/fstab || echo "/swapfile none swap sw 0 0" >> /etc/fstab
  sysctl -w vm.swappiness=10 > /dev/null
  echo "vm.swappiness=10" > /etc/sysctl.d/99-swappiness.conf
  ok "Swap 4GB creado"
fi

# Firewall
ufw --force default deny incoming &>/dev/null
ufw --force default allow outgoing &>/dev/null
ufw allow ssh/tcp &>/dev/null

# Abrir puertos según si tiene dominio o no
if [ -n "$DOMAIN" ]; then
  ufw allow 80/tcp &>/dev/null
  ufw allow 443/tcp &>/dev/null
  ok "Firewall: SSH + HTTP(S) abiertos"
else
  ufw allow 3000/tcp &>/dev/null
  ufw allow 3001/tcp &>/dev/null
  ok "Firewall: SSH + :3000 + :3001 abiertos"
fi

ufw --force enable &>/dev/null

# Fail2ban
systemctl enable fail2ban &>/dev/null
systemctl start fail2ban &>/dev/null
ok "Fail2ban activo (protege SSH de ataques)"

# ═══════════════════════════════════════════════════════════════════════════
# FASE 5: CLONAR EL REPO
# ═══════════════════════════════════════════════════════════════════════════
header "CLONANDO ACHILLTEST"

if [ -d "$APP_DIR/.git" ]; then
  log "Repo ya existe, actualizando..."
  cd "$APP_DIR"
  # Actualizar con el PAT embebido en la URL temporal
  git remote set-url origin "$GITHUB_REPO"
  git pull --ff-only
  # Remover el PAT de la URL remota por seguridad
  git remote set-url origin "https://github.com/${GITHUB_USER}/${GITHUB_REPO_NAME}.git"
  ok "Repo actualizado"
elif [ -d "$APP_DIR" ]; then
  warn "Directorio $APP_DIR existe pero no es un repo Git"
  warn "Renombrando a ${APP_DIR}.bak..."
  mv "$APP_DIR" "${APP_DIR}.bak.$(date +%s)"
  git clone "$GITHUB_REPO" "$APP_DIR" 2>/dev/null
  ok "Repo clonado"
else
  log "Clonando repo (puede tardar un momento)..."
  git clone "$GITHUB_REPO" "$APP_DIR" 2>/dev/null
  ok "Repo clonado en $APP_DIR"
fi

# Remover el PAT de la URL remota POR SEGURIDAD
# (el PAT queda en el historial de git si no lo hacemos)
cd "$APP_DIR"
git remote set-url origin "https://github.com/${GITHUB_USER}/${GITHUB_REPO_NAME}.git"
ok "PAT removido de la config de Git (seguridad)"

# Asignar permisos
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
chmod +x "$APP_DIR/setup.sh" "$APP_DIR/manage.sh" 2>/dev/null || true

# ═══════════════════════════════════════════════════════════════════════════
# FASE 6: CONFIGURAR .env
# ═══════════════════════════════════════════════════════════════════════════
header "CONFIGURANDO VARIABLES DE ENTORNO"

if [ -f "$ENV_FILE" ]; then
  ok ".env ya existe — preservando configuración actual"
  warn "Si querés regenerarlo: rm $ENV_FILE && ./install.sh"
else
  log "Generando .env con secretos únicos para esta instalación..."

  # Generar secretos únicos
  JWT_SECRET=$(openssl rand -hex 64)
  ENCRYPTION_KEY=$(openssl rand -hex 32)
  POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=\n')

  # URLs según si tiene dominio
  if [ -n "$DOMAIN" ]; then
    NEXT_PUBLIC_API_URL="https://${DOMAIN}"
    GITHUB_CALLBACK="https://${DOMAIN}/api/github/oauth/callback"
    JIRA_CALLBACK="https://${DOMAIN}/api/jira/oauth/callback"
  else
    NEXT_PUBLIC_API_URL="http://${SERVER_IP}:3001"
    GITHUB_CALLBACK="http://${SERVER_IP}:3001/api/github/oauth/callback"
    JIRA_CALLBACK="http://${SERVER_IP}:3001/api/jira/oauth/callback"
  fi

  cat > "$ENV_FILE" << ENVEOF
# ═══════════════════════════════════════════════════════════════════════════
# Achilltest — Variables de entorno
# Generado por install.sh el $(date +'%Y-%m-%d %H:%M:%S')
# ⚠ NUNCA subas este archivo a Git
# ═══════════════════════════════════════════════════════════════════════════

# ─── Base de datos ─────────────────────────────────────────────────────────
POSTGRES_USER=achilltest
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=achilltest
DATABASE_URL=postgresql://achilltest:${POSTGRES_PASSWORD}@postgres:5432/achilltest

# ─── Redis ─────────────────────────────────────────────────────────────────
REDIS_URL=redis://redis:6379

# ─── Auth ──────────────────────────────────────────────────────────────────
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=7d
ENCRYPTION_KEY=${ENCRYPTION_KEY}

# ─── URLs ──────────────────────────────────────────────────────────────────
FRONTEND_URL=${FRONTEND_URL}
NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# ─── Anthropic (Repair Agent) ─────────────────────────────────────────────
ANTHROPIC_API_KEY=${ANTHROPIC_KEY}
ANTHROPIC_MODEL=claude-haiku-4-5

# ─── Email (Resend) ────────────────────────────────────────────────────────
RESEND_API_KEY=${RESEND_KEY}
EMAIL_FROM=Achilltest <noreply@${DOMAIN:-achilltest.io}>

# ─── Mercado Pago ──────────────────────────────────────────────────────────
MP_ACCESS_TOKEN=${MP_TOKEN}
MP_CURRENCY=MXN
MP_PRICE_STARTER=1380
MP_PRICE_TEAMMATE=2252
MP_PLAN_STARTER_ID=
MP_PLAN_TEAMMATE_ID=

# ─── GitHub Integration (OAuth) ──────────────────────────────────────────
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_OAUTH_REDIRECT_URI=${GITHUB_CALLBACK}

# ─── Jira Integration (OAuth) ────────────────────────────────────────────
JIRA_CLIENT_ID=
JIRA_CLIENT_SECRET=
JIRA_OAUTH_REDIRECT_URI=${JIRA_CALLBACK}

# ─── Workers ──────────────────────────────────────────────────────────────
WORKER_CONCURRENCY=3

# ─── Sistema ──────────────────────────────────────────────────────────────
NODE_ENV=production
LOG_LEVEL=info
SCREENSHOT_DIR=/tmp/achilltest-screenshots
REPORTS_DIR=/tmp/achilltest-reports
ENVEOF

  chown "$APP_USER:$APP_USER" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  ok ".env generado con secretos únicos"
fi

# ═══════════════════════════════════════════════════════════════════════════
# FASE 7: DOCKER COMPOSE
# ═══════════════════════════════════════════════════════════════════════════
header "LEVANTANDO SERVICIOS"

cd "$APP_DIR"

log "Construyendo imágenes Docker (primera vez: ~8-12 minutos)..."
echo -e "  ${YELLOW}No cierres esta terminal.${NC} Podés ver el progreso abajo:"
echo ""

sudo -u "$APP_USER" docker compose build 2>&1 | while IFS= read -r line; do
  echo -e "    ${BLUE}│${NC} $line"
done

echo ""
log "Iniciando todos los servicios..."
sudo -u "$APP_USER" docker compose up -d

# Esperar a que PostgreSQL esté listo
log "Esperando a que PostgreSQL esté listo..."
POSTGRES_READY=false
for i in {1..40}; do
  if sudo -u "$APP_USER" docker compose exec -T postgres \
      pg_isready -U achilltest &>/dev/null 2>&1; then
    POSTGRES_READY=true
    break
  fi
  printf "."
  sleep 2
done
echo ""

if [ "$POSTGRES_READY" = false ]; then
  warn "PostgreSQL tardó más de lo esperado"
  warn "Podés verificar con: cd $APP_DIR && docker compose logs postgres"
else
  ok "PostgreSQL listo"
fi

# ═══════════════════════════════════════════════════════════════════════════
# FASE 8: MIGRACIONES SQL
# ═══════════════════════════════════════════════════════════════════════════
header "APLICANDO MIGRACIONES"

MIGRATIONS_DIR="$APP_DIR/backend/src/db/migrations"

if [ ! -d "$MIGRATIONS_DIR" ]; then
  warn "No se encontró el directorio de migraciones: $MIGRATIONS_DIR"
  warn "Verificá que el repo esté completo"
else
  MIGRATIONS=$(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort)
  if [ -z "$MIGRATIONS" ]; then
    warn "No se encontraron archivos .sql en $MIGRATIONS_DIR"
  else
    TOTAL=$(echo "$MIGRATIONS" | wc -l)
    APPLIED=0
    for migration in $MIGRATIONS; do
      filename=$(basename "$migration")
      if sudo -u "$APP_USER" docker compose exec -T postgres \
          psql -U achilltest -d achilltest \
          < "$migration" &>/tmp/ach-migration.log 2>&1; then
        ok "$filename"
        APPLIED=$((APPLIED + 1))
      else
        # Verificar si es "already exists" (no es error real)
        if grep -qi "already exists\|duplicate" /tmp/ach-migration.log 2>/dev/null; then
          ok "$filename (ya aplicada)"
          APPLIED=$((APPLIED + 1))
        else
          warn "$filename falló:"
          tail -3 /tmp/ach-migration.log | sed 's/^/    /'
        fi
      fi
    done
    ok "$APPLIED/$TOTAL migraciones aplicadas"
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════
# FASE 9: CADDY (solo si tiene dominio)
# ═══════════════════════════════════════════════════════════════════════════
if [ -n "$DOMAIN" ]; then
  header "CONFIGURANDO HTTPS CON CADDY"

  if command -v caddy &>/dev/null; then
    ok "Caddy ya instalado"
  else
    log "Instalando Caddy (proxy reverso + SSL automático)..."

    apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https 2>/dev/null
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
      | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg 2>/dev/null
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
      | tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null
    apt-get update -qq 2>/dev/null
    apt-get install -y -qq caddy 2>/dev/null
    ok "Caddy instalado"
  fi

  # Crear Caddyfile
  cat > /etc/caddy/Caddyfile << CADDY
${DOMAIN}, www.${DOMAIN} {
    encode gzip

    # API backend
    handle /api/* {
        reverse_proxy localhost:3001
    }

    # Health check
    handle /health {
        reverse_proxy localhost:3001
    }

    # Frontend Next.js
    handle {
        reverse_proxy localhost:3000
    }

    log {
        output file /var/log/caddy/access.log
        format json
    }
}
CADDY

  systemctl reload caddy
  ok "Caddy configurado para $DOMAIN (SSL automático Let's Encrypt)"
  warn "El certificado SSL puede tardar 1-2 minutos en generarse la primera vez"
fi

# ═══════════════════════════════════════════════════════════════════════════
# FASE 10: VERIFICACIÓN FINAL
# ═══════════════════════════════════════════════════════════════════════════
header "VERIFICACIÓN FINAL"

log "Esperando que los servicios estén listos..."
sleep 8

# Estado de containers
echo ""
sudo -u "$APP_USER" docker compose ps 2>/dev/null | \
  sed 's/^/  /' || true

# Health checks
echo ""
BACKEND_OK=false
FRONTEND_OK=false

if curl -sf --max-time 5 http://localhost:3001/health > /dev/null 2>&1; then
  ok "Backend OK → :3001/health responde"
  BACKEND_OK=true
else
  warn "Backend aún no responde. Puede tardar 30-60s más en Next.js."
fi

if curl -sf --max-time 5 http://localhost:3000 > /dev/null 2>&1; then
  ok "Frontend OK → :3000 responde"
  FRONTEND_OK=true
else
  warn "Frontend compilando... (Next.js tarda ~60s la primera vez)"
fi

# ═══════════════════════════════════════════════════════════════════════════
# RESUMEN FINAL
# ═══════════════════════════════════════════════════════════════════════════
clear
echo ""
echo -e "${GREEN}${BOLD}"
cat << 'SUCCESS'
  ╔═══════════════════════════════════════════════════════╗
  ║                                                       ║
  ║      ✅  ACHILLTEST INSTALADO CORRECTAMENTE           ║
  ║                                                       ║
  ╚═══════════════════════════════════════════════════════╝
SUCCESS
echo -e "${NC}"

# URL de acceso
if [ -n "$DOMAIN" ]; then
  ACCESS_URL="https://${DOMAIN}"
else
  ACCESS_URL="http://${SERVER_IP}:3000"
fi

echo -e "  ${BOLD}🌐 Acceso:${NC}"
echo -e "     ${CYAN}${ACCESS_URL}${NC}"
echo ""
echo -e "  ${BOLD}⚙️  API:${NC}"
echo -e "     ${CYAN}${ACCESS_URL}/api/health${NC}"
echo ""

# Estado de lo configurado
echo -e "  ${BOLD}📋 Estado de integraciones:${NC}"
[ -n "$ANTHROPIC_KEY" ] \
  && echo -e "     ${GREEN}✓${NC} Repair Agent (Claude)" \
  || echo -e "     ${YELLOW}○${NC} Repair Agent — configurar ANTHROPIC_API_KEY en .env"
[ -n "$RESEND_KEY" ] \
  && echo -e "     ${GREEN}✓${NC} Email transaccional (Resend)" \
  || echo -e "     ${YELLOW}○${NC} Email en modo DEV (log a consola)"
[ -n "$MP_TOKEN" ] \
  && echo -e "     ${GREEN}✓${NC} Mercado Pago" \
  || echo -e "     ${YELLOW}○${NC} Mercado Pago — configurar MP_ACCESS_TOKEN en .env"
[ -n "$DOMAIN" ] \
  && echo -e "     ${GREEN}✓${NC} HTTPS con SSL (Caddy)" \
  || echo -e "     ${YELLOW}○${NC} HTTPS — configurar dominio después"

echo ""
echo -e "  ${BOLD}🚀 Primeros pasos:${NC}"
echo ""
echo -e "  1. Abrir ${CYAN}${ACCESS_URL}${NC} en tu navegador"
echo ""
echo -e "  2. Crear tu primera cuenta en /register"
echo -e "     ${YELLOW}Los emails se loguean a consola hasta configurar Resend.${NC}"
echo -e "     Ver el link de verificación con:"
echo -e "     ${CYAN}cd ${APP_DIR} && ./manage.sh verify-emails${NC}"
echo ""
echo -e "  3. Editar .env para agregar integraciones pendientes:"
echo -e "     ${CYAN}nano ${ENV_FILE}${NC}"
echo -e "     Después reiniciar: ${CYAN}cd ${APP_DIR} && docker compose restart${NC}"
echo ""
echo -e "  ${BOLD}🛠️  Comandos útiles:${NC}"
echo ""
echo -e "     ${CYAN}cd ${APP_DIR}${NC}"
echo -e "     ${CYAN}./manage.sh status${NC}          — ver estado"
echo -e "     ${CYAN}./manage.sh logs backend${NC}     — logs del backend"
echo -e "     ${CYAN}./manage.sh verify-emails${NC}    — ver emails capturados"
echo -e "     ${CYAN}./manage.sh backup${NC}           — backup manual"
echo -e "     ${CYAN}./manage.sh${NC}                  — ver todos los comandos"
echo ""
echo -e "  ${BOLD}🔒 Seguridad:${NC}"
echo ""
echo -e "     Firewall UFW activo (SSH$([ -n "$DOMAIN" ] && echo ' + HTTP/HTTPS' || echo ' + :3000 + :3001'))"
echo -e "     Fail2ban protegiendo SSH"
echo -e "     Secretos únicos generados automáticamente"
echo -e "     .env con permisos 600 (solo lectura para owner)"
if [ -z "$DOMAIN" ]; then
  echo ""
  warn "Para restringir acceso a tu IP mientras probás:"
  echo -e "     ${CYAN}ufw delete allow 3000/tcp${NC}"
  echo -e "     ${CYAN}ufw allow from TU_IP_CASA to any port 3000${NC}"
fi
echo ""
echo -e "  ${BOLD}📄 Archivos importantes:${NC}"
echo -e "     ${CYAN}${ENV_FILE}${NC}          — variables de entorno"
echo -e "     ${CYAN}${APP_DIR}/manage.sh${NC}  — helper de operaciones"
echo ""
echo -e "  ${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  ¿Problemas? Ver logs con: ${CYAN}cd ${APP_DIR} && ./manage.sh logs${NC}"
echo -e "  ${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
