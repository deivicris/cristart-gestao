-- =====================================================================
-- CristART 3D — Sistema de Gestão
-- Script 05 (etapa 2): vendas também dão baixa nos insumos do produto
-- (embalagem, argola, card…). Rodar no SQL Editor (pode rodar mais de uma vez)
-- =====================================================================

alter table public.vendas add column if not exists baixa_insumos boolean not null default true;
alter table public.vendas add column if not exists cliente text;
alter table public.vendas add column if not exists opcao text;   -- ex.: cor escolhida

create or replace function public.ajusta_por_venda()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- desfaz o efeito antigo (edição ou exclusão)
  if tg_op in ('UPDATE','DELETE') then
    if old.baixa_estoque then
      update produtos set estoque = estoque + old.quantidade where id = old.produto_id;
    end if;
    if old.baixa_insumos then
      update insumos i set estoque = i.estoque + pi.quantidade * old.quantidade
        from produto_insumos pi where pi.produto_id = old.produto_id and pi.insumo_id = i.id;
    end if;
  end if;
  -- aplica o efeito novo
  if tg_op in ('INSERT','UPDATE') then
    if new.baixa_estoque then
      update produtos set estoque = greatest(0, estoque - new.quantidade) where id = new.produto_id;
    end if;
    if new.baixa_insumos then
      update insumos i set estoque = greatest(0, i.estoque - pi.quantidade * new.quantidade)
        from produto_insumos pi where pi.produto_id = new.produto_id and pi.insumo_id = i.id;
    end if;
  end if;
  return coalesce(new, old);
end $$;

-- Fim. "Success. No rows returned" = tudo certo.
