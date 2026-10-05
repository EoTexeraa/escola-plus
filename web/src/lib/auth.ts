import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api/client';
import type { Me } from '../api/types';

export const ME_KEY = ['me'] as const;

/** Usuário da sessão (null = não logado). */
export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return await api.get<Me>('/me');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 5 * 60_000,
    retry: (count, e) => !(e instanceof ApiError && e.status < 500) && count < 2,
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSettled: () => {
      qc.clear(); // nada de dados do usuário anterior em memória (celular compartilhado)
      qc.setQueryData(ME_KEY, null);
    },
  });
}
