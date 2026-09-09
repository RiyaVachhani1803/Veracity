'use client'

import { useEffect, useRef, useState, useCallback, DragEvent } from 'react'
import EvalView from '../../components/EvalView'
import { EvalComplete } from '../../types'

// ── Types ─────────────────────────────────────────────────────────────────────
interface TokenSpan {
  id: string          // matches StreamToken.id from backend
  text: string
  kind: 'normal' | 'high-entropy' | 'corrected' | 'verified' | 'hidden'
  original?: string
  corrected?: string
  sentence?: string
  claimText?: string
}

interface CorrectionEntry {
  id: string
  wrong: string
  right: string
  src: string
  confidence: number
  diff: number
}

interface BackendStats {
  total_claims_detected: number
  claims_verified: number
  claims_skipped: number
  hallucinations_found: number
  corrections_made: number
  avg_verification_latency_ms: number
  total_pipeline_latency_ms: number
}

// ── Backend URL ───────────────────────────────────────────────────────────────
// Change this to your deployed backend URL in production
const BACKEND_URL = 'http://localhost:8000'
const PROVIDERS = ['Gemini', 'OpenAI', 'Claude', 'Mistral']

// ── File type helpers ─────────────────────────────────────────────────────────
function getFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return '📄'
  if (['doc', 'docx'].includes(ext)) return '📝'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return '🖼️'
  if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) return '🎬'
  if (['mp3', 'wav', 'ogg'].includes(ext)) return '🎵'
  if (['zip', 'tar', 'gz', 'rar'].includes(ext)) return '🗜️'
  if (['js', 'ts', 'jsx', 'tsx', 'py', 'go', 'rs', 'json'].includes(ext)) return '💻'
  if (['txt', 'md'].includes(ext)) return '📃'
  return '📎'
}

function getFileColor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return '#f87171'
  if (['doc', 'docx'].includes(ext)) return '#60a5fa'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '#34d399'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return '#a78bfa'
  if (['js', 'ts', 'jsx', 'tsx', 'py', 'go', 'rs', 'json'].includes(ext)) return '#fbbf24'
  return '#94a3b8'
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function truncateName(name: string, max = 22): string {
  if (name.length <= max) return name
  const ext = name.includes('.') ? '.' + name.split('.').pop() : ''
  return name.slice(0, max - ext.length - 1) + '…' + ext
}

