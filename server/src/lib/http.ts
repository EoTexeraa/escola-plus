import type { NextFunction, Request, Response } from 'express';
import { z, ZodError } from 'zod';

/** Formato de erro padrão (skill senior-backend): { error: { code, message, details? } } */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, 'VALIDATION_ERROR', message, details);
export const unauthorized = (message = 'Faça login para continuar.') => new HttpError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'Você não tem permissão para isso.') => new HttpError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Não encontrado.') => new HttpError(404, 'NOT_FOUND', message);
export const conflict = (message: string) => new HttpError(409, 'CONFLICT', message);

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Confira os dados enviados.',
        details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      },
    });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  // Corpo JSON malformado
  if (err && typeof err === 'object' && 'type' in err && err.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'JSON inválido.' } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno. Tente novamente.' } });
}

// Validadores reutilizáveis (mensagens em português)
export const zId = z.coerce.number().int().positive();
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD');
export const zTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora no formato HH:MM');
export const zText = (max: number, min = 1) => z.string().trim().min(min, 'Campo obrigatório').max(max, `Máximo de ${max} caracteres`);

export const idParam = z.object({ id: zId });
