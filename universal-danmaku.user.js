// ==UserScript==
// @name         通用弹幕播放器 Universal Danmaku
// @namespace    https://example.local/universal-danmaku
// @version      0.1.0
// @description  在任意网页视频上叠加弹幕：支持导入B站XML/弹弹play JSON、按BV号加载B站弹幕、搜索弹弹play弹幕库
// @match        *://*/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      api.dandanplay.net
// @connect      api.bilibili.com
// @connect      comment.bilibili.com
// ==/UserScript==

(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 配置
   * ------------------------------------------------------------------ */
  const DEF = {
    enabled: true, opacity: 0.85, fontSize: 24, speed: 1, area: 0.7, offset: 0,
    scroll: true, top: true, bottom: true, block: '', appId: '', appSecret: '',
  };
  const cfg = Object.assign({}, DEF, GM_getValue('cfg', {}));
  const saveCfg = () => GM_setValue('cfg', cfg);
  const pageKey = () => 'dm:' + location.origin + location.pathname;

  /* ------------------------------------------------------------------ *
   * 网络 & 工具
   * ------------------------------------------------------------------ */
  const gmGet = (url, headers = {}) => new Promise((res, rej) => GM_xmlhttpRequest({
    method: 'GET', url, headers, timeout: 20000,
    onload: r => (r.status >= 200 && r.status < 300) ? res(r.responseText) : rej(new Error('HTTP ' + r.status)),
    onerror: () => rej(new Error('网络错误')),
    ontimeout: () => rej(new Error('请求超时')),
  }));

  //<sha
  // 纯JS SHA-256（http 页面没有 crypto.subtle，所以自带一份）
  function sha256(msg) {
    const K = [], H = [];
    for (let n = 2, c = 0; c < 64; n++) {
      let p = true;
      for (let i = 2; i * i <= n; i++) if (n % i === 0) { p = false; break; }
      if (!p) continue;
      if (c < 8) H[c] = (Math.pow(n, 0.5) % 1) * 4294967296 | 0;
      K[c] = (Math.pow(n, 1 / 3) % 1) * 4294967296 | 0;
      c++;
    }
    const l = msg.length, bl = ((l + 9 + 63) >> 6) << 6;
    const buf = new Uint8Array(bl); buf.set(msg); buf[l] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(bl - 4, (l * 8) >>> 0);
    dv.setUint32(bl - 8, Math.floor(l * 8 / 4294967296));
    const w = new Int32Array(64), rr = (x, n) => (x >>> n) | (x << (32 - n));
    let h = H.slice();
    for (let o = 0; o < bl; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getInt32(o + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, hh] = h;
      for (let i = 0; i < 64; i++) {
        const t1 = (hh + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h = h.map((x, i) => (x + [a, b, c, d, e, f, g, hh][i]) | 0);
    }
    const out = new Uint8Array(32), odv = new DataView(out.buffer);
    h.forEach((x, i) => odv.setInt32(i * 4, x));
    return out;
  }
  //sha>
  const sha256b64 = s => btoa(String.fromCharCode(...sha256(new TextEncoder().encode(s))));

  /* ------------------------------------------------------------------ *
   * 弹幕解析  统一格式: {t:秒, k:'scroll'|'top'|'bottom', c:'#rrggbb', x:文本}
   * ------------------------------------------------------------------ */
  const hex = n => '#' + ((+n >>> 0) & 0xFFFFFF).toString(16).padStart(6, '0');
  const kindOf = m => m === 4 ? 'bottom' : m === 5 ? 'top' : 'scroll';

  // B站 XML: <d p="时间,模式,字号,颜色,时间戳,池,uid,id">文本</d>
  function parseXML(text) {
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    const out = [];
    doc.querySelectorAll('d').forEach(d => {
      const p = (d.getAttribute('p') || '').split(',');
      const m = +p[1];
      if (m >= 1 && m <= 6) out.push({ t: +p[0], k: kindOf(m), c: hex(p[3]), x: d.textContent });
    });
    return out;
  }
  // 弹弹play JSON: {comments:[{p:"时间,模式,颜色,uid", m:"文本"}]}
  function parseJSON(text) {
    const j = JSON.parse(text);
    const arr = Array.isArray(j) ? j : (j.comments || j.data || []);
    const out = [];
    arr.forEach(o => {
      if (!o || o.p == null || o.m == null) return;
      const p = String(o.p).split(',');
      out.push({ t: +p[0], k: kindOf(+p[1]), c: hex(p[2]), x: String(o.m) });
    });
    return out;
  }
  function parseAny(text) {
    const list = (text.trimStart().startsWith('<') ? parseXML(text) : parseJSON(text))
      .filter(d => isFinite(d.t) && d.x);
    list.sort((a, b) => a.t - b.t);
    return list;
  }

  /* ------------------------------------------------------------------ *
   * 数据源
   * ------------------------------------------------------------------ */
  async function loadBilibili(input) {
    input = input.trim();
    let cid = null;
    const bv = input.match(/BV[0-9A-Za-z]{10}/), av = input.match(/av(\d+)/i);
    if (bv || av) {
      const page = +((input.match(/[?&]p=(\d+)/) || [])[1] || 1);
      const q = bv ? 'bvid=' + bv[0] : 'aid=' + av[1];
      const j = JSON.parse(await gmGet('https://api.bilibili.com/x/player/pagelist?' + q));
      if (!j.data || !j.data.length) throw new Error('找不到该视频：' + (j.message || ''));
      cid = (j.data[page - 1] || j.data[0]).cid;
    } else if (/^\d+$/.test(input)) cid = input;
    else throw new Error('请输入 BV号 / 视频链接 / cid');
    const xml = await gmGet('https://api.bilibili.com/x/v1/dm/list.so?oid=' + cid);
    return parseAny(xml);
  }

  async function ddp(path, query) {
    if (!cfg.appId || !cfg.appSecret) throw new Error('请先在「弹弹play API 凭证」里填写 AppId / AppSecret');
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = sha256b64(cfg.appId + ts + path + cfg.appSecret);
    const text = await gmGet('https://api.dandanplay.net' + path + (query ? '?' + query : ''), {
      'X-AppId': cfg.appId, 'X-Timestamp': ts, 'X-Signature': sig, Accept: 'application/json',
    });
    return JSON.parse(text);
  }
  const ddpSearch = kw => ddp('/api/v2/search/episodes', 'anime=' + encodeURIComponent(kw));
  async function ddpComments(episodeId) {
    const j = await ddp('/api/v2/comment/' + episodeId, 'withRelated=true&chConvert=0');
    return parseJSON(JSON.stringify(j.comments || []));
  }

  /* ------------------------------------------------------------------ *
   * 弹幕引擎：弹幕位置 = f(视频当前时间)，所以暂停/拖动进度/倍速天然正确
   * ------------------------------------------------------------------ */
  const eng = { list: [], idx: 0, active: [], lanes: { scroll: [], top: [], bottom: [] }, last: -1e9, W: 0, H: 0, blocks: [] };
  let video = null;

  function compileBlocks() {
    eng.blocks = cfg.block.split('\n').map(s => s.trim()).filter(Boolean).map(s => {
      const m = s.match(/^\/(.+)\/([a-z]*)$/);
      try { return m ? new RegExp(m[1], m[2]) : s; } catch (e) { return s; }
    });
  }
  const blocked = x => eng.blocks.some(b => typeof b === 'string' ? x.includes(b) : b.test(x));
  const forceReset = () => { eng.last = -1e9; };

  function lowerBound(list, t) {
    let lo = 0, hi = list.length;
    while (lo < hi) { const m = (lo + hi) >> 1; list[m].t < t ? lo = m + 1 : hi = m; }
    return lo;
  }

  function spawn(it, ctx) {
    if (!cfg[it.k] || blocked(it.x)) return;
    const fs = eng.fs, lh = fs * 1.3;
    const n = Math.max(1, Math.floor(eng.H * cfg.area / lh));
    if (it._fs !== fs) { it._w = ctx.measureText(it.x).width; it._fs = fs; }
    const lanes = eng.lanes[it.k];
    for (let i = 0; i < n; i++) {
      if ((lanes[i] ?? -1e9) > it.t) continue;
      lanes[i] = it.k === 'scroll' ? it.t + (it._w + 24) / eng.v : it.t + 4;
      eng.active.push({ it, w: it._w, lane: i });
      return;
    }
    // 没有空轨道：丢弃，避免重叠
  }

  /* ------------------------------------------------------------------ *
   * DOM：覆盖层(Shadow DOM) + 画布 + 面板
   * ------------------------------------------------------------------ */
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
  const sh = host.attachShadow({ mode: 'open' });
  sh.innerHTML = `
<style>
  :host{all:initial}
  canvas{position:absolute;pointer-events:none}
  #ui{position:absolute;text-align:right;pointer-events:auto;font:13px/1.5 system-ui,"PingFang SC","Microsoft YaHei",sans-serif}
  #fab{display:inline-block;width:32px;height:32px;line-height:32px;text-align:center;border-radius:50%;
       background:rgba(0,0,0,.55);color:#fff;cursor:pointer;opacity:.3;transition:opacity .2s;user-select:none}
  #ui:hover #fab,#fab.on{opacity:1}
  #panel{display:none;margin-top:6px;width:320px;max-height:var(--mh,480px);overflow:auto;text-align:left;box-sizing:border-box;
         background:rgba(20,20,24,.95);color:#eee;padding:12px;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,.5)}
  #panel.open{display:inline-block}
  h4{margin:12px 0 4px;font-size:12px;color:#9aa}
  .row{display:flex;gap:6px;align-items:center;margin:4px 0}
  .row>input[type=text],.row>input:not([type]){flex:1;min-width:0}
  input,textarea,button{font:inherit;color:#eee;background:#333;border:1px solid #555;border-radius:5px;padding:3px 6px}
  input[type=range]{flex:1;padding:0}
  input[type=number]{width:58px}
  input[type=checkbox]{margin:0 3px 0 0}
  button{cursor:pointer}button:hover{background:#444}
  textarea{width:100%;box-sizing:border-box;height:52px;resize:vertical}
  #res{max-height:140px;overflow:auto}
  #res div{padding:3px 4px;cursor:pointer;border-radius:4px}#res div:hover{background:#3a3a44}
  #msg{margin-top:8px;color:#8c8;min-height:1em;word-break:break-all}#msg.err{color:#f88}
  label{margin-right:8px;white-space:nowrap}
  .sp{flex:1}
  summary{cursor:pointer;color:#9aa;font-size:12px;margin-top:10px}
</style>
<canvas id="cv"></canvas>
<div id="ui">
  <div id="fab" title="弹幕设置（Alt+D 开关弹幕）">弹</div>
  <div id="panel">
    <div class="row"><b>弹幕</b><span id="stat" style="color:#9aa"></span><span class="sp"></span>
      <label><input type="checkbox" id="en">显示</label></div>

    <h4>导入文件（B站 XML / 弹弹play JSON）</h4>
    <input type="file" id="file" accept=".xml,.json,.txt">

    <h4>Bilibili 弹幕</h4>
    <div class="row"><input id="bili" placeholder="BV号 / 视频链接(可带?p=2) / cid"><button id="biliGo">加载</button></div>

    <h4>弹弹play 弹幕库</h4>
    <div class="row"><input id="q" placeholder="作品名，如 葬送的芙莉莲"><button id="qGo">搜索</button></div>
    <div id="res"></div>
    <details><summary>弹弹play API 凭证（开放平台申请）</summary>
      <div class="row"><span>AppId</span><input id="aid"></div>
      <div class="row"><span>Secret</span><input id="asec" type="password"></div>
    </details>

    <h4>显示设置</h4>
    <div class="row"><span>透明度</span><input type="range" id="op" min="0.1" max="1" step="0.05"></div>
    <div class="row"><span>字号</span><input type="range" id="fsz" min="12" max="48" step="1"></div>
    <div class="row"><span>速度</span><input type="range" id="sp" min="0.5" max="2.5" step="0.1"></div>
    <div class="row"><span>区域</span><input type="range" id="ar" min="0.1" max="1" step="0.05"></div>
    <div class="row"><span>偏移</span>
      <button data-off="-1">-1</button><button data-off="-0.5">-.5</button>
      <input type="number" id="off" step="0.5"><span>秒</span>
      <button data-off="0.5">+.5</button><button data-off="1">+1</button></div>
    <div class="row"><label><input type="checkbox" id="ks">滚动</label>
      <label><input type="checkbox" id="kt">顶部</label><label><input type="checkbox" id="kb">底部</label></div>
    <textarea id="blk" placeholder="屏蔽词，每行一个；/正则/ 也可以"></textarea>
    <div class="row"><button id="clr">清空当前弹幕</button></div>
    <div id="msg"></div>
  </div>
</div>`;
  const $ = id => sh.getElementById(id);
  const cv = $('cv'), ui = $('ui'), panel = $('panel'), ctx = cv.getContext('2d');

  const msg = (t, err) => { const m = $('msg'); m.textContent = t; m.className = err ? 'err' : ''; };
  const stat = () => { $('stat').textContent = eng.list.length ? `已加载 ${eng.list.length} 条` : '未加载'; };

  function setList(list, label) {
    eng.list = list; forceReset(); stat();
    try {
      const s = JSON.stringify({ label, list });
      GM_setValue(pageKey(), s.length < 3e6 ? s : null);
    } catch (e) { /* 存储失败不影响播放 */ }
    msg(`已加载 ${list.length} 条弹幕` + (label ? `（${label}）` : ''));
  }
  function restore() {
    try {
      const s = GM_getValue(pageKey(), null);
      const o = s ? JSON.parse(s) : null;
      eng.list = o ? o.list : []; forceReset(); stat();
    } catch (e) { eng.list = []; }
  }

  // 阻止面板里的按键触发网页快捷键（空格暂停等）
  ['keydown', 'keyup', 'keypress'].forEach(ev => panel.addEventListener(ev, e => e.stopPropagation()));
  $('fab').onclick = () => { panel.classList.toggle('open'); $('fab').classList.toggle('on'); };

  // 设置绑定
  const bindings = [
    ['op', 'opacity', Number], ['fsz', 'fontSize', Number], ['sp', 'speed', Number], ['ar', 'area', Number],
    ['off', 'offset', Number],
  ];
  bindings.forEach(([id, key, cast]) => {
    const el = $(id); el.value = cfg[key];
    el.oninput = () => { cfg[key] = cast(el.value) || 0; saveCfg(); forceReset(); };
  });
  [['en', 'enabled'], ['ks', 'scroll'], ['kt', 'top'], ['kb', 'bottom']].forEach(([id, key]) => {
    const el = $(id); el.checked = !!cfg[key];
    el.onchange = () => { cfg[key] = el.checked; saveCfg(); forceReset(); };
  });
  panel.querySelectorAll('[data-off]').forEach(b => b.onclick = () => {
    cfg.offset = Math.round((cfg.offset + +b.dataset.off) * 10) / 10; $('off').value = cfg.offset; saveCfg(); forceReset();
  });
  $('blk').value = cfg.block;
  $('blk').oninput = () => { cfg.block = $('blk').value; saveCfg(); compileBlocks(); forceReset(); };
  $('aid').value = cfg.appId; $('asec').value = cfg.appSecret;
  $('aid').oninput = () => { cfg.appId = $('aid').value.trim(); saveCfg(); };
  $('asec').oninput = () => { cfg.appSecret = $('asec').value.trim(); saveCfg(); };
  compileBlocks();

  // 导入文件
  $('file').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { setList(parseAny(await f.text()), f.name); } catch (err) { msg('解析失败：' + err.message, true); }
    e.target.value = '';
  };
  // B站
  $('biliGo').onclick = async () => {
    msg('加载中…');
    try { setList(await loadBilibili($('bili').value), 'Bilibili'); } catch (err) { msg(err.message, true); }
  };
  // 弹弹play
  $('qGo').onclick = async () => {
    msg('搜索中…');
    try {
      const j = await ddpSearch($('q').value.trim());
      const res = $('res'); res.textContent = '';
      let n = 0;
      (j.animes || []).forEach(a => (a.episodes || []).forEach(ep => {
        if (n++ > 60) return;
        const d = document.createElement('div');
        d.textContent = `${a.animeTitle} · ${ep.episodeTitle}`;
        d.onclick = async () => {
          msg('加载弹幕中…');
          try { setList(await ddpComments(ep.episodeId), d.textContent); } catch (err) { msg(err.message, true); }
        };
        res.appendChild(d);
      }));
      msg(n ? `找到 ${n} 集，点击选择` : '没有结果');
    } catch (err) { msg(err.message, true); }
  };
  $('clr').onclick = () => { setList([], ''); msg('已清空'); };

  // 预填搜索词：从页面标题里去掉站名、集数等杂质
  $('q').value = document.title.replace(/[-_|—–].*$/, '').replace(/第?\s*\d+\s*[集话話]?.*$/, '').trim();

  /* ------------------------------------------------------------------ *
   * 主循环
   * ------------------------------------------------------------------ */
  function pickVideo() {
    let best = null, bestArea = 0;
    document.querySelectorAll('video').forEach(v => {
      const r = v.getBoundingClientRect();
      const a = r.width * r.height;
      if (r.width >= 240 && r.height >= 135 && a > bestArea) { best = v; bestArea = a; }
    });
    return best;
  }

  let lastKey = pageKey(), dpr = 1, lastBox = '';
  function frame() {
    requestAnimationFrame(frame);
    if (!video || !video.isConnected) { host.style.display = 'none'; return; }
    const r = video.getBoundingClientRect();
    if (r.width < 240 || r.height < 135 || r.bottom < 0 || r.top > innerHeight) { host.style.display = 'none'; return; }
    host.style.display = '';

    // 全屏时把覆盖层挪进全屏元素
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    const parent = (fsEl && fsEl.tagName !== 'VIDEO') ? fsEl : document.documentElement;
    if (host.parentNode !== parent) parent.appendChild(host);

    // 布局
    const box = [r.left, r.top, r.width, r.height, devicePixelRatio].map(Math.round).join();
    if (box !== lastBox) {
      lastBox = box;
      dpr = devicePixelRatio || 1;
      cv.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
      cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
      ui.style.cssText = `top:${r.top + 8}px;right:${innerWidth - r.right + 8}px`;
      panel.style.setProperty('--mh', Math.max(160, r.height - 56) + 'px');
      forceReset();
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, r.width, r.height);
    if (!cfg.enabled || !eng.list.length) return;

    eng.W = r.width; eng.H = r.height;
    eng.fs = Math.max(12, Math.round(cfg.fontSize * r.height / 720));
    eng.v = eng.W / 8 * cfg.speed;                 // 滚动速度 px/s（所有弹幕同速，不会追尾）
    const maxDur = 12 / cfg.speed;
    ctx.font = `bold ${eng.fs}px "PingFang SC","Microsoft YaHei",sans-serif`;
    ctx.textBaseline = 'top';
    ctx.lineJoin = 'round';

    const t = video.currentTime + cfg.offset;
    if (t < eng.last || t - eng.last > 1.5) {       // 拖动进度条：重建
      eng.active = []; eng.lanes = { scroll: [], top: [], bottom: [] };
      eng.idx = lowerBound(eng.list, t - maxDur);
    }
    eng.last = t;
    while (eng.idx < eng.list.length && eng.list[eng.idx].t <= t) spawn(eng.list[eng.idx++], ctx);

    const lh = eng.fs * 1.3;
    ctx.globalAlpha = cfg.opacity;
    ctx.lineWidth = Math.max(2, eng.fs / 8);
    ctx.strokeStyle = 'rgba(0,0,0,.85)';
    const keep = [];
    for (const a of eng.active) {
      const age = t - a.it.t;
      let x, y = a.lane * lh + 2;
      if (a.it.k === 'scroll') {
        x = eng.W - age * eng.v;
        if (x + a.w < 0) continue;
      } else {
        if (age > 4) continue;
        x = (eng.W - a.w) / 2;
        if (a.it.k === 'bottom') y = eng.H - (a.lane + 1) * lh;
      }
      keep.push(a);
      if (x > eng.W) continue;
      ctx.strokeText(a.it.x, x, y);
      ctx.fillStyle = a.it.c;
      ctx.fillText(a.it.x, x, y);
    }
    eng.active = keep;
  }

  setInterval(() => {
    const v = pickVideo();
    if (v !== video) { video = v; forceReset(); lastBox = ''; }
    const k = pageKey();                            // SPA 切换视频后换成对应页面的弹幕
    if (k !== lastKey) { lastKey = k; restore(); }
  }, 1000);

  restore();
  requestAnimationFrame(frame);

  const toggle = () => { cfg.enabled = !cfg.enabled; $('en').checked = cfg.enabled; saveCfg(); };
  addEventListener('keydown', e => { if (e.altKey && e.code === 'KeyD') { toggle(); e.preventDefault(); } }, true);
  GM_registerMenuCommand('显示/隐藏弹幕 (Alt+D)', toggle);
  GM_registerMenuCommand('打开弹幕面板', () => { panel.classList.add('open'); $('fab').classList.add('on'); });
})();