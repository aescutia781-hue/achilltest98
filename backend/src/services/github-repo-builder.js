/**
 * GitHub Repo Builder
 *
 * Toma una entidad de Achilltest (Suite, Workspace, API Collection) y genera
 * la estructura de archivos que se van a comitear en el repo.
 *
 * Output:
 *   [
 *     { path: 'playwright.config.ts',   content: '...', encoding: 'utf-8' },
 *     { path: 'package.json',           content: '...', encoding: 'utf-8' },
 *     { path: 'tests/login.spec.ts',    content: '...', encoding: 'utf-8' },
 *     { path: '.gitignore',             content: '...', encoding: 'utf-8' },
 *     { path: 'README.md',              content: '...', encoding: 'utf-8' },
 *     { path: '.achilltest/manifest.json', content: '...', encoding: 'utf-8' },
 *     { path: '.github/workflows/playwright.yml', content: '...', encoding: 'utf-8' },
 *   ]
 *
 * El .achilltest/manifest.json mapea Achilltest IDs → archivos del repo,
 * para permitir sync bidireccional en sprints futuros.
 */

import { eq, and, inArray }      from 'drizzle-orm'
import { getDb, schema }         from '../db/client.js'

/**
 * Builds files from a test suite.
 *
 * @param {string} suiteId
 * @param {object} opts
 * @param {boolean} [opts.includeWorkflow=true]  Incluir .github/workflows/playwright.yml
 *
 * @returns {{ files, manifest, repoName }}
 */
export async function buildFromSuite(suiteId, opts = {}) {
  const db = getDb()

  const [suite] = await db.select().from(schema.testSuites)
    .where(eq(schema.testSuites.id, suiteId)).limit(1)
  if (!suite) throw new Error('Suite no encontrada')

  // Cargar los specs de la suite con join
  const suiteSpecs = await db.select().from(schema.testSuiteSpecs)
    .where(eq(schema.testSuiteSpecs.suiteId, suiteId))

  const specIds = suiteSpecs.map(s => s.specId).filter(Boolean)
  const specs = specIds.length
    ? await db.select().from(schema.testSpecs)
        .where(inArray(schema.testSpecs.id, specIds))
    : []

  // Cargar devices configurados en la suite
  const devices = suite.devices || ['desktop-chrome']

  const files = []
  const manifest = {
    achilltestSourceType: 'suite',
    achilltestSourceId:   suiteId,
    suiteName:            suite.name,
    generatedAt:          new Date().toISOString(),
    specs:                {},   // achilltestId → archivo
  }

  // ── 1. playwright.config.ts ────────────────────────────────────────────
  files.push({
    path:    'playwright.config.ts',
    content: _renderPlaywrightConfig(devices, suite.name),
    encoding: 'utf-8',
  })

  // ── 2. package.json ────────────────────────────────────────────────────
  files.push({
    path:    'package.json',
    content: _renderPackageJson(_slugify(suite.name)),
    encoding: 'utf-8',
  })

  // ── 3. tsconfig.json ───────────────────────────────────────────────────
  files.push({
    path:    'tsconfig.json',
    content: _renderTsConfig(),
    encoding: 'utf-8',
  })

  // ── 4. .gitignore ──────────────────────────────────────────────────────
  files.push({
    path:    '.gitignore',
    content: GITIGNORE_CONTENT,
    encoding: 'utf-8',
  })

  // ── 5. README.md ───────────────────────────────────────────────────────
  files.push({
    path:    'README.md',
    content: _renderReadme(suite.name, suite.description, specs.length, devices),
    encoding: 'utf-8',
  })

  // ── 6. tests/*.spec.ts (uno por spec) ─────────────────────────────────
  const specFileNames = new Set()
  for (const spec of specs) {
    const fileName = _uniqueSpecFileName(spec.name, specFileNames)
    specFileNames.add(fileName)

    const path = `tests/${fileName}`
    const content = _wrapSpecCode(spec)

    files.push({ path, content, encoding: 'utf-8' })
    manifest.specs[spec.id] = path
  }

  // ── 7. .achilltest/manifest.json ──────────────────────────────────────
  files.push({
    path:    '.achilltest/manifest.json',
    content: JSON.stringify(manifest, null, 2),
    encoding: 'utf-8',
  })

  // ── 8. .github/workflows/playwright.yml ────────────────────────────────
  if (opts.includeWorkflow !== false) {
    files.push({
      path:    '.github/workflows/playwright.yml',
      content: _renderGithubWorkflow(),
      encoding: 'utf-8',
    })
  }

  return {
    files,
    manifest,
    repoName: _slugify(suite.name),
  }
}

