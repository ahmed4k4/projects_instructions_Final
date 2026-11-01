import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Top-level safety net: keeps one broken page from blanking the whole app. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[Nexus] Unhandled render error', error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
    window.location.assign('/');
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="grid min-h-[100dvh] place-items-center bg-background px-6">
        <div className="w-full max-w-md rounded-2xl border border-danger/25 bg-surface p-8 text-center shadow-card">
          <div className="mx-auto mb-5 grid size-12 place-items-center rounded-xl bg-danger/10">
            <AlertTriangle className="size-6 text-danger" />
          </div>
          <h1 className="text-lg font-semibold">Something shorted out</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            An unexpected error interrupted rendering. Your saved build is safe in local storage.
          </p>
          <pre className="mt-4 max-h-32 overflow-auto rounded-lg border border-border bg-surface-inset p-3 text-start text-xs text-danger/90">
            {this.state.error.message}
          </pre>
          <Button className="mt-6 w-full" onClick={this.reset}>
            <RotateCcw /> Reload Nexus
          </Button>
        </div>
      </div>
    );
  }
}
