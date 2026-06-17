import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ChannelCard } from "@/components/ChannelCard";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/favorites")({
  head: () => ({ meta: [{ title: "My Favorites — NexaLive" }] }),
  component: FavoritesPage,
});

function FavoritesPage() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["favorites-list", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("favorites")
        .select("channel:channels(*)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      return (data ?? []).map((r) => r.channel).filter(Boolean) as any[];
    },
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight"><Heart className="h-7 w-7 text-primary fill-current" /> My Favorites</h1>
      <p className="mt-1 text-muted-foreground">Your saved channels for quick access.</p>

      {isLoading && <p className="mt-8 text-muted-foreground">Loading…</p>}
      {data && data.length === 0 && (
        <div className="mt-16 text-center">
          <p className="text-muted-foreground">No favorites yet.</p>
          <Link to="/channels" className="mt-3 inline-block text-primary hover:underline">Browse channels →</Link>
        </div>
      )}
      {data && data.length > 0 && (
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {data.map((c) => <div key={c.id} className="w-full"><ChannelCard channel={c} /></div>)}
        </div>
      )}
    </div>
  );
}
