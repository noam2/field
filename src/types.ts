export type Outcome = 'number' | 'chat' | 'date' | 'talked' | 'no' | 'other'
export type Feel = 1 | 2 | 3
export type ApproachSource = 'auto' | 'manual' | 'recording'
export type AnalysisSource = 'rules' | 'model' | 'pending'
export type Sentiment = 'positive' | 'mixed' | 'negative' | 'neutral'
export type Energy = 'low' | 'medium' | 'high'
export type PlaceType =
  | 'beach'
  | 'bar'
  | 'club'
  | 'cafe'
  | 'restaurant'
  | 'library'
  | 'park'
  | 'gym'
  | 'street'
  | 'home'
  | 'work'
  | 'transit'
  | 'other'
export type Daypart = 'morning' | 'afternoon' | 'evening' | 'night'
export type SpokenLanguage = 'he' | 'en' | 'mixed'
export type SpeechLangPref = 'auto' | 'he' | 'en'

export const PLACE_TYPES: PlaceType[] = [
  'beach',
  'bar',
  'club',
  'cafe',
  'restaurant',
  'library',
  'park',
  'gym',
  'street',
  'home',
  'work',
  'transit',
  'other',
]

export const DAYPARTS: Daypart[] = ['morning', 'afternoon', 'evening', 'night']

export const SPOKEN_LANGUAGES: SpokenLanguage[] = ['he', 'en', 'mixed']

export type TranscriptAnalysis = {
  wordCount: number
  questionCount: number
  exchangedContact: boolean
  scheduled: boolean
  commitments: string[]
  topics: string[]
  outcome: Outcome
  followUpAt: string | null
  summary: string
}

export type Insight = {
  sentiment: Sentiment
  success: boolean
  valence: number
  outcome: Outcome
  who: string
  scene: string
  topics: string[]
  commitments: string[]
  objections: string[]
  questionsAsked: number
  energy: Energy
  summary: string
  followUpSuggestion: string | null
  whatWorked: string
  nextAction: string
  exchangedContact: boolean
  scheduled: boolean
  rejection: boolean
  isApproach: boolean
  model: string
  placeType?: PlaceType
  daypart?: Daypart
  language?: SpokenLanguage
}

export type Approach = {
  id: string
  at: string
  place: string
  who: string
  opener: string
  notes: string
  outcome: Outcome
  feel: Feel | null
  followUpAt: string | null
  followUpDone: boolean
  createdAt: string
  updatedAt: string
  source: ApproachSource
  lat: number | null
  lng: number | null
  accuracy: number | null
  dwellSeconds: number | null
  sessionId: string | null
  endedAt: string | null
  transcript: string
  analysis: TranscriptAnalysis | null
  audioId: string | null
  analysisSource: AnalysisSource
  insight: Insight | null
}

export type Session = {
  id: string
  startedAt: string
  endedAt: string | null
}

export type AudioClip = {
  id: string
  conversationId: string
  blob: Blob
  mimeType: string
  createdAt: string
}

export type Tab = 'log' | 'next' | 'stats' | 'history'

export type BackupFile = {
  exportedAt: string
  approaches: Approach[]
  sessions?: Session[]
}

export type UnderstandContext = {
  at: string
  place: string
  durationSec: number
  lat: number | null
  lng: number | null
}
