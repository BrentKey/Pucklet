import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { NEUTRALS, SAFE_COLORS } from '../model/defaults'

export function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="panel-section">
      <header>
        <h3>{title}</h3>
        {actions}
      </header>
      {children}
    </section>
  )
}

export function Row({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="row">
      {label && <label className="row-label">{label}</label>}
      <div className="row-body">{children}</div>
    </div>
  )
}

/** Numeric input that commits on Enter/blur and supports arrow-key stepping. */
export function NumberField({
  value,
  onChange,
  step = 1,
  min,
  max,
  suffix,
  title,
  disabled,
  precision = 1
}: {
  value: number | null
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  suffix?: string
  title?: string
  disabled?: boolean
  precision?: number
}) {
  const fmt = (v: number | null) => (v === null ? '' : String(Math.round(v * 10 ** precision) / 10 ** precision))
  const [text, setText] = useState(fmt(value))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setText(fmt(value))
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v))
  const commit = (raw: string) => {
    const v = Number(raw)
    if (raw.trim() !== '' && Number.isFinite(v)) onChange(clamp(v))
    else setText(fmt(value))
  }
  return (
    <span className={`num-field${disabled ? ' disabled' : ''}`} title={title}>
      {title && <span className="num-prefix">{title}</span>}
      <input
        type="text"
        inputMode="decimal"
        value={value === null && !focused.current ? '—' : text}
        disabled={disabled}
        onFocus={(e) => {
          focused.current = true
          setText(fmt(value))
          requestAnimationFrame(() => e.target.select())
        }}
        onBlur={(e) => {
          focused.current = false
          commit(e.target.value)
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') {
            setText(fmt(value))
            ;(e.target as HTMLInputElement).blur()
          }
          if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && value !== null) {
            e.preventDefault()
            const v = clamp(value + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1))
            onChange(v)
            setText(fmt(v))
          }
        }}
      />
      {suffix && <span className="num-suffix">{suffix}</span>}
    </span>
  )
}

export function ColorField({ value, onChange, allowNone, title }: { value: string; onChange: (c: string) => void; allowNone?: boolean; title?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])
  const isNone = value === 'none'
  return (
    <div className="color-field" ref={ref}>
      <button
        className={`swatch-btn${isNone ? ' none' : ''}`}
        style={{ background: isNone ? undefined : value }}
        title={title ?? value}
        onClick={() => setOpen(!open)}
        data-keep-text-focus
        onMouseDown={(e) => e.preventDefault()}
      />
      {open && (
        <div className="color-pop" data-keep-text-focus onMouseDown={(e) => e.target instanceof HTMLInputElement || e.preventDefault()}>
          <div className="color-pop-label">Colour-blind safe (Okabe–Ito)</div>
          <div className="swatches">
            {SAFE_COLORS.map((c) => (
              <button key={c} className="swatch" style={{ background: c }} title={c} onClick={() => onChange(c)} />
            ))}
          </div>
          <div className="swatches">
            {NEUTRALS.map((c) => (
              <button key={c} className="swatch" style={{ background: c }} title={c} onClick={() => onChange(c)} />
            ))}
            {allowNone && <button className="swatch none" title="None" onClick={() => onChange('none')} />}
          </div>
          <div className="color-custom">
            <input type="color" value={isNone ? '#ffffff' : value} onChange={(e) => onChange(e.target.value)} />
            <input
              className="hex"
              defaultValue={isNone ? '' : value}
              key={value}
              placeholder="#rrggbb"
              onKeyDown={(e) => {
                const v = (e.target as HTMLInputElement).value.trim()
                if (e.key === 'Enter' && /^#?[0-9a-f]{6}$/i.test(v)) onChange((v.startsWith('#') ? v : '#' + v).toLowerCase())
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange
}: {
  value: T | null
  options: { value: T; label: ReactNode; title?: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.value} className={value === o.value ? 'on' : ''} title={o.title} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function IconButton({
  title,
  onClick,
  children,
  active,
  disabled,
  keepTextFocus
}: {
  title: string
  onClick: () => void
  children: ReactNode
  active?: boolean
  disabled?: boolean
  keepTextFocus?: boolean
}) {
  return (
    <button
      className={`icon-btn${active ? ' on' : ''}`}
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      data-keep-text-focus={keepTextFocus ? '' : undefined}
      onMouseDown={keepTextFocus ? (e) => e.preventDefault() : undefined}
    >
      {children}
    </button>
  )
}
