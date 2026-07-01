-- Hardening after Supabase advisors on the cloud migration.
-- Views should execute with the querying user's privileges/RLS.
alter view public.v_pedido set (security_invoker = true);
alter view public.v_pedido_item set (security_invoker = true);
alter view public.v_ordem_producao set (security_invoker = true);
alter view public.v_simulacao set (security_invoker = true);
alter view public.v_cliente set (security_invoker = true);
alter view public.v_orcamento set (security_invoker = true);
alter view public.v_orcamento_item set (security_invoker = true);
alter view public.v_produto set (security_invoker = true);

-- Keep helper routines from inheriting caller-controlled search_path.
alter function app.set_updated_at() set search_path = '';
alter procedure app.politicas_padrao(text, text) set search_path = '';
alter function app.proteger_orcamento() set search_path = '';
alter function app.proteger_orcamento_item() set search_path = '';
alter function app.ledger_imutavel() set search_path = '';
