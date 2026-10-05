import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, KeyRound, Monitor, Moon, ShieldCheck, Smartphone, Sun } from 'lucide-react';
import { z } from 'zod';
import { api } from '../../api/client';
import type { Me } from '../../api/types';
import { ME_KEY, useMe } from '../../lib/auth';
import { ROLE_LABEL } from '../../lib/format';
import { useTheme } from '../../lib/theme';
import { PasswordField } from '../../components/PasswordField';
import { Alert, Button, Card, cx, Input, PageHeader, Select, useToast } from '../../components/ui';
import { applyApiErrors, zPassword } from '../auth/forms';

export default function ProfilePage() {
  const { data: me } = useMe();
  const [params] = useSearchParams();
  if (!me) return null;
  const forced = me.mustChangePassword || params.get('trocar') === '1';
  return (
    <div className="space-y-5">
      <PageHeader title="Meu perfil" />
      {me.mustChangePassword && (
        <Alert tone="warning" title="Defina uma nova senha">A administração redefiniu sua senha. Crie uma senha pessoal para continuar usando o app.</Alert>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Card>
            <div className="flex items-center gap-4">
              <div className="brand-gradient grid size-16 place-items-center rounded-full text-2xl font-bold text-white shadow-md" aria-hidden>{me.fullName.charAt(0)}</div>
              <div>
                <p className="text-lg font-semibold">{me.fullName}</p>
                <p className="text-muted">@{me.username}</p>
                <p className="text-sm text-muted">{ROLE_LABEL[me.role]}{me.className ? ` · ${me.className}` : ''}{me.englishLevel ? ` · Inglês nível ${me.englishLevel}` : ''}</p>
              </div>
            </div>
          </Card>
          {!me.mustChangePassword && <Appearance />}
          {!me.mustChangePassword && <InstallApp />}
        </div>
        <ChangePassword me={me} autoFocus={forced} />
      </div>
    </div>
  );
}

function Appearance() {
  const { theme, setTheme: set } = useTheme();
  const opts = [
    { v: 'light', label: 'Claro', icon: Sun }, { v: 'dark', label: 'Escuro', icon: Moon }, { v: 'system', label: 'Sistema', icon: Monitor },
  ] as const;
  return (
    <Card>
      <h2 className="mb-3 font-semibold">Aparência</h2>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tema">
        {opts.map(({ v, label, icon: Icon }) => (
          <button key={v} role="radio" aria-checked={theme === v} onClick={() => set(v)}
            className={cx('flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border-2 font-medium transition-all',
              theme === v ? 'border-primary bg-primary-soft text-on-primary-soft' : 'border-line text-muted hover:border-control')}>
            <Icon className="size-5" aria-hidden />{label}
          </button>
        ))}
      </div>
    </Card>
  );
}

interface BeforeInstallPromptEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

function InstallApp() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const standalone = window.matchMedia('(display-mode: standalone)').matches;
  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setEvt(e as BeforeInstallPromptEvent); };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);
  if (standalone) return null;
  return (
    <Card>
      <h2 className="mb-2 flex items-center gap-2 font-semibold"><Smartphone className="size-5 text-primary" aria-hidden />Instalar no celular</h2>
      {evt ? (
        <>
          <p className="mb-3 text-muted">Adicione o Escola+ à tela inicial e abra como um aplicativo.</p>
          <Button icon={Download} onClick={async () => { await evt.prompt(); setEvt(null); }}>Instalar app</Button>
        </>
      ) : (
        <ol className="list-decimal space-y-1 pl-5 text-muted">
          <li>No Chrome do Android, toque no menu <strong>⋮</strong>.</li>
          <li>Escolha <strong>“Adicionar à tela inicial”</strong> ou <strong>“Instalar app”</strong>.</li>
          <li>No iPhone (Safari): <strong>Compartilhar → Adicionar à Tela de Início</strong>.</li>
        </ol>
      )}
    </Card>
  );
}

