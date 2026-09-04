import { ArrowUpRight, Check, CheckCheck, Clipboard, Cloud, Code2, ExternalLink, FileKey2, Flag, Globe2, Info, Link2, MessageCircle, RefreshCw, Send, ShieldAlert, ShieldCheck, TestTube2, Wifi } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { getGetBotStatusQueryKey, getHealthCheckQueryKey, getListFaqsQueryKey, useGetBotStatus, useHealthCheck, useListFaqs } from '@workspace/api-client-react';
import { AppShell } from '@/components/shell';
import { Button, ErrorState, PageHeader, inputClass } from '@/components/common';
import { useToast } from '@/hooks/use-toast';

type Message = { from: 'bot' | 'client'; text: string };
const initialMessages: Message[] = [{ from: 'bot', text: 'Hola, soy el asistente de estética. ¿En qué puedo ayudarte hoy?' }, { from: 'client', text: 'Hola, quisiera saber qué incluye una limpieza facial.' }, { from: 'bot', text: 'Con gusto. Puedo contarte sobre el tratamiento, su duración y ayudarte a encontrar un horario.' }];
const webhookPath = '/api/webhooks/whatsapp';

function StepCard({ number, icon, title, description, done, children }: { number: string; icon: ReactNode; title: string; description: string; done: boolean; children: ReactNode }) {
  return <article className={`rounded-[22px] border p-5 transition-colors duration-200 ${done ? 'border-primary/25 bg-primary/[0.035]' : 'border-border bg-card'}`}>
    <div className="flex gap-4">
      <div className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${done ? 'bg-primary text-primary-foreground' : 'bg-secondary text-primary'}`}>
        {done ? <Check size={18} strokeWidth={2.4} /> : icon}
        <span className="absolute -left-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-card bg-accent px-1 text-[10px] font-bold text-accent-foreground">{number}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><h3 className="text-[15px] font-semibold tracking-[-.01em]">{title}</h3><p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">{description}</p></div>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.1em] ${done ? 'bg-primary/10 text-primary' : 'bg-accent/25 text-[hsl(32_44%_30%)]'}`}>{done ? 'Completado' : 'Pendiente'}</span>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  </article>;
}

function CopyField({ label, value, onCopy, secondary = false }: { label: string; value: string; onCopy: () => void; secondary?: boolean }) {
  return <div>
    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">{label}</p>
    <div className={`flex items-center gap-2 rounded-xl border p-2.5 ${secondary ? 'border-border bg-muted/40' : 'border-primary/20 bg-primary/[0.035]'}`}>
      <code className={`min-w-0 flex-1 truncate text-xs ${secondary ? 'text-foreground' : 'text-primary'}`}>{value}</code>
      <button type="button" onClick={onCopy} className="flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label={`Copiar ${label.toLowerCase()}`}><Clipboard size={13} />Copiar</button>
    </div>
  </div>;
}

