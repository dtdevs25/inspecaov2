export const API_URL = (import.meta as any).env.VITE_API_URL || '';

export const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
};

export const collection = (db: any, path: string) => path;

export const doc = (db: any, path: string, id?: string) => ({ path, id: id || Math.random().toString(36).substring(2) });

export const getDocs = async (collPath: string) => {
    const ts = Date.now();
    const res = await fetch(`${API_URL}/api/data/${collPath}?_t=${ts}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch ' + collPath);
    const data = await res.json();
    return { docs: data.map((d: any) => {
        // polyfill firestore timestamp toDate()
        if (d.createdAt) {
            const createdStr = d.createdAt;
            d.createdAt = { toDate: () => new Date(createdStr) };
        }
        if (d.approvedAt) {
            const approvedStr = d.approvedAt;
            d.approvedAt = { toDate: () => new Date(approvedStr) };
        }
        return { id: String(d.id), data: () => d };
    }) };
};

export const getDocFromServer = async (docRef: any) => {
    const ts = Date.now();
    const res = await fetch(`${API_URL}/api/data/${docRef.path}/${docRef.id}?_t=${ts}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch doc ' + docRef.id);
    const data = await res.json();
    return { id: docRef.id, data: () => data, exists: () => !!data };
};

export const addDoc = async (collPath: string, data: any) => {
    const res = await fetch(`${API_URL}/api/data/${collPath}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to create in ' + collPath);
    const result = await res.json();
    return { id: result.id };
};

export const updateDoc = async (docRef: { path: string, id: string }, data: any) => {
    const res = await fetch(`${API_URL}/api/data/${docRef.path}/${docRef.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to update ' + docRef.id);
    return res.json();
};

export const deleteDoc = async (docRef: { path: string, id: string }) => {
    const res = await fetch(`${API_URL}/api/data/${docRef.path}/${docRef.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to delete ' + docRef.id);
    return res.json();
};

export const query = (collPath: string, ...args: any[]) => collPath;
export const where = (field: string, op: string, val: any) => ({field, op, val});
export const orderBy = (field: string, dir: string) => ({field, dir});
export const limit = (num: number) => ({limit: num});
export const serverTimestamp = () => new Date().toISOString();

export const onSnapshot = (collPath: string, callback: (snapshot: any) => void) => {
    let unmounted = false;
    
    // Polyfill using periodic polling every 5 seconds
    const fetchAndCall = () => {
        getDocs(collPath).then(snapshot => {
            if(!unmounted) callback(snapshot);
        }).catch(err => console.error('onSnapshot polyfill error for', collPath, err));
    };

    fetchAndCall(); // initial
    const interval = setInterval(fetchAndCall, 5000);

    return () => {
        unmounted = true;
        clearInterval(interval);
    };
};

