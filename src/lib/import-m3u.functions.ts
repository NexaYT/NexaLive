import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

interface ParsedChannel {
  name: string;
  logo: string | null;
  group: string | null;
  url: string;
}

function parseM3U(text: string): ParsedChannel[] {
  const lines = text.split(/\r?\n/);
  const out: ParsedChannel[] = [];
  let cur: Partial<ParsedChannel> | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#EXTINF")) {
      const logo = /tvg-logo="([^"]*)"/.exec(line)?.[1] || null;
      const group = /group-title="([^"]*)"/.exec(line)?.[1] || null;
      const name = line.split(",").slice(1).join(",").trim() || "Unknown";
      cur = { name, logo, group: group?.split(";")[0] || null };
    } else if (line.startsWith("#")) {
      // skip
    } else if (cur) {
      cur.url = line;
      if (cur.url.startsWith("http")) out.push(cur as ParsedChannel);
      cur = null;
    }
  }
  return out;
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "other";
}

export const importM3uPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { url: string; limit?: number; replace?: boolean; sync?: boolean }) => d)
  .handler(async ({ data, context }) => {
    if (!context.userId) throw new Error("Sign in required");

    const res = await fetch(data.url);
    if (!res.ok) throw new Error(`Failed to fetch playlist: ${res.status}`);
    const text = await res.text();
    let parsed = parseM3U(text);
    if (data.limit && data.limit > 0) parsed = parsed.slice(0, data.limit);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.replace) {
      await supabaseAdmin.from("channels").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    }

    // Build categories from current group-title values
    const groupSet = new Map<string, string>(); // slug -> name
    for (const c of parsed) {
      const g = c.group || "Other";
      groupSet.set(slugify(g), g);
    }
    const catRows = Array.from(groupSet.entries()).map(([slug, name], i) => ({
      slug,
      name,
      sort_order: i,
    }));
    if (catRows.length) {
      await supabaseAdmin.from("categories").upsert(catRows, { onConflict: "slug" });
    }

    const { data: cats } = await supabaseAdmin.from("categories").select("id, slug");
    const slugToId = new Map((cats ?? []).map((c) => [c.slug, c.id]));

    // Fetch existing channels keyed by stream_url to support sync (idempotent re-import)
    const existing = new Map<string, { id: string; category_id: string | null; name: string; logo_url: string | null }>();
    if (!data.replace) {
      const PAGE = 1000;
      let from = 0;
      while (true) {
        const { data: rows, error } = await supabaseAdmin
          .from("channels")
          .select("id, stream_url, category_id, name, logo_url")
          .range(from, from + PAGE - 1);
        if (error) throw new Error(`Read existing failed: ${error.message}`);
        if (!rows || rows.length === 0) break;
        for (const r of rows) existing.set(r.stream_url, r);
        if (rows.length < PAGE) break;
        from += PAGE;
      }
    }

    const toInsert: any[] = [];
    const toUpdate: { id: string; patch: any }[] = [];

    for (const c of parsed) {
      const category_id = slugToId.get(slugify(c.group || "Other")) ?? null;
      const ex = existing.get(c.url);
      if (ex) {
        const patch: any = {};
        if (ex.category_id !== category_id) patch.category_id = category_id;
        if (ex.name !== c.name) patch.name = c.name;
        if ((ex.logo_url ?? null) !== (c.logo ?? null)) patch.logo_url = c.logo;
        if (Object.keys(patch).length > 0) toUpdate.push({ id: ex.id, patch });
      } else {
        toInsert.push({
          name: c.name,
          logo_url: c.logo,
          stream_url: c.url,
          category_id,
          featured: false,
        });
      }
    }

    const BATCH = 500;
    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const chunk = toInsert.slice(i, i + BATCH);
      const { error } = await supabaseAdmin.from("channels").insert(chunk);
      if (error) throw new Error(`Insert failed at batch ${i}: ${error.message}`);
      inserted += chunk.length;
    }

    let updated = 0;
    for (const u of toUpdate) {
      const { error } = await supabaseAdmin.from("channels").update(u.patch).eq("id", u.id);
      if (!error) updated++;
    }

    return { inserted, updated, categories: catRows.length };
  });

export const syncCategoriesFromM3U = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { url: string }) => d)
  .handler(async ({ data, context }) => {
    if (!context.userId) throw new Error("Sign in required");

    const res = await fetch(data.url);
    if (!res.ok) throw new Error(`Failed to fetch playlist: ${res.status}`);
    const parsed = parseM3U(await res.text());

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Upsert categories
    const groupSet = new Map<string, string>();
    for (const c of parsed) {
      const g = c.group || "Other";
      groupSet.set(slugify(g), g);
    }
    const catRows = Array.from(groupSet.entries()).map(([slug, name], i) => ({ slug, name, sort_order: i }));
    if (catRows.length) {
      await supabaseAdmin.from("categories").upsert(catRows, { onConflict: "slug" });
    }
    const { data: cats } = await supabaseAdmin.from("categories").select("id, slug");
    const slugToId = new Map((cats ?? []).map((c) => [c.slug, c.id]));

    // Build url -> category_id map from M3U
    const urlToCat = new Map<string, string | null>();
    for (const c of parsed) {
      urlToCat.set(c.url, slugToId.get(slugify(c.group || "Other")) ?? null);
    }

    // Walk existing channels and update where category differs
    let updated = 0;
    let scanned = 0;
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data: rows, error } = await supabaseAdmin
        .from("channels")
        .select("id, stream_url, category_id")
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`Read failed: ${error.message}`);
      if (!rows || rows.length === 0) break;
      scanned += rows.length;
      for (const r of rows) {
        if (!urlToCat.has(r.stream_url)) continue;
        const newCat = urlToCat.get(r.stream_url) ?? null;
        if (r.category_id !== newCat) {
          const { error: uErr } = await supabaseAdmin.from("channels").update({ category_id: newCat }).eq("id", r.id);
          if (!uErr) updated++;
        }
      }
      if (rows.length < PAGE) break;
      from += PAGE;
    }

    return { updated, scanned, categories: catRows.length };
  });
