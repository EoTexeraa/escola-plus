import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Crown, GraduationCap, Languages, Presentation, ShieldCheck, UserPlus, type LucideIcon } from 'lucide-react';
import { z } from 'zod';
import { api } from '../../api/client';
import type { Me, Role, SchoolClass } from '../../api/types';
import { ME_KEY } from '../../lib/auth';
import { PasswordField } from '../../components/PasswordField';
import { Alert, Button, cx, Input, Select } from '../../components/ui';
import { AuthLayout } from './AuthLayout';
import { applyApiErrors, zPassword } from './forms';

const ROLES: Array<{ role: Role; label: string; icon: LucideIcon; hint: string }> = [
  { role: 'student', label: 'Aluno', icon: GraduationCap, hint: 'Veja e lance suas notas, conteúdos das provas, tarefas e avisos.' },
  { role: 'teacher', label: 'Professor', icon: Presentation, hint: 'Precisa da chave de acesso fornecida pela coordenação.' },
  { role: 'coordinator', label: 'Coordenação', icon: ShieldCheck, hint: 'Precisa da chave de acesso de coordenação.' },
  { role: 'admin', label: 'Administrador', icon: Crown, hint: 'Opção única: a conta com acesso total ao sistema.' },
];
const LEVELS = [2, 3, 4] as const;

const Schema = z.object({
  role: z.enum(['student', 'teacher', 'coordinator', 'admin']),
  fullName: z.string().trim().min(3, 'Informe seu nome completo').max(100),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._]{3,30}$/, 'De 3 a 30 caracteres: letras, números, ponto ou _'),
  password: zPassword,
  confirm: z.string(),
  // nullish: campos de outro perfil ficam registrados com null depois de trocar de perfil (ex.: o rádio
  // "Nível de inglês" do aluno ao escolher Administrador) e não podem travar o envio
  classId: z.string().nullish(),
  englishLevel: z.string().nullish(),
  accessKey: z.string().trim().nullish(),
  securityQuestion: z.string().min(10, 'Escolha uma pergunta'),
  securityAnswer: z.string().trim().min(2, 'Resposta muito curta').max(60),
}).superRefine((v, ctx) => {
  if (v.password !== v.confirm) ctx.addIssue({ code: 'custom', path: ['confirm'], message: 'As senhas não conferem' });
  if (v.role === 'student' && !v.classId) ctx.addIssue({ code: 'custom', path: ['classId'], message: 'Escolha sua turma' });
  if (v.role === 'student' && !v.englishLevel) ctx.addIssue({ code: 'custom', path: ['englishLevel'], message: 'Escolha seu nível de inglês' });
  if ((v.role === 'teacher' || v.role === 'coordinator') && !v.accessKey) {
    ctx.addIssue({ code: 'custom', path: ['accessKey'], message: 'Informe a chave de acesso' });
  }
  if (v.role !== 'student' && v.password.length < 10) {
    ctx.addIssue({ code: 'custom', path: ['password'], message: 'Equipe e administrador: mínimo de 10 caracteres' });
  }
});
type Form = z.infer<typeof Schema>;

