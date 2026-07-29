export const config = {
  matcher: '/i/:path*',
};

export default async function middleware(request: Request) {
  const userAgent = request.headers.get('user-agent') || '';
  if (!/iPhone|iPad|iPod/.test(userAgent)) return undefined;

  const mobileconfigUrl = new URL('/Installa_FLOW.mobileconfig', request.url).href;
  const resp = await fetch(mobileconfigUrl);

  return new Response(resp.body, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-apple.ashen-plist',
      'Content-Disposition': 'inline',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
