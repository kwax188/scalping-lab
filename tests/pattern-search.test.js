import { test } from "node:test";
import assert from "node:assert/strict";
import {
  zigzagAbs, atrOf, rangePos, maSideAt, topCtxOK, bottomCtxOK,
  searchTop, detectPatterns, PATTERNS,
} from "../js/pattern-search.js";
import { pctSeries, znorm, maSeries } from "../js/data.js";

test("zigzagAbs: 閾値revを超えた高値/安値だけをピボットとして拾う", () => {
  const closes = [10,10,12,9,13,8,14];
  const bars = closes.map(c => ({c}));
  const piv = zigzagAbs(bars, 1.5);
  assert.deepEqual(piv, [
    {i:0, p:10, hi:false, conf:2},
    {i:2, p:12, hi:true,  conf:3},
    {i:3, p:9,  hi:false, conf:4},
    {i:4, p:13, hi:true,  conf:5},
    {i:5, p:8,  hi:false, conf:6},
  ]);
});

test("atrOf: 高値-安値の平均を返す", () => {
  const bars = [{h:10,l:8},{h:12,l:9},{h:11,l:10}];
  assert.equal(atrOf(bars), 2);
});

test("rangePos: レンジ内での価格の相対位置(0=安値,1=高値)", () => {
  const bars = [{l:1,h:2},{l:1.5,h:2.5},{l:0.5,h:3},{l:2,h:2.8},{l:1,h:2}];
  const pos = rangePos(bars, 4, 2);
  assert.ok(Math.abs(pos - 0.6) < 1e-9);
});

test("maSideAt: MA25より価格が上なら+1・下なら-1・MAなしなら0", () => {
  const ma25 = [null, 1, 2, 3, 4];
  assert.equal(maSideAt(ma25, 4, 5), 1);
  assert.equal(maSideAt(ma25, 4, 3), -1);
  assert.equal(maSideAt(ma25, 0, 100), 0);
  assert.equal(maSideAt(null, 4, 100), 0);
});

test("topCtxOK: レンジ上位25%圏かつMA25より上なら true", () => {
  const bars = [{l:1,h:2},{l:1.5,h:2.5},{l:0.5,h:3},{l:2,h:2.8},{l:1,h:2}];
  const ma25 = [null, 1, 2, 2.5, 2.7];
  assert.equal(topCtxOK(bars, ma25, 4, 2.9), true);
  assert.equal(topCtxOK(bars, ma25, 4, 0.6), false);
});

test("bottomCtxOK: レンジ下位25%圏かつMA25より下なら true", () => {
  const bars = [{l:1,h:2},{l:1.5,h:2.5},{l:0.5,h:3},{l:2,h:2.8},{l:1,h:2}];
  const ma25 = [null, 1, 2, 2.5, 2.7];
  assert.equal(bottomCtxOK(bars, ma25, 4, 0.6), true);
  assert.equal(bottomCtxOK(bars, ma25, 4, 2.9), false);
});

/* ============ characterization tests: searchTop / detectPatterns / PATTERNS[*].match ============
   以下は「現在の挙動を固定するリグレッションネット」であり、正しさの独立証明ではない。
   合成データに対して実際にコードを実行し、実際に返った値をgolden値として固定している
   (手計算での期待値の当てずっぽうではない)。 */

// 区分線形補間でクローズ値の合成価格系列を作る(テスト用の小さいヘルパー。src側には置かない)
function interpCloses(points, n){
  const closes = new Array(n);
  for (let i=0;i<n;i++){
    let seg = null;
    for (let k=0;k<points.length-1;k++){
      if (i>=points[k][0] && i<=points[k+1][0]){ seg=[points[k],points[k+1]]; break; }
    }
    if (!seg) seg=[points[points.length-2], points[points.length-1]];
    const [a,b] = seg;
    const t = (i-a[0])/(b[0]-a[0]||1);
    closes[i] = a[1] + (b[1]-a[1])*t;
  }
  return closes;
}
function barsFromCloses(closes, halfWidth = 0.5){
  return closes.map((c,i)=>({t:i*60000, o:c, h:c+halfWidth, l:c-halfWidth, c}));
}

