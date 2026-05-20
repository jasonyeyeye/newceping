import { useState } from 'react';
import { Plus, Edit, Trash2 } from 'lucide-react';

const demoCategories = [
  { id: '1', name: 'Vibrators', slug: 'vibrators', count: 24, order: 1 },
  { id: '2', name: 'Smart Toys', slug: 'smart-toys', count: 18, order: 2 },
  { id: '3', name: 'For Couples', slug: 'for-couples', count: 15, order: 3 },
  { id: '4', name: 'Wellness', slug: 'wellness', count: 12, order: 4 },
];

export default function Categories() {
  const [categories] = useState(demoCategories);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Categories</h1>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/80 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus className="w-4 h-4" />
          New Category
        </button>
      </div>

      <div className="bg-[var(--color-surface)] rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-gray-500 uppercase">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">Articles</th>
              <th className="px-4 py-3 font-medium">Order</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {categories.map(cat => (
              <tr key={cat.id} className="text-sm">
                <td className="px-4 py-3 text-white">{cat.name}</td>
                <td className="px-4 py-3 text-gray-500">/{cat.slug}</td>
                <td className="px-4 py-3 text-gray-400">{cat.count}</td>
                <td className="px-4 py-3 text-gray-500">{cat.order}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded transition-colors">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}