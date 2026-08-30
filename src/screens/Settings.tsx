import { useRef, useState } from 'react'
import { Overlay } from '../components/Overlay'
import { db, setLastPlace } from '../db'
import { getSessionRuntime } from '../session'
import { toast } from '../toast'
import type { BackupFile } from '../types'
import { coerceApproach, isSession, nowISO } from '../utils'
import { ManualLog } from './ManualLog'

type Props = { onClose: () => void }

export function Settings({ onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [busy, setBusy] = useState(false)
  const [manual, setManual] = useState(false)

  async function exportJson() {
    const approaches = await db.approaches.toArray()
    const sessions = await db.sessions.toArray()
    const backup: BackupFile = { exportedAt: nowISO(), approaches, sessions }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'field-backup.json'
    a.click()
    URL.revokeObjectURL(url)
    toast('Backup downloaded')
  }

  async function importJson(file: File) {
    setBusy(true)
    try {
      const raw: unknown = JSON.parse(await file.text())
      const list = Array.isArray(raw)
        ? raw
        : raw && typeof raw === 'object' && Array.isArray((raw as BackupFile).approaches)
          ? (raw as BackupFile).approaches
          : null
      if (!list) {
        toast('Not a Field backup')
        return
      }
      const valid = list.map(coerceApproach).filter((x): x is NonNullable<typeof x> => x !== null)
      if (valid.length === 0) {
        toast('No valid approaches in file')
        return
      }
      await db.approaches.bulkPut(valid)
      if (raw && typeof raw === 'object' && Array.isArray((raw as BackupFile).sessions)) {
        const sessions = (raw as BackupFile).sessions!.filter(isSession)
        if (sessions.length) await db.sessions.bulkPut(sessions)
      }
      toast(`Imported ${valid.length}`)
    } catch {
      toast('Could not read that file')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function clearAll() {
    if (getSessionRuntime().isLive()) await getSessionRuntime().stop()
    await db.approaches.clear()
    await db.sessions.clear()
    await db.audioClips.clear()
    setLastPlace('')
    setConfirmClear(false)
    toast('All data cleared')
  }

  return (
    <Overlay title={manual ? 'Manual log' : 'Settings'} onClose={onClose}>
      {manual ? (
        <ManualLog onSaved={() => setManual(false)} onCancel={() => setManual(false)} />
      ) : (
        <div className="settings">
          <p className="muted">
            Recording is only on during a session you start. Everyone in the conversation is an
            enrolled study participant. Audio and transcripts stay on this phone. Live captions may
            use Apple or Google speech services on the device. Location is stored as metadata on
            each conversation. Field does not upload your data.
          </p>

          <button type="button" className="btn-secondary" onClick={() => void exportJson()}>
            Export JSON
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            Import JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importJson(file)
            }}
          />

          <p className="section-title">Manual</p>
          <button type="button" className="btn-secondary" onClick={() => setManual(true)}>
            Log one manually
          </button>

          <p className="section-title">Home screen</p>
          <p>iPhone: Share → Add to Home Screen.</p>
          <p>Android: Install / Add to Home screen from the browser menu.</p>

          <p className="section-title">Danger</p>
          {!confirmClear ? (
            <button type="button" className="btn-danger" onClick={() => setConfirmClear(true)}>
              Clear all
            </button>
          ) : (
            <div className="card">
              <p className="warn">This deletes every conversation, session, and audio clip on this device.</p>
              <div className="card-actions">
                <button type="button" className="btn-danger" onClick={() => void clearAll()}>
                  Confirm delete
                </button>
                <button type="button" className="btn-ghost" onClick={() => setConfirmClear(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Overlay>
  )
}
