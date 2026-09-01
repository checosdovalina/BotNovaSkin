import { CalendarDays, ChevronRight, CircleHelp, LayoutDashboard, MessageCircle, Scissors, Sparkles, X } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useState, type ReactNode } from 'react';

const navItems = [
  { href: '/', label: 'Resumen', icon: LayoutDashboard },
  { href: '/appointments', label: 'Citas', icon: CalendarDays },
  { href: '/services', label: 'Tratamientos', icon: Scissors },
  { href: '/faqs', label: 'Preguntas del bot', icon: CircleHelp },
  { href: '/bot', label: 'Conexión WhatsApp', icon: MessageCircle },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const active = (href: string) => href === '/' ? location === '/' : location.startsWith(href);

  return (
    <div className="noise min-h-[100dvh] bg-background">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[254px] flex-col bg-sidebar px-4 py-5 text-sidebar-foreground transition-transform duration-300 md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="mb-10 flex items-center justify-between px-3">
          <Link href="/" className="flex items-center gap-3" data-testid="link-brand">
            <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
              <Sparkles size={19} strokeWidth={1.8} />
            </span>
            <span>
              <span className="serif block text-[21px] leading-none tracking-[-.02em]">estética</span>
              <span className="mt-1 block text-[9px] font-semibold uppercase tracking-[.24em] opacity-60">Torreón · staff</span>
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
            <p className="mt-0.5 text-sm text-foreground/70">Martes, 24 de septiembre de 2024</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-right sm:block"><span className="block text-xs font-semibold">Recepción</span><span className="block text-[11px] text-muted-foreground">Turno matutino</span></span>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground">RC</span>
          </div>
        </header>
        <main className="px-5 py-7 md:px-10 md:py-9">{children}</main>
      </div>
    </div>
  );
}