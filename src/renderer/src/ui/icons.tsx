import type { ReactNode } from 'react'

// Small stroke icons for the editor chrome (drawn for this project, MPL-2.0 like the rest).

const I = ({ children, size = 18 }: { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
)

export const Icon = {
  select: () => (
    <I>
      <path d="M5 3l6 17 2.5-7.5L21 10z" />
    </I>
  ),
  hand: () => (
    <I>
      <path d="M8 13V5.5a1.5 1.5 0 013 0V12M11 11V4a1.5 1.5 0 013 0v7M14 11V5.5a1.5 1.5 0 013 0V14c0 4-2.5 7-6.5 7S5 18.5 4 16l-1.6-3.6a1.5 1.5 0 012.6-1.4L8 14" />
    </I>
  ),
  rect: () => (
    <I>
      <rect x="4" y="6" width="16" height="12" rx="2" />
    </I>
  ),
  ellipse: () => (
    <I>
      <ellipse cx="12" cy="12" rx="8.5" ry="6.5" />
    </I>
  ),
  text: () => (
    <I>
      <path d="M5 6V4h14v2M12 4v16M9 20h6" />
    </I>
  ),
  line: () => (
    <I>
      <path d="M5 19L19 5" />
    </I>
  ),
  arrow: () => (
    <I>
      <path d="M5 19L19 5M10 5h9v9" />
    </I>
  ),
  inhibit: () => (
    <I>
      <path d="M5 12h13M18 6v12" />
    </I>
  ),
  brush: () => (
    <I>
      <path d="M3 17c3-6 6 2 9-4s6 2 9-4" />
      <circle cx="3" cy="17" r="1.6" fill="currentColor" />
      <circle cx="12" cy="13" r="1.6" fill="currentColor" />
      <circle cx="21" cy="9" r="1.6" fill="currentColor" />
    </I>
  ),
  undo: () => (
    <I>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 010 11H11" />
    </I>
  ),
  redo: () => (
    <I>
      <path d="M15 14l5-5-5-5" />
      <path d="M20 9H9.5a5.5 5.5 0 000 11H13" />
    </I>
  ),
  plus: () => (
    <I>
      <path d="M12 5v14M5 12h14" />
    </I>
  ),
  minus: () => (
    <I>
      <path d="M5 12h14" />
    </I>
  ),
  menu: () => (
    <I>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </I>
  ),
  download: () => (
    <I>
      <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
    </I>
  ),
  lock: () => (
    <I>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </I>
  ),
  unlock: () => (
    <I>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 017.5-2" />
    </I>
  ),
  trash: () => (
    <I>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </I>
  ),
  group: () => (
    <I>
      <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="3 3" />
      <rect x="7" y="7" width="6" height="6" />
      <rect x="11" y="11" width="6" height="6" />
    </I>
  ),
  ungroup: () => (
    <I>
      <rect x="4" y="4" width="7" height="7" />
      <rect x="13" y="13" width="7" height="7" />
    </I>
  ),
  front: () => (
    <I>
      <rect x="9" y="9" width="11" height="11" fill="currentColor" fillOpacity={0.25} />
      <path d="M4 15V4h11" />
    </I>
  ),
  back: () => (
    <I>
      <rect x="4" y="4" width="11" height="11" fill="currentColor" fillOpacity={0.25} />
      <path d="M9 20h11V9" />
    </I>
  ),
  flipH: () => (
    <I>
      <path d="M12 3v18M9 7L4 17h5zM15 7l5 10h-5z" />
    </I>
  ),
  flipV: () => (
    <I>
      <path d="M3 12h18M7 9L17 4v5zM7 15l10 5v-5z" />
    </I>
  ),
  duplicate: () => (
    <I>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3" />
    </I>
  ),
  alignLeft: () => (
    <I>
      <path d="M4 3v18M8 7h10M8 15h6" strokeWidth={3} />
    </I>
  ),
  alignHCenter: () => (
    <I>
      <path d="M12 3v18" />
      <path d="M6 7h12M8 15h8" strokeWidth={3} />
    </I>
  ),
  alignRight: () => (
    <I>
      <path d="M20 3v18M6 7h10M10 15h6" strokeWidth={3} />
    </I>
  ),
  alignTop: () => (
    <I>
      <path d="M3 4h18M7 8v10M15 8v6" strokeWidth={3} />
    </I>
  ),
  alignVCenter: () => (
    <I>
      <path d="M3 12h18" />
      <path d="M7 6v12M15 8v8" strokeWidth={3} />
    </I>
  ),
  alignBottom: () => (
    <I>
      <path d="M3 20h18M7 6v10M15 10v6" strokeWidth={3} />
    </I>
  ),
  distH: () => (
    <I>
      <path d="M4 4v16M20 4v16" />
      <rect x="9" y="8" width="6" height="8" />
    </I>
  ),
  distV: () => (
    <I>
      <path d="M4 4h16M4 20h16" />
      <rect x="8" y="9" width="8" height="6" />
    </I>
  ),
  eye: () => (
    <I size={15}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </I>
  ),
  eyeOff: () => (
    <I size={15}>
      <path d="M3 3l18 18M10.6 5.1A10.8 10.8 0 0112 5c6.5 0 10 7 10 7a17 17 0 01-3.2 4.2M6.6 6.6A17.6 17.6 0 002 12s3.5 7 10 7a9.7 9.7 0 005.4-1.6" />
    </I>
  ),
  template: () => (
    <I>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 9v12" />
    </I>
  ),
  grid: () => (
    <I>
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </I>
  ),
  layers: () => (
    <I>
      <path d="M12 3l9 5-9 5-9-5z" />
      <path d="M3 13l9 5 9-5" />
    </I>
  ),
  search: () => (
    <I>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </I>
  ),
  library: () => (
    <I>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <circle cx="17.5" cy="17.5" r="3.5" />
    </I>
  ),
  upload: () => (
    <I>
      <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
    </I>
  )
}
