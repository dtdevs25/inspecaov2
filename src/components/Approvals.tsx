import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Check, X, Camera, User, Calendar, Building2, MapPin, Tag, Search, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
const db = {} as any;
import { collection, onSnapshot, query, updateDoc, doc, serverTimestamp, deleteDoc } from '../lib/dbBridge';

import { useUser } from '../contexts/UserContext';

interface Apontamento {
  id: string;
  company: string;
  sector: string;
  location: string;
  description: string;
  foto: string | null;
  reporterName: string;
  createdAt: any;
  status: 'Pendente' | 'Aprovado' | 'Rejeitado';
}

interface ApprovalsProps {
  setActiveTab?: (tab: string) => void;
  setPrefilledData?: (data: any) => void;
}

export default function Approvals({ setActiveTab, setPrefilledData }: ApprovalsProps) {
  const { isDemo } = useUser();
  const [apontamentos, setApontamentos] = useState<Apontamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<'pending' | 'history'>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<Apontamento | null>(null);

  useEffect(() => {
    if (isDemo) {
      setApontamentos([
        {
          id: 'demo-1',
          company: 'GLP',
          sector: 'Logística',
          location: 'Doca',
          description: 'Verificada a ausência de calços de segurança...',
          foto: null,
          reporterName: 'Luciano Antunes',
          createdAt: new Date(),
          status: 'Pendente'
        }
      ]);
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'reports'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Apontamento[];
      setApontamentos(data);
      setLoading(false);
    }, (error) => {
      console.error('Erro ao listar apontamentos:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleApprove = async (id: string, item: Apontamento) => {
    if (isDemo) {
      setApontamentos(prev => prev.map(a => a.id === id ? { ...a, status: 'Aprovado' } : a));
      if (setActiveTab && setPrefilledData) {
        setPrefilledData({
          company: item.company || '',
          sector: item.sector || '',
          local: item.location || '',
          description: item.description || '',
          date: new Date().toISOString().split('T')[0],
          type: '',
          risk: '',
          resolution: '',
          responsible: '',
          deadline: '',
          observations: ''
        });
        setActiveTab('Inspeções');
      }
      return;
    }

    try {
      await updateDoc(doc(db, 'reports', id), {
        status: 'Aprovado',
        approvedAt: serverTimestamp()
      });
      
      if (setActiveTab && setPrefilledData) {
        setPrefilledData({
          companyName: item.company || '',
          sectorName: item.sector || '',
          locationName: item.location || '',
          description: item.description || '',
          date: new Date().toISOString().split('T')[0],
          type: '',
          risk: '',
          resolution: '',
          responsible: '',
          deadline: '',
          observations: ''
        });
        setActiveTab('Inspeções');
      }
    } catch (error: any) {
      console.error('Error approving report:', error);
      alert('Erro ao aprovar: ' + (error.message || 'Erro desconhecido'));
    }
  };

  const handleDeleteClick = (item: Apontamento) => {
    setItemToDelete(item);
    setShowDeleteModal(true);
  };

  const handleReject = async () => {
    if (!itemToDelete) return;

    if (isDemo) {
      setApontamentos(prev => prev.filter(a => a.id !== itemToDelete.id));
      setShowDeleteModal(false);
      setItemToDelete(null);
      return;
    }

    try {
      await deleteDoc(doc(db, 'reports', itemToDelete.id));
      setShowDeleteModal(false);
      setItemToDelete(null);
    } catch (error: any) {
      console.error('Error rejecting report:', error);
      alert('Erro ao reprovar: ' + (error.message || 'Erro desconhecido'));
    }
  };

  const filteredPending = apontamentos
    .filter(a => a.status === 'Pendente')
    .filter(a => 
      (a.company || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
      (a.description || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

  const filteredHistory = apontamentos
    .filter(a => a.status !== 'Pendente')
    .filter(a => 
      (a.company || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
      (a.description || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

  const currentList = activeSubTab === 'pending' ? filteredPending : filteredHistory;
  
  const totalPages = Math.ceil(currentList.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedList = currentList.slice(startIndex, startIndex + itemsPerPage);

  // Reset page when switching tabs or searching
  useEffect(() => {
    setCurrentPage(1);
  }, [activeSubTab, searchTerm, itemsPerPage]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#27AE60]"></div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">
      {/* Title Section */}
      <div className="bg-white py-3 px-4 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between">
        <h1 className="text-xl font-black text-[#1E3A5F] ml-2 tracking-wide uppercase">Aprovação de Apontamentos</h1>
      </div>

      {/* Unified Search */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 flex flex-col">
        <div className="p-4 flex flex-col items-center gap-4">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input 
              type="text" 
              placeholder="Buscar por descrição ou empresa..."
              className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-10 pr-4 py-2.5 text-sm text-gray-700 focus:ring-2 focus:ring-green-500 outline-none transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Main Content Card */}
      <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-100">
        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => setActiveSubTab('pending')}
            className={cn(
              "flex-1 py-6 text-sm font-bold transition-all relative",
              activeSubTab === 'pending' ? "text-[#27AE60] bg-green-50/30" : "text-gray-400 hover:text-gray-600 hover:bg-gray-50/50"
            )}
          >
            Aguardando Aprovação
            {activeSubTab === 'pending' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#27AE60]" />}
          </button>
          <button
            onClick={() => setActiveSubTab('history')}
            className={cn(
              "flex-1 py-6 text-sm font-bold transition-all relative",
              activeSubTab === 'history' ? "text-[#27AE60] bg-green-50/30" : "text-gray-400 hover:text-gray-600 hover:bg-gray-50/50"
            )}
          >
            Histórico Recente
            {activeSubTab === 'history' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#27AE60]" />}
          </button>
        </div>

        <div className="overflow-x-auto">
          {activeSubTab === 'pending' ? (
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100">
                  <th className="py-4 px-6 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider border-r border-gray-100">Empresa</th>
                  <th className="py-4 px-6 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider border-r border-gray-100">Setor</th>
                  <th className="py-4 px-6 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider border-r border-gray-100">Local</th>
                  <th className="py-4 px-6 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider border-r border-gray-100">Apontamento</th>
                  <th className="py-4 px-6 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider border-r border-gray-100">Contato</th>
                  <th className="py-4 px-6 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider border-r border-gray-100">Data Criação</th>
                  <th className="py-4 px-6 text-center text-xs font-bold text-[#27AE60] uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paginatedList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-400 font-medium">
                      Nenhum apontamento encontrado no momento.
                    </td>
                  </tr>
                ) : (
                  paginatedList.map((item) => (
                    <tr key={item.id} title={item.description} className="hover:bg-gray-50/50 transition-colors group cursor-default">
                      <td className="py-4 px-6 text-sm font-medium text-gray-700 border-r border-gray-50">{item.company}</td>
                      <td className="py-4 px-6 text-sm text-gray-600 border-r border-gray-50">{item.sector}</td>
                      <td className="py-4 px-6 text-sm text-gray-600 border-r border-gray-50">{item.location}</td>
                      <td className="py-4 px-6 text-sm text-gray-600 max-w-[150px] truncate border-r border-gray-50">
                        {item.description}
                      </td>
                      <td className="py-4 px-6 border-r border-gray-50">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <User className="h-3 w-3 text-gray-400" />
                          {item.reporterName || 'Anônimo'}
                        </div>
                      </td>
                      <td className="py-4 px-6 border-r border-gray-50">
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <Calendar className="h-3 w-3 text-gray-400" />
                          {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString('pt-BR') : 'N/A'}
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center justify-center gap-2">
                          <button 
                            onClick={() => handleApprove(item.id, item)}
                            className="p-2 bg-[#27AE60] hover:bg-[#219150] text-white rounded-lg transition-all shadow-sm"
                            title="Aprovar"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button 
                            onClick={() => handleDeleteClick(item)}
                            className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-all shadow-sm"
                            title="Rejeitar"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100">
                  <th className="py-4 px-6 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider border-r border-gray-100">Empresa</th>
                  <th className="py-4 px-6 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider border-r border-gray-100">Local</th>
                  <th className="py-4 px-6 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider border-r border-gray-100">Descrição</th>
                  <th className="py-4 px-6 text-center text-xs font-bold text-[#27AE60] uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paginatedList.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-gray-400 font-medium">
                      Nenhum histórico encontrado.
                    </td>
                  </tr>
                ) : (
                  paginatedList.map((item) => (
                    <tr key={item.id} title={item.description} className="hover:bg-gray-50/50 transition-colors cursor-default">
                      <td className="py-4 px-6 text-sm font-medium text-gray-700 border-r border-gray-50">{item.company}</td>
                      <td className="py-4 px-6 text-sm text-gray-600 border-r border-gray-50">{item.location}</td>
                      <td className="py-4 px-6 text-sm text-gray-500 max-w-[150px] truncate border-r border-gray-50">{item.description}</td>
                      <td className="py-4 px-6 text-center">
                        <span className={cn(
                          "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                          item.status === 'Aprovado' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                        )}>
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
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
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 text-center space-y-4">
              <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto">
                <Trash2 className="h-10 w-10 text-red-500" />
              </div>
              <h3 className="text-2xl font-bold text-gray-800">Reprovar Apontamento?</h3>
              <p className="text-gray-500 leading-relaxed font-medium">
                Esta ação não pode ser desfeita.
              </p>
            </div>
            <div className="flex p-6 gap-3 bg-gray-50 border-t border-gray-100">
              <button 
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 px-6 py-3 rounded-xl font-bold text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleReject}
                className="flex-1 px-6 py-3 rounded-xl font-bold bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-100 transition-all"
              >
                Confirmar Reprovação
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}



