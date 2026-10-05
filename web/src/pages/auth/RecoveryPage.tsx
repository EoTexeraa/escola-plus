import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, KeyRound } from 'lucide-react';
import { z } from 'zod';
import { api } from '../../api/client';
import type { Me } from '../../api/types';
import { ME_KEY } from '../../lib/auth';
import { PasswordField } from '../../components/PasswordField';
import { Alert, Button, Input } from '../../components/ui';
import { AuthLayout } from './AuthLayout';
import { applyApiErrors, zPassword } from './forms';

const Step2 = z.object({
  answer: z.string().trim().min(1, 'Responda à pergunta'),
  newPassword: zPassword,
  confirm: z.string(),
}).refine((v) => v.newPassword === v.confirm, { path: ['confirm'], message: 'As senhas não conferem' });
type Step2Form = z.infer<typeof Step2>;

export default function RecoveryPage() {
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [username, setUsername] = useState(params.get('usuario') ?? '');
  const [question, setQuestion] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const ask = useMutation({
    mutationFn: (u: string) => api.post<{ question: string }>('/auth/recovery/question', { username: u }),
    onSuccess: (d) => { setQuestion(d.question); setMessage(null); },
    onError: (e) => setMessage(e.message),
  });

  const { register, handleSubmit, watch, setError, formState: { errors } } = useForm<Step2Form>({ resolver: zodResolver(Step2) });
  const newPassword = watch('newPassword') ?? '';

  const recover = useMutation({
    mutationFn: (f: Step2Form) => api.post<Me>('/auth/recovery', { username: username.trim().toLowerCase(), answer: f.answer, newPassword: f.newPassword }),
    onSuccess: (me) => { qc.setQueryData(ME_KEY, me); navigate('/inicio', { replace: true }); },
    onError: (e) => setMessage(applyApiErrors(e, setError, ['newPassword']) || null),
  });

  return (
    <AuthLayout title="Trocar senha" subtitle="Responda à sua pergunta de segurança para criar uma nova senha.">
      {!question ? (
        <form className="space-y-4" noValidate onSubmit={(e) => {
          e.preventDefault();
          if (username.trim().length < 3) return setMessage('Informe seu nome de usuário.');
          ask.mutate(username.trim().toLowerCase());
        }}>
          <Input label="Nome de usuário" autoComplete="username" autoCapitalize="none" spellCheck={false}
            value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          {message && <Alert tone="danger">{message}</Alert>}
          <Button type="submit" size="lg" className="w-full" loading={ask.isPending} icon={ArrowRight}>Continuar</Button>
        </form>
      ) : (
        <form className="space-y-4 animate-fade-up" noValidate onSubmit={handleSubmit((f) => { setMessage(null); recover.mutate(f); })}>
          <div className="rounded-lg bg-primary-soft p-4 text-on-primary-soft">
            <p className="text-sm font-medium">Sua pergunta de segurança</p>
            <p className="mt-1 text-lg font-semibold">{question}</p>
          </div>
          <Input label="Resposta" autoComplete="off" autoFocus hint="Acentos e letras maiúsculas não fazem diferença."
            error={errors.answer?.message} {...register('answer')} />
          <PasswordField label="Nova senha" autoComplete="new-password" meter={newPassword} error={errors.newPassword?.message} {...register('newPassword')} />
          <PasswordField label="Confirme a nova senha" autoComplete="new-password" error={errors.confirm?.message} {...register('confirm')} />
          {message && <Alert tone="danger">{message}</Alert>}
          <Button type="submit" size="lg" className="w-full" loading={recover.isPending} icon={KeyRound}>Trocar senha e entrar</Button>
          <button type="button" className="min-h-11 w-full text-sm text-muted underline-offset-4 hover:underline" onClick={() => { setQuestion(null); setMessage(null); }}>
            Usar outro usuário
          </button>
        </form>
      )}
      <Alert tone="primary" title="Não lembra a resposta?">
        Peça à administração da escola para redefinir sua senha.
      </Alert>
      <p className="mt-8 text-center text-muted">
        Lembrou a senha? <Link to="/login" className="font-semibold text-primary underline-offset-4 hover:underline">Voltar para o login</Link>
      </p>
    </AuthLayout>
  );
}
