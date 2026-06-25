#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# Achilltest — Helper script para operaciones cotidianas
# ═══════════════════════════════════════════════════════════════════════════
#
# USO:
#   ./manage.sh [comando]
#
# COMANDOS:
#   status        - Estado de todos los services
#   logs [svc]    - Ver logs (svc opcional: backend, worker, postgres, redis, frontend)
#   restart [svc] - Reiniciar un service o todos
#   shell [svc]   - Entrar a la shell de un container
#   db            - Conectar a PostgreSQL
#   backup        - Backup manual de la DB
#   restore <file> - Restaurar backup
#   update        - Actualizar desde último ZIP
#   verify-emails - Ver últimos emails capturados en modo DEV
#   apply-migrations - Aplicar migraciones pendientes
#   reset-trial <email> - Resetear trial de un user (debug)
#   stats         - Stats rápidos del sistema
#
# ═══════════════════════════════════════════════════════════════════════════

set -e

APP_DIR="/opt/achilltest"
APP_USER="achilltest"

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Helper: correr docker compose como el usuario achilltest
dc() {
  cd "$APP_DIR"
  sudo -u "$APP_USER" docker compose "$@"
}

case "$1" in
  status|ps)
    echo -e "${BLUE}═══ Estado de los services ═══${NC}"
    dc ps
    echo ""
    echo -e "${BLUE}═══ Uso de recursos ═══${NC}"
    docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"
    ;;

  logs)
    if [ -z "$2" ]; then
      dc logs -f --tail=100
    else
      dc logs -f --tail=100 "$2"
    fi
    ;;

  restart)
    if [ -z "$2" ]; then
      echo -e "${YELLOW}Reiniciando todos los services...${NC}"
      dc restart
    else
      echo -e "${YELLOW}Reiniciando $2...${NC}"
      dc restart "$2"
    fi
    sleep 3
    dc ps
    ;;

  shell)
    if [ -z "$2" ]; then
      echo "Uso: $0 shell <servicio>"
      echo "Servicios: backend, worker, postgres, redis, frontend"
      exit 1
    fi
    if [ "$2" = "postgres" ]; then
      dc exec -it postgres bash
    elif [ "$2" = "redis" ]; then
      dc exec -it redis sh
    else
      dc exec -it "$2" sh
    fi
    ;;

  db)
    echo -e "${BLUE}Conectando a PostgreSQL...${NC}"
    dc exec -it postgres psql -U achilltest -d achilltest
    ;;

  backup)
    BACKUP_DIR="/opt/achilltest-backups"
    mkdir -p "$BACKUP_DIR"
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_FILE="$BACKUP_DIR/backup_${TIMESTAMP}.sql.gz"

    echo -e "${BLUE}Creando backup en $BACKUP_FILE...${NC}"
    dc exec -T postgres pg_dump -U achilltest achilltest | gzip > "$BACKUP_FILE"

    SIZE=$(du -h "$BACKUP_FILE" | awk '{print $1}')
    echo -e "${GREEN}✓ Backup creado: $BACKUP_FILE ($SIZE)${NC}"

    # Mantener solo los últimos 14 backups
    cd "$BACKUP_DIR"
    ls -t backup_*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm
    echo -e "${BLUE}Backups disponibles:${NC}"
    ls -lh "$BACKUP_DIR"
    ;;

  restore)
    if [ -z "$2" ] || [ ! -f "$2" ]; then
      echo -e "${RED}Uso: $0 restore <archivo.sql.gz>${NC}"
      ls -lh /opt/achilltest-backups/ 2>/dev/null || true
      exit 1
    fi
    echo -e "${YELLOW}⚠ Esto BORRA la DB actual y restaura desde el backup.${NC}"
    read -p "¿Continuar? Escribe 'yes' para confirmar: " confirm
    [ "$confirm" != "yes" ] && exit 1

    echo -e "${BLUE}Restaurando desde $2...${NC}"
    gunzip -c "$2" | dc exec -T postgres psql -U achilltest -d achilltest
    echo -e "${GREEN}✓ Backup restaurado${NC}"
    ;;

  update)
    echo -e "${BLUE}Actualización desde último ZIP${NC}"
    if [ ! -f /root/achilltest.zip ]; then
      echo -e "${RED}No se encontró /root/achilltest.zip${NC}"
      echo "Sube el ZIP nuevo con: scp achilltest.zip root@TU_IP:/root/"
      exit 1
    fi

    # Backup antes de update
    "$0" backup

    # Preservar .env
    cp "$APP_DIR/.env" /tmp/achilltest-env-backup

    # Detener services
    dc down

    # Descomprimir nuevo código
    cd "$APP_DIR"
    unzip -oq /root/achilltest.zip
    chown -R "$APP_USER:$APP_USER" "$APP_DIR"

    # Restaurar .env
    cp /tmp/achilltest-env-backup "$APP_DIR/.env"

    # Rebuild
    dc build
    dc up -d

    # Aplicar migraciones nuevas (idempotente)
    "$0" apply-migrations

    echo -e "${GREEN}✓ Actualización completa${NC}"
    dc ps
    ;;

  verify-emails)
    echo -e "${BLUE}═══ Últimos emails en modo DEV ═══${NC}"
    echo "(Solo aparecen si RESEND_API_KEY está vacío en .env)"
    echo ""
    dc logs backend 2>&1 | grep -A 8 "📧 EMAIL" | tail -100
    ;;

  apply-migrations)
    echo -e "${BLUE}═══ Aplicando migraciones ═══${NC}"
    MIGRATIONS_DIR="$APP_DIR/backend/src/db/migrations"
    for migration in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
      filename=$(basename "$migration")
      echo -n "  $filename ... "
      if dc exec -T postgres psql -U achilltest -d achilltest < "$migration" &>/tmp/migration.log; then
        echo -e "${GREEN}✓${NC}"
      else
        # Verificar si el error es "already exists" (ok) o un error real
        if grep -q "already exists" /tmp/migration.log; then
          echo -e "${YELLOW}ya aplicada${NC}"
        else
          echo -e "${RED}✗${NC}"
          tail -5 /tmp/migration.log
        fi
      fi
    done
    ;;

  reset-trial)
    if [ -z "$2" ]; then
      echo "Uso: $0 reset-trial <email>"
      exit 1
    fi
    echo -e "${YELLOW}Reseteando trial de $2...${NC}"
    dc exec -T postgres psql -U achilltest -d achilltest -c "
      UPDATE users SET
        trial_started_at = NOW(),
        trial_ends_at = NOW() + INTERVAL '5 days',
        is_trial_expired = false,
        specs_used_trial = 0
      WHERE email = '$2'
      RETURNING id, email, trial_ends_at;
    "
    ;;

  stats)
    echo -e "${BLUE}═══ Stats del sistema ═══${NC}"
    echo ""
    echo "📊 Recursos:"
    echo "  RAM:    $(free -h | awk '/^Mem:/ {print $3 " / " $2}')"
    echo "  Disk:   $(df -h /opt | awk 'NR==2 {print $3 " / " $2 " (" $5 " usado)"}')"
    echo "  CPU:    $(uptime | awk -F'load average:' '{print $2}')"
    echo "  Swap:   $(free -h | awk '/^Swap:/ {print $3 " / " $2}')"
    echo ""
    echo "🐳 Docker:"
    docker stats --no-stream --format "  {{.Name}}: CPU {{.CPUPerc}} | RAM {{.MemPerc}}" | head -10
    echo ""
    echo "👥 Users registrados:"
    dc exec -T postgres psql -U achilltest -d achilltest -t -c "SELECT count(*) FROM users;" 2>/dev/null | tr -d ' '
    echo ""
    echo "🧪 Executions totales:"
    dc exec -T postgres psql -U achilltest -d achilltest -t -c "SELECT count(*) FROM executions;" 2>/dev/null | tr -d ' '
    echo ""
    echo "🔧 Repair sessions:"
    dc exec -T postgres psql -U achilltest -d achilltest -t -c "SELECT count(*) FROM repair_sessions;" 2>/dev/null | tr -d ' '
    ;;

  *)
    cat << HELP
${BLUE}═══ Achilltest Helper ═══${NC}

USO: $0 <comando>

${YELLOW}OBSERVACIÓN:${NC}
  status              Estado de services + uso de recursos
  logs [servicio]     Ver logs (todos o un servicio)
  stats               Stats del sistema (RAM, disk, users, etc)

${YELLOW}OPERACIONES:${NC}
  restart [servicio]  Reiniciar service(s)
  shell <servicio>    Entrar a la shell de un container
  db                  Conectar a PostgreSQL (psql interactivo)

${YELLOW}BACKUPS:${NC}
  backup              Backup manual a /opt/achilltest-backups/
  restore <archivo>   Restaurar desde backup

${YELLOW}MANTENIMIENTO:${NC}
  update              Actualizar desde /root/achilltest.zip
  apply-migrations    Aplicar migraciones pendientes

${YELLOW}DEBUG:${NC}
  verify-emails       Ver últimos emails en modo DEV
  reset-trial <email> Resetear trial de un user

EJEMPLOS:
  $0 status
  $0 logs backend
  $0 logs worker
  $0 db
  $0 backup
  $0 restart backend
  $0 reset-trial test@example.com

HELP
    ;;
esac
