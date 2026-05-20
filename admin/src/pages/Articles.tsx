import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Edit, Trash2, RefreshCw, X, CheckCircle, Link as LinkIcon } from 'lucide-react';
import { getArticles, getCategories, getFeishuDocs, syncArticleFromFeishu, getArticle, updateArticle, deleteArticle, writeGitHubFile } from '../lib/api';

interface Article {
  id: string;
  slug: string;
  title: string;
  categoryId: string;
  feishuDocId?: string;
  feishuDocUrl?: string;
  status: 'draft' | 'published' | 'updated' | 'deleted';
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  featuredImage?: string;
  excerpt?: string;
  seo?: any;
  affiliate?: any;
  content?: string;
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface FeishuDoc {
  token: string;
  name: string;
  type: string;
  url: string;
  edited_time: string;
}

interface SeoForm {
  metaTitle: string;
  metaDescription: string;
  canonicalUrl: string;
  focusKeyword: string;
}

type StatusFilter = 'all' | 'draft' | 'published' | 'updated' | 'deleted';

// ========== Markdown Renderer ==========
function renderMarkdown(markdown: string): string {
  if (!markdown) return '<p class="text-gray-500">预览区域</p>';

  let html = markdown
    // Escape HTML first
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks (must be before inline code)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, __, code) => {
    return `<pre class="bg-gray-900 rounded-lg p-4 my-3 overflow-x-auto border border-white/10"><code class="text-sm text-green-400">${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="bg-gray-800 text-pink-400 px-1.5 py-0.5 rounded text-sm font-mono">$1</code>');

  // Images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="max-w-full rounded-lg my-3" />');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-lg font-bold text-white mt-6 mb-3">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold text-white mt-6 mb-3">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold text-white mt-6 mb-4">$1</h1>');

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold text-white">$1</strong>');
  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em class="italic text-gray-300">$1</em>');

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, '<blockquote class="border-l-4 border-[var(--color-primary)] pl-4 my-3 text-gray-400 italic">$1</blockquote>');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr class="border-white/10 my-6" />');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-[var(--color-primary)] hover:underline" target="_blank" rel="noopener">$1</a>');

  // Unordered lists
  html = html.replace(/^[-*] (.+)$/gm, '<li class="ml-6 list-disc text-gray-300 mb-1">$1</li>');
  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="ml-6 list-decimal text-gray-300 mb-1">$1</li>');

  // Paragraphs - wrap remaining lines
  const lines = html.split('\n');
  const processed: string[] = [];
  let inList = false;
  let listBuffer: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('<li')) {
      if (!inList) {
        inList = true;
        listBuffer = [];
      }
      listBuffer.push(trimmed);
    } else {
      if (inList) {
        processed.push('<ul class="my-3 space-y-1">' + listBuffer.join('') + '</ul>');
        listBuffer = [];
        inList = false;
      }
      if (trimmed) {
        processed.push('<p class="text-gray-300 mb-3 leading-relaxed">' + trimmed + '</p>');
      }
    }
  }
  if (inList) {
    processed.push('<ul class="my-3 space-y-1">' + listBuffer.join('') + '</ul>');
  }

  return processed.join('\n') || '<p class="text-gray-500">预览区域</p>';
}

// ========== SEO Status Color ==========
function getSeoColor(current: number, redBelow: number, greenRange: [number, number], yellowAbove: number): string {
  if (current < redBelow) return 'text-red-400';
  if (current >= greenRange[0] && current <= greenRange[1]) return 'text-green-400';
  if (current > yellowAbove) return 'text-red-400';
  return 'text-yellow-400';
}

// ========== Toolbar Button Insert ==========
function insertAtCursor(textarea: HTMLTextAreaElement, before: string, after: string = '') {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.substring(start, end);
  const newText = before + (selected || '文字') + after;
  textarea.setRangeText(newText, start, end, 'select');
  textarea.focus();
}

export default function Articles() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [feishuToken, setFeishuToken] = useState('');
  const [feishuDocs, setFeishuDocs] = useState<FeishuDoc[]>([]);
  const [showFeishu, setShowFeishu] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<Record<string, 'idle' | 'syncing' | 'done' | 'exists' | 'error'>>({});

  // Editor modal
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editForm, setEditForm] = useState<Partial<Article>>({});
  const [activeTab, setActiveTab] = useState<'content' | 'seo'>('content');
  const [seoForm, setSeoForm] = useState<SeoForm>({
    metaTitle: '',
    metaDescription: '',
    canonicalUrl: '',
    focusKeyword: '',
  });
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [arts, cats] = await Promise.all([getArticles(), getCategories()]);
      setArticles(arts);
      setCategories(cats);
    } catch (err) {
      console.error('加载数据失败:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSyncFeishu() {
    if (!feishuToken.trim()) {
      alert('请输入飞书文件夹 token');
      return;
    }
    setSyncing(true);
    try {
      const docs = await getFeishuDocs(feishuToken);
      const files = docs.data?.files || [];
      setFeishuDocs(files.filter((f: any) => f.type !== 'folder'));
      setShowFeishu(true);
    } catch (err) {
      alert('同步失败: ' + (err as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  async function handleSyncDoc(doc: FeishuDoc) {
    setSyncStatus(prev => ({ ...prev, [doc.token]: 'syncing' }));
    try {
      const slug = doc.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 50);
      const result = await syncArticleFromFeishu(doc.token, doc.name, '', slug);

      if (result.alreadyExists) {
        setSyncStatus(prev => ({ ...prev, [doc.token]: 'exists' }));
        alert(`"${doc.name}" 已经同步过`);
      } else {
        setSyncStatus(prev => ({ ...prev, [doc.token]: 'done' }));
        await loadData();
        alert(`"${doc.name}" 同步成功！`);
      }
    } catch (err) {
      setSyncStatus(prev => ({ ...prev, [doc.token]: 'error' }));
      alert('同步失败: ' + (err as Error).message);
    }
  }

  async function handlePublish(article: Article) {
    if (!confirm(`确认发布 "${article.title}" 到 GitHub？`)) return;
    try {
      const category = categories.find(c => c.id === article.categoryId);
      const content = `---
title: "${article.title}"
description: "${article.excerpt || ''}"
category: "${category?.name || ''}"
categorySlug: "${category?.slug || ''}"
featuredImage: "${article.featuredImage || ''}"
publishedAt: "${article.publishedAt || new Date().toISOString()}"
---

${article.content || '文章内容'}
`;
      await writeGitHubFile(
        `src/content/blog/${article.slug}.md`,
        content,
        `发布文章: ${article.title}`
      );

      await updateArticle(article.id, { ...article, status: 'published', publishedAt: new Date().toISOString() });
      await loadData();
      alert('已发布到 GitHub！Cloudflare Pages 将重新构建。');
    } catch (err) {
      alert('发布失败: ' + (err as Error).message);
    }
  }

  async function handleOpenEditor(article: Article) {
    try {
      const full = await getArticle(article.id);
      setEditingArticle(full);
      setEditContent(full.content || '');
      setEditForm({
        title: full.title,
        slug: full.slug,
        excerpt: full.excerpt,
        featuredImage: full.featuredImage,
        categoryId: full.categoryId,
        status: full.status,
      });
      // Load SEO fields
      setSeoForm({
        metaTitle: full.seo?.metaTitle || full.title || '',
        metaDescription: full.seo?.metaDescription || full.excerpt || '',
        canonicalUrl: full.seo?.canonicalUrl || `/blog/${full.slug}`,
        focusKeyword: full.seo?.focusKeyword || '',
      });
      setActiveTab('content');
    } catch (err) {
      alert('加载文章详情失败');
    }
  }

  async function handleSaveEditor() {
    if (!editingArticle) return;
    setSaving(true);
    try {
      await updateArticle(editingArticle.id, {
        ...editingArticle,
        ...editForm,
        content: editContent,
        seo: {
          metaTitle: seoForm.metaTitle,
          metaDescription: seoForm.metaDescription,
          canonicalUrl: seoForm.canonicalUrl,
          focusKeyword: seoForm.focusKeyword,
        },
      });
      alert('保存成功！');
      setEditingArticle(null);
      await loadData();
    } catch (err) {
      alert('保存失败: ' + (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('确认删除？')) return;
    try {
      await deleteArticle(id);
      await loadData();
    } catch (err) {
      alert('删除失败: ' + (err as Error).message);
    }
  }

  function getCategoryName(catId: string) {
    return categories.find(c => c.id === catId)?.name || '未分类';
  }

  // Toolbar actions
  const handleToolbar = useCallback((action: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = ta.value.substring(start, end);

    switch (action) {
      case 'bold':
        insertAtCursor(ta, '**', '**');
        break;
      case 'italic':
        insertAtCursor(ta, '*', '*');
        break;
      case 'h1':
        insertAtCursor(ta, '# ');
        break;
      case 'h2':
        insertAtCursor(ta, '## ');
        break;
      case 'h3':
        insertAtCursor(ta, '### ');
        break;
      case 'link':
        if (selected) {
          insertAtCursor(ta, '[', '](url)');
        } else {
          insertAtCursor(ta, '[链接文本](url)');
        }
        break;
      case 'quote':
        insertAtCursor(ta, '> ');
        break;
      case 'code':
        insertAtCursor(ta, '`', '`');
        break;
      case 'codeblock':
        insertAtCursor(ta, '```\n', '\n```');
        break;
      case 'ul':
        insertAtCursor(ta, '- ');
        break;
      case 'ol':
        insertAtCursor(ta, '1. ');
        break;
      case 'img':
        insertAtCursor(ta, '![描述](图片URL)');
        break;
      case 'hr':
        insertAtCursor(ta, '\n---\n');
        break;
    }
  }, []);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b') {
        e.preventDefault();
        handleToolbar('bold');
      } else if (e.key === 'i') {
        e.preventDefault();
        handleToolbar('italic');
      }
    }
  }, [handleToolbar]);

  const filtered = articles.filter(a => {
    const matchSearch = a.title.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || a.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const statusCounts = {
    all: articles.length,
    draft: articles.filter(a => a.status === 'draft').length,
    published: articles.filter(a => a.status === 'published').length,
    updated: articles.filter(a => a.status === 'updated').length,
    deleted: articles.filter(a => a.status === 'deleted').length,
  };

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
        <h1 className="text-2xl font-bold text-white">文章管理</h1>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          刷新
        </button>
      </div>

      {/* Status Filters */}
      <div className="flex gap-2 mb-6">
        {(['all', 'draft', 'published', 'updated', 'deleted'] as StatusFilter[]).map(status => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === status
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-white/5 text-gray-400 hover:bg-white/10'
            }`}
          >
            {status === 'all' ? '全部' : status === 'draft' ? '草稿' : status === 'published' ? '已发布' : status === 'updated' ? '已更新' : '已删除'} ({statusCounts[status]})
          </button>
        ))}
      </div>

      {/* Feishu Sync */}
      <div className="bg-[var(--color-surface)] rounded-xl border border-white/10 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-white">从飞书同步</h2>
          <button
            onClick={() => setShowFeishu(!showFeishu)}
            className="text-sm text-[var(--color-primary)] hover:underline"
          >
            {showFeishu ? '收起' : '展开'}
          </button>
        </div>

        {showFeishu ? (
          <div className="space-y-4">
            <div className="flex gap-3">
              <input
                type="text"
                value={feishuToken}
                onChange={e => setFeishuToken(e.target.value)}
                placeholder="输入飞书文件夹 token"
                className="flex-1 px-4 py-2.5 bg-[var(--color-background)] border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:border-[var(--color-primary)] focus:outline-none"
              />
              <button
                onClick={handleSyncFeishu}
                disabled={syncing}
                className="px-4 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/80 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {syncing ? '加载中...' : '加载文档'}
              </button>
            </div>

            {feishuDocs.length > 0 && (
              <div className="max-h-80 overflow-y-auto border border-white/10 rounded-lg">
                <table className="w-full">
                  <thead className="sticky top-0 bg-[var(--color-surface)]">
                    <tr className="text-left text-xs text-gray-500 uppercase">
                      <th className="px-4 py-2 font-medium">文档</th>
                      <th className="px-4 py-2 font-medium w-24">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {feishuDocs.map(doc => (
                      <tr key={doc.token} className="text-sm">
                        <td className="px-4 py-2">
                          <span className="text-white">{doc.name}</span>
                          {doc.url && (
                            <a href={doc.url} target="_blank" rel="noopener noreferrer" className="ml-2 text-xs text-gray-500 hover:text-[var(--color-primary)]">
                              <LinkIcon className="w-3 h-3 inline" />
                            </a>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <button
                            onClick={() => handleSyncDoc(doc)}
                            disabled={syncStatus[doc.token] === 'syncing'}
                            className={`px-2 py-1 rounded text-xs transition-colors ${
                              syncStatus[doc.token] === 'done' ? 'bg-green-500/20 text-green-400' :
                              syncStatus[doc.token] === 'exists' ? 'bg-yellow-500/20 text-yellow-400' :
                              syncStatus[doc.token] === 'error' ? 'bg-red-500/20 text-red-400' :
                              'bg-white/10 hover:bg-white/20 text-white'
                            }`}
                          >
                            {syncStatus[doc.token] === 'syncing' ? '同步中...' :
                             syncStatus[doc.token] === 'done' ? '已同步' :
                             syncStatus[doc.token] === 'exists' ? '已存在' :
                             syncStatus[doc.token] === 'error' ? '失败' : '同步'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="flex gap-3">
            <input
              type="text"
              value={feishuToken}
              onChange={e => setFeishuToken(e.target.value)}
              placeholder="输入飞书文件夹 token"
              className="flex-1 px-4 py-2.5 bg-[var(--color-background)] border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:border-[var(--color-primary)] focus:outline-none"
            />
            <button
              onClick={handleSyncFeishu}
              disabled={syncing}
              className="px-4 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/80 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {syncing ? '同步中...' : '同步文档'}
            </button>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="bg-[var(--color-surface)] rounded-xl border border-white/10 p-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索文章标题..."
            className="w-full pl-10 pr-4 py-2 bg-[var(--color-background)] border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:border-[var(--color-primary)] focus:outline-none"
          />
        </div>
      </div>

      {/* Articles List */}
      <div className="bg-[var(--color-surface)] rounded-xl border border-white/10 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            暂无文章
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-gray-500 uppercase">
                <th className="px-4 py-3 font-medium">标题</th>
                <th className="px-4 py-3 font-medium">分类</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">更新时间</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map(article => (
                <tr key={article.id} className="text-sm">
                  <td className="px-4 py-3">
                    <span className="text-white">{article.title}</span>
                    <span className="block text-xs text-gray-500">/{article.slug}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{getCategoryName(article.categoryId)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                      article.status === 'published'
                        ? 'bg-green-500/20 text-green-400'
                        : article.status === 'deleted'
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {article.status === 'published' ? '已发布' : article.status === 'deleted' ? '已删除' : '草稿'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{new Date(article.updatedAt).toLocaleDateString('zh-CN')}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEditor(article)}
                        className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded transition-colors"
                        title="编辑"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      {article.status !== 'published' && (
                        <button
                          onClick={() => handlePublish(article)}
                          className="p-1.5 text-green-500 hover:text-green-400 hover:bg-green-500/10 rounded transition-colors"
                          title="发布"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(article.id)}
                        className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Editor Modal */}
      {editingArticle && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center pt-6 overflow-y-auto">
          <div className="bg-[var(--color-dark)] border border-white/10 rounded-xl w-full max-w-6xl m-4">
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h2 className="text-lg font-bold text-white">编辑文章</h2>
              <button onClick={() => setEditingArticle(null)} className="p-1 text-gray-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">标题</label>
                  <input
                    type="text"
                    value={editForm.title || ''}
                    onChange={e => setEditForm({ ...editForm, title: e.target.value })}
                    className="w-full px-4 py-2.5 bg-[var(--color-background)] border border-white/10 rounded-lg text-white focus:border-[var(--color-primary)] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Slug</label>
                  <input
                    type="text"
                    value={editForm.slug || ''}
                    onChange={e => setEditForm({ ...editForm, slug: e.target.value })}
                    className="w-full px-4 py-2.5 bg-[var(--color-background)] border border-white/10 rounded-lg text-white focus:border-[var(--color-primary)] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">分类</label>
                  <select
                    value={editForm.categoryId || ''}
                    onChange={e => setEditForm({ ...editForm, categoryId: e.target.value })}
                    className="w-full px-4 py-2.5 bg-[var(--color-background)] border border-white/10 rounded-lg text-white focus:border-[var(--color-primary)] focus:outline-none"
                  >
                    <option value="">未分类</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">状态</label>
                  <select
                    value={editForm.status || 'draft'}
                    onChange={e => setEditForm({ ...editForm, status: e.target.value as any })}
                    className="w-full px-4 py-2.5 bg-[var(--color-background)] border border-white/10 rounded-lg text-white focus:border-[var(--color-primary)] focus:outline-none"
                  >
                    <option value="draft">草稿</option>
                    <option value="published">已发布</option>
                    <option value="updated">已更新</option>
                    <option value="deleted">已删除</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">摘要</label>
                <textarea
                  value={editForm.excerpt || ''}
                  onChange={e => setEditForm({ ...editForm, excerpt: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2.5 bg-[var(--color-background)] border border-white/10 rounded-lg text-white focus:border-[var(--color-primary)] focus:outline-none resize-none"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">封面图</label>
                <input
                  type="text"
                  value={editForm.featuredImage || ''}
                  onChange={e => setEditForm({ ...editForm, featuredImage: e.target.value })}
                  placeholder="输入图片 URL"
                  className="w-full px-4 py-2.5 bg-[var(--color-background)] border border-white/10 rounded-lg text-white focus:border-[var(--color-primary)] focus:outline-none"
                />
              </div>

              {/* Tab Navigation */}
              <div className="flex border-b border-white/10">
                <button
                  onClick={() => setActiveTab('content')}
                  className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'content'
                      ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                      : 'border-transparent text-gray-500 hover:text-white'
                  }`}
                >
                  内容
                </button>
                <button
                  onClick={() => setActiveTab('seo')}
                  className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'seo'
                      ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                      : 'border-transparent text-gray-500 hover:text-white'
                  }`}
                >
                  SEO
                </button>
              </div>

              {/* Content Tab */}
              {activeTab === 'content' && (
                <div className="space-y-3">
                  {/* Toolbar */}
                  <div className="flex flex-wrap gap-1 p-2 bg-[var(--color-background)] border border-white/10 rounded-lg">
                    {[
                      { action: 'bold', label: 'B', title: '粗体 (Ctrl+B)', style: 'font-bold' },
                      { action: 'italic', label: 'I', title: '斜体 (Ctrl+I)', style: 'italic' },
                      { action: 'h1', label: 'H1', title: '一级标题', style: 'font-bold text-sm' },
                      { action: 'h2', label: 'H2', title: '二级标题', style: 'font-bold text-sm' },
                      { action: 'h3', label: 'H3', title: '三级标题', style: 'font-bold text-sm' },
                      { action: 'link', label: '🔗', title: '链接', style: '' },
                      { action: 'quote', label: '"', title: '引用', style: '' },
                      { action: 'code', label: '`', title: '行内代码', style: 'font-mono' },
                      { action: 'codeblock', label: '{ }', title: '代码块', style: 'font-mono text-xs' },
                      { action: 'ul', label: '•—', title: '无序列表', style: '' },
                      { action: 'ol', label: '1.', title: '有序列表', style: '' },
                      { action: 'img', label: '🖼', title: '图片', style: '' },
                      { action: 'hr', label: '—', title: '分割线', style: '' },
                    ].map(btn => (
                      <button
                        key={btn.action}
                        onClick={() => handleToolbar(btn.action)}
                        title={btn.title}
                        className={`px-3 py-1.5 text-sm text-gray-300 hover:bg-white/10 hover:text-white rounded transition-colors ${btn.style}`}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>

                  {/* Dual Pane Editor */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {/* Left: Editor */}
                    <div className="flex flex-col">
                      <div className="text-xs text-gray-500 mb-2 px-1">编辑区 <span className="text-gray-600">(Markdown)</span></div>
                      <textarea
                        ref={textareaRef}
                        value={editContent}
                        onChange={e => setEditContent(e.target.value)}
                        onKeyDown={handleKeyDown}
                        rows={20}
                        className="flex-1 w-full px-4 py-3 bg-[var(--color-background)] border border-white/10 rounded-lg text-white font-mono text-sm focus:border-[var(--color-primary)] focus:outline-none resize-none leading-relaxed"
                        placeholder="在此输入文章内容..."
                      />
                    </div>

                    {/* Right: Preview */}
                    <div className="flex flex-col">
                      <div className="text-xs text-gray-500 mb-2 px-1">预览区</div>
                      <div
                        className="flex-1 p-4 bg-[var(--color-background)] border border-white/10 rounded-lg overflow-y-auto"
                        style={{ minHeight: '20rem' }}
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(editContent) }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* SEO Tab */}
              {activeTab === 'seo' && (
                <div className="space-y-5">
                  {/* Google Preview Card */}
                  <div>
                    <div className="text-sm text-gray-400 mb-3">Google 搜索预览</div>
                    <div className="bg-white rounded-lg p-4 max-w-xl">
                      <div className="text-lg font-medium text-blue-600 leading-tight truncate">
                        {seoForm.metaTitle || editForm.title || '文章标题'}
                      </div>
                      <div className="text-sm text-green-700 leading-tight mt-0.5">
                        {seoForm.canonicalUrl || `https://yoursite.com/blog/${editForm.slug || 'article-slug'}`}
                      </div>
                      <div className="text-sm text-gray-600 leading-snug mt-1">
                        {seoForm.metaDescription || editForm.excerpt || '文章摘要将显示在这里...' }
                      </div>
                    </div>
                  </div>

                  {/* SEO Stats */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-[var(--color-background)] border border-white/10 rounded-lg">
                      <div className="text-xs text-gray-500 mb-2">标题字数</div>
                      <div className="flex items-center gap-3">
                        <span className={`text-lg font-bold ${getSeoColor(seoForm.metaTitle.length, 30, [30, 60], 60)}`}>
                          {seoForm.metaTitle.length}
                        </span>
                        <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all ${seoForm.metaTitle.length >= 30 && seoForm.metaTitle.length <= 60 ? 'bg-green-500' : seoForm.metaTitle.length > 60 || seoForm.metaTitle.length < 30 ? 'bg-red-500' : 'bg-yellow-500'}`}
                            style={{ width: `${Math.min(100, (seoForm.metaTitle.length / 60) * 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-xs text-gray-600 mt-2">建议 50-60 字，当前 <span className={seoForm.metaTitle.length > 60 ? 'text-red-400' : seoForm.metaTitle.length < 30 ? 'text-red-400' : 'text-green-400'}>{seoForm.metaTitle.length}</span>/60</div>
                    </div>
                    <div className="p-4 bg-[var(--color-background)] border border-white/10 rounded-lg">
                      <div className="text-xs text-gray-500 mb-2">描述字数</div>
                      <div className="flex items-center gap-3">
                        <span className={`text-lg font-bold ${getSeoColor(seoForm.metaDescription.length, 120, [120, 160], 160)}`}>
                          {seoForm.metaDescription.length}
                        </span>
                        <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all ${seoForm.metaDescription.length >= 120 && seoForm.metaDescription.length <= 160 ? 'bg-green-500' : seoForm.metaDescription.length > 160 || seoForm.metaDescription.length < 120 ? 'bg-red-500' : 'bg-yellow-500'}`}
                            style={{ width: `${Math.min(100, (seoForm.metaDescription.length / 160) * 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-xs text-gray-600 mt-2">建议 150-160 字，当前 <span className={seoForm.metaDescription.length > 160 ? 'text-red-400' : seoForm.metaDescription.length < 120 ? 'text-red-400' : 'text-green-400'}>{seoForm.metaDescription.length}</span>/160</div>
                    </div>
                  </div>

                  {/* SEO Fields */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Meta Title <span className="text-xs text-gray-600">(浏览器标签/搜索结果标题)</span></label>
                      <input
                        type="text"
                        value={seoForm.metaTitle}
                        onChange={e => setSeoForm({ ...seoForm, metaTitle: e.target.value })}
                        placeholder={editForm.title || '输入 SEO 标题'}
                        className="w-full px-4 py-2.5 bg-[var(--color-background)] border border-white/10 rounded-lg text-white focus:border-[var(--color-primary)] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Meta Description <span className="text-xs text-gray-600">(搜索结果描述)</span></label>
                      <textarea
                        value={seoForm.metaDescription}
                        onChange={e => setSeoForm({ ...seoForm, metaDescription: e.target.value })}
                        rows={3}
                        placeholder={editForm.excerpt || '输入 SEO 描述'}
                        className="w-full px-4 py-2.5 bg-[var(--color-background)] border border-white/10 rounded-lg text-white focus:border-[var(--color-primary)] focus:outline-none resize-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Canonical URL</label>
                      <input
                        type="text"
                        value={seoForm.canonicalUrl}
                        onChange={e => setSeoForm({ ...seoForm, canonicalUrl: e.target.value })}
                        placeholder={`/blog/${editForm.slug || 'article-slug'}`}
                        className="w-full px-4 py-2.5 bg-[var(--color-background)] border border-white/10 rounded-lg text-white focus:border-[var(--color-primary)] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Focus Keyword <span className="text-xs text-gray-600">(核心关键词)</span></label>
                      <input
                        type="text"
                        value={seoForm.focusKeyword}
                        onChange={e => setSeoForm({ ...seoForm, focusKeyword: e.target.value })}
                        placeholder="输入核心关键词"
                        className="w-full px-4 py-2.5 bg-[var(--color-background)] border border-white/10 rounded-lg text-white focus:border-[var(--color-primary)] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 p-4 border-t border-white/10">
              <button
                onClick={() => setEditingArticle(null)}
                className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSaveEditor}
                disabled={saving}
                className="px-6 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/80 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}