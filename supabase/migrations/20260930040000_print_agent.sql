-- Agente local de impressão: uma chave por restaurante, só o servidor lê.
CREATE TABLE public.print_agent_keys (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  key_hash text NOT NULL UNIQUE,
  key_hint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  agent_info jsonb
);
ALTER TABLE public.print_agent_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.print_agent_keys FROM anon, authenticated;
GRANT ALL ON public.print_agent_keys TO service_role;
