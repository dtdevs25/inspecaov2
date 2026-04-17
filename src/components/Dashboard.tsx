import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  Legend
} from 'recharts';
import { 
  ClipboardCheck, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  Search,
  Plus,
  FileText,
  LayoutDashboard,
  Rocket,
  Bell,
  CheckCircle,
  X,
  ArrowRight,
  TrendingUp,
  MapPin,
  Loader2
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useUser } from '../contexts/UserContext';
import { collection, onSnapshot, query, where, orderBy } from '../lib/dbBridge';
const db = {} as any;

interface Inspection {
  id: string;
  status: 'Pendente' | 'Concluído';
  sectorName: string;
  companyName: string;
  companyId: string;
  unitId: string;
  unitName?: string;
  type: string;
  locationName?: string;
  description?: string;
  deadline?: string;
  responsible?: string;
  createdAt: any;
  dueDate?: any;
}

const COLORS = ['#5DADE2', '#FF4D4D', '#FFB84D', '#B84DFF', '#4DFFB8', '#4DB8FF', '#FF4DFF', '#F4D03F', '#58D68D'];

const StatCard = ({ icon: Icon, label, value, bgColor, bottomColor, iconColor, onClick }: any) => (
  <div 
    onClick={onClick}
    className={cn(
      "relative flex flex-col justify-between rounded-lg shadow-sm overflow-hidden cursor-pointer transition-transform hover:scale-[1.02]",
      bgColor
    )}
  >
    <div className="p-4 md:p-5 flex justify-between items-center relative z-10">
      <div className="space-y-0.5 z-10">
        <p className="text-white text-sm md:text-base font-medium tracking-wide">{label}</p>
        <h3 className="text-3xl md:text-4xl font-bold text-white tracking-tight">{value}</h3>
      </div>
      <Icon className={cn("h-14 w-14 md:h-16 md:w-16 z-0 mr-1", iconColor)} strokeWidth={1.5} />
    </div>
    <div className={cn("h-3 w-full", bottomColor)}></div>
  </div>
);

const QuickActionButton = ({ icon: Icon, label, color, onClick }: any) => (
  <button 
    onClick={onClick}
    className={cn(
      "flex-1 min-w-[150px] p-3 rounded-xl flex items-center justify-center gap-3 text-white font-bold transition-all active:scale-95 shadow-md hover:brightness-110",
      color
    )}
  >
    <Icon className="h-5 w-5" />
    <span className="text-sm">{label}</span>
  </button>
);

