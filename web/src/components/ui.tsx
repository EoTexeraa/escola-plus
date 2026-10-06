import {
  createContext, forwardRef, useCallback, useContext, useEffect, useId, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert, X, type LucideIcon } from 'lucide-react';
import { formatGrade, type Tone } from '../lib/format';

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

// ---------------- Botões (alvo de toque ≥ 44px) ----------------
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover shadow-sm',
  secondary: 'bg-surface text-text border border-control/40 hover:bg-primary-soft hover:text-on-primary-soft',
  ghost: 'text-text hover:bg-primary-soft hover:text-on-primary-soft',
  danger: 'bg-danger-soft text-danger hover:brightness-95',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: LucideIcon;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon: Icon, className, children, disabled, ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-[transform,background-color,filter] duration-150',
        'active:scale-[0.97] disabled:opacity-60 disabled:pointer-events-none select-none',
        size === 'sm' && 'min-h-11 px-3 text-sm', size === 'md' && 'min-h-11 px-4', size === 'lg' && 'min-h-12 px-5 text-lg',
        VARIANT[variant], className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : Icon ? <Icon className="size-5" aria-hidden /> : null}
      {children}
    </button>
  );
});

export function IconButton({ label, icon: Icon, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: LucideIcon }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cx('inline-flex size-11 items-center justify-center rounded-md text-muted hover:bg-primary-soft hover:text-on-primary-soft transition-colors active:scale-95', className)}
      {...rest}
    >
      <Icon className="size-5" aria-hidden />
    </button>
  );
}

// ---------------- Campos de formulário ----------------
interface FieldShellProps { label: string; error?: string; hint?: string; children: (id: string, describedBy?: string) => ReactNode }

function FieldShell({ label, error, hint, children }: FieldShellProps) {
  const id = useId();
  const descId = error || hint ? `${id}-desc` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      {children(id, descId)}
      {error ? (
        <p id={descId} role="alert" className="flex items-center gap-1 text-sm text-danger animate-fade-in">
          <CircleAlert className="size-4 shrink-0" aria-hidden /> {error}
        </p>
      ) : hint ? <p id={descId} className="text-sm text-muted">{hint}</p> : null}
    </div>
  );
}

const controlClass = (error?: string) => cx(
  'w-full min-h-11 rounded-md border bg-surface px-3 text-base text-text placeholder:text-muted',
  'transition-shadow focus:outline-none focus:ring-2 focus:ring-focus',
  error ? 'border-danger' : 'border-control',
);

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string; trailing?: ReactNode };
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, error, hint, trailing, className, ...rest }, ref) {
  return (
    <FieldShell label={label} error={error} hint={hint}>
      {(id, desc) => (
        <div className="relative">
          <input ref={ref} id={id} aria-invalid={!!error || undefined} aria-describedby={desc}
            className={cx(controlClass(error), trailing ? 'pr-12' : '', className)} {...rest} />
          {trailing && <div className="absolute inset-y-0 right-0 flex items-center">{trailing}</div>}
        </div>
      )}
    </FieldShell>
  );
});

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string; hint?: string };
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ label, error, hint, className, children, ...rest }, ref) {
  return (
    <FieldShell label={label} error={error} hint={hint}>
      {(id, desc) => (
        <select ref={ref} id={id} aria-invalid={!!error || undefined} aria-describedby={desc}
          className={cx(controlClass(error), 'appearance-auto', className)} {...rest}>
          {children}
        </select>
      )}
    </FieldShell>
  );
});

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; hint?: string };
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ label, error, hint, className, ...rest }, ref) {
  return (
    <FieldShell label={label} error={error} hint={hint}>
      {(id, desc) => (
        <textarea ref={ref} id={id} aria-invalid={!!error || undefined} aria-describedby={desc}
          className={cx(controlClass(error), 'py-2 min-h-28', className)} {...rest} />
      )}
    </FieldShell>
  );
});

// ---------------- Superfícies ----------------
export function Card({ className, children, style }: { className?: string; children: ReactNode; style?: React.CSSProperties }) {
  return <section className={cx('card p-4 sm:p-5', className)} style={style}>{children}</section>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3 animate-fade-up">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex w-full flex-wrap gap-2 sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none">{actions}</div>}
    </header>
  );
}

const TONE: Record<Tone, string> = {
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  primary: 'bg-primary-soft text-on-primary-soft',
  neutral: 'bg-line text-muted',
};
const TONE_ICON: Partial<Record<Tone, LucideIcon>> = { success: CircleCheck, warning: TriangleAlert, danger: CircleAlert };

/** Selo com cor + ícone (a cor nunca é o único indicador — daltonismo). */
export function Badge({ tone = 'neutral', children, icon = true, className }: { tone?: Tone; children: ReactNode; icon?: boolean; className?: string }) {
  const Icon = icon ? TONE_ICON[tone] : undefined;
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', TONE[tone], className)}>
      {Icon && <Icon className="size-3.5" aria-hidden />}{children}
    </span>
  );
}

