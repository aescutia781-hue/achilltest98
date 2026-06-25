import { pgTable, text, timestamp, integer, boolean, jsonb, uuid, bigint } from 'drizzle-orm/pg-core'

// ── USUARIOS ────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id:               uuid('id').primaryKey().defaultRandom(),
  email:            text('email').notNull().unique(),
  passwordHash:     text('password_hash').notNull(),
  name:             text('name').notNull(),

  // Plan y suscripción
  plan:             text('plan').notNull().default('trial'),  // trial | starter | teammate
  organizationId:   uuid('organization_id'),
  currentOrganizationId: uuid('current_organization_id'),
  role:             text('role').default('owner'),            // owner | manager | qa

  // Email verification
  emailVerified:    boolean('email_verified').notNull().default(false),
  emailVerifiedAt:  timestamp('email_verified_at'),

  // Trial
  trialStartedAt:   timestamp('trial_started_at'),
  trialEndsAt:      timestamp('trial_ends_at'),
  isTrialExpired:   boolean('is_trial_expired').default(false),
  specsUsedTrial:   integer('specs_used_trial').default(0),

  // Mercado Pago
  mpSubscriptionId:     text('mp_subscription_id'),
  mpSubscriptionStatus: text('mp_subscription_status'),    // pending | authorized | paused | cancelled
  mpPlanId:             text('mp_plan_id'),
  paidSince:            timestamp('paid_since'),

  // Timestamps
  createdAt:        timestamp('created_at').notNull().defaultNow(),
  updatedAt:        timestamp('updated_at').notNull().defaultNow(),
  lastLoginAt:      timestamp('last_login_at'),
})

// ── ORGANIZACIONES (multi-tenant con roles) ─────────────────────────────────

export const organizations = pgTable('organizations', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  name:                 text('name').notNull(),
  slug:                 text('slug'),
  description:          text('description'),
  avatarUrl:            text('avatar_url'),
  ownerId:              uuid('owner_id').notNull(),
  plan:                 text('plan').notNull().default('teammate'),
  isPersonal:           boolean('is_personal').default(false),

  // Billing (movido aquí desde users — cada org tiene su propio billing)
  mpSubscriptionId:     text('mp_subscription_id'),
  mpSubscriptionStatus: text('mp_subscription_status'),
  mpPlanId:             text('mp_plan_id'),
  paidSince:            timestamp('paid_since'),

  // Trial (puede vivir aquí también — el trial es por org)
  trialStartedAt:       timestamp('trial_started_at'),
  trialEndsAt:          timestamp('trial_ends_at'),
  isTrialExpired:       boolean('is_trial_expired').default(false),
  specsUsedTrial:       integer('specs_used_trial').default(0),

  settings:             jsonb('settings').default({}),

  createdAt:            timestamp('created_at').notNull().defaultNow(),
  updatedAt:            timestamp('updated_at').notNull().defaultNow(),
})

// ── ORG MEMBERS (many-to-many user ↔ org con role) ──────────────────────────

export const organizationMembers = pgTable('organization_members', {
  id:              uuid('id').primaryKey().defaultRandom(),
  organizationId:  uuid('organization_id').notNull(),
  userId:          uuid('user_id').notNull(),

  role:            text('role').notNull().default('qa'),  // owner | manager | qa

  invitedBy:       uuid('invited_by'),
  joinedAt:        timestamp('joined_at').notNull().defaultNow(),

  lastActiveAt:    timestamp('last_active_at'),

  createdAt:       timestamp('created_at').notNull().defaultNow(),
  updatedAt:       timestamp('updated_at').notNull().defaultNow(),
})

// ── ORG INVITES (link compartible con token) ────────────────────────────────

export const organizationInvites = pgTable('organization_invites', {
  id:              uuid('id').primaryKey().defaultRandom(),
  organizationId:  uuid('organization_id').notNull(),
  createdBy:       uuid('created_by').notNull(),

  token:           text('token').notNull().unique(),

  role:            text('role').notNull().default('qa'),
  maxUses:         integer('max_uses'),
  usesCount:       integer('uses_count').notNull().default(0),

  expiresAt:       timestamp('expires_at'),
  isRevoked:       boolean('is_revoked').notNull().default(false),

  lastUsedAt:      timestamp('last_used_at'),
  lastUsedBy:      uuid('last_used_by'),

  createdAt:       timestamp('created_at').notNull().defaultNow(),
})

// ── PROYECTOS ───────────────────────────────────────────────────────────────

