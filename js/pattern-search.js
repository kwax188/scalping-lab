"use strict";
import { state } from "./state.js";
import { maSeries, dist, znorm, pctSeries, sdOf, trendDir } from "./data.js";

/* ============ マルチTFフィルタ(第2弾) ============ */
/* 各時間足の「上位足」定義。予想を出す際、ここに挙げた上位足のスクショが
   貼られていれば、その方向が一致していた過去局面だけを母体にする。 */
export const HTF = {
  "1分":  ["5分","1時間"],
  "5分":  ["15分","4時間"],
  "15分": ["1時間","日足"],
  "1時間":["4時間","日足"],
  "4時間":["日足"],
  "日足": [],
};

export function getMA25(tfKey){
  if (!state.maCache[tfKey]) state.maCache[tfKey] = maSeries(state.frames[tfKey], 25);
  return state.maCache[tfKey];
}

export function searchTop(bars, q, WIN, FWD, regime, tfKey, mtf){
  const results = [];
  const end = bars.length - WIN - FWD - 1;
  if (end < 50) return null;
  let ma25 = null;
  if (regime) ma25 = getMA25(tfKey);
  /* 上位足制約の実行時状態。バーは時刻昇順・走査も昇順なので
     単調ポインタで上位足の対応バーをO(1)追跡できる。 */
  let cons = null;
  if (mtf && mtf.length){
    cons = mtf.map(m=>{
      const hB = state.frames[m.key];
      if (!hB || hB.length < 45) return null;
      return { hB, hMA: getMA25(m.key), dir: m.dir, ptr: 0 };
    }).filter(Boolean);
    if (!cons.length) cons = null;
  }
  for (let s=0; s<end; s++){
    const e = s+WIN-1;
    if (cons){
      const t = bars[e].t;
      let ok = true;
      for (const c of cons){
        while (c.ptr+1 < c.hB.length && c.hB[c.ptr+1].t <= t) c.ptr++;
        const j = c.ptr - 1;  // 直前に「確定した」上位足バー(形成中バーを使うと先読みになる)
        if (j < 35 || c.hB[c.ptr].t > t){ ok = false; break; }
        const d = trendDir(c.hB[j].c, c.hMA[j], c.hMA[j-10]);
        if (d !== c.dir){ ok = false; break; }
      }
      if (!ok) continue;
    }
    if (regime){
      if (e<35 || ma25[e]===null || ma25[e-10]===null) continue;
      const posOK = Math.sign(bars[e].c - ma25[e]) === regime.pos;
      const slpOK = Math.sign(ma25[e] - ma25[e-10]) === regime.slope;
      if (!posOK || !slpOK) continue;
    }
    results.push({s, d: dist(q, znorm(pctSeries(bars, s, WIN)))});
  }
  if (results.length < 50) return null;
  results.sort((a,b)=>a.d-b.d);
  const K = Math.max(30, Math.min(100, Math.floor(results.length*0.005)||30));
  const top = results.slice(0, K);

  let atr=0;
  for (let i=bars.length-15;i<bars.length;i++) atr += bars[i].h-bars[i].l;
  atr/=15;
  const thr = atr*0.5;

  let up=0,down=0,flat=0,sumEnd=0,sdSum=0;
  const paths=[];
  for (const r of top){
    const entry = bars[r.s+WIN-1].c;
    const mv = bars[r.s+WIN-1+FWD].c - entry;
    if (mv > thr) up++; else if (mv < -thr) down++; else flat++;
    sumEnd += mv/entry;
    sdSum += sdOf(pctSeries(bars, r.s, WIN));
    const path=[];
    for(let i=0;i<=FWD;i++) path.push((bars[r.s+WIN-1+i].c-entry)/entry);
    paths.push(path);
  }
  const mean=[], p25=[], p75=[];
  for(let i=0;i<=FWD;i++){
    const col = paths.map(p=>p[i]).sort((a,b)=>a-b);
    mean.push(col.reduce((s,v)=>s+v,0)/col.length);
    p25.push(col[Math.floor(col.length*0.25)]);
    p75.push(col[Math.floor(col.length*0.75)]);
  }
  return {n:top.length, scanned:results.length, up, down, flat, avg:sumEnd/top.length,
          paths, mean, p25, p75, sdAvg: sdSum/top.length,
          matches: top.map(r=>({s:r.s, d:r.d}))};   // 類似局面(距離昇順): 実物チャート描画用
}

