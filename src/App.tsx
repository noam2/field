import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { IconGear } from './components/Icons'
import { Nav } from './components/Nav'
import { Toast } from './components/Toast'
import { db } from './db'
import { History } from './screens/History'
import { Log } from './screens/Log'
import { Next } from './screens/Next'
import { Settings } from './screens/Settings'
import { Stats } from './screens/Stats'
import { setToastListener } from './toast'
import type { Tab } from './types'

export default function App() {
  const [tab, setTab] = useState<Tab>('log')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const approaches = useLiveQuery(() => db.approaches.orderBy('at').reverse().toArray()) ?? []

  useEffect(() => {
    let timer: number | undefined
    setToastListener((message) => {
      setToastMsg(message)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setToastMsg(null), 2200)
    })
    return () => {
      setToastListener(null)
      window.clearTimeout(timer)
    }
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <span className="brand">Field</span>
        <button
          type="button"
          className="icon-btn"
          aria-label="Settings"
          onClick={() => setSettingsOpen(true)}
        >
          <IconGear />
        </button>
      </header>

      <main className="app-main">
        {tab === 'log' && <Log approaches={approaches} />}
        {tab === 'next' && <Next approaches={approaches} />}
        {tab === 'stats' && <Stats approaches={approaches} onLog={() => setTab('log')} />}
        {tab === 'history' && <History approaches={approaches} />}
      </main>

      <Nav tab={tab} onTab={setTab} />
      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
      <Toast message={toastMsg} />
    </div>
  )
}
