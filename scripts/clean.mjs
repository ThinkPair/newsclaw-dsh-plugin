import { rmSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(projectRoot, 'lib')

// Refuse to delete anything except this package's exact generated lib folder.
if (dirname(output) !== projectRoot || basename(output) !== 'lib') {
  throw new Error(`refusing to clean unexpected output path: ${output}`)
}
rmSync(output, { recursive: true, force: true })
