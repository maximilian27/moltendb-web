import { jsx as h } from "react/jsx-runtime";
import { createContext as p, useState as a, useRef as d, useEffect as D, useContext as w } from "react";
import { MoltenDb as E } from "@moltendb-web/core";
import { MoltenDbClient as P } from "@moltendb-web/query";
const y = p(null);
function z({ config: e, children: n }) {
  const [r, o] = a(!1), t = d(null), s = d(null);
  return t.current || (t.current = new E(e.name, e), s.current = new P(t.current)), D(() => {
    t.current.init().then(() => o(!0)).catch((u) => console.error("[MoltenDb] Failed to initialize", u));
  }, []), /* @__PURE__ */ h(
    y.Provider,
    {
      value: {
        db: t.current,
        client: s.current,
        isReady: r
      },
      children: n
    }
  );
}
function f() {
  const e = w(y);
  if (!e)
    throw new Error("[MoltenDb] useMoltenDbContext must be used inside <MoltenDbProvider>");
  return e;
}
function F() {
  return f().client;
}
function S() {
  return f().isReady;
}
function V(e) {
  const { db: n, isReady: r } = f();
  D(() => {
    if (r)
      return n.subscribe(e);
  }, [n, r, e]);
}
function k(e, n) {
  const { db: r, client: o, isReady: t } = f(), [s, u] = a(void 0), [x, M] = a(!1), [v, b] = a(null), m = d(n);
  return m.current = n, D(() => {
    if (!t) return;
    let c = !1;
    const R = async () => {
      var i;
      M(!0);
      try {
        const l = await m.current(o.collection(e), o);
        c || (u(l), b(null));
      } catch (l) {
        c || ((i = l.message) != null && i.includes("404") ? (u([]), b(null)) : b(l));
      } finally {
        c || M(!1);
      }
    };
    R();
    const C = r.subscribe((i) => {
      i.collection === e && R();
    });
    return () => {
      c = !0, C();
    };
  }, [t, e, r, o]), { value: s, isLoading: x, error: v };
}
export {
  z as MoltenDbProvider,
  F as useMoltenDb,
  V as useMoltenDbEvents,
  S as useMoltenDbReady,
  k as useMoltenDbResource
};
