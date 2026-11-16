// Taxon <-> ChEBI molecule interaction app (Cytoscape.js).
// All data originating from the TSV is inserted via textContent / append and
// never through innerHTML, to prevent XSS. Only http(s) URIs become links.
(function () {
  "use strict";

  var CFG = window.APP_CONFIG || {};
  var DATA = window.GRAPH_DATA;
  var I = window.I18N || {};
  var th = CFG.thresholds || {};

  function $(id) { return document.getElementById(id); }
  function T(k, v) {
    var s = I[k] || k;
    if (v) for (var x in v) s = String(s).split("{" + x + "}").join(v[x]);
    return s;
  }
  function el(tag, props, kids) {
    var e = document.createElement(tag);
    if (props) for (var k in props) {
      if (k === "onclick") e.onclick = props[k];
      else if (k === "style") e.setAttribute("style", props[k]);
      else e[k] = props[k];
    }
    // Accept a variable number of children: each remaining argument may be a
    // single node/string or an array of nodes/strings.
    for (var i = 2; i < arguments.length; i++) {
      var kid = arguments[i];
      if (kid == null) continue;
      var list = Array.isArray(kid) ? kid : [kid];
      for (var j = 0; j < list.length; j++) {
        var c = list[j];
        if (c == null) continue;
        e.append(typeof c === "string" ? document.createTextNode(c) : c);
      }
    }
    return e;
  }
  function accent(s) { return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }

  // --- i18n sweep on marked elements ----------------------------------------
  document.querySelectorAll("[data-i18n]").forEach(function (e) {
    e.textContent = T(e.getAttribute("data-i18n"));
  });
  document.querySelectorAll("[data-i18n-ph]").forEach(function (e) {
    e.placeholder = T(e.getAttribute("data-i18n-ph"));
  });

  // --- Data index ------------------------------------------------------------
  var all = {}, adj = {}, index = [];
  var maxDeg = 1, maxId = 0;
  (DATA && DATA.nodes || []).forEach(function (n) {
    var d = n.data;
    all[d.id] = d;
    index.push({ id: d.id, label: d.label, lc: accent(d.label) });
    if ((d.degree || 0) > maxDeg) maxDeg = d.degree || 1;
    if (Number(d.ncbi_id || d.chebi_id || 0) > maxId) maxId = Number(d.ncbi_id || d.chebi_id || 0);
  });
  (DATA && DATA.edges || []).forEach(function (e) {
    var d = e.data;
    (adj[d.source] = adj[d.source] || []).push(d);
    (adj[d.target] = adj[d.target] || []).push(d);
  });
  var relations = (DATA && DATA.relations || []).slice();
  var ALL_NODE_COUNT = Object.keys(all).length;
  var relCount = relations.length;

  var PALETTE = ["#4c78a8", "#b279a2", "#e45756", "#72b7b2", "#9d755d", "#f58518", "#54a24b", "#54a24b"];
  var relColor = {};
  relations.forEach(function (r, i) { relColor[r] = PALETTE[i % PALETTE.length]; });
  var COL = { taxon: "#2e9e5b", molecule: "#e8871e" };
  var NODE_MIN = (CFG.nodeSize && CFG.nodeSize.min) || 10;
  var NODE_MAX = (CFG.nodeSize && CFG.nodeSize.max) || 26;
  var directRel = {};
  (CFG.directedRelations || []).forEach(function (r) { directRel[r] = true; });
  var urlT = CFG.urlTemplates || {};

  function sizeFor(deg) {
    var t = Math.sqrt(deg) / Math.sqrt(maxDeg); // 0..1
    if (t > 1) t = 1;
    return NODE_MIN + (NODE_MAX - NODE_MIN) * t;
  }
  function nodeData(d) { return Object.assign({}, d, { size: sizeFor(d.degree || 0) }); }

  // --- Cytoscape -------------------------------------------------------------
  var perf = ALL_NODE_COUNT + (DATA.edges ? DATA.edges.length : 0) > (th.perf || 5000);
  var hovered = {};

  // Edge styles: arrows only for configured directed relations.
  var edgeStyles = [{ 
      selector: "edge",
      style: {
        width: 1.5, "line-color": function (e) { return relColor[e.data("relation")] || "#87939b"; },
        "curve-style": "bezier", opacity: 0.75,
        "target-arrow-shape": "none"
      }
    }];
  (CFG.directedRelations || []).forEach(function (r) {
    edgeStyles.push({ selector: 'edge[relation = "' + r + '"]', style: { "target-arrow-shape": "triangle", "target-arrow-color": function (e) { return relColor[e.data("relation")] || "#87939b"; }, width: 2 } });
  });

  function labelFor(ele) {
    if (ele.selected() || hovered[ele.id()] || cy.zoom() >= (th.hideLabelsZoom || 0.65)) return ele.data("label");
    return "";
  }

  var cy = cytoscape({
    container: $("cy"),
    elements: [],
    minZoom: 0.02, maxZoom: 6, wheelSensitivity: 0.5,
    textureOnViewport: perf, hideEdgesOnViewport: perf,
    style: [
      {
        selector: "node",
        style: {
          label: labelFor,
          "text-valign": "bottom", "text-margin-y": 5,
          "font-size": 10, color: "#26343d",
          "text-wrap": "wrap", "text-max-width": 110,
          width: "data(size)", height: "data(size)",
          "background-color": function (e) { return e.data("type") === "taxon" ? COL.taxon : COL.molecule; },
          shape: function (e) { return e.data("type") === "taxon" ? "ellipse" : "round-rectangle"; }
        }
      },
      { selector: "edge", style: { "arrow-scale": 1.4 } },
      { selector: ":selected", style: { "border-width": 4, "border-color": "#183c65", "overlay-opacity": 0.1 } }
    ].
      concat(edgeStyles).
      concat([
        { selector: ".faded", style: { opacity: 0.1 } },
        { selector: ".greyout", style: { opacity: 0.08 } },
        { selector: ".hidden", style: { display: "none" } }
      ])
  });

  // --- Ctrl+wheel: accelerated zoom ------------------------------------------
  // Cytoscape registers its zoom-on-wheel handler (down below as `V`) in the
  // *capture* phase on the canvas at instantiation time, so it runs before any
  // wheel listener we attach to the canvas and it re-reads `wheelSensitivity`
  // at each event. To make Ctrl+wheel zoom faster, we must update the
  // sensitivity *before* `V` runs — i.e. in the capture phase on `document`,
  // which fires before the canvas capture handler. `V` then zooms using the
  // boosted sensitivity and already prevents the browser page-zoom.
  (function () {
    var ctrlFactor = 2; // how many times faster than a plain zoom step (2–3×)
    var origSensitivity;
    document.addEventListener("wheel", function (e) {
      if (e.ctrlKey || e.metaKey) {
        if (origSensitivity === undefined) {
          origSensitivity = (cy.wheelSensitivity ? cy.wheelSensitivity() : 1);
        }
        if (cy.wheelSensitivity) cy.wheelSensitivity(origSensitivity * ctrlFactor);
      } else if (origSensitivity !== undefined) {
        if (cy.wheelSensitivity) cy.wheelSensitivity(origSensitivity);
        origSensitivity = undefined;
      }
    }, true); // capture: runs before the canvas capture handler (Cytoscape's `V`)
  })();

  // --- Loading spinner -------------------------------------------------------
  function busy(on) {
    var s = $("spinner");
    if (on) { s.hidden = false; document.body.classList.add("wait"); }
    else { s.hidden = true; document.body.classList.remove("wait"); }
  }
  function runWithBusy(setup, layoutObj) {
    busy(true);
    requestAnimationFrame(function () {
      setTimeout(function () {
        try {
          if (layoutObj) {
            layoutObj.on("layoutstop", function () { busy(false); });
            setTimeout(function () { busy(false); }, 30000); // safety
          }
          setup();
        } catch (e) { busy(false); }
      }, 0);
    });
  }

  // --- Element management ----------------------------------------------------
  function showNodes(ids) {
    ids.forEach(function (id) { if (all[id]) shown[id] = true; });
    var nodes = [], edges = [], seen = {};
    ids.forEach(function (id) {
      if (cy.getElementById(id).empty()) nodes.push({ group: "nodes", data: nodeData(all[id]) });
    });
    cy.add(nodes);
    ids.forEach(function (id) {
      (adj[id] || []).forEach(function (e) {
        if (seen[e.id] || !cy.getElementById(e.id).empty()) return;
        if (cy.getElementById(e.source).empty() || cy.getElementById(e.target).empty()) return;
        seen[e.id] = true; edges.push({ group: "edges", data: Object.assign({}, e) });
      });
    });
    cy.add(edges);
    updateDisplay();
  }
  function removeEles(eles) { eles.remove(); updateDisplay(); }

  // --- Filters + display -----------------------------------------------------
  var shown = {};      // node ids activated by exploration / "show all"
  var selNodeId = null;
  var hideNonSelected = false;

  function baseVisibleNode(id) {
    return shown[id] !== false; // shown set: everything unless explore mode hid it
  }
  function typeOk(d) {
    var showT = $("f-taxon").checked, showM = $("f-mol").checked;
    return d.type === "taxon" ? showT : showM;
  }
  function degreeOk(d) { return (d.degree || 0) >= Number($("f-deg").value || 0); }
  function relOk(e) { return !$("f-rel").value || e.data("relation") === $("f-rel").value; }

  function neighborhoodIds(id, depth) {
    var frontier = [id], seen = {};
    seen[id] = true;
    for (var i = 0; i < depth; i++) {
      var next = [];
      frontier.forEach(function (f) {
        (adj[f] || []).forEach(function (e) {
          var o = e.source === f ? e.target : e.source;
          if (!seen[o]) { seen[o] = true; next.push(o); }
        });
      });
      frontier = next;
    }
    return Object.keys(seen);
  }

  function updateDisplay() {
    cy.nodes().forEach(function (n) {
      var ok = baseVisibleNode(n.id()) && typeOk(n.data()) && degreeOk(n.data());
      n.toggleClass("hidden", !ok);
    });
    cy.edges().forEach(function (e) {
      var ok = relOk(e) && !e.source().hasClass("hidden") && !e.target().hasClass("hidden");
      e.toggleClass("hidden", !ok);
    });

    // Selection overlay: keep selected node + direct neighborhood.
    cy.nodes().removeClass("greyout");
    if (hideNonSelected && selNodeId && cy.getElementById(selNodeId).nonempty()) {
      var keep = {}, keepList = neighborhoodIds(selNodeId, 1);
      keepList.forEach(function (k) { keep[k] = true; });
      cy.nodes().forEach(function (n) {
        if (n.hasClass("hidden")) return;
        var inKeep = keep[n.id()];
        if (!inKeep) {
          var grey = $("hide-mode").value === "greyed";
          n.toggleClass("hidden", !grey);
          if (grey) n.addClass("greyout");
        }
      });
      cy.edges().forEach(function (e) {
        if (e.hasClass("hidden")) return;
        if (!keep[e.data("source")] || !keep[e.data("target")]) {
          var grey = $("hide-mode").value === "greyed";
          e.toggleClass("hidden", !grey);
          if (grey) e.addClass("greyout");
        }
      });
    }

    // Summary + visible degree display
    var visN = cy.nodes().not(".hidden"), visE = cy.edges().not(".hidden");
    $("summary").textContent = T("summary", { taxa: CFG.stats.taxa, mols: CFG.stats.molecules, edges: CFG.stats.edges });
    if (visN.length === 0 && !hideNonSelected) {
      banner(T("emptyGraph"), true);
    }
    var nb = cy.nodes(":selected"); if (nb.nonempty()) showVisibleDegree(nb[0]);
  }

  function visible() { return cy.elements().not(".hidden"); }

  // --- Banner ---------------------------------------------------------------
  function banner(msg, persistent) {
    var b = $("banner");
    clearTimeout(banner._t);
    if (!msg) { b.hidden = true; return; }
    b.replaceChildren();
    b.hidden = false;
    b.append(
      el("span", { textContent: msg }),
      el("button", {
        className: "banner-close", type: "button", textContent: "×",
        "aria-label": "Dismiss", title: "Dismiss",
        onclick: function () { b.hidden = true; }
      })
    );
    if (!persistent) banner._t = setTimeout(function () { b.hidden = true; }, 6000);
  }

  // --- Layouts ---------------------------------------------------------------
  function runLayout(name) {
    name = name || $("layout").value;
    var eles = visible();
    if (!eles.nodes().length) { busy(false); return; }
    if (name === "bipartite") {
      var cols = { taxon: [], molecule: [] }, pos = {};
      eles.nodes().forEach(function (n) { cols[n.data("type")].push(n); });
      Object.keys(cols).forEach(function (t) {
        cols[t].sort(function (a, b) { return a.data("label").localeCompare(b.data("label")); })
          .forEach(function (n, i) { pos[n.id()] = { x: t === "taxon" ? 0 : 700, y: i * 60 }; });
      });
      var lo = eles.layout({ name: "preset", positions: function (n) { return pos[n.id()] || { x: 0, y: 0 }; }, fit: true, padding: 40 });
      runWithBusy(function () { lo.run(); }, lo);
      return;
    }
    var o = { name: name, animate: false, fit: true, padding: 35, randomize: true };
    if (name === "fcose") {
      o.quality = eles.nodes().length > 1500 ? "draft" : "default";
      o.nodeDimensionsIncludeLabels = true;
      o.packComponents = true;
      o.nodeRepulsion = (CFG.layout && CFG.layout.nodeRepulsion) || 4500;
      o.idealEdgeLength = (CFG.layout && CFG.layout.idealEdgeLength) || 120;
    }
    if (name === "concentric") { o.concentric = function (n) { return n.data("degree"); }; o.levelWidth = function () { return 2; }; }
    var lo = eles.layout(o);
    runWithBusy(function () { lo.run(); }, lo);
  }

  // --- Exploration -----------------------------------------------------------
  function expand(id, depth) {
    depth = depth || Number($("depth").value || 1);
    var ids = neighborhoodIds(id, depth);
    var added = ids.length - (shown[id] ? Object.keys(shown).length : 0);
    // Simple cap safeguard: if too many would be displayed, ask/limit.
    var cap = th.expansionCap || 500;
    if (ids.length > cap) {
      ids = [id].concat(ids.filter(function (x) { return x !== id; })
        .sort(function (a, b) { return all[b].degree - all[a].degree; }).slice(0, cap - 1));
    }
    showNodes(ids);
    runLayout($("layout").value);
  }

  function showAllNodes() {
    if (ALL_NODE_COUNT > (CFG.maxInitialNodes || 500) && !confirm(T("confirmAll", { N: ALL_NODE_COUNT }))) return;
    showNodes(Object.keys(all));
    runLayout($("layout").value);
  }

  // --- Focus mode (double-click a node to drill into its neighborhood) --------
  // Double-clicking a node replaces the view with a dedicated subgraph made of
  // that node and its neighbors, laid out radially so that no two nodes touch
  // (a configurable minimum gap between node centers). A "✕" back button pops
  // the stack and returns to the previous graph, positions preserved.
  var focusStack = [];
  function graphSnapshot() {
    var pos = {};
    cy.nodes().forEach(function (n) { pos[n.id()] = n.position(); });
    return { shown: Object.assign({}, shown), pos: pos, zoom: cy.zoom(), pan: cy.pan() };
  }
  function restoreGraph(snap) {
    cy.elements().remove();
    shown = Object.assign({}, snap.shown);
    showNodes(Object.keys(shown));
    cy.nodes().forEach(function (n) { var p = snap.pos[n.id()]; if (p) n.position(p); });
    cy.zoom(snap.zoom); cy.pan(snap.pan);
  }
  // Drill into a node's neighborhood: replaces the view with a focused subgraph
  // (stack managed by focusBack via the "✕" button), laid out with the layout
  // currently selected in the toolbar (default: fcose).
  function enterFocus(id) {
    if (!cy.getElementById(id).nonempty()) return;
    focusStack.push(graphSnapshot());
    $("b-focus").hidden = false;
    var depth = Number($("depth").value || 1);
    var ids = neighborhoodIds(id, depth);
    if (ids.indexOf(id) < 0) ids.unshift(id);
    cy.elements().remove();
    shown = {};
    ids.forEach(function (i) { shown[i] = true; });
    showNodes(ids);
    // Use the layout currently selected in the toolbar (default: fcose) for the
    // focused subgraph, instead of the fixed radial layout (previously focusLayout).
    runLayout($("layout").value);
  }
  function focusBack() {
    if (!focusStack.length) return;
    restoreGraph(focusStack.pop());
    if (!focusStack.length) $("b-focus").hidden = true;
    updateDisplay();
  }

  // --- Details panel ---------------------------------------------------------
  var body = $("detail-body");
  function link(url, text) {
    return /^https?:\/\//i.test(url || "")
      ? el("a", { href: url, target: "_blank", rel: "noopener noreferrer", textContent: text || url })
      : document.createTextNode(url || "");
  }
  function externalUrl(type, id) {
    var slug = type === "taxon" ? "ncbi" : "chebi";
    var tpl = urlT[slug];
    if (!tpl) return "";
    return tpl.replace("{id}", encodeURIComponent(id));
  }
  function showVisibleDegree(node) {
    var nb = cy.getElementById(node.id()).neighborhood("1").nodes();
    // visible degree = distinct visible edges incident to node
    var cnt = visible().edges().filter(function (e) { return e.data("source") === node.id() || e.data("target") === node.id(); }).length;
    var p = $("vdegree");
    if (!p) {
      p = el("p", { className: "muted" });
      p.id = "vdegree";
      body.append(p);
    }
    p.textContent = T("visibleDegree", { n: cnt }) + " · " + T("neighbors", { n: nb.length });
  }
  function nodeDetails(d) {
    body.replaceChildren();
    var typeTxt = d.type === "taxon" ? T("typeTaxon") : T("typeMolecule");
    var ident = d.type === "taxon" ? "NCBI " + d.ncbi_id : "CHEBI:" + d.chebi_id;
    body.append(
      el("h3", { textContent: d.label }),
      el("p", { className: "muted", textContent: typeTxt + " — " + d.id }),
      el("p", { textContent: d.description }),
      el("p", { className: "muted", textContent: T("source") + " : " + (d.description_source || "—") }),
      el("p", null, T("uri") + " : ", link(d.uri)),
      el("p", null, T("external") + " : ", link(externalUrl(d.type, d.ncbi_id || d.chebi_id), d.type === "taxon" ? T("ncbi") : T("chebi")))
    );
    var nb = (adj[d.id] || []).map(function (e) { return e.source === d.id ? e.target : e.source; })
      .filter(function (id, i, a) { return a.indexOf(id) === i; })
      .sort(function (a, b) { return all[a].label.localeCompare(all[b].label); });
    var lim = th.neighborLimit || 100;
    var ul = el("ul");
    nb.slice(0, lim).forEach(function (id) {
      ul.append(el("li", null, el("button", { className: "neighbor", textContent: all[id].label + " (" + id + ")", onclick: function () { focus(id, true); } })));
    });
    if (nb.length > lim) ul.append(el("li", { className: "muted", textContent: T("more", { n: nb.length - lim }) }));
    body.append(el("p", null, T("neighbors", { n: nb.length })), ul);
    showVisibleDegree({ id: d.id });
  }
  function edgeDetails(d) {
    body.replaceChildren(
      el("h3", { textContent: T("edge") }),
      el("p", null, (all[d.source] ? all[d.source].label : d.source) + " — [" + d.relation + "] → " + (all[d.target] ? all[d.target].label : d.target))
    );
  }
  function clearDetails() {
    body.replaceChildren(el("p", { className: "muted", textContent: T("noSelection") }));
  }
  function focus(id, fromDetail) {
    if (cy.getElementById(id).empty()) {
      if (fromDetail) showNodes(neighborhoodIds(id, 1));
      else showNodes(neighborhoodIds(id, 1));
    }
    var n = cy.getElementById(id);
    if (!n.nonempty()) return;
    cy.elements().unselect();
    n.select();
    cy.animate({ center: { eles: n }, zoom: Math.max(cy.zoom(), 0.8) }, { duration: 250 });
  }

  // --- Search -----------------------------------------------------------------
  var searchDl = $("search-list");
  $("search").addEventListener("input", (function () {
    var t;
    return function (e) {
      var q = accent(e.target.value.trim());
      clearTimeout(t);
      t = setTimeout(function () {
        searchDl.replaceChildren();
        if (q.length < 2) return;
        var n = 0;
        for (var i = 0; i < index.length; i++) {
          var x = index[i];
          if (x.lc.indexOf(q) !== -1 || x.id.indexOf(q) !== -1) {
            searchDl.append(el("option", { value: x.label + " — " + x.id }));
            if (++n >= (th.suggestions || 20)) break;
          }
        }
      }, th.debounceMs || 200);
    };
  })());
  function doSearch() {
    var val = $("search").value.trim();
    if (!val) return;
    var m = val.match(/((?:taxon|chebi):\d+)\s*$/), q = accent(val);
    var hit = null;
    if (m) hit = all[m[1]];
    else {
      var pid = val.trim().match(/^\d+$/);
      hit = (pid && (all["taxon:" + pid[0]] || all["chebi:" + pid[0]])) || null;
      if (!hit) hit = index.find(function (x) { return x.lc === q; }) || null;
      if (!hit) hit = index.find(function (x) { return x.lc.indexOf(q) !== -1; }) || null;
      if (hit) hit = all[hit.id] || null;
    }
    if (hit) { shown[hit.id] = true; focus(hit.id); }
    else banner(T("notFound"), true);
  }
  $("search").addEventListener("change", doSearch);
  $("search").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); doSearch(); }
    if (e.key === "Escape") $("search").value = "";
  });

  // --- Selection / hide behaviour --------------------------------------------
  function applySelectionMode() {
    hideNonSelected = $("f-hide").checked;
    updateDisplay();
  }
  function onBackgroundTap() {
    // click on graph background cancels the hide-non-selected behaviour
    if (hideNonSelected) { $("f-hide").checked = false; hideNonSelected = false; }
    cy.elements().unselect();
    clearDetails();
    updateDisplay();
  }

  // --- Legend + relation filter ------------------------------------------------
  var legend = $("legend");
  legend.append(
    el("li", null, el("span", { className: "sw round", style: "background:" + COL.taxon }), T("taxa")),
    el("li", null, el("span", { className: "sw sq", style: "background:" + COL.molecule }), T("molecules"))
  );
  var relSel = $("f-rel");
  relations.forEach(function (r) {
    var o = el("option", { value: r, textContent: r });
    relSel.append(o);
    var sw = el("span", { className: "sw line", style: "background:" + relColor[r] });
    legend.append(el("li", null, sw, r));
  });

  // --- Exports ----------------------------------------------------------------
  function download(name, data, mime) {
    var a = el("a", { href: URL.createObjectURL(new Blob([data], { type: mime })), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  var visibleEles = function () { return cy.elements().not(".hidden"); };
  function visNodesEdges() {
    var ve = visibleEles(), ns = [], es = [];
    ve.nodes().forEach(function (n) { ns.push({ data: n.data() }); });
    ve.edges().forEach(function (e) { es.push({ data: e.data() }); });
    return { nodes: ns, edges: es };
  }
  function exportAs(type) {
    if (type === "png") {
      if (cy.png) cy.png({ output: "blob-promise", full: true, scale: 2, bg: "#ffffff" })
        .then(function (b) { download("graphe.png", b, "image/png"); });
    } else if (type === "svg") {
      // cytoscape-svg is optional; degrade gracefully when not vendored.
      if (window.cytoscapeSvg) {
        var svg = window.cytoscapeSvg(cy, { full: true, bg: "#ffffff", scale: 1 });
        download("graphe.svg", svg, "image/svg+xml");
      } else {
        banner("SVG export requires the cytoscape-svg extension (see README).", true);
      }
    } else if (type === "json") {
      download("graphe.json", JSON.stringify(visNodesEdges(), null, 1), "application/json");
    } else if (type === "tsv") {
      var cols = ["taxon_id", "taxon_name", "taxon_description", "relation", "chebi_id", "chebi_name", "chebi_description", "taxon_uri", "chebi_uri", "taxon_description_source", "chebi_description_source"];
      var c = function (s) { return String(s || "").replace(/[\t\r\n]+/g, " "); };
      var rows = visibleEles().edges().map(function (e) {
        var d = e.data(), t = all[d.source], m = all[d.target];
        return [t.ncbi_id, t.label, t.description, d.relation, m.chebi_id, m.label, m.description, t.uri, m.uri, t.description_source, m.description_source].map(c).join("\t");
      });
      download("graphe.tsv", [cols.join("\t")].concat(rows).join("\n") + "\n", "text/tab-separated-values;charset=utf-8");
    }
    closeModal();
  }
  // The single Export button opens the modal where the format is chosen.
  if ($("x-export")) $("x-export").onclick = openExportModal;

  // --- Modal (About / dependencies and Export) ---------------------------------
  var modal = $("modal");
  var modalTitle = $("modal-title");
  var modalSpecNote = $("modal-spec-note");
  function openModal(titleKey, bodyBuilder) {
    var mb = $("modal-body");
    mb.replaceChildren();
    modalTitle.textContent = T(titleKey);
    modalSpecNote.hidden = !(titleKey === "dependenciesTitle");
    bodyBuilder(mb);
    modal.hidden = false;
    $("modal-close").focus();
  }
  function closeModal() { modal.hidden = true; }

  function openExportModal() {
    openModal("exportTitle", function (mb) {
      [
        { type: "png",  icon: "🖼", key: "exportPNG" },
        { type: "svg",  icon: "📐", key: "exportSVG" },
        { type: "json", icon: "📦", key: "exportJSON" },
        { type: "tsv",  icon: "📄", key: "exportTSV" }
      ].forEach(function (d) {
        var b = el("button", { className: "export-btn", type: "button" }, d.icon + " ", T(d.key));
        b.onclick = function () { exportAs(d.type); };
        mb.append(b);
      });
    });
  }

  function openAboutModal() {
    openModal("dependenciesTitle", function (mb) {
      // Dependencies
      mb.append(el("h3", { textContent: T("dependenciesTitle") }),
        el("p", { className: "note", textContent: T("depNote") }));
      var ul = el("ul");
      (CFG.dependencies || []).forEach(function (d) {
        var li = el("li", null,
          el("strong", { textContent: d.name + " " + d.version }),
          document.createTextNode(" — " + (d.license || "n/a")));
        if (d.homepage) li.append(" ", link(d.homepage, "repo"));
        ul.append(li);
      });
      mb.append(ul);

      // AI traceability
      mb.append(el("h3", { textContent: T("genTitle") }),
        el("p", { textContent: T("genIntro") }));
      var g = CFG.generation || {};
      if (g.assistant || g.model || g.date) {
        var dl = el("ul");
        if (g.assistant) dl.append(el("li", null, T("genAssistant") + " : " + g.assistant));
        if (g.model) dl.append(el("li", null, T("genModel") + " : " + g.model));
        if (g.date) dl.append(el("li", null, T("genDate") + " : " + g.date));
        if (g.projectVersion) dl.append(el("li", null, T("genVersion") + " : " + g.projectVersion));
        mb.append(dl);
      } else {
        mb.append(el("p", { className: "muted", textContent: T("noGenInfo") }));
      }
    });
  }

  $("b-about").onclick = openAboutModal;
  $("modal-close").onclick = closeModal;
  modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
  modal.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });

  // --- Theme toggle --------------------------------------------------------------
  $("b-theme").onclick = function () { document.body.classList.toggle("dark"); };

  // --- Footer AI traceability ----------------------------------------------------
  var g = CFG.generation || {};
  if (g.assistant || g.model || g.date) {
    $("ai-trace").textContent = T("footerTrace", {
      assistant: g.assistant || "—", model: g.model || "—", date: g.date || "—"
    });
  }

  // --- Removal --------------------------------------------------------------------
  $("b-remove").onclick = function () {
    var sel = cy.elements(":selected");
    if (!sel.length) { banner(T("nothingRemoved"), true); return; }
    removeEles(sel);
    clearDetails();
    banner(T("removed"));
  };
  // --- Init view -------------------------------------------------------------------
  function initialView() {
    cy.elements().remove(); banner(null); banner._t && clearTimeout(banner._t); $("banner").hidden = true;
    var ids = Object.keys(all);
    var maxInit = CFG.maxInitialNodes || 500;
    if (ALL_NODE_COUNT > maxInit) {
      ids = Object.keys(all).sort(function (a, b) { return all[b].degree - all[a].degree || a.localeCompare(b); })
        .slice(0, maxInit);
      shown = {};
      ids.forEach(function (id) { shown[id] = true; });
      banner(T("bigGraph", { N: ALL_NODE_COUNT, n: ids.length }), true);
    } else {
      ids.forEach(function (id) { shown[id] = true; });
    }
    showNodes(ids);
    runLayout(CFG.defaultLayout || "fcose");
  }

  // --- Wire controls -------------------------------------------------------------------
  $("layout").value = CFG.defaultLayout || "fcose";
  $("layout").onchange = function () { runLayout($("layout").value); };
  $("b-relayout").onclick = function () { runLayout($("layout").value); };
  $("b-fit").onclick = function () { cy.fit(visibleEles(), 35); };
  $("b-all").onclick = showAllNodes;
  $("b-focus").onclick = focusBack;
  $("b-expand").onclick = function () {
    var s = cy.nodes(":selected");
    if (s.nonempty()) { expand(s[0].id()); }
  };
  ["f-taxon", "f-mol", "f-deg"].forEach(function (id) { $(id).addEventListener("input", updateDisplay); });
  $("f-rel").onchange = updateDisplay;
  var degIn = $("f-deg");
  degIn.addEventListener("input", function () { $("deg-out").textContent = degIn.value; updateDisplay(); });
  $("f-hide").onchange = applySelectionMode;
  $("hide-mode").onchange = applySelectionMode;
  // --- Cytoscape events -------------------------------------------------------------------
  // Double-click is detected manually via `tap` + a timer: Cytoscape's native
  // `dbltap` does not fire reliably on every browser/setup, whereas `tap` always
  // does. Two taps on the same node within ~320 ms open the focused subgraph.
  var lastTap = null;
  cy.on("tap", "node", function (e) {
    var id = e.target.id();
    var now = Date.now();
    if (lastTap && lastTap.id === id && (now - lastTap.time) < 320) {
      lastTap = null;
      enterFocus(id);
      return;
    }
    lastTap = { id: id, time: now };
    cy.elements().unselect(); e.target.select();
    selNodeId = e.target.id();
    nodeDetails(e.target.data());
    $("b-expand").disabled = false;
    $("b-remove").disabled = false;
    updateDisplay();
  });
  cy.on("tap", "edge", function (e) {
    selNodeId = null; cy.elements().unselect(); e.target.select();
    edgeDetails(e.target.data());
    $("b-expand").disabled = true;
  });
  cy.on("tap", function (e) {
    if (e.target === cy) onBackgroundTap();
  });
  cy.on("mouseover", "node", function (e) {
    hovered = {}; e.target.closedNeighborhood().forEach(function (x) { hovered[x.id()] = true; });
    var ctx = e.target.closedNeighborhood();
    cy.elements().not(ctx).addClass("faded");
    cy.elements().updateStyle();
  });
  cy.on("mouseout", "node", function () {
    hovered = {}; cy.elements().removeClass("faded"); cy.elements().updateStyle();
  });
  cy.on("zoom", function () { cy.elements().updateStyle(); });
  cy.on("unselect", function () {
    if (cy.elements(":selected").empty()) { $("b-expand").disabled = true; $("b-remove").disabled = true; }
  });

  // --- Dynamic grab: pull the neighborhood while dragging a node -------------
  // While a node is grabbed, its direct neighbors follow most of the movement
  // and 2‑hop neighbors follow a bit less — a soft "spring" feel that lets you
  // pull a node (and its context) out of a dense cluster to inspect it.
  // Implemented with a requestAnimationFrame loop (not the `drag` event), so it
  // keeps pulling smoothly each frame regardless of how events are delivered.
  // Only already-displayed neighbors are pulled (no nodes are ever created).
  var grab = null;
  function isNode(e) { return e.target !== cy && e.target.group && e.target.group() === "nodes"; }

  function neighborsUpTo2(id) {
    var one = {}, two = {};
    (adj[id] || []).forEach(function (ed) {
      var o = ed.source === id ? ed.target : ed.source;
      one[o] = true;
      (adj[o] || []).forEach(function (ed2) {
        var o2 = ed2.source === o ? ed2.target : ed2.source;
        if (o2 !== id && !one[o2]) two[o2] = true;
      });
    });
    return { one: one, two: two };
  }

  function dragTick() {
    if (!grab) return;
    var n = grab.n;
    var now = n.position();
    var dx = now.x - grab.prev.x, dy = now.y - grab.prev.y;
    grab.prev = now;

    if (dx !== 0 || dy !== 0) {
      var nb = neighborsUpTo2(grab.id);
      function follow(set, f) {
        Object.keys(set).forEach(function (id) {
          if (id === grab.id) return;
          var o = cy.getElementById(id);
          if (o.empty() || o.grabbed() || o.hasClass("hidden")) return;
          var p = o.position();
          o.position({ x: p.x + dx * f, y: p.y + dy * f });
        });
      }
      follow(nb.one, 0.8);
      follow(nb.two, 0.4);
    }
    grab.raf = requestAnimationFrame(dragTick);
  }

  cy.on("grab", function (e) {
    if (!isNode(e)) return;
    if (grab) cancelAnimationFrame(grab.raf);
    var n = e.target;
    grab = { id: n.id(), n: n, prev: n.position() };
    grab.raf = requestAnimationFrame(dragTick);
  });
  function grabEnd() {
    if (grab) { cancelAnimationFrame(grab.raf); grab = null; }
  }
  cy.on("free", grabEnd);
  cy.on("dragfree", grabEnd);

  // empty data handling
  if (!DATA || !DATA.nodes || !DATA.nodes.length) {
    $("summary").textContent = T("summary", { taxa: 0, mols: 0, edges: 0 });
    banner(T("emptyData"), true);
  } else {
    initialView();
  }
})();
