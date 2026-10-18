# Pucklet vs BioRender: feature comparison and next steps

*Updated 2026-10-18. Sources: BioRender's public help centre (all 336 articles, see `biorender-research.md`), its public icon library pages, and Pucklet as of this date. "✅" = Pucklet has it, "◐" = partial, "—" = missing.*

## 1. Where things stand

### Icons and assets

| BioRender | Pucklet | Notes |
|---|---|---|
| ~50,000 curated icons, one house style | ◐ ~11,300 open icons, mixed styles | See §3 for growing the library legally. |
| Category tree (13 categories, ~90 subcategories) | ✅ 12 categories, ~70 subcategories, recently used | Sorted by keyword rules across 10 libraries. |
| Keyword search; AI "Smart Search" | ◐ Keyword search, best matches first | Synonym list (e.g. "RBC" → erythrocyte) would close much of the gap. |
| Recolour icons by layer | ✅ | |
| "Editable" icons (move sub-parts) | — | Could add "Break apart icon into shapes". |
| Replace icon (swap, keep position/size) | — | Small feature, high value. |
| Favourites | ◐ Recently used only | |
| Upload PNG/JPG/SVG | ✅ | Plus paste and drag-and-drop. |
| PDB 3D protein builder | — | Mol* (MIT) can render PDB entries; output would be CC0. |
| ChemRender (SMILES → 2D structure) | — | RDKit.js (BSD) or OpenChemLib (BSD) render SMILES to SVG. |
| Custom icon requests (paid) | — | Community submissions instead (§3). |

### Canvas and editing

| BioRender | Pucklet | Notes |
|---|---|---|
| Shapes, connectors (snap & follow), arrowheads | ✅ | Plus inhibition (⊣) ends, labels on arrows, curved/elbow routes. |
| Brushes (membranes, DNA, vessels) | ✅ | Recolourable (BioRender's aren't); also beads and any icon along a path. |
| Custom pen / freehand vector path | — | Brush tool exists; a Bézier pen tool for shapes is missing. |
| Text: rich, sub/superscript, symbols, lists, links | ◐ | No bulleted lists, hyperlinks or **curved text**. |
| Tables | ✅ | Type in cells on the canvas; import from CSV/Excel. |
| Crop (rect, circle, blob, polygon) | ◐ rect / rounded / circle | |
| Eyedropper | — | |
| Grayscale preview | ✅ | Plus three colour-blindness simulations. |
| Align, distribute, guides, rulers, grid, snapping, lock, groups | ✅ | |
| Layers panel | ✅ | BioRender doesn't have one. |
| Gradient fills | ✅ | |
| Multi-panel figures | ✅ | A/B/C labels with re-lettering. |
| Slides + Present mode | ◐ Pages | No full-screen presentation mode. |
| Poster Builder (auto-reflowing blocks) | — | Poster canvas presets exist; no auto layout. |
| Smart protocol templates | ✅ | Protocol and timeline builders. |
| Template gallery (in-house + community) | ◐ | Seven built-ins and saved templates; no shared/community gallery. |

### Graphs

| BioRender | Pucklet | Notes |
|---|---|---|
| Bar, box, violin, scatter/line, grouped | ✅ | Plus dot plot, mean ± error line, histogram, stacked bars. |
| Pie | ✅ | Plus donut. |
| Heatmap, well-plate heatmap | ✅ | 6- to 384-well plates; grid or "A1, value" lists. |
| Survival (Kaplan–Meier) | ✅ | With censoring ticks. |
| Volcano | ✅ | BioRender lists it as planned. |
| Forest plot | — | BioRender lists it as planned too. |
| **Statistics:** t-tests, ANOVA, non-parametric, assumption checks | — | **Biggest graph gap.** Would include significance brackets (*, **, ns) drawn on the chart. |
| Dose-response (IC50), regression families, standard curves | ◐ Linear fit + R² only | 4-parameter logistic fit is a common need. |
| Prism file import | — | CSV / Excel / paste work. |
| Data transforms (log, % of control, normalise) | ◐ Log axis only | |
| Graph grid / style match across graphs | — | |

### Collaboration, AI, export

