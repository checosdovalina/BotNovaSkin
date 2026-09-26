import { CalendarDays, ChevronRight, CircleHelp, LayoutDashboard, MessageCircle, MessagesSquare, Scissors, X, UserRound, UsersRound } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useState, type ReactNode } from 'react';
import { useLocalAuth } from '@/components/auth-provider';

const navItems = [
  { href: '/', label: 'Resumen', icon: LayoutDashboard },
  { href: '/appointments', label: 'Citas', icon: CalendarDays },
  { href: '/services', label: 'Tratamientos', icon: Scissors },
  { href: '/faqs', label: 'Preguntas del bot', icon: CircleHelp },
  { href: '/conversations', label: 'Conversaciones', icon: MessagesSquare },
  { href: '/bot', label: 'Conexión WhatsApp', icon: MessageCircle },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useLocalAuth();
  const active = (href: string) => href === '/' ? location === '/' : location.startsWith(href);

  return (
    <div className="noise min-h-[100dvh] bg-background">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[254px] flex-col bg-sidebar px-4 py-5 text-sidebar-foreground transition-transform duration-300 md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="mb-10 flex items-center justify-between px-3">
          <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="NOVA SKIN MED — inicio" data-testid="link-brand">
            <img src="/novaskin-mark.png" alt="" width="27" height="38" className="h-10 w-auto shrink-0 object-contain" />
            <span>
              <span className="block whitespace-nowrap text-[13px] font-semibold uppercase leading-none tracking-[.095em]">NOVA SKIN MED</span>
              <span className="mt-1.5 block text-[9px] font-semibold uppercase tracking-[.2em] opacity-60">Torreón · recepción</span>
            </span>
          </Link>
          <button onClick={() => setMobileOpen(false)} className="rounded-lg p-2 opacity-70 hover:bg-sidebar-accent md:hidden" aria-label="Cerrar menú" data-testid="button-close-menu">
            <X size={17} />
          </button>
        </div>
        <nav className="space-y-1.5" aria-label="Navegación principal">
          <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[.2em] opacity-45">Espacio de trabajo</p>
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} onClick={() => setMobileOpen(false)} className={`group flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-medium transition-colors ${active(href) ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}>
              <Icon size={17} strokeWidth={active(href) ? 2.2 : 1.8} />
              <span className="flex-1">{label}</span>
              {active(href) && <ChevronRight size={15} className="opacity-60" />}
            </Link>
          ))}
          <p className="mb-3 mt-8 px-3 text-[10px] font-semibold uppercase tracking-[.2em] opacity-45">Acceso</p>
          {user?.role === 'admin' && <Link href="/admin/users" onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-medium ${active('/admin/users') ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`} data-testid="link-nav-users"><UsersRound size={17} />Equipo y accesos</Link>}
          <Link href="/account" onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-medium ${active('/account') ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`} data-testid="link-nav-account"><UserRound size={17} />Mi cuenta</Link>
        </nav>
        <div className="mt-auto rounded-2xl border border-sidebar-border bg-sidebar-accent/70 p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sidebar-primary opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-sidebar-primary" /></span>
            <span className="text-[11px] font-semibold">Centro operativo</span>
          </div>
          <p className="text-[11px] leading-relaxed text-sidebar-foreground/55">Tu equipo tiene el control. El bot se ocupa de lo repetitivo.</p>
        </div>
      </aside>
      {mobileOpen && <button className="fixed inset-0 z-30 bg-foreground/20 backdrop-blur-[2px] md:hidden" onClick={() => setMobileOpen(false)} aria-label="Cerrar menú" data-testid="button-overlay-menu" />}
      <div className="min-h-[100dvh] md:pl-[254px]">
        <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-border/70 bg-background/90 px-5 backdrop-blur-md md:px-10">
          <button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 hover:bg-muted md:hidden" aria-label="Abrir menú" data-testid="button-open-menu">
            <span className="block h-[2px] w-5 bg-foreground shadow-[0_6px_0_hsl(var(--foreground)),0_-6px_0_hsl(var(--foreground))]" />
          </button>
          <div className="hidden md:block">
            <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-muted-foreground">Panel de atención</p>
             <p className="mt-0.5 text-sm text-foreground/70">{new Intl.DateTimeFormat('es-MX', { dateStyle: 'full' }).format(new Date())}</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
             <span className="hidden max-w-[180px] text-right sm:block"><span className="block truncate text-xs font-semibold">{user?.email}</span><span className="block text-[11px] text-muted-foreground">{user?.role === 'admin' ? 'Administración' : 'Recepción'}</span></span>
             <Link href="/account" className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground" aria-label="Mi cuenta" data-testid="link-header-account">{user?.email.slice(0, 2).toUpperCase()}</Link>
          </div>
        </header>
        <main className="px-5 py-7 md:px-10 md:py-9">{children}</main>
      </div>
    </div>
  );
}