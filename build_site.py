#!/usr/bin/env python3
"""Static site generator: NCBI taxon <-> ChEBI molecule Cytoscape.js graphs.

Reads a TSV of taxon/molecule relations and produces a self‑contained static
website (double‑click on ``index.html`` works on ``file://``: no fetch(), no ES
modules, all vendor libraries embedded locally).

Python 3.10+, standard library only (csv, json, argparse, pathlib, shutil, re).
Behaviour follows SPECIFICATIONS.md (V2/V3).
"""
import argparse
import csv
import json
import re
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ASSETS = HERE / "assets"
TEMPLATE = HERE / "index_template.html"

MANDATORY = ["taxon_id", "taxon_name", "relation", "chebi_id", "chebi_name"]
KNOWN = {
    "taxon_id", "taxon_name", "taxon_description", "relation", "chebi_id",
    "chebi_name", "chebi_description", "taxon_uri", "chebi_uri",
    "taxon_description_source", "chebi_description_source",
}

# Node field mapping: how each Cytoscape node maps to TSV columns (used for
# first‑occurrence‑wins consistency checking).
NODE_FIELDS = {
    "taxon": ("label", "taxon_name"),
    "molecule": ("label", "chebi_name"),
}
EXTRA_FIELDS = {
    "taxon": {
        "description": "taxon_description",
        "uri": "taxon_uri",
        "description_source": "taxon_description_source",
        "id_slug": "taxon_id",  # not a real column, handled specially
    },
    "molecule": {
        "description": "chebi_description",
        "uri": "chebi_uri",
        "description_source": "chebi_description_source",
    },
}

# Default external URL templates (overridable via --config urlTemplates).
DEFAULT_URL_TEMPLATES = {
    "ncbi": "https://www.ncbi.nlm.nih.gov/Taxonomy/Browser/wwwtax.cgi?id={id}",
    "chebi": "https://www.ebi.ac.uk/chebi/searchId.do?chebiId=CHEBI:{id}",
}

# Default Fcose parameters (overridable via --config layout).
DEFAULT_LAYOUT_PARAMS = {
    "nodeRepulsion": 4500,
    "idealEdgeLength": 120,
}

# Default dependency manifest (versions of the vendored libraries).
DEFAULT_DEPENDENCIES = [
    {"name": "Cytoscape.js", "version": "3.32.1", "license": "MIT",
     "file": "cytoscape.min.js", "homepage": "https://js.cytoscape.org"},
    {"name": "cytoscape-fcose", "version": "2.2.0", "license": "MIT",
     "file": "cytoscape-fcose.min.js", "homepage": "https://github.com/iVis-at-Bilkent/cytoscape.js-fcose"},
    {"name": "layout-base", "version": "2.0.1", "license": "MIT",
     "file": "layout-base.js", "homepage": "https://github.com/iVis-at-Bilkent/layout-base"},
    {"name": "cose-base", "version": "2.2.0", "license": "MIT",
     "file": "cose-base.js", "homepage": "https://github.com/iVis-at-Bilkent/cose-base"},
]

# Application identity (overridable via --config "app").
DEFAULT_APP_IDENTITY = {
    "name": "TaxoMetaGraph",
    "baseline": "Taxa–metabolite knowledge graph explorer",
    "fullTitle": "Public knowledge graph, associating taxa listed in the "
                 "PubChem and LOTUS databases with metabolites linked to "
                 "samples analysed within research projects",
    "github": "Taxa-metabolite-knowledge-graph-explorer",
    "context": {
        "project": "Next level of reproducible, comparable and integrable Metabolomics",
        "workPackage": "WP 3, Species-specific resources",
        "objective": "Build the foundations of species-specific resources to "
                     "support the interpretation of metabolomics results",
    },
}

RE_HTTP = re.compile(r"^https?://", re.IGNORECASE)
SCRIPTS_PATTERN = re.compile(r"</script", re.IGNORECASE)


class Config:
    """Merged configuration (CLI + optional JSON config file)."""

    def __init__(self, cli, cfg):
        self.cli = cli
        self.cfg = cfg or {}
        self.max_initial_nodes = getattr(cli, "max_initial_nodes", 0)
        self.default_layout = getattr(cli, "default_layout", "fcose")
        self.title = getattr(cli, "title", "TaxoMetaGraph")

    def get(self, key, default=None):
        return self.cfg.get(key, default)


def clean(value):
    """Strip a value and treat empty / 'NA' / 'null' literals as absent."""
    if value is None:
        return ""
    v = str(value).strip()
    if v in ("", "NA", "N/A", "null", "NULL", "None", "?"):
        return ""
    return v


def json_min(obj):
    """Compact deterministic JSON (sorted keys)."""
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def json_pretty(obj):
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, indent=2)


