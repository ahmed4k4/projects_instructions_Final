import { Component, type ReactNode } from 'react';
import { HeroSceneStatic } from './HeroSceneStatic';
import { markSceneContextLost } from '@/hooks/useSceneCapability';

/**
 * Isolates the WebGL hero from the rest of the page.
 *
 * A `THREE.WebGLRenderer: Context Lost` is not recoverable from React code: the
 * GPU context is gone, every subsequent draw call is a no-op, and on some
 * drivers the tab stays janky afterwards. React Three Fiber reports most of
 * these by throwing from a render pass, which without a boundary blanks the
 * whole landing page — the failure mode users actually reported.
 *
 * Contract: whatever happens inside, the hero degrades to the static render.
 * The rest of the app never learns about it.
 */
interface Props {
  children: ReactNode;
  /** Optional hook so the parent can remember the failure (per session). */
  onError?: (error: Error) => void;
}

interface State {
  error: Error | null;
}

export class SceneErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    // One line, deliberately: a lost GPU context is a device fact, not a bug to
    // investigate from a screenshot of console noise.
    console.warn('[Nexus] 3D hero disabled — falling back to the static render.', error.message);

    // Remember the failure for the rest of the session (Module 4). Without
    // this the scene is re-mounted on every navigation and on every re-render
    // of the hero, so a driver that cannot create a context throws again and
    // again — which is what a phone with WebGL disabled by its browser did.
    markSceneContextLost();

    this.props.onError?.(error);
  }

  render() {
    if (this.state.error) return <HeroSceneStatic className="h-full w-full" />;
    return this.props.children;
  }
}

export default SceneErrorBoundary;
