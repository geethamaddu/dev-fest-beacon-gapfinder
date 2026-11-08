// Decisions, notes and activity history, kept in the browser's localStorage.
import { useSyncExternalStore } from 'react'

const KEY_DECISIONS = 'bgf_decisions_v1'
const KEY_HISTORY = 'bgf_history_v1'
const MAX_HISTORY = 2000

function load(key, fallback) {
  try {
    const v = localStorage.getItem(key)
    return v ? JSON.parse(v) : fallback
  } catch {
    return fallback
  }
}

let state = { decisions: load(KEY_DECISIONS, {}), history: load(KEY_HISTORY, []) }
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
export const decisionKey = (regionId, geoid) => `${regionId}:${geoid}`

export function logEvent(type, info = {}) {
  const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ts: now(), type, ...info }
  commit({ ...state, history: [entry, ...state.history].slice(0, MAX_HISTORY) })
}

export function setDecision(regionId, geoid, label, status, note) {
  const key = decisionKey(regionId, geoid)
  const cur = state.decisions[key] || { status: 'pending', notes: [] }
  const notes = note ? [...cur.notes, { ts: now(), text: note, status }] : cur.notes
  commit({ ...state, decisions: { ...state.decisions, [key]: { status, notes, updated: now() } } })
  logEvent('decision', {
    region: regionId, geoid, label,
    detail: `${status === 'approved' ? 'Approved' : 'Rejected'} ${label}${note ? `: "${note}"` : ''}`,
  })
}

export function addNote(regionId, geoid, label, note) {
  const key = decisionKey(regionId, geoid)
  const cur = state.decisions[key] || { status: 'pending', notes: [] }
  commit({ ...state, decisions: { ...state.decisions, [key]: { ...cur, notes: [...cur.notes, { ts: now(), text: note }], updated: now() } } })
  logEvent('note', { region: regionId, geoid, label, detail: `Note on ${label}: "${note}"` })
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