| BioRender | Pucklet | Notes |
|---|---|---|
| Real-time co-editing, comments, sharing | — | The document model (Yjs) is built for this; it needs a sync server. |
| Version history | — | Could store snapshots inside the `.pucklet` file. |
| AI: text-to-figure, protocol generation, icon restyle | — | Optional; see `icon-sourcing.md` for journal policies. |
| Export PNG/JPG/PDF/PPTX | ✅ | **Plus SVG** (BioRender has none) and no watermark or licence fee. |
| TIFF export | — | Many journals still ask for TIFF. |
| PowerPoint add-in with linked figures | — | |
| Works offline, local files, open format | ✅ | BioRender is cloud-only. |

## 2. Suggested next steps (most value first)

1. **Statistics on charts:** t-test, Mann–Whitney, one-way ANOVA with post-hoc tests, and significance brackets drawn automatically. Biologists need this constantly, and it's BioRender Graph's main selling point.
2. **Small editing wins:**
   - Replace icon
   - Favourites
   - Eyedropper
   - TIFF export
   - Present mode
   - Bulleted lists in text
   - Curved text
3. **Chemistry and structures:** SMILES → 2D structure (RDKit.js) and PDB → protein image (Mol*). Both create new CC0 artwork from public data.
4. **Pen tool** for custom shapes, and **"break apart icon"** for editing parts of an icon.
5. **Dose-response fitting** (4-parameter logistic, IC50/EC50) and a forest plot.
6. **Version history** inside the file.
7. Later: collaboration (sync server), a community template gallery, and optional AI help.

## 3. Growing the icon library legally

*This is practical guidance, not legal advice. For anything ambiguous, ask the licensor in writing.*

**Sources we can still add without asking anyone:**
- **TogoTV** (CC BY 4.0, ~1,500 SVGs). The script exists; it is just slow. Run `npm run icons:togotv` overnight.
- **OpenClipart** (public domain), filtered to science tags. The script exists but its search was slow; worth one more attempt.
- **Servier Medical Art** (CC BY 4.0, 3,000+). The PowerPoint kits contain vectors. Converting them to SVG needs LibreOffice (free) installed on the build machine.
- **Wikimedia Commons**: SVGs in science categories, filtered to CC0/PD/CC BY files through its API (licences vary file by file).
- **The full PhyloPic set**: about 12,000 more organism silhouettes (`npm run icons:phylopic -- --all`).

**Sources to ask for permission:**
- **BioDraws:** its author replied in the Reddit thread offering help. Ask whether they'd dual-license under CC BY 4.0 (not share-alike) so the icons can be in the default library.
- **NIAID NIH BioArt:** most entries are public domain, but only PNGs are online. Email NIAID and ask for the source vector files.
- **Individual scientists and illustrators** who post figures on GitHub, Zenodo or figshare: ask them to license under CC0 or CC BY. Many will say yes.

**Make new artwork that's yours to license:**
- **Generate icons from public-domain data:**
  - PubChem compounds → 2D structure SVGs (RDKit)
  - PDB proteins → ribbon renderings (Mol*)
  - UniProt/Reactome-style protein shapes
  - The data is public domain or CC0, so the generated images can be released as CC0. This could add thousands of molecule icons.
- **Community contributions:**
  - An in-app "Submit an icon" button, or a GitHub template, for a "Pucklet Community" library.
  - Contributors confirm they drew the icon themselves and license it CC0 or CC BY 4.0 (a simple contributor statement, like the DCO used by many open-source projects).
  - A short style guide (flat fills, limited palette, labelled layers) keeps quality consistent and icons recolourable.
- **Commissioned art:** pay illustrators for the most-searched missing concepts and release the results CC0. Possible funding: research-software grants (e.g. CZI Essential Open Source Software), sponsorships, or a bounty list.
- **Teaching partnerships:** medical-illustration programmes often look for real-world portfolio projects. Students' contributions are credited and released CC BY.
- **AI-assisted icons,** with human review and clear labelling, and only with tools whose terms allow open release. See `icon-sourcing.md`, including journal policies (e.g. Springer Nature doesn't accept AI-generated illustrations).

**Avoid:**
- copying or tracing BioRender/Servier-style art from papers;
- anything licensed NC or ND;
- share-alike icons in the default set;
- scraping sites whose terms forbid it;
- shipping AI-generated icons without labelling them.
