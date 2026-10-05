import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { z } from 'zod';
import { ApiError } from '../../api/client';

export const zPassword = z.string()
  .min(8, 'Pelo menos 8 caracteres')
  .max(128)
  .regex(/[A-Za-z]/, 'Inclua pelo menos uma letra')
  .regex(/\d/, 'Inclua pelo menos um número');

/** Copia erros de campo vindos da API para o formulário; devolve a mensagem geral. */
export function applyApiErrors<T extends FieldValues>(e: unknown, setError: UseFormSetError<T>, fields: string[]): string {
  if (!(e instanceof ApiError)) return 'Algo deu errado. Tente novamente.';
  let mapped = false;
  for (const fe of e.fieldErrors) {
    if (fields.includes(fe.field)) {
      setError(fe.field as Path<T>, { message: fe.message });
      mapped = true;
    }
  }
  return mapped && e.code === 'VALIDATION_ERROR' ? '' : e.message;
}