def js_safe(obj):
    """JSON safe to inline inside a <script> tag."""
    return json_min(obj).replace("</", "<\\/").replace("<!--", "<\\!--")


def fail(msg):
    sys.stderr.write(f"Error: {msg}\n")
    sys.exit(1)


def read_tsv(path, config):
    """Stream the TSV and build deduplicated nodes + edges.

    Returns (nodes, edges, stats, warnings).

    * nodes : dict {id: {"data": {...}}}, first occurrence wins; inconsistent
      later values are reported (once per node and field).
    * edges : dict {edge_id: {"data": {...}}} (duplicates merged).
    * degree is computed from the distinct edge set, not from repeated rows.
    """
    warnings = []
    stats = {"rows": 0, "invalid": 0, "duplicate_edges": 0}
    nodes = {}
    edges = {}
    warned_cells = set()  # (node_kind, node_key, field)

    def row_invalid(line, msg):
        full = f"Line {line}: {msg}"
        if config.cli.strict:
            fail(full)
        stats["invalid"] += 1
        warnings.append(full)

    def add_node(kind, key, values, line):
        # values: dict of node.data field -> value for all node fields
        if key not in nodes:
            nodes[key] = {"data": dict(values)}
            return
        stored = nodes[key]["data"]
        for field, val in values.items():
            if not val:
                continue
            if stored.get(field) != val:
                cell = (kind, key, field)
                if cell not in warned_cells:
                    warned_cells.add(cell)
                    warnings.append(
                        f"Line {line}: inconsistent {field} for {key}; "
                        f"first occurrence kept."
                    )

    with open(path, newline="", encoding="utf-8-sig") as fh:
        reader = csv.reader(fh, delimiter="\t", quoting=csv.QUOTE_NONE)
        try:
            header = next(reader)
        except StopIteration:
            fail(f"{path} is empty.")
        ncols = len(header)
        header_set = set(header)
        missing = [c for c in MANDATORY if c not in header_set]
        if missing:
            fail("Missing required columns: " + ", ".join(missing))
        unknown = [c for c in header if c not in KNOWN]
        for c in unknown:
            warnings.append(f"Unknown column ignored: {c}")

        for line, raw in enumerate(reader, start=2):
            stats["rows"] += 1
            if len(raw) != ncols:
                row_invalid(line, f"column count mismatch ({len(raw)} != {ncols})")
                continue
            # Preserve the unknown-column keys too (they are ignored downstream
            # unless they collide with known ones).
            row = {h: clean(v) for h, v in zip(header, raw)}

            # --- validation -------------------------------------------------
            problems = []
            for c in MANDATORY:
                if c != "relation" and not row.get(c):
                    problems.append(f"empty required field '{c}'")
            if not row.get("relation"):
                problems.append("empty required field 'relation'")
            for c in ("taxon_id", "chebi_id"):
                v = row.get(c)
                if v:
                    try:
                        if int(v) <= 0:
                            problems.append(f"{c} must be a positive integer")
                    except ValueError:
                        problems.append(f"{c} is not an integer")
            if problems:
                row_invalid(line, "; ".join(problems))
                continue

            taxon_id, chebi_id = int(row["taxon_id"]), int(row["chebi_id"])
            tkey, mkey = f"taxon:{taxon_id}", f"chebi:{chebi_id}"

            # --- URI validation (http(s) only) -----------------------------
            uri_warned = set()

            def resolve_uri(raw_val, default_uri, slug):
                if not raw_val:
                    return default_uri
                if not RE_HTTP.match(raw_val):
                    if slug not in uri_warned:
                        uri_warned.add(slug)
                        warnings.append(
                            f"Line {line}: rejected non-http(s) {slug} URI; left empty."
                        )
                    return ""  # rejected: never rendered as a link
                return raw_val

            taxon_uri = resolve_uri(
                row.get("taxon_uri"),
                f"http://purl.obolibrary.org/obo/NCBITaxon_{taxon_id}",
                "taxon_uri",
            )
            chebi_uri = resolve_uri(
                row.get("chebi_uri"),
                f"http://purl.obolibrary.org/obo/CHEBI_{chebi_id}",
                "chebi_uri",
            )

            # --- nodes ------------------------------------------------------
            add_node(
                "taxon",
                tkey,
                {
                    "id": tkey,
                    "type": "taxon",
                    "label": row.get("taxon_name", ""),
                    "ncbi_id": taxon_id,
                    "description": row.get("taxon_description", ""),
                    "uri": taxon_uri,
                    "description_source": row.get("taxon_description_source", ""),
                    "degree": 0,
                },
                line,
            )
            add_node(
                "molecule",
                mkey,
                {
                    "id": mkey,
                    "type": "molecule",
                    "label": row.get("chebi_name", ""),
                    "chebi_id": chebi_id,
                    "description": row.get("chebi_description", ""),
                    "uri": chebi_uri,
                    "description_source": row.get("chebi_description_source", ""),
                    "degree": 0,
                },
                line,
            )

            # --- edge (deduplicated) ----------------------------------------
            eid = f"e:{taxon_id}-{chebi_id}-{row['relation']}"
            if row.get("taxon_uri") and not RE_HTTP.match(row["taxon_uri"]):
                pass  # taxon_uri already emptied above
            edge_data = {
                "id": eid,
                "source": tkey,
                "target": mkey,
                "relation": row["relation"],
            }
            if eid in edges:
                stats["duplicate_edges"] += 1
            edges[eid] = {"data": edge_data}

    # --- compute degree over the DISTINCT edge set ---------------------------
    for e in edges.values():
        nodes[e["data"]["source"]]["data"]["degree"] += 1
        nodes[e["data"]["target"]]["data"]["degree"] += 1

    return nodes, edges, stats, warnings


