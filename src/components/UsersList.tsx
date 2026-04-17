import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Users, 
  Plus, 
  Search, 
  Mail, 
  Shield, 
  Building2, 
  MapPin, 
  MoreVertical, 
  Pencil, 
  Trash2, 
  X, 
  Check, 
  AlertCircle,
  Loader2,
  KeyRound,
  ChevronDown,
  ChevronUp,
  Filter,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { 
  collection, 
  onSnapshot, 
  doc, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy,
  addDoc,
  serverTimestamp
} from '../lib/dbBridge';

import { useUser } from '../contexts/UserContext';
import { cn } from '../lib/utils';
import { logAction } from '../services/logService';

const db = {} as any;

interface UserProfile {
  id?: string;
  uid: string;
  email: string;
  displayName: string;
  role: 'Master' | 'Administrador' | 'Gestor' | 'Usuário Comum';
  companies?: string[];
  units?: string[];
  sectors?: string[];
  photoURL?: string;
  createdAt?: any;
  blocked?: boolean;
  status?: string;
}

interface Company { id: string; name: string; }
interface Unit { id: string; companyId: string; name: string; }
interface Sector { id: string; unitId: string; name: string; }
interface Location { id: string; sectorId: string; name: string; }

export default function UsersList() {
  const { isDemo, profile: currentUserProfile } = useUser();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  const [successMessage, setSuccessMessage] = useState<{title: string, msg: string} | null>(null);
  const [errorMessage, setErrorMessage] = useState<{title: string, msg: string} | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    email: '',
    displayName: '',
    role: 'Usuário Comum' as UserProfile['role'],
    companies: [] as string[],
    units: [] as string[],
    sectors: [] as string[],
    locations: [] as string[],
    blocked: false,
    status: 'Aprovado',
    blockedReason: ''
  });

  useEffect(() => {
    if (isDemo) {
      setUsers([
        {
          uid: 'demo-1',
          email: 'admin@demo.com',
          displayName: 'Admin Demo',
          role: 'Master',
          companies: ['1'],
          units: ['u1'],
          createdAt: new Date()
        },
        {
          uid: 'demo-2',
          email: 'user@demo.com',
          displayName: 'User Demo',
          role: 'Usuário Comum',
          companies: ['1'],
          units: [],
          sectors: [],
          createdAt: new Date()
        }
      ]);
      setCompanies([{ id: '1', name: 'Matriz' }, { id: '2', name: 'GLP' }]);
      setUnits([{ id: 'u1', companyId: '1', name: 'Unidade Matriz' }]);
      setLoading(false);
      return;
    }

    const unsubUsers = onSnapshot(query(collection(db, 'users'), orderBy('createdAt', 'desc')), (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)));
      setLoading(false);
    });

    const unsubCompanies = onSnapshot(collection(db, 'companies'), (snapshot) => {
      setCompanies(snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
    });

    const unsubUnits = onSnapshot(collection(db, 'units'), (snapshot) => {
      setUnits(snapshot.docs.map(doc => ({ id: doc.id, companyId: doc.data().companyId, name: doc.data().name })));
    });

    const unsubSectors = onSnapshot(collection(db, 'sectors'), (snapshot) => {
      setSectors(snapshot.docs.map(doc => ({ id: doc.id, unitId: doc.data().unitId, name: doc.data().name })));
    });

    const unsubLocations = onSnapshot(collection(db, 'locations'), (snapshot) => {
      setLocations(snapshot.docs.map(doc => ({ id: doc.id, sectorId: doc.data().sectorId, name: doc.data().name })));
    });

    return () => {
      unsubUsers();
      unsubCompanies();
      unsubUnits();
      unsubSectors();
      unsubLocations();
    };
  }, [isDemo]);

  const handleOpenModal = (user: UserProfile | null = null) => {
    if (user) {
      setSelectedUser(user);
      setFormData({
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        companies: user.companies || [],
        units: user.units || [],
        sectors: (user as any).sectors || [],
        locations: (user as any).locations || [],
        blocked: user.blocked || user.status === 'Pendente' || user.status === 'Negado',
        status: user.status || 'Aprovado',
        blockedReason: (user as any).blockedReason || ''
      });
    } else {
      setSelectedUser(null);
      setFormData({
        email: '',
        displayName: '',
        role: 'Usuário Comum',
        companies: [],
        units: [],
        sectors: [],
        locations: [],
        blocked: false,
        status: 'Aprovado',
        blockedReason: ''
      });
    }
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemo) {
      alert('Ação simulada no modo demonstração.');
      setShowModal(false);
      return;
    }

    setIsSaving(true);
    try {
      if (selectedUser) {
        // Update existing user profile
        await updateDoc(doc(db, 'users', selectedUser.id || selectedUser.uid), {
          displayName: formData.displayName,
          role: formData.role,
          companies: formData.companies,
          units: formData.units,
          sectors: formData.sectors,
          locations: formData.locations,
          blocked: formData.blocked,
          status: formData.status,
          blockedReason: formData.blockedReason
        });

        if (currentUserProfile) {
          await logAction(
            currentUserProfile.uid,
            currentUserProfile.email,
            currentUserProfile.displayName,
            'UPDATE',
            'Usuário',
            `Atualizou perfil de ${formData.displayName} (${formData.email})`
          );
        }

        setSuccessMessage({ title: 'Sucesso!', msg: 'Perfil do usuário atualizado com sucesso!' });
      } else {
        await addDoc(collection(db, 'users'), {
          uid: 'INVITED_' + Date.now().toString(36) + Math.random().toString(36).substring(2),
          email: formData.email,
          displayName: formData.displayName,
          role: formData.role,
          companies: formData.companies,
          units: formData.units,
          sectors: formData.sectors,
          locations: formData.locations,
          blocked: formData.blocked,
          status: formData.status,
          blockedReason: formData.blockedReason,
          createdAt: serverTimestamp()
        });

        if (currentUserProfile) {
          await logAction(
            currentUserProfile.uid,
            currentUserProfile.email,
            currentUserProfile.displayName,
            'CREATE',
            'Usuário',
            `Criou novo perfil para ${formData.displayName} (${formData.email})`
          );
        }

        // Automate sending the password configuration email
        if (!isDemo) {
          fetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: formData.email, isNewUser: true })
          }).catch(console.error);
        }

        setSuccessMessage({ title: 'Usuário Criado!', msg: 'Perfil criado! O link para definir a senha já foi enviado para o e-mail dele.' });
      }
      setShowModal(false);
    } catch (error: any) {
      console.error('Error saving user:', error);
      setErrorMessage({ title: 'Erro ao Salvar', msg: error.message || 'Ocorreu um erro ao salvar o usuário.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetPassword = async (email: string) => {
    if (isDemo) {
      setSuccessMessage({ title: 'Simulação', msg: 'E-mail de redefinição enviado.' });
      return;
    }

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      if (!res.ok) throw new Error('Falha ao enviar e-mail. Verifique se o e-mail já completou seu primeiro acesso caso não o encontremos.');
      setSuccessMessage({ title: 'E-mail Enviado!', msg: `O link de redefinição de senha foi enviado para ${email}.` });
    } catch (error: any) {
      console.error('Error sending reset email:', error);
      setErrorMessage({ title: 'Erro no Envio', msg: error.message });
    }
  };

  const handleDeleteClick = (user: UserProfile) => {
    setUserToDelete(user);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!userToDelete) return;
    
    // Prevent self-deletion
    if (currentUserProfile && currentUserProfile.uid === userToDelete.uid) {
      alert('Você não pode excluir seu próprio usuário.');
      setShowDeleteModal(false);
      setUserToDelete(null);
      return;
    }

    if (isDemo) {
      setUsers(prev => prev.filter(u => u.uid !== userToDelete.uid));
      setShowDeleteModal(false);
      setUserToDelete(null);
      alert('Usuário removido com sucesso (Simulado).');
      return;
    }

    try {
      await deleteDoc(doc(db, 'users', userToDelete.id || userToDelete.uid));
      setShowDeleteModal(false);
      setUserToDelete(null);
      setSuccessMessage({ title: 'Excluído!', msg: 'Usuário removido com sucesso.' });
    } catch (error: any) {
      console.error('Error deleting user:', error);
      setErrorMessage({ title: 'Erro ao Remover', msg: error.message });
    }
  };

  const toggleCompany = (companyId: string) => {
    setFormData(prev => {
      const companies = prev.companies.includes(companyId)
        ? prev.companies.filter(id => id !== companyId)
        : [...prev.companies, companyId];
      
      // If company is removed, also remove its units
      const companyUnits = units.filter(u => u.companyId === companyId).map(u => u.id);
      const filteredUnits = prev.companies.includes(companyId) 
        ? prev.units.filter(id => !companyUnits.includes(id))
        : prev.units;

      return { ...prev, companies, units: filteredUnits };
    });
  };

  const toggleUnit = (unitId: string) => {
    setFormData(prev => {
      const units = prev.units.includes(unitId) ? prev.units.filter(id => id !== unitId) : [...prev.units, unitId];
      const unitSectors = sectors.filter(s => s.unitId === unitId).map(s => s.id);
      const filteredSectors = prev.units.includes(unitId) ? prev.sectors.filter(id => !unitSectors.includes(id)) : prev.sectors;
      const filteredLocations = prev.units.includes(unitId) ? prev.locations.filter(id => !locations.some(l => l.id === id && unitSectors.includes(l.sectorId))) : prev.locations;
      return { ...prev, units, sectors: filteredSectors, locations: filteredLocations };
    });
  };

  const toggleSector = (sectorId: string) => {
    setFormData(prev => {
      const newSectors = prev.sectors.includes(sectorId) ? prev.sectors.filter(id => id !== sectorId) : [...prev.sectors, sectorId];
      const sectorLocs = locations.filter(l => l.sectorId === sectorId).map(l => l.id);
      const newLocs = prev.sectors.includes(sectorId) ? prev.locations.filter(id => !sectorLocs.includes(id)) : prev.locations;
      return { ...prev, sectors: newSectors, locations: newLocs };
    });
  };

  const toggleLocation = (locId: string) => {
    setFormData(prev => ({
      ...prev,
      locations: prev.locations.includes(locId) ? prev.locations.filter(id => id !== locId) : [...prev.locations, locId]
    }));
  };

  const [showFilters, setShowFilters] = useState(false);
  const [filterRole, setFilterRole] = useState<string>('Todas');

  const filteredList = users.filter(u => {
    const matchesSearch = u.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         u.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = filterRole === 'Todas' || u.role === filterRole;
    return matchesSearch && matchesRole;
  });

  const totalPages = Math.ceil(filteredList.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedList = filteredList.slice(startIndex, startIndex + itemsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterRole, itemsPerPage]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">
      {/* Title Section */}
      <div className="bg-white py-3 px-4 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between">
        <h1 className="text-xl font-black text-[#1E3A5F] ml-2 tracking-wide uppercase">Cadastros - Usuários</h1>
        <button 
          onClick={() => handleOpenModal()}
          className="bg-[#27AE60] hover:bg-[#219150] text-white px-5 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-md shadow-green-100/50"
        >
          <Plus className="h-4 w-4" />
          Novo Usuário
        </button>
      </div>

      {/* Unified Search and Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 flex flex-col">
        <div className="p-4 flex flex-col items-center gap-4">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input 
              type="text" 
              placeholder="Buscar por nome ou e-mail..."
              className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-10 pr-4 py-2.5 text-sm text-gray-700 focus:ring-2 focus:ring-green-500 outline-none transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="w-full flex justify-end">
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all shadow-sm border",
                showFilters ? "bg-green-50 text-[#27AE60] border-green-200" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              )}
            >
              <Filter className="h-4 w-4" />
              Filtros
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="p-4 bg-gray-50 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-in slide-in-from-top-2 duration-200">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Função</label>
              <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:ring-2 focus:ring-[#27AE60] outline-none transition-all appearance-none"
              >
                {['Todas', 'Master', 'Administrador', 'Gestor', 'Usuário Comum'].map(role => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-100">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="py-4 px-6 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider border-r border-gray-100">Usuário</th>
                <th className="py-4 px-6 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider border-r border-gray-100">Função</th>
                <th className="py-4 px-6 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider border-r border-gray-100">Acessos</th>
                <th className="py-4 px-6 text-center text-xs font-bold text-[#27AE60] uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center">
                    <Loader2 className="h-8 w-8 text-[#27AE60] animate-spin mx-auto" />
                  </td>
                </tr>
              ) : filteredList.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-gray-400 font-medium">
                    Nenhum usuário encontrado.
                  </td>
                </tr>
              ) : (
                paginatedList.map((user) => (
                  <tr key={user.uid} className="hover:bg-gray-50/50 transition-colors cursor-default">
                    <td className="py-4 px-6 border-r border-gray-50">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold">
                          {user.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-800 flex items-center gap-2">
                            {user.displayName}
                            {(user.status === 'Pendente' || user.status === 'Negado' || user.blocked) && (
                              <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded text-[10px] font-bold uppercase">
                                {user.status === 'Pendente' ? 'Pendente' : 'Bloqueado'}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-gray-500 flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {user.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6 border-r border-gray-50">
                      <span className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                        user.role === 'Master' ? "bg-purple-100 text-purple-700" :
                        user.role === 'Administrador' ? "bg-blue-100 text-blue-700" :
                        user.role === 'Gestor' ? "bg-green-100 text-green-700" :
                        "bg-gray-100 text-gray-700"
                      )}>
                        {user.role}
                      </span>
                    </td>
                    <td className="py-4 px-6 border-r border-gray-50">
                      <div className="flex flex-wrap gap-1">
                        {user.role === 'Master' ? (
                          <span className="text-[10px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded-md font-medium flex items-center gap-1">
                            <Shield className="h-3 w-3" />
                            Acesso Geral (Todas)
                          </span>
                        ) : (
                          <>
                            {user.companies?.length ? (
                              <span className="text-[10px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-md font-medium flex items-center gap-1">
                                <Building2 className="h-3 w-3" />
                                {user.companies.length} Empresa(s)
                              </span>
                            ) : null}
                            {user.units?.length ? (
                              <span className="text-[10px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-md font-medium flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {user.units.length} Unidade(s)
                              </span>
                            ) : null}
                            {!user.companies?.length && !user.units?.length && (
                              <span className="text-[10px] text-gray-400 italic">Nenhum acesso restrito definido</span>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center justify-center gap-2">
                        <button 
                          onClick={() => handleResetPassword(user.email)}
                          className="p-2 bg-[#17A2B8] hover:bg-[#138496] text-white rounded-lg transition-colors shadow-sm"
                          title="Enviar redefinição de senha"
                        >
                          <KeyRound className="h-4 w-4" />
                        </button>
                        <button 
                          onClick={() => handleOpenModal(user)}
                          className="p-2 bg-[#FFC107] hover:bg-[#E0A800] text-white rounded-lg transition-colors shadow-sm"
                          title="Editar usuário"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button 
                          onClick={() => handleDeleteClick(user)}
                          className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors shadow-sm"
                          title="Remover usuário"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Block */}
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
      </div>

      {/* User Modal */}
      {showModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 md:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[calc(100vh-2rem)]">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-[#27AE60] text-white shrink-0">
              <h3 className="text-xl font-bold flex items-center gap-2">
                {selectedUser ? <Pencil className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                {selectedUser ? 'Editar Usuário' : 'Novo Usuário'}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 md:space-y-8 custom-scrollbar">
              {/* Basic Info */}
              <div className="bg-gray-50 p-4 md:p-6 rounded-2xl border border-gray-100 space-y-4 md:space-y-6">
                <h4 className="text-sm font-bold text-emerald-600 flex items-center gap-2 uppercase tracking-wider">
                  <Users className="h-4 w-4" />
                  Informações Básicas
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-600">Nome Completo <span className="text-red-500">*</span></label>
                    <input 
                      required
                      type="text" 
                      className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-600 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                      value={formData.displayName}
                      onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                      placeholder="Ex: João Silva"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-600">E-mail <span className="text-red-500">*</span></label>
                    <input 
                      required
                      disabled={!!selectedUser}
                      type="email" 
                      className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-600 focus:ring-2 focus:ring-emerald-500 outline-none transition-all disabled:opacity-50"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="Ex: joao@empresa.com"
                    />
                  </div>
                </div>
              </div>

              {/* Role Selection */}
              <div className="bg-gray-50 p-4 md:p-6 rounded-2xl border border-gray-100 space-y-4 md:space-y-6">
                <h4 className="text-sm font-bold text-emerald-600 flex items-center gap-2 uppercase tracking-wider">
                  <Shield className="h-4 w-4" />
                  Função / Nível de Acesso
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {(['Master', 'Administrador', 'Gestor', 'Usuário Comum'] as UserProfile['role'][]).map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setFormData({ ...formData, role })}
                      className={cn(
                        "px-4 py-3 rounded-xl text-xs font-bold transition-all border-2 flex flex-col items-center gap-2",
                        formData.role === role 
                          ? "bg-emerald-600 border-emerald-600 text-white shadow-md" 
                          : "bg-white border-gray-100 text-gray-500 hover:border-emerald-200"
                      )}
                    >
                      <Shield className={cn("h-4 w-4", formData.role === role ? "text-white" : "text-gray-300")} />
                      {role}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-gray-400 italic">
                  * Nível Master tem acesso total. Usuário Comum tem acesso restrito às empresas/unidades selecionadas abaixo.
                </p>
              </div>

              {/* Access Control */}
              <div className="bg-gray-50 p-4 md:p-6 rounded-2xl border border-gray-100 space-y-4 md:space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h4 className="text-sm font-bold text-emerald-600 flex items-center gap-2 uppercase tracking-wider">
                    <Building2 className="h-4 w-4" />
                    Controle de Acesso (Empresas e Filiais)
                  </h4>
                  <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">
                    Selecione para restringir o acesso
                  </span>
                </div>
                
                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {companies.length === 0 ? (
                    <div className="text-center py-8 bg-white rounded-xl border border-dashed border-gray-200">
                      <Building2 className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-xs text-gray-400">Nenhuma empresa cadastrada.</p>
                    </div>
                  ) : (
                    companies.map(company => (
                      <div key={company.id} className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                        <div 
                          className={cn(
                            "p-4 flex items-center justify-between cursor-pointer transition-colors",
                            formData.companies.includes(company.id) ? "bg-emerald-50/50" : "hover:bg-gray-50"
                          )}
                          onClick={() => toggleCompany(company.id)}
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all",
                              formData.companies.includes(company.id) ? "bg-emerald-600 border-emerald-600" : "bg-white border-gray-300"
                            )}>
                              {formData.companies.includes(company.id) && <Check className="h-4 w-4 text-white" />}
                            </div>
                            <span className="text-sm font-bold text-gray-700">{company.name}</span>
                          </div>
                          <ChevronDown className={cn("h-4 w-4 text-gray-400 transition-transform", formData.companies.includes(company.id) ? "rotate-180" : "")} />
                        </div>
                        
                        {formData.companies.includes(company.id) && (
                          <div className="p-4 bg-gray-50/30 border-t border-gray-50 flex flex-col gap-3 animate-in slide-in-from-top-2 duration-200">
                            {units.filter(u => u.companyId === company.id).map(unit => (
                              <div key={unit.id} className="flex flex-col gap-2">
                                <div 
                                  onClick={() => toggleUnit(unit.id)}
                                  className={cn(
                                    "p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center gap-3",
                                    formData.units.includes(unit.id)
                                      ? "border-emerald-500 bg-emerald-50 shadow-sm"
                                      : "bg-white border-gray-100 hover:border-emerald-200"
                                  )}
                                >
                                  <div className={cn(
                                    "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all shrink-0",
                                    formData.units.includes(unit.id) ? "bg-emerald-500 border-emerald-500" : "bg-white border-gray-300"
                                  )}>
                                    {formData.units.includes(unit.id) && <Check className="h-3 w-3 text-white" />}
                                  </div>
                                  <div className="flex-1">
                                    <span className="text-xs font-bold text-gray-700">{unit.name}</span>
                                    {formData.units.includes(unit.id) && (
                                      <p className="text-[10px] text-emerald-600 mt-0.5">Selecione abaixo os setores de responsabilidade nesta unidade</p>
                                    )}
                                  </div>
                                </div>
                                
                                {formData.units.includes(unit.id) && (
                                  <div className="pl-6 border-l-2 border-emerald-100 ml-4 mb-2 grid grid-cols-1 sm:grid-cols-2 gap-2 animate-in slide-in-from-top-2 duration-200">
                                    {sectors.filter(s => s.unitId === unit.id).map(sector => (
                                      <div key={sector.id} className="flex flex-col gap-1 w-full">
                                        <div 
                                          onClick={() => toggleSector(sector.id)}
                                          className={cn(
                                            "w-full px-2 py-1.5 rounded-lg border cursor-pointer transition-all flex items-center gap-2",
                                            formData.sectors.includes(sector.id)
                                              ? "border-emerald-500 bg-emerald-50"
                                              : "bg-white border-gray-100 hover:border-emerald-200"
                                          )}
                                        >
                                          <div className={cn(
                                            "w-4 h-4 rounded-md border-2 flex items-center justify-center transition-all shrink-0",
                                            formData.sectors.includes(sector.id) ? "bg-emerald-500 border-emerald-500" : "bg-emerald-50 border-emerald-200"
                                          )}>
                                            {formData.sectors.includes(sector.id) && <Check className="h-3 w-3 text-white" />}
                                          </div>
                                          <span className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">{sector.name}</span>
                                        </div>
                                        
                                        {formData.sectors.includes(sector.id) && (
                                          <div className="pl-6 grid grid-cols-1 gap-1">
                                            {locations.filter(l => l.sectorId === sector.id).map(loc => (
                                              <div 
                                                key={loc.id}
                                                onClick={() => toggleLocation(loc.id)}
                                                className={cn(
                                                  "px-2 py-1 rounded border cursor-pointer transition-all flex items-center gap-2",
                                                  formData.locations.includes(loc.id) ? "border-emerald-400 bg-emerald-50/80" : "bg-white border-gray-100 hover:border-emerald-200"
                                                )}
                                              >
                                                <div className={cn("w-3 h-3 rounded flex items-center justify-center border transition-all", formData.locations.includes(loc.id) ? "bg-emerald-500 border-emerald-500" : "border-gray-300")}>
                                                  {formData.locations.includes(loc.id) && <Check className="h-2 w-2 text-white" />}
                                                </div>
                                                <span className="text-[10px] items-center text-gray-500">{loc.name}</span>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                    {sectors.filter(s => s.unitId === unit.id).length === 0 && (
                                      <p className="text-[10px] text-gray-400 italic">Nenhum setor cadastrado nesta unidade.</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                            {units.filter(u => u.companyId === company.id).length === 0 && (
                              <p className="text-xs text-gray-400 italic">Nenhuma unidade cadastrada para esta empresa.</p>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700 ml-1">Status de Acesso</label>
                <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, blocked: false, status: 'Aprovado', blockedReason: '' })}
                    className={cn(
                      "flex-1 py-2 rounded-xl font-bold transition-all",
                      !formData.blocked && formData.status === 'Aprovado'
                        ? "bg-emerald-500 text-white shadow-md shadow-emerald-100" 
                        : "bg-white text-gray-400 hover:bg-gray-100"
                    )}
                  >
                    Ativo
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, blocked: true, status: 'Negado' })}
                    className={cn(
                      "flex-1 py-2 rounded-xl font-bold transition-all",
                      formData.blocked || formData.status === 'Pendente' || formData.status === 'Negado'
                        ? "bg-red-500 text-white shadow-md shadow-red-100" 
                        : "bg-white text-gray-400 hover:bg-gray-100"
                    )}
                  >
                    Bloqueado
                  </button>
                </div>
                {(formData.blocked || formData.status === 'Pendente' || formData.status === 'Negado') && (
                  <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
                    <label className="text-xs font-bold text-red-600 uppercase tracking-wider ml-1">Motivo do Bloqueio</label>
                    <textarea
                      className="w-full bg-white border border-red-100 rounded-xl px-4 py-3 text-gray-600 focus:ring-2 focus:ring-red-500 outline-none transition-all min-h-[80px]"
                      placeholder="Descreva o motivo do bloqueio..."
                      value={formData.blockedReason}
                      onChange={(e) => setFormData({ ...formData, blockedReason: e.target.value })}
                    />
                  </div>
                )}
              </div>
            </form>

            <div className="p-4 md:p-6 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row gap-3 shrink-0">
              <button 
                type="button"
                onClick={() => setShowModal(false)}
                className="flex-1 px-6 py-3 rounded-xl font-bold text-gray-600 hover:bg-gray-100 transition-all order-2 sm:order-1"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 bg-[#27AE60] hover:bg-[#219150] text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-green-100 disabled:opacity-50 order-1 sm:order-2"
              >
                {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
                {selectedUser ? 'Salvar Alterações' : 'Criar Usuário'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && createPortal(
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 text-center space-y-4">
              <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto ring-8 ring-red-50/50">
                <Trash2 className="h-10 w-10 text-red-500" />
              </div>
              <h3 className="text-2xl font-black text-gray-800 uppercase tracking-tight italic">Excluir Usuário?</h3>
              <p className="text-gray-500 leading-relaxed font-medium">
                Você deseja remover o usuário <span className="font-bold text-gray-700">{userToDelete?.displayName}</span>? 
                <br/>
                <span className="text-red-500 text-[10px] font-black uppercase tracking-widest block mt-2">A ação não poderá ser desfeita.</span>
              </p>
            </div>
            <div className="flex p-6 gap-3 bg-gray-50/50">
              <button 
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 px-6 py-4 rounded-xl font-black text-gray-400 uppercase text-[10px] tracking-widest hover:bg-gray-100 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmDelete}
                className="flex-1 px-6 py-4 rounded-xl font-black bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-100 transition-all uppercase text-[10px] tracking-widest"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Success/Error Feedback Modals */}
      {successMessage && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-300 transform transition-all">
            <div className="p-8 text-center space-y-6">
              <div className="w-24 h-24 bg-emerald-50 rounded-full flex items-center justify-center mx-auto border-4 border-emerald-100/50">
                <Check className="h-12 w-12 text-emerald-500" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-gray-800 tracking-tight">{successMessage.title}</h3>
                <p className="text-gray-500 font-medium leading-relaxed">{successMessage.msg}</p>
              </div>
            </div>
            <div className="p-4 bg-gray-50/50 border-t border-gray-100 flex justify-center">
              <button 
                onClick={() => setSuccessMessage(null)}
                className="w-full px-6 py-4 rounded-2xl font-bold bg-[#27AE60] text-white hover:bg-[#219150] shadow-lg shadow-emerald-100 transition-all active:scale-95"
              >
                Continuar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {errorMessage && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-300 transform transition-all">
            <div className="p-8 text-center space-y-6">
              <div className="w-24 h-24 bg-red-50 rounded-full flex items-center justify-center mx-auto border-4 border-red-100/50">
                <AlertCircle className="h-12 w-12 text-red-500" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-gray-800 tracking-tight">{errorMessage.title}</h3>
                <p className="text-gray-500 font-medium leading-relaxed">{errorMessage.msg}</p>
              </div>
            </div>
            <div className="p-4 bg-gray-50/50 border-t border-gray-100 flex justify-center">
              <button 
                onClick={() => setErrorMessage(null)}
                className="w-full px-6 py-4 rounded-2xl font-bold bg-gray-200 text-gray-700 hover:bg-gray-300 transition-all active:scale-95"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}