/**
 * Builds files from a workspace (todos los specs del user).
 */
export async function buildFromWorkspace(userId, opts = {}) {
  const db = getDb()

  // Cargar todos los specs del user
  const specs = await db.select().from(schema.testSpecs)
    .where(eq(schema.testSpecs.userId, userId))

  if (specs.length === 0) {
    throw new Error('No tienes specs para exportar')
  }

  const files = []
  const manifest = {
    achilltestSourceType: 'workspace',
    achilltestSourceId:   userId,
    generatedAt:          new Date().toISOString(),
    specs:                {},
  }

  files.push({ path: 'playwright.config.ts', content: _renderPlaywrightConfig(['desktop-chrome'], 'My Tests'), encoding: 'utf-8' })
  files.push({ path: 'package.json',          content: _renderPackageJson('my-tests'),              encoding: 'utf-8' })
  files.push({ path: 'tsconfig.json',         content: _renderTsConfig(),                            encoding: 'utf-8' })
  files.push({ path: '.gitignore',            content: GITIGNORE_CONTENT,                            encoding: 'utf-8' })
  files.push({ path: 'README.md',             content: _renderReadme('My Achilltest Workspace', null, specs.length, ['desktop-chrome']), encoding: 'utf-8' })

  const specFileNames = new Set()
  for (const spec of specs) {
    const fileName = _uniqueSpecFileName(spec.name, specFileNames)
    specFileNames.add(fileName)
    const path = `tests/${fileName}`
    files.push({ path, content: _wrapSpecCode(spec), encoding: 'utf-8' })
    manifest.specs[spec.id] = path
  }

  files.push({ path: '.achilltest/manifest.json', content: JSON.stringify(manifest, null, 2), encoding: 'utf-8' })

  if (opts.includeWorkflow !== false) {
    files.push({ path: '.github/workflows/playwright.yml', content: _renderGithubWorkflow(), encoding: 'utf-8' })
  }

  return { files, manifest, repoName: 'achilltest-workspace' }
}

// ── TEMPLATES ────────────────────────────────────────────────────────────────

function _renderPlaywrightConfig(devices, suiteName) {
  const projects = devices.map(d => {
    const meta = DEVICE_PROJECT_MAP[d] || { name: d, use: `{ ...devices['Desktop Chrome'] }` }
    return `    {
      name: '${meta.name}',
      use: ${meta.use},
    },`
  }).join('\n')

  return `import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright configuration generated by Achilltest
 * Suite: ${suiteName}
 *
 * Docs: https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir:      './tests',
  fullyParallel: true,
  forbidOnly:   !!process.env.CI,
  retries:      process.env.CI ? 2 : 0,
  workers:      process.env.CI ? 1 : undefined,

  reporter: [
    ['html'],
    ['list'],
    // Allure (opcional): npm i allure-playwright -D
    // ['allure-playwright'],
  ],

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace:   'on-first-retry',
    screenshot: 'only-on-failure',
    video:      'retain-on-failure',
  },

  projects: [
${projects}
  ],
})
`
}

const DEVICE_PROJECT_MAP = {
  'desktop-chrome':  { name: 'chromium',      use: "{ ...devices['Desktop Chrome'] }" },
  'desktop-firefox': { name: 'firefox',       use: "{ ...devices['Desktop Firefox'] }" },
  'desktop-safari':  { name: 'webkit',        use: "{ ...devices['Desktop Safari'] }" },
  'iphone-15':       { name: 'iphone-15',     use: "{ ...devices['iPhone 14 Pro'] }" },
  'iphone-15-pro':   { name: 'iphone-15-pro', use: "{ ...devices['iPhone 14 Pro Max'] }" },
  'ipad-pro':        { name: 'ipad-pro',      use: "{ ...devices['iPad Pro 11'] }" },
  'pixel-8':         { name: 'pixel-8',       use: "{ ...devices['Pixel 7'] }" },
  'galaxy-s24':      { name: 'galaxy-s24',    use: "{ ...devices['Galaxy S9+'] }" },
}

