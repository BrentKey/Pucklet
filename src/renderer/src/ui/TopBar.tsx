import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { commands, setTool } from '../app/commands'
import { fitView, setZoom, zoomAt } from '../canvas/view'
import { platform } from '../platform'
import type { Tool, ViewFilter } from '../state/editor'
import { useDirty, useEditor } from '../state/editor'
import { IconButton } from './controls'
import { Icon } from './icons'

const TOOLS: { tool: Tool; label: string; key: string; icon: () => ReactElement }[] = [
  { tool: 'select', label: 'Select', key: 'V', icon: Icon.select },
  { tool: 'hand', label: 'Pan', key: 'H or hold Space', icon: Icon.hand },
  { tool: 'rect', label: 'Rectangle', key: 'R', icon: Icon.rect },
  { tool: 'ellipse', label: 'Ellipse', key: 'O', icon: Icon.ellipse },
  { tool: 'text', label: 'Text', key: 'T', icon: Icon.text },
  { tool: 'line', label: 'Line', key: 'L', icon: Icon.line },
  { tool: 'arrow', label: 'Arrow / connector', key: 'A', icon: Icon.arrow }
]

const FILTERS: { value: ViewFilter; label: string }[] = [
  { value: 'none', label: 'Normal colours' },
  { value: 'grayscale', label: 'Grayscale preview' },
  { value: 'deuteranopia', label: 'Deuteranopia (red–green)' },
  { value: 'protanopia', label: 'Protanopia (red–green)' },
  { value: 'tritanopia', label: 'Tritanopia (blue–yellow)' }
]

function FileMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])
  const mod = navigator.platform.includes('Mac') ? '⌘' : 'Ctrl+'
  const item = (label: string, id: string, shortcut?: string) => (
    <button
      onClick={() => {
        setOpen(false)
        commands[id]()
      }}
    >
      <span>{label}</span>
      {shortcut && <kbd>{shortcut}</kbd>}
    </button>
  )
  return (
    <div className="menu" ref={ref}>
      <IconButton title="File" onClick={() => setOpen(!open)} active={open}>
        <Icon.menu />
      </IconButton>
      {open && (
        <div className="menu-pop">
          {item('New figure', 'file.new', `${mod}N`)}
          {item('Open…', 'file.open', `${mod}O`)}
          {item(platform.kind === 'web' ? 'Download (.biofig)' : 'Save', 'file.save', `${mod}S`)}
          {platform.kind === 'electron' && item('Save as…', 'file.saveAs', `${mod}⇧S`)}
          <hr />
          {item('Import image or SVG…', 'file.import', `${mod}⇧I`)}
          {item('Export…', 'file.export', `${mod}E`)}
        </div>
      )}
    </div>
  )
}

export function TopBar() {
  const tool = useEditor((s) => s.tool)
  const fileName = useEditor((s) => s.fileName)
  const zoom = useEditor((s) => s.view.zoom)
  const filter = useEditor((s) => s.filter)
  const lineStyle = useEditor((s) => s.lineStyle)
  const dirty = useDirty()

  useEffect(() => {
    platform.setTitle(`${dirty ? '• ' : ''}${fileName.replace(/\.biofig$/, '')} — BioFig`)
  }, [dirty, fileName])

  return (
    <div className="topbar">
      <div className="topbar-left">
        <FileMenu />
        <div className="file-name" title={fileName}>
          {fileName.replace(/\.biofig$/, '')}
          {dirty && <span className="dirty-dot" title="Unsaved changes" />}
        </div>
      </div>

      <div className="toolbar">
        {TOOLS.map((t) => (
          <IconButton key={t.tool} title={`${t.label} (${t.key})`} active={tool === t.tool} onClick={() => setTool(t.tool)}>
            <t.icon />
          </IconButton>
        ))}
        <span className="toolbar-sep" />
        <select
          className="mini-select"
          title="Connector style for new arrows"
          value={lineStyle.route}
          onChange={(e) => useEditor.getState().set({ lineStyle: { ...lineStyle, route: e.target.value as never } })}
        >
          <option value="straight">Straight</option>
          <option value="curved">Curved</option>
          <option value="elbow">Elbow</option>
        </select>
        <span className="toolbar-sep" />
        <IconButton title="Undo (⌘Z)" onClick={commands['edit.undo']}>
          <Icon.undo />
        </IconButton>
        <IconButton title="Redo (⇧⌘Z)" onClick={commands['edit.redo']}>
          <Icon.redo />
        </IconButton>
      </div>

      <div className="topbar-right">
        <select className="mini-select" value={filter} title="Accessibility preview" onChange={(e) => useEditor.getState().set({ filter: e.target.value as ViewFilter })}>
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <div className="zoom">
          <IconButton title="Zoom out" onClick={() => zoomAt(0.8)}>
            <Icon.minus />
          </IconButton>
          <button className="zoom-label" title="Zoom to fit (⌘0) · double-click for 100%" onClick={fitView} onDoubleClick={() => setZoom(1)}>
            {Math.round(zoom * 100)}%
          </button>
          <IconButton title="Zoom in" onClick={() => zoomAt(1.25)}>
            <Icon.plus />
          </IconButton>
        </div>
        <button className="primary" onClick={commands['file.export']}>
          <Icon.download /> Export
        </button>
      </div>
    </div>
  )
}
