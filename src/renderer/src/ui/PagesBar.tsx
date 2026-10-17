import { useState } from 'react'
import { useEditor } from '../state/editor'
import { Icon } from './icons'

const DRAG = 'application/x-pucklet-page'

/** Page tabs under the canvas: switch, add, rename (double-click), duplicate, delete, drag to reorder. */
export function PagesBar() {
  const pages = useEditor((s) => s.pages)
  const current = useEditor((s) => s.pageIndex)
  const { gotoPage, addPage, duplicatePage, deletePage, renamePage, movePage } = useEditor.getState()
  const [renaming, setRenaming] = useState<number | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)

  return (
    <div className="pages-bar">
      {pages.map((p, i) => (
        <div
          key={p.id}
          className={`page-tab${i === current ? ' on' : ''}${dropAt === i ? ' drop' : ''}`}
          draggable={renaming !== i}
          onDragStart={(e) => e.dataTransfer.setData(DRAG, String(i))}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(DRAG)) return
            e.preventDefault()
            setDropAt(i)
          }}
          onDragLeave={() => setDropAt(null)}
          onDrop={(e) => {
            setDropAt(null)
            const from = Number(e.dataTransfer.getData(DRAG))
            if (Number.isFinite(from)) movePage(from, i)
          }}
          onClick={() => i !== current && gotoPage(i)}
          onDoubleClick={() => setRenaming(i)}
          title="Double-click to rename · drag to reorder"
        >
          {renaming === i ? (
            <input
              autoFocus
              defaultValue={p.name}
              onBlur={(e) => {
                renamePage(i, e.target.value)
                setRenaming(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') setRenaming(null)
              }}
            />
          ) : (
            <span>{p.name}</span>
          )}
          {i === current && renaming !== i && (
            <span className="page-actions">
              <button title="Duplicate page" onClick={(e) => (e.stopPropagation(), duplicatePage(i))}>
                <Icon.duplicate />
              </button>
              {pages.length > 1 && (
                <button
                  title="Delete page"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (window.confirm(`Delete “${p.name}”? This can't be undone.`)) deletePage(i)
                  }}
                >
                  <Icon.trash />
                </button>
              )}
            </span>
          )}
        </div>
      ))}
      <button className="page-add" title="Add a page" onClick={addPage}>
        <Icon.plus /> Page
      </button>
    </div>
  )
}
