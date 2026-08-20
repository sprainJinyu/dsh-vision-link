import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
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
  'index.mjs', 'client.js', 'src/index.js', 'cordis.patch.yml', 'examples/settings.yaml',
  'CONTRIBUTING.md', 'SECURITY.md', 'docs/ARCHITECTURE.md', 'docs/TROUBLESHOOTING.md',
]
const forbidden = [
  /^artifacts\//,
  /(^|\/)node_modules\//,
  /(^|\/)(CONTEXT_MEMORY|GPT_ANALYSIS_AND_DEBUG_LOG|todo)\.md$/,
  /REPORT_\d{4}-\d{2}-\d{2}\.md$/,
  /^[^/]+\.png$/,
  /^docs\/assets\//,
]
const missing = required.filter((file) => !files.includes(file))
const leaked = files.filter((file) => forbidden.some((pattern) => pattern.test(file)))

if (missing.length > 0 || leaked.length > 0) {
  if (missing.length > 0) console.error(`missing package files: ${missing.join(', ')}`)
  if (leaked.length > 0) console.error(`private files in package: ${leaked.join(', ')}`)
  process.exitCode = 1
} else {
  console.log(`package contents verified: ${files.length} files, ${pack.size} bytes`)
}
