'use client'

import { useEffect } from 'react'

// ── helpers ──────────────────────────────────────────────────────────────────

async function callClaude(prompt: string, systemPrompt: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  const data = await response.json()
  return data.content?.[0]?.text ?? ''
}

async function streamText(el: HTMLElement, text: string, delayMs = 18) {
  el.innerHTML = ''
  const cursor = document.createElement('span')
  cursor.className = 'stream-cursor'
  el.appendChild(cursor)
  for (const word of text.split(' ')) {
    el.insertBefore(document.createTextNode(word + ' '), cursor)
    await new Promise<void>((r) => setTimeout(r, delayMs))
  }
  cursor.remove()
}

function setText(id: string, text: string) {
  const el = document.getElementById(id)
  if (el && text) streamText(el, text)
}

function setHTML(id: string, html: string) {
  const el = document.getElementById(id)
  if (el && html) { el.innerHTML = html }
}

// ── content generation ───────────────────────────────────────────────────────

async function generateContent() {
  const SYSTEM = `You are a copywriter for Veracity AI, a developer tool that prevents LLM hallucinations in real-time using token-level entropy detection and NLI verification. Write concise, precise, technically confident copy. No fluff. No hype. Respond only with a JSON object — no markdown fences, no preamble.`

  const prompt = `Generate copy for the Veracity AI landing page. Return ONLY a valid JSON object with these exact keys:

{
  "hero_badge": "short badge text (under 30 chars, e.g. 'Veracity AI · Now live')",
  "hero_strong": "bold part of headline (3–6 words)",
  "hero_em": "italic part of headline (3–5 words, ends with period)",
  "hero_sub": "hero subheading (1–2 sentences, under 120 chars, technical)",
  "hero_cta_ghost": "secondary CTA button text",
  "stat_0": "label for <200ms stat",
  "stat_1": "label for 94% stat",
  "stat_2": "label for 0 hallucinations stat",
  "stat_3": "label for 4 dimensions stat",
  "features_title_strong": "bold part of features section title",
  "features_title_rest": "rest of title after the strong part",
  "features_sub": "features section subheading (1–2 sentences)",
  "feat_0_name": "feature 1 name: token entropy (under 40 chars)",
  "feat_0_desc": "feature 1 description (2–3 sentences)",
  "feat_1_name": "feature 2 name: NLI classifier (under 40 chars)",
  "feat_1_desc": "feature 2 description (2–3 sentences)",
  "feat_2_name": "feature 3 name: auto-rewriter (under 40 chars)",
  "feat_2_desc": "feature 2 description (2–3 sentences)",
  "feat_3_name": "feature 4 name: multi-model eval (under 40 chars)",
  "feat_3_desc": "feature 4 description (2–3 sentences)",
  "feat_4_name": "feature 5 name: document-aware (under 40 chars)",
  "feat_4_desc": "feature 5 description (2–3 sentences)",
  "feat_5_name": "feature 6 name: LLM judge (under 40 chars)",
  "feat_5_desc": "feature 6 description (2–3 sentences)",
  "how_title_strong": "bold part of how-it-works title",
  "how_title_rest": "rest of how-it-works title",
  "how_sub": "how-it-works subheading (1–2 sentences)",
  "stage_0": "entropy stage explanation (1–2 sentences)",
  "stage_1": "NLI stage explanation (1–2 sentences)",
  "stage_2": "auto-correct stage explanation (1–2 sentences)",
  "integrations_label": "integrations label text",
  "eval_title_strong": "bold part of eval section title",
  "eval_title_rest": "rest of eval title",
  "eval_sub": "eval section subheading (1–2 sentences)",
  "verdict_label": "verdict winner label (e.g. 'Gemini 2.0 Flash Lite Wins')",
  "verdict_text": "verdict explanation (1–2 sentences)",
  "cta_strong": "bold part of CTA headline",
  "cta_em": "italic part of CTA headline (3–5 words, ends with period)",
  "cta_sub": "CTA subtext (1 sentence)"
}`

  try {
    let raw = await callClaude(prompt, SYSTEM)
    raw = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
    const c = JSON.parse(raw)

    // Hero
    setHTML('hero-badge-text', c.hero_badge ?? '')
    setHTML('hero-title-strong', c.hero_strong ?? '')
    setHTML('hero-title-em', c.hero_em ?? '')
    setText('hero-sub', c.hero_sub ?? '')
    setHTML('hero-cta-ghost', c.hero_cta_ghost ?? '')

    // Stats
    setText('stat-0-desc', c.stat_0 ?? '')
    setText('stat-1-desc', c.stat_1 ?? '')
    setText('stat-2-desc', c.stat_2 ?? '')
    setText('stat-3-desc', c.stat_3 ?? '')

    // Features
    setHTML('features-title', `<strong>${c.features_title_strong ?? ''}</strong><br />${c.features_title_rest ?? ''}`)
    setText('features-sub', c.features_sub ?? '')
    for (let i = 0; i < 6; i++) {
      setHTML(`feat-${i}-name`, c[`feat_${i}_name`] ?? '')
      setText(`feat-${i}-desc`, c[`feat_${i}_desc`] ?? '')
    }

    // How it works
    setHTML('how-title', `<strong>${c.how_title_strong ?? ''}</strong><br />${c.how_title_rest ?? ''}`)
    setText('how-sub', c.how_sub ?? '')
    setText('stage-0-body', c.stage_0 ?? '')
    setText('stage-1-body', c.stage_1 ?? '')
    setText('stage-2-body', c.stage_2 ?? '')

    // Integrations
    setHTML('integrations-label', c.integrations_label ?? '')

    // Eval
    setHTML('eval-title', `<strong>${c.eval_title_strong ?? ''}</strong><br />${c.eval_title_rest ?? ''}`)
    setText('eval-sub', c.eval_sub ?? '')
    setHTML('verdict-label', c.verdict_label ?? '')
    setText('verdict-text', c.verdict_text ?? '')

    // CTA
    setHTML('cta-title', `<strong>${c.cta_strong ?? ''}</strong><br /><em>${c.cta_em ?? ''}</em>`)
    setText('cta-sub', c.cta_sub ?? '')
  } catch (err) {
    console.error('Content generation failed:', err)
    // Falls back gracefully — default text already in JSX stays visible
  }
}

