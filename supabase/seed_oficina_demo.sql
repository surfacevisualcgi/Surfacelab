-- ============================================================================
-- SEED DEMO — Oficina E2E: catálogo realista de farm 3D (20 modelos + 20 produtos)
-- Popula a conta como se já estivesse rodando em produção há meses.
-- Idempotente: cada bloco só insere o que ainda não existe (guard por chave
-- natural — codigo_interno do modelo, sku do produto, nome do material/tarefa).
-- Roda como superusuário (psql) — RLS não se aplica; tenant_id é explícito.
-- Uso:  docker exec -i <db> psql -U postgres -d postgres < seed_oficina_demo.sql
-- ============================================================================
\set ON_ERROR_STOP on

-- alvo + autor (primeira membership ativa da Oficina E2E)
select '00486230-3354-4ed8-a7dc-b99bb479f8e9'::uuid as tenant \gset
select usuario_id as creator from public.membership
  where tenant_id = :'tenant' and ativo order by created_at limit 1 \gset

begin;

-- ---------------------------------------------------------------- categorias
insert into public.categoria (tenant_id, nome, escopo, created_by)
select :'tenant', v.nome, v.escopo, :'creator'
from (values
  ('Vasos','modelo'),('Luminárias','modelo'),('Organizadores','modelo'),
  ('Geek & Colecionáveis','modelo'),('Infantil','modelo'),('Decoração','modelo'),
  ('Utilidades','modelo'),
  ('Decoração','produto'),('Iluminação','produto'),('Organização','produto'),
  ('Geek','produto'),('Infantil','produto'),('Utilidades','produto')
) as v(nome,escopo)
where not exists (
  select 1 from public.categoria c
  where c.tenant_id = :'tenant' and c.nome = v.nome and c.escopo = v.escopo
    and c.deleted_at is null);

-- ------------------------------------------------------------------ materiais
-- ajusta custo médio dos insumos que já existiam zerados
update public.material set custo_medio = 850, preco_compra = 850
  where tenant_id = :'tenant' and nome = 'Soquete E27 com cabo';
update public.material set custo_medio = 180, preco_compra = 180
  where tenant_id = :'tenant' and nome = 'Caixa kraft 20cm';

-- novos materiais (custo_medio em centavos por unidade de consumo)
insert into public.material
  (tenant_id, nome, tipo, marca, cor, unidade_compra, unidade_consumo,
   fator_conversao, preco_compra, custo_medio, saldo, minimo, created_by)
select :'tenant', v.nome, v.tipo::public.tipo_material, v.marca, v.cor, v.uc, v.ucons,
       v.fator, v.preco, v.cmedio, v.saldo, v.minimo, :'creator'
from (values
  -- filamentos (custo por g; rolo de 1kg → fator 1000)
  ('PLA Branco',          'filamento','Voolt','Branco',     'kg','g',1000, 11000, 11.0, 1850.0, 300.0),
  ('PLA Cinza Chumbo',    'filamento','Voolt','Cinza',      'kg','g',1000, 11000, 11.0, 1400.0, 300.0),
  ('PLA Vermelho',        'filamento','Voolt','Vermelho',   'kg','g',1000, 11000, 11.0,  900.0, 300.0),
  ('PLA Galaxy Black',    'filamento','3D Fila','Preto',    'kg','g',1000, 14000, 14.0,  750.0, 250.0),
  ('PLA Silk Dourado',    'filamento','3D Fila','Dourado',  'kg','g',1000, 16000, 16.0,  600.0, 200.0),
  ('PLA Madeira',         'filamento','3D Lab','Madeira',   'kg','g',1000, 18000, 18.0,  500.0, 200.0),
  ('PETG Transparente',   'filamento','Voolt','Transparente','kg','g',1000,13000, 13.0, 1200.0, 300.0),
  ('PETG Preto',          'filamento','Voolt','Preto',      'kg','g',1000, 13000, 13.0, 1100.0, 300.0),
  ('TPU Flex 95A Preto',  'filamento','SunLu','Preto',      'kg','g',1000, 24000, 24.0,  450.0, 150.0),
  ('Resina Cinza ABS-Like','resina','Anycubic','Cinza',    'L','ml', 1000, 22000, 22.0,  800.0, 250.0),
  -- componentes (custo por unidade)
  ('Fita LED RGB 1m',     'componente','Generico',null,     'un','un',1,  1200, 1200.0, 40.0, 10.0),
  ('Base de feltro adesiva','componente','Generico',null,   'un','un',1,    90,   90.0, 200.0, 40.0),
  ('Imã neodímio 10mm',   'componente','Generico',null,     'un','un',1,    60,   60.0, 500.0, 100.0),
  ('Parafuso M3x10',      'componente','Generico',null,     'un','un',1,    15,   15.0, 800.0, 200.0),
  -- embalagens (custo por unidade)
  ('Caixa kraft 10cm',    'embalagem','Generico',null,      'un','un',1,   120,  120.0, 120.0, 30.0),
  ('Saco bolha',          'embalagem','Generico',null,      'un','un',1,    50,   50.0, 300.0, 60.0)
) as v(nome,tipo,marca,cor,uc,ucons,fator,preco,cmedio,saldo,minimo)
where not exists (
  select 1 from public.material m
  where m.tenant_id = :'tenant' and m.nome = v.nome and m.deleted_at is null);

