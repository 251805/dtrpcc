import { Shield, FileText, Smartphone, Monitor } from 'lucide-react';

interface TopNavProps {
  onOpenAdmin: () => void;
  onOpenReport: () => void;
}

export default function TopNav({ onOpenAdmin, onOpenReport }: TopNavProps) {
  const handleOpenKiosk = () => {
    window.open(`${window.location.origin}${window.location.pathname}?kiosk=true`, '_blank');
  };

  return (
    <header id="app-header" className="w-full bg-neutral-900 text-white border-b border-neutral-800 px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4 shadow-md font-sans">
      <div className="flex items-center gap-3">
        <div className="p-1 bg-white rounded-lg flex items-center justify-center shadow-xs">
          <img 
            src="https://raw.githubusercontent.com/251805/etcfile/main/PCCLogo.png" 
            alt="PCC Logo" 
            className="w-10 h-10 object-contain"
            referrerPolicy="no-referrer"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = "https://github.com/251805/etcfile/blob/main/PCCLogo.png?raw=true";
            }}
          />
        </div>
        <div>
          <h1 className="text-lg font-extrabold tracking-tight">PCC DTR Tracking System</h1>
          <p className="text-[10px] text-gray-400 font-mono">PAGBILAO COMMAND CENTER • MANILA GMT+8</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button 
          id="btn-nav-kiosk"
          onClick={handleOpenKiosk}
          className="flex items-center gap-1 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-gray-300 hover:text-white text-xs font-semibold rounded-lg transition"
        >
          <Monitor size={14} />
          Open Kiosk Display
        </button>
        <button 
          id="btn-nav-report"
          onClick={onOpenReport}
          className="flex items-center gap-1 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-gray-300 hover:text-white text-xs font-semibold rounded-lg transition"
        >
          <FileText size={14} />
          Monthly Report Matrix
        </button>
        <button 
          id="btn-nav-admin"
          onClick={onOpenAdmin}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition shadow-sm"
        >
          <Shield size={14} />
          Admin Console
        </button>
      </div>
    </header>
  );
}
