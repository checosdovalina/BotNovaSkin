import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetReceptionPushKeyQueryKey, getGetReceptionAlternateAlertQueryKey, useGetReceptionAlternateAlert, useUpdateReceptionAlternateAlert, useDeleteReceptionAlternateAlert, useGetReceptionPushKey, useSubscribeReceptionPush, useUnsubscribeReceptionPush } from '@workspace/api-client-react';
import { Button } from '@/components/common';

const supported = typeof window !== 'undefined' && window.isSecureContext &&
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function decodeBase64Url(input: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - input.length % 4) % 4);
  const bytes = atob((input + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bytes, (char) => char.charCodeAt(0));
}

function WhatsappAlertSettings() {
  const client = useQueryClient();
  const alert = useGetReceptionAlternateAlert();
  const update = useUpdateReceptionAlternateAlert();
  const remove = useDeleteReceptionAlternateAlert();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const busy = update.isPending || remove.isPending;

  useEffect(() => {
    if (alert.data?.phone && !editing) setPhone(alert.data.phone);
  }, [alert.data?.phone, editing]);

  const save = async () => {
    setError('');
    if (!/^[1-9][0-9]{7,14}$/.test(phone)) {
      setError('Introduce entre 8 y 15 dígitos con código de país, sin espacios ni signo +.');
      return;
    }
    try {
      const result = await update.mutateAsync({ data: { phone } });
      client.setQueryData(getGetReceptionAlternateAlertQueryKey(), result);
      setEditing(false);
    } catch {
      setError('No se pudieron activar los avisos por WhatsApp.');
    }
  };
  const disable = async () => {
    setError('');
    try {
      await remove.mutateAsync();
      client.setQueryData(getGetReceptionAlternateAlertQueryKey(), { enabled: false, available: alert.data?.available ?? false });
      setPhone('');
      setEditing(false);
    } catch {
      setError('No se pudieron desactivar los avisos por WhatsApp.');
    }
  };

  return <div className="mt-4 border-t border-border pt-4">
    <p className="text-sm font-semibold">Canal alternativo: WhatsApp</p>
    <p className="mt-1 text-xs text-muted-foreground">Opcional e independiente del navegador. Recibirás solo un aviso genérico con enlace a la bandeja protegida, sin nombres, teléfonos ni mensajes de clientes. Pueden aplicar las condiciones de entrega de WhatsApp.</p>
    {alert.isLoading ? <p className="mt-2 text-xs text-muted-foreground">Consultando configuración…</p> :
      alert.isError ? <p role="alert" className="mt-2 text-xs text-destructive">No se pudo consultar este canal. Vuelve a cargar la página.</p> :
      <>
        {!alert.data?.available && <p className="mt-2 text-xs text-muted-foreground">Este canal aún no está configurado por el administrador.</p>}
        {alert.data?.enabled && !editing && <p className="mt-2 text-xs">Activado para {alert.data.phone}. Puedes desactivarlo cuando quieras.</p>}
        {alert.data?.available && (!alert.data.enabled || editing) && <div className="mt-3 flex flex-wrap items-center gap-2">
          <label htmlFor="reception-alert-phone" className="text-xs">Tu WhatsApp (con código de país)</label>
          <input id="reception-alert-phone" type="tel" inputMode="numeric" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="5215512345678" maxLength={15} className="h-9 rounded-md border border-border bg-background px-3 text-sm" />
          <Button variant="secondary" className="h-9 text-xs" disabled={busy} onClick={() => void save()}>{alert.data.enabled ? 'Guardar número' : 'Activar WhatsApp'}</Button>
        </div>}
        {alert.data?.enabled && <div className="mt-3 flex flex-wrap gap-2">
          {alert.data.available && !editing && <Button variant="secondary" className="h-9 text-xs" disabled={busy} onClick={() => setEditing(true)}>Cambiar número</Button>}
          <Button variant="secondary" className="h-9 text-xs" disabled={busy} onClick={() => void disable()}>Desactivar WhatsApp</Button>
        </div>}
      </>}
    {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
  </div>;
}

export function ReceptionPushSettings() {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const key = useGetReceptionPushKey({ query: { queryKey: getGetReceptionPushKeyQueryKey(), enabled: supported, retry: false } });
  const subscribe = useSubscribeReceptionPush();
  const unsubscribe = useUnsubscribeReceptionPush();
  const workerUrl = `${import.meta.env.BASE_URL}reception-push-sw.js`;

  useEffect(() => {
    if (!supported || !key.data) return;
    let active = true;
    navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)
      .then((registration) => registration?.pushManager.getSubscription())
      .then((subscription) => { if (active) setEnabled(Boolean(subscription) && Notification.permission === 'granted'); })
      .catch(() => { if (active) setError('No se pudo consultar el estado de los avisos.'); });
    return () => { active = false; };
  }, [key.data]);

  const enable = async () => {
    setBusy(true);
    setError('');
    try {
      if (!key.data) throw new Error('No se pudo obtener la clave de notificaciones.');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('El navegador no permitió los avisos. Puedes cambiar el permiso en sus ajustes.');
      const registration = await navigator.serviceWorker.register(workerUrl, { scope: import.meta.env.BASE_URL });
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeBase64Url(key.data.publicKey),
      });
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error('Suscripción incompleta.');
      await subscribe.mutateAsync({ data: { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } } });
      setEnabled(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron activar los avisos.');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setError('');
    try {
      const registration = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await unsubscribe.mutateAsync({ data: { endpoint: subscription.endpoint } });
        await subscription.unsubscribe();
      }
      setEnabled(false);
    } catch {
      setError('No se pudieron desactivar los avisos. Vuelve a intentarlo.');
    } finally {
      setBusy(false);
    }
  };

  return <div className="mt-4 rounded-xl border border-border bg-muted/20 p-4">
    <p className="text-sm font-semibold">Avisos en segundo plano</p>
    <p className="mt-1 text-xs text-muted-foreground">
      {supported
        ? 'Opcional: recibe un aviso genérico de nuevas derivaciones en este dispositivo aunque cierres la pestaña. No incluye mensajes ni teléfonos. La entrega depende del navegador y sus permisos.'
        : 'Este navegador no admite avisos en segundo plano o no está en una conexión segura. Los avisos dentro de la bandeja siguen disponibles.'}
    </p>
    {supported && (key.isError ? <p className="mt-2 text-xs text-destructive">No se pudo configurar este canal de avisos.</p> :
      <Button variant="secondary" className="mt-3 h-9 text-xs" disabled={busy || key.isLoading} onClick={() => void (enabled ? disable() : enable())}>
        {enabled ? <BellOff size={15} /> : <Bell size={15} />}{enabled ? 'Desactivar en este dispositivo' : 'Activar en este dispositivo'}
      </Button>)}
    {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
    <p className="mt-2 text-xs text-muted-foreground">En la app: contador y aviso mientras esta bandeja está abierta. En segundo plano: notificación del navegador si la activas aquí.</p>
    <WhatsappAlertSettings />
  </div>;
}