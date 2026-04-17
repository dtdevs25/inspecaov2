import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let errorDetails = null;
      try {
        if (this.state.error?.message) {
          errorDetails = JSON.parse(this.state.error.message);
        }
      } catch (e) {
        // Not a JSON error
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] p-6">
          <div className="max-w-md w-full bg-white rounded-[32px] shadow-2xl p-10 text-center border border-red-100">
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-8 animate-bounce">
              <AlertTriangle className="h-10 w-10 text-red-500" />
            </div>
            
            <h1 className="text-2xl font-black text-gray-800 mb-4 tracking-tight">Ops! Algo deu errado</h1>
            
            <div className="bg-red-50/50 rounded-2xl p-6 mb-8 text-left border border-red-100/50">
              <p className="text-sm text-red-600 font-bold mb-2 uppercase tracking-widest">Detalhes do Erro:</p>
              <div className="text-xs text-red-500 font-mono break-all leading-relaxed">
                {errorDetails ? (
                  <>
                    <span className="block font-bold">Erro: {errorDetails.error}</span>
                    <span className="block">Operação: {errorDetails.operationType}</span>
                    <span className="block">Caminho: {errorDetails.path}</span>
                  </>
                ) : (
                  this.state.error?.message || 'Erro desconhecido'
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => window.location.reload()}
                className="w-full bg-[#27AE60] text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-[#219150] transition-all shadow-lg shadow-green-100"
              >
                <RefreshCcw className="h-5 w-5" />
                Recarregar Página
              </button>
              
              <button
                onClick={() => {
                  window.location.href = '/';
                  this.setState({ hasError: false, error: null });
                }}
                className="w-full bg-gray-100 text-gray-600 py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-gray-200 transition-all"
              >
                <Home className="h-5 w-5" />
                Voltar ao Início
              </button>
            </div>

            <p className="mt-8 text-[10px] text-gray-400 font-medium uppercase tracking-widest">
              Se o problema persistir, contate o suporte técnico.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
