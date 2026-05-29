export interface Employee {
  eid: string;
  name: string;
  rate_per_day: number;
  philhealth: number;
  role?: string;
}

export type ActionType = 'LOGIN' | 'LOGOUT';

export interface Attendance {
  employee_id: string;
  action: ActionType;
  source: 'SCAN' | 'MANUAL';
  timestamp: Date;
}

export interface AttendanceSession {
  employee_id: string;
  login_at: Date;
  logout_at: Date | null;
  date: string;
}
