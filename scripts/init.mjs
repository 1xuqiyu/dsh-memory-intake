#!/usr/bin/env node
/**
 * init.mjs — install the memory-intake skill, or scaffold a project.
 *
 *   node scripts/init.mjs --install
 *       Copy SKILL.md + memory-doctor.mjs into $DSH_HOME/skills/memory-intake/
 *
 *   node scripts/init.mjs --scaffold <dir>
 *       Create <dir>/memory/ with starter archive files and an AGENTS.snippet.md
 *
 *   node scripts/init.mjs --check
 *       Report where things are installed.
 */

import { mkdirSync, copyFileSync, existsSync, writeFileSync, readdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const SKILL_DIR = join(DSH_HOME, 'skills', 'memory-intake')

const STARTER_FILES = {
  'README.md': `# Memory library — index and rules

> **Read this before changing anything in this folder.**

## Rules

1. A fact lives in exactly one place: here, or in the core \`AGENTS.md\`. Never both.
2. Every file in this folder **must** have a keyword row in the core file's routing table.
   No row means the file is never read — it may as well not exist.
3. Process detail, logs and one-off forensics go here. Conclusions and preferences go to core.
4. Never reference these files with \`@\` — that still consumes the core file's byte budget.

## Files

| File | Contents |
|---|---|
| \`example.md\` | Placeholder — replace with your first real archive |
`,

  'example.md': `# Example archive

Delete this file once you have a real one.

Whatever you write here is **not** loaded automatically. It is reached only when the core
file's keyword routing table sends the agent here.

So the first thing to do when adding a file is to add its keyword row.
`,

  'AGENTS.snippet.md': `# Project rules

## Retrieval and memory (always on)

Surfaces are reached in this fixed order — do not skip a level:

1. **\`web_fetch\` first** — ordinary pages and search-result pages.
2. **On a block, fall back to a browser** — signals: \`403\` / \`412\` / \`429\`,
   \`Just a moment...\`, a captcha, an empty shell where a content page should be.
3. **\`curl\` only when you need raw bytes / cookies / custom headers.**

## Memory routing (hard rule — self-check before every answer)

Memory archives are **not** auto-loaded. Any hit below means: **read the file first, then act.**

| Trigger keywords (any one) | Read first |
|---|---|
| *(fill in your own rows — one row per archive file)* | \`memory\\\\<file>.md\` |

> Keyword matching is literal. Do not skip a hit because it "doesn't feel relevant".

**Adding a memory?** Load the \`memory-intake\` skill and follow its four steps.
Then run \`node ~/.dsh/skills/memory-intake/memory-doctor.mjs\` — all five checks must pass.
`,
}

function install() {
  mkdirSync(SKILL_DIR, { recursive: true })
  for (const f of ['SKILL.md', 'memory-doctor.mjs']) {
    const src = join(HERE, f)
    const dst = join(SKILL_DIR, f)
    if (!existsSync(src)) {
      console.error(`✗ missing source: ${src}`)
      process.exitCode = 1
      return
    }
    copyFileSync(src, dst)
    console.log(`✓ ${dst}`)
  }
  console.log(`\nSkill installed. It will appear in the catalog on the next session.`)
}

function scaffold(target) {
  const dir = resolve(target)
  const mem = join(dir, 'memory')
  mkdirSync(mem, { recursive: true })
  for (const [name, body] of Object.entries(STARTER_FILES)) {
    const dst = name === 'AGENTS.snippet.md' ? join(dir, name) : join(mem, name)
    if (existsSync(dst)) {
      console.log(`· skip (exists): ${dst}`)
      continue
    }
    writeFileSync(dst, body, 'utf8')
    console.log(`✓ ${dst}`)
  }
  console.log(`\nNext: paste AGENTS.snippet.md into your project AGENTS.md and fill the keyword rows.`)
}

function report() {
  const ok = existsSync(join(SKILL_DIR, 'SKILL.md'))
  console.log(`DSH_HOME      ${DSH_HOME}`)
  console.log(`skill dir     ${SKILL_DIR}`)
  console.log(`installed     ${ok ? 'yes' : 'no'}`)
  if (ok) {
    const files = readdirSync(SKILL_DIR)
    console.log(`files         ${files.join(', ')}`)
  }
}

const args = process.argv.slice(2)
if (args.includes('--install')) {
  install()
} else if (args.includes('--scaffold')) {
  const i = args.indexOf('--scaffold')
  const target = args[i + 1]
  if (!target) {
    console.error('usage: node scripts/init.mjs --scaffold <dir>')
    process.exit(1)
  }
  scaffold(target)
} else if (args.includes('--check')) {
  report()
} else {
  console.log(`dsh-memory-intake

usage:
  node scripts/init.mjs --install           install the skill into $DSH_HOME/skills/
  node scripts/init.mjs --scaffold <dir>    scaffold a memory/ folder + AGENTS snippet
  node scripts/init.mjs --check             report install state

  node scripts/memory-doctor.mjs            verify invariants (exit 1 on failure)`)
}
