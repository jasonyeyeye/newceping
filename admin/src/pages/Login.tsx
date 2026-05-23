import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiPost } from '../lib/api';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username || !password) {
      setError('请输入用户名和密码');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const data = await apiPost('/api/auth/login', { username, password });
      if (data.token) {
        sessionStorage.setItem('admin_token', data.token);
        sessionStorage.setItem('admin_user', JSON.stringify(data.user));
        sessionStorage.setItem('admin_auth', 'true');
        navigate('/');
      } else {
        setError(data.error || '登录失败');
      }
    } catch (err: any) {
      setError(err.message || '登录失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-background)]">
      <div className="w-full max-w-sm p-8">
        <div className="text-center mb-8">
          <span className="text-3xl font-bold text-[var(--color-primary)]">
            AdultToy<span className="text-white">Review</span>
          </span>
          <p className="text-gray-500 text-sm mt-2">管理后台</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">用户名</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full px-4 py-2.5 bg-[var(--color-surface)] border border-white/10 rounded-lg text-white focus:border-[var(--color-primary)] focus:outline-none"
              placeholder="请输入用户名"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">密码</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 bg-[var(--color-surface)] border border-white/10 rounded-lg text-white focus:border-[var(--color-primary)] focus:outline-none"
              placeholder="请输入密码"
              autoComplete="current-password"
            />
          </div>
          {error && (
            <p className="text-red-500 text-sm mt-2">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/80 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
          >
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
        <p className="text-gray-600 text-xs text-center mt-6">
          首次登录使用 SETUP_SECRET 作为密码
        </p>
      </div>
    </div>
  );
}