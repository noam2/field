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
    this.version(4)
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
            if (row.analysisSource === undefined) row.analysisSource = 'rules'
            if (row.insight === undefined) row.insight = null
          })
      })
    this.version(5)
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
            const insight = row.insight
            if (insight && typeof insight === 'object') {
              const ins = insight as Record<string, unknown>
              if (ins.placeType === undefined) ins.placeType = 'other'
              if (ins.daypart === undefined) ins.daypart = 'afternoon'
              if (ins.language === undefined) ins.language = 'en'
            }
          })
      })
    this.version(6)
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
            const insight = row.insight
            if (insight && typeof insight === 'object') {
              const ins = insight as Record<string, unknown>
              if (ins.whatWorked === undefined) ins.whatWorked = ''
              if (ins.nextAction === undefined) ins.nextAction = ''
            }
          })
      })
    this.version(7)
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
            const insight = row.insight
            if (insight && typeof insight === 'object') {
              const ins = insight as Record<string, unknown>
              if (ins.scene === undefined) ins.scene = ''
            }
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
