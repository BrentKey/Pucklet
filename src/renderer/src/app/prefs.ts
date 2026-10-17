import { platform } from '../platform'
import type { Prefs } from '../state/editor'
import { DEFAULT_PREFS, useEditor } from '../state/editor'

// View preferences (grid, rulers) persist in the per-user data store.

const STORE = 'prefs'

export async function loadPrefs(): Promise<void> {
  try {
    const raw = await platform.readUserData(STORE)
    if (raw) useEditor.getState().set({ prefs: { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) } })
  } catch {
    /* defaults are fine */
  }
}

export function setPrefs(patch: Partial<Prefs>): void {
  const prefs = { ...useEditor.getState().prefs, ...patch }
  useEditor.getState().set({ prefs })
  void platform.writeUserData(STORE, JSON.stringify(prefs)).catch(() => {})
}
