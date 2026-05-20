import { FileText, Folder, Link2, TrendingUp } from 'lucide-react';

export default function Dashboard() {
  const stats = [
    { label: 'Total Articles', value: '24', icon: FileText, change: '+3 this week' },
    { label: 'Categories', value: '4', icon: Folder, change: 'Stable' },
    { label: 'Affiliate Links', value: '48', icon: Link2, change: '+5 this week' },
    { label: 'Page Views', value: '12.4K', icon: TrendingUp, change: '+18% vs last week' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map(({ label, value, icon: Icon, change }) => (
          <div key={label} className="bg-[var(--color-surface)] rounded-xl p-5 border border-white/10">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-400">{label}</span>
              <Icon className="w-4 h-4 text-[var(--color-primary)]" />
            </div>
            <p className="text-2xl font-bold text-white mb-1">{value}</p>
            <p className="text-xs text-gray-500">{change}</p>
          </div>
        ))}
      </div>
      <div className="bg-[var(--color-surface)] rounded-xl p-6 border border-white/10">
        <h2 className="font-semibold text-white mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <a href="/admin/articles" className="px-4 py-3 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-gray-300 text-center transition-colors">
            New Article
          </a>
          <a href="/admin/categories" className="px-4 py-3 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-gray-300 text-center transition-colors">
            Manage Categories
          </a>
          <a href="/admin/navigation" className="px-4 py-3 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-gray-300 text-center transition-colors">
            Edit Navigation
          </a>
          <a href="/admin/settings" className="px-4 py-3 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-gray-300 text-center transition-colors">
            Site Settings
          </a>
        </div>
      </div>
    </div>
  );
}