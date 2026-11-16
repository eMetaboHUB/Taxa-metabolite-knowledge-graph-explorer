# Spécifications : générateur de site statique Cytoscape.js (taxons ↔ molécules ChEBI)

> Versions : v2 corrigée et complétée ; les ajouts/mofications majeurs depuis la v1 sont marqués **[V2]**, puis **[V3]**, **[V4]** et **[V5]** (dernière modification).

## 1. Objectif

Produire un **générateur** (script en ligne de commande) qui lit un fichier TSV de relations taxon ↔ molécule chimique et génère un **site web statique** autonome, sans backend, qui affiche ces relations sous forme de graphe interactif avec Cytoscape.js. Le site doit pouvoir être déployé tel quel sur GitHub Pages, GitLab Pages ou n'importe quel serveur de fichiers statiques, **et s'ouvrir par double-clic sur `index.html` (protocole `file://`)**.

## 2. Entrée : fichier TSV

### 2.1 Format

Séparateur tabulation, encodage UTF-8 (BOM toléré), fins de ligne LF ou CRLF, première ligne = en-tête.

| Colonne | Type | Obligatoire | Description |
|---|---|---|---|
| `taxon_id` | entier > 0 | oui | Identifiant NCBI Taxonomy |
| `taxon_name` | texte | oui | Nom du taxon |
| `taxon_description` | texte | non | Description du taxon |
| `relation` | texte | oui | Type de relation (ex. `skos:related`) |
| `chebi_id` | entier > 0 | oui | Identifiant ChEBI (sans préfixe) |
| `chebi_name` | texte | oui | Nom de la molécule |
| `chebi_description` | texte | non | Description de la molécule |
| `taxon_uri` | URI http(s) | non | URI du taxon (NCBITaxon OBO) ; si absent, calculée : `http://purl.obolibrary.org/obo/NCBITaxon_<id>` |
| `chebi_uri` | URI http(s) | non | URI de la molécule (CHEBI OBO) ; si absente, calculée : `http://purl.obolibrary.org/obo/CHEBI_<id>` |
| `taxon_description_source` | texte | non | Provenance de la description du taxon |
| `chebi_description_source` | texte | non | Provenance de la description de la molécule |

Exemple (deux lignes de données, en-tête inclus) :

```tsv
taxon_id	taxon_name	taxon_description	relation	chebi_id	chebi_name	chebi_description	taxon_uri	chebi_uri	taxon_description_source	chebi_description_source
2	Bacteria	Bacteria is a domain taxon.	skos:related	15841	polypeptide	A peptide containing ten or more amino acid residues.	http://purl.obolibrary.org/obo/NCBITaxon_2	http://purl.obolibrary.org/obo/CHEBI_15841	generated_from_NCBI_lineage	ChEBI_OBO_file
2	Bacteria	Bacteria is a domain taxon.	skos:related	18085	glycosaminoglycan	Any polysaccharide containing a substantial proportion of aminomonosaccharide residues.	http://purl.obolibrary.org/obo/NCBITaxon_2	http://purl.obolibrary.org/obo/CHEBI_18085	generated_from_NCBI_lineage	ChEBI_OBO_file
```

### 2.2 Règles de lecture

