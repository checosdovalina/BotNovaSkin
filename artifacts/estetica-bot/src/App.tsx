import { QueryCache, MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { type ReactNode } from 'react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider, SESSION_EXPIRED, useLocalAuth } from '@/components/auth-provider';
import { Button, ErrorState, LoadingRows } from '@/components/common';
import NotFound from '@/pages/not-found';
import Dashboard from '@/pages/dashboard';
import Appointments from '@/pages/appointments';
import Services from '@/pages/services';
import Faqs from '@/pages/faqs';
import Bot from '@/pages/bot';
import Conversations from '@/pages/conversations';
import Privacy from '@/pages/privacy';
import SignIn from '@/pages/sign-in';
import Account from '@/pages/account';
import AdminUsers from '@/pages/admin-users';

const unauthorized = (error: unknown) => {
  if (error && typeof error === 'object' && 'status' in error && error.status === 401) {
    window.dispatchEvent(new Event(SESSION_EXPIRED));
  }
};
const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: unauthorized }),
  mutationCache: new MutationCache({ onError: unauthorized }),
  defaultOptions: { queries: { retry: (count, error) => !(error && typeof error === 'object' && 'status' in error && error.status === 401) && count < 2 } },
});
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function Protected({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { user, loading, error, refresh } = useLocalAuth();
  if (loading) return <div className="mx-auto flex min-h-[100dvh] max-w-xl items-center p-6"><div className="w-full rounded-3xl bg-card p-8"><LoadingRows count={3} /></div></div>;
  if (error) return <div className="mx-auto flex min-h-[100dvh] max-w-xl items-center p-6"><div className="w-full"><ErrorState message="No pudimos verificar tu sesión. Inténtalo de nuevo para continuar." onRetry={() => void refresh()} /></div></div>;
  if (!user) return <SignIn />;
  if (admin && user.role !== 'admin') return <div className="flex min-h-[100dvh] items-center justify-center bg-background p-6"><div className="surface max-w-md rounded-3xl p-8 text-center"><h1 className="serif text-3xl">Acceso restringido</h1><p className="mt-3 text-sm text-muted-foreground">Esta área está reservada para administración.</p><Button className="mt-6" onClick={() => window.history.back()}>Volver</Button></div></div>;
  return <>{children}</>;
}
function SignInRoute() {
  const { user, loading } = useLocalAuth();
  if (loading) return <div className="mx-auto max-w-xl p-10"><LoadingRows /></div>;
  return user ? <Redirect to="/conversations" /> : <SignIn />;
}
function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function Router() {
  return <RoutedErrorBoundary><Switch>
    <Route path="/sign-in" component={SignInRoute} />
    <Route path="/sign-up" component={SignInRoute} />
    <Route path="/privacy" component={Privacy} />
    <Route path="/"><Protected><Dashboard /></Protected></Route>
    <Route path="/appointments"><Protected><Appointments /></Protected></Route>
    <Route path="/services"><Protected><Services /></Protected></Route>
    <Route path="/faqs"><Protected><Faqs /></Protected></Route>
    <Route path="/bot"><Protected><Bot /></Protected></Route>
    <Route path="/conversations"><Protected><Conversations /></Protected></Route>
    <Route path="/account"><Protected><Account /></Protected></Route>
    <Route path="/admin/users"><Protected admin><AdminUsers /></Protected></Route>
    <Route component={NotFound} />
  </Switch></RoutedErrorBoundary>;
}
function App() {
  return <WouterRouter base={basePath}><QueryClientProvider client={queryClient}><AuthProvider><TooltipProvider><Router /><Toaster /></TooltipProvider></AuthProvider></QueryClientProvider></WouterRouter>;
}
export default App;