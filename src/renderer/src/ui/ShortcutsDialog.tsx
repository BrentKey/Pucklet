import { useEditor } from '../state/editor'

const mac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac')
const M = mac ? '⌘' : 'Ctrl+'
const A = mac ? '⌥' : 'Alt+'
const S = mac ? '⇧' : 'Shift+'

const GROUPS: [string, [string, string][]][] = [
  [
    'Tools',
    [
      ['Select', 'V'],
      ['Pan (or hold Space)', 'H'],
      ['Rectangle / Ellipse', 'R / O'],
      ['Text (drag for a wrapping box)', 'T'],
      ['Line / Arrow', 'L / A'],
      ['Brush (membranes, DNA…)', 'B'],
      ['Cancel / leave group or crop', 'Esc']
    ]
  ],
  [
    'Edit',
    [
      ['Undo / Redo', `${M}Z / ${S}${M}Z`],
      ['Copy / Cut / Paste', `${M}C / ${M}X / ${M}V`],
      ['Duplicate', `${M}D`],
      ['Duplicate while dragging', `${A}drag`],
      ['Select all', `${M}A`],
      ['Delete', '⌫'],
      ['Nudge (×10 with Shift)', '← ↑ → ↓']
    ]
  ],
  [
    'Arrange',
    [
      ['Group / Ungroup', `${M}G / ${S}${M}G`],
      ['Bring forward / to front', `${M}] / ${S}${M}]`],
      ['Send backward / to back', `${M}[ / ${S}${M}[`],
      ['Lock / Unlock', `${M}L`]
    ]
  ],
  [
    'Text',
    [
      ['Edit text / enter group', 'Double-click'],
      ['Bold / Italic / Underline', `${M}B / ${M}I / ${M}U`],
      ['Superscript / Subscript', `${S}${M}= / ${M}=`],
      ['Finish editing', `Esc or ${M}Enter`]
    ]
  ],
  [
    'Drawing',
    [
      ['Constrain angle / proportions', 'Shift'],
      ['Turn snapping off', `hold ${M}`],
      ['Place arrow end without attaching', `hold ${A}`],
      ['Crop an icon or image', 'Double-click it']
    ]
  ],
  [
    'View',
    [
      ['Zoom in / out', `${M}= / ${M}-`],
      ['Zoom to fit / 100%', `${M}0 / ${M}1`],
      ['Rulers', `${S}R`],
      ['Grid', `${M}'`],
      ['Grayscale preview', `${A}G`],
      ['This list', '?']
    ]
  ]
]

export function ShortcutsDialog() {
  const close = () => useEditor.getState().set({ shortcutsOpen: false })
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal wide-modal" role="dialog" aria-label="Keyboard shortcuts" tabIndex={-1} onKeyDown={(e) => e.key === 'Escape' && close()}>
        <h2>Keyboard shortcuts</h2>
        <div className="shortcut-grid">
          {GROUPS.map(([title, rows]) => (
            <section key={title}>
              <h3>{title}</h3>
              {rows.map(([label, keys]) => (
                <div key={label} className="shortcut-row">
                  <span>{label}</span>
                  <kbd>{keys}</kbd>
                </div>
              ))}
            </section>
          ))}
        </div>
        <div className="modal-actions">
          <button className="primary" onClick={close} autoFocus>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
