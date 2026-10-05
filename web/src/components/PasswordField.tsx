import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { passwordStrength } from '../lib/passwordStrength';
import { cx, Input } from './ui';

type Props = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string; meter?: string };

export const PasswordField = forwardRef<HTMLInputElement, Props>(function PasswordField({ meter, ...props }, ref) {
  const [show, setShow] = useState(false);
  const strength = meter !== undefined ? passwordStrength(meter) : null;
  const colors = ['bg-danger', 'bg-danger', 'bg-warning', 'bg-success', 'bg-success'];
  return (
    <div>
      <Input
        ref={ref}
        type={show ? 'text' : 'password'}
        {...props}
        trailing={
          <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
            aria-pressed={show} className="grid size-11 place-items-center text-muted hover:text-text">
            {show ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
          </button>
        }
      />
      {strength && meter && (
        <div className="mt-2" aria-live="polite">
          <div className="flex gap-1" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={cx('h-1.5 flex-1 rounded-full transition-colors duration-300', i < strength.score ? colors[strength.score] : 'bg-line')} />
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">Força da senha: <strong>{strength.label}</strong></p>
        </div>
      )}
    </div>
  );
});
