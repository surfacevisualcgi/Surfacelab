-- ============================================================================
-- Surface Labs — 0003 Catálogo: modelo 3D, produto, composição (BOM)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- modelo_3d — ficha técnica da peça impressa (≠ produto)
-- ----------------------------------------------------------------------------
create table public.modelo_3d (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenant (id) on delete cascade,
  nome                text not null,
  codigo_interno      text,
  categoria_id        uuid references public.categoria (id),
  descricao           text,
  fotos               text[] not null default '{}',     -- paths no Storage
  -- arquivos e versões
  arquivo_original    text,
  arquivos_derivados  text[] not null default '{}',
  versao              text not null default 'v1',
  versao_notas        text,
  -- licença comercial
  origem              text not null default 'proprio'
    check (origem in ('proprio', 'comprado', 'gratuito')),
  autor               text,
  tipo_licenca        text,
  custo_aquisicao     public.centavos not null default 0,
  licenca_validade    date,
  direitos_uso        text,
  -- configuração de impressão recomendada
  tecnologia          public.tecnologia_impressao not null default 'fdm',
  impressora_recomendada_id uuid references public.impressora (id),
  material_recomendado_id   uuid references public.material (id),
  perfil_fatiamento   text,
  cor                 text,
  bico                text,
  altura_camada_mm    numeric(5,2),
  preenchimento       numeric(5,4) check (preenchimento between 0 and 1),
  paredes             smallint,
  suportes            boolean not null default false,
  -- estimativas do fatiador (pesos separados — importam no custo real)
  tempo_impressao_min integer not null default 0,       -- minutos
  peso_peca_g         numeric(10,2) not null default 0, -- g (FDM) ou ml/g (resina)
  peso_suporte_g      numeric(10,2) not null default 0,
  peso_purga_g        numeric(10,2) not null default 0,
  peso_desperdicio_g  numeric(10,2) not null default 0,
  -- qualidade
  instrucoes          jsonb not null default '[]'::jsonb,
  checklist_qualidade jsonb not null default '[]'::jsonb,
  -- risco (decisão §7.3: probabilidade de falha É por modelo; fração 0–1)
  probabilidade_falha numeric(5,4) not null default 0.05
    check (probabilidade_falha between 0 and 1),
  -- resultados acumulados
  custo_estimado      public.centavos not null default 0,
  custo_real_medio    public.centavos not null default 0,
  qtd_producoes       integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid default auth.uid(),
  deleted_at          timestamptz
);
call app.politicas_padrao('modelo_3d', 'modelos');
create policy modelo_3d_limite on public.modelo_3d as restrictive for insert
  with check (app.dentro_do_limite('modelos'));

-- ----------------------------------------------------------------------------
-- produto — item efetivamente vendido (combina modelos + componentes + etc.)
-- ----------------------------------------------------------------------------
create table public.produto (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenant (id) on delete cascade,
  sku                   text,
  nome                  text not null,
  categoria_id          uuid references public.categoria (id),
  descricao             text,
  tags                  text[] not null default '{}',
  fotos                 text[] not null default '{}',
  dimensoes             text,
  peso_g                numeric(10,2),
  status                text not null default 'ativo'
    check (status in ('ativo', 'rascunho', 'arquivado')),
  disponibilidade       text not null default 'sob_demanda'
    check (disponibilidade in ('pronta_entrega', 'sob_demanda')),
  -- financeiro do produto (sob flag ver_custos — ver view v_produto)
  custo_atual           public.centavos not null default 0, -- cache da composição
  preco_sugerido        public.centavos not null default 0,
  preco_praticado       public.centavos not null default 0,
  -- desenvolvimento amortizado (§5.1)
  custo_desenvolvimento public.centavos not null default 0,
  qtd_planejada_rateio  integer not null default 0,
  -- estoque de produto acabado (pronta entrega)
  estoque_pronto        integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid default auth.uid(),
  deleted_at            timestamptz
);
call app.politicas_padrao('produto', 'produtos');
create policy produto_limite on public.produto as restrictive for insert
  with check (app.dentro_do_limite('produtos'));

-- variações de venda (tamanho/cor/material/acabamento/kit)
create table public.variacao (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenant (id) on delete cascade,
  produto_id  uuid not null references public.produto (id) on delete cascade,
  nome        text not null,
  codigo      text,
  preco       public.centavos not null default 0,
  estoque     integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  deleted_at  timestamptz
);
call app.politicas_padrao('variacao', 'produtos');

-- ----------------------------------------------------------------------------
-- composicao_item — BOM do produto (modelos impressos, componentes, embalagem,
-- serviços, mão de obra). custo_unitario aqui é "vivo" (vem do cadastro); o
-- congelamento acontece no snapshot do orçamento/pedido.
-- ----------------------------------------------------------------------------
create table public.composicao_item (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenant (id) on delete cascade,
  produto_id      uuid not null references public.produto (id) on delete cascade,
  tipo            text not null
    check (tipo in ('modelo_impresso', 'componente', 'embalagem', 'servico', 'mao_de_obra')),
  modelo_id       uuid references public.modelo_3d (id),
  material_id     uuid references public.material (id),
  tarefa_id       uuid references public.tarefa_mao_obra (id),
  descricao       text,                                  -- para serviços/avulsos
  quantidade      numeric(12,4) not null default 1 check (quantidade > 0),
  unidade         text not null default 'un',
  -- custo manual para tipo=servico (sem cadastro); demais derivam do cadastro
  custo_manual    public.centavos,
  tempo_min       integer,                               -- p/ mao_de_obra
  fornecedor_id   uuid references public.fornecedor (id),
  substituto_de   uuid references public.composicao_item (id),
  ordem           integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid default auth.uid(),
  deleted_at      timestamptz,
  constraint composicao_ref_coerente check (
    (tipo = 'modelo_impresso' and modelo_id is not null)
    or (tipo in ('componente', 'embalagem') and material_id is not null)
    or (tipo = 'mao_de_obra' and tarefa_id is not null)
    or (tipo = 'servico')
  )
);
call app.politicas_padrao('composicao_item', 'produtos');
create index composicao_produto_idx on public.composicao_item (produto_id);

-- preço/margem por canal de venda
create table public.produto_canal (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenant (id) on delete cascade,
  produto_id      uuid not null references public.produto (id) on delete cascade,
  canal_id        uuid not null references public.canal_venda (id) on delete cascade,
  preco_praticado public.centavos not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid default auth.uid(),
  deleted_at      timestamptz,
  unique (produto_id, canal_id)
);
call app.politicas_padrao('produto_canal', 'produtos');
