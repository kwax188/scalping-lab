"use strict";

/* ============ 時間足定義 ============ */
export const TFDEF = [
  {key:"1分", min:1}, {key:"5分", min:5}, {key:"15分", min:15},
  {key:"1時間", min:60}, {key:"4時間", min:240}, {key:"日足", min:1440},
];

/* ============ CSVデータ ============ */
export function parseCSV(text){
  const out = [];
  for (const line of text.split(/\r?\n/)){
    if (!line) continue;
    if (line.includes(";")){
      const p = line.split(";");
      if (p.length >= 5){
        const m = p[0].match(/(\d{4})(\d{2})(\d{2})\s+(\d{2})(\d{2})/);
        if (m){
          const t = new Date(+m[1], m[2]-1, +m[3], +m[4], +m[5]).getTime();
          const o=+p[1], h=+p[2], l=+p[3], c=+p[4];
          if (isFinite(o)&&isFinite(c)) out.push({t,o,h,l,c});
          continue;
        }
      }
    }
    const p = line.split(",");
    if (p.length >= 5){
      const t = Date.parse(p[0].replace(/\//g,"-"));
      const o=+p[1], h=+p[2], l=+p[3], c=+p[4];
      if (isFinite(t)&&isFinite(o)&&isFinite(c)) out.push({t,o,h,l,c});
    }
  }
  return out;
}

/* ============ バイナリ(.bin)デコード ============
   変換スクリプト(convert_csv_to_bin.js)の SoA 形式を M1 配列に復元する。
   [Int32 N][Int32×N minuteIndex][F32×N o][F32×N h][F32×N l][F32×N c] */
export function parseBin(buf){
  const dv = new DataView(buf);
  const n = dv.getInt32(0, true);
  if (n <= 0 || 4 + n*20 > buf.byteLength) throw new Error("binヘッダ不正");
  let off = 4;
  const t = new Int32Array(buf, off, n); off += n*4;
  const o = new Float32Array(buf, off, n); off += n*4;
  const h = new Float32Array(buf, off, n); off += n*4;
  const l = new Float32Array(buf, off, n); off += n*4;
  const c = new Float32Array(buf, off, n); off += n*4;
  const out = new Array(n);
  for (let i=0;i<n;i++) out[i] = {t: t[i]*60000, o:o[i], h:h[i], l:l[i], c:c[i]};
  return out;
}

export function resample(bars, min){
  if (min === 1) return bars;
  const ms = min*60000, out=[];
  let cur=null, key=null;
  for (const b of bars){
    const k = Math.floor(b.t/ms);
    if (k!==key){
      if (cur) out.push(cur);
      cur = {t:k*ms, o:b.o, h:b.h, l:b.l, c:b.c};
      key = k;
    } else {
      cur.h = Math.max(cur.h,b.h);
      cur.l = Math.min(cur.l,b.l);
      cur.c = b.c;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/* ============ 共通: 形状検索・統計 ============ */
export function pctSeries(bars, start, len){
  const base = bars[start].c;
  const out = new Array(len);
  for (let i=0;i<len;i++) out[i] = (bars[start+i].c - base)/base;
  return out;
}
export function znorm(a){
  const m = a.reduce((s,v)=>s+v,0)/a.length;
  const sd = Math.sqrt(a.reduce((s,v)=>s+(v-m)*(v-m),0)/a.length) || 1e-9;
  return a.map(v=>(v-m)/sd);
}
export function sdOf(a){
  const m = a.reduce((s,v)=>s+v,0)/a.length;
  return Math.sqrt(a.reduce((s,v)=>s+(v-m)*(v-m),0)/a.length) || 1e-9;
}
export function dist(a,b){
  let s=0;
  for(let i=0;i<a.length;i++){const d=a[i]-b[i]; s+=d*d}
  return s;
}

export function maSeries(bars, n){
  const out = new Array(bars.length).fill(null);
  let s = 0;
  for (let i=0;i<bars.length;i++){
    s += bars[i].c;
    if (i >= n) s -= bars[i-n].c;
    if (i >= n-1) out[i] = s/n;
  }
  return out;
}

/* トレンド方向の3値判定: +1=上昇(価格>MA25 かつ MA上向き) / -1=下落(逆) / 0=どっちつかず */
export function trendDir(price, ma, maPrev){
  if (ma===null || ma===undefined || maPrev===null || maPrev===undefined || !isFinite(price)) return null;
  const pos = Math.sign(price - ma), slp = Math.sign(ma - maPrev);
  if (pos>0 && slp>0) return 1;
  if (pos<0 && slp<0) return -1;
  return 0;
}
