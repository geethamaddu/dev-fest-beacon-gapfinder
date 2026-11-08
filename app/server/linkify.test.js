// Run: node server/linkify.test.js  (also run by npm test)
// Renders chat answers with the same markdown setup as ChatPanel and checks tract links.
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { remarkTractLinks } from '../src/lib/linkify.js'

const tracts = [
  { geoid: '12095017111', label: 'Orange tract 017111' },
  { geoid: '12095013507', label: 'Orange tract 013507' },
]
const render = (md) => renderToStaticMarkup(h(ReactMarkdown, { remarkPlugins: [remarkGfm, [remarkTractLinks, { tracts }]] }, md))
const links = (html) => [...html.matchAll(/<a href="#tract\/(\d+)">([^<]*)<\/a>/g)].map((m) => `${m[2]}->${m[1]}`)

// bold label + id in parentheses (the format the model usually uses)
assert.deepEqual(links(render('1. **Orange tract 017111** (12095017111) — Orange')), ['Orange tract 017111->12095017111', '12095017111->12095017111'])
// leading zero dropped
assert.deepEqual(links(render('See Orange tract 13507.')), ['Orange tract 13507->12095013507'])
// inside a table cell
assert.deepEqual(links(render('| Tract | X |\n|---|---|\n| Orange tract 013507 | 1 |')), ['Orange tract 013507->12095013507'])
// the model's own link and inline code are left alone, so nothing nests or shows raw brackets
const own = render('[Orange tract 017111](12095017111) and `12095013507`')
assert.deepEqual(links(own), [])
assert.ok(!own.includes('#tract/'), own)
// tracts not reported by the server stay plain text
assert.deepEqual(links(render('Orange tract 099999 (12095099999)')), [])
// no raw markdown link syntax ever leaks into the output
assert.ok(!render('**Orange tract 017111** ([12095017111])').includes('](#tract'))

console.log('All link tests passed.')
