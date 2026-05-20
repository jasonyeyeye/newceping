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