"use strict";

/* ============ IndexedDB 永続化 ============
   保存対象は M1(1分足)のみ。frames は M1 から resample() で再生成できる派生データなので保存不要。
   容量対策: オブジェクト配列(数十万〜百万件)ではなく Float64Array(1本=t,o,h,l,c の5値)を
   1レコード(ArrayBuffer)で保存する。構造化クローンが速く、1年約370k本でも約15MBに収まる。 */
const IDB_NAME = "scalpingLab", IDB_STORE = "data", IDB_KEY = "M1";

function idbOpen(){
  return new Promise((resolve, reject)=>{
    if (!window.indexedDB){ reject(new Error("IndexedDB非対応")); return; }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = ()=>{
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = ()=>resolve(req.result);
    req.onerror = ()=>reject(req.error);
  });
}
// M1(オブジェクト配列)→ Float64Array にパックして保存
export async function idbSaveM1(m1){
  const db = await idbOpen();
  const buf = new Float64Array(m1.length*5);
  for (let i=0;i<m1.length;i++){
    const b=m1[i], o=i*5;
    buf[o]=b.t; buf[o+1]=b.o; buf[o+2]=b.h; buf[o+3]=b.l; buf[o+4]=b.c;
  }
  await new Promise((resolve, reject)=>{
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put({n:m1.length, buf:buf.buffer}, IDB_KEY);
    tx.oncomplete = resolve;
    tx.onerror = ()=>reject(tx.error);
  });
  db.close();
}
// 保存済み Float64Array を M1(オブジェクト配列)に戻す。無ければ [] を返す
export async function idbLoadM1(){
  const db = await idbOpen();
  const rec = await new Promise((resolve, reject)=>{
    const tx = db.transaction(IDB_STORE, "readonly");
    const rq = tx.objectStore(IDB_STORE).get(IDB_KEY);
    rq.onsuccess = ()=>resolve(rq.result);
    rq.onerror = ()=>reject(rq.error);
  });
  db.close();
  if (!rec || !rec.buf) return [];
  const buf = new Float64Array(rec.buf), out = new Array(rec.n);
  for (let i=0;i<rec.n;i++){
    const o=i*5;
    out[i]={t:buf[o], o:buf[o+1], h:buf[o+2], l:buf[o+3], c:buf[o+4]};
  }
  return out;
}
export async function idbClearM1(){
  const db = await idbOpen();
  await new Promise((resolve, reject)=>{
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(IDB_KEY);
    tx.oncomplete = resolve;
    tx.onerror = ()=>reject(tx.error);
  });
  db.close();
}
