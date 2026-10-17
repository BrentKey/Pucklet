import { useEffect } from 'react'
import { installAppEvents, installClipboard, installKeyboard } from './app/commands'
import { Canvas } from './canvas/Canvas'
import { useEditor } from './state/editor'
import { ExportDialog } from './ui/ExportDialog'
import { LeftPanel } from './ui/LeftPanel'
import { PropertiesPanel } from './ui/PropertiesPanel'
import { TopBar } from './ui/TopBar'
import { PagesBar } from './ui/PagesBar'
import { ShortcutsDialog } from './ui/ShortcutsDialog'
import { DataDialogs } from './ui/DataDialogs'
import { loadPrefs } from './app/prefs'

export function App() {
  const exportOpen = useEditor((s) => s.exportOpen)
  const toast = useEditor((s) => s.toast)
  const shortcutsOpen = useEditor((s) => s.shortcutsOpen)

  useEffect(() => {
    void loadPrefs()
    const offs = [installKeyboard(), installClipboard(), installAppEvents()]
    return () => offs.forEach((off) => off())
  }, [])

  return (
    <div className="app">
      <TopBar />
      <div className="main">
        <LeftPanel />
        <div className="canvas-col">
          <Canvas />
          <PagesBar />
        </div>
        <PropertiesPanel />
      </div>
      {exportOpen && <ExportDialog />}
      {shortcutsOpen && <ShortcutsDialog />}
      <DataDialogs />
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
