import { useState, useEffect } from 'react';
import { GripVertical, Trash2, RefreshCw } from 'lucide-react';
import { getNavigation, updateNavigation } from '../lib/api';

interface NavItem {
  id: string;
  label: string;
  type: 'category' | 'page' | 'external';
  url?: string;
  targetId?: string;
  order: number;
}

export default function Navigation() {
  const [items, setItems] = useState<NavItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ label: '', type: 'external', url: '', targetId: '' });

  useEffect(() => {
    loadNavigation();
  }, []);

  async function loadNavigation() {
    try {
      const nav = await getNavigation();
      setItems(nav);
    } catch (err) {
      console.error('加载导航失败:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateNavigation(items);
      alert('导航已保存！');
    } catch (err) {
      alert('保存失败: ' + (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function addItem() {
    const newItem: NavItem = {
      id: `nav-${Date.now()}`,
      label: form.label,
      type: form.type as 'category' | 'page' | 'external',
      url: form.type === 'external' ? form.url : undefined,
      targetId: form.type !== 'external' ? form.targetId : undefined,
      order: items.length + 1,
    };
    setItems([...items, newItem]);
    setForm({ label: '', type: 'external', url: '', targetId: '' });
    setShowForm(false);
  }

  function removeItem(id: string) {
    setItems(items.filter(item => item.id !== id));
  }

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
        <h1 className="text-2xl font-bold text-white">导航管理</h1>
        <div className="flex gap-3">
          <button
            onClick={loadNavigation}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            重置
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/80 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存更改'}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-[var(--color-surface)] rounded-xl border border-white/10 p-6 mb-6">
          <h2 className="font-semibold text-white mb-4">添加菜单项</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">标签</label>
              <input
                type="text"
                value={form.label}
                onChange={e => setForm({ ...form, label: e.target.value })}
                className="w-full px-4 py-2.5 bg-[var(--color-background)] border border-white/10 rounded-lg text-sm text-white focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">类型</label>
              <select
                value={form.type}
                onChange={e => setForm({ ...form, type: e.target.value as any })}
                className="w-full px-4 py-2.5 bg-[var(--color-background)] border border-white/10 rounded-lg text-sm text-white focus:border-[var(--color-primary)] focus:outline-none"
              >
                <option value="external">外部链接</option>
                <option value="category">分类</option>
                <option value="page">页面</option>
              </select>
            </div>
            <div className="flex gap-3">
              <button
                onClick={addItem}
                className="px-4 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/80 text-white text-sm font-medium rounded-lg transition-colors"
              >
                添加
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-lg transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-[var(--color-surface)] rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-gray-500 uppercase">
              <th className="px-4 py-3 font-medium w-10"></th>
              <th className="px-4 py-3 font-medium">标签</th>
              <th className="px-4 py-3 font-medium">类型</th>
              <th className="px-4 py-3 font-medium">目标</th>
              <th className="px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {items.map(item => (
              <tr key={item.id} className="text-sm">
                <td className="px-4 py-3">
                  <GripVertical className="w-4 h-4 text-gray-600 cursor-grab" />
                </td>
                <td className="px-4 py-3 text-white">{item.label}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-white/10 text-gray-300">
                    {item.type === 'external' ? '外部链接' : item.type === 'category' ? '分类' : '页面'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {item.url || (item.type === 'category' ? `/vibrators` : '/page')}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => removeItem(item.id)}
                    className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}