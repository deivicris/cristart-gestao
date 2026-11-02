-- =====================================================================
-- CristART 3D — Script 19: PESO das embalagens
-- Cada caixa / envelope / acessório de embalagem pode ter o seu peso (g).
-- O sistema soma: peso da peça + caixa + plástico bolha, etiqueta… = peso do pacote (ML e Shopee).
-- Rodar no SQL Editor (pode rodar mais de uma vez).
-- =====================================================================
alter table public.insumos add column if not exists peso_g numeric(10,1);   -- por unidade (ou por metro, nos rolos)

-- Fim. "Success. No rows returned" = tudo certo.
