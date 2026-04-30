import React, { useState, useEffect } from 'react';

import { collection, query, orderBy, onSnapshot } from '../lib/dbBridge';
import { 
  LayoutDashboard, 
  ClipboardList, 
  ListTodo, 
  Briefcase, 
  BarChart3, 
  ThumbsUp, 
  Database,
  Settings, 
  LogOut, 
  User as UserIcon,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Bell,
  Search,
  Plus,
  Building2,
  Users,
  ChevronDown,
  Tags
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useUser } from '../contexts/UserContext';
import logoUrl from '../../logos/logocompleto.png';

const db = {} as any;

interface SidebarItemProps {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  collapsed?: boolean;
  onClick?: () => void;
  hasSubItems?: boolean;
  isExpanded?: boolean;
  isSubItem?: boolean;
  key?: string;
}

const SidebarItem = ({ 
  icon: Icon, 
  label, 
  active, 
  collapsed, 
  onClick, 
  hasSubItems, 
  isExpanded,
  isSubItem 
}: SidebarItemProps) => (
  <button
    onClick={onClick}
    title={collapsed ? label : undefined}
    className={cn(
      "flex items-center w-full p-3 rounded-xl transition-all duration-200 group relative",
      collapsed ? "justify-center" : "gap-3",
      active 
        ? "bg-black/20 text-white font-bold shadow-inner" 
        : "text-white/80 hover:bg-black/10 hover:text-white",
      isSubItem && "pl-11 py-2.5 text-xs"
    )}
  >
    <div className={cn(
      "absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-full transition-all duration-300",
      active ? "h-3/4 bg-white" : "h-0 bg-transparent"
    )} />
    <Icon className={cn(
      isSubItem ? "h-4 w-4" : "h-5 w-5", 
      "shrink-0 transition-colors", 
      active ? "text-white" : "text-white/60 group-hover:text-white"
    )} />
    {!collapsed && <span className="text-sm tracking-wide flex-1 text-left truncate">{label}</span>}
    {hasSubItems && !collapsed && (
      <ChevronDown className={cn(
        "h-4 w-4 transition-transform duration-300",
        isExpanded ? "rotate-180 text-white" : "text-white/60 group-hover:text-white"
      )} />
    )}
  </button>
);

