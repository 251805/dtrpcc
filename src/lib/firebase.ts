import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  getDocFromServer, 
  collection, 
  getDocs, 
  setDoc, 
  addDoc, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  deleteDoc,
  Timestamp,
  type FirestoreError
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { SEED_EMPLOYEES } from './seedEmployees';
import { Employee, Attendance, AttendanceSession } from '../types';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

// Initialize Firebase App
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Strict validation error throwing function per Section 3 of SKILL.md
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate connection to Firestore on boot
export async function testConnection(): Promise<boolean> {
  const pathVal = 'employees/connection_test';
  try {
    await getDocFromServer(doc(db, 'employees', 'connection_test'));
    console.log("Firebase Connection verified successfully.");
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('offline')) {
      console.warn("Client offline when trying to reach Firebase. Proceeding with local fallbacks if needed.");
    } else {
      console.error("Firebase connection test failed:", error);
    }
    return false;
  }
}

// Seed employees into Firestore if the collection is empty
export async function seedEmployeesIfEmpty(force = false) {
  const pathVal = 'employees';
  try {
    const qSnapshot = await getDocs(collection(db, pathVal));
    if (qSnapshot.empty || force) {
      console.log(`Firestore 'employees' collection is ${qSnapshot.empty ? 'empty' : 'not empty (forcing sync)'}. Seeding standard employees list...`);
      for (const emp of SEED_EMPLOYEES) {
        await setDoc(doc(db, 'employees', emp.eid), emp, { merge: true });
      }
      console.log("Employee seeding to Firestore completed.");
    }
  } catch (err) {
    // Graceful seed error logging
    console.warn("Failed to check/seed employees in Firestore:", err);
  }
}

// Fetch employees from Firestore, or fall back to SEED_EMPLOYEES / localStorage if offline or fails
export async function getEmployees(): Promise<Employee[]> {
  const pathVal = 'employees';
  try {
    const qSnapshot = await getDocs(collection(db, pathVal));
    if (qSnapshot.empty) {
      return SEED_EMPLOYEES;
    }
    const employees: Employee[] = [];
    qSnapshot.forEach((docSnap) => {
      employees.push(docSnap.data() as Employee);
    });
    return employees;
  } catch (error) {
    console.warn("Firestore getEmployees error. Returning SEED_EMPLOYEES fallback:", error);
    return SEED_EMPLOYEES;
  }
}

// Update or create an employee
export async function saveEmployee(emp: Employee): Promise<void> {
  const pathVal = `employees/${emp.eid}`;
  try {
    await setDoc(doc(db, 'employees', emp.eid), emp);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, pathVal);
  }
}

// Delete an employee from Firestore
export async function deleteEmployee(eid: string): Promise<void> {
  const pathVal = `employees/${eid}`;
  try {
    await deleteDoc(doc(db, 'employees', eid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, pathVal);
  }
}

// Get raw attendance log events
export async function getAttendanceLogs(): Promise<any[]> {
  const pathVal = 'attendance';
  try {
    const q = query(collection(db, pathVal), orderBy('timestamp', 'desc'), limit(150));
    const qSnapshot = await getDocs(q);
    const logs: any[] = [];
    qSnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      logs.push({
        id: docSnap.id,
        ...data,
        timestamp: data.timestamp instanceof Timestamp ? data.timestamp.toDate() : new Date(data.timestamp),
      });
    });
    return logs;
  } catch (error) {
    console.warn("Firestore getAttendanceLogs failed:", error);
    return [];
  }
}

// Fetch completed and open shift sessions
export async function getAttendanceSessions(): Promise<any[]> {
  const pathVal = 'attendance_sessions';
  try {
    const q = query(collection(db, pathVal), orderBy('login_at', 'desc'), limit(150));
    const qSnapshot = await getDocs(q);
    const sessions: any[] = [];
    qSnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      sessions.push({
        id: docSnap.id,
        ...data,
        login_at: data.login_at instanceof Timestamp ? data.login_at.toDate() : new Date(data.login_at),
        logout_at: data.logout_at ? (data.logout_at instanceof Timestamp ? data.logout_at.toDate() : new Date(data.logout_at)) : null,
      });
    });
    return sessions;
  } catch (error) {
    console.warn("Firestore getAttendanceSessions failed:", error);
    return [];
  }
}
