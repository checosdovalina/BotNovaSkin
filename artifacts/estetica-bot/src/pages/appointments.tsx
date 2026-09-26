import { useMemo, useState, type FormEvent } from 'react';
import { CalendarDays, Check, Clock3, MessageCircle, Pencil, Phone, Plus, Search, UserRound, X } from 'lucide-react';
import {
  AppointmentStatus,
  getGetAvailabilityQueryKey,
  getGetDashboardQueryKey,
  getListAppointmentsQueryKey,
  getListServicesQueryKey,
  useCreateAppointment,
  useGetAvailability,
  useListAppointments,
  useListServices,
  useUpdateAppointment,
  type Appointment,
  type AppointmentStatus as AppointmentStatusType,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/shell';
import { Button, EmptyState, ErrorState, Field, LoadingRows, Modal, PageHeader, SavingButton, SelectChevron, StatusPill, inputClass, textareaClass } from '@/components/common';
import { useToast } from '@/hooks/use-toast';

type FormState = {
  clientName: string;
  phone: string;
  serviceId: string;
  area: string;
  scheduledDate: string;
  scheduledTime: string;
  status: AppointmentStatusType;
  notes: string;
};

const emptyForm: FormState = {
  clientName: '',
  phone: '',
  serviceId: '',
  area: '',
  scheduledDate: new Date().toISOString().slice(0, 10),
  scheduledTime: '',
  status: AppointmentStatus.pending,
  notes: '',
};

const statusOptions: Array<{ value: AppointmentStatusType; label: string }> = [
  { value: AppointmentStatus.pending, label: 'Pendiente' },
  { value: AppointmentStatus.confirmed, label: 'Confirmada' },
  { value: AppointmentStatus.completed, label: 'Completada' },
  { value: AppointmentStatus.cancelled, label: 'Cancelada' },
];

function formatAppointmentDate(value: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }) {
  return new Intl.DateTimeFormat('es-MX', options).format(new Date(`${value}T12:00:00`));
}

function appointmentMessage(appointment: Appointment) {
  return `Hola ${appointment.clientName}, te saludamos de NOVA SKIN MED para confirmar tu cita de ${appointment.serviceName} el ${formatAppointmentDate(appointment.scheduledDate)} a las ${appointment.scheduledTime}. ¿Nos confirmas que te esperamos?`;
}

function whatsAppNumber(phone: string) {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 ? `52${digits}` : digits;
}