export const projects = pgTable('projects', {
  id:             uuid('id').primaryKey().defaultRandom(),
  userId:         uuid('user_id').notNull(),
  organizationId: uuid('organization_id'),
  name:           text('name').notNull(),
  targetUrl:      text('target_url'),

  // Configuración Playwright
  config:         jsonb('config').default({}),

  // GitHub
  githubRepo:     text('github_repo'),
  githubBranch:   text('github_branch').default('main'),

  createdAt:      timestamp('created_at').notNull().defaultNow(),
  updatedAt:      timestamp('updated_at').notNull().defaultNow(),
})

// ── EJECUCIONES ─────────────────────────────────────────────────────────────

export const executions = pgTable('executions', {
  id:           uuid('id').primaryKey().defaultRandom(),
  userId:       uuid('user_id').notNull(),
  projectId:    uuid('project_id'),

  // Test
  testName:     text('test_name').notNull(),
  targetUrl:    text('target_url').notNull(),
  instructions: text('instructions'),
  deviceId:     text('device_id').default('desktop-chrome'),

  // Generación
  specCode:     text('spec_code'),
  specFileName: text('spec_file_name'),

  // Ejecución
  status:       text('status').notNull().default('pending'),  // pending | running | completed | failed
  result:       jsonb('result').default({}),
  errorMessage: text('error_message'),
  screenshotsUrl:text('screenshots_url'),
  videoUrl:     text('video_url'),

  // Métricas
  durationMs:   integer('duration_ms'),

  // Datos para el Repair Agent
  domSnapshotUrl:   text('dom_snapshot_url'),
  failedStepIndex:  integer('failed_step_index'),
  failedSelector:   text('failed_selector'),
  failedAction:     text('failed_action'),
  consoleLogs:      jsonb('console_logs').default([]),
  pageUrlAtFail:    text('page_url_at_fail'),

  // Timestamps
  createdAt:    timestamp('created_at').notNull().defaultNow(),
  startedAt:    timestamp('started_at'),
  completedAt:  timestamp('completed_at'),
})

// ── TESTS DE API ────────────────────────────────────────────────────────────

export const apiTests = pgTable('api_tests', {
  id:           uuid('id').primaryKey().defaultRandom(),
  userId:       uuid('user_id').notNull(),
  projectId:    uuid('project_id'),
  name:         text('name').notNull(),

  // Contrato (Postman / OpenAPI / etc)
  contractType: text('contract_type'),   // postman | openapi | wsdl | graphql
  contractData: jsonb('contract_data'),

  // Generación
  testCases:    jsonb('test_cases'),

  status:       text('status').notNull().default('pending'),
  result:       jsonb('result').default({}),

  createdAt:    timestamp('created_at').notNull().defaultNow(),
  completedAt:  timestamp('completed_at'),
})

// ── REPORTES WCAG ───────────────────────────────────────────────────────────

export const wcagReports = pgTable('wcag_reports', {
  id:          uuid('id').primaryKey().defaultRandom(),
  userId:      uuid('user_id').notNull(),
  targetUrl:   text('target_url').notNull(),
  standard:    text('standard').notNull(),    // wcag2a | wcag2aa | wcag21aa
  violations:  jsonb('violations'),
  totalIssues: integer('total_issues'),
  createdAt:   timestamp('created_at').notNull().defaultNow(),
})

// ── REPORTES ALLURE ─────────────────────────────────────────────────────────

export const allureReports = pgTable('allure_reports', {
  id:          uuid('id').primaryKey().defaultRandom(),
  userId:      uuid('user_id').notNull(),
  projectId:   uuid('project_id'),
  reportData:  jsonb('report_data'),
  reportUrl:   text('report_url'),
  zipUrl:      text('zip_url'),
  createdAt:   timestamp('created_at').notNull().defaultNow(),
})

// ── INTEGRACIONES (Jira, GitHub, etc) ───────────────────────────────────────

export const integrations = pgTable('integrations', {
  id:            uuid('id').primaryKey().defaultRandom(),
  userId:        uuid('user_id').notNull(),
  organizationId:uuid('organization_id'),
  provider:      text('provider').notNull(),   // jira | github | slack
  config:        jsonb('config'),
  credentials:   jsonb('credentials'),        // encrypted
  isActive:      boolean('is_active').default(true),
  createdAt:     timestamp('created_at').notNull().defaultNow(),
})

// ── TEST SUITES ─────────────────────────────────────────────────────────────
// Agrupador de specs ejecutables juntos. Disponible en todos los planes.

