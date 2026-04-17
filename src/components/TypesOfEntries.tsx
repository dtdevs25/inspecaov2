import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Tag, 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  X, 
  Check, 
  Loader2,
  ClipboardCheck,
  FolderTree,
  Target,
  Flag,
  ChevronLeft,
  ChevronRight,
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
  serverTimestamp 
} from '../lib/dbBridge';
const db = {} as any;
import { useUser } from '../contexts/UserContext';
import { cn } from '../lib/utils';
import { logAction } from '../services/logService';

type MainTab = 'inspeção' | 'projetos';
type ProjectSubTab = 'origem' | 'tipificação';

interface EntryType {
  id: string;
  name: string;
  color: string;
  category: 'inspeção' | 'projeto-origem' | 'projeto-tipificação';
  createdAt: any;
}

const PRESET_COLORS = [
  '#27AE60', // Emerald (Default)
  '#2980B9', // Blue
  '#8E44AD', // Purple
  '#F39C12', // Orange
  '#E74C3C', // Red
  '#16A085', // Teal
  '#2C3E50', // Navy
  '#D35400', // Pumpkin
  '#7F8C8D', // Gray
  '#F1C40F', // Yellow
];

export default function TypesOfEntries() {
  const { isDemo } = useUser();
  const [activeTab, setActiveTab] = useState<MainTab>('inspeção');
  const [activeProjectSubTab, setActiveProjectSubTab] = useState<ProjectSubTab>('origem');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<EntryType | null>(null);
  const [formData, setFormData] = useState({ name: '', color: PRESET_COLORS[0] });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<EntryType | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const [entries, setEntries] = useState<EntryType[]>([]);

  const { profile: currentUserProfile } = useUser();

  useEffect(() => {
    if (isDemo) {
      setEntries([
        { id: '1', name: 'Não Conformidade', color: '#E74C3C', category: 'inspeção', createdAt: new Date() },
        { id: '2', name: 'Observação', color: '#F39C12', category: 'inspeção', createdAt: new Date() },
        { id: '3', name: 'Cliente Externo', color: '#2980B9', category: 'projeto-origem', createdAt: new Date() },
        { id: '4', name: 'Demanda Interna', color: '#8E44AD', category: 'projeto-origem', createdAt: new Date() },
        { id: '5', name: 'Melhoria Contínua', color: '#27AE60', category: 'projeto-tipificação', createdAt: new Date() },
        { id: '6', name: 'Manutenção Preventiva', color: '#2C3E50', category: 'projeto-tipificação', createdAt: new Date() },
      ]);
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'type_of_entries'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setEntries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EntryType)));
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isDemo]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemo) {
      alert('Ação simulada no modo demonstração.');
      setIsModalOpen(false);
      return;
    }

    try {
      const category = activeTab === 'inspeção' 
        ? 'inspeção' 
        : (activeProjectSubTab === 'origem' ? 'projeto-origem' : 'projeto-tipificação');

      if (editingItem) {
        await updateDoc(doc(db, 'type_of_entries', editingItem.id), {
          name: formData.name,
          color: formData.color,
          updatedAt: serverTimestamp()
        });

        // Log action
        if (currentUserProfile) {
          await logAction(
            currentUserProfile.uid,
            currentUserProfile.email,
            currentUserProfile.displayName,
            'UPDATE',
            'Tipo de Apontamento',
            `Atualizou tipo: ${formData.name}`
          );
        }
      } else {
        await addDoc(collection(db, 'type_of_entries'), {
          name: formData.name,
          color: formData.color,
          category,
          createdAt: serverTimestamp()
        });

        // Log action
        if (currentUserProfile) {
          await logAction(
            currentUserProfile.uid,
            currentUserProfile.email,
            currentUserProfile.displayName,
            'CREATE',
            'Tipo de Apontamento',
            `Criou novo tipo: ${formData.name}`
          );
        }
      }

      setIsModalOpen(false);
      setEditingItem(null);
      setFormData({ name: '', color: PRESET_COLORS[0] });
      setSuccessMessage(editingItem ? 'Tipo atualizado com sucesso!' : 'Tipo cadastrado com sucesso!');
      setShowSuccessModal(true);
      setTimeout(() => setShowSuccessModal(false), 3500);
    } catch (error) {
      console.error('Error saving entry type:', error);
      alert('Erro ao salvar. Verifique as permissões.');
    }
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    if (isDemo) {
      alert('Ação simulada no modo demonstração.');
      setShowDeleteModal(false);
      return;
    }

    try {
      await deleteDoc(doc(db, 'type_of_entries', itemToDelete.id));
      setShowDeleteModal(false);
      setItemToDelete(null);
    } catch (error) {
      console.error('Error deleting entry type:', error);
      alert('Erro ao excluir. Verifique as permissões.');
    }
  };

  const openModal = (item: EntryType | null = null) => {
    setEditingItem(item);
    setFormData({ 
      name: item?.name || '', 
      color: item?.color || PRESET_COLORS[0] 
    });
    setIsModalOpen(true);
  };

  const filteredList = entries.filter(item => {
    const currentCategory = activeTab === 'inspeção' 
      ? 'inspeção' 
      : (activeProjectSubTab === 'origem' ? 'projeto-origem' : 'projeto-tipificação');
    return item.category === currentCategory && item.name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const totalPages = Math.ceil(filteredList.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedList = filteredList.slice(startIndex, startIndex + itemsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeTab, activeProjectSubTab, itemsPerPage]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">
      {/* Title Section */}
      <div className="bg-white py-3 px-4 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between">
        <h1 className="text-xl font-black text-[#1E3A5F] ml-2 tracking-wide uppercase">
          Cadastros - {activeTab === 'inspeção' ? 'Tipos de Inspeção' : 'Tipos de Projetos'}
        </h1>
        <button 
          onClick={() => openModal()}
          className="bg-[#27AE60] hover:bg-[#219150] text-white px-5 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-md shadow-green-100/50"
        >
          <Plus className="h-4 w-4" />
          Novo Tipo
        </button>
      </div>

      <div className="flex flex-col gap-4">
        {/* Main Tabs */}
        <div className="flex flex-wrap gap-2 p-1.5 bg-white rounded-lg border border-gray-100 shadow-sm w-fit">
          <button
            onClick={() => setActiveTab('inspeção')}
            className={cn(
              "flex items-center gap-2 px-6 py-2 rounded-md font-bold transition-all text-sm",
              activeTab === 'inspeção'
                ? "bg-green-50 text-[#27AE60] shadow-sm ring-1 ring-green-100/50"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            )}
          >
            <ClipboardCheck className="h-4 w-4" />
            Inspeção
          </button>
          <button
            onClick={() => setActiveTab('projetos')}
            className={cn(
              "flex items-center gap-2 px-6 py-2 rounded-md font-bold transition-all text-sm",
              activeTab === 'projetos'
                ? "bg-green-50 text-[#27AE60] shadow-sm ring-1 ring-green-100/50"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            )}
          >
            <FolderTree className="h-4 w-4" />
            Projetos
          </button>
        </div>

        {/* Sub Tabs for Projects */}
        {activeTab === 'projetos' && (
          <div className="flex flex-wrap gap-2 p-1 bg-green-50/50 rounded-lg border border-green-100 w-fit">
            <button
              onClick={() => setActiveProjectSubTab('origem')}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all shadow-sm",
                activeProjectSubTab === 'origem'
                  ? "bg-[#27AE60] text-white"
                  : "bg-white text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              )}
            >
              <Target className="h-3.5 w-3.5" />
              Origem
            </button>
            <button
              onClick={() => setActiveProjectSubTab('tipificação')}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all shadow-sm",
                activeProjectSubTab === 'tipificação'
                  ? "bg-[#27AE60] text-white"
                  : "bg-white text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              )}
            >
              <Flag className="h-3.5 w-3.5" />
              Tipificação
            </button>
          </div>
        )}
      </div>

      {/* Unified Search */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 flex flex-col">
        <div className="p-4 flex flex-col items-center gap-4">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input 
              type="text" 
              placeholder="Buscar tipo de apontamento..."
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
                <th className="py-4 px-6 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider border-r border-gray-100">Cor</th>
                <th className="py-4 px-6 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider border-r border-gray-100">Nome</th>
                <th className="py-4 px-6 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider border-r border-gray-100">Categoria</th>
                <th className="py-4 px-6 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider border-r border-gray-100">Data Criação</th>
                <th className="py-4 px-6 text-center text-xs font-bold text-[#27AE60] uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center">
                    <Loader2 className="h-8 w-8 text-emerald-600 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : filteredList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-gray-400 font-medium">
                    Nenhum tipo de apontamento encontrado.
                  </td>
                </tr>
              ) : (
                paginatedList.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50/50 transition-colors cursor-default">
                    <td className="py-4 px-6 border-r border-gray-50">
                      <div 
                        className="w-4 h-4 rounded-full shadow-sm border border-white"
                        style={{ backgroundColor: item.color || '#27AE60' }}
                      />
                    </td>
                    <td className="py-4 px-6 border-r border-gray-50">
                      <span className="font-bold text-gray-700">{item.name}</span>
                    </td>
                    <td className="py-4 px-6 border-r border-gray-50">
                      <span className="text-xs font-medium px-2.5 py-1 bg-[#27AE60]/10 text-[#27AE60] rounded-lg capitalize">
                        {item.category.replace('projeto-', '')}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-sm text-gray-500 border-r border-gray-50">
                      {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString('pt-BR') : 'N/A'}
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openModal(item)}
                          className="p-2 bg-[#FFC107] hover:bg-[#E0A800] text-white rounded-lg transition-colors shadow-sm"
                          title="Editar"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            setItemToDelete(item);
                            setShowDeleteModal(true);
                          }}
                          className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors shadow-sm"
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

      {/* Modal Form */}
      {isModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[calc(100vh-2rem)]">
            <div className="p-6 md:p-8 border-b border-gray-50 flex flex-shrink-0 items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#27AE60] text-white rounded-xl">
                  {editingItem ? <Edit2 className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                </div>
                <h2 className="text-xl font-black text-gray-800 tracking-tight">
                  {editingItem ? 'Editar' : 'Novo'} Tipo de Apontamento
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
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700 ml-1">Nome do Tipo</label>
                    <input
                      required
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-emerald-600/20 transition-all font-medium"
                      placeholder="Ex: Não Conformidade, Cliente Externo..."
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="text-sm font-bold text-gray-700 ml-1">Cor de Identificação</label>
                    <div className="flex flex-wrap gap-3 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                      {PRESET_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setFormData({ ...formData, color })}
                          className={cn(
                            "w-8 h-8 rounded-full transition-all hover:scale-110 active:scale-90 shadow-sm border-2",
                            formData.color === color ? "border-[#27AE60] scale-110 ring-2 ring-emerald-600/20" : "border-white"
                          )}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="p-4 bg-[#27AE60]/5 rounded-2xl border border-[#27AE60]/10">
                    <p className="text-xs text-[#27AE60] font-medium leading-relaxed">
                      Este tipo será cadastrado na categoria: <br />
                      <strong className="uppercase">
                        {activeTab === 'inspeção' 
                          ? 'Inspeção' 
                          : `Projeto / ${activeProjectSubTab === 'origem' ? 'Origem' : 'Tipificação'}`}
                      </strong>
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-6 py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-200 transition-all active:scale-95"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-6 py-4 bg-[#27AE60] text-white rounded-2xl font-bold hover:bg-[#219150] transition-all shadow-lg shadow-green-100 active:scale-95 flex items-center justify-center gap-2"
                  >
                    <Check className="h-5 w-5" />
                    Salvar
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {showDeleteModal && createPortal(
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 text-center space-y-4">
              <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto ring-8 ring-red-50/50">
                <Trash2 className="h-10 w-10 text-red-500" />
              </div>
              <h3 className="text-2xl font-black text-gray-800 uppercase tracking-tight italic">Excluir Registro?</h3>
              <p className="text-gray-500 leading-relaxed font-medium">
                Você deseja remover o tipo <span className="font-bold text-gray-700">{itemToDelete?.name}</span>? 
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

