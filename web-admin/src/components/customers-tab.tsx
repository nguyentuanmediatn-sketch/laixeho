import { useState } from 'react';
import { Search } from 'lucide-react';
import { fmtDateTime } from '../api';

export function CustomersTab({ customers }: { customers: any[] }) {
  const [query, setQuery] = useState('');
  const filtered = customers.filter((c) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return c.phone?.toLowerCase().includes(q) || c.name?.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Danh sách Khách hàng ({filtered.length})</h1>
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            className="pl-9 pr-3 py-2 border rounded-lg text-sm bg-white w-64"
            placeholder="Tìm SĐT hoặc họ tên..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="p-3">Số điện thoại</th>
              <th className="p-3">Họ tên</th>
              <th className="p-3">Số chuyến đã đặt</th>
              <th className="p-3">Ngày tạo</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="p-3 font-medium">{c.phone}</td>
                <td className="p-3">{c.name || '—'}</td>
                <td className="p-3 font-semibold">{c._count?.trips ?? 0}</td>
                <td className="p-3 text-xs text-slate-500">{fmtDateTime(c.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
