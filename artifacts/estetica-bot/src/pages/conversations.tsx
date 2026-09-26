import { AppShell } from '@/components/shell';
import { PageHeader } from '@/components/common';
import { ReceptionInbox } from '@/components/reception-inbox';

export default function Conversations() {
  return <AppShell>
    <PageHeader
      eyebrow="Atención · WhatsApp Cloud API"
      title="Conversaciones"
      description="Responde desde cualquier chat existente y marca contactos como leads para darles seguimiento."
    />
    <ReceptionInbox />
  </AppShell>;
}