export const testSuites = pgTable('test_suites', {
  id:            uuid('id').primaryKey().defaultRandom(),
  userId:        uuid('user_id').notNull(),
  organizationId:uuid('organization_id'),
  projectId:     uuid('project_id'),

  name:          text('name').notNull(),
  description:   text('description'),

  createdAt:     timestamp('created_at').notNull().defaultNow(),
  updatedAt:     timestamp('updated_at').notNull().defaultNow(),
})

// ── SUITE ↔ SPECS (join table) ──────────────────────────────────────────────
// Una suite tiene N specs. Un spec puede estar en N suites.
// El "spec" es realmente una `execution` previa exitosa (la primera generación)
// — lo que se reutiliza es el spec_code generado.

export const testSuiteSpecs = pgTable('test_suite_specs', {
  id:            uuid('id').primaryKey().defaultRandom(),
  suiteId:       uuid('suite_id').notNull(),
  executionId:   uuid('execution_id').notNull(),     // FK a la execution original
  order:         integer('order').default(0),         // Orden dentro de la suite
  createdAt:     timestamp('created_at').notNull().defaultNow(),
})

// ── DEVICE FARMS (Teammate only) ────────────────────────────────────────────
// Una farm es un set de hasta 10 dispositivos contra los que se corre una suite.

export const deviceFarms = pgTable('device_farms', {
  id:            uuid('id').primaryKey().defaultRandom(),
  userId:        uuid('user_id').notNull(),
  organizationId:uuid('organization_id'),

  name:          text('name').notNull(),
  devices:       jsonb('devices').notNull(),         // [{deviceId, name, frameStyle, viewport, ...}]

  createdAt:     timestamp('created_at').notNull().defaultNow(),
  updatedAt:     timestamp('updated_at').notNull().defaultNow(),
})

// ── SUITE RUNS ──────────────────────────────────────────────────────────────
// Cada vez que se ejecuta una suite (con o sin device farm) se crea un run.

export const suiteRuns = pgTable('suite_runs', {
  id:            uuid('id').primaryKey().defaultRandom(),
  suiteId:       uuid('suite_id').notNull(),
  userId:        uuid('user_id').notNull(),
  deviceFarmId:  uuid('device_farm_id'),              // NULL si run en 1 device

  // Resumen
  status:        text('status').notNull().default('pending'),  // pending|running|completed|failed
  totalSpecs:    integer('total_specs').notNull(),
  totalDevices:  integer('total_devices').notNull().default(1),
  totalJobs:     integer('total_jobs').notNull(),     // specs × devices
  passed:        integer('passed').default(0),
  failed:        integer('failed').default(0),
  skipped:       integer('skipped').default(0),

  // Reportes generados (rutas relativas)
  playwrightReportUrl: text('playwright_report_url'),
  allureReportUrl:     text('allure_report_url'),
  allureZipUrl:        text('allure_zip_url'),
  reportsGeneratedAt:  timestamp('reports_generated_at'),

  // Métricas
  durationMs:    integer('duration_ms'),

  // Timestamps
  createdAt:     timestamp('created_at').notNull().defaultNow(),
  startedAt:     timestamp('started_at'),
  completedAt:   timestamp('completed_at'),
})

// ── SUITE RUN RESULTS ───────────────────────────────────────────────────────
// El resultado individual de un spec contra un device específico.
// Esta es la celda del grid del frontend.

export const suiteRunResults = pgTable('suite_run_results', {
  id:            uuid('id').primaryKey().defaultRandom(),
  suiteRunId:    uuid('suite_run_id').notNull(),
  suiteSpecId:   uuid('suite_spec_id').notNull(),     // FK a la asignación spec→suite
  executionId:   uuid('execution_id'),                // El execution que se ejecutó
  deviceId:      text('device_id').notNull(),

  status:        text('status').notNull().default('pending'),
  durationMs:    integer('duration_ms'),
  errorMessage:  text('error_message'),
  screenshotUrl: text('screenshot_url'),

  startedAt:     timestamp('started_at'),
  completedAt:   timestamp('completed_at'),
})

// ── API TESTING ─────────────────────────────────────────────────────────────

