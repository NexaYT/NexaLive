
-- Let any signed-in user add/edit/delete channels (not admin-only)
CREATE POLICY "Authenticated can insert channels" ON public.channels
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can update channels" ON public.channels
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can delete channels" ON public.channels
  FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- Helpful indexes for fast home/category browsing on 12k+ rows
CREATE INDEX IF NOT EXISTS idx_channels_category_id ON public.channels(category_id);
CREATE INDEX IF NOT EXISTS idx_channels_featured ON public.channels(featured) WHERE featured = true;
CREATE INDEX IF NOT EXISTS idx_channels_name ON public.channels(name);

-- Server-side aggregator: returns top N channels per category (fast home query)
CREATE OR REPLACE FUNCTION public.home_channels(per_cat int DEFAULT 20, max_cats int DEFAULT 10)
RETURNS TABLE (
  id uuid, name text, logo_url text, stream_url text, description text,
  category_id uuid, category_name text, featured boolean, rn int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ranked AS (
    SELECT c.id, c.name, c.logo_url, c.stream_url, c.description,
           c.category_id, cat.name AS category_name, c.featured,
           row_number() OVER (PARTITION BY c.category_id ORDER BY c.featured DESC, c.sort_order, c.created_at) AS rn,
           cat.sort_order AS cat_order
    FROM public.channels c
    LEFT JOIN public.categories cat ON cat.id = c.category_id
    WHERE c.category_id IS NOT NULL
  ),
  top_cats AS (
    SELECT category_id FROM ranked WHERE rn = 1
    ORDER BY cat_order NULLS LAST LIMIT max_cats
  )
  SELECT r.id, r.name, r.logo_url, r.stream_url, r.description,
         r.category_id, r.category_name, r.featured, r.rn::int
  FROM ranked r
  JOIN top_cats t USING (category_id)
  WHERE r.rn <= per_cat
  ORDER BY r.cat_order NULLS LAST, r.rn;
$$;

GRANT EXECUTE ON FUNCTION public.home_channels(int, int) TO anon, authenticated;
