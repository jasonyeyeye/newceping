import { FileText, Folder, Link2, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getCategoriesWithCount, getArticles, getAffiliates } from '../lib/api';

interface Category {
  id: string;
  name: string;
  slug: string;
  articleCount: number;
}

interface Article {
  id: string;
  title: string;
  updatedAt?: string;
}

interface Affiliate {
  id: string;
  clicks?: number;
}

interface Stats {
  totalArticles: number;
  publishedArticles: number;
  draftArticles: number;
  categories: number;
  affiliateLinks: number;
  totalClicks: number;
  recentUpdate: string | null;
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [recentArticles, setRecentArticles] = useState<Article[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalArticles: 0,
    publishedArticles: 0,
    draftArticles: 0,
    categories: 0,
    affiliateLinks: 0,
    totalClicks: 0,
    recentUpdate: null,
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [cats, articles, affiliates] = await Promise.all([
        getCategoriesWithCount(),
        getArticles(),
        getAffiliates(),
      ]);

      setCategories(cats);

      // Calculate stats
      const published = articles.filter((a: any) => a.status === 'published').length;
      const draft = articles.filter((a: any) => a.status === 'draft').length;

      // Sort articles by updatedAt to find most recent
      const sorted = [...articles].sort((a: any, b: any) => {
        const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return dateB - dateA;
      });

      // Get top 5 recent articles
      setRecentArticles(sorted.slice(0, 5));

      // Recent update
      const mostRecent = sorted[0];
      let recentUpdate: string | null = null;
      if (mostRecent?.updatedAt) {
        const d = new Date(mostRecent.updatedAt);
        recentUpdate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }

      // Affiliate stats
      const totalClicks = affiliates.reduce((sum: number, a: Affiliate) => sum + (a.clicks || 0), 0);

      setStats({
        totalArticles: articles.length,
        publishedArticles: published,
        draftArticles: draft,
        categories: cats.length,
        affiliateLinks: affiliates.length,
        totalClicks,
        recentUpdate,
      });
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }

  const statCards = [
    {
      label: '文章总数',
      value: stats.totalArticles,
      sub: `已发布 ${stats.publishedArticles} / 草稿 ${stats.draftArticles}`,
      icon: FileText,
    },
    {
      label: '分类总数',
      value: stats.categories,
      sub: '内容分类',
      icon: Folder,
    },
    {
      label: '联盟链接',
      value: stats.affiliateLinks,
      sub: `总点击 ${stats.totalClicks}`,
      icon: Link2,
    },
    {
      label: '最近更新',
      value: stats.recentUpdate || '-',
      sub: '最后文章更新时间',
      icon: Clock,
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">控制台</h1>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map(({ label, value, sub, icon: Icon }) => (
          <div
            key={label}
            className="bg-[var(--color-surface)] rounded-xl p-5 border border-white/10"
          >
            {loading ? (
              <div className="animate-pulse">
                <div className="h-4 bg-white/10 rounded w-20 mb-3" />
                <div className="h-8 bg-white/10 rounded w-16 mb-2" />
                <div className="h-3 bg-white/10 rounded w-24" />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-gray-400">{label}</span>
                  <Icon className="w-4 h-4 text-[var(--color-primary)]" />
                </div>
                <p className="text-2xl font-bold text-white mb-1">{value}</p>
                <p className="text-xs text-gray-500">{sub}</p>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Recent Updates */}
      <div className="bg-[var(--color-surface)] rounded-xl p-6 border border-white/10 mb-6">
        <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          最近更新
        </h2>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse flex items-center gap-3">
                <div className="h-3 bg-white/10 rounded w-full" />
              </div>
            ))}
          </div>
        ) : recentArticles.length > 0 ? (
          <div className="space-y-2">
            {recentArticles.map(article => (
              <div
                key={article.id}
                className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/5 transition-colors"
              >
                <span className="text-gray-300 text-sm">{article.title}</span>
                {article.updatedAt && (
                  <span className="text-xs text-gray-500">
                    {new Date(article.updatedAt).toLocaleDateString('zh-CN')}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">暂无文章</p>
        )}
      </div>

      {/* Categories Overview */}
      <div className="bg-[var(--color-surface)] rounded-xl p-6 border border-white/10 mb-6">
        <h2 className="font-semibold text-white mb-4">分类概览</h2>
        {categories.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {categories.map(cat => (
              <Link
                key={cat.id}
                to="/categories"
                className="p-4 bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
              >
                <span className="text-white font-medium block">{cat.name}</span>
                <span className="text-xs text-gray-500">{cat.articleCount} 篇文章</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">暂无分类</p>
        )}
      </div>

      {/* Quick Actions */}
      <div className="bg-[var(--color-surface)] rounded-xl p-6 border border-white/10">
        <h2 className="font-semibold text-white mb-4">快捷操作</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link
            to="articles"
            className="px-4 py-3 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-gray-300 text-center transition-colors block"
          >
            新建文章
          </Link>
          <Link
            to="categories"
            className="px-4 py-3 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-gray-300 text-center transition-colors block"
          >
            管理分类
          </Link>
          <Link
            to="navigation"
            className="px-4 py-3 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-gray-300 text-center transition-colors block"
          >
            编辑导航
          </Link>
          <Link
            to="settings"
            className="px-4 py-3 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-gray-300 text-center transition-colors block"
          >
            网站设置
          </Link>
        </div>
      </div>
    </div>
  );
}