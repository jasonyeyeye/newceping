import { FileText, Folder, Eye } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getCategoriesWithCount, getArticles } from '../lib/api';

interface Category {
  id: string;
  name: string;
  slug: string;
  articleCount: number;
}

export default function Dashboard() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [stats, setStats] = useState({
    totalArticles: 0,
    publishedArticles: 0,
    draftArticles: 0,
    categories: 0,
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [cats, articles] = await Promise.all([
        getCategoriesWithCount(),
        getArticles(),
      ]);
      setCategories(cats);
      setStats({
        totalArticles: articles.length,
        publishedArticles: articles.filter((a: any) => a.status === 'published').length,
        draftArticles: articles.filter((a: any) => a.status === 'draft').length,
        categories: cats.length,
      });
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  }

  const statCards = [
    { label: '文章总数', value: stats.totalArticles, icon: FileText, change: '全部文章' },
    { label: '已发布', value: stats.publishedArticles, icon: Eye, change: '已上线' },
    { label: '草稿', value: stats.draftArticles, icon: FileText, change: '待发布' },
    { label: '分类', value: stats.categories, icon: Folder, change: '内容分类' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">控制台</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map(({ label, value, icon: Icon, change }) => (
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

      {/* Categories Overview */}
      <div className="bg-[var(--color-surface)] rounded-xl p-6 border border-white/10 mb-6">
        <h2 className="font-semibold text-white mb-4">分类概览</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {categories.map(cat => (
            <Link
              key={cat.id}
              to={`/categories`}
              className="p-4 bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
            >
              <span className="text-white font-medium block">{cat.name}</span>
              <span className="text-xs text-gray-500">{cat.articleCount} 篇文章</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-[var(--color-surface)] rounded-xl p-6 border border-white/10">
        <h2 className="font-semibold text-white mb-4">快捷操作</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link to="articles" className="px-4 py-3 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-gray-300 text-center transition-colors block">
            新建文章
          </Link>
          <Link to="categories" className="px-4 py-3 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-gray-300 text-center transition-colors block">
            管理分类
          </Link>
          <Link to="navigation" className="px-4 py-3 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-gray-300 text-center transition-colors block">
            编辑导航
          </Link>
          <Link to="settings" className="px-4 py-3 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-gray-300 text-center transition-colors block">
            网站设置
          </Link>
        </div>
      </div>
    </div>
  );
}