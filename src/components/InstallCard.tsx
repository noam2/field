import { useState, useSyncExternalStore } from 'react'
import {
  androidInstallSteps,
  getDeferredInstall,
  hideInstall,
  installNote,
  iosInstallNote,
  isInstallHidden,
  isIos,
  isStandalone,
  promptInstall,
  subscribeInstallPrompt,
} from '../install'
import { IconClose } from './Icons'

type Props = {
  compact?: boolean
  dismissable?: boolean
}

export function InstallCard({ compact = false, dismissable = true }: Props) {
  const deferred = useSyncExternalStore(subscribeInstallPrompt, getDeferredInstall, getDeferredInstall)
  const [hidden, setHidden] = useState(() => isInstallHidden())

  if (isStandalone()) return null
  if (dismissable && hidden) return null
  if (!compact && isIos() && !deferred) return null

  return (
    <div
      className={compact ? 'install-card is-compact' : 'install-card'}
      role="region"
      aria-label="Install Field"
    >
      <div className="install-card-head">
        <p className="card-title">Install Field</p>
        {dismissable && (
          <button
            type="button"
            className="icon-btn install-dismiss"
            aria-label="Dismiss"
            onClick={() => {
              hideInstall()
              setHidden(true)
            }}
          >
            <IconClose />
          </button>
        )}
      </div>
      {deferred ? (
        <button
          type="button"
          className={compact ? 'btn-primary' : 'btn-primary btn-huge'}
          onClick={() => void promptInstall()}
        >
          Install Field
        </button>
      ) : (
        <p>{androidInstallSteps()}</p>
      )}
      <p className="muted">{installNote()}</p>
      {compact && <p className="muted">{iosInstallNote()}</p>}
    </div>
  )
}
