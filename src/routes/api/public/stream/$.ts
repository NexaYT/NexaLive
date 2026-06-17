// IPTV stream proxy — runs as a Cloudflare Worker (TanStack server route on workerd).
// Solves two problems for IPTV streams in the browser:
//  1. Mixed content: `http://` streams blocked when the site is on `https://`
//  2. CORS: most IPTV origins don't send Access-Control-Allow-Origin
//
// Usage from the client:
//   /api/public/stream/p?u=<encoded upstream url>
//
// For HLS (.m3u8) playlists we rewrite each segment URL inside the manifest so
// segments also flow back through the proxy.
import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
};

function proxiedUrl(req: Request, target: string): string {
  const u = new URL(req.url);
  return `${u.origin}/api/public/stream/p?u=${encodeURIComponent(target)}`;
}

function resolveRelative(base: string, ref: string): string {
  try {
    return new URL(ref, base).toString();
  } catch {
    return ref;
  }
}

function rewriteM3U8(body: string, req: Request, upstreamUrl: string): string {
  return body
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        // Rewrite URI="..." inside tags (e.g. #EXT-X-KEY, #EXT-X-MEDIA)
        return line.replace(/URI="([^"]+)"/g, (_m, uri) => {
          const abs = resolveRelative(upstreamUrl, uri);
          return `URI="${proxiedUrl(req, abs)}"`;
        });
      }
      // Plain segment URL line
      const abs = resolveRelative(upstreamUrl, trimmed);
      return proxiedUrl(req, abs);
    })
    .join("\n");
}

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h === "0.0.0.0" || h.endsWith(".local")) return true;
  // IPv4 literal?
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [parseInt(m[1]), parseInt(m[2])];
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function errorJson(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: code, message, fallback: true }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function handle(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(request.url);
  const target = url.searchParams.get("u");
  if (!target) return errorJson(400, "MISSING_URL", "Missing ?u= upstream url");

  let upstream: URL;
  try {
    upstream = new URL(target);
  } catch {
    return errorJson(400, "INVALID_URL", "Invalid upstream url");
  }
  if (upstream.protocol !== "http:" && upstream.protocol !== "https:") {
    return errorJson(400, "BAD_PROTOCOL", "Only http(s) upstreams allowed");
  }
  if (isPrivateHost(upstream.hostname)) {
    return errorJson(
      200,
      "PRIVATE_HOST_UNREACHABLE",
      "This stream points to a private/LAN address that the cloud proxy cannot reach."
    );
  }

  const fwdHeaders: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (compatible; NexaLive/1.0)",
    Accept: "*/*",
  };
  const range = request.headers.get("range");
  if (range) fwdHeaders["Range"] = range;

  let upstreamResp: Response;
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 15_000);
    upstreamResp = await fetch(upstream.toString(), {
      method: request.method,
      headers: fwdHeaders,
      redirect: "follow",
      signal: ctrl.signal,
    });
    clearTimeout(timeout);
  } catch (err) {
    console.error("[stream-proxy] fetch failed", upstream.toString(), err);
    return errorJson(
      200,
      "UPSTREAM_UNREACHABLE",
      `Upstream unreachable: ${(err as Error).message}`
    );
  }

  if (!upstreamResp.ok && upstreamResp.status >= 500) {
    return errorJson(200, "UPSTREAM_ERROR", `Upstream returned ${upstreamResp.status}`);
  }

  const contentType = upstreamResp.headers.get("content-type") ?? "";
  const isManifest =
    /mpegurl|m3u8/i.test(contentType) || /\.m3u8(\?|$)/i.test(upstream.pathname);

  // Build response headers — strip CORS-conflicting ones from upstream
  const respHeaders = new Headers();
  for (const [k, v] of upstreamResp.headers) {
    const lk = k.toLowerCase();
    if (
      lk === "access-control-allow-origin" ||
      lk === "access-control-allow-methods" ||
      lk === "access-control-allow-headers" ||
      lk === "content-encoding" ||
      lk === "content-length"
    ) {
      continue;
    }
    respHeaders.set(k, v);
  }
  for (const [k, v] of Object.entries(CORS)) respHeaders.set(k, v);

  if (isManifest) {
    const text = await upstreamResp.text();
    const rewritten = rewriteM3U8(text, request, upstream.toString());
    respHeaders.set("Content-Type", "application/vnd.apple.mpegurl");
    // Manifests are short-lived for live streams
    respHeaders.set("Cache-Control", "public, max-age=2, s-maxage=2");
    return new Response(rewritten, { status: upstreamResp.status, headers: respHeaders });
  }

  // Segments can be cached on Cloudflare's edge for snappier rebuffering
  if (!respHeaders.has("Cache-Control")) {
    respHeaders.set("Cache-Control", "public, max-age=30, s-maxage=60");
  }

  return new Response(upstreamResp.body, {
    status: upstreamResp.status,
    headers: respHeaders,
  });
}

export const Route = createFileRoute("/api/public/stream/$")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      HEAD: ({ request }) => handle(request),
      OPTIONS: ({ request }) => handle(request),
    },
  },
});
