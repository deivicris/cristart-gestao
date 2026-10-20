/* CristART 3D — Sistema de Gestão (etapa 1)
   Vanilla JS + Supabase. Sem build: este arquivo roda direto no navegador. */
(function () {
  'use strict';

  var CFG = window.CRISTART_CONFIG;
  var sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  // ------------------------------------------------------------------ estado
  var S = {
    user: null, membro: null, ready: false,
    cfg: null, plataformas: [], equipamentos: [], filamentos: [], insumos: [],
    produtos: [], prodInsumos: [], anuncios: [], membros: [], carreteis: [], impressoes: [], perdas: [], vendas: [], pedidos: [], pedidoItens: [], pedidoCustos: [], pedidoNotas: [],
    ui: { prodBusca: '', prodCat: '', prodStatus: '', verArquivados: false, filOrd: 'restante', ord: {}, busca: {}, per: {}, vf: [] }
  };

  // ------------------------------------------------------------------ utilidades
  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var $$ = function (sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); };
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isNaN(v) ? null : v;
    var s = String(v).trim().replace(/[R$\s%]/g, '');
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // "1.050" = mil e cinquenta
    var n = parseFloat(s);
    return isNaN(n) ? null : n;
  }
  function brl(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function centavoAcima(n) { // 0,4223 → 0,43
    if (n === null || n === undefined || isNaN(n)) return n;
    var r = Math.ceil(Number(n) * 100 - 1e-9) / 100;
    return r === 0 ? 0 : r; // evita "-0,00"
  }
  function un(i) { var u = String((i && i.unidade) || '').trim(); return (!u || /^[0-9.,]+$/.test(u)) ? 'un' : u; }
  function brl4(n) { // até 4 casas, para custos unitários pequenos (ex.: R$ 0,4299)
    if (n === null || n === undefined || isNaN(n)) return '—';
    return 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }
  function fmt(n, d) {
    if (n === null || n === undefined || isNaN(n)) return '';
    return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: d == null ? 2 : d });
  }
  function fmtIn(n) { // valor para colocar dentro de um input
    if (n === null || n === undefined || n === '') return '';
    return String(n).replace('.', ',');
  }
  function horas(min) {
    if (!min) return '—';
    var h = Math.floor(min / 60), m = Math.round(min % 60);
    return h ? (h + 'h' + (m ? String(m).padStart(2, '0') : '')) : (m + ' min');
  }
  function dataBR(d) { if (!d) return '—'; var p = String(d).slice(0, 10).split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function isUrl(u) { return /^https?:\/\//i.test(String(u || '').trim()); }
  function uid() { return (crypto.randomUUID ? crypto.randomUUID() : 'x' + Date.now() + Math.random().toString(16).slice(2)); }

  var ICON = {
    edit: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    ext: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M8 7h9v9"/></svg>',
    plus: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'
  };

  function toast(msg, bad) {
    $$('.toast').forEach(function (x) { x.remove(); });
    var t = document.createElement('div');
    t.className = 'toast' + (bad ? ' bad' : '');
    t.setAttribute('role', 'status');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, bad ? 6000 : 2600);
  }
  function erroMsg(e) {
    var m = (e && (e.message || e.error_description || e.msg)) || String(e);
    if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
    if (/Email not confirmed/i.test(m)) return 'Este e-mail ainda não foi confirmado no Supabase.';
    if (/row-level security|permission denied/i.test(m)) return 'Sem permissão. Seu e-mail está liberado como membro?';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Sem conexão com o servidor. Verifique a internet.';
    if (/column .* does not exist|Could not find the '.*' column/i.test(m)) return 'O banco precisa de atualização: rode no SQL Editor do Supabase os scripts novos (03 e 04).';
    return m;
  }
  function q(res) { // checa resultado do supabase
    if (res.error) throw res.error;
    return res.data;
  }

  // ------------------------------------------------------------------ modal
  function modal(html, opts) {
    opts = opts || {};
    var root = $('#modal-root');
    root.innerHTML = '<div class="modal-bg"><div class="modal ' + (opts.size || '') + '" role="dialog" aria-modal="true">' + html + '</div></div>';
    var bg = $('.modal-bg', root);
    bg.addEventListener('mousedown', function (e) { if (e.target === bg && !opts.sticky) closeModal(); });
    var first = $('input,select,textarea', root);
    if (first && !opts.noFocus) setTimeout(function () { first.focus(); }, 30);
    return $('.modal', root);
  }
  function closeModal() { $('#modal-root').innerHTML = ''; pasteAlvo.modal = null; }

  // ------------------------------------------------------------------ imagens: colar (Ctrl+V), arrastar, escolher
  var pasteAlvo = { pagina: null, modal: null };
  function imagensDe(dt) {
    var out = [];
    if (!dt) return out;
    if (dt.items) for (var i = 0; i < dt.items.length; i++) {
      var it = dt.items[i];
      if (it.kind === 'file' && /^image\//.test(it.type)) { var f = it.getAsFile(); if (f) out.push(f); }
    }
    if (!out.length && dt.files) for (var j = 0; j < dt.files.length; j++) if (/^image\//.test(dt.files[j].type)) out.push(dt.files[j]);
    return out;
  }
  document.addEventListener('paste', function (e) {
    var fn = $('#modal-root').innerHTML ? pasteAlvo.modal : pasteAlvo.pagina;
    if (!fn) return;
    var files = imagensDe(e.clipboardData);
    if (!files.length) return; // texto colado segue normal
    e.preventDefault(); fn(files);
  });
  function soltarImagens(el, fn) {
    el.addEventListener('dragover', function (e) { e.preventDefault(); el.classList.add('drop-on'); });
    el.addEventListener('dragleave', function (e) { if (!el.contains(e.relatedTarget)) el.classList.remove('drop-on'); });
    el.addEventListener('drop', function (e) {
      e.preventDefault(); el.classList.remove('drop-on');
      var files = imagensDe(e.dataTransfer);
      if (files.length) fn(files); else toast('Isso não parece uma imagem', true);
    });
  }
  // campo de UMA foto dentro de um modal (insumo, rolo)
  function fotoUnicaHtml() {
    return '<div class="field" style="grid-column:1 / -1"><label>Foto</label><div class="foto-uni" id="foto-uni"></div><input type="file" id="foto-uni-in" accept="image/*" class="hidden"></div>';
  }
  function ligarFotoUnica(m, estado, pasta) {
    var box = $('#foto-uni', m), inp = $('#foto-uni-in', m);
    function draw(enviando) {
      if (enviando) { box.innerHTML = '<div class="foto-uni-vazio"><span class="spinner" style="border-color:rgba(0,0,0,.15);border-top-color:var(--craft)"></span> Enviando…</div>'; return; }
      box.innerHTML = estado.foto
        ? '<img src="' + esc(estado.foto) + '" alt="Foto"><div class="stack" style="gap:8px"><button type="button" class="btn btn-g btn-s" data-fu="trocar">Trocar foto</button><button type="button" class="btn btn-d btn-s" data-fu="tirar">Remover</button><span class="hint">Ou cole outro print (Ctrl+V)</span></div>'
        : '<button type="button" class="foto-uni-vazio" data-fu="trocar">' + ICON.plus + '<span><b>Escolher imagem</b>, arrastar para cá<br>ou <b>colar um print (Ctrl+V)</b></span></button>';
    }
    async function enviar(files) {
      draw(true);
      try { estado.foto = await enviarFoto(await comprimir(files[0], 1000), pasta); estado.mudou = true; }
      catch (err) { toast('Erro ao enviar foto: ' + erroMsg(err), true); }
      draw();
    }
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-fu]'); if (!b) return;
      if (b.dataset.fu === 'trocar') inp.click();
      if (b.dataset.fu === 'tirar') { estado.foto = null; estado.mudou = true; draw(); }
    });
    inp.addEventListener('change', function () { var f = Array.prototype.slice.call(inp.files || []); inp.value = ''; if (f.length) enviar(f); });
    soltarImagens(box, enviar);
    pasteAlvo.modal = enviar;
    draw();
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && $('#modal-root').innerHTML) closeModal(); });

  function confirmar(titulo, texto, okTxt, perigo) {
    return new Promise(function (res) {
      var m = modal('<h2>' + esc(titulo) + '</h2><div class="muted">' + esc(texto) + '</div>' +
        '<div class="row" style="justify-content:flex-end"><button class="btn btn-g" data-x="no">Cancelar</button>' +
        '<button class="btn ' + (perigo ? 'btn-d' : 'btn-p') + '" data-x="ok">' + esc(okTxt || 'Confirmar') + '</button></div>', { size: 'sm', noFocus: true });
      m.addEventListener('click', function (e) {
        var b = e.target.closest('[data-x]'); if (!b) return;
        closeModal(); res(b.dataset.x === 'ok');
      });
    });
  }

  // ------------------------------------------------------------------ foto em tela cheia
  function thumbHtml(url, lista) {
    if (!url) return '<div class="thumb"></div>';
    return '<img class="thumb zoomable" loading="lazy" alt="Ver foto" src="' + esc(url) + '" data-zoom="' + esc(JSON.stringify(lista || [url])) + '">';
  }
  function abrirZoom(urls, i) {
    fecharZoom();
    var z = document.createElement('div');
    z.className = 'zoom'; z.id = 'zoom'; z.setAttribute('role', 'dialog'); z.setAttribute('aria-modal', 'true');
    function draw() {
      z.innerHTML = '<img src="' + esc(urls[i]) + '" alt="Foto ' + (i + 1) + ' de ' + urls.length + '">' +
        '<button type="button" class="zoom-x" data-z="x" aria-label="Fechar">✕</button>' +
        (urls.length > 1 ? '<button type="button" class="zoom-nav prev" data-z="prev" aria-label="Foto anterior">‹</button><button type="button" class="zoom-nav next" data-z="next" aria-label="Próxima foto">›</button><div class="zoom-count">' + (i + 1) + ' / ' + urls.length + '</div>' : '');
    }
    z.addEventListener('click', function (e) {
      var b = e.target.closest('[data-z]');
      if (b && b.dataset.z === 'prev') { i = (i - 1 + urls.length) % urls.length; draw(); return; }
      if (b && b.dataset.z === 'next') { i = (i + 1) % urls.length; draw(); return; }
      if (b || e.target === z) fecharZoom();
    });
    z.navegar = function (d) { if (urls.length > 1) { i = (i + d + urls.length) % urls.length; draw(); } };
    draw();
    document.body.appendChild(z);
  }
  function fecharZoom() { var z = $('#zoom'); if (z) z.remove(); }
  document.addEventListener('click', function (e) {
    var img = e.target.closest('img.zoomable, .photo img, .foto-uni img');
    if (!img || e.target.closest('#zoom')) return;
    var urls;
    if (img.dataset.zoom) { try { urls = JSON.parse(img.dataset.zoom); } catch (x) { urls = [img.src]; } }
    else if (img.closest('.photo')) urls = $$('#photos .photo img').map(function (x) { return x.getAttribute('src'); });
    else urls = [img.getAttribute('src')];
    var i = Math.max(0, urls.indexOf(img.getAttribute('src')));
    e.preventDefault(); e.stopPropagation();
    abrirZoom(urls, i);
  }, true);
  document.addEventListener('keydown', function (e) {
    var z = $('#zoom'); if (!z) return;
    if (e.key === 'Escape') { e.stopImmediatePropagation(); fecharZoom(); }
    if (e.key === 'ArrowLeft') z.navegar(-1);
    if (e.key === 'ArrowRight') z.navegar(1);
  }, true);

  // ------------------------------------------------------------------ busca (todas as abas)
  function norm(t) { return String(t == null ? '' : t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  function apelidosLink(u) { // "shopee", "mercado livre", "ml"… a partir do link
    u = norm(u); var out = u;
    if (/mercadoli[vb]re|mlstatic|meli/.test(u)) out += ' mercado livre ml';
    if (/shopee/.test(u)) out += ' shopee';
    if (/amazon/.test(u)) out += ' amazon';
    if (/aliexpress/.test(u)) out += ' aliexpress ali';
    if (/magazineluiza|magalu/.test(u)) out += ' magalu magazine luiza';
    if (/tiktok/.test(u)) out += ' tiktok';
    return out;
  }
  // todas as palavras digitadas precisam aparecer (ex.: "kobra x" acha "Kobra X")
  function combina(textos, termo) {
    var t = norm(termo).trim(); if (!t) return true;
    var alvo = textos.map(function (x) { return /^https?:/i.test(String(x || '')) ? apelidosLink(x) : norm(x); }).join(' ');
    return t.split(/\s+/).every(function (w) { return alvo.indexOf(w) >= 0; });
  }
  function buscaHtml(tela, ph) {
    return '<div class="busca"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
      '<input class="inp" type="search" id="busca-' + tela + '" placeholder="' + esc(ph) + '" value="' + esc(S.ui.busca[tela] || '') + '" aria-label="Pesquisar"></div>';
  }
  function ligarBusca(tela) {
    var inp = $('#busca-' + tela); if (!inp) return;
    inp.addEventListener('input', function () {
      S.ui.busca[tela] = inp.value; S.ui.focoBusca = tela;
      var pos = inp.selectionStart;
      render();
      var novo = $('#busca-' + tela); if (novo) { novo.focus(); try { novo.setSelectionRange(pos, pos); } catch (x) {} }
    });
  }
  function nadaAchado(tela) { return '<div class="empty">Nada encontrado para “' + esc(S.ui.busca[tela]) + '”.</div>'; }

  // ------------------------------------------------------------------ ordenar tabelas pelo cabeçalho
  function thOrd(tabela, k, t, cls) {
    var o = S.ui.ord[tabela] || {};
    var seta = o.k === k ? (o.dir > 0 ? ' ▲' : ' ▼') : '';
    return '<th class="th-ord' + (cls ? ' ' + cls : '') + (o.k === k ? ' on' : '') + '" data-ord="' + tabela + ':' + k + '" tabindex="0" role="button" aria-sort="' + (o.k === k ? (o.dir > 0 ? 'ascending' : 'descending') : 'none') + '">' + esc(t) + seta + '</th>';
  }
  function clicarOrdem(th) {
    var p = th.dataset.ord.split(':'), tabela = p[0], k = p[1];
    var o = S.ui.ord[tabela] || {};
    S.ui.ord[tabela] = o.k === k ? { k: k, dir: -o.dir } : { k: k, dir: 1 };
    render();
  }
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('th[data-ord]')) { e.preventDefault(); clicarOrdem(e.target); }
  });
  function ordenarTabela(tabela, lista, getters) {
    var o = S.ui.ord[tabela]; if (!o || !getters[o.k]) return lista;
    var g = getters[o.k];
    return lista.slice().sort(function (a, b) {
      var x = g(a), y = g(b);
      var vx = x === null || x === undefined || x === '', vy = y === null || y === undefined || y === '';
      if (vx && vy) return 0; if (vx) return 1; if (vy) return -1; // vazios sempre no fim
      var r = (typeof x === 'number' && typeof y === 'number') ? x - y : String(x).localeCompare(String(y), 'pt-BR', { sensitivity: 'base', numeric: true });
      return r * o.dir;
    });
  }

  // ------------------------------------------------------------------ formulários genéricos
  // campo: {k, label, type:text|num|int|date|select|textarea|color|check|url|datalist, opts:[], ph, hint, span}
  function fieldHtml(f, val) {
    var id = 'fld-' + f.k;
    var span = f.span ? ' style="grid-column:span ' + f.span + '"' : '';
    if (f.type === 'check') {
      return '<label class="check"' + span + '><input type="checkbox" id="' + id + '" data-k="' + f.k + '"' + (val ? ' checked' : '') + '> ' + esc(f.label) + '</label>';
    }
    var input;
    var ph = f.ph ? ' placeholder="' + esc(f.ph) + '"' : '';
    if (f.type === 'select') {
      input = '<select class="inp" id="' + id + '" data-k="' + f.k + '">' + f.opts.map(function (o) {
        var v = typeof o === 'object' ? o.v : o, t = typeof o === 'object' ? o.t : o;
        return '<option value="' + esc(v) + '"' + (String(val == null ? '' : val) === String(v) ? ' selected' : '') + '>' + esc(t) + '</option>';
      }).join('') + '</select>';
    } else if (f.type === 'textarea') {
      input = '<textarea class="inp" id="' + id + '" data-k="' + f.k + '"' + ph + (f.rows ? ' rows="' + f.rows + '"' : '') + '>' + esc(val) + '</textarea>';
    } else {
      var type = { num: 'text', int: 'text', date: 'date', color: 'color', url: 'url' }[f.type] || 'text';
      var mode = f.type === 'num' ? ' inputmode="decimal"' : f.type === 'int' ? ' inputmode="numeric"' : '';
      var v = f.type === 'num' ? fmtIn(val) : (val == null ? '' : val);
      var list = f.list ? ' list="dl-' + f.k + '"' : '';
      input = '<input class="inp" type="' + type + '" id="' + id + '" data-k="' + f.k + '" value="' + esc(v) + '"' + ph + mode + list + '>';
      if (f.list) input += '<datalist id="dl-' + f.k + '">' + f.list.map(function (o) { return '<option value="' + esc(o) + '">'; }).join('') + '</datalist>';
    }
    return '<div class="field"' + span + '><label for="' + id + '">' + esc(f.label) + '</label>' + input + (f.hint ? '<div class="hint">' + esc(f.hint) + '</div>' : '') + '</div>';
  }
  function readFields(fields, root) {
    var o = {};
    fields.forEach(function (f) {
      var el = $('[data-k="' + f.k + '"]', root); if (!el) return;
      if (f.type === 'check') o[f.k] = el.checked;
      else if (f.type === 'num') o[f.k] = num(el.value);
      else if (f.type === 'int') { var n = num(el.value); o[f.k] = n === null ? null : Math.round(n); }
      else { var s = el.value.trim(); o[f.k] = s === '' ? null : s; }
    });
    return o;
  }

  // ------------------------------------------------------------------ dados
  async function loadAll() {
    var r = await Promise.all([
      sb.from('configuracoes').select('*').eq('id', 1).maybeSingle(),
      sb.from('plataformas').select('*').order('ordem'),
      sb.from('equipamentos').select('*').order('criado_em'),
      sb.from('filamentos').select('*').order('criado_em'),
      sb.from('insumos').select('*').order('nome'),
      sb.from('produtos').select('*').order('ordem').order('criado_em'),
      sb.from('produto_insumos').select('*'),
      sb.from('produto_anuncios').select('*'),
      sb.from('membros').select('*').order('criado_em'),
      sb.from('impressoes').select('*').order('data', { ascending: false }).order('criado_em', { ascending: false }),
      sb.from('perdas').select('*').order('data', { ascending: false }).order('criado_em', { ascending: false }),
      sb.from('vendas').select('*').order('data', { ascending: false }).order('criado_em', { ascending: false })
    ]);
    S.cfg = q(r[0]) || {};
    S.plataformas = q(r[1]) || [];
    S.equipamentos = q(r[2]) || [];
    S.filamentos = q(r[3]) || [];
    S.insumos = q(r[4]) || [];
    S.produtos = q(r[5]) || [];
    S.prodInsumos = q(r[6]) || [];
    S.anuncios = q(r[7]) || [];
    S.membros = q(r[8]) || [];
    S.impressoes = q(r[9]) || [];
    S.perdas = q(r[10]) || [];
    S.vendas = q(r[11]) || [];
    var r11 = await sb.from('produto_anuncios').select('arquivado').limit(1);
    S.falta11 = !!r11.error;
    var rc = await sb.from('carreteis').select('*');
    S.carreteis = rc.error ? [] : (rc.data || []);
    S.faltaScript04 = !!rc.error;
    var rp = await Promise.all([
      sb.from('pedidos').select('*').order('numero'),
      sb.from('pedido_itens').select('*'),
      sb.from('pedido_custos').select('*').order('criado_em'),
      sb.from('pedido_notas').select('*').order('criado_em', { ascending: false })
    ]);
    S.faltaScript06 = !!rp[0].error;
    S.pedidos = rp[0].error ? [] : (rp[0].data || []);
    S.pedidoItens = rp[1].error ? [] : (rp[1].data || []);
    S.pedidoCustos = rp[2].error ? [] : (rp[2].data || []);
    S.pedidoNotas = rp[3].error ? [] : (rp[3].data || []);
    S.ready = true;
    corrigirInsumosAntigos();
  }
  // Ajuste único: quem digitou a quantidade do pacote no antigo campo "Unidade" (ex.: "100")
  // passa a ter isso em "Unidades"; custos com mais de 2 casas são arredondados para cima.
  function corrigirInsumosAntigos() {
    S.insumos.forEach(function (i) {
      var patch = {};
      var u = String(i.unidade || '').trim();
      if (/^[0-9]+([.,][0-9]+)?$/.test(u)) {
        patch.unidade = 'un';
        if (!num(i.qtd_pacote) && num(u) > 1) patch.qtd_pacote = num(u);
      }
      var c = num(i.custo_unitario);
      if (c !== null && centavoAcima(c) !== c) patch.custo_unitario = centavoAcima(c);
      if (!Object.keys(patch).length) return;
      Object.assign(i, patch);
      sb.from('insumos').update(patch).eq('id', i.id).then(function () {}, function () {});
    });
  }
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function impressoras() { return S.equipamentos.filter(function (e) { return e.tipo === 'impressora' && e.status !== 'desativado'; }); }
  function categorias() { return (S.cfg && S.cfg.categorias && S.cfg.categorias.length) ? S.cfg.categorias : ['Decoração', 'Chaveiros', 'Expositores', 'Gamer', 'Brinquedos', 'Utilidades', 'Acessórios']; }
  function tiposFilamento() {
    var base = ['PLA', 'PETG', 'PLA Silk', 'PLA Matte', 'ABS', 'TPU'];
    S.filamentos.forEach(function (f) { if (f.tipo && base.indexOf(f.tipo) < 0) base.push(f.tipo); });
    return base;
  }

  // ------------------------------------------------------------------ custos
  // custo por grama: média ponderada dos rolos (ativos) daquele material; se não houver, usa todos os rolos
  function custoGrama(material) {
    function media(list) {
      var p = 0, g = 0;
      list.forEach(function (f) { if (num(f.preco_pago) && num(f.peso_inicial_g)) { p += num(f.preco_pago); g += num(f.peso_inicial_g); } });
      return g ? p / g : null;
    }
    var mat = String(material || '').trim().toLowerCase();
    var ativos = S.filamentos.filter(function (f) { return !f.arquivado; });
    var mesmos = mat ? S.filamentos.filter(function (f) { return String(f.tipo || '').trim().toLowerCase() === mat; }) : [];
    var ativosMesmos = mesmos.filter(function (f) { return !f.arquivado; });
    var v = media(ativosMesmos); if (v !== null) return { v: v, fonte: 'rolos de ' + material };
    v = media(mesmos); if (v !== null) return { v: v, fonte: 'rolos antigos de ' + material };
    v = media(ativos.length ? ativos : S.filamentos); if (v !== null) return { v: v, fonte: 'média de todos os rolos' };
    return { v: 0.09, fonte: 'estimativa (cadastre rolos com preço)' };
  }
  function custoProduto(p, itensInsumo) {
    var cfg = S.cfg || {};
    var c = { linhas: [], total: 0, avisos: [] };
    if (itensInsumo === undefined) itensInsumo = S.prodInsumos.filter(function (x) { return x.produto_id === p.id; });
    if (p.tipo_produto === 'revenda') {
      var cc = num(p.custo_compra);
      if (cc === null) c.avisos.push('Informe o custo de compra');
      c.linhas.push(['Custo de compra', cc || 0]);
    } else {
      var g = num(p.gramas), t = num(p.tempo_min);
      if (!g) c.avisos.push('Faltam as gramas');
      if (!t) c.avisos.push('Falta o tempo de impressão');
      var cg = custoGrama(p.material);
      c.linhas.push(['Filamento (' + fmt(g || 0, 1) + ' g × ' + brl(cg.v).replace('R$ ', 'R$ ') + '/g)', (g || 0) * cg.v]);
      var imp = byId(S.equipamentos, p.impressora_padrao);
      var w = (imp && num(imp.potencia_w)) || 120;
      var kwh = num(cfg.kwh) || 0;
      c.linhas.push(['Energia (' + horas(t) + ' · ' + w + ' W)', (w / 1000) * ((t || 0) / 60) * kwh]);
      if (p.usa_hora_maquina) c.linhas.push(['Hora-máquina (' + brl(num(cfg.hora_maquina) || 0) + '/h)', ((t || 0) / 60) * (num(cfg.hora_maquina) || 0)]);
      c.fonteFilamento = cg.fonte;
    }
    itensInsumo.forEach(function (it) {
      var ins = byId(S.insumos, it.insumo_id); if (!ins) return;
      var qt = num(it.quantidade) || 0;
      c.linhas.push([ins.nome + (qt !== 1 ? ' × ' + fmt(qt) : ''), qt * (num(ins.custo_unitario) || 0)]);
    });
    c.linhas.forEach(function (l) { c.total += l[1]; });
    var margem = num(cfg.margem_pct); if (margem === null) margem = 200;
    c.sugerido = arred(c.total * (1 + margem / 100));
    c.margemPadrao = margem;
    return c;
  }
  function arred(v) { // arredonda para ,90
    if (!v) return 0;
    var base = Math.floor(v);
    var r = base + 0.9;
    return r < v ? base + 1.9 : r;
  }
  function precoPlataforma(preco, plat) {
    if (!preco) return null;
    var pct = num(plat.taxa_pct) || 0, fixa = num(plat.taxa_fixa) || 0;
    if (!pct && !fixa) return preco;
    return arred((preco + fixa) / (1 - pct / 100));
  }
  function lucroUnit(p) {
    var c = custoProduto(p);
    var preco = num(p.preco);
    if (!preco) return null;
    return { lucro: preco - c.total, margem: c.total ? ((preco - c.total) / c.total) * 100 : null, custo: c.total };
  }

  // ------------------------------------------------------------------ navegação
  var NAV = [
    { id: 'painel', t: 'Painel' },
    { id: 'produtos', t: 'Produtos' },
    { id: 'filamentos', t: 'Filamentos' },
    { id: 'insumos', t: 'Insumos e extras' },
    { id: 'equipamentos', t: 'Equipamentos' },
    { sep: true },
    { id: 'pedidos', t: 'Pedidos' },
    { id: 'vendas', t: 'Vendas' },
    { id: 'producao', t: 'Produção e perdas' },
    { id: 'relatorios', t: 'Relatórios' },
    { id: 'anuncios', t: 'Anúncios com IA' },
    { sep: true },
    { id: 'config', t: 'Configurações' }
  ];
  function rota() {
    var h = (location.hash || '#/painel').replace(/^#\/?/, '').split('?')[0];
    var parts = h.split('/');
    return { tela: parts[0] || 'painel', arg: parts[1] || null };
  }
  function go(h) { if (location.hash === h) render(); else location.hash = h; }
  function renderNav(tela) {
    var base = tela === 'produto' ? 'produtos' : tela === 'pedido' ? 'pedidos' : (tela === 'anuncio' || tela === 'shopee' || tela === 'fotos') ? 'anuncios' : tela;
    $('#nav').innerHTML = NAV.map(function (n) {
      if (n.sep) return '<div class="nav-sep"></div>';
      return '<a class="nav-btn' + (n.id === base ? ' on' : '') + '" href="#/' + n.id + '">' + esc(n.t) + (n.soon ? '<span class="soon">' + n.soon + '</span>' : '') + '</a>';
    }).join('');
  }
  function setHeader(title, actions) {
    $('#title').textContent = title;
    document.title = title + ' · CristART 3D';
    $('#top-actions').innerHTML = actions || '';
  }
  function closeMenu() { $('#side').classList.remove('open'); $('#scrim').classList.add('hidden'); }
  $('#menu-btn').addEventListener('click', function () { $('#side').classList.add('open'); $('#scrim').classList.remove('hidden'); });
  $('#scrim').addEventListener('click', closeMenu);
  $('#nav').addEventListener('click', function (e) { if (e.target.closest('a')) closeMenu(); });

  var dirty = false; // editor de produto com alterações não salvas
  window.addEventListener('hashchange', function () {
    render();
  });
  window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  function render() {
    if (!S.ready) return;
    var r = rota();
    renderNav(r.tela);
    var v = $('#view');
    v.onclick = null;
    v.onkeydown = null;
    v.onchange = null;
    v.oninput = null;
    pasteAlvo.pagina = null;
    dirty = false;
    if (!S.ui.focoBusca) window.scrollTo(0, 0);
    S.ui.focoBusca = null;
    try {
      switch (r.tela) {
        case 'painel': return telaPainel(v);
        case 'produtos': return telaProdutos(v);
        case 'produto': return telaProduto(v, r.arg);
        case 'filamentos': return telaFilamentos(v);
        case 'insumos': return telaInsumos(v);
        case 'equipamentos': return telaEquipamentos(v);
        case 'config': return telaConfig(v);
        case 'producao': return telaProducao(v);
        case 'vendas': return telaVendas(v);
        case 'pedidos': return telaPedidos(v);
        case 'pedido': return telaPedido(v, r.arg);
        case 'relatorios': return telaRelatorios(v);
        case 'anuncios': return telaAnuncios(v);
        case 'anuncio': return telaAnuncio(v, r.arg);
        case 'shopee': return telaShopee(v);
        case 'fotos': return telaFotos(v, r.arg);
        default: go('#/painel');
      }
    } catch (e) {
      console.error(e);
      v.innerHTML = '<div class="card err">Algo deu errado nesta tela: ' + esc(e.message) + '</div>';
    }
  }

  // ------------------------------------------------------------------ PAINEL
  function telaPainel(v) {
    setHeader('Painel', '<button class="btn btn-g" id="q-imp">+ <span class="long">Impressão</span></button><button class="btn btn-p" id="q-venda">+ <span class="long">Venda</span></button>');
    var ativos = S.produtos.filter(function (p) { return p.ativo; });
    var pecas = 0, valorCusto = 0, valorVenda = 0;
    ativos.forEach(function (p) {
      var e = p.estoque || 0; pecas += e;
      if (e > 0) { valorCusto += e * custoProduto(p).total; valorVenda += e * (num(p.preco) || 0); }
    });
    var rolos = S.filamentos.filter(function (f) { return !f.arquivado; });
    var gramas = rolos.reduce(function (a, f) { return a + (num(f.restante_g) || 0); }, 0);
    var baixos = rolos.filter(function (f) { var ini = num(f.peso_inicial_g) || 1000; return (num(f.restante_g) || 0) / ini < 0.25; });
    var semDados = ativos.filter(function (p) { return p.tipo_produto !== 'revenda' && (!num(p.gramas) || !num(p.tempo_min)); });
    var semCustoRev = ativos.filter(function (p) { return p.tipo_produto === 'revenda' && num(p.custo_compra) === null; });
    var semFoto = ativos.filter(function (p) { return !(p.fotos && p.fotos.length); });
    var insBaixo = S.insumos.filter(function (i) { return (num(i.estoque) || 0) <= 5; });

    var alertas = [];
    baixos.forEach(function (f) { alertas.push(['p-warn', 'Filamento', esc(f.tipo + ' ' + f.cor) + ' — restam ~' + fmt(num(f.restante_g), 0) + ' g' + (isUrl(f.link_compra) ? ' · <a href="' + esc(f.link_compra) + '" target="_blank" rel="noopener">Comprar de novo ↗</a>' : '') + ' · <a href="#" data-preco-fil="' + f.id + '">Pesquisar preço</a>']); });
    insBaixo.forEach(function (i) { alertas.push(['p-warn', 'Insumo', esc(i.nome) + ' — ' + fmt(num(i.estoque)) + ' ' + esc(un(i)) + ' em estoque' + (isUrl(i.link_compra) ? ' · <a href="' + esc(i.link_compra) + '" target="_blank" rel="noopener">Comprar de novo ↗</a>' : '') + ' · <a href="#" data-preco-ins="' + i.id + '">Pesquisar preço</a>']); });
    pedidosAbertos().forEach(function (pd) {
      var pi = prazoInfo(pd); if (!pi || pi.d > 2) return;
      alertas.push([pi.d < 0 ? 'p-bad' : 'p-warn', 'Pedido', '<a href="#/pedido/' + pd.id + '">#' + pd.numero + ' · ' + esc(pd.titulo) + '</a> — ' + esc(pi.t.toLowerCase()) + ' · ' + esc(stTxt(pd.status))]);
    });
    if (semDados.length) alertas.push(['p-info', 'Produtos', semDados.length + ' produto(s) impresso(s) sem gramas ou tempo — o custo fica incompleto. <a href="#/produtos?f=incompletos">Ver</a>']);
    if (semCustoRev.length) alertas.push(['p-info', 'Revenda', semCustoRev.length + ' produto(s) de revenda sem custo de compra.']);
    if (semFoto.length) alertas.push(['p-mut', 'Fotos', semFoto.length + ' produto(s) sem foto.']);
    if (!S.filamentos.length) alertas.push(['p-info', 'Começo', 'Cadastre os rolos de filamento para o custo por grama ficar exato. <a href="#/filamentos">Ir para Filamentos</a>']);
    if (!S.equipamentos.length) alertas.push(['p-info', 'Começo', 'Cadastre as impressoras (com a potência em watts) para calcular a energia. <a href="#/equipamentos">Ir para Equipamentos</a>']);
    if (!S.produtos.length) alertas.push(['p-info', 'Começo', 'Importe o catálogo do site em <a href="#/config">Configurações</a>.']);

    var d0 = new Date(), ivMes = { ini: hojeISO(new Date(d0.getFullYear(), d0.getMonth(), 1)), fim: hojeISO() };
    var vMes = S.vendas.filter(function (x) { return noPeriodo(x.data, ivMes); });
    var fatMes = vMes.reduce(function (a, x) { return a + (num(x.valor_total) || 0); }, 0);
    var lucMes = vMes.reduce(function (a, x) { return a + lucroVenda(x); }, 0) - S.perdas.filter(function (x) { return noPeriodo(x.data, ivMes); }).reduce(function (a, x) { return a + custoPerda(x); }, 0);
    var hMes = impressoras().reduce(function (a, e) { return a + horasRegistradas(e, ivMes); }, 0);
    var ultimas = S.vendas.slice(0, 6);
    v.innerHTML =
      '<div class="stack">' +
      '<div class="grid g4">' +
      kpi('Vendas no mês', brl(fatMes), vMes.length + ' venda(s)') +
      kpi('Lucro no mês', brl(lucMes), 'já descontando as perdas') +
      kpi('Peças em estoque', pecas, 'valem ' + brl(valorVenda) + ' · custaram ' + brl(valorCusto)) +
      kpi('Filamento disponível', fmt(gramas / 1000, 2) + ' kg', rolos.length + ' rolo(s) · ' + fmt(hMes, 0) + ' h de máquina no mês') +
      '</div>' +
      '<div class="grid g2">' +
      '<div class="card"><h2>Alertas</h2>' + (alertas.length ? '<div class="stack" style="gap:10px">' + alertas.map(function (a) {
        return '<div class="row" style="align-items:flex-start"><span class="pill ' + a[0] + '">' + a[1] + '</span><div class="small" style="padding-top:2px">' + a[2] + '</div></div>';
      }).join('') + '</div>' : '<div class="muted">Tudo em ordem por aqui. 👌</div>') + '</div>' +
      '<div class="card"><h2>Mais lucrativos por unidade</h2>' + topLucro() + '</div>' +
      '</div>' +
      '<div class="card"><div class="row between"><h2 style="margin:0">Últimas vendas</h2><a class="small" href="#/vendas">ver todas</a></div>' + (ultimas.length ? '<div class="tbl-wrap" style="margin-top:8px"><table class="tbl"><thead><tr><th>Data</th><th>Produto</th><th class="hide-m">Canal</th><th class="num">Valor</th><th class="num">Lucro</th></tr></thead><tbody>' +
        ultimas.map(function (x) { var l = lucroVenda(x); return '<tr><td>' + dataBR(x.data) + '</td><td>' + esc(nomeVenda(x)) + (x.quantidade > 1 ? ' × ' + x.quantidade : '') + '</td><td class="hide-m">' + esc(nomePlat(x.plataforma_id)) + '</td><td class="num">' + brl(num(x.valor_total)) + '</td><td class="num" style="font-weight:700;color:' + (l < 0 ? 'var(--bad)' : 'var(--ok)') + '">' + brl(l) + '</td></tr>'; }).join('') +
        '</tbody></table></div>' : '<div class="muted small" style="margin-top:8px">Nenhuma venda registrada ainda. Use o botão “+ Venda” lá em cima.</div>') + '</div>' +
      '</div>';
    $('#q-venda').addEventListener('click', function () { registrarVenda(); });
    $('#q-imp').addEventListener('click', function () { registrarImpressao(); });
    v.onclick = function (e) {
      var t = e.target.closest('[data-preco-fil],[data-preco-ins]'); if (!t) return;
      e.preventDefault();
      if (t.dataset.precoFil) { var f = byId(S.filamentos, t.dataset.precoFil); pesquisarPreco(termoRolo(f), f.tipo + ' ' + f.cor); }
      else { var it = byId(S.insumos, t.dataset.precoIns); pesquisarPreco(termoInsumo(it), it.nome); }
    };
  }
  function kpi(l, v, s) { return '<div class="card kpi"><div class="lbl">' + esc(l) + '</div><div class="v">' + esc(v) + '</div>' + (s ? '<div class="small muted">' + esc(s) + '</div>' : '') + '</div>'; }
  function topLucro() {
    var arr = S.produtos.filter(function (p) { return p.ativo && num(p.preco); }).map(function (p) {
      var c = custoProduto(p); return { p: p, l: num(p.preco) - c.total, inc: c.avisos.length > 0 };
    }).filter(function (x) { return !x.inc; }).sort(function (a, b) { return b.l - a.l; }).slice(0, 6);
    if (!arr.length) return '<div class="muted">Aparece aqui quando os produtos tiverem o custo completo (gramas e tempo, ou custo de compra na revenda).</div>';
    return '<table class="tbl"><thead><tr><th>Produto</th><th class="num">Preço</th><th class="num">Lucro</th></tr></thead><tbody>' + arr.map(function (x) {
      return '<tr class="click" data-href="#/produto/' + x.p.id + '"><td>' + esc(x.p.nome) + (x.inc ? ' <span class="pill p-mut" title="custo incompleto">estimado</span>' : '') + '</td><td class="num">' + brl(num(x.p.preco)) + '</td><td class="num" style="color:var(--ok);font-weight:700">' + brl(x.l) + '</td></tr>';
    }).join('') + '</tbody></table>';
  }

  // ------------------------------------------------------------------ PRODUTOS (lista)
  function telaProdutos(v) {
    setHeader('Produtos', '<a class="btn btn-p" href="#/produto/novo">+ <span class="long">Novo produto</span></a>');
    var f = (location.hash.split('?f=')[1] || '');
    if (f === 'incompletos') S.ui.prodStatus = 'incompletos';
    v.innerHTML =
      '<div class="stack">' +
      '<div class="row wrap">' +
      '<div class="busca grow" style="max-width:380px"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input class="inp" type="search" id="pb" placeholder="Pesquisar produto, categoria, material, Shopee…" value="' + esc(S.ui.prodBusca) + '" aria-label="Pesquisar produtos"></div>' +
      '<select class="inp" id="pc" style="width:auto"><option value="">Todas as categorias</option>' + categorias().map(function (c) { return '<option' + (S.ui.prodCat === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' +
      '<select class="inp" id="ps" style="width:auto">' + [['', 'Todos'], ['ativos', 'Só ativos'], ['estoque', 'Com estoque'], ['encomenda', 'Sob encomenda'], ['incompletos', 'Custo incompleto'], ['inativos', 'Inativos']].map(function (o) {
        return '<option value="' + o[0] + '"' + (S.ui.prodStatus === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select>' +
      '</div>' +
      '<div class="card" style="padding:6px 8px"><div class="tbl-wrap" id="plist"></div></div>' +
      '</div>';
    function draw() {
      var b = S.ui.prodBusca.toLowerCase(), c = S.ui.prodCat, st = S.ui.prodStatus;
      var list = S.produtos.filter(function (p) {
        if (b) {
          var ads = S.anuncios.filter(function (a) { return a.produto_id === p.id && !a.arquivado && (a.url || a.publicado); });
          var txt = [p.nome, p.categoria, p.material, p.descricao_breve, p.medidas, p.tipo_produto === 'revenda' ? 'revenda' : 'impresso', p.codigo_site]
            .concat(ads.map(function (a) { var pl = byId(S.plataformas, a.plataforma_id); return (pl ? pl.nome : a.plataforma_id); }), ads.map(function (a) { return a.url; }));
          if (!combina(txt, b)) return false;
        }
        if (c && p.categoria !== c) return false;
        if (st === 'ativos' && !p.ativo) return false;
        if (st === 'inativos' && p.ativo) return false;
        if (st === 'estoque' && !(p.estoque > 0)) return false;
        if (st === 'encomenda' && p.estoque > 0) return false;
        if (st === 'incompletos' && !custoProduto(p).avisos.length) return false;
        return true;
      });
      if (!list.length) { $('#plist').innerHTML = '<div class="empty">' + (S.produtos.length ? 'Nenhum produto com esse filtro.' : 'Nenhum produto ainda. <a href="#/config">Importe o catálogo do site</a> ou <a href="#/produto/novo">cadastre o primeiro</a>.') + '</div>'; return; }
      list = ordenarTabela('prod', list, {
        nome: function (p) { return p.nome; }, cat: function (p) { return p.categoria; }, custo: function (p) { return custoProduto(p).total; },
        preco: function (p) { return num(p.preco); }, lucro: function (p) { return num(p.preco) ? num(p.preco) - custoProduto(p).total : null; },
        estoque: function (p) { return p.estoque || 0; }, site: function (p) { return !p.ativo ? 3 : !p.mostrar_no_site ? 2 : p.estoque > 0 ? 0 : 1; }
      });
      var th = function (k, t, cls) { return thOrd('prod', k, t, cls); };
      $('#plist').innerHTML = '<table class="tbl"><thead><tr><th></th>' + th('nome', 'Produto') + th('cat', 'Categoria', 'hide-m') + th('custo', 'Custo', 'num hide-m') + th('preco', 'Preço Pix', 'num') + th('lucro', 'Lucro', 'num hide-m') + th('estoque', 'Estoque', 'num hide-m') + th('site', 'Site', 'hide-m') + '</tr></thead><tbody>' +
        list.map(function (p) {
          var c = custoProduto(p), preco = num(p.preco), l = preco ? preco - c.total : null;
          var site = !p.ativo ? '<span class="pill p-mut">Inativo</span>' : !p.mostrar_no_site ? '<span class="pill p-mut">Oculto</span>' : p.estoque > 0 ? '<span class="pill p-ok">Pronta entrega</span>' : '<span class="pill p-info">Sob encomenda</span>';
          return '<tr class="click" data-href="#/produto/' + p.id + '">' +
            '<td style="width:58px">' + thumbHtml(p.fotos && p.fotos[0], p.fotos) + '</td>' +
            '<td><div style="font-weight:700">' + esc(p.nome) + '</div><div class="small muted">' + (p.tipo_produto === 'revenda' ? 'Revenda' : (esc(p.material || '') + (p.tempo_min ? ' · ' + horas(p.tempo_min) : ''))) + '</div>' +
            '<div class="show-m small" style="margin-top:4px">' + site + ' <span class="muted">estoque ' + (p.estoque || 0) + '</span>' + (c.avisos.length ? ' <span class="pill p-warn">custo incompleto</span>' : ' <span class="muted">· lucro ' + brl(l) + '</span>') + '</div></td>' +
            '<td class="hide-m">' + esc(p.categoria || '—') + '</td>' +
            '<td class="num hide-m">' + brl(c.total) + (c.avisos.length ? '<div><span class="pill p-warn" title="' + esc(c.avisos.join(', ')) + '">incompleto</span></div>' : '') + '</td>' +
            '<td class="num">' + brl(preco) + '</td>' +
            '<td class="num hide-m" style="color:' + (l !== null && l < 0 ? 'var(--bad)' : 'var(--ok)') + ';font-weight:700">' + brl(l) + '</td>' +
            '<td class="num hide-m">' + (p.estoque || 0) + '</td>' +
            '<td class="hide-m">' + site + '</td></tr>';
        }).join('') + '</tbody></table>';
    }
    $('#pb').addEventListener('input', function (e) { S.ui.prodBusca = e.target.value; draw(); });
    $('#pc').addEventListener('change', function (e) { S.ui.prodCat = e.target.value; draw(); });
    $('#ps').addEventListener('change', function (e) { S.ui.prodStatus = e.target.value; draw(); });
    $('#plist').addEventListener('click', function (e) { var t = e.target.closest('th[data-ord]'); if (t) { var p2 = t.dataset.ord.split(':'); var o = S.ui.ord.prod || {}; S.ui.ord.prod = o.k === p2[1] ? { k: p2[1], dir: -o.dir } : { k: p2[1], dir: 1 }; draw(); } });
    draw();
  }

  // ------------------------------------------------------------------ PRODUTO (editor)
  function opcoesParaTexto(op) {
    if (!op || !op.length) return '';
    return op.map(function (o) { return o.name + ': ' + (o.choices || []).join(', '); }).join('\n');
  }
  function textoParaOpcoes(t) {
    return String(t || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
      var i = l.indexOf(':');
      if (i < 0) return { name: l, choices: [] };
      return { name: l.slice(0, i).trim(), choices: l.slice(i + 1).split(',').map(function (s) { return s.trim(); }).filter(Boolean) };
    });
  }

  function telaProduto(v, id) {
    var novo = id === 'novo';
    var orig = novo ? null : byId(S.produtos, id);
    if (!novo && !orig) { v.innerHTML = '<div class="card">Produto não encontrado. <a href="#/produtos">Voltar</a></div>'; setHeader('Produto'); return; }
    var cfg = S.cfg || {};
    var p = orig ? JSON.parse(JSON.stringify(orig)) : {
      id: uid(), nome: '', categoria: categorias()[0], tipo_produto: 'impresso', ativo: true, mostrar_no_site: true, destaque: false,
      usa_hora_maquina: true, estoque: 0, fotos: [], opcoes: [], videos: [], material: 'PLA', acabamento_faixa: (cfg.faixas_acabamento || [])[0] || null
    };
    var itens = S.prodInsumos.filter(function (x) { return x.produto_id === p.id; }).map(function (x) { return { insumo_id: x.insumo_id, quantidade: x.quantidade }; });

    setHeader(novo ? 'Novo produto' : p.nome, (novo ? '' : (orig.ativo && orig.mostrar_no_site ? '<a class="btn btn-g hide-m" href="' + esc(((window.CRISTART_CONFIG || {}).siteUrl || 'https://www.cristart3d.com.br/') + '#/produto/' + encodeURIComponent(orig.codigo_site || orig.id)) + '" target="_blank" rel="noopener">Ver no site ' + ICON.ext + '</a>' : '') + '<button class="btn btn-g hide-m" id="pq-imp">+ Impressão</button><button class="btn btn-g hide-m" id="pq-venda">+ Venda</button>') + '<a class="btn btn-g" href="#/produtos">Voltar</a>');
    if (!novo) {
      $('#pq-imp').addEventListener('click', function () { if (dirty) return toast('Salve o produto antes', true); registrarImpressao(p.id); });
      $('#pq-venda').addEventListener('click', function () { if (dirty) return toast('Salve o produto antes', true); registrarVenda(p.id); });
    }

    var fBasico = [
      { k: 'nome', label: 'Nome do produto', span: 2 },
      { k: 'categoria', label: 'Categoria', type: 'select', opts: categorias() },
      { k: 'tipo_produto', label: 'Tipo', type: 'select', opts: [{ v: 'impresso', t: 'Impresso por nós' }, { v: 'revenda', t: 'Revenda' }] }
    ];
    var fFlags = [
      { k: 'ativo', label: 'Ativo', type: 'check' },
      { k: 'mostrar_no_site', label: 'Mostrar no site (entra sozinho no cristart3d.com.br)', type: 'check' },
      { k: 'destaque', label: 'Destaque', type: 'check' }
    ];
    var fTextos = [
      { k: 'descricao_breve', label: 'Descrição breve (aparece no cartão do site)', type: 'textarea', rows: 2, span: 2 },
      { k: 'descricao', label: 'Descrição completa', type: 'textarea', rows: 7, span: 2 },
      { k: 'medidas', label: 'Medidas', ph: 'ex.: 10 × 16 cm' },
      { k: 'peso_g', label: 'Peso da peça pronta (g)', type: 'num' }
    ];
    var printerOpts = [{ v: '', t: '— escolher —' }].concat(impressoras().map(function (e) { return { v: e.id, t: e.nome }; }));
    var fProd = [
      { k: 'material', label: 'Material', list: tiposFilamento() },
      { k: 'gramas', label: 'Filamento por unidade (g)', type: 'num', hint: 'Do fatiador (Bambu, Orca, Anycubic)' },
      { k: 'impressora_padrao', label: 'Impressora', type: 'select', opts: printerOpts },
      { k: 'acabamento_faixa', label: 'Tempo de acabamento', type: 'select', opts: [{ v: '', t: '—' }].concat(cfg.faixas_acabamento || []) },
      { k: 'acabamento_tarefas', label: 'O que precisa ser feito no acabamento', type: 'textarea', rows: 2, span: 2, ph: 'ex.: tirar suportes, lixar a base, colar a argola' }
    ];
    var fRevenda = [{ k: 'custo_compra', label: 'Custo de compra (por unidade)', type: 'num' }];
    var fPrecos = [
      { k: 'preco', label: 'Preço Pix / site', type: 'num' },
      { k: 'preco_cartao', label: 'Preço no cartão', type: 'num' },
      { k: 'preco_original', label: 'Preço "de" (riscado)', type: 'num', hint: 'Opcional' }
    ];

    var tempoH = p.tempo_min ? Math.floor(p.tempo_min / 60) : '', tempoM = p.tempo_min ? p.tempo_min % 60 : '';

    v.innerHTML =
      '<form id="pf" class="stack" novalidate>' +
      // básico
      '<div class="card"><h2>Básico</h2><div class="grid g4">' + fBasico.map(function (f) { return fieldHtml(f, p[f.k]); }).join('') + '</div>' +
      '<div class="row wrap" style="gap:22px;margin-top:8px">' + fFlags.map(function (f) { return fieldHtml(f, p[f.k]); }).join('') + '</div></div>' +
      // fotos
      '<div class="card"><div class="row between"><h2 style="margin:0">Fotos</h2><span class="small muted">A primeira é a capa. Dá para escolher, arrastar ou colar um print (Ctrl+V).</span></div><div class="photos" id="photos" style="margin-top:12px"></div>' +
      '<input type="file" id="photo-in" accept="image/*" multiple class="hidden"></div>' +
      // textos
      '<div class="card"><h2>Textos e detalhes</h2><div class="grid g2">' + fTextos.map(function (f) { return fieldHtml(f, p[f.k]); }).join('') +
      '<div class="field" style="grid-column:span 2"><label for="opcoes">Opções para o cliente escolher</label><textarea class="inp" id="opcoes" rows="2" placeholder="Cor: Branco, Preto">' + esc(opcoesParaTexto(p.opcoes)) + '</textarea><div class="hint">Uma por linha, no formato "Nome: opção 1, opção 2".</div></div>' +
      '</div></div>' +
      // produção
      '<div class="card" id="box-impresso"><h2>Produção</h2><div class="grid g4">' +
      fieldHtml(fProd[0], p.material) + fieldHtml(fProd[1], p.gramas) +
      '<div class="field"><label for="th">Tempo de impressão</label><div class="row" style="gap:6px"><input class="inp" id="th" inputmode="numeric" value="' + esc(tempoH) + '" aria-label="horas"><span class="muted">h</span><input class="inp" id="tm" inputmode="numeric" value="' + esc(tempoM) + '" aria-label="minutos"><span class="muted">min</span></div><div class="hint">Por unidade</div></div>' +
      fieldHtml(fProd[2], p.impressora_padrao || '') +
      fieldHtml(fProd[3], p.acabamento_faixa || '') + fieldHtml(fProd[4], p.acabamento_tarefas) +
      '<div style="grid-column:span 1;align-self:end">' + fieldHtml({ k: 'usa_hora_maquina', label: 'Cobrar hora-máquina', type: 'check' }, p.usa_hora_maquina) + '</div>' +
      '</div></div>' +
      '<div class="card hidden" id="box-revenda"><h2>Revenda</h2><div class="grid g4">' + fieldHtml(fRevenda[0], p.custo_compra) + '</div></div>' +
      // insumos
      '<div class="card"><div class="row between"><h2 style="margin:0">Insumos e extras usados</h2>' +
      (S.insumos.length ? '<button type="button" class="btn btn-g btn-s" id="add-ins">+ Adicionar</button>' : '<a class="small" href="#/insumos">Cadastre insumos primeiro</a>') +
      '</div><div id="ins-list" style="margin-top:10px"></div></div>' +
      // custo e preço
      '<div class="card"><h2>Custo e preço</h2><div class="grid g2"><div id="cost-box"></div><div class="stack">' +
      '<div class="price-tiles" id="price-tiles"></div>' +
      '<div class="grid g3">' + fPrecos.map(function (f) { return fieldHtml(f, p[f.k]); }).join('') + '</div>' +
      '<div class="row wrap"><button type="button" class="btn btn-g btn-s" id="use-sug">Usar preço sugerido</button><button type="button" class="btn btn-g btn-s" id="calc-card">Calcular preço no cartão (' + fmt(num(cfg.taxa_cartao_pct) || 12) + '%)</button></div>' +
      '</div></div></div>' +
      // estoque
      '<div class="card"><h2>Estoque</h2><div class="row wrap">' +
      '<button type="button" class="icon-btn" id="est-menos" aria-label="Diminuir estoque">−</button>' +
      '<input class="inp" id="estoque" inputmode="numeric" value="' + esc(p.estoque || 0) + '" style="width:90px;text-align:center;font-weight:800;font-size:18px" aria-label="Estoque">' +
      '<button type="button" class="icon-btn" id="est-mais" aria-label="Aumentar estoque">+</button>' +
      '<div class="small muted grow" id="est-info"></div></div></div>' +
      // anúncios
      '<div class="card"><div class="row between wrap"><h2 style="margin:0">Onde está anunciado</h2>' + (novo ? '' : '<div class="row wrap" style="gap:6px"><button type="button" class="btn btn-g btn-s" id="dup-prod">Duplicar produto</button><a class="btn btn-g btn-s" href="#/fotos/' + p.id + '">🎨 Fotos com IA</a><button type="button" class="btn btn-p btn-s" id="ads-ia">✨ Anúncios</button></div>') + '</div><div id="ads" class="ads" style="margin-top:8px"></div>' +
      '<div class="hint" style="margin-top:8px">O preço sugerido de cada plataforma cobre a taxa dela (configure as taxas em Configurações).</div></div>' +
      // salvar
      '<div class="sticky-save">' + (novo ? '' : '<button type="button" class="btn btn-d" id="del" style="margin-right:auto">Excluir</button>') +
      '<a class="btn btn-g" href="#/produtos">Cancelar</a><button type="submit" class="btn btn-p" id="save">Salvar produto</button></div>' +
      '</form>';

    var form = $('#pf');

    function lerForm() {
      var o = readFields(fBasico.concat(fFlags, fTextos, fProd, fRevenda, fPrecos, [{ k: 'usa_hora_maquina', type: 'check' }]), form);
      var h = num($('#th').value) || 0, m = num($('#tm').value) || 0;
      o.tempo_min = (h || m) ? Math.round(h * 60 + m) : null;
      o.opcoes = textoParaOpcoes($('#opcoes').value);
      o.estoque = Math.max(0, Math.round(num($('#estoque').value) || 0));
      o.impressora_padrao = o.impressora_padrao || null;
      o.acabamento_faixa = o.acabamento_faixa || null;
      return o;
    }
    function atual() { var o = lerForm(); o.id = p.id; return o; }

    // fotos
    function drawPhotos() {
      $('#photos').innerHTML = p.fotos.map(function (u, i) {
        return '<div class="photo"><img src="' + esc(u) + '" alt="Foto ' + (i + 1) + '">' + (i === 0 ? '<span class="cover">CAPA</span>' : '') +
          '<div class="tools">' + (i > 0 ? '<button type="button" data-ph="first" data-i="' + i + '" aria-label="Tornar capa" title="Tornar capa">★</button>' : '') +
          '<button type="button" data-ph="del" data-i="' + i + '" aria-label="Remover foto" title="Remover">✕</button></div></div>';
      }).join('') + '<button type="button" class="photo-add" id="photo-add">' + ICON.plus + 'Adicionar</button>';
    }
    async function adicionarFotos(files) {
      if (!files.length) return;
      var add = $('#photo-add'); add.disabled = true; add.innerHTML = '<span class="spinner" style="border-color:rgba(0,0,0,.15);border-top-color:var(--craft)"></span>Enviando…';
      try {
        for (var i = 0; i < files.length; i++) {
          var blob = await comprimir(files[i]);
          var url = await enviarFoto(blob, 'produtos/' + p.id);
          p.fotos.push(url); dirty = true;
        }
        toast(files.length > 1 ? files.length + ' fotos enviadas' : 'Foto enviada');
      } catch (err) { toast('Erro ao enviar foto: ' + erroMsg(err), true); }
      drawPhotos();
    }
    pasteAlvo.pagina = adicionarFotos;
    soltarImagens($('#photos'), adicionarFotos);
    drawPhotos();
    $('#photos').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.id === 'photo-add') return $('#photo-in').click();
      var i = +b.dataset.i;
      if (b.dataset.ph === 'del') p.fotos.splice(i, 1);
      if (b.dataset.ph === 'first') { var f = p.fotos.splice(i, 1)[0]; p.fotos.unshift(f); }
      dirty = true; drawPhotos();
    });
    $('#photo-in').addEventListener('change', function (e) {
      var files = Array.prototype.slice.call(e.target.files || []); e.target.value = '';
      adicionarFotos(files);
    });

    // insumos
    function drawIns() {
      if (!itens.length) { $('#ins-list').innerHTML = '<div class="small muted">Nenhum. Ex.: argola de chaveiro, embalagem, card de agradecimento.</div>'; return; }
      $('#ins-list').innerHTML = '<div class="stack" style="gap:8px">' + itens.map(function (it, i) {
        return '<div class="row"><select class="inp grow" data-ins="sel" data-i="' + i + '">' + S.insumos.map(function (ins) {
          return '<option value="' + ins.id + '"' + (ins.id === it.insumo_id ? ' selected' : '') + '>' + esc(ins.nome) + ' (' + brl(num(ins.custo_unitario)) + ')</option>';
        }).join('') + '</select><input class="inp" data-ins="qt" data-i="' + i + '" inputmode="decimal" value="' + esc(fmtIn(it.quantidade)) + '" style="width:80px" aria-label="Quantidade">' +
          '<button type="button" class="icon-btn" data-ins="del" data-i="' + i + '" aria-label="Remover insumo">✕</button></div>';
      }).join('') + '</div>';
    }
    drawIns();
    if ($('#add-ins')) $('#add-ins').addEventListener('click', function () {
      var livre = S.insumos.filter(function (ins) { return !itens.some(function (it) { return it.insumo_id === ins.id; }); })[0] || S.insumos[0];
      itens.push({ insumo_id: livre.id, quantidade: 1 }); dirty = true; drawIns(); recalc();
    });
    $('#ins-list').addEventListener('change', function (e) {
      var el = e.target, i = +el.dataset.i; if (isNaN(i)) return;
      if (el.dataset.ins === 'sel') itens[i].insumo_id = el.value;
      if (el.dataset.ins === 'qt') itens[i].quantidade = num(el.value) || 0;
      dirty = true; recalc();
    });
    $('#ins-list').addEventListener('click', function (e) {
      var b = e.target.closest('[data-ins="del"]'); if (!b) return;
      itens.splice(+b.dataset.i, 1); dirty = true; drawIns(); recalc();
    });

    // anúncios (resumo; a edição fica na página de anúncios)
    function drawAds(preco) {
      var l = adsDe(p.id);
      $('#ads').innerHTML = novo ? '<div class="small muted">Salve o produto para criar os anúncios.</div>' : (l.length ? l.map(function (a) {
        var pl = byId(S.plataformas, a.plataforma_id) || { nome: a.plataforma_id }, pr = num(a.preco) || precoPlataforma(preco, pl);
        return '<div class="ad-row"><div class="ad-name" style="font-weight:700">' + esc(pl.nome) + (a.apelido ? ' <span class="small muted">· ' + esc(a.apelido) + '</span>' : '') + '</div>' +
          '<div class="small" style="align-self:center">' + (a.titulo ? esc(a.titulo) : '<span class="muted">sem texto</span>') + '</div>' +
          '<div class="num" style="align-self:center">' + (pr ? brl(pr) : '—') + '</div>' +
          '<div class="ad-open">' + (isUrl(a.url) ? '<a class="btn btn-g btn-s" href="' + esc(a.url) + '" target="_blank" rel="noopener">Abrir ' + ICON.ext + '</a>' : (a.publicado ? '<span class="pill p-ok">publicado</span>' : (a.titulo ? '<span class="pill p-info">texto ✓</span>' : ''))) + '</div></div>';
      }).join('') : '<div class="small muted">Nenhum anúncio ainda. Clique em <b>✨ Anúncios</b> para criar com IA.</div>');
    }
    if ($('#ads-ia')) $('#ads-ia').addEventListener('click', function () {
      if (dirty) return toast('Salve o produto antes de abrir os anúncios', true);
      go('#/anuncio/' + p.id);
    });
    if ($('#dup-prod')) $('#dup-prod').addEventListener('click', function () {
      if (dirty) return toast('Salve o produto antes de duplicar', true);
      duplicarProduto(p.id);
    });

    // recálculo ao vivo
    var ultimoSug = 0;
    function recalc() {
      var o = atual();
      var rev = o.tipo_produto === 'revenda';
      $('#box-impresso').classList.toggle('hidden', rev);
      $('#box-revenda').classList.toggle('hidden', !rev);
      var c = custoProduto(o, itens);
      ultimoSug = c.sugerido;
      $('#cost-box').innerHTML = '<div class="cost-box"><div class="lbl" style="margin-bottom:2px">Composição do custo (por unidade)</div>' +
        c.linhas.map(function (l) { return '<div class="row between"><span>' + esc(l[0]) + '</span><span>' + brl(l[1]) + '</span></div>'; }).join('') +
        '<div class="row between tot"><span>Custo total</span><span>' + brl(c.total) + '</span></div>' +
        (c.fonteFilamento ? '<div class="hint">Preço do filamento: ' + esc(c.fonteFilamento) + '.</div>' : '') +
        (c.avisos.length ? '<div><span class="pill p-warn">' + esc(c.avisos.join(' · ')) + '</span></div>' : '') + '</div>';
      var preco = o.preco;
      var lucro = preco ? preco - c.total : null;
      var marg = preco && c.total ? ((preco - c.total) / c.total) * 100 : null;
      $('#price-tiles').innerHTML =
        '<div class="tile"><div class="lbl">Sugerido</div><div class="v">' + brl(c.sugerido) + '</div><div class="hint">margem ' + fmt(c.margemPadrao) + '%</div></div>' +
        '<div class="tile" style="border-color:var(--craft)"><div class="lbl">Lucro no Pix</div><div class="v" style="color:' + (lucro !== null && lucro < 0 ? 'var(--bad)' : 'var(--ok)') + '">' + brl(lucro) + '</div><div class="hint">' + (marg !== null ? 'margem real ' + fmt(marg, 0) + '%' : 'defina o preço') + '</div></div>' +
        '<div class="tile"><div class="lbl">Por hora de impressora</div><div class="v">' + (lucro !== null && o.tempo_min && !rev ? brl(lucro / (o.tempo_min / 60)) : '—') + '</div><div class="hint">lucro ÷ tempo</div></div>';
      $('#est-info').textContent = (o.estoque > 0 ? 'No site: “Pronta entrega”.' : 'No site: “Sob encomenda”.') + (o.estoque > 0 ? ' Custo das peças em estoque: ' + brl(o.estoque * c.total) + '.' : '');
      drawAds(preco);
    }
    recalc();
    form.addEventListener('input', function (e) { if (e.target.closest('#ads')) return; dirty = true; recalc(); });
    form.addEventListener('change', function (e) { if (e.target.closest('#ads')) return; dirty = true; recalc(); });
    $('#use-sug').addEventListener('click', function () { $('[data-k="preco"]').value = fmtIn(ultimoSug.toFixed(2)); dirty = true; recalc(); });
    $('#calc-card').addEventListener('click', function () {
      var pr = num($('[data-k="preco"]').value); if (!pr) return toast('Defina o preço Pix primeiro', true);
      var t = num(cfg.taxa_cartao_pct) || 12;
      $('[data-k="preco_cartao"]').value = fmtIn(arred(pr / (1 - t / 100)).toFixed(2)); dirty = true; recalc();
    });
    $('#est-menos').addEventListener('click', function () { var e = $('#estoque'); e.value = Math.max(0, (num(e.value) || 0) - 1); dirty = true; recalc(); });
    $('#est-mais').addEventListener('click', function () { var e = $('#estoque'); e.value = (num(e.value) || 0) + 1; dirty = true; recalc(); });

    if ($('#del')) $('#del').addEventListener('click', async function () {
      if (!(await confirmar('Excluir produto?', 'Isso apaga "' + p.nome + '" do sistema e do site. Se só quiser tirar do ar, desmarque "Ativo".', 'Excluir', true))) return;
      try {
        q(await sb.from('produtos').delete().eq('id', p.id));
        S.produtos = S.produtos.filter(function (x) { return x.id !== p.id; });
        dirty = false; toast('Produto excluído'); go('#/produtos');
      } catch (err) { toast(erroMsg(err), true); }
    });

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var o = atual();
      if (!o.nome) { toast('Dê um nome ao produto', true); $('[data-k="nome"]').focus(); return; }
      o.fotos = p.fotos;
      o.videos = p.videos || [];
      if (orig) o.codigo_site = orig.codigo_site;
      var btn = $('#save'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Salvando…';
      try {
        var saved = q(await sb.from('produtos').upsert(o).select().single());
        // insumos: substitui a lista
        q(await sb.from('produto_insumos').delete().eq('produto_id', p.id));
        var lin = itens.filter(function (it) { return it.insumo_id && num(it.quantidade); })
          .reduce(function (acc, it) { if (!acc.some(function (a) { return a.insumo_id === it.insumo_id; })) acc.push(it); return acc; }, [])
          .map(function (it) { return { produto_id: p.id, insumo_id: it.insumo_id, quantidade: num(it.quantidade) }; });
        if (lin.length) q(await sb.from('produto_insumos').insert(lin));
        // atualiza cache
        S.produtos = S.produtos.filter(function (x) { return x.id !== saved.id; }).concat([saved]);
        S.prodInsumos = S.prodInsumos.filter(function (x) { return x.produto_id !== p.id; }).concat(lin);
        dirty = false;
        toast('Produto salvo ✓');
        if (novo) go('#/produto/' + p.id); else { setHeader(saved.nome, '<a class="btn btn-g" href="#/produtos">Voltar</a>'); }
      } catch (err) { toast('Não salvou: ' + erroMsg(err), true); }
      btn.disabled = false; btn.textContent = 'Salvar produto';
    });
  }

  // fotos: comprime para no máx. 1600px, JPEG 82%
  function comprimir(file, max, qual) {
    max = max || 1600; qual = qual || 0.82;
    return new Promise(function (res, rej) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
        var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
        var ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? res(b) : rej(new Error('Não consegui processar a imagem')); }, 'image/jpeg', qual);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('Arquivo de imagem inválido')); };
      img.src = url;
    });
  }
  async function enviarFoto(blob, pasta) {
    var path = pasta + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) + '.jpg';
    q(await sb.storage.from('fotos').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false }));
    return sb.storage.from('fotos').getPublicUrl(path).data.publicUrl;
  }

  // ------------------------------------------------------------------ pesquisar preço (abre as lojas já buscando, do mais barato)
  function termoRolo(f) {
    var kg = (num(f.peso_inicial_g) || 1000) / 1000;
    return ['filamento', f.tipo, f.cor, f.marca, fmt(kg) + 'kg'].filter(Boolean).join(' ');
  }
  function termoInsumo(i) { return String(i.nome || '').split(/\s+/).slice(0, 8).join(' '); }
  function lojasPara(t) {
    var slug = norm(t).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    var qq = encodeURIComponent(t);
    return [
      { n: 'Mercado Livre', u: 'https://lista.mercadolivre.com.br/' + slug + '_OrderId_PRICE_NoIndex_True' },
      { n: 'Shopee', u: 'https://shopee.com.br/search?keyword=' + qq + '&order=asc&sortBy=price' },
      { n: 'Google Shopping', u: 'https://www.google.com/search?tbm=shop&tbs=p_ord:p&q=' + qq }
    ];
  }
  function pesquisarPreco(termo, titulo) {
    var m = modal('<div class="row between"><h2>Pesquisar preço</h2><button class="btn btn-g btn-s" data-x="close">Fechar</button></div>' +
      (titulo ? '<div class="muted small" style="margin-top:-8px">' + esc(titulo) + '</div>' : '') +
      '<div class="field"><label for="pp-termo">O que procurar</label><input class="inp" id="pp-termo" value="' + esc(termo) + '"><div class="hint">Pode ajustar o texto antes de abrir. As lojas abrem já ordenadas do mais barato.</div></div>' +
      '<div class="stack" style="gap:8px" id="pp-lojas"></div>', { size: 'sm', noFocus: true });
    function draw() {
      var t = $('#pp-termo', m).value.trim() || termo;
      $('#pp-lojas', m).innerHTML = lojasPara(t).map(function (l) { return '<a class="btn btn-g" style="justify-content:space-between" href="' + esc(l.u) + '" target="_blank" rel="noopener">' + esc(l.n) + ' <span class="muted small">menor preço ' + ICON.ext + '</span></a>'; }).join('');
    }
    $('#pp-termo', m).addEventListener('input', draw);
    m.addEventListener('click', function (e) { if (e.target.closest('[data-x="close"]')) closeModal(); });
    draw();
  }

  // ------------------------------------------------------------------ FILAMENTOS
  var F_FIL = [
    { k: 'tipo', label: 'Tipo', list: ['PLA', 'PETG', 'PLA Silk', 'PLA Matte', 'ABS', 'TPU'] },
    { k: 'cor', label: 'Cor' },
    { k: 'cor_hex', label: 'Cor (amostra)', type: 'color' },
    { k: 'marca', label: 'Marca', ph: 'opcional' },
    { k: 'preco_pago', label: 'Preço pago (R$)', type: 'num' },
    { k: 'data_compra', label: 'Data da compra', type: 'date' },
    { k: 'link_compra', label: 'Link de compra', span: 2, ph: 'cole o link aqui' },
    { k: 'observacoes', label: 'Observações', type: 'textarea', rows: 2, span: 2 }
  ];
  var ORD_FIL = [
    { v: 'restante', t: 'Restante (acabando primeiro)' },
    { v: 'cor', t: 'Cor (A→Z)' },
    { v: 'tipo', t: 'Tipo de filamento' },
    { v: 'compra', t: 'Data de compra (mais recente)' },
    { v: 'valor', t: 'Valor pago (maior)' },
    { v: 'grama', t: 'Custo por grama (menor)' },
    { v: 'marca', t: 'Marca (A→Z)' },
    { v: 'recentes', t: 'Cadastrados por último' }
  ];
  function ordenarRolos(lista, modo) {
    var txt = function (a, b) { return String(a || '').localeCompare(String(b || ''), 'pt-BR', { sensitivity: 'base' }); };
    var cg = function (f) { var ini = num(f.peso_inicial_g); return num(f.preco_pago) && ini ? num(f.preco_pago) / ini : 9e9; };
    var fn = {
      restante: function (a, b) { return (num(a.restante_g) || 0) - (num(b.restante_g) || 0); },
      cor: function (a, b) { return txt(a.cor, b.cor) || txt(a.tipo, b.tipo); },
      tipo: function (a, b) { return txt(a.tipo, b.tipo) || txt(a.cor, b.cor); },
      compra: function (a, b) { return txt(b.data_compra || '0', a.data_compra || '0'); },
      valor: function (a, b) { return (num(b.preco_pago) || 0) - (num(a.preco_pago) || 0); },
      grama: function (a, b) { return cg(a) - cg(b); },
      marca: function (a, b) { return txt(a.marca, b.marca) || txt(a.tipo, b.tipo); },
      recentes: function (a, b) { return txt(b.criado_em, a.criado_em); }
    }[modo] || function () { return 0; };
    return lista.slice().sort(fn);
  }
  function carretelDe(f) { return f && f.carretel_id ? byId(S.carreteis, f.carretel_id) : null; }

  function telaFilamentos(v) {
    setHeader('Filamentos', '<button class="btn btn-p" id="novo-rolo">+ <span class="long">Novo rolo</span></button>');
    var modo = S.ui.filOrd || 'restante';
    var busca = S.ui.busca.fil || '';
    var lista = ordenarRolos(S.filamentos.filter(function (f) {
      if (busca) { var c = carretelDe(f); return combina([f.tipo, f.cor, f.marca, f.link_compra, f.observacoes, f.data_compra ? dataBR(f.data_compra) : '', c ? c.nome : '', f.arquivado ? 'acabou arquivado' : ''], busca); } // busca olha também os que acabaram
      return S.ui.verArquivados ? f.arquivado : !f.arquivado;
    }), modo);
    var narq = S.filamentos.filter(function (f) { return f.arquivado; }).length;
    v.innerHTML = '<div class="stack">' +
      buscaHtml('fil', 'Pesquisar: PETG, preto, Masterprint, Shopee…') +
      '<div class="row between wrap">' +
      '<div class="row wrap"><label class="lbl" for="fil-ord">Ordenar por</label><select class="inp" id="fil-ord" style="width:auto">' + ORD_FIL.map(function (o) { return '<option value="' + o.v + '"' + (o.v === modo ? ' selected' : '') + '>' + esc(o.t) + '</option>'; }).join('') + '</select></div>' +
      '<label class="check small"><input type="checkbox" id="ver-arq"' + (S.ui.verArquivados ? ' checked' : '') + '> Ver rolos que acabaram (' + narq + ')</label></div>' +
      (lista.length ? '<div class="grid g3">' + lista.map(cartaoRolo).join('') + '</div>' : busca ? '<div class="card">' + nadaAchado('fil') + '</div>' : '<div class="card empty">' + (S.ui.verArquivados ? 'Nenhum rolo arquivado.' : 'Nenhum rolo cadastrado ainda. Clique em “Novo rolo”.') + '</div>') +
      secaoCarreteis() +
      '</div>';
    $('#ver-arq').addEventListener('change', function (e) { S.ui.verArquivados = e.target.checked; render(); });
    $('#fil-ord').addEventListener('change', function (e) { S.ui.filOrd = e.target.value; render(); });
    ligarBusca('fil');
    $('#novo-rolo').addEventListener('click', function () { editarFilamento(null); });
    v.onclick = function (e) {
      var t;
      if ((t = e.target.closest('[data-rest]'))) return editarRestanteNaHora(t.dataset.rest);
      if ((t = e.target.closest('[data-pesar]'))) return pesarRolo(t.dataset.pesar);
      if ((t = e.target.closest('[data-preco-fil]'))) { var fr = byId(S.filamentos, t.dataset.precoFil); return pesquisarPreco(termoRolo(fr), fr.tipo + ' ' + fr.cor); }
      if ((t = e.target.closest('[data-carr]'))) return editarCarretel(t.dataset.carr === 'novo' ? null : t.dataset.carr);
      if ((t = e.target.closest('[data-edit]'))) return editarFilamento(t.dataset.edit);
    };
    v.onkeydown = function (e) {
      var inp = e.target.closest('[data-rest-in]'); if (!inp) return;
      if (e.key === 'Enter') { e.preventDefault(); salvarRestante(inp.dataset.restIn, inp.value); }
      if (e.key === 'Escape') { e.stopPropagation(); render(); }
    };
  }
  function cartaoRolo(f) {
    var ini = num(f.peso_inicial_g) || 1000, rest = num(f.restante_g) || 0, pct = Math.max(0, Math.min(100, Math.round(rest / ini * 100)));
    var pg = num(f.preco_pago) && ini ? num(f.preco_pago) / ini : null;
    var car = carretelDe(f);
    return '<div class="card stack" style="gap:10px" data-rolo="' + f.id + '"><div class="row">' +
      (f.foto ? '<img class="swatch-foto zoomable" data-zoom="' + esc(JSON.stringify([f.foto])) + '" src="' + esc(f.foto) + '" alt="Foto do rolo" loading="lazy" style="border-color:' + esc(f.cor_hex || '#ccc') + '">' : '<div class="swatch" style="background:' + esc(f.cor_hex || '#ccc') + '"></div>') +
      '<div class="grow"><div style="font-weight:700">' + esc(f.tipo + ' ' + f.cor) + '</div><div class="lbl">' + esc(f.marca ? f.marca + ' · ' : '') + 'pago ' + brl(num(f.preco_pago)) + (f.data_compra ? ' · ' + dataBR(f.data_compra) : '') + '</div></div>' +
      '<button class="icon-btn" data-edit="' + f.id + '" aria-label="Editar rolo" title="Editar">' + ICON.edit + '</button></div>' +
      '<div class="bar"><i style="width:' + pct + '%;background:' + (pct < 25 ? '#C2410C' : '#15803D') + '"></i></div>' +
      '<div class="row between small"><span class="rest-slot"><button type="button" class="rest-btn" data-rest="' + f.id + '" title="Clique para corrigir o restante">Restante ~' + fmt(rest, 0) + ' g ' + ICON.edit + '</button></span><span class="muted">' + (pg ? brl(pg) + '/g' : '—') + '</span></div>' +
      '<div class="row between wrap" style="border-top:1px solid #EFEDF4;padding-top:10px;gap:8px">' +
      (isUrl(f.link_compra) ? '<a href="' + esc(f.link_compra) + '" target="_blank" rel="noopener" style="font-weight:700;text-decoration:none;font-size:13px">Comprar de novo ↗</a>' : '<button class="btn btn-g btn-s" data-edit="' + f.id + '">+ Colar link de compra</button>') +
      '<span class="row" style="gap:6px"><button type="button" class="btn btn-g btn-s" data-preco-fil="' + f.id + '" title="Pesquisar preço nas lojas">🔎 Preço</button>' +
      '<button type="button" class="btn btn-g btn-s" data-pesar="' + f.id + '" title="Pesar na balança">⚖ Pesar</button></span></div></div>';
  }
  function editarRestanteNaHora(id) {
    var card = $('[data-rolo="' + id + '"]'); if (!card) return;
    var f = byId(S.filamentos, id);
    $('.rest-slot', card).innerHTML = '<span class="row" style="gap:6px"><input class="inp" data-rest-in="' + id + '" inputmode="decimal" value="' + esc(fmt(num(f.restante_g), 0).replace(/\./g, '')) + '" style="width:96px;min-height:36px;padding:6px 10px" aria-label="Restante em gramas"> g <button type="button" class="btn btn-p btn-s" data-rest-ok="' + id + '">OK</button></span>';
    var inp = $('[data-rest-in]', card); inp.focus(); inp.select();
    $('[data-rest-ok]', card).addEventListener('click', function (e) { e.stopPropagation(); salvarRestante(id, inp.value); });
  }
  async function salvarRestante(id, valor) {
    var g = num(valor);
    if (g === null || g < 0) return toast('Digite o restante em gramas', true);
    try {
      var r = q(await sb.from('filamentos').update({ restante_g: g }).eq('id', id).select().single());
      S.filamentos = S.filamentos.map(function (x) { return x.id === id ? r : x; });
      toast('Restante atualizado: ' + fmt(g, 0) + ' g ✓');
      render();
    } catch (err) { toast(erroMsg(err), true); }
  }
  function pesarRolo(id) {
    var f = byId(S.filamentos, id);
    if (!S.carreteis.length) {
      return confirmar('Cadastre um carretel vazio primeiro', 'Para descontar o carretel, o sistema precisa saber quanto ele pesa vazio. Cadastre na seção “Carretéis vazios”, no fim desta página.', 'Cadastrar agora').then(function (ok) { if (ok) editarCarretel(null); });
    }
    var sel = f.carretel_id || (S.carreteis.filter(function (c) { return f.marca && c.marca && c.marca.toLowerCase() === f.marca.toLowerCase(); })[0] || {}).id || S.carreteis[0].id;
    var m = modal('<div class="row between"><h2>Pesar rolo · ' + esc(f.tipo + ' ' + f.cor) + '</h2><button class="btn btn-g btn-s" data-x="close">Fechar</button></div>' +
      '<div class="grid g2">' +
      '<div class="field"><label for="pz-peso">Peso na balança (g)</label><input class="inp" id="pz-peso" inputmode="decimal" placeholder="rolo + carretel"></div>' +
      '<div class="field"><label for="pz-car">Carretel</label><select class="inp" id="pz-car">' + S.carreteis.map(function (c) { return '<option value="' + c.id + '"' + (c.id === sel ? ' selected' : '') + '>' + esc(c.nome) + ' (' + fmt(num(c.peso_g), 0) + ' g)</option>'; }).join('') + '</select></div>' +
      '</div><div class="note" id="pz-res">Coloque o rolo na balança e digite o peso.</div>' +
      '<div class="row" style="justify-content:flex-end"><button class="btn btn-g" data-x="close">Cancelar</button><button class="btn btn-p" data-x="save">Salvar restante</button></div>', { size: 'sm' });
    function calc() {
      var p = num($('#pz-peso', m).value), c = byId(S.carreteis, $('#pz-car', m).value), tara = c ? num(c.peso_g) || 0 : 0;
      if (p === null) { $('#pz-res', m).textContent = 'Coloque o rolo na balança e digite o peso.'; return null; }
      var r = Math.max(0, p - tara);
      $('#pz-res', m).innerHTML = fmt(p, 0) + ' g − carretel ' + fmt(tara, 0) + ' g = <b>' + fmt(r, 0) + ' g de filamento</b>';
      return r;
    }
    $('#pz-peso', m).addEventListener('input', calc);
    $('#pz-car', m).addEventListener('change', calc);
    $('#pz-peso', m).addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('[data-x="save"]', m).click(); } });
    m.addEventListener('click', async function (e) {
      var b = e.target.closest('[data-x]'); if (!b) return;
      if (b.dataset.x === 'close') return closeModal();
      var r = calc(); if (r === null) return toast('Digite o peso da balança', true);
      try {
        var up = q(await sb.from('filamentos').update({ restante_g: r, carretel_id: $('#pz-car', m).value }).eq('id', id).select().single());
        S.filamentos = S.filamentos.map(function (x) { return x.id === id ? up : x; });
        closeModal(); toast('Restante: ' + fmt(r, 0) + ' g ✓'); render();
      } catch (err) { toast(erroMsg(err), true); }
    });
  }
  function secaoCarreteis() {
    var usos = function (id) { return S.filamentos.filter(function (f) { return f.carretel_id === id; }).length; };
    if (S.faltaScript04) return '<div class="card note">Para cadastrar carretéis vazios, rode o <b>script 04</b> no SQL Editor do Supabase e atualize a página.</div>';
    return '<div class="card"><div class="row between wrap"><div><h2 style="margin:0">Carretéis vazios (tara)</h2><div class="small muted" style="margin-top:4px">O peso de cada carretel vazio, para o botão ⚖ Pesar descontar certinho.</div></div>' +
      '<button class="btn btn-g" data-carr="novo">+ Novo carretel</button></div>' +
      (S.carreteis.length ? '<div class="tbl-wrap" style="margin-top:10px"><table class="tbl"><thead><tr><th></th><th>Carretel</th><th class="hide-m">Marca</th><th class="num">Peso vazio</th><th class="num hide-m">Rolos usando</th><th></th></tr></thead><tbody>' +
        S.carreteis.slice().sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome), 'pt-BR'); }).map(function (c) {
          return '<tr><td style="width:58px">' + thumbHtml(c.foto) + '</td><td style="font-weight:700">' + esc(c.nome) + '<div class="show-m small muted">' + esc(c.marca || '') + '</div></td><td class="hide-m">' + esc(c.marca || '—') + '</td>' +
            '<td class="num">' + fmt(num(c.peso_g), 0) + ' g</td><td class="num hide-m">' + usos(c.id) + '</td>' +
            '<td><button class="icon-btn" data-carr="' + c.id + '" aria-label="Editar carretel" title="Editar">' + ICON.edit + '</button></td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty" style="padding:18px">Nenhum carretel ainda. Pese um carretel vazio de cada marca e cadastre aqui.</div>') + '</div>';
  }
  var F_CAR = [
    { k: 'nome', label: 'Nome', span: 2, ph: 'ex.: Carretel papelão Masterprint' },
    { k: 'marca', label: 'Marca', list: ['Masterprint', 'Marba', 'Creality', 'Digital Qualy', 'Bambu Lab', 'Anycubic'] },
    { k: 'peso_g', label: 'Peso vazio (g)', type: 'num' }
  ];
  function editarCarretel(id) {
    var c = id ? byId(S.carreteis, id) : {};
    var novoId = id || uid();
    var foto = { foto: c.foto || null };
    var m = modal('<div class="row between"><h2>' + (id ? 'Editar carretel' : 'Novo carretel vazio') + '</h2><button class="btn btn-g btn-s" data-x="close">Fechar</button></div>' +
      '<div class="grid g4">' + fotoUnicaHtml() + F_CAR.map(function (x) { return fieldHtml(x, c[x.k]); }).join('') + '</div>' +
      '<div class="row">' + (id ? '<button class="btn btn-d" data-x="del">Excluir</button>' : '') + '<div class="grow"></div><button class="btn btn-g" data-x="close">Cancelar</button><button class="btn btn-p" data-x="save">Salvar</button></div>');
    ligarFotoUnica(m, foto, 'carreteis/' + novoId);
    m.addEventListener('click', async function (e) {
      var b = e.target.closest('[data-x]'); if (!b) return;
      var a = b.dataset.x;
      if (a === 'close') return closeModal();
      try {
        if (a === 'save') {
          var o = readFields(F_CAR, m);
          if (!o.nome) return toast('Dê um nome ao carretel', true);
          if (!(o.peso_g > 0)) return toast('Informe o peso do carretel vazio', true);
          o.id = novoId;
          if (foto.mudou || foto.foto) o.foto = foto.foto;
          var r = q(await sb.from('carreteis').upsert(o).select().single());
          S.carreteis = S.carreteis.filter(function (x) { return x.id !== r.id; }).concat([r]);
          toast('Carretel salvo ✓');
        } else if (a === 'del') {
          closeModal();
          if (!(await confirmar('Excluir carretel?', 'Os rolos que usam este carretel continuam, só perdem a tara.', 'Excluir', true))) return;
          q(await sb.from('carreteis').delete().eq('id', id));
          S.carreteis = S.carreteis.filter(function (x) { return x.id !== id; });
          S.filamentos.forEach(function (f) { if (f.carretel_id === id) f.carretel_id = null; });
          toast('Carretel excluído');
        }
        closeModal(); render();
      } catch (err) { toast(erroMsg(err), true); }
    });
  }
  function editarFilamento(id) {
    var f = id ? byId(S.filamentos, id) : { tipo: 'PLA', cor: '', cor_hex: '#cccccc', peso_inicial_g: 1000, restante_g: 1000 };
    var novoId = id || uid();
    var foto = { foto: f.foto || null };
    var carOpts = [{ v: '', t: '— nenhum —' }].concat(S.carreteis.map(function (c) { return { v: c.id, t: c.nome + ' (' + fmt(num(c.peso_g), 0) + ' g)' }; }));
    var fCar = { k: 'carretel_id', label: 'Carretel (para pesar)', type: 'select', opts: carOpts, span: 2 };
    var kgAtual = (num(f.peso_inicial_g) || 1000) / 1000;
    var pesoHtml = '<div class="field" style="grid-column:span 2"><label for="peso-kg">Peso do rolo (filamento)</label><div class="row wrap" style="gap:6px">' +
      [1, 1.2, 2, 3].map(function (kg) { return '<button type="button" class="chip' + (Math.abs(kg - kgAtual) < 0.001 ? ' on' : '') + '" data-kg="' + kg + '">' + fmt(kg) + ' kg</button>'; }).join('') +
      '<input class="inp" id="peso-kg" inputmode="decimal" value="' + esc(fmtIn(kgAtual)) + '" style="width:80px;min-height:40px" aria-label="Peso em kg"><span class="muted">kg</span></div></div>';
    var fRest = { k: 'restante_g', label: 'Restante (g)', type: 'num', hint: 'Ou use o botão ⚖ Pesar no cartão' };
    var m = modal('<div class="row between"><h2>' + (id ? 'Editar rolo' : 'Novo rolo') + '</h2><button class="btn btn-g btn-s" data-x="close">Fechar</button></div>' +
      '<div class="grid g4">' + fotoUnicaHtml() + F_FIL.slice(0, 4).map(function (x) { return fieldHtml(x, f[x.k]); }).join('') + pesoHtml +
      (id ? fieldHtml(fRest, f.restante_g) : '') + F_FIL.slice(4).map(function (x) { return fieldHtml(x, f[x.k]); }).join('') + fieldHtml(fCar, f.carretel_id || '') + '</div>' +
      (id ? '' : '<div class="hint">Rolo novo: o restante começa igual ao peso.</div>') +
      '<div class="row wrap">' + (id ? '<button class="btn btn-g" data-x="arq">' + (f.arquivado ? 'Voltar para em uso' : 'Rolo acabou — arquivar') + '</button><button class="btn btn-d" data-x="del">Excluir</button>' : '') +
      '<div class="grow"></div><button class="btn btn-g" data-x="close">Cancelar</button><button class="btn btn-p" data-x="save">Salvar</button></div>');
    ligarFotoUnica(m, foto, 'filamentos/' + novoId);
    var pkg = $('#peso-kg', m);
    function marcaChip() { var v = num(pkg.value); $$('.chip', m).forEach(function (c) { c.classList.toggle('on', v !== null && Math.abs(+c.dataset.kg - v) < 0.001); }); }
    pkg.addEventListener('input', marcaChip);
    m.addEventListener('click', async function (e) {
      var chip = e.target.closest('[data-kg]');
      if (chip) { pkg.value = fmtIn(chip.dataset.kg); marcaChip(); return; }
      var b = e.target.closest('[data-x]'); if (!b) return;
      var a = b.dataset.x;
      if (a === 'close') return closeModal();
      try {
        if (a === 'save') {
          var o = readFields(F_FIL.concat([fCar], id ? [fRest] : []), m);
          if (!o.tipo || !o.cor) return toast('Informe tipo e cor', true);
          var kg = num(pkg.value);
          if (kg > 50) kg = kg / 1000; // digitou em gramas (ex.: 1000)
          if (!(kg > 0)) return toast('Informe o peso do rolo em kg', true);
          o.peso_inicial_g = Math.round(kg * 1000);
          if (!id || o.restante_g === null) o.restante_g = o.peso_inicial_g;
          o.carretel_id = o.carretel_id || null;
          o.id = novoId;
          if (foto.mudou || foto.foto) o.foto = foto.foto;
          var r = q(await sb.from('filamentos').upsert(o).select().single());
          S.filamentos = S.filamentos.filter(function (x) { return x.id !== r.id; }).concat([r]);
          toast('Rolo salvo ✓');
        } else if (a === 'arq') {
          var r2 = q(await sb.from('filamentos').update({ arquivado: !f.arquivado }).eq('id', id).select().single());
          S.filamentos = S.filamentos.map(function (x) { return x.id === id ? r2 : x; });
          toast(r2.arquivado ? 'Rolo arquivado' : 'Rolo de volta ao uso');
        } else if (a === 'del') {
          closeModal();
          if (!(await confirmar('Excluir rolo?', 'Prefira “arquivar” quando o rolo acabar — assim o histórico de preço fica guardado.', 'Excluir mesmo', true))) return;
          q(await sb.from('filamentos').delete().eq('id', id));
          S.filamentos = S.filamentos.filter(function (x) { return x.id !== id; });
          toast('Rolo excluído');
        }
        closeModal(); render();
      } catch (err) { toast(erroMsg(err), true); }
    });
  }

  // ------------------------------------------------------------------ INSUMOS
  var F_INS = [
    { k: 'nome', label: 'Nome', span: 4 },
    { k: 'preco_pacote', label: 'Preço do pacote (R$)', type: 'num', ph: 'ex.: 42,99' },
    { k: 'qtd_pacote', label: 'Unidades', type: 'num', ph: 'ex.: 100', hint: 'Quantas vêm no pacote' },
    { k: 'custo_unitario', label: 'Custo por unidade (R$)', type: 'num', hint: 'Calculado sozinho, arredondado para cima' },
    { k: 'estoque', label: 'Em estoque', type: 'num', hint: 'Quantas você tem agora' },
    { k: 'link_compra', label: 'Link de compra', span: 4, ph: 'cole o link aqui' },
    { k: 'observacoes', label: 'Observações', type: 'textarea', rows: 2, span: 4 }
  ];
  function telaInsumos(v) {
    setHeader('Insumos e extras', '<button class="btn btn-p" id="novo-ins">+ <span class="long">Novo insumo</span></button>');
    var usoDe = function (id) {
      return S.prodInsumos.filter(function (x) { return x.insumo_id === id; }).map(function (x) { var p = byId(S.produtos, x.produto_id); return p ? p.nome : null; }).filter(Boolean);
    };
    var buscaI = S.ui.busca.ins || '';
    var lista = ordenarTabela('ins', S.insumos.filter(function (i) { return combina([i.nome, i.link_compra, i.observacoes].concat(usoDe(i.id)), buscaI); }), {
      nome: function (i) { return i.nome; }, custo: function (i) { return num(i.custo_unitario); },
      pacote: function (i) { return num(i.qtd_pacote); },
      estoque: function (i) { return num(i.estoque); }, uso: function (i) { return usoDe(i.id).length; }
    });
    var th = function (k, t, cls) { return thOrd('ins', k, t, cls); };
    v.innerHTML = '<div class="stack">' + buscaHtml('ins', 'Pesquisar: argola, embalagem, Mercado Livre…') + '<div class="card" style="padding:6px 8px">' + (lista.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th></th>' + th('nome', 'Item') + th('custo', 'Custo unit.', 'num hide-m') + th('pacote', 'Comprei (un)', 'num hide-m') + th('uso', 'Usado em', 'hide-m') + '<th class="hide-m">Onde comprar</th>' + th('estoque', 'Em estoque', 'num hide-m') + '<th></th></tr></thead><tbody>' +
      lista.map(function (i) {
        var uso = usoDe(i.id);
        var pac = num(i.qtd_pacote);
        var estoqueHtml = '<span class="est-slot"><button type="button" class="rest-btn" data-est="' + i.id + '" title="Clique para corrigir o estoque">' + fmt(num(i.estoque)) + ' ' + esc(un(i)) + ' ' + ICON.edit + '</button></span>' +
          '<div style="margin-top:4px"><button type="button" class="btn btn-g btn-s" data-sairam="' + i.id + '" title="Dar baixa: quantos saíram">− Saíram</button></div>';
        var comprar = '<div class="row wrap" style="gap:6px">' + (isUrl(i.link_compra) ? '<a href="' + esc(i.link_compra) + '" target="_blank" rel="noopener" style="font-weight:700;text-decoration:none">Comprar de novo ↗</a>' : '<button class="btn btn-g btn-s" data-edit="' + i.id + '">+ Colar link</button>') +
          '<button type="button" class="btn btn-g btn-s" data-preco-ins="' + i.id + '" title="Pesquisar preço nas lojas">🔎 Preço</button></div>';
        return '<tr><td style="width:58px">' + thumbHtml(i.foto) + '</td>' +
          '<td><div style="font-weight:700">' + esc(i.nome) + '</div>' + (pac && num(i.preco_pacote) ? '<div class="small muted">pacote de ' + fmt(pac) + ' por ' + brl(num(i.preco_pacote)) + '</div>' : '') +
          '<div class="show-m small" style="margin-top:6px">Custo: <b>' + brl(centavoAcima(num(i.custo_unitario))) + '</b> cada' + (pac ? ' · comprei ' + fmt(pac) : '') + '<div style="margin-top:6px">Estoque: ' + estoqueHtml + '</div><div style="margin-top:6px">' + comprar + '</div></div></td>' +
          '<td class="num hide-m">' + brl(centavoAcima(num(i.custo_unitario))) + '</td>' +
          '<td class="num hide-m">' + (pac ? fmt(pac) : '—') + '</td>' +
          '<td class="hide-m small muted">' + (uso.length ? esc(uso.slice(0, 3).join(', ') + (uso.length > 3 ? ' +' + (uso.length - 3) : '')) : '—') + '</td>' +
          '<td class="hide-m">' + comprar + '</td>' +
          '<td class="num hide-m">' + estoqueHtml + '</td>' +
          '<td><button class="icon-btn" data-edit="' + i.id + '" aria-label="Editar insumo" title="Editar">' + ICON.edit + '</button></td></tr>';
      }).join('') + '</tbody></table></div>' : (buscaI ? nadaAchado('ins') : '<div class="empty">Nenhum insumo ainda. Ex.: argola de chaveiro, embalagem, card “Obrigado”, manual.</div>')) + '</div></div>';
    $('#novo-ins').addEventListener('click', function () { editarInsumo(null); });
    ligarBusca('ins');
    v.onclick = function (e) {
      var t;
      if ((t = e.target.closest('th[data-ord]'))) return clicarOrdem(t);
      if ((t = e.target.closest('[data-est-ok]'))) return;
      if ((t = e.target.closest('[data-preco-ins]'))) { var ir = byId(S.insumos, t.dataset.precoIns); return pesquisarPreco(termoInsumo(ir), ir.nome); }
      if ((t = e.target.closest('[data-est]'))) return campoEstoque(t, 'est');
      if ((t = e.target.closest('[data-sairam]'))) return campoEstoque(t, 'sairam');
      if ((t = e.target.closest('[data-edit]'))) return editarInsumo(t.dataset.edit);
    };
    v.onkeydown = function (e) {
      var inp = e.target.closest('[data-est-in]'); if (!inp) return;
      if (e.key === 'Enter') { e.preventDefault(); salvarEstoqueIns(inp.dataset.estIn, inp.dataset.modo, inp.value); }
      if (e.key === 'Escape') { e.stopPropagation(); render(); }
    };
  }
  // estoque do insumo direto na lista: corrigir o total ou dar baixa ("saíram")
  function campoEstoque(btn, modo) {
    var id = btn.dataset.est || btn.dataset.sairam;
    var cel = btn.closest('td');
    var it = byId(S.insumos, id);
    var sairam = modo === 'sairam';
    $$('.est-edit').forEach(function (x) { x.remove(); });
    var box = document.createElement('div');
    box.className = 'est-edit';
    box.innerHTML = '<div class="small" style="font-weight:700;margin-bottom:4px">' + (sairam ? 'Quantos saíram?' : 'Estoque agora') + '</div>' +
      '<div class="row" style="gap:6px"><input class="inp" data-est-in="' + id + '" data-modo="' + modo + '" inputmode="decimal" value="' + (sairam ? '' : esc(String(num(it.estoque) || 0))) + '" placeholder="' + (sairam ? 'ex.: 50' : '') + '" style="width:84px;min-height:36px;padding:6px 10px;text-align:right" aria-label="' + (sairam ? 'Quantos saíram' : 'Estoque') + '">' +
      '<button type="button" class="btn btn-p btn-s" data-est-ok>OK</button></div>' +
      (sairam ? '<div class="hint" style="margin-top:4px">Tem ' + fmt(num(it.estoque) || 0) + ' agora</div>' : '');
    cel.appendChild(box);
    var inp = $('input', box); inp.focus(); inp.select();
    $('[data-est-ok]', box).addEventListener('click', function (e) { e.stopPropagation(); salvarEstoqueIns(id, modo, inp.value); });
  }
  async function salvarEstoqueIns(id, modo, valor) {
    var n = num(valor);
    if (n === null || n < 0) return toast(modo === 'sairam' ? 'Digite quantos saíram' : 'Digite o estoque', true);
    var it = byId(S.insumos, id), atual = num(it.estoque) || 0;
    var novo = modo === 'sairam' ? Math.max(0, atual - n) : n;
    try {
      var r = q(await sb.from('insumos').update({ estoque: novo }).eq('id', id).select().single());
      S.insumos = S.insumos.map(function (x) { return x.id === id ? r : x; });
      toast(modo === 'sairam' ? '−' + fmt(n) + ' · ' + it.nome + ': restam ' + fmt(novo) + ' ✓' : 'Estoque de ' + it.nome + ': ' + fmt(novo) + ' ✓');
      render();
    } catch (err) { toast(erroMsg(err), true); }
  }
  function editarInsumo(id) {
    var it = id ? byId(S.insumos, id) : { unidade: 'un', estoque: 0 };
    var novoId = id || uid();
    var foto = { foto: it.foto || null };
    var m = modal('<div class="row between"><h2>' + (id ? 'Editar insumo' : 'Novo insumo') + '</h2><button class="btn btn-g btn-s" data-x="close">Fechar</button></div>' +
      '<div class="grid g4">' + fotoUnicaHtml() + F_INS.map(function (x) { return fieldHtml(x, it[x.k]); }).join('') + '</div>' +
      '<div class="hint" id="ins-calc"></div>' +
      '<div class="row">' + (id ? '<button class="btn btn-d" data-x="del">Excluir</button>' : '') + '<div class="grow"></div><button class="btn btn-g" data-x="close">Cancelar</button><button class="btn btn-p" data-x="save">Salvar</button></div>');
    ligarFotoUnica(m, foto, 'insumos/' + novoId);
    var elPac = $('[data-k="preco_pacote"]', m), elQtd = $('[data-k="qtd_pacote"]', m), elUni = $('[data-k="custo_unitario"]', m), elEst = $('[data-k="estoque"]', m);
    var calc = $('#ins-calc', m);
    function doPacote() {
      var pr = num(elPac.value), qt = num(elQtd.value);
      if (pr > 0 && qt > 0) {
        var u = centavoAcima(pr / qt);
        elUni.value = fmtIn(u.toFixed(2));
        calc.textContent = 'Calculado pelo pacote: ' + brl(pr) + ' ÷ ' + fmt(qt) + ' unidades = ' + brl(u) + ' cada (arredondado para cima).';
      } else calc.textContent = 'Preencha o preço do pacote e as unidades — ou digite direto o custo por unidade.';
    }
    elPac.addEventListener('input', doPacote);
    elQtd.addEventListener('input', doPacote);
    elUni.addEventListener('input', function () {
      if (elPac.value || elQtd.value) { elPac.value = ''; elQtd.value = ''; }
      calc.textContent = 'Usando o custo por unidade digitado.';
    });
    doPacote();
    if (!elPac.value && elUni.value) calc.textContent = 'Usando o custo por unidade digitado.';
    m.addEventListener('click', async function (e) {
      var b = e.target.closest('[data-x]'); if (!b) return;
      var a = b.dataset.x;
      if (a === 'close') return closeModal();
      try {
        if (a === 'save') {
          var o = readFields(F_INS, m);
          if (!o.nome) return toast('Informe o nome', true);
          o.custo_unitario = centavoAcima(o.custo_unitario || 0);
          if (o.estoque === null) o.estoque = 0;
          o.unidade = 'un';
          o.id = novoId;
          if (foto.mudou || foto.foto) o.foto = foto.foto;
          var r = q(await sb.from('insumos').upsert(o).select().single());
          S.insumos = S.insumos.filter(function (x) { return x.id !== r.id; }).concat([r]).sort(function (x, y) { return x.nome.localeCompare(y.nome); });
          toast('Insumo salvo ✓');
        } else if (a === 'del') {
          closeModal();
          if (!(await confirmar('Excluir insumo?', 'Ele também sai da ficha dos produtos que o usam.', 'Excluir', true))) return;
          q(await sb.from('insumos').delete().eq('id', id));
          S.insumos = S.insumos.filter(function (x) { return x.id !== id; });
          S.prodInsumos = S.prodInsumos.filter(function (x) { return x.insumo_id !== id; });
          toast('Insumo excluído');
        }
        closeModal(); render();
      } catch (err) { toast(erroMsg(err), true); }
    });
  }

  // ------------------------------------------------------------------ EQUIPAMENTOS
  var TIPOS_EQ = [
    { v: 'impressora', t: 'Impressora 3D' },
    { v: 'impressora_papel', t: 'Impressora de papel' },
    { v: 'acabamento', t: 'Acabamento' },
    { v: 'medicao', t: 'Medição' },
    { v: 'secagem', t: 'Secagem e armazenamento' },
    { v: 'fotografia', t: 'Fotografia e exposição' },
    { v: 'informatica', t: 'Informática' },
    { v: 'ferramenta', t: 'Ferramenta (geral)' },
    { v: 'outro', t: 'Outro (escrever qual)' }
  ];
  function tipoEqTxt(e) {
    if (e.tipo === 'outro') return e.tipo_outro || 'Outro';
    var t = TIPOS_EQ.filter(function (x) { return x.v === e.tipo; })[0];
    return t ? t.t.replace(' (escrever qual)', '') : (e.tipo || '—');
  }
  function horasRegistradas(e, iv) {
    var min = 0;
    S.impressoes.concat(S.perdas).forEach(function (x) { if (x.impressora_id === e.id && (!iv || noPeriodo(x.data, iv))) min += num(x.tempo_min) || 0; });
    return min / 60;
  }
  function horasTotais(e) { return (num(e.horas_iniciais) || 0) + horasRegistradas(e); }
  var F_EQ = [
    { k: 'nome', label: 'Nome', span: 2, ph: 'ex.: Kobra 4 · #1' },
    { k: 'tipo', label: 'Tipo', type: 'select', opts: TIPOS_EQ },
    { k: 'status', label: 'Status', type: 'select', opts: [{ v: 'ativo', t: 'Em uso' }, { v: 'chegando', t: 'Chegando' }, { v: 'manutencao', t: 'Em manutenção' }, { v: 'desativado', t: 'Desativado' }] },
    { k: 'marca', label: 'Marca', list: ['Anycubic', 'Bambu Lab', 'Creality', 'Elegoo', 'Epson'] },
    { k: 'modelo', label: 'Modelo' },
    { k: 'valor_pago', label: 'Valor pago (R$)', type: 'num' },
    { k: 'data_compra', label: 'Data da compra', type: 'date' },
    { k: 'potencia_w', label: 'Consumo médio (W)', type: 'int', hint: 'Impressora 3D imprimindo PLA. Na dúvida: 120' },
    { k: 'horas_iniciais', label: 'Horas antes do sistema', type: 'num', hint: 'As impressões registradas somam sozinhas' },
    { k: 'link_compra', label: 'Link (peças / compra)', span: 2 },
    { k: 'observacoes', label: 'Observações', type: 'textarea', rows: 2, span: 4 }
  ];
  function telaEquipamentos(v) {
    setHeader('Equipamentos', '<button class="btn btn-p" id="novo-eq">+ <span class="long">Novo equipamento</span></button>');
    var st = { ativo: ['p-ok', 'Em uso'], chegando: ['p-info', 'Chegando'], manutencao: ['p-warn', 'Manutenção'], desativado: ['p-mut', 'Desativado'] };
    var total = S.equipamentos.reduce(function (a, e) { return a + (num(e.valor_pago) || 0); }, 0);
    var buscaE = S.ui.busca.equip || '';
    var lista = ordenarTabela('equip', S.equipamentos.filter(function (e) {
      return combina([e.nome, e.marca, e.modelo, tipoEqTxt(e), e.link_compra, e.observacoes, (st[e.status] || st.ativo)[1]], buscaE);
    }), {
      nome: function (e) { return e.nome; }, tipo: tipoEqTxt, valor: function (e) { return num(e.valor_pago); },
      compra: function (e) { return e.data_compra; }, consumo: function (e) { return num(e.potencia_w); },
      horas: function (e) { return e.tipo === 'impressora' ? horasTotais(e) : null; }, status: function (e) { return (st[e.status] || st.ativo)[1]; }
    });
    var th = function (k, t, cls) { return thOrd('equip', k, t, cls); };
    v.innerHTML = '<div class="stack"><div class="grid g4">' + kpi('Equipamentos', S.equipamentos.length, impressoras().length + ' impressora(s) 3D') + kpi('Investido', brl(total), 'soma dos valores pagos') + '</div>' +
      buscaHtml('equip', 'Pesquisar: Kobra X, Anycubic, acabamento…') +
      '<div class="card" style="padding:6px 8px">' + (lista.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th></th>' + th('nome', 'Equipamento') + th('tipo', 'Tipo', 'hide-m') + th('valor', 'Valor pago', 'num hide-m') + th('compra', 'Compra', 'hide-m') + th('consumo', 'Consumo', 'num hide-m') + th('horas', 'Horas totais', 'num hide-m') + th('status', 'Status', 'hide-m') + '<th></th></tr></thead><tbody>' +
        lista.map(function (e) {
          var s = st[e.status] || st.ativo;
          var horas = e.tipo === 'impressora'
            ? '<span class="horas-slot"><button type="button" class="rest-btn" data-horas="' + e.id + '" title="Clique para corrigir as horas">' + fmt(horasTotais(e), 0) + ' h ' + ICON.edit + '</button></span>'
            : '—';
          return '<tr data-eq="' + e.id + '"><td style="width:58px">' + thumbHtml(e.foto) + '</td>' +
            '<td><div style="font-weight:700">' + esc(e.nome) + '</div><div class="small muted">' + esc([e.marca, e.modelo].filter(Boolean).join(' ')) + '</div><div class="show-m small muted" style="margin-top:3px">' + esc(tipoEqTxt(e)) + ' · <span class="pill ' + s[0] + '">' + s[1] + '</span></div>' +
            '<div class="show-m small" style="margin-top:4px">' + brl(num(e.valor_pago)) + (e.tipo === 'impressora' ? ' · ' + horas : '') + '</div></td>' +
            '<td class="hide-m">' + esc(tipoEqTxt(e)) + '</td>' +
            '<td class="num hide-m">' + brl(num(e.valor_pago)) + '</td><td class="hide-m">' + dataBR(e.data_compra) + '</td>' +
            '<td class="num hide-m">' + (e.potencia_w ? e.potencia_w + ' W' : '—') + '</td>' +
            '<td class="num hide-m">' + horas + '</td>' +
            '<td class="hide-m"><span class="pill ' + s[0] + '">' + s[1] + '</span></td>' +
            '<td><button class="icon-btn" data-edit="' + e.id + '" aria-label="Editar equipamento" title="Editar">' + ICON.edit + '</button></td></tr>';
        }).join('') + '</tbody></table></div>' : (buscaE ? nadaAchado('equip') : '<div class="empty">Nenhum equipamento ainda. Comece pelas impressoras: Kobra X, Kobra 4 (×2) e A1 Mini.</div>')) + '</div>' +
      '<div class="note">As horas totais somam as horas que você informou com as impressões e perdas registradas. As horas por período ficam em <a href="#/relatorios">Relatórios</a>.</div></div>';
    $('#novo-eq').addEventListener('click', function () { editarEquip(null); });
    ligarBusca('equip');
    v.onclick = function (e) {
      var t;
      if ((t = e.target.closest('th[data-ord]'))) return clicarOrdem(t);
      if ((t = e.target.closest('[data-horas]'))) return editarHorasNaHora(t.dataset.horas);
      if ((t = e.target.closest('[data-edit]'))) return editarEquip(t.dataset.edit);
    };
    v.onkeydown = function (e) {
      var inp = e.target.closest('[data-horas-in]'); if (!inp) return;
      if (e.key === 'Enter') { e.preventDefault(); salvarHoras(inp.dataset.horasIn, inp.value); }
      if (e.key === 'Escape') { e.stopPropagation(); render(); }
    };
  }
  function editarHorasNaHora(id) {
    var tr = $('tr[data-eq="' + id + '"]'); if (!tr) return;
    var eq = byId(S.equipamentos, id);
    var slot = $$('.horas-slot', tr).filter(function (el) { return el.offsetParent !== null; })[0]; if (!slot) return;
    slot.innerHTML = '<span class="row" style="gap:6px;justify-content:flex-end"><input class="inp" data-horas-in="' + id + '" inputmode="decimal" value="' + esc(String(horasTotais(eq))) + '" style="width:80px;min-height:36px;padding:6px 10px;text-align:right" aria-label="Horas totais"> h <button type="button" class="btn btn-p btn-s" data-horas-ok="' + id + '">OK</button></span>';
    var inp = $('[data-horas-in]', slot); inp.focus(); inp.select();
    $('[data-horas-ok]', slot).addEventListener('click', function (e) { e.stopPropagation(); salvarHoras(id, inp.value); });
  }
  async function salvarHoras(id, valor) {
    var h = num(valor);
    if (h === null || h < 0) return toast('Digite as horas', true);
    try {
      var eq0 = byId(S.equipamentos, id);
      var r = q(await sb.from('equipamentos').update({ horas_iniciais: Math.max(0, h - horasRegistradas(eq0)) }).eq('id', id).select().single());
      S.equipamentos = S.equipamentos.map(function (x) { return x.id === id ? r : x; });
      toast('Horas atualizadas: ' + fmt(h, 0) + ' h ✓');
      render();
    } catch (err) { toast(erroMsg(err), true); }
  }
  function editarEquip(id) {
    var it = id ? byId(S.equipamentos, id) : { tipo: 'impressora', status: 'ativo', horas_iniciais: 0 };
    var novoId = id || uid();
    var foto = { foto: it.foto || null };
    var outros = [];
    S.equipamentos.forEach(function (e) { if (e.tipo_outro && outros.indexOf(e.tipo_outro) < 0) outros.push(e.tipo_outro); });
    var fOutro = { k: 'tipo_outro', label: 'Qual tipo?', ph: 'ex.: Mobiliário, Limpeza…', list: outros, span: 2 };
    var m = modal('<div class="row between"><h2>' + (id ? 'Editar equipamento' : 'Novo equipamento') + '</h2><button class="btn btn-g btn-s" data-x="close">Fechar</button></div>' +
      '<div class="grid g4">' + fotoUnicaHtml() + F_EQ.slice(0, 3).map(function (x) { return fieldHtml(x, it[x.k]); }).join('') +
      '<div id="box-outro" style="grid-column:1 / -1"><div class="grid g2">' + fieldHtml(fOutro, it.tipo_outro) + '</div><div class="hint" style="margin-top:4px">O que você escrever aqui vira opção nas próximas vezes.</div></div>' +
      F_EQ.slice(3).map(function (x) { return fieldHtml(x, it[x.k]); }).join('') + '</div>' +
      '<div class="row">' + (id ? '<button class="btn btn-d" data-x="del">Excluir</button>' : '') + '<div class="grow"></div><button class="btn btn-g" data-x="close">Cancelar</button><button class="btn btn-p" data-x="save">Salvar</button></div>');
    ligarFotoUnica(m, foto, 'equipamentos/' + novoId);
    var selTipo = $('[data-k="tipo"]', m);
    function doTipo() {
      var t = selTipo.value;
      $('#box-outro', m).classList.toggle('hidden', t !== 'outro');
      var imp = t === 'impressora';
      ['potencia_w', 'horas_iniciais'].forEach(function (k) { var el = $('[data-k="' + k + '"]', m); if (el) el.closest('.field').classList.toggle('hidden', !imp); });
    }
    selTipo.addEventListener('change', doTipo); doTipo();
    m.addEventListener('click', async function (e) {
      var b = e.target.closest('[data-x]'); if (!b) return;
      var a = b.dataset.x;
      if (a === 'close') return closeModal();
      try {
        if (a === 'save') {
          var o = readFields(F_EQ.concat([fOutro]), m);
          if (!o.nome) return toast('Informe o nome', true);
          if (o.tipo === 'outro' && !o.tipo_outro) return toast('Escreva qual é o tipo', true);
          if (o.tipo !== 'outro') o.tipo_outro = null;
          if (o.horas_iniciais === null) o.horas_iniciais = 0;
          o.id = novoId;
          if (foto.mudou || foto.foto) o.foto = foto.foto;
          var r = q(await sb.from('equipamentos').upsert(o).select().single());
          S.equipamentos = S.equipamentos.filter(function (x) { return x.id !== r.id; }).concat([r]);
          toast('Equipamento salvo ✓');
        } else if (a === 'del') {
          closeModal();
          if (!(await confirmar('Excluir equipamento?', 'Se ele só parou de ser usado, prefira mudar o status para “Desativado”.', 'Excluir', true))) return;
          q(await sb.from('equipamentos').delete().eq('id', id));
          S.equipamentos = S.equipamentos.filter(function (x) { return x.id !== id; });
          toast('Equipamento excluído');
        }
        closeModal(); render();
      } catch (err) { toast(erroMsg(err), true); }
    });
  }

  // ------------------------------------------------------------------ CONFIGURAÇÕES
  var F_CFG = [
    { k: 'kwh', label: 'Energia (R$ por kWh, com impostos)', type: 'num', hint: 'Conta de luz ÷ kWh consumidos' },
    { k: 'margem_pct', label: 'Margem padrão (%)', type: 'num', hint: '200% = preço 3× o custo' },
    { k: 'hora_maquina', label: 'Hora-máquina (R$/h)', type: 'num', hint: 'Desgaste e peças da impressora' },
    { k: 'taxa_cartao_pct', label: 'Taxa da maquininha (%)', type: 'num' },
    { k: 'whatsapp', label: 'WhatsApp dos anúncios' },
    { k: 'local_retirada', label: 'Local de retirada' },
    { k: 'formas_entrega', label: 'Formas de entrega', span: 2 }
  ];
  function telaConfig(v) {
    setHeader('Configurações');
    var c = S.cfg || {};
    v.innerHTML =
      '<div class="stack">' +
      '<div class="card"><h2>Custos e anúncios</h2><form id="cfg-f" class="stack"><div class="grid g4">' + F_CFG.map(function (f) { return fieldHtml(f, c[f.k]); }).join('') + '</div>' +
      '<div class="grid g2"><div class="field"><label for="faixas">Faixas de acabamento</label><input class="inp" id="faixas" value="' + esc((c.faixas_acabamento || []).join(' | ')) + '"><div class="hint">Separe com |</div></div>' +
      '<div class="field"><label for="cats">Categorias</label><input class="inp" id="cats" value="' + esc(categorias().join(' | ')) + '"><div class="hint">Separe com |</div></div></div>' +
      '<div class="row" style="justify-content:flex-end"><button class="btn btn-p" type="submit">Salvar configurações</button></div></form></div>' +

      cartaoIAConfig() +
      '<div class="card"><h2>Taxas por plataforma</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Plataforma</th><th class="num">Taxa %</th><th class="num">Taxa fixa (R$)</th><th>Pode ter contato?</th><th>Ativa</th></tr></thead><tbody>' +
      S.plataformas.map(function (pl) {
        return '<tr data-pl="' + pl.id + '"><td style="font-weight:700">' + esc(pl.nome) + '</td>' +
          '<td class="num"><input class="inp" data-f="taxa_pct" inputmode="decimal" value="' + esc(fmtIn(pl.taxa_pct)) + '" style="width:90px;text-align:right" aria-label="Taxa % ' + esc(pl.nome) + '"></td>' +
          '<td class="num"><input class="inp" data-f="taxa_fixa" inputmode="decimal" value="' + esc(fmtIn(pl.taxa_fixa)) + '" style="width:100px;text-align:right" aria-label="Taxa fixa ' + esc(pl.nome) + '"></td>' +
          '<td>' + (pl.permite_contato ? 'Sim' : 'Não') + '</td>' +
          '<td><input type="checkbox" data-f="ativa"' + (pl.ativa ? ' checked' : '') + ' style="width:19px;height:19px;accent-color:var(--craft)" aria-label="Ativa"></td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="row between wrap" style="margin-top:10px"><div class="hint">Confira as taxas atuais na sua conta de vendedor de cada plataforma — elas mudam com frequência.</div><button class="btn btn-p" id="save-pl">Salvar taxas</button></div></div>' +

      '<div class="card"><h2>Quem tem acesso</h2><div class="stack" style="gap:8px">' + S.membros.map(function (m) {
        return '<div class="row"><span class="pill p-info">' + esc(m.nome) + '</span><span class="small">' + esc(m.email) + '</span>' + (S.membro && m.email.toLowerCase() === S.membro.email.toLowerCase() ? '<span class="small muted">(você)</span>' : '') + '</div>';
      }).join('') + '</div><div class="note" style="margin-top:12px">Para entrar, cada pessoa também precisa de um login criado no painel do Supabase (Authentication › Users › Add user).</div></div>' +

      '<div class="card"><h2>Importar catálogo do site</h2><div class="small muted" style="margin-bottom:12px">Traz os produtos do cristart3d.com.br (nomes, preços, textos, opções e fotos) para o sistema. Produtos já importados são pulados.</div>' +
      '<div class="row wrap"><button class="btn btn-p" id="imp-site">Importar do site</button><label class="btn btn-g" for="imp-file">Usar arquivo index.html</label><input type="file" id="imp-file" accept=".html,text/html" class="hidden"></div>' +
      '<div id="imp-log" class="small" style="margin-top:12px;white-space:pre-line"></div></div>' +
      '</div>';

    $('#cfg-f').addEventListener('submit', async function (e) {
      e.preventDefault();
      var o = readFields(F_CFG, e.target);
      ['kwh', 'margem_pct', 'hora_maquina', 'taxa_cartao_pct'].forEach(function (k) { if (o[k] === null) delete o[k]; });
      o.faixas_acabamento = $('#faixas').value.split('|').map(function (s) { return s.trim(); }).filter(Boolean);
      o.categorias = $('#cats').value.split('|').map(function (s) { return s.trim(); }).filter(Boolean);
      o.atualizado_em = new Date().toISOString();
      try { S.cfg = q(await sb.from('configuracoes').update(o).eq('id', 1).select().single()); toast('Configurações salvas ✓'); }
      catch (err) { toast(erroMsg(err), true); }
    });
    ligarIAConfig();
    $('#save-pl').addEventListener('click', async function () {
      var rows = $$('tr[data-pl]').map(function (tr) {
        return { id: tr.dataset.pl, taxa_pct: num($('[data-f="taxa_pct"]', tr).value) || 0, taxa_fixa: num($('[data-f="taxa_fixa"]', tr).value) || 0, ativa: $('[data-f="ativa"]', tr).checked };
      });
      try {
        for (var i = 0; i < rows.length; i++) q(await sb.from('plataformas').update({ taxa_pct: rows[i].taxa_pct, taxa_fixa: rows[i].taxa_fixa, ativa: rows[i].ativa }).eq('id', rows[i].id));
        S.plataformas = q(await sb.from('plataformas').select('*').order('ordem'));
        toast('Taxas salvas ✓');
      } catch (err) { toast(erroMsg(err), true); }
    });
    $('#imp-site').addEventListener('click', function () { importarCatalogo(null); });
    $('#imp-file').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0]; if (!f) return;
      var r = new FileReader(); r.onload = function () { importarCatalogo(String(r.result)); }; r.readAsText(f);
    });
  }

  // ------------------------------------------------------------------ IMPORTAÇÃO
  function extrairCatalogo(html) {
    var m = html.match(/<script id="site-data" type="application\/json">([\s\S]*?)<\/script>/);
    if (!m) throw new Error('Não encontrei os dados do catálogo nesse arquivo.');
    return JSON.parse(m[1]);
  }
  function dataUrlParaBlob(d) {
    var parts = d.split(','), mime = (parts[0].match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
    var bin = atob(parts[1]), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }
  async function importarCatalogo(html) {
    var log = $('#imp-log'), btn = $('#imp-site');
    function L(s) { log.textContent += s + '\n'; }
    log.textContent = ''; btn.disabled = true;
    try {
      if (!html) {
        L('Baixando o site…');
        var res = await fetch(CFG.siteUrl + '?t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) throw new Error('O site respondeu ' + res.status);
        html = await res.text();
      }
      var data = extrairCatalogo(html);
      var prods = (data.products || []).filter(function (p) { return !p.placeholder; });
      L('Encontrei ' + prods.length + ' produtos.');
      if (data.categories && data.categories.length) {
        var cats = categorias().slice();
        data.categories.forEach(function (c) { if (cats.indexOf(c) < 0) cats.push(c); });
        S.cfg = q(await sb.from('configuracoes').update({ categorias: cats, taxa_cartao_pct: (data.settings && data.settings.cardFeePercent) || (S.cfg && S.cfg.taxa_cartao_pct) || 12 }).eq('id', 1).select().single());
      }
      var feitos = 0, pulados = 0;
      for (var i = 0; i < prods.length; i++) {
        var sp = prods[i];
        if (S.produtos.some(function (p) { return p.codigo_site === sp.id; })) { pulados++; continue; }
        L('→ ' + sp.name);
        var id = uid(), fotos = [];
        var imgs = sp.images || [];
        for (var j = 0; j < imgs.length; j++) {
          try {
            var blob;
            if (/^data:/.test(imgs[j])) blob = dataUrlParaBlob(imgs[j]);
            else if (isUrl(imgs[j])) { fotos.push(imgs[j]); continue; }
            else continue;
            if (blob.size > 900 * 1024) blob = await comprimir(new File([blob], 'f.jpg', { type: blob.type }));
            fotos.push(await enviarFoto(blob, 'produtos/' + id));
          } catch (err) { L('   foto ' + (j + 1) + ' falhou: ' + erroMsg(err)); }
        }
        var revenda = /^(fone|mouse|headphone|headset|teclado|caixa de som)\b/i.test(String(sp.name).trim());
        var row = {
          id: id, codigo_site: sp.id, nome: sp.name, categoria: sp.category || null,
          descricao_breve: sp.desc || null, descricao: sp.details || null,
          preco: num(sp.price), preco_cartao: num(sp.cardPrice), preco_original: num(sp.originalPrice),
          opcoes: sp.options || [], videos: (sp.videos || []).filter(isUrl), fotos: fotos,
          tipo_produto: revenda ? 'revenda' : 'impresso', material: revenda ? null : 'PLA',
          ordem: i, ativo: true, mostrar_no_site: true, estoque: 0, usa_hora_maquina: true
        };
        var saved = q(await sb.from('produtos').insert(row).select().single());
        S.produtos.push(saved);
        var links = sp.links || {};
        var mapa = { shopee: 'shopee', mercadolivre: 'ml', ml: 'ml', olx: 'olx', facebook: 'facebook', tiktok: 'tiktok' };
        var adRows = Object.keys(links).filter(function (k) { return mapa[k] && isUrl(links[k]); }).map(function (k) { return { produto_id: id, plataforma_id: mapa[k], url: links[k], publicado: true }; });
        if (adRows.length) { var adsIns = q(await sb.from('produto_anuncios').insert(adRows).select()); S.anuncios = S.anuncios.concat(adsIns || adRows); }
        feitos++;
        L('   ok (' + fotos.length + ' foto' + (fotos.length === 1 ? '' : 's') + (revenda ? ', marcado como revenda' : '') + ')');
      }
      L('\nPronto! ' + feitos + ' importado(s), ' + pulados + ' já existia(m).');
      L('Próximo passo: abra cada produto e preencha gramas e tempo (do fatiador). Confira os marcados como revenda.');
      toast('Importação concluída ✓');
    } catch (err) {
      L('Erro: ' + erroMsg(err));
      if (/fetch|CORS|Failed/i.test(String(err && err.message))) L('Dica: salve a página do site (Ctrl+S) e use "Usar arquivo index.html".');
      toast('A importação parou: ' + erroMsg(err), true);
    }
    btn.disabled = false;
  }

  // ================================================================== ETAPA 2
  // ------------------------------------------------------------------ períodos
  function hojeISO(d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function diasAtras(n) { var d = new Date(); d.setDate(d.getDate() - n); return hojeISO(d); }
  var PERIODOS = [
    { v: 'hoje', t: 'Hoje' }, { v: 'semana', t: '7 dias' }, { v: 'quinzena', t: '15 dias' },
    { v: 'mes', t: 'Este mês' }, { v: 'mes_passado', t: 'Mês passado' }, { v: 'ano', t: 'Este ano' },
    { v: 'tudo', t: 'Tudo' }, { v: 'livre', t: 'Escolher datas' }
  ];
  function intervalo(chave) {
    var p = S.ui.per[chave] || { v: 'mes' }, d = new Date();
    switch (p.v) {
      case 'hoje': return { ini: hojeISO(), fim: hojeISO() };
      case 'semana': return { ini: diasAtras(6), fim: hojeISO() };
      case 'quinzena': return { ini: diasAtras(14), fim: hojeISO() };
      case 'mes': return { ini: hojeISO(new Date(d.getFullYear(), d.getMonth(), 1)), fim: hojeISO() };
      case 'mes_passado': return { ini: hojeISO(new Date(d.getFullYear(), d.getMonth() - 1, 1)), fim: hojeISO(new Date(d.getFullYear(), d.getMonth(), 0)) };
      case 'ano': return { ini: d.getFullYear() + '-01-01', fim: hojeISO() };
      case 'livre': return { ini: p.ini || diasAtras(29), fim: p.fim || hojeISO() };
      default: return { ini: '0000-01-01', fim: '9999-12-31' };
    }
  }
  function noPeriodo(data, iv) { var x = String(data || '').slice(0, 10); return x >= iv.ini && x <= iv.fim; }
  function periodoHtml(chave) {
    var p = S.ui.per[chave] || { v: 'mes' };
    var iv = intervalo(chave);
    return '<div class="row wrap" style="gap:6px">' + PERIODOS.map(function (o) {
      return '<button type="button" class="chip' + (o.v === p.v ? ' on' : '') + '" data-per="' + chave + ':' + o.v + '">' + esc(o.t) + '</button>';
    }).join('') +
      (p.v === 'livre' ? '<span class="row" style="gap:6px"><input class="inp" type="date" data-per-ini="' + chave + '" value="' + esc(iv.ini) + '" style="width:auto;min-height:40px" aria-label="De"><span class="muted">até</span><input class="inp" type="date" data-per-fim="' + chave + '" value="' + esc(iv.fim) + '" style="width:auto;min-height:40px" aria-label="Até"></span>' : '') +
      '</div>';
  }
  function tratarPeriodo(e) { // devolve true se tratou o clique
    var b = e.target.closest('[data-per]'); if (!b) return false;
    var p = b.dataset.per.split(':'); var atual = S.ui.per[p[0]] || {};
    S.ui.per[p[0]] = { v: p[1], ini: atual.ini, fim: atual.fim };
    render(); return true;
  }
  function ligarDatasPeriodo(v) {
    $$('[data-per-ini],[data-per-fim]', v).forEach(function (inp) {
      inp.addEventListener('change', function () {
        var ch = inp.dataset.perIni || inp.dataset.perFim; var p = S.ui.per[ch] || { v: 'livre' };
        if (inp.dataset.perIni) p.ini = inp.value; else p.fim = inp.value;
        S.ui.per[ch] = p; render();
      });
    });
  }
  function nomeVenda(x) { var pd = x.pedido_id && byId(S.pedidos || [], x.pedido_id); if (pd) return 'Pedido #' + pd.numero + ' · ' + pd.titulo; if (x.produto_id) return nomeProduto(x.produto_id); return x.observacoes || '— sem produto —'; }
  function nomeProduto(id) { var p = byId(S.produtos, id); return p ? p.nome : '— sem produto —'; }
  function nomeRolo(id) { var f = byId(S.filamentos, id); return f ? f.tipo + ' ' + f.cor : '—'; }
  function nomeEquip(id) { var e = byId(S.equipamentos, id); return e ? e.nome : '—'; }
  function nomePlat(id) { var p = byId(S.plataformas, id); return p ? p.nome : (id || '—'); }
  function grRolo(f) { return f && num(f.preco_pago) && num(f.peso_inicial_g) ? num(f.preco_pago) / num(f.peso_inicial_g) : null; }
  function custoPerda(x) {
    var f = byId(S.filamentos, x.filamento_id);
    var g = grRolo(f); if (g === null) g = custoGrama(f ? f.tipo : null).v;
    return (num(x.gramas) || 0) * g;
  }
  function lucroVenda(v) { return (num(v.valor_total) || 0) - (num(v.taxa) || 0) - (num(v.custo_unitario) || 0) * (v.quantidade || 0); }
  async function recarregar(tabelas) {
    var map = { produtos: ['produtos', 'ordem'], filamentos: ['filamentos', 'criado_em'], insumos: ['insumos', 'nome'] };
    var rs = await Promise.all(tabelas.map(function (t) { return sb.from(map[t][0]).select('*').order(map[t][1]); }));
    rs.forEach(function (r, i) { S[tabelas[i]] = q(r) || []; });
  }
  function selProdutos(sel, vazio) {
    var lista = S.produtos.filter(function (p) { return p.ativo || p.id === sel; }).slice().sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
    return (vazio ? '<option value="">' + esc(vazio) + '</option>' : '') + lista.map(function (p) {
      return '<option value="' + p.id + '"' + (p.id === sel ? ' selected' : '') + '>' + esc(p.nome) + (p.estoque > 0 ? ' (' + p.estoque + ' em estoque)' : '') + '</option>';
    }).join('');
  }
  function selRolos(sel, vazio, material) {
    var ativos = S.filamentos.filter(function (f) { return !f.arquivado || f.id === sel; });
    var mat = norm(material || '');
    ativos.sort(function (a, b) { var ma = norm(a.tipo) === mat ? 0 : 1, mb = norm(b.tipo) === mat ? 0 : 1; return ma - mb || (a.tipo + a.cor).localeCompare(b.tipo + b.cor, 'pt-BR'); });
    return '<option value="">' + esc(vazio) + '</option>' + ativos.map(function (f) {
      return '<option value="' + f.id + '"' + (f.id === sel ? ' selected' : '') + '>' + esc(f.tipo + ' ' + f.cor + (f.marca ? ' · ' + f.marca : '')) + ' (~' + fmt(num(f.restante_g), 0) + ' g)</option>';
    }).join('');
  }
  function selImpressoras(sel, vazio) {
    return '<option value="">' + esc(vazio) + '</option>' + impressoras().map(function (e) { return '<option value="' + e.id + '"' + (e.id === sel ? ' selected' : '') + '>' + esc(e.nome) + '</option>'; }).join('');
  }
  function tempoHtml(id, min) {
    var h = min ? Math.floor(min / 60) : '', m = min ? Math.round(min % 60) : '';
    return '<div class="row" style="gap:6px"><input class="inp" id="' + id + '-h" inputmode="numeric" value="' + esc(h) + '" aria-label="horas" style="min-width:0"><span class="muted">h</span><input class="inp" id="' + id + '-m" inputmode="numeric" value="' + esc(m) + '" aria-label="minutos" style="min-width:0"><span class="muted">min</span></div>';
  }
  function lerTempo(root, id) { var h = num($('#' + id + '-h', root).value) || 0, m = num($('#' + id + '-m', root).value) || 0; return (h || m) ? Math.round(h * 60 + m) : null; }
  function setTempo(root, id, min) { $('#' + id + '-h', root).value = min ? Math.floor(min / 60) : ''; $('#' + id + '-m', root).value = min ? Math.round(min % 60) : ''; }
  var BTN_DEL = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>';

  // ------------------------------------------------------------------ PRODUÇÃO E PERDAS
  var MOTIVOS = ['Purga / limpeza', 'Falha de impressão', 'Peça com defeito', 'Teste / calibração', 'Outro'];
  function telaProducao(v) {
    setHeader('Produção e perdas', '<button class="btn btn-g" id="nova-perda">+ <span class="long">Perda</span></button><button class="btn btn-p" id="nova-imp">+ <span class="long">Impressão</span></button>');
    var iv = intervalo('prod');
    var busca = S.ui.busca.producao || '';
    var imps = S.impressoes.filter(function (x) { return noPeriodo(x.data, iv) && combina([nomeProduto(x.produto_id), nomeEquip(x.impressora_id), nomeRolo(x.filamento_id), x.observacoes], busca); });
    var perdas = S.perdas.filter(function (x) { return noPeriodo(x.data, iv) && combina([nomeRolo(x.filamento_id), nomeEquip(x.impressora_id), x.motivo], busca); });
    var pecas = imps.reduce(function (a, x) { return a + (x.produto_id ? x.quantidade : 0); }, 0);
    var minutos = imps.reduce(function (a, x) { return a + (num(x.tempo_min) || 0); }, 0) + perdas.reduce(function (a, x) { return a + (num(x.tempo_min) || 0); }, 0);
    var gUsado = imps.reduce(function (a, x) { return a + (num(x.gramas) || 0); }, 0);
    var gPerda = perdas.reduce(function (a, x) { return a + (num(x.gramas) || 0); }, 0);
    var rPerda = perdas.reduce(function (a, x) { return a + custoPerda(x); }, 0);
    var tot = gUsado + gPerda;
    v.innerHTML = '<div class="stack">' + periodoHtml('prod') +
      '<div class="grid g4">' + kpi('Peças impressas', pecas, imps.length + ' impressão(ões)') + kpi('Horas de máquina', fmt(minutos / 60, 1) + ' h', 'impressões + perdas') +
      kpi('Filamento usado', fmt(gUsado / 1000, 2) + ' kg', 'nas peças') + kpi('Perdas', brl(rPerda), fmt(gPerda, 0) + ' g' + (tot ? ' · ' + fmt(gPerda / tot * 100, 0) + '% do filamento' : '')) + '</div>' +
      buscaHtml('producao', 'Pesquisar: produto, impressora, rolo, motivo…') +
      '<div class="card" style="padding:6px 8px"><div class="row between" style="padding:10px 10px 4px"><h2 style="margin:0">Impressões</h2></div>' +
      (imps.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Data</th><th>Produto</th><th class="num">Qtd</th><th class="hide-m">Impressora</th><th class="hide-m">Rolo</th><th class="num hide-m">Tempo</th><th class="num hide-m">Filamento</th><th></th></tr></thead><tbody>' +
        imps.map(function (x) {
          return '<tr><td>' + dataBR(x.data) + '</td><td><div style="font-weight:700">' + esc(nomeProduto(x.produto_id)) + '</div><div class="show-m small muted">' + esc(nomeEquip(x.impressora_id)) + ' · ' + horas(x.tempo_min) + ' · ' + fmt(num(x.gramas) || 0, 0) + ' g</div>' + (x.observacoes ? '<div class="small muted">' + esc(x.observacoes) + '</div>' : '') + '</td>' +
            '<td class="num">' + x.quantidade + '</td><td class="hide-m">' + esc(nomeEquip(x.impressora_id)) + '</td><td class="hide-m">' + esc(nomeRolo(x.filamento_id)) + '</td>' +
            '<td class="num hide-m">' + horas(x.tempo_min) + '</td><td class="num hide-m">' + (x.gramas ? fmt(num(x.gramas), 0) + ' g' : '—') + '</td>' +
            '<td><button class="icon-btn" data-del-imp="' + x.id + '" aria-label="Excluir impressão" title="Excluir (desfaz o estoque)">' + BTN_DEL + '</button></td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">' + (busca ? 'Nada encontrado.' : 'Nenhuma impressão neste período. Clique em “+ Impressão” quando uma peça sair da máquina.') + '</div>') + '</div>' +
      '<div class="card" style="padding:6px 8px"><div class="row between" style="padding:10px 10px 4px"><h2 style="margin:0">Perdas</h2><span class="small muted">purga, falha, peça errada…</span></div>' +
      (perdas.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Data</th><th>Motivo</th><th class="num">Peso</th><th class="hide-m">Rolo</th><th class="hide-m">Impressora</th><th class="num hide-m">Tempo</th><th class="num">Custo</th><th></th></tr></thead><tbody>' +
        perdas.map(function (x) {
          return '<tr><td>' + dataBR(x.data) + '</td><td>' + esc(x.motivo || '—') + '<div class="show-m small muted">' + esc(nomeRolo(x.filamento_id)) + '</div></td><td class="num">' + (x.gramas ? fmt(num(x.gramas), 0) + ' g' : '—') + '</td>' +
            '<td class="hide-m">' + esc(nomeRolo(x.filamento_id)) + '</td><td class="hide-m">' + esc(nomeEquip(x.impressora_id)) + '</td><td class="num hide-m">' + horas(x.tempo_min) + '</td>' +
            '<td class="num">' + brl(custoPerda(x)) + '</td><td><button class="icon-btn" data-del-perda="' + x.id + '" aria-label="Excluir perda" title="Excluir (devolve ao rolo)">' + BTN_DEL + '</button></td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">' + (busca ? 'Nada encontrado.' : 'Nenhuma perda neste período. 👌') + '</div>') + '</div>' +
      '</div>';
    $('#nova-imp').addEventListener('click', function () { registrarImpressao(); });
    $('#nova-perda').addEventListener('click', function () { registrarPerda(); });
    ligarBusca('producao'); ligarDatasPeriodo(v);
    v.onclick = async function (e) {
      if (tratarPeriodo(e)) return;
      var b;
      if ((b = e.target.closest('[data-del-imp]'))) {
        var x = byId(S.impressoes, b.dataset.delImp);
        if (!(await confirmar('Excluir impressão?', 'Isso desfaz o que ela fez: ' + (x.soma_estoque === false ? '' : 'tira ' + x.quantidade + ' peça(s) do estoque de “' + nomeProduto(x.produto_id) + '” e ') + 'devolve ' + fmt(num(x.gramas) || 0, 0) + ' g ao rolo.', 'Excluir', true))) return;
        try { q(await sb.from('impressoes').delete().eq('id', x.id)); S.impressoes = S.impressoes.filter(function (y) { return y.id !== x.id; }); await recarregar(['produtos', 'filamentos']); toast('Impressão excluída e desfeita ✓'); render(); } catch (err) { toast(erroMsg(err), true); }
      }
      if ((b = e.target.closest('[data-del-perda]'))) {
        var p = byId(S.perdas, b.dataset.delPerda);
        if (!(await confirmar('Excluir perda?', 'As ' + fmt(num(p.gramas) || 0, 0) + ' g voltam para o rolo.', 'Excluir', true))) return;
        try { q(await sb.from('perdas').delete().eq('id', p.id)); S.perdas = S.perdas.filter(function (y) { return y.id !== p.id; }); await recarregar(['filamentos']); toast('Perda excluída ✓'); render(); } catch (err) { toast(erroMsg(err), true); }
      }
    };
  }
  function pedidosAbertos() { return (S.pedidos || []).filter(function (p) { return p.status !== 'entregue' && p.status !== 'cancelado'; }); }
  function selPedidos(sel) {
    return '<option value="">— nenhum (peça para o estoque) —</option>' + pedidosAbertos().concat((S.pedidos || []).filter(function (p) { return p.id === sel && pedidosAbertos().indexOf(p) < 0; }))
      .map(function (p) { return '<option value="' + p.id + '"' + (p.id === sel ? ' selected' : '') + '>#' + p.numero + ' · ' + esc(p.titulo) + (p.cliente_nome ? ' (' + esc(p.cliente_nome) + ')' : '') + '</option>'; }).join('');
  }
  function registrarImpressao(produtoId, pedidoId) {
    var p0 = produtoId ? byId(S.produtos, produtoId) : null;
    var m = modal('<div class="row between"><h2>Registrar impressão</h2><button class="btn btn-g btn-s" data-x="close">Fechar</button></div>' +
      '<div class="grid g2">' +
      (!S.faltaScript06 ? '<div class="field" style="grid-column:1 / -1"><label for="ri-ped">É de um pedido?</label><select class="inp" id="ri-ped">' + selPedidos(pedidoId || '') + '</select></div>' +
        '<div class="field hidden" id="ri-item-box" style="grid-column:1 / -1"><label for="ri-item">Item do pedido</label><select class="inp" id="ri-item"></select></div>' : '') +
      '<div class="field" style="grid-column:1 / -1"><label for="ri-prod">Produto</label><select class="inp" id="ri-prod">' + selProdutos(produtoId || '', '— sem produto (teste, brinde, personalizado…) —') + '</select></div>' +
      '<div class="field"><label for="ri-qtd">Quantidade de peças</label><input class="inp" id="ri-qtd" inputmode="numeric" value="1"></div>' +
      '<div class="field"><label for="ri-data">Data</label><input class="inp" type="date" id="ri-data" value="' + hojeISO() + '"></div>' +
      '<div class="field"><label for="ri-imp">Impressora</label><select class="inp" id="ri-imp">' + selImpressoras(p0 && p0.impressora_padrao, '— não informar —') + '</select></div>' +
      '<div class="field"><label for="ri-rolo">Rolo usado</label><select class="inp" id="ri-rolo">' + selRolos('', '— não informar —', p0 && p0.material) + '</select></div>' +
      '<div class="field"><label>Tempo total</label>' + tempoHtml('ri-t', null) + '<div class="hint" id="ri-t-hint"></div></div>' +
      '<div class="field"><label for="ri-g">Filamento total (g)</label><input class="inp" id="ri-g" inputmode="decimal"><div class="hint" id="ri-g-hint"></div></div>' +
      '<div class="field" style="grid-column:1 / -1"><label for="ri-obs">Observação (opcional)</label><input class="inp" id="ri-obs" placeholder="ex.: cor branca, lote do pedido da Maria"></div>' +
      '<div style="grid-column:1 / -1" class="hidden" id="ri-somar-box"><label class="check"><input type="checkbox" id="ri-somar" checked> Somar às peças prontas do pedido</label></div>' +
      '</div><div class="note" id="ri-prev"></div>' +
      '<div class="row" style="justify-content:flex-end"><button class="btn btn-g" data-x="close">Cancelar</button><button class="btn btn-p" data-x="save">Registrar</button></div>');
    var mexeuT = false, mexeuG = false;
    var elPed = $('#ri-ped', m), elItem = $('#ri-item', m);
    function pedido() { return elPed && elPed.value ? byId(S.pedidos, elPed.value) : null; }
    function item() { return pedido() && elItem.value ? byId(S.pedidoItens, elItem.value) : null; }
    function base() { // de onde vêm tempo e gramas por peça
      var it = item();
      if (it) { var d = itemDados(it); return { t: d.tempo, g: d.gramas, de: 'item do pedido' }; }
      var p = byId(S.produtos, $('#ri-prod', m).value);
      return p ? { t: p.tempo_min, g: num(p.gramas), de: 'ficha do produto' } : { t: null, g: null };
    }
    function auto() {
      var b = base(), qtd = Math.max(1, Math.round(num($('#ri-qtd', m).value) || 1));
      if (!mexeuT && b.t) { setTempo(m, 'ri-t', b.t * qtd); $('#ri-t-hint', m).textContent = horas(b.t) + ' por peça × ' + qtd; }
      if (!mexeuG && b.g) { $('#ri-g', m).value = fmtIn(String(Math.round(b.g * qtd * 10) / 10)); $('#ri-g-hint', m).textContent = fmt(b.g, 1) + ' g por peça × ' + qtd; }
      prev();
    }
    function prev() {
      var p = byId(S.produtos, $('#ri-prod', m).value), qtd = Math.max(1, Math.round(num($('#ri-qtd', m).value) || 1));
      var f = byId(S.filamentos, $('#ri-rolo', m).value), g = num($('#ri-g', m).value) || 0, pd = pedido(), it = item();
      var linhas = [];
      if (pd) linhas.push('Pedido <b>#' + pd.numero + ' ' + esc(pd.titulo) + '</b>' + (it && $('#ri-somar', m).checked && !(it.personalizacoes || []).length ? ': prontas ' + itemFeitas(it) + ' → <b>' + Math.min(it.quantidade, itemFeitas(it) + qtd) + '</b> de ' + it.quantidade : '') + ' · não entra no estoque de pronta entrega');
      else if (p) linhas.push('Estoque de <b>' + esc(p.nome) + '</b>: ' + (p.estoque || 0) + ' → <b>' + ((p.estoque || 0) + qtd) + '</b>');
      if (f && g) linhas.push('Rolo <b>' + esc(f.tipo + ' ' + f.cor) + '</b>: ' + fmt(num(f.restante_g), 0) + ' g → <b>' + fmt(Math.max(0, num(f.restante_g) - g), 0) + ' g</b>');
      $('#ri-prev', m).innerHTML = linhas.length ? linhas.join('<br>') : 'Escolha o produto e o rolo para ver o que muda.';
    }
    function pedidoMudou() {
      var pd = pedido();
      $('#ri-item-box', m).classList.toggle('hidden', !pd);
      $('#ri-somar-box', m).classList.toggle('hidden', !pd);
      if (pd) {
        var itens = S.pedidoItens.filter(function (x) { return x.pedido_id === pd.id; });
        elItem.innerHTML = itens.map(function (x) { return '<option value="' + x.id + '">' + esc(itemDados(x).nome) + ' (' + itemFeitas(x) + '/' + x.quantidade + ')</option>'; }).join('') || '<option value="">—</option>';
        var it = item() || itens[0];
        if (it) { elItem.value = it.id; var d = itemDados(it); if (it.produto_id) $('#ri-prod', m).value = it.produto_id; var falta = Math.max(1, it.quantidade - itemFeitas(it)); $('#ri-qtd', m).value = Math.min(falta, num($('#ri-qtd', m).value) > 1 ? num($('#ri-qtd', m).value) : falta); $('#ri-rolo', m).innerHTML = selRolos($('#ri-rolo', m).value, '— não informar —', d.material); }
      }
      mexeuT = false; mexeuG = false; auto();
    }
    $('#ri-prod', m).addEventListener('change', function () {
      var p = byId(S.produtos, this.value);
      if (p) { if (p.impressora_padrao) $('#ri-imp', m).value = p.impressora_padrao; $('#ri-rolo', m).innerHTML = selRolos($('#ri-rolo', m).value, '— não informar —', p.material); }
      mexeuT = false; mexeuG = false; auto();
    });
    if (elPed) { elPed.addEventListener('change', pedidoMudou); elItem.addEventListener('change', function () { mexeuT = false; mexeuG = false; auto(); }); $('#ri-somar', m).addEventListener('change', prev); }
    $('#ri-qtd', m).addEventListener('input', auto);
    $('#ri-rolo', m).addEventListener('change', prev);
    $('#ri-g', m).addEventListener('input', function () { mexeuG = true; $('#ri-g-hint', m).textContent = ''; prev(); });
    ['#ri-t-h', '#ri-t-m'].forEach(function (s) { $(s, m).addEventListener('input', function () { mexeuT = true; $('#ri-t-hint', m).textContent = ''; }); });
    if (pedidoId) pedidoMudou(); else auto();
    m.addEventListener('click', async function (e) {
      var b = e.target.closest('[data-x]'); if (!b) return;
      if (b.dataset.x === 'close') return closeModal();
      var pd = pedido(), it = item();
      var o = {
        data: $('#ri-data', m).value || hojeISO(), produto_id: $('#ri-prod', m).value || null,
        quantidade: Math.max(1, Math.round(num($('#ri-qtd', m).value) || 1)),
        impressora_id: $('#ri-imp', m).value || null, filamento_id: $('#ri-rolo', m).value || null,
        tempo_min: lerTempo(m, 'ri-t'), gramas: num($('#ri-g', m).value), observacoes: $('#ri-obs', m).value.trim() || null
      };
      if (pd) { o.pedido_id = pd.id; o.soma_estoque = false; }
      b.disabled = true;
      try {
        var r = q(await sb.from('impressoes').insert(o).select().single());
        S.impressoes.unshift(r);
        if (pd && it && $('#ri-somar', m).checked && !(it.personalizacoes || []).length) {
          var nf = Math.min(it.quantidade, (it.feitas || 0) + o.quantidade);
          var ri = q(await sb.from('pedido_itens').update({ feitas: nf }).eq('id', it.id).select().single());
          S.pedidoItens = S.pedidoItens.map(function (x) { return x.id === ri.id ? ri : x; });
        }
        await recarregar(['produtos', 'filamentos']);
        closeModal(); toast('Impressão registrada ✓' + (pd ? ' (pedido #' + pd.numero + ')' : o.produto_id ? ' Estoque +' + o.quantidade : '')); render();
      } catch (err) { b.disabled = false; toast(erroMsg(err), true); }
    });
  }
  function registrarPerda(pedidoId) {
    var m = modal('<div class="row between"><h2>Registrar perda</h2><button class="btn btn-g btn-s" data-x="close">Fechar</button></div>' +
      '<div class="small muted" style="margin-top:-6px">Preenche o que tiver — nada é obrigatório.</div>' +
      '<div class="grid g2">' +
      (!S.faltaScript06 ? '<div class="field" style="grid-column:1 / -1"><label for="rp-ped">Aconteceu em um pedido?</label><select class="inp" id="rp-ped">' + selPedidos(pedidoId || '').replace('— nenhum (peça para o estoque) —', '— não —') + '</select></div>' : '') +
      '<div class="field"><label for="rp-g">Peso (g)</label><input class="inp" id="rp-g" inputmode="decimal" placeholder="ex.: 24"></div>' +
      '<div class="field"><label for="rp-mot">Motivo</label><select class="inp" id="rp-mot"><option value="">—</option>' + MOTIVOS.map(function (x) { return '<option>' + esc(x) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="rp-rolo">Rolo</label><select class="inp" id="rp-rolo">' + selRolos('', '— não sei / vários —') + '</select></div>' +
      '<div class="field"><label for="rp-imp">Impressora</label><select class="inp" id="rp-imp">' + selImpressoras('', '— não informar —') + '</select></div>' +
      '<div class="field"><label>Tempo de máquina</label>' + tempoHtml('rp-t', null) + '</div>' +
      '<div class="field"><label for="rp-data">Data</label><input class="inp" type="date" id="rp-data" value="' + hojeISO() + '"></div>' +
      '</div>' +
      '<div class="row" style="justify-content:flex-end"><button class="btn btn-g" data-x="close">Cancelar</button><button class="btn btn-p" data-x="save">Salvar perda</button></div>', { size: 'sm' });
    m.addEventListener('click', async function (e) {
      var b = e.target.closest('[data-x]'); if (!b) return;
      if (b.dataset.x === 'close') return closeModal();
      var o = { data: $('#rp-data', m).value || hojeISO(), gramas: num($('#rp-g', m).value), filamento_id: $('#rp-rolo', m).value || null, impressora_id: $('#rp-imp', m).value || null, tempo_min: lerTempo(m, 'rp-t'), motivo: $('#rp-mot', m).value || null };
      if ($('#rp-ped', m) && $('#rp-ped', m).value) o.pedido_id = $('#rp-ped', m).value;
      if (!o.gramas && !o.tempo_min && !o.motivo) return toast('Preencha pelo menos o peso, o tempo ou o motivo', true);
      b.disabled = true;
      try {
        var r = q(await sb.from('perdas').insert(o).select().single());
        S.perdas.unshift(r);
        if (o.filamento_id) await recarregar(['filamentos']);
        closeModal(); toast('Perda registrada ✓'); render();
      } catch (err) { b.disabled = false; toast(erroMsg(err), true); }
    });
  }

  // ------------------------------------------------------------------ VENDAS
  var PAGAMENTOS = ['Pix', 'Cartão de crédito', 'Cartão de débito', 'Dinheiro', 'Pago pela plataforma'];
  function telaVendas(v) {
    setHeader('Vendas', '<button class="btn btn-p" id="nova-venda">+ <span class="long">Registrar venda</span></button>');
    var iv = intervalo('vendas');
    var busca = S.ui.busca.vendas || '';
    var noPer = S.vendas.filter(function (x) { return noPeriodo(x.data, iv); });
    var vf = S.ui.vf || [];
    var canais = S.plataformas.filter(function (pl) { return pl.ativa || noPer.some(function (x) { return x.plataforma_id === pl.id; }); });
    var lista = noPer.filter(function (x) { return (!vf.length || vf.indexOf(x.plataforma_id) >= 0) && combina([nomeProduto(x.produto_id), nomePlat(x.plataforma_id), x.pagamento, x.cliente, x.opcao, x.observacoes], busca); });
    var soma = function (arr, fn) { return arr.reduce(function (a, x) { return a + fn(x); }, 0); };
    var fat = soma(lista, function (x) { return num(x.valor_total) || 0; }), tax = soma(lista, function (x) { return num(x.taxa) || 0; });
    var cus = soma(lista, function (x) { return (num(x.custo_unitario) || 0) * x.quantidade; }), luc = fat - tax - cus;
    v.innerHTML = '<div class="stack">' + periodoHtml('vendas') +
      '<div class="grid g4">' + kpi('Faturamento', brl(fat), lista.length + ' venda(s)') + kpi('Lucro', brl(luc), fat ? 'margem ' + fmt(luc / fat * 100, 0) + '% do faturamento' : '') +
      kpi('Taxas', brl(tax), 'plataformas e cartão') + kpi('Ticket médio', brl(lista.length ? fat / lista.length : 0), soma(lista, function (x) { return x.quantidade; }) + ' peça(s)') + '</div>' +
      '<div class="small muted">Clique nas plataformas para filtrar — uma para ver sozinha, várias para comparar.</div>' +
      '<div class="canais">' + canais.map(function (pl) {
        var vs = noPer.filter(function (x) { return x.plataforma_id === pl.id; }), on = vf.indexOf(pl.id) >= 0;
        return '<button type="button" class="canal' + (on ? ' on' : '') + (vf.length && !on ? ' off' : '') + '" data-canal="' + pl.id + '" aria-pressed="' + on + '"><span class="lbl">' + esc(pl.nome) + '</span><span class="v">' + brl(soma(vs, function (x) { return num(x.valor_total) || 0; })) + '</span><span class="small muted">' + vs.length + ' venda(s) · lucro ' + brl(soma(vs, lucroVenda)) + '</span></button>';
      }).join('') + (vf.length ? '<button type="button" class="btn btn-g btn-s" data-canal-limpar>Limpar filtro</button>' : '') + '</div>' +
      buscaHtml('vendas', 'Pesquisar: produto, cliente, Pix…') +
      '<div class="card" style="padding:6px 8px">' + (lista.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Data</th><th>Produto</th><th class="num">Qtd</th><th class="hide-m">Canal</th><th class="hide-m">Pagamento</th><th class="num">Valor</th><th class="num hide-m">Taxa</th><th class="num hide-m">Custo</th><th class="num">Lucro</th><th></th></tr></thead><tbody>' +
        lista.map(function (x) {
          var l = lucroVenda(x);
          return '<tr><td>' + dataBR(x.data) + '</td><td><div style="font-weight:700">' + esc(nomeVenda(x)) + '</div><div class="small muted">' + esc([x.opcao, x.cliente].filter(Boolean).join(' · ')) + (x.baixa_estoque ? '' : ' <span class="pill p-info">encomenda</span>') + '</div><div class="show-m small muted">' + esc(nomePlat(x.plataforma_id) + ' · ' + (x.pagamento || '')) + '</div></td>' +
            '<td class="num">' + x.quantidade + '</td><td class="hide-m">' + esc(nomePlat(x.plataforma_id)) + '</td><td class="hide-m">' + esc(x.pagamento || '—') + '</td>' +
            '<td class="num">' + brl(num(x.valor_total)) + '</td><td class="num hide-m">' + (num(x.taxa) ? brl(num(x.taxa)) : '—') + '</td><td class="num hide-m">' + brl((num(x.custo_unitario) || 0) * x.quantidade) + '</td>' +
            '<td class="num" style="font-weight:700;color:' + (l < 0 ? 'var(--bad)' : 'var(--ok)') + '">' + brl(l) + '</td>' +
            '<td><button class="icon-btn" data-del-venda="' + x.id + '" aria-label="Excluir venda" title="Excluir (devolve ao estoque)">' + BTN_DEL + '</button></td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">' + (noPer.length ? 'Nada encontrado com esse filtro.' : 'Nenhuma venda neste período. Clique em “+ Registrar venda”.') + '</div>') + '</div></div>';
    $('#nova-venda').addEventListener('click', function () { registrarVenda(); });
    ligarBusca('vendas'); ligarDatasPeriodo(v);
    v.onclick = async function (e) {
      if (tratarPeriodo(e)) return;
      var b;
      if (e.target.closest('[data-canal-limpar]')) { S.ui.vf = []; return render(); }
      if ((b = e.target.closest('[data-canal]'))) { var a = (S.ui.vf || []).slice(), i = a.indexOf(b.dataset.canal); if (i >= 0) a.splice(i, 1); else a.push(b.dataset.canal); S.ui.vf = a; return render(); }
      if ((b = e.target.closest('[data-del-venda]'))) {
        var x = byId(S.vendas, b.dataset.delVenda);
        if (!(await confirmar('Excluir venda?', 'A venda sai dos relatórios' + (x.baixa_estoque ? ' e ' + x.quantidade + ' peça(s) voltam ao estoque' : '') + (x.baixa_insumos ? ', junto com os insumos' : '') + '.', 'Excluir', true))) return;
        try { q(await sb.from('vendas').delete().eq('id', x.id)); S.vendas = S.vendas.filter(function (y) { return y.id !== x.id; }); await recarregar(['produtos', 'insumos']); toast('Venda excluída ✓'); render(); } catch (err) { toast(erroMsg(err), true); }
      }
    };
  }
  function registrarVenda(produtoId) {
    var platOpts = S.plataformas.filter(function (pl) { return pl.ativa; }).map(function (pl) { return '<option value="' + pl.id + '">' + esc(pl.nome) + '</option>'; }).join('');
    var m = modal('<div class="row between"><h2>Registrar venda</h2><button class="btn btn-g btn-s" data-x="close">Fechar</button></div>' +
      '<div class="grid g2">' +
      '<div class="field" style="grid-column:1 / -1"><label for="rv-prod">Produto</label><select class="inp" id="rv-prod">' + selProdutos(produtoId || '', '— escolher —') + '</select></div>' +
      '<div class="field hidden" id="rv-op-box"><label for="rv-op">Opção</label><select class="inp" id="rv-op"></select></div>' +
      '<div class="field"><label for="rv-qtd">Quantidade</label><input class="inp" id="rv-qtd" inputmode="numeric" value="1"></div>' +
      '<div class="field"><label for="rv-canal">Canal</label><select class="inp" id="rv-canal">' + platOpts + '</select></div>' +
      '<div class="field"><label for="rv-pag">Pagamento</label><select class="inp" id="rv-pag">' + PAGAMENTOS.map(function (x) { return '<option>' + esc(x) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="rv-valor">Valor total recebido (R$)</label><input class="inp" id="rv-valor" inputmode="decimal"><div class="hint" id="rv-valor-hint"></div></div>' +
      '<div class="field"><label for="rv-taxa">Taxa (R$)</label><input class="inp" id="rv-taxa" inputmode="decimal"><div class="hint" id="rv-taxa-hint"></div></div>' +
      '<div class="field"><label for="rv-data">Data</label><input class="inp" type="date" id="rv-data" value="' + hojeISO() + '"></div>' +
      '<div class="field"><label for="rv-cli">Cliente (opcional)</label><input class="inp" id="rv-cli"></div>' +
      '<div style="grid-column:1 / -1" class="stack" id="rv-checks"></div>' +
      '</div><div class="cost-box" id="rv-prev"></div>' +
      '<div class="row" style="justify-content:flex-end"><button class="btn btn-g" data-x="close">Cancelar</button><button class="btn btn-p" data-x="save">Registrar venda</button></div>');
    var mexeuV = false, mexeuT = false;
    function precoUnit(p, canal, pag) {
      var ad = S.anuncios.filter(function (a) { return a.produto_id === p.id && a.plataforma_id === canal && !a.arquivado; })[0];
      if (ad && num(ad.preco)) return { v: num(ad.preco), de: 'preço anunciado em ' + nomePlat(canal) };
      if (/crédito/.test(pag) && num(p.preco_cartao)) return { v: num(p.preco_cartao), de: 'preço no cartão' };
      return { v: num(p.preco) || 0, de: 'preço Pix / site' };
    }
    function calcTaxa(valor, canal, pag) {
      var pl = byId(S.plataformas, canal) || {}, pct = num(pl.taxa_pct) || 0, fixa = num(pl.taxa_fixa) || 0;
      if (!pct && !fixa && /cartão/i.test(pag)) { pct = num(S.cfg.taxa_cartao_pct) || 0; return { v: valor * pct / 100, de: 'maquininha ' + fmt(pct) + '%' }; }
      if (!pct && !fixa) return { v: 0, de: 'sem taxa' };
      return { v: valor * pct / 100 + fixa, de: nomePlat(canal) + ': ' + fmt(pct) + '%' + (fixa ? ' + ' + brl(fixa) : '') };
    }
    function prodMudou() {
      var p = byId(S.produtos, $('#rv-prod', m).value);
      var ops = p && p.opcoes && p.opcoes[0] && p.opcoes[0].choices && p.opcoes[0].choices.length ? p.opcoes[0] : null;
      $('#rv-op-box', m).classList.toggle('hidden', !ops);
      if (ops) { $('label[for="rv-op"]', m).textContent = ops.name || 'Opção'; $('#rv-op', m).innerHTML = '<option value="">—</option>' + ops.choices.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join(''); }
      var temIns = p && S.prodInsumos.some(function (x) { return x.produto_id === p.id; });
      var qtd = Math.max(1, Math.round(num($('#rv-qtd', m).value) || 1));
      $('#rv-checks', m).innerHTML = p ?
        '<label class="check"><input type="checkbox" id="rv-est"' + ((p.estoque || 0) >= qtd ? ' checked' : '') + '> Saiu do estoque (pronta entrega) — ' + (p.estoque || 0) + ' em estoque</label>' +
        '<div class="hint" style="margin:-6px 0 0 28px">Desmarque se for <b>encomenda</b> (vai imprimir agora; registre a impressão depois).</div>' +
        (temIns ? '<label class="check"><input type="checkbox" id="rv-ins" checked> Dar baixa nos insumos (' + esc(S.prodInsumos.filter(function (x) { return x.produto_id === p.id; }).map(function (x) { var i = byId(S.insumos, x.insumo_id); return i ? i.nome : ''; }).filter(Boolean).join(', ')) + ')</label>' : '') : '';
      $$('#rv-checks input', m).forEach(function (c) { c.addEventListener('change', recalc); });
      mexeuV = false; mexeuT = false; recalc();
    }
    function recalc() {
      var p = byId(S.produtos, $('#rv-prod', m).value);
      var qtd = Math.max(1, Math.round(num($('#rv-qtd', m).value) || 1)), canal = $('#rv-canal', m).value, pag = $('#rv-pag', m).value;
      if (!p) { $('#rv-prev', m).innerHTML = '<span class="muted">Escolha o produto.</span>'; return; }
      if (!mexeuV) { var pu = precoUnit(p, canal, pag); $('#rv-valor', m).value = fmtIn((pu.v * qtd).toFixed(2)); $('#rv-valor-hint', m).textContent = brl(pu.v) + ' × ' + qtd + ' (' + pu.de + ')'; }
      var valor = num($('#rv-valor', m).value) || 0;
      if (!mexeuT) { var tx = calcTaxa(valor, canal, pag); $('#rv-taxa', m).value = fmtIn(tx.v.toFixed(2)); $('#rv-taxa-hint', m).textContent = tx.de; }
      var taxa = num($('#rv-taxa', m).value) || 0;
      var c = custoProduto(p); c.total = Math.round(c.total * 100) / 100; // mesmo arredondamento que é gravado
      var l = valor - taxa - c.total * qtd;
      var est = $('#rv-est', m);
      $('#rv-prev', m).innerHTML = '<div class="row between"><span>Recebido</span><span>' + brl(valor) + '</span></div>' +
        '<div class="row between"><span>Taxa</span><span>− ' + brl(taxa) + '</span></div>' +
        '<div class="row between"><span>Custo (' + qtd + ' × ' + brl(c.total) + ')</span><span>− ' + brl(c.total * qtd) + '</span></div>' +
        '<div class="row between tot"><span>Lucro</span><span style="color:' + (l < 0 ? 'var(--bad)' : 'var(--ok)') + '">' + brl(l) + '</span></div>' +
        (c.avisos.length ? '<div class="hint">Custo estimado — ' + esc(c.avisos.join(', ').toLowerCase()) + ' na ficha do produto.</div>' : '') +
        (est && est.checked ? '<div class="hint">Estoque: ' + (p.estoque || 0) + ' → ' + Math.max(0, (p.estoque || 0) - qtd) + (p.estoque - qtd <= 0 ? ' (o site passa a mostrar “Sob encomenda”)' : '') + '</div>' : '');
    }
    $('#rv-prod', m).addEventListener('change', prodMudou);
    $('#rv-qtd', m).addEventListener('input', function () { prodMudou(); });
    $('#rv-canal', m).addEventListener('change', function () { mexeuV = false; mexeuT = false; recalc(); });
    $('#rv-pag', m).addEventListener('change', function () { var c = $('#rv-canal', m).value; if ($('#rv-pag', m).value === 'Pago pela plataforma' && c === 'site') {} mexeuV = false; mexeuT = false; recalc(); });
    $('#rv-valor', m).addEventListener('input', function () { mexeuV = true; $('#rv-valor-hint', m).textContent = 'digitado'; recalc(); });
    $('#rv-taxa', m).addEventListener('input', function () { mexeuT = true; $('#rv-taxa-hint', m).textContent = 'digitado'; recalc(); });
    prodMudou();
    m.addEventListener('click', async function (e) {
      var b = e.target.closest('[data-x]'); if (!b) return;
      if (b.dataset.x === 'close') return closeModal();
      var p = byId(S.produtos, $('#rv-prod', m).value);
      if (!p) return toast('Escolha o produto', true);
      var qtd = Math.max(1, Math.round(num($('#rv-qtd', m).value) || 1));
      var o = {
        data: $('#rv-data', m).value || hojeISO(), produto_id: p.id, quantidade: qtd, plataforma_id: $('#rv-canal', m).value || null,
        pagamento: $('#rv-pag', m).value, valor_total: num($('#rv-valor', m).value) || 0, taxa: num($('#rv-taxa', m).value) || 0,
        custo_unitario: Math.round(custoProduto(p).total * 100) / 100,
        baixa_estoque: !!($('#rv-est', m) && $('#rv-est', m).checked), baixa_insumos: !!($('#rv-ins', m) && $('#rv-ins', m).checked),
        cliente: $('#rv-cli', m).value.trim() || null, opcao: $('#rv-op', m).value || null
      };
      b.disabled = true;
      try {
        var r = q(await sb.from('vendas').insert(o).select().single());
        S.vendas.unshift(r);
        await recarregar(['produtos', 'insumos']);
        closeModal(); toast('Venda registrada ✓ Lucro ' + brl(lucroVenda(r))); render();
      } catch (err) { b.disabled = false; toast(erroMsg(err), true); }
    });
  }

  // ------------------------------------------------------------------ RELATÓRIOS
  function barras(itens, fmtV) { // itens: [{t, v, sub}] — magnitude, uma cor só
    var max = Math.max.apply(null, itens.map(function (i) { return Math.abs(i.v); }).concat([0]));
    if (!itens.length) return '<div class="muted small">Sem dados no período.</div>';
    return '<div class="stack" style="gap:10px">' + itens.map(function (i) {
      var w = max ? Math.max(2, Math.round(Math.abs(i.v) / max * 100)) : 0;
      return '<div title="' + esc(i.t + ': ' + fmtV(i.v) + (i.sub ? ' · ' + i.sub : '')) + '"><div class="row between small"><span>' + esc(i.t) + '</span><span style="font-weight:700">' + esc(fmtV(i.v)) + (i.sub ? ' <span class="muted" style="font-weight:500">· ' + esc(i.sub) + '</span>' : '') + '</span></div>' +
        '<div class="bar" style="margin-top:5px"><i style="width:' + w + '%;background:' + (i.v < 0 ? 'var(--bad)' : 'var(--craft)') + '"></i></div></div>';
    }).join('') + '</div>';
  }
  function telaRelatorios(v) {
    setHeader('Relatórios');
    var iv = intervalo('rel');
    var vend = S.vendas.filter(function (x) { return noPeriodo(x.data, iv); });
    var imps = S.impressoes.filter(function (x) { return noPeriodo(x.data, iv); });
    var perd = S.perdas.filter(function (x) { return noPeriodo(x.data, iv); });
    var soma = function (arr, fn) { return arr.reduce(function (a, x) { return a + fn(x); }, 0); };
    var fat = soma(vend, function (x) { return num(x.valor_total) || 0; }), tax = soma(vend, function (x) { return num(x.taxa) || 0; });
    var cus = soma(vend, function (x) { return (num(x.custo_unitario) || 0) * x.quantidade; });
    var rPerda = soma(perd, custoPerda), luc = fat - tax - cus - rPerda;
    var horasMaq = (soma(imps, function (x) { return num(x.tempo_min) || 0; }) + soma(perd, function (x) { return num(x.tempo_min) || 0; })) / 60;
    // por canal
    var porCanal = {}; vend.forEach(function (x) { var k = x.plataforma_id || '—'; porCanal[k] = porCanal[k] || { fat: 0, luc: 0, n: 0 }; porCanal[k].fat += num(x.valor_total) || 0; porCanal[k].luc += lucroVenda(x); porCanal[k].n++; });
    var canalItens = Object.keys(porCanal).map(function (k) { return { t: nomePlat(k), v: porCanal[k].luc, sub: porCanal[k].n + ' venda(s), ' + brl(porCanal[k].fat) }; }).sort(function (a, b) { return b.v - a.v; });
    // horas por impressora
    var porImp = {}; imps.concat(perd).forEach(function (x) { if (!x.impressora_id) return; porImp[x.impressora_id] = (porImp[x.impressora_id] || 0) + (num(x.tempo_min) || 0); });
    var impItens = impressoras().map(function (e) { return { t: e.nome, v: (porImp[e.id] || 0) / 60, sub: 'total ' + fmt(horasTotais(e), 0) + ' h' }; });
    // produtos
    var porProd = {}; vend.forEach(function (x) { var k = x.produto_id; if (!k) return; porProd[k] = porProd[k] || { q: 0, fat: 0, luc: 0 }; porProd[k].q += x.quantidade; porProd[k].fat += num(x.valor_total) || 0; porProd[k].luc += lucroVenda(x); });
    var prodRows = Object.keys(porProd).map(function (k) { var p = byId(S.produtos, k); var hrs = p && p.tempo_min ? (p.tempo_min * porProd[k].q) / 60 : null; return { p: p, k: k, d: porProd[k], lh: hrs ? porProd[k].luc / hrs : null }; }).sort(function (a, b) { return b.d.luc - a.d.luc; });
    // filamento por tipo
    var porTipo = {}; imps.forEach(function (x) { var f = byId(S.filamentos, x.filamento_id); var k = f ? f.tipo : 'Não informado'; porTipo[k] = (porTipo[k] || 0) + (num(x.gramas) || 0); });
    perd.forEach(function (x) { var f = byId(S.filamentos, x.filamento_id); var k = (f ? f.tipo : 'Não informado'); porTipo[k] = (porTipo[k] || 0) + (num(x.gramas) || 0); });
    var tipoItens = Object.keys(porTipo).map(function (k) { return { t: k, v: porTipo[k] }; }).sort(function (a, b) { return b.v - a.v; });
    v.innerHTML = '<div class="stack">' + periodoHtml('rel') +
      '<div class="small muted">' + (iv.ini === '0000-01-01' ? 'Todo o histórico' : dataBR(iv.ini) + ' a ' + dataBR(iv.fim)) + '</div>' +
      '<div class="grid g4">' + kpi('Faturamento', brl(fat), vend.length + ' venda(s) · ' + soma(vend, function (x) { return x.quantidade; }) + ' peça(s)') +
      kpi('Custos + taxas', brl(cus + tax), 'custo ' + brl(cus) + ' · taxas ' + brl(tax)) +
      kpi('Lucro', brl(luc), fat ? 'já descontando as perdas · ' + fmt(luc / fat * 100, 0) + '%' : 'já descontando as perdas') +
      kpi('Perdas', brl(rPerda), fmt(soma(perd, function (x) { return num(x.gramas) || 0; }), 0) + ' g · ' + perd.length + ' registro(s)') + '</div>' +
      '<div class="grid g2">' +
      '<div class="card"><h2>Lucro por canal</h2>' + barras(canalItens, brl) + '</div>' +
      '<div class="card"><h2>Horas por impressora</h2>' + barras(impItens, function (x) { return fmt(x, 1) + ' h'; }) + '<div class="hint" style="margin-top:10px">' + fmt(horasMaq, 1) + ' h de máquina no período (impressões + perdas).</div></div>' +
      '</div>' +
      '<div class="card"><h2>Produtos vendidos</h2>' + (prodRows.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Produto</th><th class="num">Peças</th><th class="num hide-m">Faturamento</th><th class="num">Lucro</th><th class="num hide-m">Lucro / hora de máquina</th></tr></thead><tbody>' +
        prodRows.map(function (r) { return '<tr class="click" data-href="#/produto/' + r.k + '"><td style="font-weight:700">' + esc(r.p ? r.p.nome : '—') + '</td><td class="num">' + r.d.q + '</td><td class="num hide-m">' + brl(r.d.fat) + '</td><td class="num" style="font-weight:700;color:' + (r.d.luc < 0 ? 'var(--bad)' : 'var(--ok)') + '">' + brl(r.d.luc) + '</td><td class="num hide-m">' + (r.lh !== null ? brl(r.lh) : '—') + '</td></tr>'; }).join('') +
        '</tbody></table></div><div class="hint" style="margin-top:8px">“Lucro por hora de máquina” mostra o que mais vale a pena colocar para imprimir.</div>' : '<div class="muted small">Nenhuma venda no período.</div>') + '</div>' +
      '<div class="card"><h2>Filamento consumido por tipo</h2>' + barras(tipoItens, function (x) { return fmt(x, 0) + ' g'; }) + '</div>' +
      '</div>';
    ligarDatasPeriodo(v);
    v.onclick = function (e) { tratarPeriodo(e); };
  }

  // ================================================================== PEDIDOS
  var ST_PED = [
    { v: 'orcamento', t: 'Orçamento' }, { v: 'aprovado', t: 'Aprovado' }, { v: 'fila', t: 'Na fila' },
    { v: 'imprimindo', t: 'Imprimindo' }, { v: 'acabamento', t: 'Acabamento' }, { v: 'pronto', t: 'Pronto / embalado' },
    { v: 'entregue', t: 'Entregue' }, { v: 'cancelado', t: 'Cancelado' }
  ];
  var HORAS_DIA = 16; // horas de impressão por dia, para a previsão
  function stTxt(v) { var s = ST_PED.filter(function (x) { return x.v === v; })[0]; return s ? s.t : v; }
  function itensDe(pid) { return (S.pedidoItens || []).filter(function (x) { return x.pedido_id === pid; }).sort(function (a, b) { return (a.ordem || 0) - (b.ordem || 0); }); }
  function custosDe(pid) { return (S.pedidoCustos || []).filter(function (x) { return x.pedido_id === pid; }); }
  function notasDe(pid) { return (S.pedidoNotas || []).filter(function (x) { return x.pedido_id === pid; }).sort(function (a, b) { return String(b.criado_em).localeCompare(String(a.criado_em)); }); }
  function itemDados(it) {
    var p = byId(S.produtos, it.produto_id) || {};
    return {
      nome: it.descricao || p.nome || 'Item personalizado',
      gramas: num(it.gramas_unit) !== null ? num(it.gramas_unit) : num(p.gramas),
      tempo: num(it.tempo_min_unit) !== null ? num(it.tempo_min_unit) : num(p.tempo_min),
      material: it.material || p.material || 'PLA',
      revenda: p.tipo_produto === 'revenda', custoCompra: num(p.custo_compra), produto: it.produto_id ? p : null
    };
  }
  function itemFeitas(it) {
    var l = it.personalizacoes || [];
    if (l.length) return l.filter(function (x) { return x.ok; }).length;
    return Math.min(it.quantidade, it.feitas || 0);
  }
  function progressoPedido(pid) {
    var its = itensDe(pid), tot = 0, ok = 0;
    its.forEach(function (it) { tot += it.quantidade; ok += itemFeitas(it); });
    return { tot: tot, ok: ok, pct: tot ? Math.round(ok / tot * 100) : 0 };
  }
  function precoItem(it) { var pu = num(it.preco_unit); if (pu === null) { var p = byId(S.produtos, it.produto_id); pu = p ? num(p.preco) || 0 : 0; } return pu; }
  function valorItens(pid) { return itensDe(pid).reduce(function (a, it) { return a + precoItem(it) * it.quantidade; }, 0); }
  function valorPedido(pd) { return num(pd.valor_combinado) !== null ? num(pd.valor_combinado) : valorItens(pd.id); }
  function wMedia(impId) {
    var e = byId(S.equipamentos, impId); if (e && num(e.potencia_w)) return num(e.potencia_w);
    var ws = impressoras().map(function (x) { return num(x.potencia_w); }).filter(Boolean);
    return ws.length ? ws.reduce(function (a, b) { return a + b; }, 0) / ws.length : 120;
  }
  function custoMaquina(min, impId) { // energia + hora-máquina
    var h = (min || 0) / 60;
    return { energia: wMedia(impId) / 1000 * h * (num(S.cfg.kwh) || 0), maquina: h * (num(S.cfg.hora_maquina) || 0) };
  }
  function custoPrevisto(pd, its, custos) {
    its = its || itensDe(pd.id); custos = custos || custosDe(pd.id);
    var perda = (num(pd.perda_prevista_pct) || 0) / 100;
    var r = { filamento: 0, gramas: 0, energia: 0, maquina: 0, minutos: 0, revenda: 0, extras: 0 };
    its.forEach(function (it) {
      var d = itemDados(it), q2 = it.quantidade || 0;
      if (d.revenda) { r.revenda += (d.custoCompra || 0) * q2; return; }
      var g = (d.gramas || 0) * q2 * (1 + perda);
      r.gramas += g; r.filamento += g * custoGrama(d.material).v;
      var min = (d.tempo || 0) * q2; r.minutos += min;
      var cm = custoMaquina(min, d.produto && d.produto.impressora_padrao); r.energia += cm.energia; r.maquina += cm.maquina;
    });
    custos.forEach(function (c) { r.extras += (num(c.quantidade) || 0) * (num(c.custo_unit) || 0); });
    r.total = r.filamento + r.energia + r.maquina + r.revenda + r.extras;
    return r;
  }
  function custoReal(pd, custos) {
    custos = custos || custosDe(pd.id);
    var imps = S.impressoes.filter(function (x) { return x.pedido_id === pd.id; });
    var perds = S.perdas.filter(function (x) { return x.pedido_id === pd.id; });
    var r = { filamento: 0, gramas: 0, energia: 0, maquina: 0, minutos: 0, perdaG: 0, perdaR: 0, extras: 0, nImp: imps.length, pecas: 0, revenda: 0 };
    imps.forEach(function (x) {
      var f = byId(S.filamentos, x.filamento_id), g = num(x.gramas) || 0, cg = grRolo(f); if (cg === null) cg = custoGrama(f ? f.tipo : null).v;
      r.gramas += g; r.filamento += g * cg; r.minutos += num(x.tempo_min) || 0; r.pecas += x.quantidade;
      var cm = custoMaquina(num(x.tempo_min), x.impressora_id); r.energia += cm.energia; r.maquina += cm.maquina;
    });
    perds.forEach(function (x) {
      r.perdaG += num(x.gramas) || 0; r.perdaR += custoPerda(x); r.minutos += num(x.tempo_min) || 0;
      var cm = custoMaquina(num(x.tempo_min), x.impressora_id); r.perdaR += cm.energia + cm.maquina;
    });
    itensDe(pd.id).forEach(function (it) { var d = itemDados(it); if (d.revenda) r.revenda += (d.custoCompra || 0) * it.quantidade; });
    custos.forEach(function (c) { r.extras += (num(c.quantidade) || 0) * (num(c.custo_unit) || 0); });
    r.total = r.filamento + r.energia + r.maquina + r.perdaR + r.extras + r.revenda;
    return r;
  }
  function previsaoTermino(pd) {
    var falta = 0;
    itensDe(pd.id).forEach(function (it) { var d = itemDados(it); falta += Math.max(0, it.quantidade - itemFeitas(it)) * (d.tempo || 0); });
    var n = impressoras().filter(function (e) { return e.status === 'ativo'; }).length || 1;
    var h = falta / 60 / n;
    return { horas: falta / 60, dias: h ? Math.ceil(h / HORAS_DIA) : 0, n: n };
  }
  function prazoInfo(pd) {
    if (!pd.prazo || pd.status === 'entregue' || pd.status === 'cancelado') return null;
    var hoje = new Date(hojeISO() + 'T00:00:00'), pz = new Date(pd.prazo + 'T00:00:00');
    var d = Math.round((pz - hoje) / 86400000);
    if (d < 0) return { cls: 'p-bad', t: 'Atrasado ' + (-d) + ' dia(s)', d: d };
    if (d === 0) return { cls: 'p-warn', t: 'Prazo hoje', d: d };
    if (d <= 2) return { cls: 'p-warn', t: 'Faltam ' + d + ' dia(s)', d: d };
    return { cls: 'p-mut', t: 'Até ' + dataBR(pd.prazo), d: d };
  }
  function taxaPara(valor, canal, pag) {
    var pl = byId(S.plataformas, canal) || {}, pct = num(pl.taxa_pct) || 0, fixa = num(pl.taxa_fixa) || 0;
    if (!pct && !fixa && /cartão/i.test(pag || '')) return valor * (num(S.cfg.taxa_cartao_pct) || 0) / 100;
    if (!pct && !fixa) return 0;
    return valor * pct / 100 + fixa;
  }
  function nomeMembro(email) { var m = (S.membros || []).filter(function (x) { return String(x.email).toLowerCase() === String(email || '').toLowerCase(); })[0]; return m ? m.nome : (email || '—'); }

  // ------------------------------------------------------------------ quadro (fila)
  function telaPedidos(v) {
    setHeader('Pedidos', '<button class="btn btn-p" id="novo-ped">+ <span class="long">Novo pedido</span></button>');
    if (S.faltaScript06) { v.innerHTML = '<div class="card note">Para usar os Pedidos, rode o <b>script 06</b> no SQL Editor do Supabase e atualize a página (Ctrl+F5).</div>'; $('#novo-ped').disabled = true; return; }
    var busca = S.ui.busca.pedidos || '';
    var verCanc = !!S.ui.pedCanc;
    var lista = S.pedidos.filter(function (p) {
      return combina(['#' + p.numero, p.titulo, p.cliente_nome, p.cliente_cidade, p.observacoes].concat(itensDe(p.id).map(function (i) { return itemDados(i).nome; })), busca);
    });
    var cols = ST_PED.filter(function (s) { return s.v !== 'cancelado' || verCanc; });
    var abertos = pedidosAbertos();
    var atrasados = abertos.filter(function (p) { var pi = prazoInfo(p); return pi && pi.d < 0; }).length;
    var aReceber = abertos.reduce(function (a, p) { return a + (p.quitado ? 0 : valorPedido(p) - (p.sinal_recebido ? num(p.sinal) || 0 : 0)); }, 0);
    var hFila = abertos.filter(function (p) { return ['aprovado', 'fila', 'imprimindo'].indexOf(p.status) >= 0; }).reduce(function (a, p) { return a + previsaoTermino(p).horas; }, 0);
    v.innerHTML = '<div class="stack">' +
      '<div class="grid g4">' + kpi('Pedidos em andamento', abertos.length, atrasados ? atrasados + ' atrasado(s)' : 'nenhum atrasado') +
      kpi('A receber', brl(aReceber), 'dos pedidos em andamento') + kpi('Impressão na fila', fmt(hFila, 0) + ' h', 'aprovados, na fila e imprimindo') +
      kpi('Entregues no mês', S.pedidos.filter(function (p) { return p.status === 'entregue' && noPeriodo(p.entregue_em, { ini: hojeISO(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), fim: hojeISO() }); }).length, '') + '</div>' +
      '<div class="row between wrap">' + buscaHtml('pedidos', 'Pesquisar: cliente, chaveiro, #12…') + '<label class="check small"><input type="checkbox" id="ped-canc"' + (verCanc ? ' checked' : '') + '> Mostrar cancelados</label></div>' +
      '<div class="board">' + cols.map(function (c) {
        var ps = lista.filter(function (p) { return p.status === c.v; }).sort(function (a, b) {
          var pa = a.prazo || '9999', pb = b.prazo || '9999';
          return c.v === 'entregue' ? String(b.entregue_em || '').localeCompare(String(a.entregue_em || '')) : pa.localeCompare(pb) || (a.numero - b.numero);
        });
        return '<section class="col" aria-label="' + esc(c.t) + '"><div class="col-h"><span>' + esc(c.t) + '</span><span class="pill p-mut">' + ps.length + '</span></div>' +
          (ps.length ? ps.map(cartaoPedido).join('') : '<div class="col-vazia">—</div>') + '</section>';
      }).join('') + '</div></div>';
    $('#novo-ped').addEventListener('click', function () { go('#/pedido/novo'); });
    $('#ped-canc').addEventListener('change', function (e) { S.ui.pedCanc = e.target.checked; render(); });
    ligarBusca('pedidos');
    v.onclick = async function (e) {
      var mv = e.target.closest('[data-mover]');
      if (mv) { e.stopPropagation(); var pr = mv.dataset.mover.split(':'); return moverPedido(pr[0], +pr[1]); }
      var c = e.target.closest('[data-ped]'); if (c) go('#/pedido/' + c.dataset.ped);
    };
  }
  function cartaoPedido(p) {
    var pg = progressoPedido(p.id), pi = prazoInfo(p), i = ST_PED.map(function (s) { return s.v; }).indexOf(p.status);
    var prev = ['aprovado', 'fila', 'imprimindo'].indexOf(p.status) >= 0 ? previsaoTermino(p) : null;
    var saldo = valorPedido(p) - (p.sinal_recebido ? num(p.sinal) || 0 : 0);
    return '<article class="ped' + (pi && pi.d < 0 ? ' atrasado' : '') + '" data-ped="' + p.id + '" tabindex="0">' +
      '<div class="row between"><span class="lbl">#' + p.numero + '</span>' + (pi ? '<span class="pill ' + pi.cls + '">' + esc(pi.t) + '</span>' : '') + '</div>' +
      '<div style="font-weight:800;margin-top:4px">' + esc(p.titulo) + '</div>' +
      '<div class="small muted">' + esc([p.cliente_nome, p.cliente_cidade].filter(Boolean).join(' · ') || 'sem cliente') + '</div>' +
      (pg.tot ? '<div class="bar" style="margin-top:8px"><i style="width:' + pg.pct + '%;background:var(--craft)"></i></div><div class="row between small" style="margin-top:4px"><span>' + pg.ok + ' de ' + pg.tot + ' peças</span><span class="muted">' + pg.pct + '%</span></div>' : '') +
      (prev && prev.horas ? '<div class="small muted" style="margin-top:4px">Faltam ~' + fmt(prev.horas, 1) + ' h de impressão (~' + prev.dias + ' dia' + (prev.dias === 1 ? '' : 's') + ' com ' + prev.n + ' impressora' + (prev.n === 1 ? '' : 's') + ')</div>' : '') +
      '<div class="row between" style="margin-top:8px;gap:8px"><span style="font-weight:700;white-space:nowrap">' + brl(valorPedido(p)) + '</span>' + (p.status !== 'cancelado' && !p.quitado && saldo > 0 && p.status !== 'orcamento' ? '<span class="small muted">a receber ' + brl(saldo) + '</span>' : (p.quitado ? '<span class="pill p-ok">quitado</span>' : '')) + '</div>' +
      '<div class="row between" style="margin-top:8px">' +
      (i > 0 && p.status !== 'cancelado' ? '<button type="button" class="icon-btn" data-mover="' + p.id + ':-1" aria-label="Voltar etapa" title="Voltar para ' + esc(stTxt(ST_PED[i - 1].v)) + '">‹</button>' : '<span></span>') +
      (i < 6 ? '<button type="button" class="btn btn-g btn-s" data-mover="' + p.id + ':1" title="Avançar">' + esc(stTxt(ST_PED[i + 1].v)) + ' ›</button>' : '') +
      '</div></article>';
  }
  async function moverPedido(id, dir) {
    var p = byId(S.pedidos, id), ords = ST_PED.map(function (s) { return s.v; });
    var i = ords.indexOf(p.status) + dir; if (i < 0 || i > 6) return;
    await mudarStatus(p, ords[i]);
    render();
  }
  async function mudarStatus(p, novo) {
    var patch = { status: novo };
    if (novo === 'entregue') {
      patch.entregue_em = p.entregue_em || hojeISO();
      if (!p.venda_id) {
        var ok = await confirmar('Pedido entregue! 🎉', 'Registrar o pedido #' + p.numero + ' como venda de ' + brl(valorPedido(p)) + '? Ele entra nos relatórios com o custo real do pedido. (O estoque de pronta entrega não muda.)', 'Registrar venda');
        if (ok) {
          try {
            var its = itensDe(p.id), qtd = its.reduce(function (a, x) { return a + x.quantidade; }, 0) || 1;
            var prods = its.map(function (x) { return x.produto_id; }).filter(Boolean);
            var unico = prods.length === its.length && prods.every(function (x) { return x === prods[0]; }) ? prods[0] : null;
            var cr = custoReal(p), cp = custoPrevisto(p);
            var custoTot = cr.total > 0 ? cr.total : cp.total;
            var valor = valorPedido(p);
            var venda = {
              data: patch.entregue_em, produto_id: unico, quantidade: qtd, plataforma_id: p.canal || 'site', pagamento: p.pagamento || 'Pix',
              valor_total: valor, taxa: Math.round(taxaPara(valor, p.canal || 'site', p.pagamento) * 100) / 100,
              custo_unitario: Math.round(custoTot / qtd * 100) / 100, baixa_estoque: false, baixa_insumos: false,
              cliente: p.cliente_nome || null, pedido_id: p.id, observacoes: 'Pedido #' + p.numero + ' — ' + p.titulo
            };
            var vr = q(await sb.from('vendas').insert(venda).select().single());
            S.vendas.unshift(vr); patch.venda_id = vr.id;
            toast('Venda do pedido registrada ✓');
          } catch (err) { toast('Não registrou a venda: ' + erroMsg(err), true); }
        }
      }
    }
    try {
      var r = q(await sb.from('pedidos').update(patch).eq('id', p.id).select().single());
      S.pedidos = S.pedidos.map(function (x) { return x.id === r.id ? r : x; });
      if (novo !== 'entregue') toast('#' + r.numero + ' → ' + stTxt(novo));
      return r;
    } catch (err) { toast(erroMsg(err), true); }
  }

  // ------------------------------------------------------------------ ficha do pedido
  var F_PED = [
    { k: 'titulo', label: 'Pedido (título)', span: 2, ph: 'ex.: 100 chaveiros personalizados — Igreja' },
    { k: 'cliente_nome', label: 'Cliente' },
    { k: 'cliente_whats', label: 'WhatsApp do cliente', ph: '(41) 9…' },
    { k: 'cliente_cidade', label: 'Cidade / bairro' },
    { k: 'data_pedido', label: 'Data do pedido', type: 'date' },
    { k: 'prazo', label: 'Prazo (opcional)', type: 'date' }
  ];
  function telaPedido(v, id) {
    if (S.faltaScript06) return telaPedidos(v);
    var novo = id === 'novo';
    var orig = novo ? null : byId(S.pedidos, id);
    if (!novo && !orig) { setHeader('Pedido'); v.innerHTML = '<div class="card">Pedido não encontrado. <a href="#/pedidos">Voltar</a></div>'; return; }
    var pd = orig ? JSON.parse(JSON.stringify(orig)) : { id: uid(), titulo: '', status: 'orcamento', data_pedido: hojeISO(), perda_prevista_pct: 10, canal: 'site', pagamento: 'Pix' };
    var its = novo ? [] : JSON.parse(JSON.stringify(itensDe(pd.id)));
    var cus = novo ? [] : JSON.parse(JSON.stringify(custosDe(pd.id)));
    if (novo) its.push({ id: uid(), pedido_id: pd.id, quantidade: 1, personalizacoes: [], feitas: 0 });
    var removIt = [], removCus = [];
    setHeader(novo ? 'Novo pedido' : '#' + pd.numero + ' · ' + pd.titulo,
      (novo ? '' : '<button class="btn btn-g hide-m" id="pd-orc">Orçamento WhatsApp</button><button class="btn btn-g hide-m" id="pd-dup">Duplicar</button>') + '<a class="btn btn-g" href="#/pedidos">Voltar</a>');
    var canalOpts = S.plataformas.map(function (pl) { return '<option value="' + pl.id + '"' + (pl.id === pd.canal ? ' selected' : '') + '>' + esc(pl.nome) + '</option>'; }).join('');
    v.innerHTML = '<form id="pdf" class="stack" novalidate>' +
      '<div class="card"><div class="lbl" style="margin-bottom:8px">Etapa</div><div class="row wrap" style="gap:6px" id="pd-st">' + ST_PED.map(function (s) { return '<button type="button" class="chip' + (s.v === pd.status ? ' on' : '') + '" data-st="' + s.v + '">' + esc(s.t) + '</button>'; }).join('') + '</div>' +
      '<div class="row wrap show-m" style="margin-top:10px">' + (novo ? '' : '<button type="button" class="btn btn-g btn-s" id="pd-orc-m">Orçamento WhatsApp</button><button type="button" class="btn btn-g btn-s" id="pd-dup-m">Duplicar</button>') + '</div></div>' +
      '<div class="card"><h2>Pedido e cliente</h2><div class="grid g4">' + F_PED.map(function (f) { return fieldHtml(f, pd[f.k]); }).join('') +
      '<div class="field"><label for="pd-canal">Chegou por</label><select class="inp" id="pd-canal">' + canalOpts + '</select></div>' +
      '<div class="field" style="grid-column:1 / -1"><label for="pd-obs">Observações</label><textarea class="inp" id="pd-obs" rows="2">' + esc(pd.observacoes || '') + '</textarea></div></div></div>' +
      '<div class="card"><div class="row between wrap"><h2 style="margin:0">Itens</h2><button type="button" class="btn btn-g btn-s" id="add-it">+ Item</button></div><div id="its" class="stack" style="margin-top:12px;gap:12px"></div></div>' +
      '<div class="card"><div class="row between wrap"><h2 style="margin:0">Insumos, frete e outros custos</h2><div class="row wrap" style="gap:6px"><button type="button" class="btn btn-g btn-s" data-addc="insumo">+ Insumo</button><button type="button" class="btn btn-g btn-s" data-addc="frete">+ Frete</button><button type="button" class="btn btn-g btn-s" data-addc="outro">+ Outro</button><button type="button" class="btn btn-g btn-s" id="add-insprod">Puxar insumos dos produtos</button></div></div>' +
      '<div class="small muted" style="margin-top:6px">Argolas, ímãs, embalagens, cards, caixas, frete… Marque “baixar” quando o insumo sair do estoque.</div><div id="cus" style="margin-top:10px"></div></div>' +
      '<div class="card"><div class="row between wrap"><h2 style="margin:0">Custo previsto × real</h2>' + (novo ? '' : '<div class="row wrap" style="gap:6px"><button type="button" class="btn btn-g btn-s" id="pd-imp">+ Impressão deste pedido</button><button type="button" class="btn btn-g btn-s" id="pd-perda">+ Perda deste pedido</button></div>') + '</div>' +
      '<div class="row wrap" style="margin-top:10px"><label class="lbl" for="pd-perda-pct">Perda prevista no orçamento</label><input class="inp" id="pd-perda-pct" inputmode="decimal" value="' + esc(fmtIn(pd.perda_prevista_pct)) + '" style="width:80px"><span class="muted">% do filamento</span></div>' +
      '<div class="grid g2" style="margin-top:12px" id="pd-custos"></div><div id="pd-regs" style="margin-top:12px"></div></div>' +
      '<div class="card"><h2>Dinheiro</h2><div class="grid g4">' +
      '<div class="field"><label for="pd-valor">Valor combinado (R$)</label><input class="inp" id="pd-valor" inputmode="decimal" value="' + esc(fmtIn(pd.valor_combinado)) + '"><div class="hint" id="pd-valor-hint"></div></div>' +
      '<div class="field"><label for="pd-sinal">Sinal (R$)</label><div class="row" style="gap:6px"><input class="inp" id="pd-sinal" inputmode="decimal" value="' + esc(fmtIn(pd.sinal)) + '"><button type="button" class="btn btn-g btn-s" id="pd-50">50%</button></div></div>' +
      '<div class="field"><label for="pd-pag">Pagamento</label><select class="inp" id="pd-pag">' + PAGAMENTOS.map(function (x) { return '<option' + (x === pd.pagamento ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select></div>' +
      '<div class="stack" style="gap:2px;justify-content:flex-end"><label class="check"><input type="checkbox" id="pd-sinal-ok"' + (pd.sinal_recebido ? ' checked' : '') + '> Sinal recebido</label><label class="check"><input type="checkbox" id="pd-quit"' + (pd.quitado ? ' checked' : '') + '> Tudo pago</label></div>' +
      '</div><div class="note" id="pd-saldo" style="margin-top:12px"></div></div>' +
      '<div class="card"><h2>Diário do pedido</h2>' + (novo ? '<div class="muted small">Salve o pedido para começar o diário.</div>' :
        '<div class="stack" style="gap:8px"><textarea class="inp" id="nota-txt" rows="2" placeholder="Como está indo? Dificuldades, decisões, conversas com o cliente… (dá para colar print com Ctrl+V)"></textarea>' +
        '<div class="row between wrap"><div class="row" id="nota-foto-box" style="gap:8px"></div><div class="row" style="gap:6px"><button type="button" class="btn btn-g btn-s" id="nota-foto">📷 Foto</button><input type="file" id="nota-foto-in" accept="image/*" class="hidden"><button type="button" class="btn btn-p btn-s" id="nota-add">Adicionar ao diário</button></div></div></div>' +
        '<div id="notas" class="stack" style="gap:10px;margin-top:14px"></div>') +
      '<div class="field" style="margin-top:14px"><label for="pd-licoes">Lições aprendidas</label><textarea class="inp" id="pd-licoes" rows="3" placeholder="O que fazer diferente no próximo pedido parecido?">' + esc(pd.licoes || '') + '</textarea></div></div>' +
      '<div class="sticky-save">' + (novo ? '' : '<button type="button" class="btn btn-d" id="pd-del" style="margin-right:auto">Excluir</button>') +
      '<a class="btn btn-g" href="#/pedidos">Cancelar</a><button type="submit" class="btn btn-p" id="pd-save">Salvar pedido</button></div></form>';

    var form = $('#pdf');
    // ---- itens
    var prodOpts = function (sel) { return '<option value="">— personalizado (sem produto) —</option>' + S.produtos.filter(function (p) { return p.ativo || p.id === sel; }).slice().sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); }).map(function (p) { return '<option value="' + p.id + '"' + (p.id === sel ? ' selected' : '') + '>' + esc(p.nome) + '</option>'; }).join(''); };
    function drawItens() {
      $('#its').innerHTML = its.map(function (it, i) {
        var d = itemDados(it), p = d.produto, lista = it.personalizacoes || [], feitas = itemFeitas(it);
        return '<div class="item-ped" data-i="' + i + '">' +
          '<div class="grid g4">' +
          '<div class="field" style="grid-column:span 2"><label>Produto</label><select class="inp" data-it="produto_id">' + prodOpts(it.produto_id) + '</select></div>' +
          '<div class="field" style="grid-column:span 2"><label>Descrição</label><input class="inp" data-it="descricao" value="' + esc(it.descricao || '') + '" placeholder="' + esc(p ? p.nome : 'ex.: chaveiro com nome, 5 cm') + '"></div>' +
          '<div class="field"><label>Quantidade</label><input class="inp" data-it="quantidade" inputmode="numeric" value="' + esc(it.quantidade) + '"></div>' +
          '<div class="field"><label>Preço por peça (R$)</label><input class="inp" data-it="preco_unit" inputmode="decimal" value="' + esc(fmtIn(it.preco_unit)) + '" placeholder="' + esc(p && num(p.preco) ? fmtIn(num(p.preco).toFixed(2)) : '') + '"></div>' +
          '<div class="field"><label>Filamento por peça (g)</label><input class="inp" data-it="gramas_unit" inputmode="decimal" value="' + esc(fmtIn(it.gramas_unit)) + '" placeholder="' + esc(p && num(p.gramas) ? fmtIn(num(p.gramas)) : '') + '"></div>' +
          '<div class="field"><label>Tempo por peça (min)</label><input class="inp" data-it="tempo_min_unit" inputmode="numeric" value="' + esc(it.tempo_min_unit == null ? '' : it.tempo_min_unit) + '" placeholder="' + esc(p && p.tempo_min ? p.tempo_min : '') + '"></div>' +
          '<div class="field"><label>Material</label><input class="inp" data-it="material" list="dl-mat" value="' + esc(it.material || '') + '" placeholder="' + esc(p && p.material ? p.material : 'PLA') + '"></div>' +
          '</div>' +
          '<div class="row between wrap" style="margin-top:10px">' +
          (lista.length ? '<div class="small"><b>' + feitas + ' de ' + lista.length + '</b> personalizações prontas</div>'
            : '<div class="row" style="gap:6px"><span class="small">Prontas:</span><button type="button" class="icon-btn" data-it-menos aria-label="Menos uma pronta">−</button><input class="inp" data-it="feitas" inputmode="numeric" value="' + feitas + '" style="width:72px;text-align:center;font-weight:800"><button type="button" class="icon-btn" data-it-mais aria-label="Mais uma pronta">+</button><span class="small muted">de ' + it.quantidade + '</span></div>') +
          '<div class="row" style="gap:6px"><button type="button" class="btn btn-g btn-s" data-it-lista>' + (lista.length ? 'Editar lista' : 'Lista de nomes / personalizações') + '</button>' + (its.length > 1 ? '<button type="button" class="icon-btn" data-it-del aria-label="Remover item">' + BTN_DEL + '</button>' : '') + '</div></div>' +
          '<div class="hidden" data-it-lista-box><label class="lbl">Um por linha (ex.: os 100 nomes)</label><textarea class="inp" data-it-lista-txt rows="5">' + esc(lista.map(function (x) { return x.t; }).join('\n')) + '</textarea><div class="row" style="justify-content:flex-end;margin-top:6px"><button type="button" class="btn btn-p btn-s" data-it-lista-ok>Usar esta lista</button></div></div>' +
          (lista.length ? '<div class="checklist">' + lista.map(function (x, j) { return '<label class="ck' + (x.ok ? ' ok' : '') + '"><input type="checkbox" data-ck="' + j + '"' + (x.ok ? ' checked' : '') + '> ' + esc(x.t) + '</label>'; }).join('') + '</div><div class="row" style="gap:6px;margin-top:6px"><button type="button" class="btn btn-g btn-s" data-ck-todos>Marcar todos</button><button type="button" class="btn btn-g btn-s" data-ck-nenhum>Desmarcar todos</button></div>' : '') +
          '</div>';
      }).join('') + '<datalist id="dl-mat">' + tiposFilamento().map(function (t) { return '<option value="' + esc(t) + '">'; }).join('') + '</datalist>';
    }
    function itemDoEvento(e) { var box = e.target.closest('[data-i]'); return box ? { i: +box.dataset.i, box: box } : null; }
    $('#its').addEventListener('input', function (e) {
      var r = itemDoEvento(e), k = e.target.dataset.it; if (!r || !k) return;
      var it = its[r.i], val = e.target.value;
      if (k === 'quantidade' || k === 'tempo_min_unit' || k === 'feitas') { var n = num(val); it[k] = n === null ? (k === 'quantidade' ? 1 : null) : Math.round(n); if (k === 'feitas') it.feitas = Math.max(0, Math.min(it.quantidade, it.feitas || 0)); }
      else if (k === 'preco_unit' || k === 'gramas_unit') it[k] = num(val);
      else it[k] = val.trim() || null;
      recalc();
    });
    $('#its').addEventListener('change', function (e) {
      var r = itemDoEvento(e); if (!r) return;
      if (e.target.dataset.it === 'produto_id') { its[r.i].produto_id = e.target.value || null; drawItens(); recalc(); }
      if (e.target.dataset.ck !== undefined) { var l = its[r.i].personalizacoes; l[+e.target.dataset.ck].ok = e.target.checked; e.target.closest('.ck').classList.toggle('ok', e.target.checked); drawItensProgresso(r.i); recalc(); }
    });
    function drawItensProgresso() { drawItens(); }
    $('#its').addEventListener('click', function (e) {
      var r = itemDoEvento(e); if (!r) return;
      var it = its[r.i];
      if (e.target.closest('[data-it-mais]')) { it.feitas = Math.min(it.quantidade, (it.feitas || 0) + 1); drawItens(); recalc(); }
      if (e.target.closest('[data-it-menos]')) { it.feitas = Math.max(0, (it.feitas || 0) - 1); drawItens(); recalc(); }
      if (e.target.closest('[data-it-del]')) { removIt.push(it.id); its.splice(r.i, 1); drawItens(); recalc(); }
      if (e.target.closest('[data-it-lista]')) { $('[data-it-lista-box]', r.box).classList.toggle('hidden'); $('[data-it-lista-txt]', r.box).focus(); }
      if (e.target.closest('[data-it-lista-ok]')) {
        var antes = {}; (it.personalizacoes || []).forEach(function (x) { antes[x.t] = x.ok; });
        it.personalizacoes = $('[data-it-lista-txt]', r.box).value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean).map(function (t) { return { t: t, ok: !!antes[t] }; });
        if (it.personalizacoes.length) it.quantidade = Math.max(it.quantidade, it.personalizacoes.length);
        drawItens(); recalc();
      }
      if (e.target.closest('[data-ck-todos]') || e.target.closest('[data-ck-nenhum]')) { var on = !!e.target.closest('[data-ck-todos]'); (it.personalizacoes || []).forEach(function (x) { x.ok = on; }); drawItens(); recalc(); }
    });
    $('#add-it').addEventListener('click', function () { its.push({ id: uid(), pedido_id: pd.id, quantidade: 1, personalizacoes: [], feitas: 0, ordem: its.length }); drawItens(); recalc(); });

    // ---- custos
    var insOpts = function (sel) { return '<option value="">— escolher —</option>' + S.insumos.map(function (i) { return '<option value="' + i.id + '"' + (i.id === sel ? ' selected' : '') + '>' + esc(i.nome) + ' (' + brl(centavoAcima(num(i.custo_unitario))) + ' · ' + fmt(num(i.estoque) || 0) + ' em estoque)</option>'; }).join(''); };
    function drawCustos() {
      if (!cus.length) { $('#cus').innerHTML = '<div class="small muted">Nada ainda.</div>'; return; }
      $('#cus').innerHTML = '<div class="stack" style="gap:8px">' + cus.map(function (c, i) {
        var tot = (num(c.quantidade) || 0) * (num(c.custo_unit) || 0);
        return '<div class="custo-row" data-c="' + i + '"><span class="pill ' + (c.tipo === 'insumo' ? 'p-info' : c.tipo === 'frete' ? 'p-warn' : 'p-mut') + '">' + (c.tipo === 'insumo' ? 'Insumo' : c.tipo === 'frete' ? 'Frete' : 'Outro') + '</span>' +
          (c.tipo === 'insumo' ? '<select class="inp" data-c-k="insumo_id" aria-label="Insumo">' + insOpts(c.insumo_id) + '</select>' : '<input class="inp" data-c-k="descricao" value="' + esc(c.descricao || '') + '" placeholder="' + (c.tipo === 'frete' ? 'ex.: Uber Flash até o cliente' : 'ex.: caixa de papelão, cola') + '" aria-label="Descrição">') +
          '<input class="inp" data-c-k="quantidade" inputmode="decimal" value="' + esc(fmtIn(c.quantidade)) + '" aria-label="Quantidade" title="Quantidade">' +
          '<input class="inp" data-c-k="custo_unit" inputmode="decimal" value="' + esc(fmtIn(c.custo_unit)) + '" aria-label="Custo unitário" title="Custo unitário (R$)">' +
          '<span class="num" style="font-weight:700">' + brl(tot) + '</span>' +
          (c.tipo === 'insumo' ? '<label class="check small" title="Tirar do estoque de insumos"><input type="checkbox" data-c-k="baixado"' + (c.baixado ? ' checked' : '') + '> baixar</label>' : '<span></span>') +
          '<button type="button" class="icon-btn" data-c-del aria-label="Remover custo">' + BTN_DEL + '</button></div>';
      }).join('') + '</div>';
    }
    $('#cus').addEventListener('input', function (e) {
      var row = e.target.closest('[data-c]'), k = e.target.dataset.cK; if (!row || !k || k === 'baixado' || k === 'insumo_id') return;
      var c = cus[+row.dataset.c];
      if (k === 'descricao') c.descricao = e.target.value.trim() || null; else c[k] = num(e.target.value) || 0;
      row.querySelector('.num').textContent = brl((num(c.quantidade) || 0) * (num(c.custo_unit) || 0));
      recalc();
    });
    $('#cus').addEventListener('change', function (e) {
      var row = e.target.closest('[data-c]'), k = e.target.dataset.cK; if (!row || !k) return;
      var c = cus[+row.dataset.c];
      if (k === 'baixado') c.baixado = e.target.checked;
      if (k === 'insumo_id') { c.insumo_id = e.target.value || null; var ins = byId(S.insumos, c.insumo_id); if (ins) { c.custo_unit = centavoAcima(num(ins.custo_unitario)) || 0; c.descricao = ins.nome; } drawCustos(); }
      recalc();
    });
    $('#cus').addEventListener('click', function (e) { var row = e.target.closest('[data-c]'); if (row && e.target.closest('[data-c-del]')) { var c = cus[+row.dataset.c]; if (c.criado_em) removCus.push(c.id); cus.splice(+row.dataset.c, 1); drawCustos(); recalc(); } });
    $$('[data-addc]').forEach(function (b) { b.addEventListener('click', function () { cus.push({ id: uid(), pedido_id: pd.id, tipo: b.dataset.addc, quantidade: 1, custo_unit: 0, baixado: false }); drawCustos(); recalc(); }); });
    $('#add-insprod').addEventListener('click', function () {
      var n = 0;
      its.forEach(function (it) {
        if (!it.produto_id) return;
        S.prodInsumos.filter(function (x) { return x.produto_id === it.produto_id; }).forEach(function (x) {
          var ins = byId(S.insumos, x.insumo_id); if (!ins) return;
          var qt = (num(x.quantidade) || 1) * it.quantidade;
          var ja = cus.filter(function (c) { return c.tipo === 'insumo' && c.insumo_id === ins.id; })[0];
          if (ja) ja.quantidade = (num(ja.quantidade) || 0) + qt; else cus.push({ id: uid(), pedido_id: pd.id, tipo: 'insumo', insumo_id: ins.id, descricao: ins.nome, quantidade: qt, custo_unit: centavoAcima(num(ins.custo_unitario)) || 0, baixado: false });
          n++;
        });
      });
      drawCustos(); recalc();
      toast(n ? 'Insumos dos produtos adicionados' : 'Os produtos dos itens não têm insumos cadastrados', !n);
    });

    // ---- cálculo ao vivo
    function lerPd() {
      var o = readFields(F_PED, form);
      o.canal = $('#pd-canal').value || null; o.observacoes = $('#pd-obs').value.trim() || null;
      o.perda_prevista_pct = num($('#pd-perda-pct').value); if (o.perda_prevista_pct === null) o.perda_prevista_pct = 10;
      o.valor_combinado = num($('#pd-valor').value); o.sinal = num($('#pd-sinal').value);
      o.pagamento = $('#pd-pag').value; o.sinal_recebido = $('#pd-sinal-ok').checked; o.quitado = $('#pd-quit').checked;
      o.licoes = $('#pd-licoes').value.trim() || null; o.status = pd.status; o.id = pd.id;
      o.data_pedido = o.data_pedido || hojeISO();
      return o;
    }
    function recalc() {
      var o = lerPd(); o.numero = pd.numero;
      var soma = its.reduce(function (a, it) { var pp = num(it.preco_unit); if (pp === null) { var p = byId(S.produtos, it.produto_id); pp = p ? num(p.preco) || 0 : 0; } return a + pp * it.quantidade; }, 0);
      var valor = o.valor_combinado !== null ? o.valor_combinado : soma;
      $('#pd-valor').placeholder = soma ? fmtIn(soma.toFixed(2)) : '';
      $('#pd-valor-hint').textContent = o.valor_combinado !== null ? (soma ? 'soma dos itens: ' + brl(soma) : '') : 'vazio = soma dos itens (' + brl(soma) + ')';
      var cp = custoPrevisto(o, its, cus), cr = custoReal(o, cus);
      var margem = num(S.cfg.margem_pct); if (margem === null) margem = 200;
      var taxa = taxaPara(valor, o.canal, o.pagamento);
      var lin = function (t, v, forte) { return '<div class="row between' + (forte ? ' tot' : '') + '"><span>' + t + '</span><span>' + brl(v) + '</span></div>'; };
      $('#pd-custos').innerHTML =
        '<div class="cost-box"><div class="lbl">Previsto (orçamento)</div>' +
        lin('Filamento (' + fmt(cp.gramas, 0) + ' g com ' + fmt(o.perda_prevista_pct) + '% de perda)', cp.filamento) + lin('Energia (' + fmt(cp.minutos / 60, 1) + ' h)', cp.energia) + lin('Hora-máquina', cp.maquina) +
        (cp.revenda ? lin('Produtos de revenda', cp.revenda) : '') + lin('Insumos, frete e outros', cp.extras) + lin('Custo previsto', cp.total, true) +
        '<div class="row between"><span>Preço sugerido (margem ' + fmt(margem) + '%)</span><b>' + brl(cp.total * (1 + margem / 100)) + '</b></div>' +
        '<div class="row between"><span>Lucro previsto' + (taxa ? ' (− taxa ' + brl(taxa) + ')' : '') + '</span><b style="color:' + (valor - cp.total - taxa < 0 ? 'var(--bad)' : 'var(--ok)') + '">' + brl(valor - cp.total - taxa) + '</b></div></div>' +
        '<div class="cost-box"><div class="lbl">Real (o que já foi registrado)</div>' +
        lin('Filamento (' + fmt(cr.gramas, 0) + ' g em ' + cr.nImp + ' impressão(ões))', cr.filamento) + lin('Energia + hora-máquina (' + fmt(cr.minutos / 60, 1) + ' h)', cr.energia + cr.maquina) +
        lin('Perdas (' + fmt(cr.perdaG, 0) + ' g' + (cr.gramas + cr.perdaG ? ' · ' + fmt(cr.perdaG / (cr.gramas + cr.perdaG) * 100, 0) + '% do filamento' : '') + ')', cr.perdaR) +
        (cr.revenda ? lin('Produtos de revenda', cr.revenda) : '') + lin('Insumos, frete e outros', cr.extras) + lin('Custo real até agora', cr.total, true) +
        '<div class="row between"><span>Lucro real' + (taxa ? ' (− taxa)' : '') + '</span><b style="color:' + (valor - cr.total - taxa < 0 ? 'var(--bad)' : 'var(--ok)') + '">' + brl(valor - cr.total - taxa) + '</b></div>' +
        (cp.total ? '<div class="hint">Real × previsto: ' + fmt(cr.total / cp.total * 100, 0) + '% do custo previsto já foi gasto.</div>' : '') + '</div>';
      var imps = S.impressoes.filter(function (x) { return x.pedido_id === pd.id; }), perds = S.perdas.filter(function (x) { return x.pedido_id === pd.id; });
      $('#pd-regs').innerHTML = (imps.length || perds.length) ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Data</th><th>Registro</th><th class="num">Qtd</th><th class="num hide-m">Tempo</th><th class="num">Filamento</th></tr></thead><tbody>' +
        imps.map(function (x) { return '<tr><td>' + dataBR(x.data) + '</td><td>Impressão · ' + esc(nomeEquip(x.impressora_id)) + '</td><td class="num">' + x.quantidade + '</td><td class="num hide-m">' + horas(x.tempo_min) + '</td><td class="num">' + fmt(num(x.gramas) || 0, 0) + ' g</td></tr>'; }).join('') +
        perds.map(function (x) { return '<tr><td>' + dataBR(x.data) + '</td><td><span class="pill p-warn">Perda</span> ' + esc(x.motivo || '') + '</td><td class="num">—</td><td class="num hide-m">' + horas(x.tempo_min) + '</td><td class="num">' + fmt(num(x.gramas) || 0, 0) + ' g</td></tr>'; }).join('') +
        '</tbody></table></div><div class="hint" style="margin-top:6px">Para corrigir ou excluir um registro, use a aba Produção e perdas.</div>' : (novo ? '' : '<div class="small muted">Nenhuma impressão ou perda ligada a este pedido ainda.</div>');
      var sinalV = o.sinal || 0, recebido = o.quitado ? valor : (o.sinal_recebido ? sinalV : 0);
      $('#pd-saldo').innerHTML = 'Valor <b>' + brl(valor) + '</b> · recebido <b>' + brl(recebido) + '</b> · ' + (o.quitado ? '<span class="pill p-ok">quitado</span>' : 'falta receber <b>' + brl(Math.max(0, valor - recebido)) + '</b>');
    }
    drawItens(); drawCustos(); recalc();
    form.addEventListener('input', function () { dirty = true; recalc(); });
    form.addEventListener('change', function () { dirty = true; recalc(); });
    $('#pd-50').addEventListener('click', function () { var o = lerPd(); var soma = num($('#pd-valor').value); if (soma === null) soma = num(String($('#pd-valor').placeholder)) || 0; $('#pd-sinal').value = fmtIn((soma / 2).toFixed(2)); dirty = true; recalc(); });
    $('#pd-st').addEventListener('click', async function (e) {
      var b = e.target.closest('[data-st]'); if (!b) return;
      if (novo) { pd.status = b.dataset.st; $$('#pd-st .chip').forEach(function (c) { c.classList.toggle('on', c === b); }); return; }
      if (dirty) { var ok0 = await salvar(true); if (!ok0) return; }
      var r = await mudarStatus(byId(S.pedidos, pd.id), b.dataset.st);
      if (r) { dirty = false; render(); }
    });

    // ---- salvar
    async function salvar(silencioso) {
      var o = lerPd();
      if (!o.titulo) { toast('Dê um nome ao pedido (ex.: 100 chaveiros — Maria)', true); $('[data-k="titulo"]').focus(); return false; }
      var btn = $('#pd-save'); btn.disabled = true;
      try {
        if (novo) delete o.numero;
        var r = q(await sb.from('pedidos').upsert(o).select().single());
        var itRows = its.map(function (it, i) {
          return { id: it.id, pedido_id: r.id, produto_id: it.produto_id || null, descricao: it.descricao || null, quantidade: Math.max(1, it.quantidade || 1), preco_unit: num(it.preco_unit), material: it.material || null, gramas_unit: num(it.gramas_unit), tempo_min_unit: it.tempo_min_unit == null ? null : it.tempo_min_unit, personalizacoes: it.personalizacoes || [], feitas: it.feitas || 0, ordem: i };
        });
        if (removIt.length) q(await sb.from('pedido_itens').delete().in('id', removIt));
        var itSalvos = itRows.length ? q(await sb.from('pedido_itens').upsert(itRows).select()) : [];
        var cuRows = cus.map(function (c) { return { id: c.id, pedido_id: r.id, tipo: c.tipo, insumo_id: c.insumo_id || null, descricao: c.descricao || null, quantidade: num(c.quantidade) || 0, custo_unit: num(c.custo_unit) || 0, baixado: !!c.baixado }; });
        if (removCus.length) q(await sb.from('pedido_custos').delete().in('id', removCus));
        var cuSalvos = cuRows.length ? q(await sb.from('pedido_custos').upsert(cuRows).select()) : [];
        S.pedidos = S.pedidos.filter(function (x) { return x.id !== r.id; }).concat([r]);
        S.pedidoItens = S.pedidoItens.filter(function (x) { return x.pedido_id !== r.id; }).concat(itSalvos || []);
        S.pedidoCustos = S.pedidoCustos.filter(function (x) { return x.pedido_id !== r.id; }).concat(cuSalvos || []);
        removIt = []; removCus = [];
        await recarregar(['insumos']);
        dirty = false; btn.disabled = false;
        if (!silencioso) toast('Pedido salvo ✓');
        if (novo) go('#/pedido/' + r.id); else if (!silencioso) render();
        return true;
      } catch (err) { btn.disabled = false; toast('Não salvou: ' + erroMsg(err), true); return false; }
    }
    form.addEventListener('submit', function (e) { e.preventDefault(); salvar(false); });
    if ($('#pd-del')) $('#pd-del').addEventListener('click', async function () {
      if (!(await confirmar('Excluir pedido #' + pd.numero + '?', 'Some o pedido, os itens, os custos e o diário. As impressões e perdas continuam registradas (só deixam de estar ligadas a ele). Os insumos marcados como “baixados” voltam ao estoque.', 'Excluir', true))) return;
      try { q(await sb.from('pedidos').delete().eq('id', pd.id)); S.pedidos = S.pedidos.filter(function (x) { return x.id !== pd.id; }); S.pedidoItens = S.pedidoItens.filter(function (x) { return x.pedido_id !== pd.id; }); S.pedidoCustos = S.pedidoCustos.filter(function (x) { return x.pedido_id !== pd.id; }); S.impressoes.forEach(function (x) { if (x.pedido_id === pd.id) x.pedido_id = null; }); S.perdas.forEach(function (x) { if (x.pedido_id === pd.id) x.pedido_id = null; }); await recarregar(['insumos']); dirty = false; toast('Pedido excluído'); go('#/pedidos'); }
      catch (err) { toast(erroMsg(err), true); }
    });
    var comSalvar = function (fn) { return async function () { if (dirty) { if (!(await salvar(true))) return; } fn(); }; };
    ['#pd-imp'].forEach(function (s) { if ($(s)) $(s).addEventListener('click', comSalvar(function () { registrarImpressao(null, pd.id); })); });
    if ($('#pd-perda')) $('#pd-perda').addEventListener('click', comSalvar(function () { registrarPerda(pd.id); }));
    ['#pd-orc', '#pd-orc-m'].forEach(function (s) { if ($(s)) $(s).addEventListener('click', comSalvar(function () { orcamentoWhats(byId(S.pedidos, pd.id)); })); });
    ['#pd-dup', '#pd-dup-m'].forEach(function (s) { if ($(s)) $(s).addEventListener('click', comSalvar(function () { duplicarPedido(byId(S.pedidos, pd.id)); })); });

    // ---- diário
    if (!novo) {
      var notaFoto = { foto: null };
      var drawNotas = function () {
        var ns = notasDe(pd.id);
        $('#notas').innerHTML = ns.length ? ns.map(function (n) {
          return '<div class="nota"><div class="row between"><span class="small"><b>' + esc(nomeMembro(n.autor)) + '</b> · ' + esc(new Date(n.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })) + '</span>' +
            '<button type="button" class="icon-btn" data-nota-del="' + n.id + '" aria-label="Apagar anotação" style="width:32px;height:32px">' + BTN_DEL + '</button></div>' +
            (n.texto ? '<div style="white-space:pre-line;margin-top:4px">' + esc(n.texto) + '</div>' : '') +
            (n.foto ? '<img class="zoomable nota-foto" src="' + esc(n.foto) + '" data-zoom="' + esc(JSON.stringify([n.foto])) + '" alt="Foto da anotação" loading="lazy">' : '') + '</div>';
        }).join('') : '<div class="small muted">Nenhuma anotação ainda.</div>';
      };
      var drawNotaFoto = function () { $('#nota-foto-box').innerHTML = notaFoto.foto ? '<img src="' + esc(notaFoto.foto) + '" alt="Foto anexada" style="width:56px;height:56px;object-fit:cover;border-radius:8px"><button type="button" class="btn btn-g btn-s" id="nota-foto-x">Tirar foto</button>' : ''; };
      var anexar = async function (files) {
        $('#nota-foto-box').innerHTML = '<span class="small muted">Enviando foto…</span>';
        try { notaFoto.foto = await enviarFoto(await comprimir(files[0], 1400), 'pedidos/' + pd.id); } catch (err) { toast('Erro ao enviar foto: ' + erroMsg(err), true); }
        drawNotaFoto();
      };
      pasteAlvo.pagina = anexar;
      soltarImagens($('#nota-txt'), anexar);
      $('#nota-foto').addEventListener('click', function () { $('#nota-foto-in').click(); });
      $('#nota-foto-in').addEventListener('change', function (e) { var f = Array.prototype.slice.call(e.target.files || []); e.target.value = ''; if (f.length) anexar(f); });
      $('#nota-foto-box').addEventListener('click', function (e) { if (e.target.id === 'nota-foto-x') { notaFoto.foto = null; drawNotaFoto(); } });
      $('#nota-add').addEventListener('click', async function () {
        var t = $('#nota-txt').value.trim();
        if (!t && !notaFoto.foto) return toast('Escreva algo ou anexe uma foto', true);
        try {
          var n = q(await sb.from('pedido_notas').insert({ pedido_id: pd.id, texto: t || null, foto: notaFoto.foto }).select().single());
          S.pedidoNotas.push(n); $('#nota-txt').value = ''; notaFoto.foto = null; drawNotaFoto(); drawNotas(); toast('Anotação adicionada ✓');
        } catch (err) { toast(erroMsg(err), true); }
      });
      $('#notas').addEventListener('click', async function (e) {
        var b = e.target.closest('[data-nota-del]'); if (!b) return;
        if (!(await confirmar('Apagar anotação?', 'Ela sai do diário do pedido.', 'Apagar', true))) return;
        try { q(await sb.from('pedido_notas').delete().eq('id', b.dataset.notaDel)); S.pedidoNotas = S.pedidoNotas.filter(function (x) { return x.id !== b.dataset.notaDel; }); drawNotas(); } catch (err) { toast(erroMsg(err), true); }
      });
      drawNotas();
    }
  }

  // ------------------------------------------------------------------ orçamento para WhatsApp
  function textoOrcamento(pd) {
    var its = itensDe(pd.id), cfg = S.cfg || {};
    var linhas = its.map(function (it) {
      var d = itemDados(it), pu = num(it.preco_unit); if (pu === null && d.produto) pu = num(d.produto.preco);
      return '• ' + it.quantidade + '× ' + d.nome + (pu ? ' — ' + brl(pu) + ' cada = ' + brl(pu * it.quantidade) : '');
    });
    var valor = valorPedido(pd), sinal = num(pd.sinal);
    var t = 'Olá' + (pd.cliente_nome ? ', ' + pd.cliente_nome.split(' ')[0] : '') + '! 😊\nSegue o orçamento da *CristART 3D*:\n\n' + linhas.join('\n') +
      '\n\n*Total: ' + brl(valor) + '*' +
      (sinal ? '\nSinal de ' + brl(sinal) + ' para começar a produção · restante na entrega' : '') +
      '\nPagamento: ' + (pd.pagamento || 'Pix') +
      (pd.prazo ? '\nPrevisão de entrega: ' + dataBR(pd.prazo) : '') +
      '\nRetirada no ' + (cfg.local_retirada || 'Xaxim, Curitiba') + ' ou ' + (cfg.formas_entrega || 'entrega a combinar') + '.' +
      '\n\nQualquer dúvida, é só chamar! 🙌';
    return t;
  }
  function orcamentoWhats(pd) {
    var t = textoOrcamento(pd);
    var tel = String(pd.cliente_whats || '').replace(/\D/g, ''); if (tel && tel.length <= 11) tel = '55' + tel;
    var m = modal('<div class="row between"><h2>Orçamento para WhatsApp</h2><button class="btn btn-g btn-s" data-x="close">Fechar</button></div>' +
      '<div class="field"><label for="orc-txt">Texto (dá para editar antes de mandar)</label><textarea class="inp" id="orc-txt" rows="14">' + esc(t) + '</textarea></div>' +
      '<div class="row wrap" style="justify-content:flex-end"><button class="btn btn-g" data-x="copiar">Copiar</button>' + (tel ? '<a class="btn btn-p" id="orc-wa" target="_blank" rel="noopener">Abrir no WhatsApp ' + ICON.ext + '</a>' : '<span class="small muted">Coloque o WhatsApp do cliente no pedido para abrir direto.</span>') + '</div>', { noFocus: true });
    var link = function () { var a = $('#orc-wa', m); if (a) a.href = 'https://wa.me/' + tel + '?text=' + encodeURIComponent($('#orc-txt', m).value); };
    $('#orc-txt', m).addEventListener('input', link); link();
    m.addEventListener('click', async function (e) {
      var b = e.target.closest('[data-x]'); if (!b) return;
      if (b.dataset.x === 'close') return closeModal();
      if (b.dataset.x === 'copiar') {
        try { await navigator.clipboard.writeText($('#orc-txt', m).value); toast('Orçamento copiado ✓'); }
        catch (x) { $('#orc-txt', m).select(); document.execCommand('copy'); toast('Orçamento copiado ✓'); }
      }
    });
  }

  // ------------------------------------------------------------------ duplicar
  async function duplicarPedido(pd) {
    if (!(await confirmar('Duplicar pedido #' + pd.numero + '?', 'Cria um novo pedido em “Orçamento” com os mesmos itens e custos (sem o progresso, os pagamentos e o diário).', 'Duplicar'))) return;
    try {
      var novo = { titulo: pd.titulo + ' (cópia)', cliente_nome: pd.cliente_nome, cliente_whats: pd.cliente_whats, cliente_cidade: pd.cliente_cidade, canal: pd.canal, status: 'orcamento', data_pedido: hojeISO(), valor_combinado: pd.valor_combinado, sinal: pd.sinal, pagamento: pd.pagamento, perda_prevista_pct: pd.perda_prevista_pct, observacoes: pd.observacoes };
      var r = q(await sb.from('pedidos').insert(novo).select().single());
      var its = itensDe(pd.id).map(function (it) { return { pedido_id: r.id, produto_id: it.produto_id, descricao: it.descricao, quantidade: it.quantidade, preco_unit: it.preco_unit, material: it.material, gramas_unit: it.gramas_unit, tempo_min_unit: it.tempo_min_unit, personalizacoes: (it.personalizacoes || []).map(function (x) { return { t: x.t, ok: false }; }), feitas: 0, ordem: it.ordem }; });
      var cs = custosDe(pd.id).map(function (c) { return { pedido_id: r.id, tipo: c.tipo, insumo_id: c.insumo_id, descricao: c.descricao, quantidade: c.quantidade, custo_unit: c.custo_unit, baixado: false }; });
      var si = its.length ? q(await sb.from('pedido_itens').insert(its).select()) : [];
      var sc = cs.length ? q(await sb.from('pedido_custos').insert(cs).select()) : [];
      S.pedidos.push(r); S.pedidoItens = S.pedidoItens.concat(si || []); S.pedidoCustos = S.pedidoCustos.concat(sc || []);
      toast('Pedido duplicado: #' + r.numero + ' ✓');
      go('#/pedido/' + r.id);
    } catch (err) { toast(erroMsg(err), true); }
  }

  // ================================================================== ANÚNCIOS COM IA (etapa 3)
  var LIM_TITULO = { ml: 60, shopee: 100, tiktok: 100, olx: 70, facebook: 80, instagram: 60, site: 80 };
  var LINK_ANUNCIAR = {
    site: 'https://web.whatsapp.com/', shopee: 'https://seller.shopee.com.br/portal/product/new', ml: 'https://www.mercadolivre.com.br/anunciar',
    tiktok: 'https://seller-br.tiktok.com/', facebook: 'https://www.facebook.com/marketplace/create/item',
    olx: 'https://www.olx.com.br/', instagram: 'https://www.instagram.com/'
  };
  var MOTORES = [
    { v: 'gemini', t: 'Gemini (grátis)' }, { v: 'manual', t: 'Manual (modelo pronto, sem IA)' },
    { v: 'haiku', t: 'Claude Haiku — em breve', off: true }, { v: 'sonnet', t: 'Claude Sonnet — em breve', off: true }, { v: 'gpt', t: 'ChatGPT — em breve', off: true }
  ];
  function falta08() { return !S.cfg || !('regras_anuncio' in S.cfg); }
  function platsAnuncio() { return S.plataformas.filter(function (pl) { return pl.ativa; }).map(function (pl) { return pl.id === 'site' ? Object.assign({}, pl, { nome: 'Site e WhatsApp' }) : pl; }); }
  function platsVerIds() { try { var v = JSON.parse(localStorage.getItem('cristart_plats_ver') || 'null'); return Array.isArray(v) ? v : null; } catch (e) { return null; } }
  function platsVisiveis() { var ids = S.ui.platsVer || platsVerIds(); var l = platsAnuncio(); return ids ? l.filter(function (pl) { return ids.indexOf(pl.id) >= 0; }) : l; }
  function guardarPlatsVer(ids) { S.ui.platsVer = ids; try { localStorage.setItem('cristart_plats_ver', JSON.stringify(ids)); } catch (e) { } }
  function adDe(pid, pl) { return S.anuncios.filter(function (a) { return a.produto_id === pid && a.plataforma_id === pl && !a.arquivado; })[0] || null; }
  function precoNa(p, pl) { var a = adDe(p.id, pl.id); if (a && num(a.preco)) return num(a.preco); var v = precoPlataforma(num(p.preco), pl); return v || num(p.preco) || null; }
  function dadosProdutoIA(p) {
    var o = { nome: p.nome, categoria: p.categoria, descricao_breve: p.descricao_breve, descricao: p.descricao, medidas: p.medidas, peso_g: num(p.peso_g), tipo: p.tipo_produto === 'revenda' ? 'produto de revenda' : 'produzido em impressão 3D', pronta_entrega: p.estoque > 0 ? p.estoque + ' unidade(s) em estoque' : 'sob encomenda', preco_pix_site: num(p.preco) };
    (p.opcoes || []).forEach(function (op) { if (op && op.name && op.choices && op.choices.length) o['opções de ' + op.name] = op.choices.join(', '); });
    Object.keys(o).forEach(function (k) { if (o[k] === null || o[k] === undefined || o[k] === '') delete o[k]; });
    return o;
  }
  var ESTILO_PLAT = {
    shopee: 'Shopee: siga o ANÚNCIO MODELO bem de perto (mesma estrutura, blocos e emojis). Título forte para a busca, palavra principal no começo, sem emojis e sem CAIXA ALTA inteira. Contato só pelo chat da Shopee.',
    ml: 'Mercado Livre: mesma estrutura de blocos do ANÚNCIO MODELO, mas título técnico e direto (produto + característica + medida/quantidade), SEM emojis no título, sem "promoção" ou "frete grátis". Na descrição use texto simples, títulos dos blocos em MAIÚSCULAS e tópicos com hífen (no lugar dos emojis). Contato só pelas perguntas do Mercado Livre.',
    tiktok: 'TikTok Shop: estrutura do ANÚNCIO MODELO em versão mais curta e animada, palavra principal no começo do título. Contato só pelo chat do TikTok.',
    facebook: 'Facebook Marketplace: mesmos blocos do ANÚNCIO MODELO, tom conversado e próximo. Troque o bloco de envio por retirada e entrega em Curitiba (dados de CONTATO) e termine chamando no WhatsApp. Pode citar o preço.',
    olx: 'OLX: título objetivo (o que é + destaque). Mesmos blocos do ANÚNCIO MODELO de forma enxuta; troque o bloco de envio por retirada e entrega em Curitiba e WhatsApp (dados de CONTATO). Pode citar o preço.',
    instagram: 'Instagram: legenda de post/reels. Primeira linha que prende a atenção, 2 a 4 tópicos curtos com emojis tirados dos DESTAQUES, chamada para chamar no direct ou WhatsApp, e de 8 a 15 hashtags em português no campo palavras_chave (sem #). O título é só uma frase curta de capa.',
    site: 'Site e WhatsApp: este texto vira a descrição do produto no nosso site e também é mandado no WhatsApp. Use os mesmos blocos do ANÚNCIO MODELO, tom amigável, SEM repetir o preço na descrição. No lugar do bloco de envio, diga que dá para retirar em Curitiba ou receber por entrega/envio, e termine convidando a chamar no WhatsApp (sem escrever o número).'
  };
  function montarPrompt(p, plats, extra) {
    var cfg = S.cfg || {};
    return [
      'Você é redator de anúncios de e-commerce brasileiro da CristART 3D, de Curitiba-PR, que vende peças produzidas em impressão 3D (decoração, utilidades, cozinha, gamer, brinquedos, chaveiros).',
      'Escreva em português do Brasil, natural e vendedor, sem exageros.',
      '',
      'PROIBIDO (vale para todas as plataformas):',
      '- Inventar características que não estejam nos dados ou nas fotos. Se não souber medida, quantidade ou peso, não invente números.',
      '- Citar o nome do material ou do filamento (PLA, PETG, ABS, resina etc.). No máximo diga "material resistente" ou "plástico resistente".',
      '- Dizer que é empresa ou negócio familiar, ou que o acabamento é feito à mão / artesanal.',
      '- Oferecer personalização de cores, nomes ou modelos, a menos que o PEDIDO EXTRA peça isso.',
      '- Dizer que é seguro para alimentos ou atóxico, a menos que os dados do produto digam.',
      '- Nas plataformas marcadas "SEM contato externo": telefone, WhatsApp, Instagram, links ou pedir contato fora da plataforma.',
      '',
      'ANÚNCIO MODELO (feito pela equipe; copie a ESTRUTURA, o tom e o tipo de bloco, adapte o conteúdo ao produto e pule blocos que não fazem sentido, como "COMO USAR" num enfeite):',
      '<<<', String(cfg.modelo_anuncio || '').trim() || '(sem modelo)', '>>>',
      '',
      'REGRAS DA LOJA (inclua em todos os anúncios, adaptando ao estilo de cada plataforma):',
      String(cfg.regras_anuncio || '').trim() || '(nenhuma)',
      '',
      'PRODUTO:', JSON.stringify(dadosProdutoIA(p), null, 2),
      '',
      'CONTATO (só para plataformas que permitem contato): ' + JSON.stringify({ whatsapp: cfg.whatsapp, retirada: cfg.local_retirada, entrega: cfg.formas_entrega, cidade: 'Curitiba-PR' }),
      extra ? '\nPEDIDO EXTRA PARA ESTA VEZ: ' + extra : '',
      '',
      'PLATAFORMAS (um anúncio para cada; respeite o limite de caracteres do título):',
      plats.map(function (pl) {
        var pr = precoNa(p, pl);
        return '- id "' + pl.id + '" (' + pl.nome + ') · título com no máximo ' + (LIM_TITULO[pl.id] || 80) + ' caracteres · ' + (pl.permite_contato ? 'pode ter contato' : 'SEM contato externo') + (pr ? ' · preço aqui: R$ ' + pr.toFixed(2).replace('.', ',') : '') + '\n  ' + (ESTILO_PLAT[pl.id] || 'Estilo de marketplace brasileiro, seguindo o ANÚNCIO MODELO.');
      }).join('\n'),
      '',
      'Em palavras_chave, coloque de 6 a 15 termos que o cliente digitaria na busca (Instagram: hashtags sem #). Não coloque preço na descrição de Shopee, Mercado Livre e TikTok.',
      'Responda no formato JSON: {"anuncios":[{"plataforma":"<id>","titulo":"…","descricao":"…","palavras_chave":["…"]}]}.'
    ].join('\n');
  }
  function textoManual(p, pl) {
    var cfg = S.cfg || {}, lim = LIM_TITULO[pl.id] || 80;
    var t = p.nome;
    if (t.length > lim) t = p.nome.slice(0, lim);
    var cores = (p.opcoes || []).filter(function (o) { return o && o.choices && o.choices.length; }).map(function (o) { return o.name + ': ' + o.choices.join(', '); });
    var d = [p.descricao_breve || p.descricao || p.nome,
      '', '✨ DESTAQUES DO PRODUTO:',
      p.medidas ? '✔ Medidas: ' + p.medidas : '', cores.length ? '✔ ' + cores.join(' · ') : '',
      p.estoque > 0 ? '✔ Pronta entrega' : '',
      '', '📌 ATENÇÃO:', p.tipo_produto === 'revenda' ? '' : '- Produto produzido em impressão 3D, portanto pode apresentar pequenos detalhes decorrentes da impressão.', '- A tonalidade da cor pode variar de acordo com a iluminação e as configurações do seu dispositivo.',
      '', String(cfg.regras_anuncio || '').split('\n').filter(function (l) { return /quantidade/i.test(l); }).join('\n').replace(/^Sempre incluir:\s*/i, '').replace(/"/g, '')].filter(function (x, i, a) { return x !== '' || (a[i - 1] !== ''); });
    if (pl.permite_contato) d.push('', '📍 ' + (cfg.local_retirada || 'Curitiba') + ' · ' + (cfg.formas_entrega || 'entrega a combinar'), '📲 WhatsApp ' + (cfg.whatsapp || ''));
    if (pl.permite_contato && num(p.preco)) d.splice(1, 0, '💰 ' + brl(precoNa(p, pl)));
    return { titulo: t, descricao: d.join('\n').replace(/\n{3,}/g, '\n\n').trim(), palavras_chave: [p.nome, p.categoria, 'impressão 3D'].filter(Boolean).join(', ') };
  }
  async function erroFuncao(error) {
    try { var j = await error.context.json(); if (j && j.erro) return /ao menos uma plataforma/.test(j.erro) ? 'A função do Supabase está na versão antiga. Publique de novo o código novo da função gerar-anuncio (mesmo passo 4).' : j.erro; } catch (x) { }
    var m = erroMsg(error);
    if (/Failed to send|fetch|NetworkError|not found|404/i.test(m)) return 'A função "gerar-anuncio" ainda não está publicada no Supabase (veja o passo a passo em Configurações).';
    return m;
  }
  async function chamarGemini(body) {
    var r = await sb.functions.invoke('gerar-anuncio', { body: body });
    if (r.error) throw new Error(await erroFuncao(r.error));
    if (r.data && r.data.erro) throw new Error(r.data.erro);
    if (r.data && r.data.anuncios && !r.data.versao) throw new Error('A função do Supabase está na versão antiga. Publique de novo o código novo da função gerar-anuncio (mesmo passo 4).');
    return r.data;
  }

  // ------------------------------------------------------------------ página de anúncios de um produto
  function falta09() { return !S.cfg || !('modelo_anuncio' in S.cfg); }
  function adsDe(pid) { return S.anuncios.filter(function (a) { return a.produto_id === pid && !a.arquivado; }); }
  function arquivadosDe(pid) { return S.anuncios.filter(function (a) { return a.produto_id === pid && a.arquivado; }).sort(function (a, b) { return String(b.arquivado_em || '').localeCompare(String(a.arquivado_em || '')); }); }
  function copiarTexto(txt) {
    var fim = function () { toast('Copiado ✓'); };
    if (navigator.clipboard) return navigator.clipboard.writeText(txt).then(fim, function () { velho(); });
    velho();
    function velho() { var ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); fim(); }
  }
  function tagsDe(a) { return String(a.palavras_chave || '').split(',').map(function (s) { s = s.trim().replace(/^#/, '').replace(/\s+/g, ''); return s ? '#' + s : ''; }).filter(Boolean).join(' '); }
  function textoDoAd(a, k) {
    if (k === 'palavras_chave') return a.plataforma_id === 'instagram' ? tagsDe(a) : (a.palavras_chave || '');
    if (k === 'tudo') return a.plataforma_id === 'instagram' ? (a.descricao || '') + '\n\n' + tagsDe(a) : (a.titulo || '') + '\n\n' + (a.descricao || '');
    return a[k] || '';
  }
  function novoAd(pid, pl, base) {
    var o = base ? JSON.parse(JSON.stringify(base)) : {};
    o.id = uid(); o.produto_id = pid; o.plataforma_id = pl || o.plataforma_id || 'shopee';
    o.url = null; o.publicado = false; o._novo = true; delete o.criado_em;
    return o;
  }
  async function duplicarProduto(pid) {
    var p = byId(S.produtos, pid);
    if (!(await confirmar('Duplicar produto?', 'Cria “' + p.nome + ' (cópia)” com as mesmas fotos, custos, insumos e textos de anúncio (sem os links e com estoque zero). Ele começa fora do site.', 'Duplicar'))) return;
    try {
      var o = JSON.parse(JSON.stringify(p));
      ['id', 'criado_em', 'atualizado_em', 'codigo_site'].forEach(function (k) { delete o[k]; });
      o.id = uid(); o.nome = p.nome + ' (cópia)'; o.estoque = 0; o.mostrar_no_site = false; o.destaque = false;
      var np = q(await sb.from('produtos').insert(o).select().single());
      var ins = S.prodInsumos.filter(function (x) { return x.produto_id === pid; }).map(function (x) { return { produto_id: np.id, insumo_id: x.insumo_id, quantidade: x.quantidade }; });
      if (ins.length) q(await sb.from('produto_insumos').insert(ins));
      var ads = falta09() ? [] : adsDe(pid).map(function (a) { var n = novoAd(np.id, a.plataforma_id, a); delete n._novo; return n; });
      if (ads.length) q(await sb.from('produto_anuncios').insert(ads));
      S.produtos.push(np); S.prodInsumos = S.prodInsumos.concat(ins); S.anuncios = S.anuncios.concat(ads);
      toast('Produto duplicado ✓ — ajuste o nome e o que mudar');
      go('#/produto/' + np.id);
    } catch (err) { toast('Não duplicou: ' + erroMsg(err), true); }
  }

  function telaAnuncio(v, pid) {
    var p = byId(S.produtos, pid);
    if (!p) { setHeader('Anúncios'); v.innerHTML = '<div class="card">Produto não encontrado. <a href="#/anuncios">Voltar</a></div>'; return; }
    setHeader('Anúncios · ' + p.nome, '<button class="btn btn-g hide-m" id="an-dupprod">Duplicar produto</button><a class="btn btn-g" href="#/produto/' + p.id + '">Produto</a><a class="btn btn-g" href="#/anuncios">Voltar</a>');
    $('#an-dupprod').addEventListener('click', function () { if (dirty) return toast('Salve os anúncios antes', true); duplicarProduto(p.id); });
    if (falta08() || falta09()) {
      v.innerHTML = '<div class="card note">Para usar esta tela, rode os scripts <b>08</b> e <b>09</b> no SQL Editor do Supabase e atualize a página (Ctrl+F5).</div>';
      return;
    }
    var plats = platsAnuncio();
    var lista = adsDe(p.id).map(function (a) { return JSON.parse(JSON.stringify(a)); })
      .sort(function (a, b) { return (byId(plats, a.plataforma_id) || {}).ordem - (byId(plats, b.plataforma_id) || {}).ordem || String(a.criado_em || '').localeCompare(String(b.criado_em || '')); });
    var removidos = [];
    var marcadas = {};
    var selDel = {};
    var visiveis = platsVisiveis();
    var platOpts = function (sel) { return plats.map(function (pl) { return '<option value="' + pl.id + '"' + (pl.id === sel ? ' selected' : '') + '>' + esc(pl.nome) + '</option>'; }).join(''); };

    v.innerHTML = '<div class="stack">' +
      '<div class="card criar-ad"><div class="row wrap" style="gap:14px;align-items:flex-start">' + ((p.fotos || []).length ? '<div class="an-fotos">' + p.fotos.slice(0, 4).map(function (f) { return thumbHtml(f, p.fotos); }).join('') + '</div>' : '') +
      '<div class="grow" style="min-width:240px"><h2 style="margin:0 0 4px">➕ Criar anúncio</h2>' +
      '<div class="lbl" style="margin:10px 0 6px">1. Onde vai anunciar? (pode marcar várias)</div><div class="row wrap" style="gap:6px" id="an-plats">' +
      visiveis.map(function (pl) { return '<button type="button" class="chip" data-pl="' + pl.id + '">' + esc(pl.nome) + '</button>'; }).join('') +
      '<a class="small" href="#/anuncios" style="align-self:center;margin-left:4px">outras plataformas…</a></div>' +
      '<div class="lbl" style="margin:14px 0 6px">2. Crie</div><div class="row wrap" style="gap:8px"><button type="button" class="btn btn-p" id="an-gerar">✨ Criar com IA</button><button type="button" class="btn btn-g" id="an-add">Criar em branco</button><button type="button" class="btn btn-g" id="an-fotos">Baixar fotos</button><a class="btn btn-g" href="#/fotos/' + p.id + '">🎨 Fotos com IA</a></div>' +
      '<details style="margin-top:10px"><summary class="small" style="cursor:pointer">Opções da IA</summary><div class="grid g2" style="margin-top:8px"><div class="field"><label for="an-motor">Quem escreve</label><select class="inp" id="an-motor">' + MOTORES.map(function (x) { return '<option value="' + x.v + '"' + (x.off ? ' disabled' : '') + '>' + esc(x.t) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="an-extra">Pedido extra (opcional)</label><input class="inp" id="an-extra" placeholder="ex.: destacar que é presente de Natal"></div></div></details>' +
      '<div class="small muted" id="an-info" style="margin-top:8px">' + ((p.fotos || []).length ? 'A IA olha até 3 fotos do produto e cria um anúncio novo para cada plataforma marcada.' : 'Sem fotos: a IA usa só os dados do produto.') + '</div></div></div></div>' +
      '<div class="card note row between wrap" style="gap:8px"><span>🌐 <b>Nosso site é automático:</b> ' + (p.ativo && p.mostrar_no_site ? 'este produto <b>já está no site</b>, com as fotos, o preço e a descrição do cadastro do produto.' : 'este produto <b>não está no site</b>. Para colocar, marque “Mostrar no site” no produto.') + ' Se criar o anúncio “Site e WhatsApp”, ao salvar o texto dele vira a descrição do produto no site (e serve para mandar no WhatsApp).</span><span class="row" style="gap:6px">' + (p.ativo && p.mostrar_no_site ? '<a class="btn btn-g btn-s" target="_blank" rel="noopener" href="' + esc(((window.CRISTART_CONFIG || {}).siteUrl || 'https://www.cristart3d.com.br/') + '#/produto/' + encodeURIComponent(p.codigo_site || p.id)) + '">Ver no site ' + ICON.ext + '</a>' : '') + '<a class="btn btn-g btn-s" href="#/produto/' + p.id + '">Abrir produto</a></span></div>' +
      '<div class="row between wrap"><h2 style="margin:0">Anúncios deste produto <span class="muted" id="an-n"></span></h2><div class="row" style="gap:8px" id="an-selbar"></div></div>' +
      '<div id="an-lista" class="stack" style="gap:14px"></div>' +
      '<div id="an-arq"></div>' +
      '<div class="sticky-save"><a class="btn btn-g" href="#/anuncios">Cancelar</a><button type="button" class="btn btn-p" id="an-salvar">Salvar anúncios</button></div></div>';

    function cartao(a, i) {
      var pl = byId(plats, a.plataforma_id) || { id: a.plataforma_id, nome: a.plataforma_id }, lim = LIM_TITULO[pl.id] || 80;
      var sug = precoPlataforma(num(p.preco), pl) || num(p.preco), n = (a.titulo || '').length, mesmo = lista.filter(function (x) { return x.plataforma_id === a.plataforma_id; }).length;
      return '<div class="card an-card' + (selDel[i] ? ' sel' : '') + '" data-i="' + i + '">' +
        '<div class="row between wrap" style="gap:8px"><div class="row wrap" style="gap:8px"><input type="checkbox" class="an-sel" data-sel' + (selDel[i] ? ' checked' : '') + ' aria-label="Selecionar este anúncio"><select class="inp" data-f="plataforma_id" aria-label="Plataforma" style="width:auto;font-weight:800">' + platOpts(a.plataforma_id) + '</select>' +
        '<input class="inp" data-f="apelido" value="' + esc(a.apelido || '') + '" placeholder="' + (mesmo > 1 ? 'apelido (ex.: kit com 10)' : 'apelido (opcional)') + '" style="width:200px" aria-label="Apelido do anúncio">' +
        (a.gerado_por ? '<span class="small muted">' + esc(a.gerado_por === 'manual' ? 'modelo pronto' : a.gerado_por) + '</span>' : '') + '</div>' +
        '<div class="row wrap" style="gap:6px"><button type="button" class="btn btn-g btn-s" data-ac="ia" title="Reescrever só este com a IA">✨ Reescrever</button><button type="button" class="btn btn-g btn-s" data-ac="dup">Duplicar</button><button type="button" class="btn btn-g btn-s" data-ac="outro">Copiar para outro produto</button><button type="button" class="icon-btn" data-ac="del" aria-label="Arquivar anúncio" title="Arquivar (dá para restaurar depois)">' + BTN_DEL + '</button></div></div>' +
        '<div class="grid g4" style="margin-top:10px"><div class="field"><label>Preço nesta plataforma (R$)</label><input class="inp" data-f="preco" inputmode="decimal" value="' + esc(fmtIn(a.preco)) + '" placeholder="' + esc(sug ? fmtIn(sug.toFixed(2)) : '') + '"><div class="hint">' + (sug ? 'sugerido com a taxa: ' + brl(sug) : '') + '</div></div>' +
        '<div class="field" style="grid-column:span 2"><label>Link do anúncio publicado</label><div class="row" style="gap:6px"><input class="inp" data-f="url" value="' + esc(a.url || '') + '" placeholder="cole o link depois de publicar">' + (isUrl(a.url) ? '<a class="btn btn-g btn-s" href="' + esc(a.url) + '" target="_blank" rel="noopener">Abrir ' + ICON.ext + '</a>' : '') + '</div></div>' +
        '<div style="align-self:end"><label class="check"><input type="checkbox" data-f="publicado"' + (a.publicado ? ' checked' : '') + '> Publicado</label></div></div>' +
        '<div class="field"><div class="row between"><label>Título</label><div class="row" style="gap:8px"><span class="small ' + (n > lim ? 'bad-t' : 'muted') + '" data-cont>' + n + '/' + lim + '</span><button type="button" class="btn btn-g btn-s" data-cp="titulo">Copiar</button></div></div><input class="inp" data-f="titulo" value="' + esc(a.titulo || '') + '"></div>' +
        '<div class="field"><div class="row between"><label>Descrição</label><button type="button" class="btn btn-g btn-s" data-cp="descricao">Copiar</button></div><textarea class="inp" data-f="descricao" rows="12">' + esc(a.descricao || '') + '</textarea></div>' +
        '<div class="field"><div class="row between"><label>' + (pl.id === 'instagram' ? 'Hashtags' : 'Palavras-chave') + '</label><button type="button" class="btn btn-g btn-s" data-cp="palavras_chave">Copiar</button></div><input class="inp" data-f="palavras_chave" value="' + esc(a.palavras_chave || '') + '"></div>' +
        '<div class="row wrap" style="gap:6px;justify-content:flex-end"><button type="button" class="btn btn-g" data-cp="tudo">Copiar tudo</button>' + (LINK_ANUNCIAR[pl.id] ? '<a class="btn btn-p" href="' + LINK_ANUNCIAR[pl.id] + '" target="_blank" rel="noopener">Ir anunciar ' + ICON.ext + '</a>' : '') + '</div></div>';
    }
    function draw() {
      $('#an-lista').innerHTML = lista.length ? lista.map(cartao).join('') : '<div class="card empty">Nenhum anúncio ainda. Lá em cima: marque onde vai anunciar e clique em <b>✨ Criar com IA</b>.</div>';
      var nSel = Object.keys(selDel).filter(function (k) { return selDel[k]; }).length;
      $('#an-n').textContent = lista.length ? '(' + lista.length + ')' : '';
      $('#an-selbar').innerHTML = lista.length ? '<label class="check small"><input type="checkbox" id="an-todos"' + (nSel && nSel === lista.length ? ' checked' : '') + '> Selecionar todos</label>' + (nSel ? '<button type="button" class="btn btn-d btn-s" id="an-delsel">Arquivar selecionados (' + nSel + ')</button>' : '') : '';
    }
    draw();
    var L = $('#an-lista');
    setTimeout(drawArquivo, 0);
    L.addEventListener('input', function (e) {
      var c = e.target.closest('[data-i]'), k = e.target.dataset.f; if (!c || !k) return;
      var a = lista[+c.dataset.i]; dirty = true;
      if (k === 'preco') a.preco = num(e.target.value);
      else if (k !== 'publicado' && k !== 'plataforma_id') a[k] = e.target.value;
      if (k === 'titulo') { var lim = LIM_TITULO[a.plataforma_id] || 80, n = e.target.value.length, el = $('[data-cont]', c); el.textContent = n + '/' + lim; el.className = 'small ' + (n > lim ? 'bad-t' : 'muted'); }
    });
    L.addEventListener('change', function (e) {
      if (e.target.matches('[data-sel]')) { var ci = +e.target.closest('[data-i]').dataset.i; selDel[ci] = e.target.checked; draw(); return; }
      var c = e.target.closest('[data-i]'), k = e.target.dataset.f; if (!c || !k) return;
      var a = lista[+c.dataset.i]; dirty = true;
      if (k === 'publicado') a.publicado = e.target.checked;
      if (k === 'plataforma_id') { a.plataforma_id = e.target.value; draw(); }
      if (k === 'url') { a.url = e.target.value.trim() || null; if (isUrl(a.url)) a.publicado = true; draw(); }
    });
    L.addEventListener('click', async function (e) {
      var c = e.target.closest('[data-i]'); if (!c) return;
      var i = +c.dataset.i, a = lista[i];
      var cp = e.target.closest('[data-cp]'); if (cp) return copiarTexto(textoDoAd(a, cp.dataset.cp));
      var ac = e.target.closest('[data-ac]'); if (!ac) return;
      if (ac.dataset.ac === 'dup') { selDel = {}; var d = novoAd(p.id, a.plataforma_id, a); d.apelido = (a.apelido ? a.apelido + ' ' : '') + '(cópia)'; lista.splice(i + 1, 0, d); dirty = true; draw(); toast('Anúncio duplicado — mude o que quiser e salve'); var el = $('[data-i="' + (i + 1) + '"]'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      if (ac.dataset.ac === 'del') { if (a._novo) { lista.splice(i, 1); selDel = {}; return draw(); } try { await arquivarAds([a.id]); } catch (x) { return; } lista.splice(i, 1); selDel = {}; draw(); drawArquivo(); }
      if (ac.dataset.ac === 'outro') copiarParaOutro(a);
      if (ac.dataset.ac === 'ia') gerar([a], ac);
    });
    function copiarParaOutro(a) {
      var m = modal('<div class="row between"><h2>Copiar anúncio para outro produto</h2><button class="btn btn-g btn-s" data-x="close">Fechar</button></div>' +
        '<div class="field"><label for="cp-prod">Produto</label><select class="inp" id="cp-prod">' + selProdutos('', '— escolher —') + '</select></div>' +
        '<div class="hint">O texto vai sem o link e sem “publicado”. Depois é só abrir os anúncios do outro produto e ajustar.</div>' +
        '<div class="row" style="justify-content:flex-end"><button class="btn btn-g" data-x="close">Cancelar</button><button class="btn btn-p" data-x="ok">Copiar</button></div>', { size: 'sm' });
      m.addEventListener('click', async function (e) {
        var b = e.target.closest('[data-x]'); if (!b) return;
        if (b.dataset.x === 'close') return closeModal();
        var dest = $('#cp-prod', m).value; if (!dest) return toast('Escolha o produto', true);
        try {
          var n = novoAd(dest, a.plataforma_id, a); delete n._novo;
          var r = q(await sb.from('produto_anuncios').insert(n).select().single());
          S.anuncios.push(r || n); closeModal(); toast('Copiado para “' + nomeProduto(dest) + '” ✓');
        } catch (err) { toast(erroMsg(err), true); }
      });
    }
    async function arquivarAds(ids) {
      ids = ids.filter(Boolean); if (!ids.length) return;
      if (S.falta11) { toast('Para arquivar, rode o script 11 no Supabase', true); throw new Error('falta 11'); }
      var agora = new Date().toISOString();
      try {
        q(await sb.from('produto_anuncios').update({ arquivado: true, arquivado_em: agora }).in('id', ids));
        S.anuncios.forEach(function (x) { if (ids.indexOf(x.id) >= 0) { x.arquivado = true; x.arquivado_em = agora; } });
        toast(ids.length > 1 ? ids.length + ' anúncios arquivados' : 'Anúncio arquivado (está lá embaixo, em Arquivados)');
      } catch (err) { toast(erroMsg(err), true); throw err; }
    }
    var selArq = {};
    function drawArquivo() {
      var arq = arquivadosDe(p.id), box = $('#an-arq'); if (!box) return;
      var nSel = arq.filter(function (a) { return selArq[a.id]; }).length;
      box.innerHTML = arq.length ? '<details class="card" id="an-arq-d"' + (box.dataset.aberto ? ' open' : '') + '><summary style="cursor:pointer;font-weight:800">🗄️ Arquivados (' + arq.length + ')</summary>' +
        '<div class="row between wrap" style="margin:10px 0"><label class="check small"><input type="checkbox" id="arq-todos"' + (nSel && nSel === arq.length ? ' checked' : '') + '> Selecionar todos</label>' + (nSel ? '<button type="button" class="btn btn-d btn-s" id="arq-delsel">Excluir para sempre (' + nSel + ')</button>' : '') + '</div>' +
        '<div class="stack" style="gap:8px">' + arq.map(function (a) {
          var pl = byId(S.plataformas, a.plataforma_id) || { nome: a.plataforma_id };
          return '<div class="row between wrap arq-row" data-arq="' + a.id + '" style="gap:8px;border-top:1px solid var(--line);padding-top:8px"><div class="row" style="gap:10px"><input type="checkbox" class="an-sel" data-arq-sel' + (selArq[a.id] ? ' checked' : '') + ' aria-label="Selecionar"><div><b>' + esc(pl.nome) + '</b>' + (a.apelido ? ' · ' + esc(a.apelido) : '') + '<div class="small muted">' + esc((a.titulo || 'sem título').slice(0, 90)) + (a.arquivado_em ? ' · arquivado em ' + dataBR(a.arquivado_em) : '') + '</div></div></div>' +
            '<div class="row" style="gap:6px"><button type="button" class="btn btn-g btn-s" data-arq-ac="rest">Restaurar</button><button type="button" class="btn btn-d btn-s" data-arq-ac="del">Excluir para sempre</button></div></div>';
        }).join('') + '</div></details>' : '';
    }
    $('#an-arq').addEventListener('toggle', function (e) { if (e.target.id === 'an-arq-d') $('#an-arq').dataset.aberto = e.target.open ? '1' : ''; }, true);
    $('#an-arq').addEventListener('change', function (e) {
      if (e.target.id === 'arq-todos') { selArq = {}; if (e.target.checked) arquivadosDe(p.id).forEach(function (a) { selArq[a.id] = true; }); return drawArquivo(); }
      if (e.target.matches('[data-arq-sel]')) { selArq[e.target.closest('[data-arq]').dataset.arq] = e.target.checked; drawArquivo(); }
    });
    async function excluirDeVez(ids) {
      if (!(await confirmar('Excluir para sempre?', ids.length + ' anúncio(s) arquivado(s) serão apagados de vez, sem volta.', 'Excluir para sempre', true))) return;
      try { q(await sb.from('produto_anuncios').delete().in('id', ids)); S.anuncios = S.anuncios.filter(function (x) { return ids.indexOf(x.id) < 0; }); selArq = {}; toast('Excluído para sempre'); drawArquivo(); }
      catch (err) { toast(erroMsg(err), true); }
    }
    $('#an-arq').addEventListener('click', async function (e) {
      if (e.target.id === 'arq-delsel') return excluirDeVez(Object.keys(selArq).filter(function (k) { return selArq[k]; }));
      var b = e.target.closest('[data-arq-ac]'); if (!b) return;
      var id = b.closest('[data-arq]').dataset.arq;
      if (b.dataset.arqAc === 'del') return excluirDeVez([id]);
      try {
        q(await sb.from('produto_anuncios').update({ arquivado: false, arquivado_em: null }).eq('id', id));
        var a0 = byId(S.anuncios, id); a0.arquivado = false; a0.arquivado_em = null;
        lista.push(JSON.parse(JSON.stringify(a0))); selDel = {}; draw(); drawArquivo(); toast('Anúncio restaurado ✓');
      } catch (err) { toast(erroMsg(err), true); }
    });
    $('#an-selbar').addEventListener('change', function (e) { if (e.target.id === 'an-todos') { selDel = {}; if (e.target.checked) lista.forEach(function (_, i) { selDel[i] = true; }); draw(); } });
    $('#an-selbar').addEventListener('click', async function (e) {
      if (e.target.id !== 'an-delsel') return;
      var idx = Object.keys(selDel).filter(function (k) { return selDel[k]; }).map(Number);
      if (!(await confirmar('Arquivar ' + idx.length + ' anúncio(s)?', 'Eles saem da lista e vão para Arquivados, lá embaixo. Dá para restaurar ou excluir para sempre depois. Os anúncios que já estão no ar nas plataformas não são afetados.', 'Arquivar'))) return;
      try { await arquivarAds(idx.map(function (i) { return lista[i]._novo ? null : lista[i].id; })); } catch (x) { return; }
      lista = lista.filter(function (_, i) { return !selDel[i]; }); selDel = {}; draw(); drawArquivo();
    });
    function escolhidas() { return plats.filter(function (pl) { return marcadas[pl.id]; }); }
    $('#an-add').addEventListener('click', function () {
      var esc2 = escolhidas(); if (!esc2.length) return toast('Marque primeiro onde vai anunciar (passo 1)', true);
      esc2.forEach(function (pl) { lista.push(novoAd(p.id, pl.id)); }); dirty = true; draw();
      var el = $('[data-i="' + (lista.length - esc2.length) + '"]'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('#an-plats').addEventListener('click', function (e) { var b = e.target.closest('[data-pl]'); if (!b) return; marcadas[b.dataset.pl] = !marcadas[b.dataset.pl]; b.classList.toggle('on', marcadas[b.dataset.pl]); });

    // gerar: alvos = anúncios que recebem o texto (um por plataforma)
    async function gerar(alvos, btn) {
      var motor = $('#an-motor').value, extra = $('#an-extra').value.trim() || null;
      var platsAlvo = alvos.map(function (a) { return byId(plats, a.plataforma_id) || { id: a.plataforma_id, nome: a.plataforma_id }; });
      if (motor === 'manual') {
        alvos.forEach(function (a, i) { var t = textoManual(p, platsAlvo[i]); a.titulo = t.titulo; a.descricao = t.descricao; a.palavras_chave = t.palavras_chave; a.gerado_por = 'manual'; });
        dirty = true; draw(); return;
      }
      var txt = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Escrevendo…';
      $('#an-info').textContent = 'O Gemini está olhando as fotos e escrevendo (uns 10 a 30 segundos)…';
      try {
        var d = await chamarGemini({ prompt: montarPrompt(p, platsAlvo, extra), fotos: (p.fotos || []).filter(isUrl).slice(0, 3), modelo: (S.cfg || {}).ia_modelo || 'gemini-3.8-flash' });
        var n = 0;
        (d.anuncios || []).forEach(function (r) {
          var id = String(r.plataforma || '').toLowerCase();
          var a = alvos.filter(function (x) { return x.plataforma_id === id && !x._feito; })[0]; if (!a) return;
          a.titulo = r.titulo || ''; a.descricao = r.descricao || ''; a.palavras_chave = (r.palavras_chave || []).join(', '); a.gerado_por = d.modelo || 'gemini'; a._feito = true; n++;
        });
        alvos.forEach(function (a) { delete a._feito; });
        dirty = true; draw();
        $('#an-info').textContent = n + ' anúncio(s) prontos · ' + (d.modelo || 'Gemini') + (d.fotos ? ' · olhou ' + d.fotos + ' foto(s)' : '') + '. Revise e clique em Salvar anúncios.';
      } catch (err) { $('#an-info').textContent = ''; toast(err.message, true); lista = lista.filter(function (x) { return !(x._novo && !x.titulo && !x.descricao && alvos.indexOf(x) >= 0); }); draw(); }
      btn.disabled = false; btn.innerHTML = txt;
      var el0 = $('[data-i="' + lista.indexOf(alvos[0]) + '"]'); if (el0 && alvos[0].titulo) el0.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    $('#an-gerar').addEventListener('click', function () {
      var escolha = escolhidas();
      if (!escolha.length) return toast('Marque primeiro onde vai anunciar (passo 1)', true);
      var alvos = escolha.map(function (pl) { var a = novoAd(p.id, pl.id); lista.push(a); return a; });
      draw(); gerar(alvos, this);
    });
    $('#an-fotos').addEventListener('click', async function () {
      var fs = (p.fotos || []).filter(isUrl); if (!fs.length) return toast('Este produto não tem fotos', true);
      for (var i = 0; i < fs.length; i++) {
        try {
          var bl = await (await fetch(fs[i])).blob(), a = document.createElement('a');
          a.href = URL.createObjectURL(bl); a.download = norm(p.nome).replace(/[^a-z0-9]+/g, '-') + '-' + (i + 1) + '.' + ((bl.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg'));
          document.body.appendChild(a); a.click(); a.remove();
        } catch (x) { window.open(fs[i], '_blank', 'noopener'); }
      }
    });
    $('#an-salvar').addEventListener('click', async function () {
      var btn = this, agora = new Date().toISOString();
      var rows = lista.map(function (a) {
        return { id: a.id, produto_id: p.id, plataforma_id: a.plataforma_id, apelido: (a.apelido || '').trim() || null, titulo: a.titulo || null, descricao: a.descricao || null, palavras_chave: a.palavras_chave || null, preco: num(a.preco), url: a.url || null, publicado: !!a.publicado, gerado_por: a.gerado_por || null, gerado_em: a.gerado_em || (a.gerado_por ? agora : null), atualizado_em: agora };
      });
      btn.disabled = true;
      try {
        if (removidos.length) q(await sb.from('produto_anuncios').delete().in('id', removidos));
        var salvos = rows.length ? q(await sb.from('produto_anuncios').upsert(rows).select()) : [];
        S.anuncios = S.anuncios.filter(function (x) { return x.produto_id !== p.id || x.arquivado; }).concat(salvos || rows);
        // o texto "Site e WhatsApp" vira a descrição do produto no site
        var adSite = (salvos || rows).filter(function (r) { return r.plataforma_id === 'site' && r.descricao; })[0];
        var msg = 'Anúncios salvos ✓';
        if (adSite && adSite.descricao !== p.descricao) {
          var patch = { descricao: adSite.descricao };
          if (!p.descricao_breve && adSite.titulo) patch.descricao_breve = adSite.titulo;
          var pr = q(await sb.from('produtos').update(patch).eq('id', p.id).select().single());
          S.produtos = S.produtos.map(function (x) { return x.id === pr.id ? pr : x; });
          msg = 'Anúncios salvos ✓ e o texto do site foi atualizado';
        }
        dirty = false; toast(msg); render();
      } catch (err) { toast('Não salvou: ' + erroMsg(err), true); }
      btn.disabled = false;
    });
  }

  // ------------------------------------------------------------------ tela Anúncios
  function telaAnuncios(v) {
    setHeader('Anúncios com IA', '<a class="btn btn-g" href="#/shopee">📦 <span class="long">Planilha da Shopee</span></a>');
    var todas = platsAnuncio(), plats = platsVisiveis();
    var busca = S.ui.busca.anuncios || '', falta = S.ui.anFalta || '';
    var lista = S.produtos.filter(function (p) { return p.ativo; }).filter(function (p) {
      if (falta && S.anuncios.some(function (a) { return a.produto_id === p.id && a.plataforma_id === falta && !a.arquivado && (a.publicado || a.url); })) return false;
      return combina([p.nome, p.categoria, p.material], busca);
    }).sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
    var est = function (p, pl) { if (pl.id === 'site') return p.mostrar_no_site ? 'pub' : ''; var l = S.anuncios.filter(function (a) { return a.produto_id === p.id && a.plataforma_id === pl.id && !a.arquivado; }); if (l.some(function (a) { return a.publicado || isUrl(a.url); })) return 'pub'; if (l.some(function (a) { return a.titulo; })) return 'txt'; return ''; };
    var nPub = 0, nTxt = 0;
    S.produtos.filter(function (p) { return p.ativo; }).forEach(function (p) { plats.forEach(function (pl) { var e = est(p, pl); if (e === 'pub') nPub++; else if (e === 'txt') nTxt++; }); });
    v.innerHTML = '<div class="stack">' +
      (falta08() ? '<div class="card note">Para usar os anúncios com IA: rode o <b>script 08</b> no SQL Editor do Supabase e siga o passo a passo do Gemini em <a href="#/config">Configurações</a>.</div>' : '') +
      '<div class="grid g3">' + kpi('Anúncios publicados', nPub, 'com link ou marcados como publicados') + kpi('Textos prontos', nTxt, 'gerados, ainda não publicados') + kpi('Produtos ativos', S.produtos.filter(function (p) { return p.ativo; }).length, plats.length + ' plataformas ativas') + '</div>' +
      '<div class="row between wrap">' + buscaHtml('anuncios', 'Pesquisar produto…') +
      '<div class="field" style="min-width:220px"><select class="inp" id="an-falta" aria-label="Filtrar"><option value="">Todos os produtos</option>' + plats.map(function (pl) { return '<option value="' + pl.id + '"' + (pl.id === falta ? ' selected' : '') + '>Ainda não publicados no ' + esc(pl.nome) + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="card" style="padding:12px 14px"><div class="row wrap" style="gap:6px;align-items:center"><span class="lbl" style="margin-right:4px">Plataformas que vocês usam</span>' + todas.map(function (pl) { return '<button type="button" class="chip' + (byId(plats, pl.id) ? ' on' : '') + '" data-ver="' + pl.id + '">' + (byId(plats, pl.id) ? '✓ ' : '') + esc(pl.nome) + '</button>'; }).join('') + '</div><div class="hint" style="margin-top:6px">Só as marcadas aparecem aqui e na hora de criar anúncios. Vale para este aparelho.</div></div>' +
      '<div class="small muted row wrap" style="gap:12px"><span><i class="an-dot pub"></i> publicado</span><span><i class="an-dot txt"></i> texto pronto</span><span><i class="an-dot"></i> nada ainda</span></div>' +
      (lista.length ? '<div class="card" style="padding:0"><div class="tbl-wrap"><table class="tbl"><thead><tr><th style="width:58px"></th><th>Produto</th>' + plats.map(function (pl) { return '<th class="hide-m" style="text-align:center">' + esc(pl.nome) + '</th>'; }).join('') + '<th></th></tr></thead><tbody>' +
        lista.map(function (p) {
          return '<tr><td>' + thumbHtml(p.fotos && p.fotos[0], p.fotos) + '</td><td><div style="font-weight:700">' + esc(p.nome) + '</div><div class="small muted">' + esc([p.categoria, p.preco ? brl(num(p.preco)) : ''].filter(Boolean).join(' · ')) + '</div>' +
            '<div class="show-m an-mini">' + plats.map(function (pl) { return '<span title="' + esc(pl.nome) + '"><i class="an-dot ' + est(p, pl) + '"></i>' + esc(pl.nome.split(' ')[0]) + '</span>'; }).join('') + '</div></td>' +
            plats.map(function (pl) { return '<td class="hide-m" style="text-align:center"><i class="an-dot ' + est(p, pl) + '" title="' + esc(pl.nome) + '"></i></td>'; }).join('') +
            '<td class="num"><button class="btn btn-p btn-s" data-an="' + p.id + '">✨ <span class="long">Criar / ver anúncios</span><span class="show-m">Anúncios</span></button></td></tr>';
        }).join('') + '</tbody></table></div></div>' : (busca ? nadaAchado('anuncios') : '<div class="card empty">Nenhum produto aqui. 🎉</div>'));
    ligarBusca('anuncios');
    $('#an-falta').addEventListener('change', function (e) { S.ui.anFalta = e.target.value; render(); });
    v.onclick = function (e) {
      var c = e.target.closest('[data-ver]');
      if (c) { var ids = plats.map(function (x) { return x.id; }), id = c.dataset.ver, k = ids.indexOf(id); if (k >= 0) { if (ids.length === 1) return toast('Deixe pelo menos uma', true); ids.splice(k, 1); } else ids.push(id); guardarPlatsVer(ids); return render(); }
      var b = e.target.closest('[data-an]'); if (b) go('#/anuncio/' + b.dataset.an);
    };
  }

  // ------------------------------------------------------------------ configurações da IA
  function cartaoIAConfig() {
    var c = S.cfg || {};
    if (falta08()) return '<div class="card"><h2>Anúncios com IA</h2><div class="note">Rode o <b>script 08</b> no SQL Editor do Supabase e atualize a página para configurar.</div></div>';
    return '<div class="card"><h2>Anúncios com IA</h2><div class="stack">' +
      '<div class="field"><label for="ia-regras">Regras que todo anúncio segue</label><textarea class="inp" id="ia-regras" rows="5">' + esc(c.regras_anuncio || '') + '</textarea><div class="hint">Uma por linha. A IA adapta ao estilo de cada plataforma (nos marketplaces ela não coloca WhatsApp, porque é proibido lá).</div></div>' +
      ('modelo_anuncio' in c ? '<div class="field"><label for="ia-exemplo">Anúncio modelo (a IA copia a estrutura e o tom)</label><textarea class="inp" id="ia-exemplo" rows="10">' + esc(c.modelo_anuncio || '') + '</textarea><div class="hint">Cole aqui um anúncio que vocês gostam. Troque quando quiserem mudar o estilo.</div></div>' : '<div class="note">Rode o <b>script 09</b> para guardar o anúncio modelo da Fran.</div>') +
      ('ia_limite_mes' in c ? '<div class="grid g3"><div class="field"><label for="ia-teto">Teto das fotos com IA (R$/mês)</label><input class="inp" id="ia-teto" inputmode="decimal" value="' + esc(fmtIn(c.ia_limite_mes)) + '"></div><div class="field"><label for="ia-custo">Custo estimado por foto (R$)</label><input class="inp" id="ia-custo" inputmode="decimal" value="' + esc(fmtIn(c.ia_custo_imagem)) + '"><div class="hint">Confira o valor real no Google AI Studio › Billing.</div></div><div class="field"><label for="ia-mod-img">Modelo de imagem</label><input class="inp" id="ia-mod-img" value="' + esc(c.ia_modelo_imagem || '') + '"></div></div>' : '') +
      '<div class="grid g2"><div class="field"><label for="ia-modelo">Modelo do Gemini</label><input class="inp" id="ia-modelo" value="' + esc(c.ia_modelo || 'gemini-3.8-flash') + '"><div class="hint">Se esse sair do ar, o sistema tenta sozinho o mais novo disponível.</div></div>' +
      '<div class="row" style="align-items:flex-end;justify-content:flex-end;gap:8px"><button class="btn btn-g" id="ia-testar" type="button">Testar conexão</button><button class="btn btn-p" id="ia-salvar" type="button">Salvar</button></div></div>' +
      '<details class="note"><summary style="cursor:pointer;font-weight:700">Como ligar o Gemini (uma vez só)</summary><ol style="margin:8px 0 0 18px;padding:0;line-height:1.7">' +
      '<li>No Google AI Studio (aistudio.google.com), crie uma chave de API (“Get API key”).</li>' +
      '<li>No Supabase: <b>Edge Functions › Secrets</b> › adicione <code>GEMINI_API_KEY</code> com a chave.</li>' +
      '<li>No Supabase: <b>Edge Functions › Deploy a new function › Via Editor</b>, nome <code>gerar-anuncio</code>, cole o código do arquivo <code>index.ts</code> e clique em Deploy.</li>' +
      '<li>Volte aqui e clique em <b>Testar conexão</b>.</li></ol></details></div></div>';
  }
  function ligarIAConfig() {
    if (!$('#ia-salvar')) return;
    $('#ia-salvar').addEventListener('click', async function () {
      try { S.cfg = q(await sb.from('configuracoes').update(Object.assign({ regras_anuncio: $('#ia-regras').value.trim() || null, ia_modelo: $('#ia-modelo').value.trim() || 'gemini-3.8-flash', atualizado_em: new Date().toISOString() }, $('#ia-exemplo') ? { modelo_anuncio: $('#ia-exemplo').value.trim() || null } : {}, $('#ia-teto') ? { ia_limite_mes: num($('#ia-teto').value) || 30, ia_custo_imagem: num($('#ia-custo').value) || 0.25, ia_modelo_imagem: $('#ia-mod-img').value.trim() || 'gemini-nano-banana-2.1' } : {})).eq('id', 1).select().single()); toast('Regras dos anúncios salvas ✓'); }
      catch (err) { toast(erroMsg(err), true); }
    });
    $('#ia-testar').addEventListener('click', async function () {
      var b = this; b.disabled = true; b.innerHTML = '<span class="spinner"></span> Testando…';
      try { await chamarGemini({ teste: true }); toast('Conexão com o Gemini funcionando ✓'); }
      catch (err) { toast(err.message, true); }
      b.disabled = false; b.textContent = 'Testar conexão';
    });
  }

  // ------------------------------------------------------------------ planilha da Shopee (Adicionar em massa)
  function carregarScript(src) {
    return new Promise(function (ok, erro) {
      if (document.querySelector('script[src="' + src + '"]')) return ok();
      var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { erro(new Error('Não carregou ' + src)); };
      document.head.appendChild(s);
    });
  }
  function medidasCm(txt) {
    var t = String(txt || '').toLowerCase().replace(/,/g, '.');
    var ns = (t.match(/\d+(\.\d+)?/g) || []).map(Number).filter(function (n) { return n > 0; });
    if (ns.length < 3) return null;
    var k = /mm/.test(t) && !/cm/.test(t) ? 0.1 : 1;
    return ns.slice(0, 3).map(function (n) { return Math.max(1, Math.ceil(n * k)); });
  }
  function linhaShopee(a, opc) {
    var p = byId(S.produtos, a.produto_id) || {}, pl = byId(S.plataformas, 'shopee') || { id: 'shopee' };
    var preco = num(a.preco) || precoPlataforma(num(p.preco), pl) || num(p.preco);
    var pesoG = num(p.peso_g);
    var fotos = (p.fotos || []).filter(isUrl).slice(0, 9);
    var med = medidasCm(p.medidas);
    var r = {
      nome: (a.titulo || p.nome || '').trim(), descricao: (a.descricao || '').trim(), sku: 'CA-' + String(a.id).replace(/-/g, '').slice(0, 10).toUpperCase(),
      preco: preco ? Math.round(preco * 100) / 100 : null, estoque: p.estoque > 0 ? p.estoque : opc.estoqueEnc,
      peso: pesoG ? Math.ceil((pesoG + opc.embalagem) / 10) / 100 : null, med: med, fotos: fotos, prazo: p.estoque > 0 ? null : opc.prazo
    };
    var prob = [];
    if (r.nome.length < 2) prob.push('sem título');
    if (r.nome.length > 120) prob.push('título com mais de 120');
    if (r.descricao.length < 10) prob.push('sem descrição');
    if (r.descricao.length > 5000) prob.push('descrição com mais de 5000');
    if (!r.preco || r.preco < 1) prob.push('sem preço');
    if (!r.peso) prob.push('sem peso (cadastre no produto)');
    if (!fotos.length) prob.push('sem foto');
    r.problemas = prob;
    return r;
  }
  function xmlEsc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''); }
  function colLetra(n) { var s = ''; n++; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  async function gerarPlanilhaShopee(linhas, opc, modeloBuf) {
    await carregarScript('js/vendor/jszip.min.js');
    var buf = modeloBuf || await (await fetch('modelos/shopee_basico.xlsx?v=1')).arrayBuffer();
    var zip = await JSZip.loadAsync(buf);
    // acha a aba "Modelo"
    var wb = await zip.file('xl/workbook.xml').async('string'), rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
    var m = wb.match(/<sheet [^>]*name="Modelo"[^>]*r:id="([^"]+)"/); if (!m) throw new Error('Esta planilha não tem a aba "Modelo". Baixe o modelo básico de novo na Shopee.');
    var alvo = (rels.match(new RegExp('<Relationship [^>]*Id="' + m[1] + '"[^>]*Target="([^"]+)"')) || rels.match(new RegExp('<Relationship [^>]*Target="([^"]+)"[^>]*Id="' + m[1] + '"')) || [])[1];
    var caminho = 'xl/' + String(alvo).replace(/^\/?xl\//, '');
    var sh = await zip.file(caminho).async('string');
    var ss = zip.file('xl/sharedStrings.xml') ? await zip.file('xl/sharedStrings.xml').async('string') : '';
    var strs = (ss.match(/<si>[\s\S]*?<\/si>/g) || []).map(function (si) { return (si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || []).map(function (t) { return t.replace(/<[^>]+>/g, ''); }).join(''); });
    // linha 1 = chaves das colunas (ps_product_name|1|0 …)
    var l1 = (sh.match(/<row [^>]*r="1"[^>]*>([\s\S]*?)<\/row>/) || [])[1] || '';
    var col = {};
    (l1.match(/<c [^>]*>[\s\S]*?<\/c>/g) || []).forEach(function (c) {
      var ref = c.match(/r="([A-Z]+)1"/), v = c.match(/<v>([\s\S]*?)<\/v>/), tipo = /t="s"/.test(c);
      if (!ref || !v) return;
      var k = tipo ? strs[+v[1]] : v[1]; col[String(k).split('|')[0]] = ref[1];
    });
    var precisa = ['ps_product_name', 'ps_product_description', 'ps_price', 'ps_weight'];
    precisa.forEach(function (k) { if (!col[k]) throw new Error('O modelo da Shopee mudou (falta a coluna ' + k + '). Me mande o modelo novo.'); });
    var corr = Object.keys(col).filter(function (k) { return /^channel_id/.test(k); })[0];
    var linhasXml = linhas.map(function (r, i) {
      var n = 7 + i, cs = [];
      var txt = function (k, v) { if (col[k] && v !== null && v !== undefined && v !== '') cs.push([col[k], '<c r="' + col[k] + n + '" t="inlineStr"><is><t xml:space="preserve">' + xmlEsc(v) + '</t></is></c>']); };
      var nm = function (k, v) { if (col[k] && v !== null && v !== undefined && v !== '') cs.push([col[k], '<c r="' + col[k] + n + '"><v>' + v + '</v></c>']); };
      txt('ps_product_name', r.nome); txt('ps_product_description', r.descricao); txt('ps_sku_parent_short', r.sku);
      nm('ps_price', r.preco.toFixed(2)); nm('ps_stock', r.estoque);
      txt('ps_item_cover_image', r.fotos[0]);
      r.fotos.slice(1, 9).forEach(function (f, j) { txt('ps_item_image_' + (j + 1), f); });
      nm('ps_weight', r.peso.toFixed(2));
      if (r.med) { nm('ps_length', r.med[0]); nm('ps_width', r.med[1]); nm('ps_height', r.med[2]); }
      if (corr && opc.correios) txt(corr, 'Ligado');
      if (r.prazo) nm('ps_product_pre_order_dts', r.prazo);
      cs.sort(function (a, b) { return a[0].length - b[0].length || (a[0] < b[0] ? -1 : 1); });
      return '<row r="' + n + '">' + cs.map(function (c) { return c[1]; }).join('') + '</row>';
    }).join('');
    sh = sh.replace(/<row [^>]*r="(\d+)"[^>]*\/>/g, function (x, rr) { return +rr >= 7 ? '' : x; })
      .replace(/<row [^>]*r="(\d+)"[^>]*>[\s\S]*?<\/row>/g, function (x, rr) { return +rr >= 7 ? '' : x; })
      .replace('</sheetData>', linhasXml + '</sheetData>')
      .replace(/activePane="bottom_left"/g, 'activePane="bottomLeft"');
    zip.file(caminho, sh);
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 }, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  function telaShopee(v) {
    setHeader('Planilha da Shopee', '<a class="btn btn-g" href="#/anuncios">Voltar</a>');
    if (falta08() || falta09()) { v.innerHTML = '<div class="card note">Rode os scripts <b>08</b> e <b>09</b> no Supabase primeiro.</div>'; return; }
    var opc = S.ui.shopeeOpc || (S.ui.shopeeOpc = { estoqueEnc: 10, prazo: '', embalagem: 0, correios: true, soNovos: true });
    var marc = S.ui.shopeeMarc || (S.ui.shopeeMarc = {});
    var modeloBuf = S.ui.shopeeModelo || null;
    var ads = S.anuncios.filter(function (a) { var p = byId(S.produtos, a.produto_id); return a.plataforma_id === 'shopee' && !a.arquivado && p && p.ativo && (!opc.soNovos || !(a.publicado || isUrl(a.url))); })
      .sort(function (a, b) { return nomeProduto(a.produto_id).localeCompare(nomeProduto(b.produto_id), 'pt-BR'); });
    var capas = {};
    ads.forEach(function (a) { var p = byId(S.produtos, a.produto_id); var c = (p.fotos || [])[0]; if (c) capas[c] = (capas[c] || 0) + 1; });
    var linhas = ads.map(function (a) {
      var r = linhaShopee(a, { estoqueEnc: opc.estoqueEnc, prazo: num(opc.prazo), embalagem: num(opc.embalagem) || 0 }), p = byId(S.produtos, a.produto_id);
      if (marc[a.id] === undefined) marc[a.id] = !r.problemas.length;
      var aviso = (p.fotos || [])[0] && capas[p.fotos[0]] > 1 ? 'mesma foto de capa de outro anúncio (a Shopee não aceita capa repetida)' : '';
      return { a: a, p: p, r: r, aviso: aviso };
    });
    var sel = linhas.filter(function (l) { return marc[l.a.id] && !l.r.problemas.length; });
    v.innerHTML = '<div class="stack">' +
      '<div class="card note">A planilha sai no <b>modelo oficial da Shopee</b> (Adicionar em massa › modelo básico). Depois de baixar: Seller Centre › Produtos › <b>Adicionar em massa</b> › <b>Fazer upload</b>. A Shopee sugere a categoria de cada produto; confira antes de publicar.</div>' +
      '<div class="card"><h2>Opções</h2><div class="grid g4">' +
      '<div class="field"><label for="sh-est">Estoque para os “sob encomenda”</label><input class="inp" id="sh-est" inputmode="numeric" value="' + esc(opc.estoqueEnc) + '"><div class="hint">Produtos com estoque no sistema usam o estoque real.</div></div>' +
      '<div class="field"><label for="sh-prazo">Prazo de postagem p/ encomenda (dias)</label><input class="inp" id="sh-prazo" inputmode="numeric" value="' + esc(opc.prazo) + '" placeholder="vazio = envio normal"><div class="hint">Só para os sem estoque. Cada categoria aceita uma faixa (ex.: 3 a 15).</div></div>' +
      '<div class="field"><label for="sh-emb">Somar peso da embalagem (g)</label><input class="inp" id="sh-emb" inputmode="numeric" value="' + esc(opc.embalagem) + '"><div class="hint">O frete é calculado pelo peso.</div></div>' +
      '<div class="stack" style="gap:2px;justify-content:flex-end"><label class="check"><input type="checkbox" id="sh-corr"' + (opc.correios ? ' checked' : '') + '> Ativar Correios</label><label class="check"><input type="checkbox" id="sh-novos"' + (opc.soNovos ? ' checked' : '') + '> Só os ainda não publicados</label></div></div>' +
      '<div class="row between wrap" style="margin-top:8px"><span class="small muted">' + (modeloBuf ? 'Usando o modelo que você enviou agora.' : 'Usando o modelo básico baixado em 15/10/2026.') + '</span><label class="btn btn-g btn-s" for="sh-modelo">Usar outro modelo da Shopee</label><input type="file" id="sh-modelo" accept=".xlsx" class="hidden"></div></div>' +
      (linhas.length ? '<div class="card" style="padding:0"><div class="tbl-wrap"><table class="tbl"><thead><tr><th style="width:40px"><input type="checkbox" id="sh-todos" aria-label="Marcar todos"' + (sel.length && sel.length === linhas.filter(function (l) { return !l.r.problemas.length; }).length ? ' checked' : '') + '></th><th>Anúncio</th><th class="num">Preço</th><th class="num hide-m">Estoque</th><th class="num hide-m">Peso</th><th class="num hide-m">Fotos</th><th>Situação</th></tr></thead><tbody>' +
        linhas.map(function (l) {
          var ok = !l.r.problemas.length;
          return '<tr><td><input type="checkbox" data-sh="' + l.a.id + '"' + (marc[l.a.id] && ok ? ' checked' : '') + (ok ? '' : ' disabled') + ' aria-label="Incluir"></td>' +
            '<td><div style="font-weight:700">' + esc(l.r.nome || l.p.nome) + '</div><div class="small muted">' + esc(l.p.nome + (l.a.apelido ? ' · ' + l.a.apelido : '')) + '</div></td>' +
            '<td class="num">' + (l.r.preco ? brl(l.r.preco) : '—') + '</td><td class="num hide-m">' + l.r.estoque + '</td><td class="num hide-m">' + (l.r.peso ? fmt(l.r.peso * 1000, 0) + ' g' : '—') + '</td><td class="num hide-m">' + l.r.fotos.length + '</td>' +
            '<td>' + (ok ? '<span class="pill p-ok">pronto</span>' : l.r.problemas.map(function (x) { return '<span class="pill p-warn">' + esc(x) + '</span>'; }).join(' ')) + (l.aviso ? ' <span class="pill p-info" title="' + esc(l.aviso) + '">capa repetida</span>' : '') +
            (ok ? '' : ' <a class="small" href="#/' + (/peso|foto/.test(l.r.problemas.join()) ? 'produto/' : 'anuncio/') + l.p.id + '">corrigir</a>') + '</td></tr>';
        }).join('') + '</tbody></table></div></div>' : '<div class="card empty">Nenhum anúncio da Shopee ' + (opc.soNovos ? 'por publicar' : '') + '. Crie os textos na página de anúncios de cada produto.</div>') +
      '<div class="sticky-save"><span class="small muted" style="margin-right:auto;align-self:center">' + sel.length + ' anúncio(s) na planilha</span><button class="btn btn-p" id="sh-baixar"' + (sel.length ? '' : ' disabled') + '>Baixar planilha da Shopee</button></div></div>';
    var ler = function () { opc.estoqueEnc = Math.max(1, Math.round(num($('#sh-est').value) || 10)); opc.prazo = $('#sh-prazo').value.trim(); opc.embalagem = Math.max(0, num($('#sh-emb').value) || 0); opc.correios = $('#sh-corr').checked; opc.soNovos = $('#sh-novos').checked; };
    ['#sh-est', '#sh-prazo', '#sh-emb'].forEach(function (s) { $(s).addEventListener('change', function () { ler(); render(); }); });
    ['#sh-corr', '#sh-novos'].forEach(function (s) { $(s).addEventListener('change', function () { ler(); render(); }); });
    $('#sh-modelo').addEventListener('change', async function (e) { var f = e.target.files[0]; if (!f) return; S.ui.shopeeModelo = await f.arrayBuffer(); toast('Modelo carregado ✓'); render(); });
    if ($('#sh-todos')) $('#sh-todos').addEventListener('change', function (e) { linhas.forEach(function (l) { if (!l.r.problemas.length) marc[l.a.id] = e.target.checked; }); render(); });
    v.onchange = function (e) { var c = e.target.closest('[data-sh]'); if (c) { marc[c.dataset.sh] = c.checked; render(); } };
    $('#sh-baixar').addEventListener('click', async function () {
      var b = this; b.disabled = true; b.innerHTML = '<span class="spinner"></span> Montando…';
      try {
        var prazo = num(opc.prazo);
        var rs = sel.map(function (l) { return linhaShopee(l.a, { estoqueEnc: opc.estoqueEnc, prazo: prazo, embalagem: num(opc.embalagem) || 0 }); });
        var blob = await gerarPlanilhaShopee(rs, opc, S.ui.shopeeModelo);
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'shopee-cristart-' + hojeISO() + '.xlsx';
        document.body.appendChild(a); a.click(); a.remove();
        toast('Planilha baixada ✓ — agora suba no Seller Centre');
      } catch (err) { toast(err.message || erroMsg(err), true); }
      b.disabled = false; b.textContent = 'Baixar planilha da Shopee';
    });
  }

  // ================================================================== FOTOS COM IA (Nano Banana)
  var MODOS_FOTO = [
    { v: 'branco', t: '⚪ Fundo branco', d: 'Capa para Shopee e Mercado Livre', p: 'Place the product on a pure white seamless background (#FFFFFF), centered, filling about 85% of the frame, with a soft natural contact shadow. No props, no text, no logos, no other objects.' },
    { v: 'ambiente', t: '🏠 Ambiente', d: 'Num lugar que combina com o produto', p: 'Place the product in a realistic, attractive real-life setting where it would naturally be used, styled like a lifestyle catalog photo. The product must be the clear hero of the image, in sharp focus, with the background slightly blurred.' },
    { v: 'uso', t: '🙌 Em uso', d: 'Alguém usando, mostra o tamanho', p: 'Show the product being used naturally by a person (hands or a person in the scene, face not the focus), so the buyer understands how it is used and its real size. Candid lifestyle photo, warm and inviting.' },
    { v: 'tema', t: '🎄 Data / tema', d: 'Natal, Dia das Crianças, festa…', p: 'Create a festive seasonal scene for the theme described below, with decorative elements around the product that match the theme. Vibrant, joyful, eye-catching colors, but keep it realistic and keep the product clearly visible and unchanged.' },
    { v: 'cartaz', t: '📰 Cartaz / banner', d: 'Com frase e cara de propaganda', p: 'Create an eye-catching advertising poster / banner featuring the product, with a bold modern layout, vibrant colors and the headline text given below written exactly as provided, in Brazilian Portuguese, large and perfectly legible. Leave clean space around the text.' },
    { v: 'detalhe', t: '🔍 Detalhe', d: 'Close mostrando acabamento', p: 'Create a close-up macro product shot highlighting the details, texture and finish of the product, shallow depth of field, studio lighting.' },
    { v: 'kit', t: '🎁 Kit / presente', d: 'Embalado para presente ou em conjunto', p: 'Present the product as a lovely gift: arranged with simple gift packaging (kraft box, ribbon, tissue paper) in a clean, cozy setting, suggesting it is a great present.' },
    { v: 'livre', t: '✍️ Do meu jeito', d: 'Você descreve tudo', p: '' }
  ];
  var PROPORCOES = [{ v: '1:1', t: 'Quadrada 1:1 (marketplaces)' }, { v: '4:5', t: 'Retrato 4:5 (feed do Instagram)' }, { v: '9:16', t: 'Vertical 9:16 (stories, reels, TikTok)' }, { v: '16:9', t: 'Horizontal 16:9 (banner do site)' }];
  function falta12() { return !S.cfg || !('ia_limite_mes' in S.cfg); }
  function inicioMes() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString(); }
  async function gastoMes() {
    var r = await sb.from('ia_uso').select('custo').gte('criado_em', inicioMes());
    if (r.error) return 0;
    return (r.data || []).reduce(function (a, x) { return a + (num(x.custo) || 0); }, 0);
  }
  function promptFoto(p, modo, cena, diretriz, proporcao) {
    var m = MODOS_FOTO.filter(function (x) { return x.v === modo; })[0] || MODOS_FOTO[1];
    return [
      'You are a professional product photographer and retoucher for an e-commerce store in Brazil.',
      'The attached photo(s) show the REAL product: "' + p.nome + '"' + (p.medidas ? ' (approx. size: ' + p.medidas + ')' : '') + '.',
      'CRITICAL: keep the product IDENTICAL to the photo — same shape, proportions, colors, number of parts, text and letters on it, and every detail. Do not redesign, add or remove parts of the product, and keep its real-world scale believable.',
      'Make the result vibrant, bright, sharp and eye-catching, photorealistic, high quality, suitable for marketplace ads.',
      m.p,
      cena ? 'Scene / theme: ' + cena : '',
      diretriz ? 'Extra instructions from the store owner (follow them, they may be in Portuguese): ' + diretriz : '',
      modo === 'cartaz' ? '' : 'Do not add any text, watermark, logo or price to the image.',
      'Aspect ratio: ' + proporcao + '.'
    ].filter(Boolean).join('\n');
  }
  function b64Blob(data, mime) { var bin = atob(data), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: mime || 'image/png' }); }
  function baixarBlob(blob, nome) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); }

  function telaFotos(v, pid) {
    var p = byId(S.produtos, pid);
    if (!p) { setHeader('Fotos com IA'); v.innerHTML = '<div class="card">Produto não encontrado. <a href="#/produtos">Voltar</a></div>'; return; }
    setHeader('🎨 Fotos com IA · ' + p.nome, '<a class="btn btn-g" href="#/anuncio/' + p.id + '">Anúncios</a><a class="btn btn-g" href="#/produto/' + p.id + '">Produto</a>');
    if (falta12()) { v.innerHTML = '<div class="card note">Para usar as fotos com IA, rode o <b>script 12</b> no SQL Editor do Supabase e atualize a página (Ctrl+F5).</div>'; return; }
    var fotos = (p.fotos || []).filter(isUrl);
    if (!fotos.length) { v.innerHTML = '<div class="card note">Este produto ainda não tem foto. A IA precisa de pelo menos uma foto real para usar de base. <a href="#/produto/' + p.id + '">Adicionar fotos no produto</a></div>'; return; }
    var cfg = S.cfg || {}, st = S.ui.fotosIA && S.ui.fotosIA.pid === p.id ? S.ui.fotosIA : (S.ui.fotosIA = { pid: p.id, base: [fotos[0]], modo: 'ambiente', cena: '', diretriz: '', proporcao: '1:1', qtd: 2, ideias: [], res: [] });
    var custoImg = num(cfg.ia_custo_imagem) || 0.25, limite = num(cfg.ia_limite_mes) || 30;
    v.innerHTML = '<div class="stack">' +
      '<div class="card"><h2>1. Foto real de base <span class="small muted">(marque 1 a 3)</span></h2><div class="row wrap" style="gap:10px" id="ft-base">' +
      fotos.map(function (f) { return '<button type="button" class="ft-base' + (st.base.indexOf(f) >= 0 ? ' on' : '') + '" data-base="' + esc(f) + '"><img src="' + esc(f) + '" alt="Foto do produto" loading="lazy"></button>'; }).join('') + '</div></div>' +
      '<div class="card"><h2>2. Que tipo de foto?</h2><div class="ft-modos" id="ft-modos">' +
      MODOS_FOTO.map(function (m) { return '<button type="button" class="ft-modo' + (m.v === st.modo ? ' on' : '') + '" data-modo="' + m.v + '"><b>' + esc(m.t) + '</b><span>' + esc(m.d) + '</span></button>'; }).join('') + '</div>' +
      '<div id="ft-cena-box" style="margin-top:12px"></div>' +
      '<div class="grid g2" style="margin-top:12px"><div class="field"><label for="ft-dir">Suas diretrizes (opcional)</label><textarea class="inp" id="ft-dir" rows="3" placeholder="ex.: criança de uns 6 anos brincando no tapete da sala, luz de fim de tarde; ou: frase do cartaz &quot;Monte o seu!&quot;">' + esc(st.diretriz) + '</textarea></div>' +
      '<div class="stack" style="gap:10px"><div class="field"><label for="ft-prop">Formato</label><select class="inp" id="ft-prop">' + PROPORCOES.map(function (x) { return '<option value="' + x.v + '"' + (x.v === st.proporcao ? ' selected' : '') + '>' + esc(x.t) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="ft-qtd">Quantas versões</label><select class="inp" id="ft-qtd">' + [1, 2, 3, 4].map(function (n) { return '<option' + (n === st.qtd ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></div></div></div>' +
      '<div class="row between wrap" style="margin-top:10px"><span class="small muted" id="ft-gasto">Calculando o gasto do mês…</span><button type="button" class="btn btn-p" id="ft-gerar">🎨 Gerar fotos</button></div></div>' +
      '<div id="ft-res"></div></div>';

    function drawCena() {
      var box = $('#ft-cena-box');
      if (st.modo === 'branco' || st.modo === 'livre' || st.modo === 'detalhe') { box.innerHTML = ''; return; }
      var rot = st.modo === 'tema' ? 'Tema' : st.modo === 'cartaz' ? 'Frase do cartaz' : 'Cenário';
      var ph = st.modo === 'tema' ? 'ex.: Natal, com pinheiro e luzes' : st.modo === 'cartaz' ? 'ex.: Organize suas canetas com estilo!' : 'ex.: escrivaninha de estudante, clara e organizada';
      box.innerHTML = '<div class="field"><div class="row between wrap"><label for="ft-cena">' + rot + '</label>' + (st.modo === 'cartaz' ? '' : '<button type="button" class="btn btn-g btn-s" id="ft-ideias">💡 Sugerir ideias para este produto</button>') + '</div>' +
        '<input class="inp" id="ft-cena" value="' + esc(st.cena) + '" placeholder="' + esc(ph) + '">' +
        (st.modo === 'tema' && !st.ideias.length ? '<div class="row wrap" style="gap:6px;margin-top:8px">' + ['Natal', 'Dia das Crianças', 'Dia das Mães', 'Dia dos Pais', 'Páscoa', 'Black Friday', 'Volta às aulas', 'Festa de aniversário'].map(function (t) { return '<button type="button" class="chip" data-ideia="' + esc(t) + '">' + esc(t) + '</button>'; }).join('') + '</div>' : '') +
        (st.ideias.length ? '<div class="row wrap" style="gap:6px;margin-top:8px">' + st.ideias.map(function (t) { return '<button type="button" class="chip" data-ideia="' + esc(t) + '">' + esc(t) + '</button>'; }).join('') + '</div>' : '') +
        (st.modo === 'cartaz' ? '<div class="hint">A IA às vezes erra letras em textos. Confira antes de usar; frases curtas funcionam melhor.</div>' : '') + '</div>';
    }
    function drawRes() {
      var box = $('#ft-res');
      if (!st.res.length) { box.innerHTML = ''; return; }
      box.innerHTML = '<div class="card"><div class="row between wrap"><h2 style="margin:0">Resultado</h2><button type="button" class="btn btn-g btn-s" id="ft-baixar-todas">Baixar todas</button></div><div class="hint" style="margin:6px 0 12px">Confira se o produto ficou igual ao real. Só fica guardado o que você adicionar ao produto ou baixar.</div><div class="ft-grid">' +
        st.res.map(function (r, i) {
          return '<div class="ft-item' + (r.salva ? ' salva' : '') + '"><img class="zoomable" src="' + r.url + '" data-zoom="' + esc(JSON.stringify([r.url])) + '" alt="Foto gerada ' + (i + 1) + '"><div class="small muted" style="margin:6px 0">' + esc(r.rotulo) + '</div><div class="row wrap" style="gap:6px">' +
            (r.salva ? '<span class="pill p-ok">nas fotos do produto ✓</span>' : '<button type="button" class="btn btn-p btn-s" data-ft="add" data-i="' + i + '">+ Fotos do produto</button><button type="button" class="btn btn-g btn-s" data-ft="capa" data-i="' + i + '">Usar como capa</button>') +
            '<button type="button" class="btn btn-g btn-s" data-ft="baixar" data-i="' + i + '">Baixar</button><button type="button" class="icon-btn" data-ft="x" data-i="' + i + '" aria-label="Descartar">' + BTN_DEL + '</button></div></div>';
        }).join('') + '</div></div>';
    }
    async function drawGasto() {
      var g = await gastoMes(); st.gasto = g;
      var el = $('#ft-gasto'); if (!el) return;
      el.innerHTML = 'Cada foto custa ~' + brl(custoImg) + ' · gerar ' + st.qtd + ' ≈ <b>' + brl(custoImg * st.qtd) + '</b> · usado este mês: <b>' + brl(g) + '</b> de ' + brl(limite);
    }
    drawCena(); drawRes(); drawGasto();

    $('#ft-base').addEventListener('click', function (e) {
      var b = e.target.closest('[data-base]'); if (!b) return;
      var f = b.dataset.base, k = st.base.indexOf(f);
      if (k >= 0) { if (st.base.length === 1) return toast('Deixe pelo menos uma foto de base', true); st.base.splice(k, 1); }
      else { if (st.base.length >= 3) return toast('No máximo 3 fotos de base', true); st.base.push(f); }
      b.classList.toggle('on', st.base.indexOf(f) >= 0);
    });
    $('#ft-modos').addEventListener('click', function (e) {
      var b = e.target.closest('[data-modo]'); if (!b) return;
      st.modo = b.dataset.modo; st.ideias = []; st.cena = '';
      $$('#ft-modos .ft-modo').forEach(function (x) { x.classList.toggle('on', x === b); });
      if (st.modo === 'branco' && st.proporcao !== '1:1') { st.proporcao = '1:1'; $('#ft-prop').value = '1:1'; }
      drawCena();
    });
    v.oninput = function (e) {
      if (e.target.id === 'ft-cena') st.cena = e.target.value;
      if (e.target.id === 'ft-dir') st.diretriz = e.target.value;
    };
    v.onchange = function (e) {
      if (e.target.id === 'ft-prop') st.proporcao = e.target.value;
      if (e.target.id === 'ft-qtd') { st.qtd = +e.target.value; drawGasto(); }
    };
    $('#ft-cena-box').addEventListener('click', async function (e) {
      var c = e.target.closest('[data-ideia]'); if (c) { st.cena = c.dataset.ideia; $('#ft-cena').value = st.cena; return; }
      if (e.target.id !== 'ft-ideias') return;
      var b = e.target; b.disabled = true; b.innerHTML = '<span class="spinner"></span> Pensando…';
      try {
        var pedido = st.modo === 'tema' ? 'temas sazonais ou datas comemorativas brasileiras em que este produto venderia bem (com a decoração que combina)' : st.modo === 'uso' ? 'situações de uso com pessoas que mostram bem o produto e o tamanho dele' : 'cenários/ambientes realistas onde este produto fica bonito e faz sentido';
        var r = await sb.functions.invoke('gerar-anuncio', { body: {
          prompt: 'Produto de uma loja de impressão 3D de Curitiba: ' + JSON.stringify(dadosProdutoIA(p)) + '\nSugira 5 ' + pedido + ' para uma foto de anúncio. Cada sugestão em português, curta (até 12 palavras), concreta e visual.',
          fotos: st.base.slice(0, 1), modelo: cfg.ia_modelo || 'gemini-3.8-flash',
          schema: { type: 'OBJECT', properties: { ideias: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['ideias'] }
        } });
        if (r.error) throw new Error(await erroFuncao(r.error));
        if (!r.data || !r.data.dados) throw new Error('A função do Supabase está na versão antiga. Publique de novo o código novo da função gerar-anuncio.');
        st.ideias = (r.data.dados.ideias || []).slice(0, 6); drawCena();
      } catch (err) { toast(err.message, true); b.disabled = false; b.textContent = '💡 Sugerir ideias para este produto'; }
    });
    $('#ft-gerar').addEventListener('click', async function () {
      var b = this;
      if (st.modo === 'livre' && !st.diretriz.trim()) return toast('No modo "Do meu jeito", escreva as diretrizes', true);
      if (st.modo === 'cartaz' && !st.cena.trim()) return toast('Escreva a frase do cartaz', true);
      var g = st.gasto != null ? st.gasto : await gastoMes();
      if (g + custoImg * st.qtd > limite + 0.001) return toast('Isso passaria do teto do mês (' + brl(limite) + '). Já foram ' + brl(g) + '. Dá para mudar o teto em Configurações.', true);
      b.disabled = true; b.innerHTML = '<span class="spinner"></span> Criando (até 1 minuto)…';
      try {
        var r = await sb.functions.invoke('gerar-anuncio', { body: { tipo: 'imagem', prompt: promptFoto(p, st.modo, st.cena.trim(), st.diretriz.trim(), st.proporcao), fotos: st.base, quantidade: st.qtd, proporcao: st.proporcao, modelo_imagem: cfg.ia_modelo_imagem || 'gemini-nano-banana-2.1' } });
        if (r.error) throw new Error(await erroFuncao(r.error));
        if (r.data && r.data.erro) throw new Error(r.data.erro);
        if (!r.data || !r.data.imagens) throw new Error('A função do Supabase está na versão antiga. Publique de novo o código novo da função gerar-anuncio.');
        var m = MODOS_FOTO.filter(function (x) { return x.v === st.modo; })[0];
        var rot = m.t.replace(/^\S+\s/, '') + (st.cena ? ' · ' + st.cena : '') + ' · ' + st.proporcao;
        r.data.imagens.forEach(function (im) { var bl = b64Blob(im.data, im.mime); st.res.unshift({ blob: bl, url: URL.createObjectURL(bl), rotulo: rot }); });
        try { await sb.from('ia_uso').insert({ tipo: 'imagem', quantidade: r.data.imagens.length, custo: Math.round(custoImg * r.data.imagens.length * 100) / 100, produto_id: p.id, modelo: r.data.modelo }); } catch (x) { }
        st.gasto = null; drawRes(); drawGasto();
        if (r.data.falhas) toast(r.data.falhas + ' versão(ões) não saíram; as outras estão prontas', true);
        $('#ft-res').scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (err) { toast(err.message, true); }
      b.disabled = false; b.textContent = '🎨 Gerar fotos';
    });
    async function adicionar(i, capa) {
      var r = st.res[i];
      try {
        var jpg = await comprimir(new File([r.blob], 'ia.png', { type: r.blob.type }), 1600, 0.88);
        var url = await enviarFoto(jpg, 'produtos/' + p.id);
        var atual = (byId(S.produtos, p.id).fotos || []).slice();
        var novas = capa ? [url].concat(atual) : atual.concat([url]);
        var pr = q(await sb.from('produtos').update({ fotos: novas }).eq('id', p.id).select().single());
        S.produtos = S.produtos.map(function (x) { return x.id === pr.id ? pr : x; }); p = pr;
        r.salva = true; drawRes();
        toast(capa ? 'Virou a capa do produto ✓ (site e anúncios)' : 'Adicionada às fotos do produto ✓ (site e anúncios)');
      } catch (err) { toast('Não salvou: ' + erroMsg(err), true); }
    }
    $('#ft-res').addEventListener('click', function (e) {
      if (e.target.id === 'ft-baixar-todas') { st.res.forEach(function (r, i) { baixarBlob(r.blob, norm(p.nome).replace(/[^a-z0-9]+/g, '-') + '-ia-' + (i + 1) + '.png'); }); return; }
      var b = e.target.closest('[data-ft]'); if (!b) return;
      var i = +b.dataset.i, a = b.dataset.ft;
      if (a === 'baixar') baixarBlob(st.res[i].blob, norm(p.nome).replace(/[^a-z0-9]+/g, '-') + '-ia-' + (i + 1) + '.png');
      if (a === 'add') adicionar(i, false);
      if (a === 'capa') adicionar(i, true);
      if (a === 'x') { URL.revokeObjectURL(st.res[i].url); st.res.splice(i, 1); drawRes(); }
    });
  }

  // ------------------------------------------------------------------ EM BREVE
  function telaEmBreve(v, t) {
    var nomes = { producao: ['Produção e perdas', 'etapa 2'], vendas: ['Vendas', 'etapa 2'], relatorios: ['Relatórios', 'etapa 2'], anuncios: ['Anúncios com IA', 'etapa 3'] };
    var n = nomes[t];
    setHeader(n[0]);
    v.innerHTML = '<div class="card empty"><h2>' + esc(n[0]) + '</h2><p>Chega na <b>' + n[1] + '</b>. O banco de dados já está pronto para ele.</p><a class="btn btn-g" href="#/painel">Voltar ao painel</a></div>';
  }

  // clique em linhas de tabela com data-href
  document.addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-href]');
    if (tr && !e.target.closest('a,button,input,select,label')) go(tr.dataset.href);
  });

  // ------------------------------------------------------------------ LOGIN
  var modoRecuperar = false;
  function mostrarLogin(msg) {
    $('#app').classList.add('hidden');
    $('#login').classList.remove('hidden');
    $('#f-nova').classList.toggle('hidden', !modoRecuperar);
    $('#f-email').classList.toggle('hidden', modoRecuperar);
    $('#f-senha').classList.toggle('hidden', modoRecuperar);
    $('#forgot-btn').classList.toggle('hidden', modoRecuperar);
    $('#login-title').textContent = modoRecuperar ? 'Crie a sua nova senha.' : 'Entre com o seu e-mail e senha.';
    $('#login-btn').textContent = modoRecuperar ? 'Salvar nova senha' : 'Entrar';
    var err = $('#login-err');
    err.classList.toggle('hidden', !msg); err.textContent = msg || '';
  }
  $('#login-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var btn = $('#login-btn'); btn.disabled = true;
    try {
      if (modoRecuperar) {
        var nova = $('#nova').value;
        if (nova.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
        q(await sb.auth.updateUser({ password: nova }));
        modoRecuperar = false; toast('Senha alterada ✓');
        history.replaceState(null, '', location.pathname + '#/painel');
        await entrar();
      } else {
        q(await sb.auth.signInWithPassword({ email: $('#email').value.trim(), password: $('#senha').value }));
        await entrar();
      }
    } catch (err) { mostrarLogin(erroMsg(err)); }
    btn.disabled = false;
  });
  $('#forgot-btn').addEventListener('click', async function () {
    var email = $('#email').value.trim();
    if (!email) return mostrarLogin('Digite o seu e-mail primeiro.');
    try {
      q(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }));
      mostrarLogin(''); toast('Se o e-mail estiver cadastrado, chega um link para criar nova senha.');
    } catch (err) { mostrarLogin(erroMsg(err)); }
  });
  $('#logout').addEventListener('click', async function () {
    await sb.auth.signOut(); S.ready = false; S.user = null; mostrarLogin('');
  });
  sb.auth.onAuthStateChange(function (ev) {
    if (ev === 'PASSWORD_RECOVERY') { modoRecuperar = true; mostrarLogin(''); }
  });

  async function entrar() {
    var s = q(await sb.auth.getSession());
    if (!s.session) return mostrarLogin('');
    if (modoRecuperar) return mostrarLogin('');
    S.user = s.session.user;
    var email = (S.user.email || '').toLowerCase();
    var mem = q(await sb.from('membros').select('*'));
    S.membro = (mem || []).filter(function (m) { return m.email.toLowerCase() === email; })[0] || null;
    if (!S.membro) {
      await sb.auth.signOut();
      return mostrarLogin('O e-mail ' + email + ' não está liberado neste sistema.');
    }
    $('#login').classList.add('hidden');
    $('#app').classList.remove('hidden');
    $('#who').textContent = 'Olá, ' + S.membro.nome;
    $('#view').innerHTML = '<div class="loading">Carregando…</div>';
    try { await loadAll(); }
    catch (err) { $('#view').innerHTML = '<div class="card err">Não consegui carregar os dados: ' + esc(erroMsg(err)) + '<br><span class="small muted">Os scripts 01 e 02 foram rodados no Supabase?</span></div>'; return; }
    render();
  }

  // exposto para testes automatizados
  window.__cristart = { S: S, custoProduto: custoProduto, arred: arred, precoPlataforma: precoPlataforma, num: num };

  entrar().catch(function (err) { mostrarLogin(erroMsg(err)); });
})();
