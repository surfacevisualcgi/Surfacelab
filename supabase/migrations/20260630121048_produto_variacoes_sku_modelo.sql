-- Produto comercial -> variacoes/SKUs vendaveis -> modelo_3d tecnico.
-- Mantem a tabela variacao existente e adiciona os campos necessarios para
-- tamanho, cor, fotos proprias e ligacao direta ao modelo 3D que calcula custo.

alter table public.variacao
  add column if not exists modelo_id uuid references public.modelo_3d (id),
  add column if not exists tamanho text,
  add column if not exists cor_nome text,
  add column if not exists fotos text[] not null default '{}',
  add column if not exists descricao text,
  add column if not exists dimensoes text,
  add column if not exists peso_g numeric(10,2),
  add column if not exists status text not null default 'ativo'
    check (status in ('ativo', 'rascunho', 'arquivado'));

update public.variacao
set fotos = array[foto]
where foto is not null
  and coalesce(array_length(fotos, 1), 0) = 0;

create index if not exists variacao_produto_modelo_idx
  on public.variacao (produto_id, modelo_id)
  where deleted_at is null;

create index if not exists variacao_produto_tamanho_idx
  on public.variacao (produto_id, tamanho)
  where deleted_at is null;
