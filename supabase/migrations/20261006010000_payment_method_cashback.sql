-- Saldo de cashback do cliente usado como forma de pagamento.
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'cashback';
