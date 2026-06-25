/**
 * Definición central de planes — fuente única de verdad.
 *
 * PLANES ACTIVOS EN LANZAMIENTO:
 *   trial    → gratis por 5 días (10 specs, sin código visible)
 *   starter  → $78.99 USD/mes
 *   teammate → $128.99 USD/mes
 *
 * PLANES PRÓXIMAMENTE (hidden):
 *   advance, pro, enterprise
 */
export const PLANS = {
  trial: {
    id:            'trial',
    name:          'Trial',
    price:         0,
    currency:      'USD',
    description:   'Prueba gratuita por 5 días',
    hidden:        false,
    trialDays:     5,
    trialMaxSpecs: 10,

    limits: {
      users:          1,
      maxMembers:     1,           // Trial: solo el dueño
      e2ePerMonth:    10,
      projects:       1,
      historyDays:    1,
      devices:        ['desktop'],
      apiTesting:     false,
      accessibility:  false,
      allureReport:   false,
      jiraIntegration:false,
      cicd:           false,
      recording:      true,
      repair:         false,
      repairsPerMonth: 0,        // Trial: sin repair
      showSpecCode:   false,    // El trial NO muestra el código generado
      downloadSpecs:  false,
    },

    features: [
      'E2E Testing (10 specs durante el trial)',
      'Grabación de flujos en iframe',
      'Ejecutar specs y ver resultados',
      'Screenshots en cada paso',
    ],
  },

  starter: {
    id:          'starter',
    name:        'Starter',
    price:       78.99,
    currency:    'USD',
    description: 'Para QA Engineers individuales',
    hidden:      false,

    limits: {
      users:           1,
      maxMembers:      1,             // Starter: solo el dueño
      e2ePerMonth:     60,           // Ejecuciones individuales en /workspace
      suiteRunsPerMonth: 15,         // Cada "suite run" cuenta como 1, sin importar cuántos specs
      projects:        1,
      historyDays:     30,
      devices:         ['desktop'],
      apiTesting:      false,
      accessibility:   false,
      allureReport:    false,
      jiraIntegration: false,
      cicd:            false,
      recording:       true,
      repair:          true,
      repairsPerMonth: 10,           // Starter: 10 repairs/mes
      showSpecCode:    true,
      downloadSpecs:   true,
      testSuites:      true,
      deviceFarm:      false,
      concurrentJobs:  8,             // Máximo simultáneos
    },

    features: [
      'E2E Testing con IA en español',
      '60 ejecuciones individuales/mes',
      '15 ejecuciones de suite/mes',
      'Grabación de flujos en iframe',
      'Reparación IA de specs fallidos',
      'Test Suites',
      'Dispositivos Desktop',
      'Versionado automático en GitHub',
      'Reportes HTML',
      'Historial 30 días',
      '1 proyecto',
    ],
  },

  teammate: {
    id:          'teammate',
    name:        'Teammate',
    price:       128.99,
    currency:    'USD',
    description: 'Para equipos pequeños de QA',
    hidden:      false,
    popular:     true,

    limits: {
      users:                3,
      maxMembers:           5,           // Teammate: 5 miembros incluidos
      e2ePerMonth:          100,
      suiteRunsPerMonth:    50,         // 50 suite runs/mes (cada uno puede ser N×M jobs)
      deviceFarmRunsPerMonth: 20,       // 20 device farm runs/mes (los más costosos)
      maxJobsPerSuiteRun:   100,        // Cap por suite run: 10 specs × 10 devices máx
      wcagPerMonth:         10,         // 10 análisis WCAG/mes
      allureReport:         true,
      allureProjects:       3,           // Hasta 3 projects
      allureRunsPerMonth:   30,          // 30 runs/mes desde Suite Run
      allureExternalUploads: false,      // Sin uploads externos (Advance+)
      allureShareLinks:     false,       // Sin share links públicos (Advance+)
      githubIntegration:    true,        // Conectar y pushear
      githubReposPerMonth:  1,           // 1 repo por mes (push hacia Advance)
      projects:             3,
      historyDays:          90,
      devices:              ['desktop'],
      apiTesting:           true,
      accessibility:        true,
      accessibilityTags:    ['wcag2a', 'wcag2aa'],
      jiraIntegration:      true,
      cicd:                 true,
      cicdProviders:        ['github'],
      recording:            true,
      repair:               true,
      repairsPerMonth:      50,            // Teammate: 50 repairs/mes
      showSpecCode:         true,
      downloadSpecs:        true,
      organizations:        true,
      roles:                ['owner', 'manager', 'qa'],
      testSuites:           true,
      deviceFarm:           true,
      deviceFarmMaxDevices: 10,
      playwrightReport:     true,
      concurrentJobs:       30,
    },

    features: [
      'Todo lo de Starter',
      'Hasta 3 usuarios en el equipo',
      '100 ejecuciones individuales/mes',
      '50 suite runs/mes',
      '20 device farm runs/mes (hasta 10 devices)',
      'API Testing (Postman + OpenAPI)',
      'Accesibilidad WCAG 2.0',
      'Reportes Playwright + Allure descargables',
      'Jira + Zephyr Scale integrados',
      'Organizaciones y roles',
      'CI/CD con GitHub Actions',
      'Historial 90 días',
      '3 proyectos',
    ],
  },

  // ── Planes hidden — se lanzarán después ─────────────────────
  advance: {
    id:          'advance',
    name:        'Advance',
    price:       283.99,
    currency:    'USD',
    description: 'Para equipos QA en crecimiento',
    hidden:      true,
    comingSoon:  true,
    features: [
      'Todo lo de Teammate',
      'Mobile Testing (Android)',
      'WCAG 2.0, 2.1 y 2.2',
      'Unit Tests JS/TS',
      'CI/CD GitHub + Jenkins',
    ],
  },
  pro: {
    id:         'pro',
    name:       'Pro',
    price:      489.99,
    currency:   'USD',
    description:'Para equipos QA maduros',
    hidden:     true,
    comingSoon: true,
    features:   ['Todo lo de Advance', 'Migración Selenium → Playwright', 'Mobile iOS'],
  },
  enterprise: {
    id:         'enterprise',
    name:       'Enterprise',
    price:      null,
    priceFrom:  2500,
    currency:   'USD',
    description:'Para empresas',
    hidden:     true,
    comingSoon: true,
    features:   ['Todo sin límites', 'On-premise', 'SSO/SAML', 'SLA'],
  },
}

