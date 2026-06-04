import React, { useEffect } from 'react';
import { X, Clock, User, CheckCircle, LogIn, LogOut } from 'lucide-react';
import { EMPLOYEE_AVATARS } from '../lib/avatarMapping';

interface EmployeeAvatarModalProps {
  eid: string;
  name: string;
  role: string;
  action: 'LOGIN' | 'LOGOUT';
  timestamp: Date;
  onClose: () => void;
}

export default function EmployeeAvatarModal({
  eid,
  name,
  role,
  action,
  timestamp,
  onClose,
}: EmployeeAvatarModalProps) {
  const avatarUrl = EMPLOYEE_AVATARS[eid];

  const onCloseRef = React.useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Auto-close modal after 2 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      onCloseRef.current();
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div 
      id="employee-avatar-modal" 
      className="fixed inset-0 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm z-50 p-4 animate-fadeIn"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white border border-slate-100 shadow-2xl overflow-hidden relative flex flex-col items-center">
        
        {/* Border accent matching action type */}
        <div 
          className={`w-full h-2 bg-gradient-to-r ${
            action === 'LOGIN' ? 'from-emerald-500 to-teal-500' : 'from-rose-500 to-amber-500'
          }`} 
        />

        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 rounded-full p-2 hover:bg-slate-50 transition-colors z-10"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="p-6 flex flex-col items-center text-center w-full">
          {/* Status Badge */}
          <div 
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold tracking-wider uppercase mb-4 ${
              action === 'LOGIN' 
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                : 'bg-rose-50 text-rose-700 border border-rose-100'
            }`}
          >
            {action === 'LOGIN' ? (
              <>
                <LogIn className="h-3.5 w-3.5" />
                <span>Clocked IN (Login)</span>
              </>
            ) : (
              <>
                <LogOut className="h-3.5 w-3.5" />
                <span>Clocked OUT (Logout)</span>
              </>
            )}
          </div>

          {/* Secure Photo Frame */}
          <div className="relative w-48 h-48 bg-slate-50 rounded-2xl border border-slate-150 shadow-inner overflow-hidden flex items-center justify-center mb-4 group">
            <div 
              className={`absolute inset-0 bg-gradient-to-tr pointer-events-none ${
                action === 'LOGIN' ? 'from-emerald-500/5' : 'from-rose-500/5'
              }`} 
            />
            
            {avatarUrl ? (
              <img 
                src={avatarUrl} 
                alt={`${name} Avatar`}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover select-none transition-transform duration-500 group-hover:scale-105"
                onError={(e) => {
                  console.warn(`Direct raw image fetch fallback active for EID: ${eid}`);
                  // In case GitHub raw fetch fails, gracefully hide broken link and fallback to initials
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-400">
                <User size={48} className="stroke-[1.5]" />
              </div>
            )}
          </div>

          {/* Employee Meta Info */}
          <h3 className="font-sans font-extrabold text-lg text-slate-900 tracking-tight leading-snug mb-0.5 uppercase">
            {name}
          </h3>
          <p className="font-sans text-xs text-slate-500 font-medium mb-1 tracking-wide uppercase">
            {role}
          </p>
          <div className="inline-block bg-slate-100 text-slate-700 font-mono text-[10px] font-bold px-2 py-0.5 rounded-md mb-4">
            EID: {eid}
          </div>

          {/* Timestamp Indicator */}
          <div className="flex items-center justify-center space-x-1.5 text-slate-500 font-mono text-xs bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 w-full">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            <span>
              Recorded at: {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>

          {/* Close Trigger Button */}
          <button
            onClick={onClose}
            className={`w-full text-white font-sans text-xs font-bold py-3 mt-4 rounded-xl shadow-md transition-all active:scale-[0.98] ${
              action === 'LOGIN'
                ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/15'
                : 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/15'
            }`}
          >
            Continue
          </button>
        </div>

      </div>
    </div>
  );
}
