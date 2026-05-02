import { jsx as h } from "react/jsx-runtime";
import { createContext as p, useState as f, useRef as d, useEffect as D, useContext as w } from "react";
import { MoltenDb as E } from "@moltendb-web/core";
import { MoltenDbClient as L } from "@moltendb-web/query";
const y = p(null);
function z({ config: e, children: n }) {
  const [r, s] = f(!1), t = d(null), u = d(null);
  return t.current || (t.current = new E(e.name, e), u.current = new L(t.current)), D(() => {
    t.current.init().then(() => s(!0)).catch((i) => console.error("[MoltenDb] Failed to initialize", i));
  }, []), /* @__PURE__ */ h(
    y.Provider,
    {
      value: {
        db: t.current,
        client: u.current,
        isReady: r
      },
      children: n
    }
  );
}
function o() {
  const e = w(y);
  if (!e)
    throw new Error("[MoltenDb] useMoltenDbContext must be used inside <MoltenDbProvider>");
  return e;
}
function F() {
  return o().client;
}
function S() {
  return o().isReady;
}
function T() {
  return o().db.isLeader;
}
function V() {
  const { db: e } = o();
  return () => e.terminate();
}
function k(e) {
  const { db: n, isReady: r } = o();
  D(() => {
    if (r)
      return n.subscribe(e);
  }, [n, r, e]);
}
function q(e, n) {
  const { db: r, client: s, isReady: t } = o(), [u, i] = f(void 0), [x, M] = f(!1), [v, b] = f(null), m = d(n);
  return m.current = n, D(() => {
    if (!t) return;
    let c = !1;
    const R = async () => {
      var l;
      M(!0);
      try {
        const a = await m.current(s.collection(e), s);
        c || (i(a), b(null));
      } catch (a) {
        c || ((l = a.message) != null && l.includes("404") ? (i([]), b(null)) : b(a));
      } finally {
        c || M(!1);
      }
    };
    R();
    const C = r.subscribe((l) => {
      l.collection === e && R();
    });
    return () => {
      c = !0, C();
    };
  }, [t, e, r, s]), { value: u, isLoading: x, error: v };
}
export {
  z as MoltenDbProvider,
  F as useMoltenDb,
  k as useMoltenDbEvents,
  T as useMoltenDbIsLeader,
  S as useMoltenDbReady,
  q as useMoltenDbResource,
  V as useMoltenDbTerminate
};
