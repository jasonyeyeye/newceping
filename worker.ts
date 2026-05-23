// Cloudflare Worker for AdultToyReview Admin API
// Handles KV operations, Feishu API, and GitHub API

interface Env {
  ARTICLES: KVNamespace;
  CATEGORIES: KVNamespace;
  NAVIGATION: KVNamespace;
  PAGES: KVNamespace;
  AFFILIATES: KVNamespace;
  SITE_SETTINGS: KVNamespace;
  MEDIA: KVNamespace;
  FEISHU_APP_ID: string;
  FEISHU_APP_SECRET: string;
  GITHUB_TOKEN: string;
  // For scheduled publishing cron trigger
  SCHEDULED_PUBLISH_SECRET: string;
  // For AI features
  AI: Ai;
  // JWT secret for token signing (REQUIRED)
  JWT_SECRET: string;
  // Setup secret for initial admin creation (REQUIRED)
  SETUP_SECRET: string;
  // AI Configuration (OpenAI compatible API)
  AI_CONFIG: KVNamespace;
  USERS: KVNamespace;
  COMMENTS: KVNamespace;
}

// Types
interface ArticleMeta {
  id: string;
  slug: string;
  feishuDocId: string;
  feishuDocUrl: string;
  title: string;
  categoryId: string;
  status: 'draft' | 'published' | 'updated' | 'deleted';
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  featuredImage?: string;
  excerpt?: string;
}

interface ArticleSEO {
  articleId: string;
  metaTitle: string;
  metaDescription: string;
  canonicalUrl?: string;
  ogImage?: string;
  noIndex?: boolean;
}

interface ArticleAffiliate {
  articleId: string;
  links: AffiliateLink[];
  displayType: 'inline' | 'floating' | 'cta_button' | 'both';
}

interface AffiliateLink {
  id: string;
  platform: string;
  url: string;
  anchorText: string;
  position?: string;
}

interface ArticleAffiliateRef {
  linkId: string;
  addedAt: string;
}

interface PageMeta {
  id: string;
  slug: string;
  title: string;
  content: string;
  status: 'draft' | 'published';
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

interface Affiliate {
  id: string;
  platform: string;
  name: string;
  url: string;
  commission?: string;
  status: 'active' | 'inactive';
  group: string;
  clicks: number;
  lastClickedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// Feishu API
async function getFeishuAccessToken(env: Env): Promise<string> {
  const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: env.FEISHU_APP_ID,
      app_secret: env.FEISHU_APP_SECRET,
    }),
  });
  const data = await response.json();
  return data.tenant_access_token;
}
// SECURITY: Validate critical environment variables at startup - fail fast if misconfigured
function validateEnvironment(env: Env): void {
  if (!env.JWT_SECRET) {
    throw new Error('FATAL: JWT_SECRET environment variable is not set');
  }
  if (env.JWT_SECRET.length < 32) {
    throw new Error('FATAL: JWT_SECRET must be at least 32 characters long for security');
  }
  if (env.JWT_SECRET === 'fallback-salt-do-not-use-in-production') {
    throw new Error('FATAL: JWT_SECRET is set to an insecure default value');
  }
  // LEGACY_PASSWORD_SALT is optional (only for legacy hash verification)
}

// Password hashing salt - loaded from environment

// ======== JWT Authentication ========
async function generateToken(userId: string, username: string, role: string, env: Env): Promise<string> {
  const secret = env.JWT_SECRET;
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({
    sub: userId,
    username,
    role,
    iat: Date.now(),
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  }));
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${payload}`));
  const sig_b64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${header}.${payload}.${sig_b64}`;
}

async function verifyToken(token: string, env: Env): Promise<{ userId: string; username: string; role: string } | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, sig] = parts;
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(env.JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const valid = await crypto.subtle.verify('HMAC', key,
      Uint8Array.from(atob(sig), c => c.charCodeAt(0)),
      new TextEncoder().encode(`${header}.${payload}`)
    );
    if (!valid) return null;
    const payloadObj = JSON.parse(atob(payload));
    if (payloadObj.exp < Date.now()) return null;
    return { userId: payloadObj.sub, username: payloadObj.username, role: payloadObj.role };
  } catch { return null; }
}

async function requireAuth(request: Request, env: Env) {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return { error: new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' }
    }) };
  }
  const token = auth.slice(7);
  const user = await verifyToken(token, env);
  if (!user) {
    return { error: new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
      status: 401, headers: { 'Content-Type': 'application/json' }
    }) };
  }
  return { user };
}

// ======== User Management ========
async function getUserByUsername(username: string, env: Env) {
  const data = await env.USERS.get(`users/username/${username}`);
  return data ? JSON.parse(data) : null;
}

