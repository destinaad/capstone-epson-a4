import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useParts } from '../hooks/useParts';

function drawBoxes(canvas, detections) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  detections.forEach((item) => {
    const [x1, y1, x2, y2] = item.bbox;
    ctx.strokeStyle = 'rgba(0, 255, 150, 0.95)';
    ctx.lineWidth = 3;
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

    const label = `${item.label} ${Math.round(item.confidence * 100)}%`;
    ctx.font = 'bold 14px Inter, sans-serif';
    const textWidth = ctx.measureText(label).width + 12;
    const textHeight = 20;
    const yText = Math.max(0, y1 - textHeight - 6);

    ctx.fillStyle = 'rgba(0, 255, 150, 0.9)';
    ctx.fillRect(x1, yText, textWidth, textHeight + 6);
    ctx.fillStyle = '#0b0f11';
    ctx.fillText(label, x1 + 6, yText + 16);
  });
}

function formatDetails(detections) {
  if (!detections || detections.length === 0) return 'No parts detected yet.';
  return detections
    .map((item) => `${item.label} (${Math.round(item.confidence * 100)}%)`)
    .join(', ');
}

export default function VisionCamera({ active = true }) {
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const saveTimerRef = useRef(null);
  const lastCountRef = useRef(null);
  const lastSavedCountRef = useRef(null);
  const stablePayloadRef = useRef(null);

  const [status, setStatus] = useState('Preparing camera...');
  const CONFIDENCE_REVIEW_THRESHOLD = 0.65;
  const [count, setCount] = useState(null);
  const [detections, setDetections] = useState([]);
  const currentConfidence = detections?.[0]?.confidence ?? null;
  const lowConfidence = currentConfidence != null && currentConfidence < CONFIDENCE_REVIEW_THRESHOLD;
  const highConfidence = currentConfidence != null && currentConfidence >= 0.85;
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState('');
  const [streamReady, setStreamReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedHistory, setSavedHistory] = useState([]);
  const [autosaveEnabled, setAutosaveEnabled] = useState(true);
  // default autosave OFF to avoid unintended saves on login
  // users can enable it manually
  // note: initialized false to respect user's request
  // but keep backward compatibility if persisted elsewhere
  // (component-level default only)
  // override initial value
  useEffect(() => {
    setAutosaveEnabled(false);
  }, []);

  const { user } = useAuth();
  const { parts } = useParts();

  const cameraWidth = 640;
  const cameraHeight = 480;

  const updateOverlaySize = useCallback(() => {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!video || !overlay) return;
    const vidW = video.videoWidth || cameraWidth;
    const vidH = video.videoHeight || cameraHeight;
    // set internal canvas resolution to the video's native resolution
    overlay.width = vidW;
    overlay.height = vidH;
    // make the canvas CSS size match the displayed video element size
    // this keeps drawn boxes aligned to CSS pixels
    overlay.style.width = `${video.clientWidth}px`;
    overlay.style.height = `${video.clientHeight}px`;
  }, [cameraHeight, cameraWidth]);

  const clearSaveTimer = useCallback(() => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  // Find part by matching YOLO label or part code
  const findPartByLabel = useCallback((label, parts) => {
    if (!parts || parts.length === 0) return null;
    const labelLower = String(label || '').toLowerCase();
    // Try exact match by part_code
    const exactMatch = parts.find((p) => p.part_code.toLowerCase() === labelLower);
    if (exactMatch) return exactMatch;
    // Try fuzzy match (label contains part name or code)
    const fuzzyMatch = parts.find((p) => 
      labelLower.includes(p.part_code.toLowerCase()) || 
      labelLower.includes(p.part_name.toLowerCase())
    );
    if (fuzzyMatch) return fuzzyMatch;
    // Default to SPUR-GEAR-001 if present
    const spur = parts.find((p) => p.part_code === 'SPUR-GEAR-001');
    return spur || parts[0] || null;
  }, []);

  const captureSnapshotForm = useCallback(async () => {
    if (!videoRef.current || videoRef.current.readyState < 2) return null;
    const video = videoRef.current;
    const offscreen = document.createElement('canvas');
    offscreen.width = video.videoWidth || cameraWidth;
    offscreen.height = video.videoHeight || cameraHeight;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, offscreen.width, offscreen.height);
    const blob = await new Promise((resolve) => offscreen.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) return null;
    const form = new FormData();
    form.append('file', blob, 'snapshot.jpg');
    return form;
  }, [cameraHeight, cameraWidth]);

  const saveStableDetection = useCallback(async (payload) => {
    // Safety: only save when payload valid and stream is ready
    if (!payload || payload.count == null) return;
    if (!streamReady) return;
    if (payload.count === lastSavedCountRef.current) return;
    setSaving(true);
    try {
      const form = await captureSnapshotForm();
      if (!form) throw new Error('Failed to capture snapshot');
      form.append('count', String(payload.count));
      form.append('detections', JSON.stringify(payload.detections || []));

      const { data } = await api.post('/detections/upload', form);

      lastSavedCountRef.current = payload.count;
      setSavedHistory((prev) => [data, ...prev].slice(0, 4));
      const confidenceScore = payload?.detections?.[0]?.confidence ?? null;
      const lowConfidence = confidenceScore != null && confidenceScore < CONFIDENCE_REVIEW_THRESHOLD;
      setStatus(
        lowConfidence
          ? `Saved stable count ${data.count} with low confidence — marked REVIEW`
          : `Saved stable count ${data.count} to dashboard`
      );
      
      // Auto-create inspection from saved detection
      if (user) {
        const savedCount = data.count ?? 0;
        let selectedPart = null;
        if (payload?.detections?.length > 0) {
          selectedPart = findPartByLabel(payload.detections[0].label, parts);
        }
        if (!selectedPart && parts?.length > 0) {
          selectedPart = parts.find((p) => p.part_code === 'SPUR-GEAR-001') || parts[0];
        }

        const confidenceScore = payload?.detections?.[0]?.confidence ?? null;
        const lowConfidence = confidenceScore != null && confidenceScore < CONFIDENCE_REVIEW_THRESHOLD;
        const inspectionPayload = {
          part_id: selectedPart?.id || null,
          operator_id: user.id,
          detected_quantity: Number(savedCount),
          shift: 1,
          image_url: data.image_path || data.image_url || null,
          ai_confidence_score: confidenceScore,
          status: lowConfidence ? 'REVIEW' : undefined,
        };

        try {
          console.debug('Creating inspection (manual save):', inspectionPayload);
          const resp = await api.post('/inspections/', inspectionPayload);
          console.log('Auto-create inspection response:', resp && resp.data);
          // notify dashboard to reload inspections immediately
          window.dispatchEvent(new Event('inspections:reload'));
        } catch (inspErr) {
          console.error('Auto-log inspection failed:', inspErr);
        }
      }
    } catch (err) {
      const message = err.response?.data?.detail || err.message || 'Save failed';
      setError(message);
      setStatus('Failed to save detection');
    } finally {
      setSaving(false);
    }
  }, [streamReady, user, parts, findPartByLabel, captureSnapshotForm]);

  useEffect(() => {
    let mounted = true;
    let stream = null;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: cameraWidth, height: cameraHeight },
          audio: false,
        });
        if (!mounted) return;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            updateOverlaySize();
          };
          await videoRef.current.play();
          updateOverlaySize();
        }
        setStreamReady(true);
        setStatus('Camera ready. Detecting parts...');
      } catch (err) {
        setError(err.message ?? 'Unable to open webcam');
        setStatus('Camera unavailable');
      }
    }

    startCamera();
    return () => {
      mounted = false;
      clearSaveTimer();
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [cameraHeight, cameraWidth, clearSaveTimer, updateOverlaySize]);

  useEffect(() => {
    if (!active) {
      clearSaveTimer();
      setStatus('Detection paused');
    } else if (streamReady) {
      setStatus('Camera ready. Detecting parts...');
    }
  }, [active, streamReady, clearSaveTimer]);

  const captureAndDetect = useCallback(async () => {
    if (!active || !streamReady) return;
    if (!videoRef.current || videoRef.current.readyState < 2) return;
    // keep overlay sized to the displayed video
    updateOverlaySize();
    const video = videoRef.current;
    const offscreen = document.createElement('canvas');
    offscreen.width = video.videoWidth || cameraWidth;
    offscreen.height = video.videoHeight || cameraHeight;
    const ctx = offscreen.getContext('2d');
    ctx.drawImage(video, 0, 0, offscreen.width, offscreen.height);

    const blob = await new Promise((resolve) =>
      offscreen.toBlob(resolve, 'image/jpeg', 0.85)
    );
    if (!blob) return;

    const form = new FormData();
    form.append('file', blob, 'frame.jpg');

    try {
      const response = await api.post('/detect/', form);
      const payload = response.data;
      setCount(payload.count);
      setDetections(payload.detections || []);
      setLastUpdated(new Date().toLocaleTimeString());
      drawBoxes(overlayRef.current, payload.detections || []);

      if (payload.count === lastCountRef.current) {
        // avoid autosave when detected count is zero
        if (
          autosaveEnabled &&
          streamReady &&
          payload.count > 0 &&
          payload.count !== lastSavedCountRef.current &&
          !saveTimerRef.current
        ) {
          stablePayloadRef.current = payload;
          setStatus(`Stable at ${payload.count} parts — saving soon...`);
          saveTimerRef.current = window.setTimeout(() => {
            saveStableDetection(stablePayloadRef.current);
            saveTimerRef.current = null;
          }, 3000);
        } else if (!autosaveEnabled) {
          setStatus(`Stable at ${payload.count} parts — autosave disabled`);
        } else if (!streamReady) {
          setStatus('Stable but camera not ready — not saving');
        }
      } else {
        clearSaveTimer();
        lastCountRef.current = payload.count;
        setStatus(`Detected ${payload.count} parts — waiting for stable count`);
      }
    } catch (err) {
      setError(err.message ?? 'Detection failed');
      setStatus('Detection error');
    }
  }, [active, autosaveEnabled, cameraHeight, cameraWidth, clearSaveTimer, saveStableDetection, streamReady]);

  useEffect(() => {
    function onResize() {
      updateOverlaySize();
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [updateOverlaySize]);

  const saveNow = useCallback(async () => {
    if (!videoRef.current || videoRef.current.readyState < 2) return;
    setSaving(true);
    try {
      const video = videoRef.current;
      const offscreen = document.createElement('canvas');
      offscreen.width = video.videoWidth || cameraWidth;
      offscreen.height = video.videoHeight || cameraHeight;
      const ctx = offscreen.getContext('2d');
      ctx.drawImage(video, 0, 0, offscreen.width, offscreen.height);

      const blob = await new Promise((resolve) => offscreen.toBlob(resolve, 'image/jpeg', 0.9));
      if (!blob) throw new Error('Failed to capture image');

      const form = new FormData();
      form.append('file', blob, 'snapshot.jpg');
      form.append('count', String(count ?? 0));
      form.append('detections', JSON.stringify(detections || []));

      const response = await api.post('/detections/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = response.data;
      lastSavedCountRef.current = data.count;
      setSavedHistory((prev) => [data, ...prev].slice(0, 4));
      const confidenceScore = data?.detections?.[0]?.confidence ?? null;
      const lowConfidence = confidenceScore != null && confidenceScore < CONFIDENCE_REVIEW_THRESHOLD;
      setStatus(
        lowConfidence
          ? `Saved snapshot (${data.count}) with low confidence — marked REVIEW`
          : `Saved snapshot (${data.count}) to dashboard`
      );

      // Auto-create inspection from manual save
      if (user) {
        const savedCount = data.count ?? 0;
        let selectedPart = null;
        
        // Try to find part from detection label
        if (data?.detections?.length > 0) {
          selectedPart = findPartByLabel(data.detections[0].label, parts);
        }
        
        // Fallback to SPUR-GEAR-001 or first part
        if (!selectedPart && parts?.length > 0) {
          selectedPart = parts.find((p) => p.part_code === 'SPUR-GEAR-001') || parts[0];
        }

        // Create inspection even if no part found (for selfie/unknown cases)
        const confidenceScore = data?.detections?.[0]?.confidence ?? null;
        const lowConfidence = confidenceScore != null && confidenceScore < CONFIDENCE_REVIEW_THRESHOLD;
        const inspectionPayload = {
          part_id: selectedPart?.id || null,
          operator_id: user.id,
          detected_quantity: Number(savedCount),
          shift: 1,
          image_url: data.image_path || data.image_url || null,
          ai_confidence_score: confidenceScore,
          status: lowConfidence ? 'REVIEW' : undefined,
        };

        try {
          await api.post('/inspections/', inspectionPayload);
          // make dashboard refresh immediately
          window.dispatchEvent(new Event('inspections:reload'));
          setStatus(`Inspection logged (${savedCount} parts, ${selectedPart?.part_code || 'Unknown'})`);
        } catch (inspErr) {
          console.error('Auto-log inspection failed:', inspErr);
          // Don't block even if inspection creation fails
        }
      }
    } catch (err) {
      setError(err.message ?? 'Save failed');
      setStatus('Save failed');
    } finally {
      setSaving(false);
    }
  }, [cameraHeight, cameraWidth, count, detections, user, parts, findPartByLabel]);

  useEffect(() => {
    if (!streamReady || !active) return undefined;
    const interval = window.setInterval(captureAndDetect, 1400);
    return () => {
      window.clearInterval(interval);
      clearSaveTimer();
    };
  }, [streamReady, active, captureAndDetect, clearSaveTimer]);

  const stats = useMemo(() => {
    if (count == null) return 'Waiting for detection...';
    return `${count} parts detected`;
  }, [count]);

  return (
    <div className="overflow-hidden rounded-xl border border-electric/25 bg-charcoal-surface shadow-lg shadow-black/30">
      <div className="grid gap-0 md:grid-cols-5">
        <div className="relative flex min-h-[340px] items-center justify-center bg-black/50 md:col-span-3">
          <div className="relative w-full h-full" style={{ minHeight: '340px' }}>
            <video
              ref={videoRef}
              muted
              playsInline
              className="w-full h-full object-cover bg-black"
              style={{ display: 'block' }}
            />
            <canvas
              ref={overlayRef}
              className="pointer-events-none absolute left-0 top-0"
              style={{ position: 'absolute', transformOrigin: 'top left' }}
            />
          </div>
        </div>

        <div className="flex flex-col justify-between space-y-3 p-4 md:col-span-2">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-electric/20 px-2 py-0.5 text-xs font-semibold text-electric">
                Live
              </span>
              <span className="text-xs text-gray-500 truncate">{lastUpdated || '—'}</span>
              <span className="text-xs text-gray-500">{count != null ? `${count} parts` : 'Waiting...'}</span>
            </div>

            {highConfidence && (
              <div className="rounded-lg border border-sky-500/30 bg-sky-600/10 p-3 text-sm text-sky-100">
                <div className="font-semibold">High confidence</div>
                <div className="mt-1 text-xs text-sky-100/90">
                  Current detection at {Math.round(currentConfidence * 100)}% confidence — look good.
                </div>
              </div>
            )}

            {lowConfidence && (
              <div className="rounded-lg border border-amber-400/40 bg-amber-600/10 p-3 text-sm text-amber-100">
                <div className="font-semibold">Low confidence</div>
                <div className="mt-1 text-xs text-amber-100/90">
                  Current frame is below {Math.round(CONFIDENCE_REVIEW_THRESHOLD * 100)}%.
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-charcoal-elevated p-3 text-xs">
                <p className="uppercase tracking-wide text-gray-500">Status</p>
                <p className="mt-1 text-sm font-semibold text-white">{status}</p>
              </div>
              <div className="rounded-lg bg-charcoal-elevated p-3 text-xs">
                <p className="uppercase tracking-wide text-gray-500">Confidence</p>
                <p className="mt-1 text-sm font-semibold text-electric">
                  {currentConfidence != null ? `${Math.round(currentConfidence * 100)}%` : '—'}
                </p>
              </div>
              <div className="rounded-lg bg-charcoal-elevated p-3 text-xs">
                <p className="uppercase tracking-wide text-gray-500">Saved</p>
                <p className="mt-1 text-sm font-semibold text-emerald-400">{lastSavedCountRef.current ?? 0} parts</p>
              </div>
              <div className="rounded-lg bg-charcoal-elevated p-3 text-xs">
                <p className="uppercase tracking-wide text-gray-500">Top label</p>
                <p className="mt-1 truncate text-sm font-semibold text-white">
                  {detections?.[0]?.label || '—'}
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  {detections?.[0]?.confidence != null ? `${Math.round(detections[0].confidence * 100)}%` : ''}
                </p>
              </div>
            </div>

            <div className="rounded-lg bg-charcoal-elevated p-3 text-xs text-gray-300">
              <p className="uppercase tracking-wide text-gray-500">Detection details</p>
              <p className="mt-1 text-sm text-white">{formatDetails(detections)}</p>
            </div>
          </div>

          <div className="grid gap-2">
            <button
              onClick={saveNow}
              disabled={saving}
              className="rounded-md bg-emerald-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 w-full"
            >
              {saving ? 'Saving...' : 'Save now'}
            </button>
            <button
              onClick={() => setAutosaveEnabled((s) => !s)}
              className={`rounded-md px-2 py-1.5 text-xs font-semibold text-white w-full ${autosaveEnabled ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-gray-600 hover:bg-gray-700'}`}
            >
              {autosaveEnabled ? 'Auto ON' : 'Auto OFF'}
            </button>
            <p className="text-xs text-gray-500">
              Snapshot otomatis membuat inspection record dengan image.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
