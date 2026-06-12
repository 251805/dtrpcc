import React, { useState, useEffect } from 'react';
import { 
  getEmployees, 
  saveEmployee, 
  deleteEmployee, 
  getAttendanceLogs, 
  getAttendanceSessions, 
  seedEmployeesIfEmpty,
  createAttendanceSession,
  updateAttendanceSession,
  deleteAttendanceSession,
  db,
  updateAttendanceLog,
  deleteAttendanceLog
} from '../lib/firebase';
import { Employee } from '../types';
import { KeyRound, ShieldAlert, Plus, Trash2, Save, FileSpreadsheet, Lock, RefreshCw, LogIn, LogOut, Database, Edit, X } from 'lucide-react';

interface AdminModalProps {
  onClose: () => void;
  onRefreshEmployeesList: () => void;
}

export default function AdminModal({ onClose, onRefreshEmployeesList }: AdminModalProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'TEAMS' | 'ROOT' | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Roster lists
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loadedEmployees, setLoadedEmployees] = useState<Employee[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  
  // State for new employee form
  const [newEid, setNewEid] = useState('');
  const [newName, setNewName] = useState('');
  const [newRate, setNewRate] = useState(532);
  const [newRole, setNewRole] = useState('CCTV OPERATOR');
  const [newPhilhealth, setNewPhilhealth] = useState(15);

  // Active sub-tab
  const [activeTab, setActiveTab] = useState<'roster' | 'logs' | 'sessions'>('roster');

  // Override / Force Punch State variables
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [overrideAction, setOverrideAction] = useState<'LOGIN' | 'LOGOUT'>('LOGIN');
  const [overrideTime, setOverrideTime] = useState('');
  const [overrideRemarks, setOverrideRemarks] = useState('');
  const [isSubmittingOverride, setIsSubmittingOverride] = useState(false);

  // Time-Audit Log Editing states
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editLogEmployeeId, setEditLogEmployeeId] = useState('');
  const [editLogAction, setEditLogAction] = useState<'LOGIN' | 'LOGOUT' | 'SAVE'>('LOGIN');
  const [editLogSource, setEditLogSource] = useState<'SCAN' | 'MANUAL'>('SCAN');
  const [editLogTimestamp, setEditLogTimestamp] = useState('');
  const [editLogRemarks, setEditLogRemarks] = useState('');

  // Timezone helper for datetime-local
  const getLocalDatetimeString = (date: Date) => {
    const tzoffset = date.getTimezoneOffset() * 60000;
    return (new Date(date.getTime() - tzoffset)).toISOString().slice(0, 16);
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadAdminData();
      setOverrideTime(getLocalDatetimeString(new Date()));
    }
  }, [isAuthenticated]);

  const handleForcePunchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) {
      alert("Please select a valid employee from the auto-suggest suggestion list first.");
      return;
    }
    if (!overrideTime) {
      alert("Please select a precise date/time.");
      return;
    }
    if (!overrideRemarks.trim()) {
      alert("Mandatory remarks detailing the reason of the adjustment are required.");
      return;
    }

    setIsSubmittingOverride(true);
    try {
      const punchDate = new Date(overrideTime);
      const dateStr = punchDate.toISOString().split('T')[0];
      
      // Write raw log to attendance collection
      const { addDoc, collection } = await import('firebase/firestore');
      await addDoc(collection(db, 'attendance'), {
        employee_id: selectedEmployee.eid,
        action: overrideAction,
        source: 'MANUAL',
        timestamp: punchDate,
        remarks: `[FORCE OVERRIDE REMARKS] ${overrideRemarks.trim()}`
      });

      if (overrideAction === 'LOGIN') {
        // Force Clock In: create fresh active session
        await createAttendanceSession({
          employee_id: selectedEmployee.eid,
          login_at: punchDate,
          logout_at: null,
          date: dateStr,
          remarks: `[FORCE IN OVERRIDE] ${overrideRemarks.trim()}`
        });
        alert(`Force Clock IN success for ${selectedEmployee.name}`);
      } else {
        // Force Clock Out: locate most recent open session for employee
        const openSess = sessions.find(s => s.employee_id === selectedEmployee.eid && s.logout_at === null);
        if (openSess) {
          await updateAttendanceSession(openSess.id, {
            logout_at: punchDate,
            remarks: `[FORCE OUT OVERRIDE] ${overrideRemarks.trim()}`
          });
          alert(`Force Clock OUT success for ${selectedEmployee.name} (Updated open session)`);
        } else {
          const confirmFallback = window.confirm(`No active session found for ${selectedEmployee.name}. Create completed session?`);
          if (confirmFallback) {
            await createAttendanceSession({
              employee_id: selectedEmployee.eid,
              login_at: punchDate,
              logout_at: punchDate,
              date: dateStr,
              remarks: `[FORCE OUT OVERRIDE FALLBACK] ${overrideRemarks.trim()}`
            });
            alert(`Completed shift session created for ${selectedEmployee.name}`);
          } else {
            setIsSubmittingOverride(false);
            return;
          }
        }
      }

      setSearchQuery('');
      setSelectedEmployee(null);
      setOverrideRemarks('');
      setOverrideTime(getLocalDatetimeString(new Date()));
      await loadAdminData();
      onRefreshEmployeesList();
    } catch (err) {
      console.error("Force punch submission failed:", err);
      alert(`Force override failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSubmittingOverride(false);
    }
  };

  const handleOnTheFlyLogout = async (sess: any) => {
    const emp = employees.find(e => e.eid === sess.employee_id);
    const empName = emp ? emp.name : `EID: ${sess.employee_id}`;
    
    const confirmForce = window.confirm(`Force Clock Out active record for ${empName} immediately?`);
    if (!confirmForce) return;

    const remarks = window.prompt("Mandatory remarks detailing the reason of the adjustment:", "Admin Override Force Logout on physical grid view");
    if (remarks === null) return;
    if (!remarks.trim()) {
      alert("Mandatory remarks are required to perform this override action.");
      return;
    }

    try {
      const now = new Date();
      // Write check-out event to raw attendance logs
      const { addDoc, collection } = await import('firebase/firestore');
      await addDoc(collection(db, 'attendance'), {
        employee_id: sess.employee_id,
        action: 'LOGOUT',
        source: 'MANUAL',
        timestamp: now,
        remarks: remarks.trim()
      });

      // Safely perform transaction update via validated wrapper
      await updateAttendanceSession(sess.id, {
        logout_at: now,
        remarks: `[ON-THE-FLY OVERRIDE] ${remarks.trim()}`
      });

      alert(`Successfully clocked out ${empName}`);
      await loadAdminData();
      onRefreshEmployeesList();
    } catch (err) {
      console.error("On-the-fly force logout failed:", err);
      alert(`On-the-fly force out failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDeleteSession = async (sessId: string) => {
    const confirmDel = window.confirm("Are you absolutely sure you want to permanently delete this shift session? This action cannot be undone.");
    if (!confirmDel) return;

    try {
      await deleteAttendanceSession(sessId);
      alert("Session permanently deleted.");
      await loadAdminData();
      onRefreshEmployeesList();
    } catch (err) {
      console.error("Delete session error:", err);
      alert(`Failed to delete session: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleStartEditLog = (log: any) => {
    setEditingLogId(log.id);
    setEditLogEmployeeId(log.employee_id);
    setEditLogAction(log.action);
    setEditLogSource(log.source || 'SCAN');
    setEditLogRemarks(log.remarks || '');
    if (log.timestamp instanceof Date) {
      setEditLogTimestamp(getLocalDatetimeString(log.timestamp));
    } else {
      setEditLogTimestamp(getLocalDatetimeString(new Date(log.timestamp)));
    }
  };

  const handleCancelEditLog = () => {
    setEditingLogId(null);
  };

  const handleUpdateLogSubmit = async (logId: string) => {
    if (!editLogEmployeeId.trim()) {
      alert("Employee ID (EID) is required.");
      return;
    }
    if (!editLogTimestamp) {
      alert("Please select a valid date/time.");
      return;
    }

    try {
      await updateAttendanceLog(logId, {
        employee_id: editLogEmployeeId.trim(),
        action: editLogAction,
        source: editLogSource,
        timestamp: new Date(editLogTimestamp),
        remarks: editLogRemarks.trim()
      });

      // Create an audit trail log for the 'SAVE' action
      const { addDoc, collection } = await import('firebase/firestore');
      await addDoc(collection(db, 'attendance'), {
        employee_id: editLogEmployeeId.trim(),
        action: 'SAVE',
        source: 'MANUAL',
        timestamp: new Date(),
        remarks: `[EDITED LOG ID: ${logId.slice(0, 8)}] ${editLogRemarks.trim()}`
      });

      alert("Audit Log entry successfully updated.");
      setEditingLogId(null);
      await loadAdminData();
      onRefreshEmployeesList();
    } catch (err) {
      console.error("Update log error:", err);
      alert(`Failed to update log: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDeleteLogSubmit = async (logId: string) => {
    const confirmDel = window.confirm("Are you absolutely sure you want to permanently delete this audit log entry? This can result in session mismatch and cannot be undone.");
    if (!confirmDel) return;

    try {
      await deleteAttendanceLog(logId);
      alert("Audit Log entry permanently deleted.");
      await loadAdminData();
      onRefreshEmployeesList();
    } catch (err) {
      console.error("Delete log error:", err);
      alert(`Failed to delete log: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const loadAdminData = async () => {
    const list = await getEmployees();
    setEmployees(JSON.parse(JSON.stringify(list)));
    setLoadedEmployees(list);

    const logs = await getAttendanceLogs();
    setAttendanceLogs(logs);

    const sess = await getAttendanceSessions();
    setSessions(sess);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (username === 'admin' && password === '2026pcc2026') {
      setIsAuthenticated(true);
      setRole('TEAMS');
    } else if (username === 'lee' && password === 'metallica') {
      setIsAuthenticated(true);
      setRole('ROOT');
    } else {
      setErrorMsg('Invalid credentials. Access Denied.');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setRole(null);
    setUsername('');
    setPassword('');
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEid = newEid.trim();
    const cleanName = newName.trim().toUpperCase();

    if (!cleanEid || !cleanName) {
      alert("Employee ID and Name are required.");
      return;
    }

    if (employees.some(emp => emp.eid === cleanEid)) {
      alert("An employee with this Employee ID (EID) already exists!");
      return;
    }

    const item: Employee = {
      eid: cleanEid,
      name: cleanName,
      rate_per_day: Number(newRate),
      philhealth: Number(newPhilhealth),
      role: newRole.trim().toUpperCase()
    };

    await saveEmployee(item);
    setNewEid('');
    setNewName('');
    setNewRate(532);
    setNewRole('CCTV OPERATOR');
    setNewPhilhealth(15);
    await loadAdminData();
    onRefreshEmployeesList();
  };

  const handleUpdateEmployeeField = (eid: string, field: keyof Employee, value: any) => {
    setEmployees(prev => prev.map(emp => {
      if (emp.eid === eid) {
        return { ...emp, [field]: value };
      }
      return emp;
    }));
  };

  const handleUpdateEmployeeFieldByIndex = (index: number, field: keyof Employee, value: any) => {
    setEmployees(prev => prev.map((emp, i) => {
      if (i === index) {
        return { ...emp, [field]: value };
      }
      return emp;
    }));
  };

  const handleSaveEmployeeEdits = async (emp: Employee, index: number) => {
    const cleanEid = emp.eid.trim();
    const cleanName = emp.name.trim().toUpperCase();

    if (!cleanEid || !cleanName) {
      alert("Employee ID and Name cannot be empty.");
      return;
    }

    const originalEid = loadedEmployees[index]?.eid;

    // Check if the new EID is already used by another employee (different index)
    const isEidTaken = loadedEmployees.some((le, idx) => idx !== index && le.eid === cleanEid);
    if (isEidTaken) {
      alert(`Error: Employee ID "${cleanEid}" is already assigned to another employee.`);
      return;
    }

    try {
      if (originalEid && originalEid !== cleanEid) {
        const confirmChange = window.confirm(`You are changing the Employee ID from "${originalEid}" to "${cleanEid}". This will migrate their profile to the new ID. Proceed?`);
        if (!confirmChange) return;

        // Delete the old record
        await deleteEmployee(originalEid);
      }

      await saveEmployee({
        ...emp,
        eid: cleanEid,
        name: cleanName
      });

      alert(`Employee updated successfully!`);
      await loadAdminData();
      onRefreshEmployeesList();
    } catch (err) {
      alert("Failed to save employee changes.");
      console.error(err);
    }
  };

  const handleDeleteEmployeeItem = async (index: number) => {
    const originalEid = loadedEmployees[index]?.eid;
    const currentName = employees[index]?.name;
    if (!originalEid) return;

    const confirmDel = window.confirm(`Are you absolutely sure you want to delete ${currentName} (EID: ${originalEid})?`);
    if (!confirmDel) return;

    await deleteEmployee(originalEid);
    await loadAdminData();
    onRefreshEmployeesList();
  };

  // Re-seed trigger fallback
  const handleForceSync = async () => {
    if (role !== 'ROOT') {
      alert("Only ROOT administrators can forcefully seed or re-seed the reference database.");
      return;
    }
    const confirmSync = window.confirm("This will forcefully sync and update the reference employees list (with their roles and pay rates) to Firestore. Proceed?");
    if (confirmSync) {
      await seedEmployeesIfEmpty(true);
      await loadAdminData();
      onRefreshEmployeesList();
    }
  };

  if (!isAuthenticated) {
    return (
      <div id="admin-login-modal" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 text-neutral-900">
        <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-6">
          <div className="flex flex-col items-center text-center space-y-2">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-full">
              <Lock size={32} />
            </div>
            <h2 className="text-xl font-bold font-sans tracking-tight">Admin</h2>
            <p className="text-sm text-gray-500">Sign in to manage crew rosters and access secure DTR databases.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Username</label>
              <input 
                type="text" 
                value={username} 
                onChange={e => setUsername(e.target.value)}
                placeholder="e.g. admin"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-emerald-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Password</label>
              <input 
                type="password" 
                value={password} 
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-emerald-500"
                required
              />
            </div>

            {errorMsg && (
              <p className="text-xs text-red-600 font-medium text-center bg-red-50 py-2 rounded-lg">{errorMsg}</p>
            )}

            <div className="flex gap-3 pt-2">
              <button 
                type="button" 
                onClick={onClose} 
                className="flex-1 px-4 py-2 border border-gray-200 hover:bg-gray-100 text-sm font-semibold rounded-lg transition"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg shadow-sm transition flex gap-1 justify-center items-center"
              >
                <LogIn size={16} />
                Submit
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div id="admin-roster-modal" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sans text-neutral-900">
      <div className="bg-white rounded-2xl w-full max-w-6xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-neutral-900 text-white rounded-t-2xl">
          <div className="flex items-center gap-3">
            <KeyRound className="text-amber-400" />
            <div>
              <h2 className="text-xl font-bold tracking-tight">Administrative Control Dashboard</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded font-mono font-bold tracking-wider">
                  ROLE: {role}
                </span>
                <span className="text-xs text-neutral-400">• Pagbilao Terminal System</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleLogout} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded-lg transition text-sm font-semibold">
              <LogOut size={16} />
              Logout
            </button>
            <button onClick={onClose} className="px-3 py-1.5 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded-lg transition font-medium">
              Close
            </button>
          </div>
        </div>

        {/* Dashboard Menu bar */}
        <div className="flex border-b border-gray-200 bg-slate-50 px-6 justify-between items-center">
          <div className="flex gap-4">
            <button 
              onClick={() => setActiveTab('roster')}
              className={`py-4 border-b-2 font-semibold text-sm transition-all ${activeTab === 'roster' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              Employees Roster Spreadsheet
            </button>
            <button 
              onClick={() => setActiveTab('logs')}
              className={`py-4 border-b-2 font-semibold text-sm transition-all ${activeTab === 'logs' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              Time Audit Logs
            </button>
            <button 
              onClick={() => setActiveTab('sessions')}
              className={`py-4 border-b-2 font-semibold text-sm transition-all ${activeTab === 'sessions' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              Active Shift Sessions
            </button>
          </div>

          {role === 'ROOT' && (
            <div className="flex gap-2">
              <button 
                onClick={handleForceSync}
                className="flex items-center gap-1.5 px-3 py-1.5 outline outline-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-gray-600 rounded-lg transition"
              >
                <Database size={14} />
                Ref-Seed DB
              </button>
              <button 
                onClick={loadAdminData}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-xs font-semibold text-gray-600 rounded-lg transition"
              >
                <RefreshCw size={14} />
                Sync Data
              </button>
            </div>
          )}
        </div>

        {/* Interactive Workspace Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'roster' && (
            <div className="space-y-6">
              {/* Form to Create New Personnel */}
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3">
                <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                  <Plus size={16} className="text-emerald-500" />
                  Add New Active Personnel Records
                </h3>
                <form onSubmit={handleAddEmployee} className="grid grid-cols-1 sm:grid-cols-5 gap-4 items-end">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase">Employee ID (EID)</label>
                    <input 
                      type="text" 
                      value={newEid} 
                      onChange={e => setNewEid(e.target.value)}
                      placeholder="e.g. 251821" 
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase">Full Name</label>
                    <input 
                      type="text" 
                      value={newName} 
                      onChange={e => setNewName(e.target.value)}
                      placeholder="e.g. jarold lee" 
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase">Position / Role</label>
                    <input 
                      type="text" 
                      value={newRole} 
                      onChange={e => setNewRole(e.target.value)}
                      placeholder="e.g. CCTV OPERATOR" 
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase">Daily Rate (₱)</label>
                    <input 
                      type="number" 
                      value={newRate} 
                      onChange={e => setNewRate(Number(e.target.value))}
                      placeholder="647" 
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                      required
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase">PhilHealth (₱)</label>
                      <input 
                        type="number" 
                        step="0.01"
                        min="0"
                        value={newPhilhealth} 
                        onChange={e => setNewPhilhealth(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white font-mono"
                        placeholder="e.g. 15.00"
                        required
                      />
                    </div>
                    <button 
                      type="submit"
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg h-[43px] flex items-center justify-center gap-1 shadow-sm transition"
                    >
                      <Plus size={18} />
                      Insert
                    </button>
                  </div>
                </form>
              </div>

              {/* Roster Spreadsheet */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                <table className="w-full border-collapse text-left text-sm text-neutral-800">
                  <thead className="bg-slate-50 text-slate-500 uppercase text-[11px] font-bold tracking-wider border-b border-gray-100">
                    <tr>
                      <th className="px-6 py-3.5">EID Barcode</th>
                      <th className="px-6 py-3.5">Employee Name</th>
                      <th className="px-6 py-3.5">Position / Role</th>
                      <th className="px-6 py-3.5">Daily rate (₱)</th>
                      <th className="px-6 py-3.5">PhilHealth Contribution</th>
                      <th className="px-6 py-3.5 text-right w-36">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-sans">
                    {employees.map((emp, index) => (
                      <tr key={index} className="hover:bg-slate-50/50 transition">
                        <td className="px-6 py-3 font-mono font-bold text-gray-500">
                          <input 
                            type="text" 
                            value={emp.eid} 
                            onChange={(e) => handleUpdateEmployeeFieldByIndex(index, 'eid', e.target.value.trim().toUpperCase())}
                            className="w-24 px-2 py-1 border border-transparent hover:border-gray-200 focus:border-indigo-500 rounded bg-transparent focus:bg-white text-normal font-mono font-bold text-gray-700"
                            placeholder="EID"
                          />
                        </td>
                        <td className="px-6 py-3 font-semibold text-gray-900">
                          <input 
                            type="text" 
                            value={emp.name} 
                            onChange={(e) => handleUpdateEmployeeFieldByIndex(index, 'name', e.target.value.toUpperCase())}
                            className="w-full max-w-sm px-2 py-1 border border-transparent hover:border-gray-200 focus:border-indigo-500 rounded bg-transparent focus:bg-white text-normal"
                          />
                        </td>
                        <td className="px-6 py-3">
                          <input 
                            type="text" 
                            value={emp.role || ''} 
                            onChange={(e) => handleUpdateEmployeeFieldByIndex(index, 'role', e.target.value.toUpperCase())}
                            placeholder="CCTV OPERATOR"
                            className="w-full px-2 py-1 border border-transparent hover:border-gray-200 focus:border-indigo-500 rounded bg-transparent focus:bg-white text-normal font-sans text-xs"
                          />
                        </td>
                        <td className="px-6 py-3 font-mono">
                          <input 
                            type="number" 
                            value={emp.rate_per_day} 
                            onChange={(e) => handleUpdateEmployeeFieldByIndex(index, 'rate_per_day', Number(e.target.value))}
                            className="w-24 px-2 py-1 border border-transparent hover:border-gray-200 focus:border-indigo-500 rounded bg-transparent focus:bg-white text-normal"
                          />
                        </td>
                        <td className="px-6 py-3 font-mono">
                          <input 
                            type="number" 
                            step="0.01"
                            min="0"
                            value={emp.philhealth} 
                            onChange={(e) => handleUpdateEmployeeFieldByIndex(index, 'philhealth', Number(e.target.value))}
                            className="w-20 px-2 py-1 border border-transparent hover:border-gray-200 focus:border-indigo-500 rounded bg-transparent focus:bg-white text-normal font-mono"
                            placeholder="0.00"
                          />
                        </td>
                        <td className="px-6 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <button 
                              onClick={() => handleSaveEmployeeEdits(emp, index)}
                              className="p-1 px-2 hover:bg-indigo-50 text-indigo-600 rounded flex items-center gap-1 text-xs font-semibold transition"
                              title="Commit updates"
                            >
                              <Save size={14} />
                              Save
                            </button>
                            <button 
                              onClick={() => handleDeleteEmployeeItem(index)}
                              className="p-1 px-2 text-xs rounded flex items-center gap-1 transition hover:bg-red-50 text-red-600"
                              title="Permanently delete"
                            >
                              <Trash2 size={14} />
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-800">Raw Attendance Transactions (Audit logs)</h3>
              <div className="border border-slate-200 rounded-xl overflow-x-auto bg-white shadow-sm">
                <table className="w-full min-w-max border-collapse text-left text-sm text-neutral-800">
                  <thead className="bg-slate-50 text-slate-500 uppercase text-[11px] font-bold tracking-wider border-b border-gray-100">
                    <tr>
                      <th className="px-6 py-3.5">Log ID</th>
                      <th className="px-6 py-3.5">Employee ID (EID)</th>
                      <th className="px-6 py-3.5">Transaction Type</th>
                      <th className="px-6 py-3.5">Log Source</th>
                      <th className="px-6 py-3.5">Timestamp</th>
                      <th className="px-6 py-3.5">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {attendanceLogs.map((log) => {
                      const isEditing = editingLogId === log.id;
                      return (
                        <tr key={log.id} className="hover:bg-slate-50/50 transition font-sans">
                          {isEditing ? (
                            <>
                              <td className="px-6 py-3 font-mono text-gray-400 text-xs">
                                {log.id.slice(0, 8)}...
                              </td>
                              <td className="px-6 py-3">
                                <input
                                  type="text"
                                  value={editLogEmployeeId}
                                  onChange={e => setEditLogEmployeeId(e.target.value)}
                                  className="w-24 px-2 py-1 border border-slate-300 rounded font-mono font-bold text-xs"
                                  placeholder="EID"
                                />
                              </td>
                              <td className="px-6 py-3">
                                <select
                                  value={editLogAction}
                                  onChange={e => setEditLogAction(e.target.value as 'LOGIN' | 'LOGOUT')}
                                  className="px-2 py-1 border border-slate-300 rounded text-xs bg-white"
                                >
                                  <option value="LOGIN">LOGIN</option>
                                  <option value="LOGOUT">LOGOUT</option>
                                </select>
                              </td>
                              <td className="px-6 py-3">
                                <select
                                  value={editLogSource}
                                  onChange={e => setEditLogSource(e.target.value as 'SCAN' | 'MANUAL')}
                                  className="px-2 py-1 border border-slate-300 rounded text-xs bg-white"
                                >
                                  <option value="SCAN">SCAN</option>
                                  <option value="MANUAL">MANUAL</option>
                                </select>
                              </td>
                              <td className="px-6 py-3">
                                <input
                                  type="datetime-local"
                                  value={editLogTimestamp}
                                  onChange={e => setEditLogTimestamp(e.target.value)}
                                  className="px-2 py-1 border border-slate-300 rounded font-mono text-xs bg-white"
                                />
                              </td>
                              <td className="px-6 py-3">
                                <input
                                  type="text"
                                  value={editLogRemarks}
                                  onChange={e => setEditLogRemarks(e.target.value)}
                                  placeholder="Add details/reason..."
                                  className="w-full max-w-[200px] px-2 py-1 border border-slate-300 rounded text-xs"
                                />
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-6 py-3 font-mono text-gray-400 text-xs">{log.id.slice(0, 12)}...</td>
                              <td className="px-6 py-3 font-mono font-bold text-gray-800">{log.employee_id}</td>
                              <td className="px-6 py-3">
                                <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${log.action === 'LOGIN' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : log.action === 'LOGOUT' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
                                  {log.action}
                                </span>
                              </td>
                              <td className="px-6 py-3 font-semibold text-xs uppercase tracking-wider text-gray-500">{log.source}</td>
                              <td className="px-6 py-3 font-mono text-gray-500">
                                {log.timestamp instanceof Date ? log.timestamp.toLocaleString() : new Date(log.timestamp).toLocaleString()}
                              </td>
                              <td className="px-6 py-3 text-xs text-slate-500 max-w-xs truncate" title={log.remarks || 'None'}>
                                {log.remarks || <span className="italic text-gray-300">None</span>}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                    {attendanceLogs.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-gray-400">No atomic transaction logs found in database.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'sessions' && (
            <div className="space-y-6">
              {/* Force Punch Panel Console Card */}
              <div className="bg-slate-900 border border-slate-800 text-white p-5 rounded-2xl space-y-4 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1 px-2.5 bg-rose-500/15 text-rose-400 border border-rose-500/30 text-[10px] font-mono font-extrabold rounded uppercase tracking-wider">
                      Override Panel
                    </div>
                    <h3 className="text-sm font-bold tracking-tight text-white font-sans">
                      Force Employee Punch Overrides (In & Out)
                    </h3>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">Precision adjustments console</span>
                </div>

                <form onSubmit={handleForcePunchSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                  {/* Auto-suggest Employee selection list */}
                  <div className="relative text-left">
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase font-mono tracking-wide">1. Choose Employee</label>
                    <input
                      type="text"
                      placeholder="Search name or ID..."
                      value={searchQuery}
                      onChange={(e) => {
                        const q = e.target.value;
                        setSearchQuery(q);
                        const match = employees.find(emp => emp.name.toUpperCase() === q.trim().toUpperCase() || emp.eid === q.trim());
                        if (match) {
                          setSelectedEmployee(match);
                        } else {
                          setSelectedEmployee(null);
                        }
                        setShowSuggestions(true);
                      }}
                      onFocus={() => setShowSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 hover:border-slate-700 focus:border-indigo-500 text-white rounded-lg text-sm transition"
                    />
                    {selectedEmployee && (
                      <div className="absolute right-3.5 top-[32px] flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        Selected
                      </div>
                    )}

                    {showSuggestions && searchQuery.trim() !== '' && (
                      <div className="absolute z-50 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-slate-950 border border-slate-800 rounded-lg shadow-2xl divide-y divide-slate-800">
                        {employees
                          .filter(emp => 
                            emp.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            emp.eid.toLowerCase().includes(searchQuery.toLowerCase())
                          )
                          .map(emp => (
                            <button
                              key={emp.eid}
                              type="button"
                              onClick={() => {
                                setSelectedEmployee(emp);
                                setSearchQuery(`${emp.name} (${emp.eid})`);
                                setShowSuggestions(false);
                              }}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-slate-900 text-slate-200 transition flex justify-between items-center"
                            >
                              <span className="font-semibold">{emp.name}</span>
                              <span className="font-mono text-indigo-400 font-bold bg-indigo-500/10 px-1.5 py-0.5 rounded">EID: {emp.eid}</span>
                            </button>
                          ))}
                        {employees.filter(emp => 
                          emp.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          emp.eid.toLowerCase().includes(searchQuery.toLowerCase())
                        ).length === 0 && (
                          <div className="px-3 py-2 text-xs text-slate-500 text-center">No employees found</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Override Punch action (force in or out) */}
                  <div className="text-left">
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase font-mono tracking-wide">2. Action</label>
                    <div className="grid grid-cols-2 gap-1 bg-slate-950 border border-slate-800 p-1 rounded-lg h-[38px] items-center">
                      <button
                        type="button"
                        onClick={() => setOverrideAction('LOGIN')}
                        className={`py-1 px-3 text-[11px] font-extrabold rounded transition ${overrideAction === 'LOGIN' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                      >
                        Force Check-In
                      </button>
                      <button
                        type="button"
                        onClick={() => setOverrideAction('LOGOUT')}
                        className={`py-1 px-3 text-[11px] font-extrabold rounded transition ${overrideAction === 'LOGOUT' ? 'bg-rose-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                      >
                        Force Check-Out
                      </button>
                    </div>
                  </div>

                  {/* Precise date/time */}
                  <div className="text-left">
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase font-mono tracking-wide">3. Precise Date/Time</label>
                    <input
                      type="datetime-local"
                      value={overrideTime}
                      onChange={(e) => setOverrideTime(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 hover:border-slate-700/60 focus:border-indigo-500 text-white rounded-lg text-sm transition font-mono"
                    />
                  </div>

                  {/* Mandatory Remarks */}
                  <div className="text-left">
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase font-mono tracking-wide">4. Remarks / Reasons (Mandatory)</label>
                    <input
                      type="text"
                      placeholder="Input adjustment remarks..."
                      value={overrideRemarks}
                      onChange={(e) => setOverrideRemarks(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 hover:border-slate-700 focus:border-indigo-500 text-white rounded-lg text-sm transition"
                      required
                    />
                  </div>

                  {/* Submitter actions row */}
                  <div className="md:col-span-4 flex justify-end border-t border-slate-800/60 pt-3">
                    <button
                      type="submit"
                      disabled={isSubmittingOverride}
                      className="px-5 py-2 bg-rose-600 hover:bg-rose-500 hover:shadow-lg disabled:bg-slate-800 text-white text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer font-sans uppercase tracking-wider"
                    >
                      {isSubmittingOverride ? (
                        <>
                          <RefreshCw className="animate-spin" size={14} />
                          Processing Punch...
                        </>
                      ) : (
                        <>
                          <Database size={14} />
                          Commit Override Punch
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>

              {/* Sessions Grid */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-gray-800">Shift Sessions Grid</h3>
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                  <table className="w-full border-collapse text-left text-sm text-neutral-800">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-[11px] font-bold tracking-wider border-b border-gray-100">
                      <tr>
                        <th className="px-6 py-3.5">Employee ID (EID)</th>
                        <th className="px-6 py-3.5">Session date</th>
                        <th className="px-6 py-3.5">Clock IN (Login)</th>
                        <th className="px-6 py-3.5">Clock OUT (Logout)</th>
                        <th className="px-6 py-3.5">Session Status</th>
                        <th className="px-6 py-3.5 text-right w-48">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {sessions.map((sess) => (
                        <tr key={sess.id} className="hover:bg-slate-50/50 transition font-sans">
                          <td className="px-6 py-3 font-mono font-bold text-gray-800">{sess.employee_id}</td>
                          <td className="px-6 py-3 text-medium text-gray-500 font-mono">{sess.date}</td>
                          <td className="px-6 py-3 font-mono text-emerald-600">
                            {sess.login_at instanceof Date ? sess.login_at.toLocaleTimeString() : new Date(sess.login_at).toLocaleTimeString()}
                          </td>
                          <td className="px-6 py-3 font-mono text-rose-600">
                            {sess.logout_at ? (sess.logout_at instanceof Date ? sess.logout_at.toLocaleTimeString() : new Date(sess.logout_at).toLocaleTimeString()) : '-- : -- : --'}
                          </td>
                          <td className="px-6 py-3">
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${sess.logout_at ? 'bg-slate-100 text-slate-700' : 'bg-amber-100 text-amber-800 animate-pulse'}`}>
                              {sess.logout_at ? 'Completed Shift' : 'Active Shift'}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-right">
                            <div className="flex justify-end gap-2">
                              {!sess.logout_at && (
                                <button
                                  onClick={() => handleOnTheFlyLogout(sess)}
                                  className="p-1 px-2.5 bg-rose-600 hover:bg-rose-700 font-semibold text-white rounded text-[11px] transition flex items-center justify-center gap-1 shadow-sm"
                                  title="Force Clock Out instantly"
                                >
                                  <LogIn size={11} className="rotate-180" />
                                  Force Out
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteSession(sess.id)}
                                className="p-1 px-2 text-xs rounded flex items-center gap-1 transition hover:bg-red-50 text-red-600"
                                title="Permanently Delete Session"
                              >
                                <Trash2 size={13} />
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {sessions.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-6 py-8 text-center text-gray-400">No shift sessions created. Scan or punch clock to initiate.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer warning */}
        <div className="bg-amber-50 px-6 py-4 flex items-center gap-3 border-t border-amber-100 text-amber-800 rounded-b-2xl">
          <ShieldAlert size={20} className="flex-shrink-0" />
          <p className="text-xs font-semibold">
            Zero-Trust configuration is active. Deleted employees cannot scan into system wall monitors immediately.
          </p>
        </div>
      </div>
    </div>
  );
}
