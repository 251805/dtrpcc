import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Clock, Wifi } from 'lucide-react';

export default function KioskView() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const todayStr = time.toISOString().split('T')[0];
  const qrValue = `a10dance-daily-qr-${todayStr}`;

  return (
    <div id="kiosk-container" className="min-h-screen bg-neutral-900 text-white p-8 flex flex-col items-center justify-center font-sans">
      <div id="kiosk-header" className="flex justify-between items-start w-full max-w-4xl mb-12 border-b border-neutral-800 pb-6">
        <div className="flex items-center gap-4">
          <img 
            id="kiosk-logo"
            src="https://raw.githubusercontent.com/251805/etcfile/main/PCCLogo.png" 
            alt="PCC Logo" 
            className="h-16 w-auto object-contain select-none"
            referrerPolicy="no-referrer"
          />
          <h1 id="kiosk-title" className="text-3xl font-bold tracking-tight">Pagbilao Command Center</h1>
        </div>
        <div id="system-status" className="flex items-center gap-2 text-green-400 bg-green-500/10 px-3 py-1.5 rounded-full border border-green-500/20 mt-1">
          <Wifi size={16} className="animate-pulse" />
          <span className="text-sm font-semibold tracking-wide">Online</span>
        </div>
      </div>

      <div id="kiosk-main" className="grid grid-cols-1 md:grid-cols-2 gap-12 w-full max-w-4xl items-center">
        <div id="kiosk-clock-panel" className="space-y-4">
          <h2 id="kiosk-clock-label" className="text-gray-400 text-lg uppercase tracking-wider">Current Time</h2>
          <div id="kiosk-clock" className="text-6xl font-mono font-bold">
            {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <p id="kiosk-date" className="text-xl text-gray-300">
            {time.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div id="qr-panel" className="bg-white p-6 rounded-xl flex flex-col items-center">
          <QRCodeSVG id="kiosk-qr" value={qrValue} size={256} />
          <p id="qr-label" className="text-neutral-900 mt-4 font-semibold text-center">Please visit 🔗 dtrpcc.vercel.app 🔗 to bind your device.</p>
          <p id="qr-expiry" className="text-neutral-100 text-sm">{todayStr}</p>          
        </div>                          
      </div>      
      
    </div> 
  );
}
