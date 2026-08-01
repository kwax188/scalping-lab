"use strict";
import { state, $, getWIN, getFWD } from "./state.js";
import { idbSaveM1, idbLoadM1, idbClearM1 } from "./storage.js";
import { TFDEF, parseCSV, parseBin, resample, znorm } from "./data.js";
import { PATTERNS, atrOf, zigzagAbs, getMA25, clampAnchors, searchTop } from "./pattern-search.js";
import { loadChartImage, reanalyzeLower, analyzeShot } from "./image-extract.js";
import {
  updateGallery, frameMarkup, updateDataUI, showAutoload, hideAutoload,
  renderDraw, drawCanvasInit, drawGhost, drawDevChart,
} from "./render.js";

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
    root.innerHTML = frameMarkup(tf);
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

function dPos(e){
  const r = dc.getBoundingClientRect();
  const src = e.touches ? e.touches[0] : e;
  return {x: src.clientX-r.left, y: src.clientY-r.top};
}
dc.addEventListener("mousedown", e=>{drawing=true; drawPts.push(dPos(e)); renderDraw(dc, drawPts)});
dc.addEventListener("mousemove", e=>{if(drawing){drawPts.push(dPos(e)); renderDraw(dc, drawPts)}});
window.addEventListener("mouseup", ()=>drawing=false);
dc.addEventListener("touchstart", e=>{e.preventDefault();drawing=true;drawPts.push(dPos(e));renderDraw(dc, drawPts)},{passive:false});
dc.addEventListener("touchmove", e=>{e.preventDefault();if(drawing){drawPts.push(dPos(e));renderDraw(dc, drawPts)}},{passive:false});
window.addEventListener("touchend", ()=>drawing=false);
$("drawClearBtn").onclick = ()=>{drawPts=[]; renderDraw(dc, drawPts)};
window.addEventListener("resize", ()=>drawCanvasInit(dc, drawPts));
drawCanvasInit(dc, drawPts);

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