const DetailModal = ({ isOpen, onClose, title, content }: any) => {
  if (!isOpen || !document.body) return null;
  return createPortal(
    <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-300 border border-gray-100">
        <div className="bg-[#27AE60] p-4 flex items-center justify-between text-white shadow-sm">
          <h3 className="font-black text-lg uppercase tracking-wide">{title}</h3>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
            <X className="h-6 w-6" />
          </button>
        </div>
        <div className="p-6">
          {content}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default function Dashboard({ setActiveTab, setPrefilledData }: any) {
  const { profile, loading: userLoading, isDemo } = useUser();
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCompany, setSelectedCompany] = useState('Todas as Empresas');
  const [selectedUnit, setSelectedUnit] = useState('Todas as Unidades');
  const [modalData, setModalData] = useState<any>(null);
  const [companies, setCompanies] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [sectors, setSectors] = useState<any[]>([]);
  const [inspectionSeqMap, setInspectionSeqMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (userLoading) return;

    if (isDemo) {
      const mockInspections: Inspection[] = [
        { id: '1', status: 'Pendente', sectorName: 'Produção', companyName: 'Empresa Alpha', companyId: '1', unitId: 'u1', type: 'Risco Potencial', createdAt: new Date() },
        { id: '2', status: 'Concluído', sectorName: 'Logística', companyName: 'Empresa Alpha', companyId: '1', unitId: 'u1', type: 'Apontamento', createdAt: new Date() },
        { id: '3', status: 'Pendente', sectorName: 'Engenharia', companyName: 'Empresa Beta', companyId: '2', unitId: 'u2', type: 'Falta de Uso de EPI', createdAt: new Date() },
      ];
      setInspections(mockInspections);
      setCompanies([
        { id: '1', name: 'Empresa Alpha' },
        { id: '2', name: 'Empresa Beta' }
      ]);
      setUnits([
        { id: 'u1', name: 'Unidade Alpha-1', companyId: '1' },
        { id: 'u2', name: 'Unidade Beta-1', companyId: '2' }
      ]);
      setLoading(false);
      return;
    }

    const unsubInspections = onSnapshot(query(collection(db, 'inspections'), orderBy('createdAt', 'desc')), (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Inspection));
      
      // Build mapping (Total count - index) matching the logic in ActionPlans/Inspections
      const mapping: Record<string, string> = {};
      const total = docs.length;
      docs.forEach((insp, idx) => {
        mapping[insp.id] = (total - idx).toString().padStart(5, '0');
      });
      setInspectionSeqMap(mapping);

      setInspections(docs);
      setLoading(false);
    });

    const unsubCompanies = onSnapshot(collection(db, 'companies'), (snapshot) => {
      let docs = snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
      if (profile && profile.role !== 'Master') {
        if (profile.role === 'Gestor') {
          // Gestor sees all companies (filter is on inspections level)
        } else {
          // Derive from companies array OR from unit's company
          const accessibleCompanyIds: string[] = profile.companies || [];
          const unitCompanyIds = (profile.units || []).map((uid: string) => {
            // We resolve from units state after it's loaded — use a broad pass for now
            return uid;
          });
          // Filter: show company if directly assigned OR if any unit belongs to it
          // Since we don't have units loaded yet here, we filter by companies only
          // The units snapshot below will handle the rest
          if (accessibleCompanyIds.length > 0) {
            docs = docs.filter((c: any) => accessibleCompanyIds.includes(c.id));
          }
          // If companies is empty but units have values, show all companies (units filter will scope data)
        }
      }
      setCompanies(docs);
    });

    const unsubUnits = onSnapshot(collection(db, 'units'), (snapshot) => {
      let docs = snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name, companyId: doc.data().companyId }));
      if (profile && profile.role !== 'Master') {
        if (profile.role === 'Gestor') {
          // Gestor: no unit restriction
        } else {
          const accessibleUnitIds: string[] = profile.units || [];
          const accessibleCompanyIds: string[] = profile.companies || [];
          docs = docs.filter((u: any) =>
            accessibleUnitIds.includes(u.id) ||
            accessibleCompanyIds.includes(u.companyId)
          );
        }
      }
      setUnits(docs);
    });

    const unsubSectors = onSnapshot(collection(db, 'sectors'), (snapshot) => {
      setSectors(snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
    });

    return () => {
      unsubInspections();
      unsubCompanies();
      unsubUnits();
      unsubSectors();
    };
  }, [profile, userLoading, isDemo]);

  const filteredInspections = inspections.filter(i => {
    const isGestor = profile?.role === 'Gestor';
    
    // Normal match logic
    const matchCompany = selectedCompany === 'Todas as Empresas' || i.companyName === selectedCompany;
    const matchUnit = selectedUnit === 'Todas as Unidades' || i.unitName === selectedUnit;
    
    // For Gestors, we allow records that might be missing company/unit names (common in legacy data)
    // as long as they are already filtered by the permissions logic (which checks Sector/Location)
    if (isGestor) {
      if (selectedCompany === 'Todas as Empresas' && selectedUnit === 'Todas as Unidades') return true;
      if (selectedCompany !== 'Todas as Empresas' && !i.companyName) return false; // But respect if they explicitly select a company
      return matchCompany && matchUnit;
    }

    return matchCompany && matchUnit;
  });

  const stats = {
    total: filteredInspections.length,
    open: filteredInspections.filter(i => i.status === 'Pendente').length,
    completed: filteredInspections.filter(i => i.status === 'Concluído').length,
    overdue: filteredInspections.filter(i => i.status === 'Pendente' && i.dueDate?.toDate() < new Date()).length
  };

  const sectorData = Object.entries(
    filteredInspections.reduce((acc: any, curr) => {
      acc[curr.sectorName] = (acc[curr.sectorName] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }));

  const typeData = Object.entries(
    filteredInspections.reduce((acc: any, curr) => {
      acc[curr.type] = (acc[curr.type] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, value], index) => ({ 
    name, 
    value, 
    color: COLORS[index % COLORS.length] 
  }));

  const expiringSoon = filteredInspections
    .filter(i => {
      if (i.status !== 'Pendente') return false;
      const dueStr = i.deadline || i.dueDate;
      if (!dueStr) return false;

      let due: Date;
      if (dueStr.toDate) {
         due = dueStr.toDate();
      } else {
         due = new Date(dueStr + 'T00:00:00');
      }

      if (isNaN(due.getTime())) return false;

      const now = new Date();
      now.setHours(0, 0, 0, 0);

      const next7Days = new Date(now);
      next7Days.setDate(now.getDate() + 7);
      
      // Included today and next 7 days
      return due >= now && due <= next7Days;
    })
    .sort((a, b) => {
      const dueA = a.deadline || a.dueDate;
      const dateA = dueA.toDate ? dueA.toDate() : new Date(dueA + 'T00:00:00');
      const dueB = b.deadline || b.dueDate;
      const dateB = dueB.toDate ? dueB.toDate() : new Date(dueB + 'T00:00:00');
      return dateA.getTime() - dateB.getTime();
    });

  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, index }: any) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    const p = (percent * 100).toFixed(0);
  
    // Remove the condition that hides text for values < 5%, so all slices show their %
  
    return (
      <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" className="text-[10px] font-black">
        {`${p}%`}
      </text>
    );
  };

  const handleStatClick = (label: string, status?: string) => {
    let filterStatus = 'Todos';
    if (label === 'Prazo Vencido') {
      filterStatus = 'Vencido';
    } else if (label === 'Em Aberto' || status === 'Pendente') {
      filterStatus = 'Pendente';
    } else if (label === 'Concluídas' || status === 'Concluído') {
      filterStatus = 'Concluído';
    } else if (label === 'Inspeções') {
      filterStatus = 'Todos';
    }

    const payload: any = { filterStatus };
    if (selectedCompany !== 'Todas as Empresas') {
      const comp = companies.find(c => c.name === selectedCompany);
      if (comp) payload.filterCompany = comp.id;
    }
    if (selectedUnit !== 'Todas as Unidades') {
      const un = units.find(u => u.name === selectedUnit);
      if (un) payload.filterUnit = un.id;
    }

    if (setActiveTab && setPrefilledData) {
      setPrefilledData(payload);
      setActiveTab('Inspeções');
    }
  };

  const handleChartClick = (data: any, type: 'sector' | 'type') => {
    const filterValue = data.payload?.name || data.name || data.activePayload?.[0]?.payload?.name;
    if (!filterValue) return;

    const list = filteredInspections.filter(i => 
      type === 'sector' ? i.sectorName === filterValue : i.type === filterValue
    );

    const handleModalItemClick = (item: any) => {
      if (setActiveTab && setPrefilledData) {
        setPrefilledData({ selectedInspection: item });
        setActiveTab('Inspeções');
        setModalData(null);
      }
    };

    setModalData({
      title: `Inspeções: ${filterValue}`,
      content: (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl mb-4 text-xs">
            <span className="text-gray-500 font-medium">Exibindo os últimos 5 registros</span>
            <span className="text-2xl font-black text-[#27AE60]">{list.length}</span>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-[10px] text-[#27AE60] font-black uppercase bg-gray-50 tracking-widest">
                <tr>
                  <th className="px-3 py-3">Nº</th>
                  <th className="px-3 py-3">Unidade</th>
                  <th className="px-3 py-3">Setor</th>
                  <th className="px-3 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs text-gray-600">
                {list.slice(0, 5).map((item) => (
                  <tr 
                    key={item.id} 
                    onClick={() => handleModalItemClick(item)}
                    className="hover:bg-green-50 transition-colors cursor-pointer group"
                  >
                    <td className="px-3 py-4 font-black text-[#27AE60]">#{inspectionSeqMap[item.id] || item.id.slice(-4)}</td>
                    <td className="px-3 py-4 font-bold max-w-[120px] truncate">{item.unitName || item.companyName}</td>
                    <td className="px-3 py-4">{item.sectorName}</td>
                    <td className="px-3 py-4">
                      <span className={cn(
                        "px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter",
                        item.status === 'Pendente' ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"
                      )}>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {list.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-center text-gray-500">
                      Nenhum registro encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )
    });
  };

  if (loading || userLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-12 w-12 text-[#27AE60] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">
      <DetailModal 
        isOpen={!!modalData} 
        onClose={() => setModalData(null)} 
        title={modalData?.title} 
        content={modalData?.content} 
      />

      {/* Title Section */}
      <div className="bg-white py-3 px-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
        <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
          <h1 className="text-lg font-bold text-gray-800">Olá, {profile?.displayName}!</h1>
          <p className="text-gray-400 text-xs sm:text-sm">Bem-vindo ao painel InspecPRO</p>
        </div>
        <div className="hidden md:flex flex-col sm:flex-row items-center gap-1.5 sm:gap-3">
          <div className="flex items-center gap-1.5 text-gray-500 text-xs font-semibold bg-gray-50 px-2 py-1.5 rounded-lg border border-gray-100 hover:bg-gray-100 transition-colors">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <select 
              value={selectedCompany}
              onChange={(e) => {
                setSelectedCompany(e.target.value);
                setSelectedUnit('Todas as Unidades');
              }}
              className="bg-transparent border-none text-gray-600 font-bold focus:ring-0 outline-none cursor-pointer pr-4 hover:text-gray-800"
            >
              <option>Todas as Empresas</option>
              {companies.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5 text-gray-500 text-xs font-semibold bg-gray-50 px-2 py-1.5 rounded-lg border border-gray-100 hover:bg-gray-100 transition-colors">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <select 
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
              className="bg-transparent border-none text-gray-600 font-bold focus:ring-0 outline-none cursor-pointer pr-4 hover:text-gray-800 max-w-[120px] truncate"
            >
              <option>Todas as Unidades</option>
              {units
                .filter(u => selectedCompany === 'Todas as Empresas' || companies.find(c => c.name === selectedCompany)?.id === u.companyId)
                .map(u => (
                <option key={u.id} value={u.name}>{u.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>


      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          icon={ClipboardCheck} 
          label="Inspeções" 
          value={stats.total} 
          bgColor="bg-[#007BFF]"
          bottomColor="bg-[#0069D9]"
          iconColor="text-white/30"
          onClick={() => handleStatClick('Inspeções')}
        />
        <StatCard 
          icon={Clock} 
          label="Em Aberto" 
          value={stats.open} 
          bgColor="bg-[#FFC107]"
          bottomColor="bg-[#E0A800]"
          iconColor="text-white/40"
          onClick={() => handleStatClick('Em Aberto', 'Pendente')}
        />
        <StatCard 
          icon={CheckCircle2} 
          label="Concluídas" 
          value={stats.completed} 
          bgColor="bg-[#28A745]"
          bottomColor="bg-[#218838]"
          iconColor="text-white/30"
          onClick={() => handleStatClick('Concluídas', 'Concluído')}
        />
        <StatCard 
          icon={AlertTriangle} 
          label="Prazo Vencido" 
          value={stats.overdue} 
          bgColor="bg-[#DC3545]"
          bottomColor="bg-[#C82333]"
          iconColor="text-white/30"
          onClick={() => handleStatClick('Prazo Vencido')}
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Appointments by Sector */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <div className="bg-white rounded-xl shadow-md overflow-hidden flex flex-col h-[500px]">
            <div className="bg-[#27AE60] p-4 flex items-center gap-2 text-white font-bold">
              <FileText className="h-5 w-5" />
              <span>Apontamentos por Setor</span>
            </div>
            <div className="flex-1 p-6 w-full">
              {sectorData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sectorData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" stroke="#A6ACAF" fontSize={12} tickLine={false} />
                    <YAxis stroke="#A6ACAF" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip 
                      cursor={{ fill: 'rgba(39, 174, 96, 0.1)' }}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
                    />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]} onClick={(data) => handleChartClick(data, 'sector')} className="cursor-pointer">
                      {sectorData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400 italic">
                  Nenhum dado disponível para os filtros selecionados.
                </div>
              )}
            </div>
          </div>

          {/* Next Expirations */}
          <div className="bg-white rounded-xl shadow-md overflow-hidden flex flex-col h-fit max-h-[250px]">
            <div className="bg-[#27AE60] p-4 flex items-center gap-2 text-white font-bold">
              <Clock className="h-5 w-5" />
              <span>Próximos Vencimentos (7 dias)</span>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center p-0 text-center relative max-h-full overflow-hidden">
              {expiringSoon.length > 0 ? (
                <div className="w-full h-full overflow-y-auto scrollbar-hide">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50/80 sticky top-0 border-b border-gray-100 z-10 text-[10px] text-gray-400 uppercase tracking-widest font-black">
                      <tr>
                        <th className="px-4 py-3">Nº</th>
                        <th className="px-4 py-3">Setor</th>
                        <th className="px-4 py-3">Descrição</th>
                        <th className="px-4 py-3">Prazo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {expiringSoon.map(i => {
                        const dueStr = i.deadline || i.dueDate;
                        const dateObj = dueStr?.toDate ? dueStr.toDate() : new Date(dueStr + 'T00:00:00');
                        const descriptionText = i.description || i.type || 'Sem descrição';
                        return (
                          <tr 
                            key={i.id} 
                            onClick={() => {
                              if (setActiveTab && setPrefilledData) {
                                setPrefilledData({ selectedInspection: i });
                                setActiveTab('Inspeções');
                              }
                            }}
                            className="hover:bg-amber-50/40 transition-colors cursor-pointer group"
                          >
                            <td className="px-4 py-3 font-bold text-gray-700 whitespace-nowrap w-[70px]">
                              #{inspectionSeqMap[i.id] || '---'}
                            </td>
                            <td className="px-4 py-3 font-bold text-gray-700 whitespace-nowrap max-w-[100px] truncate" title={i.sectorName}>
                              {i.sectorName}
                            </td>
                            <td className="px-4 py-3 text-gray-500 font-medium truncate max-w-[150px]" title={descriptionText}>
                              {descriptionText}
                            </td>
                            <td className="px-4 py-3 font-black text-amber-600 whitespace-nowrap w-[90px]">
                              {!isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString('pt-BR') : '---'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-10 flex flex-col items-center justify-center gap-4 animate-in fade-in zoom-in duration-500">
                  <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center shadow-inner group transition-transform hover:scale-110">
                    <CheckCircle className="h-12 w-12 text-[#27AE60]" />
                  </div>
                  <p className="text-gray-500 font-black text-sm uppercase tracking-wide">Tudo em dia!</p>
                  <p className="text-gray-400 text-xs px-10 leading-relaxed font-medium">Nenhum vencimento crítico nos próximos 7 dias.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Appointments by Type */}
        <div className="bg-white rounded-xl shadow-md overflow-hidden flex flex-col h-full min-h-[600px]">
          <div className="bg-[#27AE60] p-4 flex items-center gap-2 text-white font-bold">
            <Bell className="h-5 w-5" />
            <span>Apontamentos por Tipo</span>
          </div>
          <div className="flex-1 p-4 w-full flex flex-col">
            <div className="w-full h-[320px]">
              {typeData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={typeData}
                      cx="50%"
                      cy="50%"
                      outerRadius="80%"
                      dataKey="value"
                      animationDuration={1000}
                      className="cursor-pointer outline-none"
                      onClick={(data) => handleChartClick(data, 'type')}
                      label={renderCustomizedLabel}
                      labelLine={false}
                      isAnimationActive={false}
                    >
                      {typeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} stroke="#fff" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400 italic">
                  Sem dados.
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
              {typeData.map((item, idx) => (
                <div 
                  key={idx} 
                  className="flex items-center gap-2 p-1 hover:bg-gray-50 rounded cursor-pointer transition-colors"
                >
                  <div className="w-8 h-3 rounded-sm" style={{ backgroundColor: item.color }}></div>
                  <span className="text-[10px] text-gray-600 font-bold truncate">{item.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions - Only visible for Master or Admin */}
      {(profile?.role === 'Master' || profile?.role === 'Administrador') && (
        <div className="bg-white rounded-xl shadow-md overflow-hidden flex flex-col mb-6">
          <div className="bg-[#27AE60] p-4 flex items-center gap-2 text-white font-bold">
            <Rocket className="h-5 w-5" />
            <span>Ações Rápidas</span>
          </div>
          <div className="p-6 flex flex-wrap gap-4">
            <QuickActionButton 
              icon={Search} 
              label="Inspecionar" 
              color="bg-[#1ABC9C]" 
              onClick={() => {
                if (setPrefilledData) setPrefilledData({ triggerCreate: true });
                if (setActiveTab) setActiveTab('Inspeções');
              }}
            />
            <QuickActionButton 
              icon={Rocket} 
              label="Novo Projeto" 
              color="bg-[#8E44AD]" 
              onClick={() => {
                if (setActiveTab) setActiveTab('Projetos');
              }}
            />
            <QuickActionButton 
              icon={FileText} 
              label="Relatório" 
              color="bg-[#27AE60]" 
              onClick={() => {
                if (setActiveTab) setActiveTab('Relatórios');
              }}
            />
            <QuickActionButton 
              icon={Bell} 
              label="Em Aberto" 
              color="bg-[#FF8C2D]" 
              onClick={async () => {
                const openItems = filteredInspections.filter(i => i.status === 'Pendente');
                
                if (openItems.length === 0) {
                   alert('Nenhum apontamento em aberto encontrado para os filtros atuais.');
                   return;
                }

                const workbook = new ExcelJS.Workbook();
                
                // Agrupa os apontamentos por unidade
                const groupedByUnit = openItems.reduce((acc, item) => {
                   const unitName = item.unitName || item.companyName || 'Sem Unidade';
                   let safeUnitName = unitName.replace(/[/\\?*:[\]]/g, '').trim().substring(0, 31);
                   if (!safeUnitName) safeUnitName = 'Unidade';
                   if (!acc[safeUnitName]) {
                      acc[safeUnitName] = [];
                   }
                   acc[safeUnitName].push(item);
                   return acc;
                }, {} as Record<string, typeof openItems>);

                Object.entries(groupedByUnit).forEach(([unitName, items]) => {
                    const sheet = workbook.addWorksheet(unitName);

                    sheet.columns = [
                      { header: 'Data do Apontamento', key: 'data', width: 22 },
                      { header: 'Número', key: 'numero', width: 14 },
                      { header: 'Setor', key: 'setor', width: 25 },
                      { header: 'Apontamento (Tipo / Descrição)', key: 'apontamento', width: 50 },
                      { header: 'Responsável', key: 'responsavel', width: 30 },
                      { header: 'Prazo', key: 'prazo', width: 16 }
                    ];

                    const headerRow = sheet.getRow(1);
                    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                    headerRow.fill = {
                      type: 'pattern',
                      pattern: 'solid',
                      fgColor: { argb: 'FF27AE60' }
                    };
                    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
                    headerRow.height = 30;

                    items.forEach(item => {
                      let formattedDate = '---';
                      if (item.createdAt) {
                        const d = item.createdAt.toDate ? item.createdAt.toDate() : new Date(item.createdAt);
                        formattedDate = d.toLocaleDateString('pt-BR');
                      }
                      const numberFormatted = '#' + (inspectionSeqMap[item.id] || item.id.slice(-5));
                      
                      let desc = item.type || '';
                      if (item.description && item.description !== item.type) {
                           desc += ` - ${item.description}`;
                      }

                      let responsavel = item.responsible || 'Responsável não informado';

                      let formattedPrazo = 'Sem prazo informado';
                      if (item.dueDate) {
                         const d = item.dueDate.toDate ? item.dueDate.toDate() : new Date(item.dueDate);
                         formattedPrazo = d.toLocaleDateString('pt-BR');
                      } else if (item.deadline) {
                         const d = new Date(item.deadline + 'T00:00:00');
                         if (!isNaN(d.getTime())) {
                             formattedPrazo = d.toLocaleDateString('pt-BR');
                         }
                      }

                      const row = sheet.addRow({
                         data: formattedDate,
                         numero: numberFormatted,
                         setor: item.sectorName,
                         apontamento: desc,
                         responsavel: responsavel,
                         prazo: formattedPrazo
                      });

                      row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
                      row.getCell('apontamento').alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
                      row.getCell('setor').alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
                      row.getCell('responsavel').alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
                    });

                    sheet.eachRow((row) => {
                      row.eachCell((cell) => {
                        cell.border = {
                          top: {style:'thin', color: {argb:'FFEEEEEE'}},
                          left: {style:'thin', color: {argb:'FFEEEEEE'}},
                          bottom: {style:'thin', color: {argb:'FFEEEEEE'}},
                          right: {style:'thin', color: {argb:'FFEEEEEE'}}
                        };
                      });
                    });
                });

                const buffer = await workbook.xlsx.writeBuffer();
                const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                saveAs(blob, 'Apontamentos_Em_Aberto.xlsx');
              }}
            />
            <QuickActionButton 
              icon={LayoutDashboard} 
              label="Painel" 
              color="bg-[#566573]" 
              onClick={() => {
                if (setActiveTab) setActiveTab('Painel');
              }}
            />
          </div>
        </div>
      )}
      {/* Empty Spacer */}
      <div className="h-1" />
    </div>
  );
}