-- ----------------------------------------------------------------- mão de obra
insert into public.tarefa_mao_obra (tenant_id, nome, valor_hora, created_by)
select :'tenant', 'Lixamento e pintura', 3500, :'creator'
where not exists (
  select 1 from public.tarefa_mao_obra t
  where t.tenant_id = :'tenant' and t.nome = 'Lixamento e pintura' and t.deleted_at is null);

-- --------------------------------------------------------------------- modelos
-- impressoras de referência por tecnologia (1ª FDM / 1ª resina da Oficina)
select coalesce((select id from public.impressora
  where tenant_id = :'tenant' and tecnologia = 'fdm' and deleted_at is null
  order by created_at limit 1)::text, '') as imp_fdm \gset
select coalesce((select id from public.impressora
  where tenant_id = :'tenant' and tecnologia = 'resina' and deleted_at is null
  order by created_at limit 1)::text, '') as imp_resina \gset

insert into public.modelo_3d
  (tenant_id, codigo_interno, nome, categoria_id, descricao, tecnologia,
   material_recomendado_id, impressora_recomendada_id, perfil_fatiamento, cor,
   bico, altura_camada_mm, preenchimento, paredes, suportes,
   tempo_impressao_min, peso_peca_g, peso_suporte_g, peso_purga_g, peso_desperdicio_g,
   probabilidade_falha, origem, versao, created_by)
select :'tenant', v.cod, v.nome,
       (select id from public.categoria c where c.tenant_id=:'tenant' and c.nome=v.cat and c.escopo='modelo' and c.deleted_at is null limit 1),
       v.descr, v.tec::public.tecnologia_impressao,
       (select id from public.material m where m.tenant_id=:'tenant' and m.nome=v.mat and m.deleted_at is null limit 1),
       case when v.tec='resina' then nullif(:'imp_resina','')::uuid else nullif(:'imp_fdm','')::uuid end,
       v.perfil, v.cor, v.bico, v.camada, v.preench, v.paredes, v.sup,
       v.tempo, v.peca, v.suporte, v.purga, v.desperd, v.falha, 'proprio', 'v1', :'creator'
