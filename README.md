# BioFig *(working title)*

An open-source desktop app for making clean scientific figures: drag in life-science icons, connect them with arrows that stay attached, label everything, and export real vector files you own.

It's a free alternative to BioRender. Research notes are in [research/biorender-research.md](research/biorender-research.md).

- **Your files, offline.** Figures are local `.biofig` files (an open, zipped JSON format). No account needed, no cloud.
- **True vector export.** SVG and PDF, plus PNG at any DPI up to 1200. No watermark, no licence fee.
- **Open icons with automatic credits.** Icons come from openly licensed libraries. Export builds the citation line for the icons you actually used.
- **Accessibility built in.** An Okabe–Ito colour-blind-safe palette, plus grayscale and colour-blindness previews.

## Getting started

Requires Node 22+.

```bash
npm install
npm run icons      # downloads and builds the Bioicons pack (~2,400 icons, CC0/CC BY/MIT/BSD)
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
| `BIOFIG_SMOKE_DIR=/some/dir npx electron .` | After `npm run build`: launches the app, saves a screenshot, a test PDF and a JSON report to that directory, then quits. |

## What works today

**Canvas**
- Pan (Space or H), and zoom at the cursor (pinch, ⌘-scroll, ⌘0 to fit)
- Artboard presets: journal column widths, graphical abstracts, slides, A4/Letter, posters

**Editing**
- Select, marquee-select and shift-select
- Move with smart guides
- Resize, keeping proportions for icons and text (Shift toggles)
- Rotate (Shift snaps to 15°)
- Nudge with the arrow keys
- Group, ungroup, and double-click a group to edit inside it
- Z-order, lock, duplicate, align and distribute
- Undo and redo

**Shapes**
- Rectangles and ellipses: fill, stroke, dash and corner radius

**Connectors**
- Straight, curved (drag the ◆ handle) or elbow routes
- They attach to shapes, text and icons, and follow them when moved. Hold ⌥ to place freely.
- End caps: arrow, open arrow, inhibition (⊣), dot, diamond

**Text**
- Rich text: bold, italic, underline, colour
- Superscript and subscript (⇧⌘= / ⌘=)
- A Greek letter and symbol palette
- Alignment and line height

**Icons**
- Search, filter by library and category, then drag or click to place
- Recolour per colour layer, flip, and "select all copies"

**Import**
- SVG, PNG, JPG, GIF and WebP, via dialog, drag-and-drop or paste

**Copy and paste**
- Copied objects go on the clipboard as SVG, so you can paste them into Inkscape, Illustrator or a text editor
- Pasting SVG markup or images from other apps works too

**Export**
- SVG, vector PDF (desktop app only), and PNG with a correct DPI tag
- Optional transparent background
- A copyable credit line for the figure legend

## Project layout

```
src/main/            Electron main process: window, menus, file dialogs, PDF export
src/preload/         The only bridge from the UI to Electron (contextIsolation + sandbox)
src/renderer/src/
  model/             Document model (Yjs), geometry, transforms, operations, .biofig format
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

`npm run icons` includes only CC0, MIT, BSD, CC BY 3.0 and CC BY 4.0 icons from [Bioicons](https://bioicons.com). Add `-- --include-sa` to also include CC BY-SA icons, which carry share-alike obligations. Each icon's author and licence travels with it into your `.biofig` file and the export credit line.

## Known gaps / next steps

- **Icon pack size.** The pack is ~170 MB unminified. Run SVGO on ingest and add more libraries: Servier, NIH BioArt, Reactome, PhyloPic.
- **Not built yet.** Membrane/DNA "brushes" (pattern along a path), templates, multi-panel layouts with A/B/C labels, PPTX export.
- **Not built yet.** Layers panel, and resize snapping.
- **Undo granularity.** The opacity slider records an undo step for every change.
- **Packaging.** Not yet done: signing/notarisation for macOS, an app icon, auto-update.

## Licence

[MPL-2.0](LICENSE). Anyone can use, embed or ship the app, including commercially. Changes to its source files must be shared back under the same licence.
