ALTER TABLE public.restaurant_tables ADD COLUMN IF NOT EXISTS merge_group_id uuid;
CREATE INDEX IF NOT EXISTS restaurant_tables_merge_group_idx ON public.restaurant_tables (merge_group_id);