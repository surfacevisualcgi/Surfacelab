alter table public.modelo_3d
  add column if not exists tags text[] not null default '{}';

comment on column public.modelo_3d.tags is 'Marcadores livres para busca e organizacao do modelo 3D.';
