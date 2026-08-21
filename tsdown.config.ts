/**
 * Standalone DSH bundle config. It reproduces the public closure-factory
 * contract used by Harness client plugins without reading an installed DSH
 * checkout, so build verification cannot mutate or depend on the live plugin.
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, dirname, relative, resolve as resolvePath, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type UserConfig } from 'tsdown'
import { transform } from 'lightningcss'

const ID = '@newsclaw/dsh-plugin'
const CSS_PREFIX = '\0newsclaw-css:'
const CSS_SUFFIX = '.mjs'
const PROJECT_ROOT = dirname(fileURLToPath(import.meta.url))
const cssSourceFiles = new Map<string, string>()

const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
  '@deepseek-ai/dsh-client-runtime/client',
] as const

function sourceAssetPath(source: string, importer: string): string {
  const emitted = resolvePath(dirname(importer), source)
  if (existsSync(emitted)) return emitted
  const marker = `${sep}lib${sep}types${sep}`
  const boundary = emitted.indexOf(marker)
  if (boundary < 0) return emitted
  return resolvePath(emitted.slice(0, boundary), 'src', emitted.slice(boundary + marker.length))
}

function cssStableName(file: string): string {
  const projectRelative = relative(PROJECT_ROOT, file).split(sep).join('/')
  const stableName = projectRelative === '..' || projectRelative.startsWith('../')
    ? basename(file)
    : projectRelative
  return stableName
}

function cssVirtualId(file: string): string {
  return CSS_PREFIX + cssStableName(file) + CSS_SUFFIX
}

const nodeConfig: UserConfig = {
  name: ID,
  entry: ['lib/types/index.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
}

const clientConfig: UserConfig = {
  name: `${ID}/client`,
  entry: { client: 'lib/types/client/index.js' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2024',
  dts: false,
  sourcemap: true,
  clean: false,
  deps: {
    neverBundle: [...PLATFORM_MODULES],
    alwaysBundle: (id: string) => !PLATFORM_MODULES.includes(id as typeof PLATFORM_MODULES[number]),
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
  plugins: [{
    name: 'newsclaw-css-modules-inline',
    resolveId(source: string, importer: string | undefined) {
      if (!source.endsWith('.module.css')) return null
      const file = importer === undefined ? resolvePath(PROJECT_ROOT, source) : sourceAssetPath(source, importer)
      const virtualId = cssVirtualId(file)
      const registered = cssSourceFiles.get(virtualId)
      if (registered !== undefined && registered !== file) {
        throw new Error(`CSS virtual module collision for ${virtualId}`)
      }
      cssSourceFiles.set(virtualId, file)
      return virtualId
    },
    async load(virtualId: string) {
      if (!virtualId.startsWith(CSS_PREFIX)) return null
      const file = cssSourceFiles.get(virtualId)
      if (file === undefined) return null
      this.addWatchFile(file)
      const source = await readFile(file)
      const { code, exports: cssExports } = transform({
        filename: cssStableName(file),
        code: source,
        cssModules: { pattern: '[hash]_[local]' },
        minify: true,
      })
      const classMap: Record<string, string> = {}
      // lightningcss does not guarantee export iteration order. Sort the
      // class map so two release builds from the same commit are byte-stable
      // and the frozen-package SHA-256 manifest remains reproducible.
      for (const [local, value] of Object.entries(cssExports ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
        classMap[local] = value.name
      }
      const tagId = `${ID}/${basename(file)}`
      return [
        `const css = ${JSON.stringify(code.toString())};`,
        `const tagId = ${JSON.stringify(tagId)};`,
        `if (typeof document !== 'undefined') {`,
        `  const existing = document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']');`,
        `  const tag = existing ?? document.createElement('style');`,
        `  tag.dataset.plugin = ${JSON.stringify(ID)};`,
        `  tag.dataset.pluginCss = tagId;`,
        `  if (tag.textContent !== css) tag.textContent = css;`,
        `  if (existing === null) document.head.appendChild(tag);`,
        `}`,
        `export default ${JSON.stringify(classMap)};`,
      ].join('\n')
    },
  }],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default defineConfig(({ env }) => {
  if (env?.DSH_BUILD_FACE !== undefined && env.DSH_BUILD_FACE !== 'client') {
    throw new Error(`--env.DSH_BUILD_FACE must be client, received ${String(env.DSH_BUILD_FACE)}`)
  }
  return [nodeConfig, clientConfig]
})
