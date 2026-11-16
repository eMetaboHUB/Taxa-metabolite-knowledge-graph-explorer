# Specifications: Cytoscape.js static site generator (taxa ↔ ChEBI molecules)

> Versions: v2 corrected and completed; major additions/modifications since v1 are marked **[V2]**, then **[V3]**, **[V4]** and **[V5]** (latest modification).

## 1. Objective

Produce a **generator** (command‑line script) that reads a TSV file of taxon ↔ chemical‑molecule relations and generates a **stand‑alone static website** that displays these relations as an interactive graph using Cytoscape.js. The site must be deployable as‑is on GitHub Pages, GitLab Pages or any static file server, and it should be openable by double‑clicking `index.html` (protocol `file://`).

### 1.1 Application identity

**[V5]** The application is named **TaxoMetaGraph** (baseline: *Taxa–metabolite knowledge graph explorer*). Full title: *Public knowledge graph, associating taxa listed in the PubChem and LOTUS databases with metabolites linked to samples analysed within research projects*. GitHub project: `Taxa-metabolite-knowledge-graph-explorer`.

Project context:
- Project: *Next level of reproducible, comparable and integrable Metabolomics*.
- Work package: **WP 3, Species‑specific resources**.
- WP objective: lay the foundations of species‑specific resources to help interpret metabolomics results.

The identity (name, baseline, full title, GitHub repository, context) is **centralised** in the `app` block of the configuration file (`config.example.json`), automatically reflected in `window.APP_CONFIG` (the “About” modal) and documented in the `README.md`. The page title (`<title>` and `<h1>`) displays the application name followed by its baseline.

## 2. Input: TSV file

### 2.1 Format

Tab‑separated, UTF‑8 encoding (BOM tolerated), line endings LF or CRLF, first line = header.

| Column | Type | Required | Description |
|---|---|---|---|
| `taxon_id` | integer > 0 | yes | NCBI Taxonomy identifier |
| `taxon_name` | text | yes | Taxon name |
| `taxon_description` | text | no | Taxon description |
| `relation` | text | yes | Relation type (e.g. `skos:related`) |
| `chebi_id` | integer > 0 | yes | ChEBI identifier (without prefix) |
| `chebi_name` | text | yes | Molecule name |
| `chebi_description` | text | no | Molecule description |
| `taxon_uri` | http(s) URI | no | Taxon URI (NCBITaxon OBO); if missing, computed as `http://purl.obolibrary.org/obo/NCBITaxon_<id>` |
| `chebi_uri` | http(s) URI | no | Molecule URI (CHEBI OBO); if missing, computed as `http://purl.obolibrary.org/obo/CHEBI_<id>` |
| `taxon_description_source` | text | no | Source of the taxon description |
| `chebi_description_source` | text | no | Source of the molecule description |

Example (two data lines, header included):

```tsv
 taxon_id	taxon_name	taxon_description	relation	chebi_id	chebi_name	chebi_description	taxon_uri	chebi_uri	taxon_description_source	chebi_description_source
2	Bacteria	Bacteria is a domain taxon.	skos:related	15841	polypeptide	A peptide containing ten or more amino acid residues.	http://purl.obolibrary.org/obo/NCBITaxon_2	http://purl.obolibrary.org/obo/CHEBI_15841	generated_from_NCBI_lineage	ChEBI_OBO_file
2	Bacteria	Bacteria is a domain taxon.	skos:related	18085	glycosaminoglycan	Any polysaccharide containing a substantial proportion of aminomonosaccharide residues.	http://purl.obolibrary.org/obo/NCBITaxon_2	http://purl.obolibrary.org/obo/CHEBI_18085	generated_from_NCBI_lineage	ChEBI_OBO_file
```

### 2.2 Reading rules

- One line = one edge (taxon, relation, molecule).
- Information for the same taxon or same molecule may be **repeated** across multiple lines: the generator **must deduplicate** the nodes (key: `taxon_id` for taxa, `chebi_id` for molecules).
- If a node has inconsistent values across lines (name, description, URI), keep the first occurrence and emit a warning (once per node and per field).
- Invalid lines are ignored with a warning (line number), without stopping generation. A line is invalid if a required field is empty, an identifier is not a strictly positive integer, or the number of columns does not match the header. A summary report is displayed at the end.
- **[V2]** `--strict` option: any invalid line causes the process to exit with a non‑zero status code. Without this option, the exit code is 0 if at least one valid edge was produced.
- **[V2]** A URI that does not use the `http` or `https` scheme is rejected (field emptied, warning): it will never be rendered as a link.
- **[V2]** Reading with the `csv` module in **`quoting=csv.QUOTE_NONE`** mode: quotes present in descriptions must not be interpreted as delimiters. Leading/trailing spaces are stripped; empty values and `NA`/`null` are treated as absent.
- Exact duplicate edges (same taxon, same relation, same molecule) are merged. **[V2]** Different relations between the same nodes remain as separate edges (displayed as parallel curves).
- The file can be large (up to several hundred thousand lines): streaming reading.

