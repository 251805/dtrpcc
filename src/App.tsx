import { useState, useEffect } from 'react';
import KioskView from './components/KioskView';
import TopNav from './components/TopNav';
import AttendanceCard from './components/AttendanceCard';
import AdminModal from './components/AdminModal';
import ReportModal from './components/ReportModal';
import { getEmployees, getAttendanceSessions, seedEmployeesIfEmpty, testConnection } from './lib/firebase';
import { Employee } from './types';
import { Shield, Sparkles, User, Users, RefreshCw, AlertCircle } from 'lucide-react';

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const isKiosk = params.get('kiosk') === 'true';

  // Toggle state trackers for Admin / Reports views
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);

  // Active workforce counts
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [activeDutyCrew, setActiveDutyCrew] = useState<any[]>([]);
  const [loadingActiveList, setLoadingActiveList] = useState(false);

  useEffect(() => {
    initApp();
  }, []);

  const initApp = async () => {
    // 1. Verify connection
    await testConnection();
    // 2. Seed initial employees if empty inside Firestore
    await seedEmployeesIfEmpty();
    // 3. Load active data lists
    await handleRefreshAll();
  };

  const handleRefreshAll = async () => {
    setLoadingActiveList(true);
    try {
      const emps = await getEmployees();
      setEmployees(emps);

      const sessionsList = await getAttendanceSessions();
      
      // Filter sessions that have logout_at == null to track active crew
      const activeSess = sessionsList.filter((sess: any) => sess.logout_at === null);
      
      // Match names
      const matched = activeSess.map((sess: any) => {
        const empRecord = emps.find(e => e.eid === sess.employee_id);
        return {
          eid: sess.employee_id,
          name: empRecord ? empRecord.name : `Crew EID ${sess.employee_id}`,
          login_at: sess.login_at
        };
      });
      setActiveDutyCrew(matched);
    } catch (e) {
      console.warn("Refresh statistics matrix index failure:", e);
    } finally {
      setLoadingActiveList(false);
    }
  };

  if (isKiosk) {
    return <KioskView />;
  }

  return (
    <div id="app-viewport-root" className="min-h-screen bg-slate-50 flex flex-col justify-between font-sans text-neutral-900 pb-12">
      <div className="w-full flex-col flex items-center">
        {/* Navigation Bar Header */}
        <TopNav 
          onOpenAdmin={() => setIsAdminOpen(true)} 
          onOpenReport={() => setIsReportOpen(true)} 
        />

        {/* Content workspace */}
        <main className="w-full max-w-7xl px-4 sm:px-6 py-10 flex flex-col lg:flex-row gap-8 items-start justify-center">
          {/* Main User Card column */}
          <div className="w-full flex justify-center">
            <AttendanceCard onRefreshAll={handleRefreshAll} />
          </div>

          {/* Side panel displaying active personnel right now */}
          <div className="w-full lg:max-w-md bg-white p-6 rounded-2xl border border-gray-100 shadow-md space-y-6">
            <div className="flex justify-between items-center pb-2 border-b border-gray-100">
              <h3 className="font-bold text-sm text-gray-800 uppercase tracking-wider flex items-center gap-2">
                <Users className="text-emerald-500" size={18} />
                Active Duty Crew ({activeDutyCrew.length})
              </h3>
              <button 
                onClick={handleRefreshAll}
                className="p-1.5 hover:bg-slate-50 text-gray-500 rounded-lg transition"
                title="Refresh logs"
              >
                <RefreshCw size={14} className={loadingActiveList ? "animate-spin" : ""} />
              </button>
            </div>

            {loadingActiveList ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400 gap-2">
                <RefreshCw className="animate-spin text-emerald-500" size={24} />
                <span className="text-xs">Locating deployed personnel...</span>
              </div>
            ) : (
              <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
                {activeDutyCrew.map((crew, k) => (
                  <div key={k} className="flex justify-between items-center p-3 bg-slate-50 border border-gray-200 rounded-xl hover:shadow-xs transition">
                    <div className="space-y-0.5">
                      <p className="font-bold text-sm text-neutral-900">{crew.name}</p>
                      <p className="font-mono text-xs text-indigo-600 font-bold">EID: {crew.eid}</p>
                    </div>
                    <div className="text-right">
                      <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse mr-2"></span>
                      <span className="text-[10px] font-bold text-gray-400 font-mono">
                        IN: {crew.login_at instanceof Date ? crew.login_at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date(crew.login_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))}
                {activeDutyCrew.length === 0 && (
                  <div className="flex flex-col items-center text-center py-8 text-slate-400 space-y-2">
                    <AlertCircle size={32} />
                    <p className="text-xs">No personnel currently logged in for shifts.</p>
                  </div>
                )}
              </div>
            )}

            <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-2">
              <span className="text-[10px] font-bold text-indigo-700 tracking-wider uppercase font-mono">Pairing Instructions</span>
              <p className="text-xs text-gray-600 leading-relaxed">
                Pair your smartphone above, then present your screen camera to the terminal QR code to record sub-second logins.
              </p>
            </div>
          </div>
        </main>
      </div>

      {/* Admin console modal pop */}
      {isAdminOpen && (
        <AdminModal 
          onClose={() => setIsAdminOpen(false)} 
          onRefreshEmployeesList={handleRefreshAll}
        />
      )}

      {/* Monthly Report log metrics matrix modal pop */}
      {isReportOpen && (
        <ReportModal 
          onClose={() => setIsReportOpen(false)} 
        />
      )}
    </div>
  );
}
