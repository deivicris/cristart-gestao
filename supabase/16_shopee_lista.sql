-- =====================================================================
-- CristART 3D — Script 16: lista da Shopee
-- Cada anúncio pode ter o estoque que vai para a planilha e uma situação (pronto / esperando / não publicar).
-- Rodar no SQL Editor (pode rodar mais de uma vez)
-- =====================================================================
alter table public.produto_anuncios add column if not exists estoque  int;
alter table public.produto_anuncios add column if not exists situacao text;
do $$ begin
  alter table public.produto_anuncios add constraint produto_anuncios_situacao_chk check (situacao is null or situacao in ('pronto','esperando','nao_publicar'));
exception when duplicate_object then null; end $$;

-- Fim. "Success. No rows returned" = tudo certo.
