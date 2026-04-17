import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  FileText, Plus, Search, Trash2, X, Check, AlertCircle, Loader2,
  ChevronUp, Filter, ChevronLeft, ChevronRight, Download, Eye, 
  RotateCcw, Building2, MapPin, Calendar, Clock, LayoutGrid, 
  CheckCircle2, User, Type, ArrowLeft, Sparkles, Wand2, Printer, 
  ChevronDown, FileBarChart, CheckCircle, Send
} from 'lucide-react';
import { 
  collection, 
  onSnapshot, 
  doc, 
  deleteDoc, 
  query, 
  orderBy,
  addDoc,
  where,
  serverTimestamp
} from '../lib/dbBridge';

import { useUser } from '../contexts/UserContext';
import { cn, getMediaUrl } from '../lib/utils';

const db = {} as any;

const getWeekRange = (week: number, year: number) => {
  const janFirst = new Date(year, 0, 1);
  const days = (week - 1) * 7;
  const start = new Date(year, 0, 1 + days);
  const dayOfWeek = start.getDay();
  start.setDate(start.getDate() - dayOfWeek + 1); 
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return {
     start: start.toLocaleDateString('pt-BR'),
     end: end.toLocaleDateString('pt-BR'),
     full: `${start.toLocaleDateString('pt-BR')} à ${end.toLocaleDateString('pt-BR')}`
  };
};

