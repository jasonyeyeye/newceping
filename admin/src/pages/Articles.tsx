import { useState, useEffect } from 'react';
import { Search, Edit, Trash2, RefreshCw } from 'lucide-react';
import { getArticles, getCategories, getFeishuDocs, writeGitHubFile } from '../lib/api';

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
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

export default function Articles() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [feishuToken, setFeishuToken] = useState('');
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [arts, cats] = await Promise.all([getArticles(), getCategories()]);
      setArticles(arts);
      setCategories(cats);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSyncFeishu() {
    if (!feishuToken.trim()) {
      alert('Please enter Feishu folder token');
      return;
    }
    setSyncing(true);
    try {
      const docs = await getFeishuDocs(feishuToken);
      alert(`Found ${docs.data?.files?.length || 0} documents`);
    } catch (err) {
      alert('Failed to sync: ' + (err as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  async function handlePublish(article: Article) {
    if (!confirm(`Publish "${article.title}" to GitHub?`)) return;
    try {
      const content = `---
title: "${article.title}"
description: "${article.excerpt || ''}"
category: "${categories.find(c => c.id === article.categoryId)?.name || ''}"
categorySlug: "${categories.find(c => c.id === article.categoryId)?.slug || ''}"
featuredImage: "${article.featuredImage || ''}"
publishedAt: "${article.publishedAt || new Date().toISOString()}"
---

Article content from Feishu (${article.feishuDocUrl || 'link not available'})
`;
      await writeGitHubFile(
        `src/content/blog/${article.slug}.md`,
        content,
        `Publish article: ${article.title}`
      );
      alert('Published to GitHub! Cloudflare Pages will rebuild.');
    } catch (err) {
      alert('Failed to publish: ' + (err as Error).message);
    }
  }

  function getCategoryName(catId: string) {
    return categories.find(c => c.id === catId)?.name || catId;
  }

  const filtered = articles.filter(a =>
    a.title.toLowerCase().includes(search.toLowerCase())
  );

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
        <h1 className="text-2xl font-bold text-white">Articles</h1>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Feishu Sync */}
      <div className="bg-[var(--color-surface)] rounded-xl border border-white/10 p-6 mb-6">
        <h2 className="font-semibold text-white mb-4">Sync from Feishu</h2>
        <div className="flex gap-3">
          <input
            type="text"
            value={feishuToken}
            onChange={e => setFeishuToken(e.target.value)}
            placeholder="Enter Feishu folder token"
            className="flex-1 px-4 py-2.5 bg-[var(--color-background)] border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:border-[var(--color-primary)] focus:outline-none"
          />
          <button
            onClick={handleSyncFeishu}
            disabled={syncing}
            className="px-4 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/80 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {syncing ? 'Syncing...' : 'Sync Docs'}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Get the folder token from Feishu shared folder URL
        </p>
      </div>

      {/* Articles List */}
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
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No articles yet. Sync from Feishu to get started.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-gray-500 uppercase">
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Feishu</th>
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
                  <td className="px-4 py-3 text-gray-400">{getCategoryName(article.categoryId)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                      article.status === 'published'
                        ? 'bg-green-500/20 text-green-400'
                        : article.status === 'deleted'
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {article.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {article.feishuDocId ? (
                      <span className="text-xs text-green-400">Linked</span>
                    ) : (
                      <span className="text-xs text-gray-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {article.feishuDocId && article.status !== 'published' && (
                        <button
                          onClick={() => handlePublish(article)}
                          className="px-2 py-1 text-xs bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded transition-colors"
                        >
                          Publish
                        </button>
                      )}
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
        )}
      </div>
    </div>
  );
}