import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { 
  FolderKanban, 
  Plus, 
  Search, 
  Filter, 
  X, 
  Eye, 
  Edit2, 
  CheckCircle2, 
  Trash2, 
  Calendar,
  Building2,
  FileText,
  User,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Save,
  RotateCcw,
  DollarSign,
  ChevronDown,
  MapPin,
  Camera,
  Sparkles,
  Loader2,
  Rocket,
  Target,
  Tag,
  CheckCircle
} from 'lucide-react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  where
} from '../lib/dbBridge';
const db = {} as any;
import { useUser } from '../contexts/UserContext';
import { cn, getMediaUrl } from '../lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { uploadFile } from '../lib/upload';
import { correctText } from '../services/geminiService';

interface Project {
  id: string;
  companyId: string;
  companyName: string;
  unitId?: string;
  unitName?: string;
  name: string;
  description: string;
  sourceId?: string;
  sourceName?: string;
  typeId?: string;
  typeName?: string;
  startDate?: string;
  endDate: string;
  status: 'Em Andamento' | 'Concluído' | 'Cancelado';
  responsible: string;
  observations: string;
  budget?: number;
  image?: string;
  createdAt: any;
  updatedAt: any;
}

interface EntryType {
  id: string;
  name: string;
  color: string;
  category: 'inspeção' | 'projeto-origem' | 'projeto-tipificação';
}

interface Company {
  id: string;
  name: string;
}

interface Unit {
  id: string;
  companyId: string;
  name: string;
}

