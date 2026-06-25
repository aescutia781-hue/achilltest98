# 🚀 Deploy a Hetzner CCX13 — Guía paso a paso

Esta es la guía completa para llevar Achilltest de tu máquina al VPS.
Tiempo estimado total: **45-60 minutos** la primera vez.

---

## 🎯 Pre-requisitos

- [ ] Cuenta en Hetzner Cloud creada: https://accounts.hetzner.com/signUp
- [ ] Una SSH key generada en tu máquina (si no tienes, ver más abajo)
- [ ] El archivo `achilltest.zip` actualizado en tu máquina

### Generar SSH key (si no tienes)

```bash
# En tu máquina local:
ssh-keygen -t ed25519 -C "tu_email@example.com"
# Acepta todo con Enter (sin passphrase si querés simplicidad)

# Ver tu key pública para subir a Hetzner:
cat ~/.ssh/id_ed25519.pub
```

---

## 📦 Paso 1: Crear el VPS (10 minutos)

1. Ir a https://console.hetzner.cloud/
2. Click en **"+ Add Server"**
3. Configuración:
   ```
   Location:    Helsinki o Falkenstein (latencia decente a LATAM)
   Image:       Ubuntu 22.04 LTS  ← IMPORTANTE: NO 24.04 todavía
   Type:        Dedicated vCPU → CCX13 (€13.50/mes)
   Networking:  IPv4 + IPv6 (default ok)
   SSH keys:    Pega tu ~/.ssh/id_ed25519.pub  ← CRÍTICO, sin esto no entras
   Volumes:     (skip, no necesitas)
   Firewall:    Skip (lo configura el script)
   Backups:     Activar (€2.70/mes extra, vale la pena)
   Name:        achilltest-prod
   ```
4. Click **"Create & Buy now"**
5. **Anotá la IP pública** que te da Hetzner (algo como `5.61.243.182`)

---

## 🔐 Paso 2: Conectarte por SSH (2 minutos)

```bash
# Reemplaza con TU IP:
ssh root@5.61.243.182

# Primera vez te pregunta si confías en el host:
The authenticity of host '5.61.243.182' can't be established.
Are you sure you want to continue connecting (yes/no)? yes

# Si entraste bien verás:
root@achilltest-prod:~#
```

✅ Si entraste, todo bien. Si te pide password, algo está mal con la SSH key. Reintenta agregándola en Hetzner Console → Server → SSH Keys.

---

## 📤 Paso 3: Subir el ZIP a la VPS (3 minutos)

**Desde tu máquina local** (en otra terminal, NO en la VPS):

```bash
# Ajusta la ruta del ZIP a donde lo tengas
scp /ruta/a/achilltest.zip root@5.61.243.182:/root/

# Verás algo como:
achilltest.zip   100%  521KB  500KB/s
```

✅ Verificá en la VPS:
```bash
# En la VPS:
ls -lh /root/achilltest.zip
# Debe mostrar el archivo
```

---

## 🚀 Paso 4: Correr el setup automatizado (15-20 minutos)

```bash
# En la VPS (como root):
cd /root
unzip -p achilltest.zip setup.sh > setup.sh
chmod +x setup.sh
./setup.sh

# El script va a:
# 1. Actualizar el sistema (Ubuntu updates)
# 2. Instalar Docker + Docker Compose
# 3. Crear usuario 'achilltest' (más seguro que root)
# 4. Configurar firewall + fail2ban
# 5. Crear 4GB de swap
# 6. Desempaquetar tu código
# 7. Generar .env con secretos automáticos
# 8. Levantar todos los services con Docker
# 9. Aplicar las 10 migraciones SQL
# 10. Mostrar el resumen final
```

**Mientras corre, tomá un café.** El paso más largo es `docker compose build` (~5-8 min la primera vez).

✅ Al final del script verás algo como:

```
═══ ✅ SETUP COMPLETO ═══

  🚀 Achilltest está corriendo en tu VPS

  Frontend:    http://5.61.243.182:3000
  Backend:     http://5.61.243.182:3001
```

---

## 🌐 Paso 5: Acceder y probar (5 minutos)

### En tu navegador:
```
http://TU_IP:3000
```

Deberías ver la landing page de Achilltest.

### Si NO carga:

```bash
# En la VPS:
cd /opt/achilltest

# Ver estado de los containers
docker compose ps

# Si algo está unhealthy o exited, ver logs:
docker compose logs frontend
docker compose logs backend
docker compose logs worker
docker compose logs postgres
```

