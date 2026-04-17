import React, { useState, useEffect } from 'react';
const db = {} as any;
import { collection, addDoc, getDocs } from '../lib/dbBridge';
import { 
  AlertTriangle, 
  X, 
  CheckCircle2, 
  Camera, 
  Send,
  Building2,
  MapPin,
  LayoutGrid,
  ChevronLeft,
  ShieldCheck,
  TrendingUp,
  FolderOpen
} from 'lucide-react';
import { cn } from '../lib/utils';
import { uploadFile } from '../lib/upload';
import logoUrl from '../../logos/logocompleto.png';

const MONTHS = [
  { value: 0, label: 'Acumulado' },
  { value: 1, label: 'Janeiro' },
  { value: 2, label: 'Fevereiro' },
  { value: 3, label: 'Março' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Maio' },
  { value: 6, label: 'Junho' },
  { value: 7, label: 'Julho' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Setembro' },
  { value: 10, label: 'Outubro' },
  { value: 11, label: 'Novembro' },
  { value: 12, label: 'Dezembro' },
];

const currentYear = new Date().getFullYear();
const YEARS = [
  { value: 0, label: 'Acumulado' },
  ...Array.from({ length: 5 }, (_, i) => ({ value: currentYear - i, label: String(currentYear - i) }))
];

export default function PublicReport() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Filter state
  const [selectedYear, setSelectedYear] = useState(0); // 0 = all years accumulated
  const [selectedMonth, setSelectedMonth] = useState(0); // 0 = accumulated

  // Stats from backend
  const [statsLoading, setStatsLoading] = useState(true);
  const [stats, setStats] = useState({
    periodCount: 0,
    yearCount: 0,
    projectCount: 0,
  });

  const [companies, setCompanies] = useState<any[]>([]);
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    company: '',
    sector: '',
    location: '',
    description: '',
    reporterName: '',
    reporterContact: '',
    photo: '',
    photoUrl: ''
  });

  // Fetch public stats from backend whenever filters change
  useEffect(() => {
    const fetchStats = async () => {
      setStatsLoading(true);
      try {
        const apiUrl = (import.meta as any).env.VITE_API_URL || '';
        const params = new URLSearchParams({
          year: String(selectedYear),
          month: String(selectedMonth),
        });
        const res = await fetch(`${apiUrl}/api/public-stats?${params}`);
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (e) {
        console.error('Erro ao buscar estatísticas públicas:', e);
      } finally {
        setStatsLoading(false);
      }
    };
    fetchStats();
  }, [selectedYear, selectedMonth]);

  // Fetch companies for the modal autocomplete
  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'companies'));
        const comps = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setCompanies(comps);
      } catch (error) {
        console.error('Error fetching companies:', error);
      }
    };
    fetchCompanies();
  }, []);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('A foto é muito pesada (máximo 2MB). Por favor, limite o tamanho para garantir o envio.');
        return;
      }
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setFormData(prev => ({ ...prev, photo: base64String }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const dataToSave = { ...formData };
      if (selectedFile) {
        try {
          const fileUrl = await uploadFile(selectedFile, 'foto-inspecao');
          dataToSave.photoUrl = fileUrl;
          dataToSave.photo = fileUrl;
        } catch (uploadError: any) {
          alert(`Erro ao fazer upload da evidência: ${uploadError?.message}`);
          setLoading(false);
          return;
        }
      }

      const apiUrl = (import.meta as any).env.VITE_API_URL || '';
      const res = await fetch(`${apiUrl}/api/public-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSave)
      });

      if (!res.ok) throw new Error('Erro na API ao salvar o relato');

      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        setIsModalOpen(false);
        setFormData({ company: '', sector: '', location: '', description: '', reporterName: '', reporterContact: '', photo: '', photoUrl: '' });
        setSelectedFile(null);
      }, 3000);
    } catch (error) {
      console.error('Error submitting report:', error);
      alert('Erro ao enviar o relato. Por favor, tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const filteredCompanies = formData.company.length >= 2
    ? companies.filter(c => c.name?.toLowerCase().includes(formData.company.toLowerCase()))
    : [];

  const monthLabel = MONTHS.find(m => m.value === selectedMonth)?.label || 'Acumulado';
  const isMonthAccumulated = selectedMonth === 0;
  const isYearAccumulated = selectedYear === 0;

  return (
    <div className="min-h-[100dvh] bg-[#E6F4F1] font-sans flex flex-col items-center justify-center p-4">

      {/* Back Button */}
      <div className="absolute top-4 left-4 md:top-6 md:left-8 z-50">
        <button
          onClick={() => {
            window.history.pushState({}, '', '/');
            window.dispatchEvent(new PopStateEvent('popstate'));
          }}
          className="flex items-center gap-1.5 text-gray-600 hover:text-[#27AE60] bg-white/80 backdrop-blur px-4 py-2 rounded-full shadow-md border border-gray-100 transition-all font-bold text-sm active:scale-95"
        >
          <ChevronLeft className="h-4 w-4 shrink-0" />
          Voltar
        </button>
      </div>

      {/* Main Container */}
      <div className="w-full max-w-3xl flex flex-col gap-4 relative z-10 animate-in fade-in zoom-in-95 duration-500 max-h-[100dvh]">

        {/* Filters row */}
        <div className="flex items-center justify-end gap-3 w-full pt-16 md:pt-0">
          <div className="flex items-center justify-between gap-2 bg-white/70 backdrop-blur px-4 py-2 rounded-2xl shadow-sm border border-white flex-auto">
            <label className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-widest leading-none">Ano:</label>
            <select
              className="bg-transparent text-sm md:text-base font-black text-[#27AE60] outline-none cursor-pointer leading-none"
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
            >
              {YEARS.map(y => <option key={y.value} value={y.value}>{y.label}</option>)}
            </select>
          </div>

          <div className="flex items-center justify-between gap-2 bg-white/70 backdrop-blur px-4 py-2 rounded-2xl shadow-sm border border-white flex-auto">
            <label className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-widest leading-none">Mês:</label>
            <select
              className="bg-transparent text-sm md:text-base font-black text-[#27AE60] outline-none cursor-pointer leading-none"
              value={selectedMonth}
              onChange={e => setSelectedMonth(Number(e.target.value))}
            >
              {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        </div>

        {/* Stats Card */}
        <div className="w-full bg-gradient-to-b from-[#27AE60] to-[#1E824C] rounded-[36px] shadow-2xl overflow-hidden border-2 border-white/50 flex flex-col relative mt-2 md:mt-0">

          {/* Logo Header */}
          <div className="bg-white px-5 py-5 md:py-8 flex flex-col items-center justify-center border-b-[6px] border-[#F1C40F] shadow-md relative overflow-hidden">
            <img src={logoUrl} alt="Logo InspecPro" className="h-16 md:h-20 w-auto object-contain relative z-10" />
          </div>

          {/* Stats Body */}
          <div className="p-6 md:p-10 flex flex-col items-center text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl" />
            <div className="absolute bottom-0 right-0 w-48 h-48 bg-black opacity-10 rounded-full blur-3xl" />

            <div className="relative z-10 space-y-4 md:space-y-6 text-white max-w-2xl flex flex-col items-center pt-2 w-full">

              {/* Stat 1 — period count */}
              <p className="text-sm md:text-base lg:text-lg font-medium leading-relaxed drop-shadow-sm px-2">
                {isMonthAccumulated ? (
                  <>Nosso sistema identificou e tratou </>
                ) : (
                  <>Em <strong>{monthLabel}</strong>, nosso sistema identificou e tratou </>
                )}
                <span className={cn(
                  "text-[#1E3A5F] text-xl md:text-2xl font-black bg-[#F1C40F] px-3 py-1 rounded-2xl shadow-[0_4px_16px_rgba(241,196,15,0.4)] mx-1 inline-block transform -rotate-2 hover:rotate-0 transition-transform cursor-pointer tracking-wider",
                  statsLoading && "opacity-50 animate-pulse"
                )}>
                  {statsLoading ? '...' : stats.periodCount}
                </span>
                {isMonthAccumulated
                  ? (isYearAccumulated 
                      ? <> riscos potenciais <strong>ao longo de todo o histórico</strong>.</>
                      : <> riscos potenciais ao longo de todo o ano de <strong>{selectedYear}</strong>.</>
                    )
                  : <> riscos potenciais.</>
                }
              </p>

              <div className="w-32 h-[2px] bg-gradient-to-r from-transparent via-white/30 to-transparent my-1" />

              {/* Stat 2 — year total (only when a specific month is selected) */}
              {!isMonthAccumulated && (
                <p className="text-sm md:text-base font-medium leading-relaxed text-[#e2f5e9] drop-shadow px-2">
                  Totalizando{' '}
                  <span className={cn(
                    "text-white text-lg md:text-xl font-black bg-black/20 border border-black/10 px-2 py-0.5 rounded-xl mx-1 shadow-sm inline-block",
                    statsLoading && "opacity-50 animate-pulse"
                  )}>
                    {statsLoading ? '...' : stats.yearCount}
                  </span>
                  {' '}vulnerabilidades sanadas {isYearAccumulated ? 'ao longo de todo o histórico' : `ao longo de todo o ano de ${selectedYear}`}.
                </p>
              )}

              {/* Stat 3 — projects */}
              <p className="text-sm md:text-base font-medium leading-relaxed text-[#e2f5e9] drop-shadow px-2">
                Foram criados{' '}
                <span className={cn(
                  "text-white text-lg md:text-xl font-black bg-black/20 border border-black/10 px-2 py-0.5 rounded-xl mx-1 shadow-sm inline-block",
                  statsLoading && "opacity-50 animate-pulse"
                )}>
                  {statsLoading ? '...' : stats.projectCount}
                </span>
                {' '}projetos focados na segurança {isYearAccumulated ? 'ao longo do histórico' : `em ${selectedYear}`}.
              </p>

            </div>
          </div>
        </div>

        {/* Report Button */}
        <button
          onClick={() => setIsModalOpen(true)}
          className="group mx-auto mb-2 w-full max-w-sm bg-gradient-to-r from-[#FF4D4D] to-[#E64444] text-white px-6 py-3.5 rounded-full font-bold text-[15px] md:text-base flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-95 transition-all shadow-[0_6px_20px_-6px_rgba(255,77,77,0.6)] uppercase tracking-wide border-2 border-white/40"
        >
          <AlertTriangle className="h-5 w-5 md:h-6 md:w-6 group-hover:scale-110 transition-transform shrink-0" />
          Reportar Condição
        </button>

      </div>

      {/* Report Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in slide-in-from-bottom-8 duration-500">
            {/* Modal Header */}
            <div className="bg-[#D32F2F] p-6 flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-6 w-6" />
                <h2 className="text-xl font-bold uppercase tracking-tight">Relatar Condição de Risco</h2>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
                <p className="text-gray-600 text-sm leading-relaxed">
                  A sua contribuição é anônima e fundamental para mantermos um ambiente de trabalho seguro. Se desejar, pode fornecer o seu contacto para que possamos dar um retorno.
                </p>
              </div>

              {submitted ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-4 animate-in zoom-in duration-500">
                  <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="h-12 w-12 text-green-600" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-800">Relato Enviado!</h3>
                  <p className="text-gray-500">Obrigado por contribuir para a segurança.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2 relative">
                      <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-gray-400" />
                        Empresa <span className="text-red-500">*</span>
                      </label>
                      <input
                        required
                        type="text"
                        placeholder="Digite o nome da empresa..."
                        value={formData.company}
                        onChange={(e) => { setFormData({ ...formData, company: e.target.value }); setShowCompanyDropdown(true); }}
                        onFocus={() => setShowCompanyDropdown(true)}
                        onBlur={() => setTimeout(() => setShowCompanyDropdown(false), 200)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-700 focus:ring-2 focus:ring-red-500 outline-none transition-all"
                      />
                      {showCompanyDropdown && filteredCompanies.length > 0 && (
                        <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto">
                          {filteredCompanies.map((c, idx) => (
                            <div key={c.id || idx} onClick={() => { setFormData({ ...formData, company: c.name }); setShowCompanyDropdown(false); }} className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b last:border-0 border-gray-100 text-sm font-medium text-gray-700 transition-colors">
                              {c.name}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                        <LayoutGrid className="h-4 w-4 text-gray-400" />
                        Setor <span className="text-red-500">*</span>
                      </label>
                      <input required type="text" placeholder="Ex: Produção, Logística..." value={formData.sector} onChange={(e) => setFormData({ ...formData, sector: e.target.value })} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-700 focus:ring-2 focus:ring-red-500 outline-none transition-all" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-gray-400" />
                      Local Específico <span className="text-red-500">*</span>
                    </label>
                    <input required type="text" placeholder="Ex: Próximo ao bebedouro, entrada principal..." value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-700 focus:ring-2 focus:ring-red-500 outline-none transition-all" />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                      Descreva a situação encontrada <span className="text-red-500">*</span>
                    </label>
                    <textarea required rows={4} placeholder="Descreva detalhadamente o risco observado..." value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-700 focus:ring-2 focus:ring-red-500 outline-none transition-all resize-none" />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                      <Camera className="h-4 w-4 text-gray-400" />
                      Anexar uma Foto (Opcional)
                    </label>
                    <div className="relative">
                      <label className={cn("flex flex-col items-center justify-center p-6 bg-gray-50 border-2 border-dashed rounded-xl transition-all cursor-pointer overflow-hidden group", formData.photo ? "border-green-300 bg-green-50/50" : "border-gray-200 hover:border-red-300")}>
                        {formData.photo ? (
                          <>
                            <img src={formData.photo} alt="Preview" className="absolute inset-0 w-full h-full object-contain bg-black/5" />
                            <div className="absolute inset-0 bg-white/60 group-hover:bg-white/40 transition-colors" />
                            <div className="relative z-10 flex flex-col items-center gap-2">
                              <div className="bg-green-100 p-2 rounded-full mb-1"><CheckCircle2 className="h-8 w-8 text-green-600" /></div>
                              <span className="text-sm font-bold text-green-700 bg-white/90 px-3 py-1 rounded-full shadow-sm border border-green-200">Foto Anexada</span>
                              <span className="text-xs text-gray-600 bg-white/90 px-2 py-0.5 rounded-md mt-1 font-medium">Clique para trocar a foto</span>
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-col items-center gap-2">
                            <div className="bg-white p-3 rounded-full shadow-sm mb-1 group-hover:scale-110 transition-transform border border-gray-100"><Camera className="h-8 w-8 text-gray-400 group-hover:text-[#D32F2F] transition-colors" /></div>
                            <span className="text-sm text-gray-500 font-bold">Clique no quadro ou arraste uma foto</span>
                            <span className="text-[10px] text-gray-400 uppercase tracking-widest font-black">Tamanho máximo: 2MB</span>
                          </div>
                        )}
                        <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                      </label>
                      {formData.photo && (
                        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFormData({ ...formData, photo: '' }); setSelectedFile(null); }} className="absolute top-3 right-3 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-lg z-20 hover:scale-110">
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="pt-6 border-t border-gray-100">
                    <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Informações de Contato (Opcional)</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-gray-700">O seu Nome</label>
                        <input type="text" value={formData.reporterName} onChange={(e) => setFormData({ ...formData, reporterName: e.target.value })} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-700 focus:ring-2 focus:ring-red-500 outline-none transition-all" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-gray-700">O seu Email ou Telefone</label>
                        <input type="text" value={formData.reporterContact} onChange={(e) => setFormData({ ...formData, reporterContact: e.target.value })} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-700 focus:ring-2 focus:ring-red-500 outline-none transition-all" />
                      </div>
                    </div>
                  </div>
                </form>
              )}
            </div>

            {/* Modal Footer */}
            {!submitted && (
              <div className="p-6 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-4">
                <button onClick={() => setIsModalOpen(false)} className="px-8 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-200 transition-all">Cancelar</button>
                <button onClick={handleSubmit} disabled={loading} className="px-8 py-3 bg-[#D32F2F] text-white rounded-xl font-bold hover:bg-[#B71C1C] active:scale-95 transition-all shadow-lg shadow-red-100 flex items-center gap-2 disabled:opacity-50">
                  {loading ? 'Enviando...' : (<><Send className="h-5 w-5" />Enviar Relato</>)}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