const getCurrentWeek = () => {
  const now = new Date();
  const onejan = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil((((now.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7);
  return week > 52 ? 52 : week;
};

export default function Reports() {
  const { isDemo, profile } = useUser();
  const [reports, setReports] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedWeek, setSelectedWeek] = useState(getCurrentWeek().toString());
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationLog, setGenerationLog] = useState<string[]>([]);
  
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<any>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [isSending, setIsSending] = useState<string | null>(null);

  const handleSendManual = async (reportId: string) => {
    if (isDemo) {
      setSuccessMessage('E-mail enviado! (Simulado)');
      setShowSuccessModal(true);
      setTimeout(() => setShowSuccessModal(false), 2500);
      return;
    }
    setIsSending(reportId);
    try {
      const apiUrl = (import.meta as any).env.VITE_API_URL || '';
      const response = await fetch(`${apiUrl}/api/reports/send-manual`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ reportId })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao enviar o e-mail.');
      }

      setSuccessMessage('Relatório enviado aos e-mails cadastrados e administradores!');
      setShowSuccessModal(true);
      setTimeout(() => setShowSuccessModal(false), 3500);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Ocorreu um erro ao enviar.');
      setShowErrorModal(true);
    } finally {
      setIsSending(null);
    }
  };

  const adjustWeek = (delta: number) => {
    let w = parseInt(selectedWeek) + delta;
    let y = parseInt(selectedYear);
    if (w < 1) {
      w = 52;
      y -= 1;
    }
    if (w > 52) {
      w = 1;
      y += 1;
    }
    setSelectedWeek(w.toString());
    setSelectedYear(y.toString());
  };

  useEffect(() => {
    onSnapshot(query(collection(db, 'companies'), orderBy('name', 'asc')), (snap) => {
      setCompanies(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const q = query(collection(db, 'weekly_reports'), orderBy('createdAt', 'desc'));
    onSnapshot(q, (snap) => {
      setReports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (selectedCompanyId) {
      onSnapshot(query(collection(db, 'units'), where('companyId', '==', selectedCompanyId), orderBy('name', 'asc')), (snap) => {
        setUnits(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
    } else {
      setUnits([]);
      setSelectedUnitId('');
    }
  }, [selectedCompanyId]);

  const addLog = (msg: string) => setGenerationLog(prev => [...prev.slice(-3), msg]);

  const handleGenerateReport = async () => {
    if (!selectedCompanyId || !selectedWeek) return;
    setIsGenerating(true);
    setGenerationLog(['Iniciando geração...']);
    
    try {
      const company = companies.find(c => c.id === selectedCompanyId);
      const weekRange = getWeekRange(parseInt(selectedWeek), parseInt(selectedYear));

      let iterations: any[] = [];
      if (selectedUnitId) {
        const u = units.find(x => x.id === selectedUnitId);
        iterations.push(u || { id: '', name: 'Geral' });
      } else {
        const compUnits = units.filter(u => u.companyId === selectedCompanyId);
        if (compUnits.length > 0) {
          iterations.push(...compUnits);
        } else {
          iterations.push({ id: '', name: 'Geral' });
        }
      }

      const apiUrl = (import.meta as any).env.VITE_API_URL || '';

      for (const unitItem of iterations) {
          addLog(`Processando Filial: ${unitItem.name}...`);
          
          const response = await fetch(`${apiUrl}/api/reports/legacy/weekly`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
              week: selectedWeek,
              year: selectedYear,
              companyId: selectedCompanyId,
              unitId: unitItem.id || undefined
            })
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `Erro na filial ${unitItem.name}.`);
          }

          const { url: pdfUrl } = await response.json();
          
          const namePrefix = unitItem.id ? unitItem.name : company!.name;
          const reportName = `${namePrefix} - Sem ${selectedWeek.padStart(2, '0')}`;

          await addDoc(collection(db, 'weekly_reports'), {
             name: reportName,
             company: company!.name,
             unit: unitItem.name || 'Geral',
             companyId: selectedCompanyId,
             unitId: unitItem.id || null,
             week: parseInt(selectedWeek),
             year: parseInt(selectedYear),
             range: weekRange.full,
             pdfUrl: pdfUrl,
             createdAt: serverTimestamp()
          });
      }

      setLoading(true); // Trigger a refresh
      addLog('Concluído todas as filiais!');
      
      setTimeout(() => {
        setIsGenerating(false);
        setShowCreateModal(false);
        setGenerationLog([]);
        setSuccessMessage('Relatório(s) gerado(s) e salvo(s) com sucesso!');
        setShowSuccessModal(true);
        setTimeout(() => setShowSuccessModal(false), 3500);
      }, 1000);

    } catch (err: any) {
      console.error(err);
      addLog(`Erro: ${err.message}`);
      setIsGenerating(false);
      setErrorMessage(err.message || 'Ocorreu um erro ao gerar relatórios.');
      setShowErrorModal(true);
    }
  };

  const filteredList = reports.filter(r => 
    r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.company.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredList.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedList = filteredList.slice(startIndex, startIndex + itemsPerPage);

  const downloadFile = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = getMediaUrl(url);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      await deleteDoc(doc(db, 'weekly_reports', itemToDelete.id));
      setShowDeleteModal(false);
      setItemToDelete(null);
    } catch (err: any) {
      console.error(err);
      alert('Erro ao excluir: ' + err.message);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      {/* Page Header - Standard Design */}
      <div className="bg-white py-3 px-4 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between">
        <h1 className="text-xl font-black text-[#1E3A5F] ml-2 tracking-wide uppercase flex items-center gap-3">
          <FileBarChart className="h-5 w-5 text-[#1E3A5F]" />
          Relatórios Semanais
        </h1>
        <button 
          onClick={() => setShowCreateModal(true)}
          className="bg-[#27AE60] hover:bg-[#219150] text-white px-5 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-md active:scale-95"
        >
          <Plus className="h-4 w-4" /> Novo Relatório
        </button>
      </div>

      {/* Global Filter Bar */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input 
            type="text" 
            placeholder="Buscar por nome, empresa ou unidade..."
            className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Content Table - Standard Look (Matches Inspections Page) */}
      <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
        <div className="bg-[#27AE60] p-4 flex items-center justify-between text-white font-black uppercase tracking-widest text-[10px] px-6">
           <span>Lista de Relatórios Gerados</span>
           <span>{filteredList.length} Registros</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-[11px] text-[#27AE60] uppercase bg-gray-50 font-black tracking-widest">
              <tr>
                <th className="px-6 py-4 border-r border-gray-100">Relatório</th>
                <th className="px-6 py-4 border-r border-gray-100">Empresa / Unidade</th>
                <th className="px-6 py-4 border-r border-gray-100 text-center">Referência</th>
                <th className="px-6 py-4 border-r border-gray-100 text-center">Data Geração</th>
                <th className="px-6 py-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && reports.length === 0 ? (
                <tr><td colSpan={4} className="py-12 text-center text-gray-400 animate-pulse font-bold uppercase tracking-widest text-[10px]">Carregando dados...</td></tr>
              ) : filteredList.length === 0 ? (
                <tr><td colSpan={4} className="py-12 text-center text-gray-400 italic font-medium">Nenhum relatório emitido.</td></tr>
              ) : (
                paginatedList.map((report) => (
                  <tr key={report.id} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="px-6 py-4 border-r border-gray-100">
                       <div className="flex items-center gap-3">
                          <div className="p-2 bg-emerald-50 text-[#27AE60] rounded-lg group-hover:bg-[#27AE60] group-hover:text-white transition-all">
                             <FileText className="h-4 w-4" />
                          </div>
                          <span className="font-bold text-gray-700">{report.name}</span>
                       </div>
                    </td>
                    <td className="px-6 py-4 border-r border-gray-100">
                       <p className="text-gray-700 font-bold">{report.company}</p>
                       <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{report.unit || 'Geral'}</p>
                    </td>
                    <td className="px-6 py-4 border-r border-gray-100 text-center">
                       <p className="text-[10px] text-gray-500 font-bold italic">{report.range}</p>
                    </td>
                    <td className="px-6 py-4 border-r border-gray-100 text-center">
                       <p className="text-[11px] font-mono text-gray-500">
                          {report.createdAt?.toDate ? report.createdAt.toDate().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '') : '---'}
                       </p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        {report.pdfUrl && (
                           <>
                              <a href={getMediaUrl(report.pdfUrl)} target="_blank" rel="noreferrer" className="p-2.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-all shadow-sm" title="Visualizar">
                                <Eye className="h-4 w-4" />
                              </a>
                              <button onClick={() => downloadFile(report.pdfUrl, `${report.name}.pdf`)} className="p-2.5 bg-green-50 text-[#27AE60] rounded-lg hover:bg-[#27AE60] hover:text-white transition-all shadow-sm" title="Download">
                                <Download className="h-4 w-4" />
                              </button>
                              <button onClick={() => handleSendManual(report.id)} disabled={isSending === report.id} className="p-2.5 bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-600 hover:text-white transition-all shadow-sm disabled:opacity-50" title="Enviar E-mail Manual">
                                {isSending === report.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                              </button>
                           </>
                        )}
                         <button 
                           onClick={() => {
                             setItemToDelete(report);
                             setShowDeleteModal(true);
                           }} 
                           className="p-2.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-all shadow-sm" title="Remover"
                         >
                           <Trash2 className="h-4 w-4" />
                         </button>
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

      {/* Creation Modal - Standard System Style */}
      {showCreateModal && createPortal(
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95">
             <div className="p-6 bg-[#27AE60] text-white flex items-center justify-between">
                <h3 className="text-xl font-bold flex items-center gap-2 uppercase tracking-wide italic">
                   <Plus className="h-5 w-5" /> Emitir Novo Relatório
                </h3>
                <button onClick={() => !isGenerating && setShowCreateModal(false)} className="p-1 hover:bg-white/10 rounded-lg transition-colors"><X className="h-6 w-6" /></button>
             </div>
             
             <div className="p-5 md:p-6 space-y-4 overflow-y-auto max-h-[75vh]">
                {isGenerating ? (
                   <div className="py-8 flex flex-col items-center justify-center space-y-6">
                      <Loader2 className="h-14 w-14 text-[#27AE60] animate-spin" />
                      <div className="text-center space-y-2">
                         <h4 className="text-lg font-black text-[#1E3A5F] uppercase tracking-wide">Gerando PDF Integrado</h4>
                         {generationLog.map((log, i) => (
                            <p key={i} className="text-[10px] font-black text-gray-400 uppercase tracking-widest animate-pulse italic">{log}</p>
                         ))}
                      </div>
                   </div>
                ) : (
                   <>
                      <div className="space-y-4">
                         <div className="space-y-4">
                             <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Empresa</label>
                                <div className="relative">
                                   <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#27AE60]" />
                                   <select value={selectedCompanyId} onChange={(e) => setSelectedCompanyId(e.target.value)} className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-2 focus:ring-[#27AE60]/20 font-bold text-xs appearance-none cursor-pointer">
                                      <option value="">Selecione a Empresa...</option>
                                      {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                   </select>
                                   <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                </div>
                             </div>
                             <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Unidade</label>
                                <div className="relative">
                                   <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#27AE60]" />
                                   <select value={selectedUnitId} onChange={(e) => setSelectedUnitId(e.target.value)} disabled={!selectedCompanyId} className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-2 focus:ring-[#27AE60]/20 font-bold text-xs disabled:opacity-50 appearance-none cursor-pointer">
                                      <option value="">Todas as Unidades</option>
                                      {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                   </select>
                                   <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                </div>
                             </div>
                         </div>
                         <div className="space-y-4 pt-1">
                              <div className="flex flex-col space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Período Selecionado</label>
                                
                                <div className="flex items-center justify-between bg-white border border-gray-200 rounded-2xl p-2.5 shadow-sm">
                                   <button onClick={() => adjustWeek(-1)} type="button" className="p-3 bg-emerald-50 hover:bg-emerald-100 rounded-xl text-[#27AE60] transition-all active:scale-95">
                                      <ChevronLeft className="h-5 w-5" />
                                   </button>
                                   
                                   <div className="flex flex-col items-center justify-center px-4">
                                      <span className="text-xl font-black text-[#27AE60] flex items-center gap-2">
                                         <Calendar className="h-5 w-5" />
                                         Sem {selectedWeek.padStart(2, '0')} / {selectedYear}
                                      </span>
                                      <span className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-widest">
                                         {getWeekRange(parseInt(selectedWeek), parseInt(selectedYear)).full}
                                      </span>
                                   </div>

                                   <button onClick={() => adjustWeek(1)} type="button" className="p-3 bg-emerald-50 hover:bg-emerald-100 rounded-xl text-[#27AE60] transition-all active:scale-95">
                                      <ChevronRight className="h-5 w-5" />
                                   </button>
                                </div>
                              </div>
                           </div>
                       </div>

                       <div className="flex items-center gap-3 pt-6">
                         <button onClick={() => setShowCreateModal(false)} className="flex-1 py-4 text-gray-400 font-bold uppercase text-[10px] tracking-widest hover:text-gray-600">Sair</button>
                         <button onClick={() => {
                              const alreadyExists = reports.some(r => r.week === parseInt(selectedWeek) && r.year === parseInt(selectedYear) && ((r.unitId || '') === (selectedUnitId || '')));
                              if (alreadyExists) {
                                setShowDuplicateModal(true);
                                return;
                              }
                              handleGenerateReport();
                            }
} disabled={!selectedCompanyId || !selectedWeek} className="flex-1 bg-[#27AE60] hover:bg-[#219150] text-white px-6 py-4 rounded-2xl font-bold transition-all shadow-lg active:scale-95 uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 disabled:opacity-50">
                            <Printer className="h-5 w-5" /> Compilar PDF
                         </button>
                      </div>
                   </>
                )}
             </div>
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
              <h3 className="text-2xl font-black text-gray-800 uppercase tracking-tight italic">Excluir Relatório?</h3>
              <p className="text-gray-500 leading-relaxed font-medium">
                Você deseja remover o relatório <span className="font-bold text-gray-700">{itemToDelete?.name}</span>? 
                <br/>
                <span className="text-red-500 text-xs font-black uppercase tracking-widest block mt-2">A ação não poderá ser desfeita e o arquivo será removido do servidor.</span>
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

      {/* Duplicate Blocking Modal */}
      {showDuplicateModal && createPortal(
        <div className="fixed inset-0 z-[200000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 text-center space-y-4">
              <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto ring-8 ring-amber-50/50">
                <AlertCircle className="h-10 w-10 text-amber-500" />
              </div>
              <h3 className="text-2xl font-black text-gray-800 uppercase tracking-tight italic">Relatório já existe</h3>
              <p className="text-gray-500 leading-relaxed font-medium">
                Já existe um relatório gerado para a <span className="font-bold text-gray-700">Semana {selectedWeek}/{selectedYear}</span> nesta unidade.
                <br/>
                <span className="text-amber-600 text-[10px] font-black uppercase tracking-widest block mt-2">Exclua o existente antes de gerar um novo.</span>
              </p>
            </div>
            <div className="flex p-6 justify-center bg-gray-50/50">
              <button
                onClick={() => setShowDuplicateModal(false)}
                className="px-10 py-4 rounded-xl font-black bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-100 transition-all uppercase text-[10px] tracking-widest"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Error Modal */}
      {showErrorModal && createPortal(
        <div className="fixed inset-0 z-[200000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 text-center space-y-4">
              <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto ring-8 ring-red-50/50">
                <AlertCircle className="h-10 w-10 text-red-500" />
              </div>
              <h3 className="text-2xl font-black text-gray-800 uppercase tracking-tight italic">Não foi possível gerar</h3>
              <p className="text-gray-500 leading-relaxed font-medium">
                {errorMessage}
              </p>
            </div>
            <div className="flex p-6 justify-center bg-gray-50/50">
              <button
                onClick={() => setShowErrorModal(false)}
                className="px-10 py-4 rounded-xl font-black bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-100 transition-all uppercase text-[10px] tracking-widest"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
