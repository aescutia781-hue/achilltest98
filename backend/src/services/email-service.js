/**
 * Email Service
 *
 * Wrapper sobre Resend (resend.com) — proveedor moderno con tier gratuito de
 * 3,000 emails/mes (100/día), excelente para LATAM y arranque sin costo.
 *
 * Por qué Resend y no SendGrid/Mailgun/etc:
 *   - Free tier real (3K/mes) — más que suficiente para los primeros meses
 *   - Dominio verificable en 5 minutos (DNS records)
 *   - API REST simple, sin SDK pesado
 *   - DKIM/SPF automáticos
 *   - Mejor deliverability en LATAM que SendGrid (que tiene IPs bloqueadas)
 *
 * Modos de operación:
 *   1. PROD     → llama a Resend API si RESEND_API_KEY está set
 *   2. DEV      → loggea el email a consola (no envía nada)
 *   3. DISABLED → si EMAILS_DISABLED=true, no envía ni logea
 *
 * Templates inline para no agregar dependencias. Estructura simple para LATAM:
 *   - Idioma: Español por defecto
 *   - Subject corto y directo
 *   - HTML mínimo + texto plano fallback
 *   - Link CTA grande
 *
 * Variables de entorno:
 *   RESEND_API_KEY        — required en prod (re_...)
 *   EMAIL_FROM            — "Achilltest <noreply@achilltest.io>"
 *   FRONTEND_URL          — para construir los links de los emails
 *   EMAILS_DISABLED       — opcional, "true" para desactivar todo
 */

const RESEND_URL = 'https://api.resend.com/emails'

/**
 * Envía un email a través de Resend. En dev (sin API key) lo loggea.
 *
 * @param {object} opts
 * @param {string} opts.to        Email destino
 * @param {string} opts.subject
 * @param {string} opts.html      HTML del email
 * @param {string} [opts.text]    Versión texto plano (fallback)
 * @param {string} [opts.replyTo]
 *
 * @returns {Promise<{ id?, mode }>}  id de Resend si fue enviado, mode='dev' si solo log
 */
export async function sendEmail({ to, subject, html, text, replyTo }) {
  if (process.env.EMAILS_DISABLED === 'true') {
    console.log(`[Email DISABLED] to=${to} subject="${subject}"`)
    return { mode: 'disabled' }
  }

  if (!to || !subject || !html) {
    throw new Error('to, subject y html son requeridos')
  }

  const from = process.env.EMAIL_FROM || 'Achilltest <noreply@achilltest.io>'
  const apiKey = process.env.RESEND_API_KEY

  // ── Modo DEV: log a consola ────────────────────────────────────────────
  if (!apiKey) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`📧 EMAIL [DEV MODE — no RESEND_API_KEY]`)
    console.log(`  To:      ${to}`)
    console.log(`  From:    ${from}`)
    console.log(`  Subject: ${subject}`)
    console.log('  ──── HTML body ────')
    console.log('  ' + html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').slice(0, 500))
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    return { mode: 'dev' }
  }

  // ── Modo PROD: llamar a Resend ─────────────────────────────────────────
  const body = {
    from,
    to:      [to],
    subject,
    html,
    text:    text || _stripHtml(html),
  }
  if (replyTo) body.reply_to = replyTo

  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    let err
    try { err = await res.json() } catch {}
    const message = err?.message || `HTTP ${res.status}`
    throw new Error(`Resend: ${message}`)
  }

  const data = await res.json()
  return { id: data.id, mode: 'prod' }
}

// ════════════════════════════════════════════════════════════════════════════
// TEMPLATES
// ════════════════════════════════════════════════════════════════════════════