export default function Bot() {
  const status = useGetBotStatus({ query: { queryKey: getGetBotStatusQueryKey() } });
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey() } });
  const faqs = useListFaqs(undefined, { query: { queryKey: getListFaqsQueryKey(undefined) } });
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [draft, setDraft] = useState('');
  const [manualSteps, setManualSteps] = useState({ meta: false, deploy: false, secrets: false, webhook: false, subscription: false });
  const [finalTested, setFinalTested] = useState(false);
  const { toast } = useToast();

  const bot = status.data;
  const healthReady = health.data?.status === 'ok';
  const webhookReady = Boolean(bot?.webhookReady) || manualSteps.webhook;
  const steps = [
    { id: 'meta', done: manualSteps.meta, title: 'Prepara la cuenta en Meta', description: 'Crea o selecciona tu aplicación, agrega WhatsApp y confirma que el número de atención esté listo para Cloud API.' },
    { id: 'replit', done: manualSteps.deploy, title: 'Publica la app en Replit', description: 'La integración necesita una URL pública y estable. Comprueba que el servicio esté desplegado antes de registrarlo en Meta.' },
    { id: 'secrets', done: manualSteps.secrets, title: 'Guarda los secretos en Replit', description: 'Añade las variables en Secrets de Replit. Aquí solo usamos nombres de variables: los valores nunca deben viajar por el chat.' },
    { id: 'webhook', done: webhookReady, title: 'Configura y verifica el webhook', description: 'Usa la URL de abajo en la configuración de Meta y completa la verificación con tu token guardado en Secrets.' },
    { id: 'subscription', done: manualSteps.subscription, title: 'Suscribe los mensajes', description: 'En los campos del webhook de Meta, activa el evento messages para que el bot pueda recibir nuevas conversaciones.' },
    { id: 'test', done: finalTested, title: 'Haz la prueba final', description: 'Confirma que el webhook responde y revisa el tono del bot en el simulador antes de activar el canal.' },
  ];
  const completedSteps = steps.filter((step) => step.done).length;
  const webhookUrl = typeof window === 'undefined' ? webhookPath : `${window.location.origin}${webhookPath}`;

  const copyValue = async (value: string, label: string) => {
    if (!navigator.clipboard) {
      toast({ title: 'No se pudo copiar', description: 'Copia el valor manualmente desde este panel.' });
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `${label} copiado`, description: 'Ya puedes pegarlo en la configuración de Meta.' });
    } catch {
      toast({ title: 'No se pudo copiar', description: 'Copia el valor manualmente desde este panel.' });
    }
  };
  const toggleStep = (id: 'meta' | 'deploy' | 'secrets' | 'webhook' | 'subscription') => setManualSteps((current) => ({ ...current, [id]: !current[id] }));
  const refreshAll = async () => {
    await Promise.all([status.refetch(), health.refetch(), faqs.refetch()]);
    toast({ title: 'Estado actualizado', description: 'Comprobamos de nuevo la conexión y la configuración.' });
  };
  const send = () => {
    const value = draft.trim();
    if (!value) return;
    setMessages((current) => [...current, { from: 'client', text: value }, { from: 'bot', text: 'Gracias por escribirnos. Esta es una simulación para revisar el tono de tus respuestas.' }]);
    setDraft('');
  };
  const runFinalTest = () => {
    setFinalTested(true);
    setMessages((current) => [...current, { from: 'bot', text: 'Prueba final registrada. El simulador no envía mensajes reales a clientes.' }]);
    toast({ title: 'Prueba final registrada', description: 'Puedes volver a probar el tono del bot cuando quieras.' });
  };

  return <AppShell>
    <PageHeader eyebrow="Canal de atención · Meta Cloud API" title="Conexión WhatsApp" description="Convierte la configuración manual en un recorrido claro: prepara Meta, publica la app, verifica el webhook y prueba la primera conversación." action={<Button variant="secondary" onClick={() => void refreshAll()} disabled={status.isFetching || health.isFetching} data-testid="button-refresh-bot"><RefreshCw size={15} className={status.isFetching ? 'animate-spin' : ''} />Actualizar estado</Button>} />

    <section className="relative isolate overflow-hidden rounded-[26px] bg-primary px-5 py-6 text-primary-foreground shadow-[0_18px_40px_hsl(166_24%_20%/.12)] sm:px-7 sm:py-7">
      <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full border border-primary-foreground/10" /><div className="pointer-events-none absolute -right-2 -top-10 h-40 w-40 rounded-full border border-primary-foreground/10" />
      <div className="relative flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary-foreground/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.14em]"><Link2 size={12} />Ruta de configuración manual</div>
          <h2 className="serif max-w-xl text-[30px] leading-[1.06] tracking-[-.035em] sm:text-[38px]">De Meta a una conversación real.</h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-primary-foreground/75">Sigue los seis pasos en orden. No necesitas pegar tokens en este panel ni compartirlos por chat.</p>
        </div>
        <div className="w-full max-w-[290px] rounded-2xl border border-primary-foreground/15 bg-primary-foreground/[0.08] p-4 backdrop-blur-sm">
          <div className="flex items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-primary-foreground/60">Progreso</p><p className="mt-1 text-xs text-primary-foreground/75">{completedSteps === steps.length ? 'Integración lista para probar' : 'Completa cada paso en orden'}</p></div><strong className="text-2xl tracking-[-.04em]">{completedSteps}<span className="text-base text-primary-foreground/50">/{steps.length}</span></strong></div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-primary-foreground/15"><div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${(completedSteps / steps.length) * 100}%` }} /></div>
          <p className="mt-2 text-[11px] text-primary-foreground/55">{steps.find((step) => !step.done)?.title ?? 'Todo preparado'}</p>
        </div>
      </div>
    </section>

    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,.75fr)]">
      <section aria-labelledby="setup-title">
        <div className="mb-4 flex items-end justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-primary">Recorrido recomendado</p><h2 id="setup-title" className="serif mt-1 text-2xl tracking-[-.025em]">Configúralo sin perderte</h2></div><span className="hidden text-xs text-muted-foreground sm:block">{completedSteps} de {steps.length} pasos</span></div>
        <div className="space-y-3">
          <StepCard number="1" icon={<Flag size={18} />} title={steps[0].title} description={steps[0].description} done={steps[0].done}>
            <div className="flex flex-wrap items-center gap-2">
              <a href="https://developers.facebook.com/apps/" target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-3.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90" data-testid="link-meta-apps">Abrir Meta for Developers <ArrowUpRight size={14} /></a>
              <Button variant="ghost" className="h-9 px-3 text-xs" onClick={() => toggleStep('meta')} data-testid="button-toggle-meta">{manualSteps.meta ? 'Marcar como pendiente' : 'Marcar como preparado'}</Button>
            </div>
          </StepCard>

          <StepCard number="2" icon={<Cloud size={18} />} title={steps[1].title} description={steps[1].description} done={steps[1].done}>
            <div className="flex flex-wrap items-center gap-3">
              <div className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs ${health.isError ? 'bg-destructive/10 text-destructive' : healthReady ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}><span className={`h-1.5 w-1.5 rounded-full ${healthReady ? 'bg-primary' : health.isError ? 'bg-destructive' : 'bg-muted-foreground/40'}`} />{health.isLoading ? 'Comprobando servicio' : health.isError ? 'No pudimos comprobarlo' : healthReady ? 'API operativa' : 'Esperando respuesta del servicio'}</div>
              <Button variant="ghost" className="h-9 px-3 text-xs" onClick={() => toggleStep('deploy')} data-testid="button-toggle-deploy">{manualSteps.deploy ? 'Marcar como pendiente' : 'Ya publiqué la app'}</Button>
              {health.isError && <Button variant="ghost" className="h-9 px-3 text-xs" onClick={() => void health.refetch()} data-testid="button-retry-health"><RefreshCw size={14} />Reintentar</Button>}
              <a href="https://docs.replit.com/hosting/deployments" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline" data-testid="link-replit-docs">Guía de despliegue <ExternalLink size={13} /></a>
            </div>
          </StepCard>

          <StepCard number="3" icon={<FileKey2 size={18} />} title={steps[2].title} description={steps[2].description} done={steps[2].done}>
            <div className="rounded-xl border border-accent/45 bg-accent/10 p-3.5">
              <div className="flex items-start gap-2.5"><ShieldAlert size={16} className="mt-0.5 shrink-0 text-[hsl(32_44%_30%)]" /><p className="text-xs leading-relaxed text-[hsl(32_44%_30%)]"><strong>Importante:</strong> nunca pegues valores de tokens, claves o secretos en este chat ni en el código. Guárdalos únicamente en <strong>Replit → Secrets</strong>.</p></div>
              <div className="mt-3 flex flex-wrap gap-2">{['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'].map((name) => <code key={name} className="rounded-md bg-background/70 px-2 py-1 text-[10px] text-muted-foreground">{name}</code>)}</div>
            </div>
            <Button variant="ghost" className="mt-3 h-9 px-3 text-xs" onClick={() => toggleStep('secrets')} data-testid="button-toggle-secrets">{manualSteps.secrets ? 'Marcar como pendiente' : 'Ya guardé los secretos en Replit'}</Button>
          </StepCard>

          <StepCard number="4" icon={<Code2 size={18} />} title={steps[3].title} description={steps[3].description} done={steps[3].done}>
            <div className="grid gap-2 sm:grid-cols-2">
              <CopyField label="URL completa" value={webhookUrl} onCopy={() => void copyValue(webhookUrl, 'URL del webhook')} />
              <CopyField label="Ruta exacta" value={webhookPath} secondary onCopy={() => void copyValue(webhookPath, 'Ruta del webhook')} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <a href="https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline" data-testid="link-webhook-docs">Documentación del webhook <ExternalLink size={13} /></a>
              <Button variant="ghost" className="h-8 px-2 text-xs" onClick={() => toggleStep('webhook')} data-testid="button-toggle-webhook">{manualSteps.webhook ? 'Marcar como pendiente' : 'Webhook verificado'}</Button>
            </div>
          </StepCard>

          <StepCard number="5" icon={<Wifi size={18} />} title={steps[4].title} description={steps[4].description} done={steps[4].done}>
            <div className="flex flex-wrap items-center gap-3">
              <a href="https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks#subscribe-to-webhooks" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline" data-testid="link-subscribe-docs">Ver campos disponibles en Meta <ExternalLink size={13} /></a>
              <Button variant="ghost" className="h-9 px-3 text-xs" onClick={() => toggleStep('subscription')} data-testid="button-toggle-subscription">{manualSteps.subscription ? 'Marcar como pendiente' : 'messages suscrito'}</Button>
            </div>
          </StepCard>

          <StepCard number="6" icon={<TestTube2 size={18} />} title={steps[5].title} description={steps[5].description} done={steps[5].done}>
            <div className="flex flex-wrap items-center gap-2">
              <Button className="h-9 px-3 text-xs" onClick={runFinalTest} data-testid="button-final-test"><TestTube2 size={14} />Registrar prueba final</Button>
              <Button variant="ghost" className="h-9 px-3 text-xs" onClick={() => document.getElementById('simulador-whatsapp')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} data-testid="button-open-simulator">Ir al simulador</Button>
            </div>
          </StepCard>
        </div>
      </section>

      <aside className="space-y-4">
        <section className="surface rounded-[22px] p-5">
          <div className="flex items-center gap-3"><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${bot?.connected ? 'bg-primary/10 text-primary' : 'bg-accent/30 text-[hsl(32_44%_30%)]'}`}><Wifi size={19} /></span><div><h2 className="text-[15px] font-semibold">Estado del canal</h2><p className="mt-1 text-xs text-muted-foreground">Lectura actual de la integración</p></div><span className={`ml-auto rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.1em] ${bot?.connected ? 'bg-primary/10 text-primary' : 'bg-accent/30 text-[hsl(32_44%_30%)]'}`}>{status.isLoading ? 'Comprobando' : bot?.connected ? 'En línea' : 'Pendiente'}</span></div>
          {status.isLoading ? <div className="mt-5 space-y-3"><div className="h-11 animate-pulse rounded-xl bg-muted" /><div className="h-11 animate-pulse rounded-xl bg-muted" /><div className="h-11 animate-pulse rounded-xl bg-muted" /></div> : status.isError ? <div className="mt-5"><ErrorState onRetry={() => void status.refetch()} message="No pudimos leer el estado de WhatsApp." /></div> : <div className="mt-5 space-y-2">
            <div className="flex items-center justify-between rounded-xl bg-muted/50 px-3.5 py-3"><span className="text-xs text-muted-foreground">Proveedor</span><span className="text-right text-sm font-semibold">{bot?.provider || 'No configurado'}</span></div>
            <div className="flex items-center justify-between rounded-xl bg-muted/50 px-3.5 py-3"><span className="text-xs text-muted-foreground">Identificador</span><span className="max-w-[55%] truncate text-right text-sm font-semibold">{bot?.label || 'Pendiente de configuración'}</span></div>
            <div className="flex items-center justify-between rounded-xl bg-muted/50 px-3.5 py-3"><span className="flex items-center gap-2 text-xs text-muted-foreground"><span className={`h-1.5 w-1.5 rounded-full ${webhookReady ? 'bg-primary' : 'bg-accent'}`} />Webhook</span><span className={`text-sm font-semibold ${webhookReady ? 'text-primary' : 'text-[hsl(32_44%_30%)]'}`}>{webhookReady ? 'Listo para recibir' : 'Requiere atención'}</span></div>
          </div>}
        </section>

        <section className="rounded-[22px] bg-secondary/70 p-5">
          <div className="flex items-center gap-2 text-primary"><ShieldCheck size={17} /><p className="text-[11px] font-bold uppercase tracking-[.15em]">Señales de preparación</p></div>
          <div className="mt-4 space-y-3">
            {[{ label: 'Servicio disponible', detail: health.isLoading ? 'Comprobando…' : healthReady ? 'API operativa' : 'Pendiente de respuesta', ok: healthReady }, { label: 'Respuestas del bot', detail: faqs.isLoading ? 'Comprobando…' : faqs.isError ? 'No disponible' : `${faqs.data?.length ?? 0} respuestas activas`, ok: !faqs.isLoading && !faqs.isError && (faqs.data?.length ?? 0) > 0 }, { label: 'Webhook preparado', detail: webhookReady ? 'Ruta verificada' : 'Completa el paso 4', ok: webhookReady }].map((item) => <div key={item.label} className="flex items-center gap-3"><span className={`flex h-7 w-7 items-center justify-center rounded-full ${item.ok ? 'bg-primary text-primary-foreground' : 'bg-accent text-[hsl(32_44%_30%)]'}`}>{item.ok ? <Check size={14} /> : <Info size={14} />}</span><div className="min-w-0 flex-1"><p className="text-xs font-semibold">{item.label}</p><p className="text-[11px] text-muted-foreground">{item.detail}</p></div></div>)}
          </div>
        </section>

        <section className="rounded-[22px] border border-accent/45 bg-accent/10 p-5">
          <div className="flex items-start gap-3"><ShieldAlert size={18} className="mt-0.5 shrink-0 text-[hsl(32_44%_30%)]" /><div><h2 className="text-sm font-semibold text-[hsl(32_44%_25%)]">Protege tus credenciales</h2><p className="mt-1.5 text-xs leading-relaxed text-[hsl(32_44%_30%)]">Este panel no solicita tokens reales. Meta y Replit son los únicos lugares donde debes introducirlos.</p><a href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[hsl(32_44%_25%)] hover:underline" data-testid="link-meta-security">Guía oficial de inicio <ExternalLink size={13} /></a></div></div>
        </section>
      </aside>
    </div>

    <section id="simulador-whatsapp" className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,.85fr)]">
      <section className="surface rounded-[22px] p-5 sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-primary">Antes de activar</p><h2 className="mt-1 text-[17px] font-semibold">Simulador de conversación</h2><p className="mt-1 text-xs text-muted-foreground">Prueba cómo responde el bot con tus preguntas frecuentes. Esta vista no contacta a clientes.</p></div><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><MessageCircle size={18} /></span></div>
        <div className="min-h-[330px] space-y-3 rounded-2xl bg-[hsl(36_33%_94%)] p-4 dark:bg-muted/40">{messages.map((message, index) => <div key={`${message.from}-${index}`} className={`flex ${message.from === 'client' ? 'justify-end' : 'justify-start'}`} data-testid={`message-simulator-${index}`}><div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${message.from === 'client' ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md bg-card text-foreground shadow-sm'}`}>{message.text}<div className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${message.from === 'client' ? 'text-primary-foreground/65' : 'text-muted-foreground'}`}><span>10:24</span>{message.from === 'client' && <CheckCheck size={12} />}</div></div></div>)}</div>
        <div className="mt-3 flex gap-2"><input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') send(); }} className={`${inputClass} flex-1`} placeholder="Escribe una pregunta para probar..." aria-label="Mensaje de simulación" data-testid="input-simulator-message" /><Button onClick={send} className="h-10 w-10 px-0" aria-label="Enviar mensaje" data-testid="button-send-simulator"><Send size={15} /></Button></div>
      </section>

      <section className="surface rounded-[22px] p-5 sm:p-6">
        <div className="mb-5 flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/35 text-[hsl(32_44%_30%)]"><Globe2 size={17} /></span><div><h2 className="text-[15px] font-semibold">Lo que Meta necesita</h2><p className="mt-1 text-xs text-muted-foreground">Ten estos datos a mano al completar la configuración.</p></div></div>
        <div className="space-y-3">
          {[{ icon: <Link2 size={15} />, title: 'URL pública', detail: 'La URL completa del webhook debe ser accesible desde internet.' }, { icon: <Code2 size={15} />, title: 'Ruta fija', detail: webhookPath }, { icon: <FileKey2 size={15} />, title: 'Token de verificación', detail: 'Usa el valor almacenado en Replit Secrets; no lo compartas aquí.' }].map((item) => <div key={item.title} className="flex gap-3 rounded-xl bg-muted/45 p-3"><span className="mt-0.5 text-primary">{item.icon}</span><div className="min-w-0"><p className="text-xs font-semibold">{item.title}</p><p className="mt-1 break-words text-[11px] leading-relaxed text-muted-foreground">{item.detail}</p></div></div>)}
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-primary/15 bg-primary/5 p-3 text-[11px] leading-relaxed text-muted-foreground"><Info size={14} className="mt-0.5 shrink-0 text-primary" />Cuando Meta confirme la verificación, vuelve aquí y registra la prueba final.</div>
      </section>
    </section>
  </AppShell>;
}