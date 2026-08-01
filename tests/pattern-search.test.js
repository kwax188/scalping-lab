import { test } from "node:test";
import assert from "node:assert/strict";
import { zigzagAbs, atrOf, rangePos, maSideAt, topCtxOK, bottomCtxOK } from "../js/pattern-search.js";

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
