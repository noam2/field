import { db, setLastPlace } from './db'
import { getSessionRuntime } from './session'

/** Wipe encounter data. Keeps API key, speech lang, and timing prefs. */
export async function resetAllData(): Promise<void> {
  if (getSessionRuntime().isLive()) await getSessionRuntime().stop()
  await db.approaches.clear()
  await db.sessions.clear()
  await db.audioClips.clear()
  setLastPlace('')
}
