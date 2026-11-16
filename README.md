# AI Orders & Debt Map · AI 巨头订单与债务关系图

Live, bilingual relationship graph of orders, investments and debt among the AI giants: who buys compute and chips
from whom, who holds whose equity, who lends to whom. It is rebuilt by the monitor in the private repository
`heyneww/GL-AI-orders-debt` about every 3 hours (SEC EDGAR filings and news, rule-based), curated once a day by
Claude Code (every deal verified against its sources, in English and 中文), with new deals approved by the
maintainer, and published here on GitHub Pages. This repository holds rendered files only; every push comes from
the private repository's workflows (monitor, daily curation, approvals, manual publish).

- **Live map / 实时关系图:** https://heyneww.github.io/GL-AI-live/ (also `latest.html`). The map is the
  graph; the **table view** lists every deal with its sources and **downloads as CSV**.
- **Data / 数据:** `data/graph.json` (current: entities, edges, totals, the latest filings and headlines, and
  `generated_at`), `data/archive/YYYY-MM-DD.json` (the last graph built each UTC day: entities, edges and stats;
  daily files for the last 90 days, then one per month).
- **API / 接口:** `data/v1/` is the stable, versioned contract for programs: `entities.json`, `edges.json`
  (every curated deal with `counted_usd` / `contingent_usd`), `stats.json`, `edges.csv` and one CSV per kind,
  `changes.json` (the per-deal change log from git history), `feed.xml` (Atom feed of changes), `schema.json`
  (JSON Schema) and `README.md` (field reference, in both languages). `data/changes.json` and `data/feed.xml`
  are the same change log and feed.
- **Excel / 表格:** `data/v1/deals.xlsx`: every deal in a bilingual workbook (summary, all deals, one sheet per
  type, companies), rebuilt at each publish. 全部交易的 Excel 数据表（摘要、全部交易、按类型分表、公司），每次发布时重建。
- **Weekly summary / 每周摘要:** `weekly.html`: deals added and changed in the last 7 days, in both languages.
- **Dashboard / 看板:** `dashboard.html`, and the **Dashboard** tab of the map: the important items in one view
  (totals, deals new to the map, material changes, the largest deals and companies, debt, CDS, circular deals).
  Both read `data/v1/dashboard.json`, rebuilt with the map at each publish, and follow the map without a reload.
  重点内容的交互看板（合计、新增交易、重要变化、最大交易与公司、债务、信用违约互换、循环交易），既是单独页面
  `dashboard.html`，也是关系图的“看板”标签页；两者都读取每次发布时与关系图一同重建的 `data/v1/dashboard.json`。
- **A past day / 查看历史某日:** `https://heyneww.github.io/GL-AI-live/?snapshot=YYYY-MM-DD`
- **Freshness / 时效:** the page re-reads `data/graph.json` every 5 minutes and shows **Live** while the graph is
  less than 8 hours old, **Stale** (数据较旧) after that. GitHub Pages' CDN caches `data/graph.json` for up to
  10 minutes, so the page can lag the newest publish here by that much. Scheduled runs on GitHub can start late
  or be skipped; "about every 3 hours" is the aim, not a guarantee. A publish that would change only timestamps
  is skipped, so the newest commit here is the last time the data or the page changed.
- **Corrections / 更正:** a wrong figure or a missing deal → an issue labelled `correction` on
  `heyneww/GL-AI-orders-debt`, with a source that states the right value.

实时、双语的 AI 巨头订单、投资与债务关系图：谁向谁采购算力和芯片，谁持有谁的股权，谁借钱给谁。由私有仓库
`heyneww/GL-AI-orders-debt` 的监控程序约每 3 小时重建一次（SEC EDGAR 公告和新闻，按规则处理），每天由 Claude Code 整理
一次（每笔交易对照来源核实，中英双语），新交易由维护者批准，然后通过 GitHub Pages 在此发布。本仓库只存放生成后的
文件；所有推送都来自私有仓库的工作流。页面每 5 分钟重新读取数据，数据不足 8 小时显示"实时"，否则显示"数据较旧"；
Pages 的 CDN 最多缓存 10 分钟，页面可能比最新发布晚这么久。表格视图列出全部交易并可下载 CSV。
程序接口见 `data/v1/`（JSON、CSV、JSON Schema、更新记录 `changes.json` 和 Atom 订阅 `feed.xml`，说明见
`data/v1/README.md`）。

## Licence and citation · 许可与引用

- Code (the page, `app.js`, `i18n.js`, `style.css`, `vendor/`): MIT, see `LICENSE` (bundled libraries keep
  their own licences, noted in `vendor/`).
- Data (`data/graph.json`, `data/archive/*.json`, `data/v1/*`, `data/changes.json`, `data/feed.xml`, the CSV
  download): Creative Commons Attribution 4.0 (CC BY 4.0), see `LICENSE-DATA`. Figures are as reported by the
  companies and outlets each deal cites; the filings and articles themselves belong to their publishers.
- Please cite: **AI Orders & Debt Map, heyneww, <date>, https://heyneww.github.io/GL-AI-live/**
  (the date is `generated_at` in `data/graph.json` or the archive file's name).

代码按 MIT 许可（`LICENSE`），数据按 CC BY 4.0 许可（`LICENSE-DATA`）。引用格式：
AI Orders & Debt Map, heyneww, <日期>, https://heyneww.github.io/GL-AI-live/

Descriptive only, not investment advice. 仅作描述，不构成投资建议。
