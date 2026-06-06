import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera } from 'lucide-react';
import { api, apiBaseUrl } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { isManager, isSupervisor } from '../utils/roles';
import { useInspections } from '../hooks/useInspections';
import { useDetections } from '../hooks/useDetections';
import VisionCamera from '../components/VisionCamera';

function qtyDiscrepancy(row) {
  const t = row.target_quantity;
  if (t == null) return null;
  return t - row.detected_quantity;
}

function formatConfidence(raw) {
  if (raw == null) return '—';
  const n = Number(raw);
  if (Number.isNaN(n)) return '—';
  const pct = n <= 1 && n >= 0 ? n * 100 : n;
  return `${pct.toFixed(1)}%`;
}

function formatUuid(id) {
  if (!id) return '—';
  const s = String(id);
  return s.slice(-6).toUpperCase();
}

function formatPercentage(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toFixed(1)}%`;
}

function getDashboardMetrics(rows, detections) {
  const total = rows.length;
  const okCount = rows.filter((row) => String(row.status || '').toUpperCase() === 'OK').length;
  const ngCount = rows.filter((row) => String(row.status || '').toUpperCase() === 'NG').length;
  const avgDiscrepancy =
    total > 0
      ? rows.reduce((sum, row) => sum + (row.discrepancy ?? 0), 0) / total
      : 0;
  const okRate = total > 0 ? (okCount / total) * 100 : 0;
  return {
    total,
    okCount,
    ngCount,
    okRate,
    avgDiscrepancy,
    detectionSnapshots: detections.length,
  };
}

function MetricCard({ label, value, detail, color }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-charcoal-surface p-5 shadow-sm shadow-black/10">
      <p className="text-xs uppercase tracking-[0.25em] text-gray-500">{label}</p>
      <p className="mt-4 text-3xl font-semibold text-white">{value}</p>
      {detail && <p className="mt-2 text-sm text-gray-400">{detail}</p>}
    </div>
  );
}

function buildAbsoluteUrl(url) {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${apiBaseUrl.replace(/\/$/, '')}${url.startsWith('/') ? '' : '/'}${url}`;
}