export default function Projects() {
  const { profile, isDemo } = useUser();
  const [projects, setProjects] = useState<Project[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [entryTypes, setEntryTypes] = useState<EntryType[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'view' | 'edit' | 'create'>('list');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  
  // Image states
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  // AI and Submission states
  const [isCorrecting, setIsCorrecting] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  
  // Filters
  const [filterCompany, setFilterCompany] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterCompany, filterStatus, itemsPerPage]);

  const [formData, setFormData] = useState({
    companyId: '',
    companyName: '',
    unitId: '',
    unitName: '',
    name: '',
    description: '',
    sourceId: '',
    sourceName: '',
    typeId: '',
    typeName: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    status: 'Em Andamento' as Project['status'],
    observations: '',
    budget: 0,
    image: ''
  });

  useEffect(() => {
    if (isDemo) {
      setProjects([
        {
          id: '1',
          name: 'NR-12 Adequação',
          companyId: 'c1',
          companyName: 'Matriz',
          unitId: 'u1',
          unitName: 'Produção',
          description: 'Adequação de NR-12 nas máquinas do setor de produção',
          sourceId: 's1',
          sourceName: 'EHS',
          typeId: 't1',
          typeName: 'Melhoria',
          startDate: '2026-01-01',
          endDate: '2026-06-30',
          status: 'Em Andamento',
          responsible: 'Daniel Santos',
          observations: 'Projeto em fase de cotação de materiais.',
          budget: 15000,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: '2',
          name: 'Treinamento CIPA',
          companyId: 'c2',
          companyName: 'Unidade Sul',
          unitId: 'u2',
          unitName: 'Administrativo',
          description: 'Treinamento anual dos membros da CIPA',
          sourceId: 's2',
          sourceName: 'Demanda Interna',
          typeId: 't2',
          typeName: 'Treinamento',
          startDate: '2026-03-01',
          endDate: '2026-03-15',
          status: 'Concluído',
          responsible: 'Maria Silva',
          observations: 'Treinamento realizado com 100% de adesão.',
          budget: 2500,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]);
      setCompanies([
        { id: 'c1', name: 'Matriz' },
        { id: 'c2', name: 'Unidade Sul' }
      ]);
      setUnits([
        { id: 'u1', companyId: 'c1', name: 'Produção' },
        { id: 'u2', companyId: 'c2', name: 'Administrativo' }
      ]);
      setEntryTypes([
        { id: 's1', name: 'EHS', color: '#27AE60', category: 'projeto-origem' },
        { id: 's2', name: 'Demanda Interna', color: '#2980B9', category: 'projeto-origem' },
        { id: 't1', name: 'Melhoria', color: '#8E44AD', category: 'projeto-tipificação' },
        { id: 't2', name: 'Treinamento', color: '#F39C12', category: 'projeto-tipificação' }
      ]);
      setLoading(false);
      return;
    }

    const qProjects = query(collection(db, 'projects'), orderBy('createdAt', 'desc'));
    const unsubProjects = onSnapshot(qProjects, (snapshot) => {
      setProjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project)));
      setLoading(false);
    });

    const qCompanies = query(collection(db, 'companies'), orderBy('name', 'asc'));
    const unsubCompanies = onSnapshot(qCompanies, (snapshot) => {
      setCompanies(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Company)));
    });

    const qUnits = query(collection(db, 'units'), orderBy('name', 'asc'));
    const unsubUnits = onSnapshot(qUnits, (snapshot) => {
      setUnits(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Unit)));
    });

    const qEntries = query(collection(db, 'type_of_entries'), orderBy('name', 'asc'));
    const unsubEntries = onSnapshot(qEntries, (snapshot) => {
      setEntryTypes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EntryType)));
    });

    return () => {
      unsubProjects();
      unsubCompanies();
      unsubUnits();
      unsubEntries();
    };
  }, [isDemo]);

  // Currency Helpers
  const formatCurrency = (value: number | string) => {
    const amount = typeof value === 'string' ? parseFloat(value.replace(/\D/g, '')) / 100 : value;
    if (isNaN(amount)) return 'R$ 0,00';
    return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const parseCurrency = (formatted: string) => {
    const cleanValue = formatted.replace(/\D/g, '');
    return parseFloat(cleanValue) / 100 || 0;
  };

  // Photo Helpers
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // AI Helpers
  const handleCorrectText = async (field: 'description' | 'observations') => {
    if (!formData[field]) return;
    setIsCorrecting(field);
    try {
      const corrected = await correctText(
        field,
        formData[field],
        { [field]: formData[field] },
        'projects'
      );
      setFormData(prev => ({ ...prev, [field]: corrected }));
    } catch (error) {
      console.error('Error correcting text:', error);
    } finally {
      setIsCorrecting(null);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.companyId || !formData.name || !formData.description) {
      alert('Por favor, preencha os campos obrigatórios.');
      return;
    }

    setIsSubmitting(true);
    try {
      const selectedCompany = companies.find(c => c.id === formData.companyId);
      const selectedUnit = units.find(u => u.id === formData.unitId);
      const selectedSource = entryTypes.find(t => t.id === formData.sourceId);
      const selectedType = entryTypes.find(t => t.id === formData.typeId);
      
      let imageUrl = formData.image;
      if (selectedFile) {
        imageUrl = await uploadFile(selectedFile, 'foto-projeto');
      }

      const data = {
        ...formData,
        budget: String(formData.budget),
        companyName: selectedCompany?.name || '',
        unitName: selectedUnit?.name || '',
        sourceName: selectedSource?.name || '',
        typeName: selectedType?.name || '',
        image: imageUrl,
        responsible: profile?.displayName || 'Sistema',
        updatedAt: serverTimestamp()
      };

      if (isDemo) {
        const demoData = { ...data, updatedAt: new Date() };
        if (selectedProject) {
          setProjects(prev => prev.map(p => p.id === selectedProject.id ? { ...p, ...demoData } : p));
        } else {
          setProjects(prev => [{ ...demoData, id: Math.random().toString(), createdAt: new Date() } as Project, ...prev]);
        }
        setViewMode('list');
        return;
      }

      if (selectedProject) {
        await updateDoc(doc(db, 'projects', selectedProject.id), data);
      } else {
        await addDoc(collection(db, 'projects'), {
          ...data,
          createdAt: serverTimestamp()
        });
      }
      
      const wasEditing = !!selectedProject;
      setViewMode('list');
      setSelectedProject(null);
      setImagePreview(null);
      setSelectedFile(null);
      setFormData({
        companyId: '',
        companyName: '',
        unitId: '',
        unitName: '',
        name: '',
        description: '',
        sourceId: '',
        sourceName: '',
        typeId: '',
        typeName: '',
        startDate: new Date().toISOString().split('T')[0],
        endDate: '',
        status: 'Em Andamento',
        observations: '',
        budget: 0,
        image: ''
      });
      setSuccessMessage(wasEditing ? 'Projeto atualizado com sucesso!' : 'Projeto cadastrado com sucesso!');
      setShowSuccessModal(true);
      setTimeout(() => setShowSuccessModal(false), 3500);
    } catch (error) {
      console.error('Error saving project:', error);
      alert('Erro ao salvar projeto.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = (project: Project) => {
    setProjectToDelete(project);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!projectToDelete) return;

    if (isDemo) {
      setProjects(prev => prev.filter(p => p.id !== projectToDelete.id));
      setShowDeleteModal(false);
      setProjectToDelete(null);
      return;
    }

    try {
      await deleteDoc(doc(db, 'projects', projectToDelete.id));
      setShowDeleteModal(false);
      setProjectToDelete(null);
    } catch (error) {
      console.error('Error deleting project:', error);
      alert('Erro ao excluir projeto.');
    }
  };

  const handleStatusChange = async (project: Project, newStatus: Project['status']) => {
    if (isDemo) {
      setProjects(prev => prev.map(p => p.id === project.id ? { ...p, status: newStatus } : p));
      return;
    }

    try {
      await updateDoc(doc(db, 'projects', project.id), {
        status: newStatus,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const filteredProjects = projects.filter(p => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = (
      (p.name || '').toLowerCase().includes(searchLower) ||
      p.description.toLowerCase().includes(searchLower) ||
      p.companyName.toLowerCase().includes(searchLower) ||
      (p.sourceName || '').toLowerCase().includes(searchLower) ||
      (p.typeName || '').toLowerCase().includes(searchLower) ||
      (p.responsible || '').toLowerCase().includes(searchLower) || 
      p.id.toLowerCase().includes(searchLower)
    );

    const matchesCompany = filterCompany === 'all' || p.companyId === filterCompany;
    const matchesStatus = filterStatus === 'all' || p.status === filterStatus;
    const matchesStart = !filterStartDate || (p.startDate && p.startDate >= filterStartDate);
    const matchesEnd = !filterEndDate || (p.endDate && p.endDate <= filterEndDate);
    return matchesSearch && matchesCompany && matchesStatus && matchesStart && matchesEnd;
  });

  const totalPages = Math.ceil(filteredProjects.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedProjects = filteredProjects.slice(startIndex, startIndex + itemsPerPage);

  const getStatusColor = (status: Project['status']) => {
    switch (status) {
      case 'Em Andamento': return 'bg-amber-500';
      case 'Concluído': return 'bg-emerald-500';
      case 'Cancelado': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#27AE60]"></div>
      </div>
    );
  }

  if (viewMode === 'view' && selectedProject) {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
        <div className="bg-white py-3 px-4 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between mb-6">
          <h1 className="text-xl font-black text-[#1E3A5F] ml-2 tracking-wide uppercase">
            Detalhes do Projeto
          </h1>
          <button 
            onClick={() => setViewMode('list')}
            className="bg-[#5D6D7E] hover:bg-[#4D5A68] text-white px-5 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-md"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
          <div className="p-6 md:p-8 space-y-8">
            {/* Informações Gerais */}
            <section className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-[#27AE60] font-bold flex items-center gap-2 text-lg">
                  Informações Gerais
                </h3>
                <ChevronDown className="text-[#27AE60] h-5 w-5" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                    <span className="text-[#27AE60] font-bold text-xl">#</span>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Nome do Projeto:</p>
                    <p className="text-gray-700 font-medium">{selectedProject.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                    <Calendar className="text-[#27AE60] h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Prazos:</p>
                    <p className="text-gray-700 font-medium">
                      {selectedProject.startDate ? format(new Date(selectedProject.startDate), 'dd/MM/yyyy') : '--'} até {selectedProject.endDate ? format(new Date(selectedProject.endDate), 'dd/MM/yyyy') : '--'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                    <DollarSign className="text-[#27AE60] h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Investimento:</p>
                    <p className="text-gray-700 font-medium font-mono">{formatCurrency(selectedProject.budget || 0)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                    <CheckCircle2 className="text-[#27AE60] h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Status:</p>
                    <span className={cn(
                      "px-4 py-1 rounded-full text-xs font-bold text-white",
                      getStatusColor(selectedProject.status)
                    )}>
                      {selectedProject.status}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-[#27AE60] font-bold flex items-center gap-2 text-lg">
                  Localização e Classificação
                </h3>
                <ChevronDown className="text-[#27AE60] h-5 w-5" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex items-center gap-4">
                  <Building2 className="text-[#27AE60] h-6 w-6" />
                  <div>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Empresa:</p>
                    <p className="text-gray-700 font-medium">{selectedProject.companyName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <MapPin className="text-[#27AE60] h-6 w-6" />
                  <div>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Unidade:</p>
                    <p className="text-gray-700 font-medium">{selectedProject.unitName || '---'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Target className="text-[#27AE60] h-6 w-6" />
                  <div>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Origem:</p>
                    <p className="text-gray-700 font-medium">{selectedProject.sourceName || '---'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Tag className="text-[#27AE60] h-6 w-6" />
                  <div>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Tipificação:</p>
                    <p className="text-gray-700 font-medium">{selectedProject.typeName || '---'}</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Descrição e Imagem */}
            <section className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                   <h3 className="text-[#27AE60] font-bold flex items-center gap-2 text-lg">
                    Descrição do Projeto
                  </h3>
                  <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{selectedProject.description}</p>
                  
                  {selectedProject.observations && (
                    <div className="mt-6">
                      <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-2">Observações:</p>
                      <p className="text-gray-600 italic text-sm">{selectedProject.observations}</p>
                    </div>
                  )}
                  
                   <div className="mt-6 flex items-center gap-3">
                    <User className="text-[#27AE60] h-5 w-5" />
                    <div>
                      <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Responsável:</p>
                      <p className="text-gray-700 font-medium">{selectedProject.responsible || 'Sistema'}</p>
                    </div>
                  </div>
                </div>
                
                {selectedProject.image && (
                  <div className="space-y-4">
                    <h3 className="text-[#27AE60] font-bold flex items-center gap-2 text-lg">
                      Evidência Visível
                    </h3>
                    <img 
                      src={getMediaUrl(selectedProject.image)} 
                      alt={selectedProject.name} 
                      className="w-full rounded-2xl shadow-lg border border-gray-200"
                    />
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  if (viewMode === 'create' || viewMode === 'edit') {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500 pb-10">
        <div className="bg-white py-3 px-4 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between mb-6">
          <h1 className="text-xl font-black text-[#1E3A5F] ml-2 tracking-wide uppercase">
            {viewMode === 'edit' ? 'Editar Projeto' : 'Novo Projeto'}
          </h1>
          <button 
            onClick={() => setViewMode('list')}
            className="bg-[#5D6D7E] hover:bg-[#4D5A68] text-white px-5 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-md"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>
        </div>

        <form onSubmit={handleSave} className="bg-white rounded-[32px] shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 md:p-8 space-y-8">
            {/* Seção 1: Identificação */}
            <section className="space-y-6">
              <h3 className="text-[#27AE60] font-bold text-lg flex items-center gap-2">
                <Rocket className="h-5 w-5" />
                Identificação do Projeto
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="col-span-1 md:col-span-2 space-y-2">
                  <label className="text-sm font-bold text-gray-600">Título do Projeto <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <FolderKanban className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input 
                      required
                      type="text" 
                      placeholder="Ex: Adequação NR-12 - Setor de Usinagem"
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-12 pr-4 py-3 text-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition-all" 
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-600">Empresa <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <select 
                      required
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-12 pr-4 py-3 text-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition-all"
                      value={formData.companyId}
                      onChange={(e) => setFormData({ ...formData, companyId: e.target.value, unitId: '' })}
                    >
                      <option value="">Selecione a Empresa</option>
                      {companies.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-600">Unidade</label>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <select 
                      disabled={!formData.companyId}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-12 pr-4 py-3 text-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition-all disabled:opacity-50"
                      value={formData.unitId}
                      onChange={(e) => setFormData({ ...formData, unitId: e.target.value })}
                    >
                      <option value="">Selecione a Unidade</option>
                      {units.filter(u => u.companyId === formData.companyId).map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </section>

            {/* Seção 2: Detalhes Técnicos */}
            <section className="space-y-6">
              <h3 className="text-[#27AE60] font-bold text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Detalhes e Classificação
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-600">Origem do Projeto</label>
                  <select 
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition-all"
                    value={formData.sourceId}
                    onChange={(e) => setFormData({ ...formData, sourceId: e.target.value })}
                  >
                    <option value="">Selecione a Origem</option>
                    {entryTypes.filter(t => t.category === 'projeto-origem').map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-600">Tipificação</label>
                  <select 
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition-all"
                    value={formData.typeId}
                    onChange={(e) => setFormData({ ...formData, typeId: e.target.value })}
                  >
                    <option value="">Selecione a Tipificação</option>
                    {entryTypes.filter(t => t.category === 'projeto-tipificação').map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>

                <div className="col-span-1 md:col-span-2 space-y-2 relative">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-bold text-gray-600">Escopo / Descrição <span className="text-red-500">*</span></label>
                    <button 
                      type="button"
                      onClick={() => handleCorrectText('description')}
                      disabled={isCorrecting !== null}
                      className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#27AE60] hover:text-[#219150] transition-colors disabled:opacity-50"
                    >
                      {isCorrecting === 'description' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      IA Corrector
                    </button>
                  </div>
                  <textarea 
                    required
                    rows={4}
                    placeholder="Descreva detalhadamente o objetivo e o escopo deste projeto..."
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition-all resize-none"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
              </div>
            </section>

            {/* Seção 3: Cronograma e Custo */}
            <section className="space-y-6">
              <h3 className="text-[#27AE60] font-bold text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Cronograma e Investimento
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-600">Data de Início</label>
                  <input 
                    type="date" 
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition-all"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-600">Prazo Final</label>
                  <input 
                    type="date" 
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition-all"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-600">Custo Estimado</label>
                  <div className="relative">
                    <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input 
                      type="text" 
                      placeholder="R$ 0,00"
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-12 pr-4 py-3 text-gray-600 font-bold focus:ring-2 focus:ring-green-500 outline-none transition-all"
                      value={formatCurrency(formData.budget)}
                      onChange={(e) => setFormData({ ...formData, budget: parseCurrency(e.target.value) })}
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Seção 4: Evidência e Observações */}
            <section className="space-y-6">
              <h3 className="text-[#27AE60] font-bold text-lg flex items-center gap-2">
                <Camera className="h-5 w-5" />
                Mídia e Observações
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <label className="text-sm font-bold text-gray-600">Foto Ilustrativa / Evidência Inicial</label>
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-4">
                      <label className="cursor-pointer bg-gray-50 hover:bg-gray-100 border-2 border-dashed border-gray-200 rounded-2xl p-6 flex flex-col items-center justify-center gap-2 transition-all w-full max-w-[240px] aspect-video">
                        <Camera className="h-8 w-8 text-[#27AE60]" />
                        <span className="text-xs text-[#27AE60] font-bold uppercase tracking-wider">Upload Foto</span>
                        <input 
                          type="file" 
                          className="hidden" 
                          accept="image/*"
                          onChange={handleImageChange}
                        />
                      </label>
                      {imagePreview && (
                        <div className="relative group">
                          <img 
                            src={imagePreview} 
                            alt="Preview" 
                            className="w-40 h-28 object-cover rounded-2xl shadow-xl border-2 border-white" 
                          />
                          <button 
                            type="button"
                            onClick={() => {
                              setImagePreview(null);
                              setSelectedFile(null);
                            }}
                            className="absolute -top-3 -right-3 bg-red-500 text-white p-1.5 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2 relative">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-bold text-gray-600">Observações Adicionais</label>
                    <button 
                      type="button"
                      onClick={() => handleCorrectText('observations')}
                      disabled={isCorrecting !== null}
                      className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#27AE60] hover:text-[#219150] transition-colors disabled:opacity-50"
                    >
                      {isCorrecting === 'observations' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      IA Corrector
                    </button>
                  </div>
                  <textarea 
                    rows={4}
                    placeholder="Alguma nota importante sobre o projeto?"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition-all resize-none"
                    value={formData.observations}
                    onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
                  />
                </div>
              </div>
            </section>
          </div>

          <div className="p-6 md:p-8 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row gap-4">
            <button 
              type="button"
              onClick={() => setViewMode('list')}
              className="px-8 py-4 bg-white border border-gray-200 text-gray-600 rounded-2xl font-bold hover:bg-gray-100 transition-all active:scale-95 flex-1"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              disabled={isSubmitting}
              className="px-8 py-4 bg-[#27AE60] text-white rounded-2xl font-black uppercase tracking-widest hover:bg-[#219150] transition-all shadow-lg shadow-green-200 active:scale-95 flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="h-5 w-5" />
                  {viewMode === 'edit' ? 'Salvar Alterações' : 'Cadastrar Projeto'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">
      {/* Title Section */}
      <div className="bg-white py-3 px-4 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between">
        <h1 className="text-xl font-black text-[#1E3A5F] ml-2 tracking-wide uppercase">Projetos</h1>
        <button 
          onClick={() => {
            setSelectedProject(null);
            setImagePreview(null);
            setSelectedFile(null);
            setFormData({
              companyId: '',
              companyName: '',
              unitId: '',
              unitName: '',
              name: '',
              description: '',
              sourceId: '',
              sourceName: '',
              typeId: '',
              typeName: '',
              startDate: new Date().toISOString().split('T')[0],
              endDate: '',
              status: 'Em Andamento',
              observations: '',
              budget: 0,
              image: ''
            });
            setViewMode('create');
          }}
          className="bg-[#27AE60] hover:bg-[#219150] text-white px-5 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-md shadow-green-100/50"
        >
          <Plus className="h-4 w-4" />
          Novo Projeto
        </button>
      </div>

      {/* Unified Search and Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 flex flex-col">
        <div className="p-4 flex flex-col md:flex-row items-center gap-4">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input 
              type="text" 
              placeholder="Buscar por descrição, fonte, empresa, tipo ou ID..."
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
                onChange={(e) => setFilterCompany(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition-all"
              >
                <option value="all">Todas</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-600">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition-all"
              >
                <option value="all">Todos</option>
                <option value="Em Andamento">Em Andamento</option>
                <option value="Concluído">Concluído</option>
                <option value="Cancelado">Cancelado</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-600">Prazo Início</label>
              <input
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition-all"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-600">Prazo Fim</label>
              <input
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition-all"
              />
            </div>
            <div className="flex items-end gap-2 col-span-1 md:col-span-2 lg:col-span-4 justify-end mt-2">
              <button
                onClick={() => {
                  setFilterCompany('all');
                  setFilterStatus('all');
                  setFilterStartDate('');
                  setFilterEndDate('');
                  setSearchTerm('');
                }}
                className="bg-[#5D6D7E] hover:bg-[#4D5A68] text-white py-2 px-6 rounded-lg transition-all shadow-md flex items-center justify-center font-bold text-sm gap-2"
              >
                <RotateCcw className="h-4 w-4" /> Limpar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Projects List */}
      <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-100">
        <div className="bg-[#27AE60] p-4 text-white font-bold flex items-center justify-center gap-2">
          <span>Projetos (Total: {filteredProjects.length})</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-white border-b-2 border-[#27AE60]">
                <th className="py-4 px-6 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider border-r border-gray-100 italic">ID</th>
                <th className="py-4 px-6 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider border-r border-gray-100">Projeto / Unidade</th>
                <th className="py-4 px-6 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider border-r border-gray-100">Tipo / Origem</th>
                <th className="py-4 px-6 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider border-r border-gray-100">Prazo</th>
                <th className="py-4 px-6 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider border-r border-gray-100">Custo Est.</th>
                <th className="py-4 px-6 text-center text-xs font-bold text-[#27AE60] uppercase tracking-wider border-r border-gray-100">Status</th>
                <th className="py-4 px-6 text-center text-xs font-bold text-[#27AE60] uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredProjects.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-400 font-medium">
                    Nenhum projeto encontrado.
                  </td>
                </tr>
              ) : (
                paginatedProjects.map((project, index) => (
                <tr key={project.id} title={project.description || 'Sem descrição'} className="hover:bg-gray-50/50 transition-colors cursor-default">
                  <td className="py-4 px-6 text-[10px] font-black text-gray-400 border-r border-gray-50 uppercase tracking-tighter">#{String(index + 1).padStart(5, '0')}</td>
                  <td className="py-4 px-6 border-r border-gray-50 min-w-[250px]">
                    <div className="flex flex-col">
                      <span className="text-sm font-black text-[#1E3A5F] uppercase tracking-tight leading-none">{project.name || 'Projeto sem nome'}</span>
                      <span className="text-[10px] font-bold text-gray-400 uppercase mt-1.5">{project.companyName}</span>
                      {project.unitName && (
                        <span className="text-[10px] font-bold text-[#27AE60] uppercase tracking-widest mt-0.5 flex items-center gap-1">
                          <MapPin className="h-2.5 w-2.5" />
                          {project.unitName}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-4 px-6 border-r border-gray-50 min-w-[150px]">
                    <div className="flex flex-col gap-1.5">
                      {project.typeName && (
                        <span className="text-[10px] font-black px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded flex items-center gap-1 w-fit uppercase">
                          <Tag className="h-2.5 w-2.5" />
                          {project.typeName}
                        </span>
                      )}
                      {project.sourceName && (
                        <span className="text-[10px] font-black px-2 py-0.5 bg-amber-50 text-amber-600 rounded flex items-center gap-1 w-fit uppercase">
                          <Target className="h-2.5 w-2.5" />
                          {project.sourceName}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-4 px-6 text-sm font-bold text-gray-700 border-r border-gray-50">
                    {project.endDate ? format(new Date(project.endDate), 'dd/MM/yyyy', { locale: ptBR }) : '-'}
                  </td>
                  <td className="py-4 px-6 text-sm font-black text-emerald-600 border-r border-gray-50">
                    {project.budget ? (
                      project.budget >= 1000000
                        ? `R$ ${(project.budget / 1000000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`
                        : project.budget >= 1000
                        ? `R$ ${(project.budget / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`
                        : `R$ ${project.budget.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                    ) : 'R$ 0,00'}
                  </td>
                  <td className="py-4 px-6 border-r border-gray-50">
                    <div className="flex justify-center">
                      <div className={cn("w-3 h-3 rounded-full shadow-sm", getStatusColor(project.status))} title={project.status} />
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => {
                          setSelectedProject(project);
                          setViewMode('view');
                        }}
                        className="p-2 bg-indigo-400 text-white rounded-lg hover:bg-indigo-500 transition-colors shadow-sm"
                        title="Visualizar"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          setSelectedProject(project);
                          setFormData({
                            companyId: project.companyId,
                            companyName: project.companyName,
                            unitId: project.unitId || '',
                            unitName: project.unitName || '',
                            name: project.name || '',
                            description: project.description,
                            sourceId: project.sourceId || '',
                            sourceName: project.sourceName || '',
                            typeId: project.typeId || '',
                            typeName: project.typeName || '',
                            startDate: project.startDate || new Date().toISOString().split('T')[0],
                            endDate: project.endDate || '',
                            status: project.status,
                            observations: project.observations || '',
                            budget: Number(project.budget) || 0,
                            image: project.image || ''
                          });
                          setSelectedFile(null);
                          setViewMode('edit');
                        }}
                        className="p-2 bg-[#FFC107] hover:bg-[#E0A800] text-white rounded-lg transition-colors shadow-sm"
                        title="Editar"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>

                      {project.status !== 'Concluído' && (
                        <button
                          onClick={() => handleStatusChange(project, 'Concluído')}
                          className="p-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors shadow-sm"
                          title="Concluir"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                      )}
                      
                      <button
                        onClick={() => handleDeleteClick(project)}
                        className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors shadow-sm"
                        title="Excluir"
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

        {/* Pagination API */}
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

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-10 text-center space-y-6">
              <div className="w-24 h-24 bg-red-50 rounded-[32px] flex items-center justify-center mx-auto rotate-3">
                <Trash2 className="h-12 w-12 text-red-500" />
              </div>
              <div className="space-y-2">
                <h3 className="text-3xl font-black text-gray-800 tracking-tight uppercase">Excluir Projeto?</h3>
                <p className="text-gray-500 font-medium leading-relaxed">
                  Você está prestes a apagar permanentemente este projeto. Esta ação é irreversível.
                </p>
              </div>
            </div>
            <div className="flex p-8 gap-4 bg-gray-50/80 mt-2">
              <button 
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 px-6 py-5 rounded-[24px] font-black uppercase text-xs text-gray-400 hover:bg-white transition-all outline-none"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmDelete}
                className="flex-[1.5] px-6 py-5 rounded-[24px] font-black uppercase text-xs bg-red-500 hover:bg-red-600 text-white shadow-xl shadow-red-200 transition-all active:scale-95 outline-none"
              >
                Confirmar Exclusão
              </button>
            </div>
          </div>
        </div>
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
