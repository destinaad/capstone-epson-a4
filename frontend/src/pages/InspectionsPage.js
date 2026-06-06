import { useMemo, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useInspections } from '../hooks/useInspections';
import { isManager, isSupervisor, canValidateNg } from '../utils/roles';

function qtyDiscrepancy(row) {
  const t = row.target_quantity;
  if (t == null) return null;
  return t - row.detected_quantity;
}

function formatUuid(id) {
  if (!id) return '—';
  const s = String(id);
  return s.slice(-6).toUpperCase();
}

function displayId(row) {
  if (!row) return '—';
  if (row.display_id) return row.display_id;
  return formatUuid(row.id);
}

function buildAbsoluteUrl(url) {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${process.env.REACT_APP_API_URL || 'http://localhost:8000'}${url.startsWith('/') ? '' : '/'}${url}`;
}

export default function InspectionsPage() {
  const { user } = useAuth();
  const { rows, error, loading, reload } = useInspections(5000);
  const [search, setSearch] = useState('');
  const canClearHistory = isSupervisor(user?.role) || isManager(user?.role);
  const latest = rows[0] ?? null;
  const [modalImage, setModalImage] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [editDetected, setEditDetected] = useState('');
  const [editStatus, setEditStatus] = useState('');

  async function handleUpdateStatus(id, newStatus) {
    try {
      await api.patch(`/inspections/${id}`, { status: newStatus });
      reload();
    } catch (err) {
      window.alert('Gagal update status inspeksi.');
    }
  }

  async function handleEdit(row) {
    setEditRow(row);
    setEditDetected(row.detected_quantity ?? '');
    setEditStatus(row.status ?? '');
    setShowEditModal(true);
  }

  async function handleDelete(row) {
    if (!window.confirm('Hapus inspection ini?')) return;
    try {
      await api.delete(`/inspections/${row.id}`);
      reload();
    } catch (err) {
      window.alert('Gagal hapus inspection.');
    }
  }

  const stats = useMemo(() => {
    const total = rows.length;
    const okCount = rows.filter((row) => String(row.status || '').toUpperCase() === 'OK').length;
    const ngCount = rows.filter((row) => String(row.status || '').toUpperCase() === 'NG').length;
    const okRate = total > 0 ? (okCount / total) * 100 : 0;
    const avgDiscrepancy =
      total > 0
        ? rows.reduce((sum, row) => sum + (row.discrepancy ?? 0), 0) / total
        : 0;
    return { total, okCount, ngCount, okRate, avgDiscrepancy };
  }, [rows]);

  useEffect(() => {
    function handler() {
      reload();
    }
    window.addEventListener('inspections:reload', handler);
    return () => window.removeEventListener('inspections:reload', handler);
  }, [reload]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Inspection records</h1>
        <p className="mt-1 text-sm text-gray-400">
          Review saved inspections, image snapshots, and status history.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-charcoal-surface p-5 shadow-sm shadow-black/10">
          <p className="text-xs uppercase tracking-[0.25em] text-gray-500">Total records</p>
          <p className="mt-4 text-3xl font-semibold text-white">{stats.total}</p>
          <p className="mt-2 text-sm text-gray-400">{stats.okCount} OK · {stats.ngCount} NG</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-charcoal-surface p-5 shadow-sm shadow-black/10">
          <p className="text-xs uppercase tracking-[0.25em] text-gray-500">Pass rate</p>
          <p className="mt-4 text-3xl font-semibold text-white">{stats.okRate.toFixed(1)}%</p>
          <p className="mt-2 text-sm text-gray-400">Average discrepancy {stats.avgDiscrepancy.toFixed(1)}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-charcoal-surface p-5 shadow-sm shadow-black/10">
          <p className="text-xs uppercase tracking-[0.25em] text-gray-500">Latest inspection</p>
          <p className="mt-4 text-3xl font-semibold text-white">{latest ? formatUuid(latest.id) : '—'}</p>
          <p className="mt-2 text-sm text-gray-400">
            {latest ? new Date(latest.created_at).toLocaleString() : 'No recent inspection'}
          </p>
        </div>
      </div>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-medium text-gray-300">All inspections</h2>
            <p className="text-xs text-gray-500">Sorted by newest first.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="rounded-md bg-white/5 px-3 py-2 text-xs text-gray-300"
              placeholder="Search by ID, part code, part name, or status"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {loading && (
              <span className="text-xs text-gray-500">Refreshing…</span>
            )}
            {canClearHistory ? (
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm('Hapus semua inspection records?')) return;
                  try {
                    await api.delete('/inspections/');
                    reload();
                  } catch (err) {
                    window.alert('Gagal hapus inspection history.');
                  }
                }}
                className="rounded-md bg-rose-600 px-3 py-2 text-xs font-semibold text-white"
              >
                Clear inspections
              </button>
            ) : (
              <span className="text-xs text-gray-500">
                Clear inspections restricted to supervisor/manager.
              </span>
            )}
          </div>
        </div>

        {error && (
          <p className="mb-2 text-sm text-qc-ng">
            Failed to load inspections: {error.message || String(error)}{error.status ? ` (status ${error.status})` : ''}
          </p>
        )}

        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
                <tr className="border-b border-white/10 bg-charcoal-elevated text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Image</th>
                <th className="px-3 py-2">Part</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Detected</th>
                <th className="px-3 py-2">Target / package</th>
                <th className="px-3 py-2">Δ qty</th>
                <th className="px-3 py-2">Shift</th>
                <th className="px-3 py-2">Actions</th>
                <th className="px-3 py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.filter((row) => {
                const q = search.trim().toLowerCase();
                if (!q) return true;
                const combined = `${row.display_id || ''} ${row.part_code || ''} ${row.part_name || ''} ${row.status || ''} ${row.id}`.toLowerCase();
                return combined.includes(q);
              }).map((row) => {
                const d = qtyDiscrepancy(row);
                const isNg = String(row.status || '').toUpperCase() === 'NG';
                return (
                  <tr
                    key={row.id}
                    className={
                      isNg
                        ? 'border-b border-white/5 bg-qc-ng/[0.08]'
                        : 'border-b border-white/5 hover:bg-white/[0.02]'
                    }
                  >
                    <td className="px-3 py-2 font-mono text-xs text-gray-400">
                      {displayId(row)}
                    </td>
                    <td className="px-3 py-2">
                      {row.image_url ? (
                        <button onClick={() => setModalImage(buildAbsoluteUrl(row.image_url))}>
                          <img
                            src={buildAbsoluteUrl(row.image_url)}
                            alt="snapshot"
                            className="h-12 w-16 object-contain rounded-md"
                          />
                        </button>
                      ) : (
                        <span className="text-xs text-gray-500">No image</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-300">
                      {row.part_code || row.part_id || (row.image_url ? 'Unknown' : '—')}
                      {row.part_name ? (
                        <div className="text-xs text-gray-500">{row.part_name}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      {(() => {
                        const st = String(row.status || '').toUpperCase();
                        const cls =
                          st === 'OK'
                            ? 'font-medium text-qc-ok'
                            : st === 'NG'
                            ? 'font-medium text-qc-ng'
                            : st === 'SNAPSHOT'
                            ? 'font-medium text-yellow-300'
                            : st === 'REVIEW'
                            ? 'font-medium text-amber-300'
                            : 'font-medium text-gray-300';
                        return <span className={cls}>{row.status ?? '—'}</span>;
                      })()}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-gray-300">
                      {row.detected_quantity}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-gray-300">
                      {row.target_quantity ?? '—'}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-electric">
                      {d == null ? '—' : d}
                    </td>
                    <td className="px-3 py-2 text-gray-300">{row.shift ?? '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button onClick={() => handleEdit(row)} className="text-xs rounded bg-electric px-2 py-1 text-charcoal">Edit</button>
                        {canClearHistory && (
                          <button onClick={() => handleDelete(row)} className="text-xs rounded bg-rose-600 px-2 py-1 text-white">Delete</button>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {row.created_at ? new Date(row.created_at).toLocaleString() : '—'}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-sm text-gray-500">
                    No inspection records yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-2 text-xs text-gray-500">
          Δ qty is{' '}
          <span className="text-electric">target_quantity − detected_quantity</span>{' '}
          (dashboard calculation).
        </p>
        {showEditModal && editRow && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6" onClick={() => { setShowEditModal(false); setEditRow(null); }}>
            <div className="w-full max-w-md rounded-2xl bg-charcoal-surface p-6 shadow-xl shadow-black/40" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-white">Edit inspection</h3>
              <p className="text-xs text-gray-400">ID: {displayId(editRow)}</p>
              <div className="mt-4 grid gap-4">
                <div>
                  <label className="text-xs text-gray-300">Detected quantity</label>
                  <input
                    type="number"
                    className="mt-1 w-full rounded border border-white/10 bg-white px-3 py-2 text-sm text-black"
                    value={editDetected}
                    onChange={(e) => setEditDetected(e.target.value === '' ? '' : Number(e.target.value))}
                  />
                </div>
                {canValidateNg(user) && (
                  <div>
                    <label className="text-xs text-gray-300">Status</label>
                    <select
                      className="mt-1 w-full rounded border border-white/10 bg-white px-3 py-2 text-sm text-black"
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value)}
                    >
                      <option value="">(leave unchanged)</option>
                      <option value="OK">OK</option>
                      <option value="NG">NG</option>
                      <option value="REVIEW">REVIEW</option>
                    </select>
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded px-3 py-2 bg-gray-600 text-sm text-white"
                    onClick={() => {
                      setShowEditModal(false);
                      setEditRow(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="rounded px-3 py-2 bg-electric text-sm font-semibold text-charcoal"
                    onClick={async () => {
                      const payload = {};
                      const hasDetected = editDetected !== '' && !Number.isNaN(Number(editDetected));
                      const parsedDetected = hasDetected ? Number(editDetected) : null;
                      if (hasDetected) {
                        payload.detected_quantity = parsedDetected;
                      }
                      if (parsedDetected === 0) {
                        payload.status = 'REVIEW';
                      } else if (editStatus) {
                        payload.status = editStatus;
                      }
                      try {
                        await api.patch(`/inspections/${editRow.id}`, payload);
                        setShowEditModal(false);
                        setEditRow(null);
                        reload();
                      } catch (err) {
                        window.alert('Gagal menyimpan perubahan.');
                      }
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {modalImage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setModalImage(null)}>
            <div className="max-h-[90%] max-w-[90%]">
              <img src={modalImage} alt="preview" className="max-h-full max-w-full object-contain rounded" />
            </div>
            <button className="absolute top-6 right-6 rounded bg-white/10 px-3 py-1 text-sm" onClick={() => setModalImage(null)}>Close</button>
          </div>
        )}
      </section>
    </div>
  );
}
