import { AlertCircle, ArrowLeft, ArrowUpRight, Bot, Check, ChevronRight, Clock3, Inbox, LockKeyhole, MessageCircle, RefreshCw, Search, Send, UserRound, WifiOff, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getListBotConversationsQueryKey, getListBotConversationMessagesQueryKey, useListBotConversations, useListBotConversationMessages, useSendBotConversationMessage, useUpdateBotConversation, type BotConversation, type BotConversationMessage, type ConversationStatus } from '@workspace/api-client-react';
import { Button } from '@/components/common';

type Filter = 'human' | 'bot' | 'closed' | 'all';
const filters: { value: Filter; label: string }[] = [
  { value: 'human', label: 'Recepción' },
  { value: 'bot', label: 'Bot' },
  { value: 'closed', label: 'Cerradas' },
  { value: 'all', label: 'Todas' },
];
const statusLabel: Record<ConversationStatus, string> = { human: 'En recepción', bot: 'Con el bot', closed: 'Cerrada' };
const dateTime = (date: string) => {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? 'Sin fecha' : parsed.toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};
const timeOnly = (date: string) => {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
};
const person = (conversation: BotConversation) => conversation.clientName?.trim() || conversation.phone;
const isSimulator = (conversation: BotConversation) => conversation.phone.toLowerCase().startsWith('simulator:');
const isFailed = (message: BotConversationMessage) => /fail|error|undeliver|rechaz/i.test(message.status);
const isBotMessage = (message: BotConversationMessage) => /generated|bot|automat|simulat/i.test(message.status);

function InboxSkeleton() {
  return <div className="space-y-2 p-3" aria-label="Cargando conversaciones">{[0, 1, 2, 3].map((n) => <div key={n} className="flex animate-pulse gap-3 rounded-xl p-3"><div className="h-10 w-10 shrink-0 rounded-full bg-muted" /><div className="flex-1 space-y-2 pt-1"><div className="h-3 w-2/3 rounded bg-muted" /><div className="h-2.5 w-full rounded bg-muted" /></div></div>)}</div>;
}

