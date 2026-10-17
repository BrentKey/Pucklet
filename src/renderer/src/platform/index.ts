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
  /** CSV / TSV / Excel file for charts and tables. */
  openDataFile(): Promise<OpenedFile | null>
  exportFile(data: Uint8Array, suggestedName: string): Promise<boolean>
  /** Vector PDF with one page per standalone SVG (desktop only). */
  svgToPdf?(pages: { svg: string; widthIn: number; heightIn: number }[]): Promise<Uint8Array>
  /** Small per-user JSON documents (templates, preferences). */
  readUserData(name: string): Promise<string | null>
  writeUserData(name: string, text: string): Promise<void>
  setTitle(title: string): void
  onMenuCommand(cb: (id: string) => void): () => void
  onRequestClose(cb: () => void): () => void
  confirmClose(): void
}

interface NativeApi {
  openFile(): Promise<OpenedFile | null>
  saveFile(args: { path?: string; suggestedName: string; data: Uint8Array }): Promise<{ name: string; path: string } | null>
  importFiles(): Promise<OpenedFile[]>
  openDataFile(): Promise<OpenedFile | null>
  exportFile(args: { suggestedName: string; data: Uint8Array }): Promise<{ name: string; path: string } | null>
  svgToPdf(pages: { svg: string; widthIn: number; heightIn: number }[]): Promise<Uint8Array>
  readUserData(name: string): Promise<string | null>
  writeUserData(name: string, text: string): Promise<void>
  setTitle(title: string): Promise<void>
  confirmClose(): Promise<void>
  onMenuCommand(cb: (id: string) => void): () => void
  onRequestClose(cb: () => void): () => void
}

declare global {
  interface Window {
    puckletNative?: NativeApi
  }
}

function electronPlatform(n: NativeApi): Platform {
  return {
    kind: 'electron',
    openFile: () => n.openFile(),
    saveFile: (data, suggestedName, path) => n.saveFile({ data, suggestedName, path }),
    importFiles: () => n.importFiles(),
    openDataFile: () => n.openDataFile(),
    exportFile: async (data, suggestedName) => (await n.exportFile({ data, suggestedName })) !== null,
    svgToPdf: (pages) => n.svgToPdf(pages),
    readUserData: (name) => n.readUserData(name),
    writeUserData: (name, text) => n.writeUserData(name, text),
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
    openFile: async () => (await pickFiles('.pucklet', false))[0] ?? null,
    saveFile: async (data, suggestedName) => {
      download(data, suggestedName)
      return { name: suggestedName }
    },
    importFiles: () => pickFiles('.svg,.png,.jpg,.jpeg,.webp,.gif', true),
    openDataFile: async () => (await pickFiles('.csv,.tsv,.txt,.xlsx,.xlsm', false))[0] ?? null,
    exportFile: async (data, name) => {
      download(data, name)
      return true
    },
    readUserData: async (name) => {
      try {
        return localStorage.getItem('pucklet:' + name)
      } catch {
        return null
      }
    },
    writeUserData: async (name, text) => {
      try {
        localStorage.setItem('pucklet:' + name, text)
      } catch {
        throw new Error('This browser is not allowing Pucklet to store data.')
      }
    },
    setTitle: (t) => {
      document.title = t
    },
    onMenuCommand: () => () => {},
    onRequestClose: () => () => {},
    confirmClose: () => {}
  }
}

export const platform: Platform = window.puckletNative ? electronPlatform(window.puckletNative) : webPlatform()
