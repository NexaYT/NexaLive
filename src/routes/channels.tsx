import { createFileRoute } from "@tanstack/react-router";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ChannelCard } from "@/components/ChannelCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/channels")({
  head: () => ({
    meta: [
      { title: "All Channels — NexaLive" },
      { name: "description", content: "Browse and search all live TV channels available on NexaLive." },
    ],
  }),
  component: ChannelsPage,
});

const PAGE_SIZE = 40;

function ChannelsPage() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search.trim()); setPage(0); }, 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(0); }, [activeCat]);

  const { data: categories } = useQuery({
    queryKey: ["channels-cats"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("*").order("sort_order");
      return data ?? [];
    },
  });

  const { data, isFetching } = useQuery({
    queryKey: ["channels-page", debounced, activeCat, page],
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    queryFn: async () => {
      let q = supabase
        .from("channels")
        .select("id,name,logo_url,stream_url,description,category_id", { count: "exact" })
        .order("name")
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (activeCat) q = q.eq("category_id", activeCat);
      if (debounced) q = q.ilike("name", `%${debounced}%`);
      const { data, count, error } = await q;
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  const total = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">All Channels</h1>
      <p className="mt-1 text-muted-foreground">{total.toLocaleString()} channels in your library.</p>

      <div className="mt-6 relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search channels…"
          className="pl-9 bg-surface border-border"
        />
      </div>

      <div className="mt-5 -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:flex-wrap sm:overflow-visible sm:px-0 sm:mx-0">
        <button
          onClick={() => setActiveCat(null)}
          className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${!activeCat ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground hover:text-foreground"}`}
        >All</button>
        {categories?.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCat(cat.id)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${activeCat === cat.id ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground hover:text-foreground"}`}
          >{cat.name}</button>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-4 gap-y-6 gap-x-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 justify-items-center">
        {data?.rows.map((c) => (
          <ChannelCard key={c.id} channel={c} />
        ))}
        {isFetching && !data && Array.from({ length: 16 }).map((_, i) => (
          <div key={i} className="h-20 w-20 sm:h-24 sm:w-24 rounded-full bg-surface animate-pulse" />
        ))}
      </div>
      {data && data.rows.length === 0 && (
        <p className="mt-12 text-center text-muted-foreground">No channels found.</p>
      )}

      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-3">
          <Button variant="secondary" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {page + 1} / {totalPages}</span>
          <Button variant="secondary" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
