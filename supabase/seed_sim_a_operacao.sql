-- ============================================================================
-- SIMULAÇÃO A — base operacional da Oficina E2E
-- Clientes, fornecedores, impressoras (manutenção/horas), compras e estoque.
-- Backdated para parecer meses de operação. Rodar via: docker cp + psql -f
-- ============================================================================
\set ON_ERROR_STOP on
select '00486230-3354-4ed8-a7dc-b99bb479f8e9'::uuid as tenant \gset
select usuario_id as creator from public.membership
  where tenant_id = :'tenant' and ativo order by created_at limit 1 \gset

begin;

-- ------------------------------------------------------------------ clientes
insert into public.cliente
  (tenant_id, tipo, nome, email, telefone_whatsapp, cidade, estado,
   canal_origem, indicacao, consentimento_marketing, created_at, created_by)
select :'tenant', v.tipo, v.nome, v.email, v.fone, v.cidade, v.uf,
       v.canal, v.indic, v.consent, now() - (v.dias || ' days')::interval, :'creator'
from (values
  ('pf','Mariana Alves','mari.alves@gmail.com','11 99876-2210','São Paulo','SP','instagram',null,true,250),
  ('pf','Rafael Souza','rafa.souza@gmail.com','11 98123-4455','Guarulhos','SP','indicacao','Mariana Alves',true,230),
  ('pf','Juliana Pereira','ju.pereira@hotmail.com','21 99654-1100','Rio de Janeiro','RJ','marketplace',null,false,200),
  ('pj','Studio Aroma Velas','contato@studioaroma.com.br','11 3344-2200','Campinas','SP','feira',null,true,180),
  ('pf','Bruno Carvalho','bruno.cv@gmail.com','41 99887-3322','Curitiba','PR','instagram',null,true,160),
  ('pf','Camila Nogueira','camila.ng@gmail.com','31 98776-5544','Belo Horizonte','MG','site',null,true,140),
  ('pj','Loja Geek Point','vendas@geekpoint.com.br','11 4002-8922','São Paulo','SP','whatsapp',null,true,120),
  ('pf','Diego Martins','diego.m@gmail.com','51 99123-9988','Porto Alegre','RS','indicacao','Bruno Carvalho',false,95),
  ('pf','Patrícia Lima','paty.lima@gmail.com','85 98654-2211','Fortaleza','CE','instagram',null,true,70),
  ('pj','Decora Mais Interiores','compras@decoramais.com.br','11 3567-1199','Santo André','SP','feira',null,true,52),
  ('pf','Thiago Fernandes','thiago.fer@gmail.com','62 99445-7788','Goiânia','GO','marketplace',null,false,33),
  ('pf','Letícia Rocha','leticia.rocha@gmail.com','47 98321-6677','Joinville','SC','site',null,true,12)
) as v(tipo,nome,email,fone,cidade,uf,canal,indic,consent,dias)
where not exists (select 1 from public.cliente c
  where c.tenant_id=:'tenant' and c.nome=v.nome and c.deleted_at is null);

-- --------------------------------------------------------------- fornecedores
insert into public.fornecedor
  (tenant_id, nome, cnpj, categorias, contato_nome, contato_email, contato_telefone,
   prazo_entrega_dias, pedido_minimo, condicoes_pagamento, avaliacao, endereco, observacoes, created_at, created_by)
select :'tenant', v.nome, v.cnpj, string_to_array(v.cats,','), v.contato, v.email, v.fone,
       v.prazo, v.minimo, v.cond, v.nota, v.ende, v.obs, now() - (v.dias||' days')::interval, :'creator'
from (values
  ('3D Lab Suprimentos','12.345.678/0001-90','filamento,resina','Anderson','vendas@3dlab.com.br','11 3030-1010',5,15000,'Boleto 21 dias',5,'Rua dos Filamentos, 45 — São Paulo/SP','Melhor preço em PLA',210),
  ('FilaMaker Brasil','98.765.432/0001-11','filamento','Carla','contato@filamaker.com.br','47 3535-2020',7,20000,'Pix à vista 5% off',4,'Av. Industrial, 1200 — Joinville/SC','Entrega rápida no Sul',180),
  ('EletroParts Componentes','45.678.123/0001-55','componente','Marcos','marcos@eletroparts.com.br','11 4004-3030',10,10000,'Cartão 3x',4,'Rua da Eletrônica, 88 — São Paulo/SP','LEDs e soquetes',150),
  ('Embala Tudo','33.222.111/0001-44','embalagem','Sandra','sandra@embalatudo.com.br','19 3232-4040',4,8000,'Boleto 14 dias',5,'Rod. Anhanguera km 90 — Campinas/SP',null,120)
) as v(nome,cnpj,cats,contato,email,fone,prazo,minimo,cond,nota,ende,obs,dias)
where not exists (select 1 from public.fornecedor f
  where f.tenant_id=:'tenant' and f.nome=v.nome and f.deleted_at is null);

