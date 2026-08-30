import { beforeEach, describe, expect, it } from 'vitest'
import { db, getLastPlace, setLastPlace } from './db'
import { getSpeechLang, setSpeechLang } from './lang'
import { getApiKey, setApiKey } from './openai'
import { resetAllData } from './reset'
import { approach } from './test/helpers'

beforeEach(async () => {
  localStorage.clear()
  await db.approaches.clear()
  await db.sessions.clear()
  await db.audioClips.clear()
})

describe('db approaches', () => {
  it('add, get, update followUpDone, delete', async () => {
    const row = approach({ place: 'Station', followUpDone: false })
    await db.approaches.add(row)
    expect(await db.approaches.get(row.id)).toMatchObject({
      id: row.id,
      place: 'Station',
      followUpDone: false,
    })
    await db.approaches.update(row.id, { followUpDone: true })
    expect((await db.approaches.get(row.id))?.followUpDone).toBe(true)
    await db.approaches.delete(row.id)
    expect(await db.approaches.get(row.id)).toBeUndefined()
  })
})

describe('lastPlace', () => {
  it('get and set', () => {
    expect(getLastPlace()).toBe('')
    setLastPlace('Park')
    expect(getLastPlace()).toBe('Park')
  })
})

describe('import merge by id', () => {
  it('put two, put same id with new notes, count stays 2', async () => {
    const a = approach({ notes: 'one' })
    const b = approach({ notes: 'two' })
    await db.approaches.bulkPut([a, b])
    await db.approaches.put({ ...a, notes: 'updated' })
    expect(await db.approaches.count()).toBe(2)
    expect((await db.approaches.get(a.id))?.notes).toBe('updated')
  })
})


describe('db sessions and recordings', () => {
  it('session start/stop', async () => {
    const id = crypto.randomUUID()
    await db.sessions.add({ id, startedAt: new Date().toISOString(), endedAt: null })
    expect((await db.sessions.get(id))?.endedAt).toBeNull()
    const endedAt = new Date().toISOString()
    await db.sessions.update(id, { endedAt })
    expect((await db.sessions.get(id))?.endedAt).toBe(endedAt)
  })

  it('stores a recording approach and audio blob', async () => {
    const conversationId = crypto.randomUUID()
    const audioId = crypto.randomUUID()
    const sessionId = crypto.randomUUID()
    await db.sessions.add({ id: sessionId, startedAt: new Date().toISOString(), endedAt: null })
    await db.audioClips.add({
      id: audioId,
      conversationId,
      blob: new Blob(['abc'], { type: 'audio/webm' }),
      mimeType: 'audio/webm',
      createdAt: new Date().toISOString(),
    })
    await db.approaches.add(
      approach({
        id: conversationId,
        source: 'recording',
        sessionId,
        audioId,
        transcript: 'hello',
        dwellSeconds: 42,
        outcome: 'talked',
      }),
    )
    expect(await db.approaches.count()).toBe(1)
    expect((await db.approaches.get(conversationId))?.source).toBe('recording')
    const clip = await db.audioClips.get(audioId)
    expect(clip?.conversationId).toBe(conversationId)
    expect(clip?.mimeType).toBe("audio/webm")
    expect(clip?.blob).toBeTruthy()
  })
})

describe('resetAllData', () => {
  it('clears encounter stores and lastPlace, keeps api key and speech lang', async () => {
    setApiKey('sk-keep')
    setSpeechLang('he')
    setLastPlace('Bar')
    await db.approaches.add(approach({ place: 'Bar' }))
    await db.sessions.add({ id: 's', startedAt: new Date().toISOString(), endedAt: null })
    await db.audioClips.add({
      id: 'a',
      conversationId: 'c',
      blob: new Blob(['x']),
      mimeType: 'audio/webm',
      createdAt: new Date().toISOString(),
    })
    await resetAllData()
    expect(await db.approaches.count()).toBe(0)
    expect(await db.sessions.count()).toBe(0)
    expect(await db.audioClips.count()).toBe(0)
    expect(getLastPlace()).toBe('')
    expect(getApiKey()).toBe('sk-keep')
    expect(getSpeechLang()).toBe('he')
  })
})
