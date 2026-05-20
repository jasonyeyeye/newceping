import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState } from 'react';
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
  const [authenticated] = useState(() => {
    return sessionStorage.getItem('admin_auth') === 'true';
  });

  if (!authenticated) {
    return <Navigate to="/admin/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin/login" element={<Login />} />
        <Route
          path="/admin"
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