export const apiCollections = pgTable('api_collections', {
  id:               uuid('id').primaryKey().defaultRandom(),
  userId:           uuid('user_id').notNull(),
  organizationId:   uuid('organization_id'),
  projectId:        uuid('project_id'),

  name:             text('name').notNull(),
  description:      text('description'),

  contractType:     text('contract_type').notNull(),    // openapi | postman | insomnia
  contractData:     jsonb('contract_data').notNull(),
  baseUrl:          text('base_url'),

  authConfig:       jsonb('auth_config').default({}),
  encryptionConfig: jsonb('encryption_config').default({}),
  otpConfig:        jsonb('otp_config').default({}),

  totalEndpoints:   integer('total_endpoints').default(0),
  totalTests:       integer('total_tests').default(0),

  createdAt:        timestamp('created_at').notNull().defaultNow(),
  updatedAt:        timestamp('updated_at').notNull().defaultNow(),
})

export const apiTestCases = pgTable('api_test_cases', {
  id:               uuid('id').primaryKey().defaultRandom(),
  collectionId:     uuid('collection_id').notNull(),

  endpoint:         text('endpoint').notNull(),
  testName:         text('test_name').notNull(),
  category:         text('category').notNull(),
  generatedBy:      text('generated_by').notNull(),

  requestMethod:    text('request_method').notNull(),
  requestPath:      text('request_path').notNull(),
  requestHeaders:   jsonb('request_headers').default({}),
  requestQuery:     jsonb('request_query').default({}),
  requestBody:      jsonb('request_body'),

  captureVars:      jsonb('capture_vars').default({}),
  useVars:          jsonb('use_vars').default([]),

  needsEncryption:  boolean('needs_encryption').default(false),
  needsAuth:        boolean('needs_auth').default(true),
  overrideAuth:     boolean('override_auth').default(false),

  expectedStatus:   integer('expected_status').notNull(),
  expectedSchema:   jsonb('expected_schema'),
  validations:      jsonb('validations').default([]),

  order:            integer('order').default(0),
  dependsOn:        uuid('depends_on'),

  enabled:          boolean('enabled').default(true),
  createdAt:        timestamp('created_at').notNull().defaultNow(),
})

export const apiTestSecrets = pgTable('api_test_secrets', {
  id:               uuid('id').primaryKey().defaultRandom(),
  collectionId:     uuid('collection_id').notNull(),
  userId:           uuid('user_id').notNull(),

  secretType:       text('secret_type').notNull(),
  label:            text('label').notNull(),
  encryptedValue:   text('encrypted_value').notNull(),
  iv:               text('iv').notNull(),
  authTag:          text('auth_tag').notNull(),
  displayHint:      text('display_hint'),

  createdAt:        timestamp('created_at').notNull().defaultNow(),
  updatedAt:        timestamp('updated_at').notNull().defaultNow(),
})

export const apiTestRuns = pgTable('api_test_runs', {
  id:               uuid('id').primaryKey().defaultRandom(),
  collectionId:     uuid('collection_id').notNull(),
  userId:           uuid('user_id').notNull(),

  status:           text('status').notNull().default('pending'),
  baseUrl:          text('base_url'),

  totalTests:       integer('total_tests').notNull(),
  passed:           integer('passed').default(0),
  failed:           integer('failed').default(0),
  skipped:          integer('skipped').default(0),

  durationMs:       integer('duration_ms'),
  reportUrl:        text('report_url'),

  createdAt:        timestamp('created_at').notNull().defaultNow(),
  startedAt:        timestamp('started_at'),
  completedAt:      timestamp('completed_at'),
})

export const apiTestResults = pgTable('api_test_results', {
  id:                uuid('id').primaryKey().defaultRandom(),
  runId:             uuid('run_id').notNull(),
  testCaseId:        uuid('test_case_id').notNull(),

  status:            text('status').notNull().default('pending'),
  durationMs:        integer('duration_ms'),

  actualMethod:      text('actual_method'),
  actualUrl:         text('actual_url'),
  actualHeaders:     jsonb('actual_headers'),
  actualBody:        jsonb('actual_body'),
  actualStatus:      integer('actual_status'),
  actualResponse:    jsonb('actual_response'),

  validationResults: jsonb('validation_results').default([]),
  errorMessage:      text('error_message'),

  startedAt:         timestamp('started_at'),
  completedAt:       timestamp('completed_at'),
})

// ── WCAG / ACCESIBILIDAD ────────────────────────────────────────────────────

