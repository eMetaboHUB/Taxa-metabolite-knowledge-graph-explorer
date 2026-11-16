// English UI strings. The interface language is English (see §4.7 of the spec).
window.I18N = {
  // Toolbar
  search: "Search",
  searchPh: "Search a taxon or molecule by name or identifier…",
  layout: "Layout",
  bipartite: "bipartite",
  relayout: "Re-run layout",
  fit: "Fit to view",
  showAll: "Show all",
  about: "About / Dependencies",
  spinner: "Processing…",
  summary: "{taxa} taxa · {mols} molecules · {edges} edges",

  // Panels
  details: "Details",
  filters: "Filters",
  taxa: "Taxa",
  molecules: "Molecules",
  minDegree: "Minimum degree",
  degNote: "The minimum-degree filter applies to the global degree (computed over all edges).",
  relation: "Relation",
  allRel: "All",
  depth: "Neighborhood (hops)",
  expand: "Expand to neighborhood",
  selection: "Selection",
  hideNonSelected: "Hide non-selected",
  hideMode: "Hide mode",
  modeInvisible: "Invisible",
  modeGreyed: "Greyed (faded)",
  removeFromGraph: "Remove from graph",
  legend: "Legend",
  noSelection: "Click a node or an edge to see details.",

  // Details
  typeTaxon: "Taxon (NCBI Taxonomy)",
  typeMolecule: "Molecule (ChEBI)",
  source: "Source",
  uri: "URI",
  external: "External links",
  neighbors: "Neighbors ({n})",
  more: "… and {n} more",
  edge: "Relation",
  ncbi: "NCBI Taxonomy",
  chebi: "ChEBI page",
  visibleDegree: "Visible degree: {n}",

  // Exports
  export: "Export",
  exportTitle: "Export graph as…",
  exportPNG: "PNG image",
  exportSVG: "SVG vector",
  exportJSON: "JSON (visible)",
  exportTSV: "TSV (visible)",

  // Status / messages
  bigGraph:
    "Large graph ({N} nodes): exploration mode started, showing the {n} highest-degree nodes. " +
    "Use search or double-click to expand neighborhoods.",
  confirmAll: "Showing all {N} nodes may be slow. Continue?",
  confirmExpansion:
    "This expansion would add {n} nodes (cap is {cap}). Show only the highest-degree ones?",
  notFound: "No result found.",
  emptyGraph: "No nodes currently displayed.",
  emptyData: "No data to display.",
  loadError: "Failed to load graph data.",
  removed: "Node(s) removed.",
  nothingRemoved: "Select at least one node to remove.",

  // About / dependencies
  dependenciesTitle: "About / Dependencies",
  close: "Close",
  appProject: "Project",
  appWorkPackage: "Work package",
  appObjective: "Objective",
  appGithub: "GitHub repo",
  depNote: "Versions and licences of the embedded libraries (consistent with VENDOR.md).",
  genTitle: "AI-assisted generation",
  genIntro:
    "This website was generated from SPECIFICATIONS.md using an AI assistant.",
  genAssistant: "Assistant",
  genModel: "Model",
  genDate: "Generation date",
  genVersion: "Project version",
  noGenInfo: "Generation metadata not provided.",
  footerTrace: "Site developed with the help of {assistant}, model {model}, on {date}.",
  specifications: "SPECIFICATIONS.md",
  readme: "README.md"
};
