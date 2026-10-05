import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { config } from '../config.js';
import * as schema from './schema.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(here, '../../migrations');

function ensureLocalDir(url: string) {
  if (!url.startsWith('file:')) return;
  const file = url.slice('file:'.length);
  if (file === ':memory:') return;
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
}

export function createDb(url = config.databaseUrl, authToken = config.databaseAuthToken) {
  ensureLocalDir(url);
  const client = createClient({ url, authToken });
  const db = drizzle(client, { schema });
  return { client, db };
}

export type Db = ReturnType<typeof createDb>['db'];

/** Aplica as migrações `NNNN_nome.up.sql` ainda não aplicadas, em ordem. */
export async function migrate(client: Client) {
  await client.execute('PRAGMA foreign_keys = ON');
  await client.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  const applied = new Set(
    (await client.execute('SELECT version FROM schema_migrations')).rows.map((r) => String(r.version)),
  );
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.up.sql')).sort();
  for (const file of files) {
    const version = file.replace('.up.sql', '');
    if (applied.has(version)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    // Migrações que reconstroem tabelas (procedimento oficial do SQLite) desligam as FKs fora da transação
    // e conferem a integridade antes de religar.
    const rebuild = sql.includes('-- @foreign_keys_off');
    if (rebuild) await client.execute('PRAGMA foreign_keys = OFF');
    try {
      await client.executeMultiple(`BEGIN;\n${sql}\nINSERT INTO schema_migrations (version) VALUES ('${version}');\nCOMMIT;`);
    } catch (e) {
      await client.execute('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      if (rebuild) {
        const broken = await client.execute('PRAGMA foreign_key_check');
        await client.execute('PRAGMA foreign_keys = ON');
        if (broken.rows.length) throw new Error(`Migração ${version} deixou ${broken.rows.length} referência(s) inválida(s).`);
      }
    }
  }
}
