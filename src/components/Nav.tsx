import type { Tab } from '../types'
import { IconHistory, IconLog, IconNext, IconStats } from './Icons'

const items: { id: Tab; label: string; icon: typeof IconLog }[] = [
  { id: 'log', label: 'Log', icon: IconLog },
  { id: 'next', label: 'Next', icon: IconNext },
  { id: 'stats', label: 'Stats', icon: IconStats },
  { id: 'history', label: 'History', icon: IconHistory },
]

type Props = {
  tab: Tab
  onTab: (tab: Tab) => void
}

export function Nav({ tab, onTab }: Props) {
  return (
    <nav className="nav" aria-label="Main">
      {items.map((item) => {
        const active = tab === item.id
        const Icon = item.icon
        return (
          <button
            key={item.id}
            type="button"
            className={active ? 'nav-item is-active' : 'nav-item'}
            aria-current={active ? 'page' : undefined}
            onClick={() => onTab(item.id)}
          >
            <Icon />
            <span>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