function _renderPackageJson(name) {
  return JSON.stringify({
    name,
    version: '0.1.0',
    private: true,
    description: 'Tests generated by Achilltest',
    scripts: {
      test:        'playwright test',
      'test:ui':   'playwright test --ui',
      'test:debug':'playwright test --debug',
      'test:headed':'playwright test --headed',
      report:      'playwright show-report',
    },
    devDependencies: {
      '@playwright/test': '^1.44.0',
      '@types/node':      '^20.0.0',
      'typescript':       '^5.4.0',
    },
  }, null, 2) + '\n'
}

function _renderTsConfig() {
  return JSON.stringify({
    compilerOptions: {
      target:       'ES2022',
      module:       'commonjs',
      lib:          ['ES2022', 'DOM'],
      strict:       true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
      moduleResolution: 'node',
    },
    include: ['tests/**/*.ts'],
    exclude: ['node_modules'],
  }, null, 2) + '\n'
}

const GITIGNORE_CONTENT = `node_modules/
test-results/
playwright-report/
playwright/.cache/
allure-results/
allure-report/
.env
.env.local
*.log
.DS_Store
`

function _renderReadme(name, description, specCount, devices) {
  return `# ${name}

${description ? description + '\n\n' : ''}Tests automatizados de Playwright generados con [Achilltest](https://achilltest.io).

## Stats

- **${specCount}** test specs
- Devices: ${devices.join(', ')}

## Setup

\`\`\`bash
npm install
npx playwright install
\`\`\`

## Correr los tests

\`\`\`bash
# Todos los tests
npm test

# UI interactiva
npm run test:ui

# Solo un device
npx playwright test --project=chromium

# Con browser visible
npm run test:headed
\`\`\`

## Variables de entorno

- \`BASE_URL\` — URL base contra la que correr (default: http://localhost:3000)

## Estructura

\`\`\`
.
├── playwright.config.ts     Configuración
├── tests/                   Specs (1 archivo por test)
├── .github/workflows/       CI/CD
└── .achilltest/             Manifest de sync con Achilltest
\`\`\`

## Sync con Achilltest

Este repo fue generado desde Achilltest. Para re-sincronizar cambios desde Achilltest,
ve al detalle de la suite en achilltest.io y usa el botón "Push to GitHub".

---

Generado el ${new Date().toLocaleDateString('es-MX')} con Achilltest.
`
}

function _renderGithubWorkflow() {
  return `name: Playwright Tests

on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]

jobs:
  test:
    timeout-minutes: 30
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: lts/*
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright Browsers
        run: npx playwright install --with-deps

      - name: Run Playwright tests
        run: npx playwright test

      - name: Upload Playwright report
        uses: actions/upload-artifact@v4
        if: \${{ !cancelled() }}
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30
`
}

// ── HELPERS ──────────────────────────────────────────────────────────────────

function _slugify(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // quitar acentos
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
    || 'achilltest-suite'
}

function _uniqueSpecFileName(specName, existing) {
  const base = _slugify(specName) || 'spec'
  let fileName = `${base}.spec.ts`
  let counter = 2
  while (existing.has(fileName)) {
    fileName = `${base}-${counter}.spec.ts`
    counter++
  }
  return fileName
}

/**
 * Envuelve el código del spec en una plantilla con metadata de Achilltest
 * (preserva info útil al hacer pull en el futuro).
 */
function _wrapSpecCode(spec) {
  const code = spec.code || `// Empty spec - rellena con tu código de Playwright
import { test, expect } from '@playwright/test'

test('${spec.name || 'placeholder'}', async ({ page }) => {
  await page.goto('/')
})`

  // Si el code ya tiene los imports y test(), no envolver
  if (code.includes('import') && (code.includes('test(') || code.includes('test.describe('))) {
    // Solo agregar header de metadata
    return `${_renderSpecHeader(spec)}\n${code}\n`
  }

  // Si solo es código de test (sin imports), envolverlo
  return `${_renderSpecHeader(spec)}
import { test, expect } from '@playwright/test'

test('${(spec.name || 'unnamed').replace(/'/g, "\\'")}', async ({ page }) => {
${_indent(code, '  ')}
})
`
}

function _renderSpecHeader(spec) {
  const tags = (spec.tags || []).map(t => `@${t}`).join(' ')
  return `/**
 * ${spec.name || 'Untitled spec'}
${spec.description ? ' * ' + spec.description + '\n' : ''} *
 * Generated by Achilltest
 * Achilltest ID: ${spec.id}
${tags ? ' * Tags: ' + tags + '\n' : ''} */`
}

function _indent(text, prefix) {
  return text.split('\n').map(line => prefix + line).join('\n')
}
