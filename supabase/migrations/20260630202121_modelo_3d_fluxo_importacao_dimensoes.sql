alter table public.modelo_3d
  add column if not exists largura_mm numeric(10,2),
  add column if not exists profundidade_mm numeric(10,2),
  add column if not exists altura_mm numeric(10,2),
  add column if not exists volume_mm3 numeric(16,2),
  add column if not exists arquivo_original_nome text,
  add column if not exists arquivo_original_tamanho_bytes bigint;

alter table public.modelo_3d
  drop constraint if exists modelo_3d_dimensoes_mm_validas,
  add constraint modelo_3d_dimensoes_mm_validas check (
    (largura_mm is null or largura_mm >= 0)
    and (profundidade_mm is null or profundidade_mm >= 0)
    and (altura_mm is null or altura_mm >= 0)
    and (volume_mm3 is null or volume_mm3 >= 0)
    and (arquivo_original_tamanho_bytes is null or arquivo_original_tamanho_bytes >= 0)
  ) not valid;

comment on column public.modelo_3d.largura_mm is 'Largura do bounding box do arquivo 3D, em milimetros.';
comment on column public.modelo_3d.profundidade_mm is 'Profundidade do bounding box do arquivo 3D, em milimetros.';
comment on column public.modelo_3d.altura_mm is 'Altura do bounding box do arquivo 3D, em milimetros.';
comment on column public.modelo_3d.volume_mm3 is 'Volume aproximado calculado a partir do arquivo 3D, em milimetros cubicos.';
comment on column public.modelo_3d.arquivo_original_nome is 'Nome original do arquivo enviado pelo usuario.';
comment on column public.modelo_3d.arquivo_original_tamanho_bytes is 'Tamanho em bytes do arquivo original enviado.';
