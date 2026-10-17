# Pucklet

An open-source desktop app for making clean scientific figures: drag in life-science icons, connect them with arrows that stay attached, label everything, and export real vector files you own.

It's a free alternative to BioRender. Research notes are in [research/biorender-research.md](research/biorender-research.md).

- **Your files, offline.** Figures are local `.pucklet` files (an open, zipped JSON format). No account needed, no cloud.
- **True vector export.** SVG and PDF, plus PNG at any DPI up to 1200. No watermark, no licence fee.
- **Open icons with automatic credits.** Icons come from openly licensed libraries. Export builds the citation line for the icons you actually used.
- **Accessibility built in.** An Okabe–Ito colour-blind-safe palette, plus grayscale and colour-blindness previews.

## Getting started

Requires Node 22+.

```bash
npm install
npm run icons      # downloads, optimizes (SVGO) and builds the Bioicons pack (~2,400 icons, CC0/CC BY/MIT/BSD; takes a few minutes)
npm run dev        # desktop app (Electron) with hot reload
```

Other scripts:

| Command | What it does |
|---|---|
| `npm run web` | Runs the same UI in a browser at http://localhost:5199. This is the starting point for a web version. |
| `npm test` | Runs unit tests for the document model, connectors, transforms and file format. |
| `npm run typecheck` | Type-checks main, preload and renderer. |
| `npm run build` / `npm start` | Production build, then runs it. |
| `npm run dist:mac` / `npm run dist:win` | Builds installers with electron-builder. |
| `PUCKLET_SMOKE_DIR=/some/dir npx electron .` | After `npm run build`: launches the app, saves a screenshot, a test PDF and a JSON report to that directory, then quits. |

## What works today

- **Canvas**: pan (Space/H), zoom at cursor (pinch, ⌘-scroll, ⌘0 fit), artboard presets (journal column widths, graphical abstracts, slides, A4/Letter, posters).
- **Editing**: select, marquee, shift-select, move with smart guides, resize (keeps proportions for icons/text; Shift toggles), rotate (Shift = 15°), nudge, group/ungroup (double-click to enter), z-order, lock, duplicate, align & distribute, undo/redo (slider and colour-picker drags count as one step).
- **Layers panel**: every object top-most first, with show/hide, lock, rename (double-click) and drag-to-reorder or drop into a group.
- **Shapes**: rectangles and ellipses with fill, stroke, dash and corner radius.
- **Connectors**: straight, curved (drag the ◆ handle) or elbow; attach to shapes/text/icons and follow them when moved (⌥ to place freely); arrow, open arrow, inhibition (⊣), dot and diamond ends.
- **Brushes (B)**: draw freehand and get a lipid bilayer, lipid monolayer, DNA double helix or bead filament along the path. Closing the loop makes a cell membrane. Reshape by dragging points, add points from the ○ midpoints, ⌥-click to delete; recolour heads/tails, strands and bases; "Make oval". Any icon can also be repeated along a path ("Repeat along a path").
- **Multi-panel figures**: one-click layouts (2, 3, 2×2, 3×2, large + small…) with panel letters in A / a / (a) / A. / a) style, plus "Re-letter panels" to renumber in reading order after you rearrange.
- **Text**: rich text with bold/italic/underline/colour, super/subscript (⇧⌘= / ⌘=), Greek & symbol palette, alignment and line height.
- **Icons**: searchable library, filter by library and category, drag or click to place, recolour per colour layer, flip, "select all copies".
- **Import**: SVG, PNG, JPG, GIF, WebP via dialog, drag-and-drop or paste.
- **Copy/paste**: copied objects go to the clipboard as SVG (paste into Inkscape/Illustrator/text editors); paste SVG markup or images from other apps.
- **Export**: SVG, vector PDF (desktop), PNG at 72–1200 dpi with a correct DPI tag, and **PowerPoint** (text, shapes and straight arrows stay editable; icons and brushes become 300 dpi pictures). Transparent background option and a copyable credit line; PPTX puts credits in the speaker notes.
- **Accessibility**: Okabe–Ito colour-blind-safe palette, grayscale and colour-blindness previews.

## Project layout

```
src/main/            Electron main process: window, menus, file dialogs, PDF export
src/preload/         The only bridge from the UI to Electron (contextIsolation + sandbox)
src/renderer/src/
  model/             Document model (Yjs), geometry, transforms, operations, .pucklet format
  render/Figure.tsx  The one renderer, used for both the canvas and export
  canvas/            Interaction: tools, selection handles, text editor, viewport
  assets/svg.ts      SVG sanitizing/normalizing (DOMPurify), recolouring, raster import
  library/           Icon packs: loading, placing, importing files
  export/            SVG/PNG export, PNG DPI tagging, credit lines
  platform/          Electron vs browser adapters (open/save/export/menus)
  ui/                Panels, toolbar, controls, export dialog
scripts/             Icon-pack builders
research/            BioRender feature, UX and community research
```

## Design notes

**The canvas is plain SVG in the DOM, not a bitmap canvas library.**
- Icons render exactly as drawn.
- Recolouring is an attribute swap.
- SVG export loses nothing.
- Every dependency is MIT/Apache-licensed. tldraw was ruled out because of its licence.

**The document is a Yjs CRDT.** That gives undo/redo today, and leaves room for real-time collaboration later. It uses:
- a flat object map with `parentId` for groups
- fractional-index z-order
- stable ids

**All OS access goes through `platform/`.** The renderer already runs unchanged in a browser (`npm run web`).

**Security.**
- Imported and loaded SVGs are re-sanitized: scripts, event handlers, `foreignObject` and external references are stripped.
- In production, the renderer is served from a custom `app://` scheme with a strict Content-Security-Policy.

## Icon licensing

`npm run icons` includes only CC0, MIT, BSD, CC BY 3.0 and CC BY 4.0 icons from [Bioicons](https://bioicons.com). Add `-- --include-sa` to also include CC BY-SA icons, which carry share-alike obligations. Each icon's author and licence travels with it into your `.pucklet` file and the export credit line.

## Known gaps / next steps

- **Icon pack size.** The pack is ~170 MB unminified. Run SVGO on ingest and add more libraries: Servier, NIH BioArt, Reactome, PhyloPic.
- **Not built yet.** Membrane/DNA "brushes" (pattern along a path), templates, multi-panel layouts with A/B/C labels, PPTX export.
- **Not built yet.** Layers panel, and resize snapping.
- **Undo granularity.** The opacity slider records an undo step for every change.
- **Packaging.** Not yet done: signing/notarisation for macOS, an app icon, auto-update.

## Licence

[MPL-2.0](LICENSE). Anyone can use, embed or ship the app, including commercially. Changes to its source files must be shared back under the same licence.
