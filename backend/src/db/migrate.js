import 'dotenv/config'
import pg            from 'pg'
import { readFileSync, readdirSync } from 'fs'
import { join, dirname }             from 'path'
import { fileURLToPath }             from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function runMigrations() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  const migrationsDir = join(__dirname, 'migrations')
  const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()

  for (const file of files) {
    console.log(`[DB] Ejecutando migración: ${file}`)
    const sql = readFileSync(join(migrationsDir, file), 'utf-8')
    try {
      await client.query(sql)
      console.log(`[DB] ✓ ${file}`)
    } catch (err) {
      console.error(`[DB] ✗ ${file}:`, err.message)
      throw err
    }
  }

  await client.end()
  console.log('[DB] Migraciones completadas')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations().catch(err => {
    console.error(err)
    process.exit(1)
  })
}

export { runMigrations }
