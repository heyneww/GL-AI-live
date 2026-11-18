/* AI Orders & Debt dashboard: the important deals in one view, in English and 中文.

   One renderer, two hosts:
   - dashboard.html ("page"): masthead, language switch and a deal drawer. It reads data/v1/dashboard.json (or
     ../_dashboard/dashboard.json when the repo is served locally and `python -m monitor dashboard` has run) and
     reads it again every 5 minutes, so it follows the map without a reload.
   - the map's Dashboard tab ("map", site/app.js): no masthead, timeline or drawer (the map has its own); the map
     passes its language and a click on a deal, a company or a loop opens the map's own panel.

   Every figure is computed once, in Python (monitor/dashboard.py, published as data/v1/dashboard.json with the map),
   so the page, the tab and the API always agree; this file only draws it. Exposes window.AODDash. */
(function () {
  "use strict";

  var DATA_PATHS = ["data/v1/dashboard.json", "../_dashboard/dashboard.json"];
  var REFRESH_MS = 5 * 60 * 1000;
  var MAP_URL = "./";
  var PAGE_URL = "dashboard.html";
  var LS_LANG = "aod.lang", LS_TL = "aod.dash.tl";
  var KINDS = ["order", "investment", "debt", "lease", "vendor_financing", "guarantee"];
  var STATUSES = ["reported", "announced", "signed", "in_progress", "completed", "cancelled"];
  var BINDING = { signed: 1, in_progress: 1, completed: 1 };
  var CLASS = { order: "order", investment: "investment", debt: "debt", lease: "other", vendor_financing: "other", guarantee: "other" };
  var STACK = ["order", "investment", "debt", "other"];

  var store = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } }
  };

  var STR = {
    en: {
      eyebrow: "Live data · AI capital flows", title: "Key AI Deals at a Glance", alt: "AI 重点交易",
      sub: "The deals that matter among the AI giants: compute orders, investments and debt, from the curated map. Money flows from → to.",
      asof: "Data as of {t}", ago_min: "{n} min ago", ago_h: "{n} h ago", ago_d: "{n} days ago", ago_now: "just now",
      live: "Open the map →", lang: "Language", nav: "Pages", nav_map: "Deal Map", nav_dash: "Key Deals", nav_inv: "Investor Guide",
      intro: "The important deals at a glance, chosen from every deal on the map: the filters above do not apply here. Data as of {t}.",
      open_page: "Open as a full page ↗",
      loading: "Loading the dashboard…",
      k_total: "Committed between companies", k_conf: "Filing / official", k_rep: "Press report",
      k_binding: "Signed or under way: {v}", k_broad: "Broad view {v} adds guarantees and headline plans (ambitions and contingencies, not committed money)",
      k_cont: "Guarantees", k_cont_tag: "Contingent · not in the total", k_cont_note: "Face amount of guarantees, shown separately",
      k_new7: "Added in the last 7 days", k_new30: "Added in the last 30 days", k_ann30: "Announced in the last 30 days", k_deals_n: "{n} deals",
      k_new_note: "{n} deals new to the map, not older deals filled in later",
      k_deals: "Deals tracked", k_deals_note: "{a} with a disclosed amount · {c} companies",
      new_h: "What's new", new_sub: "Deals added to the map in the last 14 days, largest first", new_empty: "No deals were added in the last 14 days.",
      added: "added {d}", more: "Show {n} more", less: "Show fewer",
      chg_h: "Material changes", chg_sub: "Amount, status, confidence or parties revised in the last 14 days", chg_empty: "No material changes in the last 14 days.",
      f_amount_usd: "Amount", f_status: "Status", f_confidence: "Confidence", f_from: "From", f_to: "To", f_kind: "Type",
      deals_h: "Biggest deals", deals_sub: "{n} important deals: new or changed, the 20 largest, deals in circular loops, $10B+ deals and recent deals of $1B or more. Select a row for details.",
      all: "All", search: "Search companies or deals", co_chip: "Company: {c}", clear: "Clear filters",
      col_date: "Announced", col_from: "From (pays / funds)", col_to: "To (receives)", col_deal: "Deal", col_kind: "Type", col_status: "Status", col_amount: "Amount",
      showing: "Showing {a} of {b} deals", show_all: "Show all {n}", show_less: "Show the first {n}", none: "No deals match these filters.",
      undisclosed: "Undisclosed", contingent: "contingent", headline: "headline {v}",
      tl_h: "Deals by month", tl_sub: "Counted amount by announcement month, last 24 months. Guarantees are contingent and not included.",
      tl_kind: "By type", tl_total: "Total", tl_table: "Show the numbers as a table", tl_month: "Month", tl_count: "Deals", tl_usd: "Counted", tl_deals: "{n} deals",
      kc_order: "Orders", kc_investment: "Investments", kc_debt: "Debt", kc_other: "Leases & vendor financing",
      co_h: "Companies", co_sub: "Largest by money paid out plus money received. Select a company to filter the deals table.",
      co_sub_map: "Largest by money paid out plus money received. Select a company to filter the deals table and open its panel on the map.",
      co_name: "Company", co_out: "Pays / funds", co_in: "Receives", co_bor: "Borrowed", co_cds: "CDS (bp)",
      debt_h: "Debt and financing", debt_counted: "Debt counted", debt_vf: "Vendor financing", debt_90: "Debt and financing leases, last 90 days", debt_spv: "Borrowed by AI SPVs",
      tb_h: "Largest borrowers", n_deals: "{n} deals",
      cds_h: "Credit default swaps", cds_sub: "Yearly cost to insure a company's debt, as quoted in the news (100 bp = 1% a year). Higher means the market sees more risk. Widest first.",
      bp: "{v} bp", cds_ch: "{c} since {d}", cds_flat: "unchanged since {d}", cds_one: "one quote, {d}",
      loops_h: "Circular deals", loops_sub: "Money that comes back around: A pays B, B pays C, C pays A. Largest first, as in the map's Loops tab; a loop is only as strong as its smallest leg.",
      loop_2: "Two-way loop", loop_3: "Three-way loop", loop_n: "{n}-way loop", loop_min: "smallest leg {v}", loop_map: "Show on the map",
      notes_h: "How the totals are counted",
      disc: "Descriptive only, not investment advice. 仅作描述，不构成投资建议。",
      licence: "Data CC BY 4.0 · code MIT. Cite as", built: "Figures built {t} from the map's graph.json and change log.",
      nodata_h: "No dashboard data here yet", nodata_p: "The figures come from data/v1/dashboard.json, which is rebuilt with the map at every publish. Try again in a moment, or open the map.",
      nodata_local: "Serving the repository locally? Run python -m monitor dashboard first; it writes _dashboard/dashboard.json, which this page reads.",
      retry: "Try again",
      close: "Close", d_amount: "Counted amount", d_stated: "As stated", d_status: "Status", d_conf: "Confidence", d_ann: "Announced", d_added: "Added to the map", d_src: "Source", d_id: "Deal id",
      d_headline: "Headline figure {v}: shown in the broad view only, not a committed amount.", d_cont: "Guarantee: contingent exposure of {v}, not counted in the totals.",
      d_map: "See it on the map, with every source →", d_party: "See {c} on the map",
      roles: { order: ["Buyer (pays)", "Seller (receives)"], investment: ["Investor (funds)", "Investee (receives)"], debt: ["Lender (funds)", "Borrower (receives)"],
        lease: ["Lessee (pays rent)", "Lessor (receives)"], vendor_financing: ["Financier (funds)", "Beneficiary (receives)"], guarantee: ["Guarantor", "Protected party"] },
      tags: { "new": "New", top: "Top 20", changed: "Changed", circular: "In a loop", big: "$10B+", recent: "Recent, $1B+" },
      kind: { order: "Order", investment: "Investment", debt: "Debt", lease: "Lease", vendor_financing: "Vendor financing", guarantee: "Guarantee" },
      status: { announced: "Announced", signed: "Signed", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled", reported: "Not yet announced" },
      conf: { confirmed: "Filing / official", reported: "Press report", unverified: "Unverified" },
      group: { hyperscaler: "Hyperscaler", model_lab: "AI lab", chip: "Chips", neocloud: "Neocloud", datacenter: "Data center", energy: "Energy", financier: "Financier", spv: "SPV / JV", other: "Other" },
      mon: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    },
    zh: {
      eyebrow: "实时数据 · AI 资金流向", title: "AI 重点交易速览", alt: "Key AI Deals",
      sub: "AI 巨头之间的重要交易：算力订单、投资与债务，取自人工核实的关系图。资金由“支付方”流向“收款方”。",
      asof: "数据截至 {t}", ago_min: "{n} 分钟前", ago_h: "{n} 小时前", ago_d: "{n} 天前", ago_now: "刚刚",
      live: "打开关系图 →", lang: "语言", nav: "页面", nav_map: "关系图", nav_dash: "重点交易", nav_inv: "投资者指南",
      intro: "重点交易一览，从关系图的全部交易中选出：上方的筛选条件不适用于此页。数据截至 {t}。",
      open_page: "在单独页面打开 ↗",
      loading: "正在加载看板…",
      k_total: "公司间已承诺金额", k_conf: "公告确认", k_rep: "媒体报道",
      k_binding: "已签署或进行中：{v}", k_broad: "广义口径 {v}，另含担保与公布的计划规模（属意向与或有事项，并非已承诺资金）",
      k_cont: "担保", k_cont_tag: "或有 · 不计入合计", k_cont_note: "担保面额，单独列示",
      k_new7: "近 7 天新增", k_new30: "近 30 天新增", k_ann30: "近 30 天公布", k_deals_n: "{n} 笔交易",
      k_new_note: "{n} 笔新收录的交易，不含后来补录的旧交易",
      k_deals: "收录交易", k_deals_note: "{a} 笔披露金额 · {c} 家公司",
      new_h: "最新收录", new_sub: "近 14 天新加入关系图的交易，按金额从大到小", new_empty: "近 14 天没有新增交易。",
      added: "{d} 收录", more: "再显示 {n} 条", less: "收起",
      chg_h: "重要变动", chg_sub: "近 14 天金额、状态、可信度或交易方有修订的交易", chg_empty: "近 14 天没有重要变动。",
      f_amount_usd: "金额", f_status: "状态", f_confidence: "可信度", f_from: "支付方", f_to: "收款方", f_kind: "类型",
      deals_h: "最大交易", deals_sub: "共 {n} 笔重要交易：新增或变动的交易、金额前 20 位、循环交易、100 亿美元以上的交易，以及近期 10 亿美元以上的交易。点击一行查看详情。",
      all: "全部", search: "搜索公司或交易", co_chip: "公司：{c}", clear: "清除筛选",
      col_date: "公布日期", col_from: "支付方（付款 / 出资）", col_to: "收款方", col_deal: "交易", col_kind: "类型", col_status: "状态", col_amount: "金额",
      showing: "显示 {a} / {b} 笔交易", show_all: "显示全部 {n} 笔", show_less: "只显示前 {n} 笔", none: "没有符合筛选条件的交易。",
      undisclosed: "未披露", contingent: "或有", headline: "公布规模 {v}",
      tl_h: "按月交易额", tl_sub: "按公布月份统计的计入金额，最近 24 个月。担保属或有事项，不计入。",
      tl_kind: "按类型", tl_total: "合计", tl_table: "以表格查看数字", tl_month: "月份", tl_count: "笔数", tl_usd: "计入金额", tl_deals: "{n} 笔交易",
      kc_order: "订单", kc_investment: "投资", kc_debt: "债务", kc_other: "租赁与供应商融资",
      co_h: "公司排行", co_sub: "按支出与收入合计排序。点击公司即可筛选交易表。",
      co_sub_map: "按支出与收入合计排序。点击公司即可筛选交易表，并在关系图上打开该公司的详情。",
      co_name: "公司", co_out: "支付 / 出资", co_in: "收入", co_bor: "借款", co_cds: "CDS（基点）",
      debt_h: "债务与融资", debt_counted: "计入的债务", debt_vf: "供应商融资", debt_90: "近 90 天新增债务与融资租赁", debt_spv: "AI 特殊目的实体借款",
      tb_h: "最大借款方", n_deals: "{n} 笔",
      cds_h: "信用违约互换", cds_sub: "为该公司债务购买违约保险每年需支付的费用，据媒体报道（100 个基点 = 每年 1%）。数值越高，代表市场认为风险越大。按利差从高到低。",
      bp: "{v} 个基点", cds_ch: "自 {d} 起 {c}", cds_flat: "自 {d} 起未变", cds_one: "仅一次报价（{d}）",
      loops_h: "循环交易", loops_sub: "资金绕一圈回到原处：A 付给 B，B 付给 C，C 再付给 A。按最大一段从大到小排列，与关系图的循环交易页相同；循环的强度取决于最小的一段。",
      loop_2: "双向循环", loop_3: "三方循环", loop_n: "{n} 方循环", loop_min: "最小一段 {v}", loop_map: "在关系图中显示",
      notes_h: "合计的统计口径",
      disc: "仅作描述，不构成投资建议。Descriptive only, not investment advice.",
      licence: "数据 CC BY 4.0 · 代码 MIT。引用格式", built: "数据于 {t} 依据关系图的 graph.json 与变动记录生成。",
      nodata_h: "暂无看板数据", nodata_p: "数据来自 data/v1/dashboard.json，每次发布时与关系图一同重建。请稍后再试，或打开关系图。",
      nodata_local: "在本地运行代码库？请先运行 python -m monitor dashboard，它会写出本页读取的 _dashboard/dashboard.json。",
      retry: "重试",
      close: "关闭", d_amount: "计入金额", d_stated: "金额说明（英文原文）", d_status: "状态", d_conf: "可信度", d_ann: "公布日期", d_added: "收录日期", d_src: "来源", d_id: "交易编号",
      d_headline: "公布规模 {v}：仅在广义口径中显示，并非已承诺金额。", d_cont: "担保：或有风险敞口 {v}，不计入合计。",
      d_map: "在关系图中查看（含全部来源）→", d_party: "在关系图中查看{c}",
      roles: { order: ["买方（付款）", "卖方（收款）"], investment: ["投资方（出资）", "被投资方（收款）"], debt: ["贷款方（出资）", "借款方（收款）"],
        lease: ["承租方（付租金）", "出租方（收款）"], vendor_financing: ["融资提供方", "受益方（收款）"], guarantee: ["担保方", "被担保方"] },
      tags: { "new": "新增", top: "前 20 位", changed: "有变动", circular: "循环交易", big: "100 亿美元以上", recent: "近期 10 亿美元以上" },
      kind: { order: "订单", investment: "投资", debt: "债务", lease: "租赁", vendor_financing: "供应商融资", guarantee: "担保" },
      status: { announced: "已公布", signed: "已签署", in_progress: "进行中", completed: "已完成", cancelled: "已取消", reported: "仅有报道" },
      conf: { confirmed: "公告确认", reported: "媒体报道", unverified: "未核实" },
      group: { hyperscaler: "云巨头", model_lab: "大模型公司", chip: "芯片", neocloud: "新兴算力云", datacenter: "数据中心", energy: "能源", financier: "金融机构", spv: "SPV 与合资公司", other: "其他" }
    }
  };

  /* ---------------------------------------------------------------- state */
  function initialLang() {
    var s = store.get(LS_LANG);
    if (s === "en" || s === "zh") return s;
    var nl = "en";
    try { nl = (navigator.languages && navigator.languages[0]) || navigator.language || "en"; } catch (e) { /* ignore */ }
    return /^zh/i.test(nl) ? "zh" : "en";
  }
  var D = null, ROOT = null, HOST = "page", OPTS = {};
  var state = { lang: "en", status: "loading", kind: "all", q: "", company: null, sort: { key: "amount", dir: -1 }, all: false,
    tl: store.get(LS_TL) === "total" ? "total" : "kind", newMore: false, chgMore: false, coMore: false, drawer: null, lastFocus: null };

  function T(key, vars) {
    var s = STR[state.lang][key];
    if (s == null) s = STR.en[key];
    if (s == null) return key;
    if (vars && typeof s === "string") s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
    if (vars && String(vars.n) === "1" && state.lang === "en") s = s.replace(/\bdeals\b/, "deal");
    return s;
  }
  function colon() { return state.lang === "zh" ? "：" : ": "; }
  function L(map, key) { var m = STR[state.lang][map] || {}; return m[key] || STR.en[map][key] || (key ? String(key).replace(/_/g, " ") : "—"); }
  function isMap() { return HOST === "map"; }

  /* ---------------------------------------------------------------- helpers */
  /* every element id is prefixed with "dash-": the map page has its own ids (timeline, changes, …) */
  function $(id) { return document.getElementById("dash-" + id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }
  function add(parent) { for (var i = 1; i < arguments.length; i++) { var c = arguments[i]; if (c != null) parent.appendChild(typeof c === "string" ? document.createTextNode(c) : c); } return parent; }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
  var SVGNS = "http://www.w3.org/2000/svg";
  function sv(tag, attrs) { var n = document.createElementNS(SVGNS, tag); for (var k in attrs) if (attrs.hasOwnProperty(k)) n.setAttribute(k, attrs[k]); return n; }
  function isNum(n) { return typeof n === "number" && isFinite(n); }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function safeUrl(u) { return typeof u === "string" && /^https?:\/\//i.test(u) ? u : null; }
  function trimNum(x, d) { var s = x.toFixed(d); if (s.indexOf(".") >= 0) s = s.replace(/0+$/, "").replace(/\.$/, ""); return s; }
  /* links into the map: #n-<entity>, #e-<edge>, #l-<a|b(|c)> (site/app.js readHash) */
  function mapHref(type, id) { return MAP_URL + "#" + type + "-" + encodeURIComponent(id); }
  function loopKey(l) { return arr(l.entities).join("|"); }
  /* keyboard activation of a button reports detail 0: the map then moves focus into its panel */
  function viaKeyboard(ev) { return !!ev && (ev.detail === 0 || ev.type === "keydown"); }

  /* USD -> ["$1.24", "T"] or ["1.24", "万亿美元"]; same rounding as site/i18n.js usdCore and monitor/zh.py fmt_amount_zh */
  function usdParts(n) {
    if (!isNum(n)) return null;
    var a = Math.abs(n);
    if (state.lang === "zh") {
      if (a >= 1e12) return [trimNum(n / 1e12, a >= 1e13 ? 1 : 2), " 万亿美元"];
      if (a >= 1e8) { var yi = n / 1e8; return [Math.abs(yi) >= 100 ? String(Math.round(yi)) : trimNum(yi, 1), " 亿美元"]; }
      if (a >= 1e4) return [trimNum(n / 1e4, 0), " 万美元"];
      return [String(Math.round(n)), " 美元"];
    }
    if (a >= 1e12) return ["$" + trimNum(n / 1e12, a >= 1e13 ? 1 : 2), "T"];
    if (a >= 1e9) return ["$" + trimNum(n / 1e9, a >= 1e11 ? 0 : 1), "B"];
    if (a >= 1e6) return ["$" + trimNum(n / 1e6, 0), "M"];
    if (a === 0) return ["$0", ""];
    return ["$" + Math.round(n).toLocaleString("en-US"), ""];
  }
  function usd(n) { var p = usdParts(n); return p ? p[0] + p[1] : "—"; }
  function usdOr(n) { return isNum(n) ? usd(n) : T("undisclosed"); }
  function bigNum(n) {
    var w = el("span"), p = usdParts(n);
    if (!p) { w.textContent = "—"; return w; }
    add(w, p[0], el("span", "unit", p[1].trim()));
    return w;
  }
  function fmtInt(n) { return isNum(n) ? Math.round(n).toLocaleString("en-US") : "—"; }
  function parseDay(s) { var m = typeof s === "string" && s.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/); return m ? { y: +m[1], m: +m[2], d: m[3] ? +m[3] : null } : null; }
  function fmtDate(s) {
    var p = parseDay(s); if (!p) return "—";
    if (state.lang === "zh") return p.y + " 年 " + p.m + " 月" + (p.d ? " " + p.d + " 日" : "");
    return (p.d ? p.d + " " : "") + STR.en.mon[p.m - 1] + " " + p.y;
  }
  function fmtMonth(s, short) {
    var p = parseDay(s); if (!p) return "—";
    if (state.lang === "zh") return (short ? String(p.y).slice(2) : p.y) + " 年 " + p.m + " 月";
    return STR.en.mon[p.m - 1] + (short ? " ’" + String(p.y).slice(2) : " " + p.y);
  }
  function parseTs(s) { if (typeof s !== "string") return null; var d = new Date(s); return isNaN(d.getTime()) ? null : d; }
  function fmtTs(s) {
    var d = parseTs(s); if (!d) return "—";
    var hh = ("0" + d.getUTCHours()).slice(-2) + ":" + ("0" + d.getUTCMinutes()).slice(-2);
    var day = d.getUTCFullYear() + "-" + ("0" + (d.getUTCMonth() + 1)).slice(-2) + "-" + ("0" + d.getUTCDate()).slice(-2);
    return state.lang === "zh" ? fmtDate(day) + " " + hh + "（UTC）" : fmtDate(day) + ", " + hh + " UTC";
  }
  function ago(s) {
    var d = parseTs(s); if (!d) return "";
    var mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return T("ago_now");
    if (mins < 60) return T("ago_min", { n: mins });
    var h = Math.round(mins / 60);
    if (h < 48) return T("ago_h", { n: h });
    return T("ago_d", { n: Math.round(h / 24) });
  }
  function ent(id) { return (D && D.entities && D.entities[id]) || null; }
  function name(id) { var e = ent(id); if (!e) return id ? String(id) : "—"; return (state.lang === "zh" ? e.name_zh || e.name : e.name || e.name_zh) || String(id); }
  function title(o) { if (!o) return "—"; return (state.lang === "zh" ? o.title_zh || o.title_en : o.title_en || o.title_zh) || o.id || "—"; }
  function kdot(kind) {
    var d = el("span", "kdot" + (kind === "guarantee" ? " kdot--guarantee" : ""));
    var c = "var(--k-" + (CLASS[kind] || "other") + ")";
    if (kind === "guarantee") d.style.borderColor = c; else d.style.background = c;
    d.setAttribute("aria-hidden", "true");
    return d;
  }
  function dealAmount(d) {
    if (!d) return null;
    if (d.kind === "guarantee") return isNum(d.contingent_usd) && d.contingent_usd ? d.contingent_usd : (isNum(d.amount_usd) ? d.amount_usd : null);
    return isNum(d.counted_usd) && d.counted_usd ? d.counted_usd : (isNum(d.amount_usd) ? d.amount_usd : null);
  }
  function section(id, h, sub) {
    var c = el("section", "card"); c.id = "dash-" + id; c.setAttribute("aria-labelledby", c.id + "-h");
    var head = el("div", "card__head"), box = el("div");
    var h2 = el("h2", null, h); h2.id = c.id + "-h";
    add(box, h2, sub ? el("p", "card__sub", sub) : null);
    add(head, box); add(c, head);
    return c;
  }

  var DEALS = [], BYID = {};
  function prep() {
    DEALS = arr(D && D.deals).filter(function (d) { return d && typeof d === "object" && d.id; });
    BYID = {};
    DEALS.forEach(function (d) { BYID[d.id] = d; });
  }
  function valid(d) { return !!d && typeof d === "object" && Array.isArray(d.deals); }

  /* a deal, company or loop was picked: the page opens its drawer, the map its own panel */
  function openDeal(id, from, ev) {
    if (!BYID[id]) return;
    if (isMap()) { if (OPTS.onDeal) OPTS.onDeal(id, viaKeyboard(ev)); return; }
    openDrawer(id, from);
  }

  /* ---------------------------------------------------------------- data */
  function fetchData(paths) {
    var list = (paths || DATA_PATHS).slice(), i = 0;
    function next() {
      if (i >= list.length) return Promise.reject(new Error("no dashboard data"));
      var url = list[i++];
      return fetch(url + (url.indexOf("?") >= 0 ? "&" : "?") + "t=" + Date.now(), { cache: "no-store" }).then(function (r) {
        if (!r.ok) throw new Error(url + " " + r.status);
        return r.json();
      }).then(function (j) {
        if (!valid(j)) throw new Error(url + " is not dashboard data");
        return j;
      }).then(null, next);
    }
    return next();
  }

  /* ---------------------------------------------------------------- header (page) */
  function buildPage() {
    var head = el("header", "mast"), inner = el("div", "wrap mast__in"), id = el("div", "mast__id"), tools = el("div", "mast__tools");
    var eb = el("p", "eyebrow"); eb.id = "dash-eyebrow";
    var h1 = el("h1"), ht = el("span"), ha = el("span", "alt"); ht.id = "dash-h-title"; ha.id = "dash-h-alt";
    var sub = el("p", "sub"); sub.id = "dash-h-sub";
    add(id, eb, add(h1, ht, ha), sub);
    var asof = el("div", "asof"); asof.id = "dash-asof";
    var g = el("div", "dseg"); g.id = "dash-lang-group"; g.setAttribute("role", "group");
    [["en", "EN", "en"], ["zh", "中文", "zh-CN"]].forEach(function (l) {
      var b = el("button", null, l[1]); b.type = "button"; b.id = "dash-lang-" + l[0]; b.lang = l[2];
      b.addEventListener("click", function () { setLangFromPage(l[0]); });
      add(g, b);
    });
    /* the site's three pages as tabs (nav.css), the same row as on the map and the investor guide */
    var nav = el("nav", "sitenav"); nav.id = "dash-nav";
    [["map", MAP_URL], ["dash", PAGE_URL], ["inv", "investors.html"]].forEach(function (p) {
      var a = el("a", "sitenav__tab"); a.id = "dash-nav-" + p[0]; a.href = p[1];
      if (p[0] === "dash") a.setAttribute("aria-current", "page");
      add(nav, a);
    });
    add(tools, asof, g);
    add(head, add(el("div", "wrap"), nav), add(inner, id, tools));
    var main = el("main", "wrap dash__main"); main.id = "dash-main";
    var foot = el("footer", "wrap foot"); foot.id = "dash-foot";
    var scrim = el("div", "scrim"); scrim.id = "dash-scrim"; scrim.hidden = true;
    scrim.addEventListener("click", closeDrawer);
    var dr = el("aside", "drawer"); dr.id = "dash-drawer"; dr.hidden = true;
    dr.setAttribute("role", "dialog"); dr.setAttribute("aria-modal", "true"); dr.setAttribute("aria-labelledby", "dash-d-title");
    add(ROOT, head, main, foot, scrim, dr);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && state.drawer) closeDrawer();
      if (e.key === "Tab" && state.drawer) {
        var f = $("drawer").querySelectorAll("a[href], button");
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    var rt = null, lastW = 0;
    window.addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(function () { var b = $("tl-chart"); if (b && b.clientWidth !== lastW) { lastW = b.clientWidth; drawTimeline(); } }, 120);
    });
  }
  function renderHeader() {
    document.documentElement.lang = state.lang === "zh" ? "zh-CN" : "en";
    document.title = T("title") + " · " + T("alt");
    $("eyebrow").textContent = T("eyebrow");
    $("h-title").textContent = T("title");
    var alt = $("h-alt"); alt.textContent = T("alt"); alt.lang = state.lang === "zh" ? "en" : "zh-CN";
    $("h-sub").textContent = T("sub");
    var a = clear($("asof"));
    if (D && D.generated_at) {
      var age = parseTs(D.generated_at), stale = age && (Date.now() - age.getTime()) > 36 * 3600e3;
      add(a, el("span", "adot" + (stale ? " stale" : "")), el("span", null, T("asof", { t: fmtTs(D.generated_at) }) + " · " + ago(D.generated_at)));
    }
    $("lang-group").setAttribute("aria-label", T("lang"));
    $("lang-en").setAttribute("aria-pressed", state.lang === "en" ? "true" : "false");
    $("lang-zh").setAttribute("aria-pressed", state.lang === "zh" ? "true" : "false");
    $("nav").setAttribute("aria-label", T("nav"));
    ["map", "dash", "inv"].forEach(function (k) { $("nav-" + k).textContent = T("nav_" + k); });
  }

  /* ---------------------------------------------------------------- header (map tab) */
  function buildEmbed() {
    var intro = el("div", "intro"); intro.id = "dash-intro";
    var main = el("div", "dash__main"); main.id = "dash-main";
    var foot = el("div", "foot foot--embed"); foot.id = "dash-foot";
    add(ROOT, intro, main, foot);
  }
  function renderIntro() {
    var box = clear($("intro"));
    if (!D) return;
    add(box, el("p", null, T("intro", { t: fmtTs(D.generated_at) })));
    var a = el("a", null, T("open_page")); a.href = PAGE_URL; a.target = "_blank"; a.rel = "noopener";
    add(box, a);
  }

  /* ---------------------------------------------------------------- KPIs */
  function kpiTile(label, value, note) {
    var t = el("div", "kpi"), tv = el("div", "kpi__value"); add(tv, bigNum(value));
    add(t, el("div", "kpi__label", label), tv, note ? el("div", "kpi__note", note) : null);
    return t;
  }
  function renderKpis(main) {
    var k = (D && D.kpis) || {};
    if (isMap()) {
      /* the map's tiles above already show the totals, the split and the guarantees: only what is new here */
      var r3 = el("section", "kpis kpis--3"); r3.setAttribute("aria-label", T("k_new7"));
      add(r3, kpiTile(T("k_new7"), (k.new_7d || {}).usd, T("k_new_note", { n: fmtInt((k.new_7d || {}).count) })),
        kpiTile(T("k_new30"), (k.new_30d || {}).usd, T("k_new_note", { n: fmtInt((k.new_30d || {}).count) })),
        kpiTile(T("k_ann30"), (k.announced_30d || {}).usd, T("k_deals_n", { n: fmtInt((k.announced_30d || {}).count) })));
      return add(main, r3);
    }
    var row = el("section", "kpis"); row.setAttribute("aria-label", T("k_total"));
    var hero = el("div", "kpi kpi--hero");
    var v = el("div", "kpi__value"); add(v, bigNum(k.total_usd));
    add(hero, el("div", "kpi__label", T("k_total")), v);
    var c = isNum(k.confirmed_usd) ? k.confirmed_usd : 0, r = isNum(k.reported_usd) ? k.reported_usd : 0, s = c + r;
    if (s > 0) {
      var split = el("div", "split"); split.setAttribute("role", "img");
      var pc = Math.round(c / s * 100);
      split.setAttribute("aria-label", T("k_conf") + " " + usd(c) + " (" + pc + "%), " + T("k_rep") + " " + usd(r) + " (" + (100 - pc) + "%)");
      var sa = el("span", "a"), sb = el("span", "b"); sa.style.flex = String(c); sb.style.flex = String(r);
      add(split, sa, sb);
      var lg = el("div", "dlegend");
      var i1 = el("i"); i1.style.background = "var(--ink)"; var i2 = el("i"); i2.style.background = "var(--line-strong)";
      add(lg, add(el("span"), i1, T("k_conf") + " " + usd(c) + " · " + pc + "%"), add(el("span"), i2, T("k_rep") + " " + usd(r) + " · " + (100 - pc) + "%"));
      add(hero, split, lg);
    }
    if (isNum(k.binding_usd)) add(hero, el("div", "kpi__note", T("k_binding", { v: usd(k.binding_usd) })));
    if (isNum(k.broad_usd)) add(hero, el("div", "broad", T("k_broad", { v: usd(k.broad_usd) })));
    add(row, hero);

    var cont = el("div", "kpi kpi--cont"), cv = el("div", "kpi__value"); add(cv, bigNum(k.contingent_usd));
    add(cont, el("div", "kpi__label", T("k_cont")), cv, el("span", "tagline", T("k_cont_tag")), el("div", "kpi__note", T("k_cont_note")));
    add(row, cont);
    add(row, kpiTile(T("k_new7"), (k.new_7d || {}).usd, T("k_deals_n", { n: fmtInt((k.new_7d || {}).count) })),
      kpiTile(T("k_new30"), (k.new_30d || {}).usd, T("k_deals_n", { n: fmtInt((k.new_30d || {}).count) })));
    var dt = el("div", "kpi"), dv = el("div", "kpi__value", fmtInt(k.deals));
    add(dt, el("div", "kpi__label", T("k_deals")), dv, el("div", "kpi__note", T("k_deals_note", { a: fmtInt(k.deals_with_amount), c: fmtInt(k.companies) })));
    add(row, dt);
    add(main, row);
  }

  /* ---------------------------------------------------------------- what's new + changes */
  function feedItem(d, amountText, metaNodes) {
    var li = el("li"), b = el("button", "dfeed__btn"); b.type = "button";
    add(b, kdot(d ? d.kind : null), el("span", "dfeed__title", title(d)), el("span", "dfeed__amt dnum", amountText));
    var meta = el("span", "dfeed__meta"); metaNodes.forEach(function (m) { add(meta, m); });
    add(b, meta);
    if (d && BYID[d.id]) b.addEventListener("click", function (ev) { openDeal(d.id, b, ev); });
    else b.disabled = true;
    return add(li, b);
  }
  function renderNew(parent) {
    var c = section("new", T("new_h"), T("new_sub"));
    var ids = arr(D.new_ids).filter(function (id) { return BYID[id]; });
    if (!ids.length) { add(c, el("p", "dempty", T("new_empty"))); return add(parent, c); }
    var lim = state.newMore ? ids.length : 6, ul = el("ul", "dfeed");
    ids.slice(0, lim).forEach(function (id) {
      var d = BYID[id], amt = dealAmount(d);
      add(ul, feedItem(d, isNum(amt) ? usd(amt) : T("undisclosed"), [name(d.from) + " → " + name(d.to) + " · " + L("kind", d.kind) + (d.added ? " · " + T("added", { d: fmtDate(d.added) }) : "")]));
    });
    add(c, ul);
    if (ids.length > 6) {
      var m = el("button", "more", state.newMore ? T("less") : T("more", { n: ids.length - 6 })); m.type = "button";
      m.addEventListener("click", function () { state.newMore = !state.newMore; render(); });
      add(c, m);
    }
    add(parent, c);
  }
  function fieldVal(f, v) {
    if (v == null || v === "") return f === "amount_usd" ? T("undisclosed") : "—";
    if (f === "amount_usd") return usdOr(v);
    if (f === "status") return L("status", v);
    if (f === "confidence") return L("conf", v);
    if (f === "kind") return L("kind", v);
    if (f === "from" || f === "to") return name(v);
    return String(v);
  }
  function renderChanges(parent) {
    var c = section("changes", T("chg_h"), T("chg_sub"));
    var list = arr(D.changes).filter(function (x) { return x && x.fields && typeof x.fields === "object"; });
    if (!list.length) { add(c, el("p", "dempty", T("chg_empty"))); return add(parent, c); }
    var lim = state.chgMore ? list.length : 6, ul = el("ul", "dfeed");
    list.slice(0, lim).forEach(function (x) {
      var d = BYID[x.id], diffs = [];
      Object.keys(x.fields).forEach(function (f) {
        var fv = x.fields[f] || {};
        var line = el("span", "diff");
        add(line, el("b", null, T("f_" + f) + colon()), fieldVal(f, fv.from) + " → ", el("span", "to", fieldVal(f, fv.to)));
        diffs.push(line);
      });
      diffs.push(el("span", "small", fmtDate(x.date)));
      var li = feedItem(d || { id: x.id, title_en: x.title_en, title_zh: x.title_zh, kind: null }, "", diffs);
      li.querySelector(".dfeed__title").textContent = title(x.title_en || x.title_zh ? x : d);
      if (d) li.querySelector(".kdot").replaceWith(kdot(d.kind));
      add(ul, li);
    });
    add(c, ul);
    if (list.length > 6) {
      var m = el("button", "more", state.chgMore ? T("less") : T("more", { n: list.length - 6 })); m.type = "button";
      m.addEventListener("click", function () { state.chgMore = !state.chgMore; render(); });
      add(c, m);
    }
    add(parent, c);
  }

  /* ---------------------------------------------------------------- deals table */
  function matches(d, q) {
    if (!q) return true;
    var hay = [d.title_en, d.title_zh, d.subkind, d.subkind_zh, d.id];
    [d.from, d.to].forEach(function (id) { var e = ent(id); hay.push(id); if (e) hay.push(e.name, e.name_zh, e.ticker); });
    return hay.join(" ").toLowerCase().indexOf(q) >= 0;
  }
  function filtered(ignoreKind) {
    var q = state.q.trim().toLowerCase();
    return DEALS.filter(function (d) {
      if (!ignoreKind && state.kind !== "all" && d.kind !== state.kind) return false;
      if (state.company && d.from !== state.company && d.to !== state.company) return false;
      return matches(d, q);
    });
  }
  function sortDeals(list) {
    var k = state.sort.key, dir = state.sort.dir;
    function val(d) {
      if (k === "amount") return dealAmount(d);
      if (k === "date") return d.announced || null;
      if (k === "kind") return KINDS.indexOf(d.kind);
      if (k === "status") return STATUSES.indexOf(d.status);
      return null;
    }
    return list.slice().sort(function (a, b) {
      var x = val(a), y = val(b);
      if (x == null && y == null) return (b.announced || "") < (a.announced || "") ? -1 : 1;
      if (x == null) return 1;
      if (y == null) return -1;
      if (x < y) return -dir;
      if (x > y) return dir;
      var ax = dealAmount(a) || 0, bx = dealAmount(b) || 0;
      return bx - ax;
    });
  }
  function renderDeals(main) {
    var c = section("deals", T("deals_h"), T("deals_sub", { n: DEALS.length }));
    var bar = el("div", "toolbar"), chips = el("div", "dchips");
    chips.setAttribute("role", "group"); chips.setAttribute("aria-label", T("col_kind"));
    var base = filtered(true), counts = {};
    base.forEach(function (d) { counts[d.kind] = (counts[d.kind] || 0) + 1; });
    ["all"].concat(KINDS).forEach(function (k) {
      var n = k === "all" ? base.length : counts[k] || 0;
      if (k !== "all" && !n && state.kind !== k) return;
      var b = el("button", "dchip"); b.type = "button";
      b.setAttribute("aria-pressed", state.kind === k ? "true" : "false");
      if (k !== "all") add(b, kdot(k));
      add(b, k === "all" ? T("all") : L("kind", k), el("span", "n", n));
      b.addEventListener("click", function () { state.kind = k; state.all = false; render(); focusEl($("deals-chip-" + k)); });
      b.id = "dash-deals-chip-" + k;
      add(chips, b);
    });
    add(bar, chips);
    var sw = el("label", "search"), inp = el("input");
    inp.type = "search"; inp.id = "dash-deal-search"; inp.placeholder = T("search"); inp.value = state.q; inp.setAttribute("aria-label", T("search"));
    inp.autocomplete = "off";
    inp.addEventListener("input", function () { state.q = inp.value; state.all = false; renderTableOnly(); });
    add(sw, inp); add(bar, sw);
    var coBox = el("span"); coBox.id = "dash-co-filter"; add(bar, coBox);
    add(c, bar);
    var holder = el("div"); holder.id = "dash-deal-table"; add(c, holder);
    add(main, c);
    fillTable();
  }
  function renderTableOnly() {
    /* keep the search box (and its focus) while the rows change */
    fillTable();
    var chips = ROOT.querySelectorAll("#dash-deals .dchip .n"), base = filtered(true), counts = {};
    base.forEach(function (d) { counts[d.kind] = (counts[d.kind] || 0) + 1; });
    Array.prototype.forEach.call(chips, function (n) {
      var k = n.parentNode.id.replace("dash-deals-chip-", "");
      n.textContent = k === "all" ? base.length : counts[k] || 0;
    });
  }
  function fillTable() {
    var holder = $("deal-table"); if (!holder) return;
    clear(holder);
    var co = $("co-filter");
    if (co) {
      clear(co);
      if (state.company) {
        var cb = el("button", "dchip dchip--co", T("co_chip", { c: name(state.company) }) + "  ×"); cb.type = "button";
        cb.setAttribute("aria-label", T("clear") + ": " + name(state.company));
        cb.addEventListener("click", function () { state.company = null; render(); });
        add(co, cb);
      }
    }
    var list = sortDeals(filtered(false));
    if (!list.length) {
      var e = el("p", "dempty", T("none") + " ");
      var cl = el("button", "more", T("clear")); cl.type = "button";
      cl.addEventListener("click", function () { state.kind = "all"; state.q = ""; state.company = null; render(); });
      add(holder, add(e, cl));
      return;
    }
    var page = (ROOT.clientWidth || window.innerWidth) < 760 ? 10 : 25, shown = state.all ? list : list.slice(0, page);
    var wrap = el("div", "tablewrap"), tbl = el("table"), thead = el("thead"), hr = el("tr");
    var cols = [["date", "c-date", "col_date"], [null, "c-party", "col_from"], [null, "c-party", "col_to"], [null, "c-deal", "col_deal"],
      ["kind", "c-kind", "col_kind"], ["status", "c-status", "col_status"], ["amount", "c-amt", "col_amount"]];
    cols.forEach(function (col) {
      var th = el("th", col[1]); th.scope = "col";
      if (col[0]) {
        var b = el("button"); b.type = "button";
        var on = state.sort.key === col[0];
        add(b, T(col[2]), el("span", "sarr", on ? (state.sort.dir < 0 ? "▼" : "▲") : ""));
        if (on) th.setAttribute("aria-sort", state.sort.dir < 0 ? "descending" : "ascending");
        b.addEventListener("click", function () {
          if (state.sort.key === col[0]) state.sort.dir = -state.sort.dir;
          else state.sort = { key: col[0], dir: col[0] === "kind" || col[0] === "status" ? 1 : -1 };
          fillTable(); focusEl(ROOT.querySelector("#dash-deal-table th." + col[1] + " button"));
        });
        add(th, b);
      } else th.textContent = T(col[2]);
      add(hr, th);
    });
    add(tbl, add(thead, hr));
    var tb = el("tbody");
    shown.forEach(function (d) {
      var tr = el("tr"); tr.tabIndex = 0; tr.dataset.id = d.id;
      if (state.drawer === d.id) tr.className = "sel";
      var amt = dealAmount(d), ac = el("td", "c-amt");
      if (isNum(amt)) { add(ac, usd(amt)); if (d.kind === "guarantee") add(ac, el("span", "small", T("contingent"))); }
      else { add(ac, el("span", "undis", T("undisclosed"))); if (isNum(d.headline_usd)) add(ac, el("span", "small", T("headline", { v: usd(d.headline_usd) }))); }
      var dc = el("td", "c-deal");
      add(dc, el("div", "t", title(d)), el("div", "p", name(d.from) + " → " + name(d.to)));
      var m = el("div", "m"); add(m, add(el("span", "kindcell"), kdot(d.kind), L("kind", d.kind)), " · " + L("status", d.status)); add(dc, m);
      add(tr, el("td", "c-date", fmtDate(d.announced)), el("td", "c-party", name(d.from)), el("td", "c-party", name(d.to)), dc,
        add(el("td", "c-kind"), add(el("span", "kindcell"), kdot(d.kind), L("kind", d.kind))),
        add(el("td", "c-status"), el("span", "pill" + (BINDING[d.status] ? " bind" : ""), L("status", d.status))), ac);
      tr.addEventListener("click", function (ev) { openDeal(d.id, tr, ev); });
      tr.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openDeal(d.id, tr, ev); } });
      add(tb, tr);
    });
    add(tbl, tb); add(wrap, tbl); add(holder, wrap);
    var foot = el("div", "tblfoot");
    add(foot, el("span", null, T("showing", { a: shown.length, b: list.length })));
    if (list.length > page) {
      var mb = el("button", "dbtn", state.all ? T("show_less", { n: page }) : T("show_all", { n: list.length })); mb.type = "button";
      mb.addEventListener("click", function () { state.all = !state.all; fillTable(); });
      add(foot, mb);
    }
    add(holder, foot);
  }
  function focusEl(n) { if (n) n.focus(); }

  /* ---------------------------------------------------------------- timeline (page only: the map has its own) */
  function niceStep(max, n) {
    var raw = max / n, p = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  function stackOf(t) {
    var bk = t.by_kind || {}, o = { order: 0, investment: 0, debt: 0, other: 0 };
    KINDS.forEach(function (k) { if (k !== "guarantee" && isNum(bk[k])) o[CLASS[k]] += bk[k]; });
    return o;
  }
  function topPath(x, y, w, h, r) {
    r = Math.min(r, h, w / 2);
    return "M" + x + "," + (y + h) + "V" + (y + r) + "Q" + x + "," + y + " " + (x + r) + "," + y + "H" + (x + w - r) + "Q" + (x + w) + "," + y + " " + (x + w) + "," + (y + r) + "V" + (y + h) + "Z";
  }
  function renderTimeline(main) {
    var c = section("timeline", T("tl_h"), T("tl_sub"));
    var head = c.querySelector(".card__head"), seg = el("div", "dseg");
    seg.setAttribute("role", "group"); seg.setAttribute("aria-label", T("tl_h"));
    [["kind", "tl_kind"], ["total", "tl_total"]].forEach(function (m) {
      var b = el("button", null, T(m[1])); b.type = "button"; b.id = "dash-tl-" + m[0];
      b.setAttribute("aria-pressed", state.tl === m[0] ? "true" : "false");
      b.addEventListener("click", function () { state.tl = m[0]; store.set(LS_TL, m[0]); render(); focusEl($("tl-" + m[0])); });
      add(seg, b);
    });
    add(head, seg);
    if (state.tl === "kind") {
      var lg = el("div", "dlegend"); lg.style.marginBottom = "8px";
      STACK.forEach(function (k) { var i = el("i"); i.style.background = "var(--k-" + k + ")"; add(lg, add(el("span"), i, T("kc_" + k))); });
      add(c, lg);
    }
    var box = el("div", "chart"); box.id = "dash-tl-chart"; add(c, box);
    var rows = arr(D.timeline).filter(function (t) { return t && t.month; });
    if (rows.length) {
      var det = el("details"), sum = el("summary", null, T("tl_table")), tbl = el("table", "mini"), tr0 = el("tr");
      [T("tl_month"), T("tl_count")].concat(STACK.map(function (k) { return T("kc_" + k); }), [T("tl_usd")]).forEach(function (h) { add(tr0, el("th", null, h)); });
      add(tbl, add(el("thead"), tr0));
      var tb = el("tbody");
      rows.slice().reverse().forEach(function (t) {
        var s = stackOf(t), r = el("tr");
        add(r, el("td", null, fmtMonth(t.month)), el("td", "dnum", fmtInt(t.count)));
        STACK.forEach(function (k) { add(r, el("td", "dnum", s[k] ? usd(s[k]) : "—")); });
        add(r, el("td", "dnum", usd(t.usd)));
        add(tb, r);
      });
      add(tbl, tb);
      var tw = el("div", "tablewrap"); add(tw, tbl);
      add(det, sum, tw); add(c, det);
    }
    add(main, c);
    drawTimeline();
  }
  function drawTimeline() {
    var box = $("tl-chart"); if (!box) return;
    clear(box);
    var rows = arr(D.timeline).filter(function (t) { return t && t.month; });
    if (!rows.length) { add(box, el("p", "dempty", "—")); return; }
    var W = Math.max(280, box.clientWidth || 600), H = W < 520 ? 210 : 250;
    var ml = state.lang === "zh" ? 64 : 44, mr = 4, mt = 10, mb = 26, iw = W - ml - mr, ih = H - mt - mb;
    var totals = rows.map(function (t) { var s = stackOf(t); return isNum(t.usd) ? t.usd : s.order + s.investment + s.debt + s.other; });
    var max = Math.max.apply(null, totals.concat([1])), step = niceStep(max, 4), top = Math.ceil(max / step) * step;
    var y = function (v) { return mt + ih - (v / top) * ih; };
    var svg = sv("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, role: "img", "aria-label": T("tl_h") + ". " + T("tl_sub") });
    for (var v = 0; v <= top + 1; v += step) {
      add(svg, sv("line", { x1: ml, x2: W - mr, y1: y(v), y2: y(v), stroke: v === 0 ? "var(--line-strong)" : "var(--grid)", "stroke-width": 1, "shape-rendering": "crispEdges" }));
      var tx = sv("text", { x: ml - 6, y: y(v) + 4, "text-anchor": "end" }); tx.textContent = v === 0 ? "0" : usd(v); add(svg, tx);
    }
    var band = iw / rows.length, bw = Math.min(24, band * 0.68);
    var every = band < 22 ? 6 : 3;
    var hover = sv("rect", { y: mt, height: ih, width: band, fill: "var(--surface-2)", opacity: 0 }); add(svg, hover);
    var tip = el("div", "tip"); tip.hidden = true;
    rows.forEach(function (t, i) {
      var cx = ml + band * i + band / 2, x = cx - bw / 2, s = stackOf(t), cum = 0;
      var segs = state.tl === "kind" ? STACK.filter(function (k) { return s[k] > 0; }).map(function (k) { return [k, s[k]]; }) : (totals[i] > 0 ? [["total", totals[i]]] : []);
      segs.forEach(function (p, j) {
        var y0 = y(cum), y1 = y(cum + p[1]), h = y0 - y1 - (j > 0 ? 2 : 0);
        cum += p[1];
        if (h <= 0.5) return;
        var fill = p[0] === "total" ? "var(--accent)" : "var(--k-" + p[0] + ")";
        if (j === segs.length - 1) add(svg, sv("path", { d: topPath(x, y1, bw, h, 4), fill: fill }));
        else add(svg, sv("rect", { x: x, y: y1, width: bw, height: h, fill: fill }));
      });
      if (i % every === (rows.length - 1) % every) {
        var lx = sv("text", { x: cx, y: H - 8, "text-anchor": "middle" }); lx.textContent = fmtMonth(t.month, true); add(svg, lx);
      }
      var hit = sv("rect", { x: ml + band * i, y: mt, width: band, height: ih + mb, fill: "transparent", tabindex: 0, role: "img",
        "aria-label": fmtMonth(t.month) + ": " + usd(totals[i]) + ", " + T("tl_deals", { n: fmtInt(t.count) }) });
      function show() {
        hover.setAttribute("x", ml + band * i); hover.setAttribute("opacity", 1);
        clear(tip); add(tip, el("b", null, fmtMonth(t.month)));
        var r0 = el("div", "row"); add(r0, el("span", null, T("tl_deals", { n: fmtInt(t.count) })), el("strong", "dnum", usd(totals[i]))); add(tip, r0);
        STACK.forEach(function (k) {
          if (!s[k]) return;
          var r = el("div", "row"), sw = el("i"); sw.style.background = "var(--k-" + k + ")";
          add(r, add(el("span"), sw, T("kc_" + k)), el("span", "dnum", usd(s[k]))); add(tip, r);
        });
        tip.hidden = false;
        var bx = box.clientWidth, tw = tip.offsetWidth, left = (cx / W) * bx + 14;
        if (left + tw > bx) left = (cx / W) * bx - tw - 14;
        tip.style.left = Math.max(0, left) + "px"; tip.style.top = "8px";
      }
      function hide() { hover.setAttribute("opacity", 0); tip.hidden = true; }
      hit.addEventListener("mouseenter", show); hit.addEventListener("focus", show);
      hit.addEventListener("mouseleave", hide); hit.addEventListener("blur", hide);
      hit.addEventListener("touchstart", show, { passive: true });
      add(svg, hit);
    });
    add(box, svg, tip);
  }

  /* ---------------------------------------------------------------- companies */
  function cdsCell(cd) {
    var w = el("span");
    if (!cd || !isNum(cd.bp)) { w.textContent = "—"; return w; }
    add(w, fmtInt(cd.bp));
    if (isNum(cd.first_bp) && cd.first_as_of && cd.first_as_of !== cd.as_of) {
      var ch = Math.round(cd.bp - cd.first_bp);
      if (ch) add(w, " ", el("span", ch > 0 ? "up" : "down", (ch > 0 ? "▲ +" : "▼ ") + ch));
    }
    return w;
  }
  function renderCompanies(parent) {
    var c = section("companies", T("co_h"), T(isMap() ? "co_sub_map" : "co_sub"));
    var list = arr(D.companies).filter(function (x) { return x && x.id; });
    if (!list.length) { add(c, el("p", "dempty", "—")); return add(parent, c); }
    var max = 1;
    list.forEach(function (x) { max = Math.max(max, x.out_usd || 0, x.in_usd || 0); });
    var g = el("div", "co"), h = el("div", "co__head");
    add(h, el("span", null, T("co_name")), el("span", "r", T("co_out") + " ◀"), el("span", null, "▶ " + T("co_in")), el("span", "r", T("co_bor")), el("span", "r", T("co_cds")));
    add(g, h);
    var lim = state.coMore ? list.length : 12;
    list.slice(0, lim).forEach(function (x) {
      var b = el("button", "co__row"); b.type = "button"; b.id = "dash-co-" + x.id;
      b.setAttribute("aria-pressed", state.company === x.id ? "true" : "false");
      var nm = el("span", "co__name", name(x.id)); add(nm, el("span", "g", L("group", x.group || (ent(x.id) || {}).group)));
      function bar(cls, v, lbl) {
        var s = el("span", "bar " + cls), tk = el("span", "tk"), f = el("span", "f"); f.style.width = Math.max(isNum(v) && v > 0 ? 2 : 0, (isNum(v) ? v : 0) / max * 100) + "%";
        add(s, add(tk, f), el("span", "v", isNum(v) && v > 0 ? usd(v) : "—")); s.setAttribute("aria-label", lbl + " " + usd(v));
        return s;
      }
      var bo = el("span", "r co__bor dnum", isNum(x.borrowed_usd) && x.borrowed_usd > 0 ? usd(x.borrowed_usd) : "—"); bo.setAttribute("data-l", T("co_bor"));
      var cd = el("span", "co__cds"); add(cd, cdsCell(x.cds)); cd.setAttribute("data-l", "CDS");
      add(b, nm, bar("bar--out", x.out_usd, T("co_out")), bar("bar--in", x.in_usd, T("co_in")), bo, cd);
      b.addEventListener("click", function (ev) {
        var on = state.company !== x.id;
        state.company = on ? x.id : null; state.all = false; state.kind = "all";
        render();
        if (isMap()) {
          /* the map's own panel shows the company; focus stays on the row unless a keyboard opened it */
          if (on && OPTS.onCompany) OPTS.onCompany(x.id, viaKeyboard(ev));
          if (!on || !viaKeyboard(ev)) focusEl($("co-" + x.id));
          return;
        }
        var t = $("deals"); if (t && state.company) t.scrollIntoView({ block: "start" });
        if (!state.company) focusEl($("co-" + x.id));
      });
      add(g, b);
    });
    add(c, g);
    if (list.length > 12) {
      var m = el("button", "more", state.coMore ? T("less") : T("more", { n: list.length - 12 })); m.type = "button";
      m.addEventListener("click", function () { state.coMore = !state.coMore; render(); });
      add(c, m);
    }
    add(parent, c);
  }

  /* ---------------------------------------------------------------- debt + cds */
  function hbars(rows, cls, max) {
    var w = el("div", "hbars");
    rows.forEach(function (r) {
      var row = el("div", "hbar " + cls), nm = el("span", "nm", r.name);
      if (r.sub) add(nm, el("span", "sub", r.sub));
      var tr = el("span", "tr"), f = el("span", "f"); f.style.width = Math.max(1, (r.v || 0) / (max || 1) * 60) + "%";
      add(tr, f, el("span", "v", r.label));
      add(w, add(row, nm, tr));
    });
    return w;
  }
  function renderDebt(parent) {
    var c = section("debt", T("debt_h"), null), dbt = D.debt || {};
    var bk = {}; arr(D.by_kind).forEach(function (k) { if (k && k.kind) bk[k.kind] = k; });
    var figs = el("div", "figs");
    function fig(v, l, n) { var f = el("div"), fv = el("div", "fig__v"); add(fv, bigNum(v)); add(f, fv, el("div", "fig__l", l + (n != null ? " · " + T("n_deals", { n: fmtInt(n) }) : ""))); return f; }
    add(figs, fig((bk.debt || {}).usd, T("debt_counted"), (bk.debt || {}).count), fig((bk.vendor_financing || {}).usd, T("debt_vf"), (bk.vendor_financing || {}).count),
      fig((dbt.recent_90d || {}).usd, T("debt_90"), (dbt.recent_90d || {}).count), fig(dbt.spv_usd, T("debt_spv"), null));
    add(c, figs);
    var tb = arr(dbt.top_borrowers).filter(function (x) { return x && x.id; });
    if (tb.length) {
      add(c, el("h3", null, T("tb_h")));
      var mx = Math.max.apply(null, tb.map(function (x) { return x.usd || 0; }).concat([1]));
      add(c, hbars(tb.map(function (x) { return { name: name(x.id), v: x.usd, label: usd(x.usd) + " · " + T("n_deals", { n: fmtInt(x.count) }) }; }), "hbar--debt", mx));
    }
    var cds = arr(D.cds).filter(function (x) { return x && x.id && isNum(x.bp); }).sort(function (a, b) { return b.bp - a.bp; });
    if (cds.length) {
      var h3 = el("h3", null, T("cds_h")); add(c, h3, el("p", "card__sub", T("cds_sub")));
      var cm = cds[0].bp, w = el("div", "hbars"); w.style.marginTop = "8px";
      cds.forEach(function (x) {
        var row = el("div", "hbar hbar--cds"), nm = el("span", "nm", name(x.id));
        var sub;
        if (isNum(x.first_bp) && x.first_as_of && x.first_as_of !== x.as_of) {
          var ch = Math.round(x.bp - x.first_bp);
          sub = ch ? T("cds_ch", { c: (ch > 0 ? "+" : "") + ch, d: fmtDate(x.first_as_of) }) : T("cds_flat", { d: fmtDate(x.first_as_of) });
          var s = el("span", "sub"); add(s, ch ? el("span", ch > 0 ? "up" : "down", ch > 0 ? "▲ " : "▼ ") : null, sub); add(nm, s);
        } else add(nm, el("span", "sub", T("cds_one", { d: fmtDate(x.as_of) })));
        var tr = el("span", "tr"), f = el("span", "f"); f.style.width = Math.max(1, x.bp / cm * 60) + "%";
        add(tr, f, el("span", "v", T("bp", { v: fmtInt(x.bp) }) + (x.tenor ? " · " + x.tenor : "")));
        tr.title = fmtDate(x.as_of);
        add(w, add(row, nm, tr));
      });
      add(c, w);
    }
    add(parent, c);
  }

  /* ---------------------------------------------------------------- circular */
  function renderLoops(main) {
    var loops = arr(D.circular).filter(function (l) { return l && arr(l.legs).length; });
    if (!loops.length) return;
    var c = section("loops", T("loops_h"), T("loops_sub")), g = el("div", "dloops");
    loops.forEach(function (l) {
      var n = arr(l.entities).length || arr(l.legs).length;
      var card = el("div", "loop"), h = el("div", "loop__h");
      add(h, el("span", null, n === 2 ? T("loop_2") : n === 3 ? T("loop_3") : T("loop_n", { n: n })), el("span", null, T("loop_min", { v: usdOr(l.min_usd) })));
      var ch = el("div"), path = [];
      l.legs.forEach(function (leg, i) {
        if (i === 0) path.push(name(leg.from));
        path.push(name(leg.to));
        var b = el("button", "dleg"); b.type = "button";
        var kinds = arr(leg.kinds).filter(function (k, j, a) { return a.indexOf(k) === j; }).map(function (k) { return L("kind", k); }).join(" + ");
        add(b, el("span", null, name(leg.from) + " → " + name(leg.to)), el("span", "lamt", usdOr(leg.usd)), el("span", "k", kinds || "—"));
        var target = arr(leg.edge_ids).filter(function (id) { return BYID[id]; })[0];
        if (target) { b.addEventListener("click", function (ev) { openDeal(target, b, ev); }); b.setAttribute("aria-label", name(leg.from) + " → " + name(leg.to) + ": " + usdOr(leg.usd) + " " + kinds); }
        else b.disabled = true;
        add(ch, b);
      });
      var go;
      if (isMap()) {
        go = el("button", "loop__go", T("loop_map")); go.type = "button";
        go.addEventListener("click", function (ev) { if (OPTS.onLoop) OPTS.onLoop(loopKey(l), viaKeyboard(ev)); });
      } else {
        go = el("a", "loop__go", T("loop_map") + " →"); go.href = mapHref("l", loopKey(l));
      }
      add(card, h, el("p", "loop__chain", path.join(" → ")), ch, go); add(g, card);
    });
    add(c, g); add(main, c);
  }

  /* ---------------------------------------------------------------- footer */
  function renderFoot() {
    var f = clear($("foot"));
    var notes = D && D.notes ? (state.lang === "zh" ? D.notes.zh || D.notes.en : D.notes.en || D.notes.zh) : null;
    if (notes) {
      var det = el("details"); add(det, el("summary", null, T("notes_h")), el("p", null, notes)); add(f, det);
    }
    if (!isMap()) {
      add(f, el("p", "disc", T("disc")));
      var day = (D && typeof D.generated_at === "string" ? D.generated_at.slice(0, 10) : "") || new Date().toISOString().slice(0, 10);
      var live = safeUrl(D && D.live_url) || "https://heyneww.github.io/GL-AI-live/";
      var p = el("p"); add(p, T("licence") + colon(), el("span", "cite", "AI Orders & Debt Map, heyneww, " + day + ", " + live)); add(f, p);
    }
    if (D && D.built_at) add(f, el("p", "muted", T("built", { t: fmtTs(D.built_at) })));
  }

  /* ---------------------------------------------------------------- drawer (page only) */
  function openDrawer(id, from) {
    var d = BYID[id]; if (!d) return;
    if (!state.drawer) state.lastFocus = from || document.activeElement;
    state.drawer = id;
    var dr = clear($("drawer"));
    var x = el("button", "drawer__close", "×"); x.type = "button"; x.setAttribute("aria-label", T("close"));
    x.addEventListener("click", closeDrawer);
    var kicker = el("p", "eyebrow");
    var sk = state.lang === "zh" ? d.subkind_zh || d.subkind : d.subkind;
    add(kicker, L("kind", d.kind) + (sk ? " · " + sk : ""));
    var h = el("h2", null, title(d)); h.id = "dash-d-title";
    var roles = (STR[state.lang].roles[d.kind]) || ["From", "To"];
    function party(role, id2) {
      var p = el("div", "party"), n = el("a", "n", name(id2));
      n.href = mapHref("n", id2); n.title = T("d_party", { c: name(id2) });
      return add(p, el("span", "r", role), n);
    }
    var pt = el("div", "parties");
    add(pt, party(roles[0], d.from), el("span", "ar", "→"), party(roles[1], d.to));
    add(dr, x, kicker, h, pt);
    var amt = dealAmount(d);
    add(dr, el("div", "kpi__label", T("d_amount")), el("div", "d-amt", d.kind === "guarantee" ? (isNum(amt) ? usd(amt) : T("undisclosed")) : isNum(d.counted_usd) && d.counted_usd ? usd(d.counted_usd) : (isNum(d.amount_usd) ? usd(d.amount_usd) : T("undisclosed"))));
    if (d.kind === "guarantee") add(dr, el("p", "d-note", T("d_cont", { v: usdOr(amt) })));
    if (isNum(d.headline_usd)) add(dr, el("p", "d-note", T("d_headline", { v: usd(d.headline_usd) })));
    if (d.amount_text) { var at = el("div", "d-text"); add(at, el("span", "small", T("d_stated")), el("span", null, d.amount_text)); at.lang = "en"; add(dr, at); }
    var sum = state.lang === "zh" ? d.summary_zh || d.summary_en : d.summary_en || d.summary_zh;
    if (sum) add(dr, el("p", "d-sum", sum));
    var dl = el("dl", "dl");
    function row(k, v) { add(dl, el("dt", null, k)); var dd = el("dd"); add(dd, v); add(dl, dd); }
    row(T("d_status"), el("span", "pill" + (BINDING[d.status] ? " bind" : ""), L("status", d.status)));
    row(T("d_conf"), el("span", "badge badge--" + (d.confidence === "confirmed" ? "confirmed" : "reported"), (d.confidence === "confirmed" ? "✓ " : "") + L("conf", d.confidence)));
    row(T("d_ann"), fmtDate(d.announced));
    if (d.added) row(T("d_added"), fmtDate(d.added));
    var s = d.source;
    if (s && typeof s === "object") {
      var u = safeUrl(s.url), lbl = (s.publisher || "—") + (s.date ? " · " + fmtDate(s.date) : "");
      if (u) { var a = el("a", null, lbl + " ↗"); a.href = u; a.target = "_blank"; a.rel = "noopener noreferrer"; row(T("d_src"), a); }
      else row(T("d_src"), lbl);
    }
    row(T("d_id"), el("span", "cite", d.id));
    add(dr, dl);
    var tags = arr(d.tags);
    if (tags.length) {
      var tg = el("div", "tags");
      tags.forEach(function (t) { add(tg, el("span", "dtag" + (t === "new" ? " dtag--new" : ""), (STR[state.lang].tags[t]) || t)); });
      add(dr, tg);
    }
    var lm = el("a", null, T("d_map")); lm.href = mapHref("e", d.id); lm.id = "dash-d-map";
    var lp = el("p"); lp.style.marginTop = "18px"; add(lp, lm); add(dr, lp);
    dr.hidden = false; $("scrim").hidden = false;
    Array.prototype.forEach.call(ROOT.querySelectorAll("#dash-deal-table tbody tr"), function (r) { r.className = r.dataset.id === id ? "sel" : ""; });
    x.focus();
  }
  function closeDrawer() {
    state.drawer = null;
    var dr = $("drawer"); if (!dr) return;
    dr.hidden = true; $("scrim").hidden = true;
    Array.prototype.forEach.call(ROOT.querySelectorAll("#dash-deal-table tbody tr.sel"), function (r) { r.className = ""; });
    var f = state.lastFocus; state.lastFocus = null;
    if (f && document.body.contains(f)) f.focus();
  }

  /* ---------------------------------------------------------------- page */
  function renderNoData(main) {
    var c = el("section", "card nodata");
    if (state.status === "loading") { add(c, el("p", null, T("loading"))); return add(main, c); }
    add(c, el("h2", null, T("nodata_h")), el("p", null, T("nodata_p")));
    if (/\/site\/(dashboard\.html)?$/.test(location.pathname)) add(c, el("p", "small", T("nodata_local")));
    var acts = el("div", "nodata__acts");
    var rb = el("button", "dbtn", T("retry")); rb.type = "button"; rb.addEventListener("click", function () { if (OPTS.reload) OPTS.reload(); });
    var a = el("a", "btn-link", T("live")); a.href = MAP_URL;
    add(acts, OPTS.reload ? rb : null, isMap() ? null : a);
    add(main, add(c, acts));
  }
  function render() {
    if (!ROOT) return;
    if (isMap()) renderIntro(); else renderHeader();
    var main = clear($("main"));
    try {
      if (!valid(D)) renderNoData(main);
      else {
        renderKpis(main);
        var g = el("div", "grid2"); renderNew(g); renderChanges(g); add(main, g);
        renderDeals(main);
        if (!isMap()) renderTimeline(main);
        var g2 = el("div", "grid75"); renderCompanies(g2); renderDebt(g2); add(main, g2);
        renderLoops(main);
      }
    } catch (err) {
      if (window.console) console.error(err);
      clear(main); renderNoData(main);
    }
    renderFoot();
    if (!isMap()) { if (state.drawer && BYID[state.drawer]) openDrawer(state.drawer); else if (state.drawer) closeDrawer(); }
  }
  function setLangFromPage(l) { if (l === state.lang) return; state.lang = l; store.set(LS_LANG, l); render(); focusEl($("lang-" + l)); }

  /* ---------------------------------------------------------------- public */
  /* mount(root, {host: "page"|"map", lang, data, onDeal(id, kbd), onCompany(id, kbd), onLoop(key, kbd), reload()}) */
  function mount(root, opts) {
    ROOT = root; OPTS = opts || {}; HOST = OPTS.host === "map" ? "map" : "page";
    state.lang = OPTS.lang === "zh" || OPTS.lang === "en" ? OPTS.lang : initialLang();
    ROOT.classList.add("dash", isMap() ? "dash--embed" : "dash--page");
    clear(ROOT);
    if (isMap()) buildEmbed(); else buildPage();
    if (OPTS.data) setData(OPTS.data); else render();
  }
  function setData(d) {
    if (!valid(d)) { state.status = "failed"; if (!valid(D)) render(); return; }
    D = d; state.status = "ok";
    prep();
    if (state.company && !arr(D.companies).some(function (c) { return c.id === state.company; }) && !DEALS.some(function (x) { return x.from === state.company || x.to === state.company; })) state.company = null;
    if (state.drawer && !BYID[state.drawer]) state.drawer = null;
    render();
  }
  function setFailed() { state.status = "failed"; if (!valid(D)) render(); }
  function setLang(l) { if ((l === "en" || l === "zh") && l !== state.lang) { state.lang = l; render(); } }

  window.AODDash = { mount: mount, setData: setData, setFailed: setFailed, setLang: setLang, fetchData: fetchData, paths: DATA_PATHS.slice() };

  /* dashboard.html: <body class="dash dash--page"> */
  function bootPage() {
    var busy = false;
    function pull() {
      if (busy) return;
      busy = true;
      fetchData().then(function (d) {
        if (!D || d.generated_at !== D.generated_at || d.built_at !== D.built_at) setData(d);
        else renderHeader();   /* same data: only the "… ago" line moves (a full render would steal focus) */
      }, function () { setFailed(); }).then(function () { busy = false; });
    }
    mount(document.body, { host: "page", reload: pull });
    pull();
    setInterval(function () { if (!document.hidden) pull(); }, REFRESH_MS);
    document.addEventListener("visibilitychange", function () { if (!document.hidden && D) pull(); });
  }
  if (document.body && document.body.classList.contains("dash--page")) bootPage();
})();