// ── Helpers ─────────────────────────────────────────────────────────────

const HIERARCHY = ['trial', 'starter', 'teammate', 'advance', 'pro', 'enterprise']

export const VISIBLE_PLANS = Object.values(PLANS).filter(p => !p.hidden && p.id !== 'trial')

export function getPlan(planId) {
  return PLANS[planId] || PLANS.starter
}

export function getPlanLimits(planId) {
  return PLANS[planId]?.limits || PLANS.starter.limits
}

/**
 * Verifica si el plan del usuario incluye un módulo.
 *
 * @example
 *   hasFeature('teammate', 'apiTesting')  // true
 *   hasFeature('starter', 'apiTesting')   // false
 */
export function hasFeature(planId, feature) {
  const limits = getPlanLimits(planId)
  return limits[feature] === true || (Array.isArray(limits[feature]) && limits[feature].length > 0)
}

/**
 * Verifica si planA >= planB en jerarquía.
 */
export function planHasAccess(userPlan, requiredPlan) {
  const userIdx     = HIERARCHY.indexOf(userPlan)
  const requiredIdx = HIERARCHY.indexOf(requiredPlan)
  if (userIdx === -1 || requiredIdx === -1) return false
  return userIdx >= requiredIdx
}

/**
 * Calcula el estado del trial de un usuario.
 */
export function getTrialStatus(trialStartedAt) {
  if (!trialStartedAt) return { active: false, daysLeft: 0, expired: true }
  const now      = Date.now()
  const started  = new Date(trialStartedAt).getTime()
  const elapsed  = Math.floor((now - started) / (1000 * 60 * 60 * 24))
  const daysLeft = Math.max(0, PLANS.trial.trialDays - elapsed)
  return { active: daysLeft > 0, daysLeft, expired: daysLeft === 0 }
}