from (values
  ('VAS-001','Vaso Espiral P','Vasos','Vaso vase-mode parede fina','fdm','PLA Branco','Vaso (vase mode)','Branco','0.4',0.28,0.00,2,false,180, 75,0,2,1,0.04),
  ('VAS-002','Vaso Espiral M','Vasos','Vaso espiralado médio','fdm','PLA Branco','Vaso (vase mode)','Branco','0.4',0.28,0.00,2,false,300,130,0,2,1,0.05),
  ('VAS-003','Vaso Ondulado G','Vasos','Vaso ondulado grande translúcido','fdm','PETG Transparente','Padrão 0.2','Transparente','0.4',0.20,0.10,3,false,480,210,0,3,2,0.07),
  ('LUM-001','Cúpula Lua 15cm','Luminárias','Cúpula esférica texturizada (luminária lua)','fdm','PLA Branco','Padrão 0.2','Branco','0.4',0.20,0.08,3,true,405,110,18,2,2,0.06),
  ('LUM-002','Base de Luminária','Luminárias','Base para cúpula com passagem de cabo','fdm','PLA Cinza Chumbo','Padrão 0.2','Cinza','0.4',0.20,0.15,3,false,150, 95,0,2,1,0.03),
  ('ORG-001','Organizador Mesa 3 div','Organizadores','Organizador de mesa com 3 divisórias','fdm','PLA Cinza Chumbo','Padrão 0.2','Cinza','0.4',0.20,0.15,3,false,240,140,0,2,1,0.03),
  ('ORG-002','Suporte de Headset','Organizadores','Suporte de fone sob a mesa','fdm','PLA Preto Voolt','Padrão 0.2','Preto','0.4',0.20,0.20,4,true,210,120,12,2,1,0.03),
  ('ORG-003','Porta-canetas Hexagonal','Organizadores','Porta-canetas estilo colmeia','fdm','PLA Preto Voolt','Padrão 0.2','Preto','0.4',0.20,0.15,3,false, 90, 55,0,2,1,0.02),
  ('SUP-001','Suporte Celular Dobrável','Utilidades','Suporte de celular articulado','fdm','PETG Preto','Padrão 0.2','Preto','0.4',0.20,0.25,4,true,120, 60, 8,2,1,0.04),
  ('SUP-002','Suporte de Notebook','Utilidades','Suporte ergonômico para notebook','fdm','PLA Cinza Chumbo','Padrão 0.2','Cinza','0.4',0.24,0.20,4,false,600,320,0,3,2,0.06),
  ('GEEK-001','Groot 12cm','Geek & Colecionáveis','Action figure Groot 12cm','fdm','PLA Madeira','Detalhe 0.12','Madeira','0.4',0.12,0.10,3,true,360, 90,35,3,2,0.10),
  ('GEEK-002','Miniatura Dragão','Geek & Colecionáveis','Miniatura de dragão em resina','resina','Resina Cinza ABS-Like','Resina 0.05','Cinza','0.4',0.05,1.00,0,true,480, 45, 9,0,2,0.12),
  ('GEEK-003','Busto Mandaloriano','Geek & Colecionáveis','Busto colecionável em resina','resina','Resina Cinza ABS-Like','Resina 0.05','Cinza','0.4',0.05,1.00,0,true,720,110,20,0,3,0.14),
  ('KID-001','Carrinho de Brinquedo','Infantil','Carrinho com eixos articulados','fdm','PLA Vermelho','Padrão 0.2','Vermelho','0.4',0.20,0.15,3,false,180, 85, 5,2,1,0.04),
  ('KID-002','Quebra-cabeça 3D','Infantil','Quebra-cabeça 3D encaixável','fdm','PLA Galaxy Black','Padrão 0.2','Preto','0.4',0.20,0.20,3,false,150, 70,0,2,1,0.03),
  ('DEC-001','Quadro Geométrico','Decoração','Quadro decorativo geométrico','fdm','PLA Silk Dourado','Padrão 0.2','Dourado','0.4',0.20,0.10,3,false,240,100,0,2,1,0.05),
  ('DEC-002','Vaso Origami','Decoração','Vaso facetado estilo origami','fdm','PETG Transparente','Padrão 0.2','Transparente','0.4',0.20,0.10,3,false,330,150,0,3,2,0.06),
  ('UTIL-001','Suporte para Alexa Echo','Utilidades','Suporte de parede p/ Echo Dot','fdm','PLA Preto Voolt','Padrão 0.2','Preto','0.4',0.20,0.20,3,true,150, 80,10,2,1,0.03),
  ('UTIL-002','Gancho de Parede (par)','Utilidades','Par de ganchos adesivos','fdm','PETG Preto','Padrão 0.2','Preto','0.4',0.20,0.30,4,false, 60, 30,0,2,1,0.02),
  ('FLEX-001','Capa Protetora Flexível','Utilidades','Capa protetora em TPU flexível','fdm','TPU Flex 95A Preto','Flex 0.2','Preto','0.4',0.20,0.20,3,false,240, 65, 6,3,1,0.08)
) as v(cod,nome,cat,descr,tec,mat,perfil,cor,bico,camada,preench,paredes,sup,tempo,peca,suporte,purga,desperd,falha)
where not exists (
  select 1 from public.modelo_3d m
  where m.tenant_id=:'tenant' and m.codigo_interno=v.cod and m.deleted_at is null);

