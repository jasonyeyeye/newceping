import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Folder,
  Menu,
  Globe,
  Link2,
  Settings,
  LogOut,
  Image,
} from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: '控制台', end: true },
  { to: 'articles', icon: FileText, label: '文章' },
  { to: 'categories', icon: Folder, label: '分类' },
  { to: 'navigation', icon: Menu, label: '导航' },
  { to: 'pages', icon: Globe, label: '页面' },
  { to: 'affiliates', icon: Link2, label: '推广链接' },
  { to: 'media', icon: Image, label: '媒体库' },
  { to: 'settings', icon: Settings, label: '设置' },
];

export default function Sidebar() {
  function handleLogout() {
    sessionStorage.removeItem('admin_token');
    sessionStorage.removeItem('admin_user');
    sessionStorage.removeItem('admin_auth');
    window.location.href = '/login';
  }

  return (
    <aside className="w-64 bg-[var(--color-surface)] border-r border-white/10 fixed h-full">
      <div className="p-6 border-b border-white/10">
        <span className="text-xl font-bold text-[var(--color-primary)]">
          AdultToy<span className="text-white">Review</span>
        </span>
        <span className="block text-xs text-gray-500 mt-1">管理后台</span>
      </div>
      <nav className="p-4 space-y-1">
        {navItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <Icon className="w-4 h-4" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="absolute bottom-0 w-64 p-4 border-t border-white/10">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-white/5 hover:text-white w-full"
        >
          <LogOut className="w-4 h-4" />
          退出登录
        </button>
      </div>
    </aside>
  );
}