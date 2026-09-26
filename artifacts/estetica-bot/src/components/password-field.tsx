import { useId, useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { inputClass } from '@/components/common';

type PasswordFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'id'> & {
  label: string;
  hint?: string;
};

export function PasswordField({ label, hint, className = '', ...props }: PasswordFieldProps) {
  const id = useId();
  const [visible, setVisible] = useState(false);

  return <div className="space-y-1.5">
    <label htmlFor={id} className="block text-[11px] font-bold uppercase tracking-[.1em] text-muted-foreground">{label}</label>
    <div className="relative">
      <input {...props} id={id} type={visible ? 'text' : 'password'} className={`${inputClass} pr-12 ${className}`} />
      <button
        type="button"
        aria-label={visible ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`}
        aria-controls={id}
        aria-pressed={visible}
        title={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        onClick={() => setVisible((value) => !value)}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-primary"
      >
        {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      </button>
    </div>
    {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
  </div>;
}