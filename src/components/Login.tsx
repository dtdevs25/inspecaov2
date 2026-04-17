import React, { useState } from 'react';

import { Mail, Lock, Eye, EyeOff, AlertCircle, CheckCircle2, User as UserIcon, Building } from 'lucide-react';
import { cn } from '../lib/utils';
import logoUrl from '../../logos/logocompleto.png';
import { QRCodeSVG } from 'qrcode.react';

export default function Login({ onDemoLogin }: { onDemoLogin?: (user: any) => void }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const showError = (msg: string | null) => {
    setError(msg);
    if (msg) {
      setTimeout(() => setError(null), 10000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    showError(null);
    setSuccessMsg(null);

    // Provisional Bypass for testing
    if (email === 'admin@teste.com' && password === '123456') {
      if (onDemoLogin) {
        onDemoLogin({
          uid: 'demo-user',
          email: 'admin@teste.com',
          displayName: 'Administrador Demo',
          role: 'Master',
          photoURL: null
        });
      }
      setLoading(false);
      return;
    }

    try {
      if (isSignUp) {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name, company })
        });
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.error || 'Erro ao solicitar cadastro. Tente novamente.');
        }
        
        setSuccessMsg('Sua solicitação de acesso foi enviada ao Administrador e aguarda liberação.');
        setTimeout(() => setIsSignUp(false), 3000);
      } else {
        const loginRes = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const loginData = await loginRes.json();
        
        if (!loginRes.ok) {
          throw new Error(loginData.error || 'Erro ao efetuar login.');
        }

        // Store JWT token and user
        localStorage.setItem('token', loginData.token);
        localStorage.setItem('user', JSON.stringify(loginData.user));
        
        // Force reload so UserContext picks up the new token immediately
        window.location.reload();
      }
    } catch (err: any) {
      console.error(err);
      if (isSignUp) {
        showError(err.message || 'Erro ao criar conta.');
      } else {
        showError('E-mail ou senha inválidos. Por favor, tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      showError('Por favor, insira seu e-mail para recuperar a senha.');
      return;
    }
    setLoading(true);
    showError(null);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao enviar e-mail.');
      }
      
      setResetSent(true);
      setTimeout(() => setResetSent(false), 10000); // 10s também para sucesso!
    } catch (err: any) {
      console.error(err);
      showError(err.message || 'Erro ao enviar e-mail de recuperação. Verifique o endereço digitado.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-[#E6F4F1] p-4 font-sans">
      <div className="w-full max-w-[800px] bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row">
        {/* Left Side - Form */}
        <div className="w-full md:w-1/2 p-6 sm:p-8 flex flex-col justify-center bg-white">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center mb-4 w-full max-w-[260px]">
              <img 
                src={logoUrl} 
                alt="Logo EHS Pro" 
                className="w-full h-auto object-contain"
              />
            </div>
            {isSignUp ? (
              <>
                <h1 className="text-xl md:text-2xl font-extrabold text-[#27AE60] tracking-tight">
                  Criar sua Conta
                </h1>
                <p className="text-gray-500 mt-1 text-xs md:text-sm font-medium">
                  Preencha os dados abaixo para começar
                </p>
              </>
            ) : (
              <p className="text-gray-500 mt-1 text-xs md:text-sm font-medium tracking-wide">
                Sistema de Inspeção de Segurança
              </p>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {isSignUp && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Nome Completo</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none border-r border-gray-200">
                      <UserIcon className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all outline-none"
                      placeholder="Seu nome"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Empresa</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none border-r border-gray-200">
                      <Building className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      required
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all outline-none"
                      placeholder="Nome da sua empresa"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Email</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none border-r border-gray-200">
                  <Mail className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all outline-none"
                  placeholder="seu@email.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Senha</label>
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

            {resetSent && (
              <div className="flex items-center gap-2 text-green-600 bg-green-50 p-3 rounded-lg text-xs animate-in fade-in slide-in-from-top-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <p>E-mail de recuperação enviado com sucesso!</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#27AE60] text-white py-2 mt-2 rounded-lg font-bold text-sm hover:bg-[#219150] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-green-200"
            >
              {loading ? "Processando..." : (isSignUp ? "Criar Conta" : "Entrar")}
            </button>

            <div className="flex flex-col gap-2 text-center mt-2">
              {!isSignUp && (
                <button
                  type="button"
                  onClick={handleResetPassword}
                  className="text-xs font-medium text-[#1E56A0] hover:underline"
                >
                  Esqueceu sua senha?
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  showError(null);
                  setSuccessMsg(null);
                }}
                className="text-xs font-bold text-gray-600 hover:text-[#27AE60] transition-colors"
              >
                {isSignUp ? "Já tem uma conta? Faça login" : "Não tem uma conta? Cadastre-se"}
              </button>
            </div>
          </form>
        </div>

        {/* Right Side - QR Code Section */}
        <div className="w-full md:w-1/2 bg-gradient-to-br from-[#27AE60] to-[#1E824C] p-6 sm:p-8 flex flex-col items-center justify-center text-center border-t md:border-t-0 md:border-l border-green-700/50">
          <div className="mb-4">
            <h2 className="text-lg md:text-xl font-bold text-white mb-1.5 drop-shadow-sm">Reportar Condição Insegura</h2>
            <p className="text-green-50 max-w-xs mx-auto leading-relaxed text-[11px] md:text-xs">
              Identificou algum risco? Utilize o QR Code abaixo para reportar anonimamente. A segurança é nossa prioridade!
            </p>
          </div>

          <div className="bg-white/20 backdrop-blur-md p-3 rounded-2xl shadow-[0_8px_32px_0_rgba(31,38,135,0.37)] mb-4 border border-white/30 transform transition-transform hover:scale-105">
            <div className="bg-white rounded-[14px] p-2 inline-block shadow-inner">
              <QRCodeSVG 
                value={window.location.origin + '/report'}
                size={160}
                fgColor="#27AE60"
                bgColor="#FFFFFF"
                className="w-36 h-36 lg:w-44 lg:h-44"
              />
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-[10px] md:text-[11px] text-green-100">Não consegue ler o QR Code?</p>
            <button 
              onClick={() => {
                window.history.pushState({}, '', '/report');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }}
              className="text-white font-bold hover:underline text-[11px] md:text-xs drop-shadow-sm"
            >
              Clique aqui para reportar.
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

