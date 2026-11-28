// Only provide an offline message when opening the workspace. Browser-managed
// storage, Drive, reports, auth and licensed downloads bypass this handler.
const root = new URL(self.registration.scope);
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.mode !== 'navigate' || event.request.method !== 'GET' ||
      url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) return;
  const page = url.pathname.slice(root.pathname.length);
  if (!/^(?:versions\/v1\.0\.\d+\/)?(?:index\.html)?$/.test(page)) return;
  event.respondWith(fetch(event.request).catch(() => new Response(
    '<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ProElite Inspection</title><main style="max-width:32rem;margin:12vh auto;padding:1rem;font:1rem/1.6 system-ui"><h1>ProElite Inspection</h1><p>เชื่อมต่ออินเทอร์เน็ตเพื่อยืนยันบัญชีและเปิดแฟ้มงาน</p><p lang="en">Connect to the internet to verify your account and open your workspace.</p><a href="">ลองอีกครั้ง / Retry</a></main></html>',
    {status: 503, headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'}}
  )));
});