async function createUser(username: string, passwordHash: string, role: string, env: Env) {
  const id = crypto.randomUUID();
  const user = { id, username, passwordHash, role, createdAt: new Date().toISOString() };
  await env.USERS.put(`users/${id}`, JSON.stringify(user));
  await env.USERS.put(`users/username/${username}`, JSON.stringify(user));
  return user;
}

// Simple password hash using PBKDF2 via Web Crypto
async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password),
    'PBKDF2', false, ['deriveBits']);
  const hash = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: 100000 },
    keyMaterial, 256);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(password: string, storedHash: string, salt: string): Promise<boolean> {
  const hash = await hashPassword(password, salt);
  return hash === storedHash;
}

function getLegacyPasswordSalt(env: Env): string {
  const salt = (env as any).LEGACY_PASSWORD_SALT;
  if (!salt) {
    throw new Error('FATAL: LEGACY_PASSWORD_SALT environment variable is not set');
  }
  if (salt === 'fallback-salt-do-not-use-in-production') {
    throw new Error('FATAL: LEGACY_PASSWORD_SALT is set to an insecure default value');
  }
  return salt;
}

async function getFeishuDocs(env: Env, folderToken: string) {
  const token = await getFeishuAccessToken(env);
  const response = await fetch(
    `https://open.feishu.cn/open-apis/drive/v1/files?folder_token=${folderToken}&order_by=EditedTime&direction=DESC`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return response.json();
}

async function getFeishuDocContent(env: Env, docToken: string): Promise<{ title: string; content: string; htmlContent?: string }> {
  const token = await getFeishuAccessToken(env);
  // Try to get document content via Feishu API
  const response = await fetch(
    `https://open.feishu.cn/open-apis/docx/v1/documents/${docToken}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  const data = await response.json();
  return {
    title: data.data?.document?.title || 'Untitled',
    content: '', // Will be filled with actual content extraction
    htmlContent: data.data?.document?.html_content || '',
  };
}

// Get file download URL for a Feishu file
async function getFeishuFileDownloadUrl(env: Env, fileToken: string): Promise<string> {
  const token = await getFeishuAccessToken(env);
  const response = await fetch(
    `https://open.feishu.cn/open-apis/drive/v1/files/${fileToken}/download?type=file`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  const data = await response.json();
  return data.data?.download_url || '';
}

// GitHub API
async function createOrUpdateFile(env: Env, path: string, content: string, message: string, sha?: string) {
  const url = `https://api.github.com/repos/jasonyeyeye/newceping/contents/${path}`;
  const body: Record<string, string> = {
    message,
    content: btoa(content),
  };
  if (sha) body.sha = sha;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
    },
    body: JSON.stringify(body),
  });
  return response.json();
}

// KV helpers - with LRU cache for read-heavy workloads
interface CacheEntry<T> { data: T; expires: number; }

class KVCache {
  private cache = new Map<string, CacheEntry<any>>();
  private maxSize = 200;
  private defaultTTL = 30000; // 30s default

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return null;
    }
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttl = this.defaultTTL): void {
    if (this.cache.size >= this.maxSize) {
      // Delete oldest entry (first in Map iteration order)
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, { data, expires: Date.now() + ttl });
  }

  invalidate(key: string): void { this.cache.delete(key); }
  clear(): void { this.cache.clear(); }
}

// Per-KV-namespace caches (shared across requests in same isolate)
const articleCache = new KVCache();
const categoryCache = new KVCache();
const navCache = new KVCache();
const pageCache = new KVCache();
const affiliateCache = new KVCache();
const settingsCache = new KVCache();

function getCacheForPrefix(prefix: string): KVCache {
  switch (prefix) {
    case 'articles': return articleCache;
    case 'categories': return categoryCache;
    case 'navigation': return navCache;
    case 'pages': return pageCache;
    case 'affiliates': return affiliateCache;
    default: return settingsCache;
  }
}

// Cache-Control helper for public read endpoints
function withCache(res: Response, maxAge = 300): Response {
  const h = new Headers(res.headers);
  h.set('Cache-Control', `public, max-age=${maxAge}, stale-while-revalidate=60`);
  return new Response(res.body, { status: res.status, headers: h });
}

async function getAllIds(kv: KVNamespace, prefix: string): Promise<string[]> {
  const cache = getCacheForPrefix(prefix);
  const cached = cache.get<string[]>(`ids:${prefix}`);
  if (cached) return cached;
  const ids = await kv.get(`${prefix}/all_ids`);
  const result = ids ? JSON.parse(ids) : [];
  cache.set(`ids:${prefix}`, result, 15000); // 15s cache
  return result;
}

