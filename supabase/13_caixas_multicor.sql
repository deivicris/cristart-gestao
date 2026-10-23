-- =====================================================================
-- CristART 3D — Script 13: CAIXAS DE ENVIO e MULTICOR
-- Caixas são insumos com medidas; o produto escolhe a caixa dele e o custo entra no total.
-- Rodar no SQL Editor (pode rodar mais de uma vez)
-- =====================================================================
alter table public.insumos  add column if not exists e_caixa  boolean not null default false;
alter table public.insumos  add column if not exists caixa_c  numeric(6,1);   -- comprimento (cm)
alter table public.insumos  add column if not exists caixa_l  numeric(6,1);   -- largura (cm)
alter table public.insumos  add column if not exists caixa_a  numeric(6,1);   -- altura (cm)
alter table public.produtos add column if not exists caixa_id uuid references public.insumos(id) on delete set null;
alter table public.produtos add column if not exists multicor boolean not null default false;

-- Venda com "baixa nos insumos" também tira 1 caixa por unidade vendida
create or replace function public.ajusta_por_venda()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE','DELETE') then
    if old.baixa_estoque then
      update produtos set estoque = estoque + old.quantidade where id = old.produto_id;
    end if;
    if old.baixa_insumos then
      update insumos i set estoque = i.estoque + pi.quantidade * old.quantidade
        from produto_insumos pi where pi.produto_id = old.produto_id and pi.insumo_id = i.id;
      update insumos i set estoque = i.estoque + old.quantidade
        from produtos p where p.id = old.produto_id and p.caixa_id = i.id
         and not exists (select 1 from produto_insumos pi where pi.produto_id = p.id and pi.insumo_id = i.id);
    end if;
  end if;
  if tg_op in ('INSERT','UPDATE') then
    if new.baixa_estoque then
      update produtos set estoque = greatest(0, estoque - new.quantidade) where id = new.produto_id;
    end if;
    if new.baixa_insumos then
      update insumos i set estoque = greatest(0, i.estoque - pi.quantidade * new.quantidade)
        from produto_insumos pi where pi.produto_id = new.produto_id and pi.insumo_id = i.id;
      update insumos i set estoque = greatest(0, i.estoque - new.quantidade)
        from produtos p where p.id = new.produto_id and p.caixa_id = i.id
         and not exists (select 1 from produto_insumos pi where pi.produto_id = p.id and pi.insumo_id = i.id);
    end if;
  end if;
  return coalesce(new, old);
end $$;

-- Fim. "Success. No rows returned" = tudo certo.
