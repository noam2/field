import { useRef, useState } from 'react'
import { InstallCard } from '../components/InstallCard'
import { Overlay } from '../components/Overlay'
import { Segmented } from '../components/Segmented'
import { ResetAllData } from '../components/ResetAllData'
import { db } from '../db'
import { getKeepAlive, getSpeechLang, setKeepAlive, setSpeechLang } from '../lang'
import {
  getIdleStopMs,
  getPauseMs,
  IDLE_STOP_MS_LABEL,
  IDLE_STOP_MS_OPTIONS,
  PAUSE_MS_LABEL,
  PAUSE_MS_OPTIONS,
  setIdleStopMs,
  setPauseMs,
} from '../timing'
import { getApiKey, hasApiKey, setApiKey } from '../openai'
import { getSessionRuntime, startKeepAlive, stopKeepAlive } from '../session'
import { toast } from '../toast'
import type { BackupFile, SpeechLangPref } from '../types'
import { coerceApproach, isSession, nowISO } from '../utils'
import { ManualLog } from './ManualLog'

type Props = { onClose: () => void }

export function Settings({ onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [manual, setManual] = useState(false)
  const [keyDraft, setKeyDraft] = useState(() => getApiKey())
  const [keySaved, setKeySaved] = useState(() => hasApiKey())
  const [testing, setTesting] = useState(false)
  const [speechLang, setSpeechLangUi] = useState<SpeechLangPref>(() => getSpeechLang())
  const [keepAlive, setKeepAliveUi] = useState(() => getKeepAlive())
  const [pauseMs, setPauseMsUi] = useState(() => getPauseMs())
  const [idleStopMs, setIdleStopMsUi] = useState(() => getIdleStopMs())

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

          <p className="section-title">Speech</p>
          <Segmented
            name="speech-lang"
            legend="Speech language"
            value={speechLang}
            onChange={(v) => {
              setSpeechLang(v)
              setSpeechLangUi(v)
            }}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'he', label: 'Hebrew' },
              { value: 'en', label: 'English' },
            ]}
          />
          <label className="toggle">
            <input
              type="checkbox"
              checked={keepAlive}
              onChange={(e) => {
                const on = e.target.checked
                setKeepAlive(on)
                setKeepAliveUi(on)
                if (getSessionRuntime().isLive()) {
                  if (on) startKeepAlive()
                  else stopKeepAlive()
                }
              }}
            />
            <span>Keep recording in background</span>
          </label>
          <p className="muted">
            Android can keep the mic with the screen off. iPhone Safari stops audio when you leave
            Field — keep the app on screen.
          </p>

          <p className="section-title">Recording</p>
          <label className="field">
            <span className="label">New conversation after pause</span>
            <select
              name="pause-ms"
              aria-label="New conversation after pause"
              value={String(pauseMs)}
              onChange={(e) => {
                const n = Number(e.target.value)
                setPauseMs(n)
                setPauseMsUi(getPauseMs())
              }}
            >
              {PAUSE_MS_OPTIONS.map((ms) => (
                <option key={ms} value={ms}>
                  {PAUSE_MS_LABEL[ms]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Stop recording after silence</span>
            <select
              name="idle-stop-ms"
              aria-label="Stop recording after silence"
              value={String(idleStopMs)}
              onChange={(e) => {
                const n = Number(e.target.value)
                setIdleStopMs(n)
                setIdleStopMsUi(getIdleStopMs())
              }}
            >
              {IDLE_STOP_MS_OPTIONS.map((ms) => (
                <option key={ms} value={ms}>
                  {IDLE_STOP_MS_LABEL[ms]}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">Pause starts a new conversation. Silence can stop the session.</p>

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
          <InstallCard compact dismissable={false} />

          <p className="section-title">Danger</p>
          <ResetAllData />
        </div>
      )}
    </Overlay>
  )
}
