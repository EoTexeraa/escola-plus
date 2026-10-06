import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import {
  Bell, BookOpen, BookOpenText, CalendarDays, ChartColumn, ClipboardList, GraduationCap, History, House, KeyRound,
  LayoutDashboard, ListChecks, LogOut, Menu, Moon, NotebookPen, School, Sun, UserRound, Users, X,
  type LucideIcon,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Me, Overview, Role } from '../api/types';
import { useLogout } from '../lib/auth';
import { firstName, ROLE_LABEL } from '../lib/format';
import { useTheme } from '../lib/theme';
import { cx, IconButton } from './ui';

interface NavItem { to: string; label: string; icon: LucideIcon; badge?: number }

/** Nome curto na barra inferior do celular (cabe inteiro em telas de 320px). */
const SHORT: Record<string, string> = {
  '/conteudos': 'Conteúdos', '/calendario': 'Agenda', '/lancar-notas': 'Lançar', '/admin/usuarios': 'Usuários', '/tarefas': 'Tarefas',
};

function navFor(role: Role, unread: number): { main: NavItem[]; mobile: string[] } {
  if (role === 'student') {
    return {
      main: [
        { to: '/inicio', label: 'Início', icon: House },
        { to: '/notas', label: 'Notas', icon: GraduationCap },
        { to: '/conteudos', label: 'Conteúdos das provas', icon: BookOpenText },
        { to: '/resumo', label: 'Resumo do bimestre', icon: ChartColumn },
        { to: '/tarefas', label: 'Tarefas de casa', icon: ClipboardList },
        { to: '/rotina', label: 'Rotina de estudos', icon: ListChecks },
        { to: '/avisos', label: 'Avisos', icon: Bell, badge: unread },
        { to: '/calendario', label: 'Calendário escolar', icon: CalendarDays },
        { to: '/perfil', label: 'Meu perfil', icon: UserRound },
      ],
      mobile: ['/inicio', '/notas', '/conteudos', '/avisos'],
    };
  }
  const teacher: NavItem[] = [
    { to: '/inicio', label: 'Início', icon: House },
    { to: '/lancar-notas', label: 'Lançar notas', icon: NotebookPen },
    { to: '/conteudos', label: 'Conteúdos das provas', icon: BookOpenText },
    { to: '/tarefas', label: 'Tarefas de casa', icon: ClipboardList },
    { to: '/avisos', label: 'Avisos', icon: Bell },
    { to: '/calendario', label: 'Calendário escolar', icon: CalendarDays },
  ];
  if (role === 'teacher') {
    return { main: [...teacher, { to: '/perfil', label: 'Meu perfil', icon: UserRound }], mobile: ['/inicio', '/lancar-notas', '/conteudos', '/calendario'] };
  }
  // Coordenação e Administrador; só o Administrador vê a Auditoria
  return {
    main: [
      { to: '/inicio', label: 'Painel', icon: LayoutDashboard },
      { to: '/admin/usuarios', label: 'Usuários', icon: Users },
      { to: '/admin/chaves', label: 'Chaves de acesso', icon: KeyRound },
      { to: '/admin/escola', label: 'Turmas e matérias', icon: School },
      ...teacher.slice(1),
      ...(role === 'admin' ? [{ to: '/admin/auditoria', label: 'Auditoria e backup', icon: History }] : []),
      { to: '/perfil', label: 'Meu perfil', icon: UserRound },
    ],
    mobile: ['/inicio', '/conteudos', '/calendario', '/avisos'],
  };
}

