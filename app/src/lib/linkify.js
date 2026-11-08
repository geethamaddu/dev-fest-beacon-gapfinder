// Remark plugin: after markdown is parsed, turns tract ids and labels (the ones the
// chat server says are in the answer) into "#tract/<geoid>" links that ChatPanel
// opens on the map. Working on the parsed tree, not the markdown text, means the
// model's own formatting (bold, tables, its own links) can't break the links.
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export const dropZero = (label) => label.replace(/(\d{6})$/, (s) => String(Number(s)))

export function tractMatcher(tracts) {
  if (!tracts?.length) return null
  const byText = new Map()
  for (const t of tracts) {
    byText.set(t.geoid, t.geoid)
    byText.set(t.label, t.geoid)
    byText.set(dropZero(t.label), t.geoid)
  }
  const keys = [...byText.keys()].sort((a, b) => b.length - a.length).map(esc)
  return { re: new RegExp(`(?<!\\w)(${keys.join('|')})(?!\\w)`, 'g'), byText }
}

// Splits one text value into text and link nodes.
export function splitText(value, matcher) {
  const out = []
  let last = 0
  for (const m of value.matchAll(matcher.re)) {
    if (m.index > last) out.push({ type: 'text', value: value.slice(last, m.index) })
    out.push({ type: 'link', url: `#tract/${matcher.byText.get(m[0])}`, children: [{ type: 'text', value: m[0] }] })
    last = m.index + m[0].length
  }
  if (!out.length) return null
  if (last < value.length) out.push({ type: 'text', value: value.slice(last) })
  return out
}

const SKIP = new Set(['link', 'linkReference', 'inlineCode', 'code', 'definition'])

export function remarkTractLinks({ tracts } = {}) {
  const matcher = tractMatcher(tracts)
  return (tree) => {
    if (!matcher) return
    const walk = (node) => {
      if (!node.children || SKIP.has(node.type)) return
      node.children = node.children.flatMap((child) => {
        if (child.type === 'text') return splitText(child.value, matcher) || [child]
        walk(child)
        return [child]
      })
    }
    walk(tree)
  }
}
