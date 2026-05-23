// All API URLs centralized — change in one place
import { API_CONFIG } from './src/lib/api-config';

// Worker URL for proxy requests — single source of truth
const WORKER_URL = API_CONFIG.workerUrl;

interface Env {
  ARTICLES: KVNamespace;
  CATEGORIES: KVNamespace;
  NAVIGATION: KVNamespace;
  PAGES: KVNamespace;
  AFFILIATES: KVNamespace;
  SITE_SETTINGS: KVNamespace;
  MEDIA: KVNamespace;
  COMMENTS: KVNamespace;
  FEISHU_APP_ID: string;
  FEISHU_APP_SECRET: string;
  GITHUB_TOKEN: string;
  // For scheduled publishing cron trigger
  SCHEDULED_PUBLISH_SECRET: string;
  // For AI features
  AI: any;
  // JWT secret for token signing (REQUIRED)
  JWT_SECRET: string;
  // Setup secret for initial admin creation (REQUIRED)
  SETUP_SECRET: string;
  // AI Configuration (OpenAI compatible API)
  AI_CONFIG: KVNamespace;
}

// AI Model Providers Configuration
interface AIProvider {
  id: string;
  name: string;
  apiEndpoint: string;
  apiKey?: string;
  model: string;
  enabled: boolean;
}

interface AIConfig {
  defaultProvider: string;
  providers: AIProvider[];
  cacheEnabled: boolean;
  cacheTTL: number; // seconds
}

// Default AI providers
const DEFAULT_AI_CONFIG: AIConfig = {
  defaultProvider: 'cloudflare',
  providers: [
    {
      id: 'cloudflare',
      name: 'Cloudflare Workers AI',
      apiEndpoint: '',
      model: '@cf/meta/llama-3-8b-instruct',
      enabled: true,
    },
    {
      id: 'openai',
      name: 'OpenAI',
      apiEndpoint: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      enabled: false,
    },
    {
      id: 'anthropic',
      name: 'Anthropic Claude',
      apiEndpoint: 'https://api.anthropic.com/v1',
      model: 'claude-3-haiku',
      enabled: false,
    },
    {
      id: 'google',
      name: 'Google Gemini',
      apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta',
      model: 'gemini-1.5-flash',
      enabled: false,
    },
  ],
  cacheEnabled: true,
  cacheTTL: 3600, // 1 hour default cache
};

// Helper to get AI config
async function getAIConfig(env: Env): Promise<AIConfig> {
  const stored = await env.AI_CONFIG.get('config');
  if (stored) {
    return JSON.parse(stored);
  }
  // Return default and persist it
  await env.AI_CONFIG.put('config', JSON.stringify(DEFAULT_AI_CONFIG));
  return DEFAULT_AI_CONFIG;
}

// Helper to call AI with configurable provider
async function callAI(env: Env, params: {
  prompt: string;
  systemPrompt?: string;
  provider?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}) {
  const config = await getAIConfig(env);
  const providerId = params.provider || config.defaultProvider;
  const provider = config.providers.find(p => p.id === providerId);

  if (!provider || !provider.enabled) {
    throw new Error(`AI provider ${providerId} not available or disabled`);
  }

  // Check cache first
  if (config.cacheEnabled) {
    const cacheKey = `ai_cache/${Buffer.from(JSON.stringify(params)).toString('base64').slice(0, 64)}`;
    const cached = await env.SITE_SETTINGS.get(cacheKey);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < config.cacheTTL * 1000) {
        return data;
      }
    }
  }

  let result: string;

  if (providerId === 'cloudflare') {
    // Use Cloudflare Workers AI
    const model = params.model || provider.model;
    const aiResponse = await env.AI.run(model, {
      messages: [
        { role: 'system', content: params.systemPrompt || 'You are a helpful assistant.' },
        { role: 'user', content: params.prompt }
      ],
      max_tokens: params.maxTokens || 1024,
      temperature: params.temperature || 0.7,
    });
    result = aiResponse.response || '';
  } else {
    // Use OpenAI-compatible API
    const apiKey = provider.apiKey;
    if (!apiKey) {
      throw new Error(`API key not configured for ${provider.name}`);
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Different auth headers for different providers
    if (providerId === 'openai') {
      headers['Authorization'] = `Bearer ${apiKey}`;
    } else if (providerId === 'anthropic') {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else if (providerId === 'google') {
      headers['x-goog-api-key'] = apiKey;
    }

    const requestBody: any = {
      model: params.model || provider.model,
      messages: [
        { role: 'system', content: params.systemPrompt || 'You are a helpful assistant.' },
        { role: 'user', content: params.prompt }
      ],
      max_tokens: params.maxTokens || 1024,
      temperature: params.temperature || 0.7,
    };

    // Provider-specific adjustments
    if (providerId === 'anthropic') {
      requestBody.stream = false;
    } else if (providerId === 'google') {
      requestBody.generationConfig = {
        maxOutputTokens: params.maxTokens || 1024,
        temperature: params.temperature || 0.7,
      };
    }

    const apiUrl = providerId === 'google'
      ? `${provider.apiEndpoint}/models/${params.model || provider.model}:generateContent`
      : `${provider.apiEndpoint}/chat/completions`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI API error: ${response.status} - ${errorText}`);
    }

    const responseData = await response.json();

    // Parse response based on provider format
    if (providerId === 'openai' || providerId === 'anthropic') {
      result = responseData.choices?.[0]?.message?.content || '';
    } else if (providerId === 'google') {
      result = responseData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else {
      result = responseData.choices?.[0]?.message?.content || JSON.stringify(responseData);
    }
  }

  // Cache the result
  if (config.cacheEnabled) {
    const cacheKey = `ai_cache/${Buffer.from(JSON.stringify(params)).toString('base64').slice(0, 64)}`;
    await env.SITE_SETTINGS.put(cacheKey, JSON.stringify({
      data: result,
      timestamp: Date.now(),
    }), { expirationTtl: config.cacheTTL });
  }

  return result;
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

interface AffiliateProduct {
  name: string;
  image?: string;
  price?: string;
  currency?: string;
  rating?: number;
  reviewsCount?: number;
}

interface AffiliateCommission {
  rate?: string;
  type: 'percentage' | 'fixed' | 'tiered';
  tiers?: { volume: string; rate: string }[];
}

interface Affiliate {
  id: string;
  platform: 'amazon' | 'awin' | 'shareasale' | 'cj' | 'custom';
  name: string;
  brand: string;
  url: string;
  shortCode: string;
  group: string;
  category: string;
  product: AffiliateProduct;
  commission: AffiliateCommission;
  clicks: number;
  conversions: number;
  revenue: number;
  lastClickedAt?: string;
  status: 'active' | 'inactive' | 'pending' | 'expired';
  lastVerifiedAt?: string;
  isUrlValid: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AffiliateGroup {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  color?: string;
  affiliateIds: string[];
  order: number;
  createdAt: string;
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

// KV helpers - uses list() instead of all_ids key to avoid race conditions
async function getAllIds(kv: KVNamespace, prefix: string): Promise<string[]> {
  const ids: string[] = [];
  try {
    let cursor: string | undefined;
    do {
      const options: { prefix: string; cursor?: string } = { prefix: `${prefix}/` };
      if (cursor) {
        options.cursor = cursor;
      }
      const result = await kv.list(options);
      for (const key of result.keys) {
        const parts = key.name.split('/');
        const id = parts[parts.length - 1];
        if (id && id !== 'all_ids') {
          ids.push(id);
        }
      }
      cursor = result.cursor;
    } while (cursor);
  } catch (e) {
    console.error('KV list error:', e);
  }
  return ids;
}

async function getAllItems(kv: KVNamespace, prefix: string): Promise<any[]> {
  const ids = await getAllIds(kv, prefix);
  const items = await Promise.all(
    ids.map(async id => {
      const data = await kv.get(`${prefix}/${id}`);
      return data ? JSON.parse(data) : null;
    })
  );
  return items.filter(Boolean);
}

async function setWithIds(kv: KVNamespace, prefix: string, id: string, data: object) {
  await kv.put(`${prefix}/${id}`, JSON.stringify(data));
}

async function addId(kv: KVNamespace, prefix: string, id: string) {
  // No-op: ID tracking is done via kv.list() enumeration
}

// Password hashing using PBKDF2 with per-user random salt
async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "");
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  const hashArray = Array.from(new Uint8Array(derivedBits));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `${salt}:${hashHex}`;
}

async function verifyPassword(password: string, stored: string, env: Env): Promise<boolean> {
  const parts = stored.split(':');
  if (parts.length !== 2) {
    // Legacy hash without salt - use env-configured salt
    const encoder = new TextEncoder();
    const data = encoder.encode(password + getLegacyPasswordSalt(env));
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('') === stored;
  }
  const [salt, hash] = parts;
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  const hashArray = Array.from(new Uint8Array(derivedBits));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex === hash;
}

// Simple JWT-like token generation/verification using HMAC-SHA256
async function generateToken(user: any, env: Env): Promise<string> {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({
    userId: user.id,
    username: user.username,
    role: user.role,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  }));
  const secret = env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required - cannot generate token');
  }
  if (secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long for security');
  }
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${payload}`));
  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return `${header}.${payload}.${signatureBase64}`;
}

// Simplified token verification - verify structure, expiry and signature
async function verifyToken(token: string, env: Env): Promise<any> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid token format');
    }
    const [header, payload, signature] = parts;

    // Verify signature
    const secret = env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is required');
    }
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const signatureBuffer = (() => {
      try {
        return Uint8Array.from(atob(signature), c => c.charCodeAt(0));
      } catch {
        throw new Error('Invalid token: base64 decode failed');
      }
    })();
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBuffer,
      new TextEncoder().encode(`${header}.${payload}`)
    );
    if (!isValid) {
      throw new Error('Invalid signature');
    }

    // Handle base64 padding and URL-safe chars
    let payloadBase64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    while (payloadBase64.length % 4) payloadBase64 += '=';
    let payloadStr;
    try {
      payloadStr = atob(payloadBase64);
    } catch {
      throw new Error('Invalid token: payload decode failed');
    }
    const payloadObj = JSON.parse(payloadStr);
    if (payloadObj.exp < Date.now()) {
      throw new Error('Token expired');
    }
    return payloadObj;
  } catch (e) {
    throw new Error('Invalid token: ' + (e instanceof Error ? e.message : String(e)));
  }
}

// Router
async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

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

  // Helper: add cache headers to public read responses
  const withCache = (res: Response): Response => {
    const h = new Headers(res.headers);
    h.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
    return new Response(res.body, { status: res.status, headers: h });
  };

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Fail-fast on critical misconfigurations
  validateEnvironment(env);

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
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    await env.SITE_SETTINGS.put(rateLimitKey, String(count + 1), { expirationTtl: 60 });
  }

  // Article list with optional status filter
  if (path === '/api/articles' && request.method === 'GET') {
    const status = url.searchParams.get('status');
    const category = url.searchParams.get('category');
    const tag = url.searchParams.get('tag');
    const search = url.searchParams.get('search');
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100); // Cap at 100
    const sort = url.searchParams.get('sort') || 'updatedAt';

    let filtered = await getAllItems(env.ARTICLES, 'articles') as any[];

    // Filter by status
    if (status) {
      filtered = filtered.filter(a => a.status === status);
    }

    // Filter by category
    if (category) {
      filtered = filtered.filter(a => a.categoryId === category);
    }

    // Filter by tag
    if (tag) {
      filtered = filtered.filter(a => a.tags && a.tags.includes(tag));
    }

    // Search in title and excerpt
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(a =>
        a.title?.toLowerCase().includes(searchLower) ||
        a.excerpt?.toLowerCase().includes(searchLower) ||
        a.content?.toLowerCase().includes(searchLower)
      );
    }

    // Sort
    filtered.sort((a, b) => {
      if (sort === 'createdAt') {
        const aTime = new Date(a.createdAt).getTime() || 0;
        const bTime = new Date(b.createdAt).getTime() || 0;
        return bTime - aTime;
      }
      if (sort === 'publishedAt') {
        const aTime = new Date(a.publishedAt).getTime() || 0;
        const bTime = new Date(b.publishedAt).getTime() || 0;
        return bTime - aTime;
      }
      if (sort === 'title') return (a.title || '').localeCompare(b.title || '');
      const aTime = new Date(a.updatedAt).getTime() || 0;
      const bTime = new Date(b.updatedAt).getTime() || 0;
      return bTime - aTime;
    });

    // Pagination
    const total = filtered.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const paginated = filtered.slice(start, start + limit);

    return new Response(JSON.stringify({
      articles: paginated,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      }
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Create article
  if (path === '/api/articles' && request.method === 'POST') {
    const authError = await requireAuth(request, env, 'articles:write');
    if (authError) return authError;
    const body = await request.json();
    const id = crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "");
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

  // Popular articles - MUST come before the generic /:id handler
  if (path === '/api/articles/popular' && request.method === 'GET') {
    const period = url.searchParams.get('period') || '7d';
    const limit = parseInt(url.searchParams.get('limit') || '10');

    // Get all articles with view counts
    const articleIds = await getAllIds(env.ARTICLES, 'articles');
    const articlesWithViews = await Promise.all(
      articleIds.map(async id => {
        const data = await env.ARTICLES.get(`articles/${id}`);
        const viewsData = await env.ARTICLES.get(`articles/${id}/views`);
        return data ? { article: JSON.parse(data), views: viewsData ? parseInt(viewsData) : 0 } : null;
      })
    );

    let validArticles = articlesWithViews.filter(Boolean) as any[];
    validArticles = validArticles.filter(a => a.article.status === 'published');
    validArticles.sort((a, b) => b.views - a.views);
    const topArticles = validArticles.slice(0, limit).map(a => ({
      id: a.article.id,
      title: a.article.title,
      slug: a.article.slug,
      views: a.views,
      excerpt: a.article.excerpt
    }));

    return withCache(new Response(JSON.stringify(topArticles), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Related articles
  const relatedMatch = path.match(/^\/api\/articles\/related\/([^/]+)$/);
  if (relatedMatch && request.method === 'GET') {
    const articleId = relatedMatch[1];
    const articleData = await env.ARTICLES.get(`articles/${articleId}`);
    if (!articleData) {
      return new Response(JSON.stringify({ error: 'Article not found' }), { status: 404 });
    }
    const article = JSON.parse(articleData);
    const limit = parseInt(url.searchParams.get('limit') || '4');
    const validArticles = await getAllItems(env.ARTICLES, 'articles') as any[];
    const related = validArticles
      .filter(a => a.id !== articleId && a.status === 'published' && a.categoryId === article.categoryId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, limit);
    return withCache(new Response(JSON.stringify(related), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Single article operations
  const articleMatch = path.match(/^\/api\/articles\/([^/]+)(\/.*)?$/);
  if (articleMatch && articleMatch[1] !== 'export') {
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
      const authError = await requireAuth(request, env, 'articles:write');
      if (authError) return authError;
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      const existing = await env.ARTICLES.get(`articles/${id}`);
      if (!existing) {
        return new Response(JSON.stringify({ error: 'Article not found' }), { status: 404 });
      }
      const article = { ...JSON.parse(existing), ...body, updatedAt: new Date().toISOString() };
      await env.ARTICLES.put(`articles/${id}`, JSON.stringify(article));
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
      const authError = await requireAuth(request, env, 'articles:write');
      if (authError) return authError;
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
    const allArticles = await getAllItems(env.ARTICLES, 'articles');

    // Filter by status first (no KV needed)
    const statusFiltered = allArticles.filter((a: any) => !status || a.status === status);

    // Parallel KV reads for category lookups
    let filteredIds = statusFiltered;
    if (categorySlug) {
      const catsData = await Promise.all(
        statusFiltered.map(a => env.CATEGORIES.get(`categories/${a.categoryId}`))
      );
      filteredIds = statusFiltered.filter((a: any, i: number) => {
        const cat = catsData[i];
        if (!cat) return false;
        const catObj = JSON.parse(cat);
        return catObj.slug === categorySlug;
      });
    }

    return new Response(JSON.stringify(filteredIds), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get categories with article count
  if (path === '/api/categories/with-count' && request.method === 'GET') {
    const validCategories = await getAllItems(env.CATEGORIES, 'categories');

    // Get article counts for each category
    const publishedArticles = (await getAllItems(env.ARTICLES, 'articles')).filter((a: any) => a.status === 'published');

    const categoriesWithCount = validCategories.map((cat: any) => ({
      ...cat,
      articleCount: publishedArticles.filter((a: any) => a.categoryId === cat.id).length,
    }));

    return new Response(JSON.stringify(categoriesWithCount), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Categories
  if (path === '/api/categories') {
    if (request.method === 'GET') {
      const sorted = (await getAllItems(env.CATEGORIES, 'categories')).sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
      return new Response(JSON.stringify(sorted), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (request.method === 'POST') {
      const authError = await requireAuth(request, env, 'categories:write');
      if (authError) return authError;
      const body = await request.json();
      const id = crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "");
      const category = {
        ...body,
        id,
        parentId: body.parentId || null,
        order: body.order || 0,
        createdAt: new Date().toISOString()
      };
      await setWithIds(env.CATEGORIES, 'categories', id, category);
      return new Response(JSON.stringify(category), { status: 201 });
    }
  }

  // Reorder categories
  if (path === '/api/categories/reorder' && request.method === 'PUT') {
    const authError = await requireAuth(request, env, 'categories:write');
    if (authError) return authError;
    const body = await request.json();
    const { orders } = body; // [{id, order}, ...]

    // Parallelize KV reads, then parallelize writes
    const catsData = await Promise.all(orders.map(item => env.CATEGORIES.get(`categories/${item.id}`)));
    const updates = orders
      .map((item, i) => ({ item, data: catsData[i] }))
      .filter(({ data }) => data !== null)
      .map(({ item, data }) => {
        const cat = JSON.parse(data!);
        cat.order = item.order;
        return { id: item.id, cat };
      });

    // Parallel KV writes
    await Promise.all(updates.map(({ id, cat }) =>
      env.CATEGORIES.put(`categories/${id}`, JSON.stringify(cat))
    ));

    return new Response(JSON.stringify({ success: true }));
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
      const authError = await requireAuth(request, env, 'categories:write');
      if (authError) return authError;
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
    const authError = await requireAuth(request, env, 'content:read');
    if (authError) return authError;
    const folderToken = url.searchParams.get('folder_token');
    if (!folderToken) {
      return new Response(JSON.stringify({ error: 'folder_token required' }), { status: 400 });
    }
    const docs = await getFeishuDocs(env, folderToken);
    return new Response(JSON.stringify(docs), { headers: { 'Content-Type': 'application/json' } });
  }

  // Single Feishu doc content
  if (path === '/api/feishu/doc' && request.method === 'GET') {
    const authError = await requireAuth(request, env, 'content:read');
    if (authError) return authError;
    const docToken = url.searchParams.get('token');
    if (!docToken) {
      return new Response(JSON.stringify({ error: 'token required' }), { status: 400 });
    }
    try {
      const content = await getFeishuDocContent(env, docToken);
      return new Response(JSON.stringify(content), { headers: { 'Content-Type': 'application/json' } });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Failed to get doc content' }), { status: 500 });
    }
  }

  // Sync single article from Feishu
  if (path === '/api/articles/sync' && request.method === 'POST') {
    const authError = await requireAuth(request, env, 'articles:write');
    if (authError) return authError;
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
    const id = crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "");
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

  // Scheduled publish - cron trigger to check and publish pending articles
  if (path === '/api/articles/scheduled-publish' && request.method === 'POST') {
    const body = await request.json();
    // Verify secret to prevent unauthorized calls
    if (body.secret !== env.SCHEDULED_PUBLISH_SECRET) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const ids = await getAllIds(env.ARTICLES, 'articles');
    const now = new Date();

    // Parallelize KV reads first
    const articlesData = await Promise.all(ids.map(id => env.ARTICLES.get(`articles/${id}`)));

    // Find articles to publish
    const toPublish = articlesData
      .map((data, i) => ({ id: ids[i], data }))
      .filter(({ data }) => data !== null)
      .map(({ id, data }) => JSON.parse(data!))
      .filter((article: any) =>
        article.status === 'scheduled' &&
        article.scheduledAt &&
        new Date(article.scheduledAt) <= now
      )
      .map((article: any) => {
        article.status = 'published';
        article.publishedAt = now.toISOString();
        article.updatedAt = now.toISOString();
        delete article.scheduledAt;
        return article;
      });

    // Parallel KV writes for published articles
    await Promise.all(toPublish.map(article =>
      env.ARTICLES.put(`articles/${article.id}`, JSON.stringify(article))
    ));

    return new Response(JSON.stringify({ published: toPublish.length }));
  }

  // Schedule article for future publish
  if (path === '/api/articles/schedule' && request.method === 'POST') {
    const authError = await requireAuth(request, env, 'articles:write');
    if (authError) return authError;
    const body = await request.json();
    const { articleId, scheduledAt } = body;

    if (!articleId || !scheduledAt) {
      return new Response(JSON.stringify({ error: 'articleId and scheduledAt required' }), { status: 400 });
    }

    const existing = await env.ARTICLES.get(`articles/${articleId}`);
    if (!existing) {
      return new Response(JSON.stringify({ error: 'Article not found' }), { status: 404 });
    }

    const article = JSON.parse(existing);
    article.scheduledAt = scheduledAt;
    article.status = 'scheduled';
    article.updatedAt = new Date().toISOString();
    await env.ARTICLES.put(`articles/${articleId}`, JSON.stringify(article));

    return new Response(JSON.stringify({ success: true, scheduledAt }));
  }

  if (path.startsWith('/api/github/write')) {
    if (request.method === 'POST') {
      const authError = await requireAuth(request, env, 'content:write');
      if (authError) return authError;
      const body = await request.json();
      const result = await createOrUpdateFile(env, body.path, body.content, body.message, body.sha);
      return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
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
      const pages = await getAllItems(env.PAGES, 'pages');
      return new Response(JSON.stringify(pages), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (request.method === 'POST') {
      const authError = await requireAuth(request, env, 'pages:write');
      if (authError) return authError;
      const body = await request.json();
      const id = crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "");
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

  // Generate short code (6 chars, no confusing chars)
function generateShortCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// AFFILIATES CRUD
  if (path === '/api/affiliates') {
    if (request.method === 'GET') {
      const affiliates = await getAllItems(env.AFFILIATES, 'affiliates');
      return new Response(JSON.stringify(affiliates), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (request.method === 'POST') {
      const authError = await requireAuth(request, env, 'affiliates:write');
      if (authError) return authError;
      const body = await request.json();
      const id = crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "");
      const shortCode = generateShortCode();
      const affiliate: Affiliate = {
        id,
        platform: body.platform || 'custom',
        name: body.name || '',
        brand: body.brand || '',
        url: body.url || '',
        shortCode,
        group: body.group || '',
        category: body.category || '',
        product: body.product || { name: body.name || '' },
        commission: body.commission || { type: 'percentage' },
        clicks: 0,
        conversions: 0,
        revenue: 0,
        lastClickedAt: undefined,
        status: body.status || 'active',
        lastVerifiedAt: undefined,
        isUrlValid: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      // Store short code mapping
      await setWithIds(env.AFFILIATES, 'affiliates', id, affiliate);
      await env.AFFILIATES.put(`shortcodes/${shortCode}`, id);
      return new Response(JSON.stringify(affiliate), { status: 201 });
    }
  }

  // Get affiliate groups
  if (path === '/api/affiliates/groups' && request.method === 'GET') {
    const validAffiliates = await getAllItems(env.AFFILIATES, 'affiliates') as Affiliate[];

    // Group by group field
    const groupsMap = new Map<string, { name: string; count: number; affiliates: Affiliate[] }>();
    for (const aff of validAffiliates) {
      const groupName = aff.group || '未分组';
      if (!groupsMap.has(groupName)) {
        groupsMap.set(groupName, { name: groupName, count: 0, affiliates: [] });
      }
      const group = groupsMap.get(groupName)!;
      group.count++;
      group.affiliates.push(aff);
    }

    const groups = Array.from(groupsMap.values());
    return new Response(JSON.stringify(groups), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get affiliate stats
  if (path === '/api/affiliates/stats' && request.method === 'GET') {
    const validAffiliates = await getAllItems(env.AFFILIATES, 'affiliates') as Affiliate[];

    const totalClicks = validAffiliates.reduce((sum, a) => sum + (a.clicks || 0), 0);
    const totalConversions = validAffiliates.reduce((sum, a) => sum + (a.conversions || 0), 0);
    const totalRevenue = validAffiliates.reduce((sum, a) => sum + (a.revenue || 0), 0);
    const activeCount = validAffiliates.filter(a => a.status === 'active').length;
    const inactiveCount = validAffiliates.filter(a => a.status !== 'active').length;

    // Top affiliates by clicks
    const topByClicks = [...validAffiliates]
      .sort((a, b) => (b.clicks || 0) - (a.clicks || 0))
      .slice(0, 5)
      .map(a => ({ id: a.id, name: a.name, clicks: a.clicks }));

    return new Response(JSON.stringify({
      total: validAffiliates.length,
      active: activeCount,
      inactive: inactiveCount,
      totalClicks,
      totalConversions,
      totalRevenue,
      topByClicks,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
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

  // Add commission event (POST /api/affiliates/:id/commission)
  const commissionMatch = path.match(/^\/api\/affiliates\/([^/]+)\/commission$/);
  if (commissionMatch && request.method === 'POST') {
    const id = commissionMatch[1];
    const data = await env.AFFILIATES.get(`affiliates/${id}`);
    if (!data) {
      return new Response(JSON.stringify({ error: 'Affiliate not found' }), { status: 404 });
    }
    const affiliate: Affiliate = JSON.parse(data);
    const body = await request.json();
    const { amount, type, orderId, notes } = body;

    // Create commission event
    const eventId = crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "");
    const event = {
      id: eventId,
      affiliateId: id,
      amount: amount || 0,
      type: type || 'sale', // sale, lead, click, bonus
      orderId: orderId || '',
      notes: notes || '',
      createdAt: new Date().toISOString(),
    };

    // Store commission event
    await env.AFFILIATES.put(`commissions/${eventId}`, JSON.stringify(event));

    // Update affiliate totals
    affiliate.conversions = (affiliate.conversions || 0) + 1;
    affiliate.revenue = (affiliate.revenue || 0) + (amount || 0);

    // Add to affiliate's commission history
    const historyKey = `affiliates/${id}/commissions`;
    const historyData = await env.AFFILIATES.get(historyKey);
    const history = historyData ? JSON.parse(historyData) : [];
    history.push(eventId);
    await env.AFFILIATES.put(historyKey, JSON.stringify(history));

    await env.AFFILIATES.put(`affiliates/${id}`, JSON.stringify(affiliate));

    return new Response(JSON.stringify({ success: true, event }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get commission history for affiliate (GET /api/affiliates/:id/commissions)
  const commissionsGetMatch = path.match(/^\/api\/affiliates\/([^/]+)\/commissions$/);
  if (commissionsGetMatch && request.method === 'GET') {
    const id = commissionsGetMatch[1];
    const historyKey = `affiliates/${id}/commissions`;
    const historyData = await env.AFFILIATES.get(historyKey);

    if (!historyData) {
      return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });
    }

    const historyIds = JSON.parse(historyData) as string[];
    const events = await Promise.all(
      historyIds.map(async (eventId: string) => {
        const eventData = await env.AFFILIATES.get(`commissions/${eventId}`);
        return eventData ? JSON.parse(eventData) : null;
      })
    );

    return new Response(JSON.stringify(events.filter(Boolean)), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get all commissions summary (GET /api/commissions)
  if (path === '/api/commissions' && request.method === 'GET') {
    const allCommissionIds: string[] = [];
    const list = await env.AFFILIATES.list({ prefix: 'commissions/' });
    for (const key of list.keys) {
      const id = key.name.replace('commissions/', '');
      allCommissionIds.push(id);
    }

    const events = await Promise.all(
      allCommissionIds.map(async (eventId: string) => {
        const eventData = await env.AFFILIATES.get(`commissions/${eventId}`);
        return eventData ? JSON.parse(eventData) : null;
      })
    );

    const validEvents = events.filter(Boolean);
    const totalAmount = validEvents.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
    const byType: Record<string, number> = {};
    validEvents.forEach((e: any) => {
      byType[e.type] = (byType[e.type] || 0) + (e.amount || 0);
    });

    return new Response(JSON.stringify({
      totalEvents: validEvents.length,
      totalAmount,
      byType,
      events: validEvents.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    }), {
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
    const items = await getAllItems(env.MEDIA, 'media');
    return new Response(JSON.stringify(items), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // POST /api/media - Upload media
  if (path === '/api/media' && request.method === 'POST') {
    const authError = await requireAuth(request, env, 'media:write');
    if (authError) return authError;
    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), { status: 400 });
    }
    const id = crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "");
    const mediaItem = {
      id,
      name: file.name,
      url: `https://adult-toy-review.pages.dev/media/${id}/${file.name}`,
      type: file.type,
      size: file.size,
      createdAt: new Date().toISOString(),
    };
    await env.MEDIA.put(`media/${id}`, JSON.stringify(mediaItem));
    await addId(env.MEDIA, 'media', id);
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

  // ========== THEMES API ==========
  // Built-in themes list
  if (path === '/api/themes' && request.method === 'GET') {
    const themes = [
      {
        id: 'adult-products',
        name: 'Adult Products Review',
        description: 'Dark theme for adult product reviews',
        category: 'adult',
        isBuiltIn: true,
      },
      {
        id: 'tech-reviews',
        name: 'Tech Reviews',
        description: 'Modern blue theme for tech reviews',
        category: 'tech',
        isBuiltIn: true,
      },
      {
        id: 'finance',
        name: 'Finance Hub',
        description: 'Professional green theme for finance',
        category: 'finance',
        isBuiltIn: true,
      },
      {
        id: 'health',
        name: 'Health & Wellness',
        description: 'Fresh green theme for health content',
        category: 'health',
        isBuiltIn: true,
      },
    ];
    return new Response(JSON.stringify(themes), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get single theme config
  const themeMatch = path.match(/^\/api\/themes\/([^/]+)$/);
  if (themeMatch) {
    const themeId = themeMatch[1];

    // Check for special routes first
    if (themeId === 'active') {
      const activeTheme = await env.SITE_SETTINGS.get('active_theme');
      const theme = activeTheme ? JSON.parse(activeTheme) : { themeId: 'adult-products', mode: 'dark' };
      return new Response(JSON.stringify(theme), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const themes: Record<string, any> = {
      'adult-products': {
        id: 'adult-products',
        name: 'Adult Products Review',
        colors: {
          primary: '#e11d48',
          secondary: '#be185d',
          background: '#0f0f23',
          surface: '#16213e',
          text: '#e2e8f0',
        },
        fonts: { heading: 'Inter', body: 'Inter' },
        layout: { maxWidth: '1280px', borderRadius: '12px' },
      },
      'tech-reviews': {
        id: 'tech-reviews',
        name: 'Tech Reviews',
        colors: {
          primary: '#3b82f6',
          secondary: '#1d4ed8',
          background: '#0f172a',
          surface: '#1e293b',
          text: '#f1f5f9',
        },
        fonts: { heading: 'Inter', body: 'Inter' },
        layout: { maxWidth: '1280px', borderRadius: '8px' },
      },
      'finance': {
        id: 'finance',
        name: 'Finance Hub',
        colors: {
          primary: '#10b981',
          secondary: '#059669',
          background: '#f8fafc',
          surface: '#ffffff',
          text: '#1e293b',
        },
        fonts: { heading: 'Inter', body: 'Inter' },
        layout: { maxWidth: '1280px', borderRadius: '8px' },
      },
      'health': {
        id: 'health',
        name: 'Health & Wellness',
        colors: {
          primary: '#22c55e',
          secondary: '#16a34a',
          background: '#fefefe',
          surface: '#f0fdf4',
          text: '#1e293b',
        },
        fonts: { heading: 'Inter', body: 'Inter' },
        layout: { maxWidth: '1280px', borderRadius: '8px' },
      },
    };

    const theme = themes[themeId];
    if (!theme) {
      return new Response(JSON.stringify({ error: 'Theme not found' }), { status: 404 });
    }

    // Get custom theme overrides from KV if exists
    const customTheme = await env.SITE_SETTINGS.get(`theme/${themeId}`);
    if (customTheme) {
      const custom = JSON.parse(customTheme);
      return new Response(JSON.stringify({ ...theme, ...custom, isCustom: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(theme), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Save theme customization
  if (path.match(/^\/api\/themes\/([^/]+)\/save$/) && request.method === 'POST') {
    const themeId = path.match(/^\/api\/themes\/([^/]+)\/save$/)?.[1];
    if (!themeId) {
      return new Response(JSON.stringify({ error: 'Invalid theme ID' }), { status: 400 });
    }
    const body = await request.json();
    await env.SITE_SETTINGS.put(`theme/${themeId}`, JSON.stringify(body));
    return new Response(JSON.stringify({ success: true }));
  }

  // Set active theme
  if (path === '/api/themes/active' && request.method === 'PUT') {
    const body = await request.json();
    await env.SITE_SETTINGS.put('active_theme', JSON.stringify(body));
    return new Response(JSON.stringify({ success: true }));
  }

  // ========== AI CONTENT API ==========
  // Generate article content using AI
  if (path === '/api/ai/generate' && request.method === 'POST') {
    const authError = await requireAuth(request, env, 'ai:generate');
    if (authError) return authError;
    const body = await request.json();
    const { prompt, type, context } = body;

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Prompt required' }), { status: 400 });
    }

    try {
      // Build the prompt based on type
      let systemPrompt = 'You are a professional content writer for review websites.';
      let userPrompt = prompt;

      if (type === 'seo-outline') {
        systemPrompt = 'You are an SEO expert. Generate a detailed article outline with headings, key points, and SEO recommendations.';
        userPrompt = `Create an SEO-optimized article outline for: ${prompt}`;
        if (context?.targetKeyword) {
          userPrompt += `\n\nTarget keyword: ${context.targetKeyword}`;
        }
        if (context?.wordCount) {
          userPrompt += `\n\nTarget word count: ${context.wordCount}`;
        }
      } else if (type === 'meta-description') {
        systemPrompt = 'You are an SEO expert. Write compelling meta descriptions (150-160 characters) that encourage clicks.';
        userPrompt = `Write a meta description for an article about: ${prompt}`;
      } else if (type === 'content-expansion') {
        systemPrompt = 'You are a content writer. Expand the given outline into full article content with engaging, SEO-friendly writing.';
        userPrompt = `Expand this outline into a full article:\n\n${prompt}`;
      } else if (type === 'title-generation') {
        systemPrompt = 'You are a copywriter. Generate 5 catchy, click-worthy article titles.';
        userPrompt = `Generate 5 article titles about: ${prompt}`;
      } else if (type === 'affiliate-review') {
        systemPrompt = 'You are an affiliate marketing expert. Write compelling product review sections that convert readers into buyers.';
        userPrompt = `Write an affiliate product review section for: ${prompt}`;
      }

      // Use configurable AI provider
      const generatedText = await callAI(env, {
        prompt: userPrompt,
        systemPrompt,
        provider: context?.provider,
        model: context?.model,
        maxTokens: context?.maxTokens || 1024,
        temperature: context?.temperature || 0.7,
      });

      return new Response(JSON.stringify({
        success: true,
        content: generatedText,
        type,
        prompt,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      return new Response(JSON.stringify({
        error: 'AI generation failed',
        message: (error as Error).message,
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // SEO analysis endpoint
  if (path === '/api/ai/analyze-seo' && request.method === 'POST') {
    const authError = await requireAuth(request, env, 'ai:analyze');
    if (authError) return authError;
    const body = await request.json();
    const { title, metaDescription, content, url, keywords } = body;

    const issues: Array<{type: 'error' | 'warning' | 'success'; message: string; score?: number}> = [];
    const suggestions: string[] = [];
    let totalScore = 100;
    let metaScore = 100;
    let contentScore = 100;
    let structureScore = 100;
    let readabilityScore = 100;

    // Title checks
    if (title) {
      if (title.length < 30) {
        issues.push({ type: 'warning', message: 'Title is too short (less than 30 characters)' });
        metaScore -= 10;
      } else if (title.length > 60) {
        issues.push({ type: 'warning', message: 'Title is too long (more than 60 characters)' });
        metaScore -= 10;
      }
      if (keywords && !title.toLowerCase().includes(keywords.toLowerCase().split(',')[0].trim())) {
        issues.push({ type: 'warning', message: 'Title does not contain target keyword' });
        metaScore -= 15;
      }
    } else {
      issues.push({ type: 'error', message: 'Title is missing' });
      metaScore -= 20;
    }

    // Meta description checks
    if (metaDescription) {
      if (metaDescription.length < 120) {
        issues.push({ type: 'warning', message: 'Meta description is too short (less than 120 characters)' });
        metaScore -= 10;
      } else if (metaDescription.length > 160) {
        issues.push({ type: 'warning', message: 'Meta description is too long (more than 160 characters)' });
        metaScore -= 10;
      }
    } else {
      issues.push({ type: 'warning', message: 'Meta description is missing' });
      metaScore -= 15;
    }

    // Content checks
    if (content) {
      const wordCount = content.split(/\s+/).length;
      const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
      const paragraphs = content.split(/\n\n+/);

      if (wordCount < 300) {
        issues.push({ type: 'error', message: 'Content is too short (less than 300 words)' });
        contentScore -= 25;
      } else if (wordCount < 800) {
        issues.push({ type: 'warning', message: 'Content could be longer for better SEO (current: ' + wordCount + ' words)' });
        contentScore -= 10;
      } else if (wordCount >= 1500) {
        contentScore += 10; // Bonus for comprehensive content
      }

      // Keyword density check
      if (keywords) {
        const keyword = keywords.split(',')[0].trim().toLowerCase();
        const keywordCount = (content.toLowerCase().match(new RegExp(keyword, 'g')) || []).length;
        const keywordDensity = wordCount > 0 ? (keywordCount / wordCount) * 100 : 0;
        if (keywordDensity < 0.5) {
          suggestions.push(`Keyword density is low (${keywordDensity.toFixed(1)}%). Consider adding more "${keyword}" occurrences.`);
          contentScore -= 5;
        } else if (keywordDensity > 3) {
          issues.push({ type: 'warning', message: `Keyword density is high (${keywordDensity.toFixed(1)}%). Consider reducing "${keyword}" occurrences.` });
          contentScore -= 10;
        }
      }

      // Structure checks
      if (!content.includes('#') && !content.includes('##') && !content.includes('<h2')) {
        issues.push({ type: 'warning', message: 'Content lacks proper heading structure' });
        structureScore -= 15;
      }

      // Check for lists
      if (!content.includes('- ') && !content.includes('* ') && !content.includes('1.') && !content.includes('2.')) {
        suggestions.push('Consider adding bullet points or numbered lists for better readability');
        structureScore -= 5;
      }

      // Readability checks
      const avgSentenceLength = sentences.length > 0 ? wordCount / sentences.length : wordCount;
      if (avgSentenceLength > 25) {
        issues.push({ type: 'warning', message: 'Average sentence length is high (' + avgSentenceLength.toFixed(0) + ' words/sentence). Consider breaking into shorter sentences.' });
        readabilityScore -= 15;
      }

      // Check paragraph length
      for (let i = 0; i < paragraphs.length; i++) {
        const paraWords = paragraphs[i].split(/\s+/).length;
        if (paraWords > 150) {
          suggestions.push(`Paragraph ${i + 1} is quite long (${paraWords} words). Consider splitting for better readability.`);
          readabilityScore -= 5;
        }
      }

      // Check for internal links suggestion
      if (!content.includes('href') && !content.includes('link')) {
        suggestions.push('Consider adding internal links to related articles');
      }

    } else {
      issues.push({ type: 'error', message: 'Content is missing' });
      contentScore -= 25;
    }

    // Calculate total score
    totalScore = Math.round((metaScore + contentScore + structureScore + readabilityScore) / 4);
    totalScore = Math.max(0, Math.min(100, totalScore));

    // Ensure sub-scores are in valid range
    metaScore = Math.max(0, Math.min(100, metaScore));
    contentScore = Math.max(0, Math.min(100, contentScore));
    structureScore = Math.max(0, Math.min(100, structureScore));
    readabilityScore = Math.max(0, Math.min(100, readabilityScore));

    // Generate FAQ schema if content suggests FAQ structure
    const faqSchema: {question: string; answer: string}[] = [];
    const faqMatches = content?.match(/(?:Q[):]\s*(.+?)|(?:FAQ:?\s*(.+?))(?=\n\n|$))/gi) || [];
    if (faqMatches.length >= 2) {
      faqMatches.forEach(match => {
        const question = match.replace(/^(?:Q[):]\s*|FAQ:?\s*)/i, '').trim();
        if (question && question.length > 10) {
          faqSchema.push({ question, answer: 'Answer to ' + question });
        }
      });
    }

    // Generate JSON-LD structured data
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: title || '',
      description: metaDescription || '',
      ...(url && { url }),
      ...(faqSchema.length > 0 && {
        '@type': 'FAQPage',
        mainEntity: faqSchema.map(faq => ({
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: faq.answer
          }
        }))
      })
    };

    return new Response(JSON.stringify({
      score: totalScore,
      metaScore,
      contentScore,
      structureScore,
      readabilityScore,
      issues,
      suggestions,
      faqSchema,
      jsonLd,
      passed: totalScore >= 70,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Content improvement and style rewriting
  if (path === '/api/ai/improve' && request.method === 'POST') {
    const authError = await requireAuth(request, env, 'ai:improve');
    if (authError) return authError;
    const body = await request.json();
    const { content, title, focus, style } = body;

    if (!content) {
      return new Response(JSON.stringify({ error: 'Content required' }), { status: 400 });
    }

    const improvements: string[] = [];
    const wordCount = content.split(/\s+/).length;
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const paragraphs = content.split(/\n\n+/);

    // If style is specified, return style rewriting instead of improvement suggestions
    if (style) {
      const styleConfigs: Record<string, {name: string; transforms: string[]; rewritePrompt: string}> = {
        seo: {
          name: 'SEO Optimized',
          transforms: ['keyword_placement', 'heading_structure', 'meta_optimization'],
          rewritePrompt: 'Rewrite this content with SEO best practices: natural keyword placement, compelling headings, and clear structure.'
        },
        human: {
          name: 'Human-like',
          transforms: ['remove_ai_patterns', 'add_variation', 'natural_transitions'],
          rewritePrompt: 'Rewrite to remove AI detection patterns. Use varied sentence structures, natural transitions, and conversational tone.'
        },
        affiliate: {
          name: 'Affiliate Friendly',
          transforms: ['add_cta', 'product_mentions', 'benefit_focus'],
          rewritePrompt: 'Rewrite with affiliate marketing focus: highlight benefits, include CTAs, and naturally integrate product mentions.'
        },
        technical: {
          name: 'Technical Documentation',
          transforms: ['precise_language', 'structured_format', 'clear_definitions'],
          rewritePrompt: 'Rewrite as technical documentation: precise language, clear definitions, structured format, and comprehensive details.'
        },
        casual: {
          name: 'Casual/Social',
          transforms: ['short_sentences', 'conversational', 'engaging'],
          rewritePrompt: 'Rewrite in casual, social-media friendly tone: short sentences, engaging language, and relatable examples.'
        }
      };

      const config = styleConfigs[style];
      if (!config) {
        return new Response(JSON.stringify({ error: 'Invalid style. Available: seo, human, affiliate, technical, casual' }), { status: 400 });
      }

      // Simulate AI rewriting with pattern-based transformation
      let rewritten = content;

      // Apply style-specific transformations
      if (style === 'human') {
        // Remove common AI patterns
        rewritten = rewritten.replace(/\b(It is important to note that|Note that|Additionally|Furthermore|Moreover|In conclusion)\b/gi, 'Also');
        rewritten = rewritten.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1'); // Simplify links
        // Add more variation
        rewritten = rewritten.replace(/(\b\w+\b), (\w{3,5}), (\b\w+\b)/g, '$1, $2 and $3');
      } else if (style === 'seo') {
        // Add SEO-oriented structure
        rewritten = rewritten.replace(/^# (.+)$/gm, '# $1 - Your Guide');
        if (!rewritten.includes('## ')) {
          rewritten = rewritten.replace(/^(.+)$/gm, (match) => {
            if (match.length > 30) return '## ' + match;
            return match;
          });
        }
      } else if (style === 'affiliate') {
        // Add affiliate-friendly elements
        rewritten = rewritten.replace(/\.$/gm, '. Check out our top picks below!');
        if (!rewritten.includes('[Buy Now]')) {
          rewritten += '\n\n**Our Top Picks:**\n- [Best Seller Product](#)\n- [Premium Choice](#)\n- [Budget Option](#)';
        }
      } else if (style === 'casual') {
        // Make it more casual
        rewritten = rewritten.replace(/\b(\w+) is\b/gi, "$1's");
        rewritten = rewritten.replace(/\bAdditionally\b/gi, 'Plus');
        rewritten = rewritten.replace(/\bHowever\b/gi, 'But');
        // Shorten some sentences
        rewritten = rewritten.replace(/(\b\w{10,})\b/gi, (match) => match.length > 15 ? match.split(',')[0] : match);
      }

      return new Response(JSON.stringify({
        original: content,
        rewritten,
        style,
        styleName: config.name,
        wordCount,
        changes: config.transforms,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Default: improvement suggestions
    if (focus === 'readability' || !focus) {
      // Check sentence length
      sentences.forEach((sentence, i) => {
        const wordCount = sentence.trim().split(/\s+/).length;
        if (wordCount > 25) {
          improvements.push(`Sentence ${i + 1} is too long (${wordCount} words). Consider breaking it into shorter sentences.`);
        }
      });

      // Check paragraph length
      paragraphs.forEach((para, i) => {
        const paraWords = para.split(/\s+/).length;
        if (paraWords > 150) {
          improvements.push(`Paragraph ${i + 1} is quite long. Consider splitting it for better readability.`);
        }
      });

      // Check for passive voice indicators
      if (content.includes('was created') || content.includes('was written') || content.includes('is being')) {
        improvements.push('Consider using more active voice for better engagement.');
      }
    }

    if (focus === 'seo' || !focus) {
      if (wordCount < 500) {
        improvements.push(`Content is ${wordCount} words. For SEO, aim for at least 1500-2000 words for comprehensive coverage.`);
      }
      if (wordCount < 800) {
        improvements.push('Consider expanding content with more detailed sections for better SEO performance.');
      }
    }

    if (focus === 'engagement' || !focus) {
      if (!content.includes('?') || !content.includes('!')) {
        improvements.push('Consider adding questions or exclamations to increase reader engagement.');
      }
      if (!content.includes('@') && !content.includes('#')) {
        suggestions.push('Consider asking a question or including a call-to-action to drive engagement.');
      }
    }

    if (focus === 'clarity' || !focus) {
      // Check for unclear pronoun references
      const pronounDensity = (content.match(/\b(it|they|this|that|these|those)\b/gi) || []).length;
      if (pronounDensity > wordCount * 0.05) {
        improvements.push('Consider replacing some pronouns with specific nouns for clearer writing.');
      }
    }

    return new Response(JSON.stringify({
      wordCount,
      sentenceCount: sentences.length,
      paragraphCount: paragraphs.length,
      improvements,
      suggestions,
      focus,
      availableStyles: ['seo', 'human', 'affiliate', 'technical', 'casual'],
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ========== AI CONFIG API ==========
  // GET /api/ai/config - Get AI configuration
  if (path === '/api/ai/config' && request.method === 'GET') {
    const config = await getAIConfig(env);
    // Don't expose API keys in response
    const safeConfig = {
      ...config,
      providers: config.providers.map(p => ({
        ...p,
        apiKey: p.apiKey ? '********' : undefined,
      })),
    };
    return new Response(JSON.stringify(safeConfig), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // PUT /api/ai/config - Update AI configuration
  if (path === '/api/ai/config' && request.method === 'PUT') {
    const authError = await requireAuth(request, env, 'settings:write');
    if (authError) return authError;

    const body = await request.json();
    const currentConfig = await getAIConfig(env);

    // Merge updates
    const updatedConfig: AIConfig = {
      ...currentConfig,
      ...body,
      providers: body.providers?.map((p: AIProvider) => {
        const existing = currentConfig.providers.find(ep => ep.id === p.id);
        return {
          ...existing,
          ...p,
          // Preserve API key if not provided
          apiKey: p.apiKey || existing?.apiKey,
        };
      }) || currentConfig.providers,
    };

    await env.AI_CONFIG.put('config', JSON.stringify(updatedConfig));

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // PUT /api/ai/config/provider/:id - Update specific provider
  if (path.match(/^\/api\/ai\/config\/provider\/([^/]+)$/) && request.method === 'PUT') {
    const authError = await requireAuth(request, env, 'settings:write');
    if (authError) return authError;

    const providerId = path.match(/^\/api\/ai\/config\/provider\/([^/]+)$/)?.[1];
    const body = await request.json();
    const currentConfig = await getAIConfig(env);

    const providerIndex = currentConfig.providers.findIndex(p => p.id === providerId);
    if (providerIndex === -1) {
      return new Response(JSON.stringify({ error: 'Provider not found' }), { status: 404 });
    }

    currentConfig.providers[providerIndex] = {
      ...currentConfig.providers[providerIndex],
      ...body,
    };

    await env.AI_CONFIG.put('config', JSON.stringify(currentConfig));

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // DELETE /api/ai/config/cache - Clear AI cache
  if (path === '/api/ai/config/cache' && request.method === 'DELETE') {
    const authError = await requireAuth(request, env, 'settings:write');
    if (authError) return authError;

    const keys = await env.SITE_SETTINGS.list({ prefix: 'ai_cache/' });
    for (const key of keys.keys) {
      await env.SITE_SETTINGS.delete(key.name);
    }

    return new Response(JSON.stringify({ success: true, cleared: keys.keys.length }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ========== MULTI-LANGUAGE GENERATION ==========
  // POST /api/ai/translate - Translate content
  if (path === '/api/ai/translate' && request.method === 'POST') {
    const authError = await requireAuth(request, env, 'ai:generate');
    if (authError) return authError;

    const body = await request.json();
    const { content, targetLanguage, sourceLanguage } = body;

    if (!content || !targetLanguage) {
      return new Response(JSON.stringify({ error: 'Content and targetLanguage required' }), { status: 400 });
    }

    const languageNames: Record<string, string> = {
      en: 'English',
      zh: 'Chinese',
      ja: 'Japanese',
      es: 'Spanish',
      fr: 'French',
      de: 'German',
      ko: 'Korean',
      pt: 'Portuguese',
      it: 'Italian',
      ru: 'Russian',
      ar: 'Arabic',
    };

    const langName = languageNames[targetLanguage] || targetLanguage;

    try {
      const translated = await callAI(env, {
        prompt: `Translate the following content to ${langName}. Keep the formatting and tone appropriate for the target language.\n\nOriginal content:\n${content}`,
        systemPrompt: `You are a professional translator. Translate accurately while maintaining the original tone, style, and formatting.`,
        maxTokens: 2048,
      });

      return new Response(JSON.stringify({
        original: content,
        translated,
        sourceLanguage: sourceLanguage || 'auto',
        targetLanguage,
        targetLanguageName: langName,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      return new Response(JSON.stringify({
        error: 'Translation failed',
        message: (error as Error).message,
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // POST /api/ai/multilingual - Generate content in multiple languages
  if (path === '/api/ai/multilingual' && request.method === 'POST') {
    const authError = await requireAuth(request, env, 'ai:generate');
    if (authError) return authError;

    const body = await request.json();
    const { topic, keywords, languages, type } = body;

    if (!topic || !languages || !Array.isArray(languages)) {
      return new Response(JSON.stringify({ error: 'Topic and languages array required' }), { status: 400 });
    }

    try {
      const results: Record<string, any> = {};

      for (const lang of languages.slice(0, 5)) { // Max 5 languages
        const langNames: Record<string, string> = {
          en: 'English', zh: 'Chinese', ja: 'Japanese',
          es: 'Spanish', fr: 'French', de: 'German',
        };
        const langName = langNames[lang] || lang;

        const generated = await callAI(env, {
          prompt: `Write a${type === 'title' ? 'n article title' : type === 'meta' ? ' meta description' : ' article outline'} about "${topic}"${keywords ? ` focusing on: ${keywords.join(', ')}` : ''}. Write in ${langName}.`,
          systemPrompt: `You are a professional content writer. Write in ${langName} naturally and accurately.`,
          maxTokens: 512,
        });

        results[lang] = {
          content: generated,
          language: lang,
          languageName: langName,
        };
      }

      return new Response(JSON.stringify({
        topic,
        keywords,
        results,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      return new Response(JSON.stringify({
        error: 'Multi-language generation failed',
        message: (error as Error).message,
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // ========== METADATA AUTO-GENERATION ==========
  // POST /api/ai/metadata - Auto-generate metadata for an article
  if (path === '/api/ai/metadata' && request.method === 'POST') {
    const authError = await requireAuth(request, env, 'ai:generate');
    if (authError) return authError;

    const body = await request.json();
    const { title, content, keywords, url } = body;

    if (!title && !content) {
      return new Response(JSON.stringify({ error: 'Title or content required' }), { status: 400 });
    }

    try {
      // Generate meta title
      const metaTitle = await callAI(env, {
        prompt: `Based on this content, generate an SEO-optimized meta title (50-60 characters):\n${title || content?.slice(0, 500)}`,
        systemPrompt: 'You are an SEO expert. Generate compelling meta titles that include primary keywords and are within 50-60 characters.',
        maxTokens: 100,
      });

      // Generate meta description
      const metaDescription = await callAI(env, {
        prompt: `Based on this content, generate an SEO-optimized meta description (120-160 characters):\n${title || content?.slice(0, 500)}`,
        systemPrompt: 'You are an SEO expert. Generate compelling meta descriptions that encourage clicks and are within 120-160 characters.',
        maxTokens: 200,
      });

      // Generate OG tags
      const ogTags = await callAI(env, {
        prompt: `Generate Open Graph tags for this content:\nTitle: ${title || 'Untitled'}\nContent: ${content?.slice(0, 300) || ''}`,
        systemPrompt: 'You are an SEO expert. Generate proper Open Graph meta tags in this exact format:\nog:title=[title]\nog:description=[description]\nog:image=[suggested image description]\ntwitter:card=[card type]',
        maxTokens: 200,
      });

      // Generate keywords
      const suggestedKeywords = await callAI(env, {
        prompt: `Extract or suggest 5-8 SEO keywords from this content:\n${title || ''}\n${content?.slice(0, 1000) || ''}`,
        systemPrompt: 'You are an SEO keyword research expert. Suggest relevant keywords separated by commas.',
        maxTokens: 100,
      });

      return new Response(JSON.stringify({
        metaTitle: metaTitle.trim(),
        metaDescription: metaDescription.trim(),
        ogTags: ogTags.trim(),
        keywords: suggestedKeywords.trim(),
        canonical: url || '',
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      return new Response(JSON.stringify({
        error: 'Metadata generation failed',
        message: (error as Error).message,
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // ========== INTERNAL LINKS RECOMMENDATION ==========
  // POST /api/ai/internal-links - Get internal link recommendations
  if (path === '/api/ai/internal-links' && request.method === 'POST') {
    const authError = await requireAuth(request, env, 'ai:analyze');
    if (authError) return authError;

    const body = await request.json();
    const { content, articleId, maxLinks } = body;

    if (!content) {
      return new Response(JSON.stringify({ error: 'Content required' }), { status: 400 });
    }

    try {
      // Get all articles for matching
      const articleIds = await getAllIds(env.ARTICLES, 'articles');
      const articles = await Promise.all(
        articleIds.slice(0, 50).map(async id => {
          const data = await env.ARTICLES.get(`articles/${id}`);
          const seo = await env.ARTICLES.get(`articles/${id}/seo`);
          return data ? { id, ...JSON.parse(data), seo: seo ? JSON.parse(seo) : {} } : null;
        })
      );
      const publishedArticles = articles.filter(a => a && a.status === 'published' && a.id !== articleId) as any[];

      // Extract key topics/keywords from current content
      const topicExtraction = await callAI(env, {
        prompt: `Extract 5-8 key topics, entities, or concepts from this content that could be linked to other articles:\n${content.slice(0, 2000)}`,
        systemPrompt: 'You are an SEO expert. List key topics that this article discusses and could link to related articles. Format as comma-separated keywords.',
        maxTokens: 150,
      });

      const topics = topicExtraction.split(',').map(t => t.trim().toLowerCase());

      // Match articles by title, keywords, category
      const recommendations = publishedArticles.map(article => {
        let score = 0;
        const reasons: string[] = [];

        // Title match
        const titleLower = (article.title || '').toLowerCase();
        for (const topic of topics) {
          if (titleLower.includes(topic)) {
            score += 3;
            reasons.push(`Matches topic: "${topic}"`);
          }
        }

        // Keyword match
        const articleKeywords = (article.seo?.focusKeyword || '').toLowerCase();
        for (const topic of topics) {
          if (articleKeywords.includes(topic)) {
            score += 2;
            reasons.push(`Keyword match: "${topic}"`);
          }
        }

        // Category match
        if (article.categoryId) {
          score += 1;
          reasons.push('Same category');
        }

        return {
          id: article.id,
          title: article.title,
          slug: article.slug,
          url: `/${article.categorySlug || 'article'}/${article.slug}`,
          score,
          reasons,
        };
      })
        .filter(a => a.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, maxLinks || 5);

      // Generate anchor text suggestions
      const anchorSuggestions = recommendations.map(rec => ({
        ...rec,
        suggestedAnchor: `Learn more about ${rec.title.split(' ')[0] || rec.title}`,
      }));

      return new Response(JSON.stringify({
        sourceTopics: topics,
        recommendations: anchorSuggestions,
        totalMatches: recommendations.length,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      return new Response(JSON.stringify({
        error: 'Internal link analysis failed',
        message: (error as Error).message,
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // ========== CONTENT VERSIONING ==========
  // GET /api/articles/:id/versions - Get version history
  if (path.match(/^\/api\/articles\/([^/]+)\/versions$/) && request.method === 'GET') {
    const authError = await requireAuth(request, env, 'articles:read');
    if (authError) return authError;

    const articleId = path.match(/^\/api\/articles\/([^/]+)\/versions$/)?.[1];
    const versionIds = await getAllIds(env.ARTICLES, `versions_${articleId}`);

    const versions = await Promise.all(
      versionIds.map(async id => {
        const data = await env.ARTICLES.get(`versions_${articleId}/${id}`);
        return data ? JSON.parse(data) : null;
      })
    );

    const validVersions = versions.filter(Boolean).sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return new Response(JSON.stringify({
      articleId,
      versions: validVersions.map(v => ({
        id: v.id,
        versionNumber: v.versionNumber,
        createdAt: v.createdAt,
        createdBy: v.createdBy,
        changeType: v.changeType,
        summary: v.summary,
      })),
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // POST /api/articles/:id/versions - Create new version
  if (path.match(/^\/api\/articles\/([^/]+)\/versions$/) && request.method === 'POST') {
    const authError = await requireAuth(request, env, 'articles:write');
    if (authError) return authError;

    const articleId = path.match(/^\/api\/articles\/([^/]+)\/versions$/)?.[1];
    const body = await request.json();
    const { content, changeType, summary } = body;

    // Get existing versions count
    const versionIds = await getAllIds(env.ARTICLES, `versions_${articleId}`);
    const versionNumber = versionIds.length + 1;

    const version = {
      id: crypto.getRandomValues(new Uint8Array(8)).reduce((s, b) => s + b.toString(16).padStart(2, '0'), ''),
      articleId,
      versionNumber,
      content: content || '',
      createdAt: new Date().toISOString(),
      createdBy: 'system',
      changeType: changeType || 'auto-save',
      summary: summary || `Version ${versionNumber}`,
    };

    await env.ARTICLES.put(`versions_${articleId}/${version.id}`, JSON.stringify(version));
    await env.ARTICLES.put(`versions_${articleId}/all_ids`, JSON.stringify([...versionIds, version.id]));

    return new Response(JSON.stringify({ success: true, version }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // GET /api/articles/:id/versions/:versionId - Get specific version
  if (path.match(/^\/api\/articles\/([^/]+)\/versions\/([^/]+)$/) && request.method === 'GET') {
    const authError = await requireAuth(request, env, 'articles:read');
    if (authError) return authError;

    const match = path.match(/^\/api\/articles\/([^/]+)\/versions\/([^/]+)$/);
    const articleId = match?.[1];
    const versionId = match?.[2];

    const data = await env.ARTICLES.get(`versions_${articleId}/${versionId}`);
    if (!data) {
      return new Response(JSON.stringify({ error: 'Version not found' }), { status: 404 });
    }

    return new Response(data, {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // POST /api/articles/:id/versions/:versionId/restore - Restore version
  if (path.match(/^\/api\/articles\/([^/]+)\/versions\/([^/]+)\/restore$/) && request.method === 'POST') {
    const authError = await requireAuth(request, env, 'articles:write');
    if (authError) return authError;

    const match = path.match(/^\/api\/articles\/([^/]+)\/versions\/([^/]+)\/restore$/);
    const articleId = match?.[1];
    const versionId = match?.[2];

    const versionData = await env.ARTICLES.get(`versions_${articleId}/${versionId}`);
    if (!versionData) {
      return new Response(JSON.stringify({ error: 'Version not found' }), { status: 404 });
    }

    const version = JSON.parse(versionData);

    // Get current article
    const currentData = await env.ARTICLES.get(`articles/${articleId}`);
    if (!currentData) {
      return new Response(JSON.stringify({ error: 'Article not found' }), { status: 404 });
    }

    // Create a backup version of current state
    const current = JSON.parse(currentData);
    const backupVersion = {
      id: crypto.getRandomValues(new Uint8Array(8)).reduce((s, b) => s + b.toString(16).padStart(2, '0'), ''),
      articleId,
      versionNumber: 'backup',
      content: current,
      createdAt: new Date().toISOString(),
      createdBy: 'system',
      changeType: 'pre-restore',
      summary: 'Backup before version restore',
    };
    const backupIds = await getAllIds(env.ARTICLES, `versions_${articleId}`);
    await env.ARTICLES.put(`versions_${articleId}/${backupVersion.id}`, JSON.stringify(backupVersion));
    await env.ARTICLES.put(`versions_${articleId}/all_ids`, JSON.stringify([...backupIds, backupVersion.id]));

    // Restore the version content
    if (version.content) {
      // Update article content
      await env.ARTICLES.put(`articles/${articleId}/content`, typeof version.content === 'string' ? version.content : JSON.stringify(version.content));
    }

    return new Response(JSON.stringify({
      success: true,
      restoredVersion: versionId,
      backupCreated: backupVersion.id,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ========== AUTH HELPER FUNCTIONS ==========
  // Authenticate request and return user info or error
  async function authenticate(request: Request, env: Env): Promise<{ userId?: string; username?: string; role?: string; error?: Response }> {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { error: new Response(JSON.stringify({ error: 'Unauthorized - No token' }), { status: 401, headers: { 'Content-Type': 'application/json' } }) };
    }

    const token = authHeader.slice(7);
    try {
      const payload = await verifyToken(token, env);
      return { userId: payload.userId, username: payload.username, role: payload.role };
    } catch {
      return { error: new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { 'Content-Type': 'application/json' } }) };
    }
  }

  // Check if role has permission for action
  function hasPermission(role: string, action: string): boolean {
    const permissions: Record<string, string[]> = {
      admin: ['*'],
      editor: ['articles:read', 'articles:write', 'articles:publish', 'categories:read', 'categories:write', 'pages:read', 'pages:write', 'affiliates:read', 'affiliates:write', 'media:read', 'media:write', 'users:read'],
      author: ['articles:read', 'articles:write', 'categories:read', 'pages:read', 'affiliates:read'],
    };
    // Add extended permissions for admin role
    if (role === 'admin') {
      permissions.admin = ['*', 'backup:write', 'settings:write', 'security:write', 'users:write', 'logs:read', 'webhooks:write'];
    }
    const rolePerms = permissions[role] || [];
    return rolePerms.includes('*') || rolePerms.includes(action);
  }

  // Auth middleware for mutation operations (POST, PUT, DELETE)
  // Returns error Response if not authenticated, null if OK
  async function requireAuth(request: Request, env: Env, requiredAction?: string): Promise<Response | null> {
    const auth = await authenticate(request, env);
    if (auth.error) {
      return auth.error;
    }
    if (requiredAction && !hasPermission(auth.role!, requiredAction)) {
      return new Response(JSON.stringify({ error: 'Forbidden - insufficient permissions' }), { 
        status: 403, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }
    return null;
  }

  // ========== USERS / RBAC API ==========
  // Get all users - requires auth
  if (path === '/api/users' && request.method === 'GET') {
    const auth = await authenticate(request, env);
    if (auth.error) return auth.error;

    const ids = await getAllIds(env.SITE_SETTINGS, 'users');
    const users = await Promise.all(
      ids.map(async id => {
        const data = await env.SITE_SETTINGS.get(`users/${id}`);
        if (!data) return null;
        const user = JSON.parse(data);
        delete user.passwordHash; // Don't expose passwords
        return user;
      })
    );
    return new Response(JSON.stringify(users.filter(Boolean)), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Create user - requires admin auth
  if (path === '/api/users' && request.method === 'POST') {
    const auth = await authenticate(request, env);
    if (auth.error) return auth.error;
    if (!hasPermission(auth.role!, 'users:write')) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }

    const body = await request.json();
    const { username, password, role, email } = body;

    if (!username || !password) {
      return new Response(JSON.stringify({ error: 'Username and password required' }), { status: 400 });
    }

    // Check if username exists
    const ids = await getAllIds(env.SITE_SETTINGS, 'users');
    for (const id of ids) {
      const data = await env.SITE_SETTINGS.get(`users/${id}`);
      if (data) {
        const existing = JSON.parse(data);
        if (existing.username === username) {
          return new Response(JSON.stringify({ error: 'Username already exists' }), { status: 409 });
        }
      }
    }

    const id = crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "");
    // Simple password hash (in production, use proper hashing like bcrypt)
    const passwordHash = await hashPassword(password);
    const user = {
      id,
      username,
      passwordHash,
      email: email || '',
      role: role || 'editor', // admin, editor, author
      createdAt: new Date().toISOString(),
      lastLoginAt: null,
    };

    await env.SITE_SETTINGS.put(`users/${id}`, JSON.stringify(user));
    await addId(env.SITE_SETTINGS, 'users', id);

    const { passwordHash: _, ...safeUser } = user;
    return new Response(JSON.stringify(safeUser), { status: 201 });
  }

  // Single user operations - requires auth
  const userMatch = path.match(/^\/api\/users\/([^/]+)$/);
  if (userMatch) {
    const auth = await authenticate(request, env);
    if (auth.error) return auth.error;

    const id = userMatch[1];

    if (request.method === 'GET') {
      const data = await env.SITE_SETTINGS.get(`users/${id}`);
      if (!data) {
        return new Response(JSON.stringify({ error: 'User not found' }), { status: 404 });
      }
      const user = JSON.parse(data);
      delete user.passwordHash;
      return new Response(JSON.stringify(user), { headers: { 'Content-Type': 'application/json' } });
    }

    if (request.method === 'PUT') {
      if (!hasPermission(auth.role!, 'users:write')) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
      }
      const body = await request.json();
      const existing = await env.SITE_SETTINGS.get(`users/${id}`);
      if (!existing) {
        return new Response(JSON.stringify({ error: 'User not found' }), { status: 404 });
      }

      const user = JSON.parse(existing);
      if (body.username) user.username = body.username;
      if (body.email) user.email = body.email;
      if (body.role) user.role = body.role;
      if (body.password) {
        user.passwordHash = await hashPassword(body.password);
      }
      await env.SITE_SETTINGS.put(`users/${id}`, JSON.stringify(user));
      delete user.passwordHash;
      return new Response(JSON.stringify(user), { headers: { 'Content-Type': 'application/json' } });
    }

    if (request.method === 'DELETE') {
      await env.SITE_SETTINGS.delete(`users/${id}`);
      const ids = await getAllIds(env.SITE_SETTINGS, 'users');
      const newIds = ids.filter(i => i !== id);
      await env.SITE_SETTINGS.put('users/all_ids', JSON.stringify(newIds));
      return new Response(JSON.stringify({ success: true }));
    }
  }

  // User login
  if (path === '/api/auth/login' && request.method === 'POST') {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return new Response(JSON.stringify({ error: 'Username and password required' }), { status: 400 });
    }

    const ids = await getAllIds(env.SITE_SETTINGS, 'users');

    // Create default admin user if no users exist - requires SETUP_SECRET env var
    if (ids.length === 0 && username === 'admin') {
      const setupSecret = (env as any).SETUP_SECRET;
      if (!setupSecret || password !== setupSecret) {
        return new Response(JSON.stringify({ error: 'Setup not allowed - SETUP_SECRET not configured or invalid password' }), { status: 403 });
      }
      const id = crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "");
      const passwordHash = await hashPassword(password);
      const user = {
        id,
        username: 'admin',
        passwordHash,
        email: 'admin@example.com',
        role: 'admin',
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      };
      await env.SITE_SETTINGS.put(`users/${id}`, JSON.stringify(user));
      await addId(env.SITE_SETTINGS, 'users', id);
      const token = await generateToken(user, env);
      delete user.passwordHash;
      return new Response(JSON.stringify({ user, token }), { headers: { 'Content-Type': 'application/json' } });
    }

    for (const id of ids) {
      const data = await env.SITE_SETTINGS.get(`users/${id}`);
      if (!data) continue;
      const user = JSON.parse(data);
      if (user.username === username) {
        // Verify password
        const valid = await verifyPassword(password, user.passwordHash, env);
        if (!valid) {
          return new Response(JSON.stringify({ error: 'Invalid password' }), { status: 401 });
        }
        // Update last login
        user.lastLoginAt = new Date().toISOString();
        await env.SITE_SETTINGS.put(`users/${id}`, JSON.stringify(user));

        // Return safe user data + token
        delete user.passwordHash;
        let token;
        try {
          token = await generateToken(user, env);
        } catch (tokenErr) {
          return new Response(JSON.stringify({ 
            error: 'Token generation failed', 
            details: tokenErr instanceof Error ? tokenErr.message : 'Unknown error' 
          }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ user, token }), { headers: { 'Content-Type': 'application/json' } });
      }
    }
    return new Response(JSON.stringify({ error: 'User not found' }), { status: 404 });
  }

  // Verify token
  if (path === '/api/auth/verify' && request.method === 'POST') {
    const body = await request.json();
    const { token } = body;

    if (!token) {
      return new Response(JSON.stringify({ error: 'Token required' }), { status: 400 });
    }

    try {
      const payload = await verifyToken(token, env);
      const userData = await env.SITE_SETTINGS.get(`users/${payload.userId}`);
      if (!userData) {
        return new Response(JSON.stringify({ valid: false }), { headers: { 'Content-Type': 'application/json' } });
      }
      const user = JSON.parse(userData);
      delete user.passwordHash;
      return new Response(JSON.stringify({ valid: true, user }), { headers: { 'Content-Type': 'application/json' } });
    } catch {
      return new Response(JSON.stringify({ valid: false }), { headers: { 'Content-Type': 'application/json' } });
    }
  }

  // ========== COMMENTS API ==========
  // Get comments for an article (GET /api/comments?articleId=xxx)
  if (path === '/api/comments' && request.method === 'GET') {
    const articleId = url.searchParams.get('articleId');
    const status = url.searchParams.get('status') || 'approved'; // approved, pending, spam

    const ids = await getAllIds(env.COMMENTS, 'comments');
    let comments = await Promise.all(
      ids.map(async id => {
        const data = await env.COMMENTS.get(`comments/${id}`);
        return data ? JSON.parse(data) : null;
      })
    );
    comments = comments.filter(Boolean) as any[];

    // Filter by article if provided
    if (articleId) {
      comments = comments.filter(c => c.articleId === articleId);
    }

    // Filter by status
    if (status !== 'all') {
      comments = comments.filter(c => c.status === status);
    }

    // Sort by creation date (newest first)
    comments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return new Response(JSON.stringify(comments), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Create comment (POST /api/comments)
  if (path === '/api/comments' && request.method === 'POST') {
    const body = await request.json();
    const { articleId, authorName, authorEmail, content } = body;

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!articleId || !content || !authorName) {
      return new Response(JSON.stringify({ error: 'articleId, authorName, and content are required' }), { status: 400 });
    }

    // Basic spam protection: content length limits
    if (content.length > 5000) {
      return new Response(JSON.stringify({ error: 'Comment too long (max 5000 characters)' }), { status: 400 });
    }
    if (content.length < 3) {
      return new Response(JSON.stringify({ error: 'Comment too short (min 3 characters)' }), { status: 400 });
    }

    // Check for spam patterns (basic)
    const spamPatterns = [/https?:\/\/[^\s]+/gi, /(.)\1{5,}/];
    const isSpam = spamPatterns.some(p => p.test(content));
    
    // Rate limit per article: max 5 comments per minute
    const commentRateKey = `comment_rl:${articleId}:${ip}:${Math.floor(Date.now() / 60000)}`;
    const commentCount = await env.SITE_SETTINGS.get(commentRateKey);
    if (parseInt(commentCount || '0') >= 5) {
      return new Response(JSON.stringify({ error: 'Too many comments. Please wait a minute.' }), { status: 429 });
    }

    const id = crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "");
    const comment = {
      id,
      articleId,
      authorName: authorName.trim().slice(0, 100),
      authorEmail: authorEmail?.trim().slice(0, 100) || '',
      content: content.trim().slice(0, 5000),
      status: isSpam ? 'spam' : 'pending', // Spam detected = auto-mark as spam
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await env.SITE_SETTINGS.put(commentRateKey, String(parseInt(commentCount || '0') + 1), { expirationTtl: 60 });
    await setWithIds(env.COMMENTS, 'comments', id, comment);


    return new Response(JSON.stringify(comment), { status: 201 });
  }

  // Get single comment (GET /api/comments/:id)
  const commentMatch = path.match(/^\/api\/comments\/([^/]+)$/);
  if (commentMatch && request.method === 'GET') {
    const id = commentMatch[1];
    const data = await env.COMMENTS.get(`comments/${id}`);
    if (!data) {
      return new Response(JSON.stringify({ error: 'Comment not found' }), { status: 404 });
    }
    return new Response(data, { headers: { 'Content-Type': 'application/json' } });
  }

  // Update comment status (PUT /api/comments/:id)
  if (commentMatch && request.method === 'PUT') {
    const id = commentMatch[1];
    const body = await request.json();
    const existing = await env.COMMENTS.get(`comments/${id}`);
    if (!existing) {
      return new Response(JSON.stringify({ error: 'Comment not found' }), { status: 404 });
    }

    const comment = JSON.parse(existing);
    if (body.status) comment.status = body.status;
    if (body.content) comment.content = body.content;
    comment.updatedAt = new Date().toISOString();

    await env.COMMENTS.put(`comments/${id}`, JSON.stringify(comment));

    return new Response(JSON.stringify(comment), { headers: { 'Content-Type': 'application/json' } });
  }

  // Delete comment (DELETE /api/comments/:id)
  if (commentMatch && request.method === 'DELETE') {
    const id = commentMatch[1];
    await env.COMMENTS.delete(`comments/${id}`);
    const ids = await getAllIds(env.COMMENTS, 'comments');
    const newIds = ids.filter(i => i !== id);
    await env.COMMENTS.put('comments/all_ids', JSON.stringify(newIds));
    return new Response(JSON.stringify({ success: true }));
  }

  // Moderate comments (bulk update) (POST /api/comments/moderate)
  if (path === '/api/comments/moderate' && request.method === 'POST') {
    const body = await request.json();
    const { commentIds, action } = body;

    if (!commentIds || !Array.isArray(commentIds) || !action) {
      return new Response(JSON.stringify({ error: 'commentIds array and action required' }), { status: 400 });
    }

    const allowedActions = ['approve', 'spam', 'delete'];
    if (!allowedActions.includes(action)) {
      return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400 });
    }

    const newStatus = action === 'approve' ? 'approved' : action === 'spam' ? 'spam' : 'deleted';

    for (const id of commentIds) {
      const existing = await env.COMMENTS.get(`comments/${id}`);
      if (existing) {
        const comment = JSON.parse(existing);
        comment.status = newStatus;
        comment.updatedAt = new Date().toISOString();
        await env.COMMENTS.put(`comments/${id}`, JSON.stringify(comment));
      }
    }

    return new Response(JSON.stringify({ success: true, updated: commentIds.length }));
  }

  // Get comment count for article (GET /api/comments/count/:articleId)
  const countMatch = path.match(/^\/api\/comments\/count\/([^/]+)$/);
  if (countMatch && request.method === 'GET') {
    const articleId = countMatch[1];
    const ids = await getAllIds(env.COMMENTS, 'comments');
    const comments = await Promise.all(
      ids.map(async id => {
        const data = await env.COMMENTS.get(`comments/${id}`);
        return data ? JSON.parse(data) : null;
      })
    );

    const validComments = comments.filter(Boolean) as any[];
    const approvedCount = validComments.filter(c => c.articleId === articleId && c.status === 'approved').length;
    const pendingCount = validComments.filter(c => c.articleId === articleId && c.status === 'pending').length;

    return new Response(JSON.stringify({ approved: approvedCount, pending: pendingCount }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ========== SITEMAP & SEO APIs ==========

  // GET /api/sitemap.xml - Auto-generate sitemap
  if ((path === '/sitemap.xml' || path === '/api/sitemap') && request.method === 'GET') {
    try {
      // Fetch all published articles
      const articleIds = await getAllIds(env.ARTICLES, 'articles');
      const articles = await Promise.all(
        articleIds.map(async id => {
          const data = await env.ARTICLES.get(`articles/${id}`);
          return data ? JSON.parse(data) : null;
        })
      );
      const publishedArticles = articles.filter(a => a && a.status === 'published') as any[];

      // Fetch all categories
      const catIds = await getAllIds(env.CATEGORIES, 'categories');
      const categories = await Promise.all(
        catIds.map(async id => {
          const data = await env.CATEGORIES.get(`categories/${id}`);
          return data ? JSON.parse(data) : null;
        })
      );
      const activeCategories = categories.filter(c => c && c.status !== 'inactive') as any[];

      // Build sitemap XML
      const baseUrl = 'https://adult-toy-review.pages.dev';
      let sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n';
      sitemap += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

      // Homepage
      sitemap += '  <url>\n';
      sitemap += `    <loc>${baseUrl}/</loc>\n`;
      sitemap += '    <changefreq>daily</changefreq>\n';
      sitemap += '    <priority>1.0</priority>\n';
      sitemap += '  </url>\n';

      // Static pages
      const staticPages = ['about', 'contact', 'privacy', 'terms', 'disclosure'];
      for (const page of staticPages) {
        sitemap += '  <url>\n';
        sitemap += `    <loc>${baseUrl}/${page}</loc>\n`;
        sitemap += '    <changefreq>monthly</changefreq>\n';
        sitemap += '    <priority>0.5</priority>\n';
        sitemap += '  </url>\n';
      }

      // Categories
      for (const cat of activeCategories) {
        sitemap += '  <url>\n';
        sitemap += `    <loc>${baseUrl}/${cat.slug}</loc>\n`;
        sitemap += '    <changefreq>weekly</changefreq>\n';
        sitemap += '    <priority>0.8</priority>\n';
        sitemap += '  </url>\n';
      }

      // Articles
      for (const article of publishedArticles) {
        sitemap += '  <url>\n';
        sitemap += `    <loc>${baseUrl}/article/${article.slug}</loc>\n`;
        sitemap += `    <lastmod>${new Date(article.updatedAt).toISOString().split('T')[0]}</lastmod>\n`;
        sitemap += '    <changefreq>weekly</changefreq>\n';
        sitemap += '    <priority>0.6</priority>\n';
        sitemap += '  </url>\n';
      }

      sitemap += '</urlset>';

      return new Response(sitemap, {
        headers: { 'Content-Type': 'application/xml; charset=utf-8' },
      });
    } catch (error) {
      return new Response('Error generating sitemap', { status: 500 });
    }
  }

  // GET /api/robots.txt - Get robots.txt content
  if (path === '/robots.txt' || path === '/api/robots') {
    if (request.method === 'GET') {
      const robotsConfig = await env.SITE_SETTINGS.get('robots_config');
      const config = robotsConfig ? JSON.parse(robotsConfig) : {
        allow: ['/'],
        disallow: ['/admin/', '/api/'],
        sitemap: 'https://adult-toy-review.pages.dev/sitemap.xml'
      };

      let robots = `# CloudCMS Auto-Generated Robots.txt\n`;
      robots += `User-agent: *\n`;

      for (const disallow of config.disallow || ['/admin/', '/api/']) {
        robots += `Disallow: ${disallow}\n`;
      }
      for (const allow of config.allow || ['/']) {
        robots += `Allow: ${allow}\n`;
      }
      robots += `\nSitemap: ${config.sitemap || 'https://adult-toy-review.pages.dev/sitemap.xml'}\n`;

      return new Response(robots, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  }

  // PUT /api/settings/robots - Update robots.txt config
  if (path === '/api/settings/robots' && request.method === 'PUT') {
    const body = await request.json();
    await env.SITE_SETTINGS.put('robots_config', JSON.stringify(body));
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // GET /api/sitemap/rss - Generate RSS feed
  if (path === '/api/sitemap/rss' && request.method === 'GET') {
    try {
      const articleIds = await getAllIds(env.ARTICLES, 'articles');
      const articles = await Promise.all(
        articleIds.map(async id => {
          const data = await env.ARTICLES.get(`articles/${id}`);
          return data ? JSON.parse(data) : null;
        })
      );
      const publishedArticles = articles.filter(a => a && a.status === 'published' && a.publishedAt) as any[];
      publishedArticles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

      const baseUrl = 'https://adult-toy-review.pages.dev';
      let rss = `<?xml version="1.0" encoding="UTF-8"?>\n`;
      rss += `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n`;
      rss += `  <channel>\n`;
      rss += `    <title>AdultToyReview</title>\n`;
      rss += `    <link>${baseUrl}</link>\n`;
      rss += `    <description>Honest, in-depth reviews of adult toys</description>\n`;
      rss += `    <language>en-us</language>\n`;
      rss += `    <atom:link href="${baseUrl}/api/sitemap/rss" rel="self" type="application/rss+xml"/>\n`;

      for (const article of publishedArticles.slice(0, 50)) {
        rss += `    <item>\n`;
        rss += `      <title><![CDATA[${article.title}]]></title>\n`;
        rss += `      <link>${baseUrl}/${article.categorySlug || 'article'}/${article.slug}</link>\n`;
        rss += `      <guid isPermaLink="true">${baseUrl}/${article.categorySlug || 'article'}/${article.slug}</guid>\n`;
        rss += `      <pubDate>${new Date(article.publishedAt).toUTCString()}</pubDate>\n`;
        if (article.excerpt) {
          rss += `      <description><![CDATA[${article.excerpt}]]></description>\n`;
        }
        rss += `    </item>\n`;
      }

      rss += `  </channel>\n`;
      rss += `</rss>`;

      return new Response(rss, {
        headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
      });
    } catch (error) {
      return new Response('Error generating RSS feed', { status: 500 });
    }
  }

  // GET /api/sitemap/images - Generate image sitemap
  if (path === '/api/sitemap/images' && request.method === 'GET') {
    try {
      const articleIds = await getAllIds(env.ARTICLES, 'articles');
      const articles = await Promise.all(
        articleIds.map(async id => {
          const data = await env.ARTICLES.get(`articles/${id}`);
          return data ? JSON.parse(data) : null;
        })
      );
      const publishedArticles = articles.filter(a => a && a.status === 'published') as any[];

      const baseUrl = 'https://adult-toy-review.pages.dev';
      let sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n';
      sitemap += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n';
      sitemap += '  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n';

      for (const article of publishedArticles) {
        sitemap += '  <url>\n';
        sitemap += `    <loc>${baseUrl}/${article.categorySlug || 'article'}/${article.slug}</loc>\n`;
        if (article.featuredImage) {
          sitemap += `    <image:image>\n`;
          sitemap += `      <image:loc>${article.featuredImage}</image:loc>\n`;
          sitemap += `    </image:image>\n`;
        }
        // Check for images in content
        if (article.content) {
          const imgMatches = article.content.match(/!\[.*?\]\((.*?)\)/g) || [];
          for (const img of imgMatches.slice(0, 5)) {
            const match = img.match(/!\[.*?\]\((.*?)\)/);
            if (match && match[1]) {
              sitemap += `    <image:image>\n`;
              sitemap += `      <image:loc>${match[1]}</image:loc>\n`;
              sitemap += `    </image:image>\n`;
            }
          }
        }
        sitemap += '  </url>\n';
      }

      sitemap += '</urlset>';

      return new Response(sitemap, {
        headers: { 'Content-Type': 'application/xml; charset=utf-8' },
      });
    } catch (error) {
      return new Response('Error generating image sitemap', { status: 500 });
    }
  }

  // GET /api/sitemap/generate - Force regenerate sitemap
  if (path === '/api/sitemap/generate' && request.method === 'POST') {
    try {
      // Get all data
      const articleIds = await getAllIds(env.ARTICLES, 'articles');
      const articles = await Promise.all(
        articleIds.map(async id => {
          const data = await env.ARTICLES.get(`articles/${id}`);
          return data ? JSON.parse(data) : null;
        })
      );
      const publishedArticles = articles.filter(a => a && a.status === 'published') as any[];

      const catIds = await getAllIds(env.CATEGORIES, 'categories');
      const categories = await Promise.all(
        catIds.map(async id => {
          const data = await env.CATEGORIES.get(`categories/${id}`);
          return data ? JSON.parse(data) : null;
        })
      );
      const activeCategories = categories.filter(c => c && c.status !== 'inactive') as any[];

      // Build main sitemap
      const baseUrl = 'https://adult-toy-review.pages.dev';
      let sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n';
      sitemap += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

      sitemap += '  <url>\n';
      sitemap += `    <loc>${baseUrl}/</loc>\n`;
      sitemap += '    <changefreq>daily</changefreq>\n';
      sitemap += '    <priority>1.0</priority>\n';
      sitemap += '  </url>\n';

      const staticPages = ['about', 'contact', 'privacy', 'terms', 'disclosure'];
      for (const page of staticPages) {
        sitemap += '  <url>\n';
        sitemap += `    <loc>${baseUrl}/${page}</loc>\n`;
        sitemap += '    <changefreq>monthly</changefreq>\n';
        sitemap += '    <priority>0.5</priority>\n';
        sitemap += '  </url>\n';
      }

      for (const cat of activeCategories) {
        sitemap += '  <url>\n';
        sitemap += `    <loc>${baseUrl}/${cat.slug}</loc>\n`;
        sitemap += '    <changefreq>weekly</changefreq>\n';
        sitemap += '    <priority>0.8</priority>\n';
        sitemap += '  </url>\n';
      }

      for (const article of publishedArticles) {
        sitemap += '  <url>\n';
        sitemap += `    <loc>${baseUrl}/${article.categorySlug || 'article'}/${article.slug}</loc>\n`;
        sitemap += `    <lastmod>${new Date(article.updatedAt).toISOString().split('T')[0]}</lastmod>\n`;
        sitemap += '    <changefreq>weekly</changefreq>\n';
        sitemap += '    <priority>0.6</priority>\n';
        sitemap += '  </url>\n';
      }

      sitemap += '</urlset>';

      // Store in KV for caching
      await env.SITE_SETTINGS.put('sitemap_cache', sitemap);
      await env.SITE_SETTINGS.put('sitemap_cache_time', new Date().toISOString());

      return new Response(JSON.stringify({
        success: true,
        articleCount: publishedArticles.length,
        categoryCount: activeCategories.length,
        cachedAt: new Date().toISOString()
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Failed to generate sitemap', message: (error as Error).message }), { status: 500 });
    }
  }

  // GET /api/sitemap/status - Get sitemap status
  if (path === '/api/sitemap/status' && request.method === 'GET') {
    const cached = await env.SITE_SETTINGS.get('sitemap_cache');
    const cachedTime = await env.SITE_SETTINGS.get('sitemap_cache_time');

    if (!cached) {
      return new Response(JSON.stringify({
        status: 'not_generated',
        message: 'Sitemap has not been generated yet'
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      status: 'generated',
      cachedAt: cachedTime,
      size: cached.length
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ========== REDIRECTS API ==========

  // GET /api/redirects - List all redirects
  if (path === '/api/redirects' && request.method === 'GET') {
    const redirectIds = await getAllIds(env.SITE_SETTINGS, 'redirects');
    const redirects = await Promise.all(
      redirectIds.map(async id => {
        const data = await env.SITE_SETTINGS.get(`redirects/${id}`);
        return data ? JSON.parse(data) : null;
      })
    );
    const validRedirects = redirects.filter(Boolean);
    return new Response(JSON.stringify(validRedirects), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // POST /api/redirects - Create redirect
  if (path === '/api/redirects' && request.method === 'POST') {
    const body = await request.json();
    const { from, to, type = 301 } = body;

    if (!from || !to) {
      return new Response(JSON.stringify({ error: 'from and to are required' }), { status: 400 });
    }

    const id = crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "");
    const redirect = { id, from, to, type: parseInt(type), createdAt: new Date().toISOString() };
    await env.SITE_SETTINGS.put(`redirects/${id}`, JSON.stringify(redirect));
    await addId(env.SITE_SETTINGS, 'redirects', id);

    return new Response(JSON.stringify(redirect), { status: 201 });
  }

  // PUT /api/redirects/:id - Update redirect
  const redirectMatch = path.match(/^\/api\/redirects\/([^/]+)$/);
  if (redirectMatch && request.method === 'PUT') {
    const id = redirectMatch[1];
    const existing = await env.SITE_SETTINGS.get(`redirects/${id}`);
    if (!existing) {
      return new Response(JSON.stringify({ error: 'Redirect not found' }), { status: 404 });
    }

    const body = await request.json();
    const redirect = JSON.parse(existing);
    if (body.from) redirect.from = body.from;
    if (body.to) redirect.to = body.to;
    if (body.type) redirect.type = parseInt(body.type);

    await env.SITE_SETTINGS.put(`redirects/${id}`, JSON.stringify(redirect));
    return new Response(JSON.stringify(redirect), { headers: { 'Content-Type': 'application/json' } });
  }

  // DELETE /api/redirects/:id - Delete redirect
  if (redirectMatch && request.method === 'DELETE') {
    const id = redirectMatch[1];
    await env.SITE_SETTINGS.delete(`redirects/${id}`);
    const redirectIds = await getAllIds(env.SITE_SETTINGS, 'redirects');
    const newIds = redirectIds.filter(i => i !== id);
    await env.SITE_SETTINGS.put('redirects/all_ids', JSON.stringify(newIds));

    return new Response(JSON.stringify({ success: true }));
  }

  // Check for matching redirect (internal use)
  const redirectIds = await getAllIds(env.SITE_SETTINGS, 'redirects');
  for (const id of redirectIds) {
    const data = await env.SITE_SETTINGS.get(`redirects/${id}`);
    if (data) {
      const redirect = JSON.parse(data);
      if (redirect.from && url.pathname.startsWith(redirect.from)) {
        return new Response(null, {
          status: redirect.type || 301,
          headers: { 'Location': redirect.to + url.pathname.slice(redirect.from.length) }
        });
      }
    }
  }

  // ========== OPERATION LOGS API ==========

  // GET /api/logs - Get operation logs
  if (path === '/api/logs' && request.method === 'GET') {
    const logIds = await getAllIds(env.SITE_SETTINGS, 'logs');
    const logs = await Promise.all(
      logIds.map(async id => {
        const data = await env.SITE_SETTINGS.get(`logs/${id}`);
        return data ? JSON.parse(data) : null;
      })
    );
    const validLogs = logs.filter(Boolean).sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // Support filtering
    const userFilter = url.searchParams.get('user');
    const actionFilter = url.searchParams.get('action');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    let filteredLogs = validLogs;
    if (userFilter) {
      filteredLogs = filteredLogs.filter(l => l.userId === userFilter);
    }
    if (actionFilter) {
      filteredLogs = filteredLogs.filter(l => l.action === actionFilter);
    }
    if (from) {
      filteredLogs = filteredLogs.filter(l => new Date(l.createdAt) >= new Date(from));
    }
    if (to) {
      filteredLogs = filteredLogs.filter(l => new Date(l.createdAt) <= new Date(to));
    }

    // Pagination
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const start = (page - 1) * limit;
    const paginatedLogs = filteredLogs.slice(start, start + limit);

    return new Response(JSON.stringify({
      logs: paginatedLogs,
      total: filteredLogs.length,
      page,
      limit,
      totalPages: Math.ceil(filteredLogs.length / limit)
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Helper function to add operation log
  async function addLog(env: Env, userId: string, action: string, targetType: string, targetId: string, details: object = {}) {
    const log = {
      id: crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), ""),
      userId,
      action,
      targetType,
      targetId,
      details,
      ip: 'unknown',
      userAgent: 'Cloudflare Worker',
      createdAt: new Date().toISOString()
    };
    await env.SITE_SETTINGS.put(`logs/${log.id}`, JSON.stringify(log));
    await addId(env.SITE_SETTINGS, 'logs', log.id);
    return log;
  }

  // ========== SITE STATS API ==========

  // GET /api/stats/overview - Get site statistics
  if (path === '/api/stats/overview' && request.method === 'GET') {
    // Count articles
    const articleIds = await getAllIds(env.ARTICLES, 'articles');
    const articles = await Promise.all(
      articleIds.map(async id => {
        const data = await env.ARTICLES.get(`articles/${id}`);
        return data ? JSON.parse(data) : null;
      })
    );
    const validArticles = articles.filter(Boolean);
    const publishedArticles = validArticles.filter((a: any) => a.status === 'published');
    const draftArticles = validArticles.filter((a: any) => a.status === 'draft');

    // Count categories
    const catIds = await getAllIds(env.CATEGORIES, 'categories');
    const categories = await Promise.all(
      catIds.map(async id => {
        const data = await env.CATEGORIES.get(`categories/${id}`);
        return data ? JSON.parse(data) : null;
      })
    );
    const activeCategories = categories.filter(Boolean);

    // Count affiliates
    const affIds = await getAllIds(env.AFFILIATES, 'affiliates');
    const affiliates = await Promise.all(
      affIds.map(async id => {
        const data = await env.AFFILIATES.get(`affiliates/${id}`);
        return data ? JSON.parse(data) : null;
      })
    );
    const activeAffiliates = affiliates.filter((a: any) => a && a.status === 'active');

    // Count comments
    const commentIds = await getAllIds(env.COMMENTS, 'comments');
    const comments = await Promise.all(
      commentIds.map(async id => {
        const data = await env.COMMENTS.get(`comments/${id}`);
        return data ? JSON.parse(data) : null;
      })
    );
    const validComments = comments.filter(Boolean);
    const approvedComments = validComments.filter((c: any) => c && c.status === 'approved');

    const stats = {
      totalArticles: validArticles.length,
      publishedArticles: publishedArticles.length,
      draftArticles: draftArticles.length,
      totalCategories: activeCategories.length,
      totalAffiliates: activeAffiliates.length,
      totalComments: validComments.length,
      approvedComments: approvedComments.length,
      timestamp: new Date().toISOString()
    };

    return new Response(JSON.stringify(stats), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ========== ARTICLE VERSIONS API ==========

  // GET /api/articles/:id/versions - Get version history
  const articleVersionsMatch = path.match(/^\/api\/articles\/([^/]+)\/versions$/);
  if (articleVersionsMatch && request.method === 'GET') {
    const articleId = articleVersionsMatch[1];
    const versionIds = await getAllIds(env.ARTICLES, `article_versions`);
    const versions = await Promise.all(
      versionIds.map(async vid => {
        const data = await env.ARTICLES.get(`article_versions/${vid}`);
        return data ? JSON.parse(data) : null;
      })
    );
    // Filter versions for this article
    const articleVersions = versions.filter(v => v && v.articleId === articleId);

    return new Response(JSON.stringify(articleVersions.reverse()), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // POST /api/articles/:id/versions - Create version snapshot
  if (articleVersionsMatch && request.method === 'POST') {
    const articleId = articleVersionsMatch[1];
    const articleData = await env.ARTICLES.get(`articles/${articleId}`);
    if (!articleData) {
      return new Response(JSON.stringify({ error: 'Article not found' }), { status: 404 });
    }

    const article = JSON.parse(articleData);
    const contentData = await env.ARTICLES.get(`articles/${articleId}/content`);
    const seoData = await env.ARTICLES.get(`articles/${articleId}/seo`);

    const version = {
      id: crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), ""),
      articleId,
      title: article.title,
      content: contentData || '',
      seo: seoData ? JSON.parse(seoData) : {},
      createdAt: new Date().toISOString(),
      snapshotOf: article.updatedAt
    };

    await env.ARTICLES.put(`article_versions/${version.id}`, JSON.stringify(version));
    await addId(env.ARTICLES, 'article_versions', version.id);

    return new Response(JSON.stringify(version), { status: 201 });
  }

  // POST /api/articles/:id/rollback/:versionId - Rollback to version
  const rollbackMatch = path.match(/^\/api\/articles\/([^/]+)\/rollback\/([^/]+)$/);
  if (rollbackMatch && request.method === 'POST') {
    const articleId = rollbackMatch[1];
    const versionId = rollbackMatch[2];

    const versionData = await env.ARTICLES.get(`article_versions/${versionId}`);
    if (!versionData) {
      return new Response(JSON.stringify({ error: 'Version not found' }), { status: 404 });
    }

    const version = JSON.parse(versionData);

    // Update article with version data
    const articleData = await env.ARTICLES.get(`articles/${articleId}`);
    if (articleData) {
      const article = JSON.parse(articleData);
      article.title = version.title;
      article.updatedAt = new Date().toISOString();
      await env.ARTICLES.put(`articles/${articleId}`, JSON.stringify(article));
    }

    // Update content
    if (version.content) {
      await env.ARTICLES.put(`articles/${articleId}/content`, version.content);
    }

    // Update SEO
    if (version.seo) {
      await env.ARTICLES.put(`articles/${articleId}/seo`, JSON.stringify(version.seo));
    }

    return new Response(JSON.stringify({ success: true, rolledBackTo: versionId }));
  }

  // ========== BACKUP API ==========

  // GET /api/backup/status - Check backup status (requires auth)
  if (path === '/api/backup/status' && request.method === 'GET') {
    const auth = await authenticate(request, env);
    if (auth.error) return auth.error;

    const backupStatus = await env.SITE_SETTINGS.get('backup_status');
    if (backupStatus) {
      return new Response(backupStatus, { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      lastBackup: null,
      status: 'never',
      nextBackup: null
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  // POST /api/backup/create - Create manual backup (requires admin auth)
  if (path === '/api/backup/create' && request.method === 'POST') {
    const auth = await authenticate(request, env);
    if (auth.error) return auth.error;
    if (!hasPermission(auth.role!, 'backup:write')) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }

    const backupData: any = {
      createdAt: new Date().toISOString(),
      articles: {},
      categories: {},
      affiliates: {},
      navigation: {},
      pages: {},
      comments: {},
      settings: {}
    };

    const articleIds = await getAllIds(env.ARTICLES, 'articles');
    for (const id of articleIds) {
      const data = await env.ARTICLES.get(`articles/${id}`);
      if (data) backupData.articles[id] = data;
      const content = await env.ARTICLES.get(`articles/${id}/content`);
      if (content) backupData.articles[`${id}/content`] = content;
    }

    const catIds = await getAllIds(env.CATEGORIES, 'categories');
    for (const id of catIds) {
      const data = await env.CATEGORIES.get(`categories/${id}`);
      if (data) backupData.categories[id] = data;
    }

    const affIds = await getAllIds(env.AFFILIATES, 'affiliates');
    for (const id of affIds) {
      const data = await env.AFFILIATES.get(`affiliates/${id}`);
      if (data) backupData.affiliates[id] = data;
    }

    const navIds = await getAllIds(env.NAVIGATION, 'navigation');
    for (const id of navIds) {
      const data = await env.NAVIGATION.get(`navigation/${id}`);
      if (data) backupData.navigation[id] = data;
    }

    const pageIds = await getAllIds(env.PAGES, 'pages');
    for (const id of pageIds) {
      const data = await env.PAGES.get(`pages/${id}`);
      if (data) backupData.pages[id] = data;
    }

    const commentIds = await getAllIds(env.COMMENTS, 'comments');
    for (const id of commentIds) {
      const data = await env.COMMENTS.get(`comments/${id}`);
      if (data) backupData.comments[id] = data;
    }

    const settingKeys = ['site_config', 'theme_config', 'robots_config', 'active_theme'];
    for (const key of settingKeys) {
      const data = await env.SITE_SETTINGS.get(key);
      if (data) backupData.settings[key] = data;
    }

    const backupId = crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "");
    const backupRef = {
      id: backupId,
      createdAt: backupData.createdAt,
      articleCount: Object.keys(backupData.articles).length / 2,
      categoryCount: Object.keys(backupData.categories).length,
      status: 'completed'
    };

    await env.SITE_SETTINGS.put(`backup/${backupId}`, JSON.stringify(backupData));
    await env.SITE_SETTINGS.put('backup_status', JSON.stringify({
      lastBackup: backupRef.createdAt,
      status: 'completed',
      backupId
    }));

    return new Response(JSON.stringify(backupRef), { status: 201 });
  }

  // ========== SECURITY API ==========

  // GET /api/settings/security - Get security settings (requires auth)
  if (path === '/api/settings/security' && request.method === 'GET') {
    const auth = await authenticate(request, env);
    if (auth.error) return auth.error;

    const security = await env.SITE_SETTINGS.get('security_settings');
    if (security) {
      return new Response(security, { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      adminIpWhitelist: [],
      enabled: false,
      rateLimitEnabled: true
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  // PUT /api/settings/security - Update security settings (requires admin auth)
  if (path === '/api/settings/security' && request.method === 'PUT') {
    const auth = await authenticate(request, env);
    if (auth.error) return auth.error;
    if (!hasPermission(auth.role!, 'settings:write')) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }
    const body = await request.json();
    await env.SITE_SETTINGS.put('security_settings', JSON.stringify(body));
    return new Response(JSON.stringify({ success: true }));
  }

  // GET /api/blocked-ips - List blocked IPs (requires auth)
  if (path === '/api/blocked-ips' && request.method === 'GET') {
    const auth = await authenticate(request, env);
    if (auth.error) return auth.error;

    const blockedIds = await getAllIds(env.SITE_SETTINGS, 'blocked_ips');
    const blocked = await Promise.all(
      blockedIds.map(async id => {
        const data = await env.SITE_SETTINGS.get(`blocked_ips/${id}`);
        return data ? JSON.parse(data) : null;
      })
    );
    return new Response(JSON.stringify(blocked.filter(Boolean)), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // POST /api/blocked-ips - Block an IP (requires admin auth)
  if (path === '/api/blocked-ips' && request.method === 'POST') {
    const auth = await authenticate(request, env);
    if (auth.error) return auth.error;
    if (!hasPermission(auth.role!, 'security:write')) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }
    const body = await request.json();
    if (!body.ip) {
      return new Response(JSON.stringify({ error: 'IP address required' }), { status: 400 });
    }
    // Validate IP address format
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$|^(?:[a-fA-F0-9]{1,4}:){7}[a-fA-F0-9]{1,4}$/;
    if (!ipRegex.test(body.ip)) {
      return new Response(JSON.stringify({ error: 'Invalid IP address format' }), { status: 400 });
    }
    const blocked = {
      id: crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), ""),
      ip: body.ip,
      reason: body.reason || 'manual',
      blockedAt: new Date().toISOString(),
      expiresAt: body.expiresAt || null
    };
    await env.SITE_SETTINGS.put(`blocked_ips/${blocked.id}`, JSON.stringify(blocked));
    await addId(env.SITE_SETTINGS, 'blocked_ips', blocked.id);
    return new Response(JSON.stringify(blocked), { status: 201 });
  }

  // DELETE /api/blocked-ips/:id - Unblock an IP (requires admin auth)
  const blockedIpMatch = path.match(/^\/api\/blocked-ips\/([^/]+)$/);
  if (blockedIpMatch && request.method === 'DELETE') {
    const auth = await authenticate(request, env);
    if (auth.error) return auth.error;
    if (!hasPermission(auth.role!, 'security:write')) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }
    const id = blockedIpMatch[1];
    await env.SITE_SETTINGS.delete(`blocked_ips/${id}`);
    const blockedIds = await getAllIds(env.SITE_SETTINGS, 'blocked_ips');
    const newIds = blockedIds.filter(i => i !== id);
    await env.SITE_SETTINGS.put('blocked_ips/all_ids', JSON.stringify(newIds));
    return new Response(JSON.stringify({ success: true }));
  }

  // ========== NOTIFICATIONS API ==========

  // GET /api/notifications - Get notifications (requires auth)
  if (path === '/api/notifications' && request.method === 'GET') {
    const auth = await authenticate(request, env);
    if (auth.error) return auth.error;

    const notifIds = await getAllIds(env.SITE_SETTINGS, 'notifications');
    const notifications = await Promise.all(
      notifIds.map(async id => {
        const data = await env.SITE_SETTINGS.get(`notifications/${id}`);
        return data ? JSON.parse(data) : null;
      })
    );
    const validNotifs = notifications.filter(Boolean).sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return new Response(JSON.stringify(validNotifs), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // POST /api/notifications - Create notification (requires auth)
  if (path === '/api/notifications' && request.method === 'POST') {
    const auth = await authenticate(request, env);
    if (auth.error) return auth.error;
    const body = await request.json();
    const notification = {
      id: crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), ""),
      type: body.type || 'info',
      title: body.title,
      message: body.message,
      read: false,
      createdAt: new Date().toISOString()
    };
    await env.SITE_SETTINGS.put(`notifications/${notification.id}`, JSON.stringify(notification));
    await addId(env.SITE_SETTINGS, 'notifications', notification.id);
    return new Response(JSON.stringify(notification), { status: 201 });
  }

  // POST /api/notifications/mark-read - Mark notifications as read (requires auth)
  if (path === '/api/notifications/mark-read' && request.method === 'POST') {
    const auth = await authenticate(request, env);
    if (auth.error) return auth.error;
    const body = await request.json();
    const { ids } = body;
    if (ids && Array.isArray(ids)) {
      for (const id of ids) {
        const data = await env.SITE_SETTINGS.get(`notifications/${id}`);
        if (data) {
          const notif = JSON.parse(data);
          notif.read = true;
          await env.SITE_SETTINGS.put(`notifications/${id}`, JSON.stringify(notif));
        }
      }
    }
    return new Response(JSON.stringify({ success: true }));
  }

  // DELETE /api/notifications/:id - Delete notification
  if (path.match(/^\/api\/notifications\/([^/]+)$/) && request.method === 'DELETE') {
    const id = path.match(/^\/api\/notifications\/([^/]+)$/)[1];
    await env.SITE_SETTINGS.delete(`notifications/${id}`);
    const notifIds = await getAllIds(env.SITE_SETTINGS, 'notifications');
    const newIds = notifIds.filter(i => i !== id);
    await env.SITE_SETTINGS.put('notifications/all_ids', JSON.stringify(newIds));
    return new Response(JSON.stringify({ success: true }));
  }

  // ========== DRAFT / PREVIEW API ==========

  // GET /api/articles/:id/draft - Get draft
  const draftMatch = path.match(/^\/api\/articles\/([^/]+)\/draft$/);
  if (draftMatch && request.method === 'GET') {
    const articleId = draftMatch[1];
    const draft = await env.ARTICLES.get(`articles/${articleId}/draft`);
    if (draft) {
      return new Response(draft, { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: 'No draft found' }), { status: 404 });
  }

  // PUT /api/articles/:id/draft - Save draft
  if (draftMatch && request.method === 'PUT') {
    const articleId = draftMatch[1];
    const body = await request.json();
    const draft = {
      articleId,
      content: body.content,
      title: body.title,
      updatedAt: new Date().toISOString()
    };
    await env.ARTICLES.put(`articles/${articleId}/draft`, JSON.stringify(draft));
    return new Response(JSON.stringify({ success: true, draft }));
  }

  // POST /api/articles/:id/preview - Generate preview link
  const previewGenerateMatch = path.match(/^\/api\/articles\/([^/]+)\/preview$/);
  if (previewGenerateMatch && request.method === 'POST') {
    const articleId = previewGenerateMatch[1];
    const previewId = crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "");
    const preview = {
      id: previewId,
      articleId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString()
    };
    await env.SITE_SETTINGS.put(`preview/${previewId}`, JSON.stringify(preview));
    return new Response(JSON.stringify({ previewId, previewUrl: `/preview/${previewId}` }), { status: 201 });
  }

  // DELETE /api/articles/:id/draft - Delete draft
  if (draftMatch && request.method === 'DELETE') {
    const articleId = draftMatch[1];
    await env.ARTICLES.delete(`articles/${articleId}/draft`);
    return new Response(JSON.stringify({ success: true }));
  }

  // GET /api/preview/:id - Get preview content
  const previewMatch = path.match(/^\/api\/preview\/([^/]+)$/);
  if (previewMatch && request.method === 'GET') {
    const previewId = previewMatch[1];
    const preview = await env.SITE_SETTINGS.get(`preview/${previewId}`);
    if (!preview) {
      return new Response(JSON.stringify({ error: 'Preview not found' }), { status: 404 });
    }
    const previewData = JSON.parse(preview);
    if (new Date(previewData.expiresAt) < new Date()) {
      return new Response(JSON.stringify({ error: 'Preview expired' }), { status: 410 });
    }
    const article = await env.ARTICLES.get(`articles/${previewData.articleId}`);
    return new Response(article || '{}', { headers: { 'Content-Type': 'application/json' } });
  }

  // ========== TRASH / RESTORE API ==========

  // GET /api/articles/deleted - List deleted articles
  if (path === '/api/articles/deleted' && request.method === 'GET') {
    const deletedIds = await getAllIds(env.ARTICLES, 'deleted_articles');
    const deleted = await Promise.all(
      deletedIds.map(async id => {
        const data = await env.ARTICLES.get(`deleted/${id}`);
        return data ? JSON.parse(data) : null;
      })
    );
    return new Response(JSON.stringify(deleted.filter(Boolean)), { headers: { 'Content-Type': 'application/json' } });
  }

  // POST /api/articles/:id/restore - Restore deleted article
  const restoreMatch = path.match(/^\/api\/articles\/([^/]+)\/restore$/);
  if (restoreMatch && request.method === 'POST') {
    const articleId = restoreMatch[1];
    const deletedData = await env.ARTICLES.get(`deleted/${articleId}`);
    if (!deletedData) {
      return new Response(JSON.stringify({ error: 'Article not in trash' }), { status: 404 });
    }
    const article = JSON.parse(deletedData);
    article.status = 'draft';
    article.updatedAt = new Date().toISOString();
    await env.ARTICLES.put(`articles/${articleId}`, JSON.stringify(article));
    await env.ARTICLES.delete(`deleted/${articleId}`);
    const deletedIds = await getAllIds(env.ARTICLES, 'deleted_articles');
    const newIds = deletedIds.filter(id => id !== articleId);
    await env.ARTICLES.put('deleted_articles/all_ids', JSON.stringify(newIds));
    return new Response(JSON.stringify({ success: true, article }));
  }

  // DELETE /api/articles/:id/permanent - Permanent delete
  const permDeleteMatch = path.match(/^\/api\/articles\/([^/]+)\/permanent$/);
  if (permDeleteMatch && request.method === 'DELETE') {
    const articleId = permDeleteMatch[1];
    await env.ARTICLES.delete(`articles/${articleId}`);
    await env.ARTICLES.delete(`articles/${articleId}/content`);
    await env.ARTICLES.delete(`articles/${articleId}/seo`);
    await env.ARTICLES.delete(`articles/${articleId}/draft`);
    await env.ARTICLES.delete(`deleted/${articleId}`);
    return new Response(JSON.stringify({ success: true }));
  }

  // GET /api/articles/stale - Find articles that need updating
  if (path === '/api/articles/stale' && request.method === 'GET') {
    const authError = await requireAuth(request, env, 'articles:read');
    if (authError) return authError;

    const daysThreshold = parseInt(url.searchParams.get('days') || '90');
    const minViews = parseInt(url.searchParams.get('minViews') || '0');
    const includeContent = url.searchParams.get('includeContent') === 'true';

    const articleIds = await getAllIds(env.ARTICLES, 'articles');
    const articles = await Promise.all(
      articleIds.map(async id => {
        const data = await env.ARTICLES.get(`articles/${id}`);
        return data ? JSON.parse(data) : null;
      })
    );

    const publishedArticles = articles.filter(a => a && a.status === 'published') as any[];
    const now = new Date();
    const thresholdDate = new Date(now.getTime() - daysThreshold * 24 * 60 * 60 * 1000);

    const staleArticles = publishedArticles.map(article => {
      const updatedAt = article.updatedAt ? new Date(article.updatedAt) : new Date(article.createdAt);
      const publishedAt = article.publishedAt ? new Date(article.publishedAt) : updatedAt;
      const daysSinceUpdate = Math.floor((now.getTime() - updatedAt.getTime()) / (24 * 60 * 60 * 1000));
      const daysSincePublished = Math.floor((now.getTime() - publishedAt.getTime()) / (24 * 60 * 60 * 1000));

      // Calculate staleness score (higher = more stale)
      let stalenessScore = 0;
      if (daysSinceUpdate > daysThreshold) stalenessScore += 50;
      if (daysSinceUpdate > daysThreshold * 2) stalenessScore += 30;
      if (daysSincePublished > 365) stalenessScore += 20; // Over a year old

      return {
        id: article.id,
        title: article.title,
        slug: article.slug,
        categoryId: article.categoryId,
        status: article.status,
        updatedAt: article.updatedAt,
        publishedAt: article.publishedAt,
        daysSinceUpdate,
        daysSincePublished,
        stalenessScore,
        reasons: [
          daysSinceUpdate > daysThreshold ? `Not updated in ${daysSinceUpdate} days` : null,
          daysSincePublished > 365 ? 'Published over a year ago' : null,
        ].filter(Boolean),
        ...(includeContent && { excerpt: article.excerpt, content: article.content?.slice(0, 500) }),
      };
    });

    // Sort by staleness score (most stale first)
    staleArticles.sort((a, b) => b.stalenessScore - a.stalenessScore);

    // Filter by minimum staleness score
    const filtered = staleArticles.filter(a => a.stalenessScore > 0);

    // Get content quality scores
    const contentQuality = filtered.map(article => {
      const wordCount = (article.excerpt || '').split(/\s+/).length;
      let qualityScore = 50; // Base score

      // Deduct for missing excerpt
      if (!article.excerpt || article.excerpt.length < 50) qualityScore -= 20;

      // Add for comprehensive content
      if (article.content && article.content.length > 1000) qualityScore += 30;

      return {
        ...article,
        qualityScore: Math.max(0, qualityScore),
        needsUpdate: article.stalenessScore > 30 || qualityScore < 40,
        updatePriority: article.stalenessScore > 50 ? 'high' : article.stalenessScore > 20 ? 'medium' : 'low',
      };
    });

    return new Response(JSON.stringify({
      totalArticles: publishedArticles.length,
      staleCount: filtered.length,
      thresholdDays: daysThreshold,
      articles: contentQuality,
      summary: {
        highPriority: contentQuality.filter(a => a.updatePriority === 'high').length,
        mediumPriority: contentQuality.filter(a => a.updatePriority === 'medium').length,
        lowPriority: contentQuality.filter(a => a.updatePriority === 'low').length,
      }
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // GET /api/articles/quality-score - Get content quality scores
  if (path === '/api/articles/quality-score' && request.method === 'GET') {
    const authError = await requireAuth(request, env, 'articles:read');
    if (authError) return authError;

    const articleId = url.searchParams.get('id');

    if (articleId) {
      // Single article analysis
      const data = await env.ARTICLES.get(`articles/${articleId}`);
      const seoData = await env.ARTICLES.get(`articles/${articleId}/seo`);
      const contentData = await env.ARTICLES.get(`articles/${articleId}/content`);

      if (!data) {
        return new Response(JSON.stringify({ error: 'Article not found' }), { status: 404 });
      }

      const article = JSON.parse(data);
      const content = contentData || '';

      // Calculate quality scores
      const wordCount = content.split(/\s+/).length;
      const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
      const avgSentenceLength = sentences.length > 0 ? wordCount / sentences.length : 0;

      let readabilityScore = 100;
      if (avgSentenceLength > 20) readabilityScore -= 20;
      if (avgSentenceLength > 30) readabilityScore -= 30;
      if (wordCount < 300) readabilityScore -= 30;

      let seoScore = 80;
      if (!article.excerpt || article.excerpt.length < 50) seoScore -= 20;
      if (!article.featuredImage) seoScore -= 15;

      let structureScore = 100;
      if (!content.includes('#') && !content.includes('##')) structureScore -= 25;
      if (!content.includes('- ') && !content.includes('* ')) structureScore -= 15;

      const overall = Math.round((readabilityScore + seoScore + structureScore) / 3);

      return new Response(JSON.stringify({
        articleId,
        title: article.title,
        scores: {
          readability: Math.max(0, readabilityScore),
          seo: Math.max(0, seoScore),
          structure: Math.max(0, structureScore),
          overall: Math.max(0, overall),
        },
        metrics: {
          wordCount,
          sentenceCount: sentences.length,
          avgSentenceLength: Math.round(avgSentenceLength),
          hasHeadings: content.includes('#'),
          hasLists: content.includes('-') || content.includes('*'),
          hasExcerpt: !!article.excerpt,
          hasFeaturedImage: !!article.featuredImage,
        },
        recommendations: [
          readabilityScore < 70 ? 'Consider breaking up long sentences for better readability' : null,
          seoScore < 70 ? 'Add a compelling excerpt and featured image for better SEO' : null,
          structureScore < 70 ? 'Use headings (H2, H3) and bullet points to structure content' : null,
        ].filter(Boolean),
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      // Bulk analysis
      const articleIds = await getAllIds(env.ARTICLES, 'articles');
      const articles = await Promise.all(
        articleIds.slice(0, 50).map(async id => {
          const data = await env.ARTICLES.get(`articles/${id}`);
          return data ? JSON.parse(data) : null;
        })
      );

      const publishedArticles = articles.filter(a => a && a.status === 'published') as any[];
      const scores = publishedArticles.map(article => ({
        id: article.id,
        title: article.title,
        slug: article.slug,
        status: article.status,
        updatedAt: article.updatedAt,
      }));

      return new Response(JSON.stringify({
        total: publishedArticles.length,
        articles: scores,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // ========== IMPORT / EXPORT API ==========

  // GET /api/articles/export - Export articles
  if (path === '/api/articles/export' && request.method === 'GET') {
    const authError = await requireAuth(request, env, 'articles:read');
    if (authError) return authError;
    const format = url.searchParams.get('format') || 'json';
    const ids = await getAllIds(env.ARTICLES, 'articles');
    const articles = await Promise.all(
      ids.map(async id => {
        const meta = await env.ARTICLES.get(`articles/${id}`);
        const content = await env.ARTICLES.get(`articles/${id}/content`);
        if (!meta) return null;
        const article = JSON.parse(meta);
        if (content) article.content = content;
        return article;
      })
    );
    const validArticles = articles.filter(Boolean);
    if (format === 'csv') {
      const headers = ['id', 'title', 'slug', 'status', 'categoryId', 'createdAt', 'updatedAt'];
      const csvRows = [headers.join(',')];
      for (const a of validArticles) {
        csvRows.push([a.id, a.title, a.slug, a.status, a.categoryId, a.createdAt, a.updatedAt].map(v => `"${v}"`).join(','));
      }
      return new Response(csvRows.join('\n'), { headers: { 'Content-Type': 'text/csv' } });
    }
    return new Response(JSON.stringify(validArticles), { headers: { 'Content-Type': 'application/json' } });
  }

  // POST /api/articles/import - Import articles
  if (path === '/api/articles/import' && request.method === 'POST') {
    const authError = await requireAuth(request, env, 'articles:write');
    if (authError) return authError;
    const body = await request.json();
    const articles = body.articles || [];
    const results = { success: 0, failed: 0, errors: [] as string[] };
    for (const article of articles) {
      try {
        const id = article.id || crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "");
        const now = new Date().toISOString();
        const meta = {
          id,
          title: article.title || 'Untitled',
          slug: article.slug || id,
          status: article.status || 'draft',
          categoryId: article.categoryId || '',
          feishuDocId: article.feishuDocId || '',
          feishuDocUrl: article.feishuDocUrl || '',
          createdAt: article.createdAt || now,
          updatedAt: now,
          publishedAt: article.publishedAt,
          featuredImage: article.featuredImage || '',
          excerpt: article.excerpt || '',
          content: article.content || ''
        };
        await env.ARTICLES.put(`articles/${id}`, JSON.stringify(meta));
        if (article.content) {
          await env.ARTICLES.put(`articles/${id}/content`, article.content);
        }
        await addId(env.ARTICLES, 'articles', id);
        results.success++;
      } catch (e: any) {
        results.failed++;
        results.errors.push(`Failed to import ${article.title}: ${e.message}`);
      }
    }
    return new Response(JSON.stringify(results), { status: 201 });
  }

  // ========== PAGE TEMPLATES API ==========

  // GET /api/templates - List templates
  if (path === '/api/templates' && request.method === 'GET') {
    const templateIds = await getAllIds(env.PAGES, 'templates');
    const templates = await Promise.all(
      templateIds.map(async id => {
        const data = await env.PAGES.get(`templates/${id}`);
        return data ? JSON.parse(data) : null;
      })
    );
    return new Response(JSON.stringify(templates.filter(Boolean)), { headers: { 'Content-Type': 'application/json' } });
  }

  // POST /api/templates - Create template
  if (path === '/api/templates' && request.method === 'POST') {
    const body = await request.json();
    const template = {
      id: crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), ""),
      name: body.name,
      layout: body.layout || 'default',
      fields: body.fields || [],
      createdAt: new Date().toISOString()
    };
    await env.PAGES.put(`templates/${template.id}`, JSON.stringify(template));
    await addId(env.PAGES, 'templates', template.id);
    return new Response(JSON.stringify(template), { status: 201 });
  }

  // GET /api/templates/:id - Get template
  const templateMatch = path.match(/^\/api\/templates\/([^/]+)$/);
  if (templateMatch && request.method === 'GET') {
    const template = await env.PAGES.get(`templates/${templateMatch[1]}`);
    if (!template) {
      return new Response(JSON.stringify({ error: 'Template not found' }), { status: 404 });
    }
    return new Response(template, { headers: { 'Content-Type': 'application/json' } });
  }

  // PUT /api/templates/:id - Update template
  if (templateMatch && request.method === 'PUT') {
    const body = await request.json();
    const existing = await env.PAGES.get(`templates/${templateMatch[1]}`);
    if (!existing) {
      return new Response(JSON.stringify({ error: 'Template not found' }), { status: 404 });
    }
    const template = { ...JSON.parse(existing), ...body };
    await env.PAGES.put(`templates/${templateMatch[1]}`, JSON.stringify(template));
    return new Response(JSON.stringify({ success: true }));
  }

  // DELETE /api/templates/:id - Delete template
  if (templateMatch && request.method === 'DELETE') {
    await env.PAGES.delete(`templates/${templateMatch[1]}`);
    const ids = await getAllIds(env.PAGES, 'templates');
    const newIds = ids.filter(id => id !== templateMatch[1]);
    await env.PAGES.put('templates/all_ids', JSON.stringify(newIds));
    return new Response(JSON.stringify({ success: true }));
  }

  // ========== MEDIA FOLDERS API ==========

  // GET /api/media/folders - List folders
  if (path === '/api/media/folders' && request.method === 'GET') {
    const folderIds = await getAllIds(env.MEDIA, 'folders');
    const folders = await Promise.all(
      folderIds.map(async id => {
        const data = await env.MEDIA.get(`folders/${id}`);
        return data ? JSON.parse(data) : null;
      })
    );
    return new Response(JSON.stringify(folders.filter(Boolean)), { headers: { 'Content-Type': 'application/json' } });
  }

  // POST /api/media/folders - Create folder
  if (path === '/api/media/folders' && request.method === 'POST') {
    const body = await request.json();
    const folder = {
      id: crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), ""),
      name: body.name,
      parentId: body.parentId || null,
      path: body.path || `/${body.name}/`,
      createdAt: new Date().toISOString()
    };
    await env.MEDIA.put(`folders/${folder.id}`, JSON.stringify(folder));
    await addId(env.MEDIA, 'folders', folder.id);
    return new Response(JSON.stringify(folder), { status: 201 });
  }

  // DELETE /api/media/folders/:id - Delete folder
  const folderMatch = path.match(/^\/api\/media\/folders\/([^/]+)$/);
  if (folderMatch && request.method === 'DELETE') {
    await env.MEDIA.delete(`folders/${folderMatch[1]}`);
    const ids = await getAllIds(env.MEDIA, 'folders');
    const newIds = ids.filter(id => id !== folderMatch[1]);
    await env.MEDIA.put('folders/all_ids', JSON.stringify(newIds));
    return new Response(JSON.stringify({ success: true }));
  }

  // GET /api/media/usage - Get media usage stats
  if (path === '/api/media/usage' && request.method === 'GET') {
    const mediaIds = await getAllIds(env.MEDIA, 'media');
    const usage: Record<string, string[]> = {};
    for (const id of mediaIds) {
      const data = await env.MEDIA.get(`media/${id}`);
      if (data) {
        const item = JSON.parse(data);
        if (item.usedIn) {
          for (const articleId of item.usedIn) {
            if (!usage[articleId]) usage[articleId] = [];
            usage[articleId].push(id);
          }
        }
      }
    }
    const stats = {
      totalMedia: mediaIds.length,
      usageByArticle: Object.keys(usage).length,
      unusedMedia: mediaIds.filter(id => !usage[id]).length
    };
    return new Response(JSON.stringify(stats), { headers: { 'Content-Type': 'application/json' } });
  }


  // ========== WEBHOOKS API ==========

  // GET /api/webhooks - List webhooks
  if (path === '/api/webhooks' && request.method === 'GET') {
    const webhookIds = await getAllIds(env.SITE_SETTINGS, 'webhooks');
    const webhooks = await Promise.all(
      webhookIds.map(async id => {
        const data = await env.SITE_SETTINGS.get(`webhooks/${id}`);
        return data ? JSON.parse(data) : null;
      })
    );
    return new Response(JSON.stringify(webhooks.filter(Boolean)), { headers: { 'Content-Type': 'application/json' } });
  }

  // POST /api/webhooks - Create webhook
  if (path === '/api/webhooks' && request.method === 'POST') {
    const body = await request.json();
    const webhook = {
      id: crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), ""),
      url: body.url,
      events: body.events || [],
      secret: body.secret || crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), ""),
      enabled: body.enabled !== false,
      createdAt: new Date().toISOString()
    };
    await env.SITE_SETTINGS.put(`webhooks/${webhook.id}`, JSON.stringify(webhook));
    await addId(env.SITE_SETTINGS, 'webhooks', webhook.id);
    return new Response(JSON.stringify(webhook), { status: 201 });
  }

  // GET /api/webhooks/:id - Get webhook
  const webhookMatch = path.match(/^\/api\/webhooks\/([^/]+)$/);
  if (webhookMatch && request.method === 'GET') {
    const webhook = await env.SITE_SETTINGS.get(`webhooks/${webhookMatch[1]}`);
    if (!webhook) return new Response(JSON.stringify({ error: 'Webhook not found' }), { status: 404 });
    return new Response(webhook, { headers: { 'Content-Type': 'application/json' } });
  }

  // DELETE /api/webhooks/:id - Delete webhook
  if (webhookMatch && request.method === 'DELETE') {
    await env.SITE_SETTINGS.delete(`webhooks/${webhookMatch[1]}`);
    const ids = await getAllIds(env.SITE_SETTINGS, 'webhooks');
    const newIds = ids.filter(id => id !== webhookMatch[1]);
    await env.SITE_SETTINGS.put('webhooks/all_ids', JSON.stringify(newIds));
    return new Response(JSON.stringify({ success: true }));
  }

  // POST /api/webhooks/test/:id - Test webhook
  const webhookTestMatch = path.match(/^\/api\/webhooks\/([^/]+)\/test$/);
  if (webhookTestMatch && request.method === 'POST') {
    const webhook = await env.SITE_SETTINGS.get(`webhooks/${webhookTestMatch[1]}`);
    if (!webhook) return new Response(JSON.stringify({ error: 'Webhook not found' }), { status: 404 });
    const payload = { event: 'test', timestamp: new Date().toISOString() };
    return new Response(JSON.stringify({ success: true, payloadSent: payload }), { status: 200 });
  }

  // GET /api/commissions/report - Get commission report
  if (path === '/api/commissions/report' && request.method === 'GET') {
    const month = url.searchParams.get('month') || new Date().toISOString().slice(0, 7);
    const affIds = await getAllIds(env.AFFILIATES, 'affiliates');
    let totalClicks = 0, totalConversions = 0, totalRevenue = 0;
    const platformBreakdown: Record<string, number> = {};

    for (const id of affIds) {
      const data = await env.AFFILIATES.get(`affiliates/${id}`);
      if (data) {
        const aff = JSON.parse(data);
        if (aff.clicks) totalClicks += aff.clicks;
        if (aff.conversions) totalConversions += aff.conversions;
        if (aff.revenue) totalRevenue += aff.revenue;
        if (!platformBreakdown[aff.platform]) platformBreakdown[aff.platform] = 0;
        platformBreakdown[aff.platform] += aff.revenue || 0;
      }
    }

    const report = { month, totalClicks, totalConversions, totalRevenue, earnings: totalRevenue * 0.05, platformBreakdown: Object.entries(platformBreakdown).map(([p, e]) => ({ platform: p, earnings: e })) };
    return new Response(JSON.stringify(report), { headers: { 'Content-Type': 'application/json' } });
  }

  // GET /api/commissions/export - Export commissions as CSV
  if (path === '/api/commissions/export' && request.method === 'GET') {
    const affIds = await getAllIds(env.AFFILIATES, 'affiliates');
    const rows = [['id', 'platform', 'name', 'clicks', 'conversions', 'revenue']];
    for (const id of affIds) {
      const data = await env.AFFILIATES.get(`affiliates/${id}`);
      if (data) {
        const aff = JSON.parse(data);
        rows.push([aff.id, aff.platform, aff.name, aff.clicks || 0, aff.conversions || 0, aff.revenue || 0].map(String));
      }
    }
    return new Response(rows.map(r => r.join(',')).join('\n'), { headers: { 'Content-Type': 'text/csv' } });
  }

  // GET /api/affiliates/:id/clicks - Get click history
  const affClicksMatch = path.match(/^\/api\/affiliates\/([^/]+)\/clicks$/);
  if (affClicksMatch && request.method === 'GET') {
    const affiliateId = affClicksMatch[1];
    const clickIds = await getAllIds(env.AFFILIATES, `clicks_${affiliateId}`);
    const clicks = await Promise.all(
      clickIds.map(async id => {
        const data = await env.AFFILIATES.get(`clicks_${affiliateId}/${id}`);
        return data ? JSON.parse(data) : null;
      })
    );
    return new Response(JSON.stringify(clicks.filter(Boolean).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())), { headers: { 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
};
