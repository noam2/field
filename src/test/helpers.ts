import { analyzeTranscript } from '../analyze'
import type { Approach, TranscriptAnalysis } from '../types'

export function approach(over: Partial<Approach> = {}): Approach {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    at: now,
    place: 'Café',
    who: '',
    opener: '',
    notes: '',
    outcome: 'talked',
    feel: null,
    followUpAt: null,
    followUpDone: false,
    createdAt: now,
    updatedAt: now,
    source: 'manual',
    lat: null,
    lng: null,
    accuracy: null,
    dwellSeconds: null,
    sessionId: null,
    endedAt: null,
    transcript: '',
    analysis: null,
    audioId: null,
    ...over,
  }
}

export function recording(
  transcript: string,
  over: Partial<Approach> = {},
  durationSec = 90,
): Approach {
  const analysis: TranscriptAnalysis = analyzeTranscript(transcript, durationSec)
  return approach({
    source: 'recording',
    transcript,
    analysis,
    outcome: analysis.outcome,
    followUpAt: analysis.followUpAt,
    notes: analysis.summary,
    dwellSeconds: durationSec,
    ...over,
  })
}
