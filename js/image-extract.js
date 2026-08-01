"use strict";
import { state, $, getWIN, getFWD } from "./state.js";
import { detectPatterns, searchTop, HTF } from "./pattern-search.js";
import { znorm, maSeries, trendDir } from "./data.js";
import { drawShot, updateVerdict, updatePatList, updateGallery } from "./render.js";

/* スクショ→擬似bars化(価格=反転ピクセル) */
export function shotBars(F){
  return F.candles.map(c=>{
    // y反転(画像は下向き=価格下落)。実体上端下端を始値終値の近似に
    const top=-(c.bt), bot=-(c.bb);
    const o = c.up ? bot : top;
    const cl = c.up ? top : bot;
    return {t:c.x, o, h:-c.hi, l:-c.lo, c:cl, up:c.up};
  });
}

/* スクショ抽出足から現在の方向を求める(MA25計算に35本以上必要) */
export function shotTrendDir(F){
  if (!F.candles) return null;
  const bars = shotBars(F);
  if (bars.length < 35) return null;
  const ma = maSeries(bars, 25);
  const e = bars.length - 1;
  return trendDir(bars[e].c, ma[e], ma[e-10]);
}

export function loadChartImage(file, F){
  F.els.loading.classList.add("show");
  const img = new Image();
  img.onload = ()=>{ extractCandles(img, F); URL.revokeObjectURL(img.src); };
  img.onerror = ()=>{ F.els.loading.classList.remove("show"); F.els.stat.textContent="⚠ 画像を読み込めませんでした"; };
  img.src = URL.createObjectURL(file);
}

