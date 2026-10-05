import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Client } from '@libsql/client';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { snapshot, localDbPath } from './backup.js';
import { config } from './config.js';
import type { Db } from './db/client.js';
import { errorHandler, notFound } from './lib/http.js';
import { csrfGuard, loadSession, requireAuth, requireRole } from './middleware/auth.js';
import { adminRouter } from './routes/admin.js';
import { authRouter } from './routes/auth.js';
import { contentRouter } from './routes/content.js';
import { examsRouter } from './routes/exams.js';
import { meRouter, metaRouter, subjectsRouter } from './routes/me.js';
import { routinesRouter } from './routes/routines.js';
import { studentRouter } from './routes/student.js';
import { teacherRouter } from './routes/teacher.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = path.resolve(here, '../../web/dist');

export function createApp(db: Db, client: Client) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // atrás do proxy do provedor (IP real para rate limit)

  app.use(compression()); // arquivos do app ~70% menores no 4G

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: config.isProd ? [] : null,
      },
    },
    hsts: config.isProd ? { maxAge: 31_536_000, includeSubDomains: true } : false,
  }));

  // CORS explícito: só as origens configuradas (o app e o APK usam a mesma origem do servidor)
  app.use('/api', cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());

  app.use('/api', rateLimit({
    windowMs: 15 * 60_000, limit: Number(process.env.API_RATE_LIMIT) || 600, standardHeaders: 'draft-7', legacyHeaders: false,
    skip: () => config.isTest,
    message: { error: { code: 'RATE_LIMITED', message: 'Muitas requisições. Aguarde alguns minutos.' } },
  }));

  app.get('/api/health', (_req, res) => { res.json({ data: { status: 'ok', time: new Date().toISOString() } }); });

  app.use('/api', csrfGuard, loadSession(db));

  // Públicas
  app.use('/api/auth', authRouter(db));
  app.use('/api/meta', metaRouter(db));

  // Autenticadas
  const api = Router();
  api.use(requireAuth);
  api.use('/me', meRouter(db));
  api.use('/subjects', subjectsRouter(db));
  api.use('/student', studentRouter(db));
  api.use('/routines', routinesRouter(db));
  api.use('/teacher', teacherRouter(db));
  api.use('/admin', adminRouter(db));
  api.use('/', examsRouter(db));
  api.use('/', contentRouter(db));

  // Backup sob demanda (admin): cópia consistente do banco em arquivo
  api.get('/admin/backup/download', requireRole('admin'), async (_req, res) => {
    if (!localDbPath()) throw notFound('Backup manual disponível apenas com banco em arquivo local. No Turso, use o painel do provedor.');
    const tmp = path.join(os.tmpdir(), `escola-backup-${Date.now()}.db`);
    await snapshot(client, tmp);
    res.download(tmp, `escola-backup-${new Date().toISOString().slice(0, 10)}.db`, () => fs.rm(tmp, { force: true }, () => {}));
  });
  app.use('/api', api);

  app.use('/api', (_req, _res, next) => next(notFound('Rota não encontrada.')));

  // App web (build do Vite) + fallback da SPA
  if (fs.existsSync(WEB_DIST)) {
    app.use(express.static(WEB_DIST, {
      index: false,
      setHeaders: (res, file) => {
        // Arquivos com hash no nome: cache longo; o resto (index.html, sw.js, manifest) sem cache
        if (/[.-][A-Za-z0-9_-]{8,}\.(js|css|woff2|png|svg)$/.test(file)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        else res.setHeader('Cache-Control', 'no-cache');
      },
    }));
    // root: evita que pastas com ponto no caminho absoluto (ex.: .vscode) sejam tratadas como ocultas
    app.get(/^(?!\/api).*/, (_req, res) => { res.sendFile('index.html', { root: WEB_DIST }); });
  }

  app.use(errorHandler);
  return app;
}