/* ============ パターン検出(スケールフリー: ATR基準) ============ */
export function zigzagAbs(bars, rev){
  const piv=[];
  let dir=0;
  let hi=bars[0].c, hiI=0, lo=bars[0].c, loI=0;
  for(let i=1;i<bars.length;i++){
    const c=bars[i].c;
    if(dir===0){
      if(c>hi){hi=c;hiI=i}
      if(c<lo){lo=c;loI=i}
      if(c-lo>rev){piv.push({i:loI,p:lo,hi:false,conf:i});dir=1;hi=c;hiI=i}
      else if(hi-c>rev){piv.push({i:hiI,p:hi,hi:true,conf:i});dir=-1;lo=c;loI=i}
    } else if(dir===1){
      if(c>hi){hi=c;hiI=i}
      if(hi-c>rev){piv.push({i:hiI,p:hi,hi:true,conf:i});dir=-1;lo=c;loI=i}
    } else {
      if(c<lo){lo=c;loI=i}
      if(c-lo>rev){piv.push({i:loI,p:lo,hi:false,conf:i});dir=1;hi=c;hiI=i}
    }
  }
  return piv;
}
export function atrOf(bars){
  let s=0;
  for(const b of bars) s += (b.h-b.l);
  return s/bars.length || 1e-9;
}

/* ============ 文脈フィルタ(タスク2/A案・きつめ) ============ */
/* 反転パターンは「その形がレンジのどこで出たか」を要求する。
   きつめ設定:
   - レンジ相対位置: 天井/大底が直近レンジの上位/下位 CTX.edge(=25%) 圏
   - MA25位置: トップ系は価格>MA25、ボトム系は価格<MA25(piv 確定点で判定)
   両方を満たさないと不採用。上昇途中の押し目をトップと誤認する等を弾く。 */
const CTX = { edge: 0.25, lookback: 60 };

// piv 確定点(conf)より前の直近 lookback 本のレンジ内で、価格 p の相対位置(0=安値,1=高値)
export function rangePos(bars, confIdx, p){
  const lo0 = Math.max(0, confIdx - CTX.lookback);
  let lo = Infinity, hi = -Infinity;
  for (let i=lo0; i<=confIdx && i<bars.length; i++){
    if (bars[i].l < lo) lo = bars[i].l;
    if (bars[i].h > hi) hi = bars[i].h;
  }
  const rng = hi - lo;
  if (!(rng > 0)) return 0.5;
  return (p - lo) / rng;
}
// conf 時点で MA25 に対し価格が上(+1)/下(-1)。MA25 が無ければ 0(判定不能→不採用扱い)
export function maSideAt(ma25, confIdx, price){
  if (!ma25) return 0;
  const m = ma25[confIdx];
  if (m === null || m === undefined || !isFinite(m)) return 0;
  return Math.sign(price - m);
}
// 天井系(dir<0)の位置OK: 山が上位edge圏 かつ 価格>MA25
export function topCtxOK(bars, ma25, confIdx, topP){
  if (rangePos(bars, confIdx, topP) < 1 - CTX.edge) return false;
  if (maSideAt(ma25, confIdx, topP) <= 0) return false;
  return true;
}
// 大底系(dir>0)の位置OK: 谷が下位edge圏 かつ 価格<MA25
export function bottomCtxOK(bars, ma25, confIdx, botP){
  if (rangePos(bars, confIdx, botP) > CTX.edge) return false;
  if (maSideAt(ma25, confIdx, botP) >= 0) return false;
  return true;
}