export function extractCandles(img, F){
  const oc = document.createElement("canvas");
  const scale = Math.min(1, 2600/img.width);
  oc.width = Math.round(img.width*scale);
  oc.height = Math.round(img.height*scale);
  const ctx = oc.getContext("2d");
  ctx.drawImage(img, 0, 0, oc.width, oc.height);
  const data = ctx.getImageData(0,0,oc.width,oc.height).data;
  const W=oc.width, H=oc.height;

  const isRed  = (r,g,b)=> r>140 && g<100 && b<100;
  const isBlue = (r,g,b)=> b>140 && r<100 && g<170;

  // 全ピクセルスキャン: 行カウントと列マップ
  const rowc = new Int32Array(H);
  const pts = [];   // [x,y,kind]
  for(let y=0;y<H;y++){
    for(let x=0;x<W;x++){
      const i=(y*W+x)*4;
      const r=data[i],g=data[i+1],b=data[i+2];
      let kind=0;
      if(isRed(r,g,b))kind=1; else if(isBlue(r,g,b))kind=2;
      if(kind){ rowc[y]++; pts.push(x,y,kind); }
    }
  }
  F.els.loading.classList.remove("show");
  if(pts.length<600){
    F.els.stat.textContent="⚠ ローソク足(赤/青)を検出できませんでした。DMM系配色のチャートで試してください。";
    return;
  }

  // Y帯検出: 低閾値run→近接マージ→(高さ×列カバレッジ)最大の帯=チャート本体
  const runs=[]; let rs=null;
  for(let y=0;y<H;y++){
    if(rowc[y]>=2){ if(rs===null) rs=y; }
    else { if(rs!==null){ runs.push([rs,y]); rs=null; } }
  }
  if(rs!==null) runs.push([rs,H]);
  const merged=[runs[0]];
  for(let k=1;k<runs.length;k++){
    if(runs[k][0]-merged[merged.length-1][1] < 30) merged[merged.length-1][1]=runs[k][1];
    else merged.push(runs[k]);
  }
  let band=null, bestScore=-1;
  for(const bd of merged){
    const colset=new Set();
    for(let p=0;p<pts.length;p+=3){
      if(pts[p+1]>=bd[0]&&pts[p+1]<bd[1]) colset.add(pts[p]);
    }
    const sc=(bd[1]-bd[0])*colset.size;
    if(sc>bestScore){bestScore=sc;band=bd;}
  }
  const [y0,y1]=band;

  // 帯内の列シグナル
  const colc=new Int32Array(W);
  const colPix=new Map();   // x -> [{y,kind}...]
  for(let p=0;p<pts.length;p+=3){
    const x=pts[p],y=pts[p+1],k=pts[p+2];
    if(y<y0||y>=y1) continue;
    colc[x]++;
    if(!colPix.has(x)) colPix.set(x,[]);
    colPix.get(x).push({y,k});
  }
  let x0=-1,x1=-1;
  for(let x=0;x<W;x++){ if(colc[x]>0){ if(x0<0)x0=x; x1=x; } }
  const n=x1-x0+1;
  if(n<40){ F.els.stat.textContent="⚠ チャート領域が狭すぎます。"; return; }

  // 本体run検出(谷分割方式): ピクセル数の谷でローソクを区切る
  const nz = [];
  for(let x=x0;x<=x1;x++) if(colc[x]>0) nz.push(colc[x]);
  nz.sort((a,b)=>a-b);
  const medc = nz[Math.floor(nz.length/2)];
  const thr = medc*0.3;
  const bruns = [];   // [start,end)
  let inBody=false, bs=0;
  for(let x=x0;x<=x1;x++){
    const v=colc[x];
    if(v>thr && !inBody){ bs=x; inBody=true; }
    else if(v<=thr && inBody){ bruns.push([bs,x]); inBody=false; }
  }
  if(inBody) bruns.push([bs,x1+1]);
  if(bruns.length<8){
    F.els.stat.textContent=`⚠ 抽出できたローソクが${bruns.length}本のみ。チャート部分を大きめに撮ってください。`;
    return;
  }
  // 区切り = 隣接run間の中点。各セグメントからhi/lo/色を抽出
  const bounds=[x0];
  for(let k=0;k<bruns.length-1;k++){
    bounds.push(Math.round((bruns[k][1]+bruns[k+1][0])/2));
  }
  bounds.push(x1+1);
  const pitchEst = Math.round((x1-x0+1)/bruns.length);
  const items=[];
  for(let k=0;k<bounds.length-1;k++){
    const rowpix=new Map();   // y -> [count,nr,nb]
    let cnt=0;
    for(let x=bounds[k];x<bounds[k+1];x++){
      const arr=colPix.get(x);
      if(!arr) continue;
      for(const {y,k:kd} of arr){
        let e=rowpix.get(y);
        if(!e){e=[0,0,0];rowpix.set(y,e);}
        e[0]++;
        if(kd===1)e[1]++; else e[2]++;
        cnt++;
      }
    }
    if(cnt<4){ items.push(null); continue; }
    // p2/p98で外れピクセル切り捨てた全体レンジ
    const flat=[];
    const ys=[...rowpix.keys()].sort((a,b)=>a-b);
    for(const y of ys){ const n=rowpix.get(y)[0]; for(let j=0;j<n;j++) flat.push(y); }
    const hi=flat[Math.floor(flat.length*0.02)];
    const lo=flat[Math.min(flat.length-1,Math.floor(flat.length*0.98))];
    // 実体 = 行幅が最大幅の55%以上の行
    let wmax=0;
    for(const y of ys){ const e=rowpix.get(y); if(y>=hi&&y<=lo&&e[0]>wmax)wmax=e[0]; }
    let bt=hi, bb=lo, found=false;
    for(const y of ys){
      const e=rowpix.get(y);
      if(y>=hi&&y<=lo&&e[0]>=wmax*0.55){
        if(!found){bt=y;found=true;}
        bb=y;
      }
    }
    let nr=0,nb=0;
    for(const e of rowpix.values()){nr+=e[1];nb+=e[2];}
    items.push({x:(bounds[k]+bounds[k+1])/2,hi,lo,bt,bb,nr,nb});
  }
  while(items.length&&items[0]===null) items.shift();
  while(items.length&&items[items.length-1]===null) items.pop();

  // 縦スパン中央値フィルタ
  const vv=items.filter(Boolean);
  if(vv.length<8){
    F.els.stat.textContent=`⚠ 抽出できたローソクが${vv.length}本のみ。チャート部分を大きめに撮ってください。`;
    return;
  }
  const spans=vv.map(i=>i.lo-i.hi).sort((a,b)=>a-b);
  const medspan=spans[Math.floor(spans.length/2)];
  let out=items.map(i=> (i && (i.lo-i.hi)<=medspan*6) ? i : null).filter(Boolean);

  F.candles = out.map(i=>({x:i.x,hi:i.hi,lo:i.lo,bt:i.bt,bb:i.bb,up:i.nr>=i.nb}));
  F.els.stat.innerHTML=`✅ <b style="color:var(--green)">${F.candles.length}本</b>のローソクを読み取り（ピッチ約${pitchEst}px）`;
  F.els.badge.textContent = `${F.candles.length}本読取済`;
  analyzeShot(F);
  reanalyzeLower(F);
}

