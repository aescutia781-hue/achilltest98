#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# Achilltest — Setup automatizado para Hetzner CCX13 (Ubuntu 22.04 LTS)
# ═══════════════════════════════════════════════════════════════════════════
#
# USO:
#   1. Crear VPS Hetzner CCX13 con Ubuntu 22.04 LTS
#   2. SSH al VPS como root: ssh root@TU_IP
#   3. Descargar este script:
#      wget https://achilltest.io/setup.sh   (o subir manualmente con scp)
#   4. Darle permisos: chmod +x setup.sh
#   5. Ejecutar: ./setup.sh
#
# Lo que hace este script (en orden):
#   1. Updates del sistema
#   2. Instala Docker + Docker Compose
#   3. Crea usuario 'achilltest' (no usar root por seguridad)
#   4. Configura firewall UFW (solo SSH al inicio)
#   5. Configura swap (4GB) — crítico para Playwright
#   6. Instala herramientas útiles (htop, git, nano, ufw)
#   7. Clona o desempaqueta Achilltest
#   8. Genera .env con secretos automáticos
#   9. Levanta los servicios con docker compose
#   10. Aplica migraciones SQL
#   11. Muestra siguiente pasos
#
# Idempotente: se puede correr varias veces sin romper nada.
# ═══════════════════════════════════════════════════════════════════════════

set -e  # Salir al primer error

# ── COLORES PARA OUTPUT ─────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'  # No color

log()    { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }
ok()     { echo -e "${GREEN}✓${NC} $1"; }
warn()   { echo -e "${YELLOW}⚠${NC}  $1"; }
fail()   { echo -e "${RED}✗${NC} $1"; exit 1; }
header() { echo -e "\n${PURPLE}═══${NC} $1 ${PURPLE}═══${NC}"; }

# ── VARIABLES ───────────────────────────────────────────────────────────────
APP_USER="achilltest"
APP_DIR="/opt/achilltest"
ENV_FILE="$APP_DIR/.env"

# ── PRECHECKS ───────────────────────────────────────────────────────────────
header "PRECHECKS"

[ "$EUID" -ne 0 ] && fail "Este script debe correrse como root. Usa: sudo ./setup.sh"

if [ ! -f /etc/os-release ] || ! grep -q "Ubuntu" /etc/os-release; then
  fail "Solo soportado en Ubuntu. Detectado: $(cat /etc/os-release | head -1)"
fi

ok "Sistema: $(lsb_release -ds 2>/dev/null || echo 'Ubuntu')"
ok "Usuario root verificado"

TOTAL_RAM_GB=$(free -g | awk '/^Mem:/ {print $2}')
if [ "$TOTAL_RAM_GB" -lt 4 ]; then
  warn "Solo tienes ${TOTAL_RAM_GB}GB de RAM. CCX13 tiene 8GB. ¿Estás en la VPS correcta?"
  read -p "Continuar de todos modos? [y/N]: " yn
  [[ ! $yn =~ ^[Yy]$ ]] && exit 1
fi
ok "RAM: ${TOTAL_RAM_GB}GB"

# ── 1. UPDATES DEL SISTEMA ──────────────────────────────────────────────────
header "1. UPDATES DEL SISTEMA"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
ok "Repos actualizados"

apt-get upgrade -y -qq
ok "Paquetes upgradeados"

# ── 2. HERRAMIENTAS BASE ────────────────────────────────────────────────────
header "2. HERRAMIENTAS BASE"

apt-get install -y -qq \
  curl wget git nano htop ufw \
  ca-certificates gnupg lsb-release \
  unzip jq postgresql-client \
  fail2ban

ok "Herramientas base instaladas (curl, git, htop, ufw, jq, fail2ban, etc.)"

# ── 3. DOCKER ───────────────────────────────────────────────────────────────
header "3. DOCKER"

if command -v docker &> /dev/null; then
  ok "Docker ya está instalado: $(docker --version)"
else
  log "Instalando Docker (esto toma ~2 minutos)..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    tee /etc/apt/sources.list.d/docker.list > /dev/null

  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

  systemctl enable docker
  systemctl start docker
  ok "Docker instalado: $(docker --version)"
fi

ok "Docker Compose: $(docker compose version --short)"

# ── 4. USUARIO APP (no usar root) ───────────────────────────────────────────
header "4. USUARIO DE LA APP"

