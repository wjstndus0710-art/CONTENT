export function maintenanceResponse(request) {
  const { hostname } = new URL(request.url);
  if (hostname !== "marketingtodo1.netlify.app") return null;

  return new Response(
    request.method === "HEAD" ? null : "마케팅 일지 사이트를 잠시 닫아두었습니다.\n",
    {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    },
  );
}