function LiveFeedCard({ row }) {
  const navigate = useNavigate();
  if (!row) {
    return (
      <div className="rounded-xl border border-white/10 bg-charcoal-surface p-8 text-center text-sm text-gray-500">
        No inspections yet. The live feed will show the latest image and AI
        score when data arrives.
      </div>
    );
  }

  const st = String(row.status || '').toUpperCase();
  const cls =
    st === 'OK'
      ? 'rounded-full bg-qc-ok/20 px-2.5 py-0.5 text-xs font-semibold text-qc-ok'
      : st === 'NG'
      ? 'rounded-full bg-qc-ng/20 px-2.5 py-0.5 text-xs font-semibold text-qc-ng'
      : st === 'SNAPSHOT'
      ? 'rounded-full bg-yellow-600/20 px-2.5 py-0.5 text-xs font-semibold text-yellow-300'
      : st === 'REVIEW'
      ? 'rounded-full bg-amber-600/20 px-2.5 py-0.5 text-xs font-semibold text-amber-300'
      : 'rounded-full bg-white/5 px-2.5 py-0.5 text-xs font-semibold text-gray-300';

  const highConfidence = row.ai_confidence_score != null && Number(row.ai_confidence_score) >= 0.85;
  const discrepancy = qtyDiscrepancy(row);

  return (
    <div className="overflow-hidden rounded-xl border border-electric/25 bg-charcoal-surface shadow-lg shadow-black/30">
      <div className="grid gap-0 md:grid-cols-5">
        <div className="flex items-center justify-center p-4 md:col-span-1">
          {row.image_url ? (
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('preview:image', { detail: buildAbsoluteUrl(row.image_url) }))}
              className="block w-full"
            >
              <div className="aspect-[4/3] w-full overflow-hidden rounded-2xl bg-black">
                <img
                  src={buildAbsoluteUrl(row.image_url)}
                  alt="Latest inspection"
                  className="h-full w-full object-cover"
                />
              </div>
            </button>
          ) : (
            <div className="flex flex-col items-center gap-2 p-6 text-gray-600">
              <Camera className="h-12 w-12" />
              <span className="text-xs">No image URL</span>
            </div>
          )}
        </div>

        <div className="flex flex-col justify-between space-y-4 p-4 md:col-span-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cls}>{row.status || '—'}</span>
            <span className="text-xs text-gray-500">
              {row.created_at ? new Date(row.created_at).toLocaleString() : '—'}
            </span>
            <span className="text-xs text-gray-500">Shift {row.shift ?? '—'}</span>
          </div>

          {highConfidence && (
            <div className="rounded-lg border border-sky-500/30 bg-sky-600/10 p-3 text-sm text-sky-100">
              <p className="font-semibold">High confidence</p>
              <p className="mt-1 text-xs text-sky-100/90">
                Confidence {formatConfidence(row.ai_confidence_score)}.
              </p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-charcoal-elevated p-3 text-xs">
              <p className="uppercase tracking-wide text-gray-500">Part</p>
              <p className="mt-1 text-sm font-semibold text-white">
                {row.part_code || row.part_id || 'Unknown'}
              </p>
            </div>
            <div className="rounded-lg bg-charcoal-elevated p-3 text-xs">
              <p className="uppercase tracking-wide text-gray-500">Detected</p>
              <p className="mt-1 text-xl font-semibold text-electric">{row.detected_quantity ?? '—'}</p>
            </div>
            <div className="rounded-lg bg-charcoal-elevated p-3 text-xs">
              <p className="uppercase tracking-wide text-gray-500">Target</p>
              <p className="mt-1 text-xl font-semibold text-emerald-400">{row.target_quantity ?? '—'}</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-charcoal-elevated p-3 text-xs">
              <p className="uppercase tracking-wide text-gray-500">AI score</p>
              <p className="mt-1 text-lg font-semibold text-electric">
                {formatConfidence(row.ai_confidence_score)}
              </p>
            </div>
            <div className="rounded-lg bg-charcoal-elevated p-3 text-xs">
              <p className="uppercase tracking-wide text-gray-500">Delta</p>
              <p className="mt-1 text-lg font-semibold text-white">
                {discrepancy != null ? discrepancy : '—'}
              </p>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md bg-amber-500 px-3 py-2 text-xs font-semibold text-black"
              onClick={() => {
                navigate('/app/inspections');
                window.dispatchEvent(new CustomEvent('inspections:filter', { detail: 'REVIEW' }));
              }}
            >
              Go to review
            </button>
            <p className="text-xs text-gray-500 self-center">
              Latest inspection snapshot.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { rows, error, loading, reload } = useInspections(5000);
  const { rows: detections, error: detectionError, loading: detectionLoading, reload: reloadDetections } = useDetections(5000);
  const [detectionActive, setDetectionActive] = useState(false);

  const canClearHistory = isSupervisor(user?.role) || isManager(user?.role);
  const latest = rows[0] ?? null;
  const latestDetection = detections[0] ?? null;
  const metrics = useMemo(() => getDashboardMetrics(rows, detections), [rows, detections]);

  // Listen for external reload events (fired by VisionCamera after auto-create)
  useEffect(() => {
    function handler() {
      reload();
    }
    window.addEventListener('inspections:reload', handler);
    return () => window.removeEventListener('inspections:reload', handler);
  }, [reload]);

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-white">
          Live operations
        </h1>
        <p className="mt-1 text-sm text-gray-400">
          Monitor the latest inspection, review all records, and act by role.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Total inspections"
          value={metrics.total}
          detail={`${metrics.okCount} passed · ${metrics.ngCount} rejected`}
        />
        <MetricCard
          label="Pass rate"
          value={formatPercentage(metrics.okRate)}
          detail={`Average discrepancy ${metrics.avgDiscrepancy.toFixed(1)}`}
        />
        <MetricCard
          label="Saved detections"
          value={metrics.detectionSnapshots}
          detail={
            latestDetection
              ? `Latest ${new Date(latestDetection.created_at).toLocaleString()}`
              : 'No recent snapshots yet'
          }
        />
      </div>

      {/* Image preview modal triggered by custom event */}
      <ImagePreviewModal />

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-gray-300">
              Realtime webcam detection
            </h2>
            <p className="text-xs text-gray-500">
              Live detection feed with real-time analysis
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setDetectionActive((v) => !v)}
              className={`rounded-md px-3 py-2 text-xs font-semibold text-white ${detectionActive ? 'bg-rose-600' : 'bg-emerald-600'}`}
            >
              {detectionActive ? 'Stop detection' : 'Start detection'}
            </button>
          </div>
        </div>
        <VisionCamera active={detectionActive} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-gray-300">Latest inspection</h2>
        <LiveFeedCard row={latest} />
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-medium text-gray-300">
              Detection history
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {detectionLoading && (
              <span className="text-xs text-gray-500">Refreshing…</span>
            )}
            {canClearHistory ? (
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm('Hapus semua saved detection history?')) return;
                  try {
                    await api.delete('/detections/');
                    reloadDetections();
                  } catch (err) {
                    window.alert('Gagal hapus detection history.');
                  }
                }}
                className="rounded-md bg-rose-600 px-3 py-2 text-xs font-semibold text-white"
              >
                Clear history
              </button>
            ) : (
              <span className="text-xs text-gray-500">
                Clear history restricted to supervisor/manager.
              </span>
            )}
          </div>
        </div>
        {detectionError && (
          <p className="mb-2 text-sm text-qc-ng">
            Failed to load detection history: {detectionError.message || String(detectionError)}{detectionError.status ? ` (status ${detectionError.status})` : ''}
          </p>
        )}
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-charcoal-surface">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-charcoal-elevated text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2">Count</th>
                <th className="px-3 py-2">Details</th>
                <th className="px-3 py-2">Saved at</th>
              </tr>
            </thead>
            <tbody>
              {detections.map((item) => (
                <tr key={item.id} className="border-b border-white/10 hover:bg-white/[0.02]">
                  <td className="px-3 py-2 font-semibold text-white">{item.count}</td>
                  <td className="px-3 py-2 text-gray-300">
                    {item.detections?.slice(0, 3).map((d, idx) => (
                      <div key={idx} className="text-xs text-gray-400">
                        {d.label} {Math.round(d.confidence * 100)}%
                      </div>
                    ))}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {item.created_at ? new Date(item.created_at).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
              {!detections.length && (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-center text-sm text-gray-500">
                    No saved detection data yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Removed duplicate 'All inspections' table from Live operations (see Inspections page) */}

    </div>
  );
}

function ImagePreviewModal() {
  const [img, setImg] = useState(null);
  useEffect(() => {
    function handler(e) {
      setImg(e.detail);
    }
    window.addEventListener('preview:image', handler);
    return () => window.removeEventListener('preview:image', handler);
  }, []);
  if (!img) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setImg(null)}>
      <div className="max-h-[90%] max-w-[90%]">
        <img src={img} alt="preview" className="max-h-full max-w-full object-contain rounded" />
      </div>
      <button className="absolute top-6 right-6 rounded bg-white/10 px-3 py-1 text-sm" onClick={() => setImg(null)}>Close</button>
    </div>
  );
}
