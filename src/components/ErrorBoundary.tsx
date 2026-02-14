import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('🔴 ERROR BOUNDARY CAUGHT:', error);
    console.error('🔴 ERROR INFO:', errorInfo);
    console.error('🔴 COMPONENT STACK:', errorInfo.componentStack);
    
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-[#0B0B0B] via-[#1A1A1A] to-[#0B0B0B] flex items-center justify-center p-4">
          <div className="max-w-2xl w-full bg-[#1A1A1A] border-2 border-red-500 rounded-lg shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="bg-red-500/20 border-b border-red-500 p-6">
              <div className="flex items-center gap-4">
                <div className="bg-red-500 rounded-full p-3">
                  <AlertTriangle className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white">
                    🚨 Application Error Detected
                  </h1>
                  <p className="text-red-200 mt-1">
                    NPC encountered a critical error
                  </p>
                </div>
              </div>
            </div>

            {/* Error Details */}
            <div className="p-6 space-y-4">
              {/* Error Message */}
              <div>
                <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                  <span className="text-red-500">→</span> Error Message:
                </h2>
                <div className="bg-[#0B0B0B] border border-red-500/30 rounded p-4 font-mono text-sm text-red-300">
                  {this.state.error?.toString() || 'Unknown error'}
                </div>
              </div>

              {/* Stack Trace */}
              {this.state.errorInfo && (
                <div>
                  <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                    <span className="text-red-500">→</span> Component Stack:
                  </h2>
                  <div className="bg-[#0B0B0B] border border-red-500/30 rounded p-4 font-mono text-xs text-gray-400 max-h-64 overflow-y-auto">
                    <pre className="whitespace-pre-wrap">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </div>
                </div>
              )}

              {/* Full Stack */}
              {this.state.error?.stack && (
                <details className="cursor-pointer">
                  <summary className="text-lg font-semibold text-white mb-2 flex items-center gap-2 hover:text-primary transition-colors">
                    <span className="text-red-500">→</span> Full Stack Trace (click to expand)
                  </summary>
                  <div className="bg-[#0B0B0B] border border-red-500/30 rounded p-4 font-mono text-xs text-gray-400 max-h-96 overflow-y-auto mt-2">
                    <pre className="whitespace-pre-wrap">{this.state.error.stack}</pre>
                  </div>
                </details>
              )}

              {/* Environment Info */}
              <div>
                <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                  <span className="text-yellow-500">→</span> Environment Check:
                </h2>
                <div className="bg-[#0B0B0B] border border-yellow-500/30 rounded p-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Supabase URL:</span>
                    <span className={import.meta.env.VITE_SUPABASE_URL ? 'text-green-400' : 'text-red-400'}>
                      {import.meta.env.VITE_SUPABASE_URL ? '✅ DEFINED' : '❌ MISSING'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Supabase Anon Key:</span>
                    <span className={import.meta.env.VITE_SUPABASE_ANON_KEY ? 'text-green-400' : 'text-red-400'}>
                      {import.meta.env.VITE_SUPABASE_ANON_KEY ? '✅ DEFINED' : '❌ MISSING'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Node Environment:</span>
                    <span className="text-blue-400">{import.meta.env.MODE}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Dev Mode:</span>
                    <span className="text-blue-400">{import.meta.env.DEV ? 'YES' : 'NO'}</span>
                  </div>
                </div>
              </div>

              {/* Common Solutions */}
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-4">
                <h3 className="text-yellow-400 font-semibold mb-2">💡 Common Solutions:</h3>
                <ul className="text-sm text-gray-300 space-y-1 list-disc list-inside">
                  <li>Check that <code className="bg-[#0B0B0B] px-1 rounded">.env</code> file exists with correct variables</li>
                  <li>Verify Supabase URL and Anon Key are correct</li>
                  <li>Ensure all dependencies are installed: <code className="bg-[#0B0B0B] px-1 rounded">npm install</code></li>
                  <li>Check browser console for additional errors (F12)</li>
                  <li>Try clearing cache and reloading</li>
                </ul>
              </div>

              {/* Reload Button */}
              <button
                onClick={this.handleReload}
                className="w-full bg-primary text-primary-foreground hover:opacity-90 font-semibold py-3 px-6 rounded-lg transition-all duration-300 flex items-center justify-center gap-2 shadow-lg"
              >
                <RefreshCw className="w-5 h-5" />
                Reload Application
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
