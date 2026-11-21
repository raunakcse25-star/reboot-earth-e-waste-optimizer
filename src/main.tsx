import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './context/AuthContext.tsx';

// Google Maps Platform Tier 1 Quota Defense (Demo/GHP Key)
(window as any).gm_authFailure = () => {
  window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
};
const origError = console.error;
console.error = (...args: unknown[]) => {
  origError.apply(console, args);
  const msg = args.map((a) => String(a)).join(' ');
  if (msg.includes('OverQuotaMapError') || msg.includes('QuotaExceededError')) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
};

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message || 'An unexpected error occurred.' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#04100C] text-[#EAF5F0] p-6">
          <div className="max-w-lg w-full border border-emerald-900/60 bg-[#0A1F18] rounded-xl p-6 space-y-4">
            <h1 className="text-xl font-semibold">Reboot Earth encountered a runtime error</h1>
            <p className="text-sm text-emerald-100/75 break-words">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm font-medium bg-emerald-500 text-emerald-950 rounded-lg hover:bg-emerald-400 transition-colors"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <AuthProvider>
      <App />
    </AuthProvider>
  </ErrorBoundary>
);
