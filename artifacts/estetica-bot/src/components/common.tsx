import { AlertCircle, Check, ChevronDown, Loader2, Plus, RefreshCw, X } from 'lucide-react';
import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react';

export function Button({ className = '', variant = 'primary', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  const styles = { primary: 'bg-primary text-primary-foreground hover:opacity-90 shadow-sm', secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/75', ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground', danger: 'bg-destructive/10 text-destructive hover:bg-destructive/15' };
  return <button className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-[13px] font-semibold transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 ${styles[variant]} ${className}`} {...props} />;
}

export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[.2em] text-primary">{eyebrow}</p>
      <h1 className="serif text-[34px] leading-[1.08] tracking-[-.03em] text-foreground md:text-[42px]">{title}</h1>
      {description && <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">{description}</p>}
    </div>
    {action}
  </div>;
}

export function Metric({ label, value, hint, tone = 'sage' }: { label: string; value: string | number; hint: string; tone?: 'sage' | 'gold' | 'peach' | 'blue' }) {
  const backgrounds = { sage: 'bg-primary/8', gold: 'bg-accent/25', peach: 'bg-[hsl(12_54%_66%/0.14)]', blue: 'bg-[hsl(193_34%_46%/0.12)]' };
  return <div className={`surface rounded-2xl p-5 ${backgrounds[tone]}`}>
    <p className="text-[11px] font-semibold uppercase tracking-[.13em] text-muted-foreground">{label}</p>
    <p className="mt-3 text-3xl font-semibold tracking-[-.04em] text-foreground">{value}</p>
    <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
  </div>;
}

export function StatusPill({ status, children }: { status: string; children?: ReactNode }) {
  const styles: Record<string, string> = { confirmed: 'bg-primary/10 text-primary', pending: 'bg-accent/30 text-[hsl(32_44%_30%)]', cancelled: 'bg-destructive/10 text-destructive', completed: 'bg-muted text-muted-foreground', active: 'bg-primary/10 text-primary', inactive: 'bg-muted text-muted-foreground' };
  const labels: Record<string, string> = { confirmed: 'Confirmada', pending: 'Pendiente', cancelled: 'Cancelada', completed: 'Completada', active: 'Activo', inactive: 'Inactivo' };
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.08em] ${styles[status] ?? styles.inactive}`}><span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />{children ?? labels[status] ?? status}</span>;
}

export function LoadingRows({ count = 4 }: { count?: number }) {
  return <div className="space-y-3" aria-label="Cargando">
    {Array.from({ length: count }).map((_, i) => <div key={i} className="h-[65px] animate-pulse rounded-xl bg-muted/70" data-testid={`skeleton-row-${i}`} />)}
  </div>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
    <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-primary"><Check size={20} /></span>
    <h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">{description}</p>{action && <div className="mt-5">{action}</div>}
  </div>;
}

export function ErrorState({ onRetry, message = 'No pudimos cargar esta información.' }: { onRetry: () => void; message?: string }) {
  return <div className="flex min-h-[180px] flex-col items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/5 p-7 text-center">
    <AlertCircle size={20} className="mb-3 text-destructive" /><p className="text-sm font-semibold">Algo no salió como esperábamos</p><p className="mt-1 text-xs text-muted-foreground">{message}</p><Button className="mt-4 h-9" variant="secondary" onClick={onRetry} data-testid="button-retry"><RefreshCw size={14} />Intentar de nuevo</Button>
  </div>;
}

export function Modal({ title, description, onClose, children, wide = false }: { title: string; description?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true">
    <div className={`max-h-[92vh] w-full overflow-y-auto rounded-t-[24px] bg-card p-6 shadow-2xl sm:rounded-[24px] ${wide ? 'max-w-2xl' : 'max-w-lg'}`}>
      <div className="mb-6 flex items-start justify-between gap-4"><div><h2 className="serif text-2xl tracking-[-.02em]">{title}</h2>{description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}</div><button onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Cerrar" data-testid="button-close-dialog"><X size={17} /></button></div>
      {children}
    </div>
  </div>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="block space-y-1.5"><span className="text-[11px] font-bold uppercase tracking-[.1em] text-muted-foreground">{label}</span>{children}{hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}</label>;
}

export const inputClass = 'h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/10';
export const textareaClass = 'min-h-[92px] w-full resize-y rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/10';

export function SelectChevron() { return <ChevronDown size={15} className="pointer-events-none absolute right-3 top-3 text-muted-foreground" />; }

export function SavingButton({ pending, children = 'Guardar cambios' }: { pending: boolean; children?: ReactNode }) {
  return <Button type="submit" disabled={pending} data-testid="button-submit-form">{pending && <Loader2 size={15} className="animate-spin" />}{children}</Button>;
}