import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import Dashboard from '@/pages/dashboard';
import Appointments from '@/pages/appointments';
import Services from '@/pages/services';
import Faqs from '@/pages/faqs';
import Bot from '@/pages/bot';
import Conversations from '@/pages/conversations';
import Privacy from '@/pages/privacy';
import {
  Route,
  Link,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';
import { useEffect, useRef, type ReactNode } from 'react';
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';

const queryClient = new QueryClient();

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/appointments" component={Appointments} />
        <Route path="/services" component={Services} />
        <Route path="/faqs" component={Faqs} />
        <Route path="/bot" component={ReceptionGate} />
        <Route path="/conversations" component={ConversationsGate} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route path="/privacy" component={Privacy} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      appearance={{
        theme: 'simple',
        options: { logoPlacement: 'inside', logoLinkUrl: basePath || '/', logoImageUrl: `${window.location.origin}${basePath}/logo.svg` },
        variables: { colorPrimary: '#1e463d', colorForeground: '#233c36', colorMutedForeground: '#64746b', colorBackground: '#faf8f2', colorInput: '#ffffff', colorInputForeground: '#233c36', colorNeutral: '#d8dfd7', fontFamily: 'DM Sans, sans-serif', borderRadius: '0.8rem' },
      }}
      localization={{ signIn: { start: { title: 'Bienvenida de nuevo', subtitle: 'Inicia sesión para atender WhatsApp' } }, signUp: { start: { title: 'Crear cuenta', subtitle: 'Solicita autorización para acceder a recepción' } } }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
      <ClerkQueryCacheInvalidator />
      <TooltipProvider>
          <Router />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
    </ClerkProvider>
  );
}

export default function AppWithRouter() {
  return <WouterRouter base={basePath}><App /></WouterRouter>;
}

function SignInPage() {
  return <div className="flex min-h-screen items-center justify-center bg-background p-5"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div>;
}

const stripBase = (path: string) => basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;

const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

function SignUpPage() {
  return <div className="flex min-h-screen items-center justify-center bg-background p-5"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div>;
}

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

function ReceptionGate() {
  return <>
    <Show when="signed-in"><Bot /></Show>
    <Show when="signed-out"><div className="flex min-h-screen items-center justify-center bg-background p-6"><div className="max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-lg"><img src={`${basePath}/logo.svg`} alt="" className="mx-auto mb-5 h-14 w-14" /><h1 className="serif text-3xl text-primary">Acceso de recepción</h1><p className="mt-3 text-sm leading-relaxed text-muted-foreground">El historial y las respuestas de WhatsApp son privados. Inicia sesión con una cuenta autorizada por el responsable del panel.</p><Link href="/sign-in" className="mt-6 inline-flex rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground">Iniciar sesión</Link></div></div></Show>
  </>;
}

function ConversationsGate() {
  return <>
    <Show when="signed-in"><Conversations /></Show>
    <Show when="signed-out"><ReceptionGate /></Show>
  </>;
}

function ClerkQueryCacheInvalidator() {
  const { addListener } = useClerk();
  const previous = useRef<string | null | undefined>(undefined);
  useEffect(() => addListener(({ user }) => {
    const id = user?.id ?? null;
    if (previous.current !== undefined && previous.current !== id) queryClient.clear();
    previous.current = id;
  }), [addListener]);
  return null;
}
