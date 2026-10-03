-- =====================================================================
-- CristART 3D — Sistema de Gestão
-- Script 03: foto e preço por pacote nos insumos; foto nos rolos
-- Rodar no SQL Editor (pode rodar mais de uma vez)
-- =====================================================================
alter table public.insumos    add column if not exists preco_pacote numeric(10,2);
alter table public.insumos    add column if not exists qtd_pacote   numeric(10,2);
alter table public.insumos    add column if not exists foto         text;
alter table public.filamentos add column if not exists foto         text;

-- Fim. "Success. No rows returned" = tudo certo.