## 3. Output: static site

### 3.1 Directory layout

```
 dist/
 ├── index.html
 ├── assets/
 │   ├── css/style.css
 │   ├── js/app.js
 │   ├── js/config.js            (parameters: configuration injected by the generator)
 │   ├── js/i18n.js              (UI strings)
 │   ├── js/graph-data.js        (data: window.GRAPH_DATA = {...})
 │   └── vendor/                 (Cytoscape.js and extensions, copied locally)
 └── data/
     └── graph.json              (same data, for external reuse)
```

Constraints:

- **No CDN dependencies at runtime**: all JS libraries are bundled in `assets/vendor/` (site works offline). System fonts are used.
- No build framework on the site (plain ES6+ JavaScript) to keep the site readable and maintainable.
- Download the necessary dependencies (cytoscape, etc.).
- Paths are **relative** to allow deployment in a sub‑directory.
- **[V2]** Data is loaded via `<script src="assets/js/graph-data.js">` and not via `fetch()`: `fetch` on `file://` is blocked by browsers, which would make double‑click opening of `index.html` impossible. `data/graph.json` is provided as an auxiliary file for external use.
- **[V2]** No ES modules (`type="module"`): also blocked on `file://` in some browsers; use classic scripts.
- Option to generate a **single‑file self‑contained HTML** (data and scripts inlined) for small datasets. **[V2]** When inlining, escape `</script>` and `<!--` in the JSON.
- **[V2]** Strict Content‑Security‑Policy (`<meta http-equiv="Content-Security-Policy">`): `default-src 'self'`, no outgoing connections (`connect-src 'none'`).
  - **[V3 – implementation note]** Cytoscape.js positions and styles graph elements via **inline styles** (style attributes and `<style>` elements). In multi‑file mode, the `style-src` directive must therefore include `'unsafe-inline'` for the graph to display. The critical `script-src` directive remains strict (`'self'`) in multi‑file mode – this is the main defence against XSS. In single‑file mode, `'unsafe-inline'` applies to both script and style (everything being inlined in the page).

### 3.2 Cytoscape data model

**Taxon node**:

```json
{ "data": {
    "id": "taxon:2", "type": "taxon", "label": "Bacteria",
    "ncbi_id": 2, "description": "...", "uri": "http://purl.obolibrary.org/obo/NCBITaxon_2",
    "description_source": "generated_from_NCBI_lineage", "degree": 2 } }
```

**Molecule node**:

```json
{ "data": {
    "id": "chebi:15841", "type": "molecule", "label": "polypeptide",
    "chebi_id": 15841, "description": "...", "uri": "http://purl.obolibrary.org/obo/CHEBI_15841",
    "description_source": "ChEBI_OBO_file", "degree": 1 } }
```

**Edge**:

```json
{ "data": {
    "id": "e:2-15841-skos:related", "source": "taxon:2", "target": "chebi:15841",
    "relation": "skos:related" } }
```

- The generator computes a `degree` attribute for each node (number of distinct edges). **[V2]** The site recomputes a dynamic `visibleDegree` when filters are active; the “minimum degree” filter applies to the **global** degree (shown in the UI).
- **[V2]** Relations of type `skos:related` are symmetric: edges are displayed **without arrowheads** by default. A `directed` flag per relation (configurable) allows arrows for other relations.
- **[V2]** Compact format possible for large datasets: separate node and edge arrays, converted to Cytoscape elements on load (reduces file size and parsing time).

## 4. Site features

### 4.1 Graph (Cytoscape.js)

- **Bipartite graph**: two node types visually distinct, **by shape and colour** (not only colour, to aid colour‑blind users).
  - Taxa: round shape, colour A (e.g. green).
  - Molecules: rounded square, colour B (e.g. orange).
