import { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";
import { Loader2, ExternalLink, Radio, RotateCw, AlertTriangle, Wifi, WifiOff } from "lucide-react";

function isHlsUrl(url: string) {
  const u = url.split("?")[0].toLowerCase();
  return u.endsWith(".m3u8") || u.endsWith(".m3u") || u.includes(".m3u8");
}

function resolveStreamUrl(src: string): string {
  if (!src) return src;
  if (src.startsWith("blob:") || src.startsWith("data:")) return src;
  if (src.startsWith("/api/public/stream/")) return src;
  let parsed: URL;
  try {
    parsed = new URL(src, typeof window !== "undefined" ? window.location.href : "http://x");
  } catch {
    return src;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return src;
  return `/api/public/stream/p?u=${encodeURIComponent(parsed.toString())}`;
}

type Health = "checking" | "online" | "offline";

async function readProxyFallback(response: Response): Promise<string | null> {
  const contentType = response.headers.get("content-type") ?? "";
  const clone = response.clone();
  if (!contentType.includes("application/json")) return null;
  try {
    const data = await clone.json();
    if (data?.fallback || data?.error) return data.message ?? "This stream is unreachable.";
  } catch {
    return null;
  }
  return null;
}

export function VideoPlayer({ src, poster }: { src: string; poster?: string | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [buffering, setBuffering] = useState(false);
  const [bufferPct, setBufferPct] = useState(0);
  const [usingProxy, setUsingProxy] = useState(false);
  const [health, setHealth] = useState<Health>("checking");
  const [attempt, setAttempt] = useState(0);
  const [sourceIssue, setSourceIssue] = useState<string | null>(null);

  const resolved = resolveStreamUrl(src);

  // Source health check
  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    setHealth("checking");
    setSourceIssue(null);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    fetch(resolved, { method: "GET", headers: { Range: "bytes=0-2048" }, signal: ctrl.signal })
      .then(async (r) => {
        const issue = await readProxyFallback(r);
        if (cancelled) return;
        if (issue) {
          setSourceIssue(issue);
          setHealth("offline");
          return;
        }
        setHealth(r.ok || r.status === 206 ? "online" : "offline");
      })
      .catch(() => { if (!cancelled) setHealth("offline"); })
      .finally(() => clearTimeout(t));
    return () => { cancelled = true; ctrl.abort(); clearTimeout(t); };
  }, [src, attempt, resolved]);

  const retry = useCallback(() => {
    setError(null);
    setSourceIssue(null);
    setLoading(true);
    setBufferPct(0);
    setAttempt((a) => a + 1);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    if (sourceIssue) {
      setError(sourceIssue);
      setLoading(false);
      setBuffering(false);
      return;
    }
    setError(null);
    setLoading(true);
    setBuffering(false);
    setBufferPct(0);
    setUsingProxy(resolved !== src);

    const useHls = isHlsUrl(src);

    const updateBuffer = () => {
      if (!video.duration || !isFinite(video.duration)) {
        // live stream: show how many seconds buffered ahead
        const end = video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0;
        const ahead = Math.max(0, end - video.currentTime);
        setBufferPct(Math.min(100, (ahead / 15) * 100));
      } else {
        const end = video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0;
        setBufferPct(Math.min(100, (end / video.duration) * 100));
      }
    };

    const onLoaded = () => { setLoading(false); video.play().catch(() => {}); };
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => { setBuffering(false); setLoading(false); };
    const onProgress = () => updateBuffer();
    const onTime = () => updateBuffer();
    const onNativeErr = () => {
      setError("Unable to load this stream. It may be offline or unsupported.");
      setLoading(false);
    };

    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("progress", onProgress);
    video.addEventListener("timeupdate", onTime);

    if (useHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        manifestLoadingMaxRetry: 4,
        levelLoadingMaxRetry: 4,
        fragLoadingMaxRetry: 6,
      });
      hlsRef.current = hls;
      hls.loadSource(resolved);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, onLoaded);
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        const responseData = typeof data.response?.data === "string" ? data.response.data : "";
        if (responseData.includes('"fallback":true') || responseData.includes('"error"')) {
          try {
            const parsed = JSON.parse(responseData);
            setError(parsed.message ?? "This stream is unreachable.");
          } catch {
            setError("This stream is unreachable.");
          }
          setHealth("offline");
          setLoading(false);
          return;
        }
        if (data.type === "networkError") {
          // try to recover before erroring
          try { hls.startLoad(); return; } catch {}
        } else if (data.type === "mediaError") {
          try { hls.recoverMediaError(); return; } catch {}
        }
        setError(
          data.type === "networkError"
            ? "Network error — the upstream may be offline or geo-blocked."
            : "Media error — this stream format isn't supported by your browser."
        );
        setLoading(false);
      });
    } else if (useHls && video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = resolved;
      video.addEventListener("loadedmetadata", onLoaded);
      video.addEventListener("error", onNativeErr);
    } else {
      video.src = resolved;
      video.addEventListener("loadedmetadata", onLoaded);
      video.addEventListener("error", onNativeErr);
    }

    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("progress", onProgress);
      video.removeEventListener("timeupdate", onTime);
    };
  }, [src, attempt, resolved, sourceIssue]);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black ring-1 ring-border shadow-elevated">
      <video
        ref={videoRef}
        controls
        playsInline
        poster={poster ?? undefined}
        className="h-full w-full"
      />

      {/* Top-left status badges */}
      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
        {usingProxy && !error && !loading && (
          <div className="flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary ring-1 ring-primary/30 backdrop-blur">
            <Radio className="h-3 w-3" /> Proxied
          </div>
        )}
        <div
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider backdrop-blur ring-1 ${
            health === "online"
              ? "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30"
              : health === "offline"
              ? "bg-destructive/15 text-destructive ring-destructive/30"
              : "bg-muted/30 text-muted-foreground ring-border"
          }`}
        >
          {health === "online" ? <Wifi className="h-3 w-3" /> : health === "offline" ? <WifiOff className="h-3 w-3" /> : <Loader2 className="h-3 w-3 animate-spin" />}
          {health === "checking" ? "Checking" : health === "online" ? "Source OK" : "Source Down"}
        </div>
      </div>

      {/* Buffer progress bar */}
      {!error && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-white/5">
          <div
            className="h-full bg-gradient-brand transition-all duration-300"
            style={{ width: `${bufferPct}%` }}
          />
        </div>
      )}

      {/* Initial loading overlay */}
      {loading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/70 backdrop-blur-sm">
          <div className="relative">
            <div className="absolute inset-0 animate-ping rounded-full bg-primary/30" />
            <Loader2 className="relative h-12 w-12 animate-spin text-primary" />
          </div>
          <div className="w-48 max-w-[60%]">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-gradient-brand transition-all" style={{ width: `${Math.max(8, bufferPct)}%` }} />
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              {health === "checking" ? "Checking source…" : health === "offline" ? "Source unreachable, retrying…" : "Buffering stream…"}
            </p>
          </div>
        </div>
      )}

      {/* Mid-playback buffering pill */}
      {buffering && !loading && !error && (
        <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
          <Loader2 className="h-3 w-3 animate-spin" /> Buffering {Math.round(bufferPct)}%
        </div>
      )}

      {/* Error overlay with retry */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/90 p-6 text-center">
          <AlertTriangle className="h-10 w-10 text-destructive" />
          <p className="font-medium text-destructive">{error}</p>
          <p className="max-w-md break-all text-xs text-muted-foreground">{src}</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={retry}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-brand px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow transition-transform hover:scale-105"
            >
              <RotateCw className="h-4 w-4" /> Retry
            </button>
            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-surface px-4 py-2 text-sm text-foreground ring-1 ring-border hover:bg-surface-elevated"
            >
              Open URL <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