Los problemas más comunes y sus fixes están en la sección **Troubleshooting** abajo.

---

## 🧪 Paso 6: Probar el flujo completo (20 minutos)

Recorre esta lista. Anotá CADA cosa que no funcione:

### 6.1 Registro
- [ ] Ir a `/register`
- [ ] Crear cuenta con email real (que vos controlás)
- [ ] **El email NO va a llegar** (RESEND_API_KEY vacío en .env)
- [ ] Ver el link de verificación en logs:
  ```bash
  cd /opt/achilltest && ./manage.sh verify-emails
  # Buscar la línea "📧 EMAIL" más reciente
  # Copiar el link verify-email del HTML mostrado
  ```
- [ ] Pegar el link en el navegador → email verificado

### 6.2 Workspace y tests E2E
- [ ] Login con el user nuevo
- [ ] Ir a `/workspace`
- [ ] Intentar grabar un test contra `https://example.com`
- [ ] Ejecutar el test
- [ ] Ver el resultado y los screenshots

### 6.3 Suites
- [ ] Crear una suite nueva
- [ ] Agregar el test
- [ ] Ejecutar suite run
- [ ] Ver el Allure report

### 6.4 Forgot password
- [ ] Logout
- [ ] Ir a `/forgot-password`
- [ ] Ingresar el email
- [ ] Ver el link en logs:
  ```bash
  ./manage.sh verify-emails
  # Buscar el link reset-password
  ```
- [ ] Cambiar contraseña con el link
- [ ] Login con la nueva contraseña

### 6.5 Repair Agent (requiere ANTHROPIC_API_KEY)

Si querés probar este feature ahora:
- [ ] Crear API key en https://console.anthropic.com/settings/keys
- [ ] Cargar al menos $5 USD en la cuenta de Anthropic
- [ ] Editar `.env`:
  ```bash
  nano /opt/achilltest/.env
  # Encontrar ANTHROPIC_API_KEY= y poner: ANTHROPIC_API_KEY=sk-ant-xxx
  ```
- [ ] Reiniciar backend y worker:
  ```bash
  ./manage.sh restart backend
  ./manage.sh restart worker
  ```
- [ ] Forzar un fallo (test con selector inválido)
- [ ] Probar "Reparar con IA"

---

## 🐛 Encontraste bugs? Es normal

Para CADA bug que encuentres, anotá:
1. **Qué hiciste** (pasos exactos)
2. **Qué esperabas que pase**
3. **Qué pasó realmente**
4. **Mensaje de error** (de la UI y de los logs)

Después abrimos un chat para cada categoría de bug:
- Bug en frontend → 1 chat
- Bug en backend/auth → 1 chat
- Bug en workers/playwright → 1 chat
- Etc.

---

## 🛠️ Comandos cotidianos (./manage.sh)

El script `manage.sh` te ayuda con operaciones comunes:

```bash
cd /opt/achilltest

./manage.sh status            # Estado de todos los services
./manage.sh logs              # Logs en tiempo real (Ctrl+C para salir)
./manage.sh logs backend      # Solo logs del backend
./manage.sh logs worker       # Solo logs del worker
./manage.sh restart           # Reiniciar todo
./manage.sh restart backend   # Reiniciar solo backend
./manage.sh db                # Entrar a psql
./manage.sh backup            # Backup manual
./manage.sh stats             # Stats del sistema (RAM, users, etc)
./manage.sh verify-emails     # Ver emails capturados en modo DEV
./manage.sh reset-trial X@Y.com  # Resetear trial de un user
./manage.sh update            # Actualizar desde /root/achilltest.zip
./manage.sh                   # Ver todos los comandos
```

---

## 🆘 Troubleshooting

### "Backend container keeps restarting"
```bash
./manage.sh logs backend
# Ver el error específico
# Más común: DATABASE_URL malformado en .env, o postgres no levantó
```

### "Cannot find module..."
```bash
# Reconstruir las imágenes:
cd /opt/achilltest
docker compose build --no-cache
docker compose up -d
```

### "ECONNREFUSED 127.0.0.1:5432"
```bash
# El backend está buscando postgres en localhost en vez de en el container.
# Verificar .env:
grep DATABASE_URL /opt/achilltest/.env
# Debe decir: postgresql://achilltest:xxx@postgres:5432/...
# NO: postgresql://achilltest:xxx@localhost:5432/...
```