- **[V2]** Node size proportional to `sqrt(degree)` between a configurable minimum and maximum (default 10 px – 26 px; **[V3]** reduced bounds for highly heterogeneous real‑world graphs). See also the acceptance criterion on overlapping.
- Labels are displayed beneath nodes; automatic label hiding below a certain zoom level for readability. **[V2]** Labels of hovered or selected nodes are always shown.
- Edge colour or style varies by `relation` type (legend generated dynamically from the relations present in the TSV).
- Zoom, pan, node drag‑and‑drop, multiple selection.
  - **[V5 – new feature]** **Accelerated zoom with Ctrl/Cmd**: holding **Ctrl** (or **Cmd ⌘** on macOS) while scrolling the mouse wheel multiplies zoom sensitivity (~2× by default, configurable) to quickly navigate zoom levels. Implemented by updating `wheelSensitivity` **in capture phase on `document`** (before Cytoscape’s native handler, which rereads sensitivity each event); sensitivity returns to normal when Ctrl/Cmd is released.
  - **[V3 – new feature]** **Dynamic grab**: while dragging a node, its **direct neighbours** follow the movement at 80 % and 2‑hop neighbours at 40 % (spring‑like effect). This allows extracting a node and its context from a dense cluster for inspection. **[V3 note]** Implemented via a `requestAnimationFrame` loop started on `grab` and stopped on `free`/`dragfree` (independent of the `drag` event). Only already‑displayed neighbours are pulled; **no new nodes are created** by this interaction.
- Hover on a node highlights the node and its immediate neighbourhood, dimming the rest. **[V3 – precision]** The dimming (reduced opacity) also applies to **edges** outside the neighbourhood, not just nodes (the `.faded`/`.greyout` class selectors are applied after edge styles to take precedence).
- **[V2]** Node selection: “Hide non‑selected nodes” option in the control panel, with two modes: *invisible* (**default**) or *grayed*. Nodes kept visible are the selected node **and its direct neighbours** (and their edges); everything else is hidden or dimmed. The behaviour is cancelled by clicking the background or “Reset”.

### 4.2 Layouts

The site uses only the **fcose** layout, applied automatically on load, on focus actions and on expansion. The `fcose` parameters (`nodeDimensionsIncludeLabels`, `packComponents`, `nodeRepulsion`, `idealEdgeLength`, `quality`) are set to avoid node overlap.

The “Relayout” button (fcose) and the “Fit to view” button remain available.

### 4.3 Details panel

On node click, a side panel shows:

- name, type, identifier;
- description and its **source**;
- clickable URI (opens in a new tab, `rel="noopener noreferrer"`);
- list of neighbour nodes (clickable to recenter and select; **[V2]** paginated or limited to 100 with “Show more” for high‑degree nodes);
- external links calculated (**[V2]** configurable URL templates in the configuration file, as external URLs evolve):
  - NCBI Taxonomy: `https://www.ncbi.nlm.nih.gov/Taxonomy/Browser/wwwtax.cgi?id=<id>`;
  - ChEBI: `https://www.ebi.ac.uk/chebi/searchId.do?chebiId=CHEBI:<id>` (**to verify** before release: ChEBI has revamped its site; the current address may be `https://www.ebi.ac.uk/chebi/CHEBI:<id>`).

On edge click, source, target and relation are displayed.

### 4.4 Search and filters

- **Text search** (autocomplete) on name and identifier, centering and selecting the found node. **[V2]** The search covers **the whole dataset** (in‑memory index), including nodes not currently displayed in exploration mode; finding a hidden node adds it to the graph. Case‑insensitive and accent‑insensitive search, with debounce (~200 ms) and a maximum of 20 suggestions.
- **Filters**:
  - show/hide taxa, molecules;
  - filter by minimum degree.
- “Expand neighbourhood” action (button): progressive exploration mode starting from a chosen node and displaying its neighbours one or two hops away. Useful for large graphs. **[V2]** If the expansion would exceed a ceiling (e.g. 500 added nodes), ask for confirmation or keep only the highest‑degree neighbours.
- **[V3 – new feature]** **Double‑click on a node = focused sub‑graph (focus mode)**: double‑click replaces the view with a **new graph** consisting of the node and its neighbourhood (depth 1 or 2 according to the “Neighborhood” selector). A “✕” button in the toolbar allows **returning to the previous graph** (a stack manages nested levels; the original graph positions are restored). **[V4]** The sub‑graph is laid out with the **layout selected in the toolbar** (fcose by default), just like any other graph: the layout selector therefore also applies in focus mode. *(Earlier version used a deterministic radial layout `focusLayout` based on `focusGap`, now removed.)*
- “Show all” / “Reset” buttons.
- **[V2]** “Remove from graph” button to hide a node or selection. **[V4]** Undo/redo buttons have been removed (the undo functionality is gone).

