// Cloudflare Pages Function - handles /admin/* routing
export const onRequest = async ({ request, next, env }) => {
  const url = new URL(request.url);

  // Only intercept /admin routes
  if (!url.pathname.startsWith('/admin')) {
    return next();
  }

  // Get the path after /admin
  let path = url.pathname.replace(/^\/admin/, '') || '/';

  // If it's a directory request (no extension), add index.html
  if (!path.includes('.') && !path.endsWith('/')) {
    path = path + '/';
  }
  if (!path.includes('.')) {
    path = path + 'index.html';
  }

  // Try to fetch the asset from /admin/ prefix
  const assetUrl = new URL('/admin' + path, url.origin);

  try {
    const response = await env.ASSETS.fetch(assetUrl);
    if (response.ok) {
      return response;
    }
  } catch (e) {
    // ASSETS.fetch failed, try next
  }

  // Fallback: serve /admin/index.html for SPA routes
  const indexUrl = new URL('/admin/index.html', url.origin);
  const indexResponse = await env.ASSETS.fetch(indexUrl);

  return new Response(indexResponse.body, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
};