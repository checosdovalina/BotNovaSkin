import { AppShell } from '@/components/shell';
import { PageHeader } from '@/components/common';
import { ReceptionInbox } from '@/components/reception-inbox';

export default function Conversations() {
  return <AppShell>
    <PageHeader
      eyebrow="Atención · WhatsApp Cloud API"
      title="Conversaciones"
      description="Revisa el historial del bot y atiende las solicitudes que necesitan una persona, desde el mismo chat."
    />
    <ReceptionInbox />
  </AppShell>;
}