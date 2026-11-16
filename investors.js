/* AI Deal Maps for Investors (investors.html): the plain-language guide with a portfolio self-check.
   Reads three same-origin files and nothing else:
     data/graph.json (or ../data/graph.json when the repo root is served and the page is /site/investors.html)
     investors-content.json   every word the reader sees, {en, zh}, with {placeholders}
     investors-reference.json company sizes, sales and fund estimates (python -m monitor investors-ref)
   Every per-company figure is computed here from the live graph; monitor/investors.py is the Python twin
   (tests/test_investors.py checks both give the same numbers). Not investment advice. */
(function () {
  "use strict";

  /* ================================================================ calculation (twin of monitor/investors.py) */
  var POOLED = ["bond-investors", "bank-lenders", "private-investors", "public-equity-investors"];
  var LABS = ["openai", "anthropic"];
  var CLOUDS = ["microsoft", "amazon", "alphabet"];
  var CUSTOMER_KINDS = ["order", "lease"];
  var BIG_INFLOW_USD = 5e9;
  var EXAMPLE_KEYS = ["labs50", "labs50c", "one50", "big", "on", "wlabs", "oa50", "an50"];
  var MATCH_RANK = { ticker: 0, share_class: 1, name: 2, inferred: 3 };

  function has(o, k) { return o != null && Object.prototype.hasOwnProperty.call(o, k); }
  function isAmount(v) { return typeof v === "number" && isFinite(v); }
  function inList(list, v) { return list.indexOf(v) >= 0; }
  function isLive(e) {
    var origin = has(e, "origin") ? e.origin : "curated";
    return origin === "curated" && e.status !== "cancelled" && !e.superseded_by;
  }
  function counted(e) { return isLive(e) && isAmount(e.amount_usd) && e.kind !== "guarantee"; }
  function liveGuarantee(e) { return isLive(e) && isAmount(e.amount_usd) && e.kind === "guarantee"; }
  function add(obj, k, v) { obj[k] = (has(obj, k) ? obj[k] : 0) + v; }
  function sumValues(obj) { var s = 0; Object.keys(obj).forEach(function (k) { s += obj[k]; }); return s; }
  function get(obj, k) { return has(obj, k) ? obj[k] : 0; }
  function sortedKeys(obj) { return Object.keys(obj).sort(function (a, b) { return a < b ? -1 : a > b ? 1 : 0; }); }
  /* the largest source by amount; ties go to the id that sorts first */
  function top(src, skip) {
    var best = null, amt = 0;
    sortedKeys(src).forEach(function (k) {
      if (skip && inList(skip, k)) return;
      if (best === null || src[k] > amt) { best = k; amt = src[k]; }
    });
    return [best, amt];
  }
  function ratio(a, b) { return b ? a / b : null; }

  function revenueByEntity(ref) {
    var out = {};
    ((ref && ref.tickers) || []).forEach(function (x) {
      var eid = x.entity, rev = x.ttm_revenue_usd;
      if (!eid || !isAmount(rev) || rev <= 0) return;
      var r = has(MATCH_RANK, x.match) ? MATCH_RANK[x.match] : 9;
      if (!has(out, eid) || r < out[eid][0]) out[eid] = [r, rev];
    });
    var res = {};
    Object.keys(out).forEach(function (k) { res[k] = out[k][1]; });
    return res;
  }

  function liveMetrics(graph, ref) {
    var edges = ((graph && graph.edges) || []).filter(function (e) { return e && typeof e === "object"; });
    var inflow = {}, cust = {}, outflow = {}, guarOut = {};
    var total = 0, guarantees = 0, custTotal = 0, labsOrders = 0, cloudInv = 0, labsToClouds = 0, oracleOpenai = 0;
    edges.forEach(function (e) {
      var a = e.amount_usd, f = e.from, t = e.to, k = e.kind;
      if (liveGuarantee(e)) { guarantees += a; add(guarOut, f, a); return; }
      if (!counted(e)) return;
      total += a;
      if (!has(inflow, t)) inflow[t] = {};
      add(inflow[t], f, a);
      add(outflow, f, a);
      if (inList(CUSTOMER_KINDS, k)) {
        if (!has(cust, t)) cust[t] = {};
        add(cust[t], f, a);
        custTotal += a;
        if (inList(LABS, f)) {
          labsOrders += a;
          if (inList(CLOUDS, t)) labsToClouds += a;
        }
        if (f === "openai" && t === "oracle") oracleOpenai += a;
      }
      if (k === "investment" && inList(CLOUDS, f) && inList(LABS, t)) cloudInv += a;
    });
    var revenue = revenueByEntity(ref);
    var ids = [], seen = {};
    ((graph && graph.entities) || []).forEach(function (x) {
      if (x && typeof x === "object" && x.id && !has(seen, x.id)) { seen[x.id] = 1; ids.push(x.id); }
    });
    edges.forEach(function (e) {
      ["from", "to"].forEach(function (k) { if (e[k] && !has(seen, e[k])) { seen[e[k]] = 1; ids.push(e[k]); } });
    });
    var companies = {}, nBig = 0, nBigOne = 0;
    ids.forEach(function (i) {
      var src = has(inflow, i) ? inflow[i] : {};
      var tin = sumValues(src);
      var cs = has(cust, i) ? cust[i] : {};
      var ct = sumValues(cs);
      var tp = top(src), nm = top(src, POOLED);
      var rev = has(revenue, i) ? revenue[i] : null;
      var c = {
        inflow_usd: tin,
        customer_inflow_usd: ct,
        outflow_usd: get(outflow, i),
        guarantees_given_usd: get(guarOut, i),
        openai_share: ratio(get(src, "openai"), tin) || 0,
        anthropic_share: ratio(get(src, "anthropic"), tin) || 0,
        labs_share: ratio(get(src, "openai") + get(src, "anthropic"), tin) || 0,
        customer_labs_share: ratio(get(cs, "openai") + get(cs, "anthropic"), ct) || 0,
        top_source: tp[0] && tin ? { id: tp[0], share: tp[1] / tin, pooled: inList(POOLED, tp[0]) } : null,
        top_named_source: nm[0] && tin ? { id: nm[0], share: nm[1] / tin } : null,
        ttm_revenue_usd: rev,
        orders_to_revenue: rev ? ct / rev : null
      };
      companies[i] = c;
      if (!inList(POOLED, i) && tin >= BIG_INFLOW_USD) {
        nBig += 1;
        if (c.top_named_source && c.top_named_source.share > 0.5) nBigOne += 1;
      }
    });
    var oracleRev = has(revenue, "oracle") ? revenue.oracle : null;
    return {
      asof: (graph && graph.generated_at) || null,
      total_usd: total,
      guarantees_usd: guarantees,
      labs_orders_usd: labsOrders,
      labs_orders_share: ratio(labsOrders, custTotal),
      n_big: nBig,
      n_big_one_source: nBigOne,
      cloud_invest_in_labs_usd: cloudInv,
      labs_orders_to_clouds_usd: labsToClouds,
      oracle_openai_orders_usd: oracleOpenai,
      oracle_openai_years: oracleRev ? oracleOpenai / oracleRev : null,
      companies: companies
    };
  }

  function fundIndex(ref) {
    var out = {};
    ((ref && ref.funds) || []).forEach(function (f) {
      if (!f || !f.key) return;
      out[String(f.key).toUpperCase()] = f;
      (f.aliases || []).forEach(function (a) { out[String(a).toUpperCase()] = f; });
    });
    return out;
  }
  function tickerIndex(ref) {
    var out = {};
    ((ref && ref.tickers) || []).forEach(function (x) { if (x && x.ticker) out[x.ticker] = x; });
    return out;
  }
  function fundOf(ident, ref) {
    var F = fundIndex(ref), u = String(ident == null ? "" : ident).trim().toUpperCase();
    if (has(F, u)) return F[u].key;
    var tk = ((ref && ref.tickers) || []);
    for (var i = 0; i < tk.length; i++) {
      var x = tk[i];
      if (x.ticker === u && x.fund_key && has(F, String(x.fund_key).toUpperCase())) return F[String(x.fund_key).toUpperCase()].key;
    }
    return null;
  }
  /* a fund in a run: "low" swaps the Nasdaq-100 high estimate for its alt (the low one), "high" the other way */
  function resolveFund(f, F, mode) {
    if (mode === "low" && f.alt && has(F, String(f.alt).toUpperCase())) return F[String(f.alt).toUpperCase()];
    if (mode === "high") {
      var ks = Object.keys(F);
      for (var i = 0; i < ks.length; i++) if (String(F[ks[i]].alt || "").toUpperCase() === String(f.key).toUpperCase()) return F[ks[i]];
    }
    return f;
  }
  /* is one of these funds a Nasdaq-100 estimate (a fund with an alt, or another fund's alt)? */
  function inRangePair(fundKeys, ref) {
    var F = fundIndex(ref), alts = {};
    Object.keys(F).forEach(function (k) { if (F[k].alt) alts[String(F[k].alt).toUpperCase()] = 1; });
    return fundKeys.some(function (k) { var u = k.toUpperCase(); return has(F, u) && (!!F[u].alt || has(alts, u)); });
  }
  /* holdings [{id, w (percent)}] spread over companies: funds through their estimated weights */
  function explode(holdings, ref, mode) {
    var F = fundIndex(ref), T = tickerIndex(ref);
    var exp = {}, total = 0, unknown = 0, notcovered = 0, funds = [];
    (holdings || []).forEach(function (h) {
      var w = h.w;
      if (!isAmount(w) || !(w > 0)) return;
      total += w;
      var u = String(h.id == null ? "" : h.id).trim().toUpperCase();
      var fk = fundOf(u, ref);
      if (fk) {
        funds.push(fk);
        var f = resolveFund(F[fk.toUpperCase()], F, mode);
        Object.keys(f.weights || {}).forEach(function (t) { add(exp, t.toUpperCase(), w * f.weights[t]); });
      } else if (has(T, u)) {
        add(exp, u, w);
        if (T[u].type === "fund") notcovered += w;
      } else {
        unknown += w;
      }
    });
    return { exp: exp, total: total, unknown: unknown, notcovered: notcovered, funds: funds };
  }
  function portfolio(holdings, ref, metrics, mode) {
    var T = tickerIndex(ref);
    var e = explode(holdings, ref, mode), total = e.total;
    var m = { total: total, unknown: total ? e.unknown / total : 0, notcovered: total ? e.notcovered / total : 0,
              funds: e.funds, on: 0, labs50: 0, labs50c: 0, oa50: 0, an50: 0, one50: 0, big: 0, wlabs: 0 };
    if (!total) return m;
    var comps = (metrics && metrics.companies) || {};
    sortedKeys(e.exp).forEach(function (t) {
      var x = T[t];
      if (!x || x.type === "fund") return;
      var c = x.entity && has(comps, x.entity) ? comps[x.entity] : null;
      if (!c || !(c.inflow_usd > 0)) return;
      var w = e.exp[t] / total;
      m.on += w;
      m.wlabs += w * c.labs_share;
      if (c.labs_share > 0.5) m.labs50 += w;
      if (c.customer_labs_share > 0.5) m.labs50c += w;
      if (c.openai_share > 0.5) m.oa50 += w;
      if (c.anthropic_share > 0.5) m.an50 += w;
      if (c.top_named_source && c.top_named_source.share > 0.5) m.one50 += w;
      if (c.orders_to_revenue != null && c.orders_to_revenue >= 1) m.big += w;
    });
    return m;
  }
  /* example holdings [{id, weight}]: weights are percentages (a list adding up to 1 or less is read as fractions) */
  function exampleRows(holdings) {
    var hs = (holdings || []).filter(function (h) { return h && isAmount(h.weight); });
    var s = 0; hs.forEach(function (h) { s += h.weight; });
    var scale = hs.length && s <= 1.0001 ? 100 : 1;
    return hs.map(function (h) { return { id: h.id != null ? h.id : h.ticker_or_fund, w: h.weight * scale }; });
  }
  /* {ex_<k>, ex_<k>_lo, ex_<k>_hi}: as entered, with every Nasdaq-100 holding at the low estimate, and at the high */
  function exampleValues(holdings, ref, metrics) {
    var rows = exampleRows(holdings);
    var m = portfolio(rows, ref, metrics, null);
    var pair = inRangePair(m.funds, ref);
    var lo = pair ? portfolio(rows, ref, metrics, "low") : m;
    var hi = pair ? portfolio(rows, ref, metrics, "high") : m;
    var out = {};
    EXAMPLE_KEYS.forEach(function (k) {
      out["ex_" + k] = m[k];
      out["ex_" + k + "_lo"] = lo[k];
      out["ex_" + k + "_hi"] = hi[k];
    });
    return out;
  }

  window.InvestorsCalc = { liveMetrics: liveMetrics, portfolio: portfolio, exampleValues: exampleValues, fundOf: fundOf, inRangePair: inRangePair,
                           counted: counted, POOLED: POOLED, LABS: LABS };

  /* ============================================================================================== the page */
  var DATA_PATHS = ["data/graph.json", "../data/graph.json"];
  var LS_LANG = "aod.lang";                 // shared with the map, so the language carries over
  var LS_HOLD = "aod.investors.holdings";
  var MAX_LINES = 25;
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  var store = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } }
  };
  function initialLang() {
    var s = store.get(LS_LANG);
    if (s === "en" || s === "zh") return s;
    var nl = (navigator.languages && navigator.languages[0]) || navigator.language || "en";
    return /^zh/i.test(nl) ? "zh" : "en";
  }
  function loadRows() {
    try {
      var r = JSON.parse(store.get(LS_HOLD) || "null");
      if (Array.isArray(r) && r.length) return r.filter(function (x) { return x && typeof x === "object"; }).map(function (x) {
        return { id: typeof x.id === "string" ? x.id : "", w: isAmount(x.w) ? x.w : null };
      });
    } catch (e) { /* ignore */ }
    return null;
  }

  var state = { lang: initialLang(), content: null, ref: null, graph: null, metrics: null, vars: {}, ents: {},
                rows: loadRows() || [{ id: "", w: null }], loaded: false, scrolled: false };

  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (a) {
      var v = attrs[a];
      if (v == null || v === false) return;
      if (a === "text") n.textContent = v;
      else if (a === "class") n.className = v;
      else n.setAttribute(a, v);
    });
    (kids || []).forEach(function (c) { if (c != null && c !== "") n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function clear(n) { while (n && n.firstChild) n.removeChild(n.firstChild); }

  /* ---------- text: every word comes from investors-content.json; a missing key shows nothing ---------- */
  function L(o) {
    if (o == null) return "";
    if (typeof o === "string") return o;
    if (typeof o !== "object") return String(o);
    var v = o[state.lang];
    if (typeof v !== "string" || !v) v = typeof o.en === "string" ? o.en : "";
    return v;
  }
  function path(obj, p) {
    var cur = obj;
    p.split(".").forEach(function (k) { cur = cur != null && typeof cur === "object" && has(cur, k) ? cur[k] : undefined; });
    return cur;
  }
  /* {name} placeholders: the page's own parameters first, then the live metrics; an unknown name shows "–".
     In Chinese the text keeps a space around each placeholder for numbers ("有 78% 的"); a value that starts or
     ends with a Chinese character ("1832 亿美元", "甲骨文", "15 日") drops that space ("1832 亿美元的算力"). */
  var CJK = "㐀-鿿（）";
  var CJK_BEFORE = new RegExp("([" + CJK + "])[  ]+\u0001(?=[" + CJK + "])", "g");
  var CJK_AFTER = new RegExp("([" + CJK + "])\u0002[  ]+(?=[" + CJK + "])", "g");
  function fill(s, extra) {
    if (!s) return "";
    var out = s.replace(/\{([a-z][a-z0-9_]*)\}/g, function (m, k) {
      var v;
      if (extra && has(extra, k)) v = extra[k];
      else if (has(state.vars, k)) v = state.vars[k];
      else {
        if (window.console) console.warn("investors: unknown placeholder {" + k + "}");
        v = "–";
      }
      return "\u0001" + v + "\u0002";
    });
    if (zh()) out = out.replace(CJK_BEFORE, "$1\u0001").replace(CJK_AFTER, "$1\u0002");
    return out.replace(/[\u0001\u0002]/g, "");
  }
  function LT(o, extra) { return fill(L(o), extra); }
  function t(k, extra) { return LT(path(state.content, "ui." + k), extra); }
  function hasT(k) { return !!L(path(state.content, "ui." + k)); }   // is there a text, without filling it
  function arr(p) { var a = path(state.content, p); return Array.isArray(a) ? a : []; }

  /* ---------- numbers ---------- */
  function zh() { return state.lang === "zh"; }
  function usd(v) {
    if (!isAmount(v)) return "–";
    if (zh()) {
      if (v >= 1e12) return (v / 1e12).toFixed(2) + " 万亿美元";
      if (v >= 1e10) return Math.round(v / 1e8) + " 亿美元";
      return (v / 1e8).toFixed(1) + " 亿美元";
    }
    if (v >= 1e12) return "$" + (v / 1e12).toFixed(2) + " trillion";
    if (v >= 1e11) return "$" + Math.round(v / 1e9) + " billion";
    if (v >= 1e9) return "$" + (v / 1e9).toFixed(1) + " billion";
    return "$" + Math.round(v / 1e6) + " million";
  }
  function usdShort(v) {
    if (!isAmount(v)) return "–";
    if (zh()) return usd(v);
    if (v >= 1e12) return "$" + (v / 1e12).toFixed(2) + "T";
    if (v >= 1e11) return "$" + Math.round(v / 1e9) + "B";
    if (v >= 1e9) return "$" + (v / 1e9).toFixed(1) + "B";
    return "$" + Math.round(v / 1e6) + "M";
  }
  function pct(x) {
    if (!isAmount(x)) return "–";
    if (x > 0 && x < 0.005) return zh() ? "不到 1%" : "under 1%";
    return Math.round(x * 100) + "%";
  }
  function one(x) { return isAmount(x) ? x.toFixed(1) : "–"; }
  function day(iso, withTime) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(iso || ""));
    if (!m) return "–";
    var y = m[1], mo = +m[2], d = +m[3], tm = withTime && m[4] ? m[4] + ":" + m[5] : "";
    if (zh()) return y + " 年 " + mo + " 月 " + d + " 日" + (tm ? " " + tm + "（UTC）" : "");
    return d + " " + MON[mo - 1] + " " + y + (tm ? ", " + tm + " UTC" : "");
  }
  function dayRange(list) {
    var ds = (list || []).filter(Boolean).slice().sort();
    if (!ds.length) return "–";
    return ds.length === 1 ? day(ds[0]) : day(ds[0]) + " – " + day(ds[ds.length - 1]);
  }
  var VAR_KEYS = ["asof", "total_usd", "guarantees_usd", "labs_orders_share", "labs_orders_usd", "n_big", "n_big_one_source",
                  "cloud_invest_in_labs_usd", "labs_orders_to_clouds_usd", "oracle_openai_orders_usd", "oracle_openai_years"];
  function computeVars() {
    var m = state.metrics, v = {};
    VAR_KEYS.forEach(function (k) { v[k] = "–"; });
    if (m) {
      v.asof = day(m.asof);
      ["total_usd", "guarantees_usd", "labs_orders_usd", "cloud_invest_in_labs_usd", "labs_orders_to_clouds_usd",
       "oracle_openai_orders_usd"].forEach(function (k) { v[k] = usd(m[k]); });
      v.labs_orders_share = pct(m.labs_orders_share);
      v.n_big = String(m.n_big);
      v.n_big_one_source = String(m.n_big_one_source);
      v.oracle_openai_years = one(m.oracle_openai_years);
    }
    state.vars = v;
  }

  /* ---------- names ---------- */
  function entName(id) {
    var e = state.ents[id];
    if (!e) return id || "";
    return zh() ? (e.name_zh || e.name || id) : (e.name || id);
  }
  var TK = {}, FD = {};
  function indexRef() { TK = tickerIndex(state.ref); FD = fundIndex(state.ref); }
  /* tool.funds in the content: name and note per fund id (also QQQ, SPY, SOXX); the reference's name otherwise */
  function fundText(id, field) { return LT(path(state.content, "tool.funds." + String(id).toUpperCase() + "." + field)); }
  function fundName(key) {
    var u = String(key).toUpperCase(), f = FD[u];
    return fundText(u, "name") || (f && fundText(f.key, "name")) || (f && L(f.name)) || key;
  }
  function tickerName(x) {
    if (x.type !== "fund" && x.entity && state.ents[x.entity]) return entName(x.entity);
    return L(x.name) || x.ticker;
  }
  function holdingLabel(id) {
    var u = String(id || "").trim().toUpperCase();
    if (!u) return "";
    var fk = fundOf(u, state.ref);
    var range = fk && inRangePair([fk], state.ref) ? t("fundRange") : "";
    if (fk && has(FD, u)) return [fundName(u), range].filter(Boolean).join(" · ");
    if (fk && has(TK, u)) return [u + " " + tickerName(TK[u]), range].filter(Boolean).join(" · ");
    if (has(TK, u) && TK[u].type === "fund") return [u + " " + tickerName(TK[u]), t("fundNotCovered")].filter(Boolean).join(" · ");
    if (has(TK, u)) return u + " " + tickerName(TK[u]);
    return t("unknown");
  }
  function company(x) {
    return x && x.type !== "fund" && x.entity && state.ents[x.entity] && state.metrics ? state.metrics.companies[x.entity] || null : null;
  }

  /* ---------- static sections ---------- */
  function setText(n, s) {
    if (n.__fb === undefined) n.__fb = n.textContent.trim();
    var v = s || n.__fb || "";
    n.textContent = v;
    n.hidden = !v;
  }
  function list(id, items) {
    var n = $(id); clear(n);
    items.forEach(function (x) { var s = LT(x); if (s) n.appendChild(el("li", { text: s })); });
    return n.childNodes.length;
  }
  function minis(id, items) {
    var n = $(id); clear(n);
    items.forEach(function (x) {
      if (!x) return;
      var tt = LT(x.title), tx = LT(x.text);
      if (tt || tx) n.appendChild(el("div", { class: "inv-mini" }, [tt ? el("b", { text: tt }) : null, tx ? el("p", { text: tx }) : null]));
    });
  }
  function steps(id, items) {
    var n = $(id); clear(n);
    items.forEach(function (s) {
      if (!s) return;
      if (s.title === undefined && s.text === undefined) { var o = LT(s); if (o) n.appendChild(el("li", null, [el("p", { text: o })])); return; }
      var tt = LT(s.title), tx = LT(s.text), tm = LT(s.time);
      n.appendChild(el("li", null, [el("div", { class: "inv-st-h" }, [tt ? el("b", { text: tt }) : null, tm ? el("span", { class: "inv-time", text: tm }) : null]),
        tx ? el("p", { text: tx }) : null]));
    });
  }
  function renderText() {
    document.title = t("title") || "AI Deal Map for Investors · AI 交易关系图投资者指南";
    Array.prototype.forEach.call(document.querySelectorAll("[data-t]"), function (n) { setText(n, t(n.getAttribute("data-t"))); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-k]"), function (n) { setText(n, LT(path(state.content, n.getAttribute("data-k")))); });
    setText($("asof-deals"), state.metrics ? t("asofDeals", { date: day(state.metrics.asof, true) }) : "");
    setText($("asof-ref"), state.ref ? t("asofRef", { date: dayRange(state.ref.price_dates || [state.ref.as_of]) }) : "");
    $("loading-banner").hidden = state.loaded;
    $("ref-error").hidden = !state.loaded || !!state.ref || !$("ref-error").textContent;
    $("tool").hidden = state.loaded && (!state.ref || !state.content);   // no labels without the content

    var tk = $("takeaways"); clear(tk);
    arr("takeaways").forEach(function (x, i) {
      if (!x) return;
      tk.appendChild(el("div", { class: "inv-take" }, [el("span", { class: "num", text: String(i + 1), "aria-hidden": "true" }),
        el("h3", { text: LT(x.title) }), el("p", { text: LT(x.text) })]));
    });
    $("not-box").hidden = !list("not-list", arr("what_it_is_not"));
    steps("do-steps", arr("steps"));
    minis("watch-list", arr("watch"));
    minis("avoid-list", arr("avoid"));
    $("q-box").hidden = !list("q-list", arr("questions"));
    steps("map-steps", arr("how_to_use_map"));
    steps("hand-steps", arr("tool.hand_steps"));
    list("limits-list", arr("tool.limits"));
    var bl = $("bands-list"); clear(bl);
    arr("tool.bands").forEach(function (b) {
      if (!b || !LT(b.label)) return;
      bl.appendChild(el("div", null, [el("dt", { text: LT(b.label) }), el("dd", null, [LT(b.rule) ? el("p", { text: LT(b.rule) }) : null,
        LT(b.reason) ? el("p", { text: LT(b.reason) }) : null])]));
    });
    var fq = $("faq-list"); clear(fq);
    arr("faq").forEach(function (f) { if (f && LT(f.q)) fq.appendChild(el("details", { class: "inv-qa" }, [el("summary", { text: LT(f.q) }), el("p", { text: LT(f.a) })])); });
    var g = $("gloss-list"); clear(g);
    arr("terms").filter(function (x) { return x && LT(x.term); }).sort(function (a, b) {
      return LT(a.term).localeCompare(LT(b.term), zh() ? "zh-CN" : "en");
    }).forEach(function (x) { g.appendChild(el("div", null, [el("dt", { text: LT(x.term) }), el("dd", { text: LT(x.def) })])); });
    renderExamples();
    renderFundChips();
    var dl = $("ticker-list"); clear(dl);
    ((state.ref && state.ref.funds) || []).forEach(function (f) { dl.appendChild(el("option", { value: f.key, label: fundName(f.key) })); });
    ((state.ref && state.ref.tickers) || []).forEach(function (x) { dl.appendChild(el("option", { value: x.ticker, label: tickerName(x) })); });
  }
  function holdingsText(h) {
    return exampleRows(h).map(function (r) {
      var u = String(r.id || "").toUpperCase();
      var nm = has(FD, u) ? fundName(u) : has(TK, u) ? u : String(r.id || "");
      return nm + " " + (Math.round(r.w * 10) / 10) + "%";
    }).join(" · ");
  }
  function renderExamples() {
    var ex = $("examples"), pr = $("presets"); clear(ex); clear(pr);
    arr("examples").forEach(function (x) {
      if (!x || !Array.isArray(x.holdings)) return;
      var vals = {};
      if (state.ref && state.metrics) {
        var v = exampleValues(x.holdings, state.ref, state.metrics);
        Object.keys(v).forEach(function (k) { vals[k] = pct(v[k]); });
      } else {
        EXAMPLE_KEYS.forEach(function (k) { vals["ex_" + k] = vals["ex_" + k + "_lo"] = vals["ex_" + k + "_hi"] = "–"; });
      }
      var title = LT(x.title, vals), text = LT(x.text, vals), next = LT(x.next, vals);
      var load = function () { loadHoldings(exampleRows(x.holdings)); };
      var b = state.ref ? el("button", { type: "button", class: "btn btn--sm", text: t("tryEx") || "↑" }) : null;
      if (b) b.addEventListener("click", function () { load(); $("check").scrollIntoView(); var f = $("h-id-0"); if (f) f.focus({ preventScroll: true }); });
      ex.appendChild(el("div", { class: "inv-example" }, [el("h4", { text: title }), el("p", { class: "hold", text: holdingsText(x.holdings) }),
        text ? el("p", { text: text }) : null,
        next ? el("p", { class: "next" }, [t("exNext") ? el("b", { text: t("exNext") + " " }) : null, next]) : null, b]));
      var c = el("button", { type: "button", class: "chip", text: title });
      c.addEventListener("click", load);
      pr.appendChild(c);
    });
    $("presets-row").hidden = !pr.childNodes.length;
  }
  /* the fund estimates as chips: a click adds a holding with that fund id */
  function renderFundChips() {
    var host = $("fund-chips"); clear(host);
    ((state.ref && state.ref.funds) || []).forEach(function (f) {
      var c = el("button", { type: "button", class: "chip", text: f.key, title: fundName(f.key), "aria-label": f.key + ": " + fundName(f.key) });
      c.addEventListener("click", function () {
        var empty = state.rows.filter(function (r) { return !r.id; })[0];
        if (empty) empty.id = f.key; else state.rows.push({ id: f.key, w: null });
        saveRows(); renderRows(); compute();
        var i = state.rows.indexOf(empty || state.rows[state.rows.length - 1]); var w = $("h-w-" + i); if (w) w.focus();
      });
      host.appendChild(c);
    });
    $("funds-row").hidden = !host.childNodes.length || !t("fundsL");
  }

  /* ---------- the self-check ---------- */
  function saveRows() { store.set(LS_HOLD, JSON.stringify(state.rows)); }
  function loadHoldings(rows) {
    state.rows = rows.map(function (r) { return { id: String(r.id || ""), w: isAmount(r.w) ? Math.round(r.w * 10) / 10 : null }; });
    if (!state.rows.length) state.rows = [{ id: "", w: null }];
    saveRows(); renderRows(); compute();
  }
  function renderRows() {
    var host = $("rows"); clear(host);
    state.rows.forEach(function (r, i) {
      var inp = el("input", { type: "text", list: "ticker-list", value: r.id || "", placeholder: t("tickerPh"), "aria-label": t("tickerPh") || "Ticker",
                              id: "h-id-" + i, autocomplete: "off", autocapitalize: "characters", spellcheck: "false" });
      var w = el("input", { type: "number", min: "0", max: "100", step: "0.1", inputmode: "decimal", value: r.w == null ? "" : String(r.w),
                            "aria-label": t("weightPh") || "%", id: "h-w-" + i });
      var rm = el("button", { type: "button", class: "btn btn--sm btn--ghost", "aria-label": t("remove") || "×", title: t("remove") || null, text: "×" });
      var nm = el("span", { class: "inv-rowname", id: "h-name-" + i, text: holdingLabel(r.id) });
      inp.addEventListener("change", function () { state.rows[i].id = inp.value.trim(); saveRows(); nm.textContent = holdingLabel(state.rows[i].id); compute(); });
      w.addEventListener("input", function () { var v = parseFloat(w.value); state.rows[i].w = isFinite(v) ? v : null; saveRows(); compute(); });
      rm.addEventListener("click", function () {
        state.rows.splice(i, 1);
        if (!state.rows.length) state.rows.push({ id: "", w: null });
        saveRows(); renderRows(); compute();
        var f = $("h-id-" + Math.min(i, state.rows.length - 1)); if (f) f.focus();
      });
      host.appendChild(el("div", { class: "inv-row" }, [inp, el("span", { class: "inv-wbox" }, [w, el("span", { text: "%", "aria-hidden": "true" })]), rm, nm]));
    });
  }
  function kpi(v, label) { return el("div", { class: "inv-kpi" }, [el("b", { text: v }), label ? el("span", { text: label }) : null]); }
  function sizeBand(v) {
    var bs = arr("tool.bands").filter(function (b) { return b && isAmount(b.min) && isAmount(b.max); });
    for (var i = 0; i < bs.length; i++) if (v >= bs[i].min && v < bs[i].max) return bs[i];
    return bs.length && v >= bs[bs.length - 1].max ? bs[bs.length - 1] : null;
  }
  /* the plain note of one table row, from the live per-company figures */
  function rowNote(x, c) {
    var p = [];
    if (x.type === "fund") p.push(t("fundNotCovered"));
    else if (!c) p.push(t("note_notmap"));
    else if (!(c.inflow_usd > 0)) p.push(t("note_noinflow"));
    else {
      if (c.labs_share > 0.5) p.push(t("note_labs"));
      if (c.top_named_source && c.top_named_source.share > 0.5 && !(c.labs_share > 0.5 && inList(LABS, c.top_named_source.id))) {
        p.push(t("note_one", { name: entName(c.top_named_source.id) }));
      }
      if (c.top_source && c.top_source.pooled) p.push(t("note_pooled", { name: entName(c.top_source.id) }));
      if (isAmount(c.orders_to_revenue) && c.orders_to_revenue >= 1) p.push(t("note_big", { years: one(c.orders_to_revenue) }));
      if (c.ttm_revenue_usd == null && c.customer_inflow_usd > 0) p.push(t("note_nosales"));
    }
    if (c && c.guarantees_given_usd > 0) p.push(t("note_guar", { amount: usd(c.guarantees_given_usd) }));
    return p.filter(Boolean).join(zh() ? "" : " ");
  }
  function salesCell(c) {
    if (!c || !(c.customer_inflow_usd > 0)) return "–";
    if (!isAmount(c.orders_to_revenue)) return t("noSales") || "–";
    if (c.orders_to_revenue < 0.1 && hasT("salesUnderTenth")) return t("salesUnderTenth");
    return t("yearsOfSales", { years: one(c.orders_to_revenue) }) || one(c.orders_to_revenue);
  }
  function compute() {
    var out = $("results"); clear(out);
    var ref = state.ref, metrics = state.metrics;
    var e = explode(state.rows, ref, null), total = e.total;
    $("weight-note").textContent = total ? t("weightSum", { n: (Math.round(total * 10) / 10) + "%" }) : "";
    if (!total) { var em = t("emptyTool"); if (em) out.appendChild(el("p", { class: "inv-empty", text: em })); return; }
    if (!ref || !metrics) {   // the deal data did not load: say so in the tool too, not only in the banner
      if (!metrics && hasT("loadError")) out.appendChild(el("p", { class: "inv-empty", text: t("loadError") }));
      return;
    }
    var m = portfolio(state.rows, ref, metrics, null);
    var range = inRangePair(m.funds, ref);
    var lo = range ? portfolio(state.rows, ref, metrics, "low") : null;
    var hi = range ? portfolio(state.rows, ref, metrics, "high") : null;
    function rng(k) { return range ? pct(Math.min(lo[k], hi[k])) + " – " + pct(Math.max(lo[k], hi[k])) : pct(m[k]); }
    out.appendChild(el("div", { class: "inv-kpis" }, [kpi(rng("labs50"), t("k_labs50")), kpi(rng("one50"), t("k_one50")),
      kpi(rng("big"), t("k_big")), kpi(rng("on"), t("k_on")), kpi(rng("wlabs"), t("k_wlabs"))]));
    if (range) {
      var rp = t("rangeP", { lo: pct(lo.labs50), hi: pct(hi.labs50) });
      if (t("rangeH") || rp) out.appendChild(el("div", { class: "inv-band" }, [t("rangeH") ? el("b", { text: t("rangeH") }) : null, rp ? el("p", { text: rp }) : null]));
    } else {
      var band = sizeBand(m.labs50);
      var bs = band ? t("bandSentence", { pct: pct(m.labs50), label: LT(band.label) }) : "";
      if (bs) out.appendChild(el("div", { class: "inv-band" }, [el("b", { text: bs }), LT(band.reason) ? el("p", { class: "inv-note", text: LT(band.reason) }) : null]));
    }
    var sp = t("k_split", { oa: rng("oa50"), an: rng("an50") });
    if (sp) out.appendChild(el("p", { class: "inv-note", text: sp }));
    /* the note of each fund entered: by the id typed (QQQ, SPY, SOXX) or the estimate it resolves to */
    var seen = {};
    state.rows.forEach(function (r) {
      var u = String(r.id || "").trim().toUpperCase();
      if (!u || !(isAmount(r.w) && r.w > 0)) return;
      var key = fundText(u, "note") ? u : fundOf(u, ref);
      if (!key || seen[key]) return;
      seen[key] = 1;
      var note = fundText(key, "note");
      if (note) out.appendChild(el("p", { class: "inv-note" }, [el("b", { text: fundName(key) + ": " }), note]));
    });
    if (m.unknown && hasT("k_unknown")) out.appendChild(el("p", { class: "inv-note", text: t("k_unknown", { n: pct(m.unknown) }) }));

    var lines = Object.keys(e.exp).map(function (k) { return { x: TK[k], w: e.exp[k] / total }; })
      .filter(function (l) { return l.x; }).sort(function (a, b) { return b.w - a.w || (a.x.ticker < b.x.ticker ? -1 : 1); });
    var tb = el("tbody");
    lines.slice(0, MAX_LINES).forEach(function (l) {
      var x = l.x, c = company(x), on = !!c && c.inflow_usd > 0;
      var none = x.type === "fund" ? "–" : t("noDeals") || "–";
      tb.appendChild(el("tr", null, [
        el("th", { scope: "row", class: "lead" }, [el("b", { text: x.ticker }), " " + tickerName(x)]),
        el("td", { class: "num", text: pct(l.w) }),
        el("td", { class: "num", text: on ? usdShort(c.inflow_usd) : "–" }),
        el("td", { class: "num", text: on ? pct(c.openai_share) : "–" }),
        el("td", { class: "num", text: on ? pct(c.anthropic_share) : "–" }),
        el("td", { class: "num", text: on ? pct(c.labs_share) : "–" }),
        el("td", { text: on && c.top_source ? entName(c.top_source.id) + " " + pct(c.top_source.share) : none }),
        el("td", { text: on && c.top_named_source ? entName(c.top_named_source.id) + " " + pct(c.top_named_source.share) : "–" }),
        el("td", { text: on ? salesCell(c) : "–" }),
        el("td", { class: "num", text: c && c.guarantees_given_usd > 0 ? usdShort(c.guarantees_given_usd) : "–" }),
        el("td", { class: "note", text: rowNote(x, c) })]));
    });
    var hr = el("tr");
    ["c_holding", "c_weight", "c_inflow", "c_openai", "c_anthropic", "c_labs", "c_top", "c_top_named", "c_sales", "c_guar", "c_note"]
      .forEach(function (k) { hr.appendChild(el("th", { scope: "col", text: t(k) })); });
    out.appendChild(el("div", { class: "inv-tbl", tabindex: "0", role: "region", "aria-label": t("checkH") || "Holdings" },
      [el("table", null, [el("thead", null, [hr]), tb])]));
    if (range && hasT("tableHigh")) out.appendChild(el("p", { class: "inv-note", text: t("tableHigh") }));
    if (lines.length > MAX_LINES && hasT("moreRows")) out.appendChild(el("p", { class: "inv-note", text: t("moreRows", { n: String(lines.length - MAX_LINES) }) }));
    if (t("toolDisclaimer")) out.appendChild(el("p", { class: "inv-note", text: t("toolDisclaimer") }));
  }

  /* ---------- language, loading ---------- */
  function render() {
    var y = window.scrollY;
    computeVars(); renderText(); renderRows(); compute();
    window.scrollTo(0, y);
  }
  function setLang(lang, quiet) {
    state.lang = lang;
    if (!quiet) store.set(LS_LANG, lang);
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    $("lang-en").setAttribute("aria-pressed", String(lang === "en"));
    $("lang-zh").setAttribute("aria-pressed", String(lang === "zh"));
    render();
  }
  function getJSON(url, fresh) {
    return fetch(fresh ? url + "?t=" + Date.now() : url, { cache: fresh ? "no-store" : "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error(url + " " + r.status);
      return r.json();
    });
  }
  function loadGraph() {
    var paths = /\/site\/(investors\.html)?$/.test(location.pathname) ? DATA_PATHS.slice().reverse() : DATA_PATHS.slice();
    var i = 0;
    function next() {
      if (i >= paths.length) return Promise.reject(new Error("could not load data/graph.json"));
      return getJSON(paths[i++], true).then(function (j) {
        if (!j || !Array.isArray(j.entities) || !Array.isArray(j.edges)) throw new Error("graph.json has no entities/edges");
        return j;
      }).catch(next);
    }
    return next();
  }
  function soft(p) { return p.then(function (j) { return j; }, function (err) { if (window.console) console.warn("investors:", err && err.message); return null; }); }
  function load() {
    return Promise.all([soft(loadGraph()), soft(getJSON("investors-content.json")), soft(getJSON("investors-reference.json"))]).then(function (res) {
      var g = res[0], c = res[1] && typeof res[1] === "object" ? res[1] : null, r = res[2];
      if (r && (!Array.isArray(r.tickers) || !Array.isArray(r.funds))) r = null;
      state.graph = g; state.content = c || state.content; state.ref = r;
      state.ents = {};
      ((g && g.entities) || []).forEach(function (x) { if (x && x.id) state.ents[x.id] = x; });
      state.metrics = g ? liveMetrics(g, r) : null;
      state.loaded = true;
      indexRef();
      render();
      /* the error banner: the content's own words when it loaded (loadError for the graph); the built-in
         bilingual line when the content itself is missing. A missing reference file only hides the check. */
      var banner = $("error-banner");
      banner.hidden = !!(g && c);
      if (c && !g && t("loadError")) $("error-text").textContent = t("loadError");
      document.body.setAttribute("data-ready", g && c && r ? "1" : "partial");
      if (!state.scrolled && location.hash.length > 1) {
        state.scrolled = true;
        var tg = document.getElementById(decodeURIComponent(location.hash.slice(1)));
        if (tg) tg.scrollIntoView();
      }
    });
  }

  $("lang-en").addEventListener("click", function () { setLang("en"); });
  $("lang-zh").addEventListener("click", function () { setLang("zh"); });
  $("add-row").addEventListener("click", function () {
    state.rows.push({ id: "", w: null }); saveRows(); renderRows();
    var last = $("h-id-" + (state.rows.length - 1)); if (last) last.focus();
  });
  $("clear-rows").addEventListener("click", function () { loadHoldings([]); var f = $("h-id-0"); if (f) f.focus(); });
  $("retry").addEventListener("click", function () { location.reload(); });
  setLang(state.lang, true);
  load();
})();
