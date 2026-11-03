import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// fileURLToPath decodes percent-escapes, so this works from a path containing
// spaces, unicode, or a Windows drive letter — `new URL().pathname` does not.
const DOCTOR = fileURLToPath(new URL('../scripts/memory-doctor.mjs', import.meta.url))

/** Build a throwaway DSH home + project, run the doctor, return {code, stdout}. */
function run({ core = '', project = '', archives = {}, folder = 'memory' }) {
  const root = mkdtempSync(join(tmpdir(), 'memdoctor-'))
  const home = join(root, 'home')
  const proj = join(root, 'proj')
  mkdirSync(home, { recursive: true })
  mkdirSync(proj, { recursive: true })

  if (core) writeFileSync(join(home, 'AGENTS.md'), core, 'utf8')
  if (project) writeFileSync(join(proj, 'AGENTS.md'), project, 'utf8')

  const memDir = join(proj, folder)
  mkdirSync(memDir, { recursive: true })
  for (const [name, body] of Object.entries(archives)) {
    writeFileSync(join(memDir, name), body, 'utf8')
  }

  let code = 0
  let stdout = ''
  try {
    stdout = execFileSync(process.execPath, [DOCTOR], {
      env: {
        ...process.env,
        DSH_HOME: home,
        MEMORY_DIR: memDir,
        MEMORY_PROJECT: join(proj, 'AGENTS.md'),
      },
      encoding: 'utf8',
    })
  } catch (e) {
    code = e.status ?? 1
    stdout = (e.stdout ?? '') + (e.stderr ?? '')
  }
  rmSync(root, { recursive: true, force: true })
  return { code, stdout }
}

test('passes on a well-formed setup', () => {
  const { code, stdout } = run({
    core: '| `memory\\notes.md` | read it |\n',
    archives: { 'notes.md': '# Notes\n' },
  })
  assert.equal(code, 0, stdout)
  assert.match(stdout, /5\/5 passed/)
})

test('fails when an archive is not referenced by the core file', () => {
  const { code, stdout } = run({
    core: '| `memory\\notes.md` | read it |\n',
    archives: { 'notes.md': '# Notes\n', 'orphan.md': '# Nobody points here\n' },
  })
  assert.equal(code, 1)
  assert.match(stdout, /orphan\.md/)
  assert.match(stdout, /dead files/)
})

test('fails when the core file points at a missing archive', () => {
  const { code, stdout } = run({
    core: '| `memory\\ghost.md` | read it |\n',
    archives: { 'ghost.md': '# x\n', 'real.md': '# y\n' },
  })
  assert.equal(code, 1)
  assert.match(stdout, /ghost\.md|real\.md/)
})

test('detects stale wording that should have been removed', () => {
  const { code, stdout } = run({
    core: 'the limit is 65229 bytes\n',
    archives: {},
  })
  assert.equal(code, 1)
  assert.match(stdout, /65229/)
})

test('detects duplicate section numbers in an archive', () => {
  const { code, stdout } = run({
    core: '| `memory\\dup.md` | x |\n',
    archives: { 'dup.md': '## 一、A\n## 二、B\n## 二、C\n' },
  })
  assert.equal(code, 1)
  assert.match(stdout, /duplicate/)
})

test('works when the archive folder has a non-English name', () => {
  const { code, stdout } = run({
    core: '| `记忆\\笔记.md` | x |\n',
    folder: '记忆',
    archives: { '笔记.md': '# 笔记\n' },
  })
  assert.equal(code, 0, stdout)
})

test('accepts forward slashes in references', () => {
  const { code, stdout } = run({
    core: '| `memory/notes.md` | x |\n',
    archives: { 'notes.md': '# Notes\n' },
  })
  assert.equal(code, 0, stdout)
})

test('emits machine-readable JSON with --json', () => {
  const root = mkdtempSync(join(tmpdir(), 'memdoctor-json-'))
  const home = join(root, 'home')
  const proj = join(root, 'proj')
  mkdirSync(home, { recursive: true })
  mkdirSync(join(proj, 'memory'), { recursive: true })
  writeFileSync(join(home, 'AGENTS.md'), '| `memory\\a.md` | x |\n', 'utf8')
  writeFileSync(join(proj, 'memory', 'a.md'), '# a\n', 'utf8')

  const out = execFileSync(process.execPath, [DOCTOR, '--json'], {
    env: { ...process.env, DSH_HOME: home, MEMORY_DIR: join(proj, 'memory'), MEMORY_PROJECT: join(proj, 'AGENTS.md') },
    encoding: 'utf8',
  })
  const parsed = JSON.parse(out)
  assert.equal(parsed.ok, true)
  assert.equal(parsed.results.length, 5)
  rmSync(root, { recursive: true, force: true })
})