-- -------------------------------------------------------------------- produtos
insert into public.produto
  (tenant_id, sku, nome, categoria_id, descricao, tags, dimensoes, peso_g,
   status, disponibilidade, preco_praticado, qtd_planejada_rateio, estoque_pronto, created_by)
select :'tenant', v.sku, v.nome,
       (select id from public.categoria c where c.tenant_id=:'tenant' and c.nome=v.cat and c.escopo='produto' and c.deleted_at is null limit 1),
       v.descr, string_to_array(v.tags, ','), v.dim, v.peso,
       'ativo', v.disp, v.preco, v.rateio, v.estoque, :'creator'
from (values
  ('P-VAS-P','Vaso Espiral Pequeno','Decoração','Vaso decorativo pequeno, parede fina','vaso,decoração,presente','10 × 10 × 12 cm', 78, 'pronta_entrega', 3990, 50, 6),
  ('P-VAS-M','Vaso Espiral Médio','Decoração','Vaso espiralado médio','vaso,decoração','14 × 14 × 18 cm',135, 'pronta_entrega', 5990, 50, 4),
  ('P-VAS-G','Vaso Ondulado Grande','Decoração','Vaso translúcido grande','vaso,decoração,luxo','18 × 18 × 25 cm',215, 'sob_demanda', 8990, 30, 0),
  ('P-LUM-LUA','Luminária Lua Completa','Iluminação','Luminária lua com LED e base','luminária,led,presente','15 cm Ø',225, 'sob_demanda',12900, 40, 2),
  ('P-ORG-MESA','Organizador de Mesa','Organização','Organizador de mesa 3 divisórias','organizador,escritório','20 × 8 × 6 cm',145, 'pronta_entrega', 6490, 40, 5),
  ('P-ORG-HEAD','Suporte para Headset','Organização','Suporte de fone sob a mesa','headset,gamer,escritório','12 × 10 × 8 cm',122, 'pronta_entrega', 5490, 40, 3),
  ('P-ORG-CAN','Porta-canetas Hexagonal','Organização','Porta-canetas colmeia','organizador,escritório','9 × 9 × 10 cm', 56, 'pronta_entrega', 2990, 60, 8),
  ('P-SUP-CEL','Suporte de Celular Dobrável','Utilidades','Suporte de celular articulado','celular,suporte,brinde','8 × 6 × 7 cm', 62, 'pronta_entrega', 3490, 80,12),
  ('P-SUP-NOTE','Suporte para Notebook','Utilidades','Suporte ergonômico para notebook','notebook,ergonomia,home office','26 × 22 × 14 cm',328, 'sob_demanda',13900, 30, 1),
  ('P-GEEK-GROOT','Groot Decorativo 12cm','Geek','Action figure Groot pintado','groot,geek,colecionável','7 × 7 × 12 cm', 92, 'sob_demanda', 7990, 25, 2),
  ('P-GEEK-DRAGAO','Miniatura Dragão (pintada)','Geek','Miniatura de dragão em resina','dragão,rpg,miniatura','6 × 4 × 5 cm', 46, 'sob_demanda', 8990, 20, 0),
  ('P-GEEK-MANDA','Busto Mandaloriano','Geek','Busto colecionável em resina','starwars,geek,colecionável','12 × 10 × 14 cm',112, 'sob_demanda',18900, 15, 0),
  ('P-KID-CARRO','Carrinho de Brinquedo','Infantil','Carrinho com eixos articulados','brinquedo,infantil,presente','12 × 6 × 5 cm', 86, 'pronta_entrega', 2990, 60,10),
  ('P-KID-PUZZLE','Quebra-cabeça 3D','Infantil','Quebra-cabeça 3D encaixável','brinquedo,puzzle,infantil','10 × 10 × 4 cm', 70, 'pronta_entrega', 3490, 50, 7),
  ('P-DEC-QUADRO','Quadro Geométrico Dourado','Decoração','Quadro geométrico com fixação magnética','quadro,decoração,dourado','20 × 20 × 2 cm',104, 'sob_demanda', 6990, 30, 1),
  ('P-DEC-ORIGAMI','Vaso Origami','Decoração','Vaso facetado estilo origami','vaso,origami,decoração','15 × 15 × 18 cm',152, 'pronta_entrega', 7490, 35, 3),
  ('P-UTIL-ALEXA','Suporte para Alexa Echo','Utilidades','Suporte de parede para Echo Dot','alexa,suporte,casa','11 × 11 × 9 cm', 82, 'pronta_entrega', 4490, 50, 4),
  ('P-UTIL-GANCHO','Kit 2 Ganchos de Parede','Utilidades','Par de ganchos resistentes','gancho,casa,utilidade','6 × 3 × 4 cm', 31, 'pronta_entrega', 2490,100,15),
  ('P-FLEX-CAPA','Capa Protetora Flexível','Utilidades','Capa protetora em TPU','capa,proteção,flexível','9 × 6 × 3 cm', 66, 'sob_demanda', 4990, 40, 2),
  ('P-LUM-ABAJUR','Abajur Geométrico LED','Iluminação','Abajur facetado com LED','abajur,led,decoração','15 × 15 × 22 cm',235, 'sob_demanda',14900, 25, 1)
) as v(sku,nome,cat,descr,tags,dim,peso,disp,preco,rateio,estoque)
where not exists (
  select 1 from public.produto p
  where p.tenant_id=:'tenant' and p.sku=v.sku and p.deleted_at is null);

