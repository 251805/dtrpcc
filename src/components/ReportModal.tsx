import { useState, useEffect } from 'react';
import { db, getEmployees, getAttendanceSessions } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
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

    const philhealthDeduction = emp 
      ? (typeof emp.philhealth === 'number' 
          ? (emp.philhealth === 1 ? 15.00 : emp.philhealth) 
          : 0)
      : 0;
    const grossPayout = dailyRate - penaltyTardiness - penaltyUndertime;
    const netPayout = Math.max(0, grossPayout - philhealthDeduction);

    return {
      ...sess,
      employeeName: emp ? emp.name : 'Unknown Employee',
      employeeRole: emp && emp.role ? emp.role : 'CCTV OPERATOR',
      shiftName: matchingShift.name,
      loginTimeFormatted: loginDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      logoutTimeFormatted: sess.logout_at ? new Date(sess.logout_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Active',
      tardinessMins,
      undertimeMins,
      durationHours: sess.logout_at ? (shiftMinutesWorked / 60).toFixed(1) : '0.0',
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

  const totalWorkedHours = filteredRecords.reduce((acc, curr) => {
    const val = parseFloat(curr.durationHours);
    return acc + (isNaN(val) ? 0 : val);
  }, 0);

  const handlePrint = () => {
    window.print();
  };

  const handleUpdateRemarks = async (sessionId: string, remarksVal: string) => {
    try {
      const docRef = doc(db, 'attendance_sessions', sessionId);
      await updateDoc(docRef, { remarks: remarksVal });
      // Update local state instantly so user doesn't feel lag
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, remarks: remarksVal } : s));
    } catch (err) {
      console.error("Failed to commit manual remarks update:", err);
    }
  };

  const handleDownloadCSV = () => {
    const headers = [
      "AC No",
      "Name",
      "Position",
      "Department",
      "Date",
      "Shift Category",
      "Start Time",
      "End Time",
      "Tardiness",
      "Undertime",
      "Total hours",
      "Philhealth",
      "Net Due (₱)",
      "Remarks"
    ];

    const rows = filteredRecords.map(rec => [
      `"${rec.employee_id}"`,
      `"${rec.employeeName.replace(/"/g, '""')}"`,
      `"${(rec.employeeRole || 'CCTV OPERATOR').replace(/"/g, '""')}"`,
      `"Office of the Municipal Mayor"`,
      `"${rec.date}"`,
      `"${rec.shiftName}"`,
      `"${rec.loginTimeFormatted}"`,
      `"${rec.logoutTimeFormatted}"`,
      `"${rec.tardinessMins > 0 ? rec.tardinessMins : 0}"`,
      `"${rec.undertimeMins > 0 ? rec.undertimeMins : 0}"`,
      `"${rec.durationHours}"`,
      `"${rec.philhealthDeduction}"`,
      `"${rec.netPayout.toFixed(2)}"`,
      `"${(rec.remarks || '').replace(/"/g, '""')}"`
    ]);

    const csvData = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const filename = `PCC_DTR_Report_${selectedYear}_${selectedMonth === 'all' ? 'AllMonths' : selectedMonth}.csv`;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div id="report-dashboard" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 text-neutral-900 print:bg-white print:p-0">
      <style>{`
        @media print {
          /* Force page margins and allow landscape or portrait orientation naturally */
          @page {
            margin: 8mm 12mm 12mm 12mm !important;
            size: auto !important;
          }
          
          /* Hide all other elements from the page so that only the report modal is processed */
          body > *:not(#root) {
            display: none !important;
          }
          
          #root > *:not(#app-viewport-root) {
            display: none !important;
          }
          
          #app-viewport-root > *:not(#report-dashboard) {
            display: none !important;
          }

          body {
            background-color: white !important;
            color: #111827 !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          #app-viewport-root {
            display: block !important;
            min-height: 0 !important;
            height: auto !important;
            background-color: white !important;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
          }
          
          #report-dashboard {
            position: relative !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            height: auto !important;
            background-color: white !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
            z-index: auto !important;
          }

          #report-dashboard > div {
            display: block !important;
            max-width: 100% !important;
            width: 100% !important;
            height: auto !important;
            max-height: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          /* Disable sticky headers on screen when printing */
          .sticky, [style*="position: sticky"] {
            position: static !important;
          }

          /* Override overflow-auto wrapper for print to let pages break naturally */
          .overflow-auto, [class*="overflow-auto"], [class*="overflow-y-auto"] {
            overflow: visible !important;
            max-height: none !important;
            height: auto !important;
          }
          
          /* Layout table print behaviors */
          table {
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
            table-layout: fixed !important;
            border-collapse: collapse !important;
            page-break-inside: auto !important;
          }
          
          tr {
            page-break-inside: avoid !important;
            page-break-after: auto !important;
          }
          
          thead {
            display: table-header-group !important;
          }
          
          tbody {
            display: table-row-group !important;
          }

          th, td {
            position: static !important;
            background: transparent !important;
            color: #111827 !important;
            height: auto !important;
            padding: 6px 6px !important;
            font-size: 8.5px !important;
            line-height: 1.3 !important;
            border: 1px solid #d1d5db !important;
            word-break: break-word !important;
            white-space: normal !important;
          }

          th {
            font-weight: 700 !important;
            text-transform: uppercase !important;
            background-color: #f3f4f6 !important;
            text-align: left !important;
          }

          td.text-right, th.text-right {
            text-align: right !important;
          }

          /* Force background colors and text colors in browsers during print */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* Explicit column widths mapping to the 9 printed columns (Total = 100%) */
          .col-ac-no { width: 8% !important; min-width: 8% !important; max-width: 8% !important; }
          .col-name { width: 17% !important; min-width: 17% !important; max-width: 17% !important; }
          .col-date { width: 11% !important; min-width: 11% !important; max-width: 11% !important; }
          .col-shift { width: 15% !important; min-width: 15% !important; max-width: 15% !important; }
          .col-start-time { width: 10% !important; min-width: 10% !important; max-width: 10% !important; }
          .col-end-time { width: 10% !important; min-width: 10% !important; max-width: 10% !important; }
          .col-tardiness { width: 8% !important; min-width: 8% !important; max-width: 8% !important; }
          .col-undertime { width: 8% !important; min-width: 8% !important; max-width: 8% !important; }
          .col-remarks { width: 13% !important; min-width: 13% !important; max-width: 13% !important; }

          /* Signatory styling on page print */
          #print-signature-panel {
            page-break-inside: avoid !important;
            margin-top: 50px !important;
            padding-top: 15px !important;
            border-top: none !important;
            display: flex !important;
            flex-direction: row !important;
            justify-content: space-around !important;
            align-items: flex-end !important;
            width: 100% !important;
          }

          #print-signature-panel > div {
            width: 40% !important;
            text-align: center !important;
          }

          #print-signature-panel div.w-52 {
            width: 80% !important;
            margin: 0 auto 4px auto !important;
          }
        }
      `}</style>
      <div className="bg-white rounded-2xl w-full max-w-[95vw] xl:max-w-[1450px] shadow-2xl flex flex-col max-h-[90vh] print:shadow-none print:w-full print:max-h-none print:rounded-none">
        
        {/* Header - Hidden on Print */}
        <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-neutral-900 text-white rounded-t-2xl print:hidden">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="text-emerald-400" size={24} />
            <div>
              <h2 className="text-xl font-bold tracking-tight">Monthly DTR Report</h2>
              <p className="text-xs text-neutral-400">Track attendances, late, undertime, and net balances.</p>
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
                placeholder="Type name to search data "
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
              onClick={handleDownloadCSV}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg flex items-center gap-2 h-[38px] transition shadow-xs"
            >
              <FileSpreadsheet size={16} />
              Download in Excel
            </button>
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
        <div className="hidden print:flex flex-col items-center p-8 text-center border-b border-gray-200 text-neutral-950 font-sans">
          <img 
            src="https://raw.githubusercontent.com/251805/etcfile/main/PCCLogo.png" 
            alt="PCC Logo" 
            className="w-16 h-16 object-contain mb-3"
            referrerPolicy="no-referrer"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = "https://github.com/251805/etcfile/blob/main/PCCLogo.png?raw=true";
            }}
          />
          <h1 className="text-2xl font-bold tracking-tight mb-1 uppercase">PAGBILAO COMMAND CENTER</h1>
          <h2 className="text-lg font-semibold text-gray-700">Official Monthly Daily Time Record</h2>
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
        <div className="flex-1 overflow-hidden px-6 pb-6 flex flex-col print:overflow-visible print:px-0 print:pb-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400 flex-1">
              <RefreshCw className="animate-spin" size={32} />
              <span>Compiling timesheet matrices...</span>
            </div>
          ) : (
            <div className="flex-1 border border-slate-200 rounded-xl overflow-auto bg-white shadow-xs print:border-none print:shadow-none font-sans">
              <table className="w-full border-collapse text-left text-xs text-neutral-800 min-w-[1440px] print:min-w-0 print:w-full print:table-fixed relative">
                <thead className="text-slate-500 uppercase text-[9px] font-bold tracking-wider border-b border-gray-200 print:bg-slate-100">
                  <tr className="sticky top-0 z-30">
                    <th className="col-ac-no sticky left-0 bg-slate-50 text-slate-600 font-bold border-r border-slate-200 z-40 px-3 py-3 w-[80px] min-w-[80px]">AC No</th>
                    <th className="col-name sticky left-[80px] bg-slate-50 text-slate-600 font-bold border-r-2 border-slate-300 z-40 px-3 py-3 w-[150px] min-w-[150px]">Name</th>
                    <th className="sticky top-0 bg-slate-50 z-20 px-3 py-3 min-w-[130px] print:hidden">Position</th>
                    <th className="sticky top-0 bg-slate-50 z-20 px-3 py-3 min-w-[180px] print:hidden">Department</th>
                    <th className="col-date sticky top-0 bg-slate-50 z-20 px-3 py-3 min-w-[90px]">Date</th>
                    <th className="col-shift sticky top-0 bg-slate-50 z-20 px-3 py-3 min-w-[130px]">Shift Category</th>
                    <th className="col-start-time sticky top-0 bg-slate-50 z-20 px-3 py-3 min-w-[90px]">Start Time</th>
                    <th className="col-end-time sticky top-0 bg-slate-50 z-20 px-3 py-3 min-w-[90px]">End Time</th>
                    <th className="col-tardiness sticky top-0 bg-slate-50 z-20 px-3 py-3 text-right min-w-[90px]">Tardiness</th>
                    <th className="col-undertime sticky top-0 bg-slate-50 z-20 px-3 py-3 text-right min-w-[90px]">Undertime</th>
                    <th className="sticky top-0 bg-slate-50 z-20 px-3 py-3 text-right min-w-[90px] print:hidden">Total hours</th>
                    <th className="sticky top-0 bg-slate-50 z-20 px-3 py-3 text-right min-w-[95px] print:hidden">Philhealth</th>
                    <th className="sticky top-0 bg-slate-50 text-neutral-900 font-bold z-20 px-3 py-3 text-right min-w-[110px] print:hidden">Net Due (₱)</th>
                    <th className="col-remarks sticky top-0 bg-slate-50 z-20 px-3 py-3 text-left min-w-[200px] w-60">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 font-mono text-[11px]">
                  {filteredRecords.map((rec, i) => (
                    <tr key={rec.id || i} className="group hover:bg-slate-50/50 transition print:hover:bg-transparent">
                      <td className="col-ac-no sticky left-0 bg-white group-hover:bg-slate-50 transition-colors font-bold text-gray-500 border-r border-slate-200 z-10 px-3 py-2.5 w-[80px] min-w-[80px]">{rec.employee_id}</td>
                      <td className="col-name sticky left-[80px] bg-white group-hover:bg-slate-50 transition-colors font-sans font-bold text-neutral-950 border-r-2 border-slate-300 z-10 px-3 py-2.5 w-[150px] min-w-[150px]">{rec.employeeName}</td>
                      <td className="px-3 py-2.5 font-sans text-gray-600 print:hidden">{rec.employeeRole}</td>
                      <td className="px-3 py-2.5 font-sans text-gray-500 text-[10px] print:hidden">Office of the Municipal Mayor</td>
                      <td className="col-date px-3 py-2.5 text-gray-500">{rec.date}</td>
                      <td className="col-shift px-3 py-2.5 font-sans font-medium text-gray-600">{rec.shiftName}</td>
                      <td className="col-start-time px-3 py-2.5 text-emerald-600 font-semibold">{rec.loginTimeFormatted}</td>
                      <td className="col-end-time px-3 py-2.5 text-rose-600 font-semibold">{rec.logoutTimeFormatted}</td>
                      <td className={`col-tardiness px-3 py-2.5 text-right ${rec.tardinessMins > 0 ? 'text-rose-600 font-bold' : 'text-gray-400'}`}>
                        {rec.tardinessMins > 0 ? `${rec.tardinessMins}m` : '0'}
                      </td>
                      <td className={`col-undertime px-3 py-2.5 text-right ${rec.undertimeMins > 0 ? 'text-amber-600 font-bold' : 'text-gray-400'}`}>
                        {rec.undertimeMins > 0 ? `${rec.undertimeMins}m` : '0'}
                      </td>
                      <td className="px-3 py-2.5 text-right text-neutral-600 font-semibold print:hidden">
                        {rec.durationHours} hrs
                      </td>
                      <td className="px-3 py-2.5 text-right text-indigo-600 print:hidden">
                        {rec.philhealthDeduction > 0 ? `₱${rec.philhealthDeduction.toFixed(2)}` : '₱0.00'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-neutral-950 print:hidden">
                        ₱{rec.netPayout.toLocaleString([], { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="col-remarks px-3 py-2.5 font-sans">
                        <span className="hidden print:inline text-xs text-gray-700">{rec.remarks || ''}</span>
                        <input 
                          type="text" 
                          value={rec.remarks || ''} 
                          onChange={(e) => handleUpdateRemarks(rec.id, e.target.value)}
                          placeholder="Click to add remarks..."
                          className="w-full px-2 py-0.5 bg-slate-50 border border-gray-100 rounded text-[10px] focus:outline-indigo-500 focus:bg-white focus:border-indigo-400 print:hidden font-sans"
                        />
                      </td>
                    </tr>
                  ))}
                  {filteredRecords.length === 0 && (
                    <tr>
                      <td colSpan={14} className="px-4 py-12 text-center text-gray-400 font-sans">
                        No matching attendance records found. Adjust target month, year or search entries.
                      </td>
                    </tr>
                  )}
                  {/* Ledger totals row */}
                  <tr className="sticky bottom-0 bg-slate-100 border-t-2 border-slate-300 font-sans font-bold text-[11px] print:bg-slate-100 z-20 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
                    <td className="col-ac-no sticky left-0 bottom-0 bg-slate-100 border-r border-slate-200 z-30 font-bold text-gray-600 px-3 py-3 w-[80px] min-w-[80px]">TOTALS</td>
                    <td className="col-name sticky left-[80px] bottom-0 bg-slate-100 border-r-2 border-slate-300 z-30 font-bold text-neutral-900 px-3 py-3 w-[150px] min-w-[150px]">GRAND TOTALS:</td>
                    <td className="px-3 py-3 bg-slate-100 print:hidden"></td>
                    <td className="px-3 py-3 bg-slate-100 print:hidden"></td>
                    <td className="col-date px-3 py-3 bg-slate-100"></td>
                    <td className="col-shift px-3 py-3 bg-slate-100"></td>
                    <td className="col-start-time px-3 py-3 bg-slate-100"></td>
                    <td className="col-end-time px-3 py-3 bg-slate-100"></td>
                    <td className="col-tardiness px-3 py-3 text-right text-rose-700 font-mono text-xs bg-slate-100">{totalTardinessMins} mins</td>
                    <td className="col-undertime px-3 py-3 text-right text-amber-700 font-mono text-xs bg-slate-100">{totalUndertimeMins} mins</td>
                    <td className="px-3 py-3 text-right text-slate-700 font-mono text-xs bg-slate-100 print:hidden">{totalWorkedHours.toFixed(1)} hrs</td>
                    <td className="px-3 py-3 text-right text-indigo-700 font-mono text-xs bg-slate-100 print:hidden">₱{totalPhilhealthDeductions.toFixed(2)}</td>
                    <td className="px-3 py-3 text-right text-emerald-800 font-mono text-xs bg-slate-100 print:hidden">
                      ₱{totalPayoutSums.toLocaleString([], { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="col-remarks px-3 py-3 bg-slate-100"></td>
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
            <p>Signature over printed name</p>
            <p className="text-[10px] text-gray-500 font-normal">I hereby certify that the above records are true and correct</p>
          </div>
          <div className="space-y-1">
            <div className="w-52 border-b border-black"></div>
            <p>Signature over printed name</p>
            <p className="text-[10px] text-gray-500 font-normal">Municipal Administrator</p>
          </div>
        </div>

      </div>
    </div>
  );
}
