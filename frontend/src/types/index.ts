export interface Token {
  id: string
  text: string
  status: 'streaming' | 'verified' | 'corrected' | 'skipped' | 'high_entropy'
  entropy: number
  correction?: string
  source?: string
  timestamp: number
}

export interface StreamEvent {
  event_type:
    | 'token' | 'correction' | 'stats' | 'done' | 'error'
    | 'eval_start' | 'eval_progress' | 'eval_complete' | 'model_done'
  data: Record<string, any>
  model_id?: string
}

export interface SessionStats {
  total_claims_detected: number
  claims_verified: number
  claims_skipped: number
  hallucinations_found: number
  corrections_made: number
  avg_verification_latency_ms: number
  total_pipeline_latency_ms: number
  model_id?: string
}

export interface EvalDimension {
  name: string
  score: number
  rationale: string
  evidence?: string
}

export interface ModelEvalResult {
  model_id: string
  model_label: string
  overall_score: number
  dimensions: Record<string, EvalDimension>
  hallucination_rate: number
  avg_entropy: number
  peak_entropy: number
  corrections: number
  latency_ms: number
  tokens_total: number
  response: string
}

export interface EvalComplete {
  session_id: string
  winner: string
  winner_label: string
  verdict: string
  rationale: string
  dimension_winner: Record<string, string>
  dimension_weights: Record<string, number>
  models: ModelEvalResult[]
}

export interface CorrectionEvent {
  original_claim: string
  original_sentence: string
  corrected_sentence: string
  source: string
  similarity_score: number
  nli_label: string
  nli_confidence: number
  diff_ratio: number
}

export type AppMode = 'firewall' | 'eval'