import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, shell } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, extname, join, normalize } from 'node:path'
import { pathToFileURL } from 'node:url'

// The production renderer is served from a custom privileged scheme rather than file://,
// so fetch() of bundled assets (icon packs) works the same as it does in a browser.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

const RENDERER_DIR = join(__dirname, '../renderer')
const FILE_FILTERS = [{ name: 'Pucklet Figure', extensions: ['pucklet'] }]
const closeConfirmed = new WeakSet<BrowserWindow>()
// Imported SVGs are sanitized, but the CSP is a second line of defence: no remote code, no remote loads.
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'"

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: 'Pucklet',
    backgroundColor: '#f4f5f7',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })
  win.once('ready-to-show', () => win.show())

  // Never navigate the editor window away; open external links in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) e.preventDefault()
  })

  // Let the renderer veto closing when there are unsaved changes.
  win.on('close', (e) => {
    if (closeConfirmed.has(win)) return
    e.preventDefault()
    win.webContents.send('app:request-close')
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadURL('app://bundle/index.html')
  }
  return win
}

function send(channel: string, ...args: unknown[]): void {
  BrowserWindow.getFocusedWindow()?.webContents.send(channel, ...args)
}

function buildMenu(): void {
  const isMac = process.platform === 'darwin'
  const cmd = (id: string) => () => send('menu:command', id)
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Figure', accelerator: 'CmdOrCtrl+N', click: cmd('file.new') },
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: cmd('file.open') },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: cmd('file.save') },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: cmd('file.saveAs') },
        { type: 'separator' },
        { label: 'Import Image or SVG…', accelerator: 'CmdOrCtrl+Shift+I', click: cmd('file.import') },
        { label: 'Export…', accelerator: 'CmdOrCtrl+E', click: cmd('file.export') },
        ...(isMac ? [] : [{ type: 'separator' as const }, { role: 'quit' as const }])
      ]
    },
    {
      // Custom items rather than roles: the renderer decides whether the command goes
      // to a focused text field or to the canvas.
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: cmd('edit.undo') },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', click: cmd('edit.redo') },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { label: 'Duplicate', accelerator: 'CmdOrCtrl+D', click: cmd('edit.duplicate') },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', click: cmd('edit.selectAll') }
      ]
    },
    {
      label: 'Arrange',
      submenu: [
        { label: 'Group', accelerator: 'CmdOrCtrl+G', click: cmd('arrange.group') },
        { label: 'Ungroup', accelerator: 'CmdOrCtrl+Shift+G', click: cmd('arrange.ungroup') },
        { type: 'separator' },
        { label: 'Bring to Front', accelerator: 'CmdOrCtrl+Shift+]', click: cmd('arrange.front') },
        { label: 'Bring Forward', accelerator: 'CmdOrCtrl+]', click: cmd('arrange.forward') },
        { label: 'Send Backward', accelerator: 'CmdOrCtrl+[', click: cmd('arrange.backward') },
        { label: 'Send to Back', accelerator: 'CmdOrCtrl+Shift+[', click: cmd('arrange.back') },
        { type: 'separator' },
        { label: 'Lock / Unlock', accelerator: 'CmdOrCtrl+L', click: cmd('arrange.lock') }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: cmd('view.zoomIn') },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: cmd('view.zoomOut') },
        { label: 'Zoom to Fit', accelerator: 'CmdOrCtrl+0', click: cmd('view.fit') },
        { label: 'Actual Size', accelerator: 'CmdOrCtrl+1', click: cmd('view.actual') },
        { type: 'separator' },
        { label: 'Grayscale Preview', accelerator: 'Alt+G', click: cmd('view.grayscale') },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { role: 'togglefullscreen' }
      ]
    },
    { role: 'windowMenu' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function registerIpc(): void {
  ipcMain.handle('file:open', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const res = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: FILE_FILTERS })
    if (res.canceled || !res.filePaths[0]) return null
    const path = res.filePaths[0]
    return { path, name: basename(path), data: new Uint8Array(await readFile(path)) }
  })

  ipcMain.handle('file:save', async (e, args: { path?: string; suggestedName: string; data: Uint8Array }) => {
    let path = args.path
    if (!path) {
      const win = BrowserWindow.fromWebContents(e.sender)!
      const res = await dialog.showSaveDialog(win, { defaultPath: args.suggestedName, filters: FILE_FILTERS })
      if (res.canceled || !res.filePath) return null
      path = res.filePath
    }
    await writeFile(path, args.data)
    return { path, name: basename(path) }
  })

  ipcMain.handle('file:import', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const res = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['svg', 'png', 'jpg', 'jpeg', 'webp', 'gif'] }]
    })
    if (res.canceled) return []
    return Promise.all(
      res.filePaths.map(async (p) => ({ name: basename(p), data: new Uint8Array(await readFile(p)) }))
    )
  })

  ipcMain.handle('file:export', async (e, args: { suggestedName: string; data: Uint8Array }) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const ext = extname(args.suggestedName).slice(1)
    const res = await dialog.showSaveDialog(win, {
      defaultPath: args.suggestedName,
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
    })
    if (res.canceled || !res.filePath) return null
    await writeFile(res.filePath, args.data)
    return { path: res.filePath, name: basename(res.filePath) }
  })

  // Vector PDF: render the exported SVG in a hidden window and use Chromium's printer.
  ipcMain.handle('export:pdf', (_e, args: { svg: string; widthIn: number; heightIn: number }) => svgToPdf(args))

  ipcMain.handle('window:set-title', (e, title: string) => {
    BrowserWindow.fromWebContents(e.sender)?.setTitle(title)
  })
}