export const TONE_TEXT: Record<Tone, string> = {
  success: 'text-success', warning: 'text-warning', danger: 'text-danger', primary: 'text-primary', neutral: 'text-text',
};

export function GradeValue({ value, tone = 'neutral', className }: { value: number | null | undefined; tone?: Tone; className?: string }) {
  return <span className={cx('tabular-nums font-semibold', TONE_TEXT[tone], className)}>{formatGrade(value)}</span>;
}

/** Anel de progresso (anima com stroke-dashoffset — só compositor). */
export function ProgressRing({ value, max, size = 120, stroke = 10, tone = 'primary', children, label, track = 'var(--color-line)', fixedLight = false }: {
  value: number; max: number; size?: number; stroke?: number; tone?: Tone; children?: ReactNode; label: string; track?: string; fixedLight?: boolean;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const [pct, setPct] = useState(0);
  useEffect(() => { const t = requestAnimationFrame(() => setPct(Math.max(0, Math.min(1, value / max)))); return () => cancelAnimationFrame(t); }, [value, max]);
  // fixedLight: anel desenhado sobre fundo branco fixo (cores do tema claro nos dois temas)
  const color = fixedLight
    ? { success: '#047857', warning: '#B45309', danger: '#B91C1C', primary: '#1D4ED8', neutral: '#475569' }[tone]
    : { success: 'var(--color-success)', warning: 'var(--color-warning)', danger: 'var(--color-danger)', primary: 'var(--color-primary)', neutral: 'var(--color-muted)' }[tone];
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: 'stroke-dashoffset 900ms var(--ease-out)' }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} aria-hidden />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Carregando">
      <Skeleton className="h-9 w-56" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-32" />)}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center animate-fade-in">
      <div className="grid size-16 place-items-center rounded-full bg-primary-soft text-on-primary-soft"><Icon className="size-8" aria-hidden /></div>
      <h2 className="text-lg font-semibold">{title}</h2>
      {text && <p className="max-w-sm text-muted">{text}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : 'Não foi possível carregar.';
  return (
    <div role="alert" className="card flex flex-col items-center gap-3 p-8 text-center">
      <CircleAlert className="size-10 text-danger" aria-hidden />
      <p>{msg}</p>
      {onRetry && <Button variant="secondary" onClick={onRetry}>Tentar de novo</Button>}
    </div>
  );
}

export function Alert({ tone = 'primary', title, children }: { tone?: Tone; title?: string; children: ReactNode }) {
  const Icon = TONE_ICON[tone] ?? Info;
  return (
    <div role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'} className={cx('flex gap-3 rounded-md p-3 animate-fade-in', TONE[tone])}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="text-sm">{title && <p className="font-semibold">{title}</p>}{children}</div>
    </div>
  );
}

// ---------------- Modal (dialog nativo: foco preso e Esc de graça) ----------------
export function Modal({ open, onClose, title, children, footer }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      // Celular: "folha" que sobe de baixo, largura total, botões ao alcance do polegar.
      // Telas maiores: janela centralizada.
      className={cx(
        'bg-surface p-0 text-text shadow-lg backdrop:bg-black/50 open:flex open:flex-col',
        'mx-0 mb-0 mt-auto w-full max-w-none max-h-[92dvh] rounded-t-2xl open:animate-sheet-up',
        'sm:m-auto sm:w-[min(100vw-2rem,32rem)] sm:max-h-[90dvh] sm:rounded-xl sm:open:animate-scale-in',
      )}
      aria-labelledby="modal-title"
    >
      <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-line sm:hidden" aria-hidden />
      <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-2 sm:px-5 sm:py-3">
        <h2 id="modal-title" className="text-lg font-semibold">{title}</h2>
        <IconButton label="Fechar" icon={X} onClick={onClose} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">{children}</div>
      {footer && (
        <div className="flex shrink-0 gap-2 border-t border-line px-4 pt-3 sm:justify-end sm:px-5 sm:pb-3 [&>*]:flex-1 sm:[&>*]:flex-none"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          {footer}
        </div>
      )}
    </dialog>
  );
}

// ---------------- Toasts ----------------
interface Toast { id: number; tone: Tone; text: string }
const ToastCtx = createContext<(text: string, tone?: Tone) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Tone = 'success') => {
    const id = Date.now() + Math.random();
    setItems((t) => [...t, { id, tone, text }]);
    setTimeout(() => setItems((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-[70] flex flex-col items-center gap-2 px-4 lg:bottom-6">
        {items.map((t) => {
          const Icon = TONE_ICON[t.tone] ?? Info;
          return (
            <div key={t.id} className={cx('pointer-events-auto flex items-center gap-2 rounded-lg px-4 py-3 shadow-lg animate-fade-up font-medium', TONE[t.tone])}>
              <Icon className="size-5" aria-hidden />{t.text}
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

/** Número que "conta" até o valor (respeita reduced-motion via duração do CSS). */
export function CountUp({ value, format = (n: number) => String(Math.round(n)) }: { value: number; format?: (n: number) => string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setN(value); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 700);
      setN(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(n)}</>;
}
