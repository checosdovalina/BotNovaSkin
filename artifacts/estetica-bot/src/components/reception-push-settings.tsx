import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { getGetReceptionPushKeyQueryKey, useGetReceptionPushKey, useSubscribeReceptionPush, useUnsubscribeReceptionPush } from '@workspace/api-client-react';
import { Button } from '@/components/common';

const supported = typeof window !== 'undefined' && window.isSecureContext &&
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function decodeBase64Url(input: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - input.length % 4) % 4);
  const bytes = atob((input + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bytes, (char) => char.charCodeAt(0));
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
  </div>;
}