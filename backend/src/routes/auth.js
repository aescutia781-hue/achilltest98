import bcrypt        from 'bcrypt'
import { eq }         from 'drizzle-orm'
import { getDb, schema } from '../db/client.js'
import { generateToken, authenticate } from '../middleware/auth.js'
import { PLANS } from '../config/plans.js'

const SALT_ROUNDS = 12
const TRIAL_DAYS  = 5

// ── Validaciones ──────────────────────────────────────────────────────────────

function validateRegister(body) {
  const { name, email, password } = body || {}

  if (!name?.trim()) return 'El nombre es requerido'
  if (name.trim().length < 2) return 'El nombre debe tener al menos 2 caracteres'

  if (!email?.trim()) return 'El email es requerido'
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) return 'El email no es válido'

  if (!password) return 'La contraseña es requerida'
  if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres'

  return null
}

// ── Rutas ──────────────────────────────────────────────────────────────────────

export async function authRoutes(app) {

  // ── POST /api/auth/register ────────────────────────────────────────────────
  app.post('/register', async (req, reply) => {
    const error = validateRegister(req.body)
    if (error) return reply.code(400).send({ success: false, error })

    const { name, email, password } = req.body
    const emailNorm = email.toLowerCase().trim()
    const db = getDb()

    // Email único
    const existing = await db.select().from(schema.users)
      .where(eq(schema.users.email, emailNorm)).limit(1)

    if (existing.length > 0) {
      return reply.code(409).send({
        success: false,
        error:   'Este email ya está registrado. ¿Querías iniciar sesión?',
      })
    }

    // Hash de contraseña
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)

    // Trial dates
    const now         = new Date()
    const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 86400000)

    // Crear usuario
    const [user] = await db.insert(schema.users).values({
      email:           emailNorm,
      passwordHash,
      name:            name.trim(),
      plan:            'trial',
      role:            'owner',
      trialStartedAt:  now,
      trialEndsAt,
      isTrialExpired:  false,
    }).returning()

    // Crear personal workspace y vincular como owner
    const { ensurePersonalWorkspace } = await import('../services/organizations-service.js')
    const personalOrg = await ensurePersonalWorkspace(user.id)

    // Re-cargar user con currentOrganizationId set
    const [refreshed] = await db.select().from(schema.users)
      .where(eq(schema.users.id, user.id)).limit(1)

    // ── Disparar welcome email con verification token ────────────────────
    // No bloquea el registro si el email falla (best-effort, loggeamos error)
    try {
      const { createEmailToken, TOKEN_TYPES } = await import('../services/email-tokens-service.js')
      const { sendEmail, welcomeEmail }       = await import('../services/email-service.js')
      const { plain } = await createEmailToken({
        userId:    user.id,
        type:      TOKEN_TYPES.EMAIL_VERIFICATION,
        ip:        req.ip,
        userAgent: req.headers['user-agent'],
      })
      const frontendUrl = process.env.FRONTEND_URL || ''
      const verifyUrl = `${frontendUrl}/verify-email?token=${plain}`
      const tpl = welcomeEmail({ name: user.name, verifyUrl })
      await sendEmail({ to: user.email, subject: tpl.subject, html: tpl.html })
    } catch (err) {
      req.log.warn({ err: err.message }, '[Auth] welcome email failed (continuando)')
    }

    // Token JWT
    const token = generateToken(refreshed)

    req.log.info({ userId: user.id, orgId: personalOrg.id }, 'Usuario registrado con personal workspace')

    return reply.code(201).send({
      success: true,
      data: {
        token,
        user: {
          id:                    refreshed.id,
          name:                  refreshed.name,
          email:                 refreshed.email,
          plan:                  refreshed.plan,
          trialEndsAt:           refreshed.trialEndsAt,
          emailVerified:         refreshed.emailVerified,
          currentOrganizationId: refreshed.currentOrganizationId,
        },
        organization: {
          id:         personalOrg.id,
          name:       personalOrg.name,
          isPersonal: personalOrg.isPersonal,
        },
      },
    })
  })

  // ── POST /api/auth/login ───────────────────────────────────────────────────
  app.post('/login', async (req, reply) => {
    const { email, password } = req.body || {}

    if (!email?.trim() || !password?.trim()) {
      return reply.code(400).send({ success: false, error: 'Email y contraseña requeridos' })
    }

    const db        = getDb()
    const emailNorm = email.toLowerCase().trim()

    const [user] = await db.select().from(schema.users)
      .where(eq(schema.users.email, emailNorm)).limit(1)

    if (!user) {
      // No revelar si el email existe o no — usar mismo mensaje
      return reply.code(401).send({ success: false, error: 'Email o contraseña incorrectos' })
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash)
    if (!validPassword) {
      return reply.code(401).send({ success: false, error: 'Email o contraseña incorrectos' })
    }

    // Actualizar lastLoginAt
    await db.update(schema.users)
      .set({ lastLoginAt: new Date() })
      .where(eq(schema.users.id, user.id))

    const token = generateToken(user)

    req.log.info({ userId: user.id }, 'Login exitoso')

    return reply.send({
      success: true,
      data: {
        token,
        user: {
          id:                   user.id,
          name:                 user.name,
          email:                user.email,
          plan:                 user.plan,
          role:                 user.role,
          mpSubscriptionStatus: user.mpSubscriptionStatus,
          trialEndsAt:          user.trialEndsAt,
          paidSince:            user.paidSince,
          createdAt:            user.createdAt,
        },
      },
    })
  })

  // ── GET /api/auth/me ────────────────────────────────────────────────────────
  app.get('/me', { preHandler: [authenticate] }, async (req, reply) => {
    const db = getDb()
    const [user] = await db.select().from(schema.users)
      .where(eq(schema.users.id, req.user.userId)).limit(1)

    if (!user) {
      return reply.code(404).send({ success: false, error: 'Usuario no encontrado' })
    }

    return reply.send({
      success: true,
      data: {
        id:                   user.id,
        name:                 user.name,
        email:                user.email,
        plan:                 user.plan,
        role:                 user.role,
        organizationId:       user.organizationId,
        mpSubscriptionStatus: user.mpSubscriptionStatus,
        trialEndsAt:          user.trialEndsAt,
        paidSince:            user.paidSince,
        specsUsedTrial:       user.specsUsedTrial,
        createdAt:            user.createdAt,
      },
    })
  })

  // ── POST /api/auth/refresh ─────────────────────────────────────────────────
  // Genera un nuevo token con info actualizada (útil después de cambiar de plan)
  app.post('/refresh', { preHandler: [authenticate] }, async (req, reply) => {
    const db = getDb()
    const [user] = await db.select().from(schema.users)
      .where(eq(schema.users.id, req.user.userId)).limit(1)

    if (!user) {
      return reply.code(404).send({ success: false, error: 'Usuario no encontrado' })
    }

    return reply.send({
      success: true,
      data:    { token: generateToken(user) },
    })
  })

  // ── POST /api/auth/change-password ──────────────────────────────────────────
  app.post('/change-password', { preHandler: [authenticate] }, async (req, reply) => {
    const { currentPassword, newPassword } = req.body || {}

    if (!currentPassword || !newPassword) {
      return reply.code(400).send({ success: false, error: 'Contraseña actual y nueva requeridas' })
    }
    if (newPassword.length < 8) {
      return reply.code(400).send({ success: false, error: 'La contraseña nueva debe tener al menos 8 caracteres' })
    }

    const db = getDb()
    const [user] = await db.select().from(schema.users)
      .where(eq(schema.users.id, req.user.userId)).limit(1)

    if (!user) return reply.code(404).send({ success: false, error: 'Usuario no encontrado' })

    const valid = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!valid) return reply.code(401).send({ success: false, error: 'Contraseña actual incorrecta' })

    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS)
    await db.update(schema.users)
      .set({ passwordHash: newHash, updatedAt: new Date() })
      .where(eq(schema.users.id, user.id))

    return reply.send({ success: true, data: { message: 'Contraseña actualizada' } })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // EMAIL VERIFICATION
  // ══════════════════════════════════════════════════════════════════════════

  // POST /api/auth/verify-email
  //   Body: { token: 'verify_...' }
  //   Consume el token y marca emailVerified=true en el user.
  app.post('/verify-email', async (req, reply) => {
    const { token } = req.body || {}
    if (!token) return reply.code(400).send({ success: false, error: 'Token requerido' })

    const { consumeEmailToken, TOKEN_TYPES } = await import('../services/email-tokens-service.js')
    const result = await consumeEmailToken({
      plain: token,
      expectedType: TOKEN_TYPES.EMAIL_VERIFICATION,
    })

    if (!result.valid) {
      return reply.code(400).send({ success: false, error: result.error })
    }

    const db = getDb()
    const now = new Date()
    await db.update(schema.users).set({
      emailVerified:   true,
      emailVerifiedAt: now,
      updatedAt:       now,
    }).where(eq(schema.users.id, result.userId))

    req.log.info({ userId: result.userId }, '[Auth] email verificado')
    return reply.send({ success: true, data: { verified: true } })
  })

  // POST /api/auth/resend-verification
  //   Requiere auth. Re-envía un email de verificación al user logueado.
  app.post('/resend-verification', { preHandler: [authenticate] }, async (req, reply) => {
    const db = getDb()
    const [user] = await db.select().from(schema.users)
      .where(eq(schema.users.id, req.user.userId)).limit(1)
    if (!user) return reply.code(404).send({ success: false, error: 'No encontrado' })

    if (user.emailVerified) {
      return reply.code(400).send({ success: false, error: 'Tu email ya está verificado' })
    }

    try {
      const { createEmailToken, TOKEN_TYPES } = await import('../services/email-tokens-service.js')
      const { sendEmail, emailVerificationEmail } = await import('../services/email-service.js')
      const { plain } = await createEmailToken({
        userId:    user.id,
        type:      TOKEN_TYPES.EMAIL_VERIFICATION,
        ip:        req.ip,
        userAgent: req.headers['user-agent'],
      })
      const verifyUrl = `${process.env.FRONTEND_URL || ''}/verify-email?token=${plain}`
      const tpl = emailVerificationEmail({ name: user.name, verifyUrl })
      await sendEmail({ to: user.email, subject: tpl.subject, html: tpl.html })

      return reply.send({ success: true, data: { sent: true } })
    } catch (err) {
      req.log.error({ err: err.message }, '[Auth] resend verification failed')
      return reply.code(500).send({ success: false, error: 'No se pudo enviar el email. Intenta de nuevo en unos minutos.' })
    }
  })

  // ══════════════════════════════════════════════════════════════════════════
  // PASSWORD RESET
  // ══════════════════════════════════════════════════════════════════════════

  // POST /api/auth/forgot-password
  //   Body: { email }
  //   SIEMPRE responde 200 (no revelar si el email existe — anti-enumeration).
  //   Si existe, envía email con link de reset.
  app.post('/forgot-password', async (req, reply) => {
    const { email } = req.body || {}
    if (!email?.trim()) {
      return reply.code(400).send({ success: false, error: 'Email requerido' })
    }

    const emailNorm = email.toLowerCase().trim()
    const db = getDb()

    const [user] = await db.select().from(schema.users)
      .where(eq(schema.users.email, emailNorm)).limit(1)

    // SIEMPRE devolver el mismo response, exista o no el user
    // Esto previene email enumeration attacks
    const successResponse = {
      success: true,
      data: {
        message: 'Si el email existe en nuestro sistema, recibirás un link de recuperación en los próximos minutos.',
      },
    }

    if (!user) {
      // Loggeamos para debug pero respondemos igual
      req.log.info({ email: emailNorm }, '[Auth] forgot-password: email no encontrado')
      return reply.send(successResponse)
    }

    try {
      const { createEmailToken, TOKEN_TYPES } = await import('../services/email-tokens-service.js')
      const { sendEmail, passwordResetEmail } = await import('../services/email-service.js')
      const { plain } = await createEmailToken({
        userId:    user.id,
        type:      TOKEN_TYPES.PASSWORD_RESET,
        ip:        req.ip,
        userAgent: req.headers['user-agent'],
      })
      const resetUrl = `${process.env.FRONTEND_URL || ''}/reset-password?token=${plain}`
      const tpl = passwordResetEmail({ name: user.name, resetUrl })
      await sendEmail({ to: user.email, subject: tpl.subject, html: tpl.html })

      req.log.info({ userId: user.id }, '[Auth] password reset email enviado')
    } catch (err) {
      req.log.error({ err: err.message, userId: user.id }, '[Auth] forgot-password email failed')
      // Aún así devolvemos el mismo response — no revelar errores internos
    }

    return reply.send(successResponse)
  })

  // POST /api/auth/reset-password
  //   Body: { token, newPassword }
  //   Verifica el token, actualiza la contraseña y consume el token.
  app.post('/reset-password', async (req, reply) => {
    const { token, newPassword } = req.body || {}

    if (!token) return reply.code(400).send({ success: false, error: 'Token requerido' })
    if (!newPassword || newPassword.length < 8) {
      return reply.code(400).send({
        success: false,
        error: 'La contraseña debe tener al menos 8 caracteres',
      })
    }

    const { consumeEmailToken, TOKEN_TYPES } = await import('../services/email-tokens-service.js')
    const result = await consumeEmailToken({
      plain: token,
      expectedType: TOKEN_TYPES.PASSWORD_RESET,
    })

    if (!result.valid) {
      return reply.code(400).send({ success: false, error: result.error })
    }

    const db = getDb()
    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS)
    await db.update(schema.users).set({
      passwordHash: newHash,
      updatedAt:    new Date(),
    }).where(eq(schema.users.id, result.userId))

    req.log.info({ userId: result.userId }, '[Auth] password resetted')
    return reply.send({
      success: true,
      data: { message: 'Contraseña actualizada. Ya puedes iniciar sesión.' },
    })
  })

  // GET /api/auth/peek-token?token=...
  //   Solo valida que el token sigue siendo válido (NO lo consume).
  //   Útil para que el frontend muestre "este link expiró" antes del submit.
  app.get('/peek-token', async (req, reply) => {
    const token = req.query?.token
    if (!token) return reply.code(400).send({ success: false, error: 'Token requerido' })

    const { peekEmailToken } = await import('../services/email-tokens-service.js')
    const result = await peekEmailToken(token)
    return reply.send({ success: true, data: result })
  })
}
