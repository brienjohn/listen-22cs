/* listen.22cs.xyz — personal listening data, kept ONLY in this browser (no account, nothing uploaded).
   build_hub.py copies this file to docs/js/my.js; list pages, the home page and /me/ load it synchronously before their own scripts.

   localStorage "l22-progress" (v1):
     lists: { "<list path>": { t: total, title, u: unit, c: [recent cover paths ≤5], at: last change ms, h: { "<item id>": ms },
                               x: { "<item id>": ms un-ticked }, cl: ms the whole list was cleared } }
     works: { "<work key>": { r: 0–5 step .5 (0 = no rating), n: note ≤2000 chars, t: updated ms, c: created ms,
                              ti: title, ar: artist, k: kind, img: cover path, from: list path, fromT: list title } }
     wx:    { "<work key>": ms the rating + note were deleted }
     favs:  { "<work key>": { t: favourited ms, ti, ar, k, img, from, fromT } }   (V18 收藏; optional — older backups simply have none)
   Removals are kept as timestamps (x / cl / wx) so that merging — a backup import today, cloud sync later — can never bring back
   something that was un-ticked or deleted after it was recorded: per item the newest event wins, a removal wins a tie.
   All three are optional, so older backups (without them) still import and older pages simply ignore them.
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
      if (d && d.v === 1 && d.lists && typeof d.lists === 'object') {
        if (!d.works || typeof d.works !== 'object') d.works = {};
        if (d.favs && typeof d.favs !== 'object') delete d.favs;
        if (d.wx && typeof d.wx !== 'object') delete d.wx;
        return d;
      }
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
    catch (e) { alert('這台裝置的瀏覽器無法儲存記錄（可能是無痕模式或儲存空間已滿）。'); return false; }
    persist(); emit(); if (!applying) scheduleSync(); return true;
  }
  window.addEventListener('storage', function (e) { if (e.key === KEY || e.key === null) emit(); });

  /* ---------- lists (已聽) ---------- */
  function setHeard(path, id, on, info) {
    var d = load(), L = d.lists[path] || (d.lists[path] = { h: {} }), now = Date.now();
    if (!L.h || typeof L.h !== 'object') L.h = {};
    L.t = info.t; L.title = info.title; if (info.u) L.u = info.u;
    L.c = (L.c || []).filter(function (u) { return u !== info.img; });
    if (on) { L.h[id] = now; if (L.x) delete L.x[id]; if (info.img) L.c.unshift(info.img); L.c = L.c.slice(0, 5); }
    else { delete L.h[id]; (L.x || (L.x = {}))[id] = now; }
    L.at = now;
    save(d);
  }
  function clearList(path) {  // keep the list's entry with a clear time, so an older copy can't refill it on merge
    var d = load(), L = d.lists[path]; if (!L) return;
    L.h = {}; delete L.x; L.c = []; L.cl = L.at = Date.now();
    save(d);
  }
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
    if (!r && !n) { delete d.works[wk]; (d.wx || (d.wx = {}))[wk] = Date.now(); }
    else {
      if (d.wx) delete d.wx[wk];
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

  /* ---------- favs (收藏) — kept apart from works so a favourite never needs a rating or note ---------- */
  var META = ['ti', 'ar', 'k', 'img', 'from', 'fromT'];
  function isFav(wk) { var f = load().favs; return !!(f && f[wk]); }
  function setFav(wk, on, meta) {
    var d = load(); if (!d.favs) d.favs = {};
    if (on) { var o = { t: Date.now() }; META.forEach(function (k) { if (meta && meta[k] != null) o[k] = meta[k]; }); d.favs[wk] = o; }
    else delete d.favs[wk];
    if (!Object.keys(d.favs).length) delete d.favs;
    return save(d);
  }
  function favs() { var f = load().favs || {}; return Object.keys(f).map(function (k) { var w = f[k]; w.wk = k; return w; }); }

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
  var idOk = function (id) { return /^[\w-]{1,40}$/.test(id); };
  var tsOf = function (v) { v = +v; return v > 0 && v < 1e14 ? v : 0; };
  /* merge an incoming copy (backup file now, cloud copy later). Per item the newest event wins; a removal wins a tie.
     Commutative and idempotent: merging A into B gives the same result as B into A, and merging twice changes nothing. */
  function merge(inc) {
    if (!inc || inc.v !== 1 || typeof inc.lists !== 'object') throw new Error('format');
    var d = load(), nl = 0, nw = 0, nf = 0;
    Object.keys(inc.lists || {}).forEach(function (p) {
      var I = inc.lists[p]; if (!pathOk(p) || !I || typeof I !== 'object') return;
      var Ih = I.h && typeof I.h === 'object' ? I.h : {}, Ix = I.x && typeof I.x === 'object' ? I.x : {};
      var L = d.lists[p] || (d.lists[p] = { h: {} }), add = 0;
      if (!L.h || typeof L.h !== 'object') L.h = {};
      var Lx = L.x || {}, cl = Math.max(tsOf(L.cl), tsOf(I.cl));
      var ids = {};
      [L.h, Lx, Ih, Ix].forEach(function (m) { Object.keys(m).forEach(function (id) { if (idOk(id)) ids[id] = 1; }); });
      var nh = {}, nx = {};
      Object.keys(ids).forEach(function (id) {
        var hT = Math.max(tsOf(L.h[id]), tsOf(Ih[id])), xT = Math.max(tsOf(Lx[id]), tsOf(Ix[id]));
        if (hT > xT && hT > cl) { nh[id] = hT; if (!(id in L.h) || tsOf(L.h[id]) < hT) add++; }
        else if (xT > cl) nx[id] = xT;          // a removal older than the list clear is already covered by cl
      });
      L.h = nh;
      if (Object.keys(nx).length) L.x = nx; else delete L.x;
      if (cl) L.cl = cl;
      if (+I.t > 0 && !L.t) L.t = +I.t;
      if (!L.title) L.title = str(I.title, 200);
      if (!L.u) L.u = str(I.u, 12);
      var Ic = (Array.isArray(I.c) ? I.c : []).filter(pathOk).slice(0, 5);
      if (!L.c || !L.c.length || (tsOf(I.at) > tsOf(L.at) && Ic.length)) L.c = Ic;
      L.at = Math.max(tsOf(L.at), tsOf(I.at));
      if (!Object.keys(L.h).length && !L.x && !L.cl) delete d.lists[p]; else if (add) nl++;
    });
    var wx = d.wx || {};
    Object.keys(inc.wx && typeof inc.wx === 'object' ? inc.wx : {}).forEach(function (k) {
      var t = tsOf(inc.wx[k]); if (k.length > 400 || !t) return;
      if (t > tsOf(wx[k])) wx[k] = t;
    });
    Object.keys(inc.works || {}).forEach(function (k) {
      var w = inc.works[k]; if (!w || typeof w !== 'object' || k.length > 400) return;
      var r = Math.round((+w.r || 0) * 2) / 2, n = str(w.n, 2000), t = tsOf(w.t);
      if (!(r >= 0 && r <= 5)) r = 0;
      if (!r && !n) return;
      var cur = d.works[k];
      if (cur && tsOf(cur.t) >= t) return;
      if (t && t <= tsOf(wx[k])) return;        // deleted after this version was written
      d.works[k] = { r: r, n: n, t: t || Date.now(), c: tsOf(w.c) || t || Date.now(), ti: str(w.ti, 300), ar: str(w.ar, 300), k: str(w.k, 12),
        img: pathOk(w.img) ? w.img : '', from: pathOk(w.from) ? w.from : '', fromT: str(w.fromT, 200) };
      nw++;
    });
    Object.keys(wx).forEach(function (k) {     // settle each work: newer rating/note wins over an older deletion and vice versa
      var cur = d.works[k];
      if (cur && tsOf(cur.t) > wx[k]) delete wx[k];
      else if (cur) { delete d.works[k]; nw++; }
    });
    if (Object.keys(wx).length) d.wx = wx; else delete d.wx;
    Object.keys(inc.favs && typeof inc.favs === 'object' ? inc.favs : {}).forEach(function (k) {
      var f = inc.favs[k], t = f && tsOf(f.t); if (!f || typeof f !== 'object' || k.length > 400 || !t) return;
      if (!d.favs) d.favs = {};
      var cur = d.favs[k]; if (cur && tsOf(cur.t) >= t) return;
      d.favs[k] = { t: t, ti: str(f.ti, 300), ar: str(f.ar, 300), k: str(f.k, 12), img: pathOk(f.img) ? f.img : '', from: pathOk(f.from) ? f.from : '', fromT: str(f.fromT, 200) };
      nf++;
    });
    save(d);
    return { lists: nl, works: nw, favs: nf };
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
          var nl = 0, nh = 0, nw = 0, nf = 0;
          Object.keys(inc.lists || {}).forEach(function (p) { var I = inc.lists[p]; if (pathOk(p) && I && typeof I.h === 'object') { var k = Object.keys(I.h).length; if (k) { nl++; nh += k; } } });
          Object.keys(inc.works || {}).forEach(function (k) { var w = inc.works[k]; if (w && typeof w === 'object' && ((+w.r > 0) || (typeof w.n === 'string' && w.n.trim()))) nw++; });
          if (inc.favs && typeof inc.favs === 'object') Object.keys(inc.favs).forEach(function (k) { var f = inc.favs[k]; if (f && typeof f === 'object' && +f.t > 0) nf++; });
          ok({ data: inc, name: file.name, lists: nl, heard: nh, works: nw, favs: nf, at: inc.exportedAt || '' });
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
  function starsHTML(r, cls) {  // read-only: only the stars actually given (2 → ★★, 2.5 → ★★ + half), never empty outline stars
    r = Math.max(0, Math.min(5, Math.round((+r || 0) * 2) / 2)); if (!r) return '';
    var full = Math.floor(r), h = '';
    for (var i = 0; i < full; i++) h += STAR;
    if (r % 1) h += '<span class="sr-half">' + STAR + '</span>';
    return '<span class="stars-ro ' + (cls || '') + '" role="img" aria-label="' + fmtR(r) + ' 顆星">' + h + '</span>';
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
      + '<span class="rs-bg">' + STAR + STAR + STAR + STAR + STAR + '</span><span class="rs-fg">' + STAR + STAR + STAR + STAR + STAR + '</span></div></div>'
      + '<p class="rv-sub"><span class="rv-val" aria-hidden="true">未評分</span><span>點星星左半邊是半顆</span><button type="button" class="lnk-btn rv-clr" hidden>清除評分</button></p></div>'
      + '<div class="rv-noteb"><label class="rv-lab" for="rvN">我的筆記</label>'
      + '<textarea id="rvN" maxlength="2000" rows="5" placeholder="記下你聽到的、喜歡的，或想再聽的地方。"></textarea><p class="rv-cnt"><span>0</span> / 2000</p></div>'
      + '<p class="rv-note">記錄只保存在這個瀏覽器，記得到<a href="/me/#backup">我的聆聽記錄</a>備份。</p>'
      + '<div class="rv-act"><button type="button" class="lnk-btn rv-del">刪除這則記錄</button><span class="rv-sp"></span>'
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
  /* V18.3.3 /me rows: banner fills the left of the card edge to edge (top / bottom / left), cropped around each series' subject */
  var FOCUS = { emerge: 88, fireball: 78, gima: 70, gma: 80, grammy: 85, mama: 68, megaport: 72, mercury: 66, pitchfork: 78, rollingstone: 74, vagabond: 76 };
  function resumeCompact(x) {
    var pf = x.t ? Math.min(100, Math.round(x.n / x.t * 1000) / 10) : 0, slug = x.p.split('/')[1] || '';
    return '<li><a class="rs-card" href="' + esc(x.p) + '" aria-label="' + esc(x.title + '，已聽 ' + x.n + ' / ' + x.t) + '">'
      + '<span class="rs-art"><img src="/img/banners/' + esc(slug) + '-800.jpg" alt="" loading="lazy" width="800" height="200" style="object-position:' + (FOCUS[slug] || 75) + '% 50%" onerror="this.remove()"></span>'
      + '<span class="rs-tx"><b class="rs-t">' + esc(x.title) + '</b><span class="rs-n"><b>' + x.n + '</b> / ' + x.t + '</span>'
      + '<span class="rs-bar" aria-hidden="true"><i style="width:' + pf + '%"></i></span></span>' + CHEV + '</a></li>';
  }
  function renderResume(sec, opt) {
    opt = opt || {};
    var items = lists().filter(function (x) { return opt.done ? x.done : !x.done; });
    if (opt.limit) items = items.slice(0, opt.limit);
    var ul = sec.querySelector('.rs-list');
    ul.innerHTML = items.map(ul.classList.contains('rs-c') ? resumeCompact : resumeHTML).join('');
    sec.hidden = !items.length && !opt.keep;
    return items.length;
  }

  /* ---------- /me/ page (V18: stats + backup in one card, records search right after it, 清除 kept apart) ---------- */
  function renderMe() {
    var me = doc.getElementById('me'); if (!me) return;
    var q = me.querySelector('.wk-q'), sort = me.querySelector('.wk-sort'), list = me.querySelector('.wk-list'), F = 'all';
    var segs = [].slice.call(me.querySelectorAll('.seg button'));
    var $id = function (i) { return doc.getElementById(i); }, msg = $id('meMsg'), note = $id('meNote');
    function say(t, err, el) { el = el || msg; el.textContent = t; el.classList.toggle('err', !!err); }
    function stats() {
      var L = lists(), W = works(), heard = L.reduce(function (s, x) { return s + x.n; }, 0);
      var any = !!(L.length || W.length);
      $id('meStats').innerHTML = !any ? '' : [[L.filter(function (x) { return !x.done; }).length, '進行中的清單'], [heard, '已聽'],
        [W.filter(function (w) { return w.r > 0; }).length, '已評分'], [W.filter(function (w) { return w.n; }).length, '筆記']]
        .map(function (s) { return '<div><b>' + s[0] + '</b><span>' + s[1] + '</span></div>'; }).join('');
      $id('meStats').hidden = !any;
      $id('meEmpty').hidden = any;
      me.hidden = !any;
      var wb = $id('meWipe'); if (wb) wb.disabled = !any;
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
        var st = w.r ? '<span class="wk-r">' + starsHTML(w.r) + '</span>' : '';  // the note itself is shown in full below; no separate 筆記 badge
        return '<li class="wk" data-w="' + esc(w.wk) + '"><span class="wk-art">' + art + '</span><div class="wk-tx">'
          + '<div class="wk-hd"><h3>' + esc(w.ti) + '</h3><button type="button" class="pg-btn wk-ed" aria-label="編輯「' + esc(w.ti) + '」的評分與筆記">編輯</button>'
          + '<button type="button" class="pg-btn wk-sh" aria-label="分享「' + esc(w.ti) + '」的評分與筆記圖片">' + SH_IC + '分享</button></div>'
          + (w.ar ? '<p class="wk-by">' + esc(w.ar) + '</p>' : '')
          + (st ? '<p class="wk-st">' + st + '</p>' : '')
          + (w.n ? '<p class="wk-n">' + esc(w.n) + '</p>' : '')
          + '<p class="wk-from">' + (w.from ? '來自 <a href="' + esc(w.from) + '">' + esc(w.fromT || w.from) + '</a> · ' : '') + esc(rel(w.t)) + '</p></div></li>';
      }).join('');
      var none = me.querySelector('.wk-none'), filtered = !!(v || F !== 'all');
      none.hidden = !!W.length;
      none.querySelector('.wk-nt').textContent = all.length && filtered ? '沒有符合條件的記錄。' : '還沒有評分或筆記。在任何清單裡點作品旁的筆記圖示就能開始。';
      none.querySelector('.wk-clear').hidden = !(all.length && filtered);
    }
    function all() {
      if (!available()) { $id('meErr').hidden = false; $id('meEmpty').hidden = true; $id('meStats').hidden = true; me.hidden = true; return; }
      $id('meErr').hidden = true;
      stats(); renderResume($id('meResume'), {}); renderResume($id('meDone'), { done: true }); wks();
    }
    segs.forEach(function (b) { b.addEventListener('click', function () { F = b.dataset.f; segs.forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); }); wks(); }); });
    q.addEventListener('input', wks); sort.addEventListener('change', wks);
    me.querySelector('.wk-clear').addEventListener('click', function () { q.value = ''; F = 'all'; segs.forEach(function (o) { o.setAttribute('aria-pressed', String(o.dataset.f === 'all')); }); wks(); });
    list.addEventListener('click', function (e) {
      var sb = e.target.closest('.wk-sh');
      if (sb) { var sw = work(sb.closest('.wk').dataset.w); if (sw) shareWork(sw); return; }
      var b = e.target.closest('.wk-ed'); if (!b) return;
      var k = b.closest('.wk').dataset.w, w = work(k); if (!w) return;
      openReview({ wk: k, ti: w.ti, ar: w.ar, k: w.k, img: w.img, from: w.from, fromT: w.fromT });
    });
    $id('meRetry').addEventListener('click', all);
    $id('meExport').addEventListener('click', function () {
      if (!lists().length && !works().length && !favs().length) { say('目前沒有記錄可以匯出。'); return; }
      exportFile(); say('已下載備份檔。檔案內含你的私人筆記，請妥善保管；換裝置時用「匯入備份」還原。');
    });
    var pending = null, imp = $id('meImp');
    $id('meImport').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0]; e.target.value = '';
      if (!f) { say('已取消匯入。'); return; }
      readFile(f).then(function (r) {
        pending = r; imp.hidden = false; say('');
        $id('meImpTx').textContent = '「' + r.name + '」包含 ' + r.lists + ' 份清單的 ' + r.heard + ' 筆已聽記錄、' + r.works + ' 則評分與筆記。'
          + '匯入會與這台裝置上現有的記錄合併：沒有的會加入，同一筆以較新的為準，不會刪除現有記錄。';
        $id('meImpGo').focus();
      }).catch(function () { pending = null; imp.hidden = true; say('無法匯入：「' + f.name + '」不是聆聽清單的備份檔，或檔案已損毀。現有記錄沒有任何變動。', true); });
    });
    $id('meImpGo').addEventListener('click', function () {
      if (!pending) return;
      try { var r = merge(pending.data); say('匯入完成：更新了 ' + r.lists + ' 份清單的已聽記錄、' + r.works + ' 則評分與筆記。'); }
      catch (e) { say('匯入失敗，現有記錄沒有任何變動。', true); }
      pending = null; imp.hidden = true;
    });
    $id('meImpNo').addEventListener('click', function () { pending = null; imp.hidden = true; say('已取消匯入，現有記錄沒有任何變動。'); });
    $id('meWipe').addEventListener('click', function () {
      if (syncInfo().on) { syncDialog('wipe'); return; }
      if (!confirm('確定清除這台裝置上的全部聆聽記錄（已聽、評分、筆記）嗎？\n清除後無法復原，建議先匯出備份。')) return;
      wipe(); say('已清除這台裝置上的全部記錄。', false, note);
    });
    /* 資料管理 menu (V18.3.2): desktop popover anchored under the title, bottom sheet on phones; Esc / outside / × close and return focus */
    var dmBtn = $id('dmBtn'), dmP = $id('dmPanel'), dmScrim = null;
    function dmOpen() {
      if (!dmP || !dmP.hidden) return;
      if (!dmScrim) { dmScrim = doc.createElement('div'); dmScrim.className = 'dm-scrim'; dmScrim.hidden = true; doc.body.appendChild(dmScrim); dmScrim.addEventListener('click', function () { dmClose(true); }); }
      dmP.hidden = false; dmScrim.hidden = false; dmBtn.setAttribute('aria-expanded', 'true'); doc.documentElement.classList.add('dm-on');
      dmP.querySelector('.dm-x').focus({ preventScroll: true });
    }
    function dmClose(focus) {
      if (!dmP || dmP.hidden) return;
      popClose(false);
      dmP.hidden = true; if (dmScrim) dmScrim.hidden = true; dmBtn.setAttribute('aria-expanded', 'false'); doc.documentElement.classList.remove('dm-on');
      if (focus) dmBtn.focus({ preventScroll: true });
    }
    if (dmBtn && dmP) {
      dmBtn.addEventListener('click', function () { if (dmP.hidden) dmOpen(); else dmClose(true); });
      dmP.querySelector('.dm-x').addEventListener('click', function () { dmClose(true); });
      doc.addEventListener('click', function (e) {
        var t = e.target;   // clicks in the sync / review dialogs (modal, on top), on removed nodes, or scripted ones (export's download link) keep the menu open
        if (dmP.hidden || !e.isTrusted || !t.isConnected || dmP.contains(t) || dmBtn.contains(t) || (t.closest && t.closest('dialog')) || t === dmScrim) return;
        dmClose(false);
      });
      doc.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape' || dmP.hidden || popOpen || doc.querySelector('dialog[open]')) return;
        e.preventDefault(); dmClose(true);
      }, true);   // capture: runs before the (i) handler, so an open (i) bubble is closed first and the menu stays
      dmP.addEventListener('keydown', function (e) {   // keep Tab inside the bottom sheet on phones
        if (e.key !== 'Tab' || !matchMedia('(max-width:620px)').matches) return;
        var f = [].filter.call(dmP.querySelectorAll('button,[href],input,label.pg-btn,select'), function (x) { return !x.disabled && x.offsetParent !== null && !(x.tagName === 'INPUT' && x.type === 'file'); });
        if (!f.length) return;
        if (e.shiftKey && doc.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && doc.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      });
      if (location.hash === '#backup') setTimeout(dmOpen, 0);   // 「記得到我的聆聽記錄備份」 link from the review dialog
    }
    /* 雲端同步 row */
    var syState = $id('syState'), syAct = $id('syAct'), dmDot = dmBtn && dmBtn.querySelector('.dm-dot'), dmSt = $id('dmSt');
    function syncRow() {
      if (!syAct) return;
      var i = syncInfo(), t = '';
      if (i.on) t = i.busy ? '同步中…' : i.err === 'offline' ? '目前離線，連線後自動同步' : i.err === 'gone' ? '雲端資料已被刪除' : i.err === 'auth' ? '同步碼無效'
        : i.err ? '暫時無法同步，稍後自動重試' : i.at ? '已同步 · ' + rel(i.at) : '準備同步…';
      syState.textContent = t; syState.className = 'sy-st' + (i.on && !i.err ? ' ok' : i.err ? ' warn' : '');
      var bad = !!(i.on && i.err && i.err !== 'offline');   // a sync problem stays noticeable while the menu is closed
      if (dmDot) { dmDot.hidden = !bad; dmSt.textContent = bad ? '（雲端同步：' + t + '）' : ''; dmBtn.title = bad ? '雲端同步：' + t : ''; }
      var key = i.on + '|' + (i.err === 'gone' || i.err === 'auth');
      if (syAct.dataset.k === key) return;
      syAct.dataset.k = key;
      syAct.innerHTML = !i.on ? '<button type="button" class="pg-btn pri" data-sy="enable">開啟雲端同步</button><button type="button" class="pg-btn" data-sy="join">輸入同步碼</button>'
        : (i.err === 'gone' || i.err === 'auth') ? '<button type="button" class="pg-btn" data-sy="leave">停止這台裝置同步</button>'
        : '<button type="button" class="pg-btn" data-sy="now">立即同步</button><button type="button" class="pg-btn" data-sy="show">同步碼與 QR code</button>';
    }
    if (syAct) {
      syAct.addEventListener('click', function (e) {
        var b = e.target.closest('[data-sy]'); if (!b) return;
        var a = b.dataset.sy;
        if (a === 'now') syncNow();
        else if (a === 'show') syncDialog('show');
        else if (a === 'join') syncDialog('join');
        else if (a === 'leave') { syncLeave(); say('已停止這台裝置的雲端同步，本機記錄保留。'); }
        else if (a === 'enable') {
          b.disabled = true; b.textContent = '開啟中…';
          syncEnable().then(function () { syncDialog('show', true); }).catch(function (err) {
            say(err && err.message === 'rate' ? '今天開啟同步的次數太多，請明天再試。' : '無法連上同步服務，請稍後再試。現有記錄沒有任何變動。', true);
          }).then(function () { b.disabled = false; b.textContent = '開啟雲端同步'; syAct.dataset.k = ''; syncRow(); });
        }
      });
      subs.push(syncRow); syncRow(); setInterval(syncRow, 30000);
      /* QR / link: /me/#sync=CODE — read once, then wiped from the address bar and history */
      var hm = location.hash.match(/^#sync=([0-9A-Za-z\-]{16,24})$/);
      if (hm) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} syncDialog('join', false, hm[1]); }
    }
    subs.push(all); all();
  }

  /* ---------- (i) popovers shared by list pages and /me/: .js-pop[aria-controls] toggles a .ipop; Esc / outside click closes ---------- */
  var popOpen = null;
  function popClose(focus) {
    if (!popOpen) return; var p = popOpen; popOpen = null;
    p.el.hidden = true; doc.querySelectorAll('.js-pop[aria-controls="' + p.el.id + '"]').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
    if (focus && p.btn && p.btn.focus) p.btn.focus({ preventScroll: true });
  }
  function popOpenFor(btn) {
    var el = doc.getElementById(btn.getAttribute('aria-controls')); if (!el) return;
    if (popOpen && popOpen.el === el) { popClose(false); return; }
    popClose(false);
    el.hidden = false; el.style.left = ''; el.style.right = '';
    doc.querySelectorAll('.js-pop[aria-controls="' + el.id + '"]').forEach(function (b) { b.setAttribute('aria-expanded', 'true'); });
    popOpen = { el: el, btn: btn };
    var r = el.getBoundingClientRect(), over = r.right - (window.innerWidth - 12);
    if (over > 0) el.style.left = (parseFloat(getComputedStyle(el).left) || 0) - over + 'px';
    if (el.getBoundingClientRect().left < 12) el.style.left = (parseFloat(el.style.left) || 0) + (12 - el.getBoundingClientRect().left) + 'px';
  }
  doc.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.js-pop');
    if (b) { e.preventDefault(); popOpenFor(b); return; }
    if (popOpen && !popOpen.el.contains(e.target)) popClose(false);
  });
  doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && popOpen) { popClose(true); } });

  /* ---------- cloud sync (encrypted sync code) ----------
     A random 16-character code (Crockford base32, 80 bits) is the only secret. HKDF(code) gives
       id   (128 bit) — finds the vault on the server
       auth (256 bit) — read/write token; the server keeps only its SHA-256
       key  (AES-256-GCM) — encrypts the records in this browser; never sent anywhere
     The code lives in localStorage "l22-sync" next to the records it protects. Sync = GET → decrypt → merge → PUT when this
     device has something the cloud copy lacks; a 409 (another device wrote first) just repeats the round. */
  var SYNC = 'l22-sync', applying = false, syncTimer = 0, syncRun = null, syncAgain = false, syncBusy = false, lastVis = 0, keyCache = {};
  var API = (function () {
    var dflt = 'https://listen-sync.brienjohn.workers.dev';
    try { if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return localStorage.getItem('l22-sync-api') || dflt; } catch (e) {}
    return dflt;
  })();
  var ALPH = '0123456789ABCDEFGHJKMNPQRSTVWXYZ', TE = new TextEncoder();
  function sst() { try { return JSON.parse(localStorage.getItem(SYNC) || 'null') || {}; } catch (e) { return {}; } }
  function setSst(o) {
    var s = sst(), k; for (k in o) s[k] = o[k];
    try { if (s.code) localStorage.setItem(SYNC, JSON.stringify(s)); else localStorage.removeItem(SYNC); } catch (e) {}
    emit();
  }
  function newCode() { var b = crypto.getRandomValues(new Uint8Array(16)), c = ''; for (var i = 0; i < 16; i++) c += ALPH[b[i] & 31]; return c; }
  function normCode(v) {
    v = String(v || '').toUpperCase().replace(/[\s\-_.]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
    return /^[0-9A-HJKMNP-TV-Z]{16}$/.test(v) ? v : '';
  }
  function fmtCode(c) { return (c || '').match(/.{1,4}/g).join('-'); }
  var hex = function (buf) { return Array.prototype.map.call(new Uint8Array(buf), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); };
  function syncKeys(code) {
    if (keyCache[code]) return keyCache[code];
    var salt = TE.encode('listen.22cs.xyz/sync/v1');
    keyCache[code] = crypto.subtle.importKey('raw', TE.encode(code), 'HKDF', false, ['deriveBits', 'deriveKey']).then(function (base) {
      var p = function (info) { return { name: 'HKDF', hash: 'SHA-256', salt: salt, info: TE.encode(info) }; };
      return Promise.all([crypto.subtle.deriveBits(p('id'), base, 128), crypto.subtle.deriveBits(p('auth'), base, 256),
        crypto.subtle.deriveKey(p('enc'), base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])])
        .then(function (r) { return { id: hex(r[0]), auth: hex(r[1]), key: r[2] }; });
    });
    return keyCache[code];
  }
  var b64 = function (u8) { var s = ''; for (var i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  var unb64 = function (s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
  function pipe(u8, Stream) { return new Response(new Blob([u8]).stream().pipeThrough(new Stream('gzip'))).arrayBuffer().then(function (b) { return new Uint8Array(b); }); }
  function seal(obj, key) {  // → base64 of [1, gzip?, iv(12), ciphertext]
    var raw = TE.encode(JSON.stringify(obj)), gz = typeof CompressionStream === 'function';
    return (gz ? pipe(raw, CompressionStream) : Promise.resolve(raw)).then(function (body) {
      var iv = crypto.getRandomValues(new Uint8Array(12));
      return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, body).then(function (ct) {
        var out = new Uint8Array(14 + ct.byteLength); out[0] = 1; out[1] = gz ? 1 : 0; out.set(iv, 2); out.set(new Uint8Array(ct), 14);
        return b64(out);
      });
    });
  }
  function unseal(s, key) {
    var u = unb64(s); if (u[0] !== 1) return Promise.reject(new Error('version'));
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.subarray(2, 14) }, key, u.subarray(14)).then(function (pt) {
      pt = new Uint8Array(pt);
      if (!u[1]) return pt;
      if (typeof DecompressionStream !== 'function') throw new Error('gzip');
      return pipe(pt, DecompressionStream);
    }).then(function (b) { return JSON.parse(new TextDecoder().decode(b)); });
  }
  function payload() { var d = load(); return { v: 1, lists: d.lists, works: d.works, wx: d.wx || {}, favs: d.favs || {} }; }
  function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
    return JSON.stringify(v);
  }
  function api(method, id, auth, body) {
    return fetch(API + '/v1/vault' + (id ? '/' + id : ''), { method: method, cache: 'no-store', credentials: 'omit',
      headers: Object.assign(auth ? { Authorization: 'Bearer ' + auth } : {}, body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined });
  }
  function scheduleSync(ms) {
    if (!sst().code) return;
    clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, ms == null ? 3000 : ms);
  }
  function syncNow() {
    if (!sst().code) return Promise.resolve(false);
    if (syncRun) { syncAgain = true; return syncRun; }
    clearTimeout(syncTimer);
    var go = function () { return syncOnce(); };
    syncBusy = true; emit();
    syncRun = (navigator.locks && navigator.locks.request ? navigator.locks.request('l22-sync', go) : go())
      .catch(function () { setSst({ err: navigator.onLine === false ? 'offline' : 'net' }); scheduleSync(60000); return false; })
      .then(function (r) { syncRun = null; syncBusy = false; emit(); if (syncAgain) { syncAgain = false; scheduleSync(500); } return r; });
    return syncRun;
  }
  function syncOnce() {
    var s = sst(); if (!s.code) return Promise.resolve(false);
    if (navigator.onLine === false) { setSst({ err: 'offline' }); return Promise.resolve(false); }
    return syncKeys(s.code).then(function (k) {
      var round = function (n) {
        return api('GET', k.id, k.auth).then(function (r) {
          if (r.status === 404) { setSst({ err: 'gone' }); return false; }
          if (r.status === 403) { setSst({ err: 'auth' }); return false; }
          if (!r.ok) throw new Error('http ' + r.status);
          return r.json().then(function (j) {
            return unseal(j.blob, k.key).then(function (remote) {
              applying = true; try { merge(remote); } finally { applying = false; }
              var local = payload();
              if (stable(local) === stable({ v: 1, lists: remote.lists || {}, works: remote.works || {}, wx: remote.wx || {}, favs: remote.favs || {} })) {
                setSst({ rev: j.rev, at: Date.now(), err: '' }); return true;
              }
              return seal(local, k.key).then(function (blob) { return api('PUT', k.id, k.auth, { rev: j.rev, blob: blob }); }).then(function (p) {
                if (p.status === 409 && n < 4) return round(n + 1);
                if (!p.ok) throw new Error('http ' + p.status);
                return p.json().then(function (q) { setSst({ rev: q.rev, at: Date.now(), err: '' }); return true; });
              });
            });
          });
        });
      };
      return round(0);
    });
  }
  /* turn sync on for this device's records: new code + encrypted first copy */
  function syncEnable() {
    var code = newCode();
    return syncKeys(code).then(function (k) {
      return seal(payload(), k.key).then(function (blob) { return api('POST', null, null, { id: k.id, auth: k.auth, blob: blob }); }).then(function (r) {
        if (r.status === 409) return syncEnable();              // astronomically unlikely id collision
        if (r.status === 429) throw new Error('rate');
        if (!r.ok) throw new Error('http ' + r.status);
        setSst({ code: code, rev: 1, at: Date.now(), err: '' });
        return code;
      });
    });
  }
  /* look at the cloud copy for a code (nothing is merged yet) */
  function syncPeek(code) {
    code = normCode(code); if (!code) return Promise.reject(new Error('format'));
    return syncKeys(code).then(function (k) {
      return api('GET', k.id, k.auth).then(function (r) {
        if (r.status === 404 || r.status === 403) throw new Error('notfound');
        if (!r.ok) throw new Error('http ' + r.status);
        return r.json().then(function (j) { return unseal(j.blob, k.key); }).then(function (rem) {
          var nl = 0, nh = 0, nw = 0;
          Object.keys(rem.lists || {}).forEach(function (p) { var c = Object.keys((rem.lists[p] || {}).h || {}).length; if (c) { nl++; nh += c; } });
          Object.keys(rem.works || {}).forEach(function () { nw++; });
          return { code: code, lists: nl, heard: nh, works: nw };
        });
      });
    });
  }
  function syncJoin(code) { code = normCode(code); if (!code) return Promise.reject(new Error('format')); setSst({ code: code, rev: 0, at: 0, err: '' }); return syncNow(); }
  function syncLeave() { clearTimeout(syncTimer); try { localStorage.removeItem(SYNC); } catch (e) {} emit(); }
  function syncDelete() {
    var s = sst(); if (!s.code) return Promise.resolve();
    return syncKeys(s.code).then(function (k) { return api('DELETE', k.id, k.auth); }).then(function (r) {
      if (!r.ok && r.status !== 404) throw new Error('http ' + r.status);
      syncLeave();
    });
  }
  function syncInfo() { var s = sst(); return { on: !!s.code, code: s.code ? fmtCode(s.code) : '', at: s.at || 0, err: s.err || '', busy: syncBusy }; }
  function syncBoot() {
    if (!sst().code) return;
    syncNow();
    doc.addEventListener('visibilitychange', function () { if (doc.visibilityState === 'visible' && Date.now() - lastVis > 20000) { lastVis = Date.now(); syncNow(); } });
    window.addEventListener('online', function () { syncNow(); });
    window.addEventListener('pagehide', function () { if (syncTimer) { clearTimeout(syncTimer); syncNow(); } });
  }

  /* ---------- 同步 dialog: show code + QR / enter code / wipe choice (same frame as the review dialog) ---------- */
  var sdlg = null, qrLoad = null, jsqrLoad = null;
  function loadScript(src, name) { return new Promise(function (ok, bad) { var sc = doc.createElement('script'); sc.src = src; sc.onload = function () { ok(window[name]); }; sc.onerror = bad; doc.head.appendChild(sc); }); }
  function loadJsQR() { return window.jsQR ? Promise.resolve(window.jsQR) : (jsqrLoad || (jsqrLoad = loadScript('/js/jsqr.js', 'jsQR'))); }
  function loadQR() {
    if (window.qrcode) return Promise.resolve(window.qrcode);
    return qrLoad || (qrLoad = new Promise(function (ok, bad) { var sc = doc.createElement('script'); sc.src = '/js/qr.js'; sc.onload = function () { ok(window.qrcode); }; sc.onerror = bad; doc.head.appendChild(sc); }));
  }
  function syncDialog(mode, fresh, preset) {
    if (!sdlg) {
      sdlg = doc.createElement('dialog'); sdlg.className = 'rvdlg sydlg'; sdlg.setAttribute('aria-labelledby', 'syT');
      doc.body.appendChild(sdlg);
      sdlg.addEventListener('click', function (e) { if (e.target === sdlg) sdlg.close(); });
      sdlg.addEventListener('close', function () { if (sdlg._stop) sdlg._stop(); });
    }
    var i = syncInfo(), h = '<div class="rv-in"><div class="sy-hd"><h2 id="syT"></h2><button type="button" class="rv-x" data-x aria-label="關閉">×</button></div>';
    if (mode === 'show') {
      var link = location.origin + '/me/#sync=' + i.code.replace(/-/g, '');
      h += '<p class="sy-code" aria-label="同步碼">' + esc(i.code) + '</p>'
        + '<div class="sy-row"><button type="button" class="pg-btn" data-copy>複製同步碼</button></div>'
        + '<div class="sy-qr" aria-hidden="true"></div>'
        + '<p class="sy-p">在另一台裝置用<b>平常使用的瀏覽器</b>打開「我的聆聽記錄」→「輸入同步碼」→「用相機掃描」，對準這個 QR code。直接用手機相機或 LINE 掃描，可能會開在另一個獨立的視窗，記錄不會出現在平常的瀏覽器。</p>'
        + '<p class="sy-warn"><b>請另外存好這組碼。</b>它就是鑰匙：拿到的人能讀到你的記錄；弄丟了沒有辦法找回。</p>'
        + '<div class="rv-act"><button type="button" class="lnk-btn" data-del>刪除雲端資料</button><span class="rv-sp"></span><button type="button" class="pg-btn pri" data-x>完成</button></div>';
      sdlg.innerHTML = h + '</div>';
      sdlg.querySelector('#syT').textContent = fresh ? '雲端同步已開啟' : '同步碼';
      loadQR().then(function (q) {
        var qr = q(0, 'M'); qr.addData(link); qr.make();
        sdlg.querySelector('.sy-qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
      }).catch(function () {});
      sdlg.querySelector('[data-copy]').addEventListener('click', function (e) {
        var b = e.currentTarget;
        (navigator.clipboard ? navigator.clipboard.writeText(i.code) : Promise.reject()).then(function () { b.textContent = '已複製'; }, function () { b.textContent = '請手動選取複製'; });
      });
      sdlg.querySelector('[data-del]').addEventListener('click', function () {
        if (!confirm('確定刪除雲端上的這份同步資料嗎？\n所有使用這組同步碼的裝置都會停止同步，各裝置上的本機記錄會保留。')) return;
        syncDelete().then(function () { sdlg.close(); }, function () { alert('目前無法連上同步服務，請稍後再試。'); });
      });
    } else if (mode === 'join') {
      var canScan = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
      h += (preset ? '<div class="sy-warn"><b>這個頁面是從 QR code 開啟的。</b>如果它不是你平常使用的瀏覽器（例如相機的掃描視窗或 LINE），同步只會存在這個視窗裡。'
            + '建議複製下面的同步碼，到平常使用的瀏覽器打開 listen.22cs.xyz/me/，在「輸入同步碼」貼上。<div class="sy-row" style="margin-top:8px"><button type="button" class="pg-btn" data-copyin>複製同步碼</button></div></div>' : '')
        + '<label class="rv-lab" for="syIn">輸入同步碼</label><input id="syIn" class="sy-in" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="24" placeholder="XXXX-XXXX-XXXX-XXXX">'
        + (canScan && !preset ? '<div class="sy-row"><button type="button" class="pg-btn" data-scan>用相機掃描 QR code</button></div>' : '')
        + '<div class="sy-cam" hidden><video playsinline muted></video><p class="sy-p">把另一台裝置上的 QR code 放進畫面中</p><button type="button" class="lnk-btn" data-stop>停止掃描</button></div>'
        + '<p class="sy-p sy-msg" role="status"></p>'
        + '<div class="rv-act"><span class="rv-sp"></span><button type="button" class="pg-btn" data-x>取消</button><button type="button" class="pg-btn pri" data-go>下一步</button></div>';
      sdlg.innerHTML = h + '</div>';
      sdlg.querySelector('#syT').textContent = '在這台裝置開啟同步';
      var inp = sdlg.querySelector('#syIn'), msg = sdlg.querySelector('.sy-msg'), go = sdlg.querySelector('[data-go]'), peeked = null;
      if (preset) inp.value = fmtCode(normCode(preset) || String(preset).toUpperCase());
      var next = function () {
        if (peeked) {
          go.disabled = true; msg.textContent = '合併中…';
          syncJoin(peeked.code).then(function (ok) { if (ok) sdlg.close(); else { msg.textContent = '同步失敗，請稍後再試。'; go.disabled = false; } });
          return;
        }
        var c = normCode(inp.value);
        if (!c) { msg.textContent = '同步碼是 16 個英數字，請再確認一次。'; return; }
        go.disabled = true; msg.textContent = '尋找中…';
        syncPeek(c).then(function (r) {
          peeked = r; go.disabled = false; go.textContent = '合併並開啟同步'; inp.disabled = true;
          var L = lists().length, W = works().length;
          msg.textContent = '雲端有 ' + r.lists + ' 份清單的 ' + r.heard + ' 筆已聽、' + r.works + ' 則評分與筆記；這台裝置有 ' + L + ' 份清單、' + W + ' 則評分與筆記。'
            + '合併後兩邊會一致：沒有的會加入，同一筆以較新的為準，不會刪除任何一邊的記錄。';
        }, function (e) {
          go.disabled = false;
          msg.textContent = e && e.message === 'notfound' ? '找不到這組同步碼的雲端資料（可能輸入錯誤，或已被刪除）。' : '無法連上同步服務，請稍後再試。';
        });
      };
      go.addEventListener('click', next);
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); next(); } });
      var ci = sdlg.querySelector('[data-copyin]');
      if (ci) ci.addEventListener('click', function () {
        var c = normCode(inp.value); if (!c) return;
        (navigator.clipboard ? navigator.clipboard.writeText(fmtCode(c)) : Promise.reject()).then(function () { ci.textContent = '已複製'; }, function () { ci.textContent = '請手動選取複製'; });
      });
      /* in-page scanner: reads the QR inside THIS browser, so the code lands where the visitor normally browses */
      var cam = sdlg.querySelector('.sy-cam'), video = cam.querySelector('video'), stream = null, raf = 0, scanBtn = sdlg.querySelector('[data-scan]');
      var stopScan = function () { if (raf) cancelAnimationFrame(raf); raf = 0; if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; } video.srcObject = null; cam.hidden = true; if (scanBtn) scanBtn.hidden = false; };
      sdlg._stop = stopScan;
      cam.querySelector('[data-stop]').addEventListener('click', stopScan);
      if (scanBtn) scanBtn.addEventListener('click', function () {
        msg.textContent = '開啟相機中…'; scanBtn.hidden = true;
        loadJsQR().then(function (jsQR) {
          return navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }).then(function (st) {
            stream = st; video.srcObject = st; return video.play();
          }).then(function () {
            cam.hidden = false; msg.textContent = '';
            var cv = doc.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
            var tick = function () {
              if (!stream) return;
              if (video.readyState >= 2 && video.videoWidth) {
                var sc = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
                cv.width = Math.round(video.videoWidth * sc); cv.height = Math.round(video.videoHeight * sc);
                cx.drawImage(video, 0, 0, cv.width, cv.height);
                var r = jsQR(cx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height, { inversionAttempts: 'dontInvert' });
                if (r && r.data) {
                  var m = r.data.match(/#sync=([0-9A-Za-z\-]{16,24})/), c = normCode(m ? m[1] : r.data);
                  if (c) { stopScan(); inp.value = fmtCode(c); next(); return; }
                }
              }
              raf = requestAnimationFrame(tick);
            };
            tick();
          });
        }).catch(function (e) {
          stopScan();
          msg.textContent = e && e.name === 'NotAllowedError' ? '沒有取得相機權限。可以在瀏覽器設定裡允許使用相機，或直接輸入同步碼。' : '無法開啟相機，請直接輸入同步碼。';
        });
      });
    } else if (mode === 'wipe') {
      h += '<p class="sy-p">這台裝置開啟了雲端同步。要怎麼清除？兩種都無法復原，建議先匯出備份。</p>'
        + '<div class="sy-col"><button type="button" class="pg-btn" data-w="local">只清除這台裝置（並停止這台的同步）</button>'
        + '<button type="button" class="pg-btn danger" data-w="all">清除這台裝置，並刪除雲端資料</button>'
        + '<button type="button" class="pg-btn" data-x>取消</button></div>';
      sdlg.innerHTML = h + '</div>';
      sdlg.querySelector('#syT').textContent = '清除記錄';
      sdlg.querySelectorAll('[data-w]').forEach(function (b) {
        b.addEventListener('click', function () {
          var all = b.dataset.w === 'all';
          (all ? syncDelete() : Promise.resolve(syncLeave())).then(function () { wipe(); sdlg.close(); }, function () { alert('目前無法連上同步服務，雲端資料沒有刪除；請稍後再試。'); });
        });
      });
    }
    sdlg.querySelectorAll('[data-x]').forEach(function (b) { b.addEventListener('click', function () { sdlg.close(); }); });
    if (!sdlg.open) sdlg.showModal();
    var f = sdlg.querySelector('#syIn:not([disabled])') || sdlg.querySelector('[data-copy]') || sdlg.querySelector('[data-w]'); if (f) f.focus();
  }

  /* ---------- share images (V18.3.3): 1080×1350 PNG drawn in the browser from same-origin assets only (never taints the canvas).
     shareList(o) = one list's progress (list page), shareWork(w) = one work's rating + note (/me). Assets that fail to load are skipped. ---------- */
  var SH_IC = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 15V3.5M7.5 8 12 3.5 16.5 8"/><path d="M5 11.5v7A2 2 0 0 0 7 20.5h10a2 2 0 0 0 2-2v-7"/></svg>';
  var DL_IC = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/></svg>';
  var SF = '"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif';
  var SC = { bg: '#FFF8EF', ink: '#28282D', muted: '#69636B', coral: '#FF7A7A', coralT: '#A93643', mint: '#287E60', mintT: '#216B52', track: '#EFE4DA', gold: '#B07A00', line: '#EADFD6', panel: '#F3E8DE' };
  function shImg(src) {
    return new Promise(function (r) {
      if (!src) { r(null); return; }
      try { if (new URL(src, location.href).origin !== location.origin) { r(null); return; } } catch (e) { r(null); return; }
      var i = new Image(); i.onload = function () { (i.decode ? i.decode() : Promise.resolve()).then(function () { r(i); }, function () { r(i); }); }; i.onerror = function () { r(null); }; i.src = src;
    });
  }
  function shRR(x, X, Y, w, h, r) { x.beginPath(); if (x.roundRect) x.roundRect(X, Y, w, h, r); else x.rect(X, Y, w, h); }
  function shWrap(x, t, max, lim) {   // CJK breaks anywhere, Latin words stay whole; '\n' starts a new line
    var out = [];
    String(t || '').split(/\n/).forEach(function (para) {
      var toks = para.match(/[A-Za-z0-9À-ɏ'’.&!?:,;()\-]+|\s+|./gu) || [], cur = '';
      toks.forEach(function (k) {
        var nx = cur + k;
        if (x.measureText(nx.trim()).width > max && cur.trim()) { out.push(cur.trim()); cur = k.trimStart(); }
        else cur = nx;
        while (x.measureText(cur).width > max && cur.length > 1) {   // a single token wider than the line (long URL)
          var j = cur.length; while (j > 1 && x.measureText(cur.slice(0, j)).width > max) j--;
          out.push(cur.slice(0, j)); cur = cur.slice(j);
        }
      });
      out.push(cur.trim());
    });
    while (out.length > 1 && out[out.length - 1] === '') out.pop();
    var cut = false;
    if (lim && out.length > lim) {
      cut = true; out.length = lim; var l = out[lim - 1];
      while (l && x.measureText(l + '…').width > max) l = l.slice(0, -1);
      out[lim - 1] = l + '…';
    }
    out.cut = cut; return out;
  }
  function shFonts(sample) {
    try {
      return Promise.race([
        (doc.fonts && doc.fonts.ready ? doc.fonts.ready : Promise.resolve()).then(function () {
          return Promise.all(['900 72px', '800 32px', '700 30px', '500 34px'].map(function (f) { return doc.fonts.load(f + ' "Noto Sans TC"', sample); }));
        }),
        new Promise(function (r) { setTimeout(r, 2500); })
      ]).catch(function () {});
    } catch (e) { return Promise.resolve(); }
  }
  function shStar(x, cx, cy, R) {
    x.beginPath();
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? R * 0.45 : R; x.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a)); }
    x.closePath();
  }
  function shStars(x, X, cy, r, size) {   // filled stars only (site rule): ★ per whole point, a half star for .5
    x.fillStyle = SC.gold; var full = Math.floor(r), half = r - full >= 0.5, gap = size * 0.18, cx = X + size / 2;
    for (var i = 0; i < full; i++) { shStar(x, cx, cy, size / 2); x.fill(); cx += size + gap; }
    if (half) { x.save(); x.beginPath(); x.rect(cx - size / 2, cy - size, size / 2, size * 2); x.clip(); shStar(x, cx, cy, size / 2); x.fill(); x.restore(); cx += size + gap; }
    return cx - size / 2 - gap;
  }
  function shCover(x, im, X, Y, s, rot, label) {   // square cover with a white frame + soft shadow
    x.save(); x.translate(X + s / 2, Y + s / 2); x.rotate(rot || 0);
    x.shadowColor = 'rgba(40,24,20,.28)'; x.shadowBlur = 34; x.shadowOffsetY = 14;
    shRR(x, -s / 2 - 8, -s / 2 - 8, s + 16, s + 16, 18); x.fillStyle = '#fff'; x.fill();
    x.shadowColor = 'transparent';
    shRR(x, -s / 2, -s / 2, s, s, 12); x.save(); x.clip();
    if (im) x.drawImage(im, -s / 2, -s / 2, s, s);
    else { x.fillStyle = SC.panel; x.fillRect(-s / 2, -s / 2, s, s); x.fillStyle = SC.muted; x.font = '900 ' + Math.round(s * 0.3) + 'px ' + SF; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(label || '').trim().slice(0, 2), 0, 0); x.textAlign = 'left'; x.textBaseline = 'alphabetic'; }
    x.restore(); x.restore();
  }
  function shBrand(x, W, H, M, ico, wm) {   // bottom brand row: approved baby logo + 聆聽清單 by 22CS · address
    var h = 64, y = H - M - h, bx = M;
    if (ico) { var w = Math.round(ico.naturalWidth / ico.naturalHeight * h) || 62; x.drawImage(ico, M, y, w, h); bx = M + w + 16; }
    x.textBaseline = 'alphabetic'; x.fillStyle = SC.ink; x.font = '900 30px ' + SF; x.fillText('聆聽清單', bx, y + 30);
    x.fillStyle = SC.muted; x.font = '700 20px ' + SF; x.fillText('by', bx, y + 58);
    if (wm) x.drawImage(wm, bx + x.measureText('by').width + 8, y + 42, 63, 18);
    x.fillStyle = SC.muted; x.font = '700 26px ' + SF; x.textAlign = 'right'; x.fillText('listen.22cs.xyz', W - M, y + 44); x.textAlign = 'left';
  }
  function shTitle(x, t, maxW, from, to, lines) {   // biggest size (step 4px) that fits in `lines` lines
    var fs = from, L;
    for (; fs >= to; fs -= 4) { x.font = '900 ' + fs + 'px ' + SF; L = shWrap(x, t, maxW, 0); if (L.length <= lines) break; }
    if (fs < to) fs = to;
    x.font = '900 ' + fs + 'px ' + SF; L = shWrap(x, t, maxW, lines);
    return { fs: fs, lines: L };
  }

  /* list progress card. o = {title, path, sub, total, unit, n, rated, noted, covers:[src], coversLabel} */
  function drawList(o) {
    var W = 1080, H = 1350, M = 72, IW = W - M * 2, cv = doc.createElement('canvas'); cv.width = W; cv.height = H; var x = cv.getContext('2d');
    var slug = (o.path || '').split('/')[1] || '';
    return shFonts(o.title + o.sub + '已聽評分筆記還沒聽最近聽過已完成0123456789%／').then(function () {
      return Promise.all([shImg('/img/baby-coral-surprised.png'), shImg('/img/22cs-wordmark-coral.svg'), slug ? shImg('/img/banners/' + slug + '-1200.jpg') : null]
        .concat((o.covers || []).slice(0, 4).map(shImg)));
    }).then(function (A) {
      var ico = A[0], wm = A[1], bn = A[2], covers = A.slice(3);
      var n = o.n, T = o.total, pct = T ? Math.round(n / T * 100) : 0, done = T > 0 && n >= T;
      x.fillStyle = SC.bg; x.fillRect(0, 0, W, H); x.textBaseline = 'alphabetic';
      /* 1 · title block */
      x.fillStyle = SC.coralT; x.font = '800 30px ' + SF; x.fillText(o.sub, M, M + 30);
      var tt = shTitle(x, o.title, IW, 76, 48, 2), y = M + 30 + 22 + tt.fs * 0.95;
      x.fillStyle = SC.ink; tt.lines.forEach(function (l) { x.fillText(l, M, y); y += tt.fs * 1.2; });
      var titleBottom = y - tt.fs * 1.2 + tt.fs * 0.28;
      /* bottom-anchored blocks: brand · stat tiles · track · big count */
      var tileH = 118, tileY = H - M - 64 - 46 - tileH, trackY = tileY - 46 - 22, numBase = trackY - 30, numTop = numBase - 112;
      /* 2 · main visual: series banner panel with the cover stack on top */
      var pY = titleBottom + 40, pH = Math.max(340, Math.min(560, numTop - 44 - pY));
      shRR(x, M, pY, IW, pH, 28); x.save(); x.clip();
      if (bn) {
        var s2 = Math.max(IW / bn.naturalWidth, pH / bn.naturalHeight), dw = bn.naturalWidth * s2, dh = bn.naturalHeight * s2, fx = (FOCUS[slug] || 75) / 100;
        x.drawImage(bn, M + (IW - dw) * fx, pY + (pH - dh) / 2, dw, dh);
        x.fillStyle = 'rgba(20,14,12,.16)'; x.fillRect(M, pY, IW, pH);
      } else { x.fillStyle = SC.panel; x.fillRect(M, pY, IW, pH); }
      x.restore();
      if (covers.length) {
        var k = covers.length, cs = Math.floor(Math.min(300, pH - 96, (IW - 64) / (1 + (k - 1) * 0.78))), step = Math.round(cs * 0.78), tw = cs + (k - 1) * step, cx0 = M + (IW - tw) / 2, cy = pY + (pH - cs) / 2 + (o.coversLabel ? 16 : 0);
        var rots = [-0.05, 0.035, -0.03, 0.05];
        covers.forEach(function (im, i) { shCover(x, im, cx0 + i * step, cy, cs, rots[i % 4], ''); });
      }
      if (o.coversLabel && covers.length) {
        x.font = '800 24px ' + SF; var lw = x.measureText(o.coversLabel).width + 36;
        shRR(x, M + 24, pY + 24, lw, 46, 23); x.fillStyle = 'rgba(255,255,255,.94)'; x.fill();
        x.fillStyle = SC.ink; x.fillText(o.coversLabel, M + 42, pY + 56);
      }
      /* 3 · progress: count / total, percentage, track */
      x.fillStyle = SC.ink; x.font = '900 150px ' + SF; var ns = String(n); x.fillText(ns, M - 4, numBase);
      var nw = x.measureText(ns).width;
      x.fillStyle = SC.muted; x.font = '700 44px ' + SF; x.fillText('/ ' + T + ' ' + (o.unit || ''), M + nw + 14, numBase);
      x.fillStyle = SC.mintT; x.font = '900 60px ' + SF; x.textAlign = 'right'; x.fillText(done ? '已完成' : pct + '%', W - M, numBase); x.textAlign = 'left';
      shRR(x, M, trackY, IW, 22, 11); x.fillStyle = SC.track; x.fill();
      if (n && T) { shRR(x, M, trackY, Math.max(22, IW * Math.min(1, n / T)), 22, 11); x.fillStyle = SC.mint; x.fill(); }
      /* 4 · stat tiles */
      var tiles = [[o.rated, '已評分'], [o.noted, '則筆記'], [Math.max(0, T - n), '還沒聽']], tw2 = (IW - 2 * 20) / 3;
      tiles.forEach(function (t, i) {
        var tx = M + i * (tw2 + 20);
        shRR(x, tx, tileY, tw2, tileH, 22); x.fillStyle = '#fff'; x.fill(); x.strokeStyle = SC.line; x.lineWidth = 2; x.stroke();
        x.fillStyle = SC.ink; x.font = '900 52px ' + SF; x.fillText(String(t[0]), tx + 28, tileY + 66);
        x.fillStyle = SC.muted; x.font = '700 24px ' + SF; x.fillText(t[1], tx + 28, tileY + 100);
      });
      /* 5 · brand */
      shBrand(x, W, H, M, ico, wm);
      return cv;
    });
  }

  /* one work: cover, title, artist, filled stars, the note (as much as fits; long notes switch to a 1080×1920 canvas) */
  function drawWork(w) {
    var W = 1080, M = 72, IW = W - M * 2, note = String(w.n || '').replace(/\r/g, '').trim();
    return shFonts((w.ti || '') + (w.ar || '') + note.slice(0, 400) + (w.fromT || '') + '我的聆聽筆記評分').then(function () {
      return Promise.all([shImg('/img/baby-coral-surprised.png'), shImg('/img/22cs-wordmark-coral.svg'), shImg(w.img)]);
    }).then(function (A) {
      var ico = A[0], wm = A[1], cov = A[2];
      var probe = doc.createElement('canvas').getContext('2d'), CS = 400, noteTop = M + 52 + CS + 56, padX = 48, NW = IW - padX * 2;
      /* pick the canvas height + note size: 1350 first (font 40 → 28px), then 1920 for long notes, then truncate */
      var plan = null, sizes = [40, 36, 32, 28];
      [1350, 1920].some(function (H) {
        var avail = H - M - 64 - 48 - noteTop - 60 - padX * 2;   // brand + gap, label row, panel padding
        return sizes.some(function (fs) {
          probe.font = '500 ' + fs + 'px ' + SF; var L = shWrap(probe, note, NW, 0), lh = Math.round(fs * 1.62);
          if (L.length * lh <= avail) { plan = { H: H, fs: fs, lh: lh, lines: L }; return true; }
          return false;
        });
      });
      if (!plan) { var H2 = 1920, fs2 = 28, lh2 = Math.round(fs2 * 1.62), av2 = H2 - M - 64 - 48 - noteTop - 60 - padX * 2; probe.font = '500 ' + fs2 + 'px ' + SF; plan = { H: H2, fs: fs2, lh: lh2, lines: shWrap(probe, note, NW, Math.floor(av2 / lh2)) }; }
      if (!note) plan = { H: 1350, fs: 0, lh: 0, lines: [] };
      if (note) plan.H = Math.max(1350, Math.min(plan.H, noteTop + 52 + plan.lines.length * plan.lh + padX * 2 + 4 + 72 + 64 + M));
      var H = plan.H, cv = doc.createElement('canvas'); cv.width = W; cv.height = H; var x = cv.getContext('2d');
      x.fillStyle = SC.bg; x.fillRect(0, 0, W, H); x.textBaseline = 'alphabetic';
      /* list name (eyebrow) */
      x.fillStyle = SC.coralT; x.font = '800 30px ' + SF; if (!note) x.textAlign = 'center';
      x.fillText(shWrap(x, w.fromT ? '來自「' + w.fromT + '」' : '我的聆聽筆記', IW, 1)[0], note ? M : W / 2, M + 30); x.textAlign = 'left';
      /* cover + title / artist / stars */
      var big = !note, cs = big ? 600 : CS, cY = M + 60;
      if (big) { shCover(x, cov, (W - cs) / 2, cY, cs, 0, w.ti); }
      else shCover(x, cov, M, cY, cs, 0, w.ti);
      var tx = big ? W / 2 : M + cs + 48, tw = big ? IW : IW - cs - 48, ty = big ? cY + cs + 84 : cY + 8;
      if (big) x.textAlign = 'center';
      var tt = shTitle(x, w.ti || '', tw, big ? 72 : 60, 40, big ? 2 : 4), y = ty + tt.fs * 0.95;
      x.fillStyle = SC.ink; tt.lines.forEach(function (l) { x.fillText(l, tx, y); y += tt.fs * 1.2; });
      y = y - tt.fs * 1.2 + 14;
      if (w.ar) { x.fillStyle = SC.muted; x.font = '700 32px ' + SF; shWrap(x, w.ar, tw, 2).forEach(function (l) { y += 44; x.fillText(l, tx, y); }); }
      x.textAlign = 'left';
      if (w.r > 0) { var sw = 46 * Math.ceil(+w.r) + 46 * 0.18 * (Math.ceil(+w.r) - 1); shStars(x, big ? (W - sw) / 2 : tx, y + 56, +w.r, 46); }
      /* note panel */
      if (note) {
        var pY = noteTop, pH = plan.lines.length * plan.lh + padX * 2 + 4;
        x.fillStyle = SC.coralT; x.font = '800 26px ' + SF; x.fillText('我的筆記', M, pY + 26);
        pY += 52; shRR(x, M, pY, IW, pH, 28); x.fillStyle = '#fff'; x.fill(); x.strokeStyle = SC.line; x.lineWidth = 2; x.stroke();
        x.fillStyle = SC.ink; x.font = '500 ' + plan.fs + 'px ' + SF;
        var ly = pY + padX + plan.fs * 0.92;
        plan.lines.forEach(function (l) { x.fillText(l, M + padX, ly); ly += plan.lh; });
        if (plan.lines.cut) { x.fillStyle = SC.muted; x.font = '700 22px ' + SF; x.textAlign = 'right'; x.fillText('筆記共 ' + note.length + ' 字，圖片只放得下前段', W - M - padX, pY + pH - 18); x.textAlign = 'left'; }
      }
      shBrand(x, W, H, M, ico, wm);
      return cv;
    });
  }

  /* one dialog for both kinds: preview, 分享 (Web Share with the PNG when the device supports it), 下載圖片, 重試 */
  var shd = null, shUrl = '';
  function shareOpen(o) {
    if (!shd) {
      shd = doc.createElement('dialog'); shd.className = 'shdlg'; shd.setAttribute('aria-labelledby', 'shH2');
      shd.innerHTML = '<div class="sh-in"><div class="sh-hd"><h2 id="shH2"></h2><button type="button" class="sh-x" aria-label="關閉">×</button></div>'
        + '<div class="sh-pv"><p class="sh-st" role="status">正在產生圖片…</p><img class="sh-img" alt="" hidden></div>'
        + '<div class="sh-act"><button type="button" class="pg-btn pri sh-go" hidden>' + SH_IC + '分享</button><a class="pg-btn sh-dl" download hidden>' + DL_IC + '下載圖片</a><button type="button" class="pg-btn sh-re" hidden>重試</button></div>'
        + '<p class="sh-note"></p></div>';
      doc.body.appendChild(shd);
      shd.querySelector('.sh-x').addEventListener('click', function () { shd.close(); });
      shd.addEventListener('click', function (e) { if (e.target === shd) shd.close(); });
    }
    var st = shd.querySelector('.sh-st'), im = shd.querySelector('.sh-img'), go = shd.querySelector('.sh-go'), dl = shd.querySelector('.sh-dl'), re = shd.querySelector('.sh-re');
    shd.querySelector('#shH2').textContent = o.heading; shd.querySelector('.sh-note').textContent = o.note; im.alt = o.alt || o.heading;
    var busy = false;
    function render() {
      if (busy) return; busy = true;
      im.hidden = dl.hidden = go.hidden = re.hidden = true; st.hidden = false; st.classList.remove('err'); st.textContent = '正在產生圖片…';
      o.make().then(function (cv) {
        return new Promise(function (r) { cv.toBlob(r, 'image/png'); });
      }).then(function (blob) {
        if (!blob || blob.size < 2000) throw new Error('empty');
        if (shUrl) URL.revokeObjectURL(shUrl); shUrl = URL.createObjectURL(blob);
        im.src = shUrl; dl.href = shUrl; dl.download = o.file;
        var file = new File([blob], o.file, { type: 'image/png' }), can = !!(navigator.canShare && navigator.canShare({ files: [file] }));
        go.hidden = !can;
        go.onclick = function () { navigator.share({ files: [file], title: o.title, text: o.text + ' ' + o.url }).catch(function () {}); };
        st.hidden = true; im.hidden = false; dl.hidden = false;
      }).catch(function () { st.textContent = '圖片產生失敗，請再試一次。'; st.classList.add('err'); re.hidden = false; })
        .then(function () { busy = false; });
    }
    re.onclick = render;
    if (!shd.open) shd.showModal();
    render();
  }
  function shareList(o) {
    shareOpen({ heading: '分享我的聆聽進度', alt: '聆聽進度分享圖', note: '圖片在你的瀏覽器裡產生，包含這份清單的進度、最近聽過的封面與評分、筆記的數量，不含筆記內容。',
      make: function () { return drawList(o); }, file: '22cs-listening-' + ((o.path || '').replace(/^\/|\/$/g, '').replace(/\//g, '-') || 'list') + '.png',
      title: o.title, text: '我在「' + o.title + '」已聽 ' + o.n + ' / ' + o.total + ' ' + (o.unit || ''), url: location.origin + (o.path || '/') });
  }
  function shareWork(w) {
    var nm = (String(w.ti || 'note').replace(/[^\w㐀-鿿\-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'note');
    shareOpen({ heading: '分享這則評分與筆記', alt: '評分與筆記分享圖', note: '圖片在你的瀏覽器裡產生，會包含這則筆記的內容，分享前請確認。',
      make: function () { return drawWork(w); }, file: '22cs-note-' + nm + '.png',
      title: w.ti || '', text: '「' + (w.ti || '') + '」' + (w.ar ? '— ' + w.ar : ''), url: location.origin + (w.from || '/') });
  }


  window.L22S = { load: load, setHeard: setHeard, clearList: clearList, lists: lists, work: work, saveWork: saveWork, works: works, isFav: isFav, setFav: setFav, favs: favs,
    exportFile: exportFile, readFile: readFile, importFile: importFile, merge: merge, wipe: wipe, available: available, openReview: openReview,
    renderResume: renderResume, shareList: shareList, shareWork: shareWork, starsHTML: starsHTML, fmtR: fmtR, rel: rel, esc: esc, onChange: function (f) { subs.push(f); },
    sync: { info: syncInfo, now: syncNow, enable: syncEnable, peek: syncPeek, join: syncJoin, leave: syncLeave, del: syncDelete, norm: normCode, fmt: fmtCode } };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
  function init() {
    syncBoot();
    renderMe();
    var hr = doc.getElementById('homeResume');
    if (hr) { var go = function () { renderResume(hr, { limit: 3 }); }; subs.push(go); go(); }
  }
})();
