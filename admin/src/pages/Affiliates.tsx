import { useState, useEffect } from 'react';
import { Plus, Copy, Trash2, CheckCircle, Edit, X, RefreshCw, BarChart2 } from 'lucide-react';
import { getAffiliates, createAffiliate, updateAffiliate, deleteAffiliate, trackAffiliateClick } from '../lib/api';

interface Affiliate {
  id: string;
  name: string;
  platform: string;
  url: string;
  anchorText?: string;
  status: 'active' | 'inactive';
  group: string;
  clicks: number;
  lastClickedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

const PLATFORMS = [
  { value: 'amazon', label: 'Amazon' },
  { value: 'senseful', label: 'Senseful' },
  { value: 'awin', label: 'Awin' },
  { value: 'other', label: 'Other' },
];

function formatRelativeTime(isoString?: string): string {
  if (!isoString) return '-';
  const date = new Date(isoString);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffDays < 30) return `${diffDays}天前`;
  return date.toLocaleDateString('zh-CN');
}

export default function Affiliates() {
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<string>('');
  const [form, setForm] = useState<{
    name: string;
    platform: string;
    url: string;
    anchorText: string;
    group: string;
    status: 'active' | 'inactive';
  }>({
    name: '',
    platform: 'amazon',
    url: '',
    anchorText: '',
    group: '',
    status: 'active',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadAffiliates();
  }, []);

  async function loadAffiliates() {
    try {
      const data = await getAffiliates();
      setAffiliates(data || []);
    } catch (err) {
      console.error('加载推广链接失败:', err);
    } finally {
      setLoading(false);
    }
  }

  async function copyShortLink(aff: Affiliate) {
    const shortUrl = `/affiliate/go/${aff.id}`;
    navigator.clipboard.writeText(shortUrl);
    setCopiedId(aff.id);
    // Track click
    try {
      await trackAffiliateClick(aff.id);
      // Refresh to show updated click count
      await loadAffiliates();
    } catch (err) {
      console.error('追踪点击失败:', err);
    }
    setTimeout(() => setCopiedId(null), 2000);
  }

  function openEdit(aff: Affiliate) {
    setEditingId(aff.id);
    setForm({
      name: aff.name,
      platform: aff.platform,
      url: aff.url,
      anchorText: aff.anchorText || '',
      group: aff.group || '',
      status: aff.status,
    });
    setShowForm(true);
  }

  function openCreate() {
    setEditingId(null);
    setForm({ name: '', platform: 'amazon', url: '', anchorText: '', group: '', status: 'active' });
    setShowForm(true);
  }

  async function handleSubmit() {
    if (!form.name.trim() || !form.url.trim()) {
      alert('名称和链接是必填项');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await updateAffiliate(editingId, form);
      } else {
        await createAffiliate(form);
      }
      setShowForm(false);
      await loadAffiliates();
    } catch (err) {
      alert('保存失败: ' + (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('确认删除此推广链接？')) return;
    try {
      await deleteAffiliate(id);
      await loadAffiliates();
    } catch (err) {
      alert('删除失败: ' + (err as Error).message);
    }
  }

  // Get all unique groups
  const allGroups = Array.from(
    new Set(affiliates.map(a => a.group).filter(Boolean))
  ).sort();

  // Group affiliates
  const filteredAffiliates = groupFilter
    ? affiliates.filter(a => a.group === groupFilter)
    : affiliates;

  const grouped = filteredAffiliates.reduce<Record<string, Affiliate[]>>((acc, aff) => {
    const key = aff.group || '未分组';
    if (!acc[key]) acc[key] = [];
    acc[key].push(aff);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 text-gray-500 animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">推广链接</h1>
        <div className="flex gap-3">
          <button
            onClick={loadAffiliates}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            刷新
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/80 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            添加链接
          </button>
        </div>
      </div>

      {/* Group Filter */}
      {allGroups.length > 0 && (
        <div className="flex items-center gap-3 mb-5">
          <span className="text-sm text-gray-500">分组筛选:</span>
          <button
            onClick={() => setGroupFilter('')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              groupFilter === '' ? 'bg-[var(--color-primary)] text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'
            }`}
          >
            全部
          </button>
          {allGroups.map(g => (
            <button
              key={g}
              onClick={() => setGroupFilter(g)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                groupFilter === g ? 'bg-[var(--color-primary)] text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {/* Create/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--color-surface)] rounded-xl border border-white/10 w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">{editingId ? '编辑链接' : '添加链接'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">名称 *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="例如: Womanizer Pro 40"
                  className="w-full px-4 py-2.5 bg-[var(--color-background)] border border-white/10 rounded-lg text-white focus:border-[var(--color-primary)] focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">平台 *</label>
                  <select
                    value={form.platform}
                    onChange={e => setForm({ ...form, platform: e.target.value })}
                    className="w-full px-4 py-2.5 bg-[var(--color-background)] border border-white/10 rounded-lg text-white focus:border-[var(--color-primary)] focus:outline-none"
                  >
                    {PLATFORMS.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">分组</label>
                  <input
                    type="text"
                    value={form.group}
                    onChange={e => setForm({ ...form, group: e.target.value })}
                    placeholder="如: We-Vibe"
                    list="group-suggestions"
                    className="w-full px-4 py-2.5 bg-[var(--color-background)] border border-white/10 rounded-lg text-white focus:border-[var(--color-primary)] focus:outline-none"
                  />
                  <datalist id="group-suggestions">
                    {allGroups.map(g => <option key={g} value={g} />)}
                  </datalist>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">链接 URL *</label>
                <input
                  type="url"
                  value={form.url}
                  onChange={e => setForm({ ...form, url: e.target.value })}
                  placeholder="https://amazon.com/dp/..."
                  className="w-full px-4 py-2.5 bg-[var(--color-background)] border border-white/10 rounded-lg text-white focus:border-[var(--color-primary)] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">链接文字</label>
                <input
                  type="text"
                  value={form.anchorText}
                  onChange={e => setForm({ ...form, anchorText: e.target.value })}
                  placeholder="Buy on Amazon"
                  className="w-full px-4 py-2.5 bg-[var(--color-background)] border border-white/10 rounded-lg text-white focus:border-[var(--color-primary)] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">状态</label>
                <select
                  value={form.status}
                  onChange={e => setForm({ ...form, status: e.target.value as any })}
                  className="w-full px-4 py-2.5 bg-[var(--color-background)] border border-white/10 rounded-lg text-white focus:border-[var(--color-primary)] focus:outline-none"
                >
                  <option value="active">有效</option>
                  <option value="inactive">无效</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSubmit}
                  disabled={saving}
                  className="flex-1 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/80 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {saving ? '保存中...' : '保存'}
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white font-medium rounded-lg transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Affiliates Grouped List */}
      <div className="space-y-6">
        {Object.keys(grouped).length === 0 ? (
          <div className="bg-[var(--color-surface)] rounded-xl border border-white/10 p-8 text-center text-gray-500">
            暂无推广链接，点击"添加链接"创建
          </div>
        ) : Object.entries(grouped).map(([groupName, groupAffiliates]) => (
          <div key={groupName}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-semibold text-gray-400 uppercase tracking-wider">{groupName}</span>
              <span className="text-xs text-gray-600">({groupAffiliates.length})</span>
            </div>
            <div className="bg-[var(--color-surface)] rounded-xl border border-white/10 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10 text-left text-xs text-gray-500 uppercase">
                    <th className="px-4 py-3 font-medium">名称</th>
                    <th className="px-4 py-3 font-medium">平台</th>
                    <th className="px-4 py-3 font-medium">短链</th>
                    <th className="px-4 py-3 font-medium">点击</th>
                    <th className="px-4 py-3 font-medium">最后点击</th>
                    <th className="px-4 py-3 font-medium">状态</th>
                    <th className="px-4 py-3 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {groupAffiliates.map(aff => (
                    <tr key={aff.id} className="text-sm">
                      <td className="px-4 py-3 text-white font-medium">{aff.name}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-white/10 text-gray-300 capitalize">
                          {aff.platform}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <code className="text-xs text-gray-500 bg-white/5 px-1.5 py-0.5 rounded">
                            /affiliate/go/{aff.id.slice(0, 8)}
                          </code>
                          <button
                            onClick={() => copyShortLink(aff)}
                            className="p-1 text-gray-500 hover:text-[var(--color-primary)] hover:bg-white/10 rounded transition-colors"
                            title="复制短链并追踪"
                          >
                            {copiedId === aff.id ? (
                              <CheckCircle className="w-4 h-4 text-green-400" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <BarChart2 className="w-3.5 h-3.5 text-gray-500" />
                          <span className="text-white font-mono text-sm">{aff.clicks || 0}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {formatRelativeTime(aff.lastClickedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${
                          aff.status === 'active'
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-gray-500/20 text-gray-400'
                        }`}>
                          {aff.status === 'active' ? '有效' : '无效'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEdit(aff)}
                            className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(aff.id)}
                            className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                          >
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
        ))}
      </div>
    </div>
  );
}