export default function RegisterPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [message, setMessage] = useState<string | null>(null);
  const classes = useQuery({ queryKey: ['meta', 'classes'], queryFn: () => api.get<SchoolClass[]>('/meta/classes') });
  const questions = useQuery({ queryKey: ['meta', 'questions'], queryFn: () => api.get<string[]>('/auth/security-questions') });
  // A opção "Administrador" só aparece enquanto ele ainda não existe
  const setup = useQuery({ queryKey: ['meta', 'setup'], queryFn: () => api.get<{ adminAvailable: boolean }>('/meta/setup') });
  const roles = ROLES.filter((r) => r.role !== 'admin' || setup.data?.adminAvailable);

  const { register, handleSubmit, watch, setValue, setError, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(Schema),
    defaultValues: { role: 'student', securityQuestion: '' },
  });
  const role = watch('role');
  const password = watch('password') ?? '';
  const englishLevel = watch('englishLevel');
  const singleClass = classes.data?.length === 1 ? classes.data[0] : null;

  // Só existe o 9º ano: com uma única turma, ela já vem escolhida
  useEffect(() => { if (singleClass) setValue('classId', String(singleClass.id)); }, [singleClass, setValue]);
  // Se o Administrador foi criado enquanto a tela estava aberta, volta para "Aluno"
  useEffect(() => { if (role === 'admin' && setup.data && !setup.data.adminAvailable) setValue('role', 'student'); }, [role, setup.data, setValue]);

  const submit = useMutation({
    mutationFn: (f: Form) => api.post<Me>('/auth/register', {
      role: f.role, fullName: f.fullName, username: f.username, password: f.password,
      classId: f.role === 'student' ? Number(f.classId) : undefined,
      englishLevel: f.role === 'student' ? Number(f.englishLevel) : undefined,
      accessKey: f.role === 'teacher' || f.role === 'coordinator' ? f.accessKey : undefined,
      securityQuestion: f.securityQuestion, securityAnswer: f.securityAnswer,
    }),
    onSuccess: (me) => {
      qc.setQueryData(ME_KEY, me);
      qc.invalidateQueries({ queryKey: ['meta', 'setup'] });
      navigate('/inicio', { replace: true });
    },
    onError: (e) => {
      setMessage(applyApiErrors(e, setError, ['username', 'password', 'classId', 'englishLevel', 'accessKey', 'fullName', 'securityAnswer']) || null);
      qc.invalidateQueries({ queryKey: ['meta', 'setup'] });
    },
  });

  const choice = (selected: boolean) => cx(
    'flex cursor-pointer items-center justify-center rounded-lg border-2 text-center font-semibold transition-all',
    'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus',
    selected ? 'border-primary bg-primary-soft text-on-primary-soft' : 'border-line text-muted hover:border-control',
  );

  return (
    <AuthLayout title="Criar conta" subtitle="Leva menos de um minuto.">
      <form
        onSubmit={handleSubmit(
          (f) => { setMessage(null); submit.mutate(f); },
          // Nunca falhar em silêncio: se o erro for num campo que não está visível, avisa aqui
          () => setMessage('Confira os campos destacados em vermelho.'),
        )}
        className="space-y-5" noValidate>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Eu sou</legend>
          <div className={cx('grid gap-2', roles.length === 4 ? 'grid-cols-2' : 'grid-cols-3')} role="radiogroup">
            {roles.map(({ role: r, label, icon: Icon }) => (
              <label key={r} className={cx(choice(role === r), 'min-h-20 min-w-0 flex-col gap-1 p-2 text-sm', role === r && 'scale-[1.02]')}>
                <input type="radio" value={r} className="sr-only" {...register('role')} onChange={() => setValue('role', r, { shouldValidate: false })} checked={role === r} />
                <Icon className="size-6" aria-hidden />{label}
              </label>
            ))}
          </div>
          <p className="mt-2 text-sm text-muted">{ROLES.find((r) => r.role === role)?.hint}</p>
          {role === 'admin' && (
            <div className="mt-3">
              <Alert tone="warning" title="Somente para o dono do sistema">
                O Administrador vê tudo, inclusive auditoria e backup. Só existe um, e esta opção desaparece assim que a conta for criada.
              </Alert>
            </div>
          )}
        </fieldset>

        {(role === 'teacher' || role === 'coordinator') && (
          <div className="animate-fade-up">
            <Input label="Chave de acesso" placeholder={role === 'coordinator' ? 'COORD-XXXX-XXXX-…' : 'PROF-XXXX-XXXX-…'}
              autoCapitalize="characters" autoComplete="off" spellCheck={false}
              hint="Fornecida pela coordenação. Cada chave só pode ser usada uma vez."
              error={errors.accessKey?.message} {...register('accessKey')} />
          </div>
        )}

        <Input label="Nome completo" autoComplete="name" error={errors.fullName?.message} {...register('fullName')} />
        <Input label="Nome de usuário" autoComplete="username" autoCapitalize="none" spellCheck={false}
          hint="Você vai usar para entrar. Ex.: lucas.oliveira" error={errors.username?.message} {...register('username')} />

        {role === 'student' && (
          <section className="space-y-4 rounded-lg border border-line bg-bg p-4" aria-labelledby="sec-turma">
            <div>
              <h2 id="sec-turma" className="font-semibold">Sua turma</h2>
              <p className="text-sm text-muted">É só escolher, não precisa de senha.</p>
            </div>
            {singleClass ? (
              <p className="rounded-lg bg-primary-soft px-4 py-3 text-on-primary-soft">
                Turma: <strong>{singleClass.name}</strong> · {singleClass.schoolYear}
              </p>
            ) : (
              <Select label="Turma" error={errors.classId?.message} {...register('classId')} disabled={classes.isLoading}>
                <option value="">{classes.isLoading ? 'Carregando…' : 'Escolha sua turma'}</option>
                {classes.data?.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.schoolYear}</option>)}
              </Select>
            )}

            <fieldset className="animate-fade-up">
              <legend className="mb-2 flex items-center gap-2 text-sm font-medium">
                <Languages className="size-4 text-muted" aria-hidden />Nível de inglês
              </legend>
              <div className="grid grid-cols-3 gap-2" role="radiogroup">
                {LEVELS.map((lv) => (
                  <label key={lv} className={cx(choice(englishLevel === String(lv)), 'min-h-12')}>
                    <input type="radio" value={lv} className="sr-only" {...register('englishLevel')} />Nível {lv}
                  </label>
                ))}
              </div>
              {errors.englishLevel
                ? <p role="alert" className="mt-1.5 text-sm text-danger">{errors.englishLevel.message}</p>
                : <p className="mt-1.5 text-sm text-muted">Você verá só as aulas, provas e conteúdos de Inglês do seu nível.</p>}
            </fieldset>
          </section>
        )}

        <section className="space-y-4 rounded-lg border border-line bg-bg p-4" aria-labelledby="sec-senha">
          <div>
            <h2 id="sec-senha" className="font-semibold">Senha para entrar no app</h2>
            <p className="text-sm text-muted">Você vai usar com o nome de usuário toda vez que entrar.</p>
          </div>
          <PasswordField label="Senha" autoComplete="new-password" meter={password}
            hint={role === 'student' ? 'Mínimo de 8 caracteres, com letras e números.' : 'Mínimo de 10 caracteres, com letras e números.'}
            error={errors.password?.message} {...register('password')} />
          <PasswordField label="Confirme a senha" autoComplete="new-password" error={errors.confirm?.message} {...register('confirm')} />
        </section>

        <div className="space-y-4 rounded-lg border border-line bg-bg p-4">
          <div>
            <h2 className="font-semibold">Pergunta de segurança</h2>
            <p className="text-sm text-muted">Usada para trocar a senha se você esquecê-la. Escolha algo que só você saiba.</p>
          </div>
          <Select label="Pergunta" error={errors.securityQuestion?.message} {...register('securityQuestion')}>
            <option value="">Escolha uma pergunta</option>
            {questions.data?.map((q) => <option key={q} value={q}>{q}</option>)}
          </Select>
          <Input label="Resposta" autoComplete="off" hint="Acentos e letras maiúsculas não fazem diferença."
            error={errors.securityAnswer?.message} {...register('securityAnswer')} />
        </div>

        {message && <Alert tone="danger">{message}</Alert>}
        <Button type="submit" size="lg" className="w-full" loading={submit.isPending} icon={UserPlus}>Criar conta</Button>
      </form>
      <p className="mt-8 text-center text-muted">
        Já tem conta? <Link to="/login" className="font-semibold text-primary underline-offset-4 hover:underline">Entrar</Link>
      </p>
    </AuthLayout>
  );
}
