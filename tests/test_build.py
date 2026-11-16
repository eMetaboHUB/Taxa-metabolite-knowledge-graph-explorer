"""Tests for the build_site.py generator (see SPECIFICATIONS.md §6).

Run with:  python -m unittest discover -s tests -v
or:        python -m pytest tests
"""
import csv
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import build_site  # noqa: E402

HEADER = (["taxon_id", "taxon_name", "taxon_description", "relation", "chebi_id",
           "chebi_name", "chebi_description", "taxon_uri", "chebi_uri",
           "taxon_description_source", "chebi_description_source"])


class FakeArgs:
    strict = False


def run_read(rows, strict=False):
    """Feed rows (list of dicts) through the CSV reader and read_tsv."""
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=HEADER, delimiter="\t")
    w.writeheader()
    for r in rows:
        w.writerow({k: r.get(k, "") for k in HEADER})
    buf.seek(0)
    tmp = Path(tempfile.mkstemp(suffix=".tsv")[1])
    tmp.write_text(buf.getvalue(), encoding="utf-8")
    try:
        a = types.SimpleNamespace(strict=strict, max_initial_nodes=0,
                                  default_layout="fcose", title="t", config=None, quiet=True)
        config = build_site.Config(a, {})
        nodes, edges, stats, warnings = build_site.read_tsv(str(tmp), config)
        return nodes, edges, stats, warnings
    finally:
        tmp.unlink()


def ok_row(**over):
    base = dict(zip(HEADER, [
        "2", "Bacteria", "A domain taxon.", "skos:related", "15841", "polypeptide",
        "A peptide.", "http://purl.obolibrary.org/obo/NCBITaxon_2",
        "http://purl.obolibrary.org/obo/CHEBI_15841", "src1", "src2"]))
    base.update(over)
    return base


class TestReadTsv(unittest.TestCase):
    def test_dedup_nodes_and_degree_from_distinct_edges(self):
        nodes, edges, _, _ = run_read([ok_row(), ok_row(), ok_row(chebi_id="18085", chebi_name="glycosaminoglycan")])
        by = {n["data"]["id"]: n["data"] for n in nodes.values()}
        self.assertEqual(by["taxon:2"]["degree"], 2)      # two distinct edges
        self.assertEqual(by["chebi:15841"]["degree"], 1)
        self.assertEqual(by["chebi:18085"]["degree"], 1)
        self.assertEqual(len(edges), 2)                   # duplicate merged
        self.assertEqual(len(nodes), 3)

    def test_first_occurrence_wins_with_warning(self):
        nodes, _, _, warnings = run_read([
            ok_row(taxon_description="FIRST"),
            ok_row(taxon_description="SECOND"),
        ])
        by = {n["data"]["id"]: n["data"] for n in nodes.values()}
        self.assertEqual(by["taxon:2"]["description"], "FIRST")
        self.assertTrue(any("inconsistent description" in w for w in warnings))
        # only one warning per node/field
        self.assertEqual(sum(1 for w in warnings if "taxon:2" in w), 1)

    def test_invalid_lines_skipped(self):
        nodes, edges, stats, warnings = run_read([
            ok_row(),                                    # valid
            ok_row(taxon_id="0"),                        # non-strict-positive
            ok_row(taxon_id="abc"),                      # not an integer
            ok_row(chebi_name=""),                       # empty required
        ])
        self.assertEqual(stats["invalid"], 3)
        self.assertEqual(len(warnings), 3)
        self.assertEqual(len(edges), 1)

    def test_na_null_treated_as_absent(self):
        nodes, _, _, _ = run_read([
            ok_row(taxon_description="NA", chebi_description="null"),
        ])
        by = {n["data"]["id"]: n["data"] for n in nodes.values()}
        self.assertEqual(by["taxon:2"]["description"], "")
        self.assertEqual(by["chebi:15841"]["description"], "")

    def test_non_http_uri_rejected(self):
        nodes, _, _, warnings = run_read([ok_row(chebi_uri="ftp://example.org/x")])
        by = {n["data"]["id"]: n["data"] for n in nodes.values()}
        self.assertEqual(by["chebi:15841"]["uri"], "")
        self.assertTrue(any("URI" in w or "uri" in w for w in warnings))

    def test_distinct_relations_remain_distinct_edges(self):
        nodes, edges, _, _ = run_read([
            ok_row(relation="skos:related"),
            ok_row(relation="skos:prefLabel"),
        ])
        self.assertEqual(len(edges), 2)
        rels = {e["data"]["relation"] for e in edges.values()}
        self.assertEqual(rels, {"skos:related", "skos:prefLabel"})
        # same taxon node still one node, degree 2
        self.assertEqual(  [n for n in nodes.values() if n["data"]["id"] == "taxon:2"][0]["data"]["degree"], 2)

    def test_column_count_mismatch_detected(self):
        rows = [ok_row()]
        rows[0]["extra"] = "oops"  # not possible via DictWriter; test via raw buffer
        buf = io.StringIO()
        buf.write("\t".join(HEADER) + "\n")
        buf.write("\t".join([str(ok_row().get(k, "")) for k in HEADER] + ["extra"]) + "\n")
        tmp = Path(tempfile.mkstemp(suffix=".tsv")[1])
        tmp.write_text(buf.getvalue(), encoding="utf-8")
        _, edges, stats, warnings = build_site.read_tsv(str(tmp), build_site.Config(types.SimpleNamespace(strict=False), {}))
        self.assertEqual(stats["invalid"], 1)
        self.assertTrue(any("column count" in w for w in warnings))
        tmp.unlink()