/* F を上位足として参照している下位足枠を再解析(上位足スクショの追加/削除で結果が変わるため) */
export function reanalyzeLower(F){
  for (const S of state.SLOTS){
    if (S !== F && S.candles && (HTF[S.key] || []).includes(F.key)) analyzeShot(S);
  }
}

export function analyzeShot(F){
  if (!F.candles) return;
  const bars = shotBars(F);
  const WIN = getWIN(), FWD = getFWD();

  // パターン検出(スクショ上・スケールフリー)
  const patterns = detectPatterns(bars);

  // 類似検索(CSVがあれば)
  let res = null;
  const hist = state.frames[F.key];
  if (hist && hist.length > WIN+FWD+60){
    const mids = bars.map(b=>b.c);
    const use = mids.length>=WIN ? mids.slice(-WIN) : mids;
    const q = new Array(WIN);
    for(let k=0;k<WIN;k++){
      const pos=k*(use.length-1)/(WIN-1);
      const i0=Math.floor(pos), frac=pos-i0;
      q[k]= i0+1<use.length ? use[i0]*(1-frac)+use[i0+1]*frac : use[i0];
    }
    // MAレジーム: スクショ抽出足からMA25と傾きを算出(足りなければ無効)
    let regime = null;
    if ($("maFilter").checked && bars.length >= 35){
      const sMA = maSeries(bars, 25);
      const e = bars.length-1;
      if (sMA[e]!==null && sMA[e-10]!==null &&
          isFinite(bars[e].c) && isFinite(sMA[e]) && isFinite(sMA[e-10])){
        regime = {
          pos: Math.sign(bars[e].c - sMA[e]),
          slope: Math.sign(sMA[e] - sMA[e-10]),
        };
        if(!isFinite(regime.pos)||!isFinite(regime.slope)) regime=null;
      }
    }
    // マルチTFフィルタ: 上位足枠にスクショがあれば、その方向が一致する過去に絞る
    let mtf = null;
    if ($("mtfFilter").checked){
      const cs = [];
      for (const hk of (HTF[F.key] || [])){
        const S = state.SLOTS.find(s => s.key === hk);
        if (!S || !S.candles) continue;
        const d = shotTrendDir(S);
        if (d === null) continue;
        cs.push({key: hk, dir: d});
      }
      if (cs.length) mtf = cs;
    }
    const nq = znorm(q);
    res = searchTop(hist, nq, WIN, FWD, regime, F.key, mtf);
    let mtfFB = false;
    if (!res && mtf){  // 絞りすぎで母数不足 → 上位足フィルタを外して再検索
      res = searchTop(hist, nq, WIN, FWD, regime, F.key, null);
      mtfFB = true;
    }
    if (res){
      res.FWD = FWD; res.usedWIN = WIN; res.regime = !!regime; res.usedBars = use.length;
      res.mtf = mtfFB ? null : mtf;
      res.mtfFallback = mtfFB;
    }
  }
  F.result = {bars, patterns, res, WIN};
  F.els.area.style.display = "block";
  drawShot(F);
  updateVerdict(F);
  updatePatList(F);
  updateGallery(F);   // アクティブ枠なら類似過去チャートを描画(非アクティブは非表示)
}
