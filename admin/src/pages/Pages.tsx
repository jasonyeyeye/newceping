import { useState } from 'react';
import { Plus, Edit, Trash2, Eye } from 'lucide-react';

const demoPages = [
  { id: '1', title: 'About Us', slug: 'about', status: 'published', updatedAt: '2024-01-01' },
  { id: '2', title: 'Contact', slug: 'contact', status: 'published', updatedAt: '2024-01-01' },
  { id: '3', title: 'Privacy Policy', slug: 'privacy', status: 'published', updatedAt: '2024-01-01' },
  { id: '4', title: 'Terms of Service', slug: 'terms', status: 'published', updatedAt: '2024-01-01' },
  { id: '5', title: 'Affiliate Disclosure', slug: 'disclosure', status: 'published', updatedAt: '2024-01-01' },
];

export default function Pages() {
  const [pages] = useState(demoPages);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Pages</h1>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/80 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus className="w-4 h-4" />
          New Page
        </button>
      </div>

      <div className="bg-[var(--color-surface)] rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-gray-500 uppercase">
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Last Updated</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {pages.map(page => (
              <tr key={page.id} className="text-sm">
                <td className="px-4 py-3 text-white">{page.title}</td>
                <td className="px-4 py-3 text-gray-500">/{page.slug}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-400">
                    {page.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">{page.updatedAt}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded transition-colors">
                      <Eye className="w-4 h-4" />
                    </button>
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