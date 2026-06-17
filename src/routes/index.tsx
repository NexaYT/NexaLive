import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Play, Plus, Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ChannelRow } from "@/components/ChannelRow";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NexaLive — Watch Live TV Channels Online" },
      { name: "description", content: "Stream news, sports, movies, and entertainment live from around the world." },
    ],
  }),
  component: Home,
});

type HomeRow = {
  id: string; name: string; logo_url: string | null; stream_url: string;
  description: string | null; category_id: string; category_name: string;
  featured: boolean; rn: number;
};

function Home() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["home-channels-v2"],
    staleTime: 60_000,
    queryFn: async () => {
      // Single fast RPC: top 20 channels across top 12 categories
      const { data: rows, error } = await supabase.rpc("home_channels", { per_cat: 20, max_cats: 12 });
      if (error) throw error;
      return (rows ?? []) as HomeRow[];
    },
  });

  // Group by category preserving server order
  const groups: { id: string; name: string; channels: HomeRow[] }[] = [];
  const seen = new Map<string, number>();
  for (const r of data ?? []) {
    let idx = seen.get(r.category_id);
    if (idx === undefined) {
      idx = groups.length;
      seen.set(r.category_id, idx);
      groups.push({ id: r.category_id, name: r.category_name ?? "Other", channels: [] });
    }
    groups[idx].channels.push(r);
  }

  const featured = data?.find((c) => c.featured) ?? data?.[0];
  const empty = !isLoading && (!data || data.length === 0);

  return (
    <div className="pb-12">
      {/* Hero — lighter, no fixed bg, no blur for buttery scroll */}
      <section className="relative w-full overflow-hidden border-b border-border/40">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-background to-background" />
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-accent/20 blur-3xl pointer-events-none" />
        <div className="relative mx-auto flex max-w-7xl flex-col justify-center px-4 py-14 sm:px-6 sm:py-20">
          {featured ? (
            <>
              <span className="mb-4 inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary ring-1 ring-primary/30">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
                Live Now
              </span>
              <h1 className="max-w-3xl text-3xl font-black leading-[1.05] tracking-tight sm:text-5xl">
                {featured.name}
              </h1>
              {featured.description && (
                <p className="mt-3 max-w-xl text-sm text-muted-foreground sm:text-base line-clamp-2">
                  {featured.description}
                </p>
              )}
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild size="lg" className="bg-gradient-brand text-primary-foreground font-semibold shadow-glow hover:opacity-90">
                  <Link to="/watch/$id" params={{ id: featured.id }}>
                    <Play className="h-5 w-5 fill-current" /> Watch Now
                  </Link>
                </Button>
                <Button asChild size="lg" variant="secondary">
                  <Link to="/channels">Browse All</Link>
                </Button>
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-brand shadow-glow">
                <Radio className="h-8 w-8 text-primary-foreground" />
              </div>
              <h1 className="text-3xl font-black sm:text-5xl">
                Welcome to <span className="text-gradient-brand">NexaLive</span>
              </h1>
              <p className="mt-3 text-muted-foreground">
                {empty
                  ? "No channels yet. Add your first live stream to get started."
                  : "Loading the live lineup…"}
              </p>
              {empty && (
                <Button asChild className="mt-6 bg-gradient-brand text-primary-foreground shadow-glow">
                  <Link to={user ? "/admin" : "/auth"}>
                    <Plus className="h-4 w-4 mr-1" />
                    {user ? "Add Channels" : "Sign in to Add Channels"}
                  </Link>
                </Button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Rows by category */}
      <div className="mt-6 space-y-2">
        {isLoading && (
          <div className="mx-auto max-w-7xl px-4 sm:px-6 space-y-6">
            {[0, 1, 2].map((i) => (
              <div key={i}>
                <div className="h-5 w-32 rounded bg-surface animate-pulse mb-3" />
                <div className="flex gap-3 overflow-hidden">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <div key={j} className="h-32 w-48 shrink-0 rounded-lg bg-surface animate-pulse" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {groups.map((g) => (
          <ChannelRow key={g.id} title={g.name} channels={g.channels} />
        ))}
      </div>
    </div>
  );
}
