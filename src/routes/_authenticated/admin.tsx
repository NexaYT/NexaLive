import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, Pencil, Trash2, Shield, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { importM3uPlaylist } from "@/lib/import-m3u.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Manage Channels — NexaLive" }] }),
  component: AdminPage,
});

interface ChannelForm {
  id?: string;
  name: string;
  description: string;
  logo_url: string;
  stream_url: string;
  category_id: string | null;
  featured: boolean;
}

const EMPTY: ChannelForm = { name: "", description: "", logo_url: "", stream_url: "", category_id: null, featured: false };

function AdminPage() {
  const { user, loading } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ChannelForm>(EMPTY);

  const { data: channels } = useQuery({
    queryKey: ["admin-channels"],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("channels")
        .select("*, categories(name)")
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  const { data: categories } = useQuery({
    queryKey: ["admin-categories"],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("*").order("sort_order");
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async (f: ChannelForm) => {
      const payload = {
        name: f.name,
        description: f.description || null,
        logo_url: f.logo_url || null,
        stream_url: f.stream_url,
        category_id: f.category_id,
        featured: f.featured,
      };
      if (f.id) {
        const { error } = await supabase.from("channels").update(payload).eq("id", f.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("channels").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-channels"] });
      queryClient.invalidateQueries({ queryKey: ["home-channels-v2"] });
      queryClient.invalidateQueries({ queryKey: ["channels-all"] });
      toast.success("Saved!"); setOpen(false); setForm(EMPTY);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("channels").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-channels"] });
      queryClient.invalidateQueries({ queryKey: ["home-channels-v2"] });
      queryClient.invalidateQueries({ queryKey: ["channels-all"] });
      toast.success("Deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (loading) return <div className="p-8 text-muted-foreground">Loading…</div>;

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <Shield className="mx-auto h-12 w-12 text-primary" />
        <h1 className="mt-4 text-2xl font-bold">Sign in to manage channels</h1>
        <Button asChild className="mt-6 bg-gradient-brand text-primary-foreground"><Link to="/auth">Sign in</Link></Button>
      </div>
    );
  }

  const openNew = () => { setForm(EMPTY); setOpen(true); };
  const openEdit = (c: any) => {
    setForm({
      id: c.id, name: c.name, description: c.description ?? "", logo_url: c.logo_url ?? "",
      stream_url: c.stream_url, category_id: c.category_id, featured: c.featured,
    });
    setOpen(true);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl sm:text-3xl font-bold"><Shield className="h-6 w-6 sm:h-7 sm:w-7 text-primary" /> Manage Channels</h1>
          <p className="mt-1 text-sm text-muted-foreground">Add, edit and remove live streams.</p>
        </div>
        <div className="flex gap-2">
          <ImportM3U onDone={() => {
            queryClient.invalidateQueries({ queryKey: ["admin-channels"] });
            queryClient.invalidateQueries({ queryKey: ["home-channels-v2"] });
            queryClient.invalidateQueries({ queryKey: ["channels-all"] });
          }} />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew} className="bg-gradient-brand text-primary-foreground"><Plus className="h-4 w-4" /> Add Channel</Button>
            </DialogTrigger>
            <DialogContent className="bg-surface max-w-lg">
              <DialogHeader><DialogTitle>{form.id ? "Edit" : "New"} Channel</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); save.mutate(form); }} className="space-y-3">
                <div><Label>Name *</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-background" /></div>
                <div><Label>Stream URL (.m3u8) *</Label><Input required type="url" value={form.stream_url} onChange={(e) => setForm({ ...form, stream_url: e.target.value })} placeholder="https://example.com/stream.m3u8" className="bg-background" /></div>
                <div><Label>Logo URL</Label><Input type="url" value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} className="bg-background" /></div>
                <div><Label>Category</Label>
                  <Select value={form.category_id ?? "none"} onValueChange={(v) => setForm({ ...form, category_id: v === "none" ? null : v })}>
                    <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {categories?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="bg-background" /></div>
                <div className="flex items-center gap-3">
                  <Switch checked={form.featured} onCheckedChange={(v) => setForm({ ...form, featured: v })} />
                  <Label>Featured (shown in hero)</Label>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={save.isPending} className="bg-gradient-brand text-primary-foreground">{save.isPending ? "Saving…" : "Save"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="mt-8 overflow-hidden rounded-lg ring-1 ring-border">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs uppercase text-muted-foreground">
            <tr><th className="p-3">Name</th><th className="p-3">Category</th><th className="p-3">Featured</th><th className="p-3 w-32">Actions</th></tr>
          </thead>
          <tbody>
            {channels?.map((c: any) => (
              <tr key={c.id} className="border-t border-border bg-card">
                <td className="p-3 font-medium">{c.name}</td>
                <td className="p-3 text-muted-foreground">{c.categories?.name ?? "—"}</td>
                <td className="p-3">{c.featured ? <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs text-primary">Yes</span> : "—"}</td>
                <td className="p-3">
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete this channel?")) remove.mutate(c.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </td>
              </tr>
            ))}
            {channels?.length === 0 && (
              <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No channels yet. Click "Add Channel" to create your first one.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Showing the most recent 200. Use the M3U import for bulk loads.</p>
    </div>
  );
}

function ImportM3U({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("https://iptv-org.github.io/iptv/index.m3u");
  const [limit, setLimit] = useState("500");
  const [replace, setReplace] = useState(false);
  const importFn = useServerFn(importM3uPlaylist);

  const run = useMutation({
    mutationFn: async () =>
      importFn({ data: { url, limit: Number(limit) || 0, replace } }),
    onSuccess: (r) => {
      toast.success(`Imported ${r.inserted} channels in ${r.categories} categories`);
      setOpen(false);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary"><Download className="h-4 w-4" /> Import M3U</Button>
      </DialogTrigger>
      <DialogContent className="bg-surface max-w-lg">
        <DialogHeader><DialogTitle>Import M3U Playlist</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Playlist URL</Label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} className="bg-background" />
          </div>
          <div>
            <Label>Limit (0 = all)</Label>
            <Input type="number" value={limit} onChange={(e) => setLimit(e.target.value)} className="bg-background" />
            <p className="mt-1 text-xs text-muted-foreground">Start with 500-1000 for smooth performance.</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={replace} onCheckedChange={(v) => setReplace(!!v)} />
            Replace existing channels (delete all first)
          </label>
        </div>
        <DialogFooter>
          <Button onClick={() => run.mutate()} disabled={run.isPending} className="bg-gradient-brand text-primary-foreground">
            {run.isPending ? "Importing…" : "Start Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
