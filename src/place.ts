import type { Daypart, Insight, PlaceType, SpokenLanguage } from './types'
import { PLACE_TYPES } from './types'

export const DAYPART_LABEL: Record<Daypart, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
}

export const PLACE_TYPE_LABEL: Record<PlaceType, string> = {
  beach: 'Beach',
  bar: 'Bar',
  club: 'Club',
  cafe: 'Cafe',
  restaurant: 'Restaurant',
  library: 'Library',
  park: 'Park',
  gym: 'Gym',
  street: 'Street',
  home: 'Home',
  work: 'Work',
  transit: 'Transit',
  other: 'Other',
}

const NOMINATIM_TYPE: Record<string, PlaceType> = {
  beach: 'beach',
  bar: 'bar',
  pub: 'bar',
  nightclub: 'club',
  club: 'club',
  cafe: 'cafe',
  restaurant: 'restaurant',
  fast_food: 'restaurant',
  library: 'library',
  park: 'park',
  gym: 'gym',
  fitness_centre: 'gym',
  fitness_station: 'gym',
  sports_centre: 'gym',
  station: 'transit',
  bus_station: 'transit',
  bus_stop: 'transit',
  tram_stop: 'transit',
  subway_entrance: 'transit',
  halt: 'transit',
  house: 'home',
  apartments: 'home',
  residential: 'home',
  office: 'work',
}

const NAME_RULES: { type: PlaceType; re: RegExp }[] = [
  { type: 'beach', re: /beach|ים|חוף/i },
  { type: 'library', re: /library|ספרייה|ספריה/i },
  { type: 'restaurant', re: /restaurant|מסעדה/i },
  { type: 'cafe', re: /\bcafe\b|\bcafé\b|\bcoffee\b|קפה/i },
  { type: 'club', re: /\bclub\b|מועדון/i },
  { type: 'bar', re: /\bbar\b|\bpub\b|בר/i },
  { type: 'park', re: /\bpark\b|פארק/i },
  { type: 'gym', re: /\bgym\b|חדר כושר/i },
  { type: 'transit', re: /\bstation\b|\btransit\b|תחנה/i },
  { type: 'work', re: /\boffice\b|\bworkplace\b|משרד/i },
  { type: 'home', re: /\bhome\b|\bhouse\b|\bapartment\b/i },
  { type: 'street', re: /\bstreet\b|רחוב/i },
]

export function resolvedDefaultTimeZone(): string {
  try {
    Intl.DateTimeFormat('en', { timeZone: 'Asia/Jerusalem' }).format(new Date())
    return 'Asia/Jerusalem'
  } catch {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    } catch {
      return 'UTC'
    }
  }
}

export function hourInTimeZone(iso: string, timeZone: string): number {
  const d = new Date(iso)
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(d)
    const hour = Number(parts.find((p) => p.type === 'hour')?.value)
    if (Number.isFinite(hour)) return hour
  } catch {
    /* fall through */
  }
  return d.getHours()
}

/** 5–11 morning, 11–17 afternoon, 17–21 evening, 21–5 night. */
export function daypartFromIso(iso: string, tz?: string): Daypart {
  const hour = hourInTimeZone(iso, tz ?? resolvedDefaultTimeZone())
  if (hour >= 5 && hour < 11) return 'morning'
  if (hour >= 11 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 21) return 'evening'
  return 'night'
}

function fromNominatim(type?: string, cls?: string): PlaceType | null {
  const t = (type || '').toLowerCase().trim()
  const c = (cls || '').toLowerCase().trim()
  if (t && NOMINATIM_TYPE[t]) return NOMINATIM_TYPE[t]
  if (c === 'highway') return 'street'
  if (c === 'railway' || c === 'public_transport') return 'transit'
  if (c === 'office') return 'work'
  if (c === 'leisure' && (t === 'park' || t === 'garden')) return 'park'
  if (c === 'natural' && t === 'beach') return 'beach'
  if (c === 'amenity' && NOMINATIM_TYPE[t]) return NOMINATIM_TYPE[t]
  return null
}

export function classifyPlaceType(
  placeName: string,
  nominatimType?: string,
  nominatimClass?: string,
): PlaceType {
  const osm = fromNominatim(nominatimType, nominatimClass)
  if (osm) return osm
  const blob = [placeName, nominatimType, nominatimClass].filter(Boolean).join(' ')
  for (const rule of NAME_RULES) {
    if (rule.re.test(blob)) return rule.type
  }
  return 'other'
}

export function pickPlaceType(
  modelType: PlaceType | undefined,
  classified: PlaceType,
): PlaceType {
  if (modelType && PLACE_TYPES.includes(modelType) && modelType !== 'other') return modelType
  return classified
}

export function mergePlaceSignals(
  insight: Insight,
  placeName: string,
  atIso: string,
  opts?: {
    nominatimType?: string
    nominatimClass?: string
    language?: SpokenLanguage
    tz?: string
  },
): Insight {
  const classified = classifyPlaceType(placeName, opts?.nominatimType, opts?.nominatimClass)
  return {
    ...insight,
    daypart: daypartFromIso(atIso, opts?.tz),
    placeType: pickPlaceType(insight.placeType, classified),
    language: opts?.language ?? insight.language,
  }
}
