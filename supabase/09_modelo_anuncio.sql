-- =====================================================================
-- CristART 3D — Script 09: anúncio modelo da Fran, regras novas e vários anúncios por plataforma
-- Rodar no SQL Editor (pode rodar mais de uma vez; sobrescreve as regras)
-- =====================================================================
alter table public.configuracoes add column if not exists modelo_anuncio text;

-- Vários anúncios por plataforma no mesmo produto (para duplicar, ter kits, preços diferentes…)
alter table public.produto_anuncios add column if not exists id uuid default gen_random_uuid();
update public.produto_anuncios set id = gen_random_uuid() where id is null;
alter table public.produto_anuncios alter column id set not null;
alter table public.produto_anuncios add column if not exists apelido   text;
alter table public.produto_anuncios add column if not exists criado_em timestamptz not null default now();
do $$
declare pk text; cols text;
begin
  select c.conname, string_agg(a.attname, ',' order by a.attname) into pk, cols
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
   where c.conrelid = 'public.produto_anuncios'::regclass and c.contype = 'p'
   group by c.conname;
  if cols is distinct from 'id' then
    if pk is not null then execute format('alter table public.produto_anuncios drop constraint %I', pk); end if;
    alter table public.produto_anuncios add primary key (id);
  end if;
end $$;
create index if not exists produto_anuncios_produto_idx on public.produto_anuncios (produto_id);

update public.configuracoes set
regras_anuncio = $r$Sempre incluir, perto do final: "📦 Em quantidade, sempre fica mais barato! Chame a gente no chat e consulte preços diferenciados."
Não citar o material (PLA, PETG etc.), não dizer que somos empresa familiar e não dizer que o acabamento é feito à mão.
Não oferecer personalização de cores ou nomes, a não ser que o pedido extra peça.
Sempre ter o bloco "📌 ATENÇÃO" avisando que é impressão 3D (pode ter pequenos detalhes da impressão) e que a cor pode variar com a iluminação e a tela.$r$,
modelo_anuncio = $m$TÍTULO:
Kit 8 Cortador e Marcador de Biscoito Natal Biscuit Massinha de Modelar

DESCRIÇÃO:
KIT 8 PARES DE CORTADORES COM MARCADORES DE BISCOITOS DE NATAL.

Com esse kit você pode criar biscoitos perfeitos para vender, presentear ou compor a mesa natalina. Os cortadores ficam por fora dos marcadores, e os marcadores possuem detalhes internos para facilitar a decoração e trazer charme ao seu trabalho.

✨️ DESTAQUES DO PRODUTO:
- Tamanho aproximado 6cm dependendo do modelo/desenho.
- Leves e fáceis de utilizar e de lavar.
- Modelos variados com tema de Natal.
- Perfeito para massas de biscoitos, pasta americana, trabalhos artesanais biscuit e massinha de modelar.
- Plástico resistente, não-tóxico e seguro para uso em alimentos.
- Possui puxador para tornar o uso mais prático e confortável.

🍪 COMO USAR:
1. Abra a massa de biscoito feita com sua receita favorita;
2. Coloque um pedaço de plástico-filme por cima da massa;
3. Pressione o cortador com o marcador sobre o plástico-filme para cortar e marcar a massa;
4. Retire o cortador com o marcador e o plástico-filme de cima da massa com cuidado para revelar o desenho;
5. Asse e depois decore do seu jeito!

📦 CONTEÚDO DA EMBALAGEM: 08 unidades de cortadores (externo) + 08 unidades de marcadores (interno) de massa de biscoito.

📌 ATENÇÃO:
- NÃO lavar em lava-louças. Não lavar com água quente e não expor ao calor excessivo, para não deformar o material.
- As imagens do ambiente são meramente ilustrativas e servem apenas para demonstrar a utilização dos cortadores marcadores.
- Produto produzido em impressão 3D, portanto pode apresentar pequenos detalhes decorrentes da impressão.
- A tonalidade da cor pode variar de acordo com a iluminação e as configurações do seu dispositivo.

🚀 ENVIO RÁPIDO E SEGURO.
Coletas diárias. Garantimos o despacho do seu pedido o mais rápido possível.
Produto inspecionado antes do envio. Embalado cuidadosamente para chegar perfeito até você.

Se tiver alguma dúvida, nos chame no chat e responderemos o mais rápido possível.

Deixe o espírito do Natal invadir sua cozinha com esse kit lindo!$m$
where id = 1;

-- Fim. "Success. No rows returned" = tudo certo.
