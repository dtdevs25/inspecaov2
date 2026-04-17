import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Camera, Search, User, CheckCircle2, AlertCircle, Building2, MapPin, 
  Eye, Trash2, Calendar, Edit2, ChevronLeft, ChevronRight, CheckCircle, Tag,
  Plus, Filter, RotateCcw, Pencil, ListChecks, ArrowLeft, Clock, FileText, 
  Image as ImageIcon, ChevronDown, X, Sparkles, Loader2, Layers, LayoutGrid, Bell
} from 'lucide-react';
import { uploadFile } from '../lib/upload';

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
  where,
  getDocs
} from '../lib/dbBridge';
const db = {} as any; // mock db for calls
import { useUser } from '../contexts/UserContext';
import { cn, getMediaUrl, compressImage } from '../lib/utils';
import { correctText } from '../services/geminiService';

interface Inspection {
  id: string;
  companyId: string;
  companyName: string;
  unitId: string;
  unitName: string;
  sectorId: string;
  sectorName: string;
  locationId: string;
  locationName: string;
  date: string;
  description: string;
  type: string;
  risk: string;
  resolution: string;
  responsible: string;
  deadline: string;
  observations: string;
  status: 'Pendente' | 'Em Andamento' | 'Concluído';
  registeredBy: string;
  registeredByUid: string;
  createdAt: any;
  hasActionPlan?: boolean;
  image?: string;
}

interface Company { id: string; name: string; }
interface Unit { id: string; companyId: string; name: string; }
interface Sector { id: string; unitId: string; name: string; }
interface Location { id: string; sectorId: string; name: string; }

interface InspectionsProps {
  prefilledData?: any;
  onClearPrefilledData?: () => void;
  setActiveTab?: (tab: string) => void;
  setPrefilledData?: (data: any) => void;
}

