import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { isManager, isSupervisor } from '../utils/roles';

export default function PartsPage() {
  const { user } = useAuth();
  const canManageParts = isSupervisor(user?.role) || isManager(user?.role);
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ part_code: '', part_name: '', standard_weight: '', target_quantity: '' });

  async function load() {
    try {
      const { data } = await api.get('/parts/');
      setRows(data);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    if (canManageParts) load();
  }, [canManageParts]);

  async function handleCreate(e) {
    e.preventDefault();
    try {
      await api.post('/parts/', { part_code: form.part_code, part_name: form.part_name, standard_weight: Number(form.standard_weight), target_quantity: Number(form.target_quantity) });
      setForm({ part_code: '', part_name: '', standard_weight: '', target_quantity: '' });
      load();
    } catch (err) {
      window.alert('Gagal membuat part.');
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Hapus part ini?')) return;
    try {
      await api.delete(`/parts/${id}`);
      load();
    } catch (err) {
      window.alert('Gagal hapus part.');
    }
  }

  if (!canManageParts) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-white">Parts</h1>
          <p className="text-sm text-gray-400">Access denied. Supervisor or Manager role required.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-white">Parts</h1>
        <p className="text-sm text-gray-400">Manage known parts and targets.</p>
      </div>
      <form onSubmit={handleCreate} className="flex gap-2">
        <input value={form.part_code} onChange={(e) => setForm({...form, part_code: e.target.value})} placeholder="Code" className="rounded px-2 py-1" required />
        <input value={form.part_name} onChange={(e) => setForm({...form, part_name: e.target.value})} placeholder="Name" className="rounded px-2 py-1" required />
        <input value={form.standard_weight} onChange={(e) => setForm({...form, standard_weight: e.target.value})} placeholder="Weight" className="rounded px-2 py-1" required />
        <input value={form.target_quantity} onChange={(e) => setForm({...form, target_quantity: e.target.value})} placeholder="Target" className="rounded px-2 py-1" required />
        <button className="rounded bg-electric px-3 text-sm">Create</button>
      </form>

      <div className="overflow-x-auto rounded border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400">
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Weight</th>
              <th className="px-3 py-2">Target</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2">{r.part_code}</td>
                <td className="px-3 py-2">{r.part_name}</td>
                <td className="px-3 py-2">{r.standard_weight}</td>
                <td className="px-3 py-2">{r.target_quantity}</td>
                <td className="px-3 py-2">
                  <button onClick={() => handleDelete(r.id)} className="text-xs rounded bg-rose-600 px-2 py-1 text-white">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
