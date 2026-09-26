import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowRight, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Button, Field, inputClass } from '@/components/common';
import { useLocalAuth } from '@/components/auth-provider';

export default function SignIn() {
  const { login } = useLocalAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      await login(email.trim(), password);
      setPassword('');
      navigate('/conversations', { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo iniciar sesión.');
    } finally { setPending(false); }
  };
  return <div className="noise flex min-h-[100dvh] flex-col bg-background lg:flex-row">
    <div className="relative flex min-h-[230px] flex-col justify-between overflow-hidden bg-sidebar p-7 text-sidebar-foreground sm:p-10 lg:min-h-[100dvh] lg:w-[46%] lg:p-14">
      <div className="pointer-events-none absolute -right-32 -top-40 h-[480px] w-[480px] rounded-full border border-sidebar-foreground/10" />
      <div className="pointer-events-none absolute -right-16 -top-28 h-[350px] w-[350px] rounded-full border border-sidebar-foreground/10" />
      <Link href="/" className="relative inline-flex w-fit items-center gap-3.5" aria-label="NOVA SKIN MED — inicio" data-testid="link-brand">
        <img src="/novaskin-mark.png" alt="" width="30" height="43" className="h-11 w-auto shrink-0 object-contain" />
        <span className="text-[16px] font-semibold uppercase leading-none tracking-[.11em] sm:text-[18px]">NOVA SKIN MED</span>
      </Link>
      <div className="relative hidden max-w-md lg:block">
        <p className="mb-5 text-[11px] font-bold uppercase tracking-[.25em] text-sidebar-primary">Torreón · recepción</p>
        <h1 className="serif text-5xl leading-[1.13] tracking-[-.035em]">Una atención que sigue de cerca cada conversación.</h1>
        <p className="mt-6 max-w-sm text-sm leading-7 text-sidebar-foreground/65">Tu espacio privado para acompañar las consultas, atender solicitudes y mantener el día en orden.</p>
      </div>
      <p className="relative text-xs text-sidebar-foreground/45">Acceso reservado para el equipo autorizado.</p>
    </div>
    <div className="flex flex-1 items-center justify-center px-5 py-12 sm:px-10">
      <div className="animate-rise-in w-full max-w-[420px]">
        <span className="mb-7 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary"><LockKeyhole size={22} strokeWidth={1.8} /></span>
        <p className="text-[11px] font-bold uppercase tracking-[.2em] text-primary">Acceso del equipo</p>
        <h2 className="serif mt-2 text-[38px] leading-tight tracking-[-.035em]">Bienvenida de nuevo.</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Inicia sesión con las credenciales que te proporcionó la administración.</p>
        <form onSubmit={(event) => void submit(event)} className="mt-9 space-y-5">
          <Field label="Correo electrónico"><input autoComplete="username" autoFocus required type="email" className={`${inputClass} h-12`} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="tu@clinica.com" data-testid="input-email" /></Field>
          <Field label="Contraseña"><input autoComplete="current-password" required type="password" className={`${inputClass} h-12`} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Tu contraseña" data-testid="input-password" /></Field>
          {error && <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive" data-testid="text-login-error">{error}</p>}
          <Button type="submit" disabled={pending} className="h-12 w-full justify-between px-5" data-testid="button-login">{pending ? 'Comprobando acceso…' : 'Entrar a recepción'}<ArrowRight size={17} /></Button>
        </form>
        <div className="mt-9 flex items-start gap-2 border-t border-border pt-6 text-xs leading-relaxed text-muted-foreground"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-primary" />Tu sesión utiliza una cookie segura del servidor. No guardamos tu contraseña en este dispositivo.</div>
      </div>
    </div>
  </div>;
}