async function setWithIds(kv: KVNamespace, prefix: string, id: string, data: object) {
  await kv.put(`${prefix}/${id}`, JSON.stringify(data));
  const ids = await getAllIds(kv, prefix);
  if (!ids.includes(id)) {
    ids.push(id);
    await kv.put(`${prefix}/all_ids`, JSON.stringify(ids));
  }
  // Invalidate cache
  getCacheForPrefix(prefix).invalidate(`ids:${prefix}`);
}

// Router
async function handleRequest(request: Request, env: Env): Promise<Response> {
  validateEnvironment(env);
  const url = new URL(request.url);
  const path = url.pathname;

  // ======== AUTH ENDPOINTS ========
  // POST /api/auth/login
  if (path === '/api/auth/login' && request.method === 'POST') {
    const { username, password } = await request.json();
    if (!username || !password) {
      return new Response(JSON.stringify({ error: 'username and password required' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }
    // Setup mode: use SETUP_SECRET to create first admin
    if (password === env.SETUP_SECRET) {
      const existing = await getUserByUsername(username, env);
      if (!existing) {
        const user = await createUser(username, '', 'admin', env);
        const token = await generateToken(user.id, user.username, user.role, env);
        return new Response(JSON.stringify({ token, user: { id: user.id, username: user.username, role: user.role } }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      const token = await generateToken(existing.id, existing.username, existing.role, env);
      return new Response(JSON.stringify({ token, user: { id: existing.id, username: existing.username, role: existing.role } }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    // Normal login
    const user = await getUserByUsername(username, env);
    if (!user || !user.passwordHash) {
      return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
        status: 401, headers: { 'Content-Type': 'application/json' }
      });
    }
    const valid = await verifyPassword(password, user.passwordHash, user.id);
    if (!valid) {
      return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
        status: 401, headers: { 'Content-Type': 'application/json' }
      });
    }
    const token = await generateToken(user.id, user.username, user.role, env);
    return new Response(JSON.stringify({ token, user: { id: user.id, username: user.username, role: user.role } }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // POST /api/auth/register (create user with hashed password)
  if (path === '/api/auth/register' && request.method === 'POST') {
    const { username, password, role } = await request.json();
    if (!username || !password) {
      return new Response(JSON.stringify({ error: 'username and password required' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }
    const existing = await getUserByUsername(username, env);
    if (existing) {
      return new Response(JSON.stringify({ error: 'Username already exists' }), {
        status: 409, headers: { 'Content-Type': 'application/json' }
      });
    }
    const salt = crypto.randomUUID();
    const passwordHash = await hashPassword(password, salt);
    const user = await createUser(username, passwordHash + ':' + salt, role || 'editor', env);
    const token = await generateToken(user.id, user.username, user.role, env);
    return new Response(JSON.stringify({ token, user: { id: user.id, username: user.username, role: user.role } }), {
      status: 201, headers: { 'Content-Type': 'application/json' }
    });
  }

  // GET /api/auth/verify - verify token
  if (path === '/api/auth/verify' && request.method === 'GET') {
    const auth = request.headers.get('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'No token provided' }), {
        status: 401, headers: { 'Content-Type': 'application/json' }
      });
    }
    const user = await verifyToken(auth.slice(7), env);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ user }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // POST /api/auth/setup - setup first admin (only if no users exist)
  if (path === '/api/auth/setup' && request.method === 'POST') {
    const { username, password } = await request.json();
    if (!username || !password) {
      return new Response(JSON.stringify({ error: 'username and password required' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }
    const existingUser = await getUserByUsername(username, env);
    if (existingUser) {
      return new Response(JSON.stringify({ error: 'User already exists' }), {
        status: 409, headers: { 'Content-Type': 'application/json' }
      });
    }
    const salt = crypto.randomUUID();
    const passwordHash = await hashPassword(password, salt);
    const user = await createUser(username, passwordHash + ':' + salt, 'admin', env);
    const token = await generateToken(user.id, user.username, user.role, env);
    return new Response(JSON.stringify({ token, user: { id: user.id, username: user.username, role: user.role } }), {
      status: 201, headers: { 'Content-Type': 'application/json' }
    });
  }

  // Rate limiting - 100 requests per minute per IP for write operations
  const writeMethods = ['POST', 'PUT', 'DELETE'];
  if (writeMethods.includes(request.method) && path.startsWith('/api/')) {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const rateLimitKey = `ratelimit:${ip}:${Math.floor(Date.now() / 60000)}`;
    const current = await env.SITE_SETTINGS.get(rateLimitKey);
    const count = current ? parseInt(current) : 0;
    if (count >= 100) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Try again later.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    await env.SITE_SETTINGS.put(rateLimitKey, String(count + 1), { expirationTtl: 60 });
  }

  // CORS headers - restrictive for API routes, open for public read endpoints
  const isPublicReadEndpoint =
    path.startsWith('/api/articles') && request.method === 'GET' ||
    path.startsWith('/api/categories') && request.method === 'GET' ||
    path.startsWith('/api/navigation') && request.method === 'GET' ||
    path.startsWith('/api/pages') && request.method === 'GET' ||
    path.startsWith('/api/affiliates') && request.method === 'GET' ||
    path.startsWith('/api/media') && request.method === 'GET' ||
    path.startsWith('/api/site/') ||
    path === '/sitemap.xml' ||
    path === '/robots.txt';

  // CORS headers - only allow specific trusted origins
  const allowedOrigins = [
    'https://adult-toy-review.pages.dev',
    'https://admin-cms-ufl.pages.dev',
    'http://localhost:4321',
    'http://localhost:3000',
  ];
  const origin = request.headers.get('Origin') || '';
  const corsOrigin = allowedOrigins.includes(origin) ? origin : '';
  const corsHeaders = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Article list with optional status filter
  if (path === '/api/articles' && request.method === 'GET') {
    const status = url.searchParams.get('status');
    const ids = await getAllIds(env.ARTICLES, 'articles');
    const articles = await Promise.all(
      ids.map(async id => {
        const data = await env.ARTICLES.get(`articles/${id}`);
        return data ? JSON.parse(data) : null;
      })
    );
    const filtered = articles.filter(Boolean);
    if (status) {
      return withCache(new Response(JSON.stringify(filtered.filter(a => a.status === status)), {
        headers: { 'Content-Type': 'application/json' },
      }));
    }
    return withCache(new Response(JSON.stringify(filtered), {
      headers: { 'Content-Type': 'application/json' },
    }));
  }

  // Create article
  if (path === '/api/articles' && request.method === 'POST') {
    const body = await request.json();
    const id = crypto.randomUUID();
    const article: ArticleMeta = {
      id,
      slug: body.slug,
      feishuDocId: body.feishuDocId,
      feishuDocUrl: body.feishuDocUrl,
      title: body.title,
      categoryId: body.categoryId,
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await setWithIds(env.ARTICLES, 'articles', id, article);
    articleCache.invalidate('ids:articles');
    if (body.seo) {
      await env.ARTICLES.put(`articles/${id}/seo`, JSON.stringify({ ...body.seo, articleId: id }));
    }
    if (body.affiliate) {
      await env.ARTICLES.put(`articles/${id}/affiliate`, JSON.stringify({ ...body.affiliate, articleId: id }));
    }
    if (body.content) {
      await env.ARTICLES.put(`articles/${id}/content`, body.content);
    }
    return new Response(JSON.stringify(article), { status: 201 });
  }

  // Single article operations
  const articleMatch = path.match(/^\/api\/articles\/([^/]+)(\/.*)?$/);
  if (articleMatch) {
    const id = articleMatch[1];
    const subPath = articleMatch[2];

    // GET single article with full data
    if (request.method === 'GET' && !subPath) {
      const meta = await env.ARTICLES.get(`articles/${id}`);
      if (!meta) {
        return new Response(JSON.stringify({ error: 'Article not found' }), { status: 404 });
      }
      const seo = await env.ARTICLES.get(`articles/${id}/seo`);
      const affiliate = await env.ARTICLES.get(`articles/${id}/affiliate`);
      const content = await env.ARTICLES.get(`articles/${id}/content`);
      return new Response(JSON.stringify({
        ...JSON.parse(meta),
        seo: seo ? JSON.parse(seo) : null,
        affiliate: affiliate ? JSON.parse(affiliate) : null,
        content: content || '',
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // PUT update article
    if (request.method === 'PUT') {
      const body = await request.json();
      const existing = await env.ARTICLES.get(`articles/${id}`);
      if (!existing) {
        return new Response(JSON.stringify({ error: 'Article not found' }), { status: 404 });
      }
      const article = { ...JSON.parse(existing), ...body, updatedAt: new Date().toISOString() };
      await env.ARTICLES.put(`articles/${id}`, JSON.stringify(article));
      articleCache.invalidate('ids:articles');
      if (body.seo) {
        await env.ARTICLES.put(`articles/${id}/seo`, JSON.stringify({ ...body.seo, articleId: id }));
      }
      if (body.affiliate) {
        await env.ARTICLES.put(`articles/${id}/affiliate`, JSON.stringify({ ...body.affiliate, articleId: id }));
      }
      if (body.content !== undefined) {
        await env.ARTICLES.put(`articles/${id}/content`, body.content);
      }
      return new Response(JSON.stringify(article), { headers: { 'Content-Type': 'application/json' } });
    }

    // DELETE article
    if (request.method === 'DELETE') {
      await env.ARTICLES.delete(`articles/${id}`);
      await env.ARTICLES.delete(`articles/${id}/seo`);
      await env.ARTICLES.delete(`articles/${id}/affiliate`);
      await env.ARTICLES.delete(`articles/${id}/content`);
      const ids = await getAllIds(env.ARTICLES, 'articles');
      const newIds = ids.filter(i => i !== id);
      await env.ARTICLES.put('articles/all_ids', JSON.stringify(newIds));
      return new Response(JSON.stringify({ success: true }));
    }
  }

  // Category pages - get articles by category slug
  if (path.startsWith('/api/articles') && path.includes('category=')) {
    const categorySlug = url.searchParams.get('category');
    const status = url.searchParams.get('status') || 'published';
    const ids = await getAllIds(env.ARTICLES, 'articles');
    const articles = await Promise.all(
      ids.map(async id => {
        const data = await env.ARTICLES.get(`articles/${id}`);
        return data ? JSON.parse(data) : null;
      })
    );
    const allArticles = articles.filter(Boolean);
    const filteredIds = [];
    for (const a of allArticles) {
      if (status && a.status !== status) continue;
      if (categorySlug) {
        const cat = await env.CATEGORIES.get(`categories/${a.categoryId}`);
        if (cat) {
          const catObj = JSON.parse(cat);
          if (catObj.slug !== categorySlug) continue;
        }
      }
      filteredIds.push(a);
    }
    return withCache(new Response(JSON.stringify(filteredIds), {
      headers: { 'Content-Type': 'application/json' },
    }));
  }

  // Get categories with article count
  if (path === '/api/categories/with-count' && request.method === 'GET') {
    const ids = await getAllIds(env.CATEGORIES, 'categories');
    const categories = await Promise.all(
      ids.map(async id => {
        const data = await env.CATEGORIES.get(`categories/${id}`);
        return data ? JSON.parse(data) : null;
      })
    );
    const validCategories = categories.filter(Boolean);

    // Get article counts for each category
    const articleIds = await getAllIds(env.ARTICLES, 'articles');
    const articles = await Promise.all(
      articleIds.map(async id => {
        const data = await env.ARTICLES.get(`articles/${id}`);
        return data ? JSON.parse(data) : null;
      })
    );
    const publishedArticles = articles.filter(Boolean).filter((a: any) => a.status === 'published');

    const categoriesWithCount = validCategories.map((cat: any) => ({
      ...cat,
      articleCount: publishedArticles.filter((a: any) => a.categoryId === cat.id).length,
    }));

    return withCache(new Response(JSON.stringify(categoriesWithCount), {
      headers: { 'Content-Type': 'application/json' },
    }));
  }

  // Categories
  if (path === '/api/categories') {
    if (request.method === 'GET') {
      const ids = await getAllIds(env.CATEGORIES, 'categories');
      const categories = await Promise.all(
        ids.map(async id => {
          const data = await env.CATEGORIES.get(`categories/${id}`);
          return data ? JSON.parse(data) : null;
        })
      );
      return withCache(new Response(JSON.stringify(categories.filter(Boolean)), {
        headers: { 'Content-Type': 'application/json' },
      }));
    }
    if (request.method === 'POST') {
      const body = await request.json();
      const id = crypto.randomUUID();
      const category = { ...body, id, createdAt: new Date().toISOString() };
      await setWithIds(env.CATEGORIES, 'categories', id, category);
      return new Response(JSON.stringify(category), { status: 201 });
    }
  }

  // Single category
  const categoryMatch = path.match(/^\/api\/categories\/([^/]+)$/);
  if (categoryMatch) {
    const id = categoryMatch[1];

    if (request.method === 'GET') {
      const data = await env.CATEGORIES.get(`categories/${id}`);
      if (!data) {
        return new Response(JSON.stringify({ error: 'Category not found' }), { status: 404 });
      }
      return new Response(data, {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (request.method === 'PUT') {
      const body = await request.json();
      const existing = await env.CATEGORIES.get(`categories/${id}`);
      if (!existing) {
        return new Response(JSON.stringify({ error: 'Category not found' }), { status: 404 });
      }
      const category = { ...JSON.parse(existing), ...body };
      await env.CATEGORIES.put(`categories/${id}`, JSON.stringify(category));
      return new Response(JSON.stringify(category), { headers: { 'Content-Type': 'application/json' } });
    }

    if (request.method === 'DELETE') {
      await env.CATEGORIES.delete(`categories/${id}`);
      const ids = await getAllIds(env.CATEGORIES, 'categories');
      const newIds = ids.filter(i => i !== id);
      await env.CATEGORIES.put('categories/all_ids', JSON.stringify(newIds));
      return new Response(JSON.stringify({ success: true }));
    }
  }

  if (path === '/api/feishu/docs') {
    const folderToken = url.searchParams.get('folder_token');
    if (!folderToken) {
      return new Response(JSON.stringify({ error: 'folder_token required' }), { status: 400 });
    }
    const docs = await getFeishuDocs(env, folderToken);
    return withCache(new Response(JSON.stringify(docs), { headers: { 'Content-Type': 'application/json' } }));
  }

  // Single Feishu doc content
  if (path === '/api/feishu/doc' && request.method === 'GET') {
    const docToken = url.searchParams.get('token');
    if (!docToken) {
      return new Response(JSON.stringify({ error: 'token required' }), { status: 400 });
    }
    try {
      const content = await getFeishuDocContent(env, docToken);
      return withCache(new Response(JSON.stringify(content), { headers: { 'Content-Type': 'application/json' } }));
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Failed to get doc content' }), { status: 500 });
    }
  }

  // Sync single article from Feishu
  if (path === '/api/articles/sync' && request.method === 'POST') {
    const body = await request.json();
    const { docToken, title, categoryId, slug } = body;

    // Check if already synced by feishuDocId
    const existingIds = await getAllIds(env.ARTICLES, 'articles');
    for (const id of existingIds) {
      const meta = await env.ARTICLES.get(`articles/${id}`);
      if (meta) {
        const metaObj = JSON.parse(meta);
        if (metaObj.feishuDocId === docToken) {
          return new Response(JSON.stringify({ alreadyExists: true, article: metaObj }), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
    }

    // Create new article
    const id = crypto.randomUUID();
    const article: ArticleMeta = {
      id,
      slug: slug || `article-${Date.now()}`,
      feishuDocId: docToken,
      feishuDocUrl: `https://feishu.cn/doc/${docToken}`,
      title: title || 'Untitled',
      categoryId: categoryId || '',
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await setWithIds(env.ARTICLES, 'articles', id, article);
    return new Response(JSON.stringify({ alreadyExists: false, article }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Single article operations
  if (path.match(/^\/api\/articles\/([^/]+)$/)) {
    const id = path.match(/^\/api\/articles\/([^/]+)$/)?.[1];
    if (!id) {
      return new Response(JSON.stringify({ error: 'Invalid article ID' }), { status: 400 });
    }

    if (request.method === 'GET') {
      const meta = await env.ARTICLES.get(`articles/${id}`);
      if (!meta) {
        return new Response(JSON.stringify({ error: 'Article not found' }), { status: 404 });
      }
      const seo = await env.ARTICLES.get(`articles/${id}/seo`);
      const affiliate = await env.ARTICLES.get(`articles/${id}/affiliate`);
      const content = await env.ARTICLES.get(`articles/${id}/content`);
      return new Response(JSON.stringify({
        ...JSON.parse(meta),
        seo: seo ? JSON.parse(seo) : null,
        affiliate: affiliate ? JSON.parse(affiliate) : null,
        content: content || '',
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (request.method === 'PUT') {
      const body = await request.json();
      const existing = await env.ARTICLES.get(`articles/${id}`);
      if (!existing) {
        return new Response(JSON.stringify({ error: 'Article not found' }), { status: 404 });
      }
      const article = { ...JSON.parse(existing), ...body, updatedAt: new Date().toISOString() };
      await env.ARTICLES.put(`articles/${id}`, JSON.stringify(article));
      articleCache.invalidate('ids:articles');
      if (body.seo) {
        await env.ARTICLES.put(`articles/${id}/seo`, JSON.stringify({ ...body.seo, articleId: id }));
      }
      if (body.affiliate) {
        await env.ARTICLES.put(`articles/${id}/affiliate`, JSON.stringify({ ...body.affiliate, articleId: id }));
      }
      if (body.content !== undefined) {
        await env.ARTICLES.put(`articles/${id}/content`, body.content);
      }
      return new Response(JSON.stringify(article), { headers: { 'Content-Type': 'application/json' } });
    }

    if (request.method === 'DELETE') {
      await env.ARTICLES.delete(`articles/${id}`);
      await env.ARTICLES.delete(`articles/${id}/seo`);
      await env.ARTICLES.delete(`articles/${id}/affiliate`);
      await env.ARTICLES.delete(`articles/${id}/content`);
      const ids = await getAllIds(env.ARTICLES, 'articles');
      const newIds = ids.filter(i => i !== id);
      await env.ARTICLES.put('articles/all_ids', JSON.stringify(newIds));
      return new Response(JSON.stringify({ success: true }));
    }
  }

  if (path.startsWith('/api/github/write')) {
    if (request.method === 'POST') {
      const body = await request.json();
      const result = await createOrUpdateFile(env, body.path, body.content, body.message, body.sha);
      return withCache(new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } }));
    }
  }

  if (path === '/api/site/settings') {
    if (request.method === 'GET') {
      const settings = await env.SITE_SETTINGS.get('settings');
      return new Response(settings || JSON.stringify({}), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (request.method === 'PUT') {
      const body = await request.json();
      await env.SITE_SETTINGS.put('settings', JSON.stringify(body));
      return new Response(JSON.stringify({ success: true }));
    }
  }

  if (path === '/api/navigation') {
    if (request.method === 'GET') {
      const nav = await env.NAVIGATION.get('nav_items');
      return new Response(nav || '[]', {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (request.method === 'PUT') {
      const body = await request.json();
      await env.NAVIGATION.put('nav_items', JSON.stringify(body.items || body));
      return new Response(JSON.stringify({ success: true }));
    }
  }

  // PAGES CRUD
  if (path === '/api/pages') {
    if (request.method === 'GET') {
      const ids = await getAllIds(env.PAGES, 'pages');
      const pages = await Promise.all(
        ids.map(async id => {
          const data = await env.PAGES.get(`pages/${id}`);
          return data ? JSON.parse(data) : null;
        })
      );
      return new Response(JSON.stringify(pages.filter(Boolean)), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (request.method === 'POST') {
      const body = await request.json();
      const id = crypto.randomUUID();
      const page: PageMeta = {
        id,
        slug: body.slug,
        title: body.title,
        content: body.content || '',
        status: body.status || 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        publishedAt: body.status === 'published' ? new Date().toISOString() : undefined,
      };
      await setWithIds(env.PAGES, 'pages', id, page);
      return new Response(JSON.stringify(page), { status: 201 });
    }
  }

  // Single page
  const pageMatch = path.match(/^\/api\/pages\/([^/]+)$/);
  if (pageMatch) {
    const id = pageMatch[1];

    if (request.method === 'GET') {
      const data = await env.PAGES.get(`pages/${id}`);
      if (!data) {
        return new Response(JSON.stringify({ error: 'Page not found' }), { status: 404 });
      }
      return new Response(data, {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (request.method === 'PUT') {
      const body = await request.json();
      const existing = await env.PAGES.get(`pages/${id}`);
      if (!existing) {
        return new Response(JSON.stringify({ error: 'Page not found' }), { status: 404 });
      }
      const page = { ...JSON.parse(existing), ...body, updatedAt: new Date().toISOString() };
      if (body.status === 'published' && !page.publishedAt) {
        page.publishedAt = new Date().toISOString();
      }
      await env.PAGES.put(`pages/${id}`, JSON.stringify(page));
      return new Response(JSON.stringify(page), { headers: { 'Content-Type': 'application/json' } });
    }

    if (request.method === 'DELETE') {
      await env.PAGES.delete(`pages/${id}`);
      const ids = await getAllIds(env.PAGES, 'pages');
      const newIds = ids.filter(i => i !== id);
      await env.PAGES.put('pages/all_ids', JSON.stringify(newIds));
      return new Response(JSON.stringify({ success: true }));
    }
  }

  // AFFILIATES CRUD
  if (path === '/api/affiliates') {
    if (request.method === 'GET') {
      const ids = await getAllIds(env.AFFILIATES, 'affiliates');
      const affiliates = await Promise.all(
        ids.map(async id => {
          const data = await env.AFFILIATES.get(`affiliates/${id}`);
          return data ? JSON.parse(data) : null;
        })
      );
      return new Response(JSON.stringify(affiliates.filter(Boolean)), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (request.method === 'POST') {
      const body = await request.json();
      const id = crypto.randomUUID();
      const affiliate: Affiliate = {
        id,
        platform: body.platform,
        name: body.name,
        url: body.url,
        commission: body.commission,
        status: body.status || 'active',
        group: body.group || '',
        clicks: 0,
        lastClickedAt: undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await setWithIds(env.AFFILIATES, 'affiliates', id, affiliate);
      return new Response(JSON.stringify(affiliate), { status: 201 });
    }
  }

  // Track affiliate click (POST /api/affiliates/track/:id)
  const trackMatch = path.match(/^\/api\/affiliates\/track\/([^/]+)$/);
  if (trackMatch && request.method === 'POST') {
    const id = trackMatch[1];
    const data = await env.AFFILIATES.get(`affiliates/${id}`);
    if (!data) {
      return new Response(JSON.stringify({ error: 'Affiliate not found' }), { status: 404 });
    }
    const affiliate: Affiliate = JSON.parse(data);
    affiliate.clicks = (affiliate.clicks || 0) + 1;
    affiliate.lastClickedAt = new Date().toISOString();
    await env.AFFILIATES.put(`affiliates/${id}`, JSON.stringify(affiliate));
    return new Response(JSON.stringify({ success: true, clicks: affiliate.clicks }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Short link redirect (GET /affiliate/go/:id)
  const goMatch = path.match(/^\/affiliate\/go\/([^/]+)$/);
  if (goMatch && request.method === 'GET') {
    const id = goMatch[1];
    const data = await env.AFFILIATES.get(`affiliates/${id}`);
    if (!data) {
      return new Response('Not found', { status: 404 });
    }
    const affiliate: Affiliate = JSON.parse(data);
    // Increment click count
    affiliate.clicks = (affiliate.clicks || 0) + 1;
    affiliate.lastClickedAt = new Date().toISOString();
    await env.AFFILIATES.put(`affiliates/${id}`, JSON.stringify(affiliate));
    // 302 redirect to original URL
    return Response.redirect(affiliate.url, 302);
  }

  // Single affiliate
  const affiliateMatch = path.match(/^\/api\/affiliates\/([^/]+)$/);
  if (affiliateMatch) {
    const id = affiliateMatch[1];

    if (request.method === 'GET') {
      const data = await env.AFFILIATES.get(`affiliates/${id}`);
      if (!data) {
        return new Response(JSON.stringify({ error: 'Affiliate not found' }), { status: 404 });
      }
      return new Response(data, {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (request.method === 'PUT') {
      const body = await request.json();
      const existing = await env.AFFILIATES.get(`affiliates/${id}`);
      if (!existing) {
        return new Response(JSON.stringify({ error: 'Affiliate not found' }), { status: 404 });
      }
      const affiliate = { ...JSON.parse(existing), ...body, updatedAt: new Date().toISOString() };
      await env.AFFILIATES.put(`affiliates/${id}`, JSON.stringify(affiliate));
      return new Response(JSON.stringify(affiliate), { headers: { 'Content-Type': 'application/json' } });
    }

    if (request.method === 'DELETE') {
      await env.AFFILIATES.delete(`affiliates/${id}`);
      const ids = await getAllIds(env.AFFILIATES, 'affiliates');
      const newIds = ids.filter(i => i !== id);
      await env.AFFILIATES.put('affiliates/all_ids', JSON.stringify(newIds));
      return new Response(JSON.stringify({ success: true }));
    }
  }

  // ========== MEDIA API ==========
  // GET /api/media - List all media items
  if (path === '/api/media' && request.method === 'GET') {
    const ids = await getAllIds(env.MEDIA, 'media');
    const items = await Promise.all(
      ids.map(async id => {
        const data = await env.MEDIA.get(`media/${id}`);
        return data ? JSON.parse(data) : null;
      })
    );
    return withCache(new Response(JSON.stringify(items.filter(Boolean)), {
      headers: { 'Content-Type': 'application/json' },
    }));
  }

  // POST /api/media - Upload media (returns simulated URL)
  if (path === '/api/media' && request.method === 'POST') {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), { status: 400 });
    }
    const id = crypto.randomUUID();
    const mediaItem = {
      id,
      name: file.name,
      url: `https://adult-toy-review.pages.dev/media/${id}/${file.name}`,
      type: file.type,
      size: file.size,
      createdAt: new Date().toISOString(),
    };
    await env.MEDIA.put(`media/${id}`, JSON.stringify(mediaItem));
    await setWithIds(env.MEDIA, 'media', id, mediaItem);
    return new Response(JSON.stringify(mediaItem), { status: 201 });
  }

  // Single media operations
  const mediaMatch = path.match(/^\/api\/media\/([^/]+)$/);
  if (mediaMatch) {
    const id = mediaMatch[1];


    // GET single media item
    if (request.method === 'GET') {
      const data = await env.MEDIA.get(`media/${id}`);
      if (!data) {
        return new Response(JSON.stringify({ error: 'Media not found' }), { status: 404 });
      }
      return new Response(data, { headers: { 'Content-Type': 'application/json' } });
    }

    // DELETE media item
    if (request.method === 'DELETE') {
      await env.MEDIA.delete(`media/${id}`);
      const ids = await getAllIds(env.MEDIA, 'media');
      const newIds = ids.filter(i => i !== id);
      await env.MEDIA.put('media/all_ids', JSON.stringify(newIds));
      return new Response(JSON.stringify({ success: true }));
    }
  }

  return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
};