-- ----------------------------------------------------------------- composição
insert into public.composicao_item
  (tenant_id, produto_id, tipo, modelo_id, material_id, tarefa_id, descricao,
   quantidade, unidade, tempo_min, ordem, created_by)
select :'tenant',
       (select id from public.produto p where p.tenant_id=:'tenant' and p.sku=v.sku and p.deleted_at is null limit 1),
       v.tipo,
       (select id from public.modelo_3d m where m.tenant_id=:'tenant' and m.codigo_interno=v.cod and m.deleted_at is null limit 1),
       (select id from public.material mt where mt.tenant_id=:'tenant' and mt.nome=v.mat and mt.deleted_at is null limit 1),
       (select id from public.tarefa_mao_obra tk where tk.tenant_id=:'tenant' and tk.nome=v.tarefa and tk.deleted_at is null limit 1),
       null, v.qtd, v.un, v.tempo, v.ordem, :'creator'
from (values
  -- sku, ordem, tipo, modelo_cod, material_nome, tarefa_nome, qtd, unidade, tempo_min
  ('P-VAS-P',1,'modelo_impresso','VAS-001','PLA Branco',null,1,'un',null),
  ('P-VAS-P',2,'embalagem',null,'Caixa kraft 10cm',null,1,'un',null),
  ('P-VAS-M',1,'modelo_impresso','VAS-002','PLA Branco',null,1,'un',null),
  ('P-VAS-M',2,'embalagem',null,'Caixa kraft 20cm',null,1,'un',null),
  ('P-VAS-G',1,'modelo_impresso','VAS-003','PETG Transparente',null,1,'un',null),
  ('P-VAS-G',2,'embalagem',null,'Caixa kraft 20cm',null,1,'un',null),
  ('P-LUM-LUA',1,'modelo_impresso','LUM-001','PLA Branco',null,1,'un',null),
  ('P-LUM-LUA',2,'modelo_impresso','LUM-002','PLA Cinza Chumbo',null,1,'un',null),
  ('P-LUM-LUA',3,'componente',null,'Fita LED RGB 1m',null,1,'un',null),
  ('P-LUM-LUA',4,'componente',null,'Soquete E27 com cabo',null,1,'un',null),
  ('P-LUM-LUA',5,'mao_de_obra',null,null,'Montagem e teste',1,'un',20),
  ('P-LUM-LUA',6,'embalagem',null,'Caixa kraft 20cm',null,1,'un',null),
  ('P-ORG-MESA',1,'modelo_impresso','ORG-001','PLA Cinza Chumbo',null,1,'un',null),
  ('P-ORG-MESA',2,'componente',null,'Base de feltro adesiva',null,1,'un',null),
  ('P-ORG-MESA',3,'embalagem',null,'Caixa kraft 20cm',null,1,'un',null),
  ('P-ORG-HEAD',1,'modelo_impresso','ORG-002','PLA Preto Voolt',null,1,'un',null),
  ('P-ORG-HEAD',2,'embalagem',null,'Caixa kraft 20cm',null,1,'un',null),
  ('P-ORG-CAN',1,'modelo_impresso','ORG-003','PLA Preto Voolt',null,1,'un',null),
  ('P-ORG-CAN',2,'embalagem',null,'Caixa kraft 10cm',null,1,'un',null),
  ('P-SUP-CEL',1,'modelo_impresso','SUP-001','PETG Preto',null,1,'un',null),
  ('P-SUP-CEL',2,'embalagem',null,'Saco bolha',null,1,'un',null),
  ('P-SUP-NOTE',1,'modelo_impresso','SUP-002','PLA Cinza Chumbo',null,1,'un',null),
  ('P-SUP-NOTE',2,'componente',null,'Base de feltro adesiva',null,4,'un',null),
  ('P-SUP-NOTE',3,'embalagem',null,'Caixa kraft 20cm',null,1,'un',null),
  ('P-GEEK-GROOT',1,'modelo_impresso','GEEK-001','PLA Madeira',null,1,'un',null),
  ('P-GEEK-GROOT',2,'mao_de_obra',null,null,'Lixamento e pintura',1,'un',30),
  ('P-GEEK-GROOT',3,'embalagem',null,'Caixa kraft 10cm',null,1,'un',null),
  ('P-GEEK-DRAGAO',1,'modelo_impresso','GEEK-002','Resina Cinza ABS-Like',null,1,'un',null),
  ('P-GEEK-DRAGAO',2,'mao_de_obra',null,null,'Lixamento e pintura',1,'un',45),
  ('P-GEEK-DRAGAO',3,'embalagem',null,'Saco bolha',null,1,'un',null),
  ('P-GEEK-MANDA',1,'modelo_impresso','GEEK-003','Resina Cinza ABS-Like',null,1,'un',null),
  ('P-GEEK-MANDA',2,'mao_de_obra',null,null,'Lixamento e pintura',1,'un',60),
  ('P-GEEK-MANDA',3,'embalagem',null,'Caixa kraft 20cm',null,1,'un',null),
  ('P-KID-CARRO',1,'modelo_impresso','KID-001','PLA Vermelho',null,1,'un',null),
  ('P-KID-CARRO',2,'embalagem',null,'Saco bolha',null,1,'un',null),
  ('P-KID-PUZZLE',1,'modelo_impresso','KID-002','PLA Galaxy Black',null,1,'un',null),
  ('P-KID-PUZZLE',2,'embalagem',null,'Caixa kraft 10cm',null,1,'un',null),
  ('P-DEC-QUADRO',1,'modelo_impresso','DEC-001','PLA Silk Dourado',null,1,'un',null),
  ('P-DEC-QUADRO',2,'componente',null,'Imã neodímio 10mm',null,4,'un',null),
  ('P-DEC-QUADRO',3,'embalagem',null,'Caixa kraft 20cm',null,1,'un',null),
  ('P-DEC-ORIGAMI',1,'modelo_impresso','DEC-002','PETG Transparente',null,1,'un',null),
  ('P-DEC-ORIGAMI',2,'embalagem',null,'Caixa kraft 20cm',null,1,'un',null),
  ('P-UTIL-ALEXA',1,'modelo_impresso','UTIL-001','PLA Preto Voolt',null,1,'un',null),
  ('P-UTIL-ALEXA',2,'componente',null,'Base de feltro adesiva',null,1,'un',null),
  ('P-UTIL-ALEXA',3,'embalagem',null,'Saco bolha',null,1,'un',null),
  ('P-UTIL-GANCHO',1,'modelo_impresso','UTIL-002','PETG Preto',null,1,'un',null),
  ('P-UTIL-GANCHO',2,'componente',null,'Parafuso M3x10',null,4,'un',null),
  ('P-UTIL-GANCHO',3,'embalagem',null,'Saco bolha',null,1,'un',null),
  ('P-FLEX-CAPA',1,'modelo_impresso','FLEX-001','TPU Flex 95A Preto',null,1,'un',null),
  ('P-FLEX-CAPA',2,'embalagem',null,'Saco bolha',null,1,'un',null),
  ('P-LUM-ABAJUR',1,'modelo_impresso','DEC-002','PETG Transparente',null,1,'un',null),
  ('P-LUM-ABAJUR',2,'modelo_impresso','LUM-002','PLA Cinza Chumbo',null,1,'un',null),
  ('P-LUM-ABAJUR',3,'componente',null,'Fita LED RGB 1m',null,1,'un',null),
  ('P-LUM-ABAJUR',4,'mao_de_obra',null,null,'Montagem e teste',1,'un',20),
  ('P-LUM-ABAJUR',5,'embalagem',null,'Caixa kraft 20cm',null,1,'un',null)
) as v(sku,ordem,tipo,cod,mat,tarefa,qtd,un,tempo)
where exists (select 1 from public.produto p where p.tenant_id=:'tenant' and p.sku=v.sku and p.deleted_at is null)
  and not exists (
    select 1 from public.composicao_item ci
    join public.produto p on p.id = ci.produto_id
    where p.tenant_id=:'tenant' and p.sku=v.sku and ci.ordem=v.ordem and ci.deleted_at is null);

