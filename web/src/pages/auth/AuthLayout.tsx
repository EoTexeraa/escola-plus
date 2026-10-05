import type { ReactNode } from 'react';
import { BookOpen, CalendarDays, GraduationCap, ListChecks } from 'lucide-react';

const FEATURES = [
  { icon: GraduationCap, text: 'Notas e médias de cada bimestre' },
  { icon: ListChecks, text: 'Tarefas e rotina de estudos' },
  { icon: CalendarDays, text: 'Calendário de provas e eventos' },
];

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Painel da marca */}
      <aside className="brand-gradient relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-white/10 animate-[float_12s_ease-in-out_infinite]" aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 -left-16 size-[28rem] rounded-full bg-white/5 animate-[float_16s_ease-in-out_infinite_reverse]" aria-hidden />
        <div className="relative flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-xl bg-white/15 backdrop-blur"><BookOpen className="size-6" aria-hidden /></div>
          <span className="text-2xl font-bold">Escola+</span>
        </div>
        <div className="relative space-y-6">
          <h2 className="text-4xl font-bold leading-tight">Sua vida escolar,<br />organizada num só lugar.</h2>
          <ul className="space-y-3 stagger">
            {FEATURES.map(({ icon: Icon, text }, i) => (
              <li key={text} className="flex items-center gap-3 text-lg" style={{ ['--i' as string]: i + 2 }}>
                <span className="grid size-10 place-items-center rounded-lg bg-white/15"><Icon className="size-5" aria-hidden /></span>{text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm opacity-90">Instale o app na tela inicial do celular para acesso rápido.</p>
      </aside>

      {/* Formulário */}
      <main className="flex flex-col justify-center px-4 py-8 sm:px-8" style={{ paddingTop: 'max(2rem, env(safe-area-inset-top))' }}>
        <div className="mx-auto w-full max-w-md animate-fade-up">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="brand-gradient grid size-11 place-items-center rounded-lg text-white shadow-md"><BookOpen className="size-6" aria-hidden /></div>
            <span className="text-2xl font-bold">Escola<span className="text-primary">+</span></span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-2 text-muted">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
