#!/usr/bin/env node
/**
 * memory-doctor — verify the invariants of a layered agent-memory setup.
 *
 * Five checks:
 *   1. byte budget      core + project files under the injection budget, with headroom
 *   2. stale wording    superseded phrasing has actually been removed from core
 *   3. section numbers  no duplicate or skipped "## N、" headings in archives
 *   4. index pointers   every `memory\...md` named in core resolves on disk
 *   5. reverse index    every archive on disk is named in core (the dead-file check)
 *
 * Configuration (all optional, via environment):
 *   DSH_HOME          defaults to ~/.dsh
 *   MEMORY_DIR        defaults to ./memory     (the routed archive folder)
 *   MEMORY_PROJECT    defaults to ./AGENTS.md  (project-level rules file)
 *   MEMORY_BUDGET     defaults to 65536        (bytes, combined)
 *   MEMORY_MIN_HEADROOM defaults to 10240
 *
 * Usage: node scripts/memory-doctor.mjs [--json]
 * Exit:  0 all pass, 1 any failure
 */

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'

const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const CORE = join(DSH_HOME, 'AGENTS.md')
const MEMORY_DIR = resolve(process.env.MEMORY_DIR ?? 'memory')
const PROJECT = resolve(process.env.MEMORY_PROJECT ?? 'AGENTS.md')
const BUDGET = Number(process.env.MEMORY_BUDGET ?? 65536)
const MIN_HEADROOM = Number(process.env.MEMORY_MIN_HEADROOM ?? 10240)

// Phrases that indicate a superseded rule is still present. Override with your own.
const STALE = (process.env.MEMORY_STALE ?? '65229,静默截断').split(',').filter(Boolean)

const results = []
const check = (name, ok, detail) => results.push({ name, ok, detail })
const bytes = f => (existsSync(f) ? statSync(f).size : 0)

// ---------- 1. byte budget ----------
const coreBytes = bytes(CORE)
const projBytes = bytes(PROJECT)
// A CLAUDE.md beside the project file counts toward the same budget, but never
// count the project file twice when it is itself named CLAUDE.md.
const claudePath = PROJECT.replace(/(AGENTS|CLAUDE)\.md$/i, 'CLAUDE.md')
const claudeBytes = resolve(claudePath) === PROJECT ? 0 : bytes(claudePath)
const total = coreBytes + projBytes + claudeBytes
const headroom = BUDGET - total

{
  const over = total > BUDGET
  const thin = !over && headroom < MIN_HEADROOM
  check(
    'bytes',
    !over && !thin,
    `${total} / ${BUDGET} (core ${coreBytes} + project ${projBytes} + CLAUDE.md ${claudeBytes}), ` +
      `headroom ${headroom}` +
      (over ? ' — OVER BUDGET: the broadest file is dropped wholesale' : '') +
      (thin ? ` — headroom below ${MIN_HEADROOM}` : '')
  )
}

// ---------- 2. stale wording ----------
if (existsSync(CORE)) {
  const text = readFileSync(CORE, 'utf8')
  const hits = STALE.filter(s => text.includes(s))
  check('stale', hits.length === 0, hits.length ? `still present: ${hits.join(', ')}` : 'none')
} else {
  check('stale', false, `core file not found: ${CORE}`)
}

// ---------- 3. archive section numbering ----------
const CN = '一二三四五六七八九十'
if (existsSync(MEMORY_DIR)) {
  const problems = []
  for (const f of readdirSync(MEMORY_DIR).filter(n => n.endsWith('.md'))) {
    const nums = []
    for (const line of readFileSync(join(MEMORY_DIR, f), 'utf8').split(/\r?\n/)) {
      const m = /^##\s+([一二三四五六七八九十]+)、/.exec(line)
      if (m) nums.push(m[1])
    }
    const seen = new Set()
    const dup = new Set()
    for (const n of nums) {
      if (seen.has(n)) dup.add(n)
      seen.add(n)
    }
    if (dup.size) problems.push(`${f}: duplicate [${[...dup].join(',')}]`)

    const idx = nums.map(n => CN.indexOf(n)).filter(i => i >= 0)
    for (let i = 1; i < idx.length; i++) {
      if (idx[i] !== idx[i - 1] + 1) {
        problems.push(`${f}: gap ${CN[idx[i - 1]]}→${CN[idx[i]]}`)
      }
    }
  }
  check('sections', problems.length === 0, problems.length ? problems.join('; ') : 'contiguous, no duplicates')
} else {
  check('sections', false, `archive folder not found: ${MEMORY_DIR}`)
}

// ---------- 4 + 5. index pointers and reverse index ----------
if (existsSync(CORE) && existsSync(MEMORY_DIR)) {
  const text = readFileSync(CORE, 'utf8')
  // The archive folder can be named anything (memory/, 记忆/, notes/...).
  // Derive the token to look for from the folder's own basename, and accept
  // either separator so `notes\x.md` and `notes/x.md` both count.
  const folderName = MEMORY_DIR.split(/[\\/]/).filter(Boolean).pop() ?? 'memory'
  const escaped = folderName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const refRe = new RegExp('`[^`]*' + escaped + '[\\\\/]([^`\\\\/]+\\.md)`', 'gi')
  const refs = new Set()
  for (const m of text.matchAll(refRe)) refs.add(m[1])

  const onDisk = readdirSync(MEMORY_DIR).filter(n => n.endsWith('.md'))

  const missing = [...refs].filter(n => !onDisk.includes(n))
  check('pointers', missing.length === 0, missing.length ? `dangling: ${missing.join(', ')}` : `${refs.size}/${refs.size} resolve`)

  const unlisted = onDisk.filter(n => !refs.has(n))
  check(
    'reverse',
    unlisted.length === 0,
    unlisted.length ? `archives nothing points at (dead files): ${unlisted.join(', ')}` : 'every archive is registered'
  )
} else {
  check('pointers', false, 'core file or archive folder missing')
  check('reverse', false, 'core file or archive folder missing')
}

// ---------- output ----------
const fail = results.filter(r => !r.ok).length

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ok: fail === 0, results, budget: { total, limit: BUDGET, headroom } }, null, 2))
} else {
  console.log('\n=== memory-doctor ===\n')
  for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name.padEnd(9)} ${r.detail}`)
  console.log(`\n${results.length - fail}/${results.length} passed\n`)
  if (fail) {
    console.log('Fix the failures above and re-run.')
    console.log('Back up before editing:  cp <file> <file>.bak-YYYYMMDD\n')
  }
}

process.exit(fail === 0 ? 0 : 1)