/* ============ 構造検出器 v2(比率ベース) ============
   並び順だけでなく「比率・対称性・直前トレンド」を要求する。
   h = パターンの高さ(中間の戻り幅) を基準に許容量を決めるため、
   巨大な山を挟んだだけの2安値(見かけ倒しのW)等を構造の段階で弾く。
   match(piv, atr, bars, ma25) — bars/ma25 があれば文脈フィルタも適用 */
export const PATTERNS = [
  {name:"ダブルボトム", dir:1, rev:1.5,
    match(piv, atr, bars, ma25){
      const out=[];
      // 教科書のW: 高値H0 → 一番底L1 → 戻り高値(ネックライン)Hm → 二番底L2 → ブレイクH2
      // 2つの底が同水準で低く、間の戻りは浅い(両底より十分上、H0/H2より十分下)
      for(let k=4;k<piv.length;k++){
        const H0=piv[k-4], L1=piv[k-3], Hm=piv[k-2], L2=piv[k-1], H2=piv[k];
        if(!(H0.hi && !L1.hi && Hm.hi && !L2.hi && H2.hi)) continue;
        const botMax = Math.max(L1.p, L2.p);
        const neck   = Hm.p;                              // 戻り高値=ネックライン
        const h = neck - botMax;                          // ネックライン〜底(=戻りの浅さ)
        if(h < 1.0*atr || h > 10*atr) continue;
        // 2つの底は同水準
        if(Math.abs(L1.p-L2.p) > Math.max(0.4*h, 0.6*atr)) continue;
        // 間の戻りは"浅い"= H0,H2 の高値より十分下(=山1つのへの字を排除)
        if(neck > Math.min(H0.p, H2.p) - 0.5*h) continue; // 戻り高値が両サイド高値に近い→ダブルでない
        // ブレイク: 最後の高値がネックラインを上抜け
        if(H2.p < neck + 0.15*h) continue;
        // 幅・時間対称
        const w = L2.i - L1.i;
        if(w < 3 || w > 40) continue;
        const cpos = (Hm.i - L1.i)/w;
        if(cpos < 0.2 || cpos > 0.8) continue;
        if(bars){
          // 区間の実質最安が2つの底であること(間に更に安い谷がない)
          let mn=Infinity;
          for(let i=L1.i;i<=L2.i;i++) mn=Math.min(mn,bars[i].c);
          if(mn < botMax - 0.5*h) continue;
          if(!(bottomCtxOK(bars,ma25,L1.i,L1.p) && bottomCtxOK(bars,ma25,L2.i,L2.p))) continue;
        }
        out.push({end:H2.conf, pivs:[H0,L1,Hm,L2,H2]});
      }
      return out;
    }},
  {name:"ダブルトップ", dir:-1, rev:1.5,
    match(piv, atr, bars, ma25){
      const out=[];
      // 教科書のM: 安値L0 → 一番天井H1 → 押し安値(ネックライン)Lm → 二番天井H2 → ブレイクL2
      for(let k=4;k<piv.length;k++){
        const L0=piv[k-4], H1=piv[k-3], Lm=piv[k-2], H2=piv[k-1], L2=piv[k];
        if(!(!L0.hi && H1.hi && !Lm.hi && H2.hi && !L2.hi)) continue;
        const topMin = Math.min(H1.p, H2.p);
        const neck   = Lm.p;                              // 押し安値=ネックライン
        const h = topMin - neck;                          // 天井〜ネックライン(=押しの浅さ)
        if(h < 1.0*atr || h > 10*atr) continue;
        if(Math.abs(H1.p-H2.p) > Math.max(0.4*h, 0.6*atr)) continue;   // 2つの天井は同水準
        if(neck < Math.max(L0.p, L2.p) + 0.5*h) continue; // 押し安値が両サイド安値に近い→ダブルでない
        if(L2.p > neck - 0.15*h) continue;                // ブレイク: ネックライン下抜け
        const w = H2.i - H1.i;
        if(w < 3 || w > 40) continue;
        const cpos = (Lm.i - H1.i)/w;
        if(cpos < 0.2 || cpos > 0.8) continue;
        if(bars){
          let mx=-Infinity;
          for(let i=H1.i;i<=H2.i;i++) mx=Math.max(mx,bars[i].c);
          if(mx > topMin + 0.5*h) continue;
          if(!(topCtxOK(bars,ma25,H1.i,H1.p) && topCtxOK(bars,ma25,H2.i,H2.p))) continue;
        }
        out.push({end:L2.conf, pivs:[L0,H1,Lm,H2,L2]});
      }
      return out;
    }},
  {name:"三尊", dir:-1, rev:1.8,
    match(piv, atr, bars, ma25){
      const out=[];
      for(let k=5;k<piv.length;k++){
        const T0=piv[k-5], S1=piv[k-4], T1=piv[k-3], Hd=piv[k-2], T2=piv[k-1], S2=piv[k];
        if(!(!T0.hi && S1.hi && !T1.hi && Hd.hi && !T2.hi && S2.hi)) continue;
        const neck = (T1.p+T2.p)/2;
        const h = Hd.p - neck;                            // 頭〜ネックライン
        if(h < 1.5*atr || h > 12*atr) continue;
        if(Hd.p - Math.max(S1.p,S2.p) < 0.25*h) continue; // 頭が肩より明確に高い
        if(Math.min(S1.p,S2.p) - neck < 0.4*h) continue;  // 両肩もネックから十分高い(肩が山として立つ)
        if(Math.abs(S1.p-S2.p) > 0.3*h) continue;         // 両肩は同水準
        if(Math.abs(T1.p-T2.p) > 0.3*h) continue;         // ネックラインはほぼ水平
        const wl = Hd.i - S1.i, wr = S2.i - Hd.i;
        if(wl < 2 || wr < 2 || wl > wr*3 || wr > wl*3) continue; // 左右対称性
        if(S1.p - T0.p < 0.5*h) continue;                 // 直前の上昇トレンド
        if(bars){
          let mx=-Infinity;
          for(let i=S1.i;i<=S2.i;i++) mx=Math.max(mx,bars[i].c);
          if(mx > Hd.p + 0.15*h) continue;                // 頭が区間の最高値
          if(!topCtxOK(bars,ma25,Hd.i,Hd.p)) continue;
        }
        out.push({end:S2.conf, pivs:[T0,S1,T1,Hd,T2,S2], ext:true});
      }
      return out;
    }},
  {name:"逆三尊", dir:1, rev:1.8,
    match(piv, atr, bars, ma25){
      const out=[];
      for(let k=5;k<piv.length;k++){
        const P0=piv[k-5], S1=piv[k-4], P1=piv[k-3], Hd=piv[k-2], P2=piv[k-1], S2=piv[k];
        if(!(P0.hi && !S1.hi && P1.hi && !Hd.hi && P2.hi && !S2.hi)) continue;
        const neck = (P1.p+P2.p)/2;
        const h = neck - Hd.p;                            // ネックライン〜頭(下)
        if(h < 1.5*atr || h > 12*atr) continue;
        if(Math.min(S1.p,S2.p) - Hd.p < 0.25*h) continue; // 頭が肩より明確に低い
        if(neck - Math.max(S1.p,S2.p) < 0.4*h) continue;  // 両肩もネックから十分深い(肩が谷として立つ)
        if(Math.abs(S1.p-S2.p) > 0.3*h) continue;
        if(Math.abs(P1.p-P2.p) > 0.3*h) continue;         // ネックラインはほぼ水平
        const wl = Hd.i - S1.i, wr = S2.i - Hd.i;
        if(wl < 2 || wr < 2 || wl > wr*3 || wr > wl*3) continue;
        if(P0.p - S1.p < 0.5*h) continue;                 // 直前の下落トレンド
        if(bars){
          let mn=Infinity;
          for(let i=S1.i;i<=S2.i;i++) mn=Math.min(mn,bars[i].c);
          if(mn < Hd.p - 0.15*h) continue;                // 頭が区間の最安値
          if(!bottomCtxOK(bars,ma25,Hd.i,Hd.p)) continue;
        }
        out.push({end:S2.conf, pivs:[P0,S1,P1,Hd,P2,S2], ext:true});
      }
      return out;
    }},
  {name:"エリオット5波(上昇・簡易)", dir:-1, rev:1.8,
    match(piv, atr, bars, ma25){
      const out=[];
      for(let k=5;k<piv.length;k++){
        const s=[piv[k-5],piv[k-4],piv[k-3],piv[k-2],piv[k-1],piv[k]];
        if(!s[0].hi&&s[1].hi&&!s[2].hi&&s[3].hi&&!s[4].hi&&s[5].hi){
          const w1=s[1].p-s[0].p, w3=s[3].p-s[2].p, w5=s[5].p-s[4].p;
          if(w1<0.8*atr||w3<0.8*atr||w5<0.8*atr) continue; // 各波の最低振幅
          if(s[2].p<=s[0].p) continue;                     // 2波は1波起点を割らない
          if(s[4].p<=s[1].p) continue;                     // 4波は1波高値と重ならない
          if(w3<w1&&w3<w5) continue;                       // 3波は最短ではない
          out.push({end:s[5].conf, pivs:s});
        }
      }
      return out;
    }},
];

