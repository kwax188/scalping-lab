"use strict";

export const $ = id => document.getElementById(id);
export const getWIN = () => +$("winSel").value;
export const getFWD = () => +$("fwdSel").value;

/* 全モジュールで共有する可変状態。
   ES modules の import 束縛は再代入できないため、各モジュールは
   `state.M1 = ...` のようにプロパティを書き換える形で状態を更新する。 */
export const state = {
  M1: [],
  frames: {},
  maCache: {},
  SLOTS: [],
  activeSlot: null,
};
