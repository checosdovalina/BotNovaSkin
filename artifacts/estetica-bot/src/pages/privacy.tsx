import { useEffect } from 'react';
import { Mail, MapPin, MessageCircle, ShieldCheck } from 'lucide-react';

const sections = [
  {
    title: '1. Responsable del tratamiento de los datos',
    content: (
      <p>
        NovaSkin, con domicilio en Plaza Laguna Oriente, Av. Juarez Loc 43,
        Residencial las Torres Sector II, 27085 Torreón, Coah., es responsable
        del tratamiento y protección de los datos personales descritos en esta
        política.
      </p>
    ),
  },
  {
    title: '2. Datos que recopilamos',
    content: (
      <>
        <p>Podemos recopilar los siguientes datos cuando interactúas con nosotros:</p>
        <ul>
          <li>Nombre y número de teléfono o WhatsApp.</li>
          <li>Fecha, hora y tratamiento relacionado con una cita.</li>
          <li>Mensajes enviados al asistente de WhatsApp y solicitudes de atención.</li>
          <li>Datos técnicos necesarios para operar, proteger y mejorar el servicio.</li>
        </ul>
        <p>
          No solicitamos diagnósticos médicos por medio del bot. Si compartes
          información relacionada con síntomas, medicamentos, embarazo,
          reacciones o complicaciones, la conversación puede ser canalizada al
          personal de recepción o a un profesional.
        </p>
      </>
    ),
  },
  {
    title: '3. Finalidades del tratamiento',
    content: (
      <>
        <p>Utilizamos tus datos para:</p>
        <ul>
          <li>Responder preguntas sobre servicios, tratamientos y precios.</li>
          <li>Crear, confirmar, cancelar o reprogramar citas.</li>
          <li>Enviar confirmaciones y recordatorios relacionados con tus citas.</li>
          <li>Canalizar solicitudes que requieren atención humana.</li>
          <li>Prevenir abusos, resolver fallas y mantener la seguridad del servicio.</li>
        </ul>
        <p>
          No utilizamos los datos obtenidos mediante WhatsApp para vender
          información personal ni para tomar decisiones clínicas automatizadas.
        </p>
      </>
    ),
  },
  {
    title: '4. WhatsApp y proveedores',
    content: (
      <p>
        El servicio utiliza WhatsApp Business Platform, operado por Meta, para
        recibir y enviar mensajes. También podemos utilizar proveedores de
        infraestructura, almacenamiento y procesamiento tecnológico que actúan
        siguiendo nuestras instrucciones y bajo medidas de seguridad aplicables.
        El uso de WhatsApp está sujeto además a las políticas de Meta y WhatsApp.
      </p>
    ),
  },
  {
    title: '5. Conservación y seguridad',
    content: (
      <p>
        Conservamos los datos durante el tiempo necesario para atender la
        conversación, administrar citas, cumplir obligaciones aplicables y
        resolver posibles aclaraciones. Aplicamos medidas administrativas y
        técnicas razonables para evitar el acceso, alteración, pérdida o uso no
        autorizado. Ningún sistema puede garantizar seguridad absoluta.
      </p>
    ),
  },
  {
    title: '6. Derechos ARCO',
    content: (
      <p>
        Puedes solicitar acceso, rectificación, cancelación u oposición al
        tratamiento de tus datos, así como retirar tu consentimiento cuando
        corresponda. Envía tu solicitud a{' '}
        <a href="mailto:redes@novaskin.mx">redes@novaskin.mx</a> indicando tu
        nombre, el derecho que deseas ejercer y la información necesaria para
        identificar tu solicitud. Podremos pedir información adicional para
        verificar tu identidad.
      </p>
    ),
  },
  {
    title: '7. Cambios a esta política',
    content: (
      <p>
        Podemos actualizar esta política para reflejar cambios legales,
        operativos o tecnológicos. La versión vigente estará siempre disponible
        en esta misma dirección y mostrará su fecha de actualización.
      </p>
    ),
  },
];

export default function Privacy() {
  useEffect(() => {
    const previousTitle = document.title;
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDescription = description?.content;
    document.title = 'Política de privacidad | NovaSkin';
    description?.setAttribute(
      'content',
      'Política de privacidad de NovaSkin para el servicio de citas y atención mediante WhatsApp.',
    );
    return () => {
      document.title = previousTitle;
      if (description && previousDescription) description.content = previousDescription;
    };
  }, []);

  return (
    <div className="noise min-h-[100dvh] bg-background">
      <header className="border-b border-border/70 bg-card/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
          <a href="./" className="flex items-center gap-3" aria-label="NovaSkin">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/25 bg-secondary text-xl font-semibold text-primary">
              N
            </span>
            <span>
              <span className="serif block text-xl font-semibold leading-none">NovaSkin</span>
              <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[.2em] text-muted-foreground">
                Torreón, Coahuila
              </span>
            </span>
          </a>
          <span className="hidden items-center gap-2 text-xs font-semibold text-primary sm:flex">
            <ShieldCheck size={17} />
            Privacidad y datos
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="max-w-3xl">
          <p className="mb-4 text-xs font-bold uppercase tracking-[.2em] text-primary">
            Aviso público
          </p>
          <h1 className="serif text-4xl font-semibold tracking-[-.03em] sm:text-5xl">
            Política de privacidad
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">
            Esta política explica cómo NovaSkin recopila, utiliza y protege la
            información relacionada con su servicio de atención y citas por
            WhatsApp.
          </p>
          <p className="mt-4 text-sm font-medium">Última actualización: 18 de septiembre de 2026</p>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
          <article className="surface rounded-3xl p-6 sm:p-9">
            <div className="space-y-9">
              {sections.map((section) => (
                <section key={section.title}>
                  <h2 className="text-lg font-semibold">{section.title}</h2>
                  <div className="mt-3 space-y-3 text-[15px] leading-7 text-foreground/75 [&_a]:font-semibold [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_li]:ml-5 [&_li]:list-disc">
                    {section.content}
                  </div>
                </section>
              ))}
            </div>
          </article>

          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-3xl bg-primary p-6 text-primary-foreground shadow-md">
              <ShieldCheck size={25} />
              <h2 className="mt-5 text-lg font-semibold">Contacto de privacidad</h2>
              <p className="mt-2 text-sm leading-6 text-primary-foreground/75">
                Para ejercer tus derechos o hacer una consulta sobre tus datos.
              </p>
              <a
                className="mt-5 flex items-start gap-3 text-sm font-semibold"
                href="mailto:redes@novaskin.mx"
              >
                <Mail className="mt-0.5 shrink-0" size={17} />
                redes@novaskin.mx
              </a>
              <a
                className="mt-4 flex items-start gap-3 text-sm font-semibold"
                href="https://wa.me/528715044852"
              >
                <MessageCircle className="mt-0.5 shrink-0" size={17} />
                +52 871 504 4852
              </a>
            </div>
            <div className="surface rounded-3xl p-6">
              <MapPin className="text-primary" size={21} />
              <p className="mt-4 text-sm font-semibold">NovaSkin</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Plaza Laguna Oriente, Av. Juarez Loc 43, Residencial las Torres
                Sector II, 27085 Torreón, Coah.
              </p>
            </div>
          </aside>
        </div>
      </main>

      <footer className="border-t border-border/70">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-5 py-7 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>© 2026 NovaSkin. Todos los derechos reservados.</span>
          <span>Atención y citas mediante WhatsApp Business.</span>
        </div>
      </footer>
    </div>
  );
}