/* 描画用: 外側アンカー(起点/終点ピボット)が本体から離れすぎている場合、
   本体幅の範囲内の終値に置き換える(長大な腕がチャートを支配するのを防ぐ) */
export function clampAnchors(pivs, bars){
  if(!bars || pivs.length < 5) return pivs;
  const innerN = pivs[pivs.length-2];
  const core = Math.max(4, innerN.i - pivs[1].i);
  const lim = Math.round(core*0.8);
  const out = pivs.slice();
  if(pivs[1].i - pivs[0].i > lim){
    const ni = Math.max(0, pivs[1].i - Math.round(lim*0.75));
    out[0] = {i:ni, p:bars[ni].c, hi:pivs[0].hi};
  }
  if(pivs[pivs.length-1].i - innerN.i > lim){
    const ni = Math.min(bars.length-1, innerN.i + Math.round(lim*0.75));
    out[out.length-1] = {i:ni, p:bars[ni].c, hi:pivs[pivs.length-1].hi};
  }
  return out;
}

export function detectPatterns(bars){
  const atr = atrOf(bars);
  const found = [];
  const zzCache = {};
  const ma25 = maSeries(bars, 25);
  for (const pat of PATTERNS){
    const rev = atr * pat.rev;
    if (!zzCache[pat.rev]) zzCache[pat.rev] = zigzagAbs(bars, rev);
    const hits = pat.match(zzCache[pat.rev], atr, bars, ma25);
    if (hits.length) found.push({pat, hits});
  }
  return found;
}

/* CSVの同時間足でパターンをバックテスト(このパターンが出たあとどうなったか) */
export function backtestPattern(pat, tfKey){
  const bars = state.frames[tfKey];
  if (!bars || bars.length < 200) return null;
  const atr = atrOf(bars.slice(-2000));
  const piv = zigzagAbs(bars, atr*pat.rev);
  const ma25 = getMA25(tfKey);
  const hits = pat.match(piv, atr, bars, ma25);
  if (hits.length < 5) return null;
  const thr = atr*0.5;
  let up=0,down=0,n=0;
  for (const h of hits){
    if (h.end+10 >= bars.length) continue;
    n++;
    const mv = bars[h.end+10].c - bars[h.end].c;
    if (mv>thr) up++; else if (mv<-thr) down++;
  }
  return n>=5 ? {n, up, down} : null;
}
