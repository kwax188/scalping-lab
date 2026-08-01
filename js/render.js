"use strict";
import { state, $ } from "./state.js";
import { TFDEF, sdOf } from "./data.js";
import { clampAnchors, backtestPattern } from "./pattern-search.js";

/* キャンバス描画用の配色ヘルパー。CSS変数をその都度読むことでライト/ダーク切替に追随する。
   ローソク足本体の赤/青(DMM配色)は画像解析側の色検出と対になるため固定のまま変更しない。 */
function cssVar(name, fallback){
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
function cssVarRGBA(name, fallback, alpha){
  const hex = cssVar(name, fallback).replace("#","");
  const r = parseInt(hex.slice(0,2),16), g = parseInt(hex.slice(2,4),16), b = parseInt(hex.slice(4,6),16);
  return `rgba(${r},${g},${b},${alpha})`;
}
const accentColor = () => cssVar("--accent", "#C1602F");
const accentRGBA  = a => cssVarRGBA("--accent", "#C1602F", a);
const greenColor  = () => cssVar("--green", "#3F7D52");
const greenRGBA   = a => cssVarRGBA("--green", "#3F7D52", a);
const lineRGBA    = a => cssVarRGBA("--line", "#E5DFD1", a);
const subRGBA     = a => cssVarRGBA("--sub", "#6B6A61", a);
const subColor    = () => cssVar("--sub", "#6B6A61");
const blueColor   = () => cssVar("--blue", "#3D6FA6");

/* ============ スクショチャート描画 ============ */
export function drawShot(F){
  const c = F.els.canvas;
  const dpr = window.devicePixelRatio||1;
  const w = c.clientWidth, h = 340;
  c.width=w*dpr; c.height=h*dpr;
  const ctx = c.getContext("2d");
  ctx.scale(dpr,dpr);
  ctx.clearRect(0,0,w,h);
  if (!F.result) return;
  const {bars, patterns, res, WIN} = F.result;
  const showProj = !!res;
  const FWD = showProj ? res.FWD : 0;
  const lastC = bars[bars.length-1].c;

  // 予想パスを擬似価格に変換: %→ピクセルスケール換算
  let projMean=null, projP25=null, projP75=null;
  if (showProj){
    const qSD = sdOf(bars.slice(-Math.min(WIN,bars.length)).map(b=>b.c));
    const k = qSD / res.sdAvg;   // px per (pct unit)
    projMean = res.mean.map(v=>lastC + v*k);
    projP25  = res.p25.map(v=>lastC + v*k);
    projP75  = res.p75.map(v=>lastC + v*k);
  }

  const pad={l:10,r:14,t:14,b:14};
  let lo = Math.min(...bars.map(b=>b.l));
  let hi = Math.max(...bars.map(b=>b.h));
  if (showProj){
    lo = Math.min(lo, ...projP25);
    hi = Math.max(hi, ...projP75);
  }
  const rng = Math.max(1e-9, hi-lo);
  const slots = bars.length + FWD;
  const bw = (w-pad.l-pad.r)/slots;
  const xAt = i => pad.l + bw*i + bw/2;
  const y = v => pad.t + (h-pad.t-pad.b)*(1-(v-lo)/rng);

  // grid
  ctx.strokeStyle=lineRGBA(.9);
  for(let g=0;g<=4;g++){
    const yy = pad.t + (h-pad.t-pad.b)*g/4;
    ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(w-pad.r,yy);ctx.stroke();
  }

  // 現在/未来 境界
  if (showProj){
    const bx = xAt(bars.length-1)+bw/2;
    ctx.strokeStyle=accentRGBA(.35);
    ctx.setLineDash([4,4]);
    ctx.beginPath();ctx.moveTo(bx,pad.t);ctx.lineTo(bx,h-pad.b);ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle=accentRGBA(.85);
    ctx.font="10px sans-serif"; ctx.textAlign="left";
    ctx.fillText("→ 予想(類似"+res.n+"件の平均)", bx+4, pad.t+10);
  }

  // ローソク(ヒゲ+実体、DMM準拠: 陽線=赤/陰線=青)
  bars.forEach((b,i)=>{
    const col = b.up ? "#EA3943" : "#3B82F6";
    const x = xAt(i);
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(1, bw*0.14);
    ctx.beginPath();
    ctx.moveTo(x, y(b.h));
    ctx.lineTo(x, y(b.l));
    ctx.stroke();
    ctx.fillStyle = col;
    const bt=y(Math.max(b.o,b.c)), bb=y(Math.min(b.o,b.c));
    const bwid = Math.max(2, bw*0.62);
    ctx.fillRect(x-bwid/2, bt, bwid, Math.max(1.2, bb-bt));
  });

  // パターン注釈
  for (const {pat, hits} of patterns){
    const hit = hits[hits.length-1];   // 最新の1個
    const dp = clampAnchors(hit.pivs, bars);          // 長すぎる外側アンカーを本体寄りに
    ctx.strokeStyle = pat.dir>0 ? greenRGBA(.9) : accentRGBA(.95);
    ctx.lineWidth=2;
    ctx.setLineDash([3,2]);
    ctx.beginPath();
    dp.forEach((p,k)=>{
      k?ctx.lineTo(xAt(p.i),y(p.p)):ctx.moveTo(xAt(p.i),y(p.p));
    });
    if(hit.ext && hit.end<bars.length)               // 三尊系: ネックライン割れまで下り腕を延長
      ctx.lineTo(xAt(hit.end), y(bars[hit.end].c));
    ctx.stroke();
    ctx.setLineDash([]);
    dp.forEach(p=>{
      ctx.fillStyle = pat.dir>0 ? greenColor() : accentColor();
      ctx.beginPath();
      ctx.arc(xAt(p.i), y(p.p), 3.5, 0, Math.PI*2);
      ctx.fill();
    });
    // ラベル: 買い系(dir>0)は最安ピボットの下、売り系は最高ピボットの上
    const anc = pat.dir>0
      ? dp.reduce((a,b)=> b.p<a.p?b:a)
      : dp.reduce((a,b)=> b.p>a.p?b:a);
    ctx.fillStyle = pat.dir>0 ? greenColor() : accentColor();
    ctx.font="bold 12px sans-serif"; ctx.textAlign="center";
    const lyS = Math.min(Math.max(pat.dir>0 ? y(anc.p)+20 : y(anc.p)-12, pad.t+12), h-pad.b-4);
    ctx.fillText("🔔"+pat.name, xAt(anc.i), lyS);
  }

  // 予想パス
  if (showProj){
    const px = i => xAt(bars.length-1+i);
    ctx.beginPath();
    projP75.forEach((v,i)=> i?ctx.lineTo(px(i),y(v)):ctx.moveTo(px(i),y(v)));
    for(let i=projP25.length-1;i>=0;i--) ctx.lineTo(px(i),y(projP25[i]));
    ctx.closePath();
    ctx.fillStyle=accentRGBA(.13);
    ctx.fill();
    ctx.strokeStyle=accentColor(); ctx.lineWidth=2.4;
    ctx.setLineDash([6,4]);
    ctx.beginPath();
    projMean.forEach((v,i)=> i?ctx.lineTo(px(i),y(v)):ctx.moveTo(px(i),y(v)));
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
window.addEventListener("resize", ()=>{
  state.SLOTS.forEach(F=>{ if(F.result) drawShot(F); });
});

export function updateVerdict(F){
  const v = F.els.verdict;
  const res = F.result && F.result.res;
  if (!res){
    v.innerHTML = `<div class="v-head">▶ 予想を出すには①で過去データ(CSV)を読み込んでください</div>`;
    v.classList.add("show");
    return;
  }
  const upP=Math.round(res.up/res.n*100), dnP=Math.round(res.down/res.n*100), flP=100-upP-dnP;
  const avg=res.avg*100;
  const lean = upP>dnP+10 ? '<span class="up">上昇優勢</span>' :
               dnP>upP+10 ? '<span class="down">下落優勢</span>' :
               '<span class="flat">方向感なし</span>';
  const se = Math.ceil(100*Math.sqrt(0.25/res.n));
  const dirArrow = d => d>0 ? "↑" : d<0 ? "↓" : "→";
  let mtfTag = "";
  if (res.mtf && res.mtf.length){
    mtfTag = `・上位足一致 <b style="color:var(--accent)">${res.mtf.map(m=>m.key+dirArrow(m.dir)).join(" / ")}</b>`;
  } else if (res.mtfFallback){
    mtfTag = `・<span style="opacity:.75">上位足一致は母数不足のため解除</span>`;
  }
  v.innerHTML =
    `<div class="v-head">▶ この形のあと相場はどうなった？（${F.key}足・${res.regime?"MA状態が一致する":"過去"}${res.scanned.toLocaleString()}局面から類似${res.n}件${mtfTag} / 統計誤差の目安±${se}%pt）</div>` +
    `<div class="v-main">${res.FWD}本後: <span class="up">上昇${upP}%</span> / <span class="down">下落${dnP}%</span> / <span class="flat">横ばい${flP}%</span> → ${lean}（平均${avg>=0?"+":""}${avg.toFixed(3)}%）</div>` +
    `<div class="v-sub">金色点線＝類似局面の平均パス（縦スケールは目安）。帯＝25〜75パーセンタイル。※過去の集計であり予測ではない。</div>`;
  v.classList.add("show");
}

export function updatePatList(F){
  const wrap = F.els.patList;
  wrap.innerHTML = "";
  const pats = F.result ? F.result.patterns : [];
  if (!pats.length){
    wrap.innerHTML = '<div class="empty">スクショ内に検出されたパターンはありません</div>';
    return;
  }
  for (const {pat} of pats){
    const bt = backtestPattern(pat, F.key);
    const div = document.createElement("div");
    div.className = "alert " + (pat.dir>0?"up":"down");
    let statHtml = "過去データ未読み込みのため統計なし";
    if (bt){
      const upP=Math.round(bt.up/bt.n*100), dnP=Math.round(bt.down/bt.n*100);
      statHtml = `${F.key}足の過去データで<b>${bt.n}回</b>出現 → 10本後 <b class="up">上昇${upP}%</b> / <b class="down">下落${dnP}%</b>`;
    } else if (state.frames[F.key]){
      statHtml = "過去データでの出現が少なく統計になりません";
    }
    div.innerHTML = `
      <div class="a-body">
        <div class="a-name">🔔 ${pat.name} をスクショ内に発見（チャート上に表示）</div>
        <div class="a-stat">${statHtml}</div>
      </div>`;
    wrap.appendChild(div);
  }
}

/* ============ 類似過去チャート・ギャラリー ============ */
let galleryOpen = true;   // 開閉状態(全枠共通で保持。デフォルト開)

// アクティブ枠かつ検索結果があるときだけ、上位5件の類似局面カードを構築する
export function updateGallery(F){
  const g = F.els.gallery;
  if (!g) return;
  const res = F.result && F.result.res;
  if (F !== state.activeSlot || !res || !res.matches || !res.matches.length){
    g.innerHTML = "";
    g.style.display = "none";
    return;
  }
  const hist = state.frames[F.key];
  const WIN = res.usedWIN, FWD = res.FWD;
  const top5 = res.matches.slice(0, 5).filter(m => hist && hist[m.s]);
  if (!top5.length){ g.innerHTML=""; g.style.display="none"; return; }

  g.style.display = "block";
  g.innerHTML =
    `<div class="gal-head" role="button">` +
      `<span>🖼 類似した過去チャート 上位${top5.length}件（${F.key}足）</span>` +
      `<span class="gal-toggle">${galleryOpen ? "[閉じる ▲]" : "[開く ▼]"}</span>` +
    `</div>` +
    `<div class="gal-body"${galleryOpen ? "" : ' style="display:none"'}>` +
      `<div class="gal-viewport">` +
        `<div class="gal-track"></div>` +
        `<button class="gal-arrow prev" aria-label="前へ">▲</button>` +
        `<button class="gal-arrow next" aria-label="次へ">▼</button>` +
        `<div class="gal-dots"></div>` +
      `</div>` +
    `</div>`;

  const body  = g.querySelector(".gal-body");
  const track = g.querySelector(".gal-track");
  const dots  = g.querySelector(".gal-dots");
  const head  = g.querySelector(".gal-head");
  // 枠内クリック/ドラッグが枠のアクティブ化(→ギャラリー再構築でスクロール位置リセット)に
  // 伝播しないよう、ギャラリー本体で伝播を止める
  body.addEventListener("click", e=> e.stopPropagation());
  body.addEventListener("pointerdown", e=> e.stopPropagation());
  head.addEventListener("click", e=>{
    e.stopPropagation();
    galleryOpen = !galleryOpen;
    body.style.display = galleryOpen ? "block" : "none";
    g.querySelector(".gal-toggle").textContent = galleryOpen ? "[閉じる ▲]" : "[開く ▼]";
    if (galleryOpen){ setTrackHeight(g); drawGalleryCanvases(F); updateDots(g); }
  });

  const fmt = t=>{
    const d = new Date(t);
    return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} `+
           `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  };
  top5.forEach((m,idx)=>{
    const e = Math.min(m.s+WIN-1, hist.length-1);
    const score = Math.round(100*Math.exp(-m.d/WIN));   // 100%=形が一致 / 距離が大きいほど低下
    const card = document.createElement("div");
    card.className = "gal-card";
    card.innerHTML =
      `<div class="gal-meta">` +
        `<span class="gal-rank">#${idx+1}</span>` +
        `<span class="gal-date">${fmt(hist[m.s].t)} 〜 ${fmt(hist[e].t)}</span>` +
        `<span class="gal-score">類似度 ${score}%</span>` +
      `</div>` +
      `<canvas class="gal-canvas" width="920" height="150"></canvas>`;
    track.appendChild(card);
    const dot = document.createElement("button");
    dot.className = "gal-dot" + (idx===0 ? " active" : "");
    dot.addEventListener("click", ()=> track.scrollTo({top: idx*track.clientHeight, behavior:"smooth"}));
    dots.appendChild(dot);
  });

  wireCarousel(g);
  if (galleryOpen){ setTrackHeight(g); drawGalleryCanvases(F); updateDots(g); }
}

// 1カードちょうどが収まる高さを track に設定(はみ出し・見切れ防止)
export function setTrackHeight(g){
  const track = g.querySelector(".gal-track");
  if (!track || !track.children.length) return;
  const cardH = track.children[0].offsetHeight;   // カードの自然な高さ(canvas 150px + メタ + 余白)
  if (cardH > 0) track.style.height = cardH + "px";
}

// カルーセルの現在位置インデックス(0基点・縦)
export function galIndex(track){
  const h = track.clientHeight || 1;
  return Math.round(track.scrollTop / h);
}
// ドット強調・矢印の有効/無効を現在位置に同期
export function updateDots(g){
  const track = g.querySelector(".gal-track");
  if (!track) return;
  const n = track.children.length;
  const idx = Math.max(0, Math.min(n-1, galIndex(track)));
  g.querySelectorAll(".gal-dot").forEach((d,i)=> d.classList.toggle("active", i===idx));
  const prev = g.querySelector(".gal-arrow.prev"), next = g.querySelector(".gal-arrow.next");
  if (prev) prev.disabled = idx <= 0;
  if (next) next.disabled = idx >= n-1;
}
// 上下矢印クリック・スクロール連動を配線(縦スナップ)
export function wireCarousel(g){
  const track = g.querySelector(".gal-track");
  const prev  = g.querySelector(".gal-arrow.prev");   // 上へ
  const next  = g.querySelector(".gal-arrow.next");   // 下へ
  if (prev) prev.addEventListener("click", e=>{ e.stopPropagation();
    track.scrollBy({top:-track.clientHeight, behavior:"smooth"}); });
  if (next) next.addEventListener("click", e=>{ e.stopPropagation();
    track.scrollBy({top: track.clientHeight, behavior:"smooth"}); });
  // スクロール(スワイプ/ホイール含む)に合わせてドット/矢印を更新(rAFで間引き)
  let ticking = false;
  track.addEventListener("scroll", ()=>{
    if (ticking) return; ticking = true;
    requestAnimationFrame(()=>{ updateDots(g); ticking = false; });
  });
  // 縦スクロールはホイール/トラックパッド/スワイプのネイティブ動作に任せる(横用ドラッグは廃止)
}

// 5枚のcanvasを requestAnimationFrame で1枚ずつ非同期描画(まとめ描きの重さを分散)
export function drawGalleryCanvases(F){
  const res = F.result && F.result.res;
  if (!res) return;
  const hist = state.frames[F.key];
  const WIN = res.usedWIN, FWD = res.FWD;
  const top5 = res.matches.slice(0, 5).filter(m => hist && hist[m.s]);
  const canvases = F.els.gallery.querySelectorAll(".gal-canvas");
  let i = 0;
  const step = ()=>{
    if (i >= top5.length || i >= canvases.length) return;
    drawMiniChart(canvases[i], hist, top5[i].s, WIN, FWD);
    i++;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ミニ・ローソク足: 類似窓(WIN本) + その後(FWD本)。その後側は背景金色薄塗り+境界線+半透明で区別
export function drawMiniChart(c, bars, from, WIN, FWD){
  const dpr = window.devicePixelRatio||1;
  const w = c.clientWidth || 900, h = 150;
  c.width = w*dpr; c.height = h*dpr;
  const ctx = c.getContext("2d"); ctx.scale(dpr,dpr); ctx.clearRect(0,0,w,h);
  const seg = [];
  for (let i=0;i<WIN+FWD;i++){ const b = bars[from+i]; if (b) seg.push(b); }
  if (seg.length < 2) return;
  const pad = {l:8,r:8,t:10,b:8};
  let lo=Infinity, hi=-Infinity;
  for (const b of seg){ if (b.l<lo) lo=b.l; if (b.h>hi) hi=b.h; }
  const rng = Math.max(1e-9, hi-lo);
  const bw = (w-pad.l-pad.r)/seg.length;
  const xAt = i => pad.l + bw*i + bw/2;
  const y = v => pad.t + (h-pad.t-pad.b)*(1-(v-lo)/rng);

  // その後(未来)側の背景
  const bx = pad.l + bw*WIN;   // WIN本目以降(=その後)の左端
  ctx.fillStyle = accentRGBA(.08);
  ctx.fillRect(bx, pad.t, (w-pad.r)-bx, h-pad.t-pad.b);
  // 境界の点線
  ctx.strokeStyle = accentRGBA(.45); ctx.setLineDash([4,3]);
  ctx.beginPath(); ctx.moveTo(bx, pad.t); ctx.lineTo(bx, h-pad.b); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = accentRGBA(.85); ctx.font = "9px sans-serif"; ctx.textAlign = "left";
  ctx.fillText("→その後", bx+3, pad.t+9);

  // ローソク(DMM配色: 陽線=赤/陰線=青。その後側は半透明で区別)
  seg.forEach((b,i)=>{
    const future = i >= WIN;
    const col = (b.c>=b.o)
      ? (future ? "rgba(234,57,67,.45)"  : "#EA3943")
      : (future ? "rgba(59,130,246,.45)" : "#3B82F6");
    const x = xAt(i);
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(.8, bw*0.14);
    ctx.beginPath(); ctx.moveTo(x, y(b.h)); ctx.lineTo(x, y(b.l)); ctx.stroke();
    ctx.fillStyle = col;
    const bt = y(Math.max(b.o,b.c)), bb = y(Math.min(b.o,b.c));
    const bwid = Math.max(1.5, bw*0.6);
    ctx.fillRect(x-bwid/2, bt, bwid, Math.max(1, bb-bt));
  });
}

/* リサイズ時: 高さ再計算 + canvas再描画 + ドット更新(開いている時のみ) */
window.addEventListener("resize", ()=>{
  const F = state.activeSlot;
  if (F && galleryOpen && F.els.gallery.style.display !== "none"){
    setTrackHeight(F.els.gallery);
    drawGalleryCanvases(F);
    updateDots(F.els.gallery);
  }
});

/* ============ 枠(時間足フレーム)のHTML雛形 ============ */
// tf: TFDEF の1要素 {key, min}
export function frameMarkup(tf){
  return `
      <div class="f-head">
        <div class="f-title">${tf.key}足<span>${tf.key==="日足"?"1D":tf.min+"m"}</span></div>
        <div class="f-badge"></div>
        <button class="f-clear">クリア</button>
      </div>
      <label class="drop mini">
        <div class="d-main">📷 ${tf.key}足のスクショをドロップ / クリックで選択</div>
        <input type="file" accept="image/*">
      </label>
      <div class="loading">解析中...</div>
      <div class="f-area" style="display:none">
        <canvas class="f-canvas" width="920" height="340"></canvas>
        <div class="verdict"></div>
        <div class="f-patlist"></div>
      </div>
      <div class="v-note f-stat" style="margin-top:6px"></div>
      <div class="f-gallery"></div>`;
}

/* ============ 読み込み状況・保存済みデータ範囲の表示 ============ */
export function updateDataUI(){
  if (!state.M1.length){
    $("datastat").classList.remove("show");
    $("dbbox").classList.remove("show");
    return;
  }
  const d0 = new Date(state.M1[0].t), d1 = new Date(state.M1[state.M1.length-1].t);
  const fd = d => `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
  const fym = d => `${d.getFullYear()}/${d.getMonth()+1}`;
  $("datastat").innerHTML =
    `✅ <b>${state.M1.length.toLocaleString()}本</b>の1分足（${fd(d0)} 〜 ${fd(d1)}）` +
    `<br>生成: ` + TFDEF.map(tf=>`${tf.key} ${state.frames[tf.key].length.toLocaleString()}本`).join(" / ");
  $("datastat").classList.add("show");
  $("dbinfo").innerHTML =
    `💾 保存済みデータ: <b>${fym(d0)} 〜 ${fym(d1)}</b> ／ <b>${state.M1.length.toLocaleString()}</b>件（1分足）`;
  $("dbbox").classList.add("show");
}

/* ============ バイナリ自動ロード進捗表示 ============ */
export function showAutoload(msg, done, total){
  const el = $("autoload");
  el.classList.add("show");
  const pct = total ? Math.round(done/total*100) : 0;
  el.innerHTML = `📡 ${msg}` + (total ? `<div class="bar"><i style="width:${pct}%"></i></div>` : "");
}
export function hideAutoload(){ $("autoload").classList.remove("show"); $("autoload").innerHTML=""; }

/* ============ 手書き検索: 描画キャンバス ============ */
export function renderDraw(dc, drawPts){
  const ctx = dc.getContext("2d");
  const dpr = window.devicePixelRatio||1;
  const w = dc.width/dpr, h = dc.height/dpr;
  ctx.clearRect(0,0,w,h);
  if (!drawPts.length){
    ctx.fillStyle=subRGBA(.6);
    ctx.font="12px sans-serif"; ctx.textAlign="center";
    ctx.fillText("ここに値動きの形を描く（左→右）", w/2, h/2);
    return;
  }
  ctx.strokeStyle=blueColor(); ctx.lineWidth=2.5; ctx.lineJoin="round"; ctx.lineCap="round";
  ctx.beginPath();
  drawPts.forEach((p,i)=> i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
  ctx.stroke();
}
export function drawCanvasInit(dc, drawPts){
  const dpr = window.devicePixelRatio||1;
  dc.width = dc.clientWidth*dpr; dc.height = 140*dpr;
  dc.getContext("2d").scale(dpr,dpr);
  renderDraw(dc, drawPts);
}

export function drawGhost(paths, FWD){
  const c=$("ghost");
  const dpr=window.devicePixelRatio||1;
  const w=c.clientWidth,h=190;
  c.width=w*dpr;c.height=h*dpr;
  const ctx=c.getContext("2d");
  ctx.scale(dpr,dpr);
  ctx.clearRect(0,0,w,h);
  let lo=0,hi=0;
  paths.forEach(p=>p.forEach(v=>{lo=Math.min(lo,v);hi=Math.max(hi,v)}));
  const rng=Math.max(1e-9,hi-lo);
  const pad={l:8,r:56,t:8,b:18};
  const x=i=>pad.l+(w-pad.l-pad.r)*i/FWD;
  const y=v=>pad.t+(h-pad.t-pad.b)*(1-(v-lo)/rng);
  ctx.strokeStyle=subRGBA(.5);ctx.setLineDash([3,3]);
  ctx.beginPath();ctx.moveTo(pad.l,y(0));ctx.lineTo(w-pad.r,y(0));ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle=subColor();ctx.font="10px SF Mono,Consolas,monospace";
  ctx.fillText("0%", w-pad.r+6, y(0)+3);
  ctx.fillText((hi*100).toFixed(2)+"%", w-pad.r+6, y(hi)+3);
  ctx.fillText((lo*100).toFixed(2)+"%", w-pad.r+6, y(lo)+3);
  ctx.strokeStyle=subRGBA(.2);
  ctx.lineWidth=1;
  paths.forEach(p=>{
    ctx.beginPath();
    p.forEach((v,i)=> i?ctx.lineTo(x(i),y(v)):ctx.moveTo(x(i),y(v)));
    ctx.stroke();
  });
  const mean=[];
  for(let i=0;i<=FWD;i++){
    let s=0; paths.forEach(p=>s+=p[i]); mean.push(s/paths.length);
  }
  ctx.strokeStyle=accentColor();ctx.lineWidth=2.5;
  ctx.beginPath();
  mean.forEach((v,i)=> i?ctx.lineTo(x(i),y(v)):ctx.moveTo(x(i),y(v)));
  ctx.stroke();
}

/* ============ 開発用: dev専用の軽量チャート描画(ローソク + ピボット線 + ラベル) ============ */
export function drawDevChart(bars, pivs, endIdx, pat, ext){
  const c = $("devCanvas");
  const dpr = window.devicePixelRatio||1;
  const w = c.clientWidth, h = 340;
  c.width=w*dpr; c.height=h*dpr;
  const ctx=c.getContext("2d"); ctx.scale(dpr,dpr); ctx.clearRect(0,0,w,h);
  const pad={l:10,r:14,t:16,b:14};
  let lo=Math.min(...bars.map(b=>b.l)), hi=Math.max(...bars.map(b=>b.h));
  const rng=Math.max(1e-9,hi-lo);
  const bw=(w-pad.l-pad.r)/bars.length;
  const xAt=i=>pad.l+bw*i+bw/2;
  const y=v=>pad.t+(h-pad.t-pad.b)*(1-(v-lo)/rng);
  // grid
  ctx.strokeStyle=lineRGBA(.9);
  for(let g=0;g<=4;g++){const yy=pad.t+(h-pad.t-pad.b)*g/4;ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(w-pad.r,yy);ctx.stroke();}
  // 確定バーの縦線
  if(endIdx>=0&&endIdx<bars.length){
    const bx=xAt(endIdx);
    ctx.strokeStyle=accentRGBA(.3);ctx.setLineDash([4,4]);
    ctx.beginPath();ctx.moveTo(bx,pad.t);ctx.lineTo(bx,h-pad.b);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle=accentRGBA(.8);ctx.font="10px sans-serif";ctx.textAlign="left";
    ctx.fillText("← パターン確定", bx+4, pad.t+10);
  }
  // ローソク(DMM配色: 陽線=赤/陰線=青)
  bars.forEach((b,i)=>{
    const col=b.c>=b.o?"#EA3943":"#3B82F6";
    const x=xAt(i);
    ctx.strokeStyle=col;ctx.lineWidth=Math.max(1,bw*0.14);
    ctx.beginPath();ctx.moveTo(x,y(b.h));ctx.lineTo(x,y(b.l));ctx.stroke();
    ctx.fillStyle=col;
    const bt=y(Math.max(b.o,b.c)),bb=y(Math.min(b.o,b.c));
    const bwid=Math.max(2,bw*0.62);
    ctx.fillRect(x-bwid/2,bt,bwid,Math.max(1.2,bb-bt));
  });
  // ピボット線
  ctx.strokeStyle=pat.dir>0?greenRGBA(.9):accentRGBA(.95);
  ctx.lineWidth=2;ctx.setLineDash([3,2]);ctx.beginPath();
  pivs.forEach((p,k)=>{k?ctx.lineTo(xAt(p.i),y(p.p)):ctx.moveTo(xAt(p.i),y(p.p));});
  if(ext && endIdx>=0 && endIdx<bars.length)       // 三尊系: 確定バーまで下り腕を延長
    ctx.lineTo(xAt(endIdx), y(bars[endIdx].c));
  ctx.stroke();ctx.setLineDash([]);
  pivs.forEach(p=>{
    ctx.fillStyle=pat.dir>0?greenColor():accentColor();
    ctx.beginPath();ctx.arc(xAt(p.i),y(p.p),3.5,0,Math.PI*2);ctx.fill();
  });
  const anc = pat.dir>0
    ? pivs.reduce((a,b)=> b.p<a.p?b:a)
    : pivs.reduce((a,b)=> b.p>a.p?b:a);
  ctx.fillStyle=pat.dir>0?greenColor():accentColor();
  ctx.font="bold 12px sans-serif";ctx.textAlign="center";
  const lyD=Math.min(Math.max(pat.dir>0 ? y(anc.p)+20 : y(anc.p)-12, pad.t+12), h-pad.b-4);
  ctx.fillText("🔔"+pat.name, xAt(anc.i), lyD);
}