### "Frontend en blanco"
```bash
./manage.sh logs frontend
# Si dice "ECONNREFUSED 3001": el backend no está respondiendo
# Si dice "Failed to compile": error de TypeScript, ver el detalle
```

### "Out of memory" durante el build
```bash
# Verificar swap activo:
free -h
# Si Swap: 0 / 0, el setup no creó el swap. Forzar:
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
```

### "Migration X failed: relation already exists"
```bash
# Las migraciones son idempotentes, este error es normal en re-runs.
# Ignorar y seguir.
```

### "Cannot connect from browser to http://IP:3000"
```bash
# Verificar firewall:
ufw status
# Debe tener:
#   3000/tcp                   ALLOW       Anywhere
#   3001/tcp                   ALLOW       Anywhere

# Si no aparecen:
ufw allow 3000/tcp
ufw allow 3001/tcp
```

### Workers no procesan jobs
```bash
./manage.sh logs worker
# Ver si está conectado a Redis
# Si dice "Redis connection failed":
docker compose restart redis
docker compose restart worker
```

---

## 🌐 Configurar dominio (DESPUÉS de que todo funcione)

Cuando hayas validado que todo funciona por IP, configurar el dominio:

### 1. En tu registrar de DNS (donde compraste achilltest.io):

```
Tipo  | Nombre | Valor              | TTL
A     | @      | TU_IP_DEL_VPS      | 300
A     | www    | TU_IP_DEL_VPS      | 300
```

Esperar 5-30 minutos a que propague:
```bash
dig achilltest.io
# Debe devolver tu IP
```

### 2. Instalar Caddy (HTTPS automático, súper simple):

```bash
# En la VPS:
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update
apt install caddy

# Crear configuración:
cat > /etc/caddy/Caddyfile << 'EOF'
achilltest.io, www.achilltest.io {
    reverse_proxy /api/* localhost:3001
    reverse_proxy /* localhost:3000

    encode gzip
    log {
        output file /var/log/caddy/access.log
        format json
    }
}
EOF

# Habilitar HTTP/HTTPS en firewall:
ufw allow 80/tcp
ufw allow 443/tcp

# Cerrar 3000/3001 al exterior (solo accesibles desde Caddy local):
ufw delete allow 3000/tcp
ufw delete allow 3001/tcp

# Reiniciar Caddy:
systemctl reload caddy

# Caddy obtiene SSL automáticamente de Let's Encrypt
# Esperar ~30 segundos y probar:
curl https://achilltest.io
```

### 3. Actualizar .env con el dominio:

```bash
nano /opt/achilltest/.env
# Cambiar:
FRONTEND_URL=https://achilltest.io
NEXT_PUBLIC_API_URL=https://achilltest.io
# (Caddy se encarga del routing /api/ → backend)

# Reiniciar:
./manage.sh restart
```

---

## ✅ Checklist final antes de "ya está vendible"

- [ ] Todo el happy path funciona end-to-end
- [ ] Emails reales se envían (Resend configurado + dominio verificado)
- [ ] HTTPS funciona en `achilltest.io`
- [ ] Backup automático configurado (cron diario)
- [ ] Mercado Pago en modo producción (no sandbox)
- [ ] Sentry configurado (Sprint 1)
- [ ] Anthropic API key con suficiente saldo para 100 repairs/mes
- [ ] Términos y privacidad accesibles públicamente
- [ ] Tu primer usuario beta confirma que el producto funciona

---

## 💰 Costos mensuales estimados

```
Hetzner CCX13:                €13.50  (~$262 MXN)
Hetzner Backup automático:    €2.70   (~$52 MXN)
Anthropic API (~50 repairs):  ~$1.50  (~$26 MXN)
Resend (free tier):           €0
Mercado Pago (% del cobro):   ~3% del MRR
─────────────────────────────────────────
TOTAL fijo aprox:             ~$340 MXN/mes
```

Con 2 clientes en Teammate ($2,252 MXN) ya cubres todo el costo + ganas.

---

## 🆘 Si algo sale mal

1. **Anotá el error exacto** (mensaje + comando que lo causó)
2. **Mirá los logs** con `./manage.sh logs <servicio>`
3. **Abrí un chat nuevo** con el handoff template + describí el problema
4. **NO borrés el VPS** hasta tener los datos en backup

```bash
# Crear backup de emergencia ANTES de cualquier debug agresivo:
./manage.sh backup
ls -lh /opt/achilltest-backups/
# Subir ese .sql.gz a tu Drive/Dropbox por las dudas
```
