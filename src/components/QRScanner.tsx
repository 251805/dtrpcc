import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, Image, X, Music, RefreshCw } from 'lucide-react';

interface QRScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

export default function QRScanner({ onScanSuccess, onClose }: QRScannerProps) {
  const [useUpload, setUseUpload] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  // Audio Feedback Synthesizer (Zero-Asset Web Audio API) with dual-frequency resonant chirp
  const playSynthesizedChirp = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = 'sine';
      // Dual-frequency resonant chirp (880Hz up to 1400Hz in 120ms)
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1400, ctx.currentTime + 0.12);
      
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch (e) {
      console.warn('Audio feedback blocked by device media permissions:', e);
    }
  };

  // Query hardware webcams and select best match
  useEffect(() => {
    if (useUpload) {
      stopCameraScanner();
      return;
    }

    Html5Qrcode.getCameras()
      .then((devices) => {
        if (devices && devices.length > 0) {
          setCameras(devices);
          // Auto-prefer rear camera if available for intuitive scanning
          const backCam = devices.find(d => 
            d.label.toLowerCase().includes('back') || 
            d.label.toLowerCase().includes('rear') ||
            d.label.toLowerCase().includes('environment') ||
            d.label.toLowerCase().includes('camera 2') // some dual cams
          );
          const preferredId = backCam ? backCam.id : devices[0].id;
          setSelectedCameraId(preferredId);
        } else {
          setErrorMessage("No physical camera devices found. We have auto-switched you to the backup Snapshot Upload parser.");
          setUseUpload(true);
        }
      })
      .catch((err) => {
        console.warn("Failed to query hardware webcams:", err);
        const errMsg = err.message || String(err);
        setErrorMessage(`Camera initialization error: ${errMsg}. Running inside a preview iframe limits webcam access on some mobile browsers. Try opening this app in a separate browser tab, or use the Snapshot Upload fallback below.`);
        setUseUpload(true);
      });

    return () => {
      stopCameraScanner();
    };
  }, [useUpload]);

  // Restart camera whenever selected ID changes
  useEffect(() => {
    if (selectedCameraId && !useUpload) {
      startCameraScanner(selectedCameraId);
    }
    return () => {
      stopCameraScanner();
    };
  }, [selectedCameraId, useUpload]);

  const startCameraScanner = async (cameraId: string) => {
    await stopCameraScanner();

    try {
      const scanner = new Html5Qrcode("qr-reader-surface");
      scannerRef.current = scanner;
      setIsScanning(true);
      setErrorMessage(null);

      await scanner.start(
        cameraId,
        { 
          fps: 10, 
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0
        },
        (decodedText) => {
          playSynthesizedChirp(); // Instant auditory check
          onScanSuccess(decodedText); // Deliver scan to core state
          stopCameraScanner();
          onClose();
        },
        (err) => { 
          // Continual scanning ticks - don't spam errors
        }
      );
    } catch (err: any) {
      console.warn("Failed to start camera stream feed:", err);
      setErrorMessage(`Failed to active video stream format: ${err.message || err}`);
      setIsScanning(false);
    }
  };

  const stopCameraScanner = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
      } catch (err) {
        console.warn("Failed to stop scan feed gracefully:", err);
      } finally {
        scannerRef.current = null;
        setIsScanning(false);
      }
    }
  };

  // Snapshot file upload scan
  const handleFileUploadScan = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    const html5Qr = new Html5Qrcode("upload-checker-placeholder");
    html5Qr.scanFile(file, true)
      .then((decodedText) => {
        playSynthesizedChirp();
        onScanSuccess(decodedText);
        onClose();
      })
      .catch((err) => {
        console.error("Decode upload failed:", err);
        setErrorMessage('Could not locate a valid digital barcode matrix in this snapshot. Please try an unblurred high-contrast picture.');
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
          <button id="close-scanner" onClick={onClose} className="text-gray-400 hover:text-white transition cursor-pointer p-1 rounded-md hover:bg-neutral-800">
            <X size={24} />
          </button>
        </div>

        {/* Scan Mode Tabs Selector */}
        <div id="scan-mode-tabs" className="flex border-b border-gray-100">
          <button 
            id="tab-camera"
            onClick={() => setUseUpload(false)}
            className={`flex-1 py-3 text-center text-sm font-semibold border-b-2 flex justify-center items-center gap-2 transition ${!useUpload ? 'border-emerald-500 text-emerald-600 bg-emerald-50/20' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
          >
            <Camera size={16} />
            Live Camera Feed
          </button>
          <button 
            id="tab-upload"
            onClick={() => setUseUpload(true)}
            className={`flex-1 py-3 text-center text-sm font-semibold border-b-2 flex justify-center items-center gap-2 transition ${useUpload ? 'border-emerald-500 text-emerald-600 bg-emerald-50/20' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
          >
            <Image size={16} />
            Snapshot Upload
          </button>
        </div>

        {/* Main Interface Port */}
        <div id="scanner-viewport-body" className="p-6 flex flex-col items-center justify-center min-h-[350px] bg-slate-50">
          {!useUpload ? (
            <div className="w-full space-y-4">
              {/* Camera hardware drop-down selection when multiple choices are present */}
              {cameras.length > 1 && (
                <div id="camera-selector-pane" className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Selected Video Lens Source</label>
                  <select 
                    id="camera-device-select"
                    value={selectedCameraId}
                    onChange={(e) => setSelectedCameraId(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-semibold focus:outline-emerald-500"
                  >
                    {cameras.map(cam => (
                      <option key={cam.id} value={cam.id}>
                        {cam.label || `Camera ${cam.id.slice(0, 8)}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Viewfinder Target Container */}
              <div className="relative overflow-hidden rounded-xl border-4 border-white shadow-md bg-neutral-900 aspect-square max-w-[280px] mx-auto w-full">
                <div id="qr-reader-surface" className="w-full h-full object-cover"></div>
                {isScanning && (
                  <div className="absolute inset-0 border-2 border-emerald-400 rounded-lg pointer-events-none animate-pulse">
                    <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-emerald-400 opacity-60 shadow-md animate-bounce"></div>
                  </div>
                )}
              </div>

              {errorMessage && (
                <div id="camera-error" className="p-3 bg-rose-50 border border-rose-100 text-rose-700 rounded-lg text-xs font-medium text-center">
                  {errorMessage}
                </div>
              )}

              <p className="text-center text-xs text-gray-400 leading-relaxed max-w-sm mx-auto">
                Aim the active camera feed directly at matching Pagbilao DTR Terminal barcodes or Station QR codes to record check-in events.
              </p>
            </div>
          ) : (
            <div className="w-full text-center space-y-4">
              <div className="border-2 border-dashed border-gray-300 rounded-2xl p-8 flex flex-col items-center hover:border-emerald-400 transition cursor-pointer relative bg-white shadow-sm">
                <input 
                  id="snapshot-file-input"
                  type="file" 
                  accept="image/*" 
                  onChange={handleFileUploadScan}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <Image className="text-emerald-500 mb-3" size={44} />
                <span className="font-bold text-neutral-800 text-sm">Select image snapshot file</span>
                <span className="text-[11px] text-gray-400 mt-1">Upload an image file containing the QR code</span>
              </div>

              {errorMessage && (
                <div id="upload-error" className="p-3 bg-rose-50 border border-rose-100 text-rose-700 rounded-lg text-xs font-semibold">
                  {errorMessage}
                </div>
              )}

              <div id="upload-checker-placeholder" className="hidden"></div>
              <p className="text-xs text-gray-400 leading-relaxed max-w-sm mx-auto">
                Alternative scan mechanism. Particularly useful for devices that limit direct browser camera accessibility due to privacy settings.
              </p>
            </div>
          )}
        </div>

        {/* Footer info chirp indicator */}
        <div className="bg-slate-50 px-6 py-3 border-t border-gray-100 flex items-center gap-2 text-[11px] font-semibold text-gray-500">
          <Music size={14} className="text-emerald-500 animate-spin" style={{ animationDuration: '3s' }} />
          <span>Equipped with real-time synthesized buzzer chime audio feedback.</span>
        </div>
      </div>
    </div>
  );
}
