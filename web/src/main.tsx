import { lazy, StrictMode, Suspense, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation } from 'react-router';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from './api/client';
import type { Role } from './api/types';
import { AppShell } from './components/AppShell';
import { ErrorState, PageSkeleton, ToastProvider } from './components/ui';
import { ME_KEY, useMe } from './lib/auth';
import LoginPage from './pages/auth/LoginPage';
import '@fontsource-variable/inter/wght.css'; // font-display: swap, só o subconjunto usado (latin)
import './styles/index.css';

// Code-splitting por rota (anti-padrão "no-code-splitting" da skill senior-frontend)
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'));
const RecoveryPage = lazy(() => import('./pages/auth/RecoveryPage'));
// A página inicial é a mais acessada: começa a baixar já, em paralelo com a checagem de sessão (LCP)
const loadHome = () => import('./pages/shared/HomePage');
if (location.pathname !== '/login' && location.pathname !== '/cadastro') void loadHome();
const Home = lazy(loadHome);
const Grades = lazy(() => import('./pages/student/GradesPage'));
const Summary = lazy(() => import('./pages/student/SummaryPage'));
const Routine = lazy(() => import('./pages/student/RoutinePage'));
const Homework = lazy(() => import('./pages/shared/HomeworkPage'));
const Announcements = lazy(() => import('./pages/shared/AnnouncementsPage'));
const Calendar = lazy(() => import('./pages/shared/CalendarPage'));
const Profile = lazy(() => import('./pages/shared/ProfilePage'));
const GradeEntry = lazy(() => import('./pages/teacher/GradeEntryPage'));
const Users = lazy(() => import('./pages/admin/UsersPage'));
const Keys = lazy(() => import('./pages/admin/KeysPage'));
const School = lazy(() => import('./pages/admin/SchoolPage'));
const Audit = lazy(() => import('./pages/admin/AuditPage'));
const Contents = lazy(() => import('./pages/shared/ContentsPage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: (count, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && count < 2,
    },
  },
  mutationCache: new MutationCache({
    // Sessão expirou no meio do uso → volta ao login
    onError: (e) => { if (e instanceof ApiError && e.status === 401) queryClient.setQueryData(ME_KEY, null); },
  }),
});

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageSkeleton />}>{children}</Suspense>;
}

/** Área logada: exige sessão; senha temporária força ir ao perfil. */
function Protected() {
  const { data: me, isLoading, error, refetch } = useMe();
  const location = useLocation();
  if (isLoading) return <div className="p-6"><PageSkeleton /></div>;
  if (error) return <div className="p-6"><ErrorState error={error} onRetry={() => refetch()} /></div>;
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (me.mustChangePassword && location.pathname !== '/perfil') return <Navigate to="/perfil?trocar=1" replace />;
  return <AppShell me={me} />;
}

function Guest() {
  const { data: me, isLoading } = useMe();
  if (isLoading) return null;
  if (me) return <Navigate to="/inicio" replace />;
  return <Lazy><Outlet /></Lazy>;
}

function RoleGate({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { data: me } = useMe();
  if (!me || !roles.includes(me.role)) return <Navigate to="/inicio" replace />;
  return <Lazy>{children}</Lazy>;
}

const MANAGERS: Role[] = ['coordinator', 'admin'];
const STAFF: Role[] = ['teacher', ...MANAGERS];

const router = createBrowserRouter([
  {
    element: <Guest />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/cadastro', element: <RegisterPage /> },
      { path: '/recuperar-senha', element: <RecoveryPage /> },
    ],
  },
  {
    element: <Protected />,
    children: [
      { index: true, element: <Navigate to="/inicio" replace /> },
      { path: '/inicio', element: <Lazy><Home /></Lazy> },
      { path: '/notas', element: <RoleGate roles={['student']}><Grades /></RoleGate> },
      { path: '/resumo', element: <RoleGate roles={['student']}><Summary /></RoleGate> },
      { path: '/rotina', element: <RoleGate roles={['student']}><Routine /></RoleGate> },
      { path: '/tarefas', element: <Lazy><Homework /></Lazy> },
      { path: '/avisos', element: <Lazy><Announcements /></Lazy> },
      { path: '/calendario', element: <Lazy><Calendar /></Lazy> },
      { path: '/perfil', element: <Lazy><Profile /></Lazy> },
      { path: '/lancar-notas', element: <RoleGate roles={STAFF}><GradeEntry /></RoleGate> },
      { path: '/conteudos', element: <Lazy><Contents /></Lazy> },
      { path: '/admin/usuarios', element: <RoleGate roles={MANAGERS}><Users /></RoleGate> },
      { path: '/admin/chaves', element: <RoleGate roles={MANAGERS}><Keys /></RoleGate> },
      { path: '/admin/escola', element: <RoleGate roles={MANAGERS}><School /></RoleGate> },
      { path: '/admin/auditoria', element: <RoleGate roles={['admin']}><Audit /></RoleGate> },
    ],
  },
  { path: '*', element: <Navigate to="/inicio" replace /> },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);

// PWA: service worker só em produção (instalável na tela inicial)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
