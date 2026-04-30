import React, { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon, 
  History, 
  Mail, 
  ShieldCheck, 
  Info, 
  Search, 
  Filter, 
  Download, 
  Trash2, 
  Check, 
  X, 
  AlertTriangle,
  Loader2,
  RefreshCw,
  Lock,
  Unlock,
  UserCheck,
  UserX,
  Globe,
  Database,
  Cpu,
  Building2,
  Plus,
  ChevronLeft,
  ChevronRight,
  Layout,
  Type,
  Image as ImageIcon,
  Palette,
  Palette,
  Pencil,
  Eye
} from 'lucide-react';
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  onSnapshot, 
  doc, 
  updateDoc, 
  addDoc,
  getDocs,
  where,
  serverTimestamp,
  deleteDoc
} from '../lib/dbBridge';
const db = {} as any;
import { motion, AnimatePresence } from 'framer-motion';
import { useUser } from '../contexts/UserContext';
import { cn, getMediaUrl } from '../lib/utils';
import ReportTemplateEditor from './ReportTemplateEditor';

type SettingsTab = 'logs' | 'email' | 'access' | 'templates';

interface SystemLog {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  action: string;
  resource: string;
  details: string;
  createdAt: any;
}

interface UserProfile {
  id?: string;
  uid: string;
  email: string;
  displayName: string;
  role: string;
  blocked?: boolean;
  blockedReason?: string;
}

interface Company {
  id: string;
  name: string;
  reportEmails?: string[];
  reportScheduleTime?: string;
  reportScheduleDay?: number;
}

interface Unit {
  id: string;
  companyId: string;
  name: string;
  reportEmails?: string[];
  reportScheduleTime?: string;
  reportScheduleDay?: number;
}

