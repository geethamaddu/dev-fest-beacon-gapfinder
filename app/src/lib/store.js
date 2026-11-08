// Decisions (approve / reject with an optional note) and the action history,
// kept in the browser's localStorage. History records actions only: decisions and undos.
import { useSyncExternalStore } from 'react'

const KEY_DECISIONS = 'bgf_decisions_v1'
const KEY_HISTORY = 'bgf_history_v1'
const MAX_HISTORY = 2000
const ACTION_TYPES = ['decision', 'undo']

function load(key, fallback) {
  try {
    const v = localStorage.getItem(key)
    return v ? JSON.parse(v) : fallback
  } catch {
    return fallback
  }
}

// Older versions also logged page views, region changes and notes; keep only actions.
let state = {
  decisions: load(KEY_DECISIONS, {}),
  history: load(KEY_HISTORY, []).filter((h) => ACTION_TYPES.includes(h.type)),
}
const subscribers = new Set()

function commit(next) {
  state = next
  try {
    localStorage.setItem(KEY_DECISIONS, JSON.stringify(state.decisions))
    localStorage.setItem(KEY_HISTORY, JSON.stringify(state.history))
  } catch {
    // storage unavailable: keep working in memory
  }
  subscribers.forEach((fn) => fn())
}

const now = () => new Date().toISOString()
const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
export const decisionKey = (regionId, geoid) => `${regionId}:${geoid}`
const verb = (status) => (status === 'approved' ? 'Approved' : 'Rejected')

export function setDecision(regionId, geoid, label, status, note) {
  const key = decisionKey(regionId, geoid)
  const prev = state.decisions[key] || null
  const notes = [...(prev?.notes || []), ...(note ? [{ ts: now(), text: note, status }] : [])]
  const entry = {
    id: newId(), ts: now(), type: 'decision', region: regionId, geoid, label, status, note: note || '', prev,
    detail: `${verb(status)} ${label}${note ? `: "${note}"` : ''}`,
  }
  commit({
    decisions: { ...state.decisions, [key]: { status, notes, updated: now() } },
    history: [entry, ...state.history].slice(0, MAX_HISTORY),
  })
}

// The newest decision on a tract that has not been undone (only that one can be undone).
export function latestDecision(history, regionId, geoid) {
  return history.find((h) => h.type === 'decision' && !h.undone && h.region === regionId && h.geoid === geoid) || null
}

export function undoDecision(entryId) {
  const entry = state.history.find((h) => h.id === entryId)
  if (!entry || entry.type !== 'decision' || entry.undone) return
  if (latestDecision(state.history, entry.region, entry.geoid)?.id !== entry.id) return
  const key = decisionKey(entry.region, entry.geoid)
  const decisions = { ...state.decisions }
  if (entry.prev) decisions[key] = entry.prev
  else delete decisions[key]
  const undo = {
    id: newId(), ts: now(), type: 'undo', region: entry.region, geoid: entry.geoid, label: entry.label,
    detail: `Undid: ${entry.detail} (back to ${entry.prev ? entry.prev.status : 'pending review'})`,
  }
  commit({
    decisions,
    history: [undo, ...state.history.map((h) => (h.id === entry.id ? { ...h, undone: true } : h))].slice(0, MAX_HISTORY),
  })
}

export function clearHistory() {
  commit({ ...state, history: [] })
}

const subscribe = (fn) => {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

export function useStore() {
  return useSyncExternalStore(subscribe, () => state)
}
