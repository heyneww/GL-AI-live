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
  /* what a reader typed -> the reference file's form (twin of norm_ticker / resolve_ticker in monitor/investors.py):
     upper case, no spaces, no leading "$" or exchange prefix (NASDAQ:NVDA), BRK/B and BRK-B -> BRK.B,
     700.HK -> 0700.HK, then the reference's lookup of alternative tickers (2330.TW -> TSM) */
  function normTicker(s) {
    var u = String(s == null ? "" : s).replace(/\s+/g, "").toUpperCase().replace(/^\$+/, "");
    var m = /^[A-Z]{2,8}:(.+)$/.exec(u);
    if (m) u = m[1];
    m = /^([A-Z]{1,5})[\/-]([A-Z])$/.exec(u);
    if (m) u = m[1] + "." + m[2];
    m = /^(\d{1,4})\.HK$/.exec(u);
    if (m) u = ("0000" + m[1]).slice(-4) + ".HK";
    return u;
  }
  function resolveTicker(ident, ref) {
    var u = normTicker(ident), lk = (ref && ref.lookup) || {};
    return has(lk, u) ? lk[u] : u;
  }
  function fundOf(ident, ref) {
    var F = fundIndex(ref), u = resolveTicker(ident, ref);
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
      var u = resolveTicker(h.id, ref);
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
                           counted: counted, POOLED: POOLED, LABS: LABS, normTicker: normTicker, resolveTicker: resolveTicker,
                           explode: explode, fundIndex: fundIndex, tickerIndex: tickerIndex, resolveFund: resolveFund,
                           isLive: isLive, liveGuarantee: liveGuarantee };

  /* ============================================================================================== the page */
  /* The exposure scorecard comes from window.InvestorsExposure (investors-exposure.js, loaded first; its Python
     twin is monitor/exposure.py). This part only draws: the holdings input, the overall badge, the measures, the
     treemap / stacked bar, who the portfolio depends on and the holdings list. Without the engine it says so and
     shows the share of the money on the map. Nothing typed here leaves the browser. */
  var DATA_PATHS = ["data/graph.json", "../data/graph.json"];
  var LS_LANG = "aod.lang";                 // shared with the map, so the language carries over
  var LS_HOLD = "aod.investors.holdings";   // [{id, w, u: "amt" | "pct"}]; older lists without u were percentages
  var MAX_LINES = 25;
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var BANDS = ["high", "elevated", "low", "no_data", "lender", "off_map", "unknown"];
  var ICON = { high: "■", elevated: "▲", low: "●", no_data: "?", lender: "–", off_map: "○", unknown: "○",
               concentrated: "■", notable: "▲", limited: "●" };
  var DIMS_FALLBACK = ["who_pays", "size", "borrowed", "circular", "guarantees", "cds"];
  var SECTION_ALIAS = { "method-box": "method", "big": "big-picture", "examples": "examples-sec" };

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
  /* a shared link (#p=NVDA.40,QQQ.40,VOO.20: rounded percentages only) wins over the stored list */
  function hashRows() {
    var m = /^#p=(.*)$/.exec(location.hash || "");
    if (!m) return null;
    var rows = [];
    m[1].split(",").forEach(function (part) {
      var k = part.lastIndexOf("."), id, w;
      if (k <= 0) return;
      try { id = decodeURIComponent(part.slice(0, k)); } catch (e) { return; }
      w = parseFloat(part.slice(k + 1));
      if (id && isFinite(w) && w > 0) rows.push({ id: id.slice(0, 24), w: w });
    });
    return rows.length ? { rows: rows.slice(0, 60), mode: "pct" } : null;
  }
  function loadRows() {
    try {
      var r = JSON.parse(store.get(LS_HOLD) || "null");
      if (Array.isArray(r) && r.length) {
        r = r.filter(function (x) { return x && typeof x === "object"; });
        var mode = r.length && (r[0].u === "amt" || r[0].u === "pct") ? r[0].u : "pct";
        return { mode: mode, rows: r.map(function (x) { return { id: typeof x.id === "string" ? x.id : "", w: isAmount(x.w) ? x.w : null }; }) };
      }
    } catch (e) { /* ignore */ }
    return null;
  }
  var start = hashRows() || loadRows() || { mode: "amt", rows: [{ id: "", w: null }] };

  var state = { lang: initialLang(), content: null, ref: null, graph: null, metrics: null, vars: {}, ents: {}, edges: {}, ndeals: {},
                comps: null, index: [], rows: start.rows, mode: start.mode, fillOther: true, open: {}, loaded: false, scrolled: false,
                cb: { row: -1, opts: [], active: -1 }, liveTimer: null };

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
  function engine() { var X = window.InvestorsExposure; return X && typeof X.portfolio === "function" && typeof X.companies === "function" ? X : null; }
  function dims() { var X = engine(); return X && Array.isArray(X.DIMENSIONS) ? X.DIMENSIONS : DIMS_FALLBACK; }
  function thresholds(k) { var X = engine(); return X && X.THRESHOLDS && X.THRESHOLDS[k] ? X.THRESHOLDS[k] : null; }

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
  var CJK = "㐀-鿿（）“”";
  var CJK_BEFORE = new RegExp("([" + CJK + "])[  ]+\u0001(?=[" + CJK + "])", "g");
  var CJK_AFTER = new RegExp("([" + CJK + "])\u0002[  ]+(?=[" + CJK + "])", "g");
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
  function mult(x) { return isAmount(x) ? (x >= 10 ? Math.round(x) : x.toFixed(2)) + (zh() ? " 倍" : "×") : "–"; }
  function bp(x) { return isAmount(x) ? Math.round(x) + (zh() ? " 个基点" : " bp") : "–"; }
  /* a measure's value (or reference line) in its own unit: shares, multiples of market value, basis points */
  function fmtDim(k, v) { return k === "size" ? mult(v) : k === "cds" ? bp(v) : pct(v); }
  function grouped(v) {
    if (!isAmount(v)) return "";
    var r = Math.round(v * 100) / 100, s = String(r).split("."), i = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return s.length > 1 ? i + "." + s[1] : i;
  }
  /* "12,500", "12.5k", "1.234,5", "$3m", "40%": a number or null */
  function parseNum(s) {
    var x = String(s == null ? "" : s).trim().replace(/[\s$€£¥％%]/g, "").replace(/^\+/, "");
    var k = 1, m = /^(.*?)([kKmMbB万])$/.exec(x);
    if (m) { x = m[1]; k = { k: 1e3, m: 1e6, b: 1e9, "万": 1e4 }[m[2].toLowerCase()]; }
    if (!/^[\d.,]+$/.test(x)) return null;
    var lc = x.lastIndexOf(","), ld = x.lastIndexOf(".");
    if (lc >= 0 && ld >= 0) x = lc > ld ? x.replace(/\./g, "").replace(",", ".") : x.replace(/,/g, "");
    else if (lc >= 0) x = /^\d{1,3}(,\d{3})+$/.test(x) ? x.replace(/,/g, "") : x.replace(",", ".");
    else if (/^\d{1,3}(\.\d{3}){2,}$/.test(x)) x = x.replace(/\./g, "");
    var v = parseFloat(x);
    return isFinite(v) && v >= 0 ? v * k : null;
  }
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
      v.oracle_openai_years = isAmount(m.oracle_openai_years) ? m.oracle_openai_years.toFixed(1) : "–";
    }
    state.vars = v;
  }
  /* the worked examples' own placeholders (each also with _lo / _hi), filled from InvestorsExposure.portfolio */
  var EX_VARS = ["ex_label", "ex_high", "ex_elev", "ex_off", "ex_nodata", "ex_names"];

  /* ---------- names ---------- */
  function entName(id) {
    var e = state.ents[id];
    if (!e) return id || "";
    return zh() ? (e.name_zh || e.name || id) : (e.name || id);
  }
  var TK = {}, FD = {};
  function indexRef() { TK = tickerIndex(state.ref); FD = fundIndex(state.ref); }
  function rangeFund(key) { return !!key && !!state.ref && inRangePair([key], state.ref); }
  /* tool.funds in the content: name and note per fund id; name_one / note_one when the estimate has no range */
  function fundText(id, field) {
    var u = String(id).toUpperCase(), key = has(FD, u) ? FD[u].key : fundOf(u, state.ref);
    if (key && !rangeFund(key)) { var one = LT(path(state.content, "tool.funds." + u + "." + field + "_one")); if (one) return one; }
    return LT(path(state.content, "tool.funds." + u + "." + field));
  }
  function fundName(key) {
    var u = String(key).toUpperCase(), f = FD[u];
    var own = fundText(u, "name");
    if (own) return own;
    if (has(TK, u) && TK[u].type === "fund") return tickerName(TK[u]);
    // another ticker of the same fund (VOO -> the S&P 500 estimate): the name of the fund's own ticker (SPY)
    var main = f ? ((state.ref && state.ref.tickers) || []).filter(function (x) { return x.type === "fund" && x.fund_key === f.key; })[0] : null;
    return (main && tickerName(main)) || (f && fundText(f.key, "name")) || (f && L(f.name)) || key;
  }
  function tickerName(x) {
    if (x.type !== "fund" && x.entity && state.ents[x.entity]) return entName(x.entity);
    return fundText(x.ticker, "name") || L(x.name) || x.ticker;
  }
  /* what a typed holding is: a fund we look through, a fund we cannot, a company (on the map or not), unknown */
  function describe(id) {
    var u = resolveTicker(id, state.ref);
    if (!u) return null;
    var fk = fundOf(u, state.ref);
    if (fk) return { kind: "fund", id: u, fund: fk, name: has(FD, u) ? fundName(u) : tickerName(TK[u] || { ticker: u }), range: rangeFund(fk) };
    if (has(TK, u)) {
      var x = TK[u];
      if (x.type === "fund") return { kind: "fundno", id: u, name: tickerName(x) };
      return { kind: "company", id: u, name: tickerName(x), entity: x.entity && state.ents[x.entity] ? x.entity : null };
    }
    return { kind: "unknown", id: u };
  }
  /* a fund estimate from the provider's published top holdings: how much of the fund they cover, and when */
  function fundCover(f) {
    if (!f || f.method !== "top_holdings") return "";
    var n = Object.keys(f.weights || {}).filter(function (k) { return !/:REST$/.test(k); }).length;
    return t("fundTop", { n: String(n), date: day(f.as_of), pct: isAmount(f.listed_share) ? pct(f.listed_share) : "–" });
  }
  function bandOf(entity) {
    var c = entity && state.comps ? state.comps[entity] : null;
    if (!c) return entity ? "off_map" : "unknown";
    return c.status === "rated" ? c.band || "low" : c.status;
  }
  function bandWord(k) { return t("b_" + k); }
  /* "High exposure" for a rated band; "No data", "Not on the map" as they are */
  function bandLabel(k) { return k === "high" || k === "elevated" || k === "low" ? t("bandWord", { label: bandWord(k) }) : bandWord(k); }
  function pctShort(x) { return isAmount(x) && x > 0 && x < 0.005 ? "<1%" : pct(x); }
  function inkClass(k) { return "ic-ink-" + (k === "high" || k === "elevated" || k === "low" ? k : "none"); }
  function swatch(k, extra) {
    return el("span", { class: "sw x-" + k + (k === "high" || k === "concentrated" ? " hatch" : "") + (extra ? " " + extra : ""), "aria-hidden": "true", text: ICON[k] || "?" });
  }

  /* ---------- search: tickers, company names (English and 中文) and fund names ---------- */
  function buildIndex() {
    var idx = [], seen = {}, ref = state.ref;
    function names(o) { return o && typeof o === "object" ? [o.en, o.zh] : [o]; }
    function push(o) {
      if (!o.id || has(seen, o.id)) return;
      seen[o.id] = 1;
      o.hay = o.names.filter(function (s) { return typeof s === "string" && s; }).map(function (s) { return s.toLowerCase(); });
      idx.push(o);
    }
    ((ref && ref.tickers) || []).forEach(function (x) {
      if (!x || !x.ticker || /:REST$/.test(x.ticker)) return;   // the unlisted rest of a fund is not something to pick
      var nm = names(x.name), fk = x.type === "fund" ? fundOf(x.ticker, ref) : null;
      var e = x.type !== "fund" && x.entity && state.ents[x.entity] ? state.ents[x.entity] : null;
      if (e) nm = nm.concat([e.name, e.name_zh]);
      nm = nm.concat(names(path(state.content, "tool.funds." + x.ticker + ".name")));
      push({ id: x.ticker, kind: x.type === "fund" ? (fk ? "fund" : "fundno") : "company", entity: e ? e.id : null, names: nm });
    });
    ((ref && ref.funds) || []).forEach(function (f) {
      var fn = names(f.name).concat(names(path(state.content, "tool.funds." + f.key + ".name")));
      // a fund's other tickers (VOO, IVV for the S&P 500 estimate) are entries of their own; the estimate keys rank last
      (f.aliases || []).forEach(function (a) { if (!/-EST$/i.test(a)) push({ id: String(a).toUpperCase(), kind: "fund", entity: null, names: [a].concat(fn) }); });
      push({ id: f.key, kind: "fund", est: true, entity: null, names: [f.key].concat(f.aliases || [], fn) });
    });
    state.index = idx;
  }
  /* one typo away: a letter added, dropped, changed, or two neighbours swapped (ORLC -> ORCL) */
  function near(a, b) {
    if (a === b || Math.abs(a.length - b.length) > 1) return false;
    var i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
    return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
  }
  function search(q) {
    var raw = String(q || "").trim();
    if (!raw) return [];
    var u = resolveTicker(raw, state.ref), lq = raw.toLowerCase(), out = [];
    state.index.forEach(function (o) {
      var s = 9;
      if (o.id === u) s = 0;
      else if (u && o.id.indexOf(u) === 0) s = 1 + (o.id.length - u.length) / 100;
      o.hay.forEach(function (h) {
        if (h === lq) s = Math.min(s, 1.5);
        else if (h.indexOf(lq) === 0 || h.indexOf(" " + lq) >= 0 || h.indexOf("（" + lq) >= 0 || h.indexOf("(" + lq) >= 0) s = Math.min(s, 2);
        else if (lq.length >= 2 && h.indexOf(lq) >= 0) s = Math.min(s, 3);
      });
      if (s < 9) out.push({ o: o, s: s + (o.est ? 0.6 : 0) + (o.kind === "company" && !o.entity ? 0.2 : 0) });
    });
    out.sort(function (a, b) { return a.s - b.s || (a.o.id < b.o.id ? -1 : 1); });
    return out.slice(0, 8).map(function (x) { return x.o; });
  }
  /* what was typed -> the id the check uses: a known ticker or fund, else an exact company name, else as typed */
  function resolveTyped(raw) {
    var s = String(raw || "").trim();
    if (!s) return "";
    var u = resolveTicker(s, state.ref);
    if (has(TK, u) || has(FD, u) || fundOf(u, state.ref)) return u;
    var lq = s.toLowerCase();
    for (var i = 0; i < state.index.length; i++) if (!state.index[i].est && state.index[i].hay.indexOf(lq) >= 0) return state.index[i].id;
    return u;
  }
  function didYouMean(u) {
    var typo = state.index.filter(function (o) { return !o.est && near(o.id, u); })
      .sort(function (a, b) { return (b.entity ? 1 : 0) - (a.entity ? 1 : 0) || (a.id < b.id ? -1 : 1); })[0];
    if (typo) return typo.id;
    var hit = search(u).filter(function (o) { return o.id !== u && !o.est; })[0];
    return hit ? hit.id : null;
  }
  function optTag(o) {
    if (o.kind === "fund") return t("tagFundEst");
    if (o.kind === "fundno") return t("tagFundNo");
    if (!o.entity) return t("tagNotMap");
    var n = state.ndeals[o.entity] || 0;
    return n ? t("tagOnMap", { n: String(n) }) : t("tagOnMapNone");
  }
  function optName(o) {
    if (o.kind === "fund") return fundName(o.id);
    return has(TK, o.id) ? tickerName(TK[o.id]) : o.id;
  }

  /* ---------- the combobox (WAI-ARIA 1.2): one listbox, moved under the field in use ---------- */
  var CB = $("cb-list");   // kept here: it moves under the field in use and goes home before the rows are redrawn
  function cbPark() { var host = $("rows"); if (CB.parentNode !== host.parentNode) host.parentNode.insertBefore(CB, host.nextSibling); }
  function cbClose() {
    var lb = CB, inp = $("h-id-" + state.cb.row);
    lb.hidden = true;
    if (inp) { inp.setAttribute("aria-expanded", "false"); inp.removeAttribute("aria-activedescendant"); }
    state.cb = { row: -1, opts: [], active: -1 };
  }
  function cbOpen(i, q) {
    var lb = CB, inp = $("h-id-" + i), row = $("h-row-" + i);
    var opts = search(q);
    if (!inp || !row || !opts.length) { cbClose(); return; }
    state.cb = { row: i, opts: opts, active: -1 };
    clear(lb);
    lb.setAttribute("aria-label", t("listboxL") || "Matches");
    opts.forEach(function (o, k) {
      var li = el("li", { role: "option", id: "cb-opt-" + k, "aria-selected": "false" }, [
        el("span", { class: "cb-tk", text: o.id }), el("span", { class: "cb-nm", text: optName(o) }), el("span", { class: "cb-tag", text: optTag(o) })]);
      li.addEventListener("mousedown", function (ev) { ev.preventDefault(); });
      li.addEventListener("click", function () { cbPick(k); });
      lb.appendChild(li);
    });
    row.appendChild(lb);
    lb.hidden = false;
    inp.setAttribute("aria-expanded", "true");
  }
  function cbMove(d) {
    var n = state.cb.opts.length;
    if (!n) return;
    state.cb.active = (state.cb.active + d + n) % n;
    Array.prototype.forEach.call(CB.children, function (li, k) { li.setAttribute("aria-selected", String(k === state.cb.active)); });
    var inp = $("h-id-" + state.cb.row);
    if (inp) inp.setAttribute("aria-activedescendant", "cb-opt-" + state.cb.active);
    var a = $("cb-opt-" + state.cb.active); if (a && a.scrollIntoView) a.scrollIntoView({ block: "nearest" });
  }
  function cbPick(k) {
    var i = state.cb.row, o = state.cb.opts[k];
    if (i < 0 || !o) return;
    var inp = $("h-id-" + i);
    if (inp) inp.value = o.id;
    cbClose();
    commit(i, o.id);
    var w = $("h-w-" + i); if (w) w.focus();
  }

  /* ---------- holdings ---------- */
  function saveRows() {
    store.set(LS_HOLD, JSON.stringify(state.rows.map(function (r) { return { id: r.id || "", w: r.w, u: state.mode }; })));
  }
  function rowSum() { var s = 0; state.rows.forEach(function (r) { if (isAmount(r.w) && r.w > 0) s += r.w; }); return s; }
  function otherShare() {   // % mode: the part under 100% that is counted as other (not on the map)
    var s = rowSum();
    return state.mode === "pct" && state.fillOther && s > 0 && s < 99.95 ? 100 - s : 0;
  }
  function holdings() {
    var hs = state.rows.filter(function (r) { return isAmount(r.w) && r.w > 0; }).map(function (r) { return { id: r.id || "", w: r.w }; });
    var o = otherShare();
    if (o) hs.push({ id: "", w: o });
    return hs;
  }
  function loadHoldings(rows, mode) {
    state.rows = rows.map(function (r) { return { id: String(r.id || ""), w: isAmount(r.w) ? Math.round(r.w * 100) / 100 : null }; });
    if (!state.rows.length) state.rows = [{ id: "", w: null }];
    if (mode) state.mode = mode;
    state.open = {};
    saveRows(); renderMode(); renderRows(); compute();
  }
  function commit(i, raw) {
    var r = state.rows[i];
    if (!r) return;
    r.id = resolveTyped(raw);
    r.ok = false;
    var inp = $("h-id-" + i); if (inp && inp.value !== r.id) inp.value = r.id;
    saveRows(); rowInfo(i); compute();
  }
  function rowEl(r, i) {
    var amt = state.mode === "amt";
    var inp = el("input", { type: "text", id: "h-id-" + i, value: r.id || "", placeholder: t("tickerPh"), "aria-label": t("tickerL") || "Ticker",
                            role: "combobox", "aria-autocomplete": "list", "aria-expanded": "false", "aria-controls": "cb-list",
                            autocomplete: "off", autocapitalize: "characters", spellcheck: "false" });
    var w = el("input", { type: "text", inputmode: "decimal", class: "num", id: "h-w-" + i, autocomplete: "off",
                          value: isAmount(r.w) ? (amt ? grouped(r.w) : String(r.w)) : "", placeholder: amt ? t("amountPh") : t("pctPh"),
                          "aria-label": (amt ? t("amountL") : t("pctL")) || "%" });
    var rm = el("button", { type: "button", class: "btn btn--ghost inv-row__rm", "aria-label": t("remove") || "×", title: t("remove") || null, text: "×" });
    inp.addEventListener("input", function () { cbOpen(i, inp.value); });
    inp.addEventListener("focus", function () { if (inp.value && !has(TK, inp.value) && !has(FD, inp.value)) cbOpen(i, inp.value); });
    inp.addEventListener("keydown", function (ev) {
      var open = state.cb.row === i && state.cb.opts.length;
      if (ev.key === "ArrowDown") { ev.preventDefault(); if (!open) cbOpen(i, inp.value); cbMove(1); }
      else if (ev.key === "ArrowUp") { ev.preventDefault(); if (open) cbMove(-1); }
      else if (ev.key === "Escape") { if (open) { ev.preventDefault(); cbClose(); } }
      else if (ev.key === "Enter") {
        ev.preventDefault();
        if (open && state.cb.active >= 0) cbPick(state.cb.active);
        else if (open && state.cb.opts.length === 1) cbPick(0);
        else { cbClose(); commit(i, inp.value); w.focus(); }
      }
    });
    inp.addEventListener("blur", function () { if (state.cb.row === i) cbClose(); });
    inp.addEventListener("change", function () { commit(i, inp.value); });
    w.addEventListener("input", function () { state.rows[i].w = parseNum(w.value); saveRows(); compute(); });
    w.addEventListener("keydown", function (ev) { if (ev.key === "Enter") { ev.preventDefault(); $("add-row").click(); } });
    rm.addEventListener("click", function () {
      state.rows.splice(i, 1);
      if (!state.rows.length) state.rows.push({ id: "", w: null });
      saveRows(); renderRows(); compute();
      var f = $("h-id-" + Math.min(i, state.rows.length - 1)); if (f) f.focus();
    });
    return el("div", { class: "inv-row", id: "h-row-" + i }, [el("span", { class: "inv-row__ic", id: "h-ic-" + i }), inp, w,
      el("span", { class: "inv-row__pct", id: "h-pct-" + i }), rm, el("div", { class: "inv-row__name", id: "h-name-" + i }),
      el("div", { class: "inv-row__acts", id: "h-acts-" + i })]);
  }
  /* the line under a holding: what it resolved to, its exposure icon, and for an unknown one what to do next */
  function rowInfo(i) {
    var r = state.rows[i], row = $("h-row-" + i);
    if (!r || !row) return;
    var nm = $("h-name-" + i), ic = $("h-ic-" + i), acts = $("h-acts-" + i);
    clear(nm); clear(ic); clear(acts);
    row.className = "inv-row";
    var d = r.id ? describe(r.id) : null;
    if (!d) return;
    if (d.kind === "company") {
      var b = state.comps ? bandOf(d.entity) : null;
      if (b) { ic.className = "inv-row__ic " + inkClass(b); ic.appendChild(el("span", { role: "img", "aria-label": bandLabel(b) || b, text: ICON[b] })); }
      nm.appendChild(el("b", { text: d.name }));
      nm.appendChild(document.createTextNode(" · " + optTag({ kind: "company", entity: d.entity })));
    } else if (d.kind === "fund") {
      var f = FD[String(d.fund).toUpperCase()], cover = fundCover(f);
      ic.appendChild(el("span", { "aria-hidden": "true", text: "≈" }));
      nm.appendChild(el("b", { text: d.name }));
      nm.appendChild(document.createTextNode(" · " + (d.range ? t("fundRange") : cover || t("fundEst"))));
      if (f && /^https:\/\//.test(f.source_url || "")) {
        nm.appendChild(document.createTextNode(" · "));
        nm.appendChild(el("a", { href: f.source_url, rel: "noopener", text: t("fundSource") }));
      }
    } else if (d.kind === "fundno") {
      ic.appendChild(el("span", { "aria-hidden": "true", text: "?" }));
      nm.appendChild(el("b", { text: d.name }));
      nm.appendChild(document.createTextNode(" · " + t("fundNotCovered")));
    } else {
      row.className = "inv-row inv-row--unknown";
      ic.appendChild(el("span", { "aria-hidden": "true", text: "?" }));
      nm.textContent = r.ok ? t("unknown") : [t("unknown"), t("unknownHint")].filter(Boolean).join(" ");
      if (r.ok) return;
      var sug = didYouMean(d.id);
      if (sug) {
        var b1 = el("button", { type: "button", class: "btn btn--sm", text: t("didYouMean", { name: sug + " " + optName({ id: sug, kind: has(FD, sug) ? "fund" : "company" }) }) });
        b1.addEventListener("click", function () { var f = $("h-id-" + i); if (f) f.value = sug; commit(i, sug); var w = $("h-w-" + i); if (w) w.focus(); });
        acts.appendChild(b1);
      }
      var b2 = el("button", { type: "button", class: "btn btn--sm btn--ghost", text: t("countOther") });
      b2.addEventListener("click", function () { r.ok = true; rowInfo(i); var w = $("h-w-" + i); if (w) w.focus(); });
      acts.appendChild(b2);
    }
  }
  function renderRows() {
    cbClose(); cbPark();
    var host = $("rows"); clear(host);
    host.appendChild(el("div", { class: "inv-rows__head", "aria-hidden": "true" }, [el("span", { text: t("colHolding") }),
      el("span", { class: "num", text: state.mode === "amt" ? t("amountPh") : t("pctPh") }), el("span", { class: "num", text: t("shareShort") })]));
    state.rows.forEach(function (r, i) { host.appendChild(rowEl(r, i)); rowInfo(i); });
    updateShares();
  }
  /* each row's share of the total, the "Other" line in % mode, the note under the list */
  function updateShares() {
    var s = rowSum(), o = otherShare(), tot = s + o;
    state.rows.forEach(function (r, i) {
      var n = $("h-pct-" + i);
      if (n) n.textContent = tot && isAmount(r.w) && r.w > 0 ? pct(r.w / tot) : "";
    });
    var ol = $("other-line"); clear(ol);
    var note = "";
    if (state.mode === "pct" && s > 0) {
      var sp = (Math.round(s * 10) / 10) + "%";
      if (s > 100.05) note = t("scaledDown", { pct: sp });
      else if (s < 99.95) {
        var btn = el("button", { type: "button", class: "linkbtn", text: state.fillOther ? t("otherOff") : t("otherOn") });
        btn.addEventListener("click", function () { state.fillOther = !state.fillOther; updateShares(); compute(); });
        ol.appendChild(el("span", { text: state.fillOther ? t("otherNote", { pct: sp, n: (Math.round(o * 10) / 10) + "%" }) : t("scaledUp", { pct: sp }) }));
        ol.appendChild(btn);
      }
    } else if (state.mode === "amt" && s > 0) note = t("weightSum", { n: grouped(s) });
    ol.hidden = !ol.childNodes.length;
    $("weight-note").textContent = note;
  }
  function renderMode() {
    var amt = state.mode === "amt";
    $("mode-amt").setAttribute("aria-pressed", String(amt));
    $("mode-pct").setAttribute("aria-pressed", String(!amt));
    $("mode-note").textContent = amt ? t("modeNoteAmt") : t("modeNotePct");
  }
  function setMode(m) {
    if (m === state.mode) return;
    if (m === "pct") {   // amounts -> their percentages, so the list keeps its meaning
      var s = rowSum();
      state.rows.forEach(function (r) { if (isAmount(r.w) && s) r.w = Math.round(r.w / s * 1000) / 10; });
    }
    state.mode = m;
    saveRows(); renderMode(); renderRows(); compute();
  }

  /* ---------- paste a list ---------- */
  function splitCsv(line, sep) {
    var out = [], cur = "", q = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '"') q = !q;
      else if (ch === sep && !q) { out.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  }
  function parsePaste(text) {
    var lines = String(text || "").split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean), items = [];
    if (!lines.length) return items;
    var sep = /\t/.test(lines[0]) ? "\t" : /;/.test(lines[0]) && !/,/.test(lines[0]) ? ";" : ",";
    var head = splitCsv(lines[0], sep).map(function (s) { return s.toLowerCase(); });
    var si = -1, vi = -1;
    head.forEach(function (h, k) {
      if (si < 0 && /^(symbol|ticker|代码|证券代码|instrument)/.test(h)) si = k;
      if (vi < 0 && /(market ?value|current value|^value|amount|市值|金额)/.test(h)) vi = k;
    });
    if (si >= 0 && vi >= 0) {   // a broker CSV export
      lines.slice(1).forEach(function (l) { var f = splitCsv(l, sep); if (f[si]) items.push({ name: f[si], v: parseNum(f[vi]), pct: false }); });
    } else {
      lines.forEach(function (l) {
        l.split(/[;,，；]\s*(?=[^\d\s,.])/).forEach(function (part) {
          var toks = part.trim().split(/\s+/), k = -1;
          for (var j = toks.length - 1; j >= 0; j--) if (parseNum(toks[j]) != null) { k = j; break; }
          if (k < 0) { if (toks[0]) items.push({ name: toks.join(" "), v: null, pct: false }); return; }
          var name = toks.slice(0, k).concat(toks.slice(k + 1)).join(" ");
          if (name) items.push({ name: name, v: parseNum(toks[k]), pct: /%|％/.test(toks[k]) || (toks[k + 1] || "") === "%" });
        });
      });
    }
    return items.filter(function (x) { return x.name; }).slice(0, 60).map(function (x) {
      var id = resolveTyped(x.name), d = describe(id);
      return { id: id, w: x.v, pct: x.pct, mark: !d || d.kind === "unknown" || d.kind === "fundno" ? "?" : d.kind === "fund" ? "≈" : "✓" };
    });
  }
  function renderPaste() {
    var items = parsePaste($("paste-text").value), ul = $("paste-preview"); clear(ul);
    items.forEach(function (x) {
      ul.appendChild(el("li", { class: x.mark === "?" ? "q" : null, text: x.mark + " " + x.id + (isAmount(x.w) ? " " + grouped(x.w) + (x.pct ? "%" : "") : "") }));
    });
    $("paste-sum").textContent = items.length ? t("pasteCount", { n: String(items.length) }) : t("pasteNone");
    $("paste-apply").disabled = !items.length;
    return items;
  }
  function togglePaste(open) {
    $("paste-box").hidden = !open;
    $("paste-btn").setAttribute("aria-expanded", String(open));
    if (open) { renderPaste(); $("paste-text").focus(); }
  }

  /* ---------- share link: rounded percentages only, in the part of the URL that is never sent ---------- */
  function shareLink() {
    var rows = state.rows.filter(function (r) { return r.id && isAmount(r.w) && r.w > 0; });
    var s = rowSum(), tot = state.mode === "pct" ? Math.max(100, s) : s;
    var parts = rows.map(function (r) { return encodeURIComponent(r.id).replace(/%2E/gi, ".") + "." + Math.max(1, Math.round(r.w / (tot || 1) * 100)); });
    return location.href.split("#")[0] + (parts.length ? "#p=" + parts.join(",") : "");
  }
  function share() {
    var url = shareLink(), box = $("share-box"), st = $("share-status"), inp = $("share-url");
    inp.value = url; box.hidden = false;
    function shown(ok) { st.textContent = ok ? t("shareDone") : t("shareCopy"); if (!ok) { inp.focus(); inp.select(); } }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(function () { shown(true); }, function () { shown(false); });
      else shown(false);
    } catch (e) { shown(false); }
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
  /* the six measures with their reference lines (numbers from the engine) and where each line comes from */
  function renderThresholds() {
    var host = $("th-table"); clear(host);
    var hr = el("tr");
    ["th_dim", "th_what", "th_elev", "th_high", "th_src"].forEach(function (k) { hr.appendChild(el("th", { scope: "col", text: t(k) })); });
    var tb = el("tbody");
    dims().forEach(function (k) {
      var d = path(state.content, "tool.dims." + k) || {}, th = thresholds(k);
      var links = (Array.isArray(d.links) ? d.links : []).filter(function (x) { return x && /^https:\/\//.test(x.url || ""); });
      var src = el("td", null, [LT(d.anchor), links.length ? el("span", { class: "links" }, links.map(function (x, j) {
        return el("span", null, [j ? " · " : "", el("a", { href: x.url, rel: "noopener", text: L(x.label) })]);
      })) : null]);
      src.setAttribute("data-l", t("th_src"));
      tb.appendChild(el("tr", null, [el("th", { scope: "row", text: LT(d.name) || k }), el("td", { class: "w", text: LT(d.measure) }),
        el("td", { class: "v", "data-l": t("th_elev"), text: th ? fmtDim(k, th.elevated) : "–" }),
        el("td", { class: "v", "data-l": t("th_high"), text: th ? fmtDim(k, th.high) : "–" }), src]));
    });
    host.appendChild(el("table", null, [el("thead", null, [hr]), tb]));
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
    renderMode();

    var tk = $("takeaways"); clear(tk);
    arr("takeaways").forEach(function (x, i) {
      if (!x) return;
      tk.appendChild(el("div", { class: "inv-take" }, [el("span", { class: "num", text: String(i + 1), "aria-hidden": "true" }),
        el("h4", { text: LT(x.title) }), el("p", { text: LT(x.text) })]));
    });
    $("not-box").hidden = !list("not-list", arr("what_it_is_not"));
    steps("do-steps", arr("steps"));
    minis("watch-list", arr("watch"));
    minis("avoid-list", arr("avoid"));
    $("q-box").hidden = !list("q-list", arr("questions"));
    steps("map-steps", arr("how_to_use_map"));
    steps("hand-steps", arr("tool.hand_steps"));
    list("limits-list", arr("tool.limits"));
    renderThresholds();
    var fq = $("faq-list"); clear(fq);
    arr("faq").forEach(function (f) { if (f && LT(f.q)) fq.appendChild(el("details", { class: "inv-qa" }, [el("summary", { text: LT(f.q) }), el("p", { text: LT(f.a) })])); });
    var g = $("gloss-list"); clear(g);
    arr("terms").filter(function (x) { return x && LT(x.term); }).sort(function (a, b) {
      return LT(a.term).localeCompare(LT(b.term), zh() ? "zh-CN" : "en");
    }).forEach(function (x) { g.appendChild(el("div", null, [el("dt", { text: LT(x.term) }), el("dd", { text: LT(x.def) })])); });
    renderExamples();
  }

  /* ---------- worked examples and the quick-start chips ---------- */
  function holdingsText(h) {
    return exampleRows(h).map(function (r) {
      var u = resolveTicker(r.id, state.ref);
      var nm = has(FD, u) ? fundName(u) : u || String(r.id || "");
      return nm + " " + (Math.round(r.w * 10) / 10) + "%";
    }).join(" · ");
  }
  function labWord(l) { return l ? t("lab_" + l) : "–"; }
  function exampleVars(holds) {
    var X = engine(), out = {};
    EX_VARS.forEach(function (k) { out[k] = out[k + "_lo"] = out[k + "_hi"] = "–"; });
    if (!X || !state.comps || !state.ref) return { vals: out, label: null };
    var rows = exampleRows(holds), e = explode(rows, state.ref, null), range = inRangePair(e.funds, state.ref);
    function vals(p, sfx) {
      var s = p.share || {};
      var hi = (p.holdings || []).filter(function (h) { return h.status === "rated" && h.band === "high" && h.entity; });
      var names = [], seen = {};
      hi.forEach(function (h) { if (!seen[h.entity] && names.length < 4) { seen[h.entity] = 1; names.push(entName(h.entity)); } });
      out["ex_label" + sfx] = labWord(p.label);
      out["ex_high" + sfx] = pct(s.high || 0);
      out["ex_elev" + sfx] = pct(s.elevated || 0);
      out["ex_off" + sfx] = pct((s.off_map || 0) + (s.unknown || 0));
      out["ex_nodata" + sfx] = pct(s.no_data || 0);
      out["ex_names" + sfx] = names.length ? names.join(zh() ? "、" : ", ") : t("none");
    }
    try {
      var p = X.portfolio(rows, state.ref, state.comps, null);
      vals(p, ""); vals(range ? X.portfolio(rows, state.ref, state.comps, "low") : p, "_lo"); vals(range ? X.portfolio(rows, state.ref, state.comps, "high") : p, "_hi");
      return { vals: out, label: p.label };
    } catch (err) {
      if (window.console) console.warn("investors: exposure engine", err && err.message);
      return { vals: out, label: null };
    }
  }
  function loadExample(x) {
    loadHoldings(exampleRows(x.holdings), "pct");
    $("check").scrollIntoView();
    var f = $("h-id-0"); if (f) f.focus({ preventScroll: true });
  }
  function renderExamples() {
    var ex = $("examples"), pr = $("presets"); clear(ex); clear(pr);
    arr("examples").forEach(function (x) {
      if (!x || !Array.isArray(x.holdings)) return;
      var r = exampleVars(x.holdings), vals = r.vals;
      var title = LT(x.title, vals), text = LT(x.text, vals), next = LT(x.next, vals);
      var b = state.ref ? el("button", { type: "button", class: "btn btn--sm", text: t("tryEx") || "↑" }) : null;
      if (b) b.addEventListener("click", function () { loadExample(x); });
      var res = r.label ? el("p", { class: "res" }, [el("b", { text: t("exResult") }),
        el("span", { class: "bw x-" + r.label + (r.label === "concentrated" ? " hatch" : "") }, [el("span", { "aria-hidden": "true", text: ICON[r.label] }), t("badge", { label: labWord(r.label) })])]) : null;
      ex.appendChild(el("div", { class: "inv-example" }, [el("h4", { text: title }), el("p", { class: "hold", text: holdingsText(x.holdings) }), res,
        text ? el("p", { text: text }) : null,
        next ? el("p", { class: "next" }, [t("exNext") ? el("b", { text: t("exNext") + " " }) : null, next]) : null, b]));
      var c = el("button", { type: "button", class: "chip", text: LT(x.short) || title });
      c.addEventListener("click", function () { loadHoldings(exampleRows(x.holdings), "pct"); var f = $("h-id-0"); if (f) f.focus(); });
      pr.appendChild(c);
    });
    $("presets-row").hidden = !pr.childNodes.length || !state.ref;
  }

  /* ---------- the result ---------- */
  function sentence(p) {
    var s = p.share || {}, a = { high: pct(s.high || 0), elev: pct(s.elevated || 0), both: pct((s.high || 0) + (s.elevated || 0)) };
    if (p.label === "concentrated") return t("sentConc", a);
    if (p.label === "notable") return (s.high || 0) >= 0.1 ? t("sentNotableHigh", a) : t("sentNotableBoth", a);
    return t("sentLimited", a);
  }
  function renderBadge(host, p, lo, hi) {
    var range = lo && hi && lo.label !== hi.label, lab = range ? hi.label : p.label;
    var word = range ? t("badgeRange", { lo: labWord(lo.label), hi: labWord(hi.label) }) : t("badge", { label: labWord(p.label) });
    host.appendChild(el("div", { class: "inv-badge" }, [el("span", { class: "inv-badge__k", text: t("badgeKicker") }),
      el("span", { class: "inv-badge__w x-" + lab + (lab === "concentrated" ? " hatch" : ""), id: "badge" }, [el("span", { class: "ic", "aria-hidden": "true", text: ICON[lab] }), word])]));
    var sent = sentence(p);
    host.appendChild(el("p", { class: "inv-sent", id: "summary", text: sent }));
    if (lo && hi) host.appendChild(el("p", { class: "inv-sent inv-sent--range", text: t("rangeLine", { lo: labWord(lo.label), hi: labWord(hi.label) }) }));
    return word + (zh() ? "。" : ". ") + sent;
  }
  function renderShares(host, p) {
    var s = p.share || {}, dl = el("dl", { class: "inv-shares" });
    BANDS.forEach(function (k) {
      var v = s[k] || 0;
      if (!(v > 0) && k !== "no_data" && k !== "off_map") return;
      dl.appendChild(el("div", null, [swatch(k), el("dt", { text: t("sh_" + k) }), el("dd", { text: pct(v) })]));
    });
    host.appendChild(el("div", null, [el("h3", { class: "inv-sub", text: t("sharesL") }), dl]));
  }
  function renderDims(host, p) {
    var ul = el("ul", { class: "inv-dims" }), by = p.by_dim || {};
    dims().forEach(function (k) {
      var d = path(state.content, "tool.dims." + k) || {}, v = by[k] || {}, h = v.high || 0, e = v.elevated || 0, th = thresholds(k);
      var txt = t("dimVal", { high: pctShort(h), elev: pctShort(e) });
      var bar = el("div", { class: "inv-dim__bar", role: "img", "aria-label": txt }, [
        el("span", { class: "x-high hatch", style: "width:" + (h * 100).toFixed(2) + "%" }), el("span", { class: "x-elevated", style: "width:" + (e * 100).toFixed(2) + "%" })]);
      var why = el("details", null, [el("summary", { text: t("dimWhy") }), el("p", { text: LT(d.measure) }),
        el("p", null, [el("b", { text: t("refSource") + " " }), th ? t("refLine", { lo: fmtDim(k, th.elevated), hi: fmtDim(k, th.high) }) + ". " : "", LT(d.anchor)])]);
      ul.appendChild(el("li", { class: "inv-dim" }, [el("span", { class: "inv-dim__n", text: LT(d.name) || k }), bar,
        el("span", { class: "inv-dim__v" }, [el("span", null, [el("span", { class: "ic-ink-high", "aria-hidden": "true", text: "■ " }), txt])]), why]));
    });
    host.appendChild(el("div", null, [el("h3", { class: "inv-sub", text: t("dimsH") }), el("p", { class: "inv-hint", text: t("dimsP") }), ul]));
  }

  /* treemap (squarified, hand-written: no d3 needed) of the looked-through holdings, grouped by band */
  function squarify(vals, x, y, w, h) {
    var rects = [], i = 0;
    function sum(r) { var s = 0; r.forEach(function (v) { s += v; }); return s; }
    function worst(r, len) {
      var s = sum(r), mx = Math.max.apply(null, r), mn = Math.min.apply(null, r);
      return Math.max(len * len * mx / (s * s), (s * s) / (len * len * mn));
    }
    while (i < vals.length) {
      var len = Math.min(w, h), row = [vals[i]], j = i + 1;
      while (j < vals.length && worst(row.concat(vals[j]), len) <= worst(row, len)) { row.push(vals[j]); j++; }
      var s = sum(row);
      if (w >= h) { var cw = h ? s / h : 0, yy = y; row.forEach(function (v) { var rh = cw ? v / cw : 0; rects.push([x, yy, cw, rh]); yy += rh; }); x += cw; w -= cw; }
      else { var ch = w ? s / w : 0, xx = x; row.forEach(function (v) { var rw = ch ? v / ch : 0; rects.push([xx, y, rw, ch]); xx += rw; }); y += ch; h -= ch; }
      i = j;
    }
    return rects;
  }
  function vizGroups(p) {
    var items = (p.holdings || []).filter(function (h) { return h.w > 0; }).map(function (h) {
      return { key: h.ticker, w: h.w, cls: h.status === "rated" ? h.band || "low" : BANDS.indexOf(h.status) >= 0 ? h.status : "unknown", h: h };
    });
    var s = 0; items.forEach(function (x) { s += x.w; });
    if (1 - s > 0.0005) items.push({ key: "", w: 1 - s, cls: "unknown", other: true });
    var groups = [];
    BANDS.forEach(function (b) {
      var g = items.filter(function (x) { return x.cls === b; }).sort(function (a, c) { return c.w - a.w || (a.key < c.key ? -1 : 1); });
      if (!g.length) return;
      var big = g.filter(function (x, k) { return x.w >= 0.012 || x.other || k < 1; }), small = g.filter(function (x) { return big.indexOf(x) < 0; });
      if (small.length === 1) big.push(small[0]);
      else if (small.length) { var sw = 0; small.forEach(function (x) { sw += x.w; }); big.push({ key: "", w: sw, cls: b, n: small.length }); }
      var tw = 0; big.forEach(function (x) { tw += x.w; });
      groups.push({ cls: b, w: tw, items: big });
    });
    return groups.sort(function (a, c) { return c.w - a.w; });
  }
  function tileLabel(x) {
    if (x.other) return t("sh_unknown");
    if (x.n) return t("smaller", { n: String(x.n) });
    return x.key;
  }
  function tileName(x) {
    if (x.other || x.n) return tileLabel(x);
    var nm = has(TK, x.key) ? tickerName(TK[x.key]) : "";
    return x.key + (nm && nm !== x.key ? " " + nm : "");
  }
  function renderTree(host, groups) {
    var box = el("div", { class: "inv-tree", role: "group", "aria-label": t("treeH") });
    host.appendChild(box);
    var W = box.clientWidth || 600, H = box.clientHeight || 320;
    var gr = squarify(groups.map(function (g) { return g.w * W * H; }), 0, 0, W, H);
    groups.forEach(function (g, gi) {
      var r = gr[gi], tw = 0;
      g.items.forEach(function (x) { tw += x.w; });
      var rr = squarify(g.items.map(function (x) { return tw ? x.w / tw * r[2] * r[3] : 0; }), r[0], r[1], r[2], r[3]);
      g.items.forEach(function (x, k) {
        var q = rr[k], tiny = q[2] < 58 || q[3] < 38;
        var style = "left:" + (q[0] / W * 100).toFixed(3) + "%;top:" + (q[1] / H * 100).toFixed(3) + "%;width:" + (q[2] / W * 100).toFixed(3) + "%;height:" + (q[3] / H * 100).toFixed(3) + "%";
        var label = tileName(x) + ", " + pct(x.w) + ", " + bandLabel(x.cls);
        var cls = "inv-tile x-" + x.cls + (x.cls === "high" ? " hatch" : "") + (tiny ? " inv-tile--tiny" : "");
        var kids = [el("span", { class: "tk" }, [el("span", { "aria-hidden": "true", text: (ICON[x.cls] || "") + " " }), tileLabel(x)]), el("span", { class: "p", text: pctShort(x.w) })];
        var tile;
        if (x.key && !x.other && !x.n) {
          tile = el("button", { type: "button", class: cls, style: style, "aria-label": label, title: label }, kids);
          tile.addEventListener("click", function () { openHolding(x.key); });
        } else tile = el("div", { class: cls, style: style, role: "img", "aria-label": label, title: label }, kids);
        box.appendChild(tile);
      });
    });
  }
  function renderSbar(host, groups) {
    var bar = el("div", { class: "inv-sbar", role: "img" }), keys = el("ul", { class: "inv-sbar__keys" }), al = [];
    groups.forEach(function (g) {
      g.items.forEach(function (x) {
        bar.appendChild(el("span", { class: "x-" + x.cls + (x.cls === "high" ? " hatch" : ""), style: "flex:0 0 " + (x.w * 100).toFixed(3) + "%" }));
        al.push(tileLabel(x) + " " + pct(x.w) + " " + bandWord(x.cls));
      });
    });
    bar.setAttribute("aria-label", al.join(", "));
    var flat = [];
    groups.forEach(function (g) { g.items.forEach(function (x) { flat.push(x); }); });
    flat.slice(0, 10).forEach(function (x) { keys.appendChild(el("li", null, [swatch(x.cls), tileLabel(x) + " " + pctShort(x.w)])); });
    host.appendChild(bar); host.appendChild(keys);
  }
  function renderDeps(host, p) {
    var deps = (p.depends_on || []).filter(function (d) { return d && d.w > 0; }).slice(0, 8);
    var sec = el("section", { "aria-labelledby": "dep-h" }, [el("h3", { class: "inv-sub", id: "dep-h", text: t("depH") }), el("p", { class: "inv-hint", text: t("depP") })]);
    host.appendChild(sec);
    if (!deps.length) { sec.appendChild(el("p", { class: "inv-empty", text: t("depNone") })); return; }
    sec.insertBefore(el("p", { class: "inv-sent", text: t("depSentence", { pct: pct(deps[0].w), name: entName(deps[0].id) }) }), sec.childNodes[1]);
    var via = {};   // which of your holdings each source stands behind
    (p.holdings || []).forEach(function (h) {
      var c = h.entity && state.comps ? state.comps[h.entity] : null;
      ((c && c.sources) || []).forEach(function (s) { (via[s.id] = via[s.id] || []).push({ k: h.ticker, w: h.w * s.share }); });
    });
    var mx = deps[0].w, ol = el("ol", { class: "inv-deps" });
    deps.forEach(function (d) {
      var e = state.ents[d.id], g = e && e.group ? e.group : "other";
      var v = (via[d.id] || []).sort(function (a, b) { return b.w - a.w; }).slice(0, 3).map(function (x) { return x.k; });
      ol.appendChild(el("li", null, [el("span", { class: "nm" }, [el("span", { class: "dot-g", style: "--c:var(--g-" + g + ")", "aria-hidden": "true" }), el("span", { text: entName(d.id) })]),
        el("span", { class: "bar", style: "width:" + (d.w / mx * 100).toFixed(2) + "%", "aria-hidden": "true" }), el("span", { class: "p", text: pctShort(d.w) }),
        v.length ? el("span", { class: "via", text: t("depVia", { names: v.join(zh() ? "、" : ", ") }) }) : null]));
    });
    sec.appendChild(ol);
  }
  function edgeTitle(id) { var e = state.edges[id]; return e ? (zh() ? e.title_zh || e.title_en : e.title_en || e.title_zh) || id : id; }
  function holdingMore(h, c, cls) {
    var box = [], st = c ? c.status : h.status;
    if (st !== "rated") box.push(el("p", { text: t("st_" + (st === "no_data" || st === "lender" || st === "off_map" ? st : "unknown")) }));
    if (c && (st === "rated" || st === "no_data")) {
      if (st === "rated") box.push(el("p", { text: t("nHigh", { n: String(c.n_high || 0) }) }));
      var hr = el("tr");
      ["th_dim", "colValue", "colExposure", "colRef"].forEach(function (k) { hr.appendChild(el("th", { scope: "col", text: t(k) })); });
      var tb = el("tbody"), highEdges = [];
      dims().forEach(function (k) {
        var dv = (c.dims || {})[k] || {}, b = dv.band, th = thresholds(k), d = path(state.content, "tool.dims." + k) || {};
        var ref = th ? t("refLine", { lo: fmtDim(k, th.elevated), hi: fmtDim(k, th.high) }) : "";
        if (k === "who_pays" && dv.top) ref += (ref ? " · " : "") + t("topCustomer", { name: entName(dv.top) });
        tb.appendChild(el("tr", null, [el("th", { scope: "row", text: LT(d.name) || k }),
          el("td", { class: "v", text: isAmount(dv.value) ? fmtDim(k, dv.value) : t("dimNoData") }),
          el("td", { class: "b" }, [b ? el("span", { class: "bw " + inkClass(b) }, [el("span", { "aria-hidden": "true", text: ICON[b] }), bandWord(b)]) : el("span", { class: "ic-ink-none", text: "–" })]),
          el("td", { class: "ref", text: ref })]));
        if (b === "high") (dv.edges || []).forEach(function (id) { if (highEdges.indexOf(id) < 0) highEdges.push(id); });
      });
      box.push(el("table", { class: "inv-dt" }, [el("thead", null, [hr]), tb]));
      if (highEdges.length) {
        box.push(el("p", null, [el("b", { text: t("dealsH") })]));
        box.push(el("ul", { class: "inv-deals" }, highEdges.slice(0, 6).map(function (id) {
          var e = state.edges[id];
          return el("li", null, [el("a", { href: "./#e-" + encodeURIComponent(id), title: t("openDeal") || null, text: edgeTitle(id) }),
            e && isAmount(e.amount_usd) ? " · " + usdShort(e.amount_usd) : ""]);
        })));
      }
      var pl = c.placed || {};
      if (pl.usd > 0 || pl.n_undisclosed > 0) {   // the other side: what it has promised to pay
        box.push(el("p", null, [el("b", { text: t("placedH") })]));
        box.push(el("p", { text: (pl.usd > 0 ? t("placedSum", { usd: usdShort(pl.usd), year: usdShort(pl.per_year) }) : t("placedSumNone"))
          + (pl.n_undisclosed > 0 ? (zh() ? "" : " ") + t("placedUnd", { n: String(pl.n_undisclosed) }) : "") }));
        if ((pl.edges || []).length) box.push(el("ul", { class: "inv-deals" }, pl.edges.map(function (id) {
          var e = state.edges[id];
          return el("li", null, [el("a", { href: "./#e-" + encodeURIComponent(id), title: t("openDeal") || null, text: edgeTitle(id) }),
            e && isAmount(e.amount_usd) ? " · " + usdShort(e.amount_usd) : ""]);
        })));
      }
      if (c.evidence && hasT("ev_" + c.evidence)) box.push(el("p", null, [el("b", { text: t("evidenceL") + " " }), t("ev_" + c.evidence)]));
    }
    if (h.entity && state.ents[h.entity]) {
      box.push(el("p", { class: "inv-h__links" }, [el("a", { href: "./#n-" + encodeURIComponent(h.entity), text: t("openMap", { name: entName(h.entity) }) + " →" })]));
    }
    return box;
  }
  function renderList(host, p, range) {
    var hs = (p.holdings || []).filter(function (h) { return h.w > 0; });
    var sec = el("section", { "aria-labelledby": "hl-h" }, [el("h3", { class: "inv-sub", id: "hl-h", text: t("listH") })]);
    host.appendChild(sec);
    if (range && hasT("tableHigh")) sec.appendChild(el("p", { class: "inv-hint", text: t("tableHigh") }));
    var head = el("div", { class: "inv-hl__head", "aria-hidden": "true" }, [el("span", { text: t("colHolding") }), el("span", { class: "num", text: t("colShare") }),
      el("span", { text: t("colExposure") }), el("span", { text: t("colSource") })]);
    var ul = el("ul", { class: "inv-hl" });
    hs.slice(0, MAX_LINES).forEach(function (h, i) {
      var c = h.entity && state.comps ? state.comps[h.entity] : null;
      var cls = h.status === "rated" ? h.band || "low" : BANDS.indexOf(h.status) >= 0 ? h.status : "unknown";
      var role = c && c.status === "rated" && c.band === "low" && c.mainly_pays ? c.pays_as : null;   // Low because it mostly pays others
      var buyer = role === "buyer";
      var ctop = c && c.dims && c.dims.commitments ? c.dims.commitments.top : null;
      var src = buyer && ctop ? t("buysFrom", { name: entName(ctop) })
        : c && c.sources && c.sources[0] ? entName(c.sources[0].id) + " " + pct(c.sources[0].share) : "–";
      var nm = has(TK, h.ticker) ? tickerName(TK[h.ticker]) : "";
      var open = !!state.open[h.ticker];
      var btn = el("button", { type: "button", class: "inv-h__btn", "aria-expanded": String(open), "aria-controls": "hm-" + i, "data-tk": h.ticker }, [
        swatch(cls), el("span", { class: "nm" }, [el("b", { class: "tk", text: h.ticker }), nm && nm !== h.ticker ? " " + nm : ""]),
        el("span", { class: "num", text: pct(h.w) }),
        el("span", { class: "bwc" }, [el("span", { class: "bw " + inkClass(cls) }, [bandLabel(cls)]),
          role && hasT("roleNote_" + role) ? el("span", { class: "inv-h__note", text: t("roleNote_" + role) }) : null]),
        el("span", { class: "src", text: src }), el("span", { class: "chev", "aria-hidden": "true", text: "›" })]);
      var more = el("div", { class: "inv-h__more", id: "hm-" + i }, holdingMore(h, c, cls));
      more.hidden = !open;
      btn.addEventListener("click", function () {
        var o = btn.getAttribute("aria-expanded") !== "true";
        btn.setAttribute("aria-expanded", String(o)); more.hidden = !o;
        if (o) state.open[h.ticker] = 1; else delete state.open[h.ticker];
      });
      ul.appendChild(el("li", { class: "inv-h", id: "hl-" + i }, [btn, more]));
    });
    var s = 0; hs.forEach(function (h) { s += h.w; });
    if (1 - s > 0.0005) {
      ul.appendChild(el("li", { class: "inv-h inv-h--static" }, [el("div", { class: "inv-h__btn" }, [swatch("unknown"), el("span", { class: "nm", text: t("sh_unknown") }),
        el("span", { class: "num", text: pct(1 - s) }), el("span", { class: "bwc" }, [el("span", { class: "bw ic-ink-none", text: t("b_unknown") })]), el("span", { class: "src", text: "–" }), el("span")])]));
    }
    sec.appendChild(el("div", { class: "inv-hlw" }, [head, ul]));
    if (hs.length > MAX_LINES && hasT("moreRows")) sec.appendChild(el("p", { class: "inv-hint", text: t("moreRows", { n: String(hs.length - MAX_LINES) }) }));
  }
  function openHolding(tk) {
    var btn = document.querySelector('.inv-h__btn[data-tk="' + String(tk).replace(/["\\]/g, "") + '"]');
    if (!btn) return;
    if (btn.getAttribute("aria-expanded") !== "true") btn.click();
    btn.scrollIntoView({ block: "center" });
    btn.focus({ preventScroll: true });
  }
  function announce(s) {
    if (state.liveTimer) clearTimeout(state.liveTimer);
    state.liveTimer = setTimeout(function () { var n = $("live"); if (n && n.textContent !== s) n.textContent = s; }, 700);
  }
  function compute() {
    var out = $("results"), det = $("detail"); clear(out); clear(det);
    updateShares();
    var ref = state.ref, metrics = state.metrics, hs = holdings();
    var e = explode(hs, ref, null), total = e.total;
    if (!total) {
      var em = t("emptyTool");
      if (em) out.appendChild(el("p", { class: "inv-empty", text: em }));
      if (ref && metrics && hasT("legendP")) {   // what the result will show: the bands, with icon and word
        out.appendChild(el("p", { class: "inv-hint", text: t("legendP") }));
        out.appendChild(el("ul", { class: "inv-legend" }, ["low", "elevated", "high", "no_data"].map(function (k) {
          return el("li", null, [swatch(k), bandLabel(k)]);
        })));
      }
      announce(""); return;
    }
    if (!ref || !metrics) {   // the deal data did not load: say so in the tool too, not only in the banner
      if (!metrics && hasT("loadError")) out.appendChild(el("p", { class: "inv-empty", text: t("loadError") }));
      return;
    }
    var X = engine();
    if (!X || !state.comps) {   // no scorecard: say so, and give the one figure the calculation block has
      out.appendChild(el("p", { class: "inv-empty", text: t("engineError") }));
      out.appendChild(el("p", { class: "inv-sent", text: t("onMapLine", { pct: pct(portfolio(hs, ref, metrics, null).on) }) }));
      return;
    }
    var p, lo = null, hi = null, range = inRangePair(e.funds, ref);
    try {
      p = X.portfolio(hs, ref, state.comps, null);
      if (range) { lo = X.portfolio(hs, ref, state.comps, "low"); hi = X.portfolio(hs, ref, state.comps, "high"); }
    } catch (err) {
      if (window.console) console.warn("investors: exposure engine", err && err.message);
      out.appendChild(el("p", { class: "inv-empty", text: t("engineError") }));
      return;
    }
    var said = renderBadge(out, p, lo, hi);
    renderShares(out, p);
    renderDims(out, p);
    var a = el("a", { href: "#method", text: t("howLink") });
    a.addEventListener("click", function () { openSection("method"); });
    out.appendChild(el("p", { class: "inv-res__foot" }, [a, el("span", { text: t("resultNote") })]));

    var groups = vizGroups(p), viz = el("div", { class: "inv-viz" });
    det.appendChild(viz);
    var tm = el("section", { "aria-labelledby": "tree-h" }, [el("h3", { class: "inv-sub", id: "tree-h", text: t("treeH") }), el("p", { class: "inv-hint", text: t("treeP") })]);
    viz.appendChild(tm);
    renderTree(tm, groups);
    renderSbar(tm, groups);
    renderDeps(viz, p);
    renderList(det, p, range);
    if (t("toolDisclaimer")) det.appendChild(el("p", { class: "inv-hint", text: t("toolDisclaimer") }));
    state.rows.forEach(function (r, i) { rowInfo(i); });
    announce(said);
  }

  /* ---------- sections: a #hash opens its <details> ---------- */
  function openSection(id) {
    var n = document.getElementById(SECTION_ALIAS[id] || id);
    if (!n) return false;
    for (var p = n; p; p = p.parentElement) if (p.tagName === "DETAILS") p.open = true;
    n.scrollIntoView();
    return true;
  }
  function onHash() {
    var h = location.hash || "";
    if (h.length < 2 || /^#p=/.test(h)) return;
    var id;
    try { id = decodeURIComponent(h.slice(1)); } catch (e) { return; }
    openSection(id);
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
      state.ents = {}; state.edges = {}; state.ndeals = {};
      ((g && g.entities) || []).forEach(function (x) { if (x && x.id) state.ents[x.id] = x; });
      ((g && g.edges) || []).forEach(function (x) {
        if (!x || !x.id) return;
        state.edges[x.id] = x;
        if (counted(x)) [x.from, x.to].forEach(function (k) { state.ndeals[k] = (state.ndeals[k] || 0) + 1; });
      });
      state.metrics = g ? liveMetrics(g, r) : null;
      state.comps = null;
      var X = engine();
      if (g && r && X) {
        try { state.comps = X.companies(g, r); } catch (err) { if (window.console) console.warn("investors: exposure engine", err && err.message); }
      }
      state.loaded = true;
      indexRef();
      buildIndex();
      render();
      /* the error banner: the content's own words when it loaded (loadError for the graph); the built-in
         bilingual line when the content itself is missing. A missing reference file only hides the check. */
      var banner = $("error-banner");
      banner.hidden = !!(g && c);
      if (c && !g && t("loadError")) $("error-text").textContent = t("loadError");
      document.body.setAttribute("data-ready", g && c && r ? "1" : "partial");
      if (!state.scrolled) { state.scrolled = true; onHash(); }
    });
  }

  $("lang-en").addEventListener("click", function () { setLang("en"); });
  $("lang-zh").addEventListener("click", function () { setLang("zh"); });
  $("mode-amt").addEventListener("click", function () { setMode("amt"); });
  $("mode-pct").addEventListener("click", function () { setMode("pct"); });
  $("add-row").addEventListener("click", function () {
    state.rows.push({ id: "", w: null }); saveRows(); renderRows(); compute();
    var last = $("h-id-" + (state.rows.length - 1)); if (last) last.focus();
  });
  $("clear-rows").addEventListener("click", function () { loadHoldings([]); $("share-box").hidden = true; var f = $("h-id-0"); if (f) f.focus(); });
  $("paste-btn").addEventListener("click", function () { togglePaste($("paste-box").hidden); });
  $("paste-text").addEventListener("input", renderPaste);
  $("paste-cancel").addEventListener("click", function () { togglePaste(false); $("paste-btn").focus(); });
  $("paste-apply").addEventListener("click", function () {
    var items = renderPaste();
    if (!items.length) return;
    var anyPct = items.some(function (x) { return x.pct; });
    togglePaste(false);
    loadHoldings(items.map(function (x) { return { id: x.id, w: x.w }; }), anyPct ? "pct" : "amt");
  });
  $("share-btn").addEventListener("click", share);
  $("retry").addEventListener("click", function () { location.reload(); });
  window.addEventListener("hashchange", function () {
    var hr = hashRows();
    if (hr) { state.fillOther = true; loadHoldings(hr.rows, hr.mode); return; }
    onHash();
  });
  setLang(state.lang, true);
  load();
})();
