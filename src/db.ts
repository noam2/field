import Dexie, { type Table } from 'dexie'
import type { Approach, AudioClip, Session } from './types'

class FieldDB extends Dexie {
  approaches!: Table<Approach, string>
  sessions!: Table<Session, string>
  audioClips!: Table<AudioClip, string>

  constructor() {
    super('field')
    this.version(1).stores({
      approaches: 'id, at, place, who, outcome, followUpAt, createdAt',
    })
    this.version(2)
      .stores({
        approaches: 'id, at, place, who, outcome, followUpAt, createdAt, sessionId, source',
        sessions: 'id, startedAt',
      })
      .upgrade(async (tx) => {
        await tx
          .table('approaches')
          .toCollection()
          .modify((row: Record<string, unknown>) => {
            if (row.source == null) row.source = 'manual'
            if (row.lat === undefined) row.lat = null
            if (row.lng === undefined) row.lng = null
            if (row.accuracy === undefined) row.accuracy = null
            if (row.dwellSeconds === undefined) row.dwellSeconds = null
            if (row.sessionId === undefined) row.sessionId = null
            if (row.endedAt === undefined) row.endedAt = null
          })
      })
    this.version(3)
      .stores({
        approaches: 'id, at, place, who, outcome, followUpAt, createdAt, sessionId, source',
        sessions: 'id, startedAt',
        audioClips: 'id, conversationId, createdAt',
      })
      .upgrade(async (tx) => {
        await tx
          .table('approaches')
          .toCollection()
          .modify((row: Record<string, unknown>) => {
            if (row.transcript === undefined) row.transcript = ''
            if (row.analysis === undefined) row.analysis = null
            if (row.audioId === undefined) row.audioId = null
          })
      })
  }
}

export const db = new FieldDB()

const LAST_PLACE_KEY = 'field:lastPlace'

export function getLastPlace(): string {
  try {
    return localStorage.getItem(LAST_PLACE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function setLastPlace(place: string): void {
  try {
    localStorage.setItem(LAST_PLACE_KEY, place)
  } catch {
    /* ignore quota / private mode */
  }
}
