import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { remarkTractLinks } from '../lib/linkify.js'

const SUGGESTIONS = [
  'Which 5 tracts have the most poor households not on SNAP?',
  'How many people live in Classic Food Desert tracts, by county?',
  'Which flagged tracts have Low confidence and why?',
  'What data is missing for this region?',
]

// Questions offered after "Ask about this tract". The full id makes the model look the tract up.
const tractQuestions = ({ label, geoid, county }) => [
  `Explain in plain language why ${label} (${geoid}) has its gap type and confidence.`,
  `How does ${label} (${geoid}) compare with the average tract in ${county} County?`,
  `What should our team check before approving or rejecting ${label} (${geoid})?`,
  `Which other tracts in ${county} County have the same gap type as ${label} (${geoid})?`,
]


export default function ChatPanel({ regionId, selectedTract, focus: rawFocus, onClearFocus, onOpenTract }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef(null)
  const inputRef = useRef(null)
  // A focus from another region is stale once the user switches region.
  const focus = rawFocus && rawFocus.regionId === regionId ? rawFocus : null

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [messages, busy, open, focus?.at])
  useEffect(() => {
    if (!rawFocus) return
    setOpen(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [rawFocus?.at])

  async function ask(text) {
    const q = text.trim()
    if (!q || busy) return
    const next = [...messages, { role: 'user', text: q }]
    setMessages(next)
    setInput('')
    setBusy(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next.filter((m) => !m.error).map(({ role, text: t }) => ({ role, text: t })),
          regionId,
          selectedTract: focus?.geoid || selectedTract,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`)
      setMessages([...next, { role: 'assistant', text: data.text, tools: data.tools, tracts: data.tracts }])
    } catch (e) {
      const msg = e.message === 'Failed to fetch'
        ? 'Cannot reach the chat server. Start it with `npm run server` in the app folder.'
        : e.message
      setMessages([...next, { role: 'assistant', text: msg, error: true }])
    } finally {
      setBusy(false)
    }
  }

  function openTract(geoid) {
    onOpenTract(geoid)
  }

  const mdLink = ({ href, children }) => (href?.startsWith('#tract/')
    ? <a href={href} className="tract-link" title="Open on the map" onClick={(e) => { e.preventDefault(); openTract(href.slice(7)) }}>{children}</a>
    : <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>)

  if (!open) {
    return <button className="chat-fab" onClick={() => setOpen(true)} aria-label="Open Chat About Data">Chat About Data</button>
  }

  return (
    <section className="chat" aria-label="Data assistant">
      <header className="chat-head">
        <b>Chat About Data</b>
        <span className="muted small">Answers come from the Beacon public indicators only</span>
        <button className="chat-x" onClick={() => setOpen(false)} aria-label="Close">×</button>
      </header>
      {focus && (
        <div className="chat-focus">
          <span>Asking about <a href={`#tract/${focus.geoid}`} className="tract-link" onClick={(e) => { e.preventDefault(); openTract(focus.geoid) }}>{focus.label}</a></span>
          <button onClick={onClearFocus} aria-label="Stop asking about this tract" title="Stop asking about this tract">×</button>
        </div>
      )}
      <div className="chat-body">
        {!messages.length && !focus && (
          <div>
            <p className="muted small">Ask about tracts, counties or gap types. If the data cannot answer, it will say so. It only suggests; people approve or reject on the map. Click a tract name in an answer to open it on the map.</p>
            {SUGGESTIONS.map((s) => <button key={s} className="chat-sugg" onClick={() => ask(s)}>{s}</button>)}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}${m.error ? ' err' : ''}`}>
            {m.role === 'assistant' && !m.error
              ? <ReactMarkdown remarkPlugins={[remarkGfm, [remarkTractLinks, { tracts: m.tracts }]]} components={{ a: mdLink }}>{m.text}</ReactMarkdown>
              : m.text}
            {m.tools?.length > 0 && (
              <details className="chat-src">
                <summary>Data used ({m.tools.length} lookup{m.tools.length > 1 ? 's' : ''})</summary>
                {m.tools.map((t, j) => <code key={j}>{t.name}({JSON.stringify(t.args)})</code>)}
              </details>
            )}
          </div>
        ))}
        {busy && <div className="chat-msg assistant muted">Looking at the data...</div>}
        {focus && !busy && (
          <div className="chat-tract-sugg">
            <p className="muted small">Questions about {focus.label}:</p>
            {tractQuestions(focus).map((s) => <button key={s} className="chat-sugg" onClick={() => ask(s)}>{s.replace(` (${focus.geoid})`, '')}</button>)}
          </div>
        )}
        <div ref={endRef} />
      </div>
      <form className="chat-form" onSubmit={(e) => { e.preventDefault(); ask(focus && input.trim() && !input.includes(focus.geoid) ? `${input.trim()} (about ${focus.label}, ${focus.geoid})` : input) }}>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={focus ? `Ask about ${focus.label}` : 'Ask a question about the data'}
          maxLength={500}
          disabled={busy}
        />
        <button type="submit" disabled={busy || !input.trim()}>Send</button>
      </form>
    </section>
  )
}