-- ---------------------------------------------------------------- impressoras
-- horas acumuladas + próxima manutenção nas máquinas existentes
update public.impressora set horas_acumuladas = 1240, proxima_manutencao = current_date + 18, horas_dia = 14
  where tenant_id=:'tenant' and nome='Ender 3 V2';
update public.impressora set horas_acumuladas = 860, proxima_manutencao = current_date + 6, horas_dia = 12
  where tenant_id=:'tenant' and nome='Anycubic Kobra X';
update public.impressora set horas_acumuladas = 410, proxima_manutencao = current_date - 3, horas_dia = 8
  where tenant_id=:'tenant' and nome='Anycubic Photon P1';

-- mais uma máquina na farm
insert into public.impressora
  (tenant_id, nome, tecnologia, fabricante, modelo, numero_serie, status,
   valor_aquisicao, vida_util_horas, consumo_w, manutencao_hora, horas_dia,
   horas_acumuladas, data_aquisicao, proxima_manutencao, created_at, created_by)
select :'tenant','Bambu Lab A1','fdm','Bambu Lab','A1','SN-BLA1-2025-7781','ativa',
       289000, 6000, 95, 80, 16, 520, '2025-11-02', current_date + 30, now() - interval '95 days', :'creator'
where not exists (select 1 from public.impressora i where i.tenant_id=:'tenant' and i.nome='Bambu Lab A1' and i.deleted_at is null);

-- histórico de manutenções
insert into public.impressora_manutencao (tenant_id, impressora_id, data, tipo, custo, observacao, created_at, created_by)
select :'tenant',
       (select id from public.impressora where tenant_id=:'tenant' and nome=v.imp and deleted_at is null limit 1),
       v.data::date, v.tipo, v.custo, v.obs, v.data::timestamptz, :'creator'
from (values
  ('Ender 3 V2','2026-02-14','preventiva',4500,'Troca de bico 0.4 e limpeza geral'),
  ('Ender 3 V2','2026-05-20','corretiva',12000,'Troca da hotend entupida'),
  ('Anycubic Kobra X','2026-04-08','calibracao',0,'Nivelamento e tensão de correias'),
  ('Anycubic Photon P1','2026-03-25','preventiva',3000,'Troca do FEP e limpeza do tanque')
) as v(imp,data,tipo,custo,obs)
where exists (select 1 from public.impressora i where i.tenant_id=:'tenant' and i.nome=v.imp and i.deleted_at is null)
  and not exists (select 1 from public.impressora_manutencao mm
    join public.impressora i on i.id=mm.impressora_id
    where i.tenant_id=:'tenant' and i.nome=v.imp and mm.data=v.data::date and mm.deleted_at is null);

-- manutenções pagas entram no financeiro (saída)
insert into public.lancamento (tenant_id, tipo, descricao, categoria, valor, vencimento, pago_em, status, origem_tipo, created_at, created_by)
select :'tenant','saida','Manutenção '||v.imp,'manutencao',v.custo,v.data::date,v.data::date,'pago','manual',v.data::timestamptz,:'creator'
from (values ('Ender 3 V2','2026-02-14',4500),('Ender 3 V2','2026-05-20',12000),('Anycubic Photon P1','2026-03-25',3000)) as v(imp,data,custo)
where not exists (select 1 from public.lancamento l where l.tenant_id=:'tenant' and l.descricao='Manutenção '||v.imp and l.vencimento=v.data::date);

-- ------------------------------------------------------------ compras/estoque
-- compras recebidas (histórico) — entradas no ledger + contas a pagar
do $$
declare
  v_tenant uuid := '00486230-3354-4ed8-a7dc-b99bb479f8e9';
  v_user uuid;
  v_compra uuid;
  v_forn uuid;
  v_mat uuid;
  v_fator numeric;
  c record;
  it record;
  v_total bigint;