export const wcagTargets = pgTable('wcag_targets', {
  id:             uuid('id').primaryKey().defaultRandom(),
  userId:         uuid('user_id').notNull(),
  organizationId: uuid('organization_id'),

  name:           text('name').notNull(),
  url:            text('url').notNull(),

  defaultLevel:   text('default_level').notNull().default('AA'),
  defaultDevice:  text('default_device'),
  config:         jsonb('config').default({}),

  lastScore:      integer('last_score'),
  lastAnalysisId: uuid('last_analysis_id'),
  lastAnalyzedAt: timestamp('last_analyzed_at'),

  createdAt:      timestamp('created_at').notNull().defaultNow(),
  updatedAt:      timestamp('updated_at').notNull().defaultNow(),
})

export const wcagAnalyses = pgTable('wcag_analyses', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  targetId:           uuid('target_id'),
  userId:             uuid('user_id').notNull(),

  url:                text('url').notNull(),
  name:               text('name'),
  level:              text('level').notNull(),
  deviceId:           text('device_id'),

  status:             text('status').notNull().default('pending'),
  errorMessage:       text('error_message'),

  score:              integer('score'),
  totalIssues:        integer('total_issues').default(0),
  criticalCount:      integer('critical_count').default(0),
  highCount:          integer('high_count').default(0),
  mediumCount:        integer('medium_count').default(0),
  lowCount:           integer('low_count').default(0),
  passedRules:        integer('passed_rules').default(0),
  inapplicableRules:  integer('inapplicable_rules').default(0),
  categoryScores:     jsonb('category_scores').default({}),

  axeResults:         jsonb('axe_results'),
  structuralResults:  jsonb('structural_results'),
  keyboardResults:    jsonb('keyboard_results'),
  visualResults:      jsonb('visual_results'),
  cognitiveResults:   jsonb('cognitive_results'),
  simulations:        jsonb('simulations'),

  reportHtmlUrl:      text('report_html_url'),
  reportPdfUrl:       text('report_pdf_url'),
  reportJsonUrl:      text('report_json_url'),
  screenshotUrl:      text('screenshot_url'),

  durationMs:         integer('duration_ms'),

  createdAt:          timestamp('created_at').notNull().defaultNow(),
  startedAt:          timestamp('started_at'),
  completedAt:        timestamp('completed_at'),
})

export const wcagIssues = pgTable('wcag_issues', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  analysisId:          uuid('analysis_id').notNull(),

  ruleId:              text('rule_id').notNull(),
  source:              text('source').notNull(),
  category:            text('category'),

  severity:            text('severity').notNull(),
  impact:              text('impact'),
  wcagCriterion:       text('wcag_criterion'),
  wcagLevel:           text('wcag_level'),
  affectedUsers:       jsonb('affected_users').default([]),

  selector:            text('selector'),
  htmlSnippet:         text('html_snippet'),
  xpath:               text('xpath'),
  pageSection:         text('page_section'),

  ruleDescription:     text('rule_description').notNull(),
  technicalHelp:       text('technical_help'),
  helpUrl:             text('help_url'),
  failureSummary:      text('failure_summary'),

  humanTitle:          text('human_title'),
  humanDescription:    text('human_description'),
  humanImpact:         text('human_impact'),
  humanFixSuggestion:  text('human_fix_suggestion'),
  fixCodeSnippet:      text('fix_code_snippet'),

  status:              text('status').default('open'),
  ignoredReason:       text('ignored_reason'),

  createdAt:           timestamp('created_at').notNull().defaultNow(),
})

// ── ALLURE REPORTS ──────────────────────────────────────────────────────────

export const allureProjects = pgTable('allure_projects', {
  id:             uuid('id').primaryKey().defaultRandom(),
  userId:         uuid('user_id').notNull(),
  organizationId: uuid('organization_id'),

  name:           text('name').notNull(),
  description:    text('description'),
  tags:           jsonb('tags').default([]),

  uploadToken:    text('upload_token'),
  uploadEnabled:  boolean('upload_enabled').default(false),

  lastRunId:      uuid('last_run_id'),
  lastRunAt:      timestamp('last_run_at'),
  lastPassRate:   text('last_pass_rate'),

  totalRuns:      integer('total_runs').default(0),

  createdAt:      timestamp('created_at').notNull().defaultNow(),
  updatedAt:      timestamp('updated_at').notNull().defaultNow(),
})

