-- Remove (soft-delete) o lixo de teste da Oficina E2E para a conta refletir
-- uma operação limpa. Casamento por chaves ASCII (sku/codigo/numero).
\set ON_ERROR_STOP on
select '00486230-3354-4ed8-a7dc-b99bb479f8e9'::uuid as tenant \gset
begin;

-- composição dos produtos de teste
update public.composicao_item ci set deleted_at = now()
  from public.produto p
  where ci.produto_id = p.id and p.tenant_id = :'tenant'
    and p.sku in ('LUM-001','VASO-M','0122221112');

-- produtos de teste
update public.produto set deleted_at = now()
  where tenant_id = :'tenant' and sku in ('LUM-001','VASO-M','0122221112');

-- modelos de teste ("teste"=sdsdsds e "Luminária Lua 15cm"=sem código)
update public.modelo_3d set deleted_at = now()
  where tenant_id = :'tenant' and (codigo_interno = 'sdsdsds' or codigo_interno is null);

-- pedidos antigos de teste + cascata lógica (itens, OPs, lançamentos)
update public.pedido_item i set deleted_at = now()
  from public.pedido p where i.pedido_id = p.id and p.tenant_id = :'tenant'
    and p.numero in ('PED-0001','PED-0002','PED-0003','PED-0004');
update public.ordem_producao o set deleted_at = now()
  from public.pedido p where o.pedido_id = p.id and p.tenant_id = :'tenant'
    and p.numero in ('PED-0001','PED-0002','PED-0003','PED-0004');
update public.lancamento l set deleted_at = now()
  from public.pedido p where l.origem_tipo = 'pedido' and l.origem_id = p.id
    and p.tenant_id = :'tenant' and p.numero in ('PED-0001','PED-0002','PED-0003','PED-0004');
update public.pedido set deleted_at = now()
  where tenant_id = :'tenant' and numero in ('PED-0001','PED-0002','PED-0003','PED-0004');

commit;

select 'produtos ativos' k, count(*) from public.produto where tenant_id=:'tenant' and deleted_at is null
union all select 'modelos ativos', count(*) from public.modelo_3d where tenant_id=:'tenant' and deleted_at is null
union all select 'pedidos ativos', count(*) from public.pedido where tenant_id=:'tenant' and deleted_at is null;
