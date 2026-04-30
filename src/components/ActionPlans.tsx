import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, Search, Filter, ChevronLeft, ChevronRight,
  Eye, FileText, Trash2, RotateCcw, Building2, MapPin,
  Calendar, Clock, LayoutGrid, CheckCircle2, User, AlertCircle,
  Type, ArrowLeft, Download, Loader2, Sparkles, Wand2, Printer, ChevronDown, Mail
} from 'lucide-react';
import { collection, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc, addDoc, getDocs, where } from '../lib/dbBridge';
import { useUser } from '../contexts/UserContext';
import { cn, getMediaUrl } from '../lib/utils';

const db = {} as any;

const formatSequential = (num: number) => num.toString().padStart(5, '0');
const formatDateBR = (dateStr: string) => {
  if (!dateStr) return '---';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
};

export default function ActionPlans({ setActiveTab }: { setActiveTab?: (tab: string) => void }) {
  const { isDemo, user, profile } = useUser();
  const [plans, setPlans] = useState<any[]>([]);
  const [allInspections, setAllInspections] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [filterCompany, setFilterCompany] = useState('Todas Empresas');
  const [filterUnit, setFilterUnit] = useState('Todas Unidades');
  const [filterSector, setFilterSector] = useState('Todos Setores');
  const [filterStatus, setFilterStatus] = useState('Todos Status');
  const [viewMode, setViewMode] = useState<'list' | 'create' | 'view'>('list');

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [showInspectionModal, setShowInspectionModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [planToDelete, setPlanToDelete] = useState<any>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // For Creation
  const [newPlanSearchTerm, setNewPlanSearchTerm] = useState('');
  const [selectedInspectionForNewPlan, setSelectedInspectionForNewPlan] = useState<any>(null);

  useEffect(() => {
    if (isDemo) {
      setPlans([
        {
          id: 'p1',
          inspectionId: '1310',
          inspectionSequential: '01310',
          company: 'Matriz',
          unitName: 'Unidade Matriz',
          sector: 'Logística',
          local: 'Doca',
          actionDescription: 'Instalação imediata de suporte fixo para calços e sinalização vertical.',
          actionDate: '2026-03-20',
          status: 'Concluído',
          responsible: 'Gustavo Souza',
          photoAfter: ''
        }
      ]);
      setAllInspections([
        { id: '1310', unitName: 'Unidade Matriz', sectorName: 'Logística', locationName: 'Doca', description: 'Ausência de calços', hasActionPlan: true }
      ]);
      setCompanies([{ id: '1', name: 'Matriz' }]);
      setLoading(false);
      return;
    }

    const unsubPlans = onSnapshot(query(collection(db, 'action_plans'), orderBy('createdAt', 'desc')), (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPlans(docs);
      setLoading(false);
    });

    onSnapshot(collection(db, 'inspections'), (snapshot) => {
      setAllInspections(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    onSnapshot(collection(db, 'companies'), (snapshot) => {
      setCompanies(snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
    });

    return () => unsubPlans();
  }, [isDemo]);

  const filtered = plans.filter(p => {
    const search = searchTerm.toLowerCase();
    const matchesSearch =
      p.company?.toLowerCase().includes(search) ||
      (p.unitName || p.unit)?.toLowerCase().includes(search) ||
      p.sector?.toLowerCase().includes(search) ||
      p.local?.toLowerCase().includes(search) ||
      p.actionDescription?.toLowerCase().includes(search);

    const matchesCompany = filterCompany === 'Todas Empresas' || p.company === filterCompany;
    const matchesUnit = filterUnit === 'Todas Unidades' || (p.unitName || p.unit) === filterUnit;
    const matchesSector = filterSector === 'Todos Setores' || p.sector === filterSector;
    const matchesStatus = filterStatus === 'Todos Status' || p.status === filterStatus;

    return matchesSearch && matchesCompany && matchesUnit && matchesSector && matchesStatus;
  });

  const uniqueUnits = useMemo(() => {
    const plansByCompany = filterCompany === 'Todas Empresas' ? plans : plans.filter(p => p.company === filterCompany);
    return Array.from(new Set(plansByCompany.map(p => p.unitName || p.unit).filter(Boolean)));
  }, [plans, filterCompany]);

  const uniqueSectors = useMemo(() => {
    const plansByCompanyAndUnit = plans.filter(p => {
      const mc = filterCompany === 'Todas Empresas' || p.company === filterCompany;
      const mu = filterUnit === 'Todas Unidades' || (p.unitName || p.unit) === filterUnit;
      return mc && mu;
    });
    return Array.from(new Set(plansByCompanyAndUnit.map(p => p.sector).filter(Boolean)));
  }, [plans, filterCompany, filterUnit]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1;
  const paginatedItems = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const inspectionSeqMap = useMemo(() => {
    const map: Record<string, string> = {};
    allInspections.forEach(i => {
      map[i.id] = (i as any).sequential || i.id.substring(0, 5);
    });
    return map;
  }, [allInspections]);

  const getInspectionSeq = (plan: any) => {
    return plan.inspectionSequential || inspectionSeqMap[plan.inspectionId] || '---';
  };

  const getSequentialNumber = (id: string) => {
    const idx = plans.findIndex(p => p.id === id);
    return idx !== -1 ? plans.length - idx : 0;
  };

  const handleView = (plan: any) => {
    setSelectedPlan(plan);
    setViewMode('view');
  };

  const handleGeneratePDF = async (plan: any) => {
    setSelectedPlan(plan);
    setIsGeneratingPDF(true);

    try {
      const apiUrl = (import.meta as any).env.VITE_API_URL || '';
      const response = await fetch(`${apiUrl}/api/reports/legacy/action-plan/${plan.id}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro na geração do PDF legado.');
      }

      const { url: pdfUrl } = await response.json();
      window.open(getMediaUrl(pdfUrl), '_blank');
    } catch (error: any) {
      console.error('Erro ao gerar PDF legado', error);
      setErrorMessage('Erro ao gerar PDF: ' + (error.message || 'Erro desconhecido'));
      setShowErrorModal(true);
      return;
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const downloadPDF = async (plan: any) => {
    setSelectedPlan(plan);
    setIsGeneratingPDF(true);
    try {
      const apiUrl = (import.meta as any).env.VITE_API_URL || '';
      const response = await fetch(`${apiUrl}/api/reports/legacy/action-plan/${plan.id}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!response.ok) throw new Error('Erro na geração do PDF.');
      const { url: pdfUrl } = await response.json();

      const link = document.createElement('a');
      link.href = getMediaUrl(pdfUrl);
      link.download = `Plano de Ação - ${plan.unitName || plan.unit || plan.company} - #${getSequentialNumber(plan.id)}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      setErrorMessage('Erro ao baixar documento: ' + (err.message || 'Erro desconhecido'));
      setShowErrorModal(true);
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const sendEmailPDF = async (plan: any) => {
    setSelectedPlan(plan);
    setIsGeneratingPDF(true);
    try {
      const apiUrl = (import.meta as any).env.VITE_API_URL || '';
      const response = await fetch(`${apiUrl}/api/reports/email-action-plan/${plan.id}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!response.ok) throw new Error('Erro ao disparar envio de e-mail.');
      const result = await response.json();
      
      if (result.success) {
         if (result.count === 0) {
            setErrorMessage('Plano gerado, mas não há administradores na empresa para receber o e-mail.');
            setShowErrorModal(true);
            setTimeout(() => setShowErrorModal(false), 3000);
         } else {
            setSuccessMessage('E-mail enviado com sucesso para os administradores!');
            setShowSuccessModal(true);
            setTimeout(() => setShowSuccessModal(false), 3000);
         }
      } else {
         setErrorMessage(result.message || 'Erro desconhecido.');
         setShowErrorModal(true);
         setTimeout(() => setShowErrorModal(false), 3000);
      }
    } catch (err: any) {
      setErrorMessage('Erro no envio: ' + err.message);
      setShowErrorModal(true);
      setTimeout(() => setShowErrorModal(false), 3000);
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handleDeleteClick = (plan: any) => {
    setPlanToDelete(plan);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!planToDelete) return;
    if (isDemo) {
      setPlans(prev => prev.filter(p => p.id !== planToDelete.id));
      setShowDeleteModal(false);
      setPlanToDelete(null);
      return;
    }
    try {
      await deleteDoc(doc(db, 'action_plans', planToDelete.id));
      if (planToDelete.inspectionId) {
        await updateDoc(doc(db, 'inspections', planToDelete.inspectionId), {
          hasActionPlan: false,
          status: 'Pendente'
        });
      }
      setShowDeleteModal(false);
      setPlanToDelete(null);
    } catch (error) {
      console.error(error);
      setErrorMessage('Erro ao excluir o plano de ação selecionado.');
      setShowErrorModal(true);
    }
  };

  if (viewMode === 'create') {
    return (
      <div className="animate-in fade-in slide-in-from-right-4 duration-500 pb-20">
        <div className="bg-white py-3 px-4 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between mb-6">
          <h1 className="text-xl font-black text-[#1E3A5F] ml-2 tracking-wide uppercase">
            Novo Plano de Ação
          </h1>
          <button 
            onClick={() => { setViewMode('list'); setSelectedInspectionForNewPlan(null); }}
            className="bg-[#5D6D7E] hover:bg-[#4D5A68] text-white px-5 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-md"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>
        </div>

        <div className="bg-white rounded-[32px] shadow-sm overflow-hidden border border-gray-100">
           {!selectedInspectionForNewPlan ? (
             <div className="p-8 space-y-8">
                <section className="space-y-6">
                   <h3 className="text-[#27AE60] font-bold text-lg flex items-center gap-2 italic uppercase">
                      <Search className="h-5 w-5" />
                      1. Selecione a Inspeção / Apontamento
                   </h3>
                   <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 font-bold" />
                      <input 
                        type="text" 
                        placeholder="Pesquisar por descrição, local ou setor..."
                        className="w-full bg-gray-50 border border-gray-200 rounded-2xl pl-12 pr-6 py-4 text-sm focus:ring-2 focus:ring-[#27AE60] outline-none transition-all font-bold placeholder:text-gray-300"
                        value={newPlanSearchTerm}
                        onChange={(e) => setNewPlanSearchTerm(e.target.value)}
                      />
                   </div>
                   <div className="grid grid-cols-1 gap-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                      {allInspections
                        .filter(i => {
                          // 1. Basic filter: must NOT have an action plan yet
                          if (i.hasActionPlan) return false;

                          // 2. Search term filter
                          const search = newPlanSearchTerm.toLowerCase();
                          const matchesSearch = 
                            i.description?.toLowerCase().includes(search) ||
                            i.locationName?.toLowerCase().includes(search) ||
                            i.sectorName?.toLowerCase().includes(search);
                          
                          if (!matchesSearch) return false;

                          // 3. Role-based visibility filter (Frontend security layer)
                          if (!profile || profile.role === 'Master') return true;

                          if (profile.role === 'Administrador') {
                            return profile.companies?.includes(i.companyId);
                          }

                          if (profile.role === 'Gestor') {
                            const matchSectorId = i.sectorId && profile.sectors?.includes(i.sectorId);
                            const matchLocationId = i.locationId && profile.locations?.includes(i.locationId);
                            
                            // Name-based fallback (legacy)
                            const matchSectorName = i.sectorName && profile.sectorNames?.some((sn: string) => sn.toLowerCase() === i.sectorName?.toLowerCase());
                            const matchUnitName = i.unitName && profile.unitNames?.some((un: string) => un.toLowerCase() === i.unitName?.toLowerCase());
                            const matchUnitId = i.unitId && profile.units?.includes(i.unitId);
                            const nameMatch = matchSectorName && (matchUnitId || matchUnitName);

                            return !!(matchSectorId || matchLocationId || nameMatch);
                          }

                          if (profile.role === 'Usuário Comum') {
                             const matchUnitId = i.unitId && profile.units?.includes(i.unitId);
                             const matchUnitName = i.unitName && profile.unitNames?.some((un: string) => un.toLowerCase() === i.unitName?.toLowerCase());
                             return !!(matchUnitId || matchUnitName);
                          }

                          return false;
                        })
                        .map(insp => (
                        <button 
                          key={insp.id}
                          onClick={() => setSelectedInspectionForNewPlan(insp)}
                          className="flex items-center justify-between p-6 bg-white border-2 border-gray-50/50 rounded-2xl hover:border-[#27AE60] hover:bg-green-50/20 transition-all text-left group shadow-sm"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                               <span className="bg-gray-100 text-gray-400 px-3 py-1 rounded-lg text-[10px] font-black tracking-widest uppercase">#{inspectionSeqMap[insp.id]}</span>
                               <span className="text-[#1E3A5F] font-black text-sm uppercase tracking-tight">{insp.sectorName} / {insp.locationName}</span>
                            </div>
                            <p className="text-gray-500 text-xs italic line-clamp-2">"{insp.description}"</p>
                          </div>
                          <Plus className="h-6 w-6 text-gray-300 group-hover:text-[#27AE60] group-hover:scale-110 transition-all" />
                        </button>
                      ))}
                   </div>
                </section>
             </div>
           ) : (
             <div className="p-8 space-y-8 animate-in zoom-in-95 duration-300">
                <section className="bg-green-50/50 p-6 rounded-3xl border border-green-100 flex items-center justify-between">
                   <div className="flex items-center gap-4">
                      <div className="bg-[#27AE60] p-3 rounded-2xl shadow-lg shadow-green-100/50">
                         <AlertCircle className="h-6 w-6 text-white" />
                      </div>
                      <div>
                         <h3 className="font-black uppercase tracking-widest text-[10px] text-[#27AE60]">Inspeção Vinculada</h3>
                         <p className="text-[#1E3A5F] font-black text-sm tracking-tight uppercase">#{inspectionSeqMap[selectedInspectionForNewPlan.id]} - {selectedInspectionForNewPlan.locationName}</p>
                      </div>
                   </div>
                   <button onClick={() => setSelectedInspectionForNewPlan(null)} className="text-[10px] font-black px-5 py-2.5 bg-white text-gray-400 border border-gray-100 rounded-xl hover:text-red-500 hover:border-red-100 transition-all uppercase tracking-widest">Trocar</button>
                </section>

                <form className="space-y-8" onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.target as any;
                  const data = {
                    inspectionId: selectedInspectionForNewPlan.id,
                    inspectionSequential: inspectionSeqMap[selectedInspectionForNewPlan.id],
                    companyId: selectedInspectionForNewPlan.companyId || null,
                    unitId: selectedInspectionForNewPlan.unitId || null,
                    sectorId: selectedInspectionForNewPlan.sectorId || null,
                    locationId: selectedInspectionForNewPlan.locationId || null,
                    company: selectedInspectionForNewPlan.company || selectedInspectionForNewPlan.companyName,
                    unit: selectedInspectionForNewPlan.unit || selectedInspectionForNewPlan.unitName,
                    sector: selectedInspectionForNewPlan.sector || selectedInspectionForNewPlan.sectorName,
                    local: selectedInspectionForNewPlan.local || selectedInspectionForNewPlan.locationName,
                    description: selectedInspectionForNewPlan.description,
                    actionDescription: form.actionDescription.value,
                    actionDate: form.actionDate.value,
                    responsible: form.responsible.value,
                    status: 'Pendente',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    registeredBy: profile?.displayName || user?.email,
                    registeredByUid: user?.uid,
                    photoBefore: selectedInspectionForNewPlan.image || '',
                    photoAfter: ''
                  };

                  try {
                    setIsGeneratingPDF(true); // Uso o overlay de carregamento
                    const docRef = await addDoc(collection(db, 'action_plans'), data);
                    await updateDoc(doc(db, 'inspections', selectedInspectionForNewPlan.id), {
                      hasActionPlan: true,
                      status: 'Em Processo'
                    });
                    
                    // Dispara envio de e-mail automático em background
                    try {
                        const apiUrl = (import.meta as any).env.VITE_API_URL || '';
                        fetch(`${apiUrl}/api/reports/email-action-plan/${docRef.id}`, {
                           method: 'POST',
                           headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
                        }).catch(e => console.error(e));
                    } catch(e) {}

                    setViewMode('list');
                    setSelectedInspectionForNewPlan(null);
                  } catch (err) {
                    setErrorMessage('Erro ao salvar o plano de ação. Verifique se todos os campos estão preenchidos.');
                    setShowErrorModal(true);
                  } finally {
                    setIsGeneratingPDF(false);
                  }
                }}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                     <div className="space-y-6">
                        <section className="space-y-4">
                           <h4 className="text-[10px] font-black text-[#27AE60] uppercase tracking-[2px] ml-1 flex items-center gap-2 italic">
                              <Type className="h-4 w-4" /> Detalhes da Ação
                           </h4>
                           <div className="space-y-2">
                              <label className="text-xs font-bold text-gray-500 ml-1">Ação Corretiva/Proposta <span className="text-red-500">*</span></label>
                              <textarea 
                                name="actionDescription"
                                required
                                placeholder="Descreva as ações que serão tomadas..."
                                className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-5 text-sm outline-none focus:ring-2 focus:ring-[#27AE60] min-h-[150px] transition-all"
                              />
                           </div>
                        </section>
                     </div>

                     <div className="space-y-6">
                        <section className="space-y-4">
                           <h4 className="text-[10px] font-black text-[#27AE60] uppercase tracking-[2px] ml-1 flex items-center gap-2 italic">
                              <Calendar className="h-4 w-4" /> Prazos e Fotos
                           </h4>
                           <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 ml-1">Prazo de Resolução <span className="text-red-500">*</span></label>
                                <input type="date" name="actionDate" required className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4 text-sm outline-none focus:ring-2 focus:ring-[#27AE60]" />
                              </div>
                              <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 ml-1">Responsável <span className="text-red-500">*</span></label>
                                <input type="text" name="responsible" required placeholder="Nome do responsável" className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4 text-sm outline-none focus:ring-2 focus:ring-[#27AE60]" />
                              </div>
                           </div>
                           
                           <div className="space-y-2">
                              <label className="text-xs font-bold text-gray-500 ml-1">Foto da Resolução (Depois)</label>
                              <label className="relative cursor-pointer group flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-gray-200 rounded-[32px] bg-gray-50/50 hover:bg-green-50/30 hover:border-[#27AE60] transition-all aspect-video overflow-hidden">
                                 <div className="p-4 bg-white rounded-2xl shadow-sm text-gray-400 group-hover:text-[#27AE60] group-hover:scale-110 transition-all">
                                    <Plus className="h-8 w-8" />
                                 </div>
                                 <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 group-hover:text-[#27AE60]">Upload Foto Depois</p>
                                 <input type="file" className="hidden" accept="image/*" />
                              </label>
                           </div>
                        </section>
                     </div>
                  </div>

                  <div className="pt-8 border-t border-gray-100 flex justify-end gap-4">
                    <button type="button" onClick={() => setViewMode('list')} className="px-10 py-4 rounded-2xl font-black text-gray-400 uppercase text-[10px] tracking-[2px] hover:bg-gray-100 transition-all">Cancelar</button>
                    <button type="submit" className="px-12 py-4 bg-[#27AE60] text-white rounded-2xl font-black uppercase text-[10px] tracking-[4px] shadow-xl shadow-green-100 hover:scale-[1.02] active:scale-95 transition-all">Salvar Plano</button>
                  </div>
                </form>
             </div>
           )}
        </div>
      </div>
    );
  }


  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      {/* Header */}
      <div className="bg-white py-3 px-4 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between">
        <h1 className="text-xl font-black text-[#1E3A5F] ml-2 tracking-wide uppercase flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-[#27AE60]" />
          Planos de Ação
        </h1>
        {profile?.role !== 'Usuário Comum' && (
          <button 
            onClick={() => setViewMode('create')}
            className="bg-[#27AE60] hover:bg-[#219150] text-white px-5 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-md active:scale-95 uppercase tracking-widest"
          >
            <Plus className="h-4 w-4" /> Novo Plano
          </button>
        )}
      </div>

      {/* Unified Search and Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 flex flex-col">
        <div className="p-4 flex flex-col md:flex-row items-center gap-4">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input 
              type="text" 
              placeholder="Buscar por descrição, local..."
              className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-10 pr-4 py-2.5 text-sm text-gray-700 focus:ring-2 focus:ring-green-500 outline-none transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button 
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={cn(
              "w-full md:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all border",
              showAdvancedFilters 
                ? "bg-[#27AE60] text-white border-[#27AE60] hover:bg-[#219150]" 
                : "bg-gray-100 hover:bg-gray-200 text-gray-700 border-gray-200"
            )}
          >
            <Filter className="h-4 w-4" />
            Filtros Avançados
            <ChevronDown className={cn("h-4 w-4 transition-transform", showAdvancedFilters && "rotate-180")} />
          </button>
        </div>

        {/* Modal / Slide-down for Advanced Filters */}
        {showAdvancedFilters && (
          <div className="p-4 border-t border-gray-100 bg-gray-50/50 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-in slide-in-from-top-2 fade-in duration-300">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-600">Empresa</label>
              <select 
                 value={filterCompany} 
                 onChange={(e) => {
                    setFilterCompany(e.target.value);
                    setFilterUnit('Todas Unidades');
                    setFilterSector('Todos Setores');
                 }} 
                 className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition-all"
              >
                 <option value="Todas Empresas">Todas Empresas</option>
                 {companies.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>

            {filterCompany !== 'Todas Empresas' && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-600">Unidade</label>
                <select 
                  value={filterUnit} 
                  onChange={(e) => {
                     setFilterUnit(e.target.value);
                     setFilterSector('Todos Setores');
                  }} 
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition-all"
                >
                  <option value="Todas Unidades">Todas Unidades</option>
                  {uniqueUnits.map((u: any) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            )}

            {filterUnit !== 'Todas Unidades' && filterCompany !== 'Todas Empresas' && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-600">Setor</label>
                <select 
                  value={filterSector} 
                  onChange={(e) => setFilterSector(e.target.value)} 
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition-all"
                >
                  <option value="Todos Setores">Todos Setores</option>
                  {uniqueSectors.map((s: any) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-600">Status</label>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition-all">
                 <option value="Todos Status">Todos Status</option>
                 <option value="Pendente">Pendente</option>
                 <option value="Concluído">Concluído</option>
              </select>
            </div>

            <div className="flex items-end gap-2 lg:col-span-4 justify-end mt-2">
              <button 
                onClick={() => {
                  setFilterCompany('Todas Empresas');
                  setFilterUnit('Todas Unidades');
                  setFilterSector('Todos Setores');
                  setFilterStatus('Todos Status');
                  setSearchTerm('');
                }}
                className="bg-[#5D6D7E] hover:bg-[#4D5A68] text-white px-6 py-2 rounded-lg transition-all shadow-md flex items-center justify-center font-bold text-sm gap-2"
              >
                <RotateCcw className="h-4 w-4" /> Limpar Filtros
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-100">
        <div className="bg-[#27AE60] p-4 text-white font-black uppercase tracking-widest text-[10px] flex justify-between items-center px-6">
           <span>Lista de Planos de Ação</span>
           <span>{filtered.length} Registros</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100 text-[11px] font-black uppercase text-[#27AE60] tracking-widest">
                <th className="py-4 px-6 text-left border-r border-gray-100">Plano</th>
                <th className="py-4 px-6 text-left border-r border-gray-100">Unidade / Setor</th>
                <th className="py-4 px-6 text-left border-r border-gray-100">Ação Corretiva</th>
                <th className="py-4 px-6 text-center">Status</th>
                <th className="py-4 px-6 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && plans.length === 0 ? (
                <tr><td colSpan={5} className="py-12 text-center text-gray-400 animate-pulse">Carregando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="py-12 text-center text-gray-400 italic font-medium">Nenhum plano encontrado.</td></tr>
              ) : (
                paginatedItems.map((plan) => (
                  <tr key={plan.id} className="hover:bg-gray-50/30 transition-colors group">
                    <td className="py-4 px-6 border-r border-gray-50">
                       <p className="font-bold text-gray-700">#{formatSequential(getSequentialNumber(plan.id))}</p>
                       <p className="text-[10px] text-gray-400 font-bold">Insp. #{getInspectionSeq(plan)}</p>
                    </td>
                    <td className="py-4 px-6 border-r border-gray-50">
                       <p className="text-gray-700 font-bold">{plan.unitName || plan.unit || plan.company}</p>
                       <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{plan.sector} / {plan.local}</p>
                    </td>
                    <td className="py-4 px-6 border-r border-gray-50">
                       <p className="text-gray-600 line-clamp-2 italic text-xs">"{plan.actionDescription || plan.description}"</p>
                    </td>
                    <td className="py-4 px-6 text-center border-r border-gray-50">
                       <span className={cn(
                         "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest text-white shadow-sm",
                         plan.status === 'Concluído' ? "bg-[#27AE60]" : "bg-red-500"
                       )}>
                         {plan.status}
                       </span>
                    </td>
                    <td className="py-4 px-6 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => handleGeneratePDF(plan)} className="p-2.5 bg-[#00A8CC]/10 text-[#00A8CC] rounded-xl hover:bg-[#00A8CC] hover:text-white transition-all shadow-sm active:scale-90" title="Visualizar PDF">
                          <Eye className="h-4.5 w-4.5" />
                        </button>
                        <button onClick={() => downloadPDF(plan)} className="p-2.5 bg-[#27AE60]/10 text-[#27AE60] rounded-xl hover:bg-[#27AE60] hover:text-white transition-all shadow-sm active:scale-90" title="Baixar PDF">
                          <Download className="h-4.5 w-4.5" />
                        </button>
                        
                        {profile?.role !== 'Gestor' && (
                          <>
                            <button onClick={() => sendEmailPDF(plan)} className="p-2.5 bg-yellow-50 text-yellow-600 rounded-xl hover:bg-yellow-500 hover:text-white transition-all shadow-sm active:scale-90" title="Reenviar por E-mail">
                              <Mail className="h-4.5 w-4.5" />
                            </button>
                            <button onClick={() => handleDeleteClick(plan)} className="p-2.5 bg-red-50 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all shadow-sm active:scale-90" title="Remover">
                              <Trash2 className="h-4.5 w-4.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )))}
            </tbody>
          </table>
        </div>

        {/* Pagination Block - Standard Green Block Style */}
        <div className="p-6 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-400 font-black uppercase tracking-widest pl-2">Itens por página:</span>
            <div className="relative">
              <select 
                value={itemsPerPage}
                onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                className="bg-white border border-gray-200 text-gray-700 text-xs rounded-xl px-3 py-2 pr-8 outline-none font-black shadow-sm appearance-none cursor-pointer hover:border-gray-300 transition-colors"
              >
                <option value={10}>10</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
            </div>
          </div>

          <div className="flex items-center gap-2 pr-2">
             <button 
                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} 
                disabled={currentPage === 1} 
                className="p-2.5 border border-gray-200 bg-white rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-30 text-gray-500 shadow-sm"
             >
                <ChevronLeft className="h-4 w-4" />
             </button>
             
             <div className="bg-[#27AE60] text-white px-5 py-2.5 rounded-xl font-black text-sm shadow-md animate-in zoom-in-95 duration-200">
                {currentPage}
             </div>
             
             <button 
                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} 
                disabled={currentPage === totalPages} 
                className="p-2.5 border border-gray-200 bg-white rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-30 text-gray-500 shadow-sm"
             >
                <ChevronRight className="h-4 w-4" />
             </button>
          </div>
        </div>
      </div>

      {showDeleteModal && createPortal(
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 text-center space-y-4">
              <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto ring-8 ring-red-50/50">
                <Trash2 className="h-10 w-10 text-red-500" />
              </div>
              <h3 className="text-2xl font-black text-gray-800 uppercase tracking-tight italic">Excluir Plano?</h3>
              <p className="text-gray-500 leading-relaxed font-medium">
                Você deseja remover este plano de ação?
                <br />
                <span className="text-red-500 text-xs font-black uppercase tracking-widest block mt-2">A ação não poderá ser desfeita.</span>
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
                Confirmar Exclusão
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Success Modal */}
      {showSuccessModal && document.body ? createPortal(
        <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl shadow-2xl p-8 flex flex-col items-center justify-center text-center max-w-sm animate-in zoom-in-90 duration-300 border border-gray-100">
            <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mb-6 ring-8 ring-emerald-50/50">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            </div>
            <h3 className="text-2xl font-black text-gray-800 tracking-tight uppercase italic mb-2">Sucesso!</h3>
            <p className="text-gray-500 font-medium">{successMessage}</p>
          </div>
        </div>, document.body
      ) : null}

      {/* Error Modal */}
      {showErrorModal && document.body ? createPortal(
        <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl shadow-2xl p-8 flex flex-col items-center justify-center text-center max-w-sm animate-in zoom-in-90 duration-300 border border-gray-100">
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-6 ring-8 ring-red-50/50">
              <AlertCircle className="h-10 w-10 text-red-500" />
            </div>
            <h3 className="text-2xl font-black text-gray-800 tracking-tight uppercase italic mb-2">Atenção</h3>
            <p className="text-gray-500 font-medium">{errorMessage}</p>
          </div>
        </div>, document.body
      ) : null}

      {/* Generation Overlay - Now using Portal for absolute Full Screen coverage */}
      {isGeneratingPDF && createPortal(
        <div className="fixed inset-0 z-[999999] bg-slate-900/70 backdrop-blur-md flex items-center justify-center flex-col gap-4 animate-in fade-in duration-300">
          <div className="bg-white p-12 rounded-[40px] shadow-2xl flex flex-col items-center gap-8 border border-gray-100 animate-in zoom-in-95 duration-500">
            <div className="relative">
              <Loader2 className="h-16 w-16 text-[#27AE60] animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center text-[#27AE60]">
                 <FileText className="h-6 w-6" />
              </div>
            </div>
            <div className="text-center space-y-2">
              <h4 className="text-xl font-black text-[#1E3A5F] uppercase tracking-tighter">Gerando Documento</h4>
              <div className="flex items-center justify-center gap-2">
                <span className="w-1.5 h-1.5 bg-[#27AE60] rounded-full animate-bounce" />
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[3px]">Aguarde a finalização...</p>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