export const allureRuns = pgTable('allure_runs', {
  id:              uuid('id').primaryKey().defaultRandom(),
  projectId:       uuid('project_id').notNull(),
  userId:          uuid('user_id').notNull(),

  name:            text('name'),
  source:          text('source').notNull(),
  sourceRef:       text('source_ref'),
  buildNumber:     text('build_number'),
  branch:          text('branch'),
  commitSha:       text('commit_sha'),
  environment:     text('environment'),

  status:          text('status').notNull().default('pending'),
  errorMessage:    text('error_message'),

  totalTests:      integer('total_tests').default(0),
  passed:          integer('passed').default(0),
  failed:          integer('failed').default(0),
  broken:          integer('broken').default(0),
  skipped:         integer('skipped').default(0),
  unknown:         integer('unknown').default(0),
  passRate:        text('pass_rate'),
  durationMs:      integer('duration_ms'),
  severityStats:   jsonb('severity_stats').default({}),

  reportUrl:       text('report_url'),
  resultsZipUrl:   text('results_zip_url'),
  reportSizeKb:    integer('report_size_kb'),

  shareToken:      text('share_token'),
  shareEnabled:    boolean('share_enabled').default(false),
  shareExpiresAt:  timestamp('share_expires_at'),

  testsSnapshot:   jsonb('tests_snapshot'),

  createdAt:       timestamp('created_at').notNull().defaultNow(),
  startedAt:       timestamp('started_at'),
  completedAt:     timestamp('completed_at'),
})

export const allureFlakyTests = pgTable('allure_flaky_tests', {
  id:              uuid('id').primaryKey().defaultRandom(),
  projectId:       uuid('project_id').notNull(),

  testFullName:    text('test_full_name').notNull(),
  testName:        text('test_name'),
  runsAnalyzed:    integer('runs_analyzed').notNull(),
  passCount:       integer('pass_count').notNull(),
  failCount:       integer('fail_count').notNull(),
  brokenCount:     integer('broken_count').notNull(),
  flakyScore:      text('flaky_score').notNull(),
  lastStatus:      text('last_status'),
  lastRunId:       uuid('last_run_id'),
  lastSeenAt:      timestamp('last_seen_at').notNull(),

  createdAt:       timestamp('created_at').notNull().defaultNow(),
  updatedAt:       timestamp('updated_at').notNull().defaultNow(),
})

// ── GITHUB INTEGRATION ──────────────────────────────────────────────────────

export const githubConnections = pgTable('github_connections', {
  id:                     uuid('id').primaryKey().defaultRandom(),
  userId:                 uuid('user_id').notNull().unique(),

  githubUserId:           bigint('github_user_id', { mode: 'number' }).notNull(),
  githubUsername:         text('github_username').notNull(),
  githubEmail:            text('github_email'),
  avatarUrl:              text('avatar_url'),

  accessTokenEncrypted:   text('access_token_encrypted').notNull(),
  tokenType:              text('token_type').default('oauth_app'),

  scopes:                 jsonb('scopes').default([]),

  isActive:               boolean('is_active').default(true),
  lastUsedAt:             timestamp('last_used_at'),
  lastError:              text('last_error'),

  connectedAt:            timestamp('connected_at').notNull().defaultNow(),
  updatedAt:              timestamp('updated_at').notNull().defaultNow(),
})

export const githubRepos = pgTable('github_repos', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  userId:              uuid('user_id').notNull(),
  connectionId:        uuid('connection_id').notNull(),

  githubRepoId:        bigint('github_repo_id', { mode: 'number' }).notNull(),
  owner:               text('owner').notNull(),
  repoName:            text('repo_name').notNull(),
  fullName:            text('full_name').notNull(),
  defaultBranch:       text('default_branch').notNull().default('main'),
  visibility:          text('visibility').notNull().default('private'),
  htmlUrl:             text('html_url').notNull(),
  cloneUrl:            text('clone_url'),

  sourceType:          text('source_type'),
  sourceId:            uuid('source_id'),
  sourceName:          text('source_name'),

  lastCommitSha:       text('last_commit_sha'),
  lastCommitMessage:   text('last_commit_message'),
  lastPushedAt:        timestamp('last_pushed_at'),
  lastFileCount:       integer('last_file_count').default(0),
  totalPushes:         integer('total_pushes').default(0),

  manifest:            jsonb('manifest').default({}),

  createdAt:           timestamp('created_at').notNull().defaultNow(),
  updatedAt:           timestamp('updated_at').notNull().defaultNow(),
})

