
CREATE OR REPLACE FUNCTION public.home_channels(per_cat int DEFAULT 20, max_cats int DEFAULT 10)
RETURNS TABLE (
  id uuid, name text, logo_url text, stream_url text, description text,
  category_id uuid, category_name text, featured boolean, rn int
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
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
