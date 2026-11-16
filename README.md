# TaxoMetaGraph — Taxa–metabolite knowledge graph explorer

**Public knowledge graph**, associating taxa listed in the **PubChem** and
**LOTUS** databases with metabolites linked to samples analysed within research
projects.

A command‑line tool that reads a TSV of taxon ↔ chemical‑molecule relations and
generates a **self‑contained static website** that displays them as an
interactive graph with [Cytoscape.js](https://js.cytoscape.org).

The site works with **no backend** and **no CDN** at runtime: open
`dist/index.html` by double‑click (protocol `file://`) or serve the folder from
any static file server (GitHub Pages, GitLab Pages, …). Generated from
[`SPECIFICATIONS.md`](SPECIFICATIONS.md).

## Project context

Part of the project **« Next level of reproducible, comparable and integrable
Metabolomics »**, **work package WP 3 — Species‑specific resources**. The
objective of WP 3 is to lay the foundations of **species‑specific resources**,
to help interpret metabolomics results.

## Requirements

- Python 3.10+ (standard library only — no dependencies to install).
- The JSON configuration file is optional (see below).

## Install

Clone / copy this repository. No `pip install` needed.

## Build the site

```bash
python3 build_site.py --input relations.tsv --output dist/ \
    [--title "TaxoMetaGraph"] \
    [--single-file] \
    [--max-initial-nodes 500] \
    [--default-layout fcose] \
    [--strict] \
    [--config config.json] \
    [--quiet]
```

Options:

| Option | Default | Meaning |
|---|---|---|
| `--input` | — | Path to the TSV (required). |
| `--output` | `dist` | Destination folder (created / emptied safely). |
| `--title` | `TaxoMetaGraph` | Site / app title. |
| `--single-file` | off | Inline all scripts/data/CSS into one `index.html`. |
| `--max-initial-nodes` | `500` | Above this node count the site starts in exploration mode. |
| `--default-layout` | `fcose` | `fcose`, `cose`, `concentric`, `circle`, `grid`, `bipartite`. |
| `--strict` | off | Abort on the first invalid line (else it is skipped with a warning). |
| `--config` | — | Optional JSON configuration (URL templates, node size, relations…). |
| `--quiet` | off | Suppress the summary. |

Example:

```bash
python3 build_site.py --input example.tsv --output dist/ --config config.example.json
```

The generator is **idempotent and deterministic**: the same input produces a
byte‑identical output tree.

## Input TSV format

Tab‑separated, UTF‑8 (BOM tolerated), LF or CRLF, first line is the header.
One line = one edge. Required columns: `taxon_id`, `taxon_name`, `relation`,
`chebi_id`, `chebi_name`. Optional columns are documented in
`SPECIFICATIONS.md`. Missing optional values are computed automatically
(default NCBITaxon_/CHEBI_ OBO URIs).

Rows are de‑duplicated (nodes keyed by `taxon_id` / `chebi_id`, edges by
taxon+relation+molecule). Empty, `NA`, `null` values are treated as absent.
Non‑`http(s)` URIs are rejected (never rendered as links). Invalid lines are
skipped with a warning (or abort with `--strict`). See `example.tsv` for a
demonstration including edge cases.

## Configuration file

`config.example.json` shows the full schema, all optional:

- `app` — application identity (name, baseline, full title, GitHub repo, project context shown in the “About” dialog);
- `urlTemplates` — external link templates for NCBI and ChEBI (`{id}` placeholder);
- `nodeSize` — min/max node diameter (px);
- `focusGap` — minimum center‑to‑center distance between nodes in focus mode, as a multiple of the max node diameter (default `3`, range ~2–5);
- `directedRelations` — list of relation types shown with an arrow (others, e.g. `skos:related`, are symmetric);
- `layout` — `nodeRepulsion` / `idealEdgeLength` for `fcose`;
- `thresholds` — performance and UX thresholds;
- `dependencies` — names/versions/licences shown in the “About / Dependencies” dialog (keep in sync with `VENDOR.md`);
- `generation` — AI‑generation traceability (assistant, model, date, version) shown in the site footer and dialog.

## Generated output

```
dist/
├── index.html
├── assets/
│   ├── css/style.css
│   ├── js/app.js, i18n.js, graph-data.js, config.js
│   └── vendor/                 (Cytoscape.js + fcose, embedded)
└── data/graph.json             (same data, for external reuse)
```

With `--single-file`, everything is inlined into `dist/index.html` (plus
`data/graph.json`).

## Deployment (GitHub Pages)

Push the `dist/` folder (or serve it) to a static location. All paths are
relative, so it works in a repository sub‑path.

The live demo is available at https://emetabohub.github.io/Taxa-metabolite-knowledge-graph-explorer/

## Security

- The Content‑Security‑Policy restricts sources (`default-src 'self'`) and forbids
  outgoing connections (`connect-src 'none'`). Because Cytoscape.js styles its
  canvas with inline styles, `style-src` must allow `'unsafe-inline'`; the critical
  `script-src` directive stays strict (`'self'`) in normal mode — `'unsafe-inline'`
  is used only in `--single-file` mode, where everything is inlined. (See
  SPECIFICATIONS.md §3.1.)
- Everything imported from the TSV is inserted with `textContent` / `append`
  (never `innerHTML`), so descriptions such as `<script>alert(1)</script>` are
  displayed as plain text. Only `http(s)` URIs become links.

## Tests

```bash
python3 -m unittest discover -s tests -v
# or
python3 -m pytest tests
```

## Licences

- Code of this generator/site: MIT (see LICENSE).
- Data licences (mention this when distributing data): **ChEBI** is released
  under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) ; **NCBI
  Taxonomy** data is, according to NCBI conditions, in the public domain.

## AI‑generation traceability

This website generator was produced with the help of an AI assistant from
[`SPECIFICATIONS.md`](SPECIFICATIONS.md) (Section 7 of the spec). The
assistant, model, date and project version are centralised in the `generation`
field of the configuration file and displayed in the “About / Dependencies”
dialog and in the site footer.

## Known limits

- The **SVG export** uses the optional `cytoscape-svg` extension, which is not
  bundled here; the button degrades gracefully with a message when it is absent.
- Node shapes/colors distinguish taxa vs molecules (not color alone).
- Very large graphs (> ~100k edges) are generated without error, but rendering
  performance depends on the browser; exploration mode is enabled above
  `--max-initial-nodes`.
