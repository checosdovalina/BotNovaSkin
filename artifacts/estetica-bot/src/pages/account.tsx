import { useState, type FormEvent } from 'react';
import { useLocation } from 'wouter';
import { KeyRound, LogOut, ShieldCheck } from 'lucide-react';
import { AppShell } from '@/components/shell';
import { Button, Field, PageHeader, inputClass } from '@/components/common';
import { useLocalAuth } from '@/components/auth-provider';
import { authApi } from '@/lib/local-auth';

export default function Account() {
  const { user, logout, endSession, refresh } = useLocalAuth();
  const [, navigate] = useLocation();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (next !== confirm) { setError('Las contraseñas nuevas no coinciden.'); return; }
    setPending(true);
    try {
      await authApi.password(current, next);
      setCurrent(''); setNext(''); setConfirm('');
      // The server revokes every session after a password change. Drop all
      // protected state before checking /me so no stale account view survives.
      endSession();
      await refresh();
      navigate('/sign-in', { replace: true });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo cambiar la contraseña.'); }
    finally { setPending(false); }
  };
  const exit = async () => {
    try { await logout(); navigate('/sign-in', { replace: true }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo cerrar sesión.'); }
  };
  return <AppShell>
    <PageHeader eyebrow="Tu espacio · acceso" title="Mi cuenta" description="Revisa tu acceso y mantén tus credenciales al día." />
    <div className="grid max-w-5xl gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <section className="surface h-fit rounded-[22px] p-6">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary"><ShieldCheck size={22} /></span>
        <h2 className="serif mt-5 text-2xl">Tu acceso</h2>
        <p className="mt-2 break-all text-sm font-semibold" data-testid="text-account-email">{user?.email}</p>
        <p className="mt-1 text-xs text-muted-foreground">{user?.role === 'admin' ? 'Administración' : 'Equipo de recepción'}</p>
        <div className="mt-7 border-t border-border pt-5"><Button variant="secondary" onClick={() => void exit()} data-testid="button-logout"><LogOut size={16} />Cerrar sesión</Button></div>
      </section>
      <section className="surface rounded-[22px] p-6 sm:p-7">
        <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/30 text-primary"><KeyRound size={18} /></span><div><h2 className="text-base font-semibold">Cambiar contraseña</h2><p className="text-xs text-muted-foreground">Utiliza una contraseña nueva que solo tú conozcas.</p></div></div>
        <form onSubmit={(event) => void submit(event)} className="mt-7 space-y-4">
          <Field label="Contraseña actual"><input type="password" autoComplete="current-password" required className={inputClass} value={current} onChange={(event) => setCurrent(event.target.value)} data-testid="input-current-password" /></Field>
          <Field label="Nueva contraseña"><input type="password" autoComplete="new-password" required className={inputClass} value={next} onChange={(event) => setNext(event.target.value)} data-testid="input-new-password" /></Field>
          <Field label="Confirmar contraseña nueva"><input type="password" autoComplete="new-password" required className={inputClass} value={confirm} onChange={(event) => setConfirm(event.target.value)} data-testid="input-confirm-password" /></Field>
          {error && <p role="alert" className="text-sm text-destructive" data-testid="text-account-error">{error}</p>}
          <Button type="submit" disabled={pending} data-testid="button-change-password">{pending ? 'Guardando…' : 'Actualizar contraseña'}</Button>
        </form>
      </section>
    </div>
  </AppShell>;
}