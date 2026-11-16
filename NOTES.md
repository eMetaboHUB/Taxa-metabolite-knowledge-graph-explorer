# NOTES — État et historique du projet

> Fichier de passation : résume l'état actuel, les fichiers modifiés et les points
> ouverts, pour reprendre le travail dans une nouvelle session sans historique de
> conversation.

## Projet

Générateur de site statique Cytoscape.js (`build_site.py`) qui transforme un TSV de
relations taxons ↔ molécules ChEBI en un site interactif autonome (sans backend ni CDN).
La spécification de référence est `SPECIFICATIONS.md` ; le site est généré dans `dist/`.

Commande de génération :
```bash
python3 build_site.py --input forumLotusWInferrence.enriched.tsv --output dist --config config.example.json --quiet
```

Jeu réel : 4171 lignes TSV (11 colonnes, CRLF) → 747 taxons / 432 molécules / 4168 arêtes,
max degré 98. 3 lignes avec `taxon_name` vide sont sautées avec avertissement.

## État actuel

Toutes les modifications sont **enregistrées sur le disque**. Le `dist/` a été régénéré
avec le fichier réel, la config par défaut et toutes les fonctionnalités ci-dessous.
Tests : `tests/test_build.py` → **14/14 OK**. `node --check assets/js/app.js` OK,
`python3 -m py_compile build_site.py` OK.

### Fonctionnalités / correctifs récents — documentés dans `SPECIFICATIONS.md`
- **[V4]** Boutons **undo/redo retirés** (fonctionnalité d'annulation supprimée) : suppression
  des boutons du template, des handlers, du bloc historique et des chaînes i18n.
- **[V4]** `--max-initial-nodes` défaut relevé **150 → 500** ; plafond d'affichage du mode
  exploration aligné sur le seuil (auparavant plafonné à 300, ce qui bornait la visibilité).
- **Mode focus (double-clic)** : double-clic sur un nœud → sous-graphe ciblé (nœud +
  voisinage, profondeur 1/2 selon le sélecteur « Neighborhood »). Retour au graphe
  précédent via un bouton « ✕ » **flottant dans la fenêtre du graphe** (coin sup. gauche).
  Pile de niveaux imbriqués ; positions, zoom et pan du graphe précédent restaurés.
  **[V4]** Le sous-graphe focus est disposé avec le **layout sélectionné** (fcose par
  défaut) ; le layout radial `focusLayout`/`focusGap` a été retiré.
  - **Important** : le double-clic est détecté **manuellement** (deux `tap` sur le même
    nœud < 320 ms) car l'événement natif Cytoscape `dbltap` ne se déclenche pas de façon
    fiable. Ne pas revenir à `dbltap`.
- Bannière d'exploration **fermable** (bouton « × »).
- Survol d'un nœud : atténuation des nœuds **et arêtes** hors contexte.
- Taille des nœuds : bornes **10–26 px** (échelle `sqrt(degré)`), `nodeSize` configurable.
- `--max-initial-nodes` défaut abaissé **2000 → 150** puis relevé à **500 [V4]**
  (mode exploration sur grands graphes ; plafond d'affichage aligné sur le seuil).
- `wheelSensitivity: 0.5` (zoom molette fluide ; avertissement console Cytoscape attendu,
  choix délibéré).
- Spinner : `#spinner[hidden]{display:none}` (fix du `display:flex` qui écrasait `hidden`).

### Features antérieures (déjà présentes, inchangées)
- Génération déterministe, `--single-file`, `--config`, `--strict` (lignes TSV invalides
  sautées avec avertissement par défaut, fatales seulement en `--strict`).
- Recherche, filtres (taxon/molécule/relation/degré), « Expand to neighborhood », « Show all »,
  exports PNG/SVG/JSON/TSV, thème clair/sombre, panneau détails,
  légende, traces de génération IA (footer + dialogue À propos).

## Points ouverts / décisions en suspens
- **Grab dynamique (voisinage attiré pendant le glissement) : ABANDONNÉ** à la demande de
  l'utilisateur (« c'est pire » : il créait des nœuds). Le code actuel ne tire que les
  voisins déjà affichés (boucle `requestAnimationFrame`) et **ne crée aucun nœud** ;
  l'utilisateur a préféré laisser tomber. Ne pas relancer sans accord explicite.
- **Persistance de l'historique de navigation** du site (ex. dernier graphe via
  `localStorage`) : proposé, non demandé. Option en attente.
- **Dossiers d'anciennes versions** (`OLD/`, `dist_fixed*`, `dist_spec*`) toujours présents ;
  suppression jamais confirmée par l'utilisateur. À demander avant d'effacer.
- ~~`focusGap` configurable~~ : **obsolète [V4]** — le layout radial a été retiré, le sous-graphe
  focus utilise désormais le layout sélectionné. La profondeur de focus (1 vs 2 sauts) reste
  à valider visuellement.
- CSP : en mode multi-fichiers `style-src 'unsafe-inline'` (obligatoire pour Cytoscape),
  `script-src 'self'` strict ; en `--single-file`, `'unsafe-inline'` pour script et style.

## Fichiers principaux
- `build_site.py` — générateur (parse TSV, dedup, config, single/multi-fichier, CSP).
- `index_template.html` — template avec jetons `__SITE_*__`.
- `assets/js/app.js` — toute la logique UI/graphe (focus, double-clic, hover, exports…).
- `assets/js/i18n.js` — chaînes anglaises.
- `assets/css/style.css` — styles (dont `#b-focus` flottant).
- `assets/vendor/` — Cytoscape.js 3.32.1 + fcose, layout-base, cose-base (embarqués).
- `config.example.json`, `example.tsv`, `README.md`, `VENDOR.md` (SHA-256 réels), `LICENSE`.
- `tests/test_build.py` — 14 tests unitaires.
- `dist/` — site généré (le plus récent).

## Rappels des pièges récurrents (précieux en cas de reprise)
- Ne pas appeler `$("#id")` : `$()` = `getElementById`, passage sans `#`.
- `el()` helper : enfants variadiques (élément, chaîne ou tableau) — jamais de simple tableau.
- Toute classe de style `display:flex` écrasant `hidden` doit être doublée d'une règle
  `X[hidden]{display:none}` (spinner, modal, b-focus).
- Le générateur utilise `str.replace` sur les jetons `__SITE_*__`, PAS `string.Template`.
- Garder les tests (14/14) et `node --check` à jour après chaque modif ; régénérer `dist/`.

## Comment vérifier après reprise
```bash
node --check assets/js/app.js
python3 -m py_compile build_site.py
python3 -m unittest discover -s tests
# puis régénérer :
rm -rf dist && python3 build_site.py --input forumLotusWInferrence.enriched.tsv --output dist --config config.example.json --quiet
```