export default function Settings() {
  const { profile, isDemo } = useUser();
  const [activeTab, setActiveTab] = useState<SettingsTab>('logs');
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [userToBlock, setUserToBlock] = useState<UserProfile | null>(null);
  const [blockReason, setBlockReason] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [allTemplates, setAllTemplates] = useState<any[]>([]);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<any>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<any>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [activePreviewUrl, setActivePreviewUrl] = useState('');

  const tabs = [
    { id: 'logs', label: 'Logs', icon: History },
    { id: 'email', label: 'E-mail', icon: Mail },
    { id: 'access', label: 'Acessos', icon: ShieldCheck },
    { id: 'templates', label: 'Modelos de Relatório', icon: Layout },
  ];

  useEffect(() => {
    if (isDemo) {
      setLogs([
        { id: '1', userId: 'u1', userEmail: 'admin@demo.com', userName: 'Admin Demo', action: 'CREATE', resource: 'Empresa', details: 'Criou nova empresa: Matriz', createdAt: new Date() },
        { id: '2', userId: 'u2', userEmail: 'gestor@demo.com', userName: 'Gestor Demo', action: 'UPDATE', resource: 'Inspeção', details: 'Atualizou inspeção #102', createdAt: new Date() },
        { id: '3', userId: 'u1', userEmail: 'admin@demo.com', userName: 'Admin Demo', action: 'DELETE', resource: 'Usuário', details: 'Removeu usuário: teste@email.com', createdAt: new Date() },
        { id: '4', userId: 'u3', userEmail: 'user@demo.com', userName: 'User Demo', action: 'LOGIN', resource: 'Sistema', details: 'Acesso ao sistema via Web', createdAt: new Date() },
      ]);
      setUsers([
        { uid: 'u1', email: 'admin@demo.com', displayName: 'Admin Demo', role: 'Master', blocked: false },
        { uid: 'u2', email: 'gestor@demo.com', displayName: 'Gestor Demo', role: 'Gestor', blocked: true, blockedReason: 'Férias' },
        { uid: 'u3', email: 'user@demo.com', displayName: 'User Demo', role: 'Usuário Comum', blocked: false },
      ]);
      setCompanies([
        { id: '1', name: 'Empresa Matriz', reportEmails: ['diretoria@matriz.com', 'rh@matriz.com'] },
        { id: '2', name: 'Filial Sul', reportEmails: ['gerencia.sul@matriz.com'] },
      ]);
      setUnits([
         { id: '3', companyId: '1', name: 'Matriz - Sede' },
         { id: '4', companyId: '1', name: 'Matriz - Operações' },
         { id: '5', companyId: '2', name: 'Sul - Loja 1' }
      ]);
      setLoading(false);
      return;
    }

    // Fetch Logs
    const qLogs = query(collection(db, 'system_logs'), orderBy('createdAt', 'desc'), limit(100));
    const unsubLogs = onSnapshot(qLogs, (snapshot) => {
      setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SystemLog)));
      setLoading(false);
    });

    // Fetch Users for Access Management
    const qUsers = query(collection(db, 'users'), orderBy('displayName', 'asc'));
    const unsubUsers = onSnapshot(qUsers, (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id } as UserProfile)));
    });

    // Fetch Companies for Email Management
    const qCompanies = query(collection(db, 'companies'), orderBy('name', 'asc'));
    const unsubCompanies = onSnapshot(qCompanies, (snapshot) => {
      setCompanies(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Company)));
    });

    // Fetch Templates
    const qTemplates = query(collection(db, 'report_templates'), orderBy('updatedAt', 'desc'));
    const unsubTemplates = onSnapshot(qTemplates, (snapshot) => {
      setAllTemplates(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Fetch Units for Email Management
    const qUnits = query(collection(db, 'units'), orderBy('name', 'asc'));
    const unsubUnits = onSnapshot(qUnits, (snapshot) => {
      setUnits(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Unit)));
    });

    return () => {
      unsubLogs();
      unsubUsers();
      unsubCompanies();
      unsubTemplates();
      unsubUnits();
    };
  }, [isDemo]);

  const handleToggleBlock = async (user: UserProfile) => {
    if (isSaving) return;
    
    if (user.blocked) {
      // Unblock directly
      if (isDemo) {
        setUsers(prev => prev.map(u => u.uid === user.uid ? { ...u, blocked: false, blockedReason: '' } : u));
        return;
      }
      
      setIsSaving(true);
      try {
        const userRef = doc(db, 'users', user.id || user.uid);
        await updateDoc(userRef, {
          blocked: false,
          blockedReason: '',
          updatedAt: serverTimestamp()
        });
        
        // Log the unblock action
        await addDoc(collection(db, 'system_logs'), {
          userId: profile?.uid,
          userEmail: profile?.email,
          userName: profile?.displayName,
          action: 'UNBLOCK',
          resource: 'Usuário',
          details: `Desbloqueou o acesso do usuário: ${user.displayName} (${user.email})`,
          timestamp: serverTimestamp()
        });
      } catch (error) {
        console.error('Error unblocking user:', error);
      } finally {
        setIsSaving(false);
      }
    } else {
      // Show modal to provide reason
      setUserToBlock(user);
      setBlockReason('');
      setShowBlockModal(true);
    }
  };

  const confirmBlock = async () => {
    if (!userToBlock || isSaving) return;
    
    if (isDemo) {
      setUsers(prev => prev.map(u => u.uid === userToBlock.uid ? { ...u, blocked: true, blockedReason: blockReason } : u));
      setShowBlockModal(false);
      return;
    }

    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'users', userToBlock.id || userToBlock.uid), {
        blocked: true,
        blockedReason: blockReason,
        updatedAt: serverTimestamp()
      });

      // Log the block action
      await addDoc(collection(db, 'system_logs'), {
        userId: profile?.uid,
        userEmail: profile?.email,
        userName: profile?.displayName,
        action: 'BLOCK',
        resource: 'Usuário',
        details: `Bloqueou o acesso do usuário: ${userToBlock.displayName} (${userToBlock.email}). Motivo: ${blockReason}`,
        timestamp: serverTimestamp()
      });

      setShowBlockModal(false);
    } catch (error) {
      console.error('Error blocking user:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateEmails = async (companyId: string, emails: string[]) => {
    try {
      await updateDoc(doc(db, 'companies', companyId), {
        reportEmails: emails,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating emails:', error);
      alert('Erro ao atualizar e-mails.');
    }
  };

  const handleUpdateScheduleTime = async (companyId: string, time: string) => {
    try {
      await updateDoc(doc(db, 'companies', companyId), {
        reportScheduleTime: time,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating schedule:', error);
      alert('Erro ao atualizar horário.');
    }
  };

  const handleUpdateScheduleDay = async (companyId: string, day: number) => {
    try {
      await updateDoc(doc(db, 'companies', companyId), {
        reportScheduleDay: day,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating schedule day:', error);
      alert('Erro ao atualizar dia da semana.');
    }
  };

  const handleUpdateUnitEmails = async (unitId: string, emails: string[]) => {
    try {
      await updateDoc(doc(db, 'units', unitId), {
        reportEmails: emails,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating unit emails:', error);
      alert('Erro ao atualizar e-mails da filial.');
    }
  };

  const handleUpdateUnitScheduleTime = async (unitId: string, time: string) => {
    try {
      await updateDoc(doc(db, 'units', unitId), {
        reportScheduleTime: time,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating unit schedule time:', error);
      alert('Erro ao atualizar horário da filial.');
    }
  };

  const handleUpdateUnitScheduleDay = async (unitId: string, day: number) => {
    try {
      await updateDoc(doc(db, 'units', unitId), {
        reportScheduleDay: day,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating unit schedule day:', error);
      alert('Erro ao atualizar dia da semana da filial.');
    }
  };

  const confirmDeleteTemplate = async () => {
     if (!templateToDelete) return;
     try {
       await deleteDoc(doc(db, 'report_templates', templateToDelete.id));
       setShowDeleteConfirm(false);
       setTemplateToDelete(null);
     } catch (e) {
       console.error("Delete template error:", e);
     }
  };

  const filteredLogs = logs.filter(log => 
    log.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.resource.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.details.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredUsers = users.filter(user =>
    (user.displayName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (user.email?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  const currentList = activeTab === 'logs' ? filteredLogs : filteredUsers;
  const totalPages = Math.ceil(currentList.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  
  const paginatedLogs = filteredLogs.slice(startIndex, startIndex + itemsPerPage);
  const paginatedUsers = filteredUsers.slice(startIndex, startIndex + itemsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchTerm, itemsPerPage]);

  if (profile?.role !== 'Master' && !isDemo) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
        <div className="p-4 bg-red-50 text-red-500 rounded-full">
          <AlertTriangle className="h-12 w-12" />
        </div>
        <h2 className="text-2xl font-bold text-gray-800">Acesso Restrito</h2>
        <p className="text-gray-500 max-w-md">
          Esta área é exclusiva para usuários com nível de acesso <strong>Master</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">
      {/* Title Section */}
      <div className="bg-white py-3 px-4 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between">
        <h1 className="text-xl font-black text-[#1E3A5F] ml-2 tracking-wide uppercase">Configurações - {tabs.find(t => t.id === activeTab)?.label}</h1>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 p-1.5 bg-white rounded-lg border border-gray-100 shadow-sm">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as SettingsTab)}
            className={cn(
              "flex items-center gap-2 px-6 py-2 rounded-md font-bold transition-all text-sm",
              activeTab === tab.id
                ? "bg-green-50 text-[#27AE60] shadow-sm ring-1 ring-green-100/50"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Unified Search for Logs, Access and Templates */}
      {(activeTab === 'logs' || activeTab === 'access' || activeTab === 'templates') && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 flex flex-col">
          <div className="p-4 flex flex-col items-center gap-4">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input 
                type="text" 
                placeholder={
                  activeTab === 'logs' ? "Filtrar logs por usuário, recurso ou ação..." : 
                  activeTab === 'access' ? "Buscar usuário para gerenciar acesso..." :
                  "Buscar modelos por empresa ou tipo..."
                }
                className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-10 pr-4 py-2.5 text-sm text-gray-700 focus:ring-2 focus:ring-green-500 outline-none transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Tab Content */}
      <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-100">
        {activeTab === 'logs' && (
          <div className="animate-in fade-in duration-500">
            <div className="p-4 border-b border-gray-50 flex justify-end">
              <button className="flex items-center gap-2 px-4 py-2 bg-gray-50 text-gray-600 rounded-lg font-bold text-sm hover:bg-gray-100 transition-all border border-gray-200">
                <Download className="h-4 w-4" />
                Exportar CSV
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-100">
                    <th className="py-4 px-6 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider border-r border-gray-100">Data/Hora</th>
                    <th className="py-4 px-6 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider border-r border-gray-100">Usuário</th>
                    <th className="py-4 px-6 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider border-r border-gray-100">Ação</th>
                    <th className="py-4 px-6 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider">Detalhes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="py-12 text-center">
                        <Loader2 className="h-8 w-8 text-[#27AE60] animate-spin mx-auto" />
                      </td>
                    </tr>
                  ) : filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-gray-400 font-medium">
                        Nenhum log encontrado.
                      </td>
                    </tr>
                  ) : (
                    paginatedLogs.map((log) => (
                      <tr key={log.id} title={log.details} className="hover:bg-gray-50/50 transition-colors cursor-default">
                        <td className="py-4 px-6 text-xs text-gray-500 font-mono border-r border-gray-50">
                          {log.createdAt?.toDate ? 
                            log.createdAt.toDate().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '') : 
                            (log.createdAt ? new Date(log.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '') : '---')
                          }
                        </td>
                        <td className="py-4 px-6 border-r border-gray-50">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-[10px] font-bold">
                              {log.userName.charAt(0)}
                            </div>
                            <span className="text-sm font-bold text-gray-700">{log.userName}</span>
                          </div>
                        </td>
                        <td className="py-4 px-6 border-r border-gray-50">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider",
                            log.action === 'CREATE' ? "bg-green-100 text-green-700" :
                            log.action === 'UPDATE' ? "bg-blue-100 text-blue-700" :
                            log.action === 'DELETE' ? "bg-red-100 text-red-700" :
                            log.action === 'EMAIL_SENT' ? "bg-purple-100 text-purple-700" :
                            "bg-gray-100 text-gray-700"
                          )}>
                            {log.action}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-sm text-gray-500 max-w-xs">{log.details}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'email' && (
          <div className="p-8 animate-in slide-in-from-left-4 duration-500">
            <div className="space-y-8">
              <div>
                <h3 className="text-xl font-black text-gray-800 tracking-tight mb-2">Gestão de E-mails para Relatórios</h3>
                <p className="text-gray-500 font-medium">Cadastre os e-mails que receberão os relatórios automáticos de cada empresa</p>
              </div>

              <div className="grid grid-cols-1 gap-6">
                {companies.map(company => {
                  const companyUnits = units.filter(u => u.companyId === company.id);
                  return (
                  <div key={company.id} className="p-6 bg-gray-50 rounded-[24px] border border-gray-100 space-y-4">
                    <div className="flex items-center gap-3 border-b border-gray-200 pb-4 mb-4">
                      <div className="p-2 bg-white rounded-xl shadow-sm">
                        <Building2 className="h-5 w-5 text-[#27AE60]" />
                      </div>
                      <h4 className="font-bold text-gray-800 text-lg">{company.name}</h4>
                    </div>

                    {companyUnits.length === 0 ? (
                      <div className="text-sm font-bold text-gray-500 py-4 px-2">
                         Geral da Empresa (Pois não existem filiais cadastradas)
                         <div className="mt-4 p-4 border rounded-xl bg-white shadow-sm space-y-4">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                              <span className="text-xs font-black uppercase tracking-widest text-[#1E3A5F]">E-mails (Geral)</span>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Envio Base (BRT):</span>
                                <div className="flex items-center gap-1">
                                  <select 
                                    defaultValue={company.reportScheduleDay !== undefined ? company.reportScheduleDay : 5}
                                    onChange={(e) => handleUpdateScheduleDay(company.id, Number(e.target.value))}
                                    className="px-2 py-0.5 text-xs bg-gray-50 border border-gray-200 rounded focus:ring-1 focus:ring-emerald-500 outline-none"
                                  >
                                    <option value={0}>Dom</option>
                                    <option value={1}>Seg</option>
                                    <option value={2}>Ter</option>
                                    <option value={3}>Qua</option>
                                    <option value={4}>Qui</option>
                                    <option value={5}>Sex</option>
                                    <option value={6}>Sáb</option>
                                  </select>
                                  <input 
                                    type="time" defaultValue={company.reportScheduleTime || ''}
                                    onBlur={(e) => handleUpdateScheduleTime(company.id, e.target.value)}
                                    className="px-2 py-0.5 text-xs bg-gray-50 border border-gray-200 rounded focus:ring-1 focus:ring-emerald-500 outline-none"
                                  />
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {company.reportEmails?.map((email, idx) => (
                                <div key={idx} className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 group">
                                  {email}
                                  <button onClick={() => handleUpdateEmails(company.id, company.reportEmails?.filter((_, i) => i !== idx) || [])} className="text-gray-400 hover:text-red-500 transition-colors"><X className="h-3.5 w-3.5" /></button>
                                </div>
                              ))}
                            </div>
                            <div className="flex gap-2">
                              <input type="email" placeholder="Adicionar novo e-mail..."
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    const val = e.currentTarget.value.trim();
                                    if (val && !company.reportEmails?.includes(val)) { handleUpdateEmails(company.id, [...(company.reportEmails || []), val]); e.currentTarget.value = ''; }
                                  }
                                }}
                                className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-1 focus:ring-emerald-500"
                              />
                            </div>
                         </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                         {companyUnits.map(unit => (
                            <div key={unit.id} className="p-5 bg-white border border-gray-200 rounded-xl space-y-4 shadow-sm relative transition-all hover:border-emerald-200">
                              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-3">
                                <h5 className="font-bold text-[#1E3A5F] flex items-center gap-2">
                                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> {unit.name}
                                </h5>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Automático (BRT):</span>
                                  <div className="flex items-center gap-1">
                                    <select 
                                      defaultValue={unit.reportScheduleDay !== undefined ? unit.reportScheduleDay : 5}
                                      onChange={(e) => handleUpdateUnitScheduleDay(unit.id, Number(e.target.value))}
                                      className="px-2 py-1 text-sm font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                    >
                                      <option value={0}>Dom</option>
                                      <option value={1}>Seg</option>
                                      <option value={2}>Ter</option>
                                      <option value={3}>Qua</option>
                                      <option value={4}>Qui</option>
                                      <option value={5}>Sex</option>
                                      <option value={6}>Sáb</option>
                                    </select>
                                    <input 
                                      type="time" defaultValue={unit.reportScheduleTime || ''}
                                      onBlur={(e) => handleUpdateUnitScheduleTime(unit.id, e.target.value)}
                                      className="px-2 py-1 text-sm font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                    />
                                  </div>
                                </div>
                              </div>

                              <div className="space-y-3">
                                <span className="text-xs font-black uppercase tracking-widest text-gray-400 block pb-1">Destinatários desta Unidade ({unit.reportEmails?.length || 0}):</span>
                                <div className="flex flex-wrap gap-2">
                                  {unit.reportEmails?.map((email, idx) => (
                                    <div key={idx} className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 group">
                                      {email}
                                      <button onClick={() => handleUpdateUnitEmails(unit.id, unit.reportEmails?.filter((_, i) => i !== idx) || [])} className="text-gray-400 hover:text-red-500 transition-colors"><X className="h-3.5 w-3.5" /></button>
                                    </div>
                                  ))}
                                </div>
                                <div className="flex gap-2 pt-2">
                                  <input type="email" placeholder="Adicionar novo e-mail para esta filial..."
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        const val = e.currentTarget.value.trim();
                                        if (val && !unit.reportEmails?.includes(val)) { handleUpdateUnitEmails(unit.id, [...(unit.reportEmails || []), val]); e.currentTarget.value = ''; }
                                      }
                                    }}
                                    className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-600/20 outline-none"
                                  />
                                  <button onClick={(e) => {
                                    const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                                    const val = input.value.trim();
                                    if (val && !unit.reportEmails?.includes(val)) { handleUpdateUnitEmails(unit.id, [...(unit.reportEmails || []), val]); input.value = ''; }
                                  }} className="px-5 bg-[#27AE60] text-white rounded-xl hover:bg-[#219150] transition-all shadow-sm text-sm font-bold flex items-center justify-center">
                                    <Plus className="h-4 w-4 mr-1" /> Add
                                  </button>
                                </div>
                              </div>
                            </div>
                         ))}
                      </div>
                    )}
                  </div>
                )})}

                {companies.length === 0 && (
                  <div className="text-center py-12 bg-gray-50 rounded-[32px] border border-dashed border-gray-200">
                    <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500 font-medium">Nenhuma empresa cadastrada para gerenciar e-mails.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'access' && (
          <div className="animate-in fade-in duration-500">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-100">
                    <th className="py-4 px-6 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider border-r border-gray-100">Usuário</th>
                    <th className="py-4 px-6 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider border-r border-gray-100">Função</th>
                    <th className="py-4 px-6 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider border-r border-gray-100">Status</th>
                    <th className="py-4 px-6 text-center text-xs font-bold text-[#27AE60] uppercase tracking-wider">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginatedUsers.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-gray-400 font-medium">Nenhum usuário encontrado.</td>
                    </tr>
                  ) : paginatedUsers.map((user) => (
                    <tr key={user.uid} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-4 px-6 border-r border-gray-50">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center font-bold text-gray-500">
                            {user.displayName.charAt(0)}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-800">{user.displayName}</p>
                            <p className="text-xs text-gray-500">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6 border-r border-gray-50">
                        <span className="text-xs font-bold text-gray-600 px-2 py-1 bg-gray-100 rounded-lg">
                          {user.role}
                        </span>
                      </td>
                      <td className="py-4 px-6 border-r border-gray-50">
                        {user.blocked ? (
                          <div className="flex flex-col">
                            <span className="flex items-center gap-1.5 text-xs font-bold text-red-500">
                              <UserX className="h-3.5 w-3.5" />
                              Bloqueado
                            </span>
                            {user.blockedReason && (
                              <span className="text-[10px] text-gray-400 italic mt-0.5">
                                Motivo: {user.blockedReason}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-500">
                            <UserCheck className="h-3.5 w-3.5" />
                            Ativo
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex justify-center">
                          <button
                            onClick={() => handleToggleBlock(user)}
                            disabled={isSaving}
                            className={cn(
                              "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed",
                              user.blocked
                                ? "bg-emerald-500 text-white hover:bg-emerald-600"
                                : "bg-red-50 text-red-500 hover:bg-red-500 hover:text-white"
                            )}
                          >
                            {isSaving && userToBlock?.uid === user.uid ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : user.blocked ? (
                              <Unlock className="h-3.5 w-3.5" />
                            ) : (
                              <Lock className="h-3.5 w-3.5" />
                            )}
                            {user.blocked ? 'Desbloquear' : 'Bloquear Acesso'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pagination Block for Lists */}
        {(activeTab === 'logs' || activeTab === 'access') && (
          <div className="p-6 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-500">Itens por página:</span>
              <select 
                value={itemsPerPage}
                onChange={(e) => setItemsPerPage(Number(e.target.value))}
                className="bg-white border border-gray-200 text-gray-700 text-sm rounded-lg focus:ring-[#27AE60] focus:border-[#27AE60] block p-2 outline-none font-bold shadow-sm"
              >
                <option value={10}>10</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <button 
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="p-2 border border-gray-200 rounded-lg hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-gray-600 shadow-sm"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                .map((p, i, arr) => (
                  <React.Fragment key={p}>
                    {i > 0 && arr[i - 1] !== p - 1 && (
                      <span className="px-2 text-gray-400">...</span>
                    )}
                    <button 
                      onClick={() => setCurrentPage(p)}
                      className={cn(
                        "w-10 h-10 rounded-lg font-bold transition-all shadow-sm",
                        currentPage === p 
                          ? "bg-[#27AE60] text-white" 
                          : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300"
                      )}
                    >
                      {p}
                    </button>
                  </React.Fragment>
                ))}

              <button 
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="p-2 border border-gray-200 rounded-lg hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-gray-600 shadow-sm"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}


        {activeTab === 'templates' && (
          <div className="animate-in fade-in duration-500">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/30">
              <div>
                <h3 className="text-lg font-black text-gray-800 uppercase tracking-tight">Gestão de Modelos</h3>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Personalização de fundos e ativos por empresa</p>
              </div>
              <button 
                onClick={() => setIsEditorOpen(true)}
                className="bg-[#27AE60] hover:bg-[#219150] text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-green-100 transition-all active:scale-95 text-xs uppercase tracking-widest"
              >
                <Plus className="h-4 w-4" />
                Gerenciar Modelos
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-100">
                    <th className="py-4 px-6 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider border-r border-gray-100">Tipo de Fundo</th>
                    <th className="py-4 px-6 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider border-r border-gray-100">Empresa</th>
                    <th className="py-4 px-6 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider border-r border-gray-100">Origem</th>
                    <th className="py-4 px-6 text-center text-xs font-bold text-[#27AE60] uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {allTemplates
                    .filter(t => 
                      t.companyName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      t.type?.toLowerCase().includes(searchTerm.toLowerCase())
                    )
                    .length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-20 text-center text-gray-400 font-medium">Nenhum modelo encontrado.</td>
                    </tr>
                  ) : (
                    allTemplates
                      .filter(t => 
                        t.companyName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        t.type?.toLowerCase().includes(searchTerm.toLowerCase())
                      )
                      .map((template) => (
                      <tr key={template.id} className="hover:bg-gray-50/30 transition-colors cursor-default">
                        <td className="py-4 px-6 border-r border-gray-50">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden border border-gray-200 flex items-center justify-center text-gray-400">
                               {template.minioUrl ? (
                                 <img src={getMediaUrl(template.minioUrl)} alt="Preview" className="w-full h-full object-cover" />
                               ) : <Layout className="h-5 w-5" />}
                            </div>
                            <div>
                               <p className="text-sm font-bold text-gray-800">
                                  {template.type === 'SectorCover' ? 'Capa (Geral e Setores)' : 
                                   template.type === 'Findings' ? 'Interno (Fotos)' : 'Plano de Ação'}
                               </p>
                               <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest truncate max-w-[150px]">
                                  {template.minioUrl?.split('/').pop() || 'Arquivo Padrão'}
                                </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-6 border-r border-gray-50">
                           <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-gray-300" />
                              <span className="text-sm font-bold text-gray-700">{template.companyName}</span>
                           </div>
                        </td>
                        <td className="py-4 px-6 border-r border-gray-50">
                           <span className={cn(
                             "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                             template.companyId === 'default' ? "bg-blue-50 text-blue-600" : "bg-emerald-50 text-emerald-600"
                           )}>
                              {template.companyId === 'default' ? 'SISTEMA' : 'EMPRESA'}
                           </span>
                        </td>
                        <td className="py-4 px-6">
                           <div className="flex justify-center gap-2">
                              <button 
                                onClick={() => {
                                  setActivePreviewUrl(getMediaUrl(template.minioUrl));
                                  setShowPreviewModal(true);
                                }}
                                className="p-2 text-blue-400 hover:bg-blue-50 hover:text-blue-600 rounded-xl transition-all" title="Visualizar"
                              >
                                <Eye className="h-5 w-5" />
                              </button>
                              <button 
                                onClick={() => {
                                   setTemplateToDelete(template);
                                   setShowDeleteConfirm(true);
                                }}
                                className="p-2 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-xl transition-all" title="Excluir"
                              >
                                <Trash2 className="h-5 w-5" />
                              </button>
                           </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isEditorOpen && (
          <ReportTemplateEditor 
            onClose={() => setIsEditorOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Block Reason Modal */}
      {showBlockModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-red-50 text-red-500 rounded-2xl">
                    <Lock className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-gray-800 tracking-tight">Bloquear Acesso</h3>
                    <p className="text-gray-500 text-sm font-medium">{userToBlock?.displayName}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowBlockModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
                >
                  <X className="h-6 w-6 text-gray-400" />
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700 ml-1">Motivo do Bloqueio</label>
                <textarea
                  placeholder="Descreva o motivo do bloqueio para referência futura..."
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-red-600/20 transition-all font-medium min-h-[120px] resize-none"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowBlockModal(false)}
                  className="flex-1 px-6 py-4 rounded-2xl font-bold text-gray-600 hover:bg-gray-100 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmBlock}
                  disabled={isSaving}
                  className="flex-1 px-6 py-4 bg-red-500 text-white rounded-2xl font-bold hover:bg-red-600 transition-all shadow-lg shadow-red-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSaving && <Loader2 className="h-5 w-5 animate-spin" />}
                  Bloquear Agora
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
           <div className="bg-white rounded-[32px] overflow-hidden shadow-2xl max-w-2xl w-full relative">
              <button 
                onClick={() => setShowPreviewModal(false)}
                className="absolute top-4 right-4 p-2 bg-black/20 text-white rounded-full hover:bg-black/40 transition-all z-10"
              >
                <X className="h-6 w-6" />
              </button>
              <div className="aspect-[297/210] bg-gray-100 flex items-center justify-center">
                 {activePreviewUrl ? (
                   <img src={activePreviewUrl} alt="Template Preview" className="w-full h-full object-contain" />
                 ) : (
                   <div className="flex flex-col items-center text-gray-400">
                      <ImageIcon className="h-12 w-12 opacity-20" />
                      <span className="text-xs font-bold uppercase tracking-widest mt-2">Imagem não disponível</span>
                   </div>
                 )}
              </div>
              <div className="p-6 text-center">
                 <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Visualização do Modelo de Fundo</p>
              </div>
           </div>
        </div>
      )}

      {/* Delete Template Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
           <div className="bg-white rounded-[32px] p-8 max-w-md w-full shadow-2xl space-y-6 text-center animate-in zoom-in-95">
              <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto">
                 <AlertTriangle className="h-10 w-10" />
              </div>
              <div className="space-y-2">
                 <h3 className="text-xl font-black text-gray-800 uppercase italic">Confirmar Exclusão?</h3>
                 <p className="text-sm text-gray-500 font-medium">Esta ação não poderá ser revertida. O sistema voltará a usar o modelo padrão para esta empresa.</p>
              </div>
              <div className="flex gap-4 pt-4">
                 <button 
                   onClick={() => setShowDeleteConfirm(false)}
                   className="flex-1 px-6 py-3 bg-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-200 transition-all"
                 >
                   Cancelar
                 </button>
                 <button 
                   onClick={confirmDeleteTemplate}
                   className="flex-1 px-6 py-3 bg-red-500 text-white rounded-2xl font-bold hover:bg-red-600 transition-all shadow-lg"
                 >
                   Excluir Agora
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}

