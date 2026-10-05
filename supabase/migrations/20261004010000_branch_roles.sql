-- Filiais (plano Enterprise): cargos de gestão das filiais.
--   manager    = gerente: administra UMA filial (como o admin, só nela)
--   supervisor = acompanha e administra as filiais que forem dele
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'supervisor';