class TestCli(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def run_cli(self, *args):
        return subprocess.run([sys.executable, str(ROOT / "build_site.py"), *args],
                              capture_output=True, text=True)

    def test_build_multi_file(self):
        out = self.dir / "dist"
        r = self.run_cli("--input", str(ROOT / "example.tsv"), "--output", str(out),
                          "--config", str(ROOT / "config.example.json"))
        self.assertEqual(r.returncode, 0)
        self.assertTrue((out / "index.html").exists())
        self.assertTrue((out / "data" / "graph.json").exists())
        self.assertTrue((out / "assets" / "js" / "graph-data.js").exists())
        self.assertTrue((out / "assets" / "js" / "config.js").exists())
        self.assertTrue((out / "assets" / "vendor" / "cytoscape.min.js").exists())
        html = (out / "index.html").read_text(encoding="utf-8")
        self.assertIn("assets/js/graph-data.js", html)
        self.assertIn("assets/js/config.js", html)
        self.assertNotIn("__SITE_", html)

    def test_build_single_file(self):
        out = self.dir / "dist"
        r = self.run_cli("--input", str(ROOT / "example.tsv"), "--output", str(out),
                         "--single-file", "--config", str(ROOT / "config.example.json"))
        self.assertEqual(r.returncode, 0)
        html = (out / "index.html").read_text(encoding="utf-8")
        # standalone: no relative asset references to external js
        self.assertNotIn("assets/js/app.js", html)
        self.assertIn("window.APP_CONFIG", html)
        self.assertIn("window.GRAPH_DATA", html)
        # spec: escape </script> in inlined JSON
        self.assertNotIn("<\\\\/script", html)  # leave no literal risk

    def test_json_structure_and_degree(self):
        out = self.dir / "dist"
        self.run_cli("--input", str(ROOT / "example.tsv"), "--output", str(out))
        graph = json.loads((out / "data" / "graph.json").read_text(encoding="utf-8"))
        self.assertIn("nodes", graph)
        self.assertIn("edges", graph)
        self.assertEqual(graph["stats"]["taxa"], 4)
        self.assertEqual(graph["stats"]["molecules"], 5)
        self.assertEqual(graph["stats"]["edges"], 5)
        self.assertTrue(all(e["data"]["id"].startswith("e:") for e in graph["edges"]))

    def test_determinism(self):
        a = self.dir / "a"
        b = self.dir / "b"
        self.run_cli("--input", str(ROOT / "example.tsv"), "--output", str(a),
                     "--config", str(ROOT / "config.example.json"))
        self.run_cli("--input", str(ROOT / "example.tsv"), "--output", str(b),
                     "--config", str(ROOT / "config.example.json"))
        for rel in ["index.html", "data/graph.json", "assets/js/graph-data.js", "assets/js/config.js"]:
            self.assertEqual(
                (a / rel).read_bytes(), (b / rel).read_bytes(),
                f"non deterministic output: {rel}")

    def test_strict_mode_fails_on_invalid_line(self):
        out = self.dir / "dist"
        r = self.run_cli("--input", str(ROOT / "example.tsv"), "--output", str(out), "--strict")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("Error", r.stderr)

    def test_missing_required_column_fails(self):
        tmp = Path(self.dir / "bad.tsv")
        tmp.write_text("taxon_id\ttaxon_name\n2\tBacteria\n", encoding="utf-8")
        r = self.run_cli("--input", str(tmp), "--output", str(self.dir / "d"))
        self.assertNotEqual(r.returncode, 0)

    def test_max_initial_nodes_propagated(self):
        out = self.dir / "dist"
        self.run_cli("--input", str(ROOT / "example.tsv"), "--output", str(out),
                     "--max-initial-nodes", "5")
        cfg = (out / "assets" / "js" / "config.js").read_text(encoding="utf-8")
        self.assertIn('"maxInitialNodes":5', cfg)


if __name__ == "__main__":
    unittest.main()
