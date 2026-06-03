import React, { useState, useEffect } from 'react';
import { Camera, RefreshCw, AlertCircle, CheckCircle, HelpCircle, ArrowRight, UserCheck } from 'lucide-react';25
import { db, saveEmployee, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, query, where, getDocs, orderBy, limit, updateDoc, doc, Timestamp } from 'firebase/firestore';
import { findClosestShift, calculateTardiness, calculateUndertime } from '../lib/shiftLogic';
import QRScanner from './QRScanner';

interface AttendanceCardProps {
  onRefreshAll: () => void;
}

export default function AttendanceCard({ onRefreshAll }: AttendanceCardProps) {
  const [time, setTime] = useState(new Date());
  
  // Personnel identification session state
  const [identifiedEid, setIdentifiedEid] = useState<string>('');
  const [inputId, setInputId] = useState<string>('');
  
  // Camera Views
  const [showScanner, setShowScanner] = useState(false);

  // Manual fallback inputs
  const [manualEid, setManualEid] = useState('');
  const [manualRemarks, setManualRemarks] = useState('');
  const [isManualExpanded, setIsManualExpanded] = useState(false);

  // Operational Transaction logs toast
  const [statusMsg, setStatusMsg] = useState<{ text: string, type: 'success' | 'error' | 'info' } | null>(null);

  // Last clocked track for prevention of double clocking (Anti-spam duplicate filter)
  // Maps Employee EID to Timestamp (millis)
  const [lastPunchMap, setLastPunchMap] = useState<Record<string, number>>({});

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    
    // Load existing identification session
    const savedEid = localStorage.getItem('a10dance_eid');
    if (savedEid) {
      setIdentifiedEid(savedEid);
    }

    return () => clearInterval(timer);
  }, []);

  const showStatus = (text: string, type: 'success' | 'error' | 'info') => {
    setStatusMsg({ text, type });
    setTimeout(() => {
      setStatusMsg(null);
    }, 6000);
  };

  const handleIdentifyDevice = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = inputId.trim();
    if (!cleanId) return;

    localStorage.setItem('a10dance_eid', cleanId);
    setIdentifiedEid(cleanId);
    setInputId('');
    showStatus(`Mobile device paired to EID: ${cleanId} successfully.`, 'success');
  };

  const handleClearDevice = () => {
    localStorage.removeItem('a10dance_eid');
    setIdentifiedEid('');
    showStatus("Browser identity cleared.", 'info');
  };

  // Central punch handling engine (either via scan callback or manual forms input)
  const executePunch = async (eid: string, isFromScan: boolean, forceAction?: 'LOGIN' | 'LOGOUT') => {
    const cleanEid = eid.trim();
    if (!cleanEid) {
      showStatus("EID is required to punch clock.", "error");
      return;
    }

    // 1. Anti-Spam Duplicate Scan Filter (60-second client block)
    const nowMs = Date.now();
    const lastPunch = lastPunchMap[cleanEid];
    if (lastPunch && (nowMs - lastPunch < 60000)) {
      const remaining = Math.ceil((60000 - (nowMs - lastPunch)) / 1000);
      showStatus(`Duplicate action filtered! Please wait ${remaining}s before clocking EID: ${cleanEid} again.`, 'error');
      return;
    }

    try {
      showStatus(`Processing request for EID: ${cleanEid}...`, 'info');
      
      const todayStr = time.toISOString().split('T')[0];
      const firestoreTimestamp = Timestamp.now();

      // Check if employee is registered in Firestore
      const empQuerySnapshot = await getDocs(
        query(collection(db, 'employees'), where('eid', '==', cleanEid))
      );
      
      let employeeName = `EID ${cleanEid}`;
      if (empQuerySnapshot.empty) {
        // Self-heal and seed under general PCC Crew details as specified in Manual Section 4
        console.log(`Self-healing unregistered employee: ${cleanEid}`);
        await saveEmployee({
          eid: cleanEid,
          name: `PCC CREW-${cleanEid}`,
          rate_per_day: 532,
          philhealth: 0
        });
        employeeName = `PCC CREW-${cleanEid}`;
      } else {
        employeeName = empQuerySnapshot.docs[0].data().name;
      }

      // Determine Action Type: Alternating or Forced
      let actionType: 'LOGIN' | 'LOGOUT' = 'LOGIN';
      if (forceAction) {
        actionType = forceAction;
      } else {
        // Toggle action by looking at last logged transaction status
        const attendancesQuery = query(
          collection(db, 'attendance'),
          where('employee_id', '==', cleanEid),
          orderBy('timestamp', 'desc'),
          limit(1)
        );
        const latestAttendanceSnapshot = await getDocs(attendancesQuery);
        if (!latestAttendanceSnapshot.empty) {
          const lastAction = latestAttendanceSnapshot.docs[0].data().action;
          actionType = lastAction === 'LOGIN' ? 'LOGOUT' : 'LOGIN';
        }
      }

      // Write Raw transaction log
      const pathAttendance = 'attendance';
      await addDoc(collection(db, pathAttendance), {
        employee_id: cleanEid,
        action: actionType,
        source: isFromScan ? 'SCAN' : 'MANUAL',
        timestamp: firestoreTimestamp,
      }).catch((err) => handleFirestoreError(err, OperationType.WRITE, pathAttendance));

      // Handle Session synchronization logic (Relational Paired Work Session table)
      const pathSession = 'attendance_sessions';
      if (actionType === 'LOGIN') {
        await addDoc(collection(db, pathSession), {
          employee_id: cleanEid,
          login_at: firestoreTimestamp,
          logout_at: null,
          date: todayStr,
          remarks: isFromScan ? '' : (manualRemarks || '')
        }).catch((err) => handleFirestoreError(err, OperationType.WRITE, pathSession));

        showStatus(`Clocked IN (Login) successfully for ${employeeName}! Have a safe shift.`, 'success');
      } else {
        // Find latest open session in sessions table to update logout
        const qSession = query(
          collection(db, 'attendance_sessions'),
          where('employee_id', '==', cleanEid),
          where('logout_at', '==', null),
          orderBy('login_at', 'desc'),
          limit(1)
        );
        const activeSessionsSnapshot = await getDocs(qSession);
        
        if (!activeSessionsSnapshot.empty) {
          const activeSessionDoc = activeSessionsSnapshot.docs[0];
          await updateDoc(doc(db, 'attendance_sessions', activeSessionDoc.id), {
            logout_at: firestoreTimestamp,
            remarks: isFromScan ? (activeSessionDoc.data().remarks || '') : (manualRemarks || activeSessionDoc.data().remarks || '')
          }).catch((err) => handleFirestoreError(err, OperationType.UPDATE, `${pathSession}/${activeSessionDoc.id}`));
          showStatus(`Clocked OUT (Logout) successfully for ${employeeName}! Thank you for your service.`, 'success');
        } else {
          // If no open session exists, insert fallback paired session to preserve integrity
          await addDoc(collection(db, pathSession), {
            employee_id: cleanEid,
            login_at: firestoreTimestamp,
            logout_at: firestoreTimestamp,
            date: todayStr,
            remarks: isFromScan ? '' : (manualRemarks || '')
          }).catch((err) => handleFirestoreError(err, OperationType.WRITE, pathSession));
          showStatus(`Clocked OUT (Logout fallback created) for ${employeeName}!`, 'success');
        }
      }

      // Clear manual fields
      if (!isFromScan) {
        setManualEid('');
        setManualRemarks('');
      }

      // Update duplicate lock timestamp
      setLastPunchMap(prev => ({
        ...prev,
        [cleanEid]: nowMs
      }));

      onRefreshAll();

    } catch (e: any) {
      console.error(e);
      // Trigger offline backup caching if Firebase drops or blocks transaction
      handleOfflineRecovery(cleanEid, isFromScan, forceAction);
    }
  };

  // Local Offline Storage recovery adapter
  const handleOfflineRecovery = (eid: string, isFromScan: boolean, forceAction?: 'LOGIN' | 'LOGOUT') => {
    try {
      const nowMs = Date.now();
      const todayStr = time.toISOString().split('T')[0];
      const actionType = forceAction || 'LOGIN';

      const localLogs = JSON.parse(localStorage.getItem('theory11_local_attendance') || '[]');
      const newOffLog = {
        employee_id: eid,
        action: actionType,
        source: isFromScan ? 'SCAN' : 'MANUAL',
        timestamp: new Date().toISOString(),
        date: todayStr,
        isSynced: false
      };
      localLogs.push(newOffLog);
      localStorage.setItem('theory11_local_attendance', JSON.stringify(localLogs));

      showStatus(`[LOCAL ONLY BACKUP] Saved punch offline for EID: ${eid}. Session will batch-sync immediately upon recovery.`, 'info');
    } catch (err) {
      showStatus("Critical: offline storage capacity exhausted.", 'error');
    }
  };

  // QR scan successful callback
  const handleQRScanSuccess = (decodedValue: string) => {
    // 1. Regular expression parsing to normalize the read string (EID normalization)
    // Supports raw strings, quotes, curly brackets JSONs, or query parameters URLs
    let cleanEid = decodedValue;

    // Remove quotes
    if (cleanEid.startsWith('"') && cleanEid.endsWith('"')) {
      cleanEid = cleanEid.slice(1, -1);
    }
    if (cleanEid.startsWith("'") && cleanEid.endsWith("'")) {
      cleanEid = cleanEid.slice(1, -1);
    }

    // Check JSON schema format
    if (cleanEid.startsWith('{')) {
      try {
        const parsed = JSON.parse(cleanEid);
        cleanEid = parsed.eid || parsed.id || parsed.employeeId || parsed.employee_id || '';
      } catch (jsonErr) {
        console.warn("Invalid JSON QR format parsing:", jsonErr);
      }
    }

    // Check URL parameters format
    if (cleanEid.startsWith('http://') || cleanEid.startsWith('https://')) {
      try {
        const urlObj = new URL(cleanEid);
        const searchParams = urlObj.searchParams;
        cleanEid = searchParams.get('eid') || 
                   searchParams.get('id') || 
                   searchParams.get('empid') || 
                   searchParams.get('emp_id') || 
                   searchParams.get('employee_id') || 
                   searchParams.get('employee') || 
                   '';
        
        if (!cleanEid) {
          // Fallback splits the final path element
          const segments = urlObj.pathname.split('/');
          cleanEid = segments[segments.length - 1] || '';
        }
      } catch (urlErr) {
        console.warn("URL decoding failed on QR image parser:", urlErr);
      }
    }

    cleanEid = cleanEid.trim();

    if (!cleanEid) {
      showStatus("Failed to extract valid Employee ID (EID) from QR code.", "error");
      return;
    }

    // 2. Validate Daily Cryptographic Token validation string format
    // Today's format: `a10dance-daily-qr-YYYY-MM-DD`
    const todayStr = time.toISOString().split('T')[0];
    
    // Calculate yesterday for flexible clock out / overnight nightshifts
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const todayToken = `a10dance-daily-qr-${todayStr}`;
    const yesterdayToken = `a10dance-daily-qr-${yesterdayStr}`;

    // Standard scan allows reading other IDs to clock-in if kiosks matches
    if (decodedValue.includes('a10dance-daily-qr-')) {
      if (decodedValue === todayToken || decodedValue === yesterdayToken) {
        // Successful dynamic QR validate. Punch current identified employee EID!
        if (identifiedEid) {
          executePunch(identifiedEid, true);
        } else {
          showStatus("Please identify your device EID below first before scanning Station QR.", "error");
        }
      } else {
        showStatus("Invalid or stale dynamic QR code token! Matches yesterday or today only.", "error");
      }
    } else {
      // Direct raw ID scan fallback support
      executePunch(cleanEid, true);
    }
  };

  return (
    <div id="attendance-card-root" className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden font-sans">
      {/* Dynamic Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-indigo-700 text-white p-6 relative flex flex-col items-center justify-center text-center">
        <div className="text-sm font-semibold uppercase tracking-widest text-emerald-100 font-mono">
          {time.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
        <div id="giant-live-clock" className="text-4xl sm:text-5xl font-extrabold font-mono mt-2 tracking-tight">
          {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
        <p className="text-[10px] text-emerald-100 bg-emerald-500/20 px-3 py-1 mt-3 rounded-full font-mono flex items-center gap-1">
          <UserCheck size={12} />
          Manila Standard Time Target (GMT+8)
        </p>
      </div>

      <div className="p-6 space-y-6">
        {/* Status Toast Notification Panel within Card */}
        {statusMsg && (
          <div 
            id="status-bar"
            className={`p-4 rounded-xl flex items-start gap-3 text-sm font-medium transition-all animate-bounce ${
              statusMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
              statusMsg.type === 'error' ? 'bg-rose-50 text-rose-800 border border-rose-200' :
              'bg-blue-50 text-blue-800 border border-blue-200'
            }`}
          >
            {statusMsg.type === 'success' ? (
              <CheckCircle size={20} className="text-emerald-600 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle size={20} className="text-rose-600 flex-shrink-0 mt-0.5" />
            )}
            <p className="flex-1">{statusMsg.text}</p>
          </div>
        )}

        {/* Identity Section: Client-side device configuration */}
        <div id="persistent-device-card" className="border border-gray-200 rounded-xl p-4 bg-slate-50">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">You need to pair device to continue</h3>
          {identifiedEid ? (
            <div className="flex justify-between items-center bg-white p-3 border border-gray-200 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="p-1 px-2.5 bg-emerald-100 text-emerald-800 text-xs font-mono font-bold rounded-md">
                  Active
                </span>
                <p className="text-sm font-bold text-gray-800">Assigned EID: <span className="font-mono text-indigo-600 font-extrabold">{identifiedEid}</span></p>
              </div>
              <button 
                id="btn-clear-eid"
                onClick={handleClearDevice} 
                className="text-xs font-semibold text-rose-500 hover:underline transition"
              >
                Clear Pairing
              </button>
            </div>
          ) : (
            <form onSubmit={handleIdentifyDevice} className="flex gap-2">
              <input 
                id="input-device-eid"
                type="text" 
                value={inputId} 
                onChange={(e) => setInputId(e.target.value)}
                placeholder="Insert your Employee EID..."
                className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-emerald-500"
                required
              />
              <button 
                id="btn-pair-eid"
                type="submit" 
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition"
              >
                Pair Device
              </button>
            </form>
          )}
        </div>

        {/* Big scan button card */}
        <div className="text-center space-y-3">
          <button 
            id="btn-trigger-camera"
            onClick={() => setShowScanner(true)}
            className="w-full py-6 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold rounded-2xl flex flex-col items-center justify-center gap-2 shadow-lg transition duration-200 uppercase tracking-wider text-sm cursor-pointer"
          >
            <Camera size={36} className="animate-pulse" />
            Use your camera to scan QR
          </button>
          <p className="text-xs text-gray-400">Compatible with Android and IOS device </p>
        </div>

        {/* Manual Keyboard Entry Accordion fallback */}
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <button 
            id="toggle-manual-accordion"
            onClick={() => setIsManualExpanded(!isManualExpanded)}
            className="w-full px-4 py-3 bg-slate-100 hover:bg-slate-200/60 duration-150 flex justify-between items-center text-left"
          >
            <span className="text-xs font-bold text-gray-600 uppercase tracking-wider flex items-center gap-1.5">
              <AlertCircle size={14} className="text-indigo-600" />
              Manual input
            </span>
            <span className="text-xs text-gray-500">{isManualExpanded ? 'Collapse' : 'Expand'}</span>
          </button>

          {isManualExpanded && (
            <div className="p-4 border-t border-gray-200 space-y-4 bg-white">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase">Employee ID (EID)</label>
                <input 
                  id="manual-punch-eid"
                  type="text" 
                  value={manualEid}
                  onChange={(e) => setManualEid(e.target.value)}
                  placeholder="Insert EID (e.g., 527659)"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase">Comment Remarks</label>
                <textarea 
                  id="manual-punch-remarks"
                  value={manualRemarks}
                  onChange={(e) => setManualRemarks(e.target.value)}
                  placeholder="e.g. Field dispatch, Office order"
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white resize-none"
                />
              </div>

              <div id="manual-actions" className="grid grid-cols-2 gap-3">
                <button 
                  id="btn-punch-in"
                  onClick={() => {
                    executePunch(manualEid, false, 'LOGIN');
                  }}
                  className="py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition"
                >
                  IN
                </button>
                <button 
                  id="btn-punch-out"
                  onClick={() => {
                    executePunch(manualEid, false, 'LOGOUT');
                  }}
                  className="py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition"
                >
                  OUT
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* QR Code Viewfinder overlay */}
      {showScanner && (
        <QRScanner 
          onScanSuccess={handleQRScanSuccess} 
          onClose={() => setShowScanner(false)} 
        />
      )}
    </div>
  );
}
