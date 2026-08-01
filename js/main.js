"use strict";
import { state, $, getWIN, getFWD } from "./state.js";
import { idbSaveM1, idbLoadM1, idbClearM1 } from "./storage.js";
import { TFDEF, parseCSV, parseBin, resample, znorm } from "./data.js";
import { PATTERNS, atrOf, zigzagAbs, getMA25, clampAnchors, searchTop } from "./pattern-search.js";
import { loadChartImage, reanalyzeLower, analyzeShot } from "./image-extract.js";
import { updateGallery } from "./render.js";

const drop = $("drop");
drop.addEventListener("dragover", e=>{e.preventDefault();e.stopPropagation();drop.classList.add("over")});
drop.addEventListener("dragleave", ()=>drop.classList.remove("over"));
drop.addEventListener("drop", e=>{
  e.preventDefault(); e.stopPropagation(); drop.classList.remove("over");
  loadFiles(e.dataTransfer.files);
});
$("file").addEventListener("change", e=>loadFiles(e.target.files));

// M1 から frames を作り直す(CSV読込・IDB復元の両方で使う共通処理)
function rebuildFrames(){
  state.frames = {};
  for (const k in state.maCache) delete state.maCache[k];
  for (const tf of TFDEF) state.frames[tf.key] = resample(state.M1, tf.min);
}
// 読み込み状況・保存済みデータ範囲の表示を更新
function updateDataUI(){
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

async function loadFiles(files){
  const all = state.M1.slice();
  for (const f of files){
    const text = await f.text();
    for (const b of parseCSV(text)) all.push(b);
  }
  // 同一日時は後勝ち(=あとから読み込んだCSVの値で上書き)。Mapで二重登録を防ぐ。
  const map = new Map();
  for (const b of all) map.set(b.t, b);
  state.M1 = [...map.values()].sort((a,b)=>a.t-b.t);
  if (!state.M1.length){
    $("datastat").textContent = "⚠ 読み込めませんでした。形式を確認してください。";
    $("datastat").classList.add("show");
    return;
  }
  rebuildFrames();
  updateDataUI();
  $("drawSearchBtn").disabled = false;
  analyzeAllSlots();  // スクショが先に貼られてた枠を再解析
  // パース済みデータを IndexedDB に保存(次回起動時に自動復元される)
  try { await idbSaveM1(state.M1); }
  catch(e){ $("dbinfo").innerHTML += `<br><span style="color:var(--red)">⚠ 自動保存に失敗: ${e.message}</span>`; }
}

/* ============ 6枠(時間足フレーム) ============ */
/* 各枠の状態: {key, els{...}, candles, result, pitch} */

function setActive(F){
  const prev = state.activeSlot;
  state.activeSlot = F;
  state.SLOTS.forEach(s=> s.els.root.classList.toggle("active", s===F));
  if (prev && prev !== F) updateGallery(prev);   // 旧アクティブのギャラリーを消す
  updateGallery(F);                              // 新アクティブにギャラリーを描く
}

function buildSlots(){
  const wrap = $("framesWrap");
  for (const tf of TFDEF){
    const root = document.createElement("div");
    root.className = "frame";
    root.innerHTML = `
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
    wrap.appendChild(root);

    const F = {
      key: tf.key,
      candles: null,
      result: null,
      els: {
        root,
        badge:   root.querySelector(".f-badge"),
        clear:   root.querySelector(".f-clear"),
        drop:    root.querySelector(".drop"),
        file:    root.querySelector("input[type=file]"),
        loading: root.querySelector(".loading"),
        area:    root.querySelector(".f-area"),
        canvas:  root.querySelector("canvas"),
        verdict: root.querySelector(".verdict"),
        patList: root.querySelector(".f-patlist"),
        stat:    root.querySelector(".f-stat"),
        gallery: root.querySelector(".f-gallery"),
      },
    };
    state.SLOTS.push(F);

    // クリックでアクティブ化(枠のどこでも)
    root.addEventListener("click", ()=>setActive(F));

    // 枠全体でドロップ受付
    root.addEventListener("dragover", e=>{
      e.preventDefault(); e.stopPropagation();
      F.els.drop.classList.add("over");
    });
    root.addEventListener("dragleave", ()=>F.els.drop.classList.remove("over"));
    root.addEventListener("drop", e=>{
      e.preventDefault(); e.stopPropagation();
      F.els.drop.classList.remove("over");
      setActive(F);
      const f=[...(e.dataTransfer?.files||[])].find(f=>f.type.startsWith("image/"));
      if(f) loadChartImage(f, F);
    });
    F.els.file.addEventListener("change", e=>{
      if(e.target.files[0]) loadChartImage(e.target.files[0], F);
      e.target.value = "";
    });
    F.els.clear.addEventListener("click", e=>{
      e.stopPropagation();
      clearSlot(F);
    });
  }
  setActive(state.SLOTS[0]);
}

function clearSlot(F, cascade = true){
  F.candles = null;
  F.result = null;
  F.els.area.style.display = "none";
  F.els.verdict.classList.remove("show");
  F.els.patList.innerHTML = "";
  F.els.stat.textContent = "";
  F.els.badge.textContent = "";
  if (F.els.gallery){ F.els.gallery.innerHTML = ""; F.els.gallery.style.display = "none"; }
  if (cascade) reanalyzeLower(F);
}

$("clearAllBtn").addEventListener("click", ()=>state.SLOTS.forEach(F=>clearSlot(F, false)));

function analyzeAllSlots(){
  state.SLOTS.forEach(F=>{ if(F.candles) analyzeShot(F); });
}

/* ============ スクショ解析: ページ全体のドロップ/ペースト受付 ============ */
// ページ全体でドロップを受ける(誤ドロップでページ遷移するのを防止) → アクティブ枠へ
document.addEventListener("dragover", e=>{e.preventDefault()});
document.addEventListener("drop", e=>{
  e.preventDefault();
  const f=[...(e.dataTransfer?.files||[])].find(f=>f.type.startsWith("image/"));
  if(f && state.activeSlot) loadChartImage(f, state.activeSlot);
});
document.addEventListener("paste", e=>{
  const item=[...(e.clipboardData?.items||[])].find(i=>i.type.startsWith("image/"));
  if(item && state.activeSlot){ e.preventDefault(); loadChartImage(item.getAsFile(), state.activeSlot); }
});
["winSel","fwdSel","maFilter","mtfFilter"].forEach(id=>
  $(id).addEventListener("change", analyzeAllSlots));

buildSlots();

/* ============ バイナリ自動ロード(同一リポジトリ data/) ============ */
function showAutoload(msg, done, total){
  const el = $("autoload");
  el.classList.add("show");
  const pct = total ? Math.round(done/total*100) : 0;
  el.innerHTML = `📡 ${msg}` + (total ? `<div class="bar"><i style="width:${pct}%"></i></div>` : "");
}
function hideAutoload(){ $("autoload").classList.remove("show"); $("autoload").innerHTML=""; }

/* manifest.json → 各 m1_*.bin を順次 fetch → M1 構築 → IndexedDB 保存。
   fetch できない環境(file:// ローカル起動・ファイル無し)は例外を投げ、
   呼び出し側が従来のCSV手動ドロップにフォールバックする。 */
async function autoLoadFromRepo(){
  const mres = await fetch("data/manifest.json", {cache:"no-cache"});
  if (!mres.ok) throw new Error("manifest.json が見つかりません (status "+mres.status+")");
  const man = await mres.json();
  let files = (man && man.files) || [];
  if (!files.length) throw new Error("manifest.json にファイルがありません");

  // スマホ/低メモリ端末は全年(約650万本)を展開するとメモリ不足でクラッシュするため、
  // 直近の年数だけに絞る。PC(非タッチ・十分なメモリ)は従来通り全年ロード。
  const isMobile = (window.matchMedia && matchMedia("(pointer:coarse)").matches)
    || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    || (typeof navigator.deviceMemory === "number" && navigator.deviceMemory <= 4);
  const MOBILE_YEARS = 8;
  let note = "";
  if (isMobile && files.length > MOBILE_YEARS){
    files = files.slice(-MOBILE_YEARS);   // manifest.files は年昇順 → 末尾が直近
    note = `(スマホ向けに直近${MOBILE_YEARS}年のみ) `;
  }

  showAutoload(note + `データ取得中 0/${files.length}年分...`, 0, files.length);
  const map = new Map();
  for (let i=0;i<files.length;i++){
    const r = await fetch("data/"+files[i]);
    if (!r.ok) throw new Error(files[i]+" の取得に失敗 (status "+r.status+")");
    const bars = parseBin(await r.arrayBuffer());
    for (const b of bars) map.set(b.t, b);   // 同一日時は後勝ち(=二重登録防止)
    showAutoload(note + `データ取得中 ${i+1}/${files.length}年分...`, i+1, files.length);
  }
  state.M1 = [...map.values()].sort((a,b)=>a.t-b.t);
  rebuildFrames();
  updateDataUI();
  $("drawSearchBtn").disabled = false;
  hideAutoload();
  analyzeAllSlots();
  // 次回起動時は fetch せず IndexedDB から復元できるよう保存
  try { await idbSaveM1(state.M1); }
  catch(e){ console.warn("IndexedDB保存に失敗(自動ロードデータ):", e); }
}

/* ============ 起動時: IDB復元 → 無ければ data/ 自動ロード → 無ければCSV手動 ============ */
(async function bootData(){
  // ① まず IndexedDB を確認(2回目以降はここで復元、ネットワーク不要)
  try {
    const saved = await idbLoadM1();
    if (saved.length){
      state.M1 = saved;
      rebuildFrames();
      updateDataUI();
      $("drawSearchBtn").disabled = false;
      analyzeAllSlots();
      return;
    }
  } catch(e){
    console.warn("IndexedDB復元に失敗:", e);
  }
  // ② IDBが空 → 同一リポジトリの data/ から自動ロードを試行
  try {
    await autoLoadFromRepo();
  } catch(e){
    // ③ fetch不可(file://ローカル起動・data/無し等)→ 従来のCSV手動ドロップへ
    hideAutoload();
    console.warn("自動ロード不可。CSV手動読み込みにフォールバックします:", e);
  }
})();

/* 全データ削除(確認ダイアログ付き) */
$("clearDbBtn").addEventListener("click", async ()=>{
  if (!confirm("保存されている過去データ(1分足)をすべて削除します。よろしいですか？\nこの操作は取り消せません。")) return;
  try { await idbClearM1(); }
  catch(e){ alert("削除に失敗しました: " + e.message); return; }
  state.M1 = [];
  state.frames = {};
  for (const k in state.maCache) delete state.maCache[k];
  state.SLOTS.forEach(F=>clearSlot(F, false));   // 各枠の予想もクリア
  updateDataUI();                                // datastat/dbbox を非表示に
  $("drawSearchBtn").disabled = true;
  alert("過去データを削除しました。");
});

/* ============ 手書き検索 ============ */
const dc = $("draw");
let drawPts = [];
let drawing = false;

function drawCanvasInit(){
  const dpr = window.devicePixelRatio||1;
  dc.width = dc.clientWidth*dpr; dc.height = 140*dpr;
  dc.getContext("2d").scale(dpr,dpr);
  renderDraw();
}
function renderDraw(){
  const ctx = dc.getContext("2d");
  const dpr = window.devicePixelRatio||1;
  const w = dc.width/dpr, h = dc.height/dpr;
  ctx.clearRect(0,0,w,h);
  if (!drawPts.length){
    ctx.fillStyle="rgba(138,148,172,.5)";
    ctx.font="12px sans-serif"; ctx.textAlign="center";
    ctx.fillText("ここに値動きの形を描く（左→右）", w/2, h/2);
    return;
  }
  ctx.strokeStyle="#3B82F6"; ctx.lineWidth=2.5; ctx.lineJoin="round"; ctx.lineCap="round";
  ctx.beginPath();
  drawPts.forEach((p,i)=> i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
  ctx.stroke();
}
function dPos(e){
  const r = dc.getBoundingClientRect();
  const src = e.touches ? e.touches[0] : e;
  return {x: src.clientX-r.left, y: src.clientY-r.top};
}
dc.addEventListener("mousedown", e=>{drawing=true; drawPts.push(dPos(e)); renderDraw()});
dc.addEventListener("mousemove", e=>{if(drawing){drawPts.push(dPos(e)); renderDraw()}});
window.addEventListener("mouseup", ()=>drawing=false);
dc.addEventListener("touchstart", e=>{e.preventDefault();drawing=true;drawPts.push(dPos(e));renderDraw()},{passive:false});
dc.addEventListener("touchmove", e=>{e.preventDefault();if(drawing){drawPts.push(dPos(e));renderDraw()}},{passive:false});
window.addEventListener("touchend", ()=>drawing=false);
$("drawClearBtn").onclick = ()=>{drawPts=[]; renderDraw()};
window.addEventListener("resize", drawCanvasInit);
drawCanvasInit();

$("drawSearchBtn").onclick = ()=>{
  if (drawPts.length < 8){ alert("形が短すぎます。左から右へ線を描いてください。"); return; }
  const WIN = getWIN(), FWD = getFWD();
  const drawTF = $("drawTf").value;
  const xs = drawPts.map(p=>p.x);
  const xmin = Math.min(...xs), xmax = Math.max(...xs);
  if (xmax-xmin < 40){ alert("横幅が狭すぎます。もう少し大きく描いてください。"); return; }
  const buckets = new Array(WIN).fill(null).map(()=>[]);
  for (const p of drawPts){
    let bi = Math.floor((p.x-xmin)/(xmax-xmin)*WIN);
    if (bi>=WIN) bi=WIN-1;
    buckets[bi].push(p.y);
  }
  const shape = new Array(WIN).fill(null);
  buckets.forEach((b,i)=>{ if(b.length) shape[i] = b.reduce((s,v)=>s+v,0)/b.length });
  for (let i=0;i<WIN;i++){
    if (shape[i]===null){
      let l=i-1; while(l>=0&&shape[l]===null)l--;
      let r=i+1; while(r<WIN&&shape[r]===null)r++;
      if(l<0&&r>=WIN) return;
      if(l<0) shape[i]=shape[r];
      else if(r>=WIN) shape[i]=shape[l];
      else shape[i]=shape[l]+(shape[r]-shape[l])*(i-l)/(r-l);
    }
  }
  const q = znorm(shape.map(v=>-v));
  const bars = state.frames[drawTF]||[];
  $("loading").classList.add("show");
  $("simResult").style.display="none";
  setTimeout(()=>{
    const res = searchTop(bars, q, WIN, FWD, null, drawTF);
    $("loading").classList.remove("show");
    if (!res){ alert("①で過去データを読み込んでください（またはこの時間足はデータ不足）"); return; }
    const upP=Math.round(res.up/res.n*100), dnP=Math.round(res.down/res.n*100);
    $("lblUp").textContent = FWD+"本後 上昇";
    $("lblDown").textContent = FWD+"本後 下落";
    $("pUp").textContent = upP+"%";
    $("pDown").textContent = dnP+"%";
    $("pFlat").textContent = (100-upP-dnP)+"%";
    const avg=res.avg*100;
    $("simNote").textContent =
      `手書きの形（${WIN}本相当）を${drawTF}足・全${res.scanned.toLocaleString()}局面と照合し類似上位${res.n}件を集計。`+
      `${FWD}本後の平均変化率 ${avg>=0?"+":""}${avg.toFixed(3)}%。※過去の集計であり予測ではない。`;
    $("ghostNote").textContent =
      `灰色線＝類似局面それぞれの「その後${FWD}本」。金色線＝平均。`;
    $("simResult").style.display="block";
    drawGhost(res.paths, FWD);
  }, 30);
};

function drawGhost(paths, FWD){
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
  ctx.strokeStyle="rgba(138,148,172,.4)";ctx.setLineDash([3,3]);
  ctx.beginPath();ctx.moveTo(pad.l,y(0));ctx.lineTo(w-pad.r,y(0));ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle="#8A94AC";ctx.font="10px SF Mono,Consolas,monospace";
  ctx.fillText("0%", w-pad.r+6, y(0)+3);
  ctx.fillText((hi*100).toFixed(2)+"%", w-pad.r+6, y(hi)+3);
  ctx.fillText((lo*100).toFixed(2)+"%", w-pad.r+6, y(lo)+3);
  ctx.strokeStyle="rgba(138,148,172,.16)";
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
  ctx.strokeStyle="#F0B90B";ctx.lineWidth=2.5;
  ctx.beginPath();
  mean.forEach((v,i)=> i?ctx.lineTo(x(i),y(v)):ctx.moveTo(x(i),y(v)));
  ctx.stroke();
}

/* ============ 開発用: 過去データからのパターン自己テスト(#dev) ============ */
(function initDev(){
  if (location.hash.indexOf("dev") < 0) return;   // #dev の時だけ有効
  const card = $("devCard");
  card.style.display = "block";

  // パターン選択肢を PATTERNS から生成
  const sel = $("devPat");
  PATTERNS.forEach((p,i)=>{
    const o=document.createElement("option");
    o.value=String(i); o.textContent=p.name;
    sel.appendChild(o);
  });

  let devHits = [];      // 現在のパターンで見つかった実例(検出hit) の配列
  let devIdx = 0;
  let devBars = null;    // 対象時間足の全バー
  let devPat = null;

  // 過去データから、選択パターンの実例(hits)を集める
  function findExamples(){
    const tfKey = $("devTf").value;
    const patIdx = +sel.value;
    const useFilter = $("devFilter").checked;
    devPat = PATTERNS[patIdx];
    const bars = state.frames[tfKey];
    $("devArea").style.display="none";
    $("devPrevBtn").disabled = $("devNextBtn").disabled = true;
    if (!bars || bars.length < 200){
      $("devStat").innerHTML = "⚠ 先に①でCSVを読み込んでください（この時間足はデータ不足）。";
      return;
    }
    // 直近寄りだと文脈lookbackが足りるように、全体をzigzag。ATRは全体平均。
    const atr = atrOf(bars);
    const piv = zigzagAbs(bars, atr*devPat.rev);
    const ma25 = getMA25(tfKey);
    // useFilter=false のときは bars を渡さない → 旧ロジック(誤検出込み)
    const hits = useFilter
      ? devPat.match(piv, atr, bars, ma25)
      : devPat.match(piv, atr);
    // 描画に十分な前後余白があるものだけ
    devBars = bars;
    devHits = hits.filter(h=>{
      const lo = h.pivs[0].i, hi = h.end;
      return lo-10 >= 0 && hi+15 < bars.length;
    });
    if (!devHits.length){
      $("devStat").innerHTML =
        `「${devPat.name}」は${tfKey}足の過去データ(${bars.length.toLocaleString()}本)で`+
        `${useFilter?"文脈フィルタON":"フィルタOFF"}では検出0件でした。`+
        `${useFilter?"フィルタをOFFにすると構造判定のみで出るか比較できます。":""}`;
      return;
    }
    devIdx = 0;
    showExample();
  }

  function showExample(){
    const tfKey = $("devTf").value;
    const useFilter = $("devFilter").checked;
    const h = devHits[devIdx];
    // 切り出し範囲: クランプ後のパターン幅に比例した余白(常に主役に見えるように)
    const cp = clampAnchors(h.pivs, devBars);
    const patW = h.end - cp[0].i;
    const margin = Math.max(8, Math.round(patW*0.35));
    const from = Math.max(0, cp[0].i - margin);
    const to   = Math.min(devBars.length-1, h.end + Math.max(12, Math.round(patW*0.4)));
    const seg  = devBars.slice(from, to+1);
    // pivをローカル座標に変換
    const localPivs = cp.map(p=>({i:p.i-from, p:p.p, hi:p.hi}));
    const localEnd = h.end - from;
    $("devArea").style.display="block";   // 先に表示(非表示中はcanvas幅0で描けない)
    drawDevChart(seg, localPivs, localEnd, devPat, !!h.ext);

    const t0 = new Date(devBars[h.pivs[0].i].t);
    const fmt = d=>`${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
    // この実例の「その後」を集計(10本後)
    const after = h.end+10 < devBars.length
      ? ((devBars[h.end+10].c - devBars[h.end].c)/devBars[h.end].c*100) : null;
    $("devStat").innerHTML =
      `✅「${devPat.name}」を${tfKey}足の過去データで <b style="color:var(--green)">${devHits.length}件</b> 検出`+
      `（${useFilter?"文脈フィルタON":"フィルタOFF/旧ロジック"}）。`+
      `<br>実例 ${devIdx+1} / ${devHits.length} ： ${fmt(t0)} 付近`+
      (after!==null ? ` → 確定10本後 ${after>=0?"+":""}${after.toFixed(3)}%` : "");
    $("devPrevBtn").disabled = devIdx<=0;
    $("devNextBtn").disabled = devIdx>=devHits.length-1;
  }

  // dev専用の軽量チャート描画(ローソク + ピボット線 + ラベル)
  function drawDevChart(bars, pivs, endIdx, pat, ext){
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
    ctx.strokeStyle="rgba(35,45,69,.6)";
    for(let g=0;g<=4;g++){const yy=pad.t+(h-pad.t-pad.b)*g/4;ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(w-pad.r,yy);ctx.stroke();}
    // 確定バーの縦線
    if(endIdx>=0&&endIdx<bars.length){
      const bx=xAt(endIdx);
      ctx.strokeStyle="rgba(240,185,11,.3)";ctx.setLineDash([4,4]);
      ctx.beginPath();ctx.moveTo(bx,pad.t);ctx.lineTo(bx,h-pad.b);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle="rgba(240,185,11,.8)";ctx.font="10px sans-serif";ctx.textAlign="left";
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
    ctx.strokeStyle=pat.dir>0?"rgba(22,199,132,.9)":"rgba(240,185,11,.95)";
    ctx.lineWidth=2;ctx.setLineDash([3,2]);ctx.beginPath();
    pivs.forEach((p,k)=>{k?ctx.lineTo(xAt(p.i),y(p.p)):ctx.moveTo(xAt(p.i),y(p.p));});
    if(ext && endIdx>=0 && endIdx<bars.length)       // 三尊系: 確定バーまで下り腕を延長
      ctx.lineTo(xAt(endIdx), y(bars[endIdx].c));
    ctx.stroke();ctx.setLineDash([]);
    pivs.forEach(p=>{
      ctx.fillStyle=pat.dir>0?"#16C784":"#F0B90B";
      ctx.beginPath();ctx.arc(xAt(p.i),y(p.p),3.5,0,Math.PI*2);ctx.fill();
    });
    const anc = pat.dir>0
      ? pivs.reduce((a,b)=> b.p<a.p?b:a)
      : pivs.reduce((a,b)=> b.p>a.p?b:a);
    ctx.fillStyle=pat.dir>0?"#16C784":"#F0B90B";
    ctx.font="bold 12px sans-serif";ctx.textAlign="center";
    const lyD=Math.min(Math.max(pat.dir>0 ? y(anc.p)+20 : y(anc.p)-12, pad.t+12), h-pad.b-4);
    ctx.fillText("🔔"+pat.name, xAt(anc.i), lyD);
  }

  $("devFindBtn").onclick = findExamples;
  $("devPrevBtn").onclick = ()=>{ if(devIdx>0){devIdx--; showExample();} };
  $("devNextBtn").onclick = ()=>{ if(devIdx<devHits.length-1){devIdx++; showExample();} };
  // パターン/時間足/フィルタを変えたら結果をリセット
  ["devTf","devPat","devFilter"].forEach(id=>$(id).addEventListener("change",()=>{
    $("devArea").style.display="none";
    $("devStat").textContent="";
    $("devPrevBtn").disabled=$("devNextBtn").disabled=true;
  }));
  window.addEventListener("resize", ()=>{ if($("devArea").style.display!=="none") showExample(); });
})();
