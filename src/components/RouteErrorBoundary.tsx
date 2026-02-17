import { Component, ErrorInfo, ReactNode } from 'react';
import { RefreshCw, AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
}

/**
 * Route-level Error Boundary.
 *
 * When a child route crashes, shows a compact in-place error panel so the
 * sidebar, header, and layout remain fully functional.
 *
 * Recovery strategy:
 *   1. "נסה שוב" (Retry) — soft reset: clears error state and re-renders children.
 *      Works for transient failures (network blip, race condition).
 *   2. "רענן עמוד" (Reload) — hard reload after 2 soft retries have failed.
 *
 * The parent MainLayout passes key={location.pathname} so the boundary is
 * automatically reset on every route navigation.
 */
class RouteErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, retryCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Keep console.error — this is production-relevant, not debug noise
    console.error('[RouteErrorBoundary]', error.message, errorInfo.componentStack?.slice(0, 400));
  }

  handleSoftRetry = () => {
    this.setState(prev => ({ hasError: false, error: null, retryCount: prev.retryCount + 1 }));
  };

  handleHardReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const canSoftRetry = this.state.retryCount < 2;

    return (
      <div
        className="min-h-[40vh] flex flex-col items-center justify-center p-8 rounded-xl border-2 border-dashed border-amber-500/50 bg-amber-500/5"
        role="alert"
        aria-live="assertive"
      >
        <div className="flex flex-col items-center gap-4 max-w-md text-center">
          {/* Icon */}
          <div className="w-14 h-14 rounded-full bg-amber-500/20 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-amber-600" />
          </div>

          {/* Message */}
          <div>
            <h2 className="text-lg font-semibold text-foreground">משהו השתבש</h2>
            <p className="text-sm text-muted-foreground mt-1">
              הדף לא נטען כראוי. שאר האפליקציה ממשיכה לפעול.
            </p>
          </div>

          {/* Dev-only error detail */}
          {import.meta.env.DEV && this.state.error && (
            <details className="w-full text-left">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                פרטי שגיאה (פיתוח בלבד)
              </summary>
              <pre className="mt-1 text-xs font-mono bg-muted/50 rounded p-2 overflow-auto max-h-32 whitespace-pre-wrap break-all">
                {this.state.error.message}
              </pre>
            </details>
          )}

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            {canSoftRetry ? (
              <button
                type="button"
                onClick={this.handleSoftRetry}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              >
                <RotateCcw className="w-4 h-4" />
                נסה שוב
              </button>
            ) : (
              <button
                type="button"
                onClick={this.handleHardReload}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              >
                <RefreshCw className="w-4 h-4" />
                רענן עמוד
              </button>
            )}
            {canSoftRetry && (
              <button
                type="button"
                onClick={this.handleHardReload}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg border border-border text-foreground font-medium hover:bg-muted/50 transition-colors focus:outline-none focus:ring-2 focus:ring-border focus:ring-offset-2"
              >
                <RefreshCw className="w-4 h-4" />
                רענן עמוד
              </button>
            )}
          </div>

          {this.state.retryCount > 0 && canSoftRetry && (
            <p className="text-xs text-muted-foreground">
              ניסיון {this.state.retryCount}/2 — אם הבעיה חוזרת, רענן את הדף.
            </p>
          )}
        </div>
      </div>
    );
  }
}

export default RouteErrorBoundary;
