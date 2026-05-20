import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const ADMIN_PASSWORD = 'adult2024review';

export default function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const navigate = useNavigate();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      sessionStorage.setItem('admin_auth', 'true');
      navigate('/');
    } else {
      setError(true);
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
            <label className="block text-sm text-gray-400 mb-2">密码</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 bg-[var(--color-surface)] border border-white/10 rounded-lg text-white focus:border-[var(--color-primary)] focus:outline-none"
              placeholder="请输入管理员密码"
            />
            {error && (
              <p className="text-red-500 text-sm mt-2">密码错误</p>
            )}
          </div>
          <button
            type="submit"
            className="w-full py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/80 text-white font-medium rounded-lg transition-colors"
          >
            登录
          </button>
        </form>
      </div>
    </div>
  );
}