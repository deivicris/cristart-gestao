-- =====================================================================
-- CristART 3D — cadastra o pedido antigo: 100 Chaveiros Flor com Ímã (Juliana Gibim)
-- Rodar UMA vez no SQL Editor, depois do script 06. Se rodar de novo, não duplica.
-- =====================================================================
do $$
declare
  pid uuid;
  autor text := 'deivicris@gmail.com';
begin
  if exists (select 1 from public.pedidos where titulo = '100 Chaveiros Flor com Ímã — Juliana Gibim') then
    raise notice 'Pedido já cadastrado — nada feito.';
    return;
  end if;

  insert into public.pedidos (titulo, cliente_nome, canal, status, data_pedido, prazo, entregue_em,
                              valor_combinado, pagamento, quitado, perda_prevista_pct, observacoes, licoes, criado_por)
  values ('100 Chaveiros Flor com Ímã — Juliana Gibim', 'Juliana Gibim', 'site', 'pronto',
          date '2026-09-28', date '2026-10-05', date '2026-10-05',
          850, 'Pix', true, 15,
          'PLA Rosa (Flashforge), Verde Menta (Flashforge) e Branco (Bambu Lab). Impresso na Kobra X e na Kobra 4. Consumo total estimado: ~1,5 kg com as perdas.',
          E'• Primeira camada: calibrar a altura (mm) e a largura das linhas ANTES de soltar o lote.\n• Letras finas nas últimas camadas (JB e o nome): testar uma peça antes; letra muito pequena falha.\n• Eixo que articula as peças: dividir o modelo e reimprimir só os eixos que derem problema, em vez da peça inteira.\n• Pedido grande personalizado: prever mais perda no orçamento (aqui foi ~15%).',
          autor)
  returning id into pid;

  insert into public.pedido_itens (pedido_id, descricao, quantidade, preco_unit, material, gramas_unit, feitas, ordem)
  values (pid, 'Chaveiro Flor com Ímã', 100, 8.50, 'PLA', 13, 100, 0);

  -- filamento das peças boas (~1,3 kg) — não mexe nos rolos nem no estoque
  insert into public.impressoes (data, quantidade, gramas, observacoes, pedido_id, soma_estoque, criado_por)
  values (date '2026-10-05', 100, 1300,
          'Lote do pedido da Juliana (rosa, verde menta e branco · Kobra X e Kobra 4) — valores estimados; horas não registradas',
          pid, false, autor);

  -- perdas: 200 g
  insert into public.perdas (data, gramas, motivo, pedido_id, criado_por)
  values (date '2026-10-05', 200, 'Primeira camada, letras finas e eixos (pedido da Juliana)', pid, autor);

  -- ímãs: usa o insumo cadastrado, se houver (não tira do estoque)
  insert into public.pedido_custos (pedido_id, tipo, insumo_id, descricao, quantidade, custo_unit, baixado)
  select pid, 'insumo', i.id, i.nome, 100, coalesce(i.custo_unitario, 0), false
  from public.insumos i
  where i.nome ~* '\m(í|i)m(ã|a)s?\M'
  order by i.nome limit 1;

  insert into public.pedido_notas (pedido_id, texto, autor) values
  (pid, E'Dificuldades:\n• Primeira camada — demorou até acertar quantos mm usar e a largura das linhas.\n• Últimas camadas com as letras finas do JB e o nome dela: letras bem pequenas.\n• O eixo que conecta e articula as peças deu problema; aprendi a dividir as peças e reimprimir só os eixos.\nUsamos a Kobra X e a Kobra 4 — foram muitas horas!', autor);
end $$;

-- "Success. No rows returned" = tudo certo.
