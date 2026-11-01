import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { useUIStore } from '@/store/useUIStore';
import { AppRouter } from './router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 60_000,
    },
  },
});

export function App() {
  const theme = useUIStore((state) => state.theme);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={250}>
          <AppRouter />
          <Toaster
            position="top-right"
            theme={theme === 'dark' ? 'dark' : 'light'}
            toastOptions={{
              style: {
                background: 'rgb(var(--surface-elevated))',
                border: '1px solid var(--border-strong)',
                color: 'rgb(var(--foreground))',
                borderRadius: '0.75rem',
              },
            }}
          />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
