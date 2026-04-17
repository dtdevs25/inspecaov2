import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  Building2, 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  ChevronRight, 
  MapPin, 
  Layers, 
  LayoutGrid,
  Check,
  X,
  Loader2,
  Users,
  Image as ImageIcon,
  Upload,
  ArrowRight,
  ChevronLeft,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  orderBy,
  serverTimestamp,
  getDocs,
  where
} from '../lib/dbBridge';
import { uploadFile } from '../lib/upload';

const db = {} as any;
import { useUser } from '../contexts/UserContext';
import { cn, getMediaUrl } from '../lib/utils';

type TabType = 'empresas' | 'unidades' | 'setores' | 'locais';

const formatCNPJ = (value: string) => {
  return value
    .replace(/\D/g, '')
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
    .substring(0, 18);
};

interface Company {
  id: string;
  name: string;
  cnpj?: string;
  logo?: string;
  createdAt: any;
}

interface Unit {
  id: string;
  companyId: string;
  companyName: string;
  name: string;
  address?: string;
  allowedUsers?: string[]; // UIDs of users allowed to access this unit
  createdAt: any;
}

interface Sector {
  id: string;
  companyId: string;
  unitId: string;
  unitName: string;
  companyName: string;
  name: string;
  createdAt: any;
}

interface Location {
  id: string;
  companyId: string;
  unitId: string;
  sectorId: string;
  sectorName: string;
  unitName: string;
  companyName: string;
  name: string;
  createdAt: any;
}

