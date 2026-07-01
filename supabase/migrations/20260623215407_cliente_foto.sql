-- Foto de contato do cliente no bucket privado `fotos`.
-- Como foto de contato é dado pessoal, a view só expõe o path quando a flag
-- ver_pii_cliente está ativa, igual e-mail/telefone/documento.

alter table public.cliente
  add column if not exists foto text;

create or replace view public.v_cliente
with (security_invoker = false, security_barrier = true) as
select
  c.id, c.tenant_id, c.tipo, c.nome,
  case when app.tem_flag('ver_pii_cliente') then c.cpf_cnpj end as cpf_cnpj,
  case when app.tem_flag('ver_pii_cliente') then c.email end as email,
  case when app.tem_flag('ver_pii_cliente') then c.telefone_whatsapp end as telefone_whatsapp,
  case when app.tem_flag('ver_pii_cliente') then c.cep end as cep,
  case when app.tem_flag('ver_pii_cliente') then c.endereco end as endereco,
  c.cidade, c.estado, c.canal_origem, c.indicacao,
  case when app.tem_flag('ver_pii_cliente') then c.observacoes end as observacoes,
  c.consentimento_marketing, c.consentimento_em, c.consentimento_versao,
  c.anonimizado, c.created_at, c.updated_at, c.deleted_at,
  app.tem_flag('ver_pii_cliente') as pii_visivel,
  case when app.tem_flag('ver_pii_cliente') then c.foto end as foto
from public.cliente c
where c.tenant_id = app.current_tenant_id()
  and app.tem_permissao('clientes', 'ver');
