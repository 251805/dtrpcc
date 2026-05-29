import { useState, useEffect } from 'react';
import { getEmployees, getAttendanceSessions } from '../lib/firebase';
import { Employee } from '../types';
import { findClosestShift, calculateTardiness, calculateUndertime, formatMinutes } from '../lib/shiftLogic';
import { FileSpreadsheet, Printer, Search, Calendar, Landmark, Info, CheckCircle, FileText, RefreshCw } from 'lucide-react';

interface ReportModalProps {
  onClose: () => void;
}

export default function ReportModal({ onClose }: ReportModalProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchEid, setSearchEid] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>('all'); // all or "01" ... "12"
  const [selectedYear, setSelectedYear] = useState<string>('2026');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const emps = await getEmployees();
    setEmployees(emps);

    const sess = await getAttendanceSessions();
    setSessions(sess);
    setLoading(false);
  };

  const months = [
    { value: 'all', label: 'All Recorded Months' },
    { value: '01', label: 'January' },
    { value: '02', label: 'February' },
    { value: '03', label: 'March' },
    { value: '04', label: 'April' },
    { value: '05', label: 'May' },
    { value: '06', label: 'June' },
    { value: '07', label: 'July' },
    { value: '08', label: 'August' },
    { value: '09', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' }
  ];

  // Map employee list to indexed map for O(1) searches
  const employeeMap = new Map<string, Employee>();
  employees.forEach(emp => employeeMap.set(emp.eid, emp));

  // Process sessions and calculate results
  const processedRecords = sessions.map(sess => {
    const emp = employeeMap.get(sess.employee_id);
    const loginDate = sess.login_at instanceof Date ? sess.login_at : new Date(sess.login_at);
    
    // Get formatted login time string (e.g. "08:15")
    const loginHourStr = loginDate.toLocaleTimeString('en-US', { hour12: false }).substring(0, 5);
    
    // Nearest active shift assignment
    const matchingShift = findClosestShift(loginHourStr);

    // Calculate tardiness minutes
    const tardinessMins = calculateTardiness(loginHourStr, matchingShift);

    // Calculate undertime minutes if checked out
    let undertimeMins = 0;
    let logoutTimeStr = '--:--';
    if (sess.logout_at) {
      const logoutDate = sess.logout_at instanceof Date ? sess.logout_at : new Date(sess.logout_at);
      logoutTimeStr = logoutDate.toLocaleTimeString('en-US', { hour12: false }).substring(0, 5);
      undertimeMins = calculateUndertime(logoutTimeStr, matchingShift);
    }

    // Shift length hours estimate
    let shiftMinutesWorked = 0;
    if (sess.logout_at) {
      const deltaMs = new Date(sess.logout_at).getTime() - loginDate.getTime();
      shiftMinutesWorked = Math.max(0, Math.floor(deltaMs / 60000));
    }

    // Financial breakdown
    const dailyRate = emp ? emp.rate_per_day : 532;
    const ratePerMinute = dailyRate / 480; // Assuming standard 8 hours (480 mins) shift
    
    // Hourly deduction penalties
    const penaltyTardiness = tardinessMins * ratePerMinute;
    const penaltyUndertime = undertimeMins * ratePerMinute;

    const philhealthDeduction = emp && emp.philhealth === 1 ? 15.00 : 0; // Standard ₱15 deductible 
    const grossPayout = dailyRate - penaltyTardiness - penaltyUndertime;
    const netPayout = Math.max(0, grossPayout - philhealthDeduction);

    return {
      ...sess,
      employeeName: emp ? emp.name : 'Unknown Employee',
      shiftName: matchingShift.name,
      loginTimeFormatted: loginDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      logoutTimeFormatted: sess.logout_at ? new Date(sess.logout_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Active',
      tardinessMins,
      undertimeMins,
      durationHours: sess.logout_at ? (shiftMinutesWorked / 60).toFixed(1) : '---',
      dailyRate,
      penaltyTardiness,
      penaltyUndertime,
      philhealthDeduction,
      netPayout
    };
  });

  // Apply visual user filters
  const filteredRecords = processedRecords.filter(rec => {
    // EID or Name match
    const matchesSearch = rec.employee_id.toLowerCase().includes(searchEid.toLowerCase()) || 
                          rec.employeeName.toLowerCase().includes(searchEid.toLowerCase());
    
    // Parse session month: YYYY-MM-DD
    const recMonth = rec.date.split('-')[1];
    const recYear = rec.date.split('-')[0];

    const matchesMonth = selectedMonth === 'all' || recMonth === selectedMonth;
    const matchesYear = recYear === selectedYear;

    return matchesSearch && matchesMonth && matchesYear;
  });

  // Totals calculations
  const totalWorkedSessions = filteredRecords.length;
  const totalTardinessMins = filteredRecords.reduce((acc, curr) => acc + curr.tardinessMins, 0);
  const totalUndertimeMins = filteredRecords.reduce((acc, curr) => acc + curr.undertimeMins, 0);
  const totalPhilhealthDeductions = filteredRecords.reduce((acc, curr) => acc + curr.philhealthDeduction, 0);
  const totalPayoutSums = filteredRecords.reduce((acc, curr) => acc + curr.netPayout, 0);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div id="report-dashboard" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 text-neutral-900 print:bg-white print:p-0">
      <div className="bg-white rounded-2xl w-full max-w-6xl shadow-2xl flex flex-col max-h-[90vh] print:shadow-none print:w-full print:max-h-none print:rounded-none">
        
        {/* Header - Hidden on Print */}
        <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-neutral-900 text-white rounded-t-2xl print:hidden">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="text-emerald-400" size={24} />
            <div>
              <h2 className="text-xl font-bold tracking-tight">Monthly DTR Statistics & Payroll</h2>
              <p className="text-xs text-neutral-400">Track attendances, late hours, undertime indices, and net balances.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded-lg transition">
            Close
          </button>
        </div>

        {/* Filters Panel - Hidden on Print */}
        <div className="bg-slate-50 border-b border-gray-200 p-4 grid grid-cols-1 md:grid-cols-3 gap-4 print:hidden">
          {/* Employee search */}
          <div className="relative">
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">Search Personnel</label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
              <input 
                type="text" 
                value={searchEid} 
                onChange={(e) => setSearchEid(e.target.value)}
                placeholder="Type Name or EID barcode..."
                className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-indigo-500"
              />
            </div>
          </div>

          {/* Month selective */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">Target Month</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-2.5 text-gray-400" size={16} />
              <select 
                value={selectedMonth} 
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-indigo-500"
              >
                {months.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Actions & Year */}
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">Target Year</label>
              <select 
                value={selectedYear} 
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-indigo-500"
              >
                <option value="2026">2026</option>
                <option value="2025">2025</option>
              </select>
            </div>
            <button 
              onClick={handlePrint}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg flex items-center gap-2 h-[38px] transition shadow-xs"
            >
              <Printer size={16} />
              Print Report
            </button>
          </div>
        </div>

        {/* Print Title - Visible only when printing */}
        <div className="hidden print:block p-8 text-center border-b border-gray-200 text-neutral-950 font-sans">
          <h1 className="text-2xl font-bold tracking-tight uppercase">PAGBILAO COMMAND CENTER (PCC)</h1>
          <h2 className="text-lg font-semibold text-gray-700">Official Monthly Daily Time Record (DTR) Ledger</h2>
          <p className="text-xs text-gray-500 mt-1">Compiled on: {new Date().toLocaleString()} (GMT+8 Manila Standard Time)</p>
          <div className="flex justify-center gap-8 mt-4 text-xs font-semibold">
            <span>Year: {selectedYear}</span>
            <span>Month: {selectedMonth === 'all' ? 'All Months' : months.find(m => m.value === selectedMonth)?.label}</span>
          </div>
        </div>

        {/* Summary bento grids - Hidden on Print */}
        <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4 print:hidden">
          <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl flex flex-col justify-between">
            <span className="text-xs text-emerald-700 font-bold uppercase tracking-wider">Worked sessions</span>
            <span className="text-2xl font-mono font-bold text-emerald-900 mt-2">{totalWorkedSessions} Shifts</span>
          </div>
          <div className="bg-rose-50 border border-rose-100 p-4 rounded-xl flex flex-col justify-between">
            <span className="text-xs text-rose-700 font-bold uppercase tracking-wider">Tardiness index</span>
            <span className="text-2xl font-mono font-bold text-rose-950 mt-2">{totalTardinessMins} mins</span>
          </div>
          <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl flex flex-col justify-between">
            <span className="text-xs text-amber-700 font-bold uppercase tracking-wider">Undertime shorts</span>
            <span className="text-2xl font-mono font-bold text-amber-950 mt-2">{totalUndertimeMins} mins</span>
          </div>
          <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl flex flex-col justify-between">
            <span className="text-xs text-indigo-700 font-bold uppercase tracking-wider">Total net payroll</span>
            <span className="text-2xl font-mono font-bold text-indigo-950 mt-2">₱{totalPayoutSums.toLocaleString([], { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </div>

        {/* Ledger Sheet Matrix */}
        <div className="flex-1 overflow-auto px-6 pb-6 print:px-0 print:pb-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
              <RefreshCw className="animate-spin" size={32} />
              <span>Compiling timesheet matrices...</span>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs print:border-none print:shadow-none font-sans">
              <table className="w-full border-collapse text-left text-xs text-neutral-800">
                <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold tracking-wider border-b border-gray-200 print:bg-slate-100">
                  <tr>
                    <th className="px-4 py-3">EID</th>
                    <th className="px-4 py-3">Roster Name</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Shift Category</th>
                    <th className="px-4 py-3">Clock IN</th>
                    <th className="px-4 py-3">Clock OUT</th>
                    <th className="px-4 py-3 text-right">Lates (m)</th>
                    <th className="px-4 py-3 text-right">Undertimes (m)</th>
                    <th className="px-4 py-3 text-right">PhilHealth (₱)</th>
                    <th className="px-4 py-3 text-right font-bold text-neutral-900">Net Due (₱)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 font-mono">
                  {filteredRecords.map((rec, i) => (
                    <tr key={rec.id || i} className="hover:bg-slate-50/50 transition print:hover:bg-transparent">
                      <td className="px-4 py-2.5 font-bold text-gray-500">{rec.employee_id}</td>
                      <td className="px-4 py-2.5 font-sans font-bold text-neutral-950">{rec.employeeName}</td>
                      <td className="px-4 py-2.5 text-gray-500">{rec.date}</td>
                      <td className="px-4 py-2.5 font-sans font-medium text-gray-600">{rec.shiftName}</td>
                      <td className="px-4 py-2.5 text-emerald-600 font-semibold">{rec.loginTimeFormatted}</td>
                      <td className="px-4 py-2.5 text-rose-600 font-semibold">{rec.logoutTimeFormatted}</td>
                      <td className={`px-4 py-2.5 text-right ${rec.tardinessMins > 0 ? 'text-rose-600 font-bold' : 'text-gray-400'}`}>
                        {rec.tardinessMins > 0 ? `${rec.tardinessMins}m` : '0'}
                      </td>
                      <td className={`px-4 py-2.5 text-right ${rec.undertimeMins > 0 ? 'text-amber-600 font-bold' : 'text-gray-400'}`}>
                        {rec.undertimeMins > 0 ? `${rec.undertimeMins}m` : '0'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-indigo-600">
                        {rec.philhealthDeduction > 0 ? `₱${rec.philhealthDeduction.toFixed(2)}` : '₱0.00'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-neutral-950">
                        ₱{rec.netPayout.toLocaleString([], { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                  {filteredRecords.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-gray-400 font-sans">
                        No matching attendance records found. Adjust target month, year or search entries.
                      </td>
                    </tr>
                  )}
                  {/* Ledger totals row */}
                  <tr className="bg-slate-50 border-t-2 border-slate-300 font-sans font-bold text-[11px] print:bg-slate-100">
                    <td colSpan={6} className="px-4 py-3 text-right text-gray-500 uppercase">Grand Totals:</td>
                    <td className="px-4 py-3 text-right text-rose-700 font-mono text-xs">{totalTardinessMins} mins</td>
                    <td className="px-4 py-3 text-right text-amber-700 font-mono text-xs">{totalUndertimeMins} mins</td>
                    <td className="px-4 py-3 text-right text-indigo-700 font-mono text-xs">₱{totalPhilhealthDeductions.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-emerald-800 font-mono text-xs">
                      ₱{totalPayoutSums.toLocaleString([], { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Printable Signature Line */}
        <div id="print-signature-panel" className="hidden print:flex justify-around items-end pt-20 p-8 text-xs font-semibold text-neutral-950 text-center">
          <div className="space-y-1">
            <div className="w-52 border-b border-black"></div>
            <p>Verified by Operations Team</p>
            <p className="text-[10px] text-gray-500 font-normal">Pagbilao Command Center Inspector</p>
          </div>
          <div className="space-y-1">
            <div className="w-52 border-b border-black"></div>
            <p>Approved for Release</p>
            <p className="text-[10px] text-gray-500 font-normal">Municipal Command Director</p>
          </div>
        </div>

      </div>
    </div>
  );
}
