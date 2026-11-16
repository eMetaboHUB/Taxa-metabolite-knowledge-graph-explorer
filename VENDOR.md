# Vendored JavaScript libraries

These libraries are packaged locally in `assets/vendor/` so the generated site
works offline and via double‑click on `index.html` (protocol `file://`). They
are read‑only at build time: `build_site.py` copies them, it never downloads.

| Library | Version | Licence | Loaded file | File (repo) | SHA‑256 |
|---|---|---|---|---|---|
| [Cytoscape.js](https://js.cytoscape.org) | 3.32.1 | MIT | `assets/vendor/cytoscape.min.js` | `cytoscape.min.js` | `4bd40d3d94234e2b3a7fbb35a9c51d626d3d60b31eb04d27b6cb6bca27aa6478` |
| [cytoscape-fcose](https://github.com/iVis-at-Bilkent/cytoscape.js-fcose) | 2.2.0 | MIT | `assets/vendor/cytoscape-fcose.min.js` | `cytoscape-fcose.min.js` | `4b1cab218d74996aa59cd8473f9239cc6398b8c1774d84d7e59ad9a68959cb57` |
| [layout-base](https://github.com/iVis-at-Bilkent/layout-base) | 2.0.1 | MIT | `assets/vendor/layout-base.js` | `layout-base.js` | `ec15ab5df9af3f20708f4faab994accf91cda71848cd5bb10a23432cc50b6745` |
| [cose-base](https://github.com/iVis-at-Bilkent/cose-base) | 2.2.0 | MIT | `assets/vendor/cose-base.js` | `cose-base.js` | `7cae9509bd36235a63a85e71c8d9fa2cd0bc1d0c1ecc5b5a737976f39d040ddf` |

Load order: `cytoscape.min.js`, `layout-base.js`, `cose-base.js`, `cytoscape-fcose.min.js`.

Version numbers match the files actually embedded here (see header of
`cytoscape.min.js`). `assets/vendor/cytoscape-fcose.js` is an identical
non‑minified copy of `cytoscape-fcose.min.js` kept for convenience.

The optional SVG export requires the separate `cytoscape-svg` extension, which
is **not** bundled (see `README.md`).
