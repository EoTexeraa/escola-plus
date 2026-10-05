import type { NextFunction, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { config } from '../config.js';
import type { Db } from '../db/client.js';
import { users, type Role } from '../db/schema.js';
import { signSession, verifySession } from '../lib/crypto.js';
import { forbidden, HttpError, unauthorized } from '../lib/http.js';

export interface SessionUser {
  id: number;
  username: string;
  fullName: string;
  role: Role;
  classId: number | null;
  englishLevel: number | null;
  mustChangePassword: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export function setSessionCookie(res: Response, userId: number, tokenVersion: number) {
  res.cookie(config.session.cookieName, signSession(userId, tokenVersion), {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'strict',
    maxAge: config.session.ttlMs,
    path: '/',
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(config.session.cookieName, { path: '/', httpOnly: true, sameSite: 'strict', secure: config.isProd });
}

/** Carrega o usuário da sessão; o papel SEMPRE vem do banco, nunca do cliente. */
export function loadSession(db: Db) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const payload = verifySession(req.cookies?.[config.session.cookieName]);
    if (!payload) return next();
    const [u] = await db.select().from(users).where(eq(users.id, payload.uid)).limit(1);
    if (!u || !u.isActive || u.tokenVersion !== payload.v) {
      clearSessionCookie(res);
      return next();
    }
    req.user = {
      id: u.id, username: u.username, fullName: u.fullName, role: u.role,
      classId: u.classId, englishLevel: u.englishLevel, mustChangePassword: u.mustChangePassword,
    };
    // Renovação deslizante: passou da metade da validade → novo cookie
    if (payload.exp - Date.now() < config.session.ttlMs / 2) setSessionCookie(res, u.id, u.tokenVersion);
    next();
  };
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  // Senha temporária (reset pelo admin): só pode trocar a senha e consultar a própria sessão
  if (req.user.mustChangePassword && !['/api/me', '/api/me/password', '/api/auth/logout'].includes(req.originalUrl.split('?')[0]!)) {
    return next(new HttpError(403, 'PASSWORD_CHANGE_REQUIRED', 'Defina uma nova senha para continuar.'));
  }
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}

/**
 * CSRF: além do cookie SameSite=Strict, toda requisição que altera dados precisa do header
 * `X-Requested-With: escola` — formulários de outros sites não conseguem enviá-lo sem CORS.
 */
export function csrfGuard(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-requested-with') !== 'escola') {
    return next(new HttpError(403, 'CSRF', 'Requisição bloqueada por segurança.'));
  }
  next();
}
