-- Teste grátis: CPF ou CNPJ obrigatório, um teste por documento.
ALTER TABLE public.trial_signups ADD COLUMN IF NOT EXISTS document text;
CREATE UNIQUE INDEX IF NOT EXISTS trial_signups_document_key ON public.trial_signups (document) WHERE document IS NOT NULL;
