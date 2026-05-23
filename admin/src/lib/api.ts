// API client for Cloudflare Worker
const API_BASE = 'https://adult-toy-review-api.wangzczg-3e8.workers.dev';

interface RequestOptions {
  method?: string;
  body?: object;
}

// Retry logic: only retry on 5xx errors (server errors), not 4xx (client errors)
async function fetchWithRetry(url: string, options: RequestInit, retries = 3): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    const res = await fetch(url, options);
    if (res.ok || (res.status >= 400 && res.status < 500)) {
      return res; // Success or client error - don't retry
    }
    // 5xx - server error, retry
    if (i < retries) {
      await new Promise(r => setTimeout(r, 100 * Math.pow(2, i))); // Exponential backoff: 100, 200, 400ms
    }
  }
  return fetch(url, options); // Final attempt
}

export async function apiGet(path: string) {
  const res = await fetchWithRetry(`${API_BASE}${path}`, {});
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function apiPost(path: string, data?: object, options: RequestOptions = {}) {
  const res = await fetchWithRetry(`${API_BASE}${path}`, {
    method: options.method || 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: data ? JSON.stringify(data) : undefined,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function apiPut(path: string, data: object) {
  return apiPost(path, data, { method: 'PUT' });
}

export async function apiDelete(path: string) {
  return apiPost(path, {}, { method: 'DELETE' });
}

// Articles
export async function getArticles(status?: string) {
  const query = status ? `?status=${status}` : '';
  return apiGet(`/api/articles${query}`);
}

export async function getArticle(id: string) {
  return apiGet(`/api/articles/${id}`);
}

export async function createArticle(data: any) {
  return apiPost('/api/articles', data);
}

export async function updateArticle(id: string, data: any) {
  return apiPut(`/api/articles/${id}`, data);
}

export async function deleteArticle(id: string) {
  return apiDelete(`/api/articles/${id}`);
}

// Sync single article from Feishu
export async function syncArticleFromFeishu(docToken: string, title: string, categoryId: string, slug: string) {
  return apiPost('/api/articles/sync', { docToken, title, categoryId, slug });
}

// Categories
export async function getCategories() {
  return apiGet('/api/categories');
}

export async function getCategoriesWithCount() {
  return apiGet('/api/categories/with-count');
}

export async function createCategory(data: any) {
  return apiPost('/api/categories', data);
}

export async function updateCategory(id: string, data: any) {
  return apiPut(`/api/categories/${id}`, data);
}

export async function deleteCategory(id: string) {
  return apiDelete(`/api/categories/${id}`);
}

// Feishu
export async function getFeishuDocs(folderToken: string) {
  return apiGet(`/api/feishu/docs?folder_token=${folderToken}`);
}

export async function getFeishuDocContent(token: string) {
  return apiGet(`/api/feishu/doc?token=${token}`);
}

// GitHub
export async function writeGitHubFile(path: string, content: string, message: string, sha?: string) {
  return apiPost('/api/github/write', { path, content, message, sha });
}

// Site Settings
export async function getSiteSettings() {
  return apiGet('/api/site/settings');
}

export async function updateSiteSettings(data: any) {
  return apiPut('/api/site/settings', data);
}

// Navigation
export async function getNavigation() {
  return apiGet('/api/navigation');
}

export async function updateNavigation(items: any[]) {
  return apiPut('/api/navigation', { items });
}

// Pages
export async function getPages() {
  return apiGet('/api/pages');
}

export async function createPage(data: any) {
  return apiPost('/api/pages', data);
}

export async function updatePage(id: string, data: any) {
  return apiPut(`/api/pages/${id}`, data);
}

export async function deletePage(id: string) {
  return apiDelete(`/api/pages/${id}`);
}

// Affiliates
export async function getAffiliates() {
  return apiGet('/api/affiliates');
}

export async function createAffiliate(data: any) {
  return apiPost('/api/affiliates', data);
}

export async function updateAffiliate(id: string, data: any) {
  return apiPut(`/api/affiliates/${id}`, data);
}

export async function deleteAffiliate(id: string) {
  return apiDelete(`/api/affiliates/${id}`);
}

export async function trackAffiliateClick(id: string) {
  return apiPost(`/api/affiliates/track/${id}`);
}

// Auth helpers
export function getStoredToken(): string | null {
  return sessionStorage.getItem('admin_token');
}

export function getStoredUser(): { id: string; username: string; role: string } | null {
  const user = sessionStorage.getItem('admin_user');
  return user ? JSON.parse(user) : null;
}

export async function verifyToken(): Promise<boolean> {
  const token = getStoredToken();
  if (!token) return false;
  try {
    const res = await apiGet('/api/auth/verify');
    return !!res.user;
  } catch {
    return false;
  }
}

export function clearAuth(): void {
  sessionStorage.removeItem('admin_token');
  sessionStorage.removeItem('admin_user');
  sessionStorage.removeItem('admin_auth');
}

// Wrap apiGet/apiPost to auto-add auth header
export async function apiGetAuth(path: string) {
  const token = getStoredToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function apiPostAuth(path: string, data?: object, options: RequestOptions = {}) {
  const token = getStoredToken();
  const res = await fetchWithRetry(`${API_BASE}${path}`, {
    method: options.method || 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}