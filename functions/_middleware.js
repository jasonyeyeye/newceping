// Cloudflare Pages Middleware
// Handles SPA routing for /admin/* and proxies API requests to Worker

const WORKER_URL = 'https://adult-toy-review-api.wangzczg-3e8.workers.dev';
const PROXY_TIMEOUT = 10000; // 10 seconds

// Filter headers - only forward what's needed for API calls
function getProxyHeaders(request) {
  const headers = new Headers();
  const auth = request.headers.get('Authorization');
  if (auth) {
    headers.set('Authorization', auth);
  }
  // Always set Content-Type for API requests
  const contentType = request.headers.get('Content-Type');
  if (contentType) {
    headers.set('Content-Type', contentType);
  }
  return headers;
}

async function proxyRequest(workerUrl, request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROXY_TIMEOUT);

  try {
    const response = await fetch(workerUrl, {
      method: request.method,
      headers: getProxyHeaders(request),
      body: request.body,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      return new Response(JSON.stringify({ error: 'Gateway timeout — Worker did not respond' }), {
        status: 504, headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ error: 'Gateway error — Worker unavailable' }), {
      status: 502, headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequest({ request, next, env }) {
  const url = new URL(request.url);

  // ========== SPA Routing for /admin/* ==========
  // Cloudflare Pages _redirects doesn't handle /admin/login correctly
  // This middleware catches non-file /admin/* requests and serves index.html
  if (url.pathname.startsWith('/admin/')) {
    // Skip middleware for static assets to avoid routing loops
    if (url.pathname.startsWith('/admin/assets/') ||
        url.pathname.startsWith('/admin/images/') ||
        url.pathname.startsWith('/admin/icons/') ||
        url.pathname.startsWith('/admin/fonts/')) {
      return next();
    }
    // Skip middleware for direct .html file requests
    if (url.pathname.endsWith('.html')) {
      return next();
    }
    // For SPA routes, try next() first (let Pages handle static files)
    // If it returns 404, manually fetch and serve index.html
    const response = await next();
    if (response.status === 404) {
      const indexUrl = new URL('/admin/index.html', url.origin);
      const indexResponse = await fetch(indexUrl);
      return new Response(indexResponse.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8'
        }
      });
    }
    return response;
  }

  // ========== API Proxy to Worker ==========
  // Forward /api/* requests to the Cloudflare Worker
  if (url.pathname.startsWith('/api/')) {
    const workerUrl = `${WORKER_URL}${url.pathname}${url.search}`;
    return proxyRequest(workerUrl, request);
  }

  // ========== Affiliate Redirect Proxy ==========
  if (url.pathname.startsWith('/affiliate/')) {
    const workerUrl = `${WORKER_URL}${url.pathname}${url.search}`;
    return proxyRequest(workerUrl, request);
  }

  // Pass through for all other routes
  return next();
}