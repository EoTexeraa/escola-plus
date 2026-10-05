import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound, LogIn } from 'lucide-react';
import { api, ApiError } from '../../api/client';
import type { Me } from '../../api/types';
import { ME_KEY } from '../../lib/auth';
import { PasswordField } from '../../components/PasswordField';
import { Alert, Button, Input } from '../../components/ui';
import { AuthLayout } from './AuthLayout';

// Sem zod aqui: a tela de login está no carregamento inicial (orçamento de 150 KB gzip).
interface Form { username: string; password: string }

/** A partir deste número de erros, oferecemos a troca de senha (requisito do projeto). */
const OFFER_RESET_AFTER = 2;

export default function LoginPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [failures, setFailures] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const { register, handleSubmit, getValues, formState: { errors } } = useForm<Form>();

  const login = useMutation({
    mutationFn: (f: Form) => api.post<Me>('/auth/login', { username: f.username.toLowerCase(), password: f.password }),
    onSuccess: (me) => {
      qc.setQueryData(ME_KEY, me);
      navigate(me.mustChangePassword ? '/perfil?trocar=1' : '/inicio', { replace: true });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'INVALID_CREDENTIALS') setFailures((n) => n + 1);
      setMessage(e instanceof Error ? e.message : 'Erro ao entrar.');
    },
  });

  const resetLink = `/recuperar-senha?usuario=${encodeURIComponent(getValues('username') ?? '')}`;

  return (
    <AuthLayout title="Entrar" subtitle="Acesse suas notas, avisos e calendário.">
      <form onSubmit={handleSubmit((f) => { setMessage(null); login.mutate(f); })} className="space-y-4" noValidate>
        <Input label="Usuário" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
          error={errors.username?.message} {...register('username', { validate: (v) => v.trim().length > 0 || 'Informe seu usuário' })} />
        <PasswordField label="Senha" autoComplete="current-password" error={errors.password?.message} {...register('password', { required: 'Informe sua senha' })} />

        {message && failures < OFFER_RESET_AFTER && <Alert tone="danger">{message}</Alert>}

        {failures >= OFFER_RESET_AFTER && (
          <div className="rounded-lg border border-warning/40 bg-warning-soft p-4 text-warning animate-scale-in" role="alert">
            <p className="font-semibold">Errou a senha {failures} vezes?</p>
            <p className="mt-1 text-sm">{message?.startsWith('Muitas') ? message : 'Você pode trocar sua senha respondendo à sua pergunta de segurança.'}</p>
            <Link to={resetLink} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-md bg-surface px-4 font-semibold text-text shadow-sm hover:bg-primary-soft hover:text-on-primary-soft">
              <KeyRound className="size-5" aria-hidden /> Trocar minha senha
            </Link>
          </div>
        )}

        <Button type="submit" size="lg" className="w-full" loading={login.isPending} icon={LogIn}>Entrar</Button>
      </form>
      <p className="mt-8 text-center text-muted">
        Ainda não tem conta? <Link to="/cadastro" className="font-semibold text-primary underline-offset-4 hover:underline">Criar conta</Link>
      </p>
    </AuthLayout>
  );
}
