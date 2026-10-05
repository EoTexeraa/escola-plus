import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { config } from '../config.js';

const scrypt = promisify(crypto.scrypt) as (
  pw: crypto.BinaryLike, salt: crypto.BinaryLike, keylen: number, opts: crypto.ScryptOptions,
) => Promise<Buffer>;

// scrypt N=2^15, r=8, p=1 (≈ 32 MB) — docs/security/modelo-de-ameacas.md
const SCRYPT_OPTS: crypto.ScryptOptions = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEYLEN = 64;

/** Formato salvo: `<salt hex 32>:<hash hex 128>` (161 caracteres). */
export async function hashSecret(plain: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(plain.normalize('NFKC'), salt, KEYLEN, SCRYPT_OPTS);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export async function verifySecret(plain: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(plain.normalize('NFKC'), Buffer.from(saltHex, 'hex'), expected.length, SCRYPT_OPTS);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/** Hash para comparação em tempo constante quando o usuário não existe (anti-enumeração por tempo). */
let dummyHash: string | undefined;
export async function burnVerifyTime(plain: string) {
  dummyHash ??= await hashSecret('dummy-password-for-timing');
  await verifySecret(plain, dummyHash);
}

/** Respostas de segurança: sem acento, minúsculas, espaços colapsados. */
export function normalizeAnswer(answer: string): string {
  return answer.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

// ---------- Chaves de acesso (professor/admin) ----------
const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I

/** Gera chave legível com 20 símbolos de 32 (100 bits): ex. PROF-7K2M-XQ9D-... */
export function generateAccessKey(role: 'teacher' | 'coordinator'): string {
  const bytes = crypto.randomBytes(20);
  const chars = Array.from(bytes, (b) => KEY_ALPHABET[b % 32]).join('');
  const prefix = role === 'coordinator' ? 'COORD' : 'PROF';
  return `${prefix}-${chars.match(/.{4}/g)!.join('-')}`;
}

export function normalizeAccessKey(key: string): string {
  return key.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Chaves têm alta entropia: SHA-256 com pepper (APP_SECRET) basta e permite busca por igualdade. */
export function hashAccessKey(key: string): string {
  return crypto.createHmac('sha256', config.appSecret).update(normalizeAccessKey(key)).digest('hex');
}

export function accessKeyHint(key: string): string {
  return `…${normalizeAccessKey(key).slice(-4)}`;
}

// ---------- Sessão (token HMAC-SHA256, algoritmo fixo) ----------
export interface SessionPayload {
  uid: number;
  v: number;   // token_version do usuário — trocar senha invalida sessões
  iat: number;
  exp: number;
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url');
const sign = (body: string) => crypto.createHmac('sha256', config.appSecret).update(body).digest('base64url');

export function signSession(uid: number, tokenVersion: number, now = Date.now()): string {
  const payload: SessionPayload = { uid, v: tokenVersion, iat: now, exp: now + config.session.ttlMs };
  const body = b64(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function verifySession(token: string | undefined, now = Date.now()): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as SessionPayload;
    if (typeof p.uid !== 'number' || typeof p.v !== 'number' || typeof p.exp !== 'number') return null;
    return p.exp > now ? p : null;
  } catch {
    return null;
  }
}

/** Senha temporária para reset feito pelo admin. */
export function generateTempPassword(): string {
  const bytes = crypto.randomBytes(10);
  return Array.from(bytes, (b) => KEY_ALPHABET[b % 32]).join('').toLowerCase();
}
