import { ArrowUpRight, CalendarDays, Clock3, MessageCircle, Plus, Scissors, Sparkles } from 'lucide-react';
import { Link } from 'wouter';
import { getGetDashboardQueryKey, getGetBotStatusQueryKey, getListAppointmentsQueryKey, useGetBotStatus, useGetDashboard, useListAppointments } from '@workspace/api-client-react';
import { AppShell } from '@/components/shell';
import { Button, EmptyState, ErrorState, LoadingRows, Metric, PageHeader, StatusPill } from '@/components/common';
import { useQueryClient } from '@tanstack/react-query';

const today = new Date().toISOString().slice(0, 10);

export default function Dashboard() {
  const queryClient = useQueryClient();
  const dashboard = useGetDashboard({ query: { queryKey: getGetDashboardQueryKey() } });
  const bot = useGetBotStatus({ query: { queryKey: getGetBotStatusQueryKey() } });
  const agenda = useListAppointments({ from: today, to: today }, { query: { queryKey: getListAppointmentsQueryKey({ from: today, to: today }) } });
  const refreshing = () => { void queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); void queryClient.invalidateQueries({ queryKey: getListAppointmentsQueryKey({ from: today, to: today }) }); };
  const d = dashboard.data;
  const appointments = agenda.data ?? [];
  const botConnected = d?.botConnected ?? bot.data?.connected ?? false;

  return <AppShell><PageHeader eyebrow="Martes · 24 septiembre" title={`Buenos días${d?.businessName ? `, ${d.businessName}` : ''}.`} description="Una vista tranquila de lo que necesita atención hoy." action={<Link href="/appointments" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-[13px] font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90" data-testid="link-create-appointment"><Plus size={16} />Nueva cita</Link>} />
    <div className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div className="animate-rise-in stagger-1"><Metric label="Citas de hoy" value={d?.todayAppointments ?? appointments.length} hint="en agenda" tone="sage" /></div>
      <div className="animate-rise-in stagger-2"><Metric label="Próximas citas" value={d?.upcomingAppointments ?? 0} hint="por confirmar" tone="gold" /></div>
      <div className="animate-rise-in stagger-3"><Metric label="Tratamientos activos" value={d?.activeServices ?? 0} hint="en catálogo" tone="peach" /></div>
      <div className="animate-rise-in stagger-4"><Metric label="Respuestas del bot" value={d?.faqCount ?? 0} hint="preguntas listas" tone="blue" /></div>
    </div>
    <div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
      <section className="surface overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between border-b border-border/70 px-5 py-5"><div><h2 className="text-[15px] font-semibold">Agenda de hoy</h2><p className="mt-1 text-xs text-muted-foreground">El pulso de tu recepción, en una sola vista.</p></div><Link href="/appointments" className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline" data-testid="link-view-agenda">Ver agenda <ArrowUpRight size={14} /></Link></div>
        <div className="p-3 sm:p-5">
          {agenda.isLoading ? <LoadingRows count={3} /> : agenda.isError ? <ErrorState onRetry={() => void agenda.refetch()} /> : appointments.length === 0 ? <EmptyState title="La agenda está despejada" description="Las nuevas citas que lleguen por WhatsApp aparecerán aquí." action={<Link href="/appointments" className="text-xs font-bold text-primary hover:underline" data-testid="link-empty-agenda">Abrir agenda</Link>} /> :
            <div className="space-y-1">{appointments.slice(0, 6).map((appointment, index) => <div key={appointment.id} className="group flex items-center gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-muted/60" data-testid={`row-dashboard-appointment-${appointment.id}`}><div className="w-12 text-center"><p className="text-sm font-semibold text-primary">{appointment.scheduledTime}</p><p className="mt-0.5 text-[10px] text-muted-foreground">hoy</p></div><div className={`h-9 w-0.5 rounded-full ${index % 3 === 0 ? 'bg-accent' : index % 3 === 1 ? 'bg-primary/35' : 'bg-[hsl(12_54%_66%)]'}`} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{appointment.clientName}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{appointment.serviceName} · {appointment.area}</p></div><StatusPill status={appointment.status} /></div>)}</div>}
        </div>
      </section>
      <div className="space-y-5">
        <section className="overflow-hidden rounded-2xl bg-primary p-5 text-primary-foreground shadow-md">
          <div className="flex items-start justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.17em] opacity-65">Siguiente en agenda</p><h2 className="serif mt-3 text-2xl">{d?.nextAppointment?.clientName ?? 'Aún no hay una cita'}</h2></div><Clock3 size={20} className="opacity-65" /></div>
          {d?.nextAppointment ? <><p className="mt-1 text-sm opacity-75">{d.nextAppointment.serviceName}</p><div className="mt-6 flex items-center justify-between border-t border-primary-foreground/15 pt-4 text-xs"><span>{d.nextAppointment.scheduledDate} · {d.nextAppointment.scheduledTime}</span><StatusPill status={d.nextAppointment.status} /></div></> : <p className="mt-2 text-xs leading-relaxed opacity-70">Cuando exista una próxima cita aparecerá aquí, lista para recibir atención.</p>}
        </section>
        <section className="surface rounded-2xl p-5">
          <div className="flex items-center justify-between"><div className="flex items-center gap-3"><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${botConnected ? 'bg-primary/10 text-primary' : 'bg-accent/30 text-[hsl(32_44%_30%)]'}`}><MessageCircle size={18} /></span><div><h2 className="text-sm font-semibold">Bot de WhatsApp</h2><p className="mt-0.5 text-xs text-muted-foreground">{bot.data?.label ?? 'Estado de conexión'}</p></div></div><span className={`text-[11px] font-bold ${botConnected ? 'text-primary' : 'text-[hsl(32_44%_30%)]'}`}>{botConnected ? 'Conectado' : 'Pendiente'}</span></div>
          <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full transition-all ${botConnected ? 'w-full bg-primary' : 'w-1/3 bg-accent'}`} /></div><Link href="/bot" className="mt-4 flex items-center justify-between text-xs font-semibold text-primary" data-testid="link-bot-details">Revisar conexión <ArrowUpRight size={14} /></Link>
        </section>
      </div>
    </div>
    <div className="mt-5 grid gap-5 md:grid-cols-3">
      <Link href="/appointments" className="surface group rounded-2xl p-5 transition-transform hover:-translate-y-0.5" data-testid="link-quick-appointments"><CalendarDays className="mb-5 text-primary" size={20} /><p className="text-sm font-semibold">Organizar citas</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Confirma, mueve o agrega una cita manualmente.</p><ArrowUpRight size={15} className="mt-4 text-muted-foreground transition-transform group-hover:translate-x-1" /></Link>
      <Link href="/services" className="surface group rounded-2xl p-5 transition-transform hover:-translate-y-0.5" data-testid="link-quick-services"><Scissors className="mb-5 text-[hsl(12_54%_60%)]" size={20} /><p className="text-sm font-semibold">Cuidar catálogo</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Mantén claros los precios y tiempos de cada servicio.</p><ArrowUpRight size={15} className="mt-4 text-muted-foreground transition-transform group-hover:translate-x-1" /></Link>
      <Link href="/faqs" className="surface group rounded-2xl p-5 transition-transform hover:-translate-y-0.5" data-testid="link-quick-faqs"><Sparkles className="mb-5 text-[hsl(32_54%_46%)]" size={20} /><p className="text-sm font-semibold">Afinar respuestas</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Haz que cada conversación del bot suene como tu equipo.</p><ArrowUpRight size={15} className="mt-4 text-muted-foreground transition-transform group-hover:translate-x-1" /></Link>
    </div>
    {dashboard.isError && <button className="mt-4 text-xs text-muted-foreground underline" onClick={refreshing} data-testid="button-refresh-dashboard">Actualizar datos</button>}
  </AppShell>;
}