import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, RefreshCw } from 'lucide-react';
import { getCategoriesWithCount, createCategory, updateCategory, deleteCategory } from '../lib/api';

interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  order: number;
  articleCount?: number;
  createdAt: string;
}

export default function Categories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', slug: '', description: '' });

  useEffect(() => {
    loadCategories();
  }, []);

  async function loadCategories() {
    try {
      const cats = await getCategoriesWithCount();
      setCategories([...cats].sort((a: Category, b: Category) => a.order - b.order));
    } catch (err) {
      console.error('加载分类失败:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    if (!form.name.trim() || !form.slug.trim()) {
      alert('名称和 slug 是必填项');
      return;
    }
    try {
      if (editingId) {
        await updateCategory(editingId, {
          name: form.name,
          slug: form.slug.toLowerCase().replace(/\s+/g, '-'),
          description: form.description,
        });
      } else {
        await createCategory({
          name: form.name,
          slug: form.slug.toLowerCase().replace(/\s+/g, '-'),
          description: form.description,
          order: categories.length + 1,
        });
      }
      setForm({ name: '', slug: '', description: '' });
      setShowForm(false);
      setEditingId(null);
      await loadCategories();
    } catch (err) {
      alert('保存失败: ' + (err as Error).message);
    }
  }

  function startEdit(cat: Category) {
    setEditingId(cat.id);
    setForm({ name: cat.name, slug: cat.slug, description: cat.description || '' });
    setShowForm(true);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm({ name: '', slug: '', description: '' });
    setShowForm(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('确认删除此分类？')) return;
    try {
      await deleteCategory(id);
      await loadCategories();
    } catch (err) {
      alert('删除失败: ' + (err as Error).message);
    }
  }

  function generateSlug(name: string) {
    setForm({ ...form, slug: name.toLowerCase().replace(/\s+/g, '-') });
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
        <h1 className="text-2xl font-bold text-white">分类管理</h1>
        <div className="flex gap-3">
          <button
            onClick={loadCategories}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            刷新
          </button>
          <button
            onClick={() => { setShowForm(!showForm); setEditingId(null); setForm({ name: '', slug: '', description: '' }); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/80 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            新建分类
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-[var(--color-surface)] rounded-xl border border-white/10 p-6 mb-6">
          <h2 className="font-semibold text-white mb-4">{editingId ? '编辑分类' : '创建分类'}</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">名称</label>
              <input
                type="text"
                value={form.name}
                onChange={e => { setForm({ ...form, name: e.target.value }); generateSlug(e.target.value); }}
                className="w-full px-4 py-2.5 bg-[var(--color-background)] border border-white/10 rounded-lg text-sm text-white focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Slug</label>
              <input
                type="text"
                value={form.slug}
                onChange={e => setForm({ ...form, slug: e.target.value })}
                className="w-full px-4 py-2.5 bg-[var(--color-background)] border border-white/10 rounded-lg text-sm text-white focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">描述</label>
              <input
                type="text"
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                className="w-full px-4 py-2.5 bg-[var(--color-background)] border border-white/10 rounded-lg text-sm text-white focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleSubmit}
                className="px-4 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/80 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {editingId ? '更新' : '创建'}
              </button>
              <button
                onClick={cancelEdit}
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
              <th className="px-4 py-3 font-medium">名称</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">描述</th>
              <th className="px-4 py-3 font-medium">文章数</th>
              <th className="px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {categories.map(cat => (
              <tr key={cat.id} className="text-sm">
                <td className="px-4 py-3 text-white">{cat.name}</td>
                <td className="px-4 py-3 text-gray-500">/{cat.slug}</td>
                <td className="px-4 py-3 text-gray-400">{cat.description || '—'}</td>
                <td className="px-4 py-3 text-gray-500">{cat.articleCount || 0}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => startEdit(cat)}
                      className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded transition-colors"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(cat.id)}
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
  );
}