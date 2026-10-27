-- =====================================================================
-- CristART 3D — Script 17: produto em MAIS DE UMA CATEGORIA
-- A categoria principal continua (é a que vai para Shopee/ML); as outras fazem o produto
-- aparecer também nesses filtros do site e do sistema. Ex.: principal Natal + também em Decoração.
-- Rodar no SQL Editor (pode rodar mais de uma vez). Precisa do 15.
-- =====================================================================
alter table public.produtos add column if not exists categorias_extra text[] not null default '{}';

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
  p.criado_em,
  case p.atacado_modo
    when 'manual' then (
      select jsonb_agg(jsonb_build_object('min', (f->>'min')::int, 'preco', round((f->>'preco')::numeric, 2)) order by (f->>'min')::int)
        from jsonb_array_elements(coalesce(p.atacado_faixas, '[]'::jsonb)) f
       where (f->>'preco') is not null and (f->>'preco')::numeric > 0)
    when 'auto' then (
      select jsonb_agg(jsonb_build_object('min', (f->>'min')::int, 'preco', round(p.preco * (1 - (f->>'pct')::numeric / 100), 2)) order by (f->>'min')::int)
        from configuracoes c, jsonb_array_elements(coalesce(c.atacado_faixas, '[]'::jsonb)) f
       where c.id = 1 and p.preco > 0)
  end as atacado,
  coalesce(p.categorias_extra, '{}') as categorias_extra
from public.produtos p
where p.ativo and p.mostrar_no_site;

revoke all on public.vitrine from anon, authenticated;
grant select on public.vitrine to anon, authenticated;

-- Fim. "Success. No rows returned" = tudo certo.
