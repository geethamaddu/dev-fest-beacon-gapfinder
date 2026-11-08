// Chat proxy: keeps the Gemini API key on the server, lets Gemini call the data
// tools in tools.js, and checks that numbers in the answer came from tool results.
// Run: npm run server   (needs GEMINI_API_KEY in app/.env)
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { DECLARATIONS, runTool } from './tools.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const envFile = path.join(HERE, '..', '.env')
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const PORT = Number(process.env.PORT || 8787)
// Flash-Lite is the default: in testing (Nov 2026) the free Flash model was often overloaded (503) or slow.
const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest'
// Tried in order when the main model is overloaded (503) or out of free quota (429).
const FALLBACKS = (process.env.GEMINI_FALLBACK_MODELS || 'gemini-flash-latest').split(',').map((s) => s.trim()).filter((m) => m && m !== MODEL)
const MAX_STEPS = 6
const TIMEOUT_MS = 20_000

const SYSTEM = `You are the data assistant inside Beacon Gap Finder, a tool for food bank and nutrition teams in Central Florida, New York City and Salt Lake City.

RULES (follow strictly):
1. Every number, tract, county or fact about the data MUST come from a tool result in this conversation. Never use memory, estimates or mental arithmetic for statistics: do not add, divide or compute percentages yourself. If you need a total, average or ranking, call a tool (aggregate returns totals and average_per_tract).
2. If the tools cannot answer (data not available, no matching tracts, error), say so plainly: "That isn't in the Beacon public indicators this app uses" and name what is missing. Do not guess or fill gaps.
3. Known data limits: Central Florida has NO transportation data. No store closures, pantry locations, capacity or private organization data. SNAP retailers are an address list, not joined to tracts.
4. State confidence (High/Medium/Low) and data limits when you recommend attention to a tract. Low confidence means the estimate is uncertain. To explain WHY a tract has its confidence, quote its confidence_reason field. For rules and definitions, use region_info; never describe a rule from memory.
5. You only suggest. People approve or reject tracts in the app. Never say a tract "is approved" or make funding decisions.
5b. The team's approvals, rejections (with their reasons) and undos ARE saved by the app, but only in the user's browser, and they are deliberately not shared with you. For questions about them, say that and point to the History page or the tract's detail panel.
5c. "Flagged" means the tract has at least one problem gap type: Classic Food Desert, Transportation-Compounded Gap or SNAP Enrollment Gap (use flagged_only=true). Blind spots and partial signals are "needs review", not flagged.
5d. A tract can have several gap types (all_gap_types); main_gap_type sets its map color and review tier. Each problem type has its own recommended action and confidence (recommended_actions). SNAP Enrollment Gap is the team's own addition, not DataKind's taxonomy; its confidence can differ from the tract's (snap_gap_confidence, snap_gap_confidence_reason) and snap_cautions explain why. For questions about SNAP gap confidence, filter with snap_gap_confidence, not confidence. When asked how many tracts have a gap type, use the gap_type filter (counts main and additional types).
6. Use the region the user is viewing unless they name another; you may omit the region argument for it. Refer to a tract by its "label" field exactly as given (keep leading zeros), with the full tract_id in parentheses on first mention.
7. Be concise: a short answer first, then a compact list or table if useful. Plain language for non-analysts. Never show tool or field names (like confidence_reason) to the user; say "why" in words.`