function NavList({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map(({ to, label, icon: Icon, badge }) => (
        <li key={to}>
          <NavLink
            to={to}
            onClick={onNavigate}
            className={({ isActive }) => cx(
              'group relative flex min-h-11 items-center gap-3 rounded-md px-3 font-medium transition-colors',
              isActive ? 'bg-primary-soft text-on-primary-soft' : 'text-muted hover:bg-primary-soft/60 hover:text-text',
            )}
          >
            {({ isActive }) => (
              <>
                <span className={cx('absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-primary transition-transform duration-300', isActive ? 'scale-y-100' : 'scale-y-0')} aria-hidden />
                <Icon className="size-5 shrink-0 transition-transform group-hover:scale-110" aria-hidden />
                <span className="flex-1">{label}</span>
                {!!badge && <span className="rounded-full bg-danger px-2 text-xs font-bold text-surface" aria-label={`${badge} não lidos`}>{badge}</span>}
              </>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="brand-gradient grid size-10 place-items-center rounded-lg text-white shadow-md"><BookOpen className="size-5" aria-hidden /></div>
      <span className="text-xl font-bold tracking-tight">Escola<span className="text-primary">+</span></span>
    </div>
  );
}

export function AppShell({ me }: { me: Me }) {
  const [drawer, setDrawer] = useState(false);
  const { isDark, toggle } = useTheme();
  const logout = useLogout();
  const navigate = useNavigate();
  const location = useLocation();

  const { data: overview } = useQuery({
    queryKey: ['student', 'overview'],
    queryFn: () => api.get<Overview>('/student/overview'),
    enabled: me.role === 'student',
  });
  const nav = navFor(me.role, overview?.unreadAnnouncements ?? 0);
  const mobileItems = nav.mobile.map((to) => nav.main.find((i) => i.to === to)!).filter(Boolean);

  useEffect(() => { setDrawer(false); window.scrollTo(0, 0); }, [location.pathname]);

  // Celular: enquanto um campo de texto está em foco (teclado aberto), esconde a barra inferior
  // para ela não cobrir o campo — no Android a barra fixa sobe junto com o teclado.
  useEffect(() => {
    const isField = (el: EventTarget | null) =>
      el instanceof HTMLElement && el.matches('input:not([type=checkbox]):not([type=radio]):not([type=color]), textarea, select');
    const onIn = (e: FocusEvent) => { if (isField(e.target)) document.documentElement.classList.add('typing'); };
    const onOut = () => document.documentElement.classList.remove('typing');
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    return () => { document.removeEventListener('focusin', onIn); document.removeEventListener('focusout', onOut); onOut(); };
  }, []);

  const doLogout = () => logout.mutate(undefined, { onSettled: () => navigate('/login', { replace: true }) });

  const profile = (
    <div className="flex items-center gap-3 rounded-lg bg-bg p-3">
      <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft font-bold text-on-primary-soft" aria-hidden>
        {firstName(me.fullName).charAt(0)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{me.fullName}</p>
        <p className="truncate text-sm text-muted">{ROLE_LABEL[me.role]}{me.className ? ` · ${me.className}` : ''}{me.englishLevel ? ` · Inglês ${me.englishLevel}` : ''}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_1fr]">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:bg-surface focus:p-2">Pular para o conteúdo</a>

      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-line bg-surface p-4 lg:flex" aria-label="Menu principal">
        <Brand />
        <nav className="flex-1 overflow-y-auto"><NavList items={nav.main} /></nav>
        {profile}
        <div className="flex gap-1">
          <IconButton label={isDark ? 'Usar tema claro' : 'Usar tema escuro'} icon={isDark ? Sun : Moon} onClick={toggle} />
          <button onClick={doLogout} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md text-muted hover:bg-danger-soft hover:text-danger">
            <LogOut className="size-5" aria-hidden /> Sair
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* Topo (celular) */}
        <header className="sticky top-0 z-40 flex items-center justify-between border-b border-line bg-surface/90 px-4 py-2 backdrop-blur lg:hidden" style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
          <Brand />
          <div className="flex">
            <IconButton label={isDark ? 'Usar tema claro' : 'Usar tema escuro'} icon={isDark ? Sun : Moon} onClick={toggle} />
            <IconButton label="Abrir menu" icon={Menu} onClick={() => setDrawer(true)} aria-expanded={drawer} />
          </div>
        </header>

        <main id="conteudo" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
          <Outlet />
        </main>
      </div>

      {/* Barra inferior (celular) */}
      <nav className="bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur lg:hidden" aria-label="Navegação rápida"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <ul className="grid grid-cols-5">
          {mobileItems.map(({ to, label, icon: Icon, badge }) => (
            <li key={to}>
              <NavLink to={to} className={({ isActive }) => cx('relative flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors', isActive ? 'text-primary' : 'text-muted')}>
                {({ isActive }) => (
                  <>
                    <span className={cx('grid h-8 w-14 place-items-center rounded-full transition-all duration-300', isActive && 'bg-primary-soft text-on-primary-soft')}>
                      <Icon className={cx('size-5 transition-transform duration-300', isActive && 'scale-110')} aria-hidden />
                    </span>
                    <span className="max-w-full truncate px-0.5 tracking-tight">{SHORT[to] ?? label.split(' ')[0]}</span>
                    {!!badge && <span className="absolute right-[22%] top-1.5 size-2.5 rounded-full bg-danger" aria-label={`${badge} não lidos`} />}
                  </>
                )}
              </NavLink>
            </li>
          ))}
          <li>
            <button onClick={() => setDrawer(true)} className="flex min-h-16 w-full flex-col items-center justify-center gap-0.5 text-xs font-medium text-muted">
              <span className="grid h-8 w-14 place-items-center"><Menu className="size-5" aria-hidden /></span>Mais
            </button>
          </li>
        </ul>
      </nav>

      {/* Gaveta (celular) */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col gap-5 bg-surface p-4 shadow-lg animate-slide-in"
            style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
            <div className="flex items-center justify-between"><Brand /><IconButton label="Fechar menu" icon={X} onClick={() => setDrawer(false)} /></div>
            {profile}
            <nav className="flex-1 overflow-y-auto"><NavList items={nav.main} onNavigate={() => setDrawer(false)} /></nav>
            <button onClick={doLogout} className="flex min-h-11 items-center gap-3 rounded-md px-3 font-medium text-danger hover:bg-danger-soft">
              <LogOut className="size-5" aria-hidden /> Sair
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

