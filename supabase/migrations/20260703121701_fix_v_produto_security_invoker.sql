-- Mantem a view v_produto como security invoker para respeitar permissoes/RLS
-- do usuario autenticado no Supabase Data API.
alter view public.v_produto set (security_invoker = true);
