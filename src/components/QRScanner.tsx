import React, { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { Camera, Image, X, Music } from 'lucide-react';

interface QRScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

export default function QRScanner({ onScanSuccess, onClose }: QRScannerProps) {
  const [useUpload, setUseUpload] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const qrScannerRef = useRef<Html5QrcodeScanner | null>(null);

  // Trigger synth chirp using browser Web Audio API as per manual
  const playChirp = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // High pitch chirp A5
      osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.15);
      
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch (e) {
      console.warn("AudioContext chirp failed:", e);
    }
  };

  useEffect(() => {
    if (!useUpload) {
      const scanner = new Html5QrcodeScanner(
        "qr-reader-element",
        { 
          fps: 10, 
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0
        },
        /* verbose= */ false
      );

      scanner.render(
        (decodedText) => {
          playChirp();
          onScanSuccess(decodedText);
          scanner.clear().catch(e => console.warn("Scanner clear failed:", e));
          onClose();
        },
        (error) => {
          // Dev console diagnostic, we don't spam UI
        }
      );

      qrScannerRef.current = scanner;
    }

    return () => {
      if (qrScannerRef.current) {
        qrScannerRef.current.clear().catch(err => {
          console.warn("Failed to clear html5-qrcode renderer on clean up:", err);
        });
      }
    };
  }, [useUpload]);

  // Fallback scanner from snapshot file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    import('html5-qrcode').then(({ Html5Qrcode }) => {
      const html5QrCode = new Html5Qrcode("upload-checker-placeholder");
      html5QrCode.scanFile(file, true)
        .then(decodedText => {
          playChirp();
          onScanSuccess(decodedText);
          onClose();
        })
        .catch(err => {
          console.error("Decode failed:", err);
          setErrorMessage("Failed to read QR Code from this snapshot image. Try alignment or use direct Camera scan.");
        });
    });
  };

  return (
    <div id="scanner-modal" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sans text-neutral-900">
      <div id="scanner-panel" className="relative bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col">
        {/* Modal Header */}
        <div id="scanner-header" className="flex justify-between items-center p-4 border-b border-gray-100 bg-neutral-900 text-white">
          <div className="flex items-center gap-2">
            <Camera className="text-emerald-400" />
            <h3 className="font-semibold text-lg">PCC DTR Scanner</h3>
          </div>
          <button id="close-scanner" onClick={onClose} className="text-gray-400 hover:text-white transition">
            <X size={24} />
          </button>
        </div>

        {/* Scan Mode Switcher */}
        <div id="scan-mode-tabs" className="flex border-b border-gray-100">
          <button 
            id="tab-camera"
            onClick={() => setUseUpload(false)}
            className={`flex-1 py-3 text-center text-sm font-medium border-b-2 flex justify-center items-center gap-2 transition ${!useUpload ? 'border-emerald-500 text-emerald-600 bg-emerald-50/20' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            <Camera size={16} />
            Live Viewfinder
          </button>
          <button 
            id="tab-upload"
            onClick={() => setUseUpload(true)}
            className={`flex-1 py-3 text-center text-sm font-medium border-b-2 flex justify-center items-center gap-2 transition ${useUpload ? 'border-emerald-500 text-emerald-600 bg-emerald-50/20' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            <Image size={16} />
            Photo/Snapshot Upload
          </button>
        </div>

        {/* Main Scanner Container */}
        <div id="scanner-viewport-body" className="p-6 flex flex-col items-center justify-center min-h-[340px]">
          {!useUpload ? (
            <div className="w-full">
              <div id="qr-reader-element" className="w-full overflow-hidden rounded-lg"></div>
              <p className="text-center text-xs text-gray-400 mt-4 leading-relaxed">
                Position the rolling station QR code clearly inside the flashing scanner viewfinder template.
              </p>
            </div>
          ) : (
            <div className="w-full text-center space-y-4">
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 flex flex-col items-center hover:border-emerald-400 transition cursor-pointer relative bg-slate-50">
                <input 
                  id="snapshot-file-input"
                  type="file" 
                  accept="image/*" 
                  onChange={handleFileUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <Image className="text-gray-400 mb-2" size={48} />
                <span className="font-semibold text-emerald-600 text-sm">Select image snapshot</span>
                <span className="text-xs text-gray-400 mt-1">Take photo or select screenshot</span>
              </div>

              {errorMessage && (
                <div id="upload-error" className="p-3 bg-red-50 text-red-700 rounded-lg text-sm font-medium">
                  {errorMessage}
                </div>
              )}

              <div id="upload-checker-placeholder" className="hidden"></div>
              <p className="text-xs text-gray-400 leading-relaxed">
                Useful if security policies block active camera streams. Ensure the barcode matrix is cleanly visible and not skewed.
              </p>
            </div>
          )}
        </div>

        {/* Footer info tag */}
        <div className="bg-slate-50 px-6 py-3 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-500">
          <Music size={14} className="text-emerald-500" />
          <span>Equipped with sub-second feedback buzzer chirp audio.</span>
        </div>
      </div>
    </div>
  );
}
