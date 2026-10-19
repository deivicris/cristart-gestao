-- =====================================================================
-- CristART 3D — Script 11: ARQUIVAR ANÚNCIOS
-- Anúncios excluídos vão para o arquivo (dá para restaurar ou apagar de vez).
-- Também atualiza a vitrine do site para ignorar anúncios arquivados.
-- Rodar no SQL Editor (pode rodar mais de uma vez)
-- =====================================================================
alter table public.produto_anuncios add column if not exists arquivado    boolean not null default false;
alter table public.produto_anuncios add column if not exists arquivado_em timestamptz;

drop view if exists public.vitrine;
create view public.vitrine
with (security_invoker = false) as
select
  p.id,
  p.codigo_site,
  p.nome,
  p.categoria,
  p.descricao_breve,
  p.descricao,
  p.preco,
  p.medidas,
  p.fotos,
  p.destaque,
  p.ordem,
  case when p.estoque > 0 then 'pronta_entrega' else 'sob_encomenda' end as disponibilidade,
  p.preco_cartao,
  p.preco_original,
  p.opcoes,
  p.videos,
  coalesce((
    select jsonb_object_agg(case a.plataforma_id when 'ml' then 'mercadolivre' else a.plataforma_id end, a.url)
      from (select distinct on (plataforma_id) plataforma_id, url
              from public.produto_anuncios
             where produto_id = p.id and publicado and not arquivado and url ~ '^https?://'
               and plataforma_id in ('ml','shopee','olx','facebook','tiktok')
             order by plataforma_id, criado_em) a
  ), '{}'::jsonb) as links,
  p.criado_em
from public.produtos p
where p.ativo and p.mostrar_no_site;

revoke all on public.vitrine from anon, authenticated;
grant select on public.vitrine to anon, authenticated;

-- Fim. "Success. No rows returned" = tudo certo.
