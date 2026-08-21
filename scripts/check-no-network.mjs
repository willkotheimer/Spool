/**
 * The zero-network gate (PLAN.md 5d). Fails the build on anything that could open a connection.
 *
 * Three checks, in the order they are cheapest to reason about:
 *
 *   1. Source under src/ that names a networking API.
 *   2. A production dependency from the banned list.
 *   3. A production dependency tree that differs from the committed snapshot, so a new transitive
 *      dependency arrives as a reviewable diff rather than a silent addition.
 *
 * Run it with `npm run check:network`. Refresh the snapshot with `--update-snapshot` after
 * deliberately changing dependencies, and commit the result with the change that caused it.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(ROOT, 'src')
const SNAPSHOT = join(ROOT, 'deps-snapshot.json')

/**
 * The one file allowed to name these APIs is the guard that revokes them, plus the test that proves
 * the revocation. Exempting them by exact path is what keeps the exemption from spreading.
 */
const EXEMPT = new Set(['src/main/guard.ts', 'src/main/guard.test.ts'])

const FORBIDDEN_SOURCE = [
  { name: "require('http')", pattern: /require\(\s*['"]node:?http['"]\s*\)|from\s+['"]node:http['"]/ },
  { name: "require('https')", pattern: /require\(\s*['"]node:?https['"]\s*\)|from\s+['"]node:https['"]/ },
  { name: "require('net')", pattern: /require\(\s*['"]node:?net['"]\s*\)|from\s+['"]node:net['"]/ },
  { name: "require('dgram')", pattern: /require\(\s*['"]node:?dgram['"]\s*\)|from\s+['"]node:dgram['"]/ },
  { name: 'fetch(', pattern: /(?<![\w.])fetch\s*\(/ },
  { name: 'XMLHttpRequest', pattern: /XMLHttpRequest/ },
  { name: 'new WebSocket', pattern: /new\s+WebSocket/ },
  { name: 'navigator.sendBeacon', pattern: /sendBeacon/ },
  { name: 'EventSource', pattern: /(?<![\w.])EventSource/ },
  { name: 'a URL passed to dynamic import()', pattern: /import\(\s*['"`]https?:\/\// }
]

const BANNED_DEPENDENCIES = [
  'axios',
  'node-fetch',
  'got',
  'undici',
  'ws',
  'superagent',
  'electron-updater'
]

const failures = []
const fail = (message) => failures.push(message)

async function sourceFiles(dir) {
  const found = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...(await sourceFiles(full)))
    else if (/\.(ts|tsx|js|jsx|mjs|cjs|html)$/.test(entry.name)) found.push(full)
  }
  return found
}

async function checkSource() {
  for (const file of await sourceFiles(SRC)) {
    const path = relative(ROOT, file).split(sep).join('/')
    if (EXEMPT.has(path)) continue

    const lines = (await readFile(file, 'utf8')).split(/\r?\n/)
    lines.forEach((line, index) => {
      for (const { name, pattern } of FORBIDDEN_SOURCE) {
        if (pattern.test(line)) fail(`${path}:${index + 1} names ${name} — ${line.trim()}`)
      }
    })
  }
}

function productionTree() {
  // `npm ls` exits non-zero on extraneous or missing packages; the JSON is still what we want.
  try {
    return execFileSync('npm', ['ls', '--omit=dev', '--all', '--json'], {
      cwd: ROOT,
      encoding: 'utf8',
      shell: process.platform === 'win32'
    })
  } catch (error) {
    if (error.stdout) return error.stdout
    throw error
  }
}

function checkDependencies(tree) {
  const names = new Set()
  const walk = (node) => {
    for (const [name, child] of Object.entries(node.dependencies ?? {})) {
      names.add(name)
      walk(child)
    }
  }
  walk(tree)

  for (const banned of BANNED_DEPENDENCIES) {
    if (names.has(banned)) fail(`production dependency "${banned}" is banned by PLAN.md 5d`)
  }
  return names
}

function checkSnapshot(tree) {
  const current = JSON.stringify({ dependencies: tree.dependencies ?? {} }, null, 2) + '\n'

  if (process.argv.includes('--update-snapshot')) {
    writeFileSync(SNAPSHOT, current)
    console.log(`Wrote ${relative(ROOT, SNAPSHOT)}. Commit it with the change that caused it.`)
    return
  }

  let committed
  try {
    committed = readFileSync(SNAPSHOT, 'utf8')
  } catch {
    fail('deps-snapshot.json is missing. Run `npm run check:network -- --update-snapshot`.')
    return
  }

  if (committed !== current) {
    fail(
      'the production dependency tree differs from deps-snapshot.json. Review the change, then ' +
        'run `npm run check:network -- --update-snapshot` and commit the result.'
    )
  }
}

await checkSource()
const tree = JSON.parse(productionTree())
checkDependencies(tree)
checkSnapshot(tree)

if (failures.length > 0) {
  console.error(`\nThe zero-network gate failed (PLAN.md 5):\n`)
  for (const failure of failures) console.error(`  - ${failure}`)
  console.error(
    `\nThis app has no network features by design. If a change genuinely needs one, it is the ` +
      `design that has to change first.\n`
  )
  process.exit(1)
}

console.log('Zero-network gate passed: no networking APIs in src/, no banned dependencies, tree matches snapshot.')
