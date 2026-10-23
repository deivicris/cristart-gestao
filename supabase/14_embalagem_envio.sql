-- =====================================================================
-- CristART 3D — Script 14: EMBALAGEM DE ENVIO
-- Insumos podem ser "de embalagem" (caixa, envelope, plástico bolha, etiqueta de frágil…)
-- e ter unidade em metros (ex.: 0,5 m de plástico bolha).
-- Rodar no SQL Editor (pode rodar mais de uma vez). Precisa do script 13.
-- =====================================================================
alter table public.insumos add column if not exists embalagem boolean not null default false;
alter table public.insumos add column if not exists formato   text;   -- 'caixa' | 'envelope' | null (acessório)
do $$ begin
  alter table public.insumos add constraint insumos_formato_chk check (formato is null or formato in ('caixa','envelope'));
exception when duplicate_object then null; end $$;
update public.insumos set embalagem = true, formato = 'caixa' where e_caixa and formato is null;

-- Fim. "Success. No rows returned" = tudo certo.