export default function Inspections({ prefilledData, onClearPrefilledData, setActiveTab, setPrefilledData }: InspectionsProps) {
  const { isDemo, profile, user } = useUser();
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'view' | 'edit' | 'create'>('list');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<any>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('Inspeção salva com sucesso.');
  const [isCorrecting, setIsCorrecting] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  
  const [filterStatus, setFilterStatus] = useState<string>('Todos');
  const [filterInspectionId, setFilterInspectionId] = useState<string | null>(null);
  
  const [filterCompany, setFilterCompany] = useState<string>('Todas');
  const [filterUnit, setFilterUnit] = useState<string>('Todos');
  const [filterSector, setFilterSector] = useState<string>('Todos');
  const [filterLocation, setFilterLocation] = useState<string>('Todos');
  const [filterType, setFilterType] = useState<string>('Todos');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Modal Action Plan states
  const [showActionPlanModal, setShowActionPlanModal] = useState(false);
  const [actionPlanInspection, setActionPlanInspection] = useState<any>(null);
  const [actionPlanFormData, setActionPlanFormData] = useState({
    actionDescription: '',
    actionDate: new Date().toISOString().split('T')[0],
    responsible: ''
  });
  const [actionPlanImagePreview, setActionPlanImagePreview] = useState<string | null>(null);
  const [actionPlanFile, setActionPlanFile] = useState<File | null>(null);
  const [isSubmittingActionPlan, setIsSubmittingActionPlan] = useState(false);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus, filterInspectionId, itemsPerPage]);


  // Data states
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [typesOfEntries, setTypesOfEntries] = useState<any[]>([]);

  // Function to calculate pseudo-sequential ID based on chronological order
  const getSequentialNumber = (itemId: string) => {
    // inspections is sorted by createdAt desc by default
    const totalCount = inspections.length;
    const index = inspections.findIndex(i => i.id === itemId);
    if (index === -1) return 0;
    return totalCount - index;
  };

  // Formata datas no padrão DD/MM/AAAA
  const formatDate = (date: string | null | undefined): string => {
    if (!date) return '---';
    if (date.includes('-') && date.length === 10) {
      const [y, m, d] = date.split('-');
      return `${d}/${m}/${y}`;
    }
    return date;
  };

  // Form states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    companyId: '',
    unitId: '',
    sectorId: '',
    locationId: '',
    date: new Date().toISOString().split('T')[0],
    description: '',
    type: '',
    risk: '',
    resolution: '',
    responsible: '',
    deadline: '',
    observations: '',
    image: ''
  });

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Allow up to 30MB now because we will compress it down locally
      if (file.size > 30 * 1024 * 1024) {
        setErrorMessage('A imagem original é muito grande. Máximo permitido: 30MB');
        setShowErrorModal(true);
        return;
      }

      try {
        const compressed = await compressImage(file);
        setSelectedFile(compressed);
        
        const reader = new FileReader();
        reader.onloadend = () => {
          setImagePreview(reader.result as string);
        };
        reader.readAsDataURL(compressed);
      } catch (err) {
        console.error('Erro ao processar imagem:', err);
        // Fallback to original if compression fails
        setSelectedFile(file);
      }
    }
  };

  const handleActionPlan = (item: any) => {
    setActionPlanInspection(item);
    setActionPlanFormData({
      actionDescription: '',
      actionDate: new Date().toISOString().split('T')[0],
      responsible: profile?.displayName || user?.email || ''
    });
    setActionPlanImagePreview(null);
    setActionPlanFile(null);
    setShowActionPlanModal(true);
  };

  const handleSaveActionPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingActionPlan) return;
    
    if (isDemo) {
      setErrorMessage('Ação simulada no modo demonstração.');
      setShowErrorModal(true);
      setShowActionPlanModal(false);
      return;
    }

    setIsSubmittingActionPlan(true);
    try {
      let photoAfterUrl = '';
      if (actionPlanFile) {
        photoAfterUrl = await uploadFile(actionPlanFile, 'foto-planodeacao');
      }

      const docRef = await addDoc(collection(db, 'action_plans'), {
        inspectionId: actionPlanInspection.id || '',
        inspectionSequential: (getSequentialNumber(actionPlanInspection.id) || 0).toString().padStart(5, '0'),
        inspectionDate: actionPlanInspection.date || '',
        company: actionPlanInspection.companyName || '',
        unit: actionPlanInspection.unitName || '',
        sector: actionPlanInspection.sectorName || '',
        local: actionPlanInspection.locationName || '',
        description: actionPlanInspection.description || '',
        inspectionDescription: actionPlanInspection.description || '',
        inspectionSector: actionPlanInspection.sectorName || actionPlanInspection.sector || '',
        inspectionLocal: actionPlanInspection.locationName || actionPlanInspection.local || '',
        photoBefore: actionPlanInspection.image || '',
        
        actionDescription: actionPlanFormData.actionDescription || '',
        actionDate: actionPlanFormData.actionDate || '',
        date: actionPlanFormData.actionDate || '',
        status: 'Concluído',
        photoAfter: photoAfterUrl || '',

        registeredBy: profile?.displayName || user?.email || 'Usuário',
        responsible: actionPlanFormData.responsible || '',
        registeredByUid: user?.uid || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Dispara o e-mail em background
      try {
         const apiUrl = (import.meta as any).env.VITE_API_URL || '';
         fetch(`${apiUrl}/api/reports/email-action-plan/${docRef.id}`, {
             method: 'POST',
             headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
         }).catch(e => console.error(e));
      } catch(e) {}


      await updateDoc(doc(db, 'inspections', actionPlanInspection.id), {
        hasActionPlan: true,
        status: 'Concluído',
        updatedAt: serverTimestamp()
      });

      setShowActionPlanModal(false);
      setSuccessMessage('Plano de ação cadastrado com sucesso.');
      setShowSuccessModal(true);
      setTimeout(() => setShowSuccessModal(false), 2500);
    } catch (error: any) {
      console.error('Error saving action plan:', error);
      setErrorMessage(error?.message || 'Erro ao salvar plano de ação.');
      setShowErrorModal(true);
      setTimeout(() => setShowErrorModal(false), 3000);
    } finally {
      setIsSubmittingActionPlan(false);
    }
  };

  useEffect(() => {
    if (isDemo) {
      setInspections([
        { 
          id: '1310', 
          companyId: '1',
          companyName: 'Matriz', 
          unitId: 'u1',
          unitName: 'Unidade Matriz',
          sectorId: 's1',
          sectorName: 'Logística', 
          locationId: 'l1',
          locationName: 'Doca', 
          date: '2026-03-18', 
          description: 'Verificada a ausência de calços de segurança para travamento das rodas de veículos durante as operações de carga e descarga de materiais na doca.', 
          type: 'Risco Potencial', 
          risk: 'Risco de atropelamento e esmagamento por movimento inesperado do caminhão.',
          resolution: 'Calços de segurança foram imediatamente aplicados para o travamento das rodas do veículo e o procedimento operacional padrão de uso de calços durante carga/descarga foi reforçado com o motorista.',
          responsible: 'Gustavo Souza', 
          deadline: '2026-03-18', 
          status: 'Concluído',
          registeredBy: 'Gustavo Souza',
          registeredByUid: 'demo-1',
          createdAt: new Date(),
          observations: '',
          hasActionPlan: true
        }
      ]);
      setCompanies([{ id: '1', name: 'Matriz' }, { id: '2', name: 'GLP' }]);
      setUnits([{ id: 'u1', companyId: '1', name: 'Unidade Matriz' }]);
      setSectors([{ id: 's1', unitId: 'u1', name: 'Logística' }]);
      setLocations([{ id: 'l1', sectorId: 's1', name: 'Doca' }]);
      setLoading(false);
      return;
    }

    const unsubInspections = onSnapshot(query(collection(db, 'inspections'), orderBy('createdAt', 'desc')), (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Inspection));
      setInspections(docs);
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

    const unsubTypes = onSnapshot(query(collection(db, 'type_of_entries'), orderBy('name', 'asc')), (snapshot) => {
      setTypesOfEntries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubInspections();
      unsubCompanies();
      unsubUnits();
      unsubSectors();
      unsubLocations();
      unsubTypes();
    };
  }, [isDemo]);

  useEffect(() => {
    if (prefilledData) {
      if (prefilledData.selectedInspection) {
        setSelectedItem(prefilledData.selectedInspection);
        setViewMode('view');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (onClearPrefilledData) onClearPrefilledData();
        return;
      }

      // Try to find IDs by name if names are provided
      let companyId = prefilledData.companyId || '';
      let unitId = prefilledData.unitId || '';
      let sectorId = prefilledData.sectorId || '';
      let locationId = prefilledData.locationId || '';

      if (!companyId && prefilledData.companyName) {
        const company = companies.find(c => c.name === prefilledData.companyName);
        if (company) companyId = company.id;
      }

      if (!unitId && prefilledData.unitName) {
        const unit = units.find(u => u.name === prefilledData.unitName && (companyId ? u.companyId === companyId : true));
        if (unit) {
          unitId = unit.id;
          if (!companyId) companyId = unit.companyId;
        }
      }

      if (!sectorId && prefilledData.sectorName) {
        const sector = sectors.find(s => s.name === prefilledData.sectorName && (unitId ? s.unitId === unitId : true));
        if (sector) {
          sectorId = sector.id;
          if (!unitId) {
            unitId = sector.unitId;
            const unit = units.find(u => u.id === unitId);
            if (unit && !companyId) companyId = unit.companyId;
          }
        }
      }

      if (!locationId && prefilledData.locationName) {
        const location = locations.find(l => l.name === prefilledData.locationName && (sectorId ? l.sectorId === sectorId : true));
        if (location) {
          locationId = location.id;
          if (!sectorId) {
            sectorId = location.sectorId;
            const sector = sectors.find(s => s.id === sectorId);
            if (sector && !unitId) {
              unitId = sector.unitId;
              const unit = units.find(u => u.id === unitId);
              if (unit && !companyId) companyId = unit.companyId;
            }
          }
        }
      }

      if (prefilledData.filterInspectionId) {
        setFilterInspectionId(prefilledData.filterInspectionId);
        setFilterStatus('Todos');
        setSearchTerm('');
        if (onClearPrefilledData) onClearPrefilledData();
        return;
      }

      if (prefilledData.filterStatus) {
        setFilterStatus(prefilledData.filterStatus);
        
        if (prefilledData.filterCompany) {
          setFilterCompany(prefilledData.filterCompany);
          setShowAdvancedFilters(true);
        }
        if (prefilledData.filterUnit) {
          setFilterUnit(prefilledData.filterUnit);
        }

        if (onClearPrefilledData) {
          onClearPrefilledData();
        }
        return;
      }

      if (prefilledData.triggerCreate) {
        handleCreate();
        if (onClearPrefilledData) {
          onClearPrefilledData();
        }
        return;
      }

      setFormData({
        companyId,
        unitId,
        sectorId,
        locationId,
        date: prefilledData.date || new Date().toISOString().split('T')[0],
        description: prefilledData.description || '',
        type: prefilledData.type || '',
        risk: prefilledData.risk || '',
        resolution: prefilledData.resolution || '',
        responsible: prefilledData.responsible || '',
        deadline: prefilledData.deadline || '',
        observations: prefilledData.observations || '',
        image: prefilledData.image || ''
      });
      setViewMode('create');
      if (onClearPrefilledData) {
        onClearPrefilledData();
      }
    }
  }, [prefilledData, onClearPrefilledData, companies, units, sectors, locations]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (isDemo) {
      setErrorMessage('Ação simulada no modo demonstração.');
      setShowErrorModal(true);
      setViewMode('list');
      return;
    }

    setIsSubmitting(true);
    try {
      const company = companies.find(c => c.id === formData.companyId);
      const unit = units.find(u => u.id === formData.unitId);
      const sector = sectors.find(s => s.id === formData.sectorId);
      const location = locations.find(l => l.id === formData.locationId);

      const data = {
        ...formData,
        companyName: company?.name || '',
        unitName: unit?.name || '',
        sectorName: sector?.name || '',
        locationName: location?.name || '',
        status: 'Pendente',
        registeredBy: profile?.displayName || user?.email || 'Usuário',
        registeredByUid: user?.uid || '',
        updatedAt: serverTimestamp()
      };

      if (selectedFile) {
        try {
          const fileUrl = await uploadFile(selectedFile, 'foto-inspecao');
          data.image = fileUrl;
        } catch (uploadError: any) {
          setErrorMessage(`Erro ao fazer upload da evidência: ${uploadError?.message}`);
          setShowErrorModal(true);
          return;
        }
      } else if (!selectedFile && imagePreview) {
        data.image = formData.image || imagePreview;
      }

      if (viewMode === 'edit' && selectedItem) {
        await updateDoc(doc(db, 'inspections', selectedItem.id), data);
      } else {
        const newInsp = await addDoc(collection(db, 'inspections'), {
          ...data,
          createdAt: serverTimestamp()
        });

        // Dispara o e-mail de notificação para o gestor do setor em qualquer nova inspeção
        try {
          const apiUrl = (import.meta as any).env.VITE_API_URL || '';
          fetch(`${apiUrl}/api/reports/email-critical-inspection/${newInsp.id}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
          }).catch(e => console.error('Erro silencioso no disparo do e-mail de apontamento:', e));
        } catch (e) {}
      }

      setViewMode('list');
      setSuccessMessage('Inspeção salva com sucesso.');
      setShowSuccessModal(true);
      setTimeout(() => setShowSuccessModal(false), 2500);
    } catch (error: any) {
      console.error('Error saving inspection:', error);
      setErrorMessage(error?.message || 'Erro ao salvar inspeção.');
      setShowErrorModal(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTypeColor = (typeName: string) => {
    const typeObj = typesOfEntries.find(t => t.name === typeName);
    return typeObj?.color || '#3B82F6';
  };

  const handleCreate = () => {
    setSelectedItem(null);
    setFormData({
      companyId: '',
      unitId: '',
      sectorId: '',
      locationId: '',
      date: new Date().toISOString().split('T')[0],
      description: '',
      type: '',
      risk: '',
      resolution: '',
      responsible: '',
      deadline: '',
      observations: '',
      image: ''
    });
    setImagePreview(null);
    setSelectedFile(null);
    setViewMode('create');
  };

  const handleView = (item: any) => {
    setSelectedItem(item);
    setViewMode('view');
  };

  const handleEdit = (item: any) => {
    setSelectedItem(item);
    setFormData({
      companyId: item.companyId || '',
      unitId: item.unitId || '',
      sectorId: item.sectorId || '',
      locationId: item.locationId || '',
      date: item.date || '',
      description: item.description || '',
      type: item.type || '',
      risk: item.risk || '',
      resolution: item.resolution || '',
      responsible: item.responsible || '',
      deadline: item.deadline || '',
      observations: item.observations || '',
      image: item.image || ''
    });
    setImagePreview(item.image || null);
    setSelectedFile(null);
    setViewMode('edit');
  };

  const handleDeleteClick = (item: any) => {
    setItemToDelete(item);
    setShowDeleteModal(true);
  };

  const handleAIAction = async (field: keyof typeof formData) => {
    if (!formData[field]) return;
    
    setIsCorrecting(field);
    try {
      const fieldMap: Record<string, 'apontamento' | 'risco' | 'resolucao' | 'observacoes'> = {
        description: 'apontamento',
        risk: 'risco',
        resolution: 'resolucao',
        observations: 'observacoes'
      };

      const context = {
        apontamento: formData.description,
        risco: formData.risk,
        resolucao: formData.resolution,
        observacoes: formData.observations
      };

      const corrected = await correctText(fieldMap[field], formData[field], context);
      if (corrected) {
        setFormData(prev => ({ ...prev, [field]: corrected }));
      }
    } catch (error) {
      console.error('Error correcting text:', error);
    } finally {
      setIsCorrecting(null);
    }
  };

  const handleActionPlanAIAction = async () => {
    if (!actionPlanFormData.actionDescription || !actionPlanInspection) return;
    
    setIsCorrecting('actionDescription');
    try {
      const context = {
        apontamento: actionPlanInspection.description,
        risco: actionPlanInspection.risk || '',
        resolucao: actionPlanInspection.resolution || '',
        observacoes: actionPlanInspection.observations || ''
      };

      const corrected = await correctText('resolucao', actionPlanFormData.actionDescription, context);
      if (corrected) {
        setActionPlanFormData(prev => ({ ...prev, actionDescription: corrected }));
      }
    } catch (error) {
      console.error('Error correcting text:', error);
    } finally {
      setIsCorrecting(null);
    }
  };

  const mockInspections = [
    {
      id: '1310',
      company: 'Matriz',
      date: '2026-03-18',
      sector: 'Logística',
      local: 'Doca',
      description: 'Verificada a ausência de calços de segurança...',
      type: 'Risco Potencial',
      typeColor: 'blue',
      responsible: 'Gustavo Souza',
      deadline: '2026-03-18',
      status: 'Concluído'
    }
  ];

  const confirmDelete = async () => {
    if (!itemToDelete) return;

    if (itemToDelete.hasActionPlan) {
      // O modal já mostra o aviso de plano de ação — não precisa de alert
      return;
    }

    if (isDemo) {
      setInspections(prev => prev.filter(i => i.id !== itemToDelete.id));
      setShowDeleteModal(false);
      setItemToDelete(null);
      setSuccessMessage('Inspeção excluída com sucesso (Simulado).');
      setShowSuccessModal(true);
      setTimeout(() => setShowSuccessModal(false), 2500);
      return;
    }

    try {
      await deleteDoc(doc(db, 'inspections', itemToDelete.id));
      setShowDeleteModal(false);
      setItemToDelete(null);
      setSuccessMessage('Inspeção excluída com sucesso.');
      setShowSuccessModal(true);
      setTimeout(() => setShowSuccessModal(false), 2500);
    } catch (error) {
      console.error('Error deleting inspection:', error);
      setShowDeleteModal(false);
      setSuccessMessage('Erro ao excluir inspeção. Tente novamente.');
      setShowSuccessModal(true);
      setTimeout(() => setShowSuccessModal(false), 3000);
    }
  };

  let content = null;
  if (viewMode === 'view' && selectedItem) {
    content = (
      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
        <div className="bg-white py-3 px-4 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between mb-6">
          <h1 className="text-xl font-black text-[#1E3A5F] ml-2 tracking-wide uppercase">
            Detalhes da Inspeção
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
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Nº Inspeção:</p>
                    <p className="text-gray-700 font-medium">#{getSequentialNumber(selectedItem.id).toString().padStart(5, '0')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                    <Calendar className="text-[#27AE60] h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Data do Apontamento:</p>
                    <p className="text-gray-700 font-medium">{formatDate(selectedItem.date)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                    <Calendar className="text-[#27AE60] h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Semana/Ano:</p>
                    <p className="text-gray-700 font-medium">12</p>
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
                      selectedItem.status === 'Concluído' ? "bg-[#27AE60]" : "bg-yellow-500"
                    )}>
                      {selectedItem.status}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-[#27AE60] font-bold flex items-center gap-2 text-lg">
                  Localização
                </h3>
                <ChevronDown className="text-[#27AE60] h-5 w-5" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex items-center gap-4">
                  <Building2 className="text-[#27AE60] h-6 w-6" />
                  <div>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Empresa:</p>
                    <p className="text-gray-700 font-medium">{selectedItem.companyName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <MapPin className="text-[#27AE60] h-6 w-6" />
                  <div>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Unidade:</p>
                    <p className="text-gray-700 font-medium">{selectedItem.unitName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Layers className="text-[#27AE60] h-6 w-6" />
                  <div>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Setor:</p>
                    <p className="text-gray-700 font-medium">{selectedItem.sectorName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <LayoutGrid className="text-[#27AE60] h-6 w-6" />
                  <div>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Local:</p>
                    <p className="text-gray-700 font-medium">{selectedItem.locationName}</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Detalhes do Apontamento */}
            <section className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-[#27AE60] font-bold flex items-center gap-2 text-lg">
                  Detalhes do Apontamento
                </h3>
                <ChevronDown className="text-[#27AE60] h-5 w-5" />
              </div>
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <FileText className="text-[#27AE60] h-6 w-6 mt-1" />
                  <div className="flex-1">
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Tipo:</p>
                    <span className="bg-red-600 text-white px-6 py-1 rounded-full text-sm font-bold inline-block mt-1">
                      {selectedItem.type}
                    </span>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <AlertCircle className="text-[#27AE60] h-6 w-6 mt-1" />
                  <div>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Apontamento:</p>
                    <p className="text-gray-700 leading-relaxed mt-1">{selectedItem.description}</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <AlertCircle className="text-[#27AE60] h-6 w-6 mt-1" />
                  <div>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Risco:</p>
                    <p className="text-gray-700 leading-relaxed mt-1">{selectedItem.risk}</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <CheckCircle2 className="text-[#27AE60] h-6 w-6 mt-1" />
                  <div>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Resolução:</p>
                    <p className="text-gray-700 leading-relaxed mt-1">{selectedItem.resolution}</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <ImageIcon className="text-[#27AE60] h-6 w-6 mt-1" />
                  <div className="flex-1">
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-2">Evidência Fotográfica:</p>
                    <div className="w-full max-w-xl bg-gray-50 rounded-2xl overflow-hidden shadow-sm border border-gray-100 flex items-center justify-center min-h-[200px] cursor-pointer hover:shadow-md transition-shadow">
                      {selectedItem.image ? (
                        <a href={getMediaUrl(selectedItem.image)} target="_blank" rel="noopener noreferrer" className="w-full h-full block">
                          <img src={getMediaUrl(selectedItem.image)} alt="Evidência Fotográfica" className="w-full h-auto max-h-[500px] object-contain" />
                        </a>
                      ) : (
                        <div className="w-full h-full min-h-[200px] flex flex-col gap-2 items-center justify-center text-gray-400">
                          <ImageIcon className="h-10 w-10 text-gray-300" />
                          <span className="text-sm font-medium">Nenhuma foto anexada</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Responsáveis e Prazos */}
            <section className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-[#27AE60] font-bold flex items-center gap-2 text-lg">
                  Responsáveis e Prazos
                </h3>
                <ChevronDown className="text-[#27AE60] h-5 w-5" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex items-center gap-4">
                  <User className="text-[#27AE60] h-6 w-6" />
                  <div>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Responsável:</p>
                    <p className="text-gray-700 font-medium">{selectedItem.responsible}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Clock className="text-[#27AE60] h-6 w-6" />
                  <div>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Prazo:</p>
                    <p className="text-gray-700 font-medium">{formatDate(selectedItem.deadline)}</p>
                  </div>
                </div>
                {selectedItem.status === 'Concluído' && (
                  <div className="flex items-center gap-4">
                    <CheckCircle2 className="text-[#27AE60] h-6 w-6" />
                    <div>
                      <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Conclusão:</p>
                      <p className="text-gray-700 font-medium">
                        {selectedItem.updatedAt?.toDate ? selectedItem.updatedAt.toDate().toLocaleDateString() : 
                         selectedItem.updatedAt instanceof Date ? selectedItem.updatedAt.toLocaleDateString() : 
                         selectedItem.updatedAt ? new Date(selectedItem.updatedAt).toLocaleDateString() : 'N/A'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Registro */}
            <section className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-[#27AE60] font-bold flex items-center gap-2 text-lg">
                  Registro
                </h3>
                <ChevronDown className="text-[#27AE60] h-5 w-5" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex items-center gap-4">
                  <User className="text-[#27AE60] h-6 w-6" />
                  <div>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Registrado por:</p>
                    <p className="text-gray-700 font-medium">{selectedItem.registeredBy}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Clock className="text-[#27AE60] h-6 w-6" />
                  <div>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Data de Registro:</p>
                    <p className="text-gray-700 font-medium">
                      {selectedItem.createdAt?.toDate ? selectedItem.createdAt.toDate().toLocaleDateString() : 
                       selectedItem.createdAt instanceof Date ? selectedItem.createdAt.toLocaleDateString() : 
                       selectedItem.createdAt ? new Date(selectedItem.createdAt).toLocaleDateString() : 'N/A'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 col-span-full">
                  <FileText className="text-[#27AE60] h-6 w-6" />
                  <div>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Observações:</p>
                    <p className="text-gray-700 font-medium">{selectedItem.observations || 'Nenhuma observação registrada.'}</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              {profile?.role !== 'Gestor' && (
                <button 
                  onClick={() => handleEdit(selectedItem)}
                  className="flex-1 bg-[#F1C40F] hover:bg-[#f39c12] text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg"
                >
                  <Pencil className="h-5 w-5" />
                  Editar
                </button>
              )}
              
              {(profile?.role !== 'Usuário Comum') && (
                <button 
                  onClick={() => {
                    if (selectedItem.hasActionPlan) {
                      if (setActiveTab) setActiveTab('Planos de Ação');
                    } else {
                      handleActionPlan(selectedItem);
                    }
                  }}
                  className={cn(
                    "flex-1 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg",
                    selectedItem.hasActionPlan 
                      ? "bg-[#5D6D7E] hover:bg-[#4D5A68]" 
                      : "bg-[#1E8449] hover:bg-[#196F3D]"
                  )}
                >
                  <ListChecks className="h-5 w-5" />
                  {selectedItem.hasActionPlan ? "Ver Plano de Ação" : "Cadastrar Plano"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  } else if ((viewMode === 'edit' || viewMode === 'create')) {
    const isEditing = viewMode === 'edit';
    content = (
      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
        <div className="bg-white py-3 px-4 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between mb-6">
          <h1 className="text-xl font-black text-[#1E3A5F] ml-2 tracking-wide uppercase">
            {isEditing ? 'Editar Inspeção' : 'Cadastrar Inspeção'}
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
            <section className="space-y-6">
              <h3 className="text-[#27AE60] font-bold text-lg flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Informações Gerais
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-600">Empresa <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <select 
                      required
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-12 pr-4 py-3 text-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition-all"
                      value={formData.companyId}
                      onChange={(e) => setFormData({ ...formData, companyId: e.target.value, unitId: '', sectorId: '', locationId: '' })}
                    >
                      <option value="">Selecione a Empresa</option>
                      {companies.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-600">Unidade <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <select 
                      required
                      disabled={!formData.companyId}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-12 pr-4 py-3 text-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition-all disabled:opacity-50"
                      value={formData.unitId}
                      onChange={(e) => setFormData({ ...formData, unitId: e.target.value, sectorId: '', locationId: '' })}
                    >
                      <option value="">Selecione a Unidade</option>
                      {units.filter(u => u.companyId === formData.companyId).map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-600">Setor <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <Layers className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <select 
                      required
                      disabled={!formData.unitId}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-12 pr-4 py-3 text-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition-all disabled:opacity-50"
                      value={formData.sectorId}
                      onChange={(e) => setFormData({ ...formData, sectorId: e.target.value, locationId: '' })}
                    >
                      <option value="">Selecione o Setor</option>
                      {sectors.filter(s => s.unitId === formData.unitId).map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-600">Local <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <LayoutGrid className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <select 
                      required
                      disabled={!formData.sectorId}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-12 pr-4 py-3 text-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition-all disabled:opacity-50"
                      value={formData.locationId}
                      onChange={(e) => setFormData({ ...formData, locationId: e.target.value })}
                    >
                      <option value="">Selecione o Local</option>
                      {locations.filter(l => l.sectorId === formData.sectorId).map(l => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-600">Data do Apontamento <span className="text-red-500">*</span></label>
                  <input 
                    required
                    type="date" 
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition-all" 
                  />
                </div>
              </div>
            </section>

            {/* Detalhes do Apontamento */}
            <section className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-[#27AE60] font-bold text-lg flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" />
                  Detalhes do Apontamento
                </h3>
              </div>
              <div className="space-y-6">
                <div className="space-y-2 relative">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-bold text-gray-600">Apontamento (Situação Encontrada) <span className="text-red-500">*</span></label>
                    <button 
                      onClick={() => handleAIAction('description')}
                      disabled={isCorrecting !== null}
                      className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#27AE60] hover:text-[#219150] transition-colors disabled:opacity-50"
                      title="Corrigir com IA"
                    >
                      {isCorrecting === 'description' ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3" />
                      )}
                      IA Corrector
                    </button>
                  </div>
                  <textarea 
                    rows={3}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Descreva detalhadamente o que foi encontrado..."
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition-all pr-10"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-600">Tipo de Apontamento/Consequência <span className="text-red-500">*</span></label>
                    <select 
                      required
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition-all"
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    >
                      <option value="" disabled>{isEditing ? (formData.type || 'Selecione o Tipo') : 'Selecione o Tipo'}</option>
                      {typesOfEntries.filter(t => t.category === 'inspeção').map(t => (
                        <option key={t.id} value={t.name}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2 relative">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-bold text-gray-600">Risco/Consequência</label>
                      <button 
                        onClick={() => handleAIAction('risk')}
                        disabled={isCorrecting !== null}
                        className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#27AE60] hover:text-[#219150] transition-colors disabled:opacity-50"
                        title="Corrigir com IA"
                      >
                        {isCorrecting === 'risk' ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Sparkles className="h-3 w-3" />
                        )}
                        IA Corrector
                      </button>
                    </div>
                    <textarea 
                      rows={2}
                      value={formData.risk}
                      onChange={(e) => setFormData({ ...formData, risk: e.target.value })}
                      placeholder="Quais os riscos associados a este apontamento?"
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition-all"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Foto e Resolução */}
            <section className="space-y-6">
              <h3 className="text-[#27AE60] font-bold text-lg flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                Foto e Resolução
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <label className="text-sm font-bold text-gray-600">Foto do Local {isEditing && '(Substituir)'}</label>
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-4">
                      <label className="cursor-pointer bg-gray-50 hover:bg-gray-100 border-2 border-dashed border-gray-200 rounded-xl p-4 flex flex-col items-center justify-center gap-2 transition-all w-full max-w-[200px] aspect-video">
                        <Plus className="h-6 w-6 text-gray-400" />
                        <span className="text-xs text-gray-500 font-medium">Upload Foto</span>
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
                            className="w-32 h-24 object-cover rounded-xl shadow-md border border-gray-100" 
                          />
                          <button 
                            onClick={() => {
                              setImagePreview(null);
                              setFormData(prev => ({ ...prev, image: '' }));
                            }}
                            className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                    {isEditing && !imagePreview && selectedItem.image && (
                      <div className="mt-2">
                        <p className="text-xs text-gray-400 mb-2 font-bold uppercase tracking-wider">Foto Atual:</p>
                        <img src={getMediaUrl(selectedItem.image)} alt="Atual" className="w-32 h-24 object-cover rounded-xl shadow-sm border border-gray-100" />
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-2 relative">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-bold text-gray-600">Resolução/Medida Proposta/Ação Tomada</label>
                    <button 
                      onClick={() => handleAIAction('resolution')}
                      disabled={isCorrecting !== null}
                      className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#27AE60] hover:text-[#219150] transition-colors disabled:opacity-50"
                      title="Corrigir com IA"
                    >
                      {isCorrecting === 'resolution' ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3" />
                      )}
                      IA Corrector
                    </button>
                  </div>
                  <textarea 
                    rows={4}
                    value={formData.resolution}
                    onChange={(e) => setFormData({ ...formData, resolution: e.target.value })}
                    placeholder="O que foi feito ou o que deve ser feito para resolver?"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition-all"
                  />
                </div>
              </div>
            </section>

            {/* Responsáveis e Prazos */}
            <section className="space-y-6">
              <h3 className="text-[#27AE60] font-bold text-lg flex items-center gap-2">
                <User className="h-5 w-5" />
                Responsáveis e Prazos
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-600">Responsável/Pessoa Informada</label>
                  <input 
                    type="text" 
                    value={formData.responsible}
                    onChange={(e) => setFormData({ ...formData, responsible: e.target.value })}
                    placeholder="Nome do responsável..."
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition-all" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-600">Prazo de Resolução</label>
                  <input 
                    type="date" 
                    value={formData.deadline}
                    onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition-all" 
                  />
                </div>
              </div>
            </section>

            {/* Observações */}
            <section className="space-y-6">
              <h3 className="text-[#27AE60] font-bold text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Observações
              </h3>
              <div className="space-y-2 relative">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-gray-600">Observações Adicionais</label>
                  <button 
                    onClick={() => handleAIAction('observations')}
                    disabled={isCorrecting !== null}
                    className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#27AE60] hover:text-[#219150] transition-colors disabled:opacity-50"
                    title="Corrigir com IA"
                  >
                    {isCorrecting === 'observations' ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    IA Corrector
                  </button>
                </div>
                <textarea 
                  rows={3}
                  value={formData.observations}
                  onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
                  placeholder="Alguma observação extra?"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition-all"
                />
              </div>
            </section>

            {/* Actions */}
            <form onSubmit={handleSave} className="flex flex-col sm:flex-row gap-4 pt-4">
              <button 
                type="button"
                onClick={() => setViewMode('list')}
                className="flex-1 bg-[#5D6D7E] hover:bg-[#4D5A68] text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg"
              >
                <X className="h-5 w-5" />
                Cancelar
              </button>
              <button 
                type="submit"
                disabled={isSubmitting}
                className="flex-1 bg-[#27AE60] hover:bg-[#219150] text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-5 w-5" />
                )}
                {isSubmitting ? 'Salvando...' : (isEditing ? 'Salvar Alterações' : 'Cadastrar Inspeção')}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  } else {
    const filtered = inspections.filter(i => {
    // If filtering by specific notification ID, show only that item
    if (filterInspectionId) {
      return i.id === filterInspectionId;
    }

    const searchLower = searchTerm.toLowerCase();
                  
    const matchesSearch = (
      i.description.toLowerCase().includes(searchLower) ||
      i.companyName.toLowerCase().includes(searchLower) ||
      i.sectorName.toLowerCase().includes(searchLower) ||
      i.locationName.toLowerCase().includes(searchLower) ||
      i.id.toLowerCase().includes(searchLower)
    );

    let matchesStatus = true;
    if (filterStatus === 'Pendente') matchesStatus = i.status === 'Pendente';
    if (filterStatus === 'Concluído') matchesStatus = i.status === 'Concluído';
    if (filterStatus === 'Em Andamento') matchesStatus = i.status === 'Em Andamento';
    if (filterStatus === 'Vencido') {
      const isOverdue = i.status !== 'Concluído' && i.deadline && i.deadline < new Date().toISOString().split('T')[0];
      matchesStatus = isOverdue;
    }

    const selectedCompanyObj = companies.find(c => c.id === filterCompany);
    const selectedUnitObj = units.find(u => u.id === filterUnit);
    const selectedSectorObj = sectors.find(s => s.id === filterSector);
    const selectedLocationObj = locations.find(l => l.id === filterLocation);

    const matchesCompany = filterCompany === 'Todas' || 
      i.companyId === filterCompany || 
      (selectedCompanyObj && (i.companyName === selectedCompanyObj.name || (i as any).company === selectedCompanyObj.name));
      
    const matchesUnit = filterUnit === 'Todos' || 
      i.unitId === filterUnit || 
      (selectedUnitObj && (i.unitName === selectedUnitObj.name || (i as any).unit === selectedUnitObj.name));
      
    const matchesSector = filterSector === 'Todos' || 
      i.sectorId === filterSector || 
      (selectedSectorObj && (i.sectorName === selectedSectorObj.name || (i as any).sector === selectedSectorObj.name));
      
    const matchesLocation = filterLocation === 'Todos' || 
      i.locationId === filterLocation || 
      (selectedLocationObj && (i.locationName === selectedLocationObj.name || (i as any).local === selectedLocationObj.name));
      
    const matchesType = filterType === 'Todos' || i.type === filterType;
    
    let matchesDate = true;
    if (filterStartDate) {
      matchesDate = matchesDate && i.date >= filterStartDate;
    }
    if (filterEndDate) {
      matchesDate = matchesDate && i.date <= filterEndDate;
    }

    return matchesSearch && matchesStatus && matchesCompany && matchesUnit && matchesSector && matchesLocation && matchesType && matchesDate;
  });

  const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedItems = filtered.slice(startIndex, startIndex + itemsPerPage);

    content = (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">
      {/* Title Section */}
      <div className="bg-white py-3 px-4 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between">
        <h1 className="text-xl font-black text-[#1E3A5F] ml-2 tracking-wide uppercase">Inspeções</h1>
        {profile?.role !== 'Gestor' && (
          <button 
            onClick={handleCreate}
            className="bg-[#27AE60] hover:bg-[#219150] text-white px-5 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-md shadow-green-100/50"
          >
            <Plus className="h-4 w-4" />
            Nova Inspeção
          </button>
        )}
      </div>

      {/* Notification filter banner */}
      {filterInspectionId && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 flex items-center justify-between animate-in fade-in duration-300">
          <div className="flex items-center gap-2 text-orange-700 text-sm font-semibold">
            <Bell className="h-4 w-4" />
            Exibindo apontamento filtrado por notificação
          </div>
          <button
            onClick={() => setFilterInspectionId(null)}
            className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-800 bg-orange-100 hover:bg-orange-200 px-3 py-1 rounded-lg transition-colors"
          >
            <X className="h-3 w-3" />
            Limpar filtro
          </button>
        </div>
      )}

      {/* Unified Search and Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 flex flex-col">
        <div className="p-4 flex flex-col md:flex-row items-center gap-4">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input 
              type="text" 
              placeholder="Buscar por ID, apontamento, setor, local, empresa..."
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
                  setFilterUnit('Todos');
                  setFilterSector('Todos');
                  setFilterLocation('Todos');
                }}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition-all"
              >
                <option value="Todas">Todas</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            {filterCompany !== 'Todas' && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-600">Unidade</label>
                <select 
                  value={filterUnit}
                  onChange={(e) => {
                    setFilterUnit(e.target.value);
                    setFilterSector('Todos');
                    setFilterLocation('Todos');
                  }}
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition-all"
                >
                  <option value="Todos">Todas</option>
                  {units.filter(u => u.companyId === filterCompany).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            )}
            {filterUnit !== 'Todos' && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-600">Setor</label>
                <select 
                  value={filterSector}
                  onChange={(e) => {
                    setFilterSector(e.target.value);
                    setFilterLocation('Todos');
                  }}
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition-all"
                >
                  <option value="Todos">Todos</option>
                  {sectors.filter(s => s.unitId === filterUnit).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
            {filterSector !== 'Todos' && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-600">Local</label>
                <select 
                  value={filterLocation}
                  onChange={(e) => setFilterLocation(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition-all"
                >
                  <option value="Todos">Todos</option>
                  {locations.filter(l => l.sectorId === filterSector).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-600">Tipo de Apontamento</label>
              <select 
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition-all"
              >
                <option value="Todos">Todos</option>
                {typesOfEntries.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-600">Status</label>
              <select 
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition-all"
              >
                <option value="Todos">Todos</option>
                <option value="Pendente">Em Aberto/Pendente</option>
                <option value="Em Andamento">Em Andamento</option>
                <option value="Concluído">Concluído</option>
                <option value="Vencido">Prazo Vencido</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-600">Data Início</label>
              <input 
                type="date" 
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition-all" 
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-600">Data Fim</label>
              <input 
                type="date" 
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition-all" 
              />
            </div>
            <div className="flex items-end gap-2 lg:col-span-4 justify-end mt-2">
              <button 
                onClick={() => {
                  setFilterCompany('Todas');
                  setFilterUnit('Todos');
                  setFilterSector('Todos');
                  setFilterLocation('Todos');
                  setFilterType('Todos');
                  setFilterStatus('Todos');
                  setFilterStartDate('');
                  setFilterEndDate('');
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

      {/* Inspections Table */}
      <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-100">
        <div className="bg-[#27AE60] p-4 text-white font-bold flex items-center justify-center gap-2">
          <span>Inspeções (Total: {inspections.length})</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-white border-b-2 border-green-500">
                <th className="py-3 px-3 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider border-r border-gray-100">Nº</th>
                <th className="py-3 px-4 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider border-r border-gray-100">Unidade</th>
                <th className="py-3 px-4 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider border-r border-gray-100">Data</th>
                <th className="py-3 px-4 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider border-r border-gray-100">Setor</th>
                <th className="py-3 px-4 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider border-r border-gray-100">Local</th>
                <th className="py-3 px-4 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider border-r border-gray-100">Apontamento</th>
                <th className="py-3 px-2 text-center text-xs font-bold text-[#27AE60] uppercase tracking-wider border-r border-gray-100">Tipo</th>
                <th className="py-3 px-4 text-left text-xs font-bold text-[#27AE60] uppercase tracking-wider border-r border-gray-100">Prazo</th>
                <th className="py-3 px-2 text-center text-xs font-bold text-[#27AE60] uppercase tracking-wider border-r border-gray-100">Status</th>
                <th className="py-3 px-3 text-center text-xs font-bold text-[#27AE60] uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center">
                    <Loader2 className="h-8 w-8 text-[#27AE60] animate-spin mx-auto" />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-gray-400 font-medium">
                    Nenhuma inspeção encontrada.
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item) => (
                  <tr 
                    key={item.id} 
                    title={item.description || 'Sem descrição'} 
                    className="hover:bg-gray-50/50 transition-colors cursor-default"
                    style={{ borderLeft: `4px solid ${getTypeColor(item.type)}` }}
                  >
                    <td className="py-3 px-3 text-sm font-medium text-gray-500 border-r border-gray-100">#{getSequentialNumber(item.id).toString().padStart(5, '0')}</td>
                    <td className="py-3 px-4 text-sm text-gray-600 border-r border-gray-100">{item.unitName}</td>
                    <td className="py-3 px-4 text-sm text-gray-600 border-r border-gray-100 whitespace-nowrap">{
                      item.date && item.date.includes('-') ? item.date.split('-').reverse().join('/') : item.date
                    }</td>
                    <td className="py-3 px-4 text-sm text-gray-600 border-r border-gray-100">{item.sectorName}</td>
                    <td className="py-3 px-4 text-sm text-gray-600 border-r border-gray-100">{item.locationName}</td>
                    <td className="py-3 px-4 text-sm text-gray-600 border-r border-gray-100 truncate max-w-[150px]">{item.description || '---'}</td>
                    <td className="py-3 px-2 text-center border-r border-gray-100">
                      <div className="flex justify-center">
                        <div 
                          title={item.type} 
                          className="w-3 h-3 rounded-full cursor-help hover:scale-125 transition-transform shadow-sm"
                          style={{ backgroundColor: getTypeColor(item.type) }}
                        ></div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 border-r border-gray-100 whitespace-nowrap">{
                      item.deadline && item.deadline.includes('-') ? item.deadline.split('-').reverse().join('/') : (item.deadline || '---')
                    }</td>
                    <td className="py-3 px-2 text-center border-r border-gray-100">
                      <div className="flex justify-center">
                        <div title={item.status} className={cn(
                          "w-3 h-3 rounded-full cursor-help hover:scale-125 transition-transform",
                          item.status === 'Concluído' ? "bg-[#27AE60]" : item.status === 'Pendente' ? "bg-orange-500" : "bg-amber-500"
                        )}></div>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center justify-center gap-1 flex-nowrap">
                        {/* 1. Visualizar */}
                        <button onClick={(e) => { e.stopPropagation(); handleView(item); }} className="p-1.5 bg-[#17A2B8] hover:bg-[#138496] text-white rounded transition-colors" title="Visualizar">
                          <Eye className="h-4 w-4" />
                        </button>
                        
                        {/* 2. Editar */}
                        {profile?.role !== 'Gestor' && (
                          <button onClick={(e) => { e.stopPropagation(); handleEdit(item); }} className="p-1.5 bg-[#FFC107] hover:bg-[#E0A800] text-white rounded transition-colors" title="Editar">
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}

                        {/* 3. Plano de Ação */}
                        {profile?.role !== 'Usuário Comum' && (
                          <button 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              if (!item.hasActionPlan) handleActionPlan(item); 
                            }} 
                            className={cn(
                              "p-1.5 text-white rounded transition-colors",
                              item.hasActionPlan 
                                ? "bg-gray-400 cursor-not-allowed cursor-default" 
                                : "bg-[#27AE60] hover:bg-[#219150]"
                            )} 
                            title={item.hasActionPlan ? "Plano já criado" : "Criar Plano de Ação"}
                            disabled={item.hasActionPlan}
                          >
                            <ListChecks className="h-4 w-4" />
                          </button>
                        )}

                        {/* 4. Excluir */}
                        {profile?.role !== 'Gestor' && (
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteClick(item); }} className="p-1.5 bg-[#DC3545] hover:bg-[#C82333] text-white rounded transition-colors" title="Excluir">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
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
    );
  }

  return (
    <>
      {content}
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
      
      {/* Success Modal */}
      {showSuccessModal && document.body ? createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl shadow-2xl p-8 flex flex-col items-center justify-center text-center max-w-sm animate-in zoom-in-90 duration-300">
            <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mb-6">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            </div>
            <h3 className="text-2xl font-black text-gray-800 tracking-tight mb-2">Sucesso!</h3>
            <p className="text-gray-500 font-medium">{successMessage}</p>
          </div>
        </div>, document.body
      ) : null}

      {/* Action Plan Modal */}
      {showActionPlanModal && actionPlanInspection && document.body ? createPortal(
        <div className="fixed inset-0 z-[100000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-xl font-black text-[#1E3A5F] flex items-center gap-2">
                <ListChecks className="h-6 w-6 text-[#27AE60]" />
                Cadastrar Plano de Ação
              </h2>
              <button 
                onClick={() => setShowActionPlanModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            
            <form onSubmit={handleSaveActionPlan} className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Resumo da Inspeção */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-sm text-gray-700">
                <p><strong>Inspeção #{getSequentialNumber(actionPlanInspection.id).toString().padStart(5, '0')}</strong> - {actionPlanInspection.companyName}</p>
                <p className="mt-1 text-gray-500 line-clamp-2">{actionPlanInspection.description}</p>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-600">Data da Ação <span className="text-red-500">*</span></label>
                    <input 
                      type="date"
                      required
                      className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition-all"
                      value={actionPlanFormData.actionDate}
                      onChange={(e) => setActionPlanFormData({ ...actionPlanFormData, actionDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-600">Responsável <span className="text-red-500">*</span></label>
                    <input 
                      type="text"
                      required
                      placeholder="Nome do responsável pela ação"
                      className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition-all"
                      value={actionPlanFormData.responsible}
                      onChange={(e) => setActionPlanFormData({ ...actionPlanFormData, responsible: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2 relative">
                  <label className="text-sm font-bold text-gray-600 flex items-center justify-between">
                    <span>Descrição da Ação <span className="text-red-500">*</span></span>
                    <button
                      type="button"
                      onClick={handleActionPlanAIAction}
                      disabled={isCorrecting === 'actionDescription' || !actionPlanFormData.actionDescription}
                      className={cn(
                        "text-xs flex items-center gap-1 font-bold px-3 py-1.5 rounded-lg transition-all",
                        isCorrecting === 'actionDescription'
                          ? "bg-gray-100 text-gray-400"
                          : actionPlanFormData.actionDescription
                            ? "bg-[#8E44AD]/10 text-[#8E44AD] hover:bg-[#8E44AD]/20"
                            : "bg-gray-50 text-gray-400 cursor-not-allowed"
                      )}
                    >
                      {isCorrecting === 'actionDescription' ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3" />
                      )}
                      Corrigir com IA
                    </button>
                  </label>
                  <textarea 
                    required
                    rows={4}
                    placeholder="Descreva a ação tomada ou a ser tomada..."
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition-all resize-none"
                    value={actionPlanFormData.actionDescription}
                    onChange={(e) => setActionPlanFormData({ ...actionPlanFormData, actionDescription: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-600">Evidência (Depois)</label>
                  <div className="relative group">
                    <input 
                      type="file" 
                      accept="image/*"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          if (file.size > 30 * 1024 * 1024) {
                            setErrorMessage('A imagem original é muito grande. Máximo permitido: 30MB');
                            setShowErrorModal(true);
                            return;
                          }
                          
                          try {
                            const compressed = await compressImage(file);
                            setActionPlanFile(compressed);
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              setActionPlanImagePreview(reader.result as string);
                            };
                            reader.readAsDataURL(compressed);
                          } catch (err) {
                            console.error('Erro ao processar imagem:', err);
                            setActionPlanFile(file);
                          }
                        }
                      }}
                    />
                    <div className={cn(
                      "w-full rounded-xl border-2 border-dashed flex flex-col items-center justify-center p-6 transition-all duration-300",
                      actionPlanImagePreview 
                        ? "border-[#27AE60] bg-green-50/50" 
                        : "border-gray-200 bg-gray-50 group-hover:bg-gray-100 group-hover:border-[#27AE60]/50"
                    )}>
                      {actionPlanImagePreview ? (
                        <div className="relative w-full aspect-[21/9] rounded-lg overflow-hidden flex items-center justify-center bg-black/5">
                          <img src={actionPlanImagePreview} alt="Preview" className="max-w-full max-h-full object-contain" />
                        </div>
                      ) : (
                        <>
                          <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm border border-gray-100 mb-3 group-hover:scale-110 transition-transform">
                            <Camera className="h-5 w-5 text-[#27AE60]" />
                          </div>
                          <p className="text-sm font-bold text-gray-600">Adicionar Evidência Fotográfica</p>
                          <p className="text-xs text-gray-400 mt-1">Clique ou arraste a foto aqui (Max: 10MB)</p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-gray-100 mt-6">
                <button 
                  type="button"
                  onClick={() => setShowActionPlanModal(false)}
                  className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={isSubmittingActionPlan}
                  className="px-6 py-2.5 bg-[#27AE60] hover:bg-[#219150] text-white font-bold rounded-xl transition-all shadow-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingActionPlan ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle className="h-5 w-5" />}
                  {isSubmittingActionPlan ? 'Salvando...' : 'Salvar Plano'}
                </button>
              </div>
            </form>
          </div>
        </div>, document.body
      ) : null}

      {showErrorModal && document.body ? createPortal(
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl shadow-2xl p-8 flex flex-col items-center justify-center text-center max-w-sm animate-in zoom-in-90 duration-300">
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-6">
              <AlertCircle className="h-10 w-10 text-red-500" />
            </div>
            <h3 className="text-2xl font-black text-gray-800 tracking-tight mb-2 uppercase italic">Atenção!</h3>
            <p className="text-gray-500 font-medium">{errorMessage}</p>
            <button 
              onClick={() => setShowErrorModal(false)}
              className="mt-6 w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-all uppercase text-xs tracking-widest"
            >
              Fechar
            </button>
          </div>
        </div>, document.body
      ) : null}
    </>
  );
}