- Une ligne = une arête (taxon, relation, molécule).
- Les informations d'un même taxon ou d'une même molécule sont **répétées** sur plusieurs lignes : le générateur **doit dédupliquer** les nœuds (clé : `taxon_id` pour les taxons, `chebi_id` pour les molécules).
- Si un même nœud a des valeurs incohérentes entre lignes (nom, description, URI), garder la première occurrence et émettre un avertissement (une seule fois par nœud et par champ).
- Les lignes invalides sont ignorées avec un avertissement (numéro de ligne), sans arrêter la génération. Est invalide une ligne : dont un champ obligatoire est vide, dont un identifiant n'est pas un entier strictement positif, ou dont le nombre de colonnes ne correspond pas à l'en-tête. Un rapport récapitulatif est affiché en fin de génération.
- **[V2]** Option `--strict` : toute ligne invalide provoque l'arrêt avec un code de sortie non nul. Sans cette option, code de sortie 0 si au moins une arête valide a été produite.
- **[V2]** Une URI qui n'utilise pas le schéma `http` ou `https` est rejetée (champ vidé, avertissement) : elle ne sera jamais rendue sous forme de lien.
- **[V2]** Lecture avec le module `csv` en mode **`quoting=csv.QUOTE_NONE`** : les guillemets présents dans les descriptions ne doivent pas être interprétés comme des délimiteurs. Espaces de début et de fin supprimés ; valeurs vides et `NA` / `null` traitées comme absentes.
- Les doublons exacts d'arêtes (même taxon, même relation, même molécule) sont fusionnés. **[V2]** Deux relations différentes entre les mêmes nœuds restent deux arêtes distinctes (affichées en courbes parallèles).
- Le fichier peut être volumineux (jusqu'à plusieurs centaines de milliers de lignes) : lecture en streaming.

## 3. Sortie : site statique

### 3.1 Arborescence

```
dist/
├── index.html
├── assets/
│   ├── css/style.css
│   ├── js/app.js
│   ├── js/config.js            (paramètres : configuration injectée par le générateur)
│   ├── js/i18n.js              (chaînes de l'interface)
│   ├── js/graph-data.js        (données : window.GRAPH_DATA = {...})
│   └── vendor/                 (Cytoscape.js et extensions, copiés localement)
└── data/
    └── graph.json              (mêmes données, pour réutilisation hors site)
```

Contraintes :

- **Aucune dépendance CDN à l'exécution** : toutes les bibliothèques JS sont embarquées dans `assets/vendor/` (site utilisable hors ligne). Les polices sont celles du système.
- Aucun framework de build côté site (JavaScript vanilla ES6+), pour garder le site lisible et pérenne.
- telecharge les dependances necessaires (cytoscape, etc...)
- Les chemins sont **relatifs** pour permettre un déploiement dans un sous-répertoire.
- **[V2]** Les données sont chargées via `<script src="assets/js/graph-data.js">` et non via `fetch()` : `fetch` sur `file://` est bloqué par les navigateurs, ce qui rendrait impossible le double-clic sur `index.html`. `data/graph.json` est fourni en complément pour les usages externes.
- **[V2]** Pas de modules ES (`type="module"`) : également bloqués sur `file://` dans certains navigateurs ; utiliser des scripts classiques.
- Option de génération d'un **fichier HTML unique** autonome (données et scripts inlinés) pour les petits jeux de données. **[V2]** Lors de l'inlining, échapper `</script>` et `<!--` dans le JSON.
- **[V2]** Politique de sécurité de contenu (`<meta http-equiv="Content-Security-Policy">`) restrictive : `default-src 'self'`, aucune connexion sortante (`connect-src 'none'`).
  - **[V3 — note d'implémentation]** Cytoscape.js positionne et stylise les éléments du graphe par **styles inline** (attributs `style` et éléments `<style>` injectés) : en mode multi-fichiers, la directive `style-src` doit donc inclure `'unsafe-inline'` pour que le graphe s'affiche. La directive critique `script-src` reste stricte (`'self'`) en mode multi-fichiers — c'est la frontière réelle contre l'injection XSS. En mode fichier unique, `'unsafe-inline'` s'applique au script comme au style (tout étant inliné dans la page).

### 3.2 Modèle de données Cytoscape

**Nœud taxon** :

```json
{ "data": {
    "id": "taxon:2", "type": "taxon", "label": "Bacteria",
    "ncbi_id": 2, "description": "...", "uri": "http://purl.obolibrary.org/obo/NCBITaxon_2",
    "description_source": "generated_from_NCBI_lineage", "degree": 2 } }
```

**Nœud molécule** :

```json
{ "data": {
    "id": "chebi:15841", "type": "molecule", "label": "polypeptide",
    "chebi_id": 15841, "description": "...", "uri": "http://purl.obolibrary.org/obo/CHEBI_15841",
    "description_source": "ChEBI_OBO_file", "degree": 1 } }
```

**Arête** :

```json
{ "data": {
    "id": "e:2-15841-skos:related", "source": "taxon:2", "target": "chebi:15841",
    "relation": "skos:related" } }
```

- Le générateur calcule pour chaque nœud un attribut `degree` (nombre d'arêtes distinctes). **[V2]** Le site recalcule un `visibleDegree` dynamique quand des filtres sont actifs ; le filtre « degré minimum » porte sur le degré **global** (précisé dans l'interface).
- **[V2]** Les relations de type `skos:related` sont symétriques : les arêtes sont affichées **sans flèche** par défaut. Un champ `directed` par relation (configurable) permet d'afficher des flèches pour d'autres relations.
- **[V2]** Format compact possible pour les gros jeux : tableaux de nœuds et d'arêtes séparés, convertis en éléments Cytoscape au chargement (réduit la taille du fichier et le temps de parsing).

## 4. Fonctionnalités du site

### 4.1 Graphe (Cytoscape.js)

- **Graphe biparti** : deux types de nœuds visuellement distincts, **par la forme et la couleur** (pas uniquement la couleur, pour le daltonisme).
  - Taxons : forme ronde, couleur A (ex. vert).
  - Molécules : carré arrondi, couleur B (ex. orange).
- **[V2]** Taille des nœuds proportionnelle à `sqrt(degré)` entre un minimum et un maximum configurables (par défaut 10 px – 26 px ; **[V3]** bornes réduites pour rester proportionnées sur les graphes réels à forte hétérogénéité de degré)). Voir aussi le critère d'acceptation sur le chevauchement.
- Étiquettes affichées sous les nœuds ; masquage automatique des étiquettes en dessous d'un certain niveau de zoom, pour la lisibilité. **[V2]** Les étiquettes du nœud survolé ou sélectionné sont toujours affichées.
- Couleur ou style d'arête par type de `relation` (légende générée dynamiquement à partir des relations présentes dans le TSV).
- Zoom, déplacement (pan), glisser-déposer des nœuds, sélection multiple.
  - **[V5 — nouvelle fonctionnalité]** **Zoom accéléré sous Ctrl/Cmd** : tenir la touche **Ctrl** (ou **Cmd ⌘** sur macOS) pendant un défilement de molette multiplie la sensibilité du zoom (~2× par défaut, configurable) pour parcourir rapidement les niveaux de zoom. Implémentation : mise à jour de `wheelSensitivity` en **phase de capture sur `document`** (avant le gestionnaire natif de Cytoscape, qui relit la sensibilité à chaque événement) ; la sensibilité revenant à sa valeur normale dès que Ctrl/Cmd est relâché.
  - **[V3 — nouvelle fonctionnalité]** **Grab dynamique** : pendant qu'on saisit et déplace un nœud, son **voisinage direct** suit le mouvement à 80 % et les voisins à **2 sauts** à 40 % (effet ressort/atténué). Cela permet d'extraire visuellement un nœud et son contexte d'un paquet dense pour l'inspecter. **[V3 préc.]** Implémenté par une boucle `requestAnimationFrame` démarrée au `grab` et stoppée au `free`/`dragfree` (indépendante de l'événement `drag`). Seuls les voisins **déjà affichés** sont tirés ; **aucun nœud n'est créé** par cette interaction.
- Survol d'un nœud : mise en évidence du nœud et de son voisinage immédiat, atténuation du reste. **[V3 — précision]** L'atténuation (opacité réduite) porte aussi sur les **arêtes** hors contexte, pas seulement sur les nœuds (les sélecteurs de classe `.faded`/`.greyout` sont appliqués après les styles d'arêtes pour primer sur leur opacité).
- **[V2]** Sélection d'un nœud : option « Masquer les nœuds non sélectionnés » dans le panneau de contrôle, avec le choix de **deux modes** : *invisibles* (**par défaut**) ou *grisés*. Les nœuds conservés visibles sont le nœud sélectionné **et son voisinage direct** (et leurs arêtes) ; tout le reste est masqué ou grisé. Le comportement est annulé en cliquant sur le fond du graphe ou sur « Réinitialiser ».

### 4.2 Mises en page (layouts)

Sélecteur de layout, avec au minimum :

- `fcose` (par défaut, force-directed performant) ;
- `cose`, `concentric`, `circle`, `grid` ;
- **[V2]** un layout **biparti** (obligatoire) : taxons sur une colonne, molécules sur une autre, positions calculées par le script (`preset`), tri par degré décroissant ou par nom.

**[V2]** Paramètres de `fcose` à définir pour éviter le chevauchement : `nodeDimensionsIncludeLabels: true`, `packComponents: true`, `nodeRepulsion` et `idealEdgeLength` adaptés à la taille des nœuds, `quality: "default"` (ou `"draft"` au-delà du seuil de performance).

Bouton « Relancer le layout » et bouton « Ajuster à la vue » (fit).

### 4.3 Panneau de détails

Au clic sur un nœud, panneau latéral affichant :

- le nom, le type, l'identifiant ;
- la description et sa **source** ;
- l'URI cliquable (ouverture dans un nouvel onglet, `rel="noopener noreferrer"`) ;
- la liste des nœuds voisins (cliquables pour recentrer et sélectionner ; **[V2]** paginée ou limitée à 100 avec « Voir plus » pour les nœuds à fort degré) ;
- liens externes calculés (**[V2]** gabarits d'URL configurables dans un fichier de configuration, car les URL des sites externes évoluent) :
  - NCBI Taxonomy : `https://www.ncbi.nlm.nih.gov/Taxonomy/Browser/wwwtax.cgi?id=<id>` ;
  - ChEBI : `https://www.ebi.ac.uk/chebi/searchId.do?chebiId=CHEBI:<id>` (**à vérifier** avant livraison : ChEBI a refondu son site, l'adresse actuelle de type `https://www.ebi.ac.uk/chebi/CHEBI:<id>` peut être préférable).

Au clic sur une arête : afficher source, cible et relation.

### 4.4 Recherche et filtres

- **Recherche textuelle** (autocomplétion) sur nom et identifiant, avec centrage et sélection du nœud trouvé. **[V2]** La recherche porte sur **l'ensemble des données** (index en mémoire), y compris les nœuds non affichés en mode exploration ; trouver un nœud non affiché l'ajoute au graphe. Recherche insensible à la casse et aux accents, avec un anti-rebond (≈ 200 ms) et un maximum de 20 suggestions.
- **Filtres** :
  - afficher/masquer les taxons, les molécules ;
  - filtre par type de relation ;
  - filtre par degré minimum.
- Action « Étendre au voisinage » (bouton) : mode d'exploration progressive où l'on part d'un nœud choisi et affiche ses voisins à 1 ou 2 sauts. Mode utile pour les gros graphes. **[V2]** Si l'expansion dépasserait un plafond (ex. 500 nœuds ajoutés), demander confirmation ou ne garder que les voisins de plus haut degré.
- **[V3 — nouvelle fonctionnalité]** **Double-clic sur un nœud = sous-graphe ciblé (mode focus)** : le double-clic remplace la vue par un **nouveau graphe** composé du nœud et de son voisinage (profondeur 1 ou 2 selon le sélecteur « Neighborhood »). Un bouton « ✕ » en barre d'outils permet de **revenir au graphe précédent** (une pile gère les niveaux imbriqués ; les positions du graphe de départ sont restaurées). **[V4]** Le sous-graphe est disposé avec le **layout sélectionné dans la barre d'outils** (fcose par défaut), comme n'importe quel graphe : le sélecteur de layout s'applique donc aussi en mode focus. *(Version antérieure : layout radial déterministe `focusLayout` basé sur `focusGap`, désormais retiré.)*
- Bouton « Tout afficher » / « Réinitialiser ».
- **[V2]** Bouton « Retirer du graphe » pour masquer un nœud ou une sélection. **[V4]** Les boutons undo/redo ont été retirés (la fonctionnalité d'annulation a été supprimée).

### 4.5 Exports

- **[V5]** Un **bouton unique « Export »** dans la barre d'outils ouvre une **modal de choix de format** ; l'utilisateur sélectionne le format désiré dans une liste de quatre options :
  - **PNG** (via `cy.png()`, fond blanc, option d'échelle `scale` — ici ×2) ;
  - **SVG** (extension `cytoscape-svg`, dégradation gracieuse si absente : message d'information) ;
  - **JSON** du sous-graphe visible (nœuds et arêtes non masqués) ;
  - **TSV** du sous-graphe visible (même format que l'entrée, réimportable).
- La modal réutilise la boîte de dialogue commune du site (titre dynamique, fermeture par « ✕ », clic à l'extérieur ou `Esc`) ; les options sont des boutons navigables au clavier. Les exports **PNG** et **JSON** restent les deux formats garantis (critère d'acceptation n°8).

### 4.6 Performance et retours visuels

- Graphe de petite taille (< 2 000 nœuds) : affichage complet au chargement.
- Graphe plus grand : démarrage en **mode exploration** (par exemple, uniquement les nœuds de plus haut degré ou un nœud choisi), avec un message d'information et un seuil configurable (`--max-initial-nodes`).
  - **[V3 — note d'implémentation]** Par défaut le seuil est de **150** nœuds (initialement 2000). **[V4]** Le seuil par défaut est désormais **500** nœuds et le plafond d'affichage en mode exploration lui est aligné (les 500 nœuds de plus haut degré) : au-delà, l'application démarre en mode exploration et n'affiche que les nœuds de plus haut degré (jusqu'au seuil), ce qui rend l'ouverture et le layout `fcose` réactifs sur de grands jeux de données. Le seuil reste ajustable ; le bouton « Show all » permet d'afficher tout le graphe (avec confirmation). **[V3]** Le message d'information est affiché dans une **bannière fermable** (bouton « × ») : informative à l'ouverture, elle peut être masquée par l'utilisateur.
- Utilisation du rendu canvas de Cytoscape, avec options de performance (`textureOnViewport`, `hideEdgesOnViewport`, `hideLabelsOnViewport`) activées au-delà d'un seuil.
- **[V2]** **Indicateur d'attente** (sablier / spinner) affiché pendant : le chargement initial, le calcul d'un layout, les recherches et les expansions longues. L'indicateur est affiché **avant** le calcul (laisser le navigateur peindre via `requestAnimationFrame` puis `setTimeout`), et masqué à la fin du layout (événement `layoutstop`). Le curseur passe en `wait` pendant l'opération.
- **[V2]** Budget de performance : chargement initial < 5 s pour 100 000 arêtes (index et données), interaction fluide (> 30 images/s au pan/zoom) avec 5 000 éléments affichés.

### 4.7 Interface

- Mise en page : barre d'outils en haut, graphe plein écran, panneau latéral rétractable, légende.
- Responsive (utilisable sur tablette, **[V2]** gestes tactiles : pincer pour zoomer, appui long pour étendre).
- Accessibilité de base : contrastes suffisants (WCAG AA), éléments de formulaire étiquetés, navigation clavier pour la recherche et les boutons, focus visible. **[V2]** Alternative textuelle au graphe : liste des résultats de recherche et du voisinage consultable au clavier et par lecteur d'écran.
- Langue de l'interface : anglais.
- Thème clair ; thème sombre optionnel.
- **[V2]** Gestion des erreurs visibles : échec de chargement des données, graphe vide, aucun résultat de recherche.
- **[V2]** Navigateurs supportés : dernières versions de Firefox, Chrome, Edge, Safari.

## 5. Le générateur

### 5.1 Technologie

Au choix du générateur IA, mais à justifier. Recommandé : **Python 3.10+** avec **uniquement la bibliothèque standard** (`csv`, `json`, `argparse`, `pathlib`, `shutil`, `string.Template`) afin de n'avoir aucune dépendance à installer. **[V2]** (Jinja2 est écarté dans la version recommandée pour rester cohérent avec ce choix ; s'il est utilisé, il doit être listé dans `requirements.txt`.) Alternative acceptable : Node.js.

### 5.2 Interface en ligne de commande

```bash
python build_site.py --input forumLotusWInferrence.enriched.tsv --output dist/ \
    [--title "Taxons et molécules"] \
    [--single-file] \
    [--max-initial-nodes 500] \
    [--default-layout fcose] \
    [--strict] \
    [--config config.json] \
    [--quiet]
```

### 5.3 Comportement

1. Valider l'en-tête du TSV (colonnes obligatoires présentes, ordre indifférent, colonnes inconnues ignorées avec avertissement).
2. Construire les nœuds dédupliqués et les arêtes ; calculer les degrés.
3. Produire `graph.json` et `graph-data.js`.
4. Copier les ressources statiques et les bibliothèques vendorisées (hors ligne : **les bibliothèques sont fournies dans le dépôt du générateur**, le script ne télécharge rien).
5. Générer `index.html` avec les paramètres (titre, layout par défaut, seuils).
6. Afficher un résumé : nombre de taxons, de molécules, d'arêtes, de relations distinctes, de lignes ignorées, d'avertissements.

Le script doit être **idempotent** et **déterministe** (même entrée → même sortie octet pour octet : tri stable des éléments, aucun horodatage dans les fichiers générés, JSON sérialisé avec des clés triées). Le répertoire de sortie est vidé ou écrasé proprement sans toucher à d'autres fichiers hors de `dist/`.

### 5.4 Bibliothèques JS à embarquer (versions fixées)

- `cytoscape` (version stable récente)
- `cytoscape-fcose` (et ses dépendances `layout-base`, `cose-base`)
- **$[V5]** Export **SVG** via `cytoscape-svg` : **optionnel et non embarqué par défaut** — l'application détecte son absence (`window.cytoscapeSvg`) et affiche un message d'information au lieu de l'export. S'il doit être fourni, l'ajouter dans `assets/vendor/` et le déclarer en dépendance. `cytoscape-popper` (infobulles) : optionnel, non embarqué.

Les versions exactes sont notées dans un fichier `VENDOR.md` avec leurs licences (**[V2]** et les sommes de contrôle SHA-256 des fichiers).

## 6. Qualité et livrables

- Code commenté et structuré (séparation données / logique / présentation).
- `README.md` : installation, usage, format du TSV, déploiement (GitHub Pages), limites connues.
- Jeu de données d'exemple (`example.tsv`, ~20 lignes dont les deux lignes fournies) pour démonstration. **[V2]** Il inclut volontairement des cas limites : doublon d'arête, description incohérente, ligne invalide, caractères accentués, guillemets et balises HTML dans une description.
- Tests minimaux du générateur (`pytest` ou `unittest`) : lecture TSV, déduplication, gestion des lignes invalides, structure du JSON de sortie, déterminisme (deux exécutions identiques).
- Aucune requête réseau à l'exécution du site ; aucune donnée envoyée à l'extérieur.
- Sécurité : échapper tout contenu issu du TSV avant insertion dans le DOM (prévention des injections XSS dans les descriptions et noms) ; **[V2]** utiliser `textContent` plutôt que `innerHTML`, ne générer des liens que pour les URI `http(s)`.
- **[V2]** Licence du projet et mention des licences des données (ChEBI : CC BY 4.0 ; NCBI Taxonomy : domaine public selon conditions NCBI) dans le README et dans le pied de page du site.

## 7. Informations sur les dépendances et la génération

- **[V2]** Le site doit proposer une **fenêtre ouvrante** (modal, panneau dépliable ou boîte de dialogue accessible) permettant de consulter les **versions des dépendances** embarquées, notamment Cytoscape.js et ses extensions. Cette fenêtre doit être accessible depuis l’interface, par exemple via un lien « À propos » ou « Dépendances ».
- **[V2]** La fenêtre doit indiquer, pour chaque dépendance : son nom, sa version exacte, sa licence et, si pertinent, un lien vers son dépôt ou sa documentation.
- **[V2]** Les informations affichées doivent correspondre aux versions réellement embarquées dans `assets/vendor/` et être cohérentes avec `VENDOR.md`.
- **[V2]** Le générateur du site web a été produit avec l’aide d’une IA à partir des présentes spécifications, qui sont téléchargeables et mises à disposition avec le projet.
- **[V2]** Cette mention doit apparaître dans le `README.md`, dans la fenêtre « Dépendances / À propos » du site et, si approprié, dans le pied de page du site.
- **[V3] Traçabilité de la génération par IA** : le site généré doit afficher explicitement une mention indiquant qu'il a été développé avec l'aide d'une intelligence artificielle. Cette mention doit préciser, dans la mesure où ces informations sont disponibles :
  - le nom de l'IA ou de l'assistant utilisé (ex. : OpenAI ChatGPT) ;
  - le nom et la version exacte du modèle utilisé (ex. : GPT-6) ;
  - la date de génération ou de dernière mise à jour du code ;
  - éventuellement, un numéro de version ou un identifiant de génération du projet.

- **[V3]** Ces informations doivent être regroupées dans une rubrique « À propos / Génération par IA », accessible depuis l'interface du site, et figurer également dans le `README.md`. Une mention courte doit être présente dans le pied de page, par exemple : « Site développé avec l'aide de [nom de l'IA], modèle [modèle], le [date] ».

- **[V3]** Les métadonnées de génération doivent être centralisées dans un fichier de configuration ou de métadonnées afin d'éviter toute incohérence entre les différentes mentions. Les informations non disponibles ne doivent pas être inventées.

## 8. Critères d'acceptation

1. À partir d'un TSV valide, la commande produit un dossier `dist/` ouvrable directement (double-clic sur `index.html` ou via serveur statique).
2. Le graphe affiche taxons et molécules avec des styles distincts et les relations comme arêtes.
3. **[V2]** Le diamètre des nœuds est borné (min/max) et le layout par défaut ne fait **pas se recouvrir les nœuds** (étiquettes comprises) : aucun nœud n'en masque un autre à l'issue du layout `fcose` sur l'exemple et sur un échantillon de 2 000 nœuds.
4. Le clic sur un nœud affiche description, source et liens corrects.
5. La recherche, les filtres et le changement de layout fonctionnent.
6. Les nœuds ne sont pas dupliqués malgré la répétition des informations dans le TSV.
7. Un TSV de 100 000 lignes se génère sans erreur et le site reste utilisable (mode exploration).
8. Les exports PNG et JSON fonctionnent.
9. **[V2]** Un indicateur d'attente est visible pendant les opérations longues (layout, recherche, expansion).
10. **[V2]** À la sélection d'un nœud, les non-sélectionnés sont invisibles par défaut ; la case à cocher permet de les griser ou de désactiver le comportement.
11. **[V2]** Une description contenant `<script>alert(1)</script>` s'affiche en texte brut, sans exécution.

## 9. Extensions possibles (hors périmètre initial)

- Hiérarchie taxonomique (liens parent/enfant NCBI) et regroupement de nœuds (compound nodes) par rang.
- Hiérarchie ChEBI (`is_a`) entre molécules.
- Statistiques (top taxons/molécules par degré) dans un onglet dédié.
- Partage d'une vue par URL (hash encodant les filtres et la sélection).
- Rang taxonomique et synonymes dans le panneau de détails.
- Déploiement automatisé (GitHub Actions / GitLab CI) vers Pages.
- Interface en anglais.
