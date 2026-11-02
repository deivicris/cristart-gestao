-- =====================================================================
-- CristART 3D — Script 18: MERCADO LIVRE (publicar direto do sistema)
-- Guarda a conexão com a conta do ML e, em cada anúncio, o código do item publicado.
-- Rodar no SQL Editor (pode rodar mais de uma vez).
-- =====================================================================

-- Conexão com a conta do Mercado Livre (uma só). Só a função "mercado-livre" usa estes dados.
create table if not exists public.ml_conta (
  id             int primary key default 1 check (id = 1),
  user_id        bigint,
  nickname       text,
  access_token   text,
  refresh_token  text,
  expira_em      timestamptz,
  tags           jsonb,
  conectado_por  text default (auth.jwt() ->> 'email'),
  atualizado_em  timestamptz not null default now()
);
alter table public.ml_conta enable row level security;
drop policy if exists "membros acessam" on public.ml_conta;
create policy "membros acessam" on public.ml_conta for all to authenticated
  using (public.eh_membro()) with check (public.eh_membro());
revoke all on public.ml_conta from anon;

-- Em cada anúncio: o item no ML e o que foi escolhido na publicação
alter table public.produto_anuncios add column if not exists ml_item_id   text;
alter table public.produto_anuncios add column if not exists ml_status    text;
alter table public.produto_anuncios add column if not exists ml_categoria text;
alter table public.produto_anuncios add column if not exists ml_dados     jsonb;   -- características, tipo de anúncio, pacote…
create index if not exists produto_anuncios_ml_item_idx on public.produto_anuncios (ml_item_id);

-- Fim. "Success. No rows returned" = tudo certo.
