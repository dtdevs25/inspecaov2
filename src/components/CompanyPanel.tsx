import React, { useState, useEffect } from 'react';
const db = {} as any;
import { collection, getDocs, onSnapshot, query, orderBy } from '../lib/dbBridge';
import { useUser } from '../contexts/UserContext';

export default function CompanyPanel() {
  const { profile } = useUser();
  const [inspections, setInspections] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  
  const [selectedCompany, setSelectedCompany] = useState<string>('Todas as Empresas');
  const [selectedUnit, setSelectedUnit] = useState<string>('Todas as Unidades');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | 'Acumulado'>(new Date().getMonth());

  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'companies'));
        let comps = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        if (profile && profile.role !== 'Master') {
          comps = comps.filter(c => profile.companies?.includes(c.id));
        }
        setCompanies(comps);
      } catch (error) {
        console.error("Error", error);
      }
    };
    fetchCompanies();

    const unsub = onSnapshot(query(collection(db, 'inspections'), orderBy('createdAt', 'desc')), (snapshot) => {
      let docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      if (profile && profile.role !== 'Master') {
        docs = docs.filter(i => profile.companies?.includes(i.companyId) || profile.units?.includes(i.unitId));
      }
      setInspections(docs);
    });

    const unsubUnits = onSnapshot(collection(db, 'units'), (snapshot) => {
      let docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      if (profile && profile.role !== 'Master') {
        docs = docs.filter((u: any) => profile.units?.includes(u.id));
      }
      setUnits(docs);
    });

    const unsubProjects = onSnapshot(collection(db, 'projects'), (snapshot) => {
      let docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      if (profile && profile.role !== 'Master') {
        docs = docs.filter(p => profile.companies?.includes(p.companyId) || (p.unitId && profile.units?.includes(p.unitId)));
      }
      setProjects(docs);
    });

    return () => { unsub(); unsubUnits(); unsubProjects(); };
  }, [profile]);

  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const filteredBySelection = inspections.filter(i => {
    const matchCompany = selectedCompany === 'Todas as Empresas' || i.companyName === selectedCompany;
    const matchUnit = selectedUnit === 'Todas as Unidades' || i.unitName === selectedUnit;
    return matchCompany && matchUnit;
  });

  const filteredInspections = filteredBySelection.filter(i => {
    if (i.status !== 'Concluído' || !i.updatedAt) return false;
    let d = i.updatedAt?.toDate ? i.updatedAt.toDate() : new Date(i.updatedAt);
    if (isNaN(d.getTime())) return false;
    
    return d.getFullYear() === selectedYear;
  });

  const totalCompleted = filteredInspections.length;
  
  const thisMonthResolved = filteredInspections.filter(i => {
    if (selectedMonth === 'Acumulado') return true;
    let d = i.updatedAt?.toDate ? i.updatedAt.toDate() : new Date(i.updatedAt);
    return d.getMonth() === selectedMonth;
  }).length;

  const filteredProjects = projects.filter(p => {
    const selectedCompObj = companies.find(c => c.name === selectedCompany);
    const selectedUnitObj = units.find(u => u.name === selectedUnit);

    const matchCompany = selectedCompany === 'Todas as Empresas' || p.companyId === selectedCompObj?.id || p.companyName === selectedCompany;
    const matchUnit = selectedUnit === 'Todas as Unidades' || p.unitId === selectedUnitObj?.id || p.unitName === selectedUnit;
    const matchesAndamento = p.status === 'Em Andamento';
    
    return matchCompany && matchUnit && matchesAndamento;
  });

  const projectCount = filteredProjects.length;

  let displayTitle = 'Todas as Empresas';
  if (selectedCompany !== 'Todas as Empresas') {
    displayTitle = selectedCompany;
    if (selectedUnit !== 'Todas as Unidades') {
      displayTitle += ` - ${selectedUnit}`;
    }
  } else if (profile?.role !== 'Master' && companies.length > 0) {
     displayTitle = companies.map(c => c.name).join(', ');
  } else if (profile?.role !== 'Master') {
     displayTitle = 'Sua Empresa';
  }

  const monthLabel = selectedMonth === 'Acumulado' ? 'neste ano' : `em ${months[selectedMonth as number]}`;

  return (
    <div className="bg-[#E6F4F1] font-sans flex flex-col items-center p-4 rounded-xl min-h-[400px] h-full overflow-y-auto">
      <div className="w-full max-w-4xl flex flex-col gap-4 relative z-10 animate-in fade-in zoom-in-95 duration-500">
        
        <div className="flex flex-wrap items-center justify-end w-full gap-3">
          <div className="flex items-center justify-between gap-2 bg-white/70 backdrop-blur px-4 py-2 rounded-xl shadow-sm border border-white flex-auto sm:flex-none">
            <label className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-widest leading-none">Empresa:</label>
            <select 
              value={selectedCompany} 
              onChange={(e) => {
                 setSelectedCompany(e.target.value);
                 setSelectedUnit('Todas as Unidades');
              }}
              className="bg-transparent text-xs md:text-sm font-black text-[#27AE60] outline-none cursor-pointer max-w-[150px] truncate"
            >
              <option>Todas as Empresas</option>
              {companies.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>

          <div className="flex items-center justify-between gap-2 bg-white/70 backdrop-blur px-4 py-2 rounded-xl shadow-sm border border-white flex-auto sm:flex-none">
            <label className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-widest leading-none">Unidade:</label>
            <select 
              value={selectedUnit} 
              onChange={(e) => setSelectedUnit(e.target.value)}
              className="bg-transparent text-xs md:text-sm font-black text-[#27AE60] outline-none cursor-pointer max-w-[150px] truncate"
            >
              <option>Todas as Unidades</option>
              {units
                 .filter(u => selectedCompany === 'Todas as Empresas' || companies.find(c => c.name === selectedCompany)?.id === u.companyId)
                 .map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
            </select>
          </div>

          <div className="flex items-center justify-between gap-2 bg-white/70 backdrop-blur px-4 py-2 rounded-xl shadow-sm border border-white flex-auto sm:flex-none">
            <label className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-widest leading-none">Ano:</label>
            <select 
              value={selectedYear} 
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-transparent text-sm md:text-base font-black text-[#27AE60] outline-none cursor-pointer leading-none"
            >
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          
          <div className="flex items-center justify-between gap-2 bg-white/70 backdrop-blur px-4 py-2 rounded-xl shadow-sm border border-white flex-auto sm:flex-none">
            <label className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-widest leading-none">Mês:</label>
            <select 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(e.target.value === 'Acumulado' ? 'Acumulado' : Number(e.target.value))}
              className="bg-transparent text-sm md:text-base font-black text-[#27AE60] outline-none cursor-pointer leading-none"
            >
              <option value="Acumulado">Acumulado</option>
              {months.map((m, i) => (
                <option key={i} value={i}>{m}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="w-full bg-gradient-to-b from-[#27AE60] to-[#1E824C] rounded-[24px] shadow-xl overflow-hidden border-2 border-white/50 flex flex-col">
          
          <div className="bg-white px-5 py-4 flex flex-col items-center justify-center border-b-[4px] border-[#F1C40F] shadow relative overflow-hidden">
            <h2 className="text-xl md:text-2xl font-black text-[#1E3A5F] text-center relative z-10 uppercase tracking-wide">
              {displayTitle}
            </h2>
          </div>
          
          <div className="p-6 md:p-8 flex flex-col items-center text-center relative overflow-hidden justify-center min-h-[200px]">
            <div className="absolute top-0 left-0 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 right-0 w-48 h-48 bg-black opacity-10 rounded-full blur-3xl"></div>

            <div className="relative z-10 space-y-4 md:space-y-6 text-white max-w-xl flex flex-col items-center">
              <p className="text-base md:text-lg font-medium leading-relaxed drop-shadow-sm px-2">
                Eliminamos {monthLabel} <span className="text-[#1E3A5F] text-xl md:text-3xl font-black bg-[#F1C40F] px-4 py-1.5 rounded-xl shadow-[0_4px_16px_rgba(241,196,15,0.4)] mx-1 inline-block transform -rotate-2 hover:rotate-0 transition-transform cursor-pointer tracking-wider">{thisMonthResolved}</span> Riscos potenciais em nossa empresa.
              </p>
              
              <div className="w-40 h-[2px] bg-gradient-to-r from-transparent via-white/30 to-transparent my-1"></div>
              
              <p className="text-sm md:text-base font-medium leading-relaxed text-[#e2f5e9] drop-shadow px-2 flex items-center flex-wrap justify-center gap-2">
                Já são <span className="text-white text-lg md:text-xl font-black bg-black/20 border border-black/10 px-3 py-1 rounded-xl shadow-sm inline-block">{totalCompleted}</span> ao longo de {selectedYear}.
              </p>

              <p className="text-sm md:text-base font-medium leading-relaxed text-[#e2f5e9] drop-shadow px-2 flex items-center flex-wrap justify-center gap-2">
                Estamos desenvolvendo <span className="text-white text-lg md:text-xl font-black bg-black/20 border border-black/10 px-3 py-1 rounded-xl shadow-sm inline-block">{projectCount}</span> Projeto(s) Preventivo(s) a fim de melhorar nosso nivel de segurança.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