const Schema = z.object({
  currentPassword: z.string().min(1, 'Informe a senha atual'),
  newPassword: zPassword,
  confirm: z.string(),
  changeQuestion: z.boolean().optional(),
  securityQuestion: z.string().optional(),
  securityAnswer: z.string().optional(),
}).superRefine((v, ctx) => {
  if (v.newPassword !== v.confirm) ctx.addIssue({ code: 'custom', path: ['confirm'], message: 'As senhas não conferem' });
  if (v.changeQuestion && (!v.securityQuestion || (v.securityAnswer ?? '').trim().length < 2)) {
    ctx.addIssue({ code: 'custom', path: ['securityAnswer'], message: 'Escolha a pergunta e informe a resposta' });
  }
});
type Form = z.infer<typeof Schema>;

function ChangePassword({ me, autoFocus }: { me: Me; autoFocus: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [message, setMessage] = useState<string | null>(null);
  const questions = useQuery({ queryKey: ['meta', 'questions'], queryFn: () => api.get<string[]>('/auth/security-questions') });
  const { register, handleSubmit, watch, reset, setError, formState: { errors } } = useForm<Form>({ resolver: zodResolver(Schema) });
  const newPassword = watch('newPassword') ?? '';
  const changeQuestion = watch('changeQuestion');

  const save = useMutation({
    mutationFn: (f: Form) => api.post<Me>('/me/password', {
      currentPassword: f.currentPassword, newPassword: f.newPassword,
      ...(f.changeQuestion ? { securityQuestion: f.securityQuestion, securityAnswer: f.securityAnswer } : {}),
    }),
    onSuccess: (u) => {
      qc.setQueryData<Me | null>(ME_KEY, (old) => old && { ...old, ...u, mustChangePassword: false });
      toast('Senha alterada com sucesso');
      reset();
      setMessage(null);
    },
    onError: (e) => setMessage(applyApiErrors(e, setError, ['currentPassword', 'newPassword']) || null),
  });

  return (
    <Card>
      <h2 className="mb-1 flex items-center gap-2 font-semibold"><KeyRound className="size-5 text-primary" aria-hidden />Trocar senha</h2>
      <p className="mb-4 text-sm text-muted">Ao trocar, você sai automaticamente dos outros aparelhos.</p>
      <form className="space-y-4" onSubmit={handleSubmit((f) => save.mutate(f))} noValidate>
        <PasswordField label={me.mustChangePassword ? 'Senha temporária' : 'Senha atual'} autoComplete="current-password" autoFocus={autoFocus}
          error={errors.currentPassword?.message} {...register('currentPassword')} />
        <PasswordField label="Nova senha" autoComplete="new-password" meter={newPassword}
          hint={me.role === 'student' ? 'Mínimo de 8 caracteres, com letras e números.' : 'Mínimo de 10 caracteres, com letras e números.'}
          error={errors.newPassword?.message} {...register('newPassword')} />
        <PasswordField label="Confirme a nova senha" autoComplete="new-password" error={errors.confirm?.message} {...register('confirm')} />
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" className="size-5 accent-[var(--color-primary)]" {...register('changeQuestion')} />
          <span className="flex items-center gap-2"><ShieldCheck className="size-4 text-muted" aria-hidden />Trocar também a pergunta de segurança</span>
        </label>
        {changeQuestion && (
          <div className="space-y-4 animate-fade-up">
            <Select label="Pergunta" {...register('securityQuestion')}>
              <option value="">Escolha uma pergunta</option>
              {questions.data?.map((q) => <option key={q} value={q}>{q}</option>)}
            </Select>
            <Input label="Resposta" autoComplete="off" error={errors.securityAnswer?.message} {...register('securityAnswer')} />
          </div>
        )}
        {message && <Alert tone="danger">{message}</Alert>}
        <Button type="submit" loading={save.isPending} className="w-full sm:w-auto">Salvar nova senha</Button>
      </form>
    </Card>
  );
}