### 4.5 Exports

- **[V5]** A single **Export** button in the toolbar opens a **format‑choice modal**; the user selects one of four options:
  - **PNG** (via `cy.png()`, white background, scale option `scale` — here ×2);
  - **SVG** (via `cytoscape-svg` extension; graceful degradation with an informational message if absent);
  - **JSON** of the visible sub‑graph (nodes and edges not hidden);
  - **TSV** of the visible sub‑graph (same format as input, re‑importable).
- The modal reuses the common dialog box (dynamic title, close button “✕”, click outside or `Esc` to close). Options are keyboard‑navigable buttons. **PNG** and **JSON** remain the two guaranteed formats (acceptance criterion #8).

### 4.6 Performance and visual feedback

- Small graph (< 2 000 nodes): full display on load.
- Larger graph: start in **exploration mode** (e.g. only highest‑degree nodes or a chosen node), with an informational message and a configurable threshold (`--max-initial-nodes`).
  - **[V3 – implementation note]** Default threshold is **150** nodes (originally 2000). **[V4]** The default threshold is now **500** nodes and the exploration display ceiling is aligned (the top 500 nodes by degree). Beyond that, the app starts in exploration mode and shows only the highest‑degree nodes (up to the threshold), making opening and the `fcose` layout responsive for large datasets. The threshold remains adjustable; the “Show all” button can display the whole graph (with confirmation). **[V3]** The informational message is shown in a **dismissible banner** (× button); it can be hidden by the user.
- Canvas rendering with Cytoscape, performance options (`textureOnViewport`, `hideEdgesOnViewport`, `hideLabelsOnViewport`) enabled beyond a threshold.
- **[V2]** **Waiting indicator** (spinner) displayed during long operations (layout, search, expansion). The indicator appears **before** the operation (allowing the browser to paint via `requestAnimationFrame` then `setTimeout`) and hides after the layout (`layoutstop`). Cursor changes to `wait` during the operation.
- **[V2]** Performance budget: initial load < 5 s for 100 000 edges (index and data), fluid interaction (> 30 fps pan/zoom) with 5 000 elements displayed.

### 4.7 Interface

- Layout: toolbar at top, full‑screen graph, retractable side panel, legend.
- Responsive (usable on tablets, **[V2]** touch gestures: pinch to zoom, long‑press to expand).
- Basic accessibility: sufficient contrast (WCAG AA), labeled form elements, keyboard navigation for search and buttons, visible focus outline. **[V2]** Textual alternative to the graph: list of search results and neighbourhood accessible via keyboard and screen reader.
- Interface language: English.
- Light theme only.
- **[V2]** Visible error handling: data load failure, empty graph, no search results.
- **[V2]** Supported browsers: latest versions of Firefox, Chrome, Edge, Safari.

## 5. Generator

### 5.1 Technology

Choice of AI generator is up to you, but must be justified. Recommended: **Python 3.10+** using **only the standard library** (`csv`, `json`, `argparse`, `pathlib`, `shutil`, `string.Template`) to avoid any external dependencies. **[V2]** (Jinja2 is excluded in the recommended version to stay consistent; if used, it must be listed in `requirements.txt`). Acceptable alternative: Node.js.

### 5.2 Command‑line interface

```bash
python build_site.py --input forumLotusWInferrence.enriched.tsv --output dist/ \
    [--title "Taxons and molecules"] \
    [--single-file] \
    [--max-initial-nodes 500] \
    [--default-layout fcose] \
    [--strict] \
    [--config config.json] \
    [--quiet]
```

### 5.3 Behaviour

1. Validate the TSV header (required columns present, order irrelevant, unknown columns ignored with a warning).
2. Build deduplicated nodes and edges; compute degrees.
3. Produce `graph.json` and `graph-data.js`.
4. Copy static assets and vendored libraries (offline: **the libraries are provided in the generator repository**, the script does not download anything).
5. Generate `index.html` with parameters (title, default layout, thresholds).
6. Display a summary: number of taxa, molecules, edges, distinct relations, ignored lines, warnings.

The script must be **idempotent** and **deterministic** (same input → identical byte‑for‑byte output: stable sorting, no timestamps in generated files, JSON serialized with sorted keys). The output directory is safely emptied or overwritten without touching files outside `dist/`.

### 5.4 Bundled JS libraries (fixed versions)

- `cytoscape` (recent stable version)
- `cytoscape-fcose` (and its dependencies `layout-base`, `cose-base`)
- **[V5]** **SVG export** via `cytoscape-svg`: **optional and not bundled by default** — the app detects its absence (`window.cytoscapeSvg`) and shows an informational message instead of exporting. If required, add it to `assets/vendor/` and list it as a dependency. `cytoscape-popper` (tooltips): optional, not bundled.

Exact versions and licenses are listed in `VENDOR.md` with SHA‑256 checksums.

## 6. Quality and deliverables

- Well‑commented and structured code (separate data, logic, presentation).
- `README.md`: installation, usage, TSV format, deployment (GitHub Pages), known limits.
- Example dataset (`example.tsv`, ~20 lines including the two lines shown above) for demonstration. **[V2]** It deliberately includes edge cases: duplicate edge, inconsistent description, invalid line, accented characters, quotes and HTML tags in a description.
- Minimal generator tests (`pytest` or `unittest`): TSV reading, deduplication, handling of invalid lines, output JSON structure, determinism (two identical runs produce identical output).
- No network requests at site runtime; no data sent outside.
- Security: escape all TSV‑derived content before inserting into the DOM (prevent XSS in descriptions and names); **[V2]** use `textContent` rather than `innerHTML`, generate links only for `http(s)` URIs.
- **[V2]** Project license and data‑license notices (ChEBI: CC BY 4.0; NCBI Taxonomy: public domain under NCBI conditions) in the README and site footer.

## 7. Dependency and generation information

- **[V2]** The site must provide an **information modal** (dialog, expandable panel, or accessible box) showing the **versions of bundled dependencies**, notably Cytoscape.js and its extensions. This modal must be reachable from the UI, e.g. via an “About” or “Dependencies” link.
- **[V2]** The modal must list, for each dependency: name, exact version, license and, if relevant, a link to its repository or documentation.
- **[V2]** The displayed information must match the actual bundled versions in `assets/vendor/` and be consistent with `VENDOR.md`.
- **[V2]** The site generator was produced with the help of an AI from these specifications, which are downloadable and provided with the project.
- **[V2]** This notice must appear in the `README.md`, in the “Dependencies / About” modal and, if appropriate, in the site footer.
- **[V3]** **AI generation traceability**: the generated site must explicitly mention that it was developed with the help of an AI. The notice should include, when available:
  - the name of the AI or assistant used (e.g. OpenAI ChatGPT);
  - the exact model name and version (e.g. GPT‑6);
  - the generation or last‑update date;
  - optionally, a version number or generation identifier for the project.
- **[V3]** These details should be grouped under an “About / AI Generation” section accessible from the UI and also appear in the `README.md`. A short footer note, e.g. “Site developed with the help of [AI name], model [model], on [date]”, is required.
- **[V3]** Generation metadata must be centralised in a configuration or metadata file to avoid inconsistencies. Information that is not available must not be invented.

## 8. Acceptance criteria

1. From a valid TSV, the command produces a `dist/` folder that can be opened directly (double‑click `index.html` or via a static server).
2. The graph displays taxa and molecules with distinct styles and relations as edges.
3. **[V2]** Node diameters are bounded (min/max) and the default layout does not cause nodes to overlap (labels included): no node masks another after the `fcose` layout on the example and on a sample of 2 000 nodes.
4. Clicking a node shows correct description, source and links.
5. The search and filters work.
6. Nodes are not duplicated despite repeated information in the TSV.
7. A TSV of 100 000 lines is generated without error and the site remains usable (exploration mode).
8. PNG and JSON exports work.
9. **[V2]** A waiting indicator is visible during long operations (layout, search, expansion).
10. **[V2]** On node selection, non‑selected nodes are invisible by default; the checkbox can gray them or disable the behaviour.
11. **[V2]** A description containing `<script>alert(1)</script>` is displayed as plain text, without execution.

## 9. Possible extensions (out of scope)

- Taxonomic hierarchy (parent/child NCBI links) and compound nodes grouped by rank.
- ChEBI hierarchy (`is_a`) between molecules.
- Statistics (top taxa/molecules by degree) in a dedicated tab.
- Shareable view via URL (hash encoding filters and selection).
- Taxonomic rank and synonyms in the details panel.
- Automated deployment (GitHub Actions / GitLab CI) to Pages.
- Interface in English.
