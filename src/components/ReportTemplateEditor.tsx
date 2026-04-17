import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  Plus, Search, Filter, Trash2, X, Check, AlertCircle, Loader2,
  Settings2, Layers, CheckCircle2, FileText, Image as ImageIcon,
  Building2, ChevronDown, UploadCloud, Save
} from 'lucide-react';
import { collection, updateDoc, doc, query, orderBy, onSnapshot, where } from '../lib/dbBridge';
import { cn, getMediaUrl } from '../lib/utils';

const db = {} as any;

const TEMPLATE_TYPES = [
  { id: 'SectorCover', label: 'Capa (Geral e Setores)', icon: FileText, desc: 'Fundo da Capa principal e divisores de setor' },
  { id: 'Findings', label: 'Interno (Dados)', icon: AlertCircle, desc: 'Fundo onde aparecem os dados e fotos' },
  { id: 'ActionPlan', label: 'Plano de Ação', icon: CheckCircle2, desc: 'Fundo do documento de plano de ação' },
];

export default function ReportTemplateEditor({ onClose }: { onClose: () => void }) {
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [companies, setCompanies] = useState<any[]>([]);
  const [isDefault, setIsDefault] = useState(false);
  const [templateData, setTemplateData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  
  // States for pending files
  const [pendingFiles, setPendingFiles] = useState<Record<string, File | null>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});

  useEffect(() => {
    onSnapshot(query(collection(db, 'companies'), orderBy('name', 'asc')), (snap) => {
      setCompanies(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  useEffect(() => {
    const targetId = isDefault ? 'default' : selectedCompanyId;
    if (!targetId) {
      setTemplateData({});
      setPendingFiles({});
      setPreviews({});
      return;
    }

    const q = query(collection(db, 'report_templates'), where('companyId', '==', targetId));
    return onSnapshot(q, (snapshot) => {
      const data: Record<string, any> = {};
      snapshot.docs.forEach(doc => {
        const d = doc.data();
        if (d.companyId === targetId) {
          data[d.type] = { id: doc.id, ...d };
        }
      });
      setTemplateData(data);
    });
  }, [selectedCompanyId, isDefault]);

  const handleFileSelect = (type: string, file: File) => {
    setPendingFiles(prev => ({ ...prev, [type]: file }));
    setPreviews(prev => ({ ...prev, [type]: URL.createObjectURL(file) }));
  };

  const handleSaveAll = async () => {
    const targetId = isDefault ? 'default' : selectedCompanyId;
    const company = companies.find(c => c.id === targetId);
    const companyName = isDefault ? 'SISTEMA' : (company?.name || 'EMPRESA');

    if (!targetId) {
      alert('Selecione uma empresa ou modo padrão.');
      return;
    }

    setLoading(true);
    try {
      const typesToUpload = Object.keys(pendingFiles).filter(t => !!pendingFiles[t]);
      
      for (const type of typesToUpload) {
        const file = pendingFiles[type]!;
        const formData = new FormData();
        formData.append('file', file);
        formData.append('companyId', targetId);
        formData.append('type', type);
        formData.append('companyName', companyName);

        const response = await fetch(`${(import.meta as any).env.VITE_API_URL || ''}/api/reports/templates/upload`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: formData
        });

        if (!response.ok) throw new Error(`Erro ao subir ${type}`);
      }

      setPendingFiles({});
      setPreviews({});
      setShowSuccessModal(true);
      setTimeout(() => setShowSuccessModal(false), 3000);
    } catch (err: any) {
      console.error(err);
      setErrorMessage('Erro no processo de salvamento: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-4xl rounded-[32px] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 max-h-[95vh]">
        
        {/* Header - Identical to System Standard */}
        <div className="bg-[#27AE60] p-6 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-4 pl-2">
             <Settings2 className="h-7 w-7" />
             <div className="space-y-0.5">
                <h2 className="text-xl font-black uppercase tracking-wide leading-none italic">Modelos de Layout</h2>
                <p className="text-[10px] text-white/70 font-black uppercase tracking-widest pl-0.5">Configuração de Fundos para Relatórios</p>
             </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-2xl transition-all"><X className="h-7 w-7" /></button>
        </div>

        {/* Configuration Bar */}
        <div className="p-6 bg-gray-50 border-b border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-inner">
           <div className="flex bg-gray-200/50 p-1.5 rounded-2xl border border-gray-200 w-full sm:w-auto">
              <button 
                onClick={() => { setIsDefault(false); setSelectedCompanyId(''); }} 
                className={cn("px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all w-full sm:w-auto", !isDefault ? "bg-white text-[#27AE60] shadow-md border border-gray-100" : "text-gray-500 hover:text-gray-700")}
              >
                Personalizar Empresa
              </button>
              <button 
                onClick={() => { setIsDefault(true); setSelectedCompanyId('default'); }}
                className={cn("px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all w-full sm:w-auto", isDefault ? "bg-[#27AE60] text-white shadow-md" : "text-gray-500 hover:text-gray-700")}
              >
                Padrão Geral do Sistema
              </button>
           </div>

           {!isDefault && (
              <div className="flex-1 max-w-sm relative w-full">
                <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#27AE60]" />
                <select 
                  value={selectedCompanyId} 
                  onChange={(e) => setSelectedCompanyId(e.target.value)}
                  className="w-full pl-11 pr-10 py-3.5 bg-white border border-gray-200 rounded-2xl outline-none font-bold text-xs appearance-none focus:ring-4 focus:ring-[#27AE60]/10 shadow-sm transition-all cursor-pointer"
                >
                   <option value="">Selecione a Empresa...</option>
                   {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              </div>
           )}
        </div>

        {/* Templates Grid Area */}
        <div className="flex-1 p-4 bg-white overflow-y-auto">
          {(isDefault || selectedCompanyId) ? (
             <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                   {TEMPLATE_TYPES.map((type) => {
                      const savedTemplate = templateData[type.id];
                      const pendingPreview = previews[type.id];
                      
                      return (
                        <div key={type.id} className="relative group p-0.5 rounded-[24px] transition-all hover:bg-gradient-to-br hover:from-[#27AE60]/20 hover:to-blue-500/20">
                          <div className="bg-white border border-gray-100 rounded-[22px] p-4 space-y-3 shadow-sm group-hover:shadow-xl transition-all h-full flex flex-col">
                             <div className="flex items-center gap-2">
                                <div className="h-7 w-7 bg-gray-50 rounded-lg flex items-center justify-center text-[#27AE60] border border-gray-100 group-hover:scale-110 transition-transform">
                                   <type.icon className="h-3.5 w-3.5" />
                                </div>
                                <div className="min-w-0">
                                   <h4 className="font-black text-[#1E3A5F] uppercase text-[8px] tracking-tight truncate">{type.label}</h4>
                                   <p className="text-[6px] text-gray-400 font-bold uppercase tracking-widest truncate">{type.desc}</p>
                                </div>
                             </div>

                             {/* Preview Space */}
                             <div className="flex-1 min-h-[85px] bg-gray-50 border border-dashed border-gray-200 rounded-xl overflow-hidden relative group/preview">
                                {(pendingPreview || savedTemplate?.minioUrl) ? (
                                   <img src={pendingPreview || getMediaUrl(savedTemplate?.minioUrl)} alt="Preview" className="w-full h-full object-cover" />
                                ) : (
                                   <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-300">
                                      <ImageIcon className="h-10 w-10 mb-2 opacity-20" />
                                      <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">Sem imagem vinculada</span>
                                   </div>
                                )}
                                
                                <label className="absolute inset-0 bg-black/40 backdrop-blur-[2px] opacity-0 group-hover/preview:opacity-100 transition-all flex items-center justify-center cursor-pointer">
                                   <div className="bg-white text-[#27AE60] p-4 rounded-full shadow-2xl scale-75 group-hover/preview:scale-100 transition-all">
                                      <UploadCloud className="h-6 w-6" />
                                   </div>
                                   <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && handleFileSelect(type.id, e.target.files[0])} className="hidden" />
                                </label>
                                
                                {pendingPreview && (
                                   <div className="absolute bottom-3 left-3 bg-blue-500 text-white px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shadow-lg flex items-center gap-1.5 animate-bounce">
                                      <Check className="h-3 w-3" /> Alteração Pendente
                                   </div>
                                )}
                             </div>
                          </div>
                        </div>
                      );
                   })}
                </div>

                {/* Big Final Button */}
                <div className="flex justify-center pt-6 border-t border-gray-100">
                   <button 
                      onClick={handleSaveAll} 
                      disabled={loading || Object.keys(pendingFiles).length === 0}
                      className={cn(
                        "flex items-center gap-4 px-10 py-4 rounded-[20px] font-black uppercase tracking-[0.2em] text-xs transition-all shadow-2xl active:scale-95",
                        Object.keys(pendingFiles).length > 0 ? "bg-[#27AE60] text-white hover:bg-[#219150] shadow-green-200" : "bg-gray-100 text-gray-400 cursor-not-allowed grayscale"
                      )}
                   >
                      {loading ? (
                         <>
                            <Loader2 className="h-6 w-6 animate-spin text-white/50" />
                            Salvando no MinIO...
                         </>
                      ) : (
                         <>
                            <Save className="h-6 w-6" />
                            Salvar Todos os Modelos
                         </>
                      )}
                   </button>
                </div>
             </div>
          ) : (
             <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                <div className="bg-gray-50 p-6 rounded-full text-gray-200 animate-in zoom-in duration-500">
                   <Building2 className="h-10 w-10" />
                </div>
                <div className="space-y-0.5">
                   <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest opacity-50 italic">Configuração de Modelos</h3>
                   <p className="text-[8px] font-bold text-gray-300 uppercase tracking-[0.2em]">Selecione um modo de operação acima para continuar</p>
                </div>
             </div>
          )}
        </div>

        {/* Success Modal */}
        {showSuccessModal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-white/80 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white rounded-[32px] shadow-2xl p-8 flex flex-col items-center justify-center space-y-4 animate-in zoom-in-95 duration-500 max-w-sm w-full text-center border border-green-100">
              <div className="w-20 h-20 bg-green-50 text-green-500 rounded-full flex items-center justify-center">
                <CheckCircle2 className="h-10 w-10" />
              </div>
              <div className="space-y-1">
                 <h3 className="text-xl font-black text-gray-800 tracking-tight">Modelos Salvos!</h3>
                 <p className="text-sm font-medium text-gray-500">Alterações efetuadas com sucesso.</p>
              </div>
            </div>
          </div>
        )}

        {/* Error Modal */}
        {errorMessage && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-white/80 backdrop-blur-sm animate-in fade-in duration-300">
             <div className="bg-white rounded-[32px] shadow-2xl p-8 flex flex-col items-center space-y-6 animate-in zoom-in-95 max-w-sm w-full text-center border border-red-100">
                <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center">
                   <AlertCircle className="h-10 w-10" />
                </div>
                <div className="space-y-2">
                   <h3 className="text-xl font-black text-gray-800 tracking-tight">Erro ao Salvar</h3>
                   <p className="text-sm font-medium text-gray-500">{errorMessage}</p>
                </div>
                <button onClick={() => setErrorMessage('')} className="w-full py-3 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition-colors shadow-lg shadow-red-100">Tentar Novamente</button>
             </div>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
