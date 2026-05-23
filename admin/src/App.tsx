import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useLayoutEffect } from 'react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Articles from './pages/Articles';
import Categories from './pages/Categories';
import Navigation from './pages/Navigation';
import Pages from './pages/Pages';
import Affiliates from './pages/Affiliates';
import Settings from './pages/Settings';
import Media from './pages/Media';
import Layout from './components/Layout';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useLayoutEffect(() => {
    const token = sessionStorage.getItem('admin_token');
    if (!token) {
      setAuthenticated(false);
      setLoading(false);
      return;
    }

    // Verify token with server
    fetch('/api/auth/verify', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => {
        if (res.ok) {
          setAuthenticated(true);
          // Update stored user data
          res.json().then(data => {
            if (data.user) {
              sessionStorage.setItem('admin_user', JSON.stringify(data.user));
            }
          });
        } else {
          sessionStorage.removeItem('admin_token');
          sessionStorage.removeItem('admin_user');
          sessionStorage.removeItem('admin_auth');
        }
      })
      .catch(() => {
        sessionStorage.removeItem('admin_token');
        sessionStorage.removeItem('admin_user');
        sessionStorage.removeItem('admin_auth');
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-background)]">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  if (!authenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter basename="/">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="articles" element={<Articles />} />
          <Route path="categories" element={<Categories />} />
          <Route path="navigation" element={<Navigation />} />
          <Route path="pages" element={<Pages />} />
          <Route path="affiliates" element={<Affiliates />} />
          <Route path="settings" element={<Settings />} />
          <Route path="media" element={<Media />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}