/* netsocket: vendored GridStack UMD, syntax lowered to ES2019 via esbuild for legacy WebViews (Chromium 74 / Android 9 panel kiosks). After upgrading gridstack, regenerate with: npx esbuild <new gridstack-all.js> --target=es2019 --outfile=gridstack-all.js */
/*! For license information please see gridstack-all.js.LICENSE.txt */
!function(e, t) {
  "object" == typeof exports && "object" == typeof module ? module.exports = t() : "function" == typeof define && define.amd ? define([], t) : "object" == typeof exports ? exports.GridStack = t() : e.GridStack = t();
}(self, () => (() => {
  "use strict";
  var e = { d: (t2, i2) => {
    for (var s2 in i2) e.o(i2, s2) && !e.o(t2, s2) && Object.defineProperty(t2, s2, { enumerable: true, get: i2[s2] });
  }, o: (e2, t2) => Object.prototype.hasOwnProperty.call(e2, t2) }, t = {};
  e.d(t, { GridStack: () => z });
  class i {
    static getElements(e2, t2 = document) {
      if ("string" == typeof e2) {
        const i2 = "getElementById" in t2 ? t2 : void 0;
        if (i2 && !isNaN(+e2[0])) {
          const t3 = i2.getElementById(e2);
          return t3 ? [t3] : [];
        }
        let s2 = t2.querySelectorAll(e2);
        if (!s2.length && "." !== e2[0] && "#" !== e2[0] && (s2 = t2.querySelectorAll("." + e2), s2.length || (s2 = t2.querySelectorAll("#" + e2)), !s2.length)) {
          const i3 = t2.querySelector(`[gs-id="${e2}"]`);
          return i3 ? [i3] : [];
        }
        return Array.from(s2);
      }
      return [e2];
    }
    static getElement(e2, t2 = document) {
      if ("string" == typeof e2) {
        const i2 = "getElementById" in t2 ? t2 : void 0;
        if (!e2.length) return null;
        if (i2 && "#" === e2[0]) return i2.getElementById(e2.substring(1));
        if ("#" === e2[0] || "." === e2[0] || "[" === e2[0]) return t2.querySelector(e2);
        if (i2 && !isNaN(+e2[0])) return i2.getElementById(e2);
        let s2 = t2.querySelector(e2);
        return i2 && !s2 && (s2 = i2.getElementById(e2)), s2 || (s2 = t2.querySelector("." + e2)), s2;
      }
      return e2;
    }
    static lazyLoad(e2) {
      var _a, _b;
      return !!(e2.lazyLoad || ((_b = (_a = e2.grid) == null ? void 0 : _a.opts) == null ? void 0 : _b.lazyLoad) && false !== e2.lazyLoad);
    }
    static createDiv(e2, t2) {
      const i2 = document.createElement("div");
      return e2.forEach((e3) => {
        e3 && i2.classList.add(e3);
      }), t2 == null ? void 0 : t2.appendChild(i2), i2;
    }
    static shouldSizeToContent(e2, t2 = false) {
      return !(!(e2 == null ? void 0 : e2.grid) || !(t2 ? true === e2.sizeToContent || true === e2.grid.opts.sizeToContent && void 0 === e2.sizeToContent : e2.sizeToContent || e2.grid.opts.sizeToContent && false !== e2.sizeToContent));
    }
    static isIntercepted(e2, t2) {
      return !(e2.y >= t2.y + t2.h || e2.y + e2.h <= t2.y || e2.x + e2.w <= t2.x || e2.x >= t2.x + t2.w);
    }
    static isTouching(e2, t2) {
      return i.isIntercepted(e2, { x: t2.x - 0.5, y: t2.y - 0.5, w: t2.w + 1, h: t2.h + 1 });
    }
    static areaIntercept(e2, t2) {
      const i2 = e2.x > t2.x ? e2.x : t2.x, s2 = e2.x + e2.w < t2.x + t2.w ? e2.x + e2.w : t2.x + t2.w;
      if (s2 <= i2) return 0;
      const o2 = e2.y > t2.y ? e2.y : t2.y, n2 = e2.y + e2.h < t2.y + t2.h ? e2.y + e2.h : t2.y + t2.h;
      return n2 <= o2 ? 0 : (s2 - i2) * (n2 - o2);
    }
    static area(e2) {
      return e2.w * e2.h;
    }
    static sort(e2, t2 = 1) {
      const i2 = Number.MAX_SAFE_INTEGER;
      return e2.sort((e3, s2) => {
        var _a, _b, _c, _d;
        const o2 = t2 * (((_a = e3.y) != null ? _a : i2) - ((_b = s2.y) != null ? _b : i2));
        return 0 === o2 ? t2 * (((_c = e3.x) != null ? _c : i2) - ((_d = s2.x) != null ? _d : i2)) : o2;
      });
    }
    static find(e2, t2) {
      return t2 ? e2.find((e3) => e3.id === t2) : void 0;
    }
    static findInGrid(e2, t2, s2) {
      const o2 = e2.engine.nodes.find((e3) => String(e3.id) === t2);
      if (o2 || !s2) return o2;
      for (const s3 of e2.engine.nodes) if (s3.subGrid) {
        const e3 = i.findInGrid(s3.subGrid, t2);
        if (e3) return e3;
      }
    }
    static toBool(e2) {
      return "boolean" == typeof e2 ? e2 : "string" == typeof e2 ? !("" === (e2 = e2.toLowerCase()) || "no" === e2 || "false" === e2 || "0" === e2) : Boolean(e2);
    }
    static toNumber(e2) {
      return null === e2 || 0 === e2.length ? void 0 : Number(e2);
    }
    static parseHeight(e2) {
      let t2, i2 = "px";
      if ("string" == typeof e2) if ("auto" === e2 || "" === e2) t2 = 0;
      else {
        const s2 = e2.match(/^(-[0-9]+\.[0-9]+|[0-9]*\.[0-9]+|-[0-9]+|[0-9]+)(px|em|rem|vh|vw|%|cm|mm)?$/);
        if (!s2) throw new Error(`Invalid height val = ${e2}`);
        i2 = s2[2] || "px", t2 = parseFloat(s2[1]);
      }
      else t2 = e2;
      return { h: t2, unit: i2 };
    }
    static defaults(e2, ...t2) {
      return t2.forEach((t3) => {
        for (const s2 in t3) {
          if (!Object.prototype.hasOwnProperty.call(t3, s2)) return;
          null === e2[s2] || void 0 === e2[s2] ? e2[s2] = t3[s2] : "object" == typeof t3[s2] && "object" == typeof e2[s2] && i.defaults(e2[s2], t3[s2]);
        }
      }), e2;
    }
    static same(e2, t2) {
      if ("object" != typeof e2) return e2 == t2;
      if (typeof e2 != typeof t2) return false;
      const i2 = e2, s2 = t2;
      if (Object.keys(i2).length !== Object.keys(s2).length) return false;
      for (const e3 in i2) if (i2[e3] !== s2[e3]) return false;
      return true;
    }
    static copyPos(e2, t2, i2 = false) {
      return void 0 !== t2.x && (e2.x = t2.x), void 0 !== t2.y && (e2.y = t2.y), void 0 !== t2.w && (e2.w = t2.w), void 0 !== t2.h && (e2.h = t2.h), i2 && (t2.minW && (e2.minW = t2.minW), t2.minH && (e2.minH = t2.minH), t2.maxW && (e2.maxW = t2.maxW), t2.maxH && (e2.maxH = t2.maxH)), e2;
    }
    static samePos(e2, t2) {
      return e2 && t2 && e2.x === t2.x && e2.y === t2.y && (e2.w || 1) === (t2.w || 1) && (e2.h || 1) === (t2.h || 1);
    }
    static sanitizeMinMax(e2) {
      e2.minW || delete e2.minW, e2.minH || delete e2.minH, e2.maxW || delete e2.maxW, e2.maxH || delete e2.maxH;
    }
    static removeInternalAndSame(e2, t2) {
      if ("object" != typeof e2 || "object" != typeof t2) return;
      if (!e2 || !t2) return;
      if (Array.isArray(e2) || Array.isArray(t2)) return;
      const s2 = e2, o2 = t2;
      for (const e3 in s2) {
        const t3 = s2[e3], n2 = o2[e3];
        "_" === e3[0] || t3 === n2 ? delete s2[e3] : t3 && "object" == typeof t3 && void 0 !== n2 && (i.removeInternalAndSame(t3, n2), Object.keys(t3).length || delete s2[e3]);
      }
    }
    static removeInternalForSave(e2, t2 = true) {
      const i2 = e2;
      for (const e3 in i2) "_" !== e3[0] && null !== i2[e3] && void 0 !== i2[e3] || delete i2[e3];
      delete e2.grid, t2 && delete e2.el, e2.autoPosition || delete e2.autoPosition, e2.noResize || delete e2.noResize, e2.noMove || delete e2.noMove, e2.locked || delete e2.locked, 1 !== e2.w && e2.w !== e2.minW || delete e2.w, 1 !== e2.h && e2.h !== e2.minH || delete e2.h;
    }
    static throttle(e2, t2) {
      let i2 = false;
      return (...s2) => {
        i2 || (i2 = true, setTimeout(() => {
          e2(...s2), i2 = false;
        }, t2));
      };
    }
    static removePositioningStyles(e2) {
      const t2 = e2.style;
      t2.position && t2.removeProperty("position"), t2.left && t2.removeProperty("left"), t2.top && t2.removeProperty("top"), t2.width && t2.removeProperty("width"), t2.height && t2.removeProperty("height");
    }
    static getScrollElement(e2) {
      var _a;
      if (!e2) return document.scrollingElement || document.documentElement;
      const t2 = getComputedStyle(e2).overflowY;
      return ("auto" === t2 || "scroll" === t2) && e2.scrollHeight > e2.clientHeight ? e2 : i.getScrollElement((_a = e2.parentElement) != null ? _a : void 0);
    }
    static updateScrollResize(e2, t2, s2) {
      const o2 = i.getScrollElement(t2), n2 = o2.clientHeight, r2 = o2 === i.getScrollElement() ? 0 : o2.getBoundingClientRect().top, a2 = e2.clientY - r2, l2 = a2 > n2 - s2;
      a2 < s2 ? o2.scrollBy({ behavior: "smooth", top: a2 - s2 }) : l2 && o2.scrollBy({ behavior: "smooth", top: s2 - (n2 - a2) });
    }
    static pauseIframePointerEvents(e2) {
      document.querySelectorAll("iframe").forEach((t2) => {
        t2.style.pointerEvents = e2 ? "none" : "";
      });
    }
    static clone(e2) {
      return null == e2 || "object" != typeof e2 ? e2 : e2 instanceof Array ? [...e2] : { ...e2 };
    }
    static cloneDeep(e2) {
      const t2 = ["parentGrid", "el", "grid", "subGrid", "engine"], s2 = i.clone(e2);
      for (const o2 in s2) Object.prototype.hasOwnProperty.call(s2, o2) && "object" == typeof s2[o2] && "__" !== o2.substring(0, 2) && !t2.find((e3) => e3 === o2) && (s2[o2] = i.cloneDeep(e2[o2]));
      return s2;
    }
    static cloneNode(e2) {
      const t2 = e2.cloneNode(true);
      return t2.removeAttribute("id"), t2;
    }
    static appendTo(e2, t2) {
      let s2;
      s2 = "string" == typeof t2 ? i.getElement(t2) : t2, s2 && s2.appendChild(e2);
    }
    static addElStyles(e2, t2) {
      if (t2 instanceof Object) {
        const i2 = e2.style;
        for (const e3 in t2) Object.prototype.hasOwnProperty.call(t2, e3) && (Array.isArray(t2[e3]) ? t2[e3].forEach((t3) => {
          i2[e3] = t3;
        }) : i2[e3] = t2[e3]);
      }
    }
    static initEvent(e2, t2) {
      const i2 = { type: t2.type }, s2 = { button: 0, which: 0, buttons: 1, bubbles: true, cancelable: true, target: t2.target ? t2.target : e2.target }, o2 = e2;
      return ["altKey", "ctrlKey", "metaKey", "shiftKey"].forEach((e3) => i2[e3] = o2[e3]), ["pageX", "pageY", "clientX", "clientY", "screenX", "screenY"].forEach((e3) => i2[e3] = o2[e3]), { ...i2, ...s2 };
    }
    static simulateMouseEvent(e2, t2, i2) {
      var _a, _b, _c, _d;
      const s2 = e2, o2 = new MouseEvent(t2, { bubbles: true, composed: true, cancelable: true, view: window, detail: 1, screenX: e2.screenX, screenY: e2.screenY, clientX: e2.clientX, clientY: e2.clientY, ctrlKey: (_a = s2.ctrlKey) != null ? _a : false, altKey: (_b = s2.altKey) != null ? _b : false, shiftKey: (_c = s2.shiftKey) != null ? _c : false, metaKey: (_d = s2.metaKey) != null ? _d : false, button: 0, relatedTarget: e2.target });
      (i2 || e2.target).dispatchEvent(o2);
    }
    static getValuesFromTransformedElement(e2) {
      const t2 = document.createElement("div");
      i.addElStyles(t2, { opacity: "0", position: "fixed", top: "0px", left: "0px", width: "1px", height: "1px", zIndex: "-999999" }), e2.appendChild(t2);
      const s2 = t2.getBoundingClientRect();
      return e2.removeChild(t2), t2.remove(), { xScale: 1 / s2.width, yScale: 1 / s2.height, xOffset: s2.left, yOffset: s2.top };
    }
    static swap(e2, t2, i2) {
      if (!e2) return;
      const s2 = e2, o2 = s2[t2];
      s2[t2] = s2[i2], s2[i2] = o2;
    }
    static canBeRotated(e2) {
      var _a;
      return !(!e2 || e2.w === e2.h || e2.locked || e2.noResize || ((_a = e2.grid) == null ? void 0 : _a.opts.disableResize) || e2.minW && e2.minW === e2.maxW || e2.minH && e2.minH === e2.maxH);
    }
  }
  class s {
    constructor(e2 = {}) {
      var _a, _b, _c;
      this.addedNodes = [], this.removedNodes = [], this.defaultColumn = 12, this.column = e2.column || this.defaultColumn, this.column > this.defaultColumn && (this.defaultColumn = this.column), this.maxRow = (_a = e2.maxRow) != null ? _a : 0, this._float = (_b = e2.float) != null ? _b : false, this.nodes = e2.nodes || [], this.onChange = (_c = e2.onChange) != null ? _c : () => {
      };
    }
    batchUpdate(e2 = true, t2 = true) {
      var _a;
      return !!this.batchMode === e2 || (this.batchMode = e2, e2 ? (this._prevFloat = this._float, this._float = true, this.cleanNodes(), this.nodes.some((e3) => e3._updating) || this.saveInitial()) : (this._float = (_a = this._prevFloat) != null ? _a : false, delete this._prevFloat, t2 && this._packNodes(), this._notify())), this;
    }
    _useEntireRowArea(e2, t2) {
      return (!this.float || this.batchMode && !this._prevFloat) && !this._hasLocked && (!e2._moving || e2._skipDown || t2.y <= e2.y);
    }
    _fixCollisions(e2, t2 = e2, s2, o2 = {}) {
      if (this.sortNodes(-1), !(s2 = s2 || this.collide(e2, t2))) return false;
      if (e2._moving && !e2._isExternal && !o2.nested && !this.float && this.swap(e2, s2)) return true;
      let n2 = t2;
      !this._loading && this._useEntireRowArea(e2, t2) && (n2 = { x: 0, w: this.column, y: t2.y, h: t2.h }, s2 = this.collide(e2, n2, o2.skip));
      let r2 = false;
      const a2 = { nested: true, pack: false };
      let l2 = 0;
      for (; s2 = s2 || this.collide(e2, n2, o2.skip); ) {
        if (l2++ > 2 * this.nodes.length) throw new Error("Infinite collide check");
        let n3;
        if (s2.locked || this._loading || e2._moving && !e2._skipDown && t2.y > e2.y && !this.float && (!this.collide(s2, { ...s2, y: e2.y }, e2) || !this.collide(s2, { ...s2, y: t2.y - s2.h }, e2))) {
          e2._skipDown = e2._skipDown || t2.y > e2.y;
          const l3 = { ...t2, y: s2.y + s2.h, ...a2 };
          n3 = !(!this._loading || !i.samePos(e2, l3)) || this.moveNode(e2, l3), (s2.locked || this._loading) && n3 ? i.copyPos(t2, e2) : !s2.locked && n3 && o2.pack && (this._packNodes(), t2.y = s2.y + s2.h, i.copyPos(e2, t2)), r2 = r2 || n3;
        } else n3 = this.moveNode(s2, { ...s2, y: t2.y + t2.h, skip: e2, ...a2 });
        if (!n3) return r2;
        s2 = void 0;
      }
      return r2;
    }
    collide(e2, t2 = e2, s2) {
      const o2 = e2._id, n2 = s2 == null ? void 0 : s2._id;
      return this.nodes.find((e3) => e3._id !== o2 && e3._id !== n2 && i.isIntercepted(e3, t2));
    }
    collideAll(e2, t2 = e2, s2) {
      const o2 = e2._id, n2 = s2 == null ? void 0 : s2._id;
      return this.nodes.filter((e3) => e3._id !== o2 && e3._id !== n2 && i.isIntercepted(e3, t2));
    }
    directionCollideCoverage(e2, t2, i2) {
      if (!t2.rect || !e2._rect) return;
      const s2 = e2._rect, o2 = { ...t2.rect };
      let n2;
      o2.y > s2.y ? (o2.h = o2.h + o2.y - s2.y, o2.y = s2.y) : o2.h = o2.h + s2.y - o2.y, o2.x > s2.x ? (o2.w = o2.w + o2.x - s2.x, o2.x = s2.x) : o2.w = o2.w + s2.x - o2.x;
      let r2 = 0.5;
      for (const e3 of i2) {
        if (e3.locked || !e3._rect) continue;
        const t3 = e3._rect;
        let i3 = Number.MAX_VALUE, a2 = Number.MAX_VALUE;
        s2.y < t3.y ? i3 = (o2.y + o2.h - t3.y) / t3.h : s2.y + s2.h > t3.y + t3.h && (i3 = (t3.y + t3.h - o2.y) / t3.h), s2.x < t3.x ? a2 = (o2.x + o2.w - t3.x) / t3.w : s2.x + s2.w > t3.x + t3.w && (a2 = (t3.x + t3.w - o2.x) / t3.w);
        const l2 = Math.min(a2, i3);
        l2 > r2 && (r2 = l2, n2 = e3);
      }
      return t2.collide = n2, n2;
    }
    cacheRects(e2, t2, i2, s2, o2, n2) {
      return this.nodes.forEach((r2) => r2._rect = { y: r2.y * t2 + i2, x: r2.x * e2 + n2, w: r2.w * e2 - n2 - s2, h: r2.h * t2 - i2 - o2 }), this;
    }
    swap(e2, t2) {
      if (!t2 || t2.locked || !e2 || e2.locked) return false;
      function s2() {
        const i2 = t2.x, s3 = t2.y;
        return t2.x = e2.x, t2.y = e2.y, e2.h != t2.h ? (e2.x = i2, e2.y = t2.y + t2.h) : e2.w != t2.w ? (e2.x = t2.x + t2.w, e2.y = s3) : (e2.x = i2, e2.y = s3), e2._dirty = t2._dirty = true, true;
      }
      let o2;
      if (e2.w === t2.w && e2.h === t2.h && (e2.x === t2.x || e2.y === t2.y) && (o2 = i.isTouching(e2, t2))) return s2();
      if (false !== o2) {
        if (e2.w === t2.w && e2.x === t2.x && (o2 || (o2 = i.isTouching(e2, t2)))) {
          if (t2.y < e2.y) {
            const i2 = e2;
            e2 = t2, t2 = i2;
          }
          return s2();
        }
        if (false !== o2) {
          if (e2.h === t2.h && e2.y === t2.y && (o2 || (o2 = i.isTouching(e2, t2)))) {
            if (t2.x < e2.x) {
              const i2 = e2;
              e2 = t2, t2 = i2;
            }
            return s2();
          }
          return false;
        }
      }
    }
    isAreaEmpty(e2, t2, i2, s2) {
      const o2 = { x: e2 || 0, y: t2 || 0, w: i2 || 1, h: s2 || 1 };
      return !this.collide(o2);
    }
    compact(e2 = "compact", t2 = true) {
      if (0 === this.nodes.length) return this;
      t2 && this.sortNodes();
      const i2 = this.batchMode;
      i2 || this.batchUpdate();
      const s2 = this._inColumnResize;
      s2 || (this._inColumnResize = true);
      const o2 = this.nodes;
      return this.nodes = [], o2.forEach((t3, i3, s3) => {
        let o3;
        t3.locked || (t3.autoPosition = true, "list" === e2 && i3 && (o3 = s3[i3 - 1])), this.addNode(t3, false, o3);
      }), s2 || delete this._inColumnResize, i2 || this.batchUpdate(false), this;
    }
    set float(e2) {
      this._float !== e2 && (this._float = e2 || false, e2 || this._packNodes()._notify());
    }
    get float() {
      return this._float || false;
    }
    sortNodes(e2 = 1) {
      return this.nodes = i.sort(this.nodes, e2), this;
    }
    _packNodes() {
      return this.batchMode || (this.sortNodes(), this.float ? this.nodes.forEach((e2) => {
        if (e2._updating || void 0 === e2._orig || e2.y === e2._orig.y) return;
        let t2 = e2.y;
        for (; t2 > e2._orig.y; ) --t2, this.collide(e2, { x: e2.x, y: t2, w: e2.w, h: e2.h }) || (e2._dirty = true, e2.y = t2);
      }) : this.nodes.forEach((e2, t2) => {
        if (!e2.locked) for (; e2.y > 0; ) {
          const i2 = 0 === t2 ? 0 : e2.y - 1;
          if (0 !== t2 && this.collide(e2, { x: e2.x, y: i2, w: e2.w, h: e2.h })) break;
          e2._dirty = e2.y !== i2, e2.y = i2;
        }
      })), this;
    }
    prepareNode(e2, t2) {
      var _a;
      e2._id = (_a = e2._id) != null ? _a : s._idSeq++;
      const o2 = e2.id;
      if (o2) {
        let t3 = 1;
        for (; this.nodes.find((t4) => t4.id === e2.id && t4 !== e2); ) e2.id = o2 + "_" + t3++;
      }
      void 0 !== e2.x && void 0 !== e2.y && null !== e2.x && null !== e2.y || (e2.autoPosition = true);
      const n2 = { x: 0, y: 0, w: 1, h: 1 };
      return i.defaults(e2, n2), e2.autoPosition || delete e2.autoPosition, e2.noResize || delete e2.noResize, e2.noMove || delete e2.noMove, i.sanitizeMinMax(e2), "string" == typeof e2.x && (e2.x = Number(e2.x)), "string" == typeof e2.y && (e2.y = Number(e2.y)), "string" == typeof e2.w && (e2.w = Number(e2.w)), "string" == typeof e2.h && (e2.h = Number(e2.h)), isNaN(e2.x) && (e2.x = n2.x, e2.autoPosition = true), isNaN(e2.y) && (e2.y = n2.y, e2.autoPosition = true), isNaN(e2.w) && (e2.w = n2.w), isNaN(e2.h) && (e2.h = n2.h), this.nodeBoundFix(e2, t2), e2;
    }
    nodeBoundFix(e2, t2) {
      const s2 = e2._orig || i.copyPos({}, e2);
      if (e2.maxW && (e2.w = Math.min(e2.w || 1, e2.maxW)), e2.maxH && (e2.h = Math.min(e2.h || 1, e2.maxH)), e2.minW && (e2.w = Math.max(e2.w || 1, e2.minW)), e2.minH && (e2.h = Math.max(e2.h || 1, e2.minH)), (e2.x || 0) + (e2.w || 1) > this.column && this.column < this.defaultColumn && !this._inColumnResize && !this.skipCacheUpdate && null != e2._id && -1 === this.findCacheLayout(e2, this.defaultColumn)) {
        const t3 = { ...e2 };
        t3.autoPosition || void 0 === t3.x ? (delete t3.x, delete t3.y) : t3.x = Math.min(this.defaultColumn - 1, t3.x), t3.w = Math.min(this.defaultColumn, t3.w || 1), this.cacheOneLayout(t3, this.defaultColumn);
      }
      return e2.w > this.column ? e2.w = this.column : e2.w < 1 && (e2.w = 1), this.maxRow && e2.h > this.maxRow ? e2.h = this.maxRow : e2.h < 1 && (e2.h = 1), e2.x < 0 && (e2.x = 0), e2.y < 0 && (e2.y = 0), e2.x + e2.w > this.column && (t2 ? e2.w = this.column - e2.x : e2.x = this.column - e2.w), this.maxRow && e2.y + e2.h > this.maxRow && (t2 ? e2.h = this.maxRow - e2.y : e2.y = this.maxRow - e2.h), i.samePos(e2, s2) || (e2._dirty = true), this;
    }
    getDirtyNodes(e2) {
      return e2 ? this.nodes.filter((e3) => e3._dirty && e3._orig && !i.samePos(e3, e3._orig)) : this.nodes.filter((e3) => e3._dirty);
    }
    _notify(e2) {
      if (this.batchMode || !this.onChange) return this;
      const t2 = (e2 || []).concat(this.getDirtyNodes());
      return this.onChange(t2), this;
    }
    cleanNodes() {
      return this.batchMode || this.nodes.forEach((e2) => {
        delete e2._dirty, delete e2._lastTried;
      }), this;
    }
    saveInitial() {
      return this.nodes.forEach((e2) => {
        e2._orig = i.copyPos({}, e2), delete e2._dirty;
      }), this._hasLocked = this.nodes.some((e2) => e2.locked), this;
    }
    restoreInitial() {
      return this.nodes.forEach((e2) => {
        e2._orig && !i.samePos(e2, e2._orig) && (i.copyPos(e2, e2._orig), e2._dirty = true);
      }), this._notify(), this;
    }
    findEmptyPosition(e2, t2 = this.nodes, s2 = this.column, o2) {
      let n2 = false;
      for (let r2 = o2 ? o2.y * s2 + (o2.x + o2.w) : 0; !n2; ++r2) {
        const o3 = r2 % s2, a2 = Math.floor(r2 / s2);
        if (o3 + e2.w > s2) continue;
        const l2 = { x: o3, y: a2, w: e2.w, h: e2.h };
        t2.find((e3) => i.isIntercepted(l2, e3)) || (e2.x === o3 && e2.y === a2 || (e2._dirty = true), e2.x = o3, e2.y = a2, delete e2.autoPosition, n2 = true);
      }
      return n2;
    }
    addNode(e2, t2 = false, i2) {
      const s2 = this.nodes.find((t3) => t3._id === e2._id);
      if (s2) return s2;
      this._inColumnResize ? this.nodeBoundFix(e2) : this.prepareNode(e2), delete e2._temporaryRemoved, delete e2._removeDOM;
      let o2 = false;
      return e2.autoPosition && this.findEmptyPosition(e2, this.nodes, this.column, i2) && (delete e2.autoPosition, o2 = true), this.nodes.push(e2), t2 && this.addedNodes.push(e2), o2 || this._fixCollisions(e2), this.batchMode || this._packNodes()._notify(), e2;
    }
    removeNode(e2, t2 = true, i2 = false) {
      return this.nodes.find((t3) => t3._id === e2._id) ? (i2 && this.removedNodes.push(e2), t2 && (e2._removeDOM = true), this.nodes = this.nodes.filter((t3) => t3._id !== e2._id), e2._isAboutToRemove || this._packNodes(), this._notify([e2]), this) : this;
    }
    removeAll(e2 = true, t2 = true) {
      if (delete this._layouts, !this.nodes.length) return this;
      e2 && this.nodes.forEach((e3) => e3._removeDOM = true);
      const i2 = this.nodes;
      return this.removedNodes = t2 ? i2 : [], this.nodes = [], this._notify(i2);
    }
    moveNodeCheck(e2, t2) {
      var _a;
      if (!this.changedPosConstrain(e2, t2)) return false;
      if (t2.pack = true, !this.maxRow) return this.moveNode(e2, t2);
      let o2;
      const n2 = new s({ column: this.column, float: this.float, nodes: this.nodes.map((t3) => t3._id === e2._id ? (o2 = { ...t3 }, o2) : { ...t3 }) });
      if (!o2) return false;
      const r2 = n2.moveNode(o2, t2) && n2.getRow() <= Math.max(this.getRow(), this.maxRow);
      if (!r2 && !t2.resizing && t2.collide && !e2._isExternal) {
        const i2 = (_a = t2.collide.el) == null ? void 0 : _a.gridstackNode;
        if (i2 && this.swap(e2, i2)) return this._notify(), true;
      }
      return !!r2 && (n2.nodes.filter((e3) => e3._dirty).forEach((e3) => {
        const t3 = this.nodes.find((t4) => t4._id === e3._id);
        t3 && (i.copyPos(t3, e3), t3._dirty = true);
      }), this._notify(), true);
    }
    willItFit(e2) {
      if (delete e2._willFitPos, !this.maxRow) return true;
      const t2 = new s({ column: this.column, float: this.float, nodes: this.nodes.map((e3) => ({ ...e3 })) }), o2 = { ...e2 };
      return this.cleanupNode(o2), delete o2.el, delete o2._id, delete o2.content, delete o2.grid, t2.addNode(o2), t2.getRow() <= this.maxRow && (e2._willFitPos = i.copyPos({}, o2), true);
    }
    changedPosConstrain(e2, t2) {
      return t2.w = t2.w || e2.w, t2.h = t2.h || e2.h, e2.x !== t2.x || e2.y !== t2.y || (e2.maxW && (t2.w = Math.min(t2.w, e2.maxW)), e2.maxH && (t2.h = Math.min(t2.h, e2.maxH)), e2.minW && (t2.w = Math.max(t2.w, e2.minW)), e2.minH && (t2.h = Math.max(t2.h, e2.minH)), e2.w !== t2.w || e2.h !== t2.h);
    }
    moveNode(e2, t2) {
      var _a, _b;
      if (!e2 || !t2) return false;
      let s2 = false;
      void 0 !== t2.pack || this.batchMode || (s2 = t2.pack = true), "number" != typeof t2.x && (t2.x = e2.x), "number" != typeof t2.y && (t2.y = e2.y), "number" != typeof t2.w && (t2.w = e2.w), "number" != typeof t2.h && (t2.h = e2.h);
      const o2 = e2.w !== t2.w || e2.h !== t2.h, n2 = i.copyPos({}, e2, true);
      if (i.copyPos(n2, t2), this.nodeBoundFix(n2, o2), i.copyPos(t2, n2), !t2.forceCollide && i.samePos(e2, t2)) return false;
      const r2 = i.copyPos({}, e2), a2 = this.collideAll(e2, n2, t2.skip);
      let l2 = true;
      if (a2.length) {
        const o3 = e2._moving && !t2.nested;
        let r3 = o3 ? this.directionCollideCoverage(e2, t2, a2) : a2[0];
        if (o3 && r3 && ((_b = (_a = e2.grid) == null ? void 0 : _a.opts) == null ? void 0 : _b.subGridDynamic) && !e2.grid._isTemp) {
          const s3 = i.areaIntercept(t2.rect, r3._rect), o4 = i.area(t2.rect), n3 = i.area(r3._rect);
          s3 / (o4 < n3 ? o4 : n3) > 0.8 && (r3.grid.makeSubGrid(r3.el, void 0, e2), r3 = void 0);
        }
        r3 ? l2 = !this._fixCollisions(e2, n2, r3, t2) : (l2 = false, s2 && delete t2.pack);
      }
      return l2 && !i.samePos(e2, n2) && (e2._dirty = true, i.copyPos(e2, n2)), t2.pack && this._packNodes()._notify(), !i.samePos(e2, r2);
    }
    getRow() {
      return this.nodes.reduce((e2, t2) => Math.max(e2, t2.y + t2.h), 0);
    }
    beginUpdate(e2) {
      return e2._updating || (e2._updating = true, delete e2._skipDown, this.batchMode || this.saveInitial()), this;
    }
    endUpdate() {
      const e2 = this.nodes.find((e3) => e3._updating);
      return e2 && (delete e2._updating, delete e2._skipDown), this;
    }
    save(e2 = true, t2, s2) {
      var _a;
      const o2 = ((_a = this._layouts) == null ? void 0 : _a.length) || 0;
      let n2;
      o2 && (s2 ? s2 !== this.column && (n2 = this._layouts[s2]) : this.column !== o2 - 1 && (n2 = this._layouts[o2 - 1]));
      const r2 = [];
      return this.sortNodes(), this.nodes.forEach((s3) => {
        const o3 = n2 == null ? void 0 : n2.find((e3) => e3._id === s3._id), a2 = { ...s3, ...o3 || {} };
        i.removeInternalForSave(a2, !e2), t2 && t2(s3, a2), r2.push(a2);
      }), r2;
    }
    layoutsNodesChange(e2) {
      return !this._layouts || this._inColumnResize || this._layouts.forEach((t2, i2) => {
        if (t2 && i2 !== this.column) if (i2 < this.column) this._layouts[i2] = void 0;
        else {
          const s2 = i2 / this.column;
          e2.forEach((e3) => {
            if (!e3._orig) return;
            const i3 = t2.find((t3) => t3._id === e3._id);
            i3 && (i3.y >= 0 && e3.y !== e3._orig.y && (i3.y = i3.y + (e3.y - e3._orig.y), i3.y < 0 && (i3.y = 0)), e3.x !== e3._orig.x && (i3.x = Math.round(e3.x * s2), i3.x < 0 && (i3.x = 0)), e3.w !== e3._orig.w && (i3.w = Math.round(e3.w * s2), i3.w < 1 && (i3.w = 1)));
          });
        }
      }), this;
    }
    columnChanged(e2, t2, s2 = "moveScale") {
      var _a;
      if (!this.nodes.length || !t2 || e2 === t2) return this;
      const o2 = "compact" === s2 || "list" === s2;
      o2 && this.sortNodes(1), t2 < e2 && this.cacheLayout(this.nodes, e2), this.batchUpdate();
      let n2 = [], r2 = o2 ? this.nodes : i.sort(this.nodes, -1);
      if (t2 > e2 && this._layouts) {
        const i2 = this._layouts[t2] || [], s3 = this._layouts.length - 1;
        !i2.length && e2 !== s3 && ((_a = this._layouts[s3]) == null ? void 0 : _a.length) && (e2 = s3, this._layouts[s3].forEach((e3) => {
          var _a2, _b, _c;
          const t3 = r2.find((t4) => t4._id === e3._id);
          t3 && (o2 || e3.autoPosition || (t3.x = (_a2 = e3.x) != null ? _a2 : t3.x, t3.y = (_b = e3.y) != null ? _b : t3.y), t3.w = (_c = e3.w) != null ? _c : t3.w, null != e3.x && void 0 !== e3.y || (t3.autoPosition = true));
        })), i2.forEach((e3) => {
          var _a2, _b, _c;
          const t3 = r2.findIndex((t4) => t4._id === e3._id);
          if (-1 !== t3) {
            const i3 = r2[t3];
            if (o2) return void (i3.w = e3.w);
            (e3.autoPosition || isNaN(e3.x) || isNaN(e3.y)) && this.findEmptyPosition(e3, n2), e3.autoPosition || (i3.x = (_a2 = e3.x) != null ? _a2 : i3.x, i3.y = (_b = e3.y) != null ? _b : i3.y, i3.w = (_c = e3.w) != null ? _c : i3.w, n2.push(i3)), r2.splice(t3, 1);
          }
        });
      }
      if (o2) this.compact(s2, false);
      else {
        if (r2.length) if ("function" == typeof s2) s2(t2, e2, n2, r2);
        else {
          const i2 = o2 || "none" === s2 ? 1 : t2 / e2, a2 = "move" === s2 || "moveScale" === s2, l2 = "scale" === s2 || "moveScale" === s2;
          r2.forEach((s3) => {
            s3.x = 1 === t2 ? 0 : a2 ? Math.round(s3.x * i2) : Math.min(s3.x, t2 - 1), s3.w = 1 === t2 || 1 === e2 ? 1 : l2 ? Math.round(s3.w * i2) || 1 : Math.min(s3.w, t2), n2.push(s3);
          }), r2 = [];
        }
        n2 = i.sort(n2, -1), this._inColumnResize = true, this.nodes = [], n2.forEach((e3) => {
          this.addNode(e3, false), delete e3._orig;
        });
      }
      return this.nodes.forEach((e3) => delete e3._orig), this.batchUpdate(false, !o2), delete this._inColumnResize, this;
    }
    cacheLayout(e2, t2, i2 = false) {
      const o2 = [];
      return e2.forEach((e3, t3) => {
        var _a;
        if (void 0 === e3._id) {
          const t4 = e3.id ? this.nodes.find((t5) => t5.id === e3.id) : void 0;
          e3._id = (_a = t4 == null ? void 0 : t4._id) != null ? _a : s._idSeq++;
        }
        o2[t3] = { x: e3.x, y: e3.y, w: e3.w, _id: e3._id };
      }), this._layouts = i2 ? [] : this._layouts || [], this._layouts[t2] = o2, this;
    }
    cacheOneLayout(e2, t2) {
      var _a;
      e2._id = (_a = e2._id) != null ? _a : s._idSeq++;
      const i2 = { x: e2.x, y: e2.y, w: e2.w, _id: e2._id };
      (e2.autoPosition || void 0 === e2.x) && (delete i2.x, delete i2.y, e2.autoPosition && (i2.autoPosition = true)), this._layouts = this._layouts || [], this._layouts[t2] = this._layouts[t2] || [];
      const o2 = this.findCacheLayout(e2, t2);
      return -1 === o2 ? this._layouts[t2].push(i2) : this._layouts[t2][o2] = i2, this;
    }
    findCacheLayout(e2, t2) {
      var _a, _b, _c;
      return (_c = (_b = (_a = this._layouts) == null ? void 0 : _a[t2]) == null ? void 0 : _b.findIndex((t3) => t3._id === e2._id)) != null ? _c : -1;
    }
    removeNodeFromLayoutCache(e2) {
      if (this._layouts) for (let t2 = 0; t2 < this._layouts.length; t2++) {
        const i2 = this.findCacheLayout(e2, t2);
        -1 !== i2 && this._layouts[t2].splice(i2, 1);
      }
    }
    cleanupNode(e2) {
      const t2 = e2;
      for (const e3 in t2) "_" === e3[0] && "_id" !== e3 && delete t2[e3];
      return this;
    }
  }
  s._idSeq = 0;
  const o = { alwaysShowResizeHandle: "mobile", animate: true, auto: true, cellHeight: "auto", cellHeightThrottle: 100, cellHeightUnit: "px", column: 12, draggable: { handle: ".grid-stack-item-content", appendTo: "body", scroll: true }, handle: ".grid-stack-item-content", itemClass: "grid-stack-item", margin: 10, marginUnit: "px", maxRow: 0, minRow: 0, placeholderClass: "grid-stack-placeholder", placeholderText: "", removableOptions: { accept: "grid-stack-item", decline: "grid-stack-non-removable" }, resizable: { handles: "se" }, rtl: "auto" };
  class n {
  }
  const r = "undefined" != typeof window && "undefined" != typeof document && ("ontouchstart" in document || "ontouchstart" in window || window.DocumentTouch && document instanceof window.DocumentTouch || navigator.maxTouchPoints > 0 && window.matchMedia("(any-pointer: coarse)").matches || navigator.msMaxTouchPoints > 0);
  class a {
  }
  function l(e2) {
    e2.preventDefault();
  }
  function h() {
    document.removeEventListener("contextmenu", l, true), document.removeEventListener("selectstart", l, true);
  }
  function d(e2, t2, i2) {
    e2.removeEventListener("touchmove", t2), e2.removeEventListener("touchend", i2), e2.removeEventListener("touchcancel", i2), c();
  }
  function c() {
    a.touchDelayTimer && (window.clearTimeout(a.touchDelayTimer), delete a.touchDelayTimer), h();
  }
  function g(e2, t2) {
    e2.touches.length > 1 || (e2.cancelable && e2.preventDefault(), i.simulateMouseEvent(e2.changedTouches[0], t2));
  }
  function u(e2, t2) {
    e2.cancelable && e2.preventDefault(), i.simulateMouseEvent(e2, t2);
  }
  function p(e2) {
    if (a.touchHandled) return;
    const t2 = e2.currentTarget, i2 = e2.touches[0].clientX, s2 = e2.touches[0].clientY, o2 = () => d(t2, n2, o2), n2 = (e3) => {
      const t3 = e3.touches[0];
      Math.abs(t3.clientX - i2) + Math.abs(t3.clientY - s2) > 10 && o2();
    };
    t2.addEventListener("touchmove", n2, { passive: true }), t2.addEventListener("touchend", o2, { passive: true }), t2.addEventListener("touchcancel", o2, { passive: true }), a.touchDelayTimer = window.setTimeout(() => {
      d(t2, n2, o2), a.touchHandled = true, a.wasDelayed = true, document.addEventListener("contextmenu", l, true), document.addEventListener("selectstart", l, true), g(e2, "mousedown"), delete a.wasDelayed;
    }, 300);
  }
  function m(e2) {
    a.touchHandled && g(e2, "mousemove");
  }
  function f(e2) {
    if (!a.touchHandled) return;
    h(), a.pointerLeaveTimeout && (window.clearTimeout(a.pointerLeaveTimeout), delete a.pointerLeaveTimeout);
    const t2 = !!n.dragElement;
    g(e2, "mouseup"), t2 || "touchcancel" === e2.type || g(e2, "click"), a.touchHandled = false;
  }
  function v(e2) {
    "mouse" !== e2.pointerType && e2.target.releasePointerCapture(e2.pointerId);
  }
  function _(e2) {
    n.dragElement && "mouse" !== e2.pointerType && u(e2, "mouseenter");
  }
  function y(e2) {
    n.dragElement && "mouse" !== e2.pointerType && (a.pointerLeaveTimeout = window.setTimeout(() => {
      delete a.pointerLeaveTimeout, u(e2, "mouseleave");
    }, 10));
  }
  class b {
    constructor(e2, t2, i2) {
      this.host = e2, this.dir = t2, this.option = i2, this._mouseDown = this._mouseDown.bind(this), this._mouseMove = this._mouseMove.bind(this), this._mouseUp = this._mouseUp.bind(this), this._keyEvent = this._keyEvent.bind(this), this._init();
    }
    _init() {
      if (this.option.element) try {
        this.el = this.option.element instanceof HTMLElement ? this.option.element : this.host.querySelector(this.option.element);
      } catch (e2) {
        this.option.element = void 0, console.error("Query for resizeable handle failed, falling back", e2);
      }
      return this.el || (this.el = document.createElement("div"), this.host.appendChild(this.el)), this.el.classList.add("ui-resizable-handle"), this.el.classList.add(`${b.prefix}${this.dir}`), this.el.addEventListener("mousedown", this._mouseDown), r && (this.el.addEventListener("touchstart", p), this.el.addEventListener("pointerdown", v)), this;
    }
    destroy() {
      return this.mouseDownEvent && this._mouseUp(this.mouseDownEvent), c(), this.el.removeEventListener("mousedown", this._mouseDown), r && (this.el.removeEventListener("touchstart", p), this.el.removeEventListener("pointerdown", v)), this.option.element || this.host.removeChild(this.el), this;
    }
    _mouseDown(e2) {
      this.mouseDownEvent = e2, document.addEventListener("mousemove", this._mouseMove, { capture: true, passive: true }), document.addEventListener("mouseup", this._mouseUp, true), r && (this.el.addEventListener("touchmove", m), this.el.addEventListener("touchend", f), this.el.addEventListener("touchcancel", f)), a.wasDelayed && this.el.classList.add("ui-resizable-armed"), e2.stopPropagation(), e2.preventDefault();
    }
    _mouseMove(e2) {
      const t2 = this.mouseDownEvent;
      this.moving ? this._triggerEvent("move", e2) : Math.abs(e2.x - t2.x) + Math.abs(e2.y - t2.y) > 2 && (this.moving = true, this.el.classList.remove("ui-resizable-armed"), this._triggerEvent("start", this.mouseDownEvent), this._triggerEvent("move", e2), document.addEventListener("keydown", this._keyEvent)), e2.stopPropagation();
    }
    _mouseUp(e2) {
      this.moving && (this._triggerEvent("stop", e2), document.removeEventListener("keydown", this._keyEvent)), this.el.classList.remove("ui-resizable-armed"), document.removeEventListener("mousemove", this._mouseMove, true), document.removeEventListener("mouseup", this._mouseUp, true), r && (this.el.removeEventListener("touchmove", m), this.el.removeEventListener("touchend", f), this.el.removeEventListener("touchcancel", f)), delete this.moving, delete this.mouseDownEvent, e2.stopPropagation(), e2.preventDefault();
    }
    _keyEvent(e2) {
      var _a, _b;
      "Escape" === e2.key && ((_b = (_a = this.host.gridstackNode) == null ? void 0 : _a.grid) == null ? void 0 : _b.engine.restoreInitial(), this._mouseUp(this.mouseDownEvent));
    }
    _triggerEvent(e2, t2) {
      const i2 = this.option;
      return i2[e2] && i2[e2](t2), this;
    }
  }
  b.prefix = "ui-resizable-";
  class E {
    constructor() {
      this._eventRegister = {};
    }
    get disabled() {
      return this._disabled;
    }
    on(e2, t2) {
      this._eventRegister[e2] = t2;
    }
    off(e2) {
      delete this._eventRegister[e2];
    }
    enable() {
      this._disabled = false;
    }
    disable() {
      this._disabled = true;
    }
    destroy() {
      this._eventRegister = {};
    }
    triggerEvent(e2, t2) {
      if (!this.disabled && this._eventRegister[e2]) return this._eventRegister[e2](t2);
    }
  }
  class w extends E {
    constructor(e2, t2 = {}) {
      super(), this.el = e2, this.option = t2, this.rectScale = { x: 1, y: 1 }, this._ui = () => {
        const e3 = this.el.parentElement.getBoundingClientRect(), t3 = { width: this.originalRect.width, height: this.originalRect.height + this.scrolled, left: this.originalRect.left, right: this.originalRect.right, top: this.originalRect.top - this.scrolled }, i2 = this.temporalRect || t3;
        return { position: { left: this.option.rtl ? (e3.right - i2.right) * this.rectScale.x : (i2.left - e3.left) * this.rectScale.x, top: (i2.top - e3.top) * this.rectScale.y }, size: { width: i2.width * this.rectScale.x, height: i2.height * this.rectScale.y } };
      }, this._mouseOver = this._mouseOver.bind(this), this._mouseOut = this._mouseOut.bind(this), this.enable(), this._setupAutoHide(!!this.option.autoHide), this._setupHandlers();
    }
    on(e2, t2) {
      super.on(e2, t2);
    }
    off(e2) {
      super.off(e2);
    }
    enable() {
      super.enable(), this.el.classList.remove("ui-resizable-disabled"), this._setupAutoHide(!!this.option.autoHide);
    }
    disable() {
      super.disable(), this.el.classList.add("ui-resizable-disabled"), this._setupAutoHide(false);
    }
    destroy() {
      this._removeHandlers(), this._setupAutoHide(false), delete this.el, super.destroy();
    }
    updateOption(e2) {
      const t2 = e2.handles && e2.handles !== this.option.handles, i2 = e2.autoHide && e2.autoHide !== this.option.autoHide;
      return Object.assign(this.option, e2), t2 && (this._removeHandlers(), this._setupHandlers()), i2 && this._setupAutoHide(!!this.option.autoHide), this;
    }
    _setupAutoHide(e2) {
      return e2 ? (this.el.classList.add("ui-resizable-autohide"), this.el.addEventListener("mouseover", this._mouseOver), this.el.addEventListener("mouseout", this._mouseOut)) : (this.el.classList.remove("ui-resizable-autohide"), this.el.removeEventListener("mouseover", this._mouseOver), this.el.removeEventListener("mouseout", this._mouseOut), n.overResizeElement === this && delete n.overResizeElement), this;
    }
    _mouseOver(e2) {
      n.overResizeElement || n.dragElement || (n.overResizeElement = this, this.el.classList.remove("ui-resizable-autohide"));
    }
    _mouseOut(e2) {
      n.overResizeElement === this && (delete n.overResizeElement, this.el.classList.add("ui-resizable-autohide"));
    }
    _setupHandlers() {
      var _a;
      return this.handlers = ((_a = this.option.handles) != null ? _a : "se").split(",").map((e2) => e2.trim()).map((e2) => new b(this.el, e2, { element: this.option.element, start: (e3) => this._resizeStart(e3), stop: (e3) => this._resizeStop(e3), move: (t2) => this._resizing(t2, e2) })), this;
    }
    _resizeStart(e2) {
      this.sizeToContent = i.shouldSizeToContent(this.el.gridstackNode, true), this.originalRect = this.el.getBoundingClientRect(), this.scrollEl = i.getScrollElement(this.el), this.scrollY = this.scrollEl.scrollTop, this.scrolled = 0, this.startEvent = e2, i.pauseIframePointerEvents(true), this._setupHelper(), this._applyChange();
      const t2 = i.initEvent(e2, { type: "resizestart", target: this.el });
      return this.option.start && this.option.start(t2, this._ui()), this.el.classList.add("ui-resizable-resizing"), this.triggerEvent("resizestart", t2), this;
    }
    _resizing(e2, t2) {
      this.scrolled = this.scrollEl.scrollTop - this.scrollY, this.temporalRect = this._getChange(e2, t2), this._applyChange();
      const s2 = i.initEvent(e2, { type: "resize", target: this.el });
      return s2.resizeDir = t2, s2.hasMovedX = this.option.rtl ? t2.includes("e") : t2.includes("w"), s2.hasMovedY = t2.includes("n"), this.option.resize && this.option.resize(s2, this._ui()), this.triggerEvent("resize", s2), this;
    }
    _resizeStop(e2) {
      const t2 = i.initEvent(e2, { type: "resizestop", target: this.el });
      return i.pauseIframePointerEvents(false), this._cleanHelper(), this.option.stop && this.option.stop(t2), this.el.classList.remove("ui-resizable-resizing"), this.triggerEvent("resizestop", t2), delete this.startEvent, delete this.originalRect, delete this.temporalRect, delete this.scrollY, delete this.scrolled, this;
    }
    _setupHelper() {
      this.elOriginStyleVal = w._originStyleProp.map((e3) => this.el.style[e3]);
      const e2 = this.el.parentElement;
      this.parentOriginStylePosition = e2.style.position;
      const t2 = i.getValuesFromTransformedElement(e2);
      return this.rectScale = { x: t2.xScale, y: t2.yScale }, getComputedStyle(e2).position.match(/static/) && (e2.style.position = "relative"), this.el.style.position = "absolute", this.el.style.opacity = "0.8", this;
    }
    _cleanHelper() {
      return w._originStyleProp.forEach((e2, t2) => {
        this.el.style[e2] = this.elOriginStyleVal[t2] || null;
      }), this.el.parentElement.style.position = this.parentOriginStylePosition || null, this;
    }
    _getChange(e2, t2) {
      const i2 = this.startEvent, s2 = { width: this.originalRect.width, height: this.originalRect.height + this.scrolled, left: this.originalRect.left, right: this.originalRect.right, top: this.originalRect.top - this.scrolled }, o2 = e2.clientX - i2.clientX, n2 = this.sizeToContent ? 0 : e2.clientY - i2.clientY;
      let r2 = false, a2 = false;
      const l2 = this.option.rtl;
      !l2 && t2.indexOf("e") > -1 ? s2.width += o2 : l2 && t2.indexOf("w") > -1 ? s2.width -= o2 : !l2 && t2.indexOf("w") > -1 ? (s2.width -= o2, s2.left += o2, r2 = true) : l2 && t2.indexOf("e") > -1 && (s2.width += o2, s2.right += o2, r2 = true), t2.indexOf("s") > -1 ? s2.height += n2 : t2.indexOf("n") > -1 && (s2.height -= n2, s2.top += n2, a2 = true);
      const h2 = this._constrainSize(s2.width, s2.height, r2, a2);
      return Math.round(s2.width) !== Math.round(h2.width) && (!l2 && t2.indexOf("w") > -1 ? s2.left += s2.width - h2.width : l2 && t2.indexOf("e") > -1 && (s2.right -= s2.width - h2.width), s2.width = h2.width), Math.round(s2.height) !== Math.round(h2.height) && (t2.indexOf("n") > -1 && (s2.top += s2.height - h2.height), s2.height = h2.height), s2;
    }
    _constrainSize(e2, t2, i2, s2) {
      var _a, _b;
      const o2 = this.option, n2 = (i2 ? o2.maxWidthMoveLeft : o2.maxWidth) || Number.MAX_SAFE_INTEGER, r2 = ((_a = o2.minWidth) != null ? _a : 0) / this.rectScale.x || e2, a2 = (s2 ? o2.maxHeightMoveUp : o2.maxHeight) || Number.MAX_SAFE_INTEGER, l2 = ((_b = o2.minHeight) != null ? _b : 0) / this.rectScale.y || t2;
      return { width: Math.min(n2, Math.max(r2, e2)), height: Math.min(a2, Math.max(l2, t2)) };
    }
    _applyChange() {
      let e2 = { left: 0, right: 0, top: 0, width: 0, height: 0 };
      if ("absolute" === this.el.style.position) {
        const t3 = this.el.parentElement, { left: i2, right: s2, top: o2 } = t3.getBoundingClientRect();
        e2 = { left: i2, right: s2, top: o2, width: 0, height: 0 };
      }
      if (!this.temporalRect) return this;
      const t2 = e2;
      return Object.entries(this.temporalRect).forEach(([i2, s2]) => {
        if (this.option.rtl ? "left" === i2 : "right" === i2) return;
        const o2 = "width" === i2 || "left" === i2 || "right" === i2 ? this.rectScale.x : "height" === i2 || "top" === i2 ? this.rectScale.y : 1;
        let n2;
        n2 = "right" === i2 ? (e2.right - s2) * this.rectScale.x + "px" : (s2 - t2[i2]) * o2 + "px", this.el.style[i2] = n2;
      }), this;
    }
    _removeHandlers() {
      return this.handlers.forEach((e2) => e2.destroy()), delete this.handlers, this;
    }
  }
  w._originStyleProp = ["width", "height", "position", "left", "right", "top", "opacity", "zIndex"];
  class x extends E {
    constructor(e2, t2 = {}) {
      var _a;
      super(), this.el = e2, this.option = t2, this.dragTransform = { xScale: 1, yScale: 1, xOffset: 0, yOffset: 0 }, this._autoScrollTick = () => {
        const e3 = this.helper, t3 = this._autoScrollContainer;
        if (!e3 || !t3) return void this._stopScrolling();
        const i3 = this._getClipping(e3, t3);
        if (0 === i3) return void this._stopScrolling();
        if (!this._autoScrollMaxSpeed) {
          const e4 = window.innerHeight || document.documentElement.clientHeight;
          this._autoScrollMaxSpeed = Math.max(e4 / 150, 4);
        }
        const s3 = Math.abs(i3), o2 = Math.min(0.5 * s3, this._autoScrollMaxSpeed), n2 = i3 > 0 ? o2 : -o2, r2 = t3.scrollTop;
        t3.scrollTop += n2, t3.scrollTop !== r2 ? (this.dragging && this.lastDrag && (this._dragFollow(this.lastDrag), this._callDrag(this.lastDrag)), this._autoScrollAnimId = requestAnimationFrame(this._autoScrollTick)) : this._stopScrolling();
      };
      const i2 = (_a = t2 == null ? void 0 : t2.handle) == null ? void 0 : _a.substring(1), s2 = e2.gridstackNode;
      this.dragEls = !i2 || e2.classList.contains(i2) ? [e2] : (s2 == null ? void 0 : s2.subGrid) ? [e2.querySelector(t2.handle) || e2] : this.getAllHandles(), 0 === this.dragEls.length && (this.dragEls = [e2]), this._mouseDown = this._mouseDown.bind(this), this._mouseMove = this._mouseMove.bind(this), this._mouseUp = this._mouseUp.bind(this), this._keyEvent = this._keyEvent.bind(this), this.enable();
    }
    getAllHandles() {
      return Array.from(this.el.querySelectorAll(this.option.handle)).filter((e2) => {
        if (!(e2 instanceof HTMLElement)) return false;
        const t2 = e2.closest(".grid-stack-item");
        return t2 === this.el || !t2;
      });
    }
    on(e2, t2) {
      super.on(e2, t2);
    }
    off(e2) {
      super.off(e2);
    }
    enable() {
      false !== this.disabled && (super.enable(), this.dragEls.forEach((e2) => {
        e2.addEventListener("mousedown", this._mouseDown), r && (e2.addEventListener("touchstart", p), e2.addEventListener("pointerdown", v));
      }), this.el.classList.remove("ui-draggable-disabled"));
    }
    disable(e2 = false) {
      true !== this.disabled && (super.disable(), c(), this.dragEls.forEach((e3) => {
        e3.removeEventListener("mousedown", this._mouseDown), r && (e3.removeEventListener("touchstart", p), e3.removeEventListener("pointerdown", v));
      }), e2 || this.el.classList.add("ui-draggable-disabled"));
    }
    destroy() {
      this.dragTimeout && window.clearTimeout(this.dragTimeout), delete this.dragTimeout, this.mouseDownEvent && this._mouseUp(this.mouseDownEvent), this.disable(true), delete this.el, delete this.option, super.destroy();
    }
    updateOption(e2) {
      return Object.assign(this.option, e2), this;
    }
    refreshHandles() {
      var _a, _b;
      const e2 = this.disabled;
      e2 || this.disable(true);
      const t2 = (_b = (_a = this.option) == null ? void 0 : _a.handle) == null ? void 0 : _b.substring(1), i2 = this.el.gridstackNode;
      this.dragEls = !t2 || this.el.classList.contains(t2) ? [this.el] : (i2 == null ? void 0 : i2.subGrid) ? [this.el.querySelector(this.option.handle) || this.el] : this.getAllHandles(), 0 === this.dragEls.length && (this.dragEls = [this.el]), e2 || this.enable();
    }
    _mouseDown(e2) {
      return e2.isTrusted && (a.touchHandled && (a.touchHandled = false), n.mouseHandled && e2.timeStamp !== n.mouseHandledTimeStamp && delete n.mouseHandled), n.mouseHandled || 0 !== e2.button || !this.dragEls.find((t2) => t2 === e2.target) && e2.target.closest('input,textarea,button,select,option,[contenteditable="true"],.ui-resizable-handle') || this.option.cancel && e2.target.closest(this.option.cancel) || (this.mouseDownEvent = e2, delete this.dragging, delete n.dragElement, delete n.dropElement, delete this._autoScrollMaxSpeed, delete this._autoScrollContainer, document.addEventListener("mousemove", this._mouseMove, { capture: true, passive: true }), document.addEventListener("mouseup", this._mouseUp, true), r && e2.currentTarget && (e2.currentTarget.addEventListener("touchmove", m), e2.currentTarget.addEventListener("touchend", f), e2.currentTarget.addEventListener("touchcancel", f)), a.wasDelayed && this.el.classList.add("ui-draggable-armed"), e2.preventDefault(), document.activeElement && document.activeElement.blur(), n.mouseHandled = true, n.mouseHandledTimeStamp = e2.timeStamp), true;
    }
    _callDrag(e2) {
      if (!this.dragging) return;
      const t2 = i.initEvent(e2, { target: this.el, type: "drag" });
      this.option.drag && this.option.drag(t2, this.ui()), this.triggerEvent("drag", t2);
    }
    _mouseMove(e2) {
      var _a, _b;
      const t2 = this.mouseDownEvent;
      if (this.lastDrag = e2, this.dragging) if (this._dragFollow(e2), n.pauseDrag) {
        const t3 = Number.isInteger(n.pauseDrag) ? n.pauseDrag : 100;
        this.dragTimeout && window.clearTimeout(this.dragTimeout), this.dragTimeout = window.setTimeout(() => this._callDrag(e2), t3);
      } else this._callDrag(e2);
      else if (Math.abs(e2.x - t2.x) + Math.abs(e2.y - t2.y) > 3) {
        this.dragging = true, i.pauseIframePointerEvents(true), this.el.classList.remove("ui-draggable-armed"), n.dragElement = this;
        const t3 = (_a = this.el.gridstackNode) == null ? void 0 : _a.grid;
        t3 ? n.dropElement = (_b = t3.el.ddElement) == null ? void 0 : _b.ddDroppable : delete n.dropElement, this.helper = this._createHelper(), this._setupHelperContainmentStyle(), this.dragTransform = i.getValuesFromTransformedElement(this.helperContainment), this.dragOffset = this._getDragOffset(e2, this.el, this.helperContainment), this._setupHelperStyle(e2);
        const s2 = i.initEvent(e2, { target: this.el, type: "dragstart" });
        this.option.start && this.option.start(s2, this.ui()), this.triggerEvent("dragstart", s2), document.addEventListener("keydown", this._keyEvent);
      }
      return true;
    }
    _mouseUp(e2) {
      var _a, _b;
      if (this._stopScrolling(), this.el.classList.remove("ui-draggable-armed"), document.removeEventListener("mousemove", this._mouseMove, true), document.removeEventListener("mouseup", this._mouseUp, true), r && e2.currentTarget && (e2.currentTarget.removeEventListener("touchmove", m, true), e2.currentTarget.removeEventListener("touchend", f, true), e2.currentTarget.removeEventListener("touchcancel", f, true)), this.dragging) {
        delete this.dragging, i.pauseIframePointerEvents(false), (_a = this.el.gridstackNode) == null ? true : delete _a._origRotate, document.removeEventListener("keydown", this._keyEvent), ((_b = n.dropElement) == null ? void 0 : _b.el) === this.el.parentElement && delete n.dropElement, this.helperContainment.style.position = this.parentOriginStylePosition || null, this.helper && this.helper !== this.el && this.helper.remove(), this._removeHelperStyle();
        const t2 = i.initEvent(e2, { target: this.el, type: "dragstop" });
        this.option.stop && this.option.stop(t2), this.triggerEvent("dragstop", t2), n.dropElement && n.dropElement.drop(e2);
      }
      delete this.helper, delete this.mouseDownEvent, delete n.dragElement, delete n.dropElement, delete n.mouseHandled, delete n.mouseHandledTimeStamp, e2.preventDefault();
    }
    _keyEvent(e2) {
      var _a, _b;
      const t2 = this.el.gridstackNode, s2 = (t2 == null ? void 0 : t2.grid) || ((_b = (_a = n.dropElement) == null ? void 0 : _a.el) == null ? void 0 : _b.gridstack);
      if ("Escape" === e2.key) t2 && t2._origRotate && (t2._orig = t2._origRotate, delete t2._origRotate), s2 == null ? void 0 : s2.cancelDrag(), this._mouseUp(this.mouseDownEvent);
      else if (t2 && s2 && ("r" === e2.key || "R" === e2.key)) {
        if (!i.canBeRotated(t2)) return;
        t2._origRotate = t2._origRotate || { ...t2._orig }, delete t2._moving, s2.setAnimation(false).rotate(t2.el, { top: -this.dragOffset.offsetTop, left: -this.dragOffset.offsetX }).setAnimation(), t2._moving = true, this.dragOffset = this._getDragOffset(this.lastDrag, t2.el, this.helperContainment), this.helper.style.width = this.dragOffset.width + "px", this.helper.style.height = this.dragOffset.height + "px", i.swap(t2._orig, "w", "h"), delete t2._rect, this._mouseMove(this.lastDrag);
      }
    }
    _createHelper() {
      var _a;
      let e2 = this.el;
      return "function" == typeof this.option.helper ? e2 = this.option.helper(this.el) : "clone" === this.option.helper && (e2 = i.cloneNode(this.el)), e2.parentElement || i.appendTo(e2, "parent" === this.option.appendTo ? this.el.parentElement : (_a = this.option.appendTo) != null ? _a : "body"), this.dragElementOriginStyle = x.originStyleProp.map((e3) => this.el.style[e3]), e2;
    }
    _setupHelperStyle(e2) {
      var _a, _b;
      this.helper.classList.add("ui-draggable-dragging"), (_b = (_a = this.el.gridstackNode) == null ? void 0 : _a.grid) == null ? void 0 : _b.el.classList.add("grid-stack-dragging");
      const t2 = this.helper.style;
      return t2.pointerEvents = "none", t2.width = this.dragOffset.width + "px", t2.height = this.dragOffset.height + "px", t2.willChange = "left, right, top", t2.position = "fixed", this._dragFollow(e2), t2.transition = "none", setTimeout(() => {
        this.helper && (t2.transition = null);
      }, 0), this;
    }
    _removeHelperStyle() {
      var _a, _b, _c;
      this.helper.classList.remove("ui-draggable-dragging"), (_b = (_a = this.el._gridstackNodeOrig || this.el.gridstackNode) == null ? void 0 : _a.grid) == null ? void 0 : _b.el.classList.remove("grid-stack-dragging");
      const e2 = (_c = this.helper) == null ? void 0 : _c.gridstackNode;
      if (!(e2 == null ? void 0 : e2._isAboutToRemove) && this.dragElementOriginStyle) {
        const e3 = this.helper, t2 = this.dragElementOriginStyle, i2 = x.originStyleProp.indexOf("transition"), s2 = t2[i2] || null;
        e3.style.transition = t2[i2] = "none";
        const o2 = e3.style;
        x.originStyleProp.forEach((e4, i3) => o2[e4] = t2[i3] || null), setTimeout(() => e3.style.transition = s2 || "", 50);
      }
      return delete this.dragElementOriginStyle, this;
    }
    _dragFollow(e2) {
      const t2 = this.helper.style, i2 = this.dragOffset;
      this.option.rtl ? (t2.right = (window.innerWidth - e2.clientX + i2.offsetX) * this.dragTransform.xScale + "px", t2.left && (t2.left = "")) : (t2.left = (e2.clientX + i2.offsetX) * this.dragTransform.xScale + "px", t2.right && (t2.right = "")), t2.top = (e2.clientY + i2.offsetTop) * this.dragTransform.yScale + "px";
    }
    _setupHelperContainmentStyle() {
      return this.helperContainment = this.helper.parentElement, "fixed" !== this.helper.style.position && (this.parentOriginStylePosition = this.helperContainment.style.position, getComputedStyle(this.helperContainment).position.match(/static/) && (this.helperContainment.style.position = "relative")), this;
    }
    _getDragOffset(e2, t2, i2) {
      let s2 = 0, o2 = 0;
      i2 && (s2 = this.dragTransform.xOffset, o2 = this.dragTransform.yOffset);
      const n2 = t2.getBoundingClientRect();
      let r2 = this.option.rtl ? n2.right : n2.left, a2 = this.option.rtl ? e2.clientX - n2.right + s2 : -e2.clientX + n2.left - s2;
      return { x: r2, top: n2.top, offsetX: a2, offsetTop: -e2.clientY + n2.top - o2, width: n2.width * this.dragTransform.xScale, height: n2.height * this.dragTransform.yScale };
    }
    updateScrollPosition(e2) {
      this._autoScrollContainer = i.getScrollElement(e2), 0 === this._getClipping(this.helper, this._autoScrollContainer) ? this._stopScrolling() : this._autoScrollAnimId || (this._autoScrollAnimId = requestAnimationFrame(this._autoScrollTick));
    }
    _getClipping(e2, t2) {
      const i2 = e2.getBoundingClientRect(), s2 = t2.getBoundingClientRect(), o2 = window.innerHeight || document.documentElement.clientHeight;
      if (i2.bottom < s2.top || i2.top > s2.bottom) return 0;
      const n2 = i2.bottom - Math.min(s2.bottom, o2), r2 = i2.top - Math.max(s2.top, 0);
      return r2 < 0 ? r2 : n2 > 0 ? n2 : 0;
    }
    _stopScrolling() {
      this._autoScrollAnimId && (cancelAnimationFrame(this._autoScrollAnimId), delete this._autoScrollAnimId);
    }
    ui() {
      const e2 = this.el.parentElement.getBoundingClientRect(), t2 = this.helper.getBoundingClientRect(), i2 = this.option.rtl ? (e2.right - t2.right) * this.dragTransform.xScale : (t2.left - e2.left) * this.dragTransform.xScale;
      return { position: { top: (t2.top - e2.top) * this.dragTransform.yScale, left: i2 } };
    }
  }
  x.originStyleProp = ["width", "height", "transform", "transform-origin", "transition", "pointerEvents", "position", "left", "right", "top", "minWidth", "willChange"];
  class C extends E {
    constructor(e2, t2 = {}) {
      super(), this.el = e2, this.option = t2, this._mouseEnter = this._mouseEnter.bind(this), this._mouseLeave = this._mouseLeave.bind(this), this.eventEl = this.el.closest(".grid-stack-item") || this.el, this.enable(), this._setupAccept();
    }
    on(e2, t2) {
      super.on(e2, t2);
    }
    off(e2) {
      super.off(e2);
    }
    enable() {
      false !== this.disabled && (super.enable(), this.el.classList.add("ui-droppable"), this.el.classList.remove("ui-droppable-disabled"), this.eventEl.addEventListener("mouseenter", this._mouseEnter), this.eventEl.addEventListener("mouseleave", this._mouseLeave), r && (this.eventEl.addEventListener("pointerenter", _), this.eventEl.addEventListener("pointerleave", y)));
    }
    disable(e2 = false) {
      true !== this.disabled && (super.disable(), this.el.classList.remove("ui-droppable"), e2 || this.el.classList.add("ui-droppable-disabled"), this.eventEl.removeEventListener("mouseenter", this._mouseEnter), this.eventEl.removeEventListener("mouseleave", this._mouseLeave), r && (this.eventEl.removeEventListener("pointerenter", _), this.eventEl.removeEventListener("pointerleave", y)));
    }
    destroy() {
      this.disable(true), this.el.classList.remove("ui-droppable"), this.el.classList.remove("ui-droppable-disabled"), super.destroy();
    }
    updateOption(e2) {
      return Object.assign(this.option, e2), this._setupAccept(), this;
    }
    _mouseEnter(e2) {
      if (!n.dragElement) return;
      if (a.touchHandled && e2.isTrusted) return;
      if (!this._canDrop(n.dragElement.el)) return;
      e2.preventDefault(), e2.stopPropagation(), n.dragElement._stopScrolling(), n.dropElement && n.dropElement !== this && n.dropElement._mouseLeave(e2, true), n.dropElement = this;
      const t2 = i.initEvent(e2, { target: this.el, type: "dropover" });
      this.option.over && this.option.over(t2, this._ui(n.dragElement)), this.triggerEvent("dropover", t2), this.el.classList.add("ui-droppable-over");
    }
    _mouseLeave(e2, t2 = false) {
      var _a;
      if (!n.dragElement || n.dropElement !== this) return;
      e2.preventDefault(), e2.stopPropagation(), t2 && n.dragElement._stopScrolling();
      const s2 = i.initEvent(e2, { target: this.el, type: "dropout" });
      if (this.option.out && this.option.out(s2, this._ui(n.dragElement)), this.triggerEvent("dropout", s2), n.dropElement === this && (delete n.dropElement, !t2)) {
        let t3, i2 = this.el.parentElement;
        for (; !t3 && i2; ) t3 = (_a = i2.ddElement) == null ? void 0 : _a.ddDroppable, i2 = i2.parentElement;
        t3 && t3._mouseEnter(e2);
      }
    }
    drop(e2) {
      e2.preventDefault();
      const t2 = i.initEvent(e2, { target: this.el, type: "drop" });
      this.option.drop && this.option.drop(t2, this._ui(n.dragElement)), this.triggerEvent("drop", t2);
    }
    _canDrop(e2) {
      return e2 && (!this.accept || this.accept(e2));
    }
    _setupAccept() {
      return this.option.accept ? ("string" == typeof this.option.accept ? this.accept = (e2) => e2.classList.contains(this.option.accept) || e2.matches(this.option.accept) : this.accept = this.option.accept, this) : this;
    }
    _ui(e2) {
      return { draggable: e2.el, ...e2.ui() };
    }
  }
  class R {
    static init(e2) {
      return e2.ddElement || (e2.ddElement = new R(e2)), e2.ddElement;
    }
    constructor(e2) {
      this.el = e2;
    }
    on(e2, t2) {
      return this.ddDraggable && ["drag", "dragstart", "dragstop"].indexOf(e2) > -1 ? this.ddDraggable.on(e2, t2) : this.ddDroppable && ["drop", "dropover", "dropout"].indexOf(e2) > -1 ? this.ddDroppable.on(e2, t2) : this.ddResizable && ["resizestart", "resize", "resizestop"].indexOf(e2) > -1 && this.ddResizable.on(e2, t2), this;
    }
    off(e2) {
      return this.ddDraggable && ["drag", "dragstart", "dragstop"].indexOf(e2) > -1 ? this.ddDraggable.off(e2) : this.ddDroppable && ["drop", "dropover", "dropout"].indexOf(e2) > -1 ? this.ddDroppable.off(e2) : this.ddResizable && ["resizestart", "resize", "resizestop"].indexOf(e2) > -1 && this.ddResizable.off(e2), this;
    }
    setupDraggable(e2) {
      return this.ddDraggable ? this.ddDraggable.updateOption(e2) : this.ddDraggable = new x(this.el, e2), this;
    }
    cleanDraggable() {
      return this.ddDraggable && (this.ddDraggable.destroy(), delete this.ddDraggable), this;
    }
    setupResizable(e2) {
      return this.ddResizable ? this.ddResizable.updateOption(e2) : this.ddResizable = new w(this.el, e2), this;
    }
    cleanResizable() {
      return this.ddResizable && (this.ddResizable.destroy(), delete this.ddResizable), this;
    }
    setupDroppable(e2) {
      return this.ddDroppable ? this.ddDroppable.updateOption(e2) : this.ddDroppable = new C(this.el, e2), this;
    }
    cleanDroppable() {
      return this.ddDroppable && (this.ddDroppable.destroy(), delete this.ddDroppable), this;
    }
  }
  const k = new class {
    resizable(e2, t2, i2, s2) {
      return this._getDDElements(e2, "string" == typeof t2 ? t2 : void 0).forEach((e3) => {
        if ("disable" === t2 || "enable" === t2) e3.ddResizable && e3.ddResizable[t2]();
        else if ("destroy" === t2) e3.ddResizable && e3.cleanResizable();
        else if ("option" === t2) e3.setupResizable({ [i2]: s2 });
        else {
          const i3 = e3.el.gridstackNode.grid;
          let s3 = e3.el.getAttribute("gs-resize-handles") || i3.opts.resizable.handles || "e,s,se";
          "all" === s3 && (s3 = "n,e,s,w,se,sw,ne,nw");
          const o2 = !i3.opts.alwaysShowResizeHandle, n2 = t2;
          e3.setupResizable({ ...i3.opts.resizable, handles: s3, autoHide: o2, start: n2.start, stop: n2.stop, resize: n2.resize, rtl: n2.rtl });
        }
      }), this;
    }
    draggable(e2, t2, i2, s2) {
      return this._getDDElements(e2, "string" == typeof t2 ? t2 : void 0).forEach((e3) => {
        if ("disable" === t2 || "enable" === t2) e3.ddDraggable && e3.ddDraggable[t2]();
        else if ("destroy" === t2) e3.ddDraggable && e3.cleanDraggable();
        else if ("option" === t2) e3.setupDraggable({ [i2]: s2 });
        else {
          const i3 = e3.el.gridstackNode.grid, s3 = t2;
          e3.setupDraggable({ ...i3.opts.draggable, start: s3.start, stop: s3.stop, drag: s3.drag, rtl: s3.rtl });
        }
      }), this;
    }
    dragIn(e2, t2) {
      return this._getDDElements(e2).forEach((e3) => e3.setupDraggable(t2)), this;
    }
    droppable(e2, t2, i2, s2) {
      if ("string" != typeof t2) {
        const e3 = t2;
        "function" != typeof e3.accept || e3._accept || (e3._accept = e3.accept, e3.accept = (t3) => e3._accept(t3));
      }
      const o2 = "string" == typeof t2 ? t2 : void 0;
      return this._getDDElements(e2, o2).forEach((e3) => {
        "disable" === t2 || "enable" === t2 ? e3.ddDroppable && e3.ddDroppable[t2]() : "destroy" === t2 ? e3.ddDroppable && e3.cleanDroppable() : "option" === t2 ? e3.setupDroppable({ [i2]: s2 }) : e3.setupDroppable(t2);
      }), this;
    }
    isDroppable(e2) {
      var _a;
      return !(!((_a = e2 == null ? void 0 : e2.ddElement) == null ? void 0 : _a.ddDroppable) || e2.ddElement.ddDroppable.disabled);
    }
    isDraggable(e2) {
      var _a;
      return !(!((_a = e2 == null ? void 0 : e2.ddElement) == null ? void 0 : _a.ddDraggable) || e2.ddElement.ddDraggable.disabled);
    }
    isResizable(e2) {
      var _a;
      return !(!((_a = e2 == null ? void 0 : e2.ddElement) == null ? void 0 : _a.ddResizable) || e2.ddElement.ddResizable.disabled);
    }
    on(e2, t2, i2) {
      return this._getDDElements(e2).forEach((e3) => e3.on(t2, (e4) => {
        i2(e4, n.dragElement ? n.dragElement.el : e4.target, n.dragElement ? n.dragElement.helper : void 0);
      })), this;
    }
    off(e2, t2) {
      return this._getDDElements(e2).forEach((e3) => e3.off(t2)), this;
    }
    _getDDElements(e2, t2) {
      const s2 = e2.gridstack || "destroy" !== t2 && "disable" !== t2, o2 = i.getElements(e2);
      return o2.length ? o2.map((e3) => e3.ddElement || (s2 ? R.init(e3) : null)).filter((e3) => !!e3) : [];
    }
  }();
  class z {
    static init(e2 = {}, t2 = ".grid-stack") {
      if ("undefined" == typeof document) return null;
      const s2 = z.getGridElement(t2);
      return s2 ? (s2.gridstack || (s2.gridstack = new z(s2, i.cloneDeep(e2))), s2.gridstack) : ("string" == typeof t2 ? console.error('GridStack.initAll() no grid was found with selector "' + t2 + '" - element missing or wrong selector ?\nNote: ".grid-stack" is required for proper CSS styling and drag/drop, and is the default selector.') : console.error("GridStack.init() no grid element was passed."), null);
    }
    static initAll(e2 = {}, t2 = ".grid-stack") {
      const s2 = [];
      return "undefined" == typeof document || (z.getGridElements(t2).forEach((t3) => {
        t3.gridstack || (t3.gridstack = new z(t3, i.cloneDeep(e2))), s2.push(t3.gridstack);
      }), 0 === s2.length && console.error('GridStack.initAll() no grid was found with selector "' + t2 + '" - element missing or wrong selector ?\nNote: ".grid-stack" is required for proper CSS styling and drag/drop, and is the default selector.')), s2;
    }
    static addGrid(e2, t2 = {}) {
      if (!e2) return null;
      let s2 = e2;
      if (s2.gridstack) {
        const e3 = s2.gridstack;
        return t2 && (e3.opts = { ...e3.opts, ...t2 }), void 0 !== t2.children && e3.load(t2.children), e3;
      }
      return e2.classList.contains("grid-stack") && !z.addRemoveCB || (s2 = z.addRemoveCB ? z.addRemoveCB(e2, t2, true, true) : i.createDiv(["grid-stack", t2.class], e2)), z.init(t2, s2);
    }
    static registerEngine(e2) {
      z.engineClass = e2;
    }
    get placeholder() {
      if (!this._placeholder) {
        this._placeholder = i.createDiv([this.opts.placeholderClass, o.itemClass, this.opts.itemClass]);
        const e2 = i.createDiv(["placeholder-content"], this._placeholder);
        this.opts.placeholderText && (e2.textContent = this.opts.placeholderText);
      }
      return this._placeholder;
    }
    constructor(e2, t2 = {}) {
      var _a;
      this.el = e2, this.opts = t2, this.animationDelay = 310, this._gsEventHandler = {}, this._extraDragRow = 0, this.dragTransform = { xScale: 1, yScale: 1, xOffset: 0, yOffset: 0 }, e2.gridstack = this, this.opts = t2 = t2 || {}, e2.classList.contains("grid-stack") || this.el.classList.add("grid-stack"), t2.row && (t2.minRow = t2.maxRow = t2.row, delete t2.row);
      const a2 = i.toNumber(e2.getAttribute("gs-row"));
      "auto" === t2.column && delete t2.column, void 0 !== t2.alwaysShowResizeHandle && (t2._alwaysShowResizeHandle = t2.alwaysShowResizeHandle);
      const l2 = t2.columnOpts;
      if (l2) {
        const e3 = l2.breakpoints;
        l2.columnWidth || (e3 == null ? void 0 : e3.length) ? e3 && e3.length > 1 ? (e3.sort((e4, t3) => (t3.w || 0) - (e4.w || 0)), delete l2.columnWidth) : l2.columnMax = l2.columnMax || 12 : delete t2.columnOpts;
      }
      const h2 = { ...i.cloneDeep(o), column: i.toNumber(e2.getAttribute("gs-column")) || o.column, minRow: a2 || i.toNumber(e2.getAttribute("gs-min-row")) || o.minRow, maxRow: a2 || i.toNumber(e2.getAttribute("gs-max-row")) || o.maxRow, staticGrid: i.toBool(e2.getAttribute("gs-static")) || o.staticGrid, sizeToContent: i.toBool(e2.getAttribute("gs-size-to-content")) || void 0, draggable: { handle: (t2.handleClass ? "." + t2.handleClass : t2.handle ? t2.handle : "") || o.draggable.handle }, removableOptions: { accept: t2.itemClass || o.removableOptions.accept, decline: o.removableOptions.decline } };
      e2.getAttribute("gs-animate") && (h2.animate = i.toBool(e2.getAttribute("gs-animate"))), t2 = i.defaults(t2, h2), this._initMargin(), this.checkDynamicColumn(), this._updateColumnVar(t2), "auto" === t2.rtl && (t2.rtl = "rtl" === e2.style.direction), t2.rtl && this.el.classList.add("grid-stack-rtl");
      const d2 = this.el.closest("." + o.itemClass), c2 = d2 == null ? void 0 : d2.gridstackNode;
      if (c2 && (c2.subGrid = this, this.parentGridNode = c2, this.el.classList.add("grid-stack-nested"), c2.el.classList.add("grid-stack-sub-grid")), this._isAutoCellHeight = "auto" === t2.cellHeight, this._isAutoCellHeight || "initial" === t2.cellHeight) this.cellHeight(void 0);
      else {
        "number" == typeof t2.cellHeight && t2.cellHeightUnit && t2.cellHeightUnit !== o.cellHeightUnit && (t2.cellHeight = t2.cellHeight + t2.cellHeightUnit, delete t2.cellHeightUnit);
        const e3 = t2.cellHeight;
        delete t2.cellHeight, this.cellHeight(e3);
      }
      "mobile" === t2.alwaysShowResizeHandle && (t2.alwaysShowResizeHandle = r), this._setStaticClass();
      const g2 = t2.engineClass || z.engineClass || s;
      if (this.engine = new g2({ column: this.getColumn(), float: t2.float, maxRow: t2.maxRow, onChange: (e3) => {
        e3.forEach((e4) => {
          const t3 = e4.el;
          t3 && (e4._removeDOM ? (t3 && t3.remove(), delete e4._removeDOM) : this._writePosAttr(t3, e4));
        }), this._updateContainerHeight();
      } }), t2.auto && (this.batchUpdate(), this.engine._loading = true, this.getGridItems().forEach((e3) => this._prepareElement(e3)), delete this.engine._loading, this.batchUpdate(false)), t2.children) {
        const e3 = t2.children;
        delete t2.children, e3.length && this.load(e3);
      }
      this.setAnimation(), t2.subGridDynamic && !n.pauseDrag && (n.pauseDrag = true), void 0 !== ((_a = t2.draggable) == null ? void 0 : _a.pause) && (n.pauseDrag = t2.draggable.pause), this._setupRemoveDrop(), this._setupAcceptWidget(), this._updateResizeEvent();
    }
    _updateColumnVar(e2 = this.opts) {
      this.el.classList.add("gs-" + e2.column), "number" == typeof e2.column && (this.el.style.setProperty("--gs-column-width", 100 / e2.column + "%"), this.el.style.setProperty("--gs-columns", String(e2.column)));
    }
    addWidget(e2) {
      if (!e2) return;
      if ("string" == typeof e2) return void console.error("V11: GridStack.addWidget() does not support string anymore. see #2736");
      if (e2.ELEMENT_NODE) return console.error("V11: GridStack.addWidget() does not support HTMLElement anymore. use makeWidget()"), this.makeWidget(e2);
      let t2, s2 = e2;
      if (s2.grid = this, t2 = s2.el ? s2.el : z.addRemoveCB ? z.addRemoveCB(this.el, e2, true, false) : this.createWidgetDivs(s2), !t2) return;
      if (s2 = t2.gridstackNode, s2 && t2.parentElement === this.el && this.engine.nodes.find((e3) => e3._id === s2._id)) return t2;
      const o2 = this._readAttr(t2);
      return i.defaults(e2, o2), this.engine.prepareNode(e2), this.el.appendChild(t2), this.makeWidget(t2, e2), t2;
    }
    createWidgetDivs(e2) {
      const t2 = i.createDiv(["grid-stack-item", this.opts.itemClass]), s2 = i.createDiv(["grid-stack-item-content"], t2);
      return i.lazyLoad(e2) ? e2.visibleObservable || (e2.visibleObservable = new IntersectionObserver(([t3]) => {
        var _a, _b;
        t3.isIntersecting && ((_a = e2.visibleObservable) == null ? void 0 : _a.disconnect(), delete e2.visibleObservable, z.renderCB(s2, e2), (_b = e2.grid) == null ? void 0 : _b.prepareDragDrop(e2.el));
      }), window.setTimeout(() => {
        var _a;
        return (_a = e2.visibleObservable) == null ? void 0 : _a.observe(t2);
      })) : z.renderCB(s2, e2), t2;
    }
    makeSubGrid(e2, t2, s2, o2 = true) {
      var _a, _b, _c;
      let n2, r2 = e2.gridstackNode;
      if (r2 || (r2 = this.makeWidget(e2).gridstackNode), (_a = r2.subGrid) == null ? void 0 : _a.el) return r2.subGrid;
      let a2 = this;
      for (; a2 && !n2; ) n2 = (_b = a2.opts) == null ? void 0 : _b.subGridOpts, a2 = (_c = a2.parentGridNode) == null ? void 0 : _c.grid;
      t2 = i.cloneDeep({ ...this.opts, id: void 0, children: void 0, column: "auto", columnOpts: void 0, layout: "list", subGridOpts: void 0, ...n2 || {}, ...t2 || r2.subGridOpts || {} }), r2.subGridOpts = t2;
      let l2 = false;
      "auto" === t2.column && (l2 = true, t2.column = Math.max(r2.w || 1, (s2 == null ? void 0 : s2.w) || 1), delete t2.columnOpts);
      let h2, d2, c2 = r2.el.querySelector(".grid-stack-item-content");
      if (o2 && (this._removeDD(r2.el), d2 = { ...r2, x: 0, y: 0 }, i.removeInternalForSave(d2), delete d2.subGridOpts, r2.content && (d2.content = r2.content, delete r2.content), z.addRemoveCB ? h2 = z.addRemoveCB(this.el, d2, true, false) || void 0 : (h2 = i.createDiv(["grid-stack-item"]), h2.appendChild(c2), c2 = i.createDiv(["grid-stack-item-content"], r2.el)), this.prepareDragDrop(r2.el)), s2) {
        const e3 = l2 ? t2.column : r2.w, i2 = r2.h + s2.h, o3 = r2.el.style;
        o3.transition = "none", this.update(r2.el, { w: e3, h: i2 }), setTimeout(() => o3.transition = "");
      }
      const g2 = r2.subGrid = z.addGrid(c2, t2) || void 0;
      return (s2 == null ? void 0 : s2._moving) && (g2._isTemp = true), l2 && (g2._autoColumn = true), o2 && g2.makeWidget(h2, d2), s2 && (s2._moving ? window.setTimeout(() => i.simulateMouseEvent(s2._event, "mouseenter", g2.el), 0) : g2.makeWidget(r2.el, r2)), this.resizeToContentCheck(false, r2), g2;
    }
    removeAsSubGrid(e2) {
      var _a, _b;
      const t2 = (_a = this.parentGridNode) == null ? void 0 : _a.grid;
      if (t2 && (t2.batchUpdate(), t2.removeWidget(this.parentGridNode.el, true, true), this.engine.nodes.forEach((e3) => {
        var _a2, _b2, _c, _d;
        e3.x = ((_a2 = e3.x) != null ? _a2 : 0) + ((_b2 = this.parentGridNode.x) != null ? _b2 : 0), e3.y = ((_c = e3.y) != null ? _c : 0) + ((_d = this.parentGridNode.y) != null ? _d : 0), this._removeDD(e3.el), e3.el.remove(), delete e3.el.gridstackNode, t2.makeWidget(e3.el, e3);
      }), t2.batchUpdate(false), this.parentGridNode && delete this.parentGridNode.subGrid, delete this.parentGridNode, e2)) {
        const s2 = (_b = e2.el) == null ? void 0 : _b.gridstackNode;
        s2 && s2 !== e2 && (s2._temporaryRemoved = true), window.setTimeout(() => {
          var _a2;
          const s3 = ((_a2 = n.dragElement) == null ? void 0 : _a2.lastDrag) || e2._event;
          s3 && i.simulateMouseEvent(s3, "mouseenter", t2.el);
        }, 0);
      }
    }
    save(e2 = true, t2 = false, s2 = z.saveCB, n2) {
      const r2 = this.engine.save(e2, s2, n2);
      if (r2.forEach((i2) => {
        var _a;
        if (e2 && i2.el && !i2.subGrid && !s2) {
          const e3 = i2.el.querySelector(".grid-stack-item-content");
          i2.content = e3 == null ? void 0 : e3.innerHTML, i2.content || delete i2.content;
        } else if (e2 || s2 || delete i2.content, (_a = i2.subGrid) == null ? void 0 : _a.el) {
          const o2 = i2.w || i2.subGrid.getColumn(), n3 = i2.subGrid.save(e2, t2, s2, o2);
          i2.subGridOpts = t2 ? n3 : { children: n3 }, delete i2.subGrid;
        }
        delete i2.el;
      }), t2) {
        const e3 = i.cloneDeep(this.opts);
        e3.marginBottom === e3.marginTop && e3.marginRight === e3.marginLeft && e3.marginTop === e3.marginRight && (e3.margin = e3.marginTop, delete e3.marginTop, delete e3.marginRight, delete e3.marginBottom, delete e3.marginLeft), e3.rtl === ("rtl" === this.el.style.direction) && (e3.rtl = "auto"), this._isAutoCellHeight && (e3.cellHeight = "auto"), this._autoColumn && (e3.column = "auto");
        const t3 = e3._alwaysShowResizeHandle;
        return delete e3._alwaysShowResizeHandle, void 0 !== t3 ? e3.alwaysShowResizeHandle = t3 : delete e3.alwaysShowResizeHandle, i.removeInternalAndSame(e3, o), e3.children = r2, e3;
      }
      return r2;
    }
    load(e2, t2 = z.addRemoveCB || true) {
      e2.forEach((e3) => {
        e3.w = e3.w || e3.minW || 1, e3.h = e3.h || e3.minH || 1;
      }), e2 = i.sort(e2), this.engine.skipCacheUpdate = this._ignoreLayoutsNodeChange = true;
      let s2 = 0;
      e2.forEach((e3) => {
        s2 = Math.max(s2, (e3.x || 0) + e3.w);
      }), s2 > this.engine.defaultColumn && (this.engine.defaultColumn = s2);
      const o2 = this.getColumn();
      s2 > o2 && (0 === this.engine.nodes.length && this.responseLayout ? (this.engine.nodes = e2, this.engine.columnChanged(s2, o2, this.responseLayout), e2 = this.engine.nodes, this.engine.nodes = [], delete this.responseLayout) : this.engine.cacheLayout(e2, s2, true));
      const n2 = z.addRemoveCB;
      "function" == typeof t2 && (z.addRemoveCB = t2);
      const r2 = [];
      this.batchUpdate();
      const a2 = !this.engine.nodes.length, l2 = a2 && this.opts.animate;
      l2 && this.setAnimation(false), !a2 && t2 && [...this.engine.nodes].forEach((t3) => {
        t3.id && (i.find(e2, t3.id) || (z.addRemoveCB && z.addRemoveCB(this.el, t3, false, false), r2.push(t3), this.removeWidget(t3.el, true, false)));
      }), this.engine._loading = true;
      const h2 = [];
      return this.engine.nodes = this.engine.nodes.filter((t3) => !t3.id || !i.find(e2, t3.id) || (h2.push(t3), false)), e2.forEach((e3) => {
        var _a;
        const s3 = e3.id ? i.find(h2, e3.id) : void 0;
        if (s3) {
          if (i.shouldSizeToContent(s3) && (e3.h = s3.h), this.engine.nodeBoundFix(e3), (e3.autoPosition || void 0 === e3.x || void 0 === e3.y) && (e3.w = e3.w || s3.w, e3.h = e3.h || s3.h, this.engine.findEmptyPosition(e3)), this.engine.nodes.push(s3), i.samePos(s3, e3) && this.engine.nodes.length > 1 && (this.moveNode(s3, { ...e3, forceCollide: true }), i.copyPos(e3, s3)), this.update(s3.el, e3), (_a = e3.subGridOpts) == null ? void 0 : _a.children) {
            const t3 = s3.el.querySelector(".grid-stack");
            t3 && t3.gridstack && t3.gridstack.load(e3.subGridOpts.children);
          }
        } else t2 && this.addWidget(e3);
      }), delete this.engine._loading, this.engine.removedNodes = r2, this.batchUpdate(false), delete this._ignoreLayoutsNodeChange, delete this.engine.skipCacheUpdate, n2 ? z.addRemoveCB = n2 : delete z.addRemoveCB, l2 && this.setAnimation(true, true), this;
    }
    batchUpdate(e2 = true) {
      return this.engine.batchUpdate(e2), e2 || (this._updateContainerHeight(), this._triggerRemoveEvent(), this._triggerAddEvent(), this._triggerChangeEvent()), this;
    }
    getCellHeight(e2 = false) {
      if (this.opts.cellHeight && "auto" !== this.opts.cellHeight && (!e2 || !this.opts.cellHeightUnit || "px" === this.opts.cellHeightUnit)) return this.opts.cellHeight;
      if ("rem" === this.opts.cellHeightUnit) return this.opts.cellHeight * parseFloat(getComputedStyle(document.documentElement).fontSize);
      if ("em" === this.opts.cellHeightUnit) return this.opts.cellHeight * parseFloat(getComputedStyle(this.el).fontSize);
      if ("cm" === this.opts.cellHeightUnit) return this.opts.cellHeight * (96 / 2.54);
      if ("mm" === this.opts.cellHeightUnit) return this.opts.cellHeight * (96 / 2.54) / 10;
      const t2 = this.el.querySelector("." + this.opts.itemClass);
      if (t2) {
        const e3 = i.toNumber(t2.getAttribute("gs-h")) || 1;
        return Math.round(t2.offsetHeight / e3);
      }
      const s2 = parseInt(this.el.getAttribute("gs-current-row") || "0");
      return s2 ? Math.round(this.el.getBoundingClientRect().height / s2) : this.opts.cellHeight;
    }
    cellHeight(e2) {
      if (void 0 !== e2 && this._isAutoCellHeight !== ("auto" === e2) && (this._isAutoCellHeight = "auto" === e2, this._updateResizeEvent()), "initial" !== e2 && "auto" !== e2 || (e2 = void 0), void 0 === e2) {
        const t3 = -this.opts.marginRight - this.opts.marginLeft + this.opts.marginTop + this.opts.marginBottom;
        e2 = this.cellWidth() + t3;
      }
      const t2 = i.parseHeight(e2);
      return this.opts.cellHeightUnit === t2.unit && this.opts.cellHeight === t2.h || (this.opts.cellHeightUnit = t2.unit, this.opts.cellHeight = t2.h, this.el.style.setProperty("--gs-cell-height", `${this.opts.cellHeight}${this.opts.cellHeightUnit}`), this._updateContainerHeight(), this.resizeToContentCheck()), this;
    }
    cellWidth() {
      return this._widthOrContainer() / this.getColumn();
    }
    _widthOrContainer(e2 = false) {
      var _a;
      return e2 && ((_a = this.opts.columnOpts) == null ? void 0 : _a.breakpointForWindow) ? window.innerWidth : this.el.clientWidth || this.el.parentElement.clientWidth || window.innerWidth;
    }
    checkDynamicColumn() {
      var _a, _b;
      const e2 = this.opts.columnOpts;
      if (!e2 || !e2.columnWidth && !((_a = e2.breakpoints) == null ? void 0 : _a.length)) return false;
      const t2 = this.getColumn();
      let i2 = t2;
      const s2 = this._widthOrContainer(true);
      if (e2.columnWidth) i2 = Math.min(Math.round(s2 / e2.columnWidth) || 1, e2.columnMax);
      else {
        i2 = e2.columnMax;
        let o2 = 0;
        for (; o2 < e2.breakpoints.length && s2 <= e2.breakpoints[o2].w; ) i2 = e2.breakpoints[o2++].c || t2;
      }
      if (i2 !== t2) {
        const t3 = (_b = e2.breakpoints) == null ? void 0 : _b.find((e3) => e3.c === i2);
        return this.column(i2, (t3 == null ? void 0 : t3.layout) || e2.layout), true;
      }
      return false;
    }
    compact(e2 = "compact", t2 = true) {
      return this.engine.compact(e2, t2), this._triggerChangeEvent(), this;
    }
    column(e2, t2 = "moveScale") {
      if (!e2 || e2 < 1 || this.opts.column === e2) return this;
      const i2 = this.getColumn();
      return this.opts.column = e2, this.engine ? (this.engine.column = e2, this.el.classList.remove("gs-" + i2), this._updateColumnVar(), this.engine.columnChanged(i2, e2, t2), this._isAutoCellHeight && this.cellHeight(), this.resizeToContentCheck(true), this._ignoreLayoutsNodeChange = true, this._triggerChangeEvent(), delete this._ignoreLayoutsNodeChange, this) : (this.responseLayout = t2, this);
    }
    getColumn() {
      return this.opts.column;
    }
    getGridItems() {
      return Array.from(this.el.children).filter((e2) => e2.matches("." + this.opts.itemClass) && !e2.matches("." + this.opts.placeholderClass));
    }
    isIgnoreChangeCB() {
      return !!this._ignoreLayoutsNodeChange;
    }
    destroy(e2 = true) {
      var _a;
      return this.el ? (this.offAll(), this._updateResizeEvent(true), this.setStatic(true, false), this.setAnimation(false), e2 ? this.el.parentNode.removeChild(this.el) : (this.removeAll(e2), this.el.removeAttribute("gs-current-row")), this.parentGridNode && delete this.parentGridNode.subGrid, delete this.parentGridNode, delete this.opts, (_a = this._placeholder) == null ? true : delete _a.gridstackNode, delete this._placeholder, delete this.engine, delete this.el.gridstack, delete this.el, this) : this;
    }
    float(e2) {
      return this.opts.float !== e2 && (this.opts.float = this.engine.float = e2, this._triggerChangeEvent()), this;
    }
    getFloat() {
      return this.engine.float;
    }
    getCellFromPixel(e2, t2 = false) {
      const i2 = this.el.getBoundingClientRect();
      let s2;
      s2 = t2 ? { top: i2.top + document.documentElement.scrollTop, left: i2.left } : { top: this.el.offsetTop, left: this.el.offsetLeft };
      const o2 = e2.left - s2.left, n2 = e2.top - s2.top, r2 = i2.width / this.getColumn(), a2 = i2.height / parseInt(this.el.getAttribute("gs-current-row") || "0");
      return { x: Math.floor(o2 / r2), y: Math.floor(n2 / a2) };
    }
    getRow() {
      return Math.max(this.engine.getRow(), this.opts.minRow || 0);
    }
    isAreaEmpty(e2, t2, i2, s2) {
      return this.engine.isAreaEmpty(e2, t2, i2, s2);
    }
    makeWidget(e2, t2) {
      const i2 = z.getElement(e2);
      if (!i2 || i2.gridstackNode) return i2;
      i2.parentElement || this.el.appendChild(i2), this._prepareElement(i2, true, t2);
      const s2 = i2.gridstackNode;
      this._updateContainerHeight(), s2.subGridOpts && this.makeSubGrid(i2, s2.subGridOpts, void 0, false);
      let o2 = false;
      return 1 !== this.opts.column || this._ignoreLayoutsNodeChange || (o2 = this._ignoreLayoutsNodeChange = true), this._triggerAddEvent(), this._triggerChangeEvent(), o2 && delete this._ignoreLayoutsNodeChange, i2;
    }
    on(e2, t2) {
      if (-1 !== e2.indexOf(" ")) return e2.split(" ").forEach((e3) => this.on(e3, t2)), this;
      if ("change" === e2 || "added" === e2 || "removed" === e2 || "enable" === e2 || "disable" === e2) {
        const i2 = "enable" === e2 || "disable" === e2;
        this._gsEventHandler[e2] = i2 ? (e3) => t2(e3) : (e3) => {
          e3.detail && t2(e3, e3.detail);
        }, this.el.addEventListener(e2, this._gsEventHandler[e2]);
      } else "drag" === e2 || "dragstart" === e2 || "dragstop" === e2 || "resizestart" === e2 || "resize" === e2 || "resizestop" === e2 || "dropped" === e2 || "resizecontent" === e2 ? this._gsEventHandler[e2] = t2 : console.error("GridStack.on(" + e2 + ") event not supported");
      return this;
    }
    off(e2) {
      return -1 !== e2.indexOf(" ") ? (e2.split(" ").forEach((e3) => this.off(e3)), this) : ("change" !== e2 && "added" !== e2 && "removed" !== e2 && "enable" !== e2 && "disable" !== e2 || this._gsEventHandler[e2] && this.el.removeEventListener(e2, this._gsEventHandler[e2]), delete this._gsEventHandler[e2], this);
    }
    offAll() {
      return Object.keys(this._gsEventHandler).forEach((e2) => this.off(e2)), this;
    }
    removeWidget(e2, t2 = true, i2 = true) {
      return e2 ? (z.getElements(e2).forEach((e3) => {
        if (e3.parentElement && e3.parentElement !== this.el) return;
        let s2 = e3.gridstackNode;
        s2 || (s2 = this.engine.nodes.find((t3) => e3 === t3.el)), s2 && (t2 && z.addRemoveCB && z.addRemoveCB(this.el, s2, false, false), delete e3.gridstackNode, this._removeDD(e3), this.engine.removeNode(s2, t2, i2), t2 && e3.parentElement && e3.remove());
      }), i2 && (this._triggerRemoveEvent(), this._triggerChangeEvent()), this) : (console.error("Error: GridStack.removeWidget(undefined) called"), this);
    }
    removeAll(e2 = true, t2 = true) {
      return this.engine.nodes.forEach((t3) => {
        e2 && z.addRemoveCB && z.addRemoveCB(this.el, t3, false, false), delete t3.el.gridstackNode, this.opts.staticGrid || this._removeDD(t3.el);
      }), this.engine.removeAll(e2, t2), t2 && this._triggerRemoveEvent(), this;
    }
    setAnimation(e2 = this.opts.animate, t2) {
      return t2 ? setTimeout(() => {
        this.opts && this.setAnimation(e2);
      }) : e2 ? this.el.classList.add("grid-stack-animate") : this.el.classList.remove("grid-stack-animate"), this.opts.animate = e2, this;
    }
    hasAnimationCSS() {
      return this.el.classList.contains("grid-stack-animate");
    }
    setStatic(e2, t2 = true, i2 = true) {
      return !!this.opts.staticGrid === e2 || (e2 ? this.opts.staticGrid = true : delete this.opts.staticGrid, this._setupRemoveDrop(), this._setupAcceptWidget(), this.engine.nodes.forEach((s2) => {
        this.prepareDragDrop(s2.el), s2.subGrid && i2 && s2.subGrid.setStatic(e2, t2, i2);
      }), t2 && this._setStaticClass()), this;
    }
    updateOptions(e2) {
      var _a;
      const t2 = this.opts;
      if (e2 === t2) return this;
      if (void 0 !== e2.acceptWidgets && (t2.acceptWidgets = e2.acceptWidgets, this._setupAcceptWidget()), void 0 !== e2.animate && this.setAnimation(e2.animate), e2.cellHeight && this.cellHeight(e2.cellHeight), void 0 !== e2.class && e2.class !== t2.class && (t2.class && this.el.classList.remove(t2.class), e2.class && this.el.classList.add(e2.class)), e2.columnOpts) {
        const t3 = !!this.opts.columnOpts;
        this.opts.columnOpts = e2.columnOpts, t3 !== !!this.opts.columnOpts && this._updateResizeEvent(), this.checkDynamicColumn();
      } else null === e2.columnOpts && this.opts.columnOpts ? (delete this.opts.columnOpts, this._updateResizeEvent()) : "number" == typeof e2.column && this.column(e2.column);
      return void 0 !== e2.margin && this.margin(e2.margin), void 0 !== e2.staticGrid && this.setStatic(e2.staticGrid), void 0 === e2.disableDrag || e2.staticGrid || this.enableMove(!e2.disableDrag), void 0 === e2.disableResize || e2.staticGrid || this.enableResize(!e2.disableResize), void 0 !== e2.float && this.float(e2.float), void 0 !== e2.row ? (t2.minRow = t2.maxRow = this.engine.maxRow = t2.row = e2.row, this._updateContainerHeight(), this.engine.getRow() > e2.row && this.compact()) : (void 0 !== e2.minRow && (t2.minRow = e2.minRow, this._updateContainerHeight()), void 0 !== e2.maxRow && (t2.maxRow = this.engine.maxRow = e2.maxRow, this.engine.getRow() > e2.maxRow && this.compact())), void 0 !== e2.lazyLoad && (t2.lazyLoad = e2.lazyLoad), ((_a = e2.children) == null ? void 0 : _a.length) && this.load(e2.children), this;
    }
    update(e2, t2) {
      return z.getElements(e2).forEach((e3) => {
        var _a;
        const s2 = e3 == null ? void 0 : e3.gridstackNode;
        if (!s2) return;
        const o2 = { ...i.copyPos({}, s2), ...i.cloneDeep(t2) };
        this.engine.nodeBoundFix(o2), delete o2.autoPosition;
        const n2 = ["x", "y", "w", "h"];
        let r2;
        const a2 = o2, l2 = s2;
        if (n2.some((e4) => void 0 !== a2[e4] && a2[e4] !== l2[e4])) {
          r2 = {};
          const e4 = r2;
          n2.forEach((t3) => {
            e4[t3] = void 0 !== a2[t3] ? a2[t3] : l2[t3], delete a2[t3];
          });
        }
        if (!r2 && (o2.minW || o2.minH || o2.maxW || o2.maxH) && (r2 = {}), void 0 !== o2.content) {
          const t3 = e3.querySelector(".grid-stack-item-content");
          t3 && t3.textContent !== o2.content && (s2.content = o2.content, z.renderCB(t3, o2), ((_a = s2.subGrid) == null ? void 0 : _a.el) && (t3.appendChild(s2.subGrid.el), s2.subGrid._updateContainerHeight())), delete o2.content;
        }
        let h2 = false, d2 = false;
        for (const e4 in a2) "_" !== e4[0] && l2[e4] !== a2[e4] && (l2[e4] = a2[e4], h2 = true, d2 = d2 || !this.opts.staticGrid && ("noResize" === e4 || "noMove" === e4 || "locked" === e4));
        if (i.sanitizeMinMax(s2), r2) {
          const e4 = void 0 !== r2.w && r2.w !== s2.w;
          this.moveNode(s2, r2), e4 && s2.subGrid ? s2.subGrid.onResize(this.hasAnimationCSS() ? s2.w : void 0) : this.resizeToContentCheck(e4, s2), delete s2._orig;
        }
        (r2 || h2) && this._writeAttr(e3, s2), d2 && this.prepareDragDrop(s2.el), z.updateCB && z.updateCB(s2);
      }), this;
    }
    moveNode(e2, t2) {
      const i2 = e2._updating;
      i2 || this.engine.cleanNodes().beginUpdate(e2), this.engine.moveNode(e2, t2), this._updateContainerHeight(), i2 || (this._triggerChangeEvent(), this.engine.endUpdate());
    }
    resizeToContent(e2) {
      var _a, _b;
      if (!e2) return;
      if (e2.classList.remove("size-to-content-max"), !e2.clientHeight) return;
      const t2 = e2.gridstackNode;
      if (!t2) return;
      const i2 = t2.grid;
      if (!i2 || e2.parentElement !== i2.el) return;
      const s2 = i2.getCellHeight(true);
      if (!s2) return;
      let o2 = t2.h ? t2.h * s2 : e2.clientHeight, n2 = null;
      if (t2.resizeToContentParent && (n2 = e2.querySelector(t2.resizeToContentParent)), n2 || (n2 = e2.querySelector(z.resizeToContentParent)), !n2) return;
      const r2 = e2.clientHeight - n2.clientHeight, a2 = t2.h ? t2.h * s2 - r2 : n2.clientHeight;
      let l2;
      if (t2.subGrid) {
        l2 = t2.subGrid.getRow() * t2.subGrid.getCellHeight(true);
        const i3 = t2.subGrid.el.getBoundingClientRect(), s3 = e2.getBoundingClientRect();
        l2 += i3.top - s3.top;
      } else {
        if ((_b = (_a = t2.subGridOpts) == null ? void 0 : _a.children) == null ? void 0 : _b.length) return;
        {
          const e3 = n2.firstElementChild;
          if (!e3) return void console.error(`Error: GridStack.resizeToContent() widget id:${t2.id} '${z.resizeToContentParent}'.firstElementChild is null, make sure to have a div like container. Skipping sizing.`);
          l2 = e3.getBoundingClientRect().height || a2;
        }
      }
      if (a2 === l2) return;
      o2 += l2 - a2;
      let h2 = Math.ceil(o2 / s2);
      const d2 = Number.isInteger(t2.sizeToContent) ? t2.sizeToContent : 0;
      d2 && h2 > d2 && (h2 = d2, e2.classList.add("size-to-content-max")), t2.minH && h2 < t2.minH ? h2 = t2.minH : t2.maxH && h2 > t2.maxH && (h2 = t2.maxH), h2 !== t2.h && (i2._ignoreLayoutsNodeChange = true, i2.moveNode(t2, { h: h2 }), delete i2._ignoreLayoutsNodeChange);
    }
    resizeToContentCBCheck(e2) {
      z.resizeToContentCB ? z.resizeToContentCB(e2) : this.resizeToContent(e2);
    }
    rotate(e2, t2) {
      return z.getElements(e2).forEach((e3) => {
        const s2 = e3.gridstackNode;
        if (!s2 || !i.canBeRotated(s2)) return;
        const o2 = { w: s2.h, h: s2.w, minH: s2.minW, minW: s2.minH, maxH: s2.maxW, maxW: s2.maxH };
        if (t2) {
          const e4 = t2.left > 0 ? Math.floor(t2.left / this.cellWidth()) : 0, i2 = t2.top > 0 ? Math.floor(t2.top / this.opts.cellHeight) : 0;
          o2.x = s2.x + e4 - (s2.h - (i2 + 1)), o2.y = s2.y + i2 - e4;
        }
        const n2 = o2;
        Object.keys(n2).forEach((e4) => {
          void 0 === n2[e4] && delete n2[e4];
        });
        const r2 = s2._orig;
        this.update(e3, o2), s2._orig = r2;
      }), this;
    }
    margin(e2) {
      if (!("string" == typeof e2 && e2.split(" ").length > 1)) {
        const t2 = i.parseHeight(e2);
        if (this.opts.marginUnit === t2.unit && this.opts.margin === t2.h) return this;
      }
      return this.opts.margin = e2, this.opts.marginTop = this.opts.marginBottom = this.opts.marginLeft = this.opts.marginRight = void 0, this._initMargin(), this;
    }
    getMargin() {
      return this.opts.margin;
    }
    willItFit(e2) {
      return this.engine.willItFit(e2);
    }
    _triggerChangeEvent() {
      if (this.engine.batchMode) return this;
      const e2 = this.engine.getDirtyNodes(true);
      return e2 && e2.length && (this._ignoreLayoutsNodeChange || this.engine.layoutsNodesChange(e2), this._triggerEvent("change", e2)), this.engine.saveInitial(), this._sortDom(), this;
    }
    _sortDom() {
      var _a;
      let e2 = this.engine.nodes;
      if (e2.forEach((e3) => {
        e3.subGrid && e3.subGrid._sortDom();
      }), e2.length < 2) return this;
      this.engine.sortNodes(), e2 = this.engine.nodes;
      const t2 = this.el.children;
      if (e2.some((e3, i2) => e3.el !== t2[i2])) {
        const t3 = (_a = this.el.moveBefore) == null ? void 0 : _a.bind(this.el);
        e2.forEach((e3) => {
          e3.el && e3.el.parentElement === this.el && (t3 ? t3(e3.el, null) : this.el.appendChild(e3.el));
        });
      }
      return this;
    }
    _triggerAddEvent() {
      var _a;
      if (this.engine.batchMode) return this;
      if ((_a = this.engine.addedNodes) == null ? void 0 : _a.length) {
        this._ignoreLayoutsNodeChange || this.engine.layoutsNodesChange(this.engine.addedNodes), this.engine.addedNodes.forEach((e3) => {
          delete e3._dirty;
        });
        const e2 = [...this.engine.addedNodes];
        this.engine.addedNodes = [], this._triggerEvent("added", e2);
      }
      return this;
    }
    _triggerRemoveEvent() {
      var _a;
      if (this.engine.batchMode) return this;
      if ((_a = this.engine.removedNodes) == null ? void 0 : _a.length) {
        const e2 = [...this.engine.removedNodes];
        this.engine.removedNodes = [], this._triggerEvent("removed", e2);
      }
      return this;
    }
    _triggerEvent(e2, t2) {
      const i2 = t2 ? new CustomEvent(e2, { bubbles: false, detail: t2 }) : new Event(e2);
      let s2 = this;
      for (; s2.parentGridNode; ) s2 = s2.parentGridNode.grid;
      return s2.el.dispatchEvent(i2), this;
    }
    _updateContainerHeight() {
      if (!this.engine || this.engine.batchMode) return this;
      const e2 = this.parentGridNode;
      let t2 = this.getRow() + this._extraDragRow;
      const s2 = this.opts.cellHeight, o2 = this.opts.cellHeightUnit;
      if (!s2) return this;
      if (!e2 && !this.opts.minRow) {
        const e3 = i.parseHeight(getComputedStyle(this.el).minHeight);
        if (e3.h > 0 && e3.unit === o2) {
          const i2 = Math.floor(e3.h / s2);
          t2 < i2 && (t2 = i2);
        }
      }
      return this.el.setAttribute("gs-current-row", String(t2)), this.el.style.removeProperty("min-height"), this.el.style.removeProperty("height"), t2 && (this.el.style[e2 ? "minHeight" : "height"] = t2 * s2 + o2), e2 && i.shouldSizeToContent(e2) && e2.grid.resizeToContentCBCheck(e2.el), this;
    }
    _prepareElement(e2, t2 = false, s2) {
      s2 = s2 || this._readAttr(e2), e2.gridstackNode = s2, s2.el = e2, s2.grid = this, s2 = this.engine.addNode(s2, t2), this._writeAttr(e2, s2), e2.classList.add(o.itemClass, this.opts.itemClass);
      const n2 = i.shouldSizeToContent(s2);
      return n2 ? e2.classList.add("size-to-content") : e2.classList.remove("size-to-content"), n2 && this.resizeToContentCheck(false, s2), i.lazyLoad(s2) && s2.visibleObservable || this.prepareDragDrop(s2.el), this;
    }
    _writePosAttr(e2, t2) {
      var _a, _b;
      if (!t2._moving && !t2._resizing || this._placeholder === e2) {
        const i2 = this.opts.rtl ? "right" : "left", s2 = e2.style;
        s2.top = t2.y ? 1 === t2.y ? "var(--gs-cell-height)" : `calc(${t2.y} * var(--gs-cell-height))` : null, s2[i2] = t2.x ? 1 === t2.x ? "var(--gs-column-width)" : `calc(${t2.x} * var(--gs-column-width))` : null, s2.width = t2.w > 1 ? `calc(${t2.w} * var(--gs-column-width))` : null, s2.height = t2.h > 1 ? `calc(${t2.h} * var(--gs-cell-height))` : null;
      }
      return e2.style.setProperty("--gs-x", String(t2.x || 0)), e2.style.setProperty("--gs-y", String(t2.y || 0)), e2.style.setProperty("--gs-w", String(t2.w || 1)), e2.style.setProperty("--gs-h", String(t2.h || 1)), e2.setAttribute("gs-x", String((_a = t2.x) != null ? _a : 0)), e2.setAttribute("gs-y", String((_b = t2.y) != null ? _b : 0)), t2.w > 1 ? e2.setAttribute("gs-w", String(t2.w)) : e2.removeAttribute("gs-w"), t2.h > 1 ? e2.setAttribute("gs-h", String(t2.h)) : e2.removeAttribute("gs-h"), this;
    }
    _writeAttr(e2, t2) {
      if (!t2) return this;
      this._writePosAttr(e2, t2);
      const i2 = t2, s2 = { noResize: "gs-no-resize", noMove: "gs-no-move", locked: "gs-locked", id: "gs-id", sizeToContent: "gs-size-to-content" };
      for (const t3 in s2) void 0 !== i2[t3] && null !== i2[t3] && false !== i2[t3] ? e2.setAttribute(s2[t3], String(i2[t3])) : e2.removeAttribute(s2[t3]);
      const o2 = t2.print;
      return o2 ? (o2.pageBreak ? e2.setAttribute("gs-page-break", String(o2.pageBreak)) : e2.removeAttribute("gs-page-break"), o2.hide ? e2.classList.add("gs-print-hide") : e2.classList.remove("gs-print-hide"), o2.orientation ? e2.setAttribute("gs-print-orientation", String(o2.orientation)) : e2.removeAttribute("gs-print-orientation"), o2.breakInside ? e2.setAttribute("gs-break-inside", String(o2.breakInside)) : e2.removeAttribute("gs-break-inside")) : (e2.removeAttribute("gs-page-break"), e2.classList.remove("gs-print-hide"), e2.removeAttribute("gs-print-orientation"), e2.removeAttribute("gs-break-inside")), this;
    }
    _readAttr(e2, t2 = true) {
      var _a;
      const s2 = {};
      s2.x = i.toNumber(e2.getAttribute("gs-x")), s2.y = i.toNumber(e2.getAttribute("gs-y")), s2.w = i.toNumber(e2.getAttribute("gs-w")), s2.h = i.toNumber(e2.getAttribute("gs-h")), s2.autoPosition = i.toBool(e2.getAttribute("gs-auto-position")), s2.noResize = i.toBool(e2.getAttribute("gs-no-resize")), s2.noMove = i.toBool(e2.getAttribute("gs-no-move")), s2.locked = i.toBool(e2.getAttribute("gs-locked"));
      let o2 = e2.getAttribute("gs-page-break"), n2 = e2.classList.contains("gs-print-hide"), r2 = e2.getAttribute("gs-print-orientation"), a2 = e2.getAttribute("gs-break-inside");
      (o2 || n2 || r2 || a2) && (s2.print = {}, o2 && (s2.print.pageBreak = i.toBool(o2)), n2 && (s2.print.hide = true), r2 && (s2.print.orientation = r2), a2 && (s2.print.breakInside = i.toBool(a2)));
      const l2 = e2.getAttribute("gs-size-to-content");
      l2 && (s2.sizeToContent = "true" === l2 || "false" === l2 ? i.toBool(l2) : parseInt(l2, 10)), s2.id = (_a = e2.getAttribute("gs-id")) != null ? _a : void 0, s2.maxW = i.toNumber(e2.getAttribute("gs-max-w")), s2.minW = i.toNumber(e2.getAttribute("gs-min-w")), s2.maxH = i.toNumber(e2.getAttribute("gs-max-h")), s2.minH = i.toNumber(e2.getAttribute("gs-min-h")), t2 && (1 === s2.w && e2.removeAttribute("gs-w"), 1 === s2.h && e2.removeAttribute("gs-h"), s2.maxW && e2.removeAttribute("gs-max-w"), s2.minW && e2.removeAttribute("gs-min-w"), s2.maxH && e2.removeAttribute("gs-max-h"), s2.minH && e2.removeAttribute("gs-min-h"));
      const h2 = s2;
      for (const e3 in h2) s2.hasOwnProperty(e3) && (h2[e3] || 0 === h2[e3] || "sizeToContent" === e3 || delete h2[e3]);
      return s2;
    }
    _setStaticClass() {
      const e2 = ["grid-stack-static"];
      return this.opts.staticGrid ? (this.el.classList.add(...e2), this.el.setAttribute("gs-static", "true")) : (this.el.classList.remove(...e2), this.el.removeAttribute("gs-static")), this;
    }
    onResize(e2 = ((_a) => (_a = this.el) == null ? void 0 : _a.clientWidth)()) {
      if (!e2) return this;
      if (this.prevWidth === e2) return this;
      this.prevWidth = e2, this.batchUpdate();
      let t2 = false;
      return this._autoColumn && this.parentGridNode ? this.opts.column !== this.parentGridNode.w && (this.column(this.parentGridNode.w, this.opts.layout || "list"), t2 = true) : t2 = this.checkDynamicColumn(), this._isAutoCellHeight && this.cellHeight(), this.engine.nodes.forEach((e3) => {
        e3.subGrid && e3.subGrid.onResize();
      }), this._skipInitialResize || this.resizeToContentCheck(t2), delete this._skipInitialResize, this.batchUpdate(false), this;
    }
    resizeToContentCheck(e2 = false, t2) {
      if (!this.engine) return;
      if (e2 && this.hasAnimationCSS()) return void setTimeout(() => this.resizeToContentCheck(false, t2), this.animationDelay);
      if (t2) i.shouldSizeToContent(t2) && this.resizeToContentCBCheck(t2.el);
      else if (this.engine.nodes.some((e3) => i.shouldSizeToContent(e3))) {
        const e3 = [...this.engine.nodes];
        this.batchUpdate(), e3.forEach((e4) => {
          i.shouldSizeToContent(e4) && this.resizeToContentCBCheck(e4.el);
        }), this._ignoreLayoutsNodeChange = true, this.batchUpdate(false), this._ignoreLayoutsNodeChange = false;
      }
      const s2 = this._gsEventHandler.resizecontent;
      s2 && s2(new Event("resizecontent"), t2 ? [t2] : this.engine.nodes);
    }
    _updateResizeEvent(e2 = false) {
      const t2 = !this.parentGridNode && (this._isAutoCellHeight || this.opts.sizeToContent || this.opts.columnOpts || this.engine.nodes.find((e3) => e3.sizeToContent));
      return e2 || !t2 || this.resizeObserver ? !e2 && t2 || !this.resizeObserver || (this.resizeObserver.disconnect(), delete this.resizeObserver, delete this._sizeThrottle) : (this._sizeThrottle = i.throttle(() => this.onResize(), this.opts.cellHeightThrottle), this.resizeObserver = new ResizeObserver(() => this._sizeThrottle()), this.resizeObserver.observe(this.el), this._skipInitialResize = true), this;
    }
    static getElement(e2 = ".grid-stack-item") {
      return i.getElement(e2);
    }
    static getElements(e2 = ".grid-stack-item") {
      return i.getElements(e2);
    }
    static getGridElement(e2) {
      return z.getElement(e2);
    }
    static getGridElements(e2) {
      return i.getElements(e2);
    }
    _initMargin() {
      let e2 = { h: 0, unit: "px" }, t2 = 0, s2 = [];
      "string" == typeof this.opts.margin && (s2 = this.opts.margin.split(" ")), 2 === s2.length ? (this.opts.marginTop = this.opts.marginBottom = s2[0], this.opts.marginLeft = this.opts.marginRight = s2[1]) : 4 === s2.length ? (this.opts.marginTop = s2[0], this.opts.marginRight = s2[1], this.opts.marginBottom = s2[2], this.opts.marginLeft = s2[3]) : (e2 = i.parseHeight(this.opts.margin), this.opts.marginUnit = e2.unit, t2 = this.opts.margin = e2.h);
      const o2 = this.opts;
      ["marginTop", "marginRight", "marginBottom", "marginLeft"].forEach((s3) => {
        void 0 === o2[s3] ? o2[s3] = t2 : (e2 = i.parseHeight(o2[s3]), o2[s3] = e2.h, delete this.opts.margin);
      }), this.opts.marginUnit = e2.unit, this.opts.marginTop === this.opts.marginBottom && this.opts.marginLeft === this.opts.marginRight && this.opts.marginTop === this.opts.marginRight && (this.opts.margin = this.opts.marginTop);
      const n2 = this.el.style;
      return n2.setProperty("--gs-item-margin-top", `${this.opts.marginTop}${this.opts.marginUnit}`), n2.setProperty("--gs-item-margin-bottom", `${this.opts.marginBottom}${this.opts.marginUnit}`), n2.setProperty("--gs-item-margin-right", `${this.opts.marginRight}${this.opts.marginUnit}`), n2.setProperty("--gs-item-margin-left", `${this.opts.marginLeft}${this.opts.marginUnit}`), this;
    }
    static getDD() {
      return k;
    }
    static setupDragIn(e2, t2, s2, o2 = document) {
      void 0 !== (t2 == null ? void 0 : t2.pause) && (n.pauseDrag = t2.pause), t2 = { appendTo: "body", helper: "clone", ...t2 || {} }, ("string" == typeof e2 ? i.getElements(e2, o2) : e2).forEach((e3, i2) => {
        k.isDraggable(e3) || k.dragIn(e3, t2), (s2 == null ? void 0 : s2[i2]) && (e3.gridstackNode = s2[i2]);
      });
    }
    movable(e2, t2) {
      return this.opts.staticGrid || z.getElements(e2).forEach((e3) => {
        const i2 = e3.gridstackNode;
        i2 && (t2 ? delete i2.noMove : i2.noMove = true, this.prepareDragDrop(i2.el));
      }), this;
    }
    resizable(e2, t2) {
      return this.opts.staticGrid || z.getElements(e2).forEach((e3) => {
        const i2 = e3.gridstackNode;
        i2 && (t2 ? delete i2.noResize : i2.noResize = true, this.prepareDragDrop(i2.el));
      }), this;
    }
    disable(e2 = true) {
      return this.opts.staticGrid || (this.enableMove(false, e2), this.enableResize(false, e2), this._triggerEvent("disable")), this;
    }
    enable(e2 = true) {
      return this.opts.staticGrid || (this.enableMove(true, e2), this.enableResize(true, e2), this._triggerEvent("enable")), this;
    }
    enableMove(e2, t2 = true) {
      return this.opts.staticGrid || (e2 ? delete this.opts.disableDrag : this.opts.disableDrag = true, this.engine.nodes.forEach((i2) => {
        this.prepareDragDrop(i2.el), i2.subGrid && t2 && i2.subGrid.enableMove(e2, t2);
      })), this;
    }
    enableResize(e2, t2 = true) {
      return this.opts.staticGrid || (e2 ? delete this.opts.disableResize : this.opts.disableResize = true, this.engine.nodes.forEach((i2) => {
        this.prepareDragDrop(i2.el), i2.subGrid && t2 && i2.subGrid.enableResize(e2, t2);
      })), this;
    }
    cancelDrag() {
      var _a, _b, _c;
      const e2 = (_a = n.dragElement) == null ? void 0 : _a.el;
      if (e2 == null ? void 0 : e2._gridstackNodeOrig) {
        const t3 = e2._gridstackNodeOrig, i2 = t3.grid, s2 = (_b = this._placeholder) == null ? void 0 : _b.gridstackNode;
        return s2 && (s2._isAboutToRemove = true, this.engine.removeNode(s2)), this.engine.restoreInitial(), e2.gridstackNode = t3, delete e2._gridstackNodeOrig, delete n.dropElement, void (i2 && (i2.engine.addNode(t3, false), i2.engine.restoreInitial()));
      }
      const t2 = (_c = this._placeholder) == null ? void 0 : _c.gridstackNode;
      t2 && (t2._isExternal ? (t2._isAboutToRemove = true, this.engine.removeNode(t2)) : t2._isAboutToRemove && z._itemRemoving(t2.el, false), this.engine.restoreInitial());
    }
    _removeDD(e2) {
      return k.draggable(e2, "destroy").resizable(e2, "destroy"), e2.gridstackNode && delete e2.gridstackNode._initDD, delete e2.ddElement, this;
    }
    _setupAcceptWidget() {
      if (this.opts.staticGrid || !this.opts.acceptWidgets && !this.opts.removable) return k.droppable(this.el, "destroy"), this;
      let e2, t2;
      const s2 = (s3, o2, n2) => {
        var _a;
        const r2 = (n2 = n2 || o2).gridstackNode;
        if (!r2) return;
        if (!((_a = r2.grid) == null ? void 0 : _a.el)) {
          n2.style.transform = `scale(${1 / this.dragTransform.xScale},${1 / this.dragTransform.yScale})`;
          const e3 = n2.getBoundingClientRect();
          n2.style.left = e3.x + (this.dragTransform.xScale - 1) * (s3.clientX - e3.x) / this.dragTransform.xScale + "px", n2.style.top = e3.y + (this.dragTransform.yScale - 1) * (s3.clientY - e3.y) / this.dragTransform.yScale + "px", n2.style.transformOrigin = "0px 0px";
        }
        let { top: a2, left: l2 } = n2.getBoundingClientRect();
        const h2 = this.el.getBoundingClientRect();
        l2 -= h2.left, a2 -= h2.top;
        const d2 = { position: { top: a2 * this.dragTransform.xScale, left: l2 * this.dragTransform.yScale } };
        if (r2._temporaryRemoved) {
          if (r2.x = Math.max(0, Math.round(l2 / t2)), r2.y = Math.max(0, Math.round(a2 / e2)), delete r2.autoPosition, this.engine.nodeBoundFix(r2), !this.engine.willItFit(r2)) {
            if (r2.autoPosition = true, !this.engine.willItFit(r2)) return void k.off(o2, "drag");
            r2._willFitPos && (i.copyPos(r2, r2._willFitPos), delete r2._willFitPos);
          }
          this._onStartMoving(n2, s3, d2, r2, t2, e2);
        } else this._dragOrResize(n2, s3, d2, r2, t2, e2);
      };
      return k.droppable(this.el, { accept: (e3) => {
        const t3 = e3.gridstackNode || this._readAttr(e3, false);
        if ((t3 == null ? void 0 : t3.grid) === this) return true;
        if (!this.opts.acceptWidgets) return false;
        let i2 = true;
        if ("function" == typeof this.opts.acceptWidgets) i2 = this.opts.acceptWidgets(e3);
        else {
          const t4 = true === this.opts.acceptWidgets ? ".grid-stack-item" : this.opts.acceptWidgets;
          i2 = e3.matches(t4);
        }
        if (i2 && t3 && this.opts.maxRow) {
          const e4 = { w: t3.w, h: t3.h, minW: t3.minW, minH: t3.minH };
          i2 = this.engine.willItFit(e4);
        }
        return i2;
      } }).on(this.el, "dropover", (i2, o2, n2) => {
        let r2 = (n2 == null ? void 0 : n2.gridstackNode) || o2.gridstackNode;
        if ((r2 == null ? void 0 : r2.grid) === this && !r2._temporaryRemoved) return false;
        if ((r2 == null ? void 0 : r2._sidebarOrig) && (r2.w = r2._sidebarOrig.w, r2.h = r2._sidebarOrig.h), (r2 == null ? void 0 : r2.grid) && r2.grid !== this && !r2._temporaryRemoved && r2.grid._leave(o2, n2), n2 = n2 || o2, t2 = this.cellWidth(), e2 = this.getCellHeight(true), !r2) {
          const e3 = n2.getAttribute("data-gs-widget") || n2.getAttribute("gridstacknode");
          if (e3) {
            try {
              r2 = JSON.parse(e3);
            } catch (t3) {
              console.error("Gridstack dropover: Bad JSON format: ", e3);
            }
            n2.removeAttribute("data-gs-widget"), n2.removeAttribute("gridstacknode");
          }
          r2 || (r2 = this._readAttr(n2)), r2._sidebarOrig = { w: r2.w, h: r2.h };
        }
        r2.grid || (r2.el || (r2 = { ...r2 }), r2._isExternal = true, n2.gridstackNode = r2);
        const a2 = r2.w || Math.round(n2.offsetWidth / t2) || 1, l2 = r2.h || Math.round(n2.offsetHeight / e2) || 1;
        return r2.grid && r2.grid !== this ? (o2._gridstackNodeOrig || (o2._gridstackNodeOrig = r2), o2.gridstackNode = r2 = { ...r2, w: a2, h: l2, grid: this }, delete r2.x, delete r2.y, this.engine.cleanupNode(r2).nodeBoundFix(r2), r2._initDD = r2._isExternal = r2._temporaryRemoved = true) : (r2.w = a2, r2.h = l2, r2._temporaryRemoved = true), z._itemRemoving(r2.el, false), k.on(o2, "drag", s2), s2(i2, o2, n2), false;
      }).on(this.el, "dropout", (e3, t3, i2) => {
        const s3 = (i2 == null ? void 0 : i2.gridstackNode) || t3.gridstackNode;
        return !!s3 && (s3.grid && s3.grid !== this || (this._leave(t3, i2), this._isTemp && this.removeAsSubGrid(s3)), false);
      }).on(this.el, "drop", (e3, t3, s3) => {
        var _a, _b, _c;
        const o2 = (s3 == null ? void 0 : s3.gridstackNode) || t3.gridstackNode;
        if ((o2 == null ? void 0 : o2.grid) === this && !o2._isExternal) return false;
        const n2 = !!this.placeholder.parentElement, r2 = t3 !== s3;
        this.placeholder.remove(), delete this.placeholder.gridstackNode, n2 && this.opts.animate && (this.setAnimation(false), this.setAnimation(true, true));
        const a2 = t3._gridstackNodeOrig;
        if (delete t3._gridstackNodeOrig, n2 && (a2 == null ? void 0 : a2.grid) && a2.grid !== this) {
          const e4 = a2.grid;
          e4.engine.removeNodeFromLayoutCache(a2), e4.engine.removedNodes.push(a2), e4._triggerRemoveEvent()._triggerChangeEvent(), e4.parentGridNode && !e4.engine.nodes.length && e4.opts.subGridDynamic && e4.removeAsSubGrid();
        }
        if (!o2) return false;
        if (n2 && (this.engine.cleanupNode(o2), o2.grid = this), (_a = o2.grid) == null ? true : delete _a._isTemp, k.off(t3, "drag"), s3 && s3 !== t3 ? (s3.remove(), t3 = s3) : t3.remove(), this._removeDD(t3), !n2) return false;
        const l2 = (_c = (_b = o2.subGrid) == null ? void 0 : _b.el) == null ? void 0 : _c.gridstack;
        return i.copyPos(o2, this._readAttr(this.placeholder)), i.removePositioningStyles(t3), r2 && (o2.content || o2.subGridOpts || z.addRemoveCB) ? (delete o2.el, t3 = this.addWidget(o2) || t3) : (this._prepareElement(t3, true, o2), this.el.appendChild(t3), this.resizeToContentCheck(false, o2), l2 && (l2.parentGridNode = o2), this._updateContainerHeight()), this.engine.addedNodes.push(o2), this._triggerAddEvent(), this._triggerChangeEvent(), this.engine.endUpdate(), this._gsEventHandler.dropped && this._gsEventHandler.dropped({ ...e3, type: "dropped" }, a2 && a2.grid ? a2 : void 0, o2), false;
      }), this;
    }
    static _itemRemoving(e2, t2) {
      if (!e2) return;
      const i2 = e2 ? e2.gridstackNode : void 0;
      (i2 == null ? void 0 : i2.grid) && !e2.classList.contains(i2.grid.opts.removableOptions.decline) && (t2 ? i2._isAboutToRemove = true : delete i2._isAboutToRemove, t2 ? e2.classList.add("grid-stack-item-removing") : e2.classList.remove("grid-stack-item-removing"));
    }
    _setupRemoveDrop() {
      if ("string" != typeof this.opts.removable) return this;
      const e2 = document.querySelector(this.opts.removable);
      return e2 ? (this.opts.staticGrid || k.isDroppable(e2) || k.droppable(e2, this.opts.removableOptions).on(e2, "dropover", (e3, t2) => z._itemRemoving(t2, true)).on(e2, "dropout", (e3, t2) => z._itemRemoving(t2, false)), this) : this;
    }
    refreshDragHandles(e2) {
      return z.getElements(e2).forEach((e3) => {
        var _a, _b;
        (_b = (_a = e3.ddElement) == null ? void 0 : _a.ddDraggable) == null ? void 0 : _b.refreshHandles();
      }), this;
    }
    prepareDragDrop(e2, t2 = false) {
      const s2 = e2 == null ? void 0 : e2.gridstackNode;
      if (!s2) return this;
      const o2 = s2.noMove || this.opts.disableDrag, n2 = s2.noResize || this.opts.disableResize, r2 = this.opts.staticGrid || o2 && n2;
      if ((t2 || r2) && (s2._initDD && (this._removeDD(e2), delete s2._initDD), r2)) return e2.classList.add("ui-draggable-disabled", "ui-resizable-disabled"), this;
      if (!s2._initDD) {
        let t3, o3;
        const n3 = (i2, n4) => {
          this.triggerEvent(i2, i2.target), t3 = this.cellWidth(), o3 = this.getCellHeight(true), this._onStartMoving(e2, i2, n4, s2, t3, o3);
        }, r3 = (i2, n4) => {
          this._dragOrResize(e2, i2, n4, s2, t3, o3);
        }, a2 = (t4) => {
          this.placeholder.remove(), delete this.placeholder.gridstackNode, delete s2._moving, delete s2._resizing, delete s2._event, delete s2._lastTried;
          const o4 = s2.w !== s2._orig.w, n4 = t4.target;
          if (n4.gridstackNode && n4.gridstackNode.grid === this) {
            if (s2.el = n4, s2._isAboutToRemove) {
              const i2 = e2.gridstackNode.grid;
              i2._gsEventHandler[t4.type] && i2._gsEventHandler[t4.type](t4, n4), i2.engine.nodes.push(s2), i2.removeWidget(e2, true, true);
            } else i.removePositioningStyles(n4), s2._temporaryRemoved ? (this._writePosAttr(n4, s2), this.engine.addNode(s2)) : this._writePosAttr(n4, s2), this.triggerEvent(t4, n4);
            this._extraDragRow = 0, this._updateContainerHeight(), this._triggerChangeEvent(), this.engine.endUpdate(), "resizestop" === t4.type && (Number.isInteger(s2.sizeToContent) && (s2.sizeToContent = s2.h), this.resizeToContentCheck(o4, s2));
          }
        };
        k.draggable(e2, { start: n3, stop: a2, drag: r3, rtl: "auto" === this.opts.rtl ? void 0 : this.opts.rtl }).resizable(e2, { start: n3, stop: a2, resize: r3, rtl: "auto" === this.opts.rtl ? void 0 : this.opts.rtl }), s2._initDD = true;
      }
      return k.draggable(e2, o2 ? "disable" : "enable").resizable(e2, n2 ? "disable" : "enable"), this;
    }
    _onStartMoving(e2, t2, s2, o2, n2, r2) {
      var _a;
      if (this.engine.cleanNodes().beginUpdate(o2), this._writePosAttr(this.placeholder, o2), this.el.appendChild(this.placeholder), this.placeholder.gridstackNode = o2, (_a = o2.grid) == null ? void 0 : _a.el) this.dragTransform = i.getValuesFromTransformedElement(e2);
      else if (this.placeholder && this.placeholder.closest(".grid-stack")) {
        const e3 = this.placeholder.closest(".grid-stack");
        this.dragTransform = i.getValuesFromTransformedElement(e3);
      } else this.dragTransform = { xScale: 1, xOffset: 0, yScale: 1, yOffset: 0 };
      if (o2.el = this.placeholder, o2._lastUiPosition = s2.position, o2._prevYPix = s2.position.top, o2._moving = "dragstart" === t2.type, o2._resizing = "resizestart" === t2.type, delete o2._lastTried, "dropover" === t2.type && o2._temporaryRemoved && (this.engine.addNode(o2), o2._moving = true), this.engine.cacheRects(n2, r2, this.opts.marginTop, this.opts.marginRight, this.opts.marginBottom, this.opts.marginLeft), "resizestart" === t2.type) {
        const t3 = this.getColumn() - o2.x, i2 = (this.opts.maxRow || Number.MAX_SAFE_INTEGER) - o2.y;
        k.resizable(e2, "option", "minWidth", n2 * Math.min(o2.minW || 1, t3)).resizable(e2, "option", "minHeight", r2 * Math.min(o2.minH || 1, i2)).resizable(e2, "option", "maxWidth", n2 * Math.min(o2.maxW || Number.MAX_SAFE_INTEGER, t3)).resizable(e2, "option", "maxWidthMoveLeft", n2 * Math.min(o2.maxW || Number.MAX_SAFE_INTEGER, o2.x + o2.w)).resizable(e2, "option", "maxHeight", r2 * Math.min(o2.maxH || Number.MAX_SAFE_INTEGER, i2)).resizable(e2, "option", "maxHeightMoveUp", r2 * Math.min(o2.maxH || Number.MAX_SAFE_INTEGER, o2.y + o2.h));
      }
    }
    _dragOrResize(e2, t2, s2, o2, r2, a2) {
      var _a, _b;
      const l2 = { ...o2._orig };
      let h2 = false, d2 = this.opts.marginLeft, c2 = this.opts.marginRight, g2 = this.opts.marginTop, u2 = this.opts.marginBottom;
      const p2 = Math.round(0.1 * a2), m2 = Math.round(0.1 * r2);
      if (d2 = Math.min(d2, m2), c2 = Math.min(c2, m2), g2 = Math.min(g2, p2), u2 = Math.min(u2, p2), "drag" === t2.type) {
        if (o2._temporaryRemoved) return;
        o2._prevYPix = s2.position.top, false !== this.opts.draggable.scroll && ((_a = n.dragElement) == null ? void 0 : _a.updateScrollPosition(this.el));
        const e3 = s2.position.left + (s2.position.left > o2._lastUiPosition.left ? -c2 : d2), t3 = s2.position.top + (s2.position.top > o2._lastUiPosition.top ? -u2 : g2);
        l2.x = Math.round(e3 / r2), l2.y = Math.round(t3 / a2);
        const i2 = this._extraDragRow;
        if (this.engine.collide(o2, l2)) {
          const e4 = this.getRow();
          let t4 = Math.max(0, l2.y + o2.h - e4);
          this.opts.maxRow && e4 + t4 > this.opts.maxRow && (t4 = Math.max(0, this.opts.maxRow - e4)), this._extraDragRow = t4;
        } else this._extraDragRow = 0;
        if (this._extraDragRow !== i2 && this._updateContainerHeight(), o2.x === l2.x && o2.y === l2.y) return;
      } else if ("resize" === t2.type) {
        if (((_b = l2.x) != null ? _b : 0) < 0) return;
        if (i.updateScrollResize(t2, e2, a2), l2.w = Math.round((s2.size.width - d2) / r2), l2.h = Math.round((s2.size.height - g2) / a2), o2.w === l2.w && o2.h === l2.h) return;
        if (o2._lastTried && o2._lastTried.w === l2.w && o2._lastTried.h === l2.h) return;
        if (t2.hasMovedX) {
          const e3 = o2.x - (l2.w - o2.w);
          l2.x = e3 < 0 ? 0 : e3;
        }
        if (t2.hasMovedY) {
          const e3 = o2.y - (l2.h - o2.h);
          l2.y = e3 < 0 ? 0 : e3;
        }
        h2 = true;
      }
      o2._event = t2, o2._lastTried = l2;
      const f2 = { x: s2.position.left + d2, y: s2.position.top + g2, w: (s2.size ? s2.size.width : o2.w * r2) - d2 - c2, h: (s2.size ? s2.size.height : o2.h * a2) - g2 - u2 };
      if (this.engine.moveNodeCheck(o2, { ...l2, cellWidth: r2, cellHeight: a2, rect: f2, resizing: h2 })) {
        o2._lastUiPosition = s2.position, this.engine.cacheRects(r2, a2, g2, c2, u2, d2), delete o2._skipDown, h2 && o2.subGrid && o2.subGrid.onResize(), this._extraDragRow = 0, this._updateContainerHeight();
        const e3 = t2.target;
        o2._sidebarOrig || this._writePosAttr(e3, o2), this.triggerEvent(t2, e3);
      }
    }
    triggerEvent(e2, t2) {
      let i2 = this;
      for (; i2.parentGridNode; ) i2 = i2.parentGridNode.grid;
      i2._gsEventHandler[e2.type] && i2._gsEventHandler[e2.type](e2, t2);
    }
    _leave(e2, t2) {
      const i2 = (t2 = t2 || e2).gridstackNode;
      if (!i2) return;
      if (t2.style.transform = t2.style.transformOrigin = "", k.off(e2, "drag"), i2._temporaryRemoved) return;
      i2._temporaryRemoved = true, this.engine.removeNode(i2), i2.el = i2._isExternal && t2 ? t2 : e2;
      const s2 = i2._sidebarOrig;
      i2._isExternal && this.engine.cleanupNode(i2), i2._sidebarOrig = s2, true === this.opts.removable && z._itemRemoving(e2, true), e2._gridstackNodeOrig ? (e2.gridstackNode = e2._gridstackNodeOrig, delete e2._gridstackNodeOrig) : i2._isExternal && this.engine.restoreInitial();
    }
  }
  return z.renderCB = (e2, t2) => {
    e2 && (t2 == null ? void 0 : t2.content) && (e2.textContent = t2.content);
  }, z.resizeToContentParent = ".grid-stack-item-content", z.Utils = i, z.Engine = s, z.GDRev = "13.3.0", t.GridStack;
})());