export default function Registrations() {
  const { isDemo, profile } = useUser();
  const [activeTab, setActiveTab] = useState<TabType>('empresas');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<any>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Data states
  const [companies, setCompanies] = useState<Company[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);

  // Form states
  const [formData, setFormData] = useState<any>({});

  useEffect(() => {
    if (isDemo) {
      // Mock data for demo mode
      setCompanies([
        { id: '1', name: 'Empresa Demo A', cnpj: '00.000.000/0001-00', createdAt: new Date() },
        { id: '2', name: 'Empresa Demo B', cnpj: '11.111.111/0001-11', createdAt: new Date() }
      ]);
      setUnits([
        { id: 'u1', companyId: '1', companyName: 'Empresa Demo A', name: 'Unidade Matriz', address: 'Rua A, 123', createdAt: new Date() },
        { id: 'u2', companyId: '1', companyName: 'Empresa Demo A', name: 'Filial Sul', address: 'Av B, 456', createdAt: new Date() }
      ]);
      setSectors([
        { id: 's1', companyId: '1', unitId: 'u1', unitName: 'Unidade Matriz', companyName: 'Empresa Demo A', name: 'Produção', createdAt: new Date() },
        { id: 's2', companyId: '1', unitId: 'u1', unitName: 'Unidade Matriz', companyName: 'Empresa Demo A', name: 'Logística', createdAt: new Date() }
      ]);
      setLocations([
        { id: 'l1', companyId: '1', unitId: 'u1', sectorId: 's1', sectorName: 'Produção', unitName: 'Unidade Matriz', companyName: 'Empresa Demo A', name: 'Linha de Montagem 01', createdAt: new Date() },
        { id: 'l2', companyId: '1', unitId: 'u1', sectorId: 's1', sectorName: 'Produção', unitName: 'Unidade Matriz', companyName: 'Empresa Demo A', name: 'Área de Pintura', createdAt: new Date() }
      ]);
      setAllUsers([
        { uid: 'demo-1', displayName: 'Dani Santos', email: 'dani@demo.com' },
        { uid: 'demo-2', displayName: 'João Silva', email: 'joao@demo.com' }
      ]);
      setLoading(false);
      return;
    }

    // Real Firestore listeners
    const unsubCompanies = onSnapshot(query(collection(db, 'companies'), orderBy('name', 'asc')), (snapshot) => {
      setCompanies(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Company)));
    });

    const unsubUnits = onSnapshot(query(collection(db, 'units'), orderBy('name', 'asc')), (snapshot) => {
      setUnits(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Unit)));
    });

    const unsubSectors = onSnapshot(query(collection(db, 'sectors'), orderBy('name', 'asc')), (snapshot) => {
      setSectors(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sector)));
    });

    const unsubLocations = onSnapshot(query(collection(db, 'locations'), orderBy('name', 'asc')), (snapshot) => {
      setLocations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Location)));
    });

    const unsubUsers = onSnapshot(query(collection(db, 'users'), orderBy('displayName', 'asc')), (snapshot) => {
      setAllUsers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() })));
    });

    setLoading(false);

    return () => {
      unsubCompanies();
      unsubUnits();
      unsubSectors();
      unsubLocations();
      unsubUsers();
    };
  }, [isDemo]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024) { // 1MB limit
        alert('A imagem deve ter no máximo 1MB');
        return;
      }
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setImagePreview(base64String);
        // We do not save base64 to formData directly, it will be uploaded.
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemo) {
      alert('Ação simulada no modo demonstração.');
      setIsModalOpen(false);
      setEditingItem(null);
      setFormData({});
      setImagePreview(null);
      return;
    }

    try {
      const collectionName = activeTab === 'empresas' ? 'companies' : 
                            activeTab === 'unidades' ? 'units' : 
                            activeTab === 'setores' ? 'sectors' : 'locations';
      
      const data = { ...formData };
      
      // Add relational names for easier display
      if (activeTab === 'unidades') {
        data.companyName = companies.find(c => c.id === data.companyId)?.name || '';
      } else if (activeTab === 'setores') {
        const unit = units.find(u => u.id === data.unitId);
        data.unitName = unit?.name || '';
        data.companyId = unit?.companyId || '';
        data.companyName = unit?.companyName || '';
      } else if (activeTab === 'locais') {
        const sector = sectors.find(s => s.id === data.sectorId);
        data.sectorName = sector?.name || '';
        data.unitId = sector?.unitId || '';
        data.unitName = sector?.unitName || '';
        data.companyId = sector?.companyId || '';
        data.companyName = sector?.companyName || '';
      }

      // Handle File Upload to MinIO S3
      if (activeTab === 'empresas' && selectedFile) {
        try {
          const fileUrl = await uploadFile(selectedFile, 'logo-empresa');
          data.logo = fileUrl; // Save URL instead of Base64
        } catch (uploadError: any) {
          alert(`Erro ao fazer upload da logo: ${uploadError?.message}`);
          return;
        }
      } else if (activeTab === 'empresas' && !selectedFile && imagePreview) {
        // Keep existing image if no new file is selected but we had a preview
        data.logo = formData.logo || imagePreview;
      }

      if (editingItem) {
        await updateDoc(doc(db, collectionName, editingItem.id), {
          ...data,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, collectionName), {
          ...data,
          createdAt: serverTimestamp()
        });
      }

      setIsModalOpen(false);
      setEditingItem(null);
      setFormData({});
      setImagePreview(null);
      setSelectedFile(null);
      const tabLabel = activeTab === 'empresas' ? 'Empresa' : activeTab === 'unidades' ? 'Unidade' : activeTab === 'setores' ? 'Setor' : 'Local';
      setSuccessMessage(`${tabLabel} ${editingItem ? 'atualizado(a)' : 'cadastrado(a)'} com sucesso!`);
      setShowSuccessModal(true);
      setTimeout(() => setShowSuccessModal(false), 3500);
    } catch (error) {
      console.error('Error saving:', error);
      alert('Erro ao salvar. Verifique as permissões.');
    }
  };

  const handleDeleteClick = (item: any) => {
    setItemToDelete(item);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    
    if (isDemo) {
      alert('Ação simulada no modo demonstração.');
      setShowDeleteModal(false);
      setItemToDelete(null);
      return;
    }

    try {
      const collectionName = activeTab === 'empresas' ? 'companies' : 
                            activeTab === 'unidades' ? 'units' : 
                            activeTab === 'setores' ? 'sectors' : 'locations';
      await deleteDoc(doc(db, collectionName, itemToDelete.id));
      setShowDeleteModal(false);
      setItemToDelete(null);
    } catch (error) {
      console.error('Error deleting:', error);
      alert('Erro ao excluir. Verifique as permissões.');
    }
  };

  const openModal = (item: any = null) => {
    setEditingItem(item);
    setFormData(item || {});
    setImagePreview(item?.logo || null);
    setSelectedFile(null);
    setIsModalOpen(true);
  };

  const filteredData = () => {
    const data = activeTab === 'empresas' ? companies : 
                 activeTab === 'unidades' ? units : 
                 activeTab === 'setores' ? sectors : locations;
    
    return data.filter((item: any) => 
      item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.companyName && item.companyName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.unitName && item.unitName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.sectorName && item.sectorName.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  };
  const filteredList = filteredData();
  const totalPages = Math.ceil(filteredList.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedList = filteredList.slice(startIndex, startIndex + itemsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchTerm, itemsPerPage]);

  const tabs = [
    { id: 'empresas', label: 'Empresas', icon: Building2 },
    { id: 'unidades', label: 'Unidades', icon: MapPin },
    { id: 'setores', label: 'Setores', icon: Layers },
    { id: 'locais', label: 'Locais', icon: LayoutGrid },
  ];

  // Helper function for sequential number (assuming it's defined elsewhere or a placeholder)
  const getSequentialNumber = (id: string) => {
    // This is a placeholder. In a real app, you'd fetch or generate a sequential number.
    // For demo purposes, we can use a hash or part of the ID.
    return parseInt(id.slice(0, 5), 16) % 100000; // Example: simple hash from ID
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">
      {/* Title Section */}
      <div className="bg-white py-3 px-4 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between">
        <h1 className="text-xl font-black text-[#1E3A5F] ml-2 tracking-wide uppercase">Cadastros - {tabs.find(t => t.id === activeTab)?.label}</h1>
        <button 
          onClick={() => openModal()}
          className="bg-[#27AE60] hover:bg-[#219150] text-white px-5 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-md shadow-green-100/50"
        >
          <Plus className="h-4 w-4" />
          Novo Registro
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 p-1.5 bg-white rounded-lg border border-gray-100 shadow-sm">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TabType)}
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

      {/* Unified Search */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 flex flex-col">
        <div className="p-4 flex flex-col items-center gap-4">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input 
              type="text" 
              placeholder={`Buscar em ${tabs.find(t => t.id === activeTab)?.label}...`}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-10 pr-4 py-2.5 text-sm text-gray-700 focus:ring-2 focus:ring-green-500 outline-none transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="py-4 px-6 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider">
                  {activeTab === 'empresas' ? 'Empresa' : 'Nome'}
                </th>
                {activeTab !== 'empresas' && (
                  <th className="py-4 px-6 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider">
                    Vínculo
                  </th>
                )}
                {activeTab === 'unidades' && (
                  <th className="py-4 px-6 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider">Acesso</th>
                )}
                <th className="py-4 px-6 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider">Data Criação</th>
                <th className="py-4 px-6 text-center text-xs font-bold text-[#27AE60] uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center">
                    <Loader2 className="h-8 w-8 text-[#1E56A0] animate-spin mx-auto" />
                  </td>
                </tr>
              ) : filteredList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-gray-400 font-medium">
                    Nenhum registro encontrado.
                  </td>
                </tr>
              ) : (
                paginatedList.map((item: any) => (
                  <tr key={item.id} className="hover:bg-gray-50/50 transition-colors group cursor-default">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center text-[#27AE60] overflow-hidden">
                          {activeTab === 'empresas' && item.logo ? (
                            <img src={getMediaUrl(item.logo)} alt={item.name} className="w-full h-full object-cover" />
                          ) : (
                            <>
                              {activeTab === 'empresas' ? <Building2 className="h-6 w-6" /> :
                               activeTab === 'unidades' ? <MapPin className="h-6 w-6" /> :
                               activeTab === 'setores' ? <Layers className="h-6 w-6" /> :
                               <LayoutGrid className="h-6 w-6" />}
                            </>
                          )}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-gray-700">{item.name}</span>
                          {activeTab === 'empresas' && item.cnpj && (
                            <span className="text-[10px] text-gray-400 font-mono">{item.cnpj}</span>
                          )}
                        </div>
                      </div>
                    </td>
                    {activeTab !== 'empresas' && (
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
                          {activeTab === 'unidades' && (
                            <span className="flex items-center gap-1">
                              <Building2 className="h-3 w-3" /> {item.companyName}
                            </span>
                          )}
                          {activeTab === 'setores' && (
                            <div className="flex flex-col gap-0.5">
                              <span className="flex items-center gap-1">
                                <Building2 className="h-3 w-3" /> {item.companyName}
                              </span>
                              <span className="flex items-center gap-1 text-gray-400">
                                <ArrowRight className="h-3 w-3" /> {item.unitName}
                              </span>
                            </div>
                          )}
                          {activeTab === 'locais' && (
                            <div className="flex flex-col gap-0.5">
                              <span className="flex items-center gap-1">
                                <Building2 className="h-3 w-3" /> {item.companyName}
                              </span>
                              <span className="flex items-center gap-1 text-gray-400">
                                <ArrowRight className="h-3 w-3" /> {item.unitName} / {item.sectorName}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                    )}
                    {activeTab === 'unidades' && (
                      <td className="py-4 px-6">
                        <div className="flex -space-x-2">
                          {(item.allowedUsers || []).slice(0, 3).map((uid: string) => {
                            const user = allUsers.find(u => u.uid === uid);
                            return (
                              <div key={uid} className="w-8 h-8 rounded-full bg-[#27AE60] border-2 border-white flex items-center justify-center text-[10px] text-white font-bold" title={user?.displayName || uid}>
                                {user?.displayName?.[0] || 'U'}
                              </div>
                            );
                          })}
                          {(item.allowedUsers || []).length > 3 && (
                            <div className="w-8 h-8 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center text-[10px] text-gray-500 font-bold">
                              +{(item.allowedUsers || []).length - 3}
                            </div>
                          )}
                          {(!item.allowedUsers || item.allowedUsers.length === 0) && (
                            <span className="text-xs text-gray-400 italic">Todos</span>
                          )}
                        </div>
                      </td>
                    )}
                    <td className="py-4 px-6 text-sm text-gray-500">
                      {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString('pt-BR') : 'N/A'}
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openModal(item)}
                          className="p-2 bg-[#FFC107] hover:bg-[#E0A800] text-white rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(item)}
                          className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
                          title="Excluir"
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
        {showDeleteModal && document.body ? createPortal(
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 text-center space-y-4">
              <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto ring-8 ring-red-50/50">
                <Trash2 className="h-10 w-10 text-red-500" />
              </div>
              <h3 className="text-2xl font-black text-gray-800 uppercase tracking-tight italic">Excluir Inspeção?</h3>
              <p className="text-gray-500 leading-relaxed font-medium">
                Você deseja remover a inspeção <span className="font-bold text-gray-700">#{getSequentialNumber(itemToDelete?.id || '').toString().padStart(5, '0')}</span>?
                <br/>
                <span className="text-red-500 text-[10px] font-black uppercase tracking-widest block mt-2">A ação não poderá ser desfeita.</span>
              </p>
              {itemToDelete?.hasActionPlan && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-left w-full mt-4">
                  <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-red-700 font-bold leading-relaxed uppercase">
                    Bloqueado: Esta inspeção possui um Plano de Ação vinculado. 
                    Remova o plano primeiro.
                  </p>
                </div>
              )}
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
                disabled={itemToDelete?.hasActionPlan}
                className={cn(
                  "flex-1 px-6 py-4 rounded-xl font-black text-white shadow-lg transition-all uppercase text-[10px] tracking-widest",
                  itemToDelete?.hasActionPlan 
                    ? "bg-gray-200 cursor-not-allowed shadow-none text-gray-400" 
                    : "bg-red-500 hover:bg-red-600 shadow-red-100"
                )}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>, document.body
      ) : null}

      {isModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[calc(100vh-2rem)]">
            <div className="p-6 md:p-8 border-b border-gray-50 flex flex-shrink-0 items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#27AE60] text-white rounded-xl">
                  {editingItem ? <Edit2 className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                </div>
                <h2 className="text-xl font-black text-gray-800 tracking-tight">
                  {editingItem ? 'Editar' : 'Novo'} {tabs.find(t => t.id === activeTab)?.label.slice(0, -1)}
                </h2>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-2 hover:bg-gray-200 rounded-full transition-colors"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0">
              <div className="p-6 md:p-8 overflow-y-auto scrollbar-hide space-y-6 flex-1 min-h-0">
                <div className="space-y-4">
                {/* Image Upload for Company */}
                {activeTab === 'empresas' && (
                  <div className="flex flex-col items-center gap-4 p-6 bg-gray-50 rounded-[24px] border-2 border-dashed border-gray-200">
                    <div className="relative group">
                      <div className="w-24 h-24 rounded-2xl bg-white flex items-center justify-center border border-gray-100 shadow-sm overflow-hidden">
                        {imagePreview ? (
                          <img src={getMediaUrl(imagePreview)} alt="Logo Preview" className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon className="h-8 w-8 text-gray-300" />
                        )}
                      </div>
                      <label className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer rounded-2xl">
                        <Upload className="h-6 w-6" />
                        <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                      </label>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold text-gray-700">Logo da Empresa</p>
                      <p className="text-[10px] text-gray-400">Clique para fazer upload (Máx 1MB)</p>
                    </div>
                  </div>
                )}

                {/* Common Name Field */}
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700 ml-1">Nome</label>
                  <input
                    required
                    type="text"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-[#27AE60]/20 transition-all font-medium"
                    placeholder="Digite o nome..."
                  />
                </div>

                {/* Conditional Fields based on Tab */}
                {activeTab === 'empresas' && (
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700 ml-1">CNPJ (Opcional)</label>
                    <input
                      type="text"
                      value={formData.cnpj || ''}
                      onChange={(e) => setFormData({ ...formData, cnpj: formatCNPJ(e.target.value) })}
                      className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-[#27AE60]/20 transition-all font-medium"
                      placeholder="00.000.000/0000-00"
                    />
                  </div>
                )}

                {activeTab === 'unidades' && (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-gray-700 ml-1">Empresa</label>
                      <div className="relative">
                        <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                        <select
                          required
                          value={formData.companyId || ''}
                          onChange={(e) => setFormData({ ...formData, companyId: e.target.value })}
                          className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-[#27AE60]/20 transition-all font-medium appearance-none"
                        >
                          <option value="">Selecione uma empresa</option>
                          {companies.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-gray-700 ml-1">Endereço (Opcional)</label>
                      <div className="relative">
                        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                        <input
                          type="text"
                          value={formData.address || ''}
                          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                          className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-[#27AE60]/20 transition-all font-medium"
                          placeholder="Rua, número, bairro..."
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-gray-700 ml-1 flex items-center justify-between">
                        Usuários com Acesso
                        <span className="text-[10px] text-gray-400 font-normal">Selecione quem pode ver esta unidade</span>
                      </label>
                      <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto p-3 bg-gray-50 rounded-2xl border border-gray-100">
                        {allUsers.map(user => (
                          <label key={user.uid} className="flex items-center gap-3 p-2 hover:bg-white rounded-xl cursor-pointer transition-all group border border-transparent hover:border-gray-100">
                            <div className={cn(
                              "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                              (formData.allowedUsers || []).includes(user.uid) 
                                ? "bg-[#27AE60] text-white" 
                                : "bg-gray-200 text-gray-500"
                            )}>
                              {user.displayName?.[0] || 'U'}
                            </div>
                            <div className="flex flex-col flex-1">
                              <span className="text-xs font-bold text-gray-700 group-hover:text-[#27AE60] transition-colors">{user.displayName}</span>
                              <span className="text-[10px] text-gray-400">{user.email}</span>
                            </div>
                            <input
                              type="checkbox"
                              checked={(formData.allowedUsers || []).includes(user.uid)}
                              onChange={(e) => {
                                const current = formData.allowedUsers || [];
                                if (e.target.checked) {
                                  setFormData({ ...formData, allowedUsers: [...current, user.uid] });
                                } else {
                                  setFormData({ ...formData, allowedUsers: current.filter((id: string) => id !== user.uid) });
                                }
                              }}
                              className="w-5 h-5 rounded-lg border-gray-300 text-[#27AE60] focus:ring-[#27AE60] transition-all"
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {activeTab === 'setores' && (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-gray-700 ml-1">Empresa</label>
                      <div className="relative">
                        <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                        <select
                          required
                          value={formData.companyId || ''}
                          onChange={(e) => {
                            setFormData({ ...formData, companyId: e.target.value, unitId: '' });
                          }}
                          className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-[#27AE60]/20 transition-all font-medium appearance-none"
                        >
                          <option value="">Selecione uma empresa</option>
                          {companies.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-gray-700 ml-1">Unidade</label>
                      <div className="relative">
                        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                        <select
                          required
                          disabled={!formData.companyId}
                          value={formData.unitId || ''}
                          onChange={(e) => setFormData({ ...formData, unitId: e.target.value })}
                          className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-[#27AE60]/20 transition-all font-medium appearance-none disabled:opacity-50"
                        >
                          <option value="">Selecione uma unidade</option>
                          {units
                            .filter(u => u.companyId === formData.companyId)
                            .map(u => (
                              <option key={u.id} value={u.id}>{u.name}</option>
                            ))}
                        </select>
                      </div>
                    </div>
                  </>
                )}

                {activeTab === 'locais' && (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-gray-700 ml-1">Empresa</label>
                      <div className="relative">
                        <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                        <select
                          required
                          value={formData.companyId || ''}
                          onChange={(e) => {
                            setFormData({ ...formData, companyId: e.target.value, unitId: '', sectorId: '' });
                          }}
                          className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-[#27AE60]/20 transition-all font-medium appearance-none"
                        >
                          <option value="">Selecione uma empresa</option>
                          {companies.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-gray-700 ml-1">Unidade</label>
                      <div className="relative">
                        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                        <select
                          required
                          disabled={!formData.companyId}
                          value={formData.unitId || ''}
                          onChange={(e) => {
                            setFormData({ ...formData, unitId: e.target.value, sectorId: '' });
                          }}
                          className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-[#27AE60]/20 transition-all font-medium appearance-none disabled:opacity-50"
                        >
                          <option value="">Selecione uma unidade</option>
                          {units
                            .filter(u => u.companyId === formData.companyId)
                            .map(u => (
                              <option key={u.id} value={u.id}>{u.name}</option>
                            ))}
                        </select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-gray-700 ml-1">Setor</label>
                      <div className="relative">
                        <Layers className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                        <select
                          required
                          disabled={!formData.unitId}
                          value={formData.sectorId || ''}
                          onChange={(e) => setFormData({ ...formData, sectorId: e.target.value })}
                          className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-[#27AE60]/20 transition-all font-medium appearance-none disabled:opacity-50"
                        >
                          <option value="">Selecione um setor</option>
                          {sectors
                            .filter(s => s.unitId === formData.unitId)
                            .map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                      </div>
                    </div>
                  </>
                )}
                </div>
              </div>

              <div className="p-6 border-t border-gray-100 bg-white flex gap-3 shrink-0 rounded-b-[32px]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-6 py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-200 transition-all active:scale-95"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-4 bg-[#27AE60] text-white rounded-2xl font-bold hover:bg-[#219150] transition-all shadow-lg shadow-emerald-100 active:scale-95 flex items-center justify-center gap-2"
                >
                  <Check className="h-5 w-5" />
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Success Modal */}
      {showSuccessModal && createPortal(
        <div className="fixed inset-0 z-[200000] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[32px] shadow-2xl p-10 flex flex-col items-center justify-center text-center max-w-sm w-full animate-in zoom-in-90 duration-300">
            <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mb-5 ring-8 ring-emerald-50/50">
              <CheckCircle className="h-10 w-10 text-emerald-500" />
            </div>
            <h3 className="text-2xl font-black text-gray-800 tracking-tight uppercase italic mb-2">Sucesso!</h3>
            <p className="text-gray-500 font-medium leading-relaxed">{successMessage}</p>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}