async function callModel(model, body) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (e) {
    const err = new Error(`Gemini ${model} ${e.name === 'TimeoutError' ? 'timed out' : `network error: ${e.message}`}`)
    err.status = e.name === 'TimeoutError' ? 504 : 502
    throw err
  }
  if (!res.ok) {
    const text = await res.text()
    const err = new Error(`Gemini ${model} ${res.status}: ${text.slice(0, 300)}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const RETRYABLE = new Set([429, 500, 502, 503, 504])

// Main model with one quick retry, then each fallback model.
async function callGemini(body) {
  let last
  for (const model of [MODEL, MODEL, ...FALLBACKS]) {
    try {
      return await callModel(model, body)
    } catch (e) {
      last = e
      console.error(e.message.split('\n')[0])
      if (!RETRYABLE.has(e.status)) throw e
      await sleep(800)
    }
  }
  throw last
}

function numbersIn(text) {
  return [...String(text).matchAll(/-?\d[\d,]*\.?\d*/g)].map((m) => Number(m[0].replace(/,/g, ''))).filter((n) => Number.isFinite(n))
}

// Flags figures in the answer that appear nowhere in the tool results.
export function unverifiedNumbers(answer, toolResults) {
  const all = toolResults.join(' ')
  const ids = new Set(all.match(/\b\d{11}\b/g) || [])
  const isTractSuffix = (s) => [...ids].some((id) => id.slice(5) === s.padStart(6, '0'))
  // Tract ids (11 digits, or the last 6 like "017111", even with the leading zero dropped) are checked as text, then removed.
  const cleaned = String(answer)
    .replace(/\b\d{11}\b/g, (id) => (ids.has(id) ? ' ' : id))
    .replace(/(tract\s+)(\d{4,6})\b/gi, (m, pre, s) => (isTractSuffix(s) ? pre : m))
    .replace(/\b\d{6}\b/g, (s) => (isTractSuffix(s) ? ' ' : s))
  const known = new Set(toolResults.flatMap(numbersIn))
  return [...new Set(numbersIn(cleaned))].filter((n) => {
    if (Math.abs(n) <= 10) return false // list numbers, "top 5", etc.
    return !(known.has(n) || known.has(Math.round(n)) || known.has(Math.round(n * 10) / 10))
  })
}

// Tracts from tool results that the answer actually mentions (by full id or label),
// so the chat panel can turn them into "open on map" links.
export function mentionedTracts(answer, toolResults) {
  const found = new Map()
  const walk = (v) => {
    if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') {
      if (typeof v.tract_id === 'string' && typeof v.label === 'string') found.set(v.tract_id, v.label)
      Object.values(v).forEach(walk)
    }
  }
  for (const t of toolResults) { try { walk(JSON.parse(t)) } catch { /* not JSON */ } }
  const text = String(answer)
  return [...found].filter(([id, label]) => {
    const short = label.replace(/(\d{6})$/, (s) => String(Number(s)))
    return text.includes(id) || text.includes(label) || text.includes(short)
  }).slice(0, 50).map(([geoid, label]) => ({ geoid, label }))
}

export async function chat({ messages, regionId, selectedTract }) {
  const context = `The user is viewing region "${regionId}".${selectedTract ? ` They have selected tract ${selectedTract} on the map.` : ''}`
  const contents = messages.slice(-12).map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: String(m.text).slice(0, 2000) }] }))
  const toolTexts = []
  const toolsUsed = []

  for (let step = 0; step < MAX_STEPS; step++) {
    const data = await callGemini({
      systemInstruction: { parts: [{ text: `${SYSTEM}\n\n${context}` }] },
      contents,
      tools: [{ functionDeclarations: DECLARATIONS }],
      generationConfig: { temperature: 0 },
    })
    const content = data.candidates?.[0]?.content
    if (!content?.parts?.length) {
      const reason = data.candidates?.[0]?.finishReason || data.promptFeedback?.blockReason || 'empty reply'
      return { text: `I couldn't produce an answer (${reason}). Try rephrasing the question.`, tools: toolsUsed }
    }
    const calls = content.parts.filter((p) => p.functionCall)
    if (!calls.length) {
      let text = content.parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('').trim()
      const bad = unverifiedNumbers(text, toolTexts)
      if (bad.length) text += `\n\n> Check these figures before using them; I could not match them to the data: ${bad.join(', ')}.`
      return { text, tools: toolsUsed, tracts: mentionedTracts(text, toolTexts) }
    }
    contents.push(content)
    const responses = calls.map(({ functionCall: { name, args } }) => {
      const result = runTool(name, args, regionId)
      const json = JSON.stringify(result)
      toolTexts.push(json)
      toolsUsed.push({ name, args })
      return { functionResponse: { name, response: { result } } }
    })
    contents.push({ role: 'user', parts: responses })
  }
  return { text: 'That question needed too many steps. Try asking something narrower.', tools: toolsUsed }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let s = ''
    req.on('data', (c) => { s += c; if (s.length > 100_000) { reject(new Error('too large')); req.destroy() } })
    req.on('end', () => resolve(s))
    req.on('error', reject)
  })
}

const send = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(obj))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.env.GEMINI_API_KEY) console.warn('Warning: GEMINI_API_KEY is not set. Add it to app/.env (see app/.env.example).')
  createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/api/health') return send(res, 200, { ok: true, model: MODEL, keySet: !!process.env.GEMINI_API_KEY })
    if (req.method !== 'POST' || req.url !== '/api/chat') return send(res, 404, { error: 'Not found' })
    try {
      if (!process.env.GEMINI_API_KEY) return send(res, 503, { error: 'The server has no GEMINI_API_KEY. Add it to app/.env and restart `npm run server`.' })
      const { messages, regionId, selectedTract } = JSON.parse(await readBody(req))
      if (!Array.isArray(messages) || !messages.length) return send(res, 400, { error: 'messages required' })
      send(res, 200, await chat({ messages, regionId: regionId || 'central-florida', selectedTract }))
    } catch (e) {
      console.error(e.message)
      if (e.status === 429) return send(res, 429, { error: 'The free Gemini quota is used up for now. Wait a minute and try again.' })
      if (e.status === 503 || e.status === 504 || e.status === 502) return send(res, 503, { error: 'Gemini is busy or slow right now (a Google-side issue). Try again in a minute.' })
      send(res, 500, { error: 'Something went wrong talking to Gemini. Check the server log.' })
    }
  }).listen(PORT, '127.0.0.1', () => console.log(`Chat server on http://127.0.0.1:${PORT} (model ${MODEL})`))
}
