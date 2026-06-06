import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { isManager, isSupervisor } from '../utils/roles';

export default function AuditPage() {
  const { user } = useAuth();
  const canViewAudit = isSupervisor(user?.role) || isManager(user?.role);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const { data } = await api.get('/audit/');
      setRows(data);
    } catch (err) {
      console.error(err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (canViewAudit) load();
  }, [canViewAudit]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const payloadText = r.payload ? JSON.stringify(r.payload) : '';
      return [r.entity, r.action, String(r.entity_id || ''), String(r.user_id || ''), payloadText]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [rows, search]);

  async function handleDeleteAudit(id) {
    if (!window.confirm('Hapus audit log ini?')) return;
    try {
      await api.delete(`/audit/${id}`);
      await load();
    } catch (err) {
      window.alert('Gagal menghapus audit log.');
    }
  }

  if (!canViewAudit) {
    return (
      <div className="mx-auto max-w-7xl space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-white">Audit log</h1>
          <p className="text-sm text-gray-400">Access denied. Supervisor or Manager role required.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-white">Audit log</h1>
        <p className="text-sm text-gray-400">Recent changes and administrative actions.</p>
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-gray-300">Search audit entries by entity, action, user, or payload.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search audit log..."
            className="rounded-md border border-white/10 bg-charcoal-elevated px-3 py-2 text-sm text-white"
          />
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm('Hapus semua audit log?')) return;
              try {
                await api.delete('/audit/');
                await load();
              } catch (err) {
                window.alert('Gagal menghapus semua audit log.');
              }
            }}
            className="rounded bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-500"
            disabled={loading || rows.length === 0}
          >
            Hapus Semua
          </button>
        </div>
      </div>
      <div className="overflow-x-auto rounded border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400">
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Entity</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Payload</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-gray-500">
                  Loading audit entries…
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-gray-500">
                  No audit entries found.
                </td>
              </tr>
            ) : (
              filteredRows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2">{r.entity} {r.entity_id ? `(${r.entity_id})` : ''}</td>
                  <td className="px-3 py-2">{r.action}</td>
                  <td className="px-3 py-2">{r.user_id ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-gray-400"><pre className="whitespace-pre-wrap">{JSON.stringify(r.payload)}</pre></td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="rounded bg-rose-600 px-2 py-1 text-xs font-semibold text-white"
                      onClick={() => handleDeleteAudit(r.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
