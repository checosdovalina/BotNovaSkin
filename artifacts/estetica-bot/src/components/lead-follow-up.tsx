import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getListBotConversationsQueryKey, useUpdateBotConversationLead, type BotConversation } from '@workspace/api-client-react';
import { Button, inputClass } from '@/components/common';

function localDateTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function errorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = error.data;
    if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') return data.error;
  }
  return 'No se pudo guardar el seguimiento. Inténtalo de nuevo.';
}

export function LeadFollowUp({ conversation }: { conversation: BotConversation }) {
  const client = useQueryClient();
  const mutation = useUpdateBotConversationLead();
  const [note, setNote] = useState(conversation.leadNote ?? '');
  const [date, setDate] = useState(localDateTime(conversation.followUpAt));
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function save(isLead: boolean, leadNote: string | null, followUpAt: string | null) {
    setError('');
    setSuccess('');
    try {
      await mutation.mutateAsync({ id: conversation.id, data: { isLead, leadNote, followUpAt } });
      await client.invalidateQueries({ queryKey: getListBotConversationsQueryKey() });
      setSuccess(isLead ? 'Seguimiento guardado' : 'Marca de lead retirada');
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = date ? new Date(date) : null;
    if (date && (!parsed || Number.isNaN(parsed.getTime()))) {
      setError('Elige una fecha válida.');
      return;
    }
    void save(true, note.trim() || null, parsed?.toISOString() ?? null);
  }

  return <div className="border-b border-border bg-card/70 p-4" data-testid="lead-follow-up">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p className="text-xs font-semibold">{conversation.isLead ? 'Lead en seguimiento' : '¿Es un posible cliente?'}</p>
        <p className="text-[11px] text-muted-foreground">La marca de lead no cambia quién atiende este chat.</p>
      </div>
      <Button type="button" variant="secondary" className="h-8 px-3 text-xs" disabled={mutation.isPending}
        onClick={() => void save(!conversation.isLead, conversation.leadNote, conversation.followUpAt)}>
        {conversation.isLead ? 'Quitar marca de lead' : 'Marcar como lead'}
      </Button>
    </div>
    {conversation.isLead && <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(180px,.5fr)_auto] sm:items-end">
      <label className="text-[11px] font-semibold">Nota de seguimiento
        <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} rows={2}
          className={`${inputClass} mt-1 min-h-[62px] w-full resize-y`} placeholder="Próximo paso, interés o contexto" />
      </label>
      <label className="text-[11px] font-semibold">Próximo seguimiento (opcional)
        <input type="datetime-local" value={date} onChange={(event) => setDate(event.target.value)}
          className={`${inputClass} mt-1 w-full min-w-0`} />
      </label>
      <Button type="submit" className="h-9 text-xs" disabled={mutation.isPending || note.length > 2000}>Guardar</Button>
    </form>}
    {conversation.isLead && conversation.followUpAt && <p className="mt-2 text-[11px] text-muted-foreground">
      Programado para {new Date(conversation.followUpAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}. No se enviará un mensaje automáticamente.
    </p>}
    {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
    {success && <p role="status" className="mt-2 text-xs text-primary">{success}</p>}
  </div>;
}