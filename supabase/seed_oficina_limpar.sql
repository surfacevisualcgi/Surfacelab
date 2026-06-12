-- Limpa os registros do seed demo (Oficina E2E) para reimportar com UTF-8 correto.
-- Casamento ASCII-seguro (sku, codigo_interno, LIKE em prefixos sem acento) para
-- pegar tambem as linhas que ficaram com acentos corrompidos no 1o import.
select '00486230-3354-4ed8-a7dc-b99bb479f8e9'::uuid as tenant \gset
begin;
delete from public.composicao_item ci using public.produto p
  where ci.produto_id = p.id and p.tenant_id = :'tenant' and p.sku like 'P-%';
delete from public.produto where tenant_id = :'tenant' and sku like 'P-%';
delete from public.modelo_3d where tenant_id = :'tenant'
  and codigo_interno in ('VAS-001','VAS-002','VAS-003','LUM-001','LUM-002',
    'ORG-001','ORG-002','ORG-003','SUP-001','SUP-002','GEEK-001','GEEK-002',
    'GEEK-003','KID-001','KID-002','DEC-001','DEC-002','UTIL-001','UTIL-002','FLEX-001');
delete from public.material where tenant_id = :'tenant' and (
  nome in ('PLA Branco','PLA Cinza Chumbo','PLA Vermelho','PLA Galaxy Black',
    'PLA Silk Dourado','PLA Madeira','PETG Transparente','PETG Preto',
    'TPU Flex 95A Preto','Resina Cinza ABS-Like','Fita LED RGB 1m',
    'Base de feltro adesiva','Parafuso M3x10','Caixa kraft 10cm','Saco bolha')
  or nome like 'Im_ neod%');   -- "Imã neodímio 10mm" (acento pode estar corrompido)
delete from public.tarefa_mao_obra where tenant_id = :'tenant' and nome = 'Lixamento e pintura';
delete from public.categoria where tenant_id = :'tenant' and (
  nome in ('Vasos','Organizadores','Infantil','Utilidades')
  or nome like 'Lumin%' or nome like 'Geek%' or nome like 'Decora%'
  or nome like 'Ilumina%' or nome like 'Organiza%');
commit;
