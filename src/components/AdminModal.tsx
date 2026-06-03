import React, { useState, useEffect } from 'react';
import { getEmployees, saveEmployee, deleteEmployee, getAttendanceLogs, getAttendanceSessions, seedEmployeesIfEmpty } from '../lib/firebase';
import { Employee } from '../types';
import { KeyRound, ShieldAlert, Plus, Trash2, Save, FileSpreadsheet, Lock, RefreshCw, LogIn, Database } from 'lucide-react';

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

  useEffect(() => {
    if (isAuthenticated) {
      loadAdminData();
    }
  }, [isAuthenticated]);

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
          <button onClick={onClose} className="p-1 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded-lg transition">
            Close
          </button>
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
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                <table className="w-full border-collapse text-left text-sm text-neutral-800">
                  <thead className="bg-slate-50 text-slate-500 uppercase text-[11px] font-bold tracking-wider border-b border-gray-100">
                    <tr>
                      <th className="px-6 py-3.5">Log ID</th>
                      <th className="px-6 py-3.5">Employee ID (EID)</th>
                      <th className="px-6 py-3.5">Transaction Type</th>
                      <th className="px-6 py-3.5">Log Source</th>
                      <th className="px-6 py-3.5">Timestamp (GMT+8)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {attendanceLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/50 transition font-sans">
                        <td className="px-6 py-3 font-mono text-gray-400 text-xs">{log.id.slice(0, 12)}...</td>
                        <td className="px-6 py-3 font-mono font-bold text-gray-800">{log.employee_id}</td>
                        <td className="px-6 py-3">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${log.action === 'LOGIN' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="px-6 py-3 font-semibold text-xs uppercase tracking-wider text-gray-500">{log.source}</td>
                        <td className="px-6 py-3 font-mono text-gray-500">
                          {log.timestamp instanceof Date ? log.timestamp.toLocaleString() : new Date(log.timestamp).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    {attendanceLogs.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-gray-400">No atomic transaction logs found in database.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'sessions' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-800">Active and Completed Shift Sessions</h3>
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                <table className="w-full border-collapse text-left text-sm text-neutral-800">
                  <thead className="bg-slate-50 text-slate-500 uppercase text-[11px] font-bold tracking-wider border-b border-gray-100">
                    <tr>
                      <th className="px-6 py-3.5">Employee ID (EID)</th>
                      <th className="px-6 py-3.5">Session date</th>
                      <th className="px-6 py-3.5">Clock IN (Login)</th>
                      <th className="px-6 py-3.5">Clock OUT (Logout)</th>
                      <th className="px-6 py-3.5">Session Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {sessions.map((sess) => (
                      <tr key={sess.id} className="hover:bg-slate-50/50 transition font-sans">
                        <td className="px-6 py-3 font-mono font-bold text-gray-800">{sess.employee_id}</td>
                        <td className="px-6 py-3 text-medium text-gray-500">{sess.date}</td>
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
                      </tr>
                    ))}
                    {sessions.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-gray-400">No shift sessions created. Scan or punch clock to initiate.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
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