const BASE_STYLES = `
  body { margin: 0; padding: 0; background: #f5f5f7; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #1a1a2e; }
  .wrap { max-width: 560px; margin: 0 auto; padding: 32px 16px; }
  .card { background: #fff; border-radius: 14px; padding: 32px; border: 1px solid #e8e8ee; }
  .brand { color: #7c5cbf; font-weight: 700; font-size: 20px; letter-spacing: -.5px; }
  h1 { font-size: 22px; margin: 16px 0 8px; letter-spacing: -.3px; }
  p { font-size: 15px; line-height: 1.55; color: #44445a; margin: 8px 0; }
  .btn { display: inline-block; background: #7c5cbf; color: #fff !important; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-weight: 600; font-size: 15px; margin: 20px 0; }
  .link-fallback { word-break: break-all; font-family: ui-monospace, monospace; font-size: 12px; background: #f5f5f7; padding: 10px; border-radius: 6px; color: #44445a; }
  .footer { font-size: 12px; color: #7070a0; margin-top: 24px; text-align: center; }
  .footer a { color: #7070a0; }
`

function _wrap(content) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Achilltest</title><style>${BASE_STYLES}</style></head><body><div class="wrap"><div class="card">${content}</div><div class="footer">Achilltest · QA Automation con IA<br/><a href="${process.env.FRONTEND_URL || 'https://achilltest.io'}">achilltest.io</a></div></div></body></html>`
}

/**
 * Welcome email (post-registro).
 */
export function welcomeEmail({ name, verifyUrl }) {
  const firstName = (name || '').split(' ')[0] || 'QA'
  const html = _wrap(`
    <div class="brand">Achilltest</div>
    <h1>¡Bienvenido, ${_escape(firstName)}! 🎉</h1>
    <p>Tu cuenta está lista. Tienes <strong>5 días de trial gratuito</strong> para explorar todo lo que Achilltest puede hacer por tu equipo de QA.</p>
    <p>Solo nos falta un paso: <strong>confirma tu email</strong> haciendo click en el botón de abajo. Esto nos ayuda a evitar abuso del trial y asegurar que las notificaciones lleguen a ti.</p>
    <a href="${verifyUrl}" class="btn">Confirmar email</a>
    <p style="font-size: 13px; color: #7070a0;">Si el botón no funciona, copia y pega este link en tu navegador:</p>
    <div class="link-fallback">${verifyUrl}</div>
    <p style="font-size: 13px; color: #7070a0; margin-top: 24px;">Este link expira en 7 días.</p>
  `)
  return {
    subject: '¡Bienvenido a Achilltest! Confirma tu email',
    html,
  }
}

/**
 * Email verification (re-envío).
 */
export function emailVerificationEmail({ name, verifyUrl }) {
  const firstName = (name || '').split(' ')[0] || 'QA'
  const html = _wrap(`
    <div class="brand">Achilltest</div>
    <h1>Confirma tu email</h1>
    <p>Hola ${_escape(firstName)}, recibimos una solicitud para verificar tu email.</p>
    <a href="${verifyUrl}" class="btn">Confirmar email</a>
    <p style="font-size: 13px; color: #7070a0;">Si el botón no funciona, copia y pega este link:</p>
    <div class="link-fallback">${verifyUrl}</div>
    <p style="font-size: 13px; color: #7070a0; margin-top: 24px;">Este link expira en 7 días. Si no fuiste tú, ignora este mensaje.</p>
  `)
  return {
    subject: 'Confirma tu email en Achilltest',
    html,
  }
}

/**
 * Password reset email.
 */
export function passwordResetEmail({ name, resetUrl }) {
  const firstName = (name || '').split(' ')[0] || 'QA'
  const html = _wrap(`
    <div class="brand">Achilltest</div>
    <h1>Recupera tu contraseña</h1>
    <p>Hola ${_escape(firstName)}, recibimos una solicitud para restablecer la contraseña de tu cuenta.</p>
    <a href="${resetUrl}" class="btn">Restablecer contraseña</a>
    <p style="font-size: 13px; color: #7070a0;">Si el botón no funciona, copia y pega este link:</p>
    <div class="link-fallback">${resetUrl}</div>
    <p style="font-size: 13px; color: #7070a0; margin-top: 24px;"><strong>Importante:</strong> Este link expira en 1 hora. Si no solicitaste cambiar tu contraseña, ignora este mensaje — tu cuenta sigue protegida.</p>
  `)
  return {
    subject: 'Restablece tu contraseña en Achilltest',
    html,
  }
}

// ── Helpers ──

function _escape(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function _stripHtml(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}
