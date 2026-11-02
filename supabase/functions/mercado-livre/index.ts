// CristART 3D — Edge Function "mercado-livre"
// Conecta a conta do Mercado Livre (OAuth) e publica / atualiza anúncios pelo sistema.
// Segredos no Supabase: ML_CLIENT_ID e ML_CLIENT_SECRET (nunca no site nem no navegador).
// Os tokens da conta ficam na tabela ml_conta (script 18), que só os membros acessam.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const API = "https://api.mercadolibre.com";
const REDIRECT = "https://gestao.cristart3d.com.br/ml-retorno.html";
const VERSAO = 1;

class Erro extends Error {
  status: number;
  constructor(msg: string, status = 400) { super(msg); this.status = status; }
}

// ---------------------------------------------------------------- banco (com o login de quem chamou)
function db(req: Request) {
  const url = Deno.env.get("SUPABASE_URL")!;
  const headers = {
    apikey: req.headers.get("apikey") || Deno.env.get("SUPABASE_ANON_KEY") || "",
    Authorization: req.headers.get("authorization") || "",
    "Content-Type": "application/json",
  };
  return async (path: string, init: RequestInit = {}) => {
    const r = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
    const t = await r.text();
    const d = t ? JSON.parse(t) : null;
    if (!r.ok) {
      const m = (d && (d.message || d.hint)) || r.status;
      if (/ml_conta|ml_item_id|ml_dados/.test(String(m))) throw new Error("Falta rodar o script 18 no SQL Editor do Supabase.");
      throw new Error("Banco: " + m);
    }
    return d;
  };
}

async function ehMembro(q: ReturnType<typeof db>): Promise<boolean> {
  try { const rows = await q("membros?select=email&limit=1"); return Array.isArray(rows) && rows.length > 0; }
  catch (_) { return false; }
}

// ---------------------------------------------------------------- Mercado Livre
function msgML(d: any, status: number): string {
  if (!d) return "Mercado Livre respondeu " + status;
  const causas = (Array.isArray(d.cause) ? d.cause : [])
    .filter((c: any) => c && (c.type !== "warning"))
    .map((c: any) => c.message || c.code).filter(Boolean);
  const base = d.message || d.error_description || d.error || ("erro " + status);
  return causas.length ? base + " — " + causas.join(" | ") : base;
}

async function token(form: Record<string, string>) {
  const r = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(form).toString(),
  });
  const d = await r.json().catch(() => null);
  if (!r.ok) throw new Erro("O Mercado Livre recusou a conexão: " + msgML(d, r.status), 502);
  return d as { access_token: string; refresh_token: string; expires_in: number; user_id: number };
}

function credenciais() {
  const id = Deno.env.get("ML_CLIENT_ID"), secret = Deno.env.get("ML_CLIENT_SECRET");
  if (!id || !secret) throw new Erro("Faltam os segredos ML_CLIENT_ID e ML_CLIENT_SECRET nas Edge Functions do Supabase.", 500);
  return { id, secret };
}

