// API client for Cloudflare Worker
const API_BASE = 'https://adult-toy-review-api.wangzczg-3e8.workers.dev';

interface RequestOptions {
  method?: string;
  body?: object;
}

export async function apiGet(path: string) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function apiPost(path: string, data?: object, options: RequestOptions = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
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

// Articles
export async function getArticles() {
  return apiGet('/api/articles');
}

export async function createArticle(data: any) {
  return apiPost('/api/articles', data);
}

export async function updateArticle(id: string, data: any) {
  return apiPost(`/api/articles/${id}`, data, { method: 'PUT' });
}

export async function deleteArticle(id: string) {
  return apiPost(`/api/articles/${id}`, {}, { method: 'DELETE' });
}

// Categories
export async function getCategories() {
  return apiGet('/api/categories');
}

export async function createCategory(data: any) {
  return apiPost('/api/categories', data);
}

// Feishu
export async function getFeishuDocs(folderToken: string) {
  return apiGet(`/api/feishu/docs?folder_token=${folderToken}`);
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

// Affiliates
export async function getAffiliates() {
  return apiGet('/api/affiliates');
}