if id "$APP_USER" &>/dev/null; then
  ok "Usuario '$APP_USER' ya existe"
else
  useradd -m -s /bin/bash "$APP_USER"
  ok "Usuario '$APP_USER' creado"
fi

# Agregar al grupo docker
usermod -aG docker "$APP_USER"
ok "Usuario '$APP_USER' agregado al grupo docker"

# ── 5. SWAP (crítico para Playwright) ──────────────────────────────────────
header "5. SWAP (4GB)"

if swapon --show | grep -q swap; then
  ok "Swap ya configurado: $(swapon --show | tail -1)"
else
  log "Creando 4GB de swap..."
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile > /dev/null
  swapon /swapfile

  # Persistir
  if ! grep -q "/swapfile" /etc/fstab; then
    echo "/swapfile none swap sw 0 0" >> /etc/fstab
  fi

  # Configurar swappiness baja (preferir RAM)
  sysctl -w vm.swappiness=10 > /dev/null
  echo "vm.swappiness=10" > /etc/sysctl.d/99-swappiness.conf
  ok "Swap de 4GB creado y montado"
fi

# ── 6. FIREWALL ─────────────────────────────────────────────────────────────
header "6. FIREWALL (UFW)"

ufw --force default deny incoming
ufw --force default allow outgoing
ufw allow ssh/tcp
ok "Firewall: SSH abierto (puertos web los abriremos después)"

# Puertos temporales para acceso inicial por IP (cerrarlos cuando configures dominio)
ufw allow 3000/tcp comment 'Frontend Next.js (temporal)'
ufw allow 3001/tcp comment 'Backend Fastify (temporal)'
ok "Frontend (3000) y Backend (3001) abiertos temporalmente"

if ! ufw status | grep -q "Status: active"; then
  ufw --force enable
fi
ok "UFW activo"

# Fail2ban para protección SSH
systemctl enable fail2ban
systemctl start fail2ban
ok "Fail2ban activo (protege SSH de brute force)"

# ── 7. CARGAR EL PROYECTO ───────────────────────────────────────────────────
header "7. PROYECTO ACHILLTEST"

if [ -d "$APP_DIR" ]; then
  warn "El directorio $APP_DIR ya existe"
