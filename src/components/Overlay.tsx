import type { ReactNode } from 'react'
import { IconClose } from './Icons'

type Props = {
  title: string
  onClose: () => void
  children: ReactNode
}

export function Overlay({ title, onClose, children }: Props) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="overlay-title">
      <header className="overlay-head">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          <IconClose />
        </button>
        <h2 id="overlay-title">{title}</h2>
        <span />
      </header>
      <div className="overlay-body">{children}</div>
    </div>
  )
}