function AppointmentEditor({ appointment, onClose }: { appointment?: Appointment; onClose: () => void }) {
  const [form, setForm] = useState<FormState>(appointment ? {
    clientName: appointment.clientName,
    phone: appointment.phone,
    serviceId: String(appointment.serviceId),
    area: appointment.area,
    scheduledDate: appointment.scheduledDate,
    scheduledTime: appointment.scheduledTime,
    status: appointment.status,
    notes: appointment.notes ?? '',
  } : emptyForm);
  const services = useListServices({ query: { queryKey: getListServicesQueryKey() } });
  const client = useQueryClient();
  const { toast } = useToast();
  const create = useCreateAppointment();
  const update = useUpdateAppointment();
  const availability = useGetAvailability(
    { date: form.scheduledDate, serviceId: Number(form.serviceId) || 0 },
    {
      query: {
        enabled: Boolean(form.scheduledDate && form.serviceId),
        queryKey: getGetAvailabilityQueryKey({ date: form.scheduledDate, serviceId: Number(form.serviceId) || 0 }),
      },
    },
  );
  const pending = create.isPending || update.isPending;
  const change = (key: keyof FormState, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const data = {
      clientName: form.clientName.trim(),
      phone: form.phone.trim(),
      serviceId: Number(form.serviceId),
      area: form.area.trim(),
      scheduledDate: form.scheduledDate,
      scheduledTime: form.scheduledTime,
      status: form.status,
      notes: form.notes.trim(),
    };
    const options = {
      onSuccess: () => {
        void client.invalidateQueries({ queryKey: getListAppointmentsQueryKey() });
        void client.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        toast({ title: appointment ? 'Cita actualizada' : 'Cita creada', description: 'La agenda se actualizó correctamente.' });
        onClose();
      },
      onError: () => toast({ title: 'No se pudo guardar la cita', description: 'Verifica los datos e intenta de nuevo.', variant: 'destructive' as const }),
    };
    if (appointment) update.mutate({ id: appointment.id, data }, options);
    else create.mutate({ data }, options);
  };

  return <Modal
    title={appointment ? 'Editar cita' : 'Nueva cita'}
    description="Agrega los detalles para que recepción tenga todo a la mano."
    onClose={onClose}
    wide
  >
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre de cliente">
          <input required value={form.clientName} onChange={(event) => change('clientName', event.target.value)} className={`${inputClass} h-11`} placeholder="Nombre completo" data-testid="input-appointment-client" />
        </Field>
        <Field label="WhatsApp">
          <input required minLength={7} type="tel" inputMode="tel" value={form.phone} onChange={(event) => change('phone', event.target.value)} className={`${inputClass} h-11`} placeholder="+52 871 000 0000" data-testid="input-appointment-phone" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tratamiento">
          <div className="relative">
            <select required value={form.serviceId} onChange={(event) => change('serviceId', event.target.value)} className={`${inputClass} h-11 appearance-none`} data-testid="select-appointment-service">
              <option value="">Selecciona un tratamiento</option>
              {(services.data ?? []).map((service) => <option key={service.id} value={service.id}>{service.name} · ${service.price.toLocaleString('es-MX')}</option>)}
            </select>
            <SelectChevron />
          </div>
        </Field>
        <Field label="Área o especialista">
          <input required value={form.area} onChange={(event) => change('area', event.target.value)} className={`${inputClass} h-11`} placeholder="Cabina 1, facialista..." data-testid="input-appointment-area" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Fecha">
          <input required type="date" value={form.scheduledDate} onChange={(event) => change('scheduledDate', event.target.value)} className={`${inputClass} h-11`} data-testid="input-appointment-date" />
        </Field>
        <Field label="Hora">
          <div className="relative">
            <select required value={form.scheduledTime} onChange={(event) => change('scheduledTime', event.target.value)} className={`${inputClass} h-11 appearance-none`} data-testid="select-appointment-time">
              <option value="">Selecciona hora</option>
              {(availability.data ?? []).filter((slot) => slot.available || slot.time === form.scheduledTime).map((slot) => <option key={slot.time} value={slot.time}>{slot.time}</option>)}
            </select>
            <SelectChevron />
          </div>
        </Field>
        <Field label="Estado">
          <div className="relative">
            <select value={form.status} onChange={(event) => change('status', event.target.value)} className={`${inputClass} h-11 appearance-none`} data-testid="select-appointment-status">
              {statusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
            </select>
            <SelectChevron />
          </div>
        </Field>
      </div>
      {form.serviceId && availability.isLoading && <p className="text-xs text-muted-foreground">Buscando horarios disponibles...</p>}
      {form.serviceId && !availability.isLoading && availability.data?.length === 0 && <p className="rounded-xl bg-accent/20 p-3 text-xs text-[hsl(32_44%_30%)]">No hay horarios publicados para esta fecha. Puedes escribir una hora manualmente en la agenda después.</p>}
      <Field label="Notas" hint="Opcional">
        <textarea value={form.notes} onChange={(event) => change('notes', event.target.value)} className={textareaClass} placeholder="Preferencias, indicaciones o contexto de la conversación." data-testid="input-appointment-notes" />
      </Field>
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" className="h-11" onClick={onClose} data-testid="button-cancel-appointment">Cancelar</Button>
        <SavingButton pending={pending}>{appointment ? 'Guardar cambios' : 'Crear cita'}</SavingButton>
      </div>
    </form>
  </Modal>;
}

function AppointmentMessageDialog({ appointment, onClose }: { appointment: Appointment; onClose: () => void }) {
  const [message, setMessage] = useState(() => appointmentMessage(appointment));
  const phone = whatsAppNumber(appointment.phone);
  const hasValidPhone = phone.length >= 7;
  const whatsAppUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message.trim())}`;

  return <Modal
    title="Enviar mensaje"
    description={`Para ${appointment.clientName} · ${appointment.phone}`}
    onClose={onClose}
  >
    <div className="space-y-4">
      <label htmlFor="appointment-message" className="block space-y-1.5">
        <span className="text-[11px] font-bold uppercase tracking-[.1em] text-muted-foreground">Mensaje</span>
        <textarea
          id="appointment-message"
          required
          maxLength={2000}
          rows={5}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          className={`${textareaClass} min-h-32`}
          data-testid="input-appointment-message"
        />
      </label>
      <p className="rounded-xl border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
        Se abrirá WhatsApp con el mensaje listo. Revísalo y envíalo desde WhatsApp; no se manda automáticamente.
      </p>
      {!hasValidPhone && <p role="alert" className="text-xs text-destructive">El teléfono no parece tener suficientes dígitos para abrir WhatsApp.</p>}
      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" className="h-11" onClick={onClose} data-testid="button-cancel-appointment-message">Cancelar</Button>
        <a
          href={whatsAppUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!hasValidPhone || !message.trim()}
          onClick={(event) => {
            if (!hasValidPhone || !message.trim()) event.preventDefault();
          }}
          className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-[13px] font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${!hasValidPhone || !message.trim() ? 'pointer-events-none opacity-50' : ''}`}
          data-testid="link-open-appointment-whatsapp"
        >
          <MessageCircle size={16} />Abrir WhatsApp
        </a>
      </div>
    </div>
  </Modal>;
}

