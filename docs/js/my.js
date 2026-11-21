/* listen.22cs.xyz — personal listening data, kept ONLY in this browser (no account, nothing uploaded).
   build_hub.py copies this file to docs/js/my.js; list pages, the home page and /me/ load it synchronously before their own scripts.

   localStorage "l22-progress" (v1):
     lists: { "<list path>": { t: total, title, u: unit, c: [recent cover paths ≤5], at: last change ms, h: { "<item id>": ms } } }
     works: { "<work key>": { r: 0–5 step .5 (0 = no rating), n: note ≤2000 chars, t: updated ms, c: created ms,
                              ti: title, ar: artist, k: kind, img: cover path, from: list path, fromT: list title } }
   Work key = build.py wkey(): "<kind letter>:<normalised artist>|<normalised title>" so a rating follows the work across lists.
   Import merges per item by newest timestamp, so a later sync code / account can reuse the same merge. */
(function () {
  'use strict';
  var KEY = 'l22-progress', doc = document;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var blank = function () { return { v: 1, lists: {}, works: {} }; };
  function load() {
    try {
      var d = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (d && d.v === 1 && d.lists && typeof d.lists === 'object') { if (!d.works || typeof d.works !== 'object') d.works = {}; return d; }
    } catch (e) {}
    return blank();
  }
  var subs = [];
  function emit() { subs.forEach(function (f) { try { f(); } catch (e) {} }); }
  var asked = false;
  function persist() {  // ask the browser not to evict this site's storage (Safari / Chrome may grant it)
    if (asked) return; asked = true;
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persisted().then(function (p) { if (!p) navigator.storage.persist(); }); } catch (e) {}
  }
  function save(d) {
    try { localStorage.setItem(KEY, JSON.stringify(d)); }
    catch (e) { alert('這台裝置的瀏覽器無法儲存紀錄（可能是無痕模式或儲存空間已滿）。'); return false; }
    persist(); emit(); return true;
  }
  window.addEventListener('storage', function (e) { if (e.key === KEY || e.key === null) emit(); });

  /* ---------- lists (已聽) ---------- */
  function setHeard(path, id, on, info) {
    var d = load(), L = d.lists[path] || (d.lists[path] = { h: {} });
    if (!L.h || typeof L.h !== 'object') L.h = {};
    L.t = info.t; L.title = info.title; if (info.u) L.u = info.u;
    L.c = (L.c || []).filter(function (u) { return u !== info.img; });
    if (on) { L.h[id] = Date.now(); if (info.img) L.c.unshift(info.img); L.c = L.c.slice(0, 5); }
    else delete L.h[id];
    L.at = Date.now();
    if (!Object.keys(L.h).length) delete d.lists[path];
    save(d);
  }
  function clearList(path) { var d = load(); delete d.lists[path]; save(d); }
  function lists() {
    var d = load();
    return Object.keys(d.lists).map(function (p) {
      var L = d.lists[p] || {}, h = L.h || {}, ids = Object.keys(h), t = +L.t || 0, n = t ? Math.min(ids.length, t) : ids.length;
      var last = ids.reduce(function (m, k) { return Math.max(m, +h[k] || 0); }, +L.at || 0);
      return { p: p, title: L.title || p, t: t, n: n, u: L.u || '', c: (L.c || []).slice(0, 5), last: last, done: t > 0 && n >= t };
    }).filter(function (x) { return x.n > 0; }).sort(function (a, b) { return b.last - a.last; });
  }

  /* ---------- works (評分 · 筆記) ---------- */
  function work(wk) { return load().works[wk] || null; }
  function saveWork(wk, data, meta) {
    var d = load(), w = d.works[wk], r = Math.round((+data.r || 0) * 2) / 2, n = String(data.n || '').trim().slice(0, 2000);
    r = Math.max(0, Math.min(5, r));
    if (!r && !n) delete d.works[wk];
    else {
      var o = {}, k;
      for (k in (w || {})) o[k] = w[k];
      for (k in (meta || {})) if (meta[k] != null) o[k] = meta[k];
      o.r = r; o.n = n; o.t = Date.now(); o.c = (w && w.c) || Date.now();
      d.works[wk] = o;
    }
    return save(d);
  }
  function works() {
    var d = load();
    return Object.keys(d.works).map(function (k) { var w = d.works[k]; w.wk = k; return w; });
  }

  /* ---------- backup ---------- */
  function stamp() { var t = new Date(); return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); }
  function exportFile() {
    var d = load(); d.exportedAt = new Date().toISOString(); d.site = location.host;
    var blob = new Blob([JSON.stringify(d, null, 1)], { type: 'application/json' }), a = doc.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'listen-22cs-backup-' + stamp() + '.json';
    doc.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  var str = function (v, n) { return typeof v === 'string' ? v.slice(0, n) : ''; };
  var pathOk = function (v) { return typeof v === 'string' && /^\/[^\s<>"']{0,300}$/.test(v); };
  function merge(inc) {
    if (!inc || inc.v !== 1 || typeof inc.lists !== 'object') throw new Error('format');
    var d = load(), nl = 0, nw = 0;
    Object.keys(inc.lists || {}).forEach(function (p) {
      var I = inc.lists[p]; if (!pathOk(p) || !I || typeof I.h !== 'object') return;
      var L = d.lists[p] || (d.lists[p] = { h: {} }), add = 0;
      Object.keys(I.h).forEach(function (id) {
        var ts = +I.h[id]; if (!(ts > 0) || !/^[\w-]{1,40}$/.test(id)) return;
        if (!(id in L.h) || L.h[id] < ts) { L.h[id] = ts; add++; }
      });
      if (+I.t > 0 && !L.t) L.t = +I.t;
      if (!L.title) L.title = str(I.title, 200);
      if (!L.u) L.u = str(I.u, 12);
      if (!L.c || !L.c.length) L.c = (Array.isArray(I.c) ? I.c : []).filter(pathOk).slice(0, 5);
      L.at = Math.max(+L.at || 0, +I.at || 0);
      if (!Object.keys(L.h).length) delete d.lists[p]; else if (add) nl++;
    });
    Object.keys(inc.works || {}).forEach(function (k) {
      var w = inc.works[k]; if (!w || typeof w !== 'object' || k.length > 400) return;
      var r = Math.round((+w.r || 0) * 2) / 2, n = str(w.n, 2000), t = +w.t || 0;
      if (!(r >= 0 && r <= 5)) r = 0;
      if (!r && !n) return;
      var cur = d.works[k];
      if (cur && (+cur.t || 0) >= t) return;
      d.works[k] = { r: r, n: n, t: t || Date.now(), c: +w.c || t || Date.now(), ti: str(w.ti, 300), ar: str(w.ar, 300), k: str(w.k, 12),
        img: pathOk(w.img) ? w.img : '', from: pathOk(w.from) ? w.from : '', fromT: str(w.fromT, 200) };
      nw++;
    });
    save(d);
    return { lists: nl, works: nw };
  }
  /* read + validate a backup file WITHOUT touching stored data; merge() only runs after the visitor confirms */
  function readFile(file) {
    return new Promise(function (ok, bad) {
      if (!file) return bad(new Error('none'));
      if (file.size > 5e6) return bad(new Error('size'));
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var inc = JSON.parse(fr.result);
          if (!inc || inc.v !== 1 || typeof inc.lists !== 'object') throw new Error('format');
          var nl = 0, nh = 0, nw = 0;
          Object.keys(inc.lists || {}).forEach(function (p) { var I = inc.lists[p]; if (pathOk(p) && I && typeof I.h === 'object') { var k = Object.keys(I.h).length; if (k) { nl++; nh += k; } } });
          Object.keys(inc.works || {}).forEach(function (k) { var w = inc.works[k]; if (w && typeof w === 'object' && ((+w.r > 0) || (typeof w.n === 'string' && w.n.trim()))) nw++; });
          ok({ data: inc, name: file.name, lists: nl, heard: nh, works: nw, at: inc.exportedAt || '' });
        } catch (e) { bad(e); }
      };
      fr.onerror = function () { bad(fr.error); };
      fr.readAsText(file);
    });
  }
  function importFile(file) { return readFile(file).then(function (r) { return merge(r.data); }); }
  function available() { try { var k = '__l22t'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; } catch (e) { return false; } }

  function wipe() { try { localStorage.removeItem(KEY); } catch (e) {} emit(); }

  /* ---------- helpers ---------- */
  function rel(ts) {
    if (!ts) return '';
    var s = (Date.now() - ts) / 1000;
    if (s < 60) return '剛剛';
    if (s < 3600) return Math.floor(s / 60) + ' 分鐘前';
    if (s < 86400) return Math.floor(s / 3600) + ' 小時前';
    var dd = Math.floor(s / 86400);
    if (dd === 1) return '昨天';
    if (dd < 30) return dd + ' 天前';
    var t = new Date(ts); return (t.getFullYear() !== new Date().getFullYear() ? t.getFullYear() + ' 年 ' : '') + (t.getMonth() + 1) + ' 月 ' + t.getDate() + ' 日';
  }
  var STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.84 5.76 6.36.92-4.6 4.49 1.08 6.33L12 17.3l-5.68 3 1.08-6.33-4.6-4.49 6.36-.92z"/></svg>';
  function starsHTML(r, cls) {  // read-only star row
    var w = Math.max(0, Math.min(5, +r || 0)) / 5 * 100, row = STAR + STAR + STAR + STAR + STAR;
    return '<span class="stars-ro ' + (cls || '') + '" role="img" aria-label="' + r + ' 顆星"><span class="sr-bg">' + row + '</span><span class="sr-fg" style="width:' + w + '%">' + row + '</span></span>';
  }
  var fmtR = function (r) { return (r % 1 ? r.toFixed(1) : String(r)); };


  /* ---------- review dialog (shared by list pages and /me/) — V17: 40px stars (+4px gap) with half-star taps,
     −/＋ half-step buttons (44px) for precise input, unsaved-change guard, focus returns to the opener ---------- */
  var dlg, cur = null, val = 0, base = null, opener = null, S = 40, G = 4;
  function build() {
    dlg = doc.createElement('dialog');
    dlg.className = 'rvdlg'; dlg.setAttribute('aria-labelledby', 'rvT');
    dlg.innerHTML = '<div class="rv-in">'
      + '<div class="rv-hd"><span class="rv-art"></span><div class="rv-meta"><h2 id="rvT"></h2><p class="rv-by"></p><p class="rv-from"></p></div>'
      + '<button type="button" class="rv-x" aria-label="關閉">×</button></div>'
      + '<div class="rv-rate"><p class="rv-lab" id="rvL">我的評分</p>'
      + '<div class="rv-row"><div class="rv-stars" role="slider" tabindex="0" aria-labelledby="rvL" aria-valuemin="0" aria-valuemax="5" aria-valuenow="0" aria-valuetext="未評分">'
      + '<span class="rs-bg">' + STAR + STAR + STAR + STAR + STAR + '</span><span class="rs-fg">' + STAR + STAR + STAR + STAR + STAR + '</span></div>'
      + '<span class="rv-step"><button type="button" class="rv-dn" aria-label="減少半顆星">−</button><button type="button" class="rv-up" aria-label="增加半顆星">＋</button></span></div>'
      + '<p class="rv-sub"><span class="rv-val" aria-hidden="true">未評分</span><span>點星星左半邊是半顆</span><button type="button" class="lnk-btn rv-clr" hidden>清除評分</button></p></div>'
      + '<div class="rv-noteb"><label class="rv-lab" for="rvN">我的筆記</label>'
      + '<textarea id="rvN" maxlength="2000" rows="5" placeholder="記下你聽到的、喜歡的，或想再聽的地方。"></textarea><p class="rv-cnt"><span>0</span> / 2000</p></div>'
      + '<p class="rv-note">紀錄只保存在這個瀏覽器，記得到<a href="/me/#backup">我的聆聽紀錄</a>備份。</p>'
      + '<div class="rv-act"><button type="button" class="lnk-btn rv-del">刪除這則紀錄</button><span class="rv-sp"></span>'
      + '<button type="button" class="pg-btn rv-cancel">取消</button><button type="button" class="pg-btn pri rv-save">儲存</button></div></div>';
    doc.body.appendChild(dlg);
    var st = dlg.querySelector('.rv-stars'), ta = dlg.querySelector('textarea'), cnt = dlg.querySelector('.rv-cnt span'), vEl = dlg.querySelector('.rv-val');
    function paint(v) {
      dlg.querySelector('.rs-fg').style.width = (Math.floor(v) * (S + G) + (v % 1) * S) + 'px';
      vEl.textContent = v ? fmtR(v) + ' / 5 顆星' : '未評分'; vEl.classList.toggle('on', !!v);
    }
    function setVal(v) {
      val = Math.max(0, Math.min(5, Math.round(v * 2) / 2)); paint(val);
      st.setAttribute('aria-valuenow', String(val)); st.setAttribute('aria-valuetext', val ? fmtR(val) + ' 顆星' : '未評分');
      dlg.querySelector('.rv-clr').hidden = !val;
    }
    dlg._set = setVal;
    function at(e) {
      var x = e.clientX - st.getBoundingClientRect().left, i = Math.floor(x / (S + G)), f = (x - i * (S + G)) / S;
      if (i < 0) return 0.5; if (i > 4) return 5;
      return Math.min(5, i + (f <= 0.5 ? 0.5 : 1));
    }
    st.addEventListener('click', function (e) { setVal(at(e)); });
    st.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') paint(at(e)); });
    st.addEventListener('pointerleave', function () { paint(val); });
    st.addEventListener('keydown', function (e) {
      var k = e.key, v = val;
      if (k === 'ArrowRight' || k === 'ArrowUp') v += 0.5; else if (k === 'ArrowLeft' || k === 'ArrowDown') v -= 0.5;
      else if (k === 'Home') v = 0; else if (k === 'End') v = 5; else if (/^[0-5]$/.test(k)) v = +k; else return;
      e.preventDefault(); setVal(v);
    });
    dlg.querySelector('.rv-up').addEventListener('click', function () { setVal(val + 0.5); });
    dlg.querySelector('.rv-dn').addEventListener('click', function () { setVal(val - 0.5); });
    dlg.querySelector('.rv-clr').addEventListener('click', function () { setVal(0); st.focus(); });
    ta.addEventListener('input', function () { cnt.textContent = ta.value.length; });
    function dirty() { return base && (val !== base.r || ta.value.trim() !== base.n); }
    function tryClose() { if (dirty() && !confirm('有尚未儲存的評分或筆記，確定要放棄嗎？')) return; base = null; dlg.close(); }
    dlg.querySelector('.rv-x').addEventListener('click', tryClose);
    dlg.querySelector('.rv-cancel').addEventListener('click', tryClose);
    dlg.addEventListener('click', function (e) { if (e.target === dlg) tryClose(); });
    dlg.addEventListener('cancel', function (e) { e.preventDefault(); tryClose(); });  // Esc
    dlg.addEventListener('close', function () { var o = opener; opener = null; if (o && o.isConnected && o.focus) o.focus({ preventScroll: true }); });
    dlg.querySelector('.rv-save').addEventListener('click', function () {
      if (!cur) return;
      var o = cur;
      if (saveWork(o.wk, { r: val, n: ta.value }, { ti: o.ti, ar: o.ar, k: o.k, img: o.img, from: o.from, fromT: o.fromT })) {
        base = null; dlg.close(); if (o.onSave) o.onSave(!!(val || ta.value.trim()));
      }
    });
    dlg.querySelector('.rv-del').addEventListener('click', function () {
      if (!cur || !confirm('確定刪除這則評分和筆記嗎？刪除後無法復原。')) return;
      var o = cur; saveWork(o.wk, { r: 0, n: '' }); base = null; dlg.close(); if (o.onSave) o.onSave(false);
    });
  }
  function openReview(o) {
    if (!dlg) build();
    if (!dlg.showModal) return;
    cur = o; opener = doc.activeElement;
    var w = work(o.wk) || {}, art = dlg.querySelector('.rv-art'), ta = dlg.querySelector('textarea');
    art.innerHTML = o.img ? '<img src="' + esc(o.img) + '" alt="" width="56" height="56">' : '<span>' + esc(String(o.ti || '').trim().slice(0, 2)) + '</span>';
    dlg.querySelector('#rvT').textContent = o.ti || '';
    dlg.querySelector('.rv-by').textContent = o.ar || '';
    dlg.querySelector('.rv-by').hidden = !o.ar;
    dlg.querySelector('.rv-from').textContent = o.fromT ? '來自「' + o.fromT + '」' : '';
    ta.value = w.n || ''; dlg.querySelector('.rv-cnt span').textContent = ta.value.length;
    dlg._set(+w.r || 0);
    base = { r: +w.r || 0, n: (w.n || '').trim() };
    dlg.querySelector('.rv-del').hidden = !(w.r || w.n);
    dlg.showModal();
    dlg.querySelector('.rv-stars').focus();
  }

  /* ---------- 繼續聽 cards (home + /me/): series banner thumb, list name, series line, 6px mint track, count + %, chevron ---------- */
  var TYPE = { award: '音樂獎', fest: '音樂節', chart: '榜單' };
  var CHEV = '<span class="rs-chev" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m9.5 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
  function resumeHTML(x) {
    var pf = x.t ? Math.round(x.n / x.t * 1000) / 10 : 0, pct = pf % 1 ? pf.toFixed(1) : String(pf), slug = x.p.split('/')[1] || '', D = window.L22 || {}, ser = D[slug];
    var line = (ser ? ser.name + (TYPE[ser.type] ? ' · ' + TYPE[ser.type] : '') + ' · ' : '') + rel(x.last);
    return '<li><a class="rs-card" href="' + esc(x.p) + '">'
      + '<img class="rs-bn" src="/img/banners/' + esc(slug) + '-800.jpg" alt="" loading="lazy" width="80" height="60" onerror="this.removeAttribute(\'src\')">'
      + '<span class="rs-tx"><b class="rs-t">' + esc(x.title) + '</b><span class="rs-s">' + esc(line) + '</span>'
      + '<span class="rs-bar" aria-hidden="true"><i style="width:' + pct + '%"></i></span>'
      + '<span class="rs-n">' + (x.done ? '已完成 · ' : '已聽 ') + x.n + ' / ' + x.t + ' ' + esc(x.u) + '<em>' + pct + '%</em></span></span>' + CHEV + '</a></li>';
  }
  function renderResume(sec, opt) {
    opt = opt || {};
    var items = lists().filter(function (x) { return opt.done ? x.done : !x.done; });
    if (opt.limit) items = items.slice(0, opt.limit);
    sec.querySelector('.rs-list').innerHTML = items.map(resumeHTML).join('');
    sec.hidden = !items.length && !opt.keep;
    return items.length;
  }

  /* ---------- /me/ page ---------- */
  var NOTE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h8.5L19 8v12.5H6z"/><path d="M14 3.5V8.5h5M9 12.5h6.5M9 16h4.5"/></svg>';
  function renderMe() {
    var me = doc.getElementById('me'); if (!me) return;
    var q = me.querySelector('.wk-q'), sort = me.querySelector('.wk-sort'), list = me.querySelector('.wk-list'), F = 'all';
    var segs = [].slice.call(me.querySelectorAll('.seg button'));
    var $id = function (i) { return doc.getElementById(i); }, msg = $id('meMsg');
    function say(t, err) { msg.textContent = t; msg.classList.toggle('err', !!err); }
    function stats() {
      var L = lists(), W = works(), heard = L.reduce(function (s, x) { return s + x.n; }, 0);
      var any = !!(L.length || W.length);
      $id('meStats').innerHTML = !any ? '' : [[L.filter(function (x) { return !x.done; }).length, '進行中的清單'], [heard, '已聽標記'],
        [W.filter(function (w) { return w.r > 0; }).length, '已評分'], [W.filter(function (w) { return w.n; }).length, '有筆記']]
        .map(function (s) { return '<div><b>' + s[0] + '</b><span>' + s[1] + '</span></div>'; }).join('');
      $id('meStNote').hidden = !any;
      $id('meEmpty').hidden = any;
      me.hidden = !any;
    }
    function wks() {
      var v = (q.value || '').trim().toLowerCase(), all = works(), W = all;
      if (F === 'rated') W = W.filter(function (w) { return w.r > 0; });
      if (F === 'note') W = W.filter(function (w) { return w.n; });
      if (v) W = W.filter(function (w) { return ((w.ti || '') + ' ' + (w.ar || '') + ' ' + (w.n || '') + ' ' + (w.fromT || '')).toLowerCase().indexOf(v) >= 0; });
      var s = sort.value;
      W.sort(function (a, b) { return s === 'hi' ? (b.r - a.r) || (b.t - a.t) : s === 'lo' ? ((a.r || 9) - (b.r || 9)) || (b.t - a.t) : b.t - a.t; });
      list.innerHTML = W.map(function (w) {
        var art = w.img ? '<img src="' + esc(w.img) + '" alt="" loading="lazy" width="64" height="64">' : '<span class="wk-mono">' + esc(String(w.ti || '').trim().slice(0, 2)) + '</span>';
        var st = (w.r ? '<span class="wk-r">' + starsHTML(w.r) + fmtR(w.r) + '</span>' : '') + (w.n ? '<span class="wk-nb">' + NOTE + '筆記</span>' : '');
        return '<li class="wk" data-w="' + esc(w.wk) + '"><span class="wk-art">' + art + '</span><div class="wk-tx">'
          + '<h3>' + esc(w.ti) + '</h3>' + (w.ar ? '<p class="wk-by">' + esc(w.ar) + '</p>' : '')
          + (st ? '<p class="wk-st">' + st + '</p>' : '')
          + (w.n ? '<p class="wk-n">' + esc(w.n) + '</p>' : '')
          + '<p class="wk-from">' + (w.from ? '來自 <a href="' + esc(w.from) + '">' + esc(w.fromT || w.from) + '</a> · ' : '') + esc(rel(w.t)) + '</p></div>'
          + '<button type="button" class="pg-btn wk-ed" aria-label="編輯「' + esc(w.ti) + '」的評分與筆記">編輯</button></li>';
      }).join('');
      var none = me.querySelector('.wk-none'), filtered = !!(v || F !== 'all');
      none.hidden = !!W.length;
      none.querySelector('.wk-nt').textContent = all.length && filtered ? '沒有符合條件的紀錄。' : '還沒有評分或筆記。在任何清單裡點作品下方的「評分・筆記」就能開始。';
      none.querySelector('.wk-clear').hidden = !(all.length && filtered);
    }
    function all() {
      if (!available()) { $id('meErr').hidden = false; $id('meEmpty').hidden = true; me.hidden = true; return; }
      $id('meErr').hidden = true;
      stats(); renderResume($id('meResume'), { keep: true }); renderResume($id('meDone'), { done: true }); wks();
      $id('meResume').querySelector('.rs-none').hidden = !!lists().filter(function (x) { return !x.done; }).length;
    }
    segs.forEach(function (b) { b.addEventListener('click', function () { F = b.dataset.f; segs.forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); }); wks(); }); });
    q.addEventListener('input', wks); sort.addEventListener('change', wks);
    me.querySelector('.wk-clear').addEventListener('click', function () { q.value = ''; F = 'all'; segs.forEach(function (o) { o.setAttribute('aria-pressed', String(o.dataset.f === 'all')); }); wks(); });
    list.addEventListener('click', function (e) {
      var b = e.target.closest('.wk-ed'); if (!b) return;
      var k = b.closest('.wk').dataset.w, w = work(k); if (!w) return;
      openReview({ wk: k, ti: w.ti, ar: w.ar, k: w.k, img: w.img, from: w.from, fromT: w.fromT });
    });
    $id('meRetry').addEventListener('click', all);
    $id('meExport').addEventListener('click', function () {
      if (!lists().length && !works().length) { say('目前沒有紀錄可以匯出。'); return; }
      exportFile(); say('已下載備份檔。檔案內含你的私人筆記，請妥善保管；換裝置時用「匯入備份」還原。');
    });
    var pending = null, imp = $id('meImp');
    $id('meImport').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0]; e.target.value = '';
      if (!f) { say('已取消匯入。'); return; }
      readFile(f).then(function (r) {
        pending = r; imp.hidden = false; say('');
        $id('meImpTx').textContent = '「' + r.name + '」包含 ' + r.lists + ' 份清單的 ' + r.heard + ' 筆已聽紀錄、' + r.works + ' 則評分與筆記。'
          + '匯入會與這台裝置上現有的紀錄合併：沒有的會加入，同一筆以較新的為準，不會刪除現有紀錄。';
        $id('meImpGo').focus();
      }).catch(function () { pending = null; imp.hidden = true; say('無法匯入：「' + f.name + '」不是聆聽清單的備份檔，或檔案已損毀。現有紀錄沒有任何變動。', true); });
    });
    $id('meImpGo').addEventListener('click', function () {
      if (!pending) return;
      try { var r = merge(pending.data); say('匯入完成：更新了 ' + r.lists + ' 份清單的已聽紀錄、' + r.works + ' 則評分與筆記。'); }
      catch (e) { say('匯入失敗，現有紀錄沒有任何變動。', true); }
      pending = null; imp.hidden = true;
    });
    $id('meImpNo').addEventListener('click', function () { pending = null; imp.hidden = true; say('已取消匯入，現有紀錄沒有任何變動。'); });
    $id('meWipe').addEventListener('click', function () {
      if (!confirm('確定清除這台裝置上的全部聆聽紀錄（已聽、評分、筆記）嗎？\n清除後無法復原，建議先匯出備份。')) return;
      wipe(); say('已清除這台裝置上的全部紀錄。');
    });
    subs.push(all); all();
  }

  window.L22S = { load: load, setHeard: setHeard, clearList: clearList, lists: lists, work: work, saveWork: saveWork, works: works,
    exportFile: exportFile, readFile: readFile, importFile: importFile, merge: merge, wipe: wipe, available: available, openReview: openReview,
    renderResume: renderResume, starsHTML: starsHTML, fmtR: fmtR, rel: rel, esc: esc, onChange: function (f) { subs.push(f); } };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
  function init() {
    renderMe();
    var hr = doc.getElementById('homeResume');
    if (hr) { var go = function () { renderResume(hr, { limit: 3 }); }; subs.push(go); go(); }
  }
})();