export const githubPushes = pgTable('github_pushes', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  repoId:              uuid('repo_id').notNull(),
  userId:              uuid('user_id').notNull(),

  status:              text('status').notNull().default('pending'),

  branch:              text('branch').notNull().default('main'),
  commitSha:           text('commit_sha'),
  commitMessage:       text('commit_message').notNull(),

  filesCount:          integer('files_count').default(0),
  filesAdded:          integer('files_added').default(0),
  filesModified:       integer('files_modified').default(0),
  filesRemoved:        integer('files_removed').default(0),

  errorMessage:        text('error_message'),
  commitUrl:           text('commit_url'),
  durationMs:          integer('duration_ms'),

  createdAt:           timestamp('created_at').notNull().defaultNow(),
  startedAt:           timestamp('started_at'),
  completedAt:         timestamp('completed_at'),
})

// ── JIRA + ZEPHYR SCALE INTEGRATION ──────────────────────────────────────────

export const jiraConnections = pgTable('jira_connections', {
  id:                       uuid('id').primaryKey().defaultRandom(),
  organizationId:           uuid('organization_id').notNull().unique(),
  connectedBy:              uuid('connected_by').notNull(),

  authType:                 text('auth_type').notNull(),       // oauth | api_token
  deploymentType:           text('deployment_type').notNull(), // cloud | server

  // Cloud OAuth
  cloudId:                  text('cloud_id'),
  siteUrl:                  text('site_url').notNull(),
  siteName:                 text('site_name'),
  accessTokenEncrypted:     text('access_token_encrypted'),
  refreshTokenEncrypted:    text('refresh_token_encrypted'),
  tokenExpiresAt:           timestamp('token_expires_at'),

  // API Token
  apiTokenEncrypted:        text('api_token_encrypted'),
  apiEmail:                 text('api_email'),

  // Atlassian user
  atlassianUserId:          text('atlassian_user_id'),
  atlassianUserName:        text('atlassian_user_name'),
  atlassianUserEmail:       text('atlassian_user_email'),
  avatarUrl:                text('avatar_url'),

  scopes:                   jsonb('scopes').default([]),

  isActive:                 boolean('is_active').notNull().default(true),
  lastUsedAt:               timestamp('last_used_at'),
  lastError:                text('last_error'),

  // Zephyr Scale
  hasZephyr:                boolean('has_zephyr').default(false),
  zephyrTokenEncrypted:     text('zephyr_token_encrypted'),

  connectedAt:              timestamp('connected_at').notNull().defaultNow(),
  updatedAt:                timestamp('updated_at').notNull().defaultNow(),
})

export const jiraProjects = pgTable('jira_projects', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  organizationId:      uuid('organization_id').notNull(),
  connectionId:        uuid('connection_id').notNull(),

  jiraProjectId:       text('jira_project_id').notNull(),
  jiraProjectKey:      text('jira_project_key').notNull(),
  name:                text('name').notNull(),
  description:         text('description'),
  avatarUrl:           text('avatar_url'),
  projectType:         text('project_type'),
  isArchived:          boolean('is_archived').default(false),

  isSelected:          boolean('is_selected').default(false),

  lastSyncedAt:        timestamp('last_synced_at'),

  createdAt:           timestamp('created_at').notNull().defaultNow(),
  updatedAt:           timestamp('updated_at').notNull().defaultNow(),
})

export const zephyrTestCases = pgTable('zephyr_test_cases', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  organizationId:      uuid('organization_id').notNull(),
  jiraProjectId:       uuid('jira_project_id').notNull(),

  zephyrKey:           text('zephyr_key').notNull(),
  name:                text('name').notNull(),
  objective:           text('objective'),
  precondition:        text('precondition'),

  status:              text('status'),
  priority:            text('priority'),
  folder:              text('folder'),
  labels:              jsonb('labels').default([]),

  steps:               jsonb('steps').default([]),

  linkedSpecId:        uuid('linked_spec_id'),

  lastSyncedAt:        timestamp('last_synced_at').notNull().defaultNow(),

  createdAt:           timestamp('created_at').notNull().defaultNow(),
  updatedAt:           timestamp('updated_at').notNull().defaultNow(),
})

export const zephyrTestCycles = pgTable('zephyr_test_cycles', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  organizationId:      uuid('organization_id').notNull(),
  jiraProjectId:       uuid('jira_project_id').notNull(),

  zephyrKey:           text('zephyr_key').notNull(),
  name:                text('name').notNull(),
  description:         text('description'),
  status:              text('status'),
  plannedStartDate:    timestamp('planned_start_date'),
  plannedEndDate:      timestamp('planned_end_date'),

  linkedSuiteRunId:    uuid('linked_suite_run_id'),

  createdAt:           timestamp('created_at').notNull().defaultNow(),
  updatedAt:           timestamp('updated_at').notNull().defaultNow(),
})

