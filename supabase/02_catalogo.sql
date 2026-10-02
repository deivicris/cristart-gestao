-- =====================================================================
-- CristART 3D — Sistema de Gestão
-- Script 02: campos do catálogo do site + revenda
-- Rodar no SQL Editor depois do script 01 (pode rodar mais de uma vez)
-- =====================================================================

-- Campos que o site já usa
alter table public.produtos add column if not exists preco_cartao   numeric(10,2);
alter table public.produtos add column if not exists preco_original numeric(10,2);  -- preço "de" riscado
alter table public.produtos add column if not exists opcoes         jsonb not null default '[]'::jsonb; -- ex.: [{"name":"Cor","choices":["Branco","Preto"]}]
alter table public.produtos add column if not exists videos         text[] not null default '{}';

-- Produto impresso por nós ou revenda (fones, mouses...)
alter table public.produtos add column if not exists tipo_produto   text not null default 'impresso';
alter table public.produtos add column if not exists custo_compra   numeric(10,2);   -- só para revenda
do $$ begin
  alter table public.produtos add constraint produtos_tipo_chk check (tipo_produto in ('impresso','revenda'));
exception when duplicate_object then null; end $$;

-- Categorias (mesmas do site)
alter table public.configuracoes add column if not exists categorias text[] not null
  default array['Decoração','Chaveiros','Expositores','Gamer','Brinquedos','Utilidades','Acessórios'];

-- Taxa da maquininha (o site usa 12% para calcular o preço no cartão)
alter table public.configuracoes add column if not exists taxa_cartao_pct numeric(6,2) not null default 12;

-- Vitrine pública com os novos campos (nada de custo aparece aqui)
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
  p.preco_cartao,
  p.preco_original,
  p.opcoes,
  p.medidas,
  p.fotos,
  p.videos,
  p.destaque,
  p.ordem,
  case when p.estoque > 0 then 'pronta_entrega' else 'sob_encomenda' end as disponibilidade
from public.produtos p
where p.ativo and p.mostrar_no_site;

revoke all on public.vitrine from anon, authenticated;
grant select on public.vitrine to anon, authenticated;

-- Fran e Gui liberados no sistema
insert into public.membros (email, nome) values
  ('franfranjinha@gmail.com', 'Fran'),
  ('eaegui06@gmail.com',      'Gui')
on conflict (email) do nothing;

-- Fim. "Success. No rows returned" = tudo certo.
