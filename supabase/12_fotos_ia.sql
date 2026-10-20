-- =====================================================================
-- CristART 3D — Script 12: FOTOS COM IA (Gemini / Nano Banana)
-- Guarda o consumo de imagens para o sistema respeitar o teto mensal.
-- Rodar no SQL Editor (pode rodar mais de uma vez)
-- =====================================================================
alter table public.configuracoes add column if not exists ia_limite_mes    numeric(10,2) not null default 30;     -- teto em R$ por mês
alter table public.configuracoes add column if not exists ia_custo_imagem  numeric(10,2) not null default 0.25;   -- estimativa em R$ por imagem
alter table public.configuracoes add column if not exists ia_modelo_imagem text not null default 'gemini-nano-banana-2.1';

create table if not exists public.ia_uso (
  id          uuid primary key default gen_random_uuid(),
  criado_em   timestamptz not null default now(),
  tipo        text not null default 'imagem',
  quantidade  int not null default 1,
  custo       numeric(10,2) not null default 0,
  produto_id  uuid references public.produtos(id) on delete set null,
  modelo      text,
  autor       text default (auth.jwt() ->> 'email')
);
alter table public.ia_uso enable row level security;
drop policy if exists "membros acessam" on public.ia_uso;
create policy "membros acessam" on public.ia_uso for all to authenticated
  using (public.eh_membro()) with check (public.eh_membro());
revoke all on public.ia_uso from anon;

-- Fim. "Success. No rows returned" = tudo certo.
