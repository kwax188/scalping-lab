import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCSV, parseBin, resample, pctSeries, znorm, sdOf, dist, maSeries, trendDir } from "../js/data.js";

function closeTo(actual, expected, eps = 1e-9){
  assert.ok(Math.abs(actual - expected) < eps,
    `expected ${actual} to be close to ${expected}`);
}

test("parseCSV: セミコロン区切り(MT形式)を解析できる", () => {
  const rows = parseCSV("20240102 0930;1.1;1.2;1.05;1.15\n");
  assert.equal(rows.length, 1);
  const expectedT = new Date(2024, 0, 2, 9, 30).getTime();
  assert.equal(rows[0].t, expectedT);
  assert.equal(rows[0].o, 1.1);
  assert.equal(rows[0].h, 1.2);
  assert.equal(rows[0].l, 1.05);
  assert.equal(rows[0].c, 1.15);
});

test("parseCSV: カンマ区切り(yyyy/mm/dd形式)を解析できる", () => {
  const rows = parseCSV("2024/01/02,1.1,1.2,1.05,1.15\n");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].t, Date.parse("2024-01-02"));
});

test("parseCSV: 空行・不正行は無視する", () => {
  const rows = parseCSV("\n\ninvalid\n2024/01/02,1.1,1.2,1.05,1.15\n");
  assert.equal(rows.length, 1);
});

test("resample: min=1は入力をそのまま返す", () => {
  const bars = [{t:0,o:1,h:1,l:1,c:1}];
  assert.equal(resample(bars, 1), bars);
});

test("resample: 5本の1分足を1本の5分足にまとめる", () => {
  const bars = [
    {t:0,      o:1,   h:2,   l:0,   c:1.5},
    {t:60000,  o:1.5, h:1.6, l:1.4, c:1.55},
    {t:120000, o:1.55,h:1.7, l:1.5, c:1.6},
    {t:180000, o:1.6, h:1.65,l:1.55,c:1.62},
    {t:240000, o:1.62,h:1.9, l:1.6, c:1.8},
    {t:300000, o:1.8, h:1.85,l:1.75,c:1.82},
  ];
  const out = resample(bars, 5);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], {t:0, o:1, h:2, l:0, c:1.8});
  assert.deepEqual(out[1], {t:300000, o:1.8, h:1.85, l:1.75, c:1.82});
});

test("pctSeries: 始点からの変化率系列を返す", () => {
  const bars = [{c:100},{c:110},{c:90}];
  const out = pctSeries(bars, 0, 3);
  assert.deepEqual(out, [0, 0.1, -0.1]);
});

test("znorm: 平均0・標準偏差1に正規化する", () => {
  const out = znorm([1,2,3]);
  const sd = Math.sqrt(2/3);
  closeTo(out[0], -1/sd);
  closeTo(out[1], 0);
  closeTo(out[2], 1/sd);
});

test("sdOf: 標準偏差を計算する", () => {
  closeTo(sdOf([1,2,3]), Math.sqrt(2/3));
});

test("dist: 二乗ユークリッド距離を計算する", () => {
  assert.equal(dist([0,0],[3,4]), 25);
});

test("maSeries: n本の単純移動平均を計算する(n-1本目までnull)", () => {
  const bars = [{c:1},{c:2},{c:3},{c:4},{c:5}];
  const out = maSeries(bars, 3);
  assert.deepEqual(out, [null, null, 2, 3, 4]);
});

test("trendDir: 価格がMA上・MAが上向きなら+1", () => {
  assert.equal(trendDir(10, 9, 8), 1);
});
test("trendDir: 価格がMA下・MAが下向きなら-1", () => {
  assert.equal(trendDir(9, 10, 11), -1);
});
test("trendDir: 方向感なしなら0", () => {
  assert.equal(trendDir(10, 10, 9), 0);
});
test("trendDir: MAが無ければnull", () => {
  assert.equal(trendDir(10, null, 9), null);
});

test("parseBin: SoAバイナリ形式(N=2)をM1配列にデコードする", () => {
  // フォーマット: [Int32 N][Int32×N minuteIndex][F32×N o][F32×N h][F32×N l][F32×N c]
  const n = 2;
  const buf = new ArrayBuffer(4 + n*20);
  const dv = new DataView(buf);
  let off = 0;
  dv.setInt32(off, n, true); off += 4;
  // minuteIndex (t = minuteIndex * 60000)
  dv.setInt32(off, 100000, true); off += 4;
  dv.setInt32(off, 100001, true); off += 4;
  // o, h, l, c は Float32 で丸め誤差なく往復する値を選ぶ(2進小数)
  const o = [1.5, 1.25], h = [1.75, 1.375], l = [1.125, 1.0], c = [1.625, 1.0625];
  for (const v of o){ dv.setFloat32(off, v, true); off += 4; }
  for (const v of h){ dv.setFloat32(off, v, true); off += 4; }
  for (const v of l){ dv.setFloat32(off, v, true); off += 4; }
  for (const v of c){ dv.setFloat32(off, v, true); off += 4; }

  const out = parseBin(buf);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], {t: 100000*60000, o: 1.5, h: 1.75, l: 1.125, c: 1.625});
  assert.deepEqual(out[1], {t: 100001*60000, o: 1.25, h: 1.375, l: 1, c: 1.0625});
});

test("parseBin: ヘッダ不正(N<=0)なら例外を投げる", () => {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setInt32(0, 0, true);
  assert.throws(() => parseBin(buf), /binヘッダ不正/);
});