export default function Layout({ 
  children, 
  onLogout, 
  activeTab, 
  setActiveTab,
  setPrefilledData
}: { 
  children: React.ReactNode, 
  onLogout?: () => void,
  activeTab: string,
  setActiveTab: (tab: string) => void,
  setPrefilledData?: (data: any) => void
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);
  const { user, profile, logout } = useUser();
  const [overdueInspections, setOverdueInspections] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  const [dismissedIds, setDismissedIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('dismissedNotifications');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('dismissedNotifications', JSON.stringify(dismissedIds));
  }, [dismissedIds]);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'inspections'), orderBy('createdAt', 'desc')), (snapshot) => {
      let docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      
      if (profile && profile.role !== 'Master') {
        docs = docs.filter((i: any) => profile.companies?.includes(i.companyId));
      }
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dayAfterTomorrow = new Date(today);
      dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

      const todayStr = today.toISOString().split('T')[0];
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      const relevant = docs.filter((i: any) => 
        i.status === 'Pendente' && 
        i.deadline && 
        i.deadline <= tomorrowStr  // vencidos + vencem hoje + vencem amanhã
      );
      setOverdueInspections(relevant);
    });
    return () => unsub();
  }, [profile]);

  const toggleMenu = (label: string) => {
    setExpandedMenus(prev => 
      prev.includes(label) 
        ? prev.filter(l => l !== label) 
        : [...prev, label]
    );
  };

  const handleLogout = () => {
    logout();
    if (onLogout) onLogout();
  };

  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard',     roles: ['Master', 'Administrador', 'Gestor', 'Usuário Comum'] },
    { icon: ClipboardList,   label: 'Inspeções',    roles: ['Master', 'Administrador', 'Gestor', 'Usuário Comum'] },
    { icon: ListTodo,        label: 'Planos de Ação', roles: ['Master', 'Administrador', 'Gestor', 'Usuário Comum'] },
    { icon: Briefcase,       label: 'Projetos',       roles: ['Master', 'Administrador', 'Gestor', 'Usuário Comum'] },
    { icon: BarChart3,       label: 'Relatórios',     roles: ['Master', 'Administrador', 'Gestor', 'Usuário Comum'] },
    { icon: ThumbsUp,        label: 'Aprovações',    roles: ['Master', 'Administrador'] },
    { 
      icon: Database, 
      label: 'Cadastros', 
      roles: ['Master', 'Administrador'],
      subItems: [
        { icon: Building2, label: 'Empresas' },
        { icon: Users,     label: 'Usuários' },
        { icon: Tags,      label: 'Tipos de Apontamento' },
      ]
    },
    { icon: Settings, label: 'Configurações', roles: ['Master'] },
  ];

  const filteredMenuItems = menuItems.filter(item => 
    !item.roles || item.roles.includes(profile?.role || 'Usuário Comum')
  );

  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <div className="flex flex-col h-full">
      {/* Navigation Items */}
      <nav className="flex-1 px-4 py-8 space-y-1 overflow-y-auto scrollbar-hide">
        {filteredMenuItems.map((item) => {
          const hasSubItems = 'subItems' in item && item.subItems && item.subItems.length > 0;
          const isExpanded = expandedMenus.includes(item.label);
          const isAnySubItemActive = hasSubItems && item.subItems?.some(sub => sub.label === activeTab);
          
          return (
            <React.Fragment key={item.label}>
              <SidebarItem
                icon={item.icon}
                label={item.label}
                active={activeTab === item.label || isAnySubItemActive}
                collapsed={collapsed && !isMobile}
                hasSubItems={hasSubItems}
                isExpanded={isExpanded}
                onClick={() => {
                  if (hasSubItems) {
                    toggleMenu(item.label);
                    if (!isExpanded && item.subItems?.[0]) {
                      setActiveTab(item.subItems[0].label);
                    }
                  } else {
                    setActiveTab(item.label);
                    if (isMobile) setMobileOpen(false);
                  }
                }}
              />
              {hasSubItems && isExpanded && !collapsed && (
                <div className="space-y-1 mt-1 animate-in slide-in-from-top-2 duration-300">
                  {(item as any).subItems
                    .filter((sub: any) => !sub.roles || sub.roles.includes(profile?.role || 'Usuário Comum'))
                    .map((subItem: any) => (
                    <SidebarItem
                      key={subItem.label}
                      icon={subItem.icon}
                      label={subItem.label}
                      active={activeTab === subItem.label}
                      collapsed={collapsed && !isMobile}
                      isSubItem
                      onClick={() => {
                        setActiveTab(subItem.label);
                        if (isMobile) setMobileOpen(false);
                      }}
                    />
                  ))}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </nav>

      {/* User Profile at the Bottom */}
      <div className="mt-auto p-3">
        <div className={cn(
          "flex items-center gap-3 p-2 transition-all duration-300",
          collapsed && !isMobile && "flex-col text-center"
        )}>
          <div className="relative shrink-0">
            <div className="w-8 h-8 rounded-full overflow-hidden bg-white/10 flex items-center justify-center">
              {user?.photoURL ? (
                <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <UserIcon className="h-4 w-4 text-white/60" />
              )}
            </div>
            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 border-2 border-[#27AE60] rounded-full"></div>
          </div>
          
          {(!collapsed || isMobile) && (
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium text-xs truncate">
                {profile?.displayName || user?.displayName || user?.email?.split('@')[0] || 'Usuário'}
              </p>
              <p className="text-white/60 text-[9px] uppercase tracking-wider mt-0.5">
                {profile?.role || (user?.email === 'Dani.dk.santos@gmail.com' ? 'Master' : 'Usuário Comum')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans">
      {/* FIXED TOP HEADER - "De fora a fora" */}
      <header className="fixed top-0 left-0 right-0 h-20 bg-white border-b border-gray-100 z-30 px-4 md:px-8 flex items-center justify-between shadow-sm">
        {/* Left: Logo */}
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-2 text-gray-500 hover:bg-gray-50 rounded-xl transition-colors"
          >
            <Menu className="h-6 w-6" />
          </button>
          
          <div className="flex items-center gap-3 pl-2">
            <img src={logoUrl} alt="EHS PRO Logo" className="h-10 md:h-12 w-auto object-contain transition-transform hover:scale-105 cursor-pointer" />
          </div>
        </div>

        {/* Right: Notifications & Logout */}
        <div className="flex items-center gap-2 md:gap-4">
          <div className="relative">
            <button 
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2.5 text-gray-400 hover:text-[#27AE60] hover:bg-green-50 rounded-xl transition-all duration-300"
            >
              <Bell className="h-6 w-6" />
              {overdueInspections.filter(i => !dismissedIds.includes(i.id)).length > 0 && (
                <span className="absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm ring-2 ring-white animate-bounce">
                  {overdueInspections.filter(i => !dismissedIds.includes(i.id)).length > 99 ? '99+' : overdueInspections.filter(i => !dismissedIds.includes(i.id)).length}
                </span>
              )}
            </button>

            {showNotifications && (
              <>
                {/* Overlay to close on outside click */}
                <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
                <div className="
                  fixed z-50 animate-in fade-in duration-200
                  top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-3rem)] max-w-[360px]
                  md:absolute md:top-auto md:left-auto md:translate-x-0 md:translate-y-0 md:right-0 md:mt-2 md:w-80 md:max-w-[320px]
                  bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden
                ">
                  <div className="px-4 py-3 bg-red-50 border-b border-red-100 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-red-800">Alertas de Prazo</h3>
                    <span className="text-xs font-medium bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                      {overdueInspections.filter(i => !dismissedIds.includes(i.id)).length}
                    </span>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {overdueInspections.filter(i => !dismissedIds.includes(i.id)).length === 0 ? (
                      <div className="p-6 text-center text-gray-400 text-sm">
                        Nenhum alerta de prazo no momento.
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-50">
                        {overdueInspections
                          .filter(i => !dismissedIds.includes(i.id))
                          .map(insp => {
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            const todayStr = today.toISOString().split('T')[0];
                            const tomorrow = new Date(today);
                            tomorrow.setDate(tomorrow.getDate() + 1);
                            const tomorrowStr = tomorrow.toISOString().split('T')[0];

                            const isOverdue = insp.deadline < todayStr;
                            const isToday = insp.deadline === todayStr;
                            const isTomorrow = insp.deadline === tomorrowStr;

                            const [year, month, day] = insp.deadline.split('-');
                            const formattedDate = `${day}/${month}/${year}`;

                            let badgeClass = 'bg-red-50 text-red-600';
                            let badgeLabel = formattedDate;
                            if (isOverdue) badgeClass = 'bg-red-100 text-red-700';
                            else if (isToday) { badgeClass = 'bg-orange-100 text-orange-700'; badgeLabel = `Hoje • ${formattedDate}`; }
                            else if (isTomorrow) { badgeClass = 'bg-yellow-100 text-yellow-700'; badgeLabel = `Amanhã • ${formattedDate}`; }

                            return (
                              <div 
                                key={insp.id} 
                                className="p-4 hover:bg-gray-50 transition-colors cursor-pointer" 
                                onClick={() => { 
                                  setShowNotifications(false);
                                  setDismissedIds(prev => [...prev, insp.id]);
                                  if (setPrefilledData) setPrefilledData({ filterInspectionId: insp.id });
                                  setActiveTab('Inspeções');
                                }}
                              >
                                <div className="flex justify-between items-start gap-2 mb-1">
                                  <h4 className="text-sm font-semibold text-gray-800 line-clamp-1">{insp.description || insp.type}</h4>
                                  <span className={`text-[10px] font-bold whitespace-nowrap px-1.5 py-0.5 rounded ${badgeClass}`}>{badgeLabel}</span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                  <Building2 className="h-3 w-3" />
                                  <span className="truncate">{insp.companyName || 'Empresa'}</span>
                                </div>
                              </div>
                            );
                          })
                        }
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
          
          <div className="h-8 w-[1px] bg-gray-100 mx-1"></div>

          <button 
            onClick={handleLogout}
            title="Sair do Sistema"
            className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all duration-300 group"
          >
            <LogOut className="h-6 w-6 group-hover:scale-110 transition-transform" />
          </button>
        </div>
      </header>

      <div className="flex pt-20 h-screen overflow-hidden">
        {/* Mobile Sidebar Overlay */}
        {mobileOpen && (
          <div 
            className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm animate-in fade-in duration-300"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Mobile Sidebar */}
        <aside 
          className={cn(
            "bg-[#27AE60] fixed inset-y-0 left-0 z-50 w-72 shadow-2xl transition-transform duration-500 ease-in-out lg:hidden flex flex-col",
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="p-4 flex justify-end lg:hidden">
            <button 
              onClick={() => setMobileOpen(false)}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
          <SidebarContent isMobile />
        </aside>

        {/* Desktop Sidebar */}
        <aside 
          className={cn(
            "bg-[#27AE60] transition-all duration-500 ease-in-out hidden lg:flex flex-col relative z-40 shadow-xl",
            collapsed ? "w-20" : "w-72"
          )}
        >
          <div className="absolute -right-3 top-10 z-50">
            <button 
              onClick={() => setCollapsed(!collapsed)}
              className="w-6 h-6 rounded-full bg-white border border-gray-100 flex items-center justify-center text-[#27AE60] shadow-md hover:scale-110 transition-transform"
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </div>
          <SidebarContent />
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto bg-[#F8FAFC] scrollbar-hide">
          <div className="p-4 md:p-8 max-w-[1600px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
