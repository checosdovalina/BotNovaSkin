import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound, Plus, ShieldCheck, UserRound, UsersRound } from 'lucide-react';
import { AppShell } from '@/components/shell';
import { Button, EmptyState, ErrorState, Field, LoadingRows, Modal, PageHeader, inputClass } from '@/components/common';
import { authApi, type LocalUser, type ManagedUser } from '@/lib/local-auth';
import { useLocalAuth } from '@/components/auth-provider';

type Editor = { kind: 'create' } | { kind: 'edit'; user: ManagedUser } | null;

export default function AdminUsers() {
  const { user: self } = useLocalAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editor, setEditor] = useState<Editor>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<LocalUser['role']>('staff');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = async () => {
    setLoading(true); setLoadError('');
    try { setUsers((await authApi.users()).users); }
    catch (cause) { setLoadError(cause instanceof Error ? cause.message : 'No se pudo cargar el equipo.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const openCreate = () => {
    setEmail(''); setPassword(''); setRole('staff'); setError(''); setNotice('');
    setEditor({ kind: 'create' });
  };
  const openEdit = (target: ManagedUser) => {
    setEmail(target.email); setPassword(''); setRole(target.role); setError(''); setNotice('');
    setEditor({ kind: 'edit', user: target });
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!editor) return;
    setError(''); setPending(true);
    try {
      if (editor.kind === 'create') {
        const { user } = await authApi.createUser(email.trim(), password, role);
        setUsers((prev) => [...prev, user]);
        setNotice('Cuenta creada. Comparte las credenciales de forma privada.');
      } else {
        const { user } = await authApi.updateUser(editor.user.id, {
          ...(editor.user.role !== role ? { role } : {}),
          ...(password ? { password } : {}),
        });
        setUsers((prev) => prev.map((item) => item.id === user.id ? user : item));
        setNotice('Cambios guardados.');
      }
      setPassword(''); setEditor(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudieron guardar los cambios.'); }
    finally { setPending(false); }
  };
  const toggle = async (target: ManagedUser) => {
    if (!window.confirm(`¿${target.active ? 'Desactivar' : 'Activar'} el acceso de ${target.email}?`)) return;
    setError(''); setNotice(''); setPending(true);
    try {
      const { user } = await authApi.updateUser(target.id, { active: !target.active });
      setUsers((prev) => prev.map((item) => item.id === user.id ? user : item));
      setNotice(user.active ? 'Acceso activado.' : 'Acceso desactivado.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo cambiar el acceso.'); }
    finally { setPending(false); }
  };
  return <AppShell>
    <PageHeader eyebrow="Administración · acceso" title="Equipo y accesos" description="Cada integrante tiene su propia cuenta. Decide quién puede entrar y qué puede administrar." action={<Button onClick={openCreate} data-testid="button-create-user"><Plus size={16} />Añadir integrante</Button>} />
    <div className="mb-6 flex flex-wrap gap-3">
      <div className="inline-flex items-center gap-3 rounded-2xl bg-secondary/70 px-4 py-3 text-sm"><UsersRound size={17} className="text-primary" /><span><strong>{users.filter((item) => item.active).length}</strong> accesos activos</span></div>
      <div className="inline-flex items-center gap-3 rounded-2xl bg-accent/20 px-4 py-3 text-sm"><ShieldCheck size={17} className="text-primary" /><span><strong>{users.filter((item) => item.active && item.role === 'admin').length}</strong> administradores</span></div>
    </div>
    {notice && <p role="status" className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-primary" data-testid="text-users-notice">{notice}</p>}
    {error && !editor && <p role="alert" className="mb-4 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive" data-testid="text-users-error">{error}</p>}
    <section className="surface overflow-hidden rounded-[22px]">
      <div className="flex items-center justify-between border-b border-border px-5 py-5 sm:px-7"><div><h2 className="serif text-[23px]">Personas con acceso</h2><p className="mt-1 text-xs text-muted-foreground">Las cuentas desactivadas no pueden iniciar sesión.</p></div><UserRound size={19} className="text-primary/60" /></div>
      <div className="p-4 sm:p-6">
        {loading ? <LoadingRows count={4} /> : loadError ? <ErrorState message={loadError} onRetry={() => void load()} /> : users.length === 0 ? <EmptyState title="Aún no hay integrantes" description="Crea una cuenta para que tu equipo pueda atender la recepción." action={<Button onClick={openCreate}>Añadir integrante</Button>} /> :
          <div className="divide-y divide-border">
            {users.map((person) => <div key={person.id} className="flex flex-col gap-4 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between" data-testid={`row-user-${person.id}`}>
              <div className="flex min-w-0 items-center gap-3"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${person.active ? 'bg-secondary text-primary' : 'bg-muted text-muted-foreground'}`}>{person.email.slice(0, 2).toUpperCase()}</span><div className="min-w-0"><p className="truncate text-sm font-semibold">{person.email}{person.id === self?.id && <span className="ml-2 text-xs font-normal text-muted-foreground">Tú</span>}</p><p className="mt-0.5 text-xs text-muted-foreground">{person.role === 'admin' ? 'Administrador' : 'Recepción'} · {person.active ? 'Acceso activo' : 'Acceso desactivado'}</p></div></div>
              <div className="flex flex-wrap gap-2 pl-[52px] sm:pl-0"><Button variant="secondary" className="h-9 px-3 text-xs" onClick={() => openEdit(person)} disabled={pending} data-testid={`button-edit-user-${person.id}`}><KeyRound size={14} />Editar acceso</Button><Button variant={person.active ? 'danger' : 'ghost'} className="h-9 px-3 text-xs" onClick={() => void toggle(person)} disabled={pending || person.id === self?.id} title={person.id === self?.id ? 'No puedes desactivar tu propia cuenta' : undefined} data-testid={`button-toggle-user-${person.id}`}>{person.active ? 'Desactivar' : 'Activar'}</Button></div>
            </div>)}
          </div>}
      </div>
    </section>
    {editor && <Modal title={editor.kind === 'create' ? 'Añadir integrante' : 'Editar acceso'} description={editor.kind === 'create' ? 'Crea un acceso individual para una persona del equipo.' : `Actualiza los permisos de ${editor.user.email}.`} onClose={() => { if (!pending) setEditor(null); }}>
      <form onSubmit={(event) => void save(event)} className="space-y-4">
        {editor.kind === 'create' && <Field label="Correo electrónico"><input type="email" autoComplete="off" required value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} data-testid="input-user-email" /></Field>}
        <Field label="Rol"><select value={role} onChange={(event) => setRole(event.target.value as LocalUser['role'])} className={inputClass} disabled={editor.kind === 'edit' && editor.user.id === self?.id} data-testid="select-user-role"><option value="staff">Recepción</option><option value="admin">Administrador</option></select></Field>
        <Field label={editor.kind === 'create' ? 'Contraseña inicial' : 'Nueva contraseña (opcional)'} hint={editor.kind === 'edit' ? 'Déjala en blanco para mantener la contraseña actual.' : 'Entrégala de forma privada; no se mostrará después.'}><input type="password" autoComplete="new-password" required={editor.kind === 'create'} value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass} data-testid="input-user-password" /></Field>
        {error && <p role="alert" className="text-sm text-destructive" data-testid="text-user-form-error">{error}</p>}
        <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" onClick={() => setEditor(null)} disabled={pending}>Cancelar</Button><Button type="submit" disabled={pending} data-testid="button-save-user">{pending ? 'Guardando…' : editor.kind === 'create' ? 'Crear cuenta' : 'Guardar cambios'}</Button></div>
      </form>
    </Modal>}
  </AppShell>;
}