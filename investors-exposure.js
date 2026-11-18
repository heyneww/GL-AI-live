/* AI Deal Maps for Investors: the AI-deal exposure scorecard (window.InvestorsExposure).
   Exact twin of monitor/exposure.py (tests/test_exposure.py checks both give the same output). Loaded before
   investors.js; the portfolio look-through uses window.InvestorsCalc (explode, resolveTicker, fundOf, counted,
   liveGuarantee, POOLED) at call time, so the two files can load in either order.
   It describes exposure on the map, never a risk verdict. Not investment advice. */
(function () {
  "use strict";

  var DIMENSIONS = ["who_pays", "size", "borrowed", "commitments", "circular", "guarantees", "cds"];
  var THRESHOLDS = {
    who_pays: { elevated: 0.10, high: 0.25 },
    size: { elevated: 0.25, high: 1.0 },
    borrowed: { elevated: 0.35, high: 0.50 },
    commitments: { elevated: 0.25, high: 1.0 },
    circular: { elevated: 0.25, high: 1.0 },
    guarantees: { elevated: 0.10, high: 0.25 },
    cds: { elevated: 100.0, high: 250.0 }
  };
  var EVIDENCE = { confirmed_below: 0.25, mixed_at_most: 0.50 };
  var LABEL = { concentrated_high: 0.25, notable_high: 0.10, notable_high_elevated: 0.40 };
  var LABEL_EPS = 1e-9;
  var DEFAULT_YEARS = 5.0;
  var CDS_MAX_AGE_DAYS = 90;
  var CDS_TENOR = "5y";
  var CUSTOMER_KINDS = ["order", "lease"];
  var BORROW_KINDS = ["debt", "vendor_financing"];
  var BURNERS = ["model_lab", "neocloud", "spv"];
  var ROLES = ["buyer", "investor", "lender"];
  var ROLE_OF = { order: "buyer", lease: "buyer", investment: "investor", debt: "lender", vendor_financing: "lender" };
  var MATCH_RANK = { ticker: 0, share_class: 1, name: 2, inferred: 3 };
  var MAX_EDGES = 3, MAX_SOURCES = 5, MAX_DEPENDS = 8;
  var BY_DIM_STATUSES = ["rated", "no_data"];

  var WS = "[ \\t\\n\\r\\f\\v]";
  var NUM_YEAR = new RegExp("([0-9]+(?:\\.[0-9]+)?)" + WS + "*[- ]?(?:year|yr)");
  var WORDS = [["five", 5], ["seven", 7], ["ten", 10], ["three", 3], ["four", 4], ["six", 6], ["eight", 8]];
  var DAY = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;

  function calc() {
    var c = window.InvestorsCalc;
    if (!c) throw new Error("InvestorsExposure: investors.js (window.InvestorsCalc) is not loaded");
    return c;
  }
  function has(o, k) { return o != null && Object.prototype.hasOwnProperty.call(o, k); }
  function num(v) { return typeof v === "number" && isFinite(v); }
  function inList(list, v) { return list.indexOf(v) >= 0; }
  function isObj(v) { return v != null && typeof v === "object" && !Array.isArray(v); }
  function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  function sortedKeys(o) { return Object.keys(o).sort(cmp); }
  function sum(o) { var s = 0; sortedKeys(o).forEach(function (k) { s += o[k]; }); return s; }
  function ratio(a, b) { return b ? a / b : null; }
  function addTo(d, i, k, v) {
    if (!has(d, i)) d[i] = {};
    d[i][k] = (has(d[i], k) ? d[i][k] : 0) + v;
  }
  function push(d, i, v) { if (!has(d, i)) d[i] = []; d[i].push(v); }

  /* contract length in years from the free-text term; null when it cannot be read (the study's rule) */
  function termYears(e) {
    var t = typeof e.term === "string" ? e.term.toLowerCase() : "";
    var a = typeof e.announced === "string" ? e.announced.slice(0, 4) : "";
    var m = NUM_YEAR.exec(t);
    if (m) return Math.max(1.0, parseFloat(m[1]));
    for (var i = 0; i < WORDS.length; i++) {
      if (new RegExp(WORDS[i][0] + "[- ]year").test(t)) return WORDS[i][1];
    }
    if (t.indexOf("calendar") >= 0) return 1.0;
    var ys = (t.match(/20[2-9][0-9]/g) || []).map(function (y) { return parseInt(y, 10); });
    if (ys.length && /^[0-9]+$/.test(a)) {
      var span = Math.max.apply(null, ys) - parseInt(a, 10);
      if (span >= 1) return span;
    }
    return null;
  }

  function band(value, key) {
    if (value === null || value === undefined) return null;
    var t = THRESHOLDS[key];
    return value >= t.high ? "high" : (value >= t.elevated ? "elevated" : "low");
  }

  /* day number of an ISO date (first 10 characters); null when it is not a real date */
  function dayNum(s) {
    if (typeof s !== "string") return null;
    var m = DAY.exec(s.slice(0, 10));
    if (!m) return null;
    var y = parseInt(m[1], 10), mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
    if (y < 1) return null;
    var dt = new Date(Date.UTC(2000, mo - 1, d));
    dt.setUTCFullYear(y);
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return Math.round(dt.getTime() / 86400000);
  }

  /* a positive reference figure per map entity: an exact ticker match wins; the first row wins a tie */
  function byEntity(ref, field) {
    var out = {};
    ((ref && ref.tickers) || []).forEach(function (x) {
      if (!isObj(x)) return;
      var eid = x.entity, v = x[field];
      if (!eid || !num(v) || v <= 0) return;
      var r = has(MATCH_RANK, x.match) ? MATCH_RANK[x.match] : 9;
      if (!has(out, eid) || r < out[eid][0]) out[eid] = [r, v];
    });
    var res = {};
    Object.keys(out).forEach(function (k) { res[k] = out[k][1]; });
    return res;
  }

  /* the largest key by value (above 0); ties go to the id that sorts first */
  function largest(d, skip) {
    var best = null, amt = 0;
    sortedKeys(d).forEach(function (k) {
      if (skip && inList(skip, k)) return;
      if (d[k] > amt) { best = k; amt = d[k]; }
    });
    return best;
  }
  /* edge ids by contribution, largest first (ties by id), at most MAX_EDGES */
  function topEdges(pairs) {
    var agg = {}, order = [];
    pairs.forEach(function (p) {
      if (typeof p[0] !== "string") return;
      if (!has(agg, p[0])) { agg[p[0]] = 0; order.push(p[0]); }
      agg[p[0]] += p[1];
    });
    return order.sort(function (a, b) { return agg[b] - agg[a] || cmp(a, b); }).slice(0, MAX_EDGES);
  }

  function latestCds(quotes, genDay) {
    var best = null, bestKey = null;
    (Array.isArray(quotes) ? quotes : []).forEach(function (q) {
      if (!isObj(q) || !num(q.bp)) return;
      if (String(q.tenor == null ? "" : q.tenor).toLowerCase() !== CDS_TENOR || dayNum(q.as_of) === null) return;
      var key = [q.as_of.slice(0, 10), q.id == null ? "" : String(q.id)];
      if (best === null || cmp(key[0], bestKey[0]) > 0 || (key[0] === bestKey[0] && cmp(key[1], bestKey[1]) > 0)) {
        best = q; bestKey = key;
      }
    });
    if (best === null) return [null, null];
    if (genDay !== null && genDay - dayNum(best.as_of) > CDS_MAX_AGE_DAYS) return [null, null];
    return [best.bp, best.as_of.slice(0, 10)];
  }

  /* {entity_id: Company} for every entity on the map (docs/investor-redesign-2026-11/SPEC.md) */
  function companies(graph, ref) {
    var C = calc(), pooled = C.POOLED;
    graph = graph || {};
    var edges = (graph.edges || []).filter(isObj);
    var group = {}, ids = [];
    (graph.entities || []).forEach(function (x) {
      if (isObj(x) && x.id && !has(group, x.id)) { group[x.id] = x.group === undefined ? null : x.group; ids.push(x.id); }
    });
    edges.forEach(function (e) {
      ["from", "to"].forEach(function (k) {
        var v = e[k];
        if (typeof v === "string" && v && !has(group, v)) { group[v] = null; ids.push(v); }
      });
    });
    var rev = byEntity(ref, "ttm_revenue_usd"), mv = byEntity(ref, "market_value_usd");
    var inflow = {}, reported = {}, cust = {}, custEdges = {}, ann = {}, annEdges = {};
    var borrow = {}, borrowEdges = {}, guar = {}, guarEdges = {}, byid = {};
    var placed = {}, placedEdges = {}, placedNominal = {}, placedUsd = {}, undisclosed = {}, outflow = {};

    edges.forEach(function (e) {
      if (typeof e.id === "string") byid[e.id] = e;
      var f = e.from, t = e.to, k = e.kind, a = e.amount_usd, eid = e.id === undefined ? null : e.id;
      if (C.liveGuarantee(e)) { addTo(guar, f, t, a); push(guarEdges, f, [eid, a]); return; }
      if (!C.counted(e)) {
        if (C.isLive(e) && inList(CUSTOMER_KINDS, k) && !num(a) && typeof f === "string") undisclosed[f] = (has(undisclosed, f) ? undisclosed[f] : 0) + 1;
        return;
      }
      addTo(inflow, t, f, a);
      addTo(outflow, f, has(ROLE_OF, k) ? ROLE_OF[k] : "buyer", a);
      if (e.confidence === "reported") reported[t] = (has(reported, t) ? reported[t] : 0) + a;
      if (inList(CUSTOMER_KINDS, k)) {
        addTo(cust, t, f, a);
        push(custEdges, t, [eid, a]);
        var y = termYears(e) || DEFAULT_YEARS;
        addTo(ann, t, f, a / y);
        if (!has(annEdges, t)) annEdges[t] = {};
        push(annEdges[t], f, [eid, a / y]);
        addTo(placed, f, t, a / y);
        push(placedEdges, f, [eid, a / y]);
        push(placedNominal, f, [eid, a]);
        addTo(placedUsd, f, t, a);
      }
      if (inList(BORROW_KINDS, k)) { addTo(borrow, t, f, a); push(borrowEdges, t, [eid, a]); }
      if (k === "lease") { addTo(borrow, f, t, a); push(borrowEdges, f, [eid, a]); }   // the lessee takes it on
    });

    var loopIds = {};
    var stats = isObj(graph.stats) ? graph.stats : {};
    (stats.circular || []).forEach(function (c) {
      ((isObj(c) && c.legs) || []).forEach(function (leg) {
        ((isObj(leg) && leg.edge_ids) || []).forEach(function (eid) {
          var e = has(byid, eid) ? byid[eid] : null;
          if (e && C.counted(e) && inList(CUSTOMER_KINDS, e.kind)) {
            if (!has(loopIds, e.to)) loopIds[e.to] = {};
            loopIds[e.to][eid] = 1;
          }
        });
      });
    });

    var cdsAll = isObj(graph.cds) ? graph.cds : {};
    var genDay = dayNum(graph.generated_at);

    var out = {};
    ids.forEach(function (i) {
      var R = has(rev, i) ? rev[i] : null, M = has(mv, i) ? mv[i] : null;
      var src = has(inflow, i) ? inflow[i] : {};
      var tin = sum(src);
      var dims = {};

      var a = has(ann, i) ? ann[i] : {};
      var topNamed = largest(a, pooled);
      var topAmt = topNamed !== null ? a[topNamed] : 0;
      var burn = {};
      Object.keys(a).forEach(function (k) { if (inList(BURNERS, has(group, k) ? group[k] : null)) burn[k] = a[k]; });
      var burnAmt = sum(burn), wpTop, wpEdges;
      if (topNamed === null && burnAmt <= 0) { wpTop = null; wpEdges = []; }
      else if (topAmt >= burnAmt) { wpTop = topNamed; wpEdges = topEdges(annEdges[i][topNamed]); }
      else {
        wpTop = largest(burn);
        var ps = [];
        sortedKeys(burn).forEach(function (k) { ps = ps.concat(annEdges[i][k]); });
        wpEdges = topEdges(ps);
      }
      dims.who_pays = { value: R ? Math.max(topAmt / R, burnAmt / R) : null, top: wpTop, edges: wpEdges };

      var cs = has(cust, i) ? cust[i] : {};
      dims.size = { value: ratio(sum(cs), M), top: largest(cs), edges: topEdges(has(custEdges, i) ? custEdges[i] : []) };

      var bw = has(borrow, i) ? borrow[i] : {};
      var obl = sum(bw);
      dims.borrowed = { value: M ? obl / (obl + M) : null, top: largest(bw),
                        edges: topEdges(has(borrowEdges, i) ? borrowEdges[i] : []) };

      var pc = has(placed, i) ? placed[i] : {};
      dims.commitments = { value: ratio(sum(pc), R), top: largest(pc), edges: topEdges(has(placedEdges, i) ? placedEdges[i] : []) };

      var lp = has(loopIds, i) ? sortedKeys(loopIds[i]) : [];
      var loopSrc = {}, loopAmt = 0;
      lp.forEach(function (eid) {
        var e = byid[eid];
        loopAmt += e.amount_usd;
        loopSrc[e.from] = (has(loopSrc, e.from) ? loopSrc[e.from] : 0) + e.amount_usd;
      });
      dims.circular = { value: ratio(loopAmt, R), top: largest(loopSrc),
                        edges: topEdges(lp.map(function (eid) { return [eid, byid[eid].amount_usd]; })) };

      var g = has(guar, i) ? guar[i] : {};
      dims.guarantees = { value: ratio(sum(g), M), top: largest(g), edges: topEdges(has(guarEdges, i) ? guarEdges[i] : []) };

      var q = latestCds(has(cdsAll, i) ? cdsAll[i] : null, genDay);
      dims.cds = { value: q[0], top: null, edges: [], as_of: q[1] };

      var nHigh = 0, nElev = 0;
      DIMENSIONS.forEach(function (k) {
        dims[k].band = band(dims[k].value, k);
        if (dims[k].band === "high") nHigh += 1;
        if (dims[k].band === "elevated") nElev += 1;
      });

      var status;
      if (group[i] === "financier" && dims.cds.band !== "high") status = "lender";   // rated when the credit market flags it
      else if (tin <= 0 && sum(g) <= 0 && sum(has(placedUsd, i) ? placedUsd[i] : {}) <= 0) status = "off_map";
      else if (R === null && M === null && dims.cds.band !== "high") status = "no_data";
      else status = "rated";
      var overall = null;
      if (status === "rated") {
        if (nHigh >= 2 || dims.cds.band === "high") overall = "high";
        else if (nHigh === 1 || nElev >= 2) overall = "elevated";
        else overall = "low";
      }

      var rep = ratio(has(reported, i) ? reported[i] : 0, tin);
      var evidence = rep === null ? null :
        (rep < EVIDENCE.confirmed_below ? "confirmed" : rep <= EVIDENCE.mixed_at_most ? "mixed" : "reported");
      var named = Object.keys(src).filter(function (k) { return !inList(pooled, k) && src[k] > 0; })
        .sort(function (x, y) { return src[y] - src[x] || cmp(x, y); });
      var sources = tin ? named.slice(0, MAX_SOURCES).map(function (k) { return { id: k, share: src[k] / tin }; }) : [];

      var pu = has(placedUsd, i) ? placedUsd[i] : {};
      var ow = has(outflow, i) ? outflow[i] : {}, role = null;
      ROLES.forEach(function (r) {   // the largest part of what flows out; ties go to the first in ROLES
        var v = has(ow, r) ? ow[r] : 0;
        if (v > 0 && (role === null || v > ow[role])) role = r;
      });
      out[i] = { id: i, group: group[i], status: status, band: overall, n_high: nHigh, n_elevated: nElev,
                 dims: dims, evidence: evidence, sources: sources,
                 placed: { usd: sum(pu), per_year: sum(pc), n_undisclosed: has(undisclosed, i) ? undisclosed[i] : 0,
                           edges: topEdges(has(placedNominal, i) ? placedNominal[i] : []) },
                 mainly_pays: sum(ow) > tin, pays_as: role };
    });
    return out;
  }

  function tickers(ref) {
    var T = {};
    ((ref && ref.tickers) || []).forEach(function (x) { if (isObj(x) && x.ticker) T[x.ticker] = x; });
    return T;
  }
  /* typed holdings that are neither a fund nor a ticker in the reference file, by resolved ticker */
  function unknownIds(holdings, ref) {
    var C = calc(), T = tickers(ref), out = {};
    holdings.forEach(function (h) {
      var w = h.w;
      if (!num(w) || !(w > 0)) return;
      var u = C.resolveTicker(h.id, ref);
      if (!C.fundOf(u, ref) && !has(T, u)) out[u] = (has(out, u) ? out[u] : 0) + w;
    });
    return out;
  }

  function label(share) {
    var hi = share.high + LABEL_EPS, el = share.elevated;   // float rounding of typed percentages
    if (hi >= LABEL.concentrated_high) return "concentrated";
    if (hi >= LABEL.notable_high || hi + el >= LABEL.notable_high_elevated) return "notable";
    return "limited";
  }

  /* the exposure of a portfolio [{id, w}], every figure a share of the total entered */
  function portfolio(holdings, ref, comps, mode) {
    var C = calc();
    ref = ref || {};
    comps = comps || {};
    holdings = (holdings || []).filter(function (h) { return isObj(h) && num(h.w) && h.w > 0; });
    var T = tickers(ref);
    var e = C.explode(holdings, ref, mode === undefined ? null : mode);
    var total = e.total;
    var share = { high: 0, elevated: 0, low: 0, no_data: 0, lender: 0, off_map: 0, unknown: 0 };
    var byDim = {};
    DIMENSIONS.forEach(function (k) { byDim[k] = { high: 0, elevated: 0 }; });
    var res = { total: total, label: null, share: share, by_dim: byDim, holdings: [], depends_on: [], funds: e.funds };
    if (!total) return res;
    var rows = [], dep = {};
    var unk = unknownIds(holdings, ref);
    sortedKeys(e.exp).forEach(function (t) {
      var x = has(T, t) ? T[t] : null;
      if (!x || x.type === "fund") { unk[t] = (has(unk, t) ? unk[t] : 0) + e.exp[t]; return; }
      var w = e.exp[t] / total;
      var eid = x.entity || null;
      var c = eid && has(comps, eid) ? comps[eid] : null;
      var status = c ? c.status : "off_map", b = c ? c.band : null;
      rows.push({ ticker: t, entity: eid, w: w, status: status, band: b });
      if (status === "rated") share[b] += w; else share[status] += w;
      if (c && inList(BY_DIM_STATUSES, status)) {
        DIMENSIONS.forEach(function (k) {
          var db = c.dims[k].band;
          if (db === "high" || db === "elevated") byDim[k][db] += w;
        });
      }
      if (c) c.sources.forEach(function (s) { dep[s.id] = (has(dep, s.id) ? dep[s.id] : 0) + w * s.share; });
    });
    sortedKeys(unk).forEach(function (u) {
      var w = unk[u] / total;
      share.unknown += w;
      rows.push({ ticker: u, entity: null, w: w, status: "unknown", band: null });
    });
    rows.sort(function (x, y) { return y.w - x.w || cmp(x.ticker, y.ticker); });
    res.holdings = rows;
    res.depends_on = Object.keys(dep).sort(function (x, y) { return dep[y] - dep[x] || cmp(x, y); })
      .slice(0, MAX_DEPENDS).map(function (k) { return { id: k, w: dep[k] }; });
    res.label = label(share);
    return res;
  }

  window.InvestorsExposure = {
    THRESHOLDS: THRESHOLDS, DIMENSIONS: DIMENSIONS, EVIDENCE: EVIDENCE, LABEL: LABEL, LABEL_EPS: LABEL_EPS,
    DEFAULT_YEARS: DEFAULT_YEARS, CDS_MAX_AGE_DAYS: CDS_MAX_AGE_DAYS,
    companies: companies, portfolio: portfolio, termYears: termYears, band: band, label: label
  };
})();
