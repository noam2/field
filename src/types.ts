export type Outcome = 'number' | 'chat' | 'date' | 'talked' | 'no' | 'other'
export type Feel = 1 | 2 | 3
export type ApproachSource = 'auto' | 'manual' | 'recording'

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
