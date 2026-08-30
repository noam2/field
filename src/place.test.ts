import { describe, expect, it } from 'vitest'
import { classifyPlaceType, daypartFromIso } from './place'

describe('classifyPlaceType', () => {
  it('maps Hebrew beach, English library, and bar names', () => {
    expect(classifyPlaceType('חוף התלאביב')).toBe('beach')
    expect(classifyPlaceType('Dizengoff library')).toBe('library')
    expect(classifyPlaceType('Bar Yona')).toBe('bar')
  })

  it('uses nominatim type when present', () => {
    expect(classifyPlaceType('Unknown spot', 'library', 'amenity')).toBe('library')
    expect(classifyPlaceType('Unknown spot', 'beach', 'natural')).toBe('beach')
  })
})

describe('daypartFromIso', () => {
  it('night vs morning in Asia/Jerusalem', () => {
    // 01:30Z = 04:30 IDT (UTC+3 in August) => night
    expect(daypartFromIso('2026-08-30T01:30:00.000Z', 'Asia/Jerusalem')).toBe('night')
    // 05:00Z = 08:00 IDT => morning
    expect(daypartFromIso('2026-08-30T05:00:00.000Z', 'Asia/Jerusalem')).toBe('morning')
  })
})
