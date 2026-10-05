// Backup diário (decisão #5: RPO 24h, retenção 14 dias).
// Banco em arquivo → VACUUM INTO (cópia consistente com o servidor rodando).
// Banco remoto (Turso) → o backup fica a cargo do provedor (point-in-time restore).
import fs from 'node:fs';
import path from 'node:path';
import type { Client } from '@libsql/client';
import { config } from './config.js';

const RETENTION_DAYS = 14;

export function localDbPath(url = config.databaseUrl): string | null {
  if (!url.startsWith('file:')) return null;
  const file = url.slice('file:'.length);
  return file === ':memory:' ? null : path.resolve(file);
}

export function backupDir(): string | null {
  const db = localDbPath();
  return db ? path.join(path.dirname(db), 'backups') : null;
}

export async function snapshot(client: Client, target: string) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) fs.rmSync(target);
  await client.execute({ sql: 'VACUUM INTO ?', args: [target] });
}

export async function runDailyBackup(client: Client) {
  const dir = backupDir();
  if (!dir) return null;
  const day = new Date().toISOString().slice(0, 10);
  const target = path.join(dir, `escola-${day}.db`);
  if (!fs.existsSync(target)) await snapshot(client, target);
  // Retenção: remove backups com mais de 14 dias
  const cutoff = Date.now() - RETENTION_DAYS * 86_400_000;
  for (const f of fs.readdirSync(dir)) {
    const m = /^escola-(\d{4}-\d{2}-\d{2})\.db$/.exec(f);
    if (m && Date.parse(m[1]!) < cutoff) fs.rmSync(path.join(dir, f));
  }
  return target;
}

export function scheduleBackups(client: Client) {
  const run = () => runDailyBackup(client).catch((e) => console.error('Falha no backup:', e));
  void run();
  const timer = setInterval(run, 60 * 60 * 1000); // confere de hora em hora; grava 1 por dia
  timer.unref();
}