// ── component ─────────────────────────────────────────────────────────────────

export default function Home() {
  useEffect(() => {
    // Scroll reveals
    const reveals = document.querySelectorAll('.reveal')
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('visible')
            observer.unobserve(e.target)
          }
        })
      },
      { threshold: 0.1 }
    )
    reveals.forEach((el) => observer.observe(el))

    // Generate all copy via Claude API (disabled to prevent client-side CORS errors)
    // generateContent()

    return () => observer.disconnect()
  }, [])

  return (
    <>
      {/* NAV */}
      <nav>
        <a href="#" className="nav-logo">
          <div className="nav-logo-mark">
            <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M8 2L14 6V10L8 14L2 10V6L8 2Z" fill="#fff" stroke="#fff" strokeWidth="1" />
              <path d="M8 5L11 7V9L8 11L5 9V7L8 5Z" fill="#6366f1" />
            </svg>
          </div>
          <span className="nav-brand">Veracity</span>
        </a>
        <ul className="nav-links">
          <li><a href="#features">Features</a></li>
          <li><a href="#how">How it works</a></li>
          <li><a href="#eval">Evaluation</a></li>
        </ul>
      </nav>

      {/* HERO */}
      <div className="hero">
        <div className="hero-grid" />

        <div className="hero-badge">
          <span className="hero-badge-dot" />
          {/* AI-generated — default shown until API responds */}
          <span id="hero-badge-text">Veracity AI · Now live</span>
        </div>

        <h1 className="hero-title">
          <strong id="hero-title-strong">Stop hallucinations</strong>
          <br />
          <em id="hero-title-em">before they ship.</em>
        </h1>

        <p className="hero-sub" id="hero-sub">
          Real-time per-token entropy detection, NLI verification, and auto-correction — all inline, under 200ms.
        </p>

        <div className="hero-actions">
          <a href="/demo" className="btn-large">
            Deploy Firewall
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </a>
          <a href="#how" className="btn-large-ghost" id="hero-cta-ghost">See how it works</a>
        </div>

        {/* Terminal */}
        <div className="hero-terminal">
          <div className="terminal-bar">
            <div className="terminal-dot td-red" />
            <div className="terminal-dot td-yellow" />
            <div className="terminal-dot td-green" />
            <span className="terminal-title">veracity · firewall · live stream</span>
          </div>
          <div className="terminal-body">
            <div>
              <span className="t-dim">$ </span>
              <span className="t-white">veracity stream --model gemini-flash --entropy-threshold 0.30</span>
            </div>
            <div>
              <span className="t-dim">  ↳ </span>
              <span className="t-green">firewall ready</span>
              <span className="t-dim"> · entropy detection active</span>
            </div>
            <div style={{ marginTop: '12px' }}>
              <span className="t-dim">tok </span>
              <span className="t-white">The S&amp;P 500 closed at</span>
              <span className="t-amber"> ⚠ 4,512</span>
              <span className="t-dim"> [H=0.34 &gt; threshold]</span>
            </div>
            <div>
              <span className="t-dim">nli </span>
              <span className="t-red">CONTRADICTION</span>
              <span className="t-dim"> confidence=0.92 · source=market_vault</span>
            </div>
            <div>
              <span className="t-dim">fix </span>
              <span className="t-strike">4,512</span>
              <span className="t-correct">4,783</span>
              <span className="t-dim"> ← auto-corrected in 141ms</span>
            </div>
            <div style={{ marginTop: '8px' }}>
              <span className="t-dim">tok </span>
              <span className="t-white">Apple revenue was</span>
              <span className="t-white"> $90.8B</span>
              <span className="t-dim"> [H=0.11 ✓ confident]</span>
            </div>
            <div>
              <span className="t-dim">tok </span>
              <span className="t-white">in Q4 fiscal 2023</span>
              <span className="t-dim"> [H=0.08 ✓ confident]</span>
            </div>
            <div style={{ marginTop: '8px' }}>
              <span className="t-green">✓ pipeline complete</span>
              <span className="t-dim"> · 1 correction · 0 misses · 147ms avg</span>
              <span className="cursor" />
            </div>
          </div>
        </div>
      </div>

      {/* STATS */}
      <div className="stats-row reveal">
        <div className="stat-item">
          <span className="stat-number">&lt;<span>200</span>ms</span>
          <span className="stat-desc" id="stat-0-desc">End-to-end correction latency</span>
        </div>
        <div className="stat-item">
          <span className="stat-number"><span>94</span>%</span>
          <span className="stat-desc" id="stat-1-desc">NLI contradiction detection rate</span>
        </div>
        <div className="stat-item">
          <span className="stat-number"><span>0</span></span>
          <span className="stat-desc" id="stat-2-desc">Hallucinations that reach your user</span>
        </div>
        <div className="stat-item">
          <span className="stat-number"><span>4</span></span>
          <span className="stat-desc" id="stat-3-desc">Evaluation dimensions scored</span>
        </div>
      </div>

      {/* FEATURES */}
      <section id="features">
        <p className="section-eyebrow reveal">Platform</p>
        <h2 className="section-title reveal" id="features-title">
          <strong>Every layer of the LLM</strong>
          <br />
          pipeline, defended.
        </h2>
        <p className="section-sub reveal" id="features-sub">
          From raw token streams to final output — Veracity sits inline and corrects in real time, before the user ever sees a mistake.
        </p>

        <div className="feature-grid reveal" style={{ transitionDelay: '0.1s' }}>
          {/* Card 1: span 2 */}
          <div className="feature-card span-2 featured">
            <div className="feature-glow" />
            <div className="feature-icon accent-icon">⚡</div>
            <div className="feature-name" id="feat-0-name">Token-level entropy detection</div>
            <div className="feature-desc" id="feat-0-desc">
              Shannon entropy computed per token from Gemini logprobs. Spans above threshold are flagged instantly —
              before the sentence is even complete. No post-processing. No round trips.
            </div>
            <div style={{ display: 'flex', gap: '2px', flexWrap: 'wrap', marginTop: '1.5rem' }}>
              {[
                'rgba(148,163,184,0.08)', 'rgba(99,102,241,0.25)', 'rgba(148,163,184,0.08)',
                'rgba(239,68,68,0.7)', 'rgba(245,158,11,0.6)', 'rgba(148,163,184,0.08)',
                'rgba(239,68,68,0.7)', 'rgba(251,191,36,0.5)', 'rgba(148,163,184,0.08)',
                'rgba(99,102,241,0.25)', 'rgba(148,163,184,0.08)', 'rgba(239,68,68,0.7)',
              ].map((bg, i) => (
                <div key={i} style={{ height: '8px', width: `${[18,14,24,20,16,12,20,14,18,10,22,16][i]}px`, borderRadius: '2px', background: bg }} />
              ))}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--gray-600)', marginTop: '0.5rem', fontFamily: "'Geist Mono', monospace" }}>
              heatmap — red = high entropy · indigo = borderline · gray = confident
            </div>
          </div>

          <div className="feature-card">
            <div className="feature-icon">🧠</div>
            <div className="feature-name" id="feat-1-name">NLI contradiction classifier</div>
            <div className="feature-desc" id="feat-1-desc">
              Flagged claims are verified against your ground-truth vault using a Natural Language Inference model.
              Entailment passes. Contradiction triggers the rewriter.
            </div>
          </div>

          <div className="feature-card">
            <div className="feature-icon">🔁</div>
            <div className="feature-name" id="feat-2-name">REVERSE auto-rewriter</div>
            <div className="feature-desc" id="feat-2-desc">
              Contradicted claims are rewritten using the verified source sentence before they reach the user —
              streamed inline with no visible interruption.
            </div>
          </div>

          <div className="feature-card">
            <div className="feature-icon">⚖️</div>
            <div className="feature-name" id="feat-3-name">Multi-model evaluation</div>
            <div className="feature-desc" id="feat-3-desc">
              Run two LLMs head-to-head. Scored across four dimensions: factuality, hallucination rate, reasoning, and instruction-following.
            </div>
          </div>

          <div className="feature-card">
            <div className="feature-icon">📄</div>
            <div className="feature-name" id="feat-4-name">Document-aware context</div>
            <div className="feature-desc" id="feat-4-desc">
              Attach PDFs, Word docs, or CSVs. The firewall grounds verification against your uploaded files —
              not just the built-in vault.
            </div>
          </div>

          <div className="feature-card">
            <div className="feature-icon">🏆</div>
            <div className="feature-name" id="feat-5-name">LLM-as-judge scoring</div>
            <div className="feature-desc" id="feat-5-desc">
              An independent judge model produces a verdict with rationale. Dimension-level winners are surfaced alongside an overall winner.
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" style={{ paddingBottom: '2rem' }}>
        <p className="section-eyebrow reveal">How it works</p>
        <h2 className="section-title reveal" id="how-title">
          <strong>Three stages.</strong>
          <br />
          One invisible pipeline.
        </h2>
        <p className="section-sub reveal" id="how-sub">
          Every token passes through all three stages before your user sees it. If a stage flags a problem, the token is held, corrected, and released — in under 200ms.
        </p>

        <div className="bento reveal" style={{ transitionDelay: '0.1s' }}>
          {/* Stage 1 */}
          <div className="bento-card" style={{ gridColumn: 'span 2' }}>
            <div className="bento-step">Stage 01</div>
            <div className="bento-title">Entropy scan</div>
            <div className="bento-body" id="stage-0-body">
              Each token&apos;s Shannon entropy H is computed from Gemini&apos;s log-probability distribution. High variance = uncertainty = flag.
            </div>
            <div className="entropy-vis">
              {[
                { w: 18, bg: 'rgba(148,163,184,0.08)' }, { w: 14, bg: 'rgba(148,163,184,0.08)' },
                { w: 22, bg: 'rgba(99,102,241,0.25)' }, { w: 28, bg: 'rgba(239,68,68,0.7)' },
                { w: 20, bg: 'rgba(245,158,11,0.6)' }, { w: 14, bg: 'rgba(251,191,36,0.5)' },
                { w: 18, bg: 'rgba(148,163,184,0.08)' }, { w: 16, bg: 'rgba(148,163,184,0.08)' },
                { w: 24, bg: 'rgba(239,68,68,0.7)' }, { w: 12, bg: 'rgba(148,163,184,0.08)' },
              ].map((b, i) => (
                <div key={i} className="ev" style={{ width: `${b.w}px`, background: b.bg }} />
              ))}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--gray-600)', fontFamily: "'Geist Mono', monospace" }}>
              H &gt; 0.30 → flagged for NLI verification
            </div>
          </div>

          {/* Stage 2 */}
          <div className="bento-card" style={{ gridColumn: 'span 2' }}>
            <div className="bento-step">Stage 02</div>
            <div className="bento-title">NLI verification</div>
            <div className="bento-body" id="stage-1-body">
              Flagged spans are classified against the ground-truth vault. Three outcomes: entailment (pass), neutral (skip), contradiction (rewrite).
            </div>
            <div className="nli-row">
              <span className="nli-badge nli-entail">ENTAILMENT ✓</span>
              <span className="nli-badge nli-neutral">NEUTRAL →</span>
              <span className="nli-badge nli-contra">CONTRADICTION ✗</span>
            </div>
          </div>

          {/* Stage 3 */}
          <div className="bento-card" style={{ gridColumn: 'span 2' }}>
            <div className="bento-step">Stage 03</div>
            <div className="bento-title">Auto-correction</div>
            <div className="bento-body" id="stage-2-body">
              REVERSE rewriter replaces the flagged sentence with the verified source. The token stream continues — users see the corrected output only.
            </div>
            <div style={{ margin: '1.2rem 0', fontFamily: "'Geist Mono', monospace", fontSize: '0.75rem' }}>
              <div style={{ color: '#ef4444', textDecoration: 'line-through', opacity: 0.7, marginBottom: '4px' }}>
                &quot;The rate is 5.75%&quot;
              </div>
              <div style={{ color: '#22c55e', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '4px', padding: '4px 8px' }}>
                &quot;The rate is 5.33%&quot; ✓ corrected
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* INTEGRATIONS */}
      <div className="integrations reveal">
        <p className="integrations-label" id="integrations-label">Works with every major LLM provider</p>
        <div className="logo-track">
          {['GEMINI', 'OPENAI', 'CLAUDE', 'MISTRAL', 'LLAMA', 'COHERE'].map((name) => (
            <span key={name} className="logo-item">{name}</span>
          ))}
        </div>
      </div>

      {/* EVAL */}
      <div className="eval-section" id="eval">
        <section style={{ padding: '6rem 0 2rem', maxWidth: 'none', margin: '0' }}>
          <p className="section-eyebrow reveal">Evaluation framework</p>
          <h2 className="section-title reveal" id="eval-title">
            <strong>Head-to-head.</strong>
            <br />
            Four dimensions. One winner.
          </h2>
          <p className="section-sub reveal" id="eval-sub">
            Run any two models through the same query. Scores are computed per-dimension. An LLM judge delivers the final verdict with written rationale.
          </p>
        </section>

        {/* Verdict */}
        <div className="verdict-strip reveal">
          <div className="verdict-trophy">🏆</div>
          <div>
            <div className="verdict-winner-label" id="verdict-label">Gemini 2.0 Flash Lite Wins</div>
            <div className="verdict-text" id="verdict-text">
              Outperformed on factuality and hallucination rate. Lower correction count with higher overall confidence across token stream.
            </div>
          </div>
        </div>

        {/* Model cards */}
        <div className="eval-card-row reveal" style={{ transitionDelay: '0.1s' }}>
          {/* Winner */}
          <div className="eval-model-card winner-card">
            <div className="eval-card-header">
              <div>
                <div className="eval-model-name">Gemini 2.0 Flash Lite</div>
                <div className="eval-model-meta">1,204 tokens · 1,847ms</div>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <span className="badge badge-winner">🏆 Winner</span>
                <span className="badge badge-score">91.2%</span>
              </div>
            </div>
            <div className="eval-card-body">
              <div className="eval-score-row">
                <span className="eval-score-num">91.2</span>
                <span className="eval-score-pct">%</span>
                <span className="eval-margin-up" style={{ marginLeft: '8px' }}>+5.4% ahead</span>
              </div>
              <div className="dim-list">
                {[
                  { label: '▸ Factuality', pct: 93, color: '#6366f1', opacity: 1 },
                  { label: '▸ Hallucin. Safety', pct: 95, color: '#10b981', opacity: 1 },
                  { label: 'Reasoning', pct: 88, color: '#f59e0b', opacity: 0.55 },
                  { label: 'Instruction Follow', pct: 90, color: '#60a5fa', opacity: 0.55 },
                ].map((d) => (
                  <div key={d.label} className="dim-row">
                    <span className="dim-lbl">{d.label}</span>
                    <div className="dim-track">
                      <div className="dim-fill" style={{ width: `${d.pct}%`, background: d.color, opacity: d.opacity }} />
                    </div>
                    <span className="dim-pct">{d.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Challenger */}
          <div className="eval-model-card">
            <div className="eval-card-header">
              <div>
                <div className="eval-model-name">Gemini 1.5 Flash</div>
                <div className="eval-model-meta">1,156 tokens · 1,623ms</div>
              </div>
              <span className="badge badge-score">85.8%</span>
            </div>
            <div className="eval-card-body">
              <div className="eval-score-row">
                <span className="eval-score-num">85.8</span>
                <span className="eval-score-pct">%</span>
                <span className="eval-margin-dn" style={{ marginLeft: '8px' }}>5.4% behind</span>
              </div>
              <div className="dim-list">
                {[
                  { label: 'Factuality', pct: 84, color: '#6366f1', opacity: 0.55 },
                  { label: 'Hallucin. Safety', pct: 82, color: '#10b981', opacity: 0.55 },
                  { label: '▸ Reasoning', pct: 91, color: '#f59e0b', opacity: 1 },
                  { label: '▸ Instruction Follow', pct: 86, color: '#60a5fa', opacity: 1 },
                ].map((d) => (
                  <div key={d.label} className="dim-row">
                    <span className="dim-lbl">{d.label}</span>
                    <div className="dim-track">
                      <div className="dim-fill" style={{ width: `${d.pct}%`, background: d.color, opacity: d.opacity }} />
                    </div>
                    <span className="dim-pct">{d.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="cta-section reveal">
        <div className="cta-glow" />
        <h2 className="cta-title" id="cta-title">
          <strong>Your LLM deserves</strong>
          <br />
          <em>a safety net.</em>
        </h2>
        <p className="cta-sub" id="cta-sub">
          Deploy Veracity&apos;s firewall in minutes. Drop-in middleware for any LLM pipeline.
        </p>
        <div className="cta-actions">
          <a href="#features" className="btn-large">Explore the platform</a>
          <a href="#how" className="btn-large-ghost">See how it works</a>
        </div>
      </div>

      {/* FOOTER */}
      <footer className="reveal">
        <div className="footer-brand">Veracity AI</div>
        <div className="footer-links">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#eval">Evaluation</a>
        </div>
        <div className="footer-right">© 2026 Veracity AI</div>
      </footer>
    </>
  )
}