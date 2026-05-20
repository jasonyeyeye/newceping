import type { APIRoute } from 'astro';

export const GET: APIRoute = () => {
  const body = `User-agent: *
Allow: /

# Block admin and API paths
Disallow: /admin/
Disallow: /api/

# Sitemap
Sitemap: https://adulttoyreview.com/sitemap.xml
`;

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
};