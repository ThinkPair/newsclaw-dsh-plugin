import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const root = process.cwd()
const cacheRoot = join(root, '.newsclaw-build-reproducibility')
const tsdownCli = join(root, 'node_modules', 'tsdown', 'dist', 'run.mjs')

// Node 24's native recursive cp currently crashes on some Windows Unicode
// worktree paths.  Copying the small fixture one file at a time keeps this
// regression test about tsdown output rather than a platform fs.cpSync bug.
function copyTree(source, destination) {
  mkdirSync(destination, { recursive: true })
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = join(source, entry.name)
    const to = join(destination, entry.name)
    if (entry.isDirectory()) copyTree(from, to)
    else if (entry.isFile()) copyFileSync(from, to)
    else assert.fail(`unsupported fixture entry: ${from}`)
  }
}

function buildFixture(name) {
  const fixture = join(cacheRoot, name)
  mkdirSync(fixture, { recursive: true })
  copyTree(join(root, 'src', 'client'), join(fixture, 'src', 'client'))
  copyTree(join(root, 'lib', 'types'), join(fixture, 'lib', 'types'))
  copyFileSync(join(root, 'package.json'), join(fixture, 'package.json'))
  copyFileSync(join(root, 'tsdown.config.ts'), join(fixture, 'tsdown.config.ts'))

  const result = spawnSync(
    process.execPath,
    [
      tsdownCli,
      '--config', 'tsdown.config.ts',
      '--env.DSH_BUILD_FACE', 'client',
    ],
    { cwd: fixture, encoding: 'utf8', timeout: 60_000 },
  )
  assert.equal(
    result.status,
    0,
    `fixture build failed (${name})\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  )
  return fixture
}

test('client rebuild is byte-stable across two checkout paths and leaks neither path', { timeout: 120_000 }, t => {
  rmSync(cacheRoot, { recursive: true, force: true })
  t.after(() => rmSync(cacheRoot, { recursive: true, force: true }))

  const left = buildFixture('checkout-alpha')
  const right = buildFixture('checkout-beta-with-a-longer-name')
  for (const artifact of ['client.js', 'client.js.map']) {
    const leftBytes = readFileSync(join(left, 'lib', artifact))
    const rightBytes = readFileSync(join(right, 'lib', artifact))
    assert.deepEqual(leftBytes, rightBytes, `${artifact} changed with checkout location`)

    const content = leftBytes.toString('utf8').replaceAll('\\', '/')
    assert.equal(content.includes(left.replaceAll('\\', '/')), false, `${artifact} leaked first checkout`)
    assert.equal(content.includes(right.replaceAll('\\', '/')), false, `${artifact} leaked second checkout`)
    assert.doesNotMatch(content, /[A-Za-z]:\/[^"'\s]+\/src\/client\/panel\.module\.css/i)
  }
})
