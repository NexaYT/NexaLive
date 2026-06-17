import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Heart } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { VideoPlayer } from "@/components/VideoPlayer";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/watch/$id")({
  component: WatchPage,
  notFoundComponent: () => (
    <div className="mx-auto max-w-2xl px-6 py-20 text-center">
      <h1 className="text-2xl font-bold">Channel not found</h1>
      <Link to="/" className="mt-4 inline-block text-primary hover:underline">← Back to home</Link>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-2xl px-6 py-20 text-center">
      <h1 className="text-2xl font-bold">Failed to load</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
    </div>
  ),
});

function WatchPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: channel } = useQuery({
    queryKey: ["channel", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("channels").select("*, categories(name)").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) throw notFound();
      return data;
    },
  });

  const { data: isFav } = useQuery({
    queryKey: ["fav", id, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("favorites").select("id").eq("channel_id", id).eq("user_id", user!.id).maybeSingle();
      return !!data;
    },
  });

  const toggleFav = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in to save favorites");
      if (isFav) {
        await supabase.from("favorites").delete().eq("channel_id", id).eq("user_id", user.id);
      } else {
        await supabase.from("favorites").insert({ channel_id: id, user_id: user.id });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fav", id] });
      queryClient.invalidateQueries({ queryKey: ["favorites-list"] });
      toast.success(isFav ? "Removed from favorites" : "Added to favorites");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!channel) return <div className="p-8 text-muted-foreground">Loading…</div>;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <div className="mt-4">
        <VideoPlayer src={channel.stream_url} poster={channel.logo_url} />
      </div>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{channel.name}</h1>
          {channel.categories && (
            <span className="mt-1 inline-block rounded-full bg-surface px-3 py-0.5 text-xs font-medium text-muted-foreground">
              {(channel.categories as { name: string }).name}
            </span>
          )}
          {channel.description && (
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{channel.description}</p>
          )}
        </div>
        {user ? (
          <Button
            onClick={() => toggleFav.mutate()}
            variant={isFav ? "default" : "secondary"}
            className={isFav ? "bg-primary" : ""}
          >
            <Heart className={`h-4 w-4 ${isFav ? "fill-current" : ""}`} />
            {isFav ? "Saved" : "Add to Favorites"}
          </Button>
        ) : (
          <Button asChild variant="secondary"><Link to="/auth">Sign in to save</Link></Button>
        )}
      </div>
    </div>
  );
}
