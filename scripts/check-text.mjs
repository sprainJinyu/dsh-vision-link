import { readdirSync, readFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const textExtensions = new Set(['.js', '.mjs', '.json', '.md', '.yml', '.yaml'])
const publicDirectories = ['.github', 'docs', 'examples', 'scripts', 'src', 'test']
const privateRootFiles = new Set([
  'CONTEXT_MEMORY.md',
  'GPT_ANALYSIS_AND_DEBUG_LOG.md',
  'INDEPENDENT_FIX_REPORT_2026-08-19.md',
  'READ_ONLY_MAPPING_REPORT_2026-08-20.md',
  'ROUTE_PRESERVING_VISION_REPORT_2026-08-20.md',
  'todo.md',
])

function collect(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return collect(path)
    return textExtensions.has(extname(entry.name)) ? [path] : []
  })
}

const rootFiles = readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isFile() && textExtensions.has(extname(entry.name)) && !privateRootFiles.has(entry.name))
  .map((entry) => resolve(root, entry.name))
const files = [
  ...rootFiles,
  ...publicDirectories.flatMap((directory) => {
    try { return collect(resolve(root, directory)) } catch { return [] }
  }),
]
const failures = []

for (const file of files) {
  const buffer = readFileSync(file)
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    failures.push(`${file}: UTF-8 BOM is not allowed`)
  }
  if (buffer.includes(0)) failures.push(`${file}: NUL byte found in text file`)
}

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exitCode = 1
} else {
  console.log(`checked ${files.length} public text files (UTF-8 without BOM)`)
}