async function svgToPdf(args: { svg: string; widthIn: number; heightIn: number }): Promise<Uint8Array> {
  const pdfWin = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, javascript: false }
  })
  try {
    const html =
      '<!doctype html><html><head><meta charset="utf-8"><style>' +
      `@page{size:${args.widthIn}in ${args.heightIn}in;margin:0}` +
      'html,body{margin:0;padding:0;overflow:hidden;height:100%}svg{display:block;width:100vw;height:100vh}' +
      '</style></head><body>' +
      args.svg.replace(/^<\?xml[^>]*>\s*/, '') +
      '</body></html>'
    await pdfWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    const pdf = await pdfWin.webContents.printToPDF({
      printBackground: true,
      pageSize: { width: args.widthIn, height: args.heightIn },
      margins: { top: 0, bottom: 0, left: 0, right: 0 }
    })
    return new Uint8Array(pdf)
  } finally {
    pdfWin.destroy()
  }
}

function registerWindowIpc(): void {
  ipcMain.handle('app:confirm-close', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    closeConfirmed.add(win)
    win.close()
  })
}

/**
 * PUCKLET_SMOKE_DIR=<dir>: load the app, check the renderer and the native bridge, save a
 * screenshot and a test PDF into <dir>, then quit. Used to verify builds without a human.
 */
async function smokeTest(win: BrowserWindow, dir: string): Promise<void> {
  await new Promise<void>((r) => win.webContents.once('did-finish-load', () => r()))
  await new Promise((r) => setTimeout(r, 2500))
  const report = await win.webContents.executeJavaScript(`(async () => {
    const res = await fetch('icon-packs/index.json').catch(() => null)
    return {
      bridge: typeof window.puckletNative === 'object',
      ui: !!document.querySelector('.topbar') && !!document.querySelector('.canvas-wrap'),
      iconTiles: document.querySelectorAll('.icon-tile').length,
      iconIndex: res ? res.status : 'fetch failed'
    }
  })()`)
  const shot = await win.webContents.capturePage()
  await writeFile(join(dir, 'smoke-window.png'), shot.toPNG())
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><rect x="10" y="10" width="80" height="80" fill="#0072b2"/><text x="100" y="60" font-family="Arial" font-size="20">Ca<tspan dy="-8" font-size="14">2+</tspan></text></svg>'
  const pdf = await svgToPdf({ svg, widthIn: 200 / 96, heightIn: 100 / 96 })
  await writeFile(join(dir, 'smoke.pdf'), pdf)
  await writeFile(join(dir, 'smoke-report.json'), JSON.stringify({ ...report, pdfBytes: pdf.length }, null, 2))
  app.exit(0)
}

app.whenReady().then(() => {
  protocol.handle('app', async (req) => {
    const { pathname } = new URL(req.url)
    const filePath = normalize(join(RENDERER_DIR, decodeURIComponent(pathname)))
    if (!filePath.startsWith(RENDERER_DIR)) return new Response('Not found', { status: 404 })
    const res = await net.fetch(pathToFileURL(filePath).toString())
    const headers = new Headers(res.headers)
    if (filePath.endsWith('.html')) headers.set('Content-Security-Policy', CSP)
    return new Response(res.body, { status: res.status, headers })
  })
  buildMenu()
  registerIpc()
  registerWindowIpc()
  const win = createWindow()
  if (process.env.PUCKLET_SMOKE_DIR) void smokeTest(win, process.env.PUCKLET_SMOKE_DIR)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
