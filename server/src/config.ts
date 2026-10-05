import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1).default('file:../data/escola.db'),
  DATABASE_AUTH_TOKEN: z.string().optional(),
  APP_SECRET: z.string().optional(),
  CORS_ORIGINS: z.string().default(''),
});

const env = EnvSchema.parse(process.env);
const isProd = env.NODE_ENV === 'production';

// Em produção o segredo é obrigatório (ameaça "manipulação de token").
// Em dev fica salvo em data/.dev-secret (sessões e chaves de acesso sobrevivem a reinícios); em teste é efêmero.
if (isProd && (!env.APP_SECRET || env.APP_SECRET.length < 32)) {
  throw new Error('APP_SECRET é obrigatório em produção e precisa ter pelo menos 32 caracteres.');
}

function devSecret(): string {
  if (env.NODE_ENV === 'test') return crypto.randomBytes(48).toString('base64url');
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data/.dev-secret');
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, crypto.randomBytes(48).toString('base64url'), { mode: 0o600 });
  }
  return fs.readFileSync(file, 'utf8').trim();
}

export const config = {
  env: env.NODE_ENV,
  isProd,
  isTest: env.NODE_ENV === 'test',
  port: env.PORT,
  databaseUrl: env.DATABASE_URL,
  databaseAuthToken: env.DATABASE_AUTH_TOKEN || undefined,
  appSecret: env.APP_SECRET || devSecret(),
  corsOrigins: env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  session: {
    cookieName: 'escola_sid',
    ttlMs: 8 * 60 * 60 * 1000, // 8h (modelo de ameaças: sequestro de sessão)
  },
  security: {
    loginLockThreshold: 5, // falhas antes do bloqueio progressivo
    resetLockThreshold: 5, // respostas erradas na pergunta de segurança
    resetLockMinutes: 30,
  },
} as const;