def build_graph(nodes, edges):
    """Deterministic, sorted element lists."""
    node_list = sorted(nodes.values(), key=lambda n: n["data"]["id"])
    edge_list = sorted(edges.values(), key=lambda e: e["data"]["id"])
    relations = sorted({e["data"]["relation"] for e in edge_list})
    stats = {
        "taxa": sum(1 for n in node_list if n["data"]["type"] == "taxon"),
        "molecules": sum(1 for n in node_list if n["data"]["type"] == "molecule"),
        "edges": len(edge_list),
    }
    return {
        "nodes": node_list,
        "edges": edge_list,
        "relations": relations,
        "stats": stats,
    }


def build_app_config(cli, cfg, graph):
    """Assemble window.APP_CONFIG (generation traceability + deps included)."""
    return {
        "title": cli.title,
        "app": cfg.get("app", DEFAULT_APP_IDENTITY),
        "defaultLayout": cli.default_layout,
        "maxInitialNodes": cli.max_initial_nodes,
        "nodeSize": cfg.get("nodeSize", {"min": 10, "max": 26}),
        "urlTemplates": cfg.get(
            "urlTemplates", DEFAULT_URL_TEMPLATES
        ),
        "directedRelations": cfg.get("directedRelations", []),
        "layout": cfg.get("layout", DEFAULT_LAYOUT_PARAMS),
        "thresholds": cfg.get(
            "thresholds",
            {"perf": 5000, "hideLabelsZoom": 0.65, "neighborLimit": 100,
             "expansionCap": 500, "suggestions": 20, "debounceMs": 200},
        ),
        "dependencies": cfg.get("dependencies", DEFAULT_DEPENDENCIES),
        "generation": cfg.get("generation", {}),
        "stats": graph["stats"],
    }


def write_site(graph, app_config, cli, out_dir, single_file):
    """Write the website output tree (deterministic)."""
    assets_src = ASSETS
    cfg_js = f"window.APP_CONFIG = {js_safe(app_config)};\n"
    graph_js = f"window.GRAPH_DATA = {js_safe(graph)};\n"

    if not single_file:
        # --- multi-file layout with strict CSP ('self' only, no inline) -----
        (out_dir / "data").mkdir(parents=True, exist_ok=True)
        (out_dir / "data" / "graph.json").write_text(
            json_pretty(graph) + "\n", encoding="utf-8"
        )
        (out_dir / "assets").mkdir(parents=True, exist_ok=True)
        for sub in ("css", "js", "vendor"):
            src = assets_src / sub
            dst = out_dir / "assets" / sub
            dst.mkdir(parents=True, exist_ok=True)
            if src.is_dir():
                for f in src.iterdir():
                    if f.is_file():
                        shutil.copy(f, dst / f.name)
        (out_dir / "assets" / "js" / "config.js").write_text(cfg_js, encoding="utf-8")
        (out_dir / "assets" / "js" / "graph-data.js").write_text(graph_js, encoding="utf-8")

        head_css = '<link rel="stylesheet" href="assets/css/style.css">'
        # Note: `style-src 'unsafe-inline'` is required by Cytoscape.js, which
        # positions/opacity-styles elements inline. `script-src 'self'` (no
        # unsafe-inline) is kept strict — that is the actual XSS boundary.
        csp = ("default-src 'self'; style-src 'self' 'unsafe-inline'; "
               "script-src 'self'; connect-src 'none'; img-src 'self' data:;")
        scripts = [
            '<script src="assets/vendor/cytoscape.min.js"></script>',
            '<script src="assets/vendor/layout-base.js"></script>',
            '<script src="assets/vendor/cose-base.js"></script>',
            '<script src="assets/vendor/cytoscape-fcose.min.js"></script>',
            '<script src="assets/js/config.js"></script>',
            '<script src="assets/js/graph-data.js"></script>',
            '<script src="assets/js/i18n.js"></script>',
            '<script src="assets/js/app.js"></script>',
        ]
        scripts = "\n".join(scripts)
    else:
        # --- single-file mode: everything inlined, CSP allows inline ---------
        (out_dir / "data").mkdir(parents=True, exist_ok=True)
        (out_dir / "data" / "graph.json").write_text(
            json_pretty(graph) + "\n", encoding="utf-8"
        )

        def read_text(*parts):
            return (assets_src.joinpath(*parts)).read_text(encoding="utf-8")

        def inline_script(js):
            return SCRIPTS_PATTERN.sub(r"<\\/script", js)

        css = read_text("css", "style.css")
        i18n = read_text("js", "i18n.js")
        app = read_text("js", "app.js")
        vfiles = ["cytoscape.min.js", "layout-base.js", "cose-base.js", "cytoscape-fcose.min.js"]

        chunks = []
        chunks.append("<style>\n" + css + "\n</style>")
        chunks.append("<script>" + inline_script(cfg_js) + "</script>")
        for vf in vfiles:
            chunks.append("<script>" + inline_script(read_text("vendor", vf)) + "</script>")
        chunks.append("<script>" + inline_script(graph_js) + "</script>")
        chunks.append("<script>" + inline_script(i18n) + "</script>")
        chunks.append("<script>" + inline_script(app) + "</script>")

        head_css = ""  # style inlined in body-level <style>? keep link empty, style goes in head
        csp = ("default-src 'self'; style-src 'self' 'unsafe-inline'; "
               "script-src 'self' 'unsafe-inline'; connect-src 'none'; img-src 'self' data:;")
        scripts = "\n".join(chunks)

    tpl = TEMPLATE.read_text(encoding="utf-8")
    html_title = cli.title.replace("&", "&amp;").replace("<", "&lt;")
    page = (
        tpl.replace("__SITE_TITLE__", html_title)
        .replace("__SITE_CSP__", csp)
        .replace("__SITE_HEAD_CSS__", head_css)
        .replace("__SITE_SCRIPTS__", scripts)
    )
    (out_dir / "index.html").write_text(page, encoding="utf-8")


