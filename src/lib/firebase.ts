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

// Validated backend wrappers for attendance sessions per User Request
export async function createAttendanceSession(sessionData: {
  employee_id: string;
  login_at: Date;
  logout_at: Date | null;
  date: string;
  remarks?: string;
}): Promise<string> {
  if (!sessionData.employee_id || typeof sessionData.employee_id !== 'string') {
    throw new Error('Validation failed: employee_id is required and must be a string.');
  }
  if (!(sessionData.login_at instanceof Date) || isNaN(sessionData.login_at.getTime())) {
    throw new Error('Validation failed: login_at must be a valid Date.');
  }
  if (!sessionData.date || typeof sessionData.date !== 'string') {
    throw new Error('Validation failed: date is required and must be a string.');
  }
  if (sessionData.logout_at !== null) {
    if (!(sessionData.logout_at instanceof Date) || isNaN(sessionData.logout_at.getTime())) {
      throw new Error('Validation failed: logout_at must be a valid Date or null.');
    }
    if (sessionData.logout_at < sessionData.login_at) {
      throw new Error('Validation failed: logout_at cannot be earlier than login_at.');
    }
  }

  const pathVal = 'attendance_sessions';
  try {
    const docRef = await addDoc(collection(db, pathVal), {
      employee_id: sessionData.employee_id,
      login_at: Timestamp.fromDate(sessionData.login_at),
      logout_at: sessionData.logout_at ? Timestamp.fromDate(sessionData.logout_at) : null,
      date: sessionData.date,
      remarks: sessionData.remarks || '',
    });
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, pathVal);
  }
}

export async function updateAttendanceSession(
  sessionId: string,
  updateData: {
    employee_id?: string;
    login_at?: Date;
    logout_at?: Date | null;
    date?: string;
    remarks?: string;
  }
): Promise<void> {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('Validation failed: sessionId is required and must be a string.');
  }

  const cleanUpdate: Record<string, any> = {};

  if (updateData.employee_id !== undefined) {
    if (!updateData.employee_id || typeof updateData.employee_id !== 'string') {
      throw new Error('Validation failed: employee_id must be a non-empty string.');
    }
    cleanUpdate.employee_id = updateData.employee_id;
  }

  if (updateData.login_at !== undefined) {
    if (!(updateData.login_at instanceof Date) || isNaN(updateData.login_at.getTime())) {
      throw new Error('Validation failed: login_at must be a valid Date.');
    }
    cleanUpdate.login_at = Timestamp.fromDate(updateData.login_at);
  }

  if (updateData.logout_at !== undefined) {
    if (updateData.logout_at !== null) {
      if (!(updateData.logout_at instanceof Date) || isNaN(updateData.logout_at.getTime())) {
        throw new Error('Validation failed: logout_at must be a valid Date or null.');
      }
      cleanUpdate.logout_at = Timestamp.fromDate(updateData.logout_at);
    } else {
      cleanUpdate.logout_at = null;
    }
  }

  if (updateData.date !== undefined) {
    if (!updateData.date || typeof updateData.date !== 'string') {
      throw new Error('Validation failed: date must be a non-empty string.');
    }
    cleanUpdate.date = updateData.date;
  }

  if (updateData.remarks !== undefined) {
    cleanUpdate.remarks = updateData.remarks || '';
  }

  if (updateData.login_at && updateData.logout_at) {
    if (updateData.logout_at < updateData.login_at) {
      throw new Error('Validation failed: logout_at cannot be earlier than login_at.');
    }
  }

  const pathVal = `attendance_sessions/${sessionId}`;
  try {
    await updateDoc(doc(db, 'attendance_sessions', sessionId), cleanUpdate);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, pathVal);
  }
}

export async function deleteAttendanceSession(sessionId: string): Promise<void> {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('Validation failed: sessionId is required and must be a string.');
  }

  const pathVal = `attendance_sessions/${sessionId}`;
  try {
    await deleteDoc(doc(db, 'attendance_sessions', sessionId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, pathVal);
  }
}

export async function updateAttendanceLog(
  logId: string,
  updateData: {
    employee_id?: string;
    action?: 'LOGIN' | 'LOGOUT' | 'SAVE';
    source?: 'SCAN' | 'MANUAL';
    timestamp?: Date;
    remarks?: string;
  }
): Promise<void> {
  if (!logId || typeof logId !== 'string') {
    throw new Error('Validation failed: logId is required and must be a string.');
  }

  const cleanUpdate: Record<string, any> = {};

  if (updateData.employee_id !== undefined) {
    if (!updateData.employee_id || typeof updateData.employee_id !== 'string') {
      throw new Error('Validation failed: employee_id must be a non-empty string.');
    }
    cleanUpdate.employee_id = updateData.employee_id;
  }

  if (updateData.action !== undefined) {
    if (updateData.action !== 'LOGIN' && updateData.action !== 'LOGOUT' && updateData.action !== 'SAVE') {
      throw new Error('Validation failed: action must be LOGIN, LOGOUT or SAVE.');
    }
    cleanUpdate.action = updateData.action;
  }

  if (updateData.source !== undefined) {
    if (updateData.source !== 'SCAN' && updateData.source !== 'MANUAL') {
      throw new Error('Validation failed: source must be SCAN or MANUAL.');
    }
    cleanUpdate.source = updateData.source;
  }

  if (updateData.timestamp !== undefined) {
    if (!(updateData.timestamp instanceof Date) || isNaN(updateData.timestamp.getTime())) {
      throw new Error('Validation failed: timestamp must be a valid Date.');
    }
    cleanUpdate.timestamp = Timestamp.fromDate(updateData.timestamp);
  }

  if (updateData.remarks !== undefined) {
    cleanUpdate.remarks = updateData.remarks || '';
  }

  const pathVal = `attendance/${logId}`;
  try {
    await updateDoc(doc(db, 'attendance', logId), cleanUpdate);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, pathVal);
  }
}

export async function deleteAttendanceLog(logId: string): Promise<void> {
  if (!logId || typeof logId !== 'string') {
    throw new Error('Validation failed: logId is required and must be a string.');
  }

  const pathVal = `attendance/${logId}`;
  try {
    await deleteDoc(doc(db, 'attendance', logId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, pathVal);
  }
}
