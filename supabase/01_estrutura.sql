-- =====================================================================
-- CristART 3D — Sistema de Gestão
-- Script 01: estrutura do banco (tabelas, regras de acesso, automações)
-- Rodar UMA vez no Supabase: SQL Editor › New query › colar › Run
-- =====================================================================

-- ---------- Quem pode usar o sistema ---------------------------------
create table if not exists public.membros (
  email      text primary key,
  nome       text not null,
  criado_em  timestamptz not null default now()
);

-- true quando quem está logado é um dos membros
create or replace function public.eh_membro()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.membros
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ---------- Configurações gerais (uma linha só) ----------------------
create table if not exists public.configuracoes (
  id                    int primary key default 1 check (id = 1),
  kwh                   numeric(8,4) not null default 1.05,   -- R$/kWh com impostos
  margem_pct            numeric(8,2) not null default 200,    -- margem padrão do preço sugerido
  hora_maquina          numeric(8,2) not null default 1.00,   -- R$/h (opcional por produto)
  faixas_acabamento     text[] not null default array['0–5 min','5–10 min','10–15 min','15–30 min','30+ min'],
  whatsapp              text default '(41) 98523-8301',
  local_retirada        text default 'Xaxim, Curitiba',
  formas_entrega        text default 'Uber Flash ou em mãos, a combinar',
  atualizado_em         timestamptz not null default now()
);
insert into public.configuracoes (id) values (1) on conflict do nothing;

-- ---------- Plataformas de venda -------------------------------------
create table if not exists public.plataformas (
  id               text primary key,                 -- 'shopee', 'ml', ...
  nome             text not null,
  taxa_pct         numeric(6,2) not null default 0,  -- % sobre a venda
  taxa_fixa        numeric(10,2) not null default 0, -- R$ por venda
  permite_contato  boolean not null default false,   -- pode ter WhatsApp no anúncio?
  ativa            boolean not null default true,
  ordem            int not null default 0
);
insert into public.plataformas (id, nome, permite_contato, ordem) values
  ('site',     'Site / WhatsApp', true,  1),
  ('facebook', 'Facebook',        true,  2),
  ('olx',      'OLX',             true,  3),
  ('shopee',   'Shopee',          false, 4),
  ('ml',       'Mercado Livre',   false, 5),
  ('tiktok',   'TikTok Shop',     false, 6)
on conflict (id) do nothing;

-- ---------- Equipamentos (impressoras e outros) ----------------------
create table if not exists public.equipamentos (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  tipo          text not null default 'impressora' check (tipo in ('impressora','ferramenta','outro')),
  marca         text,
  modelo        text,
  valor_pago    numeric(10,2),
  data_compra   date,
  potencia_w    int,               -- consumo médio imprimindo (watts)
  horas_iniciais numeric(10,2) not null default 0,  -- horas já rodadas antes do sistema
  status        text not null default 'ativo' check (status in ('ativo','chegando','manutencao','desativado')),
  link_compra   text,
  observacoes   text,
  criado_em     timestamptz not null default now()
);

-- ---------- Filamentos (cada rolo) -----------------------------------
create table if not exists public.filamentos (
  id             uuid primary key default gen_random_uuid(),
  tipo           text not null,              -- PLA, PETG, PLA Silk...
  cor            text not null,
  cor_hex        text default '#CCCCCC',
  marca          text,
  peso_inicial_g numeric(10,1) not null default 1000,
  restante_g     numeric(10,1) not null default 1000,
  preco_pago     numeric(10,2) not null default 0,
  data_compra    date,
  link_compra    text,
  arquivado      boolean not null default false,  -- rolo acabou
  observacoes    text,
  criado_em      timestamptz not null default now()
);

-- ---------- Insumos e extras -----------------------------------------
create table if not exists public.insumos (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  custo_unitario  numeric(10,4) not null default 0,
  estoque         numeric(10,2) not null default 0,
  unidade         text not null default 'un',
  link_compra     text,
  observacoes     text,
  criado_em       timestamptz not null default now()
);