test("searchTop: 周期的な合成バーで実行し、実際の出力の形と具体値を固定する", () => {
  // 振幅5・周期約63本(2π*10)の正弦波。周期性があるため類似局面が必ず複数見つかる。
  const bars = [];
  let prevC = 100;
  for (let i=0;i<200;i++){
    const c = 100 + 5*Math.sin(i/10);
    const o = prevC;
    const h = Math.max(o,c) + 0.2;
    const l = Math.min(o,c) - 0.2;
    bars.push({t:i*60000, o, h, l, c});
    prevC = c;
  }
  const WIN = 10, FWD = 5;
  const qStart = 60;
  // クエリは自分自身の局面(i=60起点)の形そのもの → 距離0の完全一致がヒットする
  const q = znorm(pctSeries(bars, qStart, WIN));
  const res = searchTop(bars, q, WIN, FWD, null, "test", null);

  assert.notEqual(res, null);
  assert.equal(res.up + res.down + res.flat, res.n);
  assert.equal(res.mean.length, FWD+1);
  assert.equal(res.p25.length, FWD+1);
  assert.equal(res.p75.length, FWD+1);
  // 完全一致の局面(距離0)が最上位にヒットしているはず
  assert.equal(res.matches[0].s, qStart);
  assert.equal(res.matches[0].d, 0);
  // 実行して観測した値をgolden値として固定(合成データがずれたら要見直し)
  assert.equal(res.n, 30);
  assert.equal(res.scanned, 184);
  assert.equal(res.up, 30);
  assert.equal(res.down, 0);
  assert.equal(res.flat, 0);
});

/* ダブルボトム狙いの合成フィクスチャ:
   0〜95本目は150→105の下降トレンド(MA25とレンジ位置の文脈フィルタを満たすため)、
   その後 112(高値)→100(安値L1)→103.5(戻り高値=ネック)→100.3(安値L2)→106(ブレイク高値)
   →101(ネックライン到達後の反落、ピボット確定用)という教科書的なWパターンを作る。 */
const DB_POINTS = [
  [0,150],[95,105],[100,112],[104,100],[108,103.5],[114,100.3],[118,106],[122,101],[140,105],[160,105],
];
const DB_CLOSES = interpCloses(DB_POINTS, 160);
const DB_BARS = barsFromCloses(DB_CLOSES);
// 300-c で価格軸を反転: 下降→上昇トレンド、大底→天井の文脈になり、ダブルトップ/エリオット5波の
// 文脈フィルタ(価格>MA25・レンジ上位)を満たす合成データになる。
const DT_CLOSES = DB_CLOSES.map(c => 300 - c);
const DT_BARS = barsFromCloses(DT_CLOSES);

test("detectPatterns: ダブルボトム狙いの合成データで実行し、実際に検出された内容を固定する", () => {
  const found = detectPatterns(DB_BARS);
  assert.equal(found.length, 1);
  assert.equal(found[0].pat.name, "ダブルボトム");
  assert.equal(found[0].hits.length, 1);
  const hit = found[0].hits[0];
  assert.equal(hit.end, 120);
  assert.deepEqual(hit.pivs.map(p=>p.i), [100,104,108,114,118]);
  assert.deepEqual(hit.pivs.map(p=>p.p), [112,100,103.5,100.3,106]);
});

test("PATTERNS[ダブルボトム].match: 直接呼び出しても同じ実局面を検出する", () => {
  const pat = PATTERNS.find(p=>p.name==="ダブルボトム");
  const atr = atrOf(DB_BARS);
  const piv = zigzagAbs(DB_BARS, atr*pat.rev);
  const ma25 = maSeries(DB_BARS, 25);
  const hits = pat.match(piv, atr, DB_BARS, ma25);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].end, 120);
  assert.deepEqual(hits[0].pivs.map(p=>p.p), [112,100,103.5,100.3,106]);
});

test("PATTERNS[ダブルトップ].match: 価格軸を反転した合成データで直接呼び出す", () => {
  const pat = PATTERNS.find(p=>p.name==="ダブルトップ");
  const atr = atrOf(DT_BARS);
  const piv = zigzagAbs(DT_BARS, atr*pat.rev);
  const ma25 = maSeries(DT_BARS, 25);
  const hits = pat.match(piv, atr, DT_BARS, ma25);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].end, 120);
  assert.deepEqual(hits[0].pivs.map(p=>p.p), [188,200,196.5,199.7,194]);
});

test("PATTERNS[エリオット5波].match: 反転済み合成データで直接呼び出す", () => {
  const pat = PATTERNS.find(p=>p.name.startsWith("エリオット"));
  const atr = atrOf(DT_BARS);
  const piv = zigzagAbs(DT_BARS, atr*pat.rev);   // rev=1.8 (ダブルトップとは別閾値)
  const hits = pat.match(piv, atr);   // bars/ma25なし = 構造判定のみ(match自体もbars/ma25を使わない)
  assert.equal(hits.length, 1);
  assert.equal(hits[0].end, 116);
  assert.deepEqual(hits[0].pivs.map(p=>p.p), [150,195,188,200,196.5,199.7]);
});

// 補足: detectPatterns(DT_BARS) はダブルトップに加えエリオット5波も検出する
// (別のrev閾値で作った別のzigzag系列がどちらの構造条件も満たすため)。
test("detectPatterns: 反転合成データではダブルトップとエリオット5波の両方を検出する", () => {
  const found = detectPatterns(DT_BARS);
  const names = found.map(f=>f.pat.name).sort();
  assert.deepEqual(names, ["エリオット5波(上昇・簡易)", "ダブルトップ"].sort());
});
