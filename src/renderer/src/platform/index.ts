// Everything OS-specific goes through this interface. The Electron adapter talks to the
// preload bridge; the web adapter uses downloads and <input type=file>. A future web app
// or a different desktop shell only needs a new adapter.

export interface OpenedFile {
  name: string
  path?: string
  data: Uint8Array
}

export interface Platform {
  kind: 'electron' | 'web'
  openFile(): Promise<OpenedFile | null>
  /** Saves to `path` when given, otherwise asks where. Returns where it went, or null if cancelled. */
  saveFile(data: Uint8Array, suggestedName: string, path?: string): Promise<{ name: string; path?: string } | null>
  importFiles(): Promise<OpenedFile[]>
  exportFile(data: Uint8Array, suggestedName: string): Promise<boolean>
  /** Vector PDF from a standalone SVG string, or null when unsupported. */
  svgToPdf?(svg: string, widthIn: number, heightIn: number): Promise<Uint8Array>
  setTitle(title: string): void
  onMenuCommand(cb: (id: string) => void): () => void
  onRequestClose(cb: () => void): () => void
  confirmClose(): void
}

interface NativeApi {
  openFile(): Promise<OpenedFile | null>
  saveFile(args: { path?: string; suggestedName: string; data: Uint8Array }): Promise<{ name: string; path: string } | null>
  importFiles(): Promise<OpenedFile[]>
  exportFile(args: { suggestedName: string; data: Uint8Array }): Promise<{ name: string; path: string } | null>
  svgToPdf(args: { svg: string; widthIn: number; heightIn: number }): Promise<Uint8Array>
  setTitle(title: string): Promise<void>
  confirmClose(): Promise<void>
  onMenuCommand(cb: (id: string) => void): () => void
  onRequestClose(cb: () => void): () => void
}

declare global {
  interface Window {
    biofigNative?: NativeApi
  }
}

function electronPlatform(n: NativeApi): Platform {
  return {
    kind: 'electron',
    openFile: () => n.openFile(),
    saveFile: (data, suggestedName, path) => n.saveFile({ data, suggestedName, path }),
    importFiles: () => n.importFiles(),
    exportFile: async (data, suggestedName) => (await n.exportFile({ data, suggestedName })) !== null,
    svgToPdf: (svg, widthIn, heightIn) => n.svgToPdf({ svg, widthIn, heightIn }),
    setTitle: (t) => void n.setTitle(t),
    onMenuCommand: (cb) => n.onMenuCommand(cb),
    onRequestClose: (cb) => n.onRequestClose(cb),
    confirmClose: () => void n.confirmClose()
  }
}

function pickFiles(accept: string, multiple: boolean): Promise<OpenedFile[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.multiple = multiple
    input.onchange = async () => {
      const files = Array.from(input.files ?? [])
      resolve(await Promise.all(files.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) }))))
    }
    input.oncancel = () => resolve([])
    input.click()
  })
}

function download(data: Uint8Array, name: string): void {
  const url = URL.createObjectURL(new Blob([data as BlobPart]))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function webPlatform(): Platform {
  return {
    kind: 'web',
    openFile: async () => (await pickFiles('.biofig', false))[0] ?? null,
    saveFile: async (data, suggestedName) => {
      download(data, suggestedName)
      return { name: suggestedName }
    },
    importFiles: () => pickFiles('.svg,.png,.jpg,.jpeg,.webp,.gif', true),
    exportFile: async (data, name) => {
      download(data, name)
      return true
    },
    setTitle: (t) => {
      document.title = t
    },
    onMenuCommand: () => () => {},
    onRequestClose: () => () => {},
    confirmClose: () => {}
  }
}

export const platform: Platform = window.biofigNative ? electronPlatform(window.biofigNative) : webPlatform()