else
  log "Buscando ZIP del proyecto..."

  # Estrategia: si hay achilltest.zip en /root o /home, usarlo
  ZIP_FOUND=""
  for path in /root/achilltest.zip /home/*/achilltest.zip /tmp/achilltest.zip; do
    if [ -f "$path" ]; then
      ZIP_FOUND="$path"
      break
    fi
  done

  if [ -n "$ZIP_FOUND" ]; then
    log "ZIP encontrado en: $ZIP_FOUND"
    mkdir -p "$APP_DIR"
    unzip -q "$ZIP_FOUND" -d "$APP_DIR"
    ok "Proyecto desempaquetado en $APP_DIR"
  else
    warn "No se encontró achilltest.zip. Sube el ZIP a /root/ y vuelve a correr este script."
    log "Comando para subirlo desde tu máquina:"
    log "  scp achilltest.zip root@TU_IP:/root/"
    exit 1
  fi
fi

# Asegurar permisos
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
ok "Permisos del directorio asignados a '$APP_USER'"

# ── 8. CONFIGURAR .env ──────────────────────────────────────────────────────
header "8. CONFIGURACIÓN .env"

if [ -f "$ENV_FILE" ]; then
  ok ".env ya existe — no se sobrescribe"
  warn "Si necesitas regenerarlo: rm $ENV_FILE && ./setup.sh"
else
  log "Generando .env con secretos automáticos..."

  # Secretos generados automáticamente
  JWT_SECRET=$(openssl rand -hex 64)
  ENCRYPTION_KEY=$(openssl rand -hex 32)
  POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=')

  SERVER_IP=$(curl -s -4 ifconfig.me || hostname -I | awk '{print $1}')

  cat > "$ENV_FILE" << ENVEOF
# ═══════════════════════════════════════════════════════════════════════════
# Achilltest — Variables de entorno
# Generado por setup.sh el $(date +'%Y-%m-%d %H:%M:%S')
# ═══════════════════════════════════════════════════════════════════════════

# ─── Base de datos ─────────────────────────────────────────────────────────
POSTGRES_USER=achilltest
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_DB=achilltest
DATABASE_URL=postgresql://achilltest:$POSTGRES_PASSWORD@postgres:5432/achilltest

# ─── Redis ─────────────────────────────────────────────────────────────────
REDIS_URL=redis://redis:6379

# ─── Auth (CRÍTICO: estos secretos son únicos de esta instalación) ────────
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=7d
ENCRYPTION_KEY=$ENCRYPTION_KEY

# ─── URLs ──────────────────────────────────────────────────────────────────
# Mientras pruebas, usa la IP. Cuando tengas dominio, cambia a https://achilltest.io
FRONTEND_URL=http://$SERVER_IP:3000
NEXT_PUBLIC_API_URL=http://$SERVER_IP:3001

# ─── Anthropic (Repair Agent) ─────────────────────────────────────────────
# Crear API key en: https://console.anthropic.com/settings/keys
# Cargar al menos \$5 USD para empezar
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-haiku-4-5

# ─── Email (Resend) ────────────────────────────────────────────────────────
# DEJAR VACÍO al principio → modo DEV (loguea a consola)
# Cuando tengas dominio verificado en resend.com: poner la API key
RESEND_API_KEY=
EMAIL_FROM=Achilltest <noreply@achilltest.io>
# EMAILS_DISABLED=false

# ─── Mercado Pago ──────────────────────────────────────────────────────────
# Empezar con sandbox: TEST-xxx
# Cuando vayas a producción: APP_USR-xxx
MP_ACCESS_TOKEN=
MP_CURRENCY=MXN
MP_PRICE_STARTER=1380
MP_PRICE_TEAMMATE=2252
MP_PLAN_STARTER_ID=
MP_PLAN_TEAMMATE_ID=

# ─── GitHub Integration (opcional al principio) ──────────────────────────
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_OAUTH_REDIRECT_URI=http://$SERVER_IP:3001/api/github/oauth/callback

# ─── Jira Integration (opcional al principio) ────────────────────────────
JIRA_CLIENT_ID=
JIRA_CLIENT_SECRET=
JIRA_OAUTH_REDIRECT_URI=http://$SERVER_IP:3001/api/jira/oauth/callback

# ─── Workers ──────────────────────────────────────────────────────────────
WORKER_CONCURRENCY=3

# ─── Directorios ──────────────────────────────────────────────────────────
SCREENSHOT_DIR=/tmp/achilltest-screenshots
REPORTS_DIR=/tmp/achilltest-reports

# ─── Modo ─────────────────────────────────────────────────────────────────
NODE_ENV=production
LOG_LEVEL=info
ENVEOF

  chown "$APP_USER:$APP_USER" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  ok ".env generado con secretos únicos (JWT, ENCRYPTION_KEY, POSTGRES_PASSWORD)"
  warn "FRONTEND_URL configurado a: http://$SERVER_IP:3000"
fi

# ── 9. LEVANTAR SERVICIOS ───────────────────────────────────────────────────
header "9. LEVANTAR SERVICIOS DOCKER"

cd "$APP_DIR"

log "Construyendo imágenes Docker (esto toma ~5-10 minutos la primera vez)..."
sudo -u "$APP_USER" docker compose build 2>&1 | tail -20

log "Levantando servicios..."
sudo -u "$APP_USER" docker compose up -d

# Esperar a que postgres esté ready
log "Esperando a que PostgreSQL esté listo (max 60s)..."
for i in {1..30}; do
  if sudo -u "$APP_USER" docker compose exec -T postgres pg_isready -U achilltest &>/dev/null; then
    ok "PostgreSQL listo"
    break
  fi
  sleep 2
done

# ── 10. APLICAR MIGRACIONES SQL ─────────────────────────────────────────────
header "10. MIGRACIONES SQL"

log "Aplicando migraciones en orden..."

MIGRATIONS_DIR="$APP_DIR/backend/src/db/migrations"
if [ ! -d "$MIGRATIONS_DIR" ]; then
  fail "No se encontró $MIGRATIONS_DIR"
fi

# Listar migraciones ordenadas
MIGRATIONS=$(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort)
if [ -z "$MIGRATIONS" ]; then
  fail "No se encontraron archivos .sql en $MIGRATIONS_DIR"
fi

for migration in $MIGRATIONS; do
  filename=$(basename "$migration")
  log "Aplicando $filename..."
  if sudo -u "$APP_USER" docker compose exec -T postgres \
    psql -U achilltest -d achilltest < "$migration" &>/tmp/migration-output.log; then
    ok "$filename aplicada"
  else
    warn "$filename falló — ver /tmp/migration-output.log"
    tail -10 /tmp/migration-output.log
    # Las migraciones son idempotentes (IF NOT EXISTS), así que sigue intentando
  fi
done

# ── 11. VERIFICAR ESTADO ────────────────────────────────────────────────────
header "11. VERIFICACIÓN FINAL"

sleep 5

log "Estado de los servicios:"
sudo -u "$APP_USER" docker compose ps

echo ""
log "Probando /api/health del backend..."
if curl -sf http://localhost:3001/health > /dev/null; then
  ok "Backend respondiendo en :3001"
else
  warn "Backend NO responde aún. Espera 30 segundos y prueba: curl http://localhost:3001/health"
fi

log "Probando frontend..."
if curl -sf http://localhost:3000 > /dev/null; then
  ok "Frontend respondiendo en :3000"
else
  warn "Frontend NO responde aún (Next.js puede tardar en compilar)"
fi

# ── 12. RESUMEN FINAL ───────────────────────────────────────────────────────
header "✅ SETUP COMPLETO"

SERVER_IP=$(curl -s -4 ifconfig.me || hostname -I | awk '{print $1}')

cat << SUMMARY

  🚀 Achilltest está corriendo en tu VPS

  ─────────────────────────────────────────────────────────
  Frontend:    http://$SERVER_IP:3000
  Backend:     http://$SERVER_IP:3001
  Health:      http://$SERVER_IP:3001/health
  ─────────────────────────────────────────────────────────

  📋 COMANDOS ÚTILES (correr como root o con sudo):

    cd $APP_DIR
    docker compose ps              # Ver estado
    docker compose logs -f         # Ver logs en tiempo real
    docker compose logs backend    # Logs solo del backend
    docker compose logs worker     # Logs solo del worker
    docker compose restart backend # Reiniciar un service
    docker compose down            # Apagar todo
    docker compose up -d           # Levantar todo

  ⚙️  PASOS SIGUIENTES (en orden recomendado):

    1. Verificar acceso al frontend:
       Abrir en tu navegador: http://$SERVER_IP:3000

    2. Crear tu primera cuenta de prueba.
       Los emails se LOGUEAN a consola (no se envían) porque
       RESEND_API_KEY está vacío. Ver el link de verificación:
         docker compose logs backend | grep "verify-email"

    3. Configurar Anthropic API key (para Repair Agent):
       a. Crear key en https://console.anthropic.com/settings/keys
       b. Cargar al menos \$5 USD
       c. Editar /opt/achilltest/.env → ANTHROPIC_API_KEY=sk-ant-xxx
       d. docker compose restart backend worker

    4. Cuando esté todo funcionando localmente:
       - Configurar dominio (achilltest.io → tu IP)
       - Setup SSL con Caddy o Nginx + Let's Encrypt
       - Verificar dominio en Resend para emails reales
       - Switch Mercado Pago a producción

  🔒 SEGURIDAD:

    ✓ Firewall UFW activo (solo SSH + 3000 + 3001)
    ✓ Fail2ban protegiendo SSH
    ✓ Usuario 'achilltest' (no root) corre Docker
    ✓ Secretos generados automáticamente (JWT, ENCRYPTION)
    ✓ .env con permisos 600 (solo lectura para owner)
    ⚠ Restringir 3000/3001 a tu IP mientras pruebas:
       ufw delete allow 3000/tcp
       ufw allow from TU_IP_CASA to any port 3000

  💾 BACKUPS (TODO antes de tener users reales):

    Configurar backup diario de Postgres en /opt/backups
    (lo haremos en el sprint de pre-launch)

  🐛 TROUBLESHOOTING:

    Backend no levanta:
      docker compose logs backend | tail -50

    Migración falló:
      cat /tmp/migration-output.log

    Frontend en blanco:
      docker compose logs frontend | tail -30
      Verifica NEXT_PUBLIC_API_URL en .env

    Out of memory:
      free -h
      docker stats

  ─────────────────────────────────────────────────────────

SUMMARY

ok "Setup terminado. ¡Vamos a probarlo!"