function AppointmentCard({
  appointment,
  onEdit,
  onMessage,
  onStatusChange,
}: {
  appointment: Appointment;
  onEdit: () => void;
  onMessage: () => void;
  onStatusChange: (status: AppointmentStatusType) => void;
}) {
  return <article className="surface rounded-2xl p-4 transition-shadow hover:shadow-sm sm:p-5" data-testid={`row-appointment-${appointment.id}`}>
    <div className="flex min-w-0 items-start gap-3 sm:gap-4">
      <div className="flex w-[68px] shrink-0 flex-col items-center rounded-2xl bg-secondary px-2 py-3 text-center text-primary sm:w-[76px]">
        <Clock3 size={15} className="mb-1.5 opacity-75" aria-hidden="true" />
        <span className="text-sm font-bold leading-tight">{appointment.scheduledTime}</span>
        <span className="mt-1 text-[10px] font-medium leading-tight">{formatAppointmentDate(appointment.scheduledDate, { day: 'numeric', month: 'short' })}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="mt-0.5 hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/35 text-primary sm:flex" aria-hidden="true">
              <UserRound size={16} />
            </span>
            <div className="min-w-0">
              <h2 className="break-words text-sm font-semibold leading-5 sm:text-[15px]" data-testid={`text-appointment-client-${appointment.id}`}>{appointment.clientName}</h2>
              <a href={`tel:${appointment.phone}`} className="mt-1 inline-flex min-h-6 max-w-full items-center gap-1.5 break-all text-xs text-muted-foreground hover:text-primary" data-testid={`link-call-appointment-${appointment.id}`}>
                <Phone size={12} className="shrink-0" aria-hidden="true" />{appointment.phone}
              </a>
            </div>
          </div>
          <div className="hidden sm:block"><StatusPill status={appointment.status} /></div>
        </div>
        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="font-medium text-foreground">{appointment.serviceName}</span>
          <span className="hidden text-muted-foreground sm:inline" aria-hidden="true">·</span>
          <span className="text-muted-foreground">{appointment.area}</span>
        </div>
        <div className="mt-2 sm:hidden"><StatusPill status={appointment.status} /></div>
      </div>
    </div>

    <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
      <Button variant="secondary" className="col-span-2 h-11 w-full sm:col-span-1 sm:w-auto" onClick={onMessage} data-testid={`button-message-appointment-${appointment.id}`}>
        <MessageCircle size={15} />Enviar mensaje
      </Button>
      <Button variant="ghost" className="h-11 w-full sm:w-auto" onClick={onEdit} data-testid={`button-edit-appointment-${appointment.id}`}>
        <Pencil size={14} />Editar
      </Button>
      {appointment.status !== AppointmentStatus.confirmed && <Button
        variant="ghost"
        className="h-11 w-full px-2 text-primary sm:w-11"
        onClick={() => onStatusChange(AppointmentStatus.confirmed)}
        aria-label={`Confirmar cita de ${appointment.clientName}`}
        title="Confirmar cita"
        data-testid={`button-confirm-appointment-${appointment.id}`}
      >
        <Check size={16} /><span className="sm:hidden">Confirmar</span>
      </Button>}
      {appointment.status !== AppointmentStatus.cancelled && <Button
        variant="ghost"
        className="h-11 w-full px-2 text-destructive sm:w-11"
        onClick={() => onStatusChange(AppointmentStatus.cancelled)}
        aria-label={`Cancelar cita de ${appointment.clientName}`}
        title="Cancelar cita"
        data-testid={`button-cancel-appointment-${appointment.id}`}
      >
        <X size={16} /><span className="sm:hidden">Cancelar</span>
      </Button>}
    </div>
  </article>;
}

