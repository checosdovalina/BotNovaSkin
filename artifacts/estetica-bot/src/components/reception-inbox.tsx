import { useEffect, useRef, useState } from 'react';
import { SignOutButton } from '@clerk/react';
import { MessageCircle, RefreshCw, Send } from 'lucide-react';
import {
  getListBotConversationMessagesQueryKey,
  getListBotConversationsQueryKey,
  useListBotConversationMessages,
  useListBotConversations,
  useSendBotConversationMessage,
  useUpdateBotConversation,
} from '@workspace/api-client-react';
import { Button, ErrorState, inputClass } from '@/components/common';
import { useToast } from '@/hooks/use-toast';
import { ReceptionPushSettings } from './reception-push-settings';

function maskedPhone(phone: string) {
  if (phone.startsWith('simulator:')) return 'Simulador del panel';
  return phone.length > 4 ? `•••• ${phone.slice(-4)}` : phone;
}

function errorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = error.data;
    if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') return data.error;
  }
  return 'No se pudo completar la operación. Revisa la conexión e inténtalo de nuevo.';
}

export function ReceptionInbox() {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [filter, setFilter] = useState<'human' | 'all' | 'bot' | 'closed'>('human');
  const knownHandoffs = useRef<Set<number> | null>(null);
  const handoffs = useListBotConversations(undefined, {
    query: {
      queryKey: getListBotConversationsQueryKey(),
      retry: false,
      refetchInterval: 15000,
    },
  });
  const messages = useListBotConversationMessages(selectedId ?? 0, {
    query: {
      queryKey: getListBotConversationMessagesQueryKey(selectedId ?? 0),
      enabled: Boolean(selectedId),
      retry: false,
      refetchInterval: 5000,
    },
  });
  const send = useSendBotConversationMessage();
  const update = useUpdateBotConversation();
  const pending = handoffs.data?.filter((conversation) => conversation.status === 'human') ?? [];
  const filtered = (handoffs.data ?? []).filter((conversation) => filter === 'all' || conversation.status === filter);
  const selected = handoffs.data?.find((conversation) => conversation.id === selectedId);
  const lastInbound = messages.data?.filter((message) => message.direction === 'inbound').at(-1);
  const expired = lastInbound
    ? Date.now() - new Date(lastInbound.createdAt).getTime() >= 24 * 60 * 60 * 1000
    : true;
  const simulator = selected?.phone.startsWith('simulator:');

  useEffect(() => {
    if (!handoffs.data) return;
    const current = new Set(pending.map((conversation) => conversation.id));
    if (knownHandoffs.current) {
      const added = pending.filter((conversation) => !knownHandoffs.current?.has(conversation.id));
      if (added.length) toast({ title: `${added.length} nueva${added.length === 1 ? '' : 's'} solicitud${added.length === 1 ? '' : 'es'} para recepción`, description: 'Abre la bandeja para atenderla.' });
    }
    knownHandoffs.current = current;
  }, [handoffs.data, toast]);

  useEffect(() => {
    const original = document.title;
    document.title = pending.length ? `(${pending.length}) ${original}` : original;
    return () => { document.title = original; };
  }, [pending.length]);

  const refresh = async () => {
    await Promise.all([handoffs.refetch(), selectedId ? messages.refetch() : Promise.resolve()]);
  };
  const sendReply = async () => {
    const text = draft.trim();
    if (!selectedId || !text || send.isPending) return;
    try {
       await send.mutateAsync({ id: selectedId, data: { body: text } });
      setDraft('');
      await refresh();
      toast({ title: 'WhatsApp aceptó el mensaje' });
    } catch (error) {
      toast({ title: 'No se confirmó el envío', description: errorMessage(error), variant: 'destructive' });
    }
  };
  const close = async (id: number) => {
    try {
      await update.mutateAsync({ id, data: { status: 'closed' } });
      setSelectedId(null);
      await handoffs.refetch();
      toast({ title: 'Conversación cerrada' });
    } catch (error) {
      toast({ title: 'No se pudo cerrar', description: errorMessage(error), variant: 'destructive' });
    }
  };
  return <section className="mt-6 surface rounded-[22px] p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/35 text-[hsl(32_44%_30%)]"><MessageCircle size={18} /></span>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.16em] text-primary">Atención humana</p>
           <h2 className="mt-1 text-[17px] font-semibold">Conversaciones del bot y recepción {pending.length > 0 && <span className="ml-1 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">{pending.length} pendientes</span>}</h2>
           <p className="mt-1 text-xs text-muted-foreground">Consulta el historial; responde en el mismo chat cuando el cliente pida atención humana. El contador y los avisos en la app funcionan mientras esta página está abierta.</p>
        </div>
      </div>
       <div className="flex gap-2">
        <Button variant="secondary" className="h-9 px-3 text-xs" onClick={() => void refresh()} disabled={handoffs.isFetching}><RefreshCw size={14} />Actualizar</Button>
         <SignOutButton redirectUrl={`${import.meta.env.BASE_URL}conversations`}><Button variant="ghost" className="h-9 px-3 text-xs">Cerrar sesión</Button></SignOutButton>
       </div>
    </div>

     <ReceptionPushSettings />
    <div className="mt-5">
      {handoffs.isError ? <ErrorState onRetry={() => void handoffs.refetch()} message={errorMessage(handoffs.error)} /> : handoffs.isLoading ? <p className="text-sm text-muted-foreground">Cargando conversaciones…</p> : <div>
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filtrar conversaciones">
          {([['human', `Recepción (${pending.length})`], ['all', 'Todas'], ['bot', 'Bot'], ['closed', 'Atendidas']] as const).map(([value, label]) => <Button key={value} variant={filter === value ? 'secondary' : 'ghost'} className="h-8 px-3 text-xs" onClick={() => { setFilter(value); setSelectedId(null); }}>{label}</Button>)}
        </div>
        {filtered.length === 0 ? <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">No hay conversaciones en este filtro.</p> : <div className="grid gap-4 lg:grid-cols-[minmax(230px,.36fr)_minmax(0,1fr)]">
        <div className="max-h-[580px] space-y-2 overflow-y-auto" aria-label="Conversaciones pendientes">
          {filtered.map((conversation) => <button type="button" key={conversation.id} onClick={() => { setSelectedId(conversation.id); setDraft(''); }} className={`w-full rounded-xl border p-3 text-left transition-colors hover:bg-muted/50 ${selectedId === conversation.id ? 'border-primary bg-primary/5' : 'border-border'}`}>
            <div className="flex justify-between gap-2"><span className="text-sm font-semibold">{conversation.clientName || maskedPhone(conversation.phone)}</span><time className="shrink-0 text-[10px] text-muted-foreground">{new Date(conversation.lastMessageAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</time></div>
            <span className="text-[11px] text-muted-foreground">{maskedPhone(conversation.phone)} · {conversation.status === 'human' ? 'Espera recepción' : conversation.status === 'bot' ? 'Atiende bot' : 'Atendida'} · {conversation.messageCount} mensajes</span>
            <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{conversation.lastMessage}</p>
          </button>)}
        </div>
        <div className="min-w-0 rounded-xl border border-border">
          {!selected ? <p className="p-6 text-sm text-muted-foreground">Selecciona una conversación para ver los mensajes.</p> : <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
              <div><p className="text-sm font-semibold">{selected.clientName || maskedPhone(selected.phone)}</p><p className="text-xs text-muted-foreground">{maskedPhone(selected.phone)}</p></div>
              {selected.status === 'human' && <Button variant="secondary" className="h-8 text-xs" onClick={() => void close(selected.id)} disabled={update.isPending}>Marcar atendida</Button>}
            </div>
            <div className="max-h-[440px] min-h-[220px] space-y-3 overflow-y-auto bg-muted/20 p-4" aria-live="polite">
              {messages.isLoading ? <p className="text-sm text-muted-foreground">Cargando mensajes…</p> : messages.isError ? <ErrorState onRetry={() => void messages.refetch()} message={errorMessage(messages.error)} /> : messages.data?.map((message) => <div key={message.id} className={`flex ${message.direction === 'inbound' ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[85%] whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-sm ${message.direction === 'inbound' ? 'bg-card text-foreground' : 'bg-primary/10 text-foreground'}`}>
                  <p>{message.body}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{message.direction === 'inbound' ? 'Cliente' : message.status === 'sent' ? 'Recepción · aceptado por Meta' : 'Bot'} · {new Date(message.createdAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</p>
                </div>
              </div>)}
            </div>
            <form className="space-y-2 border-t border-border p-4" onSubmit={(event) => { event.preventDefault(); void sendReply(); }}>
              {selected.status !== 'human' ? <p className="text-xs text-muted-foreground">Solo puedes responder cuando esta conversación está asignada a recepción.</p> : simulator ? <p className="text-xs text-muted-foreground">Esta es una prueba del simulador; no se pueden enviar mensajes reales.</p> : expired ? <p className="text-xs text-[hsl(32_44%_30%)]">Pasaron más de 24 horas desde el último mensaje del cliente. Espera un nuevo mensaje para responder libremente.</p> : <p className="text-xs text-muted-foreground">Tu respuesta llegará al mismo chat de WhatsApp del cliente.</p>}
              {selected.status === 'human' && <div className="flex gap-2"><input aria-label="Respuesta de recepción" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} className={`${inputClass} min-w-0 flex-1`} placeholder="Escribe tu respuesta..." disabled={simulator || expired || send.isPending} /><Button type="submit" disabled={!draft.trim() || simulator || expired || send.isPending || messages.isLoading || messages.isError}><Send size={15} />Enviar</Button></div>}
            </form>
          </>}
        </div>
      </div>}
      </div>}
    </div>
  </section>;
}