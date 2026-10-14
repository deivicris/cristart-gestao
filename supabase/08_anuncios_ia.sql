-- =====================================================================
-- CristART 3D — Sistema de Gestão
-- Script 08: ANÚNCIOS COM IA (etapa 3) + Instagram
-- Rodar no SQL Editor (pode rodar mais de uma vez)
-- =====================================================================

-- Instagram como plataforma (pode ter contato no texto)
insert into public.plataformas (id, nome, permite_contato, ordem) values
  ('instagram', 'Instagram', true, 7)
on conflict (id) do nothing;

-- Textos gerados ficam guardados junto do anúncio de cada plataforma
alter table public.produto_anuncios add column if not exists palavras_chave text;
alter table public.produto_anuncios add column if not exists gerado_por     text;   -- 'gemini', 'manual'…
alter table public.produto_anuncios add column if not exists gerado_em      timestamptz;

-- Regras que todo anúncio deve seguir + modelo do Gemini
alter table public.configuracoes add column if not exists regras_anuncio text default
E'Sempre incluir: "Em quantidade, sempre fica mais barato! Chame a gente e peça um orçamento especial."\nPeças feitas em impressão 3D, uma a uma, com acabamento à mão.\nPersonalizamos cores e nomes sob encomenda.';
alter table public.configuracoes add column if not exists ia_modelo text default 'gemini-3.8-flash';
update public.configuracoes
   set regras_anuncio = coalesce(regras_anuncio, E'Sempre incluir: "Em quantidade, sempre fica mais barato! Chame a gente e peça um orçamento especial."\nPeças feitas em impressão 3D, uma a uma, com acabamento à mão.\nPersonalizamos cores e nomes sob encomenda.'),
       ia_modelo = coalesce(ia_modelo, 'gemini-3.8-flash')
 where id = 1;

-- Fim. "Success. No rows returned" = tudo certo.