-- ----------------------------------------- recálculo de custo_atual (cache BOM)
-- Mesma fórmula do front (custoItemComposicao): modelo = peso_total × custo_medio
-- do material; componente/embalagem = custo_medio; mão de obra = (min/60)×valor/h.
update public.produto p
set custo_atual = coalesce(sub.total, 0),
    updated_at = now()
from (
  select ci.produto_id, sum(
    ci.quantidade * (case ci.tipo
      when 'modelo_impresso' then round(
        (m.peso_peca_g + m.peso_suporte_g + m.peso_purga_g + m.peso_desperdicio_g)
        * coalesce(mat.custo_medio, 0))
      when 'componente' then round(coalesce(mat.custo_medio, 0))
      when 'embalagem'  then round(coalesce(mat.custo_medio, 0))
      when 'mao_de_obra' then round((coalesce(ci.tempo_min,0) / 60.0) * coalesce(tar.valor_hora, 0))
      when 'servico'    then coalesce(ci.custo_manual, 0)
      else 0 end))::bigint as total
  from public.composicao_item ci
  left join public.modelo_3d m       on m.id   = ci.modelo_id
  left join public.material mat       on mat.id = ci.material_id
  left join public.tarefa_mao_obra tar on tar.id = ci.tarefa_id
  where ci.deleted_at is null
  group by ci.produto_id
) sub
where p.id = sub.produto_id and p.tenant_id = :'tenant';

-- preço sugerido = custo ÷ (1 − 55%): referência de markup viva na ficha
update public.produto p
set preco_sugerido = round(custo_atual / 0.45)::bigint
where p.tenant_id = :'tenant' and p.custo_atual > 0 and p.sku like 'P-%';

commit;

-- ---------------------------------------------------------------- conferência
select count(*) filter (where tipo='modelo') as cat_modelo,
       count(*) filter (where tipo='produto') as cat_produto
from (select escopo as tipo from public.categoria where tenant_id=:'tenant' and deleted_at is null) c;
select (select count(*) from public.modelo_3d where tenant_id=:'tenant' and deleted_at is null) as modelos,
       (select count(*) from public.produto   where tenant_id=:'tenant' and deleted_at is null) as produtos,
       (select count(*) from public.composicao_item ci join public.produto p on p.id=ci.produto_id where p.tenant_id=:'tenant' and ci.deleted_at is null) as itens_bom;
select p.sku, p.nome, p.custo_atual, p.preco_praticado,
       round((p.preco_praticado - p.custo_atual)::numeric / nullif(p.preco_praticado,0) * 100, 1) as margem_pct
from public.produto p
where p.tenant_id=:'tenant' and p.sku like 'P-%'
order by p.sku;
