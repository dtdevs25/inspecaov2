import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Inspections from './components/Inspections';
import ActionPlans from './components/ActionPlans';
import Reports from './components/Reports';
import Projects from './components/Projects';
import Approvals from './components/Approvals';
import Registrations from './components/Registrations';
import UsersList from './components/UsersList';
import Settings from './components/Settings';
import TypesOfEntries from './components/TypesOfEntries';
import PublicReport from './components/PublicReport';
import CompanyPanel from './components/CompanyPanel';
import ResetPassword from './components/ResetPassword';
import { UserProvider, useUser } from './contexts/UserContext';
import { ErrorBoundary } from './components/ErrorBoundary';

import { AlertCircle, LogOut } from 'lucide-react';

function AppContent() {
  const { user, profile, loading, isDemo, setIsDemo, setDemoUser, logout } = useUser();
  const [path, setPath] = useState(window.location.pathname);
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [prefilledData, setPrefilledData] = useState<any>(null);

  useEffect(() => {
    // Handle back/forward navigation
    const handlePopState = () => setPath(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  if (loading && !isDemo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-green-100 border-t-green-600 rounded-full animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-2 h-2 bg-green-600 rounded-full"></div>
          </div>
        </div>
      </div>
    );
  }

  // Public Route
  if (path === '/report') {
    return <PublicReport />;
  }

  if (path.startsWith('/reset-password')) {
    return <ResetPassword />;
  }

  const currentUser = isDemo ? profile : user;

  // Check if user is blocked
  if (currentUser && profile?.blocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-3xl shadow-xl border border-red-100 p-8 md:p-12 max-w-lg w-full text-center space-y-8 animate-in zoom-in-95 duration-500">
          <div className="w-24 h-24 bg-red-50 rounded-full flex items-center justify-center mx-auto ring-8 ring-red-50/50">
            <AlertCircle className="h-12 w-12 text-red-500" />
          </div>
          
          <div className="space-y-4">
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Acesso Bloqueado</h1>
            <p className="text-gray-500 leading-relaxed">
              Seu acesso ao sistema foi temporariamente suspenso pelo administrador.
            </p>
          </div>

          {profile.blockedReason && (
            <div className="bg-red-50/50 border border-red-100 rounded-2xl p-6 text-left space-y-2">
              <span className="text-[10px] font-bold text-red-600 uppercase tracking-widest">Motivo do Bloqueio</span>
              <p className="text-sm text-red-900 font-medium leading-relaxed italic">
                "{profile.blockedReason}"
              </p>
            </div>
          )}

          <div className="pt-4 space-y-4">
            <p className="text-xs text-gray-400">
              Caso acredite que isso seja um erro, entre em contato com o suporte ou com o administrador da sua empresa.
            </p>
            <button 
              onClick={() => {
                if (isDemo) setIsDemo(false);
                logout();
              }}
              className="w-full flex items-center justify-center gap-2 bg-gray-900 hover:bg-black text-white px-6 py-4 rounded-2xl font-bold transition-all shadow-lg shadow-gray-200"
            >
              <LogOut className="h-5 w-5" />
              Sair do Sistema
            </button>
          </div>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'Dashboard':
        return <Dashboard setActiveTab={setActiveTab} setPrefilledData={setPrefilledData} />;
      case 'Inspeções':
        return <Inspections setActiveTab={setActiveTab} setPrefilledData={setPrefilledData} prefilledData={prefilledData} onClearPrefilledData={() => setPrefilledData(null)} />;
      case 'Planos de Ação':
        return <ActionPlans />;
      case 'Relatórios':
        return <Reports />;
      case 'Projetos':
        return <Projects />;
      case 'Aprovações':
        return <Approvals setActiveTab={setActiveTab} setPrefilledData={setPrefilledData} />;
      case 'Empresas':
        return <Registrations />;
      case 'Usuários':
        return <UsersList />;
      case 'Tipos de Apontamento':
        return <TypesOfEntries />;
      case 'Configurações':
        return <Settings />;
      case 'Painel':
        return <CompanyPanel />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <>
      {!currentUser ? (
        <Login onDemoLogin={setDemoUser} />
      ) : (
        <Layout 
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          setPrefilledData={setPrefilledData}
          onLogout={() => {
            if (isDemo) {
              setIsDemo(false);
            }
          }}
        >
          {renderContent()}
        </Layout>
      )}
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <UserProvider>
        <AppContent />
      </UserProvider>
    </ErrorBoundary>
  );
}

