import { useLayoutEffect, useRef } from 'react'
import { withTextSize } from '../model/transform'
import type { TextObj } from '../model/types'
import { useEditor } from '../state/editor'
import { htmlToLines, linesToHtml, normalizeLines } from '../text/layout'

/**
 * In-place editor for a text object: a contentEditable overlay positioned over the text.
 * Formatting buttons in the properties panel act on its selection via execCommand.
 * Commits on blur / Escape / Cmd+Enter; an emptied text object is removed.
 */
export function TextEditor({ id }: { id: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const view = useEditor((s) => s.view)
  const doc = useEditor((s) => s.doc)
  const draft = useEditor((s) => s.drafts.get(id)) as TextObj | undefined
  const obj = (draft ?? doc.snapshot().get(id)) as TextObj | undefined
  const committed = useRef(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !obj) return
    el.innerHTML = linesToHtml(obj.lines)
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)
    // Run once per editing session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const commit = () => {
    if (committed.current || !ref.current) return
    committed.current = true
    const s = useEditor.getState()
    const isNew = !s.doc.snapshot().get(id)
    const current = (s.drafts.get(id) ?? s.doc.snapshot().get(id)) as TextObj | undefined
    const lines = normalizeLines(htmlToLines(ref.current))
    const empty = lines.every((l) => l.every((r) => !r.text.trim()))
    const drafts = new Map(s.drafts)
    drafts.delete(id)
    s.set({ editingText: null, drafts })
    if (!current) return
    if (empty) {
      if (!isNew) s.doc.transact((tx) => tx.remove(id))
      s.select([])
      return
    }
    const next = withTextSize({ ...current, lines })
    // Keep the anchor edge fixed as the text grows (left, center or right).
    if (!isNew) {
      if (current.align === 'center') next.x = current.x + (current.w - next.w) / 2
      if (current.align === 'right') next.x = current.x + current.w - next.w
    }
    s.doc.transact((tx) => tx.put(next))
    s.select([id])
  }

  if (!obj) return null
  const z = view.zoom
  const left = view.panX + obj.x * z
  const top = view.panY + obj.y * z
  return (
    <div
      ref={ref}
      className="text-editor"
      contentEditable
      suppressContentEditableWarning
      spellCheck
      onBlur={(e) => {
        // Clicks on formatting controls keep focus (they preventDefault on mousedown).
        if (e.relatedTarget && (e.relatedTarget as Element).closest?.('[data-keep-text-focus]')) return
        commit()
      }}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
          e.preventDefault()
          commit()
        }
        const mod = e.metaKey || e.ctrlKey
        if (mod && ['b', 'i', 'u'].includes(e.key.toLowerCase())) {
          e.preventDefault()
          document.execCommand({ b: 'bold', i: 'italic', u: 'underline' }[e.key.toLowerCase()]!)
        }
        if (mod && (e.code === 'Equal' || e.key === '=' || e.key === '+')) {
          e.preventDefault()
          document.execCommand(e.shiftKey ? 'superscript' : 'subscript')
        }
      }}
      onPaste={(e) => {
        // Paste as plain text so foreign formatting doesn't leak in.
        e.preventDefault()
        document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
      }}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        left,
        top,
        minWidth: Math.max(8, obj.w * z),
        fontFamily: obj.fontFamily,
        fontSize: obj.fontSize * z,
        lineHeight: obj.lineHeight,
        color: obj.color,
        textAlign: obj.align,
        transform: obj.rotation ? `rotate(${obj.rotation}deg)` : undefined,
        transformOrigin: `${(obj.w * z) / 2}px ${(obj.h * z) / 2}px`
      }}
    />
  )
}
