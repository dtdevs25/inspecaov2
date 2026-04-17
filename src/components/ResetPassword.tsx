import React, { useState, useEffect } from 'react';
import { Lock, Eye, EyeOff, AlertCircle, CheckCircle2, Loader2, ArrowLeft } from 'lucide-react';
import logoUrl from '../../logos/logocompleto.png';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  const [token, setToken] = useState<string | null>(null);
  const [tokenStatus, setTokenStatus] = useState<'checking' | 'valid' | 'invalid'>('checking');

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get('token');
    
    if (tokenParam) {
      setToken(tokenParam);
      // Validate token on component mount
      fetch(`/api/auth/verify-token?token=${tokenParam}`)
        .then(res => {
          if (res.ok) setTokenStatus('valid');
          else setTokenStatus('invalid');
        })
        .catch(() => setTokenStatus('invalid'));
    } else {
      setTokenStatus('invalid');
    }
  }, []);

  const showError = (msg: string | null) => {
    setError(msg);
    if (msg) {
      setTimeout(() => setError(null), 10000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || tokenStatus !== 'valid') return;
    
    if (password !== confirmPassword) {
      showError('As senhas não coincidem.');
      return;
    }
    
    if (password.length < 6) {
      showError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    setLoading(true);
    showError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password })
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao redefinir a senha.');
      }
      
      setSuccessMsg('Senha atualizada com sucesso! Redirecionando para login...');
      setTimeout(() => {
        window.history.pushState({}, '', '/');
        window.dispatchEvent(new PopStateEvent('popstate'));
        window.location.reload();
      }, 3000);
    } catch (err: any) {
      console.error(err);
      showError(err.message || 'Erro ao redefinir senha.');
    } finally {
      setLoading(false);
    }
  };

  const goBackToLogin = () => {
    window.history.pushState({}, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-[#E6F4F1] p-4 font-sans">
      <div className="w-full max-w-[400px] bg-white rounded-3xl shadow-2xl overflow-hidden p-6 sm:p-8 flex flex-col justify-center relative min-h-[400px]">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center mb-4 w-full max-w-[200px]">
            <img 
              src={logoUrl} 
              alt="Logo EHS Pro" 
              className="w-full h-auto object-contain"
            />
          </div>
          
          {tokenStatus === 'valid' && (
            <>
              <h1 className="text-xl md:text-2xl font-extrabold text-[#27AE60] tracking-tight">
                Criar Nova Senha
              </h1>
              <p className="text-gray-500 mt-1 text-xs md:text-sm font-medium">
                Digite sua nova senha abaixo
              </p>
            </>
          )}
        </div>

        {tokenStatus === 'checking' && (
          <div className="flex flex-col items-center justify-center space-y-4 animate-in fade-in py-10">
            <Loader2 className="h-10 w-10 text-[#27AE60] animate-spin" />
            <p className="text-gray-500 font-medium text-sm">Validando link de acesso...</p>
          </div>
        )}

        {tokenStatus === 'invalid' && (
          <div className="flex flex-col items-center justify-center text-center space-y-4 animate-in zoom-in py-4">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-red-500" />
            </div>
            <h2 className="text-lg font-bold text-gray-800">Link Expirado ou Inválido</h2>
            <p className="text-sm text-gray-500 px-4">
              O link de criação de senha é válido por apenas 1 hora por questões de segurança.
              Volte para a tela inicial e solicite a recuperação de senha novamente.
            </p>
            <button
              onClick={goBackToLogin}
              className="mt-4 flex items-center gap-2 bg-[#27AE60] text-white px-6 py-2 rounded-xl font-bold hover:bg-[#219150] transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar ao Login
            </button>
          </div>
        )}

        {tokenStatus === 'valid' && (
          <form onSubmit={handleSubmit} className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Nova Senha</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none border-r border-gray-200">
                  <Lock className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-10 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all outline-none"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Confirmar Nova Senha</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none border-r border-gray-200">
                  <Lock className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="block w-full pl-10 pr-10 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all outline-none"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-xs animate-in fade-in slide-in-from-top-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            {successMsg && (
              <div className="flex items-center gap-2 text-green-600 bg-green-50 p-3 rounded-lg text-xs animate-in fade-in slide-in-from-top-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <p>{successMsg}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !token}
              className="w-full bg-[#27AE60] text-white py-2 mt-4 rounded-lg font-bold text-sm hover:bg-[#219150] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-green-200"
            >
              {loading ? "Salvando..." : "Salvar Senha"}
            </button>
            
            <div className="text-center mt-4">
               <button
                 type="button"
                 onClick={goBackToLogin}
                 className="text-xs font-medium text-gray-500 hover:text-gray-700 hover:underline"
               >
                 Voltar para o Login
               </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
