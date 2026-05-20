import { GripVertical, Edit, Trash2, Plus } from 'lucide-react';

const demoNavItems = [
  { id: '1', label: 'Home', type: 'category', targetId: null, order: 1 },
  { id: '2', label: 'Vibrators', type: 'category', targetId: '1', order: 2 },
  { id: '3', label: 'Smart Toys', type: 'category', targetId: '2', order: 3 },
  { id: '4', label: 'For Couples', type: 'category', targetId: '3', order: 4 },
  { id: '5', label: 'Wellness', type: 'category', targetId: '4', order: 5 },
  { id: '6', label: 'About Us', type: 'page', targetId: '5', order: 6 },
  { id: '7', label: 'Contact', type: 'external', targetId: null, order: 7, url: 'mailto:contact@example.com' },
];

export default function Navigation() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Navigation</h1>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/80 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus className="w-4 h-4" />
          Add Menu Item
        </button>
      </div>

      <div className="bg-[var(--color-surface)] rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-gray-500 uppercase">
              <th className="px-4 py-3 font-medium w-10"></th>
              <th className="px-4 py-3 font-medium">Label</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Target</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {demoNavItems.map(item => (
              <tr key={item.id} className="text-sm">
                <td className="px-4 py-3">
                  <GripVertical className="w-4 h-4 text-gray-600 cursor-grab" />
                </td>
                <td className="px-4 py-3 text-white">{item.label}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-white/10 text-gray-300">
                    {item.type}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {item.url || `/${item.targetId || item.type}`}
                </td>
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