export async function onRequest(context) {
  const url = new URL(context.request.url);

  // Handle /admin/* routing
  if (url.pathname.startsWith('/admin')) {
    const response = await context.next();
    if (response.status === 404) {
      // Serve the admin SPA index.html for any non-existent admin path
      return new Response(
        `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Admin — AdultToyReview</title>
    <script type="module" crossorigin src="/admin/assets/index-Curk7S1p.js"></script>
    <link rel="stylesheet" crossorigin href="/admin/assets/index-BefQM6Ao.css">
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`,
        {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
          },
        }
      );
    }
    return response;
  }
  return context.next();
}