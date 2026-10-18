import { importImages } from '../app/commands'
import { placeAsset } from '../library/place'
import type { Asset } from '../model/types'
import { useEditor, useSnapshot } from '../state/editor'
import { Icon } from './icons'
import { IconLibrary } from './IconBrowser'
import { LayersPanel } from './LayersPanel'
import { TemplatesPanel } from './TemplatesPanel'

function Uploads() {
  const snap = useSnapshot()
  const uploads = [...snap.assets.values()].filter((a) => !a.source)
  return (
    <div className="uploads">
      <button className="wide" onClick={() => void importImages()}>
        <Icon.upload /> Import SVG or image…
      </button>
      <p className="muted pad">You can also drag files onto the canvas, or paste SVG/images from other apps.</p>
      <div className="icon-grid">
        {uploads.map((a: Asset) => (
          <button key={a.id} className="icon-tile" title={a.name} onClick={() => placeAsset(a)}>
            <img src={a.kind === 'svg' ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(a.data)}` : a.data} alt="" />
            <span>{a.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function LeftPanel() {
  const panel = useEditor((s) => s.leftPanel)
  const set = useEditor((s) => s.set)
  return (
    <aside className="left-panel">
      <div className="tabs">
        {(
          [
            ['library', 'Icons', <Icon.library key="i" />],
            ['templates', 'Templates', <Icon.template key="t" />],
            ['uploads', 'Uploads', <Icon.upload key="u" />],
            ['layers', 'Layers', <Icon.layers key="l" />]
          ] as const
        ).map(([id, label, icon]) => (
          <button key={id} className={panel === id ? 'on' : ''} onClick={() => set({ leftPanel: id })} title={label}>
            {icon}
            <span>{label}</span>
          </button>
        ))}
      </div>
      {panel === 'library' && <IconLibrary />}
      {panel === 'templates' && <TemplatesPanel />}
      {panel === 'uploads' && <Uploads />}
      {panel === 'layers' && <LayersPanel />}
    </aside>
  )
}
