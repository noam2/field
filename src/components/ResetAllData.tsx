import { useState } from 'react'
import { resetAllData } from '../reset'
import { toast } from '../toast'

export function ResetAllData() {
  const [confirm, setConfirm] = useState(false)

  async function run() {
    await resetAllData()
    setConfirm(false)
    toast('All data cleared')
  }

  if (!confirm) {
    return (
      <button type="button" className="btn-danger" onClick={() => setConfirm(true)}>
        Reset all data
      </button>
    )
  }

  return (
    <div className="card">
      <p className="warn">Reset everything?</p>
      <div className="card-actions">
        <button type="button" className="btn-danger" onClick={() => void run()}>
          Reset all data
        </button>
        <button type="button" className="btn-ghost" onClick={() => setConfirm(false)}>
          Cancel
        </button>
      </div>
    </div>
  )
}
