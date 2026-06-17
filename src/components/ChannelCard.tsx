import { Link } from "@tanstack/react-router";
import { Play, Tv } from "lucide-react";

export interface ChannelCardData {
  id: string;
  name: string;
  logo_url: string | null;
  description: string | null;
}

export function ChannelCard({ channel }: { channel: ChannelCardData }) {
  return (
    <Link
      to="/watch/$id"
      params={{ id: channel.id }}
      className="group flex w-24 shrink-0 flex-col items-center gap-2 sm:w-28"
    >
      <div className="relative">
        {/* gradient ring */}
        <div className="absolute -inset-[2px] rounded-full bg-gradient-brand opacity-40 blur-sm transition-all duration-300 group-hover:opacity-100 group-hover:blur-md" />
        <div className="relative h-20 w-20 sm:h-24 sm:w-24 overflow-hidden rounded-full bg-surface ring-2 ring-border/60 transition-all duration-300 group-hover:scale-105 group-hover:ring-primary">
          {channel.logo_url ? (
            <img
              src={`https://images.weserv.nl/?url=${encodeURIComponent(channel.logo_url.replace(/^https?:\/\//, ""))}&w=200&h=200&fit=cover&output=webp`}
              alt={channel.name}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
              onError={(e) => {
                const t = e.target as HTMLImageElement;
                if (t.dataset.fallback !== "1") {
                  t.dataset.fallback = "1";
                  t.src = channel.logo_url!;
                } else {
                  t.style.display = "none";
                }
              }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-elevated to-background">
              <Tv className="h-8 w-8 text-muted-foreground" />
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary shadow-glow">
              <Play className="h-4 w-4 fill-current text-primary-foreground" />
            </div>
          </div>
        </div>
      </div>
      <p className="line-clamp-2 text-center text-xs font-medium leading-tight text-foreground/90 group-hover:text-foreground">
        {channel.name}
      </p>
    </Link>
  );
}