export default function Appointments() {
  const [date, setDate] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<Appointment | 'new' | null>(null);
  const [messageAppointment, setMessageAppointment] = useState<Appointment | null>(null);
  const params = { ...(date ? { from: date, to: date } : {}), ...(status ? { status: status as AppointmentStatusType } : {}) };
  const query = useListAppointments(params, { query: { queryKey: getListAppointmentsQueryKey(params) } });
  const update = useUpdateAppointment();
  const client = useQueryClient();
  const { toast } = useToast();
  const appointments = useMemo(
    () => (query.data ?? []).filter((item) => `${item.clientName} ${item.phone} ${item.serviceName}`.toLowerCase().includes(search.toLowerCase())),
    [query.data, search],
  );
  const hasFilters = Boolean(search || date || status);

  const setAppointmentStatus = (appointment: Appointment, next: AppointmentStatusType) => {
    update.mutate({ id: appointment.id, data: { status: next } }, {
      onSuccess: () => {
        void client.invalidateQueries({ queryKey: getListAppointmentsQueryKey(params) });
        void client.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        toast({ title: 'Estado actualizado' });
      },
      onError: () => toast({ title: 'No se pudo actualizar el estado', variant: 'destructive' as const }),
    });
  };

  return <AppShell>
    <PageHeader
      eyebrow="Ritmo de la clínica"
      title="Agenda de citas"
      description="Organiza las próximas visitas y contacta a cada cliente desde su cita."
      action={<Button className="h-11 w-full sm:w-auto" onClick={() => setEditor('new')} data-testid="button-new-appointment"><Plus size={16} />Nueva cita</Button>}
    />

    <div className="surface mb-5 grid gap-3 rounded-2xl p-3 sm:p-4 md:grid-cols-[minmax(150px,190px)_minmax(150px,200px)_minmax(220px,1fr)]">
      <label className="min-w-0 space-y-1.5">
        <span className="text-[10px] font-bold uppercase tracking-[.1em] text-muted-foreground">Fecha</span>
        <span className="relative block">
          <CalendarDays size={15} className="pointer-events-none absolute left-3 top-3.5 text-muted-foreground" aria-hidden="true" />
          <input id="filter-appointment-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} className={`${inputClass} h-11 pl-9`} data-testid="input-filter-date" />
        </span>
      </label>
      <label className="min-w-0 space-y-1.5">
        <span className="text-[10px] font-bold uppercase tracking-[.1em] text-muted-foreground">Estado</span>
        <span className="relative block">
          <select value={status} onChange={(event) => setStatus(event.target.value)} className={`${inputClass} h-11 appearance-none`} data-testid="select-filter-status">
            <option value="">Todos los estados</option>
            {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <SelectChevron />
        </span>
      </label>
      <label className="min-w-0 space-y-1.5">
        <span className="text-[10px] font-bold uppercase tracking-[.1em] text-muted-foreground">Buscar cliente o tratamiento</span>
        <span className="relative block">
          <Search size={15} className="pointer-events-none absolute left-3 top-3.5 text-muted-foreground" aria-hidden="true" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} className={`${inputClass} h-11 pl-9`} placeholder="Nombre o teléfono" data-testid="input-search-appointments" />
        </span>
      </label>
    </div>

    <div className="mb-3 flex min-h-8 flex-wrap items-center justify-between gap-2">
      <p className="text-xs font-medium text-muted-foreground" aria-live="polite" data-testid="text-appointment-count">
        {query.isLoading ? 'Cargando agenda…' : `${appointments.length} ${appointments.length === 1 ? 'cita' : 'citas'}${hasFilters ? ' encontradas' : ''}`}
      </p>
      {hasFilters && <Button
        variant="ghost"
        className="h-9 px-3 text-xs"
        onClick={() => { setDate(''); setStatus(''); setSearch(''); }}
        data-testid="button-clear-appointment-filters"
      >
        Limpiar filtros
      </Button>}
    </div>

    {query.isLoading
      ? <LoadingRows count={4} />
      : query.isError
        ? <ErrorState onRetry={() => void query.refetch()} />
        : appointments.length === 0
          ? <EmptyState
            title={hasFilters ? 'No hay citas con estos filtros' : 'Tu agenda está lista'}
            description={hasFilters ? 'Prueba quitando algún filtro para ampliar la búsqueda.' : 'Las citas que lleguen desde WhatsApp o que agregues manualmente aparecerán aquí.'}
            action={!hasFilters && <Button className="h-11" onClick={() => setEditor('new')} data-testid="button-empty-appointment"><Plus size={15} />Crear primera cita</Button>}
          />
          : <section className="space-y-3" aria-label="Citas de la agenda" data-testid="list-appointments">
            {appointments.map((appointment) => <AppointmentCard
              key={appointment.id}
              appointment={appointment}
              onEdit={() => setEditor(appointment)}
              onMessage={() => setMessageAppointment(appointment)}
              onStatusChange={(next) => setAppointmentStatus(appointment, next)}
            />)}
          </section>}

    {editor && <AppointmentEditor appointment={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)} />}
    {messageAppointment && <AppointmentMessageDialog appointment={messageAppointment} onClose={() => setMessageAppointment(null)} />}
  </AppShell>;
}