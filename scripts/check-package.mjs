import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8')
const changelogVersion = changelog.match(/^## \[(?<version>[^\]]+)\]/m)?.groups?.version
const npmCli = process.env.npm_execpath
if (!npmCli) throw new Error('check-package must run from an npm script')
const output = execFileSync(process.execPath, [npmCli, 'pack', '--dry-run', '--json'], {
  cwd: root,
  encoding: 'utf8',
})
const [pack] = JSON.parse(output)
const files = pack.files.map((entry) => entry.path)
const required = [
  'package.json', 'LICENSE', 'README.md', 'README.zh-CN.md', 'CHANGELOG.md',
  'index.mjs', 'client.js', 'src/index.js', 'src/intake-support.js',
  'cordis.patch.yml', 'examples/settings.yaml',
  'CONTRIBUTING.md', 'SECURITY.md', 'docs/ARCHITECTURE.md', 'docs/TROUBLESHOOTING.md',
]
const mustBeTracked = [
  ...required,
  'package-lock.json',
  'test/vision-link.test.mjs',
  'scripts/check-package.mjs',
  'scripts/check-text.mjs',
]
const forbidden = [
  /^artifacts\//,
  /(^|\/)node_modules\//,
  /(^|\/)(CONTEXT_MEMORY|GPT_ANALYSIS_AND_DEBUG_LOG|todo)\.md$/,
  /REPORT_\d{4}-\d{2}-\d{2}\.md$/,
  /VALIDATION_SUMMARY/,
  /^[^/]+\.png$/,
  /^docs\/assets\//,
]
const missing = required.filter((file) => !files.includes(file))
const leaked = files.filter((file) => forbidden.some((pattern) => pattern.test(file)))
const failures = []

function trackedFiles() {
  if (!existsSync(join(root, '.git'))) return null
  try {
    return new Set(
      execFileSync('git', ['-c', 'core.quotepath=false', 'ls-files'], {
        cwd: root,
        encoding: 'utf8',
      }).split(/\r?\n/).filter(Boolean),
    )
  } catch {
    return null
  }
}

if (changelogVersion !== pkg.version) {
  failures.push(`CHANGELOG.md first version ${JSON.stringify(changelogVersion)} does not match package.json version ${JSON.stringify(pkg.version)}`)
}
if (missing.length > 0) failures.push(`missing package files: ${missing.join(', ')}`)
if (leaked.length > 0) failures.push(`private files in package: ${leaked.join(', ')}`)

const tracked = trackedFiles()
if (tracked) {
  const untrackedRequired = mustBeTracked.filter((file) => !tracked.has(file))
  if (untrackedRequired.length > 0) {
    failures.push(`required files are not git-tracked (clone would be incomplete): ${untrackedRequired.join(', ')}`)
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exitCode = 1
} else {
  console.log(`package contents and version verified: ${files.length} files, ${pack.size} bytes`)
}
