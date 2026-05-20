import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Eye, RefreshCw, X } from 'lucide-react';
import { getPages, createPage, updatePage, deletePage } from '../lib/api';

interface Page {
  id: string;
  title: string;
  slug: string;
  content?: string;
  status: 'draft' | 'published';
  createdAt?: string;
  updatedAt?: string;
}

export default function Pages() {
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<{ title: string; slug: string; content: string; status: 'draft' | 'published' }>({ title: '', slug: '', content: '', status: 'draft' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadPages();
  }, []);

  async function loadPages() {
    try {
      const data = await getPages();
      setPages(data || []);
    } catch (err) {
      console.error('加载页面失败:', err);
    } finally {
      setLoading(false);
    }
  }

  function openEdit(page: Page) {
    setEditingId(page.id);
    setForm({
      title: page.title,
      slug: page.slug,
      content: page.content || '',
      status: page.status,
    });
    setShowForm(true);
  }

  function openCreate() {
    setEditingId(null);
    setForm({ title: '', slug: '', content: '', status: 'draft' });
    setShowForm(true);
  }

  function generateSlug(title: string) {
    const slug = title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    setForm(f => ({ ...f, slug }));
  }

  async function handleSubmit() {
    if (!form.title.trim() || !form.slug.trim()) {
      alert('标题和 slug 是必填项');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await updatePage(editingId, form);
      } else {
        await createPage(form);
      }
      setShowForm(false);
      await loadPages();
    } catch (err) {
      alert('保存失败: ' + (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('确认删除此页面？')) return;
    try {
      await deletePage(id);
      await loadPages();
    } catch (err) {
      alert('删除失败: ' + (err as Error).message);
    }
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
        <h1 className="text-2xl font-bold text-white">页面管理</h1>
        <div className="flex gap-3">
          <button
            onClick={loadPages}
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
            新建页面
          </button>
        </div>
      </div>

      {/* Create/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto py-8">
          <div className="bg-[var(--color-surface)] rounded-xl border border-white/10 w-full max-w-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">{editingId ? '编辑页面' : '创建页面'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">标题 *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => { setForm({ ...form, title: e.target.value }); generateSlug(e.target.value); }}
                  placeholder="例如: 关于我们"
                  className="w-full px-4 py-2.5 bg-[var(--color-background)] border border-white/10 rounded-lg text-white focus:border-[var(--color-primary)] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Slug *</label>
                <input
                  type="text"
                  value={form.slug}
                  onChange={e => setForm({ ...form, slug: e.target.value })}
                  placeholder="about"
                  className="w-full px-4 py-2.5 bg-[var(--color-background)] border border-white/10 rounded-lg text-white focus:border-[var(--color-primary)] focus:outline-none"
                />
                <p className="text-xs text-gray-500 mt-1">URL: /{form.slug || 'slug'}</p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">状态</label>
                <select
                  value={form.status}
                  onChange={e => setForm({ ...form, status: e.target.value as any })}
                  className="w-full px-4 py-2.5 bg-[var(--color-background)] border border-white/10 rounded-lg text-white focus:border-[var(--color-primary)] focus:outline-none"
                >
                  <option value="draft">草稿</option>
                  <option value="published">已发布</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">内容 (Markdown)</label>
                <textarea
                  value={form.content}
                  onChange={e => setForm({ ...form, content: e.target.value })}
                  rows={12}
                  placeholder="页面内容，支持 Markdown 格式..."
                  className="w-full px-4 py-2.5 bg-[var(--color-background)] border border-white/10 rounded-lg text-white font-mono text-sm focus:border-[var(--color-primary)] focus:outline-none resize-none"
                />
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

      {/* Pages Table */}
      <div className="bg-[var(--color-surface)] rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-gray-500 uppercase">
              <th className="px-4 py-3 font-medium">标题</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">状态</th>
              <th className="px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {pages.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                  暂无页面，点击"新建页面"创建
                </td>
              </tr>
            ) : pages.map(page => (
              <tr key={page.id} className="text-sm">
                <td className="px-4 py-3 text-white">{page.title}</td>
                <td className="px-4 py-3 text-gray-500">/{page.slug}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${
                    page.status === 'published'
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-yellow-500/20 text-yellow-400'
                  }`}>
                    {page.status === 'published' ? '已发布' : '草稿'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <a
                      href={`/${page.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                    </a>
                    <button
                      onClick={() => openEdit(page)}
                      className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded transition-colors"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(page.id)}
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