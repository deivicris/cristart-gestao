// CristART 3D — Edge Function "gerar-anuncio"
// Recebe os dados de um produto e devolve um anúncio por plataforma, escrito pelo Gemini.
// A chave fica no segredo GEMINI_API_KEY do Supabase (nunca no site nem no navegador).

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function b64(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

async function ehMembro(req: Request): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL");
  const auth = req.headers.get("authorization") || "";
  const apikey = req.headers.get("apikey") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!url || !auth) return false;
  const r = await fetch(`${url}/rest/v1/membros?select=email&limit=1`, { headers: { apikey, Authorization: auth } });
  if (!r.ok) return false;
  const rows = await r.json();
  return Array.isArray(rows) && rows.length > 0; // as regras do banco só mostram membros para membros
}

const ESTILO: Record<string, string> = {
  shopee: "Shopee: título forte para a busca (palavra principal no começo, sem emojis, sem CAIXA ALTA inteira). Descrição em tópicos curtos com emojis moderados: benefícios, material, medidas, cores, cuidados, o que vem na embalagem. NÃO escreva telefone, WhatsApp, Instagram, links nem peça contato fora da plataforma (é proibido).",
  ml: "Mercado Livre: título técnico e direto (produto + característica + material/medida), SEM emojis, sem pontuação exagerada, sem palavras como 'promoção' ou 'frete grátis'. Descrição em texto simples (o ML não aceita formatação), organizada em blocos com títulos em maiúsculas. NÃO escreva telefone, WhatsApp, redes sociais, links nem peça contato fora da plataforma (é proibido).",
  tiktok: "TikTok Shop: título chamativo e jovem, com a palavra principal no começo. Descrição curta, animada, com emojis e tópicos. NÃO escreva telefone, WhatsApp, links nem peça contato fora da plataforma (é proibido).",
  facebook: "Facebook Marketplace: texto conversado e próximo, como um vendedor de bairro de confiança. Diga que é de Curitiba, onde retirar e como entregar, e termine chamando para o WhatsApp.",
  olx: "OLX: título objetivo (o que é + destaque). Descrição direta: o que é, medidas, cores, preço, retirada/entrega em Curitiba e WhatsApp para contato.",
  instagram: "Instagram: legenda para post/reels. Primeira linha que prende a atenção, texto curto e com emojis, chamada para ação (chamar no direct ou WhatsApp) e, no final, de 8 a 15 hashtags em português relevantes (coloque as hashtags no campo palavras_chave, sem o #). O título é só uma frase curta de capa.",
  site: "Site / WhatsApp: texto amigável e completo para a página do produto e para mandar no WhatsApp.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "Use POST" }, 405);
  try {
    if (!(await ehMembro(req))) return json({ erro: "Acesso só para a equipe CristART." }, 401);
    const key = Deno.env.get("GEMINI_API_KEY");
    if (!key) return json({ erro: "Falta a chave GEMINI_API_KEY nos segredos das Edge Functions do Supabase." }, 500);

    const b = await req.json();
    if (b.teste) {
      const t = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", { headers: { "x-goog-api-key": key } });
      if (!t.ok) return json({ erro: "O Google recusou a chave GEMINI_API_KEY (" + t.status + "). Confira se copiou a chave inteira." }, 502);
      return json({ ok: true });
    }
    const prod = b.produto || {};
    const plats: Array<{ id: string; nome: string; permite_contato: boolean; limite_titulo: number; preco?: number }> = b.plataformas || [];
    if (!plats.length) return json({ erro: "Escolha ao menos uma plataforma." }, 400);

    // fotos (até 3), para a IA ver o produto
    const partesFoto: unknown[] = [];
    for (const u of (b.fotos || []).slice(0, 3)) {
      try {
        if (!/^https:\/\//.test(u)) continue;
        const r = await fetch(u);
        if (!r.ok) continue;
        const tipo = (r.headers.get("content-type") || "image/jpeg").split(";")[0];
        if (!tipo.startsWith("image/")) continue;
        const buf = await r.arrayBuffer();
        if (buf.byteLength > 6_000_000) continue;
        partesFoto.push({ inline_data: { mime_type: tipo, data: b64(buf) } });
      } catch (_) { /* foto que não abre é ignorada */ }
    }

    const contato = b.contato || {};
    const prompt = [
      "Você é redator de anúncios de e-commerce brasileiro da CristART 3D, um negócio familiar de Curitiba-PR que faz peças em impressão 3D (decoração, chaveiros, gamer, utilidades, personalizados).",
      "Escreva em português do Brasil, natural, sem exageros e SEM inventar características que não estejam nos dados ou que não dê para ver nas fotos. Se não souber a medida ou o peso, não invente números.",
      "",
      "PRODUTO:",
      JSON.stringify(prod, null, 2),
      "",
      "CONTATO (use só nas plataformas que permitem contato): " + JSON.stringify(contato),
      "",
      "REGRAS DA LOJA (siga em TODOS os anúncios, adaptando ao estilo de cada plataforma):",
      String(b.regras || "").trim() || "(nenhuma)",
      b.instrucoes ? "\nPEDIDO EXTRA PARA ESTA VEZ: " + String(b.instrucoes) : "",
      "",
      "PLATAFORMAS (um anúncio para cada, respeitando o limite de caracteres do título):",
      ...plats.map((p) =>
        `- id "${p.id}" (${p.nome}) · título com no máximo ${p.limite_titulo} caracteres · ${p.permite_contato ? "pode ter contato" : "SEM contato externo"}` +
        (p.preco ? ` · preço nesta plataforma: R$ ${p.preco.toFixed(2).replace(".", ",")}` : "") +
        "\n  " + (ESTILO[p.id] || "Estilo de marketplace brasileiro."),
      ),
      "",
      "Em palavras_chave, coloque de 6 a 15 termos que o cliente digitaria na busca (Instagram: hashtags sem #). Não coloque preço na descrição dos marketplaces (Shopee, ML, TikTok); nas outras pode.",
    ].join("\n");

    const schema = {
      type: "OBJECT",
      properties: {
        anuncios: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              plataforma: { type: "STRING" },
              titulo: { type: "STRING" },
              descricao: { type: "STRING" },
              palavras_chave: { type: "ARRAY", items: { type: "STRING" } },
            },
            required: ["plataforma", "titulo", "descricao", "palavras_chave"],
          },
        },
      },
      required: ["anuncios"],
    };

    const modelos = [b.modelo, "gemini-flash-latest", "gemini-3.5-flash-lite"].filter((m, i, a) => m && a.indexOf(m) === i);
    let ultimoErro = "";
    for (const modelo of modelos) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }, ...partesFoto] }],
          generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.8 },
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        ultimoErro = `${modelo}: ${d?.error?.message || r.status}`;
        if (r.status === 404 || r.status === 400 || r.status === 429 || r.status >= 500) continue;
        return json({ erro: ultimoErro }, 502);
      }
      const texto = (d?.candidates?.[0]?.content?.parts || []).filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text || "").join("");
      let out;
      try { out = JSON.parse(texto); } catch (_) { ultimoErro = `${modelo}: resposta fora do formato`; continue; }
      return json({ modelo, fotos: partesFoto.length, anuncios: out.anuncios || [] });
    }
    const limite = /quota|rate|exhaust/i.test(ultimoErro);
    return json({ erro: limite ? "Limite grátis do Gemini atingido por agora. Espere um minuto e tente de novo." : "O Gemini não respondeu: " + ultimoErro }, 502);
  } catch (e) {
    return json({ erro: "Erro na função: " + (e instanceof Error ? e.message : String(e)) }, 500);
  }
});