export const zephyrExecutions = pgTable('zephyr_executions', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  organizationId:      uuid('organization_id').notNull(),
  testCaseId:          uuid('test_case_id').notNull(),
  cycleId:             uuid('cycle_id'),

  specId:              uuid('spec_id'),
  suiteRunId:          uuid('suite_run_id'),
  executionId:         uuid('execution_id'),

  result:              text('result').notNull(),
  comment:             text('comment'),
  executedBy:          uuid('executed_by'),

  zephyrExecutionId:   text('zephyr_execution_id'),
  pushedAt:            timestamp('pushed_at'),
  pushError:           text('push_error'),

  createdAt:           timestamp('created_at').notNull().defaultNow(),
})

export const jiraIssues = pgTable('jira_issues', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  organizationId:      uuid('organization_id').notNull(),
  jiraProjectId:       uuid('jira_project_id').notNull(),

  jiraIssueKey:        text('jira_issue_key').notNull(),
  jiraIssueId:         text('jira_issue_id').notNull(),
  issueType:           text('issue_type').notNull(),
  summary:             text('summary').notNull(),
  status:              text('status'),
  priority:            text('priority'),
  htmlUrl:             text('html_url').notNull(),

  specId:              uuid('spec_id'),
  executionId:         uuid('execution_id'),
  suiteRunId:          uuid('suite_run_id'),

  createdBy:           uuid('created_by').notNull(),

  createdAt:           timestamp('created_at').notNull().defaultNow(),
  updatedAt:           timestamp('updated_at').notNull().defaultNow(),
})

// ── REPAIR AGENT ─────────────────────────────────────────────────────────────

export const repairSessions = pgTable('repair_sessions', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  organizationId:      uuid('organization_id').notNull(),
  userId:              uuid('user_id').notNull(),

  specId:              uuid('spec_id'),
  executionId:         uuid('execution_id'),
  suiteRunId:          uuid('suite_run_id'),

  status:              text('status').notNull().default('pending'),
  investigationMode:   text('investigation_mode'),

  originalCode:        text('original_code'),
  proposedCode:        text('proposed_code'),

  diagnosis:           text('diagnosis'),
  confidenceScore:     text('confidence_score'),  // numeric stored as text en Drizzle

  changes:             jsonb('changes').default([]),

  tokensInput:         integer('tokens_input').default(0),
  tokensOutput:        integer('tokens_output').default(0),
  modelUsed:           text('model_used'),
  durationMs:          integer('duration_ms'),

  appliedAt:           timestamp('applied_at'),
  appliedBy:           uuid('applied_by'),
  rejectedAt:          timestamp('rejected_at'),
  rejectionReason:     text('rejection_reason'),
  errorMessage:        text('error_message'),

  appliedToVersion:    integer('applied_to_version'),
  rollbackAvailable:   boolean('rollback_available').default(true),

  createdAt:           timestamp('created_at').notNull().defaultNow(),
  updatedAt:           timestamp('updated_at').notNull().defaultNow(),
})

export const specRevisions = pgTable('spec_revisions', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  organizationId:      uuid('organization_id').notNull(),
  specId:              uuid('spec_id').notNull(),

  version:             integer('version').notNull(),
  code:                text('code').notNull(),
  source:              text('source').notNull(),

  repairSessionId:     uuid('repair_session_id'),

  createdBy:           uuid('created_by').notNull(),
  createdAt:           timestamp('created_at').notNull().defaultNow(),
})

export const repairUsage = pgTable('repair_usage', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  organizationId:      uuid('organization_id').notNull(),
  year:                integer('year').notNull(),
  month:               integer('month').notNull(),

  repairCount:         integer('repair_count').notNull().default(0),
  tokensUsed:          integer('tokens_used').notNull().default(0),
  tokensCostUsd:       text('tokens_cost_usd').default('0'),

  updatedAt:           timestamp('updated_at').notNull().defaultNow(),
})

// ── EMAIL TOKENS (verification + password reset) ─────────────────────────────

export const emailTokens = pgTable('email_tokens', {
  id:              uuid('id').primaryKey().defaultRandom(),
  userId:          uuid('user_id').notNull(),

  type:            text('type').notNull(),         // email_verification | password_reset
  tokenHash:       text('token_hash').notNull(),

  expiresAt:       timestamp('expires_at').notNull(),
  usedAt:          timestamp('used_at'),

  requestedIp:     text('requested_ip'),
  userAgent:       text('user_agent'),

  createdAt:       timestamp('created_at').notNull().defaultNow(),
})
