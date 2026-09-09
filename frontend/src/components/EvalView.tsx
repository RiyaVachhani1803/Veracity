'use client'

import { EvalComplete, ModelEvalResult } from '../types'

const DIM_LABELS: Record<string, string> = {
  factuality:            'Factuality',
  hallucination_rate:    'Hallucination Safety',
  reasoning:             'Reasoning Quality',
  instruction_following: 'Instruction Follow',
}

const DIM_COLORS: Record<string, string> = {
  factuality:            '#6366f1',
  hallucination_rate:    '#10b981',
  reasoning:             '#f59e0b',
  instruction_following: '#60a5fa',
}

function scoreToGrade(score: number): string {
  if (score >= 0.85) return 'A'
  if (score >= 0.70) return 'B'
  if (score >= 0.55) return 'C'
  if (score >= 0.40) return 'D'
  return 'F'
}

function ScoreRing({ score, size = 56 }: { score: number; size?: number }) {
  const r   = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const fill = circ * score
  const grade = scoreToGrade(score)

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r}
        fill="none" stroke="rgba(0,0,0,0.04)" strokeWidth={4} />
      <circle cx={size/2} cy={size/2} r={r}
        fill="none" stroke="#6366f1" strokeWidth={4}
        strokeDasharray={`${fill} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: 'stroke-dasharray 0.8s ease' }}
      />
      <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle"
        fill="#0f172a" fontSize={size > 48 ? 11 : 9} fontWeight="700"
        fontFamily="monospace">
        {grade}
      </text>
    </svg>
  )
}

function ModelCard({
  result, isWinner, dimWinners, otherScore
}: {
  result: ModelEvalResult
  isWinner: boolean
  dimWinners: Record<string, string>
  otherScore: number
}) {
  const margin = ((result.overall_score - otherScore) * 100).toFixed(1)
  const ahead  = result.overall_score > otherScore

  return (
    <div className={`eval-model-card${isWinner ? ' winner-card' : ''}`} style={{ marginBottom: 12 }}>
      <div className="eval-card-header">
        <div>
          <div className="eval-model-name" style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f172a' }}>{result.model_label}</div>
          <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 2 }}>
            {result.tokens_total} tokens · {result.latency_ms.toFixed(0)}ms
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {isWinner && <span className="badge badge-winner">🏆 Winner</span>}
          <span className="badge badge-score">
            {(result.overall_score * 100).toFixed(1)}%
          </span>
        </div>
      </div>

      <div className="eval-card-body" style={{ padding: 16 }}>
        {/* Score ring + margin */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          <ScoreRing score={result.overall_score} size={60} />
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a',
              fontFamily: 'monospace' }}>
              {(result.overall_score * 100).toFixed(1)}
              <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 400 }}>%</span>
            </div>
            {ahead ? (
              <div style={{ fontSize: '0.72rem', color: '#10b981' }}>
                +{margin}% ahead
              </div>
            ) : (
              <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                {Math.abs(Number(margin))}% behind
              </div>
            )}
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Hallucination</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, fontFamily: 'monospace',
              color: result.hallucination_rate < 0.1 ? '#10b981' : '#f59e0b' }}>
              {(result.hallucination_rate * 100).toFixed(1)}%
            </div>
            <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 4 }}>Corrections</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, fontFamily: 'monospace',
              color: result.corrections === 0 ? '#10b981' : '#ef4444' }}>
              {result.corrections}
            </div>
          </div>
        </div>

        {/* Dimension bars */}
        <div className="dim-list" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {Object.entries(DIM_LABELS).map(([key, label]) => {
            const dim     = result.dimensions[key]
            const score   = dim?.score ?? 0
            const won     = dimWinners[key] === result.model_id
            return (
              <div key={key} className="dim-row" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="dim-lbl" style={{ fontSize: '0.72rem', color: '#475569', width: 130, flexShrink: 0 }}>
                  {won && <span style={{ color: '#6366f1', marginRight: 4 }}>▸</span>}
                  {label}
                </div>
                <div className="dim-track" style={{ flex: 1, height: 4, background: '#f1f5f9', borderRadius: 2, overflow: 'hidden' }}>
                  <div
                    className="dim-fill"
                    style={{
                      height:     '100%',
                      width:      `${score * 100}%`,
                      background: DIM_COLORS[key] || '#6366f1',
                      opacity:    won ? 1 : 0.55,
                    }}
                  />
                </div>
                <div className="dim-pct" style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: '#64748b', width: 32, textAnchor: 'middle', textAlign: 'right' }}>
                  {(score * 100).toFixed(0)}%
                </div>
              </div>
            )
          })}
        </div>

        {/* Response preview */}
        <div style={{ fontSize: '0.65rem', color: '#64748b',
          textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
          Response Preview
        </div>
        <div style={{
          background: '#f8fafc', border: '1px solid rgba(0,0,0,0.05)',
          borderRadius: 6, padding: '8px 12px', fontSize: '0.72rem', color: '#475569',
          fontFamily: 'monospace', lineHeight: 1.5, overflowX: 'auto',
          maxHeight: 90, overflowY: 'auto'
        }}>
          {result.response.slice(0, 300)}{result.response.length > 300 ? '…' : ''}
        </div>
      </div>
    </div>
  )
}

interface EvalViewProps {
  evalResult: EvalComplete | null
  isLoading: boolean
  loadingStatus: string
}

export default function EvalView({ evalResult, isLoading, loadingStatus }: EvalViewProps) {
  if (isLoading) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '3rem 2rem', gap: 12, background: '#ffffff', border: '1px solid rgba(0,0,0,0.06)',
        borderRadius: 10, textAlign: 'center'
      }}>
        <div style={{ fontSize: '1.8rem', animation: 'spin 2s linear infinite' }}>⚙️</div>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f172a' }}>
          {loadingStatus || 'Running evaluation...'}
        </div>
        <div style={{ width: '100%', maxWidth: 280, height: 4, background: 'rgba(0,0,0,0.04)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: '60%', background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
            borderRadius: 2, animation: 'pulse 1.5s infinite ease-in-out'
          }} />
        </div>
        <div style={{ fontSize: '0.72rem', color: '#64748b', maxWidth: 360, lineHeight: 1.4 }}>
          Running both models in parallel · Scoring dimensions · LLM-as-judge comparison
        </div>
      </div>
    )
  }

  if (!evalResult) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '3rem 2rem', gap: 12, background: '#ffffff', border: '1px solid rgba(0,0,0,0.06)',
        borderRadius: 10, textAlign: 'center'
      }}>
        <div style={{ fontSize: '1.4rem' }}>⚖️</div>
        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0f172a' }}>Evaluation Mode</div>
        <div style={{ fontSize: '0.75rem', color: '#64748b', maxWidth: 380, lineHeight: 1.5 }}>
          Submit a query to run Ollama (llama3) vs Ollama (mistral)
          through the multi-dimensional evaluation framework.
          Results include factuality, hallucination rate, reasoning, and
          instruction-following scores with LLM-as-judge comparison.
        </div>
      </div>
    )
  }

  const [modelA, modelB] = evalResult.models
  if (!modelA || !modelB) return null

  return (
    <>
      {/* Verdict */}
      <div className="verdict-strip" style={{ display: 'flex', gap: 16, alignItems: 'flex-start', padding: 16, marginBottom: 12 }}>
        <div className="verdict-trophy">🏆</div>
        <div style={{ flex: 1 }}>
          <div className="verdict-winner-label" style={{ fontSize: '0.95rem', fontWeight: 700 }}>
            {evalResult.winner_label} Wins
          </div>
          <div className="verdict-text" style={{ fontSize: '0.75rem', color: '#475569', marginTop: 4, lineHeight: 1.5 }}>
            {evalResult.verdict}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 8, fontStyle: 'italic', lineHeight: 1.4 }}>
            {evalResult.rationale}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            {Object.entries(evalResult.dimension_winner).map(([dim, winner_id]) => {
              const winner = evalResult.models.find(m => m.model_id === winner_id)
              return (
                <span key={dim} style={{
                  fontSize: '0.62rem', background: 'rgba(0,0,0,0.03)',
                  border: '1px solid rgba(0,0,0,0.06)', borderRadius: 4,
                  padding: '2px 6px', color: '#475569'
                }}>
                  {DIM_LABELS[dim] || dim}: <strong style={{ color: '#6366f1' }}>{winner?.model_label || winner_id}</strong>
                </span>
              )
            })}
          </div>
        </div>
      </div>

      {/* Model cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <ModelCard
          result={modelA}
          isWinner={evalResult.winner === modelA.model_id}
          dimWinners={evalResult.dimension_winner}
          otherScore={modelB.overall_score}
        />
        <ModelCard
          result={modelB}
          isWinner={evalResult.winner === modelB.model_id}
          dimWinners={evalResult.dimension_winner}
          otherScore={modelA.overall_score}
        />
      </div>
    </>
  )
}
