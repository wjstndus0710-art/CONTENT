const objectKey = "workspace/v1.json";
const recordNames = [
  "marketing-journal-local-v1",
  "content-dashboard:v2",
  "content-dashboard:v2:blog-monthly",
  "content-dashboard:v2:settings",
];
const maxBytes = 5 * 1024 * 1024;
export const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
export const json = (body, status = 200) =>
  Response.json(body, { status, headers });

function validRecords(records) {
  if (!records || typeof records !== "object" || Array.isArray(records))
    return false;
  return Object.entries(records).every(([name, value]) => {
    if (!recordNames.includes(name)) return false;
    if (name !== recordNames[0])
      return (
        Array.isArray(value) &&
        value.every(
          (row) => row && typeof row === "object" && !Array.isArray(row),
        )
      );
    return (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      value.days &&
      typeof value.days === "object" &&
      value.weeks &&
      typeof value.weeks === "object" &&
      Array.isArray(value.schedule) &&
      Array.isArray(value.reviews)
    );
  });
}

export async function workspace(request, env, canWrite) {
  if (!env.BUCKET) return json({ error: "저장소 연결을 확인해 주세요." }, 503);
  if (request.method === "GET") {
    const saved = await env.BUCKET.get(objectKey);
    return json({
      canWrite,
      revision: saved?.httpEtag || null,
      records: saved ? await saved.json() : {},
    });
  }
  if (request.method !== "PUT")
    return json({ error: "지원하지 않는 요청입니다." }, 405);
  if (!canWrite)
    return json({ error: "관리자만 기록을 저장할 수 있습니다." }, 403);
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return json({ error: "요청 출처를 확인해 주세요." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return json({ error: "JSON이 필요합니다." }, 415);
  if (Number(request.headers.get("content-length")) > maxBytes)
    return json({ error: "저장 한도를 초과했습니다." }, 413);
  const reader = request.body?.getReader();
  if (!reader) return json({ error: "저장할 기록이 필요합니다." }, 400);
  const decoder = new TextDecoder();
  let size = 0;
  let payload = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return json({ error: "저장 한도를 초과했습니다." }, 413);
    }
    payload += decoder.decode(value, { stream: true });
  }
  payload += decoder.decode();
  let data;
  try {
    data = JSON.parse(payload);
  } catch {
    return json({ error: "올바른 JSON이 필요합니다." }, 400);
  }
  if (
    !validRecords(data?.records) ||
    !(
      data.revision === null ||
      (typeof data.revision === "string" &&
        /^"[a-f0-9]{32}"$/i.test(data.revision))
    )
  ) {
    return json({ error: "기록 형식이 올바르지 않습니다." }, 400);
  }
  const onlyIf = new Headers(
    data.revision ? { "If-Match": data.revision } : { "If-None-Match": "*" },
  );
  const saved = await env.BUCKET.put(objectKey, JSON.stringify(data.records), {
    onlyIf,
  });
  if (!saved)
    return json(
      {
        error:
          "다른 창에서 기록이 바뀌었습니다. 최신 기록을 다시 불러와 주세요.",
      },
      409,
    );
  return json({ revision: saved.httpEtag });
}
