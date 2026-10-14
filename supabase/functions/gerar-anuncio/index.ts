// CristART 3D — Edge Function "gerar-anuncio"
// Recebe o pedido montado pelo sistema (texto + fotos) e devolve os anúncios escritos pelo Gemini.
// As regras e o estilo dos anúncios ficam no sistema (app.js) e nas Configurações, não aqui.
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
    const prompt = String(b.prompt || "");
    if (prompt.length < 20) return json({ erro: "Pedido vazio. Atualize a página (Ctrl+F5) e tente de novo." }, 400);

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
      return json({ versao: 2, modelo, fotos: partesFoto.length, anuncios: out.anuncios || [] });
    }
    const limite = /quota|rate|exhaust/i.test(ultimoErro);
    return json({ erro: limite ? "Limite grátis do Gemini atingido por agora. Espere um minuto e tente de novo." : "O Gemini não respondeu: " + ultimoErro }, 502);
  } catch (e) {
    return json({ erro: "Erro na função: " + (e instanceof Error ? e.message : String(e)) }, 500);
  }
});
