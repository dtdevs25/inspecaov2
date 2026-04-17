import React, { createContext, useContext, useState, useEffect } from 'react';
import { getAuthHeaders, API_URL } from '../lib/dbBridge';

interface UserProfile {
  id?: string;
  uid: string;
  email: string;
  displayName: string;
  role: 'Master' | 'Administrador' | 'Gestor' | 'Usuário Comum';
  companies?: string[];
  units?: string[];
  sectorNames?: string[];
  unitNames?: string[];
  sectors?: string[];
  locations?: string[];
  photoURL?: string;
  blocked?: boolean;
  blockedReason?: string;
}

interface UserContextType {
  user: any | null;
  profile: UserProfile | null;
  loading: boolean;
  isDemo: boolean;
  setIsDemo: (val: boolean) => void;
  setDemoUser: (user: any) => void;
  logout: () => void;
}

const UserContext = createContext<UserContextType>({
  user: null,
  profile: null,
  loading: true,
  isDemo: false,
  setIsDemo: () => {},
  setDemoUser: () => {},
  logout: () => {},
});

export const useUser = () => useContext(UserContext);

export const UserProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);

  const setDemoUser = (mockUser: any) => {
    setProfile({ role: 'Master', ...mockUser });
    setIsDemo(true);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setProfile(null);
  };

  useEffect(() => {
    if (isDemo) return;
    
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    
    if (token && userStr) {
      try {
        const u = JSON.parse(userStr);
        setUser(u);
        
        // Fetch real-time profile data ideally from our JWT or periodic check
        // For simplicity, we just set the profile with what we have
        setProfile({
          id: u.id,
          uid: u.uid || u.id,
          email: u.email,
          displayName: u.displayName || u.email.split('@')[0],
          role: u.role,
          photoURL: u.photoURL,
          companies: u.companies || [],
          units: u.units || [],
          unitNames: u.unitNames || [],
          sectors: u.sectors || [],
          sectorNames: u.sectorNames || [],
          locations: u.locations || [],
        } as UserProfile);
        
        // Fetch up to date profile from Postgres
        fetch(`${API_URL}/api/data/users/${u.id}`, { headers: getAuthHeaders() })
          .then(res => res.json())
          .then(data => {
            if (data && !data.error) {
               setProfile(prev => ({...prev, ...data}));
            }
          })
          .catch(console.error);

      } catch(e) {
        logout();
      }
    } else {
      setUser(null);
      setProfile(null);
    }
    setLoading(false);
  }, [isDemo]);

  useEffect(() => {
    if (!profile || isDemo) return;

    let timeoutId: any;

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        logout();
      }, 10 * 60 * 1000); // 10 minutes
    };

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(event => window.addEventListener(event, resetTimer));

    resetTimer();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      events.forEach(event => window.removeEventListener(event, resetTimer));
    };
  }, [profile, isDemo]);

  return (
    <UserContext.Provider value={{ user, profile, loading, isDemo, setIsDemo, setDemoUser, logout }}>
      {children}
    </UserContext.Provider>
  );
};

