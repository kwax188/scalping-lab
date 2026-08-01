# コード分割 設計書 (2026-08-01)

## 背景・目的

`index.html`(約2000行)にHTML/CSS/JSが全て同居しており、今後の改善作業(パターン判定精度、UI/UXデザイン、パフォーマンス)を安全に並行して進められない。これらは全て同じ1ファイルを編集することになり、複数人・複数エージェントが同時に手を入れると変更が競合してしまう。

本設計は、**見た目や動作を一切変えずに**、コードをファイル単位で分割し、以降の改善作業を安全に分担できる土台を作ることを目的とする。

## スコープ外

- 見た目・挙動の変更(ピクセル単位で現状と同じであること)
- 新機能追加やロジックの改善(精度改善・UI刷新・パフォーマンス改善は別プロジェクトで扱う)
- `data/*.bin` および `manifest.json` の配置変更

## デプロイ方式

ビルドステップなし。ネイティブ ES Modules(`<script type="module">`)を使い、GitHub Pagesに現在のファイル群をそのまま置くだけの運用を維持する。

## ファイル構成

```
scalping-lab/
├── index.html            HTML骨格 + <link rel="stylesheet" href="style.css">
│                         + <script type="module" src="js/main.js">
├── style.css              現行 <style> ブロックをそのまま移設
├── js/
│   ├── state.js           共有状態(下記参照)を保持・公開するモジュール
│   ├── storage.js         IndexedDB永続化: idbOpen/idbSaveM1/idbLoadM1/idbClearM1
│   ├── data.js             CSV解析・リサンプル・統計関数:
│   │                      parseCSV, resample, pctSeries, znorm, sdOf, dist,
│   │                      maSeries, getMA25, trendDir, shotTrendDir
│   ├── pattern-search.js  類似検索・パターン判定:
│   │                      searchTop, zigzagAbs, atrOf, rangePos, maSideAt,
│   │                      topCtxOK, bottomCtxOK, clampAnchors, detectPatterns,
│   │                      backtestPattern
│   ├── image-extract.js   スクショ→ローソク足抽出:
│   │                      loadChartImage, extractCandles, reanalyzeLower,
│   │                      shotBars, analyzeShot
│   ├── render.js           canvas描画・DOM更新:
│   │                      drawShot, updateVerdict, updatePatList,
│   │                      updateGallery, setTrackHeight, galIndex, updateDots,
│   │                      wireCarousel, drawGalleryCanvases, drawMiniChart
│   └── main.js             アプリ起動・DOMイベント配線:
│                          rebuildFrames, updateDataUI, loadFiles, setActive,
│                          buildSlots, clearSlot, analyzeAllSlots, dev用UI配線
└── tests/
    └── *.test.js         node:test によるユニットテスト
```

**将来の分担マッピング(参考。今回の対象外):**
- `pattern-search.js` → 精度改善プロジェクト
- `render.js` + `style.css` → UI/UXプロジェクト
- `storage.js` + `data.js` → パフォーマンス改善プロジェクト

## 共有状態(state.js)

現状トップレベルの `let`/`const` で保持されているミュータブルな状態を `state.js` に集約する:

- `M1`(1分足の生データ配列)
- `frames`(時間足キー→CSV由来バー配列)
- `SLOTS` / `activeSlot`(6枠のUI状態)
- `galleryOpen`
- `maCache`
- `drawPts` / `drawing`(手書き注釈用)

他モジュールはこれらを直接の変数としてではなく、`state.js` からの named export(getter/setterまたは可変オブジェクトの参照)経由で読み書きする。これにより「どのモジュールが何の状態に依存しているか」が import 文を見れば分かるようにする。

## テスト戦略

DOM/canvasに依存しない純粋関数を対象に `node:test` + `assert`(追加npm依存なし)でユニットテストを書く:

- `data.js`: `parseCSV`, `resample`, `znorm`, `sdOf`, `dist`, `maSeries`, `trendDir`
- `pattern-search.js`: `zigzagAbs`, `atrOf`, `rangePos`, `maSideAt`, `topCtxOK`, `bottomCtxOK`

各関数について、分割前の `index.html` から抽出した入出力例をテストケース化し、リファクタ後も同じ結果を返すことを保証する。DOM/canvas依存部分(`image-extract.js`, `render.js`, `main.js`)は自動テスト対象外とし、ブラウザでの目視確認(スクショ読み込み→結果表示が分割前と一致するか)で担保する。

## 移行手順(実装計画で詳細化)

1. `style.css` を抽出し `index.html` からリンク
2. `state.js` を作成し、共有状態を洗い出して移す
3. DOM非依存モジュール(`data.js`, `pattern-search.js`, `storage.js`)から分割、同時にユニットテストを追加
4. DOM依存モジュール(`image-extract.js`, `render.js`, `main.js`)を分割
5. `index.html` の `<script>` を `<script type="module" src="js/main.js">` に置き換え
6. ブラウザで一通りの操作(データ読み込み→スクショ解析→ギャラリー表示)を行い、分割前と同じ結果になることを確認

## リスク・注意点

- 現状の関数は暗黙のグローバル変数への依存が多いため、分割時に依存漏れが起きやすい。`state.js` 経由に統一することで検出しやすくする。
- 画像解析(`extractCandles`)やcanvas描画はブラウザ環境が前提のため、Node側では動かせない。テストの対象外とし、ブラウザでの手動確認で補う。
