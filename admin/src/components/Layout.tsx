import { Link, useLocation } from 'react-router-dom';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { ChevronRight, Home } from 'lucide-react';
import { useMemo } from 'react';

const ROUTE_LABELS: Record<string, string> = {
  '': '控制台',
  articles: '文章管理',
  categories: '分类管理',
  navigation: '导航管理',
  pages: '页面管理',
  affiliates: '联盟链接',
  settings: '网站设置',
  media: '媒体库',
};

export default function Layout() {
  const location = useLocation();

  const breadcrumbs = useMemo(() => {
    const paths = location.pathname.split('/').filter(Boolean);
    const crumbs: { label: string; path: string; isLast: boolean }[] = [];

    // Always start with dashboard home
    crumbs.push({
      label: '后台管理',
      path: '/',
      isLast: paths.length === 0,
    });

    if (paths.length > 0) {
      const fullPath = '/' + paths.join('/');
      const currentLabel = ROUTE_LABELS[paths[paths.length - 1]] || paths[paths.length - 1];
      crumbs.push({
        label: currentLabel,
        path: fullPath,
        isLast: true,
      });
    }

    return crumbs;
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen bg-[var(--color-background)]">
      <Sidebar />
      <main className="flex-1 ml-64 flex flex-col">
        {/* Breadcrumb Navigation */}
        <div className="bg-[var(--color-surface)] border-b border-white/10 px-6 py-3">
          <nav className="flex items-center gap-2 text-sm">
            <Link
              to="/"
              className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors"
            >
              <Home className="w-4 h-4" />
              <span>后台管理</span>
            </Link>
            {breadcrumbs.slice(1).map((crumb, index) => (
              <span key={index} className="flex items-center gap-2">
                <ChevronRight className="w-4 h-4 text-gray-600" />
                {crumb.isLast ? (
                  <span className="text-white">{crumb.label}</span>
                ) : (
                  <Link
                    to={crumb.path}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    {crumb.label}
                  </Link>
                )}
              </span>
            ))}
          </nav>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}