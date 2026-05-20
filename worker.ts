// Cloudflare Worker for AdultToyReview Admin API
// Handles KV operations, Feishu API, and GitHub API

interface Env {
  ARTICLES: KVNamespace;
  CATEGORIES: KVNamespace;
  NAVIGATION: KVNamespace;
  PAGES: KVNamespace;
  AFFILIATES: KVNamespace;
  SITE_SETTINGS: KVNamespace;
  FEISHU_APP_ID: string;
  FEISHU_APP_SECRET: string;
  GITHUB_TOKEN: string;
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

// KV helpers
async function getAllIds(kv: KVNamespace, prefix: string): Promise<string[]> {
  const ids = await kv.get(`${prefix}/all_ids`);
  return ids ? JSON.parse(ids) : [];
}

async function setWithIds(kv: KVNamespace, prefix: string, id: string, data: object) {
  await kv.put(`${prefix}/${id}`, JSON.stringify(data));
  const ids = await getAllIds(kv, prefix);
  if (!ids.includes(id)) {
    ids.push(id);
    await kv.put(`${prefix}/all_ids`, JSON.stringify(ids));
  }
}

// Router
async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path.startsWith('/api/articles')) {
    if (request.method === 'GET') {
      const ids = await getAllIds(env.ARTICLES, 'articles');
      const articles = await Promise.all(
        ids.map(async id => {
          const data = await env.ARTICLES.get(`articles/${id}/meta`);
          return data ? JSON.parse(data) : null;
        })
      );
      return new Response(JSON.stringify(articles.filter(Boolean)), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (request.method === 'POST') {
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
      if (body.seo) {
        await env.ARTICLES.put(`articles/${id}/seo`, JSON.stringify({ ...body.seo, articleId: id }));
      }
      if (body.affiliate) {
        await env.ARTICLES.put(`articles/${id}/affiliate`, JSON.stringify({ ...body.affiliate, articleId: id }));
      }
      return new Response(JSON.stringify(article), { status: 201 });
    }
  }

  if (path.startsWith('/api/categories')) {
    if (request.method === 'GET') {
      const ids = await getAllIds(env.CATEGORIES, 'categories');
      const categories = await Promise.all(
        ids.map(async id => {
          const data = await env.CATEGORIES.get(`categories/${id}`);
          return data ? JSON.parse(data) : null;
        })
      );
      return new Response(JSON.stringify(categories.filter(Boolean)), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (request.method === 'POST') {
      const body = await request.json();
      const id = crypto.randomUUID();
      const category = { ...body, id, createdAt: new Date().toISOString() };
      await setWithIds(env.CATEGORIES, 'categories', id, category);
      return new Response(JSON.stringify(category), { status: 201 });
    }
  }

  if (path === '/api/feishu/docs') {
    const folderToken = url.searchParams.get('folder_token');
    if (!folderToken) {
      return new Response(JSON.stringify({ error: 'folder_token required' }), { status: 400 });
    }
    const docs = await getFeishuDocs(env, folderToken);
    return new Response(JSON.stringify(docs), { headers: { 'Content-Type': 'application/json' } });
  }

  if (path.startsWith('/api/github/write')) {
    if (request.method === 'POST') {
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

  return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
}

export default {
  fetch(request: Request, env: Env) {
    return handleRequest(request, env);
  },
};