-- ---------- Produtos -------------------------------------------------
create table if not exists public.produtos (
  id                   uuid primary key default gen_random_uuid(),
  codigo_site          text unique,          -- id antigo do site (ex.: p1789603679545)
  nome                 text not null,
  categoria            text,
  descricao_breve      text,
  descricao            text,
  preco                numeric(10,2),        -- preço Pix / site
  material             text,                 -- PLA, PETG...
  gramas               numeric(10,1),        -- filamento por unidade
  tempo_min            int,                  -- tempo de impressão por unidade
  medidas              text,
  peso_g               numeric(10,1),
  acabamento_faixa     text,
  acabamento_tarefas   text,
  impressora_padrao    uuid references public.equipamentos(id) on delete set null,
  usa_hora_maquina     boolean not null default true,
  estoque              int not null default 0,
  fotos                text[] not null default '{}',
  mostrar_no_site      boolean not null default true,
  destaque             boolean not null default false,
  ordem                int not null default 0,
  ativo                boolean not null default true,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now()
);

-- insumos que cada produto usa
create table if not exists public.produto_insumos (
  produto_id  uuid references public.produtos(id) on delete cascade,
  insumo_id   uuid references public.insumos(id) on delete cascade,
  quantidade  numeric(10,2) not null default 1,
  primary key (produto_id, insumo_id)
);

-- onde cada produto está anunciado
create table if not exists public.produto_anuncios (
  produto_id     uuid references public.produtos(id) on delete cascade,
  plataforma_id  text references public.plataformas(id) on delete cascade,
  url            text,
  preco          numeric(10,2),     -- preço praticado naquela plataforma
  titulo         text,
  descricao      text,
  publicado      boolean not null default false,
  atualizado_em  timestamptz not null default now(),
  primary key (produto_id, plataforma_id)
);

-- ---------- Produção, perdas e vendas (etapa 2) ----------------------
create table if not exists public.impressoes (
  id            uuid primary key default gen_random_uuid(),
  data          date not null default current_date,
  produto_id    uuid references public.produtos(id) on delete set null,
  impressora_id uuid references public.equipamentos(id) on delete set null,
  filamento_id  uuid references public.filamentos(id) on delete set null,
  quantidade    int not null default 1 check (quantidade > 0),
  tempo_min     int,
  gramas        numeric(10,1),          -- total da impressão
  observacoes   text,
  criado_por    text default (auth.jwt() ->> 'email'),
  criado_em     timestamptz not null default now()
);

create table if not exists public.perdas (
  id            uuid primary key default gen_random_uuid(),
  data          date not null default current_date,
  gramas        numeric(10,1),
  filamento_id  uuid references public.filamentos(id) on delete set null,
  impressora_id uuid references public.equipamentos(id) on delete set null,
  tempo_min     int,
  motivo        text,
  criado_por    text default (auth.jwt() ->> 'email'),
  criado_em     timestamptz not null default now()
);

create table if not exists public.vendas (
  id             uuid primary key default gen_random_uuid(),
  data           date not null default current_date,
  produto_id     uuid references public.produtos(id) on delete set null,
  quantidade     int not null default 1 check (quantidade > 0),
  plataforma_id  text references public.plataformas(id) on delete set null,
  pagamento      text,
  valor_total    numeric(10,2) not null default 0,
  taxa           numeric(10,2) not null default 0,
  custo_unitario numeric(10,2) not null default 0,  -- foto do custo no dia da venda
  baixa_estoque  boolean not null default true,     -- false = encomenda impressa sob demanda
  observacoes    text,
  criado_por     text default (auth.jwt() ->> 'email'),
  criado_em      timestamptz not null default now()
);