export function BotInbox({ connected, connectionLoading, connectionError }: { connected: boolean; connectionLoading: boolean; connectionError: boolean }) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('human');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mobileThread, setMobileThread] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [sendError, setSendError] = useState('');
  const [actionError, setActionError] = useState('');
  const [confirmStatus, setConfirmStatus] = useState<ConversationStatus | null>(null);
  const [now, setNow] = useState(Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);
  const listParams = filter === 'all' ? undefined : { status: filter as ConversationStatus };
  const list = useListBotConversations(listParams, { query: { queryKey: getListBotConversationsQueryKey(listParams), refetchInterval: 12000 } });
  const accessDenied = (list.error as { status?: number } | null)?.status === 403;
  const messages = useListBotConversationMessages(selectedId ?? 0, { query: { queryKey: getListBotConversationMessagesQueryKey(selectedId ?? 0), enabled: selectedId !== null, refetchInterval: 8000 } });
  const sendMessage = useSendBotConversationMessage();
  const updateConversation = useUpdateBotConversation();
  const conversations = useMemo(() => [...(list.data ?? [])].sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()), [list.data]);
  const visible = conversations.filter((item) => `${item.clientName ?? ''} ${item.phone} ${item.lastMessage}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const selected = conversations.find((item) => item.id === selectedId);
  const chronological = useMemo(() => [...(messages.data ?? [])].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id - b.id), [messages.data]);
  const latestInbound = [...chronological].reverse().find((message) => message.direction === 'inbound');
  const inboundAge = latestInbound ? now - new Date(latestInbound.createdAt).getTime() : Infinity;
  const withinWindow = inboundAge >= 0 && inboundAge < 24 * 60 * 60 * 1000;
  const canSend = Boolean(selected && selected.status === 'human' && connected && !isSimulator(selected) && !messages.isLoading && !messages.isError && withinWindow);
  const draft = selectedId === null ? '' : drafts[selectedId] ?? '';
  const unavailableReason = !selected ? '' : isSimulator(selected) ? 'Esta conversación pertenece al simulador. No se pueden enviar mensajes reales.' : connectionError ? 'No pudimos comprobar la conexión. Actualiza el estado del canal antes de responder.' : connectionLoading ? 'Comprobando la conexión de WhatsApp…' : !connected ? 'WhatsApp está desconectado. Los mensajes salientes no están disponibles.' : selected.status === 'closed' ? 'Conversación cerrada. Asígnala a recepción para continuar.' : selected.status === 'bot' ? 'El bot gestiona esta conversación. Asígnala a recepción para responder.' : messages.isLoading ? 'Comprobando el historial del cliente…' : messages.isError ? 'No se pudo comprobar la ventana de atención.' : !withinWindow ? 'Fuera de la ventana de 24 horas desde el último mensaje del cliente. No se puede enviar texto libre.' : '';

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [selectedId, chronological.length]);
  useEffect(() => {
    if (selectedId !== null && !list.isLoading && !list.isError && !selected) {
      setSelectedId(null);
      setMobileThread(false);
    }
  }, [selectedId, selected, list.isLoading, list.isError]);

  const refreshBoth = async (id: number) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getListBotConversationsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getListBotConversationMessagesQueryKey(id) }),
    ]);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!selectedId || !body || body.length > 2000 || !canSend || sendingRef.current || sendMessage.isPending) return;
    sendingRef.current = true;
    setSendError('');
    try {
      await sendMessage.mutateAsync({ id: selectedId, data: { body } });
      setDrafts((current) => ({ ...current, [selectedId]: current[selectedId] === draft ? '' : current[selectedId] ?? '' }));
      await refreshBoth(selectedId);
    } catch {
      setSendError('No se pudo enviar. Tu mensaje sigue aquí; comprueba la conexión y vuelve a intentarlo.');
    } finally {
      sendingRef.current = false;
    }
  };
  const changeStatus = async (newStatus: ConversationStatus) => {
    if (!selectedId || updateConversation.isPending || newStatus === selected?.status) return;
    setActionError('');
    try {
      await updateConversation.mutateAsync({ id: selectedId, data: { status: newStatus } });
      setFilter('all');
      setConfirmStatus(null);
      await refreshBoth(selectedId);
    } catch {
      setActionError('No se pudo cambiar el estado. La conversación no se modificó; inténtalo de nuevo.');
      setConfirmStatus(null);
    }
  };
  const openThread = (id: number) => {
    setSelectedId(id);
    setMobileThread(true);
    setSendError('');
    setActionError('');
    setConfirmStatus(null);
  };

  return <section id="bandeja-whatsapp" className="mb-8 overflow-hidden rounded-[24px] border border-border bg-card shadow-[0_12px_32px_hsl(166_24%_20%/.055)]" aria-labelledby="inbox-title">
    <div className="flex flex-col gap-4 border-b border-border bg-[hsl(37_40%_97%)] px-5 py-5 dark:bg-muted/20 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="flex items-center gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-primary text-primary-foreground"><Inbox size={20} strokeWidth={1.7} /></span>
        <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-primary">Atención en tiempo real</p><h2 id="inbox-title" className="serif mt-0.5 text-[23px] leading-tight tracking-[-.025em]">Bandeja de conversaciones</h2><p className="mt-1 text-xs text-muted-foreground">Responde con el contexto completo, desde el número conectado.</p></div>
      </div>
      <div className="flex items-center gap-2 self-start sm:self-auto">
        <span data-testid="status-inbox-connection" className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-[11px] font-semibold ${connected ? 'bg-primary/10 text-primary' : 'bg-accent/25 text-[hsl(32_44%_30%)]'}`}><span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-primary' : 'bg-[hsl(32_44%_40%)]'}`} />{connectionLoading ? 'Comprobando' : connected ? 'Canal conectado' : 'Canal sin conexión'}</span>
        <button type="button" onClick={() => void list.refetch()} disabled={list.isFetching} aria-label="Actualizar conversaciones" data-testid="button-refresh-inbox" className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"><RefreshCw size={15} className={list.isFetching ? 'animate-spin' : ''} /></button>
      </div>
    </div>
    <div className="grid min-h-[590px] md:grid-cols-[minmax(270px,340px)_minmax(0,1fr)] xl:grid-cols-[minmax(300px,370px)_minmax(0,1fr)]">
      <div className={`${mobileThread ? 'hidden md:flex' : 'flex'} min-h-[480px] flex-col border-r border-border`}>
        <div className="border-b border-border p-3.5">
          <div className="flex gap-1 overflow-x-auto pb-1" role="group" aria-label="Filtrar conversaciones">{filters.map((option) => <button type="button" key={option.value} onClick={() => { setFilter(option.value); setSearch(''); setSelectedId(null); setMobileThread(false); }} data-testid={`button-filter-${option.value}`} aria-pressed={filter === option.value} className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${filter === option.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>{option.label}</button>)}</div>
          <label className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-background px-3 focus-within:border-primary/50"><Search size={15} className="shrink-0 text-muted-foreground" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nombre, número o mensaje" aria-label="Buscar conversaciones" data-testid="input-search-conversations" className="h-9 min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/70" /></label>
        </div>
        <div className="max-h-[560px] flex-1 overflow-y-auto">
           {list.isLoading ? <InboxSkeleton /> : list.isError ? <div className="p-6 text-center"><AlertCircle size={20} className="mx-auto text-destructive" /><p className="mt-3 text-sm font-semibold">{accessDenied ? 'Cuenta sin acceso a recepción' : 'No se pudo cargar la bandeja'}</p><p className="mt-1 text-xs text-muted-foreground">{accessDenied ? 'Tu correo verificado debe figurar en la lista de personal autorizado. Pide acceso al responsable del panel.' : 'Tu historial sigue a salvo. Vuelve a intentarlo.'}</p>{!accessDenied && <Button variant="secondary" className="mt-4 h-9 text-xs" onClick={() => void list.refetch()} data-testid="button-retry-inbox">Reintentar</Button>}</div> : visible.length === 0 ? <div className="flex flex-col items-center px-7 py-16 text-center"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary"><MessageCircle size={21} /></span><p className="mt-4 text-sm font-semibold">{search ? 'Sin resultados' : filter === 'human' ? 'Todo está al día' : 'No hay conversaciones aquí'}</p><p className="mt-1 max-w-[230px] text-xs leading-relaxed text-muted-foreground">{search ? 'Prueba con otro nombre, número o palabra.' : filter === 'human' ? 'Las conversaciones que necesiten a recepción aparecerán aquí.' : 'Cuando haya actividad en este estado, la verás en esta lista.'}</p></div> : visible.map((item) => <button type="button" key={item.id} onClick={() => openThread(item.id)} data-testid={`button-open-conversation-${item.id}`} aria-current={selectedId === item.id ? 'true' : undefined} className={`group flex w-full gap-3 border-b border-border/70 px-4 py-4 text-left transition-colors hover:bg-secondary/35 ${selectedId === item.id ? 'bg-primary/[0.065] shadow-[inset_3px_0_0_hsl(var(--primary))]' : ''}`}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-primary">{person(item).slice(0, 1).toUpperCase()}</span>
            <span className="min-w-0 flex-1"><span className="flex items-baseline justify-between gap-2"><span className="truncate text-[13px] font-semibold text-foreground" data-testid={`text-conversation-name-${item.id}`}>{person(item)}</span><time className="shrink-0 text-[10px] text-muted-foreground">{dateTime(item.lastMessageAt)}</time></span><span className="mt-1 block truncate text-xs text-muted-foreground">{item.lastMessage || 'Sin mensajes todavía'}</span><span className="mt-2 flex items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${item.status === 'human' ? 'bg-accent/30 text-[hsl(32_44%_30%)]' : item.status === 'bot' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>{statusLabel[item.status]}</span><span className="text-[10px] text-muted-foreground">{item.messageCount} mensajes</span></span></span><ChevronRight size={15} className="mt-3 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 md:hidden" />
          </button>)}
        </div>
        <div className="border-t border-border px-4 py-3 text-[10px] text-muted-foreground">Actualización automática · cada 12 segundos</div>
      </div>
      <div className={`${mobileThread ? 'flex' : 'hidden md:flex'} min-w-0 flex-col bg-[hsl(36_33%_96%)] dark:bg-background/50`}>
        {!selected ? <div className="flex min-h-[560px] flex-col items-center justify-center px-8 text-center"><span className="flex h-16 w-16 items-center justify-center rounded-[22px] border border-primary/15 bg-primary/5 text-primary"><MessageCircle size={27} strokeWidth={1.35} /></span><h3 className="serif mt-5 text-xl">Una conversación a la vez.</h3><p className="mt-2 max-w-[280px] text-xs leading-relaxed text-muted-foreground">Selecciona un hilo para leer el historial antes de responder o cambiar su estado.</p></div> : <>
          <div className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-3 sm:px-5">
            <button type="button" onClick={() => setMobileThread(false)} aria-label="Volver a conversaciones" data-testid="button-back-conversations" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted md:hidden"><ArrowLeft size={18} /></button>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold text-primary">{person(selected).slice(0, 1).toUpperCase()}</span>
            <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold" data-testid="text-selected-conversation-name">{person(selected)}</h3><p className="truncate text-[11px] text-muted-foreground">{isSimulator(selected) ? 'Sesión de simulación' : selected.phone} <span className="mx-1">·</span> {selected.messageCount} mensajes</p></div>
            <span data-testid="status-selected-conversation" className={`rounded-full px-2.5 py-1.5 text-[10px] font-bold ${selected.status === 'human' ? 'bg-accent/30 text-[hsl(32_44%_30%)]' : selected.status === 'bot' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>{statusLabel[selected.status]}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card/70 px-4 py-2.5 sm:px-5">
            <span className="mr-auto text-[11px] text-muted-foreground">Estado: <strong className="font-semibold text-foreground">{statusLabel[selected.status]}</strong></span>
            {selected.status !== 'human' && <button type="button" onClick={() => setConfirmStatus('human')} disabled={updateConversation.isPending} data-testid="button-assign-human" className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 px-2.5 py-1.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/5 disabled:opacity-50"><UserRound size={13} />Asignar a recepción</button>}
            {selected.status !== 'bot' && <button type="button" onClick={() => setConfirmStatus('bot')} disabled={updateConversation.isPending} data-testid="button-assign-bot" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"><Bot size={13} />Devolver al bot</button>}
            {selected.status !== 'closed' && <button type="button" onClick={() => setConfirmStatus('closed')} disabled={updateConversation.isPending} data-testid="button-close-conversation" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"><Check size={13} />Cerrar</button>}
          </div>
          {actionError && <div role="alert" className="flex items-start gap-2 border-b border-destructive/15 bg-destructive/5 px-5 py-2.5 text-xs text-destructive"><AlertCircle size={14} className="shrink-0" />{actionError}</div>}
          {confirmStatus && <div className="flex flex-wrap items-center gap-3 border-b border-primary/15 bg-secondary/60 px-4 py-3 text-xs sm:px-5"><p className="min-w-0 flex-1 leading-relaxed">{confirmStatus === 'closed' ? '¿Cerrar este hilo? Recepción dejará de poder responder hasta que se vuelva a asignar.' : confirmStatus === 'bot' ? '¿Devolver este hilo al bot? Recepción dejará de responder en esta conversación.' : '¿Asignar este hilo a recepción? Podrás responder si el canal y la ventana de 24 horas están disponibles.'}</p><Button className="h-8 px-3 text-[11px]" disabled={updateConversation.isPending} onClick={() => void changeStatus(confirmStatus)} data-testid="button-confirm-conversation-status">{updateConversation.isPending ? 'Guardando…' : 'Confirmar'}</Button><button type="button" onClick={() => setConfirmStatus(null)} aria-label="Cancelar cambio de estado" data-testid="button-cancel-conversation-status" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><X size={16} /></button></div>}
          <div ref={scrollRef} className="h-[370px] flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-7" aria-label="Historial de mensajes">
            {messages.isLoading ? <div className="space-y-5 animate-pulse"><div className="h-16 w-2/3 rounded-2xl bg-muted" /><div className="ml-auto h-14 w-1/2 rounded-2xl bg-muted" /><div className="h-20 w-3/5 rounded-2xl bg-muted" /></div> : messages.isError ? <div className="py-12 text-center"><AlertCircle size={19} className="mx-auto text-destructive" /><p className="mt-3 text-sm font-semibold">No se pudo cargar el historial</p><p className="mt-1 text-xs text-muted-foreground">No respondas sin revisar primero el contexto.</p><Button variant="secondary" className="mt-4 h-9 text-xs" onClick={() => void messages.refetch()} data-testid="button-retry-messages">Reintentar</Button></div> : chronological.length === 0 ? <div className="py-14 text-center"><MessageCircle size={22} className="mx-auto text-primary/50" /><p className="mt-3 text-sm font-semibold">Aún no hay mensajes</p><p className="mt-1 text-xs text-muted-foreground">El historial aparecerá aquí cuando el cliente escriba.</p></div> : chronological.map((message) => {
              const outgoing = message.direction === 'outbound';
              const failed = isFailed(message);
              const source = !outgoing ? 'Cliente' : isBotMessage(message) ? 'Bot' : 'Recepción';
              return <div key={message.id} className={`flex ${outgoing ? 'justify-end' : 'justify-start'}`} data-testid={`message-conversation-${message.id}`}><div className={`max-w-[88%] sm:max-w-[75%] ${outgoing ? 'text-right' : 'text-left'}`}><div className={`mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold ${outgoing ? 'justify-end text-primary' : 'text-muted-foreground'}`}>{outgoing ? isBotMessage(message) ? <Bot size={12} /> : <UserRound size={12} /> : <ArrowUpRight size={12} className="rotate-180" />}{source}</div><div className={`rounded-2xl px-3.5 py-2.5 text-left text-[13px] leading-relaxed shadow-sm ${failed ? 'border border-destructive/30 bg-destructive/5 text-foreground' : outgoing ? isBotMessage(message) ? 'rounded-br-md border border-primary/15 bg-secondary text-foreground' : 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md border border-border bg-card text-foreground'}`}><p className="whitespace-pre-wrap break-words">{message.body}</p></div><div className={`mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground ${outgoing ? 'justify-end' : ''}`}><time>{timeOnly(message.createdAt)}</time>{failed && <span className="font-semibold text-destructive">· Envío fallido</span>}</div></div></div>;
            })}
          </div>
          <div className="border-t border-border bg-card px-4 py-3.5 sm:px-5">
            {unavailableReason && <div data-testid="status-send-unavailable" className="mb-3 flex items-start gap-2 rounded-xl border border-accent/35 bg-accent/10 px-3 py-2.5 text-[11px] leading-relaxed text-[hsl(32_44%_30%)] dark:text-foreground">{!connected ? <WifiOff size={14} className="mt-0.5 shrink-0" /> : <LockKeyhole size={14} className="mt-0.5 shrink-0" />}{unavailableReason}</div>}
            {sendError && <div role="alert" data-testid="status-send-error" className="mb-3 flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-[11px] leading-relaxed text-destructive"><AlertCircle size={14} className="shrink-0" />{sendError}</div>}
            <form onSubmit={(event) => void submit(event)} className="flex items-end gap-2">
              <div className={`flex min-w-0 flex-1 rounded-xl border bg-background focus-within:border-primary/55 focus-within:ring-2 focus-within:ring-primary/10 ${canSend ? 'border-input' : 'border-border bg-muted/30'}`}><textarea value={draft} onChange={(event) => { setDrafts((current) => ({ ...current, [selected.id]: event.target.value })); if (sendError) setSendError(''); }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} disabled={!canSend || sendMessage.isPending} maxLength={2000} rows={2} placeholder={canSend ? 'Escribe una respuesta para el cliente…' : 'Envío no disponible'} aria-label="Respuesta para el cliente" data-testid="input-reply-conversation" className="max-h-36 min-h-[64px] w-full resize-y bg-transparent px-3 py-2.5 text-[13px] outline-none placeholder:text-muted-foreground/60 disabled:cursor-not-allowed" /></div>
              <button type="submit" disabled={!canSend || !draft.trim() || sendMessage.isPending} data-testid="button-send-conversation" aria-label="Enviar respuesta" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-[transform,opacity] hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"><Send size={16} /></button>
            </form>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-[10px] text-muted-foreground"><span className="flex items-center gap-1"><Clock3 size={11} />{canSend ? 'Ventana de atención activa · Enter para enviar, Shift + Enter para salto de línea' : 'Solo se envía dentro de las 24 h posteriores al mensaje del cliente'}</span><span>{draft.length}/2000</span></div>
          </div>
        </>}
      </div>
    </div>
  </section>;
}