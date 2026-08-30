import { useRef, useState } from 'react'
import { Overlay } from '../components/Overlay'
import { db, setLastPlace } from '../db'
import { getApiKey, hasApiKey, setApiKey } from '../openai'
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
  const [keyDraft, setKeyDraft] = useState(() => getApiKey())
  const [keySaved, setKeySaved] = useState(() => hasApiKey())
  const [testing, setTesting] = useState(false)

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
            enrolled study participant. Audio stays on this phone. Transcripts are sent to OpenAI
            for transcription and understanding when a key is set. Live captions may use Apple or
            Google speech services on the device. Location is stored as metadata on each
            conversation. Field does not upload your data to its own server.
          </p>

          {!keySaved && (
            <div className="key-banner" role="status">
              <p>Add an OpenAI key to transcribe and understand encounters.</p>
              <p>
                <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">
                  Get a key at platform.openai.com/api-keys
                </a>
              </p>
            </div>
          )}

          <p className="section-title">OpenAI</p>
          <label className="field">
            <span className="label">API key</span>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              placeholder={keySaved ? 'Key saved — paste to replace' : 'sk-…'}
              aria-label="OpenAI API key"
            />
          </label>
          <div className="card-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setApiKey(keyDraft)
                const ok = hasApiKey()
                setKeySaved(ok)
                toast(ok ? 'API key saved' : 'API key cleared')
              }}
            >
              Save
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={testing || !keyDraft.trim()}
              onClick={() => {
                void (async () => {
                  setTesting(true)
                  try {
                    const draft = keyDraft.trim()
                    const res = await fetch('https://api.openai.com/v1/models', {
                      headers: { Authorization: `Bearer ${draft}` },
                    })
                    if (!res.ok) {
                      toast('Key did not work')
                      return
                    }
                    setApiKey(draft)
                    setKeySaved(true)
                    toast('Key works')
                  } catch {
                    toast('Could not reach OpenAI')
                  } finally {
                    setTesting(false)
                  }
                })()
              }}
            >
              {testing ? 'Testing…' : 'Test key'}
            </button>
          </div>

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
