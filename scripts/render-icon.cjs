// Renders build/icon.svg to build/icon.png (1024 × 1024, transparent corners) using
// Electron's Chromium, so no extra image tools are needed.  Run: npx electron scripts/render-icon.cjs
const { app, BrowserWindow } = require('electron')
const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const dir = join(__dirname, '..', 'build')
app.whenReady().then(async () => {
  const svg = readFileSync(join(dir, 'icon.svg'), 'utf8')
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
  await win.loadURL('data:text/html,<html><body></body></html>')
  const dataUrl = await win.webContents.executeJavaScript(`(async () => {
    const img = new Image()
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(${JSON.stringify(svg)})
    await img.decode()
    const c = document.createElement('canvas')
    c.width = c.height = 1024
    c.getContext('2d').drawImage(img, 0, 0, 1024, 1024)
    return c.toDataURL('image/png')
  })()`)
  writeFileSync(join(dir, 'icon.png'), Buffer.from(dataUrl.split(',')[1], 'base64'))
  app.exit(0)
})
