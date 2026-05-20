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
import Layout from './components/Layout';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useLayoutEffect(() => {
    const auth = sessionStorage.getItem('admin_auth') === 'true';
    setAuthenticated(auth);
    setLoading(false);
  }, []);

  if (loading) {
    return null;
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
        </Route>
      </Routes>
    </BrowserRouter>
  );
}