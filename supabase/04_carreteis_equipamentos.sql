-- =====================================================================
-- CristART 3D — Sistema de Gestão
-- Script 04: carretéis vazios (tara), foto e novos tipos de equipamento
-- Rodar no SQL Editor (pode rodar mais de uma vez)
-- =====================================================================

-- Carretéis vazios: cada marca/modelo pesa diferente
create table if not exists public.carreteis (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,              -- ex.: "Carretel papelão Masterprint"
  marca      text,
  peso_g     numeric(10,1) not null,     -- peso do carretel vazio
  foto       text,
  criado_em  timestamptz not null default now()
);
alter table public.carreteis enable row level security;
drop policy if exists "membros acessam" on public.carreteis;
create policy "membros acessam" on public.carreteis for all to authenticated
  using (public.eh_membro()) with check (public.eh_membro());
revoke all on public.carreteis from anon;

-- Cada rolo pode lembrar qual carretel usa
alter table public.filamentos add column if not exists carretel_id uuid references public.carreteis(id) on delete set null;

-- Equipamentos: foto e "qual é", quando o tipo for Outro
alter table public.equipamentos add column if not exists foto      text;
alter table public.equipamentos add column if not exists tipo_outro text;

-- Novos tipos de equipamento
alter table public.equipamentos drop constraint if exists equipamentos_tipo_check;
alter table public.equipamentos add constraint equipamentos_tipo_check check (tipo in
  ('impressora','impressora_papel','acabamento','medicao','secagem','fotografia','informatica','ferramenta','outro'));

-- Arruma o que já está cadastrado
update public.equipamentos set tipo = 'impressora_papel'
  where tipo = 'impressora' and (nome ilike '%epson%' or modelo ilike '%L1250%' or marca ilike '%epson%');
update public.equipamentos set tipo = 'acabamento'
  where tipo = 'ferramenta' and (nome ilike '%retifica%' or nome ilike '%retífica%' or nome ilike '%alicate%' or nome ilike '%lixa%' or nome ilike '%estilete%');
update public.equipamentos set tipo = 'medicao'
  where tipo = 'ferramenta' and (nome ilike '%paqu%' or nome ilike '%balan%' or nome ilike '%régua%' or nome ilike '%regua%');
update public.equipamentos set tipo = 'fotografia'
  where tipo = 'ferramenta' and (nome ilike '%expositor%' or nome ilike '%luz%' or nome ilike '%foto%');

-- Fim. "Success. No rows returned" = tudo certo.