-- ---------- Automações: estoque e filamento se ajustam sozinhos ------
create or replace function public.ajusta_por_impressao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE','DELETE') then
    update produtos   set estoque    = estoque - old.quantidade where id = old.produto_id;
    update filamentos set restante_g = greatest(0, restante_g + coalesce(old.gramas,0)) where id = old.filamento_id;
  end if;
  if tg_op in ('INSERT','UPDATE') then
    update produtos   set estoque    = estoque + new.quantidade where id = new.produto_id;
    update filamentos set restante_g = greatest(0, restante_g - coalesce(new.gramas,0)) where id = new.filamento_id;
  end if;
  return coalesce(new, old);
end $$;

create or replace function public.ajusta_por_perda()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE','DELETE') then
    update filamentos set restante_g = greatest(0, restante_g + coalesce(old.gramas,0)) where id = old.filamento_id;
  end if;
  if tg_op in ('INSERT','UPDATE') then
    update filamentos set restante_g = greatest(0, restante_g - coalesce(new.gramas,0)) where id = new.filamento_id;
  end if;
  return coalesce(new, old);
end $$;

create or replace function public.ajusta_por_venda()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE','DELETE') and old.baixa_estoque then
    update produtos set estoque = estoque + old.quantidade where id = old.produto_id;
  end if;
  if tg_op in ('INSERT','UPDATE') and new.baixa_estoque then
    update produtos set estoque = greatest(0, estoque - new.quantidade) where id = new.produto_id;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_impressoes on public.impressoes;
create trigger trg_impressoes after insert or update or delete on public.impressoes
  for each row execute function public.ajusta_por_impressao();

drop trigger if exists trg_perdas on public.perdas;
create trigger trg_perdas after insert or update or delete on public.perdas
  for each row execute function public.ajusta_por_perda();

drop trigger if exists trg_vendas on public.vendas;
create trigger trg_vendas after insert or update or delete on public.vendas
  for each row execute function public.ajusta_por_venda();

create or replace function public.marca_atualizacao()
returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end $$;

drop trigger if exists trg_produtos_upd on public.produtos;
create trigger trg_produtos_upd before update on public.produtos
  for each row execute function public.marca_atualizacao();

-- ---------- Regras de acesso (RLS) -----------------------------------
-- Só membros logados leem e escrevem. Visitantes não veem nada das tabelas.
do $$
declare t text;
begin
  foreach t in array array['membros','configuracoes','plataformas','equipamentos','filamentos',
                           'insumos','produtos','produto_insumos','produto_anuncios',
                           'impressoes','perdas','vendas']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "membros acessam" on public.%I', t);
    execute format('create policy "membros acessam" on public.%I for all to authenticated
                    using (public.eh_membro()) with check (public.eh_membro())', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ---------- Vitrine pública: o que o SITE pode ler -------------------
-- Só informações de vitrine. Custos, gramas, links internos: nunca.
create or replace view public.vitrine
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
  case when p.estoque > 0 then 'pronta_entrega' else 'sob_encomenda' end as disponibilidade
from public.produtos p
where p.ativo and p.mostrar_no_site;

revoke all on public.vitrine from anon, authenticated;
grant select on public.vitrine to anon, authenticated;

-- ---------- Fotos dos produtos ---------------------------------------
-- Leitura pública (o site mostra as fotos); envio só por membros.
insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', true)
on conflict (id) do nothing;

drop policy if exists "membros enviam fotos" on storage.objects;
create policy "membros enviam fotos" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and public.eh_membro());

drop policy if exists "membros alteram fotos" on storage.objects;
create policy "membros alteram fotos" on storage.objects for update to authenticated
  using (bucket_id = 'fotos' and public.eh_membro());

drop policy if exists "membros apagam fotos" on storage.objects;
create policy "membros apagam fotos" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and public.eh_membro());

-- ---------- Primeiro membro ------------------------------------------
-- (Fran e Gui entram depois, quando tivermos os e-mails deles)
insert into public.membros (email, nome) values ('deivicris@gmail.com', 'Deivi')
on conflict (email) do nothing;

-- =====================================================================
-- Fim. Se aparecer "Success. No rows returned", deu tudo certo.
-- =====================================================================