begin
  select usuario_id into v_user from public.membership where tenant_id=v_tenant and ativo limit 1;

  for c in
    select * from (values
      ('3D Lab Suprimentos', 70, 'recebido', json_build_array(
         json_build_object('mat','PLA Branco','qtd',5,'unit',9000),
         json_build_object('mat','PLA Cinza Chumbo','qtd',3,'unit',9000),
         json_build_object('mat','PETG Transparente','qtd',2,'unit',11000))),
      ('FilaMaker Brasil', 45, 'recebido', json_build_array(
         json_build_object('mat','PLA Galaxy Black','qtd',2,'unit',12000),
         json_build_object('mat','PLA Silk Dourado','qtd',2,'unit',14000),
         json_build_object('mat','TPU Flex 95A Preto','qtd',1,'unit',22000))),
      ('EletroParts Componentes', 30, 'recebido', json_build_array(
         json_build_object('mat','Fita LED RGB 1m','qtd',20,'unit',1000),
         json_build_object('mat','Soquete E27 com cabo','qtd',15,'unit',750))),
      ('Embala Tudo', 8, 'enviado', json_build_array(
         json_build_object('mat','Caixa kraft 20cm','qtd',100,'unit',150),
         json_build_object('mat','Saco bolha','qtd',200,'unit',40)))
    ) as t(forn, dias, status, itens)
  loop
    select id into v_forn from public.fornecedor where tenant_id=v_tenant and nome=c.forn and deleted_at is null limit 1;
    v_total := 0;
    insert into public.compra (tenant_id, numero, fornecedor_id, status, previsao, frete, total,
       recebido_em, created_at, created_by)
    values (v_tenant, '', v_forn, c.status::public.status_compra,
       (current_date - c.dias + 5),
       0, 0,
       case when c.status='recebido' then now() - (c.dias||' days')::interval else null end,
       now() - (c.dias||' days')::interval, v_user)
    returning id into v_compra;

    for it in select * from json_array_elements(c.itens) e(o)
    loop
      select id, fator_conversao into v_mat, v_fator from public.material
        where tenant_id=v_tenant and nome=(it.o->>'mat') and deleted_at is null limit 1;
      if v_mat is null then continue; end if;
      insert into public.compra_item (tenant_id, compra_id, material_id, quantidade, custo_unit, recebido, created_at, created_by)
      values (v_tenant, v_compra, v_mat, (it.o->>'qtd')::numeric, (it.o->>'unit')::bigint,
              c.status='recebido', now() - (c.dias||' days')::interval, v_user);
      v_total := v_total + ((it.o->>'qtd')::numeric * (it.o->>'unit')::bigint)::bigint;
      -- entrada no estoque para compras recebidas (ledger atualiza saldo/custo médio)
      if c.status='recebido' then
        insert into public.movimentacao_estoque (tenant_id, material_id, tipo, quantidade, custo_unitario,
          motivo, referencia_tipo, referencia_id, created_by, created_at)
        values (v_tenant, v_mat, 'entrada', (it.o->>'qtd')::numeric * v_fator,
          (it.o->>'unit')::numeric / v_fator, 'recebimento de compra', 'compra', v_compra, v_user,
          now() - (c.dias||' days')::interval);
      end if;
    end loop;

    update public.compra set total = v_total where id = v_compra;
    -- contas a pagar
    insert into public.lancamento (tenant_id, tipo, descricao, categoria, fornecedor_id, valor, vencimento,
       pago_em, status, origem_tipo, origem_id, created_at, created_by)
    values (v_tenant, 'saida', 'Compra de insumos — '||c.forn, 'insumos', v_forn, v_total,
       (current_date - c.dias + 21),
       case when c.status='recebido' then (current_date - c.dias + 21) else null end,
       case when c.status='recebido' then 'pago' else 'pendente' end,
       'compra', v_compra, now() - (c.dias||' days')::interval, v_user);
  end loop;
end $$;

-- alguns materiais propositalmente em nível baixo (alertas no dashboard/estoque)
insert into public.movimentacao_estoque (tenant_id, material_id, tipo, quantidade, motivo, referencia_tipo, created_by)
select :'tenant', m.id, 'saida', greatest(m.saldo - m.minimo*0.6, 0), 'consumo de produção (histórico)', 'ajuste', :'creator'
from public.material m
where m.tenant_id=:'tenant' and m.nome in ('PLA Madeira','Resina Cinza ABS-Like') and m.saldo > m.minimo;

commit;

-- conferência
select 'clientes' k, count(*) from public.cliente where tenant_id=:'tenant' and deleted_at is null
union all select 'fornecedores', count(*) from public.fornecedor where tenant_id=:'tenant' and deleted_at is null
union all select 'impressoras', count(*) from public.impressora where tenant_id=:'tenant' and deleted_at is null
union all select 'manutencoes', count(*) from public.impressora_manutencao mm join public.impressora i on i.id=mm.impressora_id where i.tenant_id=:'tenant'
union all select 'compras', count(*) from public.compra where tenant_id=:'tenant' and deleted_at is null
union all select 'mat. em alerta', count(*) from public.material where tenant_id=:'tenant' and minimo>0 and saldo-reservado<=minimo and deleted_at is null;
