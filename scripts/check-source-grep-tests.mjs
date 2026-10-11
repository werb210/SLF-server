#!/usr/bin/env node
// SLF_NO_SOURCE_GREP_v789
// Counts test files that read a file under src/ to assert on its text (a regex
// over server.ts, a toContain over sync.worker.ts, ...). Such tests pass while
// the behaviour is broken and fail on harmless refactors. Fails when the count
// rises above scripts/source-grep-baseline.json; lower the baseline as tests are
// rewritten, never raise it.
//
// A test file counts when it calls a file-reading API (readFileSync, readFile,
// createReadStream) and contains a string literal that resolves - relative to
// the test file or to the repo root - to an existing file under src/. Import
// specifiers do not resolve to files (they carry no extension), so ordinary
// imports and vi.mock() paths are not counted.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const srcDir = path.join(root, "src")
const baselineFile = path.join(root, "scripts", "source-grep-baseline.json")

const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/
const READ_CALL = /\b(readFileSync|readFile|createReadStream)\s*\(/
const STRING_LITERAL = /(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (TEST_FILE.test(entry.name)) out.push(full)
  }
  return out
}

function isSourceFile(candidate) {
  const rel = path.relative(srcDir, candidate)
  if (rel.startsWith("..") || path.isAbsolute(rel)) return false
  try {
    return fs.statSync(candidate).isFile()
  } catch {
    return false
  }
}

export function sourceFilesRead(testFile) {
  const text = fs.readFileSync(testFile, "utf8")
  if (!READ_CALL.test(text)) return []
  const hits = new Set()
  for (const match of text.matchAll(STRING_LITERAL)) {
    const literal = match[2]
    if (!literal || literal.includes("${") || literal.includes("\n")) continue
    for (const candidate of [path.resolve(path.dirname(testFile), literal), path.resolve(root, literal)]) {
      if (isSourceFile(candidate)) hits.add(path.relative(root, candidate))
    }
  }
  return [...hits]
}

const offenders = []
for (const file of [...walk(path.join(root, "test")), ...walk(srcDir)]) {
  const read = sourceFilesRead(file)
  if (read.length) offenders.push({ file: path.relative(root, file), read })
}

const baseline = JSON.parse(fs.readFileSync(baselineFile, "utf8"))
const max = Number(baseline.maxTestFilesReadingSource)
if (!Number.isInteger(max) || max < 0) {
  console.error(`${path.relative(root, baselineFile)}: maxTestFilesReadingSource must be a non-negative integer`)
  process.exit(2)
}

for (const { file, read } of offenders) console.log(`  ${file} reads ${read.join(", ")}`)
console.log(`Test files reading source text: ${offenders.length} (baseline ${max})`)

if (offenders.length > max) {
  console.error(
    "Source-grep tests went up. Test what the code does (call it, or drive the app over HTTP) instead of reading its source.",
  )
  process.exit(1)
}
if (offenders.length < max) {
  console.log(`Below baseline - lower maxTestFilesReadingSource to ${offenders.length}.`)
}
