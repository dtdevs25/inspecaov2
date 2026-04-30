import { collection, addDoc, serverTimestamp } from '../lib/dbBridge';
const db = {} as any;

export type LogAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'ACCESS';

export interface SystemLog {
  id?: string;
  userId: string;
  userEmail: string;
  userName: string;
  action: LogAction;
  resource: string;
  details: string;
  timestamp: any;
}

export const logAction = async (
  userId: string,
  userEmail: string,
  userName: string,
  action: LogAction,
  resource: string,
  details: string
) => {
  try {
    await addDoc(collection(db, 'system_logs'), {
      userId,
      userEmail,
      userName,
      action,
      resource,
      details,
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error('Error logging action:', error);
  }
};

