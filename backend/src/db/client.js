import { drizzle }  from 'drizzle-orm/node-postgres'
import pg           from 'pg'
import * as schema  from './schema.js'

const { Pool } = pg

let pool = null
let db   = null

export function getDb() {
  if (!db) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max:              20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    })
    db = drizzle(pool, { schema })
  }
  return db
}

export { schema }

export async function closeDb() {
  if (pool) {
    await pool.end()
    pool = null
    db = null
  }
}
