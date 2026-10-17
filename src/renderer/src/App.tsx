import { useEffect } from 'react'
import { installAppEvents, installClipboard, installKeyboard } from './app/commands'
import { Canvas } from './canvas/Canvas'
import { useEditor } from './state/editor'
import { ExportDialog } from './ui/ExportDialog'
import { LeftPanel } from './ui/LeftPanel'
import { PropertiesPanel } from './ui/PropertiesPanel'
import { TopBar } from './ui/TopBar'

export function App() {
  const exportOpen = useEditor((s) => s.exportOpen)
  const toast = useEditor((s) => s.toast)

  useEffect(() => {
    const offs = [installKeyboard(), installClipboard(), installAppEvents()]
    return () => offs.forEach((off) => off())
  }, [])

  return (
    <div className="app">
      <TopBar />
      <div className="main">
        <LeftPanel />
        <Canvas />
        <PropertiesPanel />
      </div>
      {exportOpen && <ExportDialog />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