async function salvarConta(q: ReturnType<typeof db>, t: { access_token: string; refresh_token: string; expires_in: number; user_id?: number }, extra: Record<string, unknown> = {}) {
  const row = {
    id: 1, access_token: t.access_token, refresh_token: t.refresh_token,
    expira_em: new Date(Date.now() + (Number(t.expires_in) || 21600) * 1000 - 5 * 60 * 1000).toISOString(),
    atualizado_em: new Date().toISOString(), ...extra,
  };
  await q("ml_conta?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(row) });
}

// devolve um access_token válido (renova sozinho quando passa das 6 horas)
async function acesso(q: ReturnType<typeof db>): Promise<{ tk: string; conta: any }> {
  const rows = await q("ml_conta?id=eq.1&select=*");
  const c = rows && rows[0];
  if (!c || !c.refresh_token) throw new Erro("A conta do Mercado Livre ainda não está conectada.", 409);
  if (c.access_token && c.expira_em && new Date(c.expira_em).getTime() > Date.now()) return { tk: c.access_token, conta: c };
  const { id, secret } = credenciais();
  const t = await token({ grant_type: "refresh_token", client_id: id, client_secret: secret, refresh_token: c.refresh_token });
  await salvarConta(q, t);
  return { tk: t.access_token, conta: { ...c, access_token: t.access_token } };
}

async function ml(tk: string, method: string, path: string, body?: unknown) {
  const r = await fetch(API + path, {
    method,
    headers: { Authorization: "Bearer " + tk, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  let d: any = null; try { d = t ? JSON.parse(t) : null; } catch (_) { d = { message: t.slice(0, 300) }; }
  return { ok: r.ok, status: r.status, d };
}

// o ML não aceita emoji nem alguns símbolos na descrição em texto puro
function limparTexto(t: string): string {
  return String(t || "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[\u{FE0F}\u{200D}\u{20E3}]/gu, "")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n")
    .split("\n").map((l) => l.replace(/^\s+(?=\S)/, "")).join("\n")
    .trim();
}

// ---------------------------------------------------------------- servidor
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "Use POST" }, 405);
  try {
    const q = db(req);
    if (!(await ehMembro(q))) return json({ erro: "Acesso só para a equipe CristART." }, 401);
    const b = await req.json().catch(() => ({}));
    const acao = String(b.acao || "");

    if (acao === "url_conectar") {
      const { id } = credenciais();
      const u = new URL("https://auth.mercadolivre.com.br/authorization");
      u.searchParams.set("response_type", "code");
      u.searchParams.set("client_id", id);
      u.searchParams.set("redirect_uri", REDIRECT);
      if (b.state) u.searchParams.set("state", String(b.state));
      return json({ versao: VERSAO, url: u.toString() });
    }

    if (acao === "conectar") {
      if (!b.code) throw new Erro("Faltou o código de autorização do Mercado Livre.");
      const { id, secret } = credenciais();
      const t = await token({ grant_type: "authorization_code", client_id: id, client_secret: secret, code: String(b.code), redirect_uri: REDIRECT });
      const me = await ml(t.access_token, "GET", "/users/me");
      await salvarConta(q, t, { user_id: t.user_id, nickname: me.d?.nickname || null, tags: me.d?.tags || null });
      return json({ versao: VERSAO, conectado: true, nickname: me.d?.nickname, user_id: t.user_id });
    }

    if (acao === "desconectar") {
      await q("ml_conta?id=eq.1", { method: "DELETE" });
      return json({ versao: VERSAO, conectado: false });
    }

    if (acao === "status") {
      let a;
      try { a = await acesso(q); } catch (e) { if (e instanceof Erro && e.status === 409) return json({ versao: VERSAO, conectado: false }); throw e; }
      const me = await ml(a.tk, "GET", "/users/me");
      if (!me.ok) return json({ versao: VERSAO, conectado: false, erro: msgML(me.d, me.status) });
      return json({ versao: VERSAO, conectado: true, nickname: me.d.nickname, user_id: me.d.id, tags: me.d.tags || [], permalink: me.d.permalink });
    }

    const { tk, conta } = await acesso(q);

    if (acao === "categorias") {
      const termo = String(b.q || "").slice(0, 120);
      if (!termo) throw new Erro("Escreva o nome do produto para buscar a categoria.");
      const r = await ml(tk, "GET", `/sites/MLB/domain_discovery/search?limit=6&q=${encodeURIComponent(termo)}`);
      if (!r.ok) throw new Erro("Busca de categoria: " + msgML(r.d, r.status), 502);
      const lista = (Array.isArray(r.d) ? r.d : []).filter((x: any) => x.category_id);
      const vistos = new Set<string>();
      const out: unknown[] = [];
      for (const x of lista) {
        if (vistos.has(x.category_id)) continue; vistos.add(x.category_id);
        const c = await ml(tk, "GET", `/categories/${x.category_id}`);
        out.push({ id: x.category_id, nome: x.category_name, dominio: x.domain_name, caminho: (c.d?.path_from_root || []).map((p: any) => p.name).join(" › ") });
      }
      return json({ versao: VERSAO, categorias: out });
    }

    if (acao === "atributos") {
      const cat = String(b.categoria || "");
      if (!/^MLB\d+$/.test(cat)) throw new Erro("Categoria inválida.");
      const [ca, at] = await Promise.all([ml(tk, "GET", `/categories/${cat}`), ml(tk, "GET", `/categories/${cat}/attributes`)]);
      if (!at.ok) throw new Erro("Características da categoria: " + msgML(at.d, at.status), 502);
      const attrs = (at.d || []).map((a: any) => ({
        id: a.id, nome: a.name, tipo: a.value_type, tags: a.tags || {}, grupo: a.attribute_group_name,
        valores: (a.values || []).slice(0, 400).map((v: any) => ({ id: v.id, nome: v.name })),
        unidades: (a.allowed_units || []).map((u: any) => u.name || u.id), unidade_padrao: a.default_unit || null,
        dica: a.hint || a.tooltip || null, max: a.value_max_length || null,
      }));
      return json({ versao: VERSAO, categoria: { id: cat, nome: ca.d?.name, caminho: (ca.d?.path_from_root || []).map((p: any) => p.name).join(" › "), config: ca.d?.settings || {} }, atributos: attrs });
    }

    // anúncio do sistema que está sendo publicado / atualizado
    const adId = String(b.anuncio_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(adId)) throw new Erro("Anúncio inválido.");
    const ads = await q(`produto_anuncios?id=eq.${adId}&select=id,ml_item_id,produto_id,ml_dados`);
    const ad = ads && ads[0];
    if (!ad) throw new Erro("Anúncio não encontrado. Salve os anúncios antes.", 404);
    const salvarAd = (patch: Record<string, unknown>) =>
      q(`produto_anuncios?id=eq.${adId}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ ...patch, atualizado_em: new Date().toISOString() }) });

    if (acao === "publicar") {
      if (ad.ml_item_id) throw new Erro("Este anúncio já está publicado no ML (" + ad.ml_item_id + "). Use Atualizar.");
      const item = b.item || {};
      if (!item.category_id || !item.price || !(item.pictures || []).length) throw new Erro("Faltam categoria, preço ou fotos.");
      const usaFamilia = Array.isArray(conta.tags) && conta.tags.includes("user_product_seller");
      let corpo = { ...item };
      if (usaFamilia && !corpo.family_name) corpo.family_name = corpo.title;
      let r = await ml(tk, "POST", "/items", corpo);
      // contas com "User Products" pedem family_name (e às vezes não aceitam title)
      const texto = JSON.stringify(r.d || {});
      if (!r.ok && /family_name/i.test(texto) && !corpo.family_name) { corpo = { ...corpo, family_name: corpo.title }; r = await ml(tk, "POST", "/items", corpo); }
      if (!r.ok && /title/i.test(JSON.stringify(r.d || {})) && corpo.family_name) { const { title: _t, ...sem } = corpo; corpo = sem; r = await ml(tk, "POST", "/items", corpo); }
      if (!r.ok) return json({ erro: "O Mercado Livre não aceitou: " + msgML(r.d, r.status), detalhe: r.d }, 422);
      const it = r.d;
      let avisoDesc = "";
      if (b.descricao) {
        const dsc = await ml(tk, "POST", `/items/${it.id}/description`, { plain_text: limparTexto(b.descricao) });
        if (!dsc.ok) avisoDesc = "Publicou, mas a descrição não entrou: " + msgML(dsc.d, dsc.status);
      }
      const salvo = await salvarAd({ ml_item_id: it.id, ml_status: it.status, ml_categoria: item.category_id, ml_dados: b.dados || null, url: it.permalink || null, publicado: true, preco: item.price });
      return json({ versao: VERSAO, item: { id: it.id, status: it.status, permalink: it.permalink, sub_status: it.sub_status }, anuncio: salvo && salvo[0], aviso: avisoDesc });
    }

    if (!ad.ml_item_id) throw new Erro("Este anúncio ainda não foi publicado no ML.");
    const itemId = ad.ml_item_id;

    if (acao === "ver") {
      const r = await ml(tk, "GET", `/items/${itemId}?attributes=id,status,sub_status,permalink,price,available_quantity,sold_quantity,health,title,listing_type_id`);
      if (!r.ok) throw new Erro("Não consegui ler o anúncio no ML: " + msgML(r.d, r.status), 502);
      const salvo = await salvarAd({ ml_status: r.d.status, url: r.d.permalink || null });
      return json({ versao: VERSAO, item: r.d, anuncio: salvo && salvo[0] });
    }

    if (acao === "atualizar") {
      const m = b.mudancas || {};
      const patch: Record<string, unknown> = {};
      if (m.price) patch.price = Number(m.price);
      if (m.available_quantity != null) patch.available_quantity = Math.max(0, Math.round(Number(m.available_quantity)));
      if (Array.isArray(m.pictures) && m.pictures.length) patch.pictures = m.pictures;
      if (m.title) patch.title = m.title;
      const avisos: string[] = [];
      if (Object.keys(patch).length) {
        let r = await ml(tk, "PUT", `/items/${itemId}`, patch);
        if (!r.ok && patch.title) { // depois da primeira venda o ML não deixa trocar o título
          avisos.push("O título não pôde ser trocado (" + msgML(r.d, r.status) + ").");
          delete patch.title; r = Object.keys(patch).length ? await ml(tk, "PUT", `/items/${itemId}`, patch) : { ok: true, status: 200, d: null };
        }
        if (!r.ok) return json({ erro: "O Mercado Livre não aceitou: " + msgML(r.d, r.status), detalhe: r.d }, 422);
      }
      if (b.descricao) {
        const dsc = await ml(tk, "PUT", `/items/${itemId}/description?api_version=2`, { plain_text: limparTexto(b.descricao) });
        if (!dsc.ok) avisos.push("A descrição não foi atualizada: " + msgML(dsc.d, dsc.status));
      }
      const salvo = await salvarAd({ ...(patch.price ? { preco: patch.price } : {}) });
      return json({ versao: VERSAO, ok: true, avisos, anuncio: salvo && salvo[0] });
    }

    if (acao === "mudar_status") {
      const st = String(b.status || "");
      if (!["active", "paused", "closed"].includes(st)) throw new Erro("Situação inválida.");
      const r = await ml(tk, "PUT", `/items/${itemId}`, { status: st });
      if (!r.ok) return json({ erro: "O Mercado Livre não aceitou: " + msgML(r.d, r.status), detalhe: r.d }, 422);
      const salvo = await salvarAd({ ml_status: r.d?.status || st, publicado: st !== "closed" });
      return json({ versao: VERSAO, ok: true, status: r.d?.status || st, anuncio: salvo && salvo[0] });
    }

    throw new Erro("Ação desconhecida: " + acao);
  } catch (e) {
    const st = e instanceof Erro ? e.status : 500;
    return json({ erro: e instanceof Error ? e.message : String(e) }, st);
  }
});
