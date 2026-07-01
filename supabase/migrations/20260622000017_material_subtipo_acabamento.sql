-- ============================================================================
-- Surface Labs — material guiado persistente
-- Guarda o subtipo selecionado no cadastro guiado (PLA, PETG, castavel etc.)
-- e o acabamento/aparência de filamentos (silk, fosco, metalizado etc.).
-- ============================================================================

alter table public.material
  add column if not exists subtipo text,
  add column if not exists acabamento text;
