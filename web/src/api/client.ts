// Cliente HTTP: mesma origem (web e APK carregam o app do próprio servidor), cookie HttpOnly e header anti-CSRF.

export interface FieldError { field: string; message: string }

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: FieldError[] | Record<string, unknown>,
  ) {
    super(message);
  }
  get fieldErrors(): FieldError[] {
    return Array.isArray(this.details) ? this.details : [];
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  const qs = query
    ? '?' + new URLSearchParams(
      Object.entries(query).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]),
    ).toString()
    : '';
  let res: Response;
  try {
    res = await fetch(`/api${path}${qs}`, {
      method,
      credentials: 'same-origin',
      headers: {
        'X-Requested-With': 'escola',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Sem conexão com o servidor. Verifique sua internet.');
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = json?.error;
    throw new ApiError(res.status, e?.code ?? 'HTTP_ERROR', e?.message ?? 'Algo deu errado. Tente novamente.', e?.details);
  }
  return json?.data as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, undefined, query),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  del: <T = void>(path: string, query?: Query) => request<T>('DELETE', path, undefined, query),
};
