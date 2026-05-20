import { useState } from 'react';
import { Plus, Search, Edit, Trash2, Eye } from 'lucide-react';

// Demo articles - in production comes from Cloudflare KV
const demoArticles = [
  {
    id: '1',
    title: 'Best Vibrators of 2024 — Honest, In-Depth Reviews',
    slug: 'best-vibrators-2024',
    category: 'Vibrators',
    status: 'published',
    publishedAt: '2024-01-15',
    views: 3420,
  },
  {
    id: '2',
    title: 'Lovense Lemay Review — Air Pulse Technology',
    slug: 'lovense-lemay-review',
    category: 'Smart Toys',
    status: 'published',
    publishedAt: '2024-01-10',
    views: 2180,
  },
  {
    id: '3',
    title: 'We-Vibe Chorus Review — The Ultimate Couples Toy?',
    slug: 'we-vibe-chorus-review',
    category: 'For Couples',
    status: 'draft',
    publishedAt: null,
    views: 0,
  },
];

export default function Articles() {
  const [articles] = useState(demoArticles);
  const [search, setSearch] = useState('');

  const filtered = articles.filter(a =>
    a.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Articles</h1>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/80 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus className="w-4 h-4" />
          New Article
        </button>
      </div>

      <div className="bg-[var(--color-surface)] rounded-xl border border-white/10 overflow-hidden">
        <div className="p-4 border-b border-white/10">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search articles..."
              className="w-full pl-10 pr-4 py-2 bg-[var(--color-background)] border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-gray-500 uppercase">
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Published</th>
              <th className="px-4 py-3 font-medium">Views</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filtered.map(article => (
              <tr key={article.id} className="text-sm">
                <td className="px-4 py-3">
                  <span className="text-white">{article.title}</span>
                  <span className="block text-xs text-gray-500">/{article.slug}</span>
                </td>
                <td className="px-4 py-3 text-gray-400">{article.category}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                    article.status === 'published'
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-yellow-500/20 text-yellow-400'
                  }`}>
                    {article.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {article.publishedAt || '—'}
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {article.views > 0 ? article.views.toLocaleString() : '—'}
                </td>
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