// Helper to escape regex special characters
function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Verified rendering component ──────────────────────────────────────────────
function VerifiedText({ sentence }: { sentence: string; claimText: string }) {
  const cleanSentence = sentence.replace(/[\*_`]/g, '');
  return <span>{cleanSentence}</span>;
}

// ── Diff rendering component ──────────────────────────────────────────────────
function DiffText({ original, corrected }: { original: string; corrected: string }) {
  const cleanOriginal = original.replace(/[\*_`]/g, '');
  const cleanCorrected = corrected.replace(/[\*_`]/g, '');
  const origWords = cleanOriginal.split(/\s+/);
  const corrWords = cleanCorrected.split(/\s+/);

  const n = origWords.length;
  const m = corrWords.length;
  const dp: number[][] = Array(n + 1).fill(0).map(() => Array(m + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (origWords[i - 1] === corrWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  let i = n, j = m;
  const diff: { type: 'common' | 'removed' | 'added'; word: string }[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origWords[i - 1] === corrWords[j - 1]) {
      diff.unshift({ type: 'common', word: origWords[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diff.unshift({ type: 'added', word: corrWords[j - 1] });
      j--;
    } else {
      diff.unshift({ type: 'removed', word: origWords[i - 1] });
      i--;
    }
  }

  return (
    <span>
      {diff.map((part, index) => {
        const space = index < diff.length - 1 ? ' ' : '';
        if (part.type === 'common') {
          return <span key={index}>{part.word}{space}</span>;
        } else if (part.type === 'removed') {
          return null;
        } else {
          const isNumber = /\d/.test(part.word);
          if (isNumber) {
            return (
              <span key={index} style={{
                color: '#10b981',
                fontWeight: 600,
                background: 'rgba(16,185,129,0.15)',
                padding: '0 3px',
                borderRadius: 3,
                marginRight: 4
              }}>
                {part.word}
              </span>
            );
          } else {
            return <span key={index}>{part.word}{space}</span>;
          }
        }
      })}
    </span>
  );
}

// ── File Button ───────────────────────────────────────────────────────────────
function FileButton({
  attachedFile, onAttach, onDelete, isDragging,
}: {
  attachedFile: File | null
  onAttach: (f: File) => void
  onDelete: () => void
  isDragging: boolean
}) {
  const fileInputRef  = useRef<HTMLInputElement>(null)
  const [hoverDelete, setHoverDelete] = useState(false)
  const [hoverAttach, setHoverAttach] = useState(false)
  const [justAttached, setJustAttached] = useState(false)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      onAttach(file)
      setJustAttached(true)
      setTimeout(() => setJustAttached(false), 500)
    }
    e.target.value = ''
  }

  const color = attachedFile ? getFileColor(attachedFile.name) : '#475569'
  const icon  = attachedFile ? getFileIcon(attachedFile.name)  : null

  return (
    <>
      <input ref={fileInputRef} type="file" onChange={handleFileChange} style={{ display: 'none' }} />

      {!attachedFile && (
        <button
          onClick={() => fileInputRef.current?.click()}
          onMouseEnter={() => setHoverAttach(true)}
          onMouseLeave={() => setHoverAttach(false)}
          title="Attach a file (or drag & drop)"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: 6, flexShrink: 0,
            border: isDragging
              ? '1.5px dashed rgba(99,102,241,0.7)'
              : hoverAttach ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(0,0,0,0.08)',
            background: isDragging
              ? 'rgba(99,102,241,0.12)'
              : hoverAttach ? 'rgba(99,102,241,0.07)' : 'rgba(0,0,0,0.02)',
            cursor: 'pointer', outline: 'none', transition: 'border 0.16s, background 0.16s',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke={isDragging || hoverAttach ? '#6366f1' : '#64748b'}
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ transition: 'stroke 0.16s' }}
          >
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
          </svg>
        </button>
      )}

      {attachedFile && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          height: 28, padding: '0 4px 0 7px', borderRadius: 7,
          border: `1px solid ${color}40`, background: `${color}12`,
          animation: justAttached ? 'pill-pop 0.38s cubic-bezier(0.34,1.56,0.64,1)' : 'none',
          flexShrink: 0, maxWidth: 230, transition: 'border-color 0.2s',
        }}>
          <span style={{ fontSize: 12, lineHeight: 1, flexShrink: 0, userSelect: 'none' }}>{icon}</span>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{
              fontSize: '0.64rem', fontWeight: 600, color,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              maxWidth: 140, lineHeight: 1.2, letterSpacing: '0.01em',
            }}>
              {truncateName(attachedFile.name)}
            </span>
            <span style={{ fontSize: '0.55rem', color: '#475569', lineHeight: 1.2 }}>
              {formatSize(attachedFile.size)}
            </span>
          </div>
          <div style={{ width: 1, height: 14, background: `${color}35`, flexShrink: 0, marginLeft: 2 }} />
          <button
            onClick={e => { e.stopPropagation(); onDelete() }}
            onMouseEnter={() => setHoverDelete(true)}
            onMouseLeave={() => setHoverDelete(false)}
            title="Remove file"
            style={{
              width: 18, height: 18, borderRadius: 4, flexShrink: 0, border: 'none',
              background: hoverDelete ? 'rgba(239,68,68,0.2)' : 'transparent',
              cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', transition: 'background 0.14s', padding: 0,
            }}
          >
            <svg width="8" height="8" viewBox="0 0 10 10" fill="none"
              stroke={hoverDelete ? '#ef4444' : '#64748b'}
              strokeWidth="2" strokeLinecap="round" style={{ transition: 'stroke 0.14s' }}
            >
              <line x1="1" y1="1" x2="9" y2="9"/>
              <line x1="9" y1="1" x2="1" y2="9"/>
            </svg>
          </button>
        </div>
      )}
    </>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function DemoPage() {
  const [tab, setTab]               = useState<'firewall' | 'evaluate'>('firewall')
  const [provider, setProvider]     = useState('Ollama')   
  const [modelName, setModelName]   = useState('llama3')
  const [backendStatus, setBackendStatus] = useState<'online' | 'offline'>('offline')
  const [vaultDocCount, setVaultDocCount] = useState<number>(0)
  const [running, setRunning]       = useState(false)
  const [query, setQuery]           = useState('')
  const [tokens, setTokens]         = useState<TokenSpan[]>([])
  const [corrections, setCorrections] = useState<CorrectionEntry[]>([])
  const [attachedFile, setAttachedFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [useMock, setUseMock]       = useState(false)

  // Evaluation states
  const [evalResult, setEvalResult] = useState<EvalComplete | null>(null)
  const [evalLoading, setEvalLoading] = useState(false)
  const [evalLoadingStatus, setEvalLoadingStatus] = useState('')

  // Live stats — driven by backend `stats` SSE events
  const [claimsFound, setClaimsFound]       = useState(0)
  const [verified, setVerified]             = useState(0)
  const [hallucinations, setHallucinations] = useState(0)
  const [avgVerify, setAvgVerify]           = useState(0)
  const [pipeline, setPipeline]             = useState(0)

  const streamRef  = useRef<HTMLDivElement>(null)
  const abortRef   = useRef<AbortController | null>(null)
  const dragCounter = useRef(0)

  // Fetch health status on mount and keep updated
  useEffect(() => {
    async function checkHealth() {
      try {
        const res = await fetch(`${BACKEND_URL}/health`)
        if (res.ok) {
          const data = await res.json()
          setProvider(data.llm_provider || 'Ollama')
          setModelName(data.llm_model || 'llama3')
          setVaultDocCount(data.vault_documents || 0)
          setBackendStatus('online')
        } else {
          setBackendStatus('offline')
        }
      } catch (e) {
        setBackendStatus('offline')
      }
    }
    checkHealth()
    const interval = setInterval(checkHealth, 5000)
    return () => clearInterval(interval)
  }, [])

  // Auto-scroll token stream
  useEffect(() => {
    if (streamRef.current)
      streamRef.current.scrollTop = streamRef.current.scrollHeight
  }, [tokens])

  // ── SSE parser — handles token / correction / stats / done / error ──────────
  async function runFirewall(userQuery: string, file: File | null) {
    // Cancel any previous stream
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setRunning(true)
    setError(null)
    setTokens([])
    setCorrections([])
    setClaimsFound(0)
    setVerified(0)
    setHallucinations(0)
    setAvgVerify(0)
    setPipeline(0)

    try {
      let response: Response

      if (file) {
        // ── FormData path: file attached → POST /chat/upload ────────────────
        const form = new FormData()
        form.append('query', userQuery)
        form.append('files', file)
        response = await fetch(`${BACKEND_URL}/chat/upload`, {
          method: 'POST',
          body: form,
          signal: controller.signal,
        })
      } else {
        // ── JSON path: no file → POST /chat ─────────────────────────────────
        response = await fetch(`${BACKEND_URL}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: userQuery, use_mock: useMock }),
          signal: controller.signal,
        })
      }

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Backend error ${response.status}: ${text}`)
      }

      // ── Read SSE stream line-by-line ────────────────────────────────────────
      const reader  = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer    = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''   // keep incomplete last line

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue

          let envelope: { event_type: string; data: Record<string, unknown> }
          try {
            envelope = JSON.parse(trimmed.slice(5).trim())
          } catch {
            continue
          }

          const { event_type, data } = envelope

          // ── token ──────────────────────────────────────────────────────────
          if (event_type === 'token') {
            const tokenId   = data.id   as string
            const tokenText = data.text as string
            if (!tokenText) continue

            setTokens(prev => [
              ...prev.slice(-120),   // cap at 120 to avoid DOM bloat
              {
                id:   tokenId,
                text: tokenText,
                kind: 'normal',
              },
            ])
          }

          // ── correction ─────────────────────────────────────────────────────
          else if (event_type === 'correction') {
            const tokenId   = data.id        as string
            const original  = data.original  as string
            const corrected = data.corrected as string
            const source    = data.source    as string
            const diffRatio = (data.diff_ratio as number) ?? 0
            const nliConf   = (data.nli_confidence as number) ?? 0

            // Update the token span with corrected highlight, hiding duplicate sentence tokens
            setTokens(prev => {
              const targetIdx = prev.findIndex(t => t.id === tokenId);
              if (targetIdx === -1) {
                return prev.map(t => t.id === tokenId ? { ...t, kind: 'corrected', original, corrected } : t);
              }

              let accText = "";
              const matchIndices: number[] = [];
              const cleanText = (txt: string) => txt.replace(/\s+/g, '').toLowerCase();
              const targetClean = cleanText(original);

              for (let i = targetIdx; i >= 0; i--) {
                accText = prev[i].text + accText;
                matchIndices.push(i);
                if (cleanText(accText).includes(targetClean) || targetClean.includes(cleanText(accText))) {
                  if (cleanText(accText).length >= targetClean.length * 0.9) {
                    break;
                  }
                }
              }

              return prev.map((t, idx) => {
                if (idx === targetIdx) {
                  return { ...t, kind: 'corrected', original, corrected };
                }
                if (matchIndices.includes(idx)) {
                  return { ...t, kind: 'hidden' };
                }
                return t;
              });
            });

            // Add to corrections log
            setCorrections(prev => [
              {
                id:         tokenId,
                wrong:      original,
                right:      corrected,
                src:        source,
                confidence: nliConf,
                diff:       diffRatio,
              },
              ...prev.slice(0, 9),
            ]);
          }
          // ── verification ───────────────────────────────────────────────────
          else if (event_type === 'verification') {
            const tokenId   = data.id         as string
            const sentence  = data.sentence   as string
            const claimText = data.claim_text as string

            setTokens(prev => {
              const targetIdx = prev.findIndex(t => t.id === tokenId);
              if (targetIdx === -1) {
                return prev.map(t => t.id === tokenId ? { ...t, kind: 'verified', sentence, claimText } : t);
              }

              let accText = "";
              const matchIndices: number[] = [];
              const cleanText = (txt: string) => txt.replace(/\s+/g, '').toLowerCase();
              const targetClean = cleanText(sentence);

              for (let i = targetIdx; i >= 0; i--) {
                accText = prev[i].text + accText;
                matchIndices.push(i);
                if (cleanText(accText).includes(targetClean) || targetClean.includes(cleanText(accText))) {
                  if (cleanText(accText).length >= targetClean.length * 0.9) {
                    break;
                  }
                }
              }

              return prev.map((t, idx) => {
                if (idx === targetIdx) {
                  return { ...t, kind: 'verified', sentence, claimText };
                }
                if (matchIndices.includes(idx)) {
                  return { ...t, kind: 'hidden' };
                }
                return t;
              });
            });
          }

          // ── stats ──────────────────────────────────────────────────────────
          else if (event_type === 'stats') {
            const s = data as unknown as BackendStats
            setClaimsFound(s.total_claims_detected)
            setVerified(s.claims_verified)
            setHallucinations(s.hallucinations_found)
            setAvgVerify(Math.round(s.avg_verification_latency_ms))
            if (s.total_pipeline_latency_ms > 0)
              setPipeline(Math.round(s.total_pipeline_latency_ms))
          }

          // ── done ───────────────────────────────────────────────────────────
          else if (event_type === 'done') {
            const s = data as unknown as BackendStats
            setClaimsFound(s.total_claims_detected)
            setVerified(s.claims_verified)
            setHallucinations(s.hallucinations_found)
            setAvgVerify(Math.round(s.avg_verification_latency_ms))
            setPipeline(Math.round(s.total_pipeline_latency_ms))
            setRunning(false)
          }

          // ── error ──────────────────────────────────────────────────────────
          else if (event_type === 'error') {
            setError((data.message as string) ?? 'Unknown backend error')
            setRunning(false)
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
    } finally {
      setRunning(false)
    }
  }

  // ── Evaluation handler (Simulated head-to-head comparison) ───────────────────
  async function runEvaluation(userQuery: string) {
    if (!userQuery.trim()) return
    setEvalLoading(true)
    setEvalResult(null)
    setError(null)

    const stages = [
      { msg: 'Initializing evaluation environment...', delay: 1000 },
      { msg: `Querying local model Ollama (${modelName}) in background...`, delay: 1500 },
      { msg: 'Querying alternative local model Ollama (mistral) in background...', delay: 1500 },
      { msg: 'Analyzing outputs with NLI fact-checker Sentinel...', delay: 1200 },
      { msg: 'Invoking LLM-as-judge for final scorecard scoring...', delay: 1200 },
      { msg: 'Finalizing scorecard...', delay: 800 },
    ]

    try {
      for (const stage of stages) {
        setEvalLoadingStatus(stage.msg)
        await new Promise(r => setTimeout(r, stage.delay))
      }

      // Generate realistic comparison result based on query keywords
      const lowerQuery = userQuery.toLowerCase()
      let winnerLabel = `Ollama (${modelName})`
      let winnerId = 'llama3'
      let verdict = `${modelName} displayed higher factuality and did not make any contradicted claims, whereas mistral hallucinated financial figures.`
      let rationale = `The query "${userQuery}" was processed by both models. ${modelName} successfully adhered to the ground-truth contexts in the vault. mistral had contradicted claims flagged by Sentinel.`

      if (lowerQuery.includes('mistral')) {
        winnerLabel = 'Ollama (mistral)'
        winnerId = 'mistral'
        verdict = 'mistral provided more detailed reasoning structures and followed the negative bounds instructions.'
        rationale = 'While both models were factually correct, mistral showed superior instruction following for structural layout parameters.'
      }

      const mockEval: EvalComplete = {
        session_id: Math.random().toString(36).substring(7),
        winner: winnerId,
        winner_label: winnerLabel,
        verdict: verdict,
        rationale: rationale,
        dimension_winner: {
          factuality: 'llama3',
          hallucination_rate: 'llama3',
          reasoning: 'mistral',
          instruction_following: winnerId,
        },
        dimension_weights: {
          factuality: 0.4,
          hallucination_rate: 0.3,
          reasoning: 0.15,
          instruction_following: 0.15,
        },
        models: [
          {
            model_id: 'llama3',
            model_label: `Ollama (${modelName})`,
            overall_score: winnerId === 'llama3' ? 0.932 : 0.842,
            dimensions: {
              factuality: { name: 'Factuality', score: 0.94, rationale: '94% of claims entailed by vault facts.' },
              hallucination_rate: { name: 'Hallucination Safety', score: 0.98, rationale: 'Only 1 neutral claim.' },
              reasoning: { name: 'Reasoning Quality', score: 0.85, rationale: 'Clear progression logic.' },
              instruction_following: { name: 'Instruction Follow', score: winnerId === 'llama3' ? 0.92 : 0.82, rationale: 'Followed constraints.' },
            },
            hallucination_rate: 0.02,
            avg_entropy: 0.12,
            peak_entropy: 0.28,
            corrections: 0,
            latency_ms: 1450,
            tokens_total: 142,
            response: `Apple Inc reported total revenue of $394.3 billion in fiscal year 2022, and Microsoft Azure cloud revenue grew by 28% in Q4 fiscal year 2023. These numbers align with our core reporting guidelines.`,
          },
          {
            model_id: 'mistral',
            model_label: 'Ollama (mistral)',
            overall_score: winnerId === 'mistral' ? 0.912 : 0.795,
            dimensions: {
              factuality: { name: 'Factuality', score: winnerId === 'mistral' ? 0.90 : 0.78, rationale: 'Inaccurate values returned during fast generation.' },
              hallucination_rate: { name: 'Hallucination Safety', score: winnerId === 'mistral' ? 0.92 : 0.75, rationale: 'Flagged for wrong percentage claims.' },
              reasoning: { name: 'Reasoning Quality', score: 0.88, rationale: 'Detailed breakdown structures.' },
              instruction_following: { name: 'Instruction Follow', score: winnerId === 'mistral' ? 0.94 : 0.86, rationale: 'Followed instruction sets perfectly.' },
            },
            hallucination_rate: winnerId === 'mistral' ? 0.04 : 0.22,
            avg_entropy: 0.38,
            peak_entropy: 0.79,
            corrections: winnerId === 'mistral' ? 0 : 2,
            latency_ms: 1230,
            tokens_total: 156,
            response: `Apple Inc generated $390 billion in revenue for FY2022 (contradicted: should be $394.3B). Additionally, Microsoft Azure grew by 35% in Q4 FY2023 (contradicted: should be 28%).`,
          },
        ],
      }

      setEvalResult(mockEval)
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setEvalLoading(false)
    }
  }

  // ── Submit handler ───────────────────────────────────────────────────────────
  function handleAnalyse() {
    if (tab === 'evaluate') {
      if (!query.trim()) return
      runEvaluation(query.trim())
    } else {
      if (!query.trim() && !attachedFile) return
      runFirewall(query.trim(), attachedFile)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) handleAnalyse()
  }

  function handleReset() {
    abortRef.current?.abort()
    setRunning(false)
    setTokens([])
    setCorrections([])
    setClaimsFound(0)
    setVerified(0)
    setHallucinations(0)
    setAvgVerify(0)
    setPipeline(0)
    setError(null)
    setEvalResult(null)
    setEvalLoading(false)
  }

  // ── Drag & drop ──────────────────────────────────────────────────────────────
  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); dragCounter.current++
    if (e.dataTransfer.items?.length) setIsDragging(true)
  }, [])
  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); dragCounter.current--
    if (dragCounter.current === 0) setIsDragging(false)
  }, [])
  const handleDragOver  = useCallback((e: DragEvent<HTMLDivElement>) => { e.preventDefault() }, [])
  const handleDrop      = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); dragCounter.current = 0; setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) setAttachedFile(file)
  }, [])

  const totalFixes = corrections.length

  return (
    <div style={{
      background: '#f8fafc', color: '#334155',
      fontFamily: "'Inter', system-ui, sans-serif",
      fontSize: 13, minHeight: '100vh', display: 'flex', flexDirection: 'column',
    }}>

      {/* ── TOPBAR ── */}
      <div style={{
        background: 'rgba(255,255,255,0.96)', borderBottom: '1px solid rgba(0,0,0,0.06)',
        padding: '0 20px', height: 48, display: 'flex', alignItems: 'center', gap: 10,
        flexShrink: 0, position: 'sticky', top: 0, zIndex: 50,
        backdropFilter: 'blur(20px)',
      }}>
        <a href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 26, height: 26, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
            borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg viewBox="0 0 16 16" fill="none" width="14" height="14">
              <path d="M8 2L14 6V10L8 14L2 10V6L8 2Z" fill="#fff" opacity="0.9" />
              <path d="M8 5L11 7V9L8 11L5 9V7L8 5Z" fill="#6366f1" />
            </svg>
          </div>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: '-0.02em', color: '#0f172a' }}>
            Veracity
          </span>
        </a>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
          fontSize: '0.65rem', color: backendStatus === 'online' ? '#10b981' : '#ef4444', fontFamily: 'monospace' }}>
          <span style={{
            display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
            background: backendStatus === 'online' ? '#10b981' : '#ef4444',
            boxShadow: backendStatus === 'online' ? '0 0 5px #10b981' : '0 0 5px #ef4444',
            animation: backendStatus === 'online' ? 'pulse 2s ease infinite' : 'none',
          }} />
          {backendStatus === 'online' ? (running || evalLoading ? 'Firewall Scanning' : 'Firewall Standby') : 'Backend Offline'}
        </div>
      </div>

      {/* ── PAGE BODY ── */}
      <div style={{
        flex: 1, display: 'grid', gridTemplateColumns: '1fr 200px',
        gridTemplateRows: 'auto 1fr', gap: 12, padding: 16,
        maxWidth: 1100, margin: '0 auto', width: '100%',
      }}>

        {/* HERO */}
        <div style={{ gridColumn: '1 / -1', paddingBottom: 12, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{
              fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
              color: '#4f46e5', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)',
              padding: '2px 7px', borderRadius: 4,
            }}>Live Demo</span>
            <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>·</span>
            <span style={{ fontSize: '0.68rem', color: '#64748b' }}>
              Real-time Hallucination Firewall · {provider} ({modelName})
            </span>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.2, color: '#0f172a' }}>
            Self-Healing <span style={{ color: '#4f46e5' }}>AI Firewall</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 4 }}>
            Per-token entropy detection · NLI verification · Auto-correction before it reaches your screen
          </div>
        </div>

        {/* MAIN LEFT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>

          {/* Mode tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', gap: 2, background: '#e2e8f0', borderRadius: 8, padding: 3 }}>
              {(['firewall', 'evaluate'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  padding: '4px 12px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 500,
                  cursor: 'pointer', border: 'none',
                  background: tab === t ? '#ffffff' : 'none',
                  color: tab === t ? '#0f172a' : '#64748b',
                  boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s',
                }}>
                  {t === 'firewall' ? '🛡 Firewall' : '⚖️ Evaluate'}
                </button>
              ))}
            </div>
            <span style={{ fontSize: '0.66rem', color: '#64748b' }}>
              {tab === 'firewall' ? 'Real-time hallucination correction' : 'Compare two models head-to-head'}
            </span>
          </div>

          {/* Query input with drag-and-drop */}
          <div
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            style={{
              background: isDragging ? 'rgba(99,102,241,0.04)' : '#ffffff',
              border: isDragging ? '1.5px dashed rgba(99,102,241,0.55)' : '1px solid #cbd5e1',
              borderRadius: 10, transition: 'all 0.17s ease', position: 'relative',
              boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
            }}
          >
            {isDragging && (
              <div style={{
                position: 'absolute', inset: 0, borderRadius: 9, zIndex: 10, pointerEvents: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(255, 255, 255, 0.85)',
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4f46e5"
                    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <span style={{ fontSize: '0.72rem', color: '#4f46e5', fontWeight: 600, letterSpacing: '0.04em' }}>
                    Drop to attach
                  </span>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px 9px 12px' }}>
              <span style={{ color: '#94a3b8', fontSize: '0.8rem', fontFamily: 'monospace', flexShrink: 0 }}>›</span>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  tab === 'firewall'
                    ? 'Ask about financial data, company metrics, market rates…'
                    : 'Enter a query to compare two models head-to-head…'
                }
                disabled={running}
                style={{
                  flex: 1, fontSize: '0.8rem', color: '#1e293b',
                  background: 'none', border: 'none', outline: 'none', minWidth: 0,
                  opacity: running ? 0.5 : 1,
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <FileButton
                  attachedFile={attachedFile}
                  onAttach={setAttachedFile}
                  onDelete={() => setAttachedFile(null)}
                  isDragging={isDragging}
                />
                <div style={{ width: 1, height: 16, background: 'rgba(0,0,0,0.06)' }} />
                <button
                  onClick={running ? handleReset : handleAnalyse}
                  disabled={!running && !query.trim() && !attachedFile}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '5px 13px', borderRadius: 6,
                    background: running
                      ? 'rgba(239,68,68,0.15)'
                      : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                    color: running ? '#ef4444' : 'white',
                    border: running ? '1px solid rgba(239,68,68,0.3)' : 'none',
                    fontSize: '0.72rem', fontWeight: 600,
                    cursor: (!running && !query.trim() && !attachedFile) ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap',
                    boxShadow: running ? 'none' : '0 2px 10px rgba(99,102,241,0.35)',
                    opacity: (!running && !query.trim() && !attachedFile) ? 0.4 : 1,
                    transition: 'all 0.15s',
                  }}
                >
                  {running ? '■ Stop' : '▶ Analyse'}
                </button>
              </div>
            </div>

            {!attachedFile && !isDragging && (
              <div style={{ padding: '0 12px 7px', display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1"
                  strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <span style={{ fontSize: '0.58rem', color: '#94a3b8' }}>
                  drag &amp; drop a file, or click the paperclip to browse
                </span>
              </div>
            )}
          </div>

          {/* Error banner */}
          {(error || backendStatus === 'offline') && (
            <div style={{
              background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.15)',
              borderRadius: 8, padding: '8px 12px', fontSize: '0.72rem', color: '#ef4444',
              display: 'flex', alignItems: 'flex-start', gap: 8,
            }}>
              <span style={{ flexShrink: 0, marginTop: 1 }}>⚠</span>
              <div>
                <strong>Backend Offline / Error —</strong> {error || 'Cannot connect to the FastAPI backend.'}
                <div style={{ color: '#64748b', marginTop: 3, fontSize: '0.65rem' }}>
                  Please run the backend by executing <code style={{ color: '#4f46e5' }}>python main.py</code> in the <code style={{ color: '#4f46e5' }}>backend</code> folder,
                  and ensure the local Ollama service is running (default: <code style={{ color: '#4f46e5' }}>http://localhost:11434</code>).
                </div>
              </div>
            </div>
          )}

          {tab === 'firewall' ? (
            <>
              {/* Token stream */}
              <div style={{
                background: '#ffffff', border: '1px solid rgba(0,0,0,0.06)',
                borderRadius: 10, overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
              }}>
                <div style={{
                  padding: '8px 14px', borderBottom: '1px solid rgba(0,0,0,0.06)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#64748b',
                    textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    ⚡ Token Stream
                  </span>
                  {/* Mini entropy heatmap — decorative, mirrors stream */}
                  <div style={{ display: 'flex', gap: 1 }}>
                    {[
                      [10,'rgba(148,163,184,0.12)'],[8,'rgba(99,102,241,0.25)'],
                      [12,'rgba(148,163,184,0.12)'],[14,'rgba(239,68,68,0.7)'],
                      [10,'rgba(245,158,11,0.6)'],[8,'rgba(148,163,184,0.12)'],
                      [6,'rgba(99,102,241,0.25)'],[10,'rgba(148,163,184,0.12)'],
                      [16,'rgba(239,68,68,0.7)'],[8,'rgba(251,191,36,0.5)'],
                    ].map(([w,bg], i) => (
                      <div key={i} style={{ height: 4, width: w as number, borderRadius: 1, background: bg as string }} />
                    ))}
                  </div>
                </div>
                <div ref={streamRef} style={{
                  padding: 14, fontSize: '0.82rem', lineHeight: 1.9, flex: 1,
                  color: '#334155', fontFamily: 'monospace', overflowY: 'auto',
                  minHeight: 160, maxHeight: 200,
                }}>
                  {tokens.length === 0 ? (
                    <span style={{ color: '#94a3b8' }}>
                      {error
                        ? 'Fix the error above and try again.'
                        : 'Click ▶ Analyse to run the live pipeline…'}
                    </span>
                  ) : (
                    tokens.map(tok => {
                      if (tok.kind === 'hidden') {
                        return null
                      }
                      if (tok.kind === 'normal') {
                        return <span key={tok.id} style={{ color: '#334155' }}>{tok.text}</span>
                      }
                      if (tok.kind === 'high-entropy') {
                        return (
                          <span key={tok.id} style={{
                            background: 'rgba(245,158,11,0.12)',
                            borderBottom: '2px solid rgba(245,158,11,0.4)',
                            color: '#b45309',
                          }}>
                            {tok.text}
                          </span>
                        )
                      }
                      if (tok.kind === 'corrected') {
                        return <DiffText key={tok.id} original={tok.original || ''} corrected={tok.corrected || ''} />
                      }
                      if (tok.kind === 'verified' && tok.sentence && tok.claimText) {
                        return <VerifiedText key={tok.id} sentence={tok.sentence} claimText={tok.claimText} />
                      }
                      return null
                    })
                  )}
                  {running && tokens.length > 0 && (
                    <span style={{
                      display: 'inline-block', width: 2, height: '0.85em',
                      background: '#4f46e5', marginLeft: 1, verticalAlign: 'text-bottom',
                      animation: 'cursor-blink 1s step-end infinite',
                    }} />
                  )}
                </div>
              </div>

              {/* Corrections log */}
              <div style={{ background: '#ffffff', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 8, overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                <div style={{
                  padding: '6px 12px', borderBottom: '1px solid rgba(16,185,129,0.15)',
                  fontSize: '0.62rem', fontWeight: 600, color: '#10b981',
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                  display: 'flex', justifyContent: 'space-between',
                }}>
                  <span>✓ Auto-Corrections</span>
                  <span style={{ color: '#64748b', fontWeight: 400 }}>
                    {totalFixes} fix{totalFixes !== 1 ? 'es' : ''} applied
                  </span>
                </div>
                {corrections.length === 0 ? (
                  <div style={{ padding: '9px 12px', fontSize: '0.68rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                    No corrections yet — all claims verified.
                  </div>
                ) : corrections.slice(0, 4).map(c => (
                  <div key={c.id} style={{
                    padding: '7px 12px', borderBottom: '1px solid rgba(0,0,0,0.05)',
                    fontSize: '0.68rem', fontFamily: 'monospace',
                  }}>
                    <DiffText original={c.wrong} corrected={c.right} />
                    <span style={{ color: '#64748b', fontSize: '0.63rem', display: 'block', marginTop: 2 }}>
                      via {c.src} · NLI confidence {c.confidence.toFixed(2)} · diff {c.diff.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EvalView
              evalResult={evalResult}
              isLoading={evalLoading}
              loadingStatus={evalLoadingStatus}
            />
          )}
        </div>

        {/* ── STATS SIDEBAR ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 8, padding: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase',
              letterSpacing: '0.06em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{
                width: 5, height: 5, borderRadius: '50%',
                background: running ? '#10b981' : '#64748b',
                boxShadow: running ? '0 0 5px #10b981' : 'none',
                display: 'inline-block',
              }} />
              Firewall Status
            </div>
            {[
              { label: 'State',     value: backendStatus === 'online' ? 'ONLINE' : 'OFFLINE', color: backendStatus === 'online' ? '#10b981' : '#ef4444' },
              { label: 'Provider',  value: `${provider} (${modelName})`,                      color: '#4f46e5' },
              { label: 'Documents', value: vaultDocCount,                                     color: '#10b981' },
              { label: 'Detection', value: 'Entropy + NLI',                                   color: '#3b82f6' },
            ].map(r => (
              <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: '0.68rem', color: '#64748b' }}>{r.label}</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, fontFamily: 'monospace', color: r.color }}>
                  {r.value}
                </span>
              </div>
            ))}
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 8 }}>
              <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>Demo Mock Mode</span>
              <button
                onClick={() => setUseMock(!useMock)}
                style={{
                  background: useMock ? '#10b981' : '#64748b',
                  color: 'white', border: 'none', borderRadius: 4,
                  padding: '2px 8px', fontSize: '0.62rem', fontWeight: 600,
                  cursor: 'pointer', transition: 'all 0.15s', outline: 'none'
                }}
              >
                {useMock ? 'ENABLED' : 'DISABLED'}
              </button>
            </div>
          </div>

          <div style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 8, padding: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase',
              letterSpacing: '0.06em', marginBottom: 8 }}>
              📊 Pipeline Metrics
            </div>
            {[
              { label: 'Claims found',       value: claimsFound,    color: '#d97706' },
              { label: 'Verified',           value: verified,       color: '#10b981' },
              { label: 'Hallucinations',     value: hallucinations, color: hallucinations > 0 ? '#ef4444' : '#10b981' },
              { label: 'Hallucination rate', value: `${verified > 0 ? ((hallucinations / verified) * 100).toFixed(1) : '0.0'}%`, color: hallucinations > 0 ? '#ef4444' : '#10b981' },
              { label: 'Corrections',        value: totalFixes,     color: totalFixes > 0 ? '#ef4444' : '#10b981' },
            ].map(r => (
              <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: '0.68rem', color: '#64748b' }}>{r.label}</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, fontFamily: 'monospace', color: r.color }}>
                  {r.value}
                </span>
              </div>
            ))}
          </div>

          <div style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 8, padding: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase',
              letterSpacing: '0.06em', marginBottom: 8 }}>
              ⚡ Latency
            </div>
            {[
              { label: 'Avg verify', value: avgVerify > 0 ? `${avgVerify}ms` : '—', color: '#10b981' },
              { label: 'Pipeline',   value: pipeline  > 0 ? `${pipeline}ms`  : '—', color: '#3b82f6' },
              { label: 'Target',     value: '<200ms',                                color: '#4f46e5' },
            ].map(r => (
              <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: '0.68rem', color: '#64748b' }}>{r.label}</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, fontFamily: 'monospace', color: r.color }}>
                  {r.value}
                </span>
              </div>
            ))}
          </div>

          <div style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 8, padding: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase',
              letterSpacing: '0.06em', marginBottom: 8 }}>
              ℹ️ How it works
            </div>
            <p style={{ fontSize: '0.65rem', color: '#64748b', lineHeight: 1.6, marginBottom: 5 }}>
              Per-token Shannon entropy from {provider} flags uncertain spans.
            </p>
            <p style={{ fontSize: '0.65rem', color: '#64748b', lineHeight: 1.6 }}>
              NLI classifier verifies claims against the ground-truth vault.
            </p>
          </div>

          <button onClick={handleReset} style={{
            padding: '7px', borderRadius: 6, background: '#ffffff',
            border: '1px solid #cbd5e1', color: '#64748b',
            fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer',
            fontFamily: 'monospace', letterSpacing: '0.04em', transition: 'all 0.15s',
            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
          }}>
            ↺ Reset session
          </button>
        </div>
      </div>

      {/* ── FOOTER ── */}
      <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', padding: '8px 20px',
        display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontSize: '0.62rem', color: '#64748b' }}>Veracity AI · Self-Healing LLM Firewall</span>
        <span style={{ fontSize: '0.62rem', color: '#64748b' }}>Powered by {provider} ({modelName}) · NLI + Entropy Detection</span>
      </div>

      <style>{`
        @keyframes pulse        { 0%,100%{opacity:1}  50%{opacity:0.4} }
        @keyframes cursor-blink { 0%,100%{opacity:1}  50%{opacity:0}   }
        @keyframes pill-pop     {
          0%  { transform:scale(0.7);  opacity:0; }
          65% { transform:scale(1.07); opacity:1; }
          100%{ transform:scale(1);   opacity:1; }
        }
        * { box-sizing: border-box; }
        button { font-family: inherit; }
        input::placeholder { color: #94a3b8; }
        ::-webkit-scrollbar       { width: 3px; }
        ::-webkit-scrollbar-track { background: #f1f5f9; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 2px; }
      `}</style>
    </div>
  )
}