def print_summary(graph, stats, warnings, out_dir, quiet):
    if quiet:
        return
    print(f"Taxons: {graph['stats']['taxa']} | "
          f"Molecules: {graph['stats']['molecules']} | "
          f"Edges: {graph['stats']['edges']} | "
          f"Distinct relations: {len(graph['relations'])} | "
          f"Invalid lines: {stats['invalid']} | "
          f"Duplicate edges merged: {stats['duplicate_edges']} | "
          f"Warnings: {len(warnings)}")
    if warnings:
        shown = warnings[:20]
        for w in shown:
            print("  - " + w)
        if len(warnings) > 20:
            print(f"  … and {len(warnings) - 20} more warnings")
    print(f"Website generated in {out_dir}/index.html")


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Generate a static Cytoscape site from a taxon/molecule TSV."
    )
    parser.add_argument("--input", required=True, help="TSV input file.")
    parser.add_argument("--output", default="dist", help="Output folder (default: dist).")
    parser.add_argument("--title", default="TaxoMetaGraph", help="Site title (app name).")
    parser.add_argument("--single-file", action="store_true",
                        help="Inline all data and scripts into one index.html.")
    parser.add_argument("--max-initial-nodes", type=int, default=500,
                        help="Above this node count the site starts in exploration mode.")
    parser.add_argument("--default-layout", default="fcose",
                        choices=["fcose", "cose", "concentric", "circle", "grid", "bipartite"])
    parser.add_argument("--strict", action="store_true",
                        help="Abort on the first invalid line (default: skip with warning).")
    parser.add_argument("--config", help="Optional JSON configuration file.")
    parser.add_argument("--quiet", action="store_true", help="Suppress summary output.")
    args = parser.parse_args(argv)

    cfg_data = {}
    if args.config:
        try:
            cfg_data = json.loads(Path(args.config).read_text(encoding="utf-8"))
        except Exception as e:
            fail(f"cannot read config {args.config}: {e}")

    config = Config(args, cfg_data)

    if not TEMPLATE.is_file():
        fail(f"missing template: {TEMPLATE}")

    nodes, edges, stats, warnings = read_tsv(args.input, config)

    if not edges:
        fail("no valid edge produced from the input file.")

    graph = build_graph(nodes, edges)
    app_config = build_app_config(args, cfg_data, graph)

    out_dir = Path(args.output)
    if out_dir.exists():
        for child in out_dir.iterdir():
            if child.is_file():
                child.unlink()
            else:
                shutil.rmtree(child, ignore_errors=True)
    out_dir.mkdir(parents=True, exist_ok=True)

    write_site(graph, app_config, args, out_dir, args.single_file)

    print_summary(graph, stats, warnings, out_dir, args.quiet)
    return 0


if __name__ == "__main__":
    sys.exit(main())
