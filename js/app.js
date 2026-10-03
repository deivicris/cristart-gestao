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
    produtos: [], prodInsumos: [], anuncios: [], membros: [], carreteis: [],
    ui: { prodBusca: '', prodCat: '', prodStatus: '', verArquivados: false, filOrd: 'restante', ord: {}, busca: {} }
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
      sb.from('membros').select('*').order('criado_em')
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
    var rc = await sb.from('carreteis').select('*');
    S.carreteis = rc.error ? [] : (rc.data || []);
    S.faltaScript04 = !!rc.error;
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
    { id: 'producao', t: 'Produção e perdas', soon: 'etapa 2' },
    { id: 'vendas', t: 'Vendas', soon: 'etapa 2' },
    { id: 'relatorios', t: 'Relatórios', soon: 'etapa 2' },
    { id: 'anuncios', t: 'Anúncios com IA', soon: 'etapa 3' },
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
    var base = tela === 'produto' ? 'produtos' : tela;
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
        case 'producao': case 'vendas': case 'relatorios': case 'anuncios': return telaEmBreve(v, r.tela);
        default: go('#/painel');
      }
    } catch (e) {
      console.error(e);
      v.innerHTML = '<div class="card err">Algo deu errado nesta tela: ' + esc(e.message) + '</div>';
    }
  }

  // ------------------------------------------------------------------ PAINEL
  function telaPainel(v) {
    setHeader('Painel', '<a class="btn btn-p" href="#/produto/novo">+ <span class="long">Novo produto</span></a>');
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
    baixos.forEach(function (f) { alertas.push(['p-warn', 'Filamento', esc(f.tipo + ' ' + f.cor) + ' — restam ~' + fmt(num(f.restante_g), 0) + ' g' + (isUrl(f.link_compra) ? ' · <a href="' + esc(f.link_compra) + '" target="_blank" rel="noopener">Comprar de novo ↗</a>' : '')]); });
    insBaixo.forEach(function (i) { alertas.push(['p-warn', 'Insumo', esc(i.nome) + ' — ' + fmt(num(i.estoque)) + ' ' + esc(un(i)) + ' em estoque']); });
    if (semDados.length) alertas.push(['p-info', 'Produtos', semDados.length + ' produto(s) impresso(s) sem gramas ou tempo — o custo fica incompleto. <a href="#/produtos?f=incompletos">Ver</a>']);
    if (semCustoRev.length) alertas.push(['p-info', 'Revenda', semCustoRev.length + ' produto(s) de revenda sem custo de compra.']);
    if (semFoto.length) alertas.push(['p-mut', 'Fotos', semFoto.length + ' produto(s) sem foto.']);
    if (!S.filamentos.length) alertas.push(['p-info', 'Começo', 'Cadastre os rolos de filamento para o custo por grama ficar exato. <a href="#/filamentos">Ir para Filamentos</a>']);
    if (!S.equipamentos.length) alertas.push(['p-info', 'Começo', 'Cadastre as impressoras (com a potência em watts) para calcular a energia. <a href="#/equipamentos">Ir para Equipamentos</a>']);
    if (!S.produtos.length) alertas.push(['p-info', 'Começo', 'Importe o catálogo do site em <a href="#/config">Configurações</a>.']);

    v.innerHTML =
      '<div class="stack">' +
      '<div class="grid g4">' +
      kpi('Produtos ativos', ativos.length, S.produtos.length - ativos.length ? (S.produtos.length - ativos.length) + ' inativo(s)' : '') +
      kpi('Peças em estoque', pecas, 'valem ' + brl(valorVenda) + ' em venda') +
      kpi('Custo do estoque', brl(valorCusto), 'o que foi investido nas peças prontas') +
      kpi('Filamento disponível', fmt(gramas / 1000, 2) + ' kg', rolos.length + ' rolo(s) em uso') +
      '</div>' +
      '<div class="grid g2">' +
      '<div class="card"><h2>Alertas</h2>' + (alertas.length ? '<div class="stack" style="gap:10px">' + alertas.map(function (a) {
        return '<div class="row" style="align-items:flex-start"><span class="pill ' + a[0] + '">' + a[1] + '</span><div class="small" style="padding-top:2px">' + a[2] + '</div></div>';
      }).join('') + '</div>' : '<div class="muted">Tudo em ordem por aqui. 👌</div>') + '</div>' +
      '<div class="card"><h2>Mais lucrativos por unidade</h2>' + topLucro() + '</div>' +
      '</div>' +
      '<div class="note">Vendas, produção, perdas e relatórios por período chegam na <b>etapa 2</b>. Por enquanto, ajuste o estoque direto na ficha de cada produto.</div>' +
      '</div>';
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
          var ads = S.anuncios.filter(function (a) { return a.produto_id === p.id && (a.url || a.publicado); });
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
    var ads = {};
    S.anuncios.filter(function (a) { return a.produto_id === p.id; }).forEach(function (a) { ads[a.plataforma_id] = JSON.parse(JSON.stringify(a)); });

    setHeader(novo ? 'Novo produto' : p.nome, '<a class="btn btn-g" href="#/produtos">Voltar</a>');

    var fBasico = [
      { k: 'nome', label: 'Nome do produto', span: 2 },
      { k: 'categoria', label: 'Categoria', type: 'select', opts: categorias() },
      { k: 'tipo_produto', label: 'Tipo', type: 'select', opts: [{ v: 'impresso', t: 'Impresso por nós' }, { v: 'revenda', t: 'Revenda' }] }
    ];
    var fFlags = [
      { k: 'ativo', label: 'Ativo', type: 'check' },
      { k: 'mostrar_no_site', label: 'Mostrar no site', type: 'check' },
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
      '<div class="card"><h2>Onde está anunciado</h2><div id="ads" class="ads"></div>' +
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

    // anúncios
    function drawAds(preco) {
      $('#ads').innerHTML = S.plataformas.filter(function (pl) { return pl.ativa; }).map(function (pl) {
        var a = ads[pl.id] || {}; var sug = precoPlataforma(preco, pl);
        return '<div class="ad-row" data-plat="' + pl.id + '">' +
          '<label class="check ad-name"><input type="checkbox" data-ad="pub" data-pl="' + pl.id + '"' + (a.publicado ? ' checked' : '') + '> ' + esc(pl.nome) + '</label>' +
          '<input class="inp ad-url" data-ad="url" data-pl="' + pl.id + '" value="' + esc(a.url || '') + '" placeholder="cole o link do anúncio" aria-label="Link do anúncio em ' + esc(pl.nome) + '">' +
          '<div class="ad-price"><input class="inp" data-ad="preco" data-pl="' + pl.id + '" inputmode="decimal" value="' + esc(fmtIn(a.preco)) + '" placeholder="' + esc(sug ? fmtIn(sug.toFixed(2)) : 'preço lá') + '" style="text-align:right" aria-label="Preço em ' + esc(pl.nome) + '"><div class="hint">' + (sug ? 'sugerido ' + brl(sug) : '') + '</div></div>' +
          '<div class="ad-open">' + (isUrl(a.url) ? '<a class="btn btn-g btn-s" href="' + esc(a.url) + '" target="_blank" rel="noopener">Abrir ' + ICON.ext + '</a>' : '') + '</div></div>';
      }).join('');
    }
    $('#ads').addEventListener('input', function (e) {
      var el = e.target, pl = el.dataset.pl; if (!pl) return;
      ads[pl] = ads[pl] || { produto_id: p.id, plataforma_id: pl };
      if (el.dataset.ad === 'url') ads[pl].url = el.value.trim() || null;
      if (el.dataset.ad === 'preco') ads[pl].preco = num(el.value);
      dirty = true;
    });
    $('#ads').addEventListener('change', function (e) {
      var el = e.target, pl = el.dataset.pl; if (!pl) return;
      ads[pl] = ads[pl] || { produto_id: p.id, plataforma_id: pl };
      if (el.dataset.ad === 'pub') ads[pl].publicado = el.checked;
      if (el.dataset.ad === 'url') { drawAds(num($('[data-k="preco"]').value)); }
      dirty = true;
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
        // anúncios
        var adRows = Object.keys(ads).map(function (k) {
          var a = ads[k];
          return { produto_id: p.id, plataforma_id: k, url: a.url || null, preco: num(a.preco), publicado: !!a.publicado, titulo: a.titulo || null, descricao: a.descricao || null, atualizado_em: new Date().toISOString() };
        });
        if (adRows.length) q(await sb.from('produto_anuncios').upsert(adRows));
        // atualiza cache
        S.produtos = S.produtos.filter(function (x) { return x.id !== saved.id; }).concat([saved]);
        S.prodInsumos = S.prodInsumos.filter(function (x) { return x.produto_id !== p.id; }).concat(lin);
        S.anuncios = S.anuncios.filter(function (x) { return x.produto_id !== p.id; }).concat(adRows);
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
      '<button type="button" class="btn btn-g btn-s" data-pesar="' + f.id + '" title="Pesar na balança">⚖ Pesar' + (car ? '' : '') + '</button></div></div>';
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
        var comprar = isUrl(i.link_compra) ? '<a href="' + esc(i.link_compra) + '" target="_blank" rel="noopener" style="font-weight:700;text-decoration:none">Comprar de novo ↗</a>' : '<button class="btn btn-g btn-s" data-edit="' + i.id + '">+ Colar link</button>';
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
  function horasTotais(e) { return num(e.horas_iniciais) || 0; } // etapa 2: + horas das impressões registradas
  var F_EQ = [
    { k: 'nome', label: 'Nome', span: 2, ph: 'ex.: Kobra 4 · #1' },
    { k: 'tipo', label: 'Tipo', type: 'select', opts: TIPOS_EQ },
    { k: 'status', label: 'Status', type: 'select', opts: [{ v: 'ativo', t: 'Em uso' }, { v: 'chegando', t: 'Chegando' }, { v: 'manutencao', t: 'Em manutenção' }, { v: 'desativado', t: 'Desativado' }] },
    { k: 'marca', label: 'Marca', list: ['Anycubic', 'Bambu Lab', 'Creality', 'Elegoo', 'Epson'] },
    { k: 'modelo', label: 'Modelo' },
    { k: 'valor_pago', label: 'Valor pago (R$)', type: 'num' },
    { k: 'data_compra', label: 'Data da compra', type: 'date' },
    { k: 'potencia_w', label: 'Consumo médio (W)', type: 'int', hint: 'Impressora 3D imprimindo PLA. Na dúvida: 120' },
    { k: 'horas_iniciais', label: 'Horas totais', type: 'num', hint: 'Horas que ela já rodou' },
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
      '<div class="note">As horas por semana, quinzena e mês aparecem na <b>etapa 2</b>, quando as impressões começarem a ser registradas.</div></div>';
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
      var r = q(await sb.from('equipamentos').update({ horas_iniciais: h }).eq('id', id).select().single());
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
        if (adRows.length) { q(await sb.from('produto_anuncios').upsert(adRows)); S.anuncios = S.anuncios.concat(adRows); }
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
