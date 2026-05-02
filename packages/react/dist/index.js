import { jsx as h } from "react/jsx-runtime";
import { createContext as p, useState as a, useRef as b, useEffect as M, useContext as w } from "react";
import { MoltenDb as E } from "@moltendb-web/core";
import { MoltenDbClient as P } from "@moltendb-web/query";
const x = p(null);
function z({ config: e, children: r }) {
  const [o, n] = a(!1), t = b(null), s = b(null);
  return t.current || (t.current = new E(e.name, e), s.current = new P(t.current)), M(() => {
    t.current.init().then(() => n(!0)).catch((u) => console.error("[MoltenDb] Failed to initialize", u));
  }, []), /* @__PURE__ */ h(
    x.Provider,
    {
      value: {
        db: t.current,
        client: s.current,
        isReady: o
      },
      children: r
    }
  );
}
function R() {
  const e = w(x);
  if (!e)
    throw new Error("[MoltenDb] useMoltenDbContext must be used inside <MoltenDbProvider>");
  return e;
}
function F() {
  return R().client;
}
function S(e, r) {
  const { db: o, client: n, isReady: t } = R(), [s, u] = a(void 0), [v, d] = a(!1), [y, f] = a(null), D = b(r);
  return D.current = r, M(() => {
    if (!t) return;
    let l = !1;
    const m = async () => {
      var c;
      d(!0);
      try {
        const i = await D.current(n.collection(e), n);
        l || (u(i), f(null));
      } catch (i) {
        l || ((c = i.message) != null && c.includes("404") ? (u([]), f(null)) : f(i));
      } finally {
        l || d(!1);
      }
    };
    m();
    const C = o.subscribe((c) => {
      c.collection === e && m();
    });
    return () => {
      l = !0, C();
    };
  }, [t, e, o, n]), { value: s, isLoading: v, error: y };
}
export {
  x as MoltenDbContext,
  z as MoltenDbProvider,
  F as useMoltenDb,
  R as useMoltenDbContext,
  S as useMoltenDbResource
};
