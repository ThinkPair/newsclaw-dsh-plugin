import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'

import { createBridge } from '../src/bridge.ts'
import { DEFAULT_API_URL, MAX_TIMEOUT_MS, MIN_TIMEOUT_MS, normalizeApiUrl, normalizeTimeoutMs } from '../src/config.ts'
import { resolveConfig } from '../src/index.ts'
import { registerBridgeTools } from '../src/tools.ts'

test('shared row config accepts only loopback HTTP(S) bases and finite budgets', () => {
  assert.equal(normalizeApiUrl('http://127.0.0.1:8430/'), 'http://127.0.0.1:8430')
  assert.equal(normalizeApiUrl('https://localhost:9443/base/'), 'https://localhost:9443/base')
  assert.equal(normalizeApiUrl('http://[::1]:8430/'), 'http://[::1]:8430')
  for (const invalid of ['javascript:alert(1)', 'https://example.com', 'http://user:pass@localhost:8430', 'http://localhost:8430?q=1', 'http://localhost:8430/#x']) {
    assert.equal(normalizeApiUrl(invalid), DEFAULT_API_URL)
  }
  assert.equal(normalizeTimeoutMs(Number.POSITIVE_INFINITY), 300_000)
  assert.equal(normalizeTimeoutMs(1), MIN_TIMEOUT_MS)
  assert.equal(normalizeTimeoutMs(9_999_999), MAX_TIMEOUT_MS)
  assert.equal(resolveConfig({ skillPath: 123 }).skillPath instanceof URL, true)
})

test('all 24 definitions execute the exact adapter command', async () => {
  const definitions = []
  const calls = []
  const bridge = {
    config: { apiUrl: DEFAULT_API_URL, skillPath: 'skill', timeoutMs: 5_000 },
    async run(command, argv) { calls.push({ command, argv }); return { command } },
  }
  registerBridgeTools({ tools: { register(def) { definitions.push(def); return () => undefined } } }, bridge)
  const cases = [
    ['newsclaw_get_capabilities', {}, 'capabilities'],
    ['newsclaw_recommend', {}, 'recommend'],
    ['newsclaw_reshuffle', {}, 'reshuffle'],
    ['newsclaw_append_recommendations', {}, 'append'],
    ['newsclaw_submit_feedback', { recommendationId: 1, feedbackType: 'open', requestId: 'feedback-1' }, 'submit-feedback'],
    ['newsclaw_get_spotlight', {}, 'get-spotlight'],
    ['newsclaw_respond_spotlight', { articleId: 'article-1', response: 'open', requestId: 'spotlight-1' }, 'respond-spotlight'],
    ['newsclaw_get_runtime_status', {}, 'runtime-status'],
    ['newsclaw_get_activity_feed', {}, 'activity-feed'],
    ['newsclaw_get_source_availability', {}, 'source-availability'],
    ['newsclaw_chat', { message: '你好', turnId: 'turn-1' }, 'chat'],
    ['newsclaw_get_chat_history', {}, 'chat-history'],
    ['newsclaw_next_probe', {}, 'next-probe'],
    ['newsclaw_respond_interest_probe', { domain: '宏观', response: 'confirm', requestId: 'interest-1' }, 'respond-interest-probe'],
    ['newsclaw_next_avoidance_probe', {}, 'next-avoidance-probe'],
    ['newsclaw_respond_avoidance_probe', { domain: '噪音', response: 'reject', requestId: 'avoid-1' }, 'respond-avoidance-probe'],
    ['newsclaw_get_profile', {}, 'get-profile'],
    ['newsclaw_get_profile_edit_state', {}, 'profile-edit-state'],
    ['newsclaw_edit_profile', { target: 'core.core_traits', op: 'reset' }, 'edit-profile'],
    ['newsclaw_save_local', { listKind: 'favorite', articleId: 'article-1' }, 'save-local'],
    ['newsclaw_remove_saved', { listKind: 'favorite', articleId: 'article-1' }, 'remove-saved'],
    ['newsclaw_list_saved', { listKind: 'watch_later' }, 'list-saved'],
    ['newsclaw_search_web', { query: 'latest public AI policy' }, 'research-search'],
    ['newsclaw_extract_evidence', { query: 'What changed?', urls: ['https://example.com/report'] }, 'research-extract'],
  ]
  assert.equal(definitions.length, 24)
  for (const [name, args, command] of cases) {
    const definition = definitions.find(item => item.name === name)
    assert.ok(definition, `${name} missing`)
    await definition.execute(args)
    assert.equal(calls.at(-1).command, command)
  }
  assert.deepEqual(calls.find(call => call.command === 'chat').argv, ['--message', '你好', '--turn-id', 'turn-1'])
  assert.deepEqual(calls.find(call => call.command === 'research-search').argv, [
    '--query', 'latest public AI policy', '--topic', 'general', '--max-results', '5',
  ])
  assert.deepEqual(calls.find(call => call.command === 'research-extract').argv, [
    '--query', 'What changed?', '--url', 'https://example.com/report', '--chunks-per-source', '2',
  ])

  await definitions.find(item => item.name === 'newsclaw_search_web').execute({
    query: 'market update', topic: 'finance', timeRange: 'day', maxResults: 99, refresh: true,
  })
  assert.deepEqual(calls.at(-1), {
    command: 'research-search',
    argv: ['--query', 'market update', '--topic', 'finance', '--max-results', '8', '--time-range', 'day', '--refresh'],
  })

  await definitions.find(item => item.name === 'newsclaw_extract_evidence').execute({
    query: 'Find the primary claim',
    urls: ['https://example.com/a', 'https://example.org/b'],
    chunksPerSource: 99,
    refresh: true,
  })
  assert.deepEqual(calls.at(-1), {
    command: 'research-extract',
    argv: [
      '--query', 'Find the primary claim',
      '--url', 'https://example.com/a',
      '--url', 'https://example.org/b',
      '--chunks-per-source', '3',
      '--refresh',
    ],
  })
})

test('bridge tool registration rolls back every prior tool on a partial failure', () => {
  const disposed = []
  let count = 0
  assert.throws(() => registerBridgeTools({ tools: { register(def) {
    count += 1
    if (count === 6) throw new Error('registry unavailable')
    return () => { disposed.push(def.name) }
  } } }, { config: { apiUrl: DEFAULT_API_URL, skillPath: 'skill', timeoutMs: 5_000 }, async run() { return null } }), /registry unavailable/)
  assert.deepEqual(disposed, [
    'newsclaw_submit_feedback',
    'newsclaw_append_recommendations',
    'newsclaw_reshuffle',
    'newsclaw_recommend',
    'newsclaw_get_capabilities',
  ])
})

test('tool input validation blocks unsupported or ambiguous writes locally', async () => {
  const definitions = []
  registerBridgeTools({ tools: { register(def) { definitions.push(def); return () => undefined } } }, {
    config: { apiUrl: DEFAULT_API_URL, skillPath: 'skill', timeoutMs: 5_000 },
    async run() { throw new Error('transport should not run') },
  })
  const byName = name => definitions.find(item => item.name === name)
  await assert.rejects(byName('newsclaw_submit_feedback').execute({ recommendationId: 0, feedbackType: 'like', requestId: 'x' }), /positive integer/)
  await assert.rejects(byName('newsclaw_submit_feedback').execute({ recommendationId: 1, feedbackType: 'favorite', requestId: 'x' }), /must be one of/)
  await assert.rejects(byName('newsclaw_submit_feedback').execute({ recommendationId: 1, feedbackType: 'comment', requestId: 'x' }), /note is required/)
  await assert.rejects(byName('newsclaw_respond_spotlight').execute({ articleId: 'a', response: 'ignore', requestId: 'x' }), /must be one of/)
  await assert.rejects(byName('newsclaw_chat').execute({ message: '你好' }), /(?:turnId is required|missing required property "turnId")/)
  await assert.rejects(byName('newsclaw_chat').execute({ message: '你好', turnId: 'x'.repeat(401) }), /turnId must be at most 400/)
  await assert.rejects(byName('newsclaw_list_saved').execute({ listKind: 'external' }), /must be one of/)
  await assert.rejects(byName('newsclaw_respond_interest_probe').execute({ domain: 'x', response: 'confirm', requestId: 'x'.repeat(401) }), /at most 400/)
  await assert.rejects(byName('newsclaw_search_web').execute({}), /(?:query is required|missing required property "query")/)
  await assert.rejects(byName('newsclaw_search_web').execute({ query: 'x', topic: 'private' }), /must be one of/)
  await assert.rejects(byName('newsclaw_search_web').execute({ query: 'x', timeRange: 'hour' }), /must be one of/)
  await assert.rejects(byName('newsclaw_extract_evidence').execute({ query: 'x', urls: [] }), /between 1 and 3/)
  await assert.rejects(byName('newsclaw_extract_evidence').execute({ query: 'x', urls: [
    'https://example.com/1', 'https://example.com/2', 'https://example.com/3', 'https://example.com/4',
  ] }), /between 1 and 3/)
  await assert.rejects(byName('newsclaw_extract_evidence').execute({ query: 'x', urls: ['http://127.0.0.1/private'] }), /public web page/)
  await assert.rejects(byName('newsclaw_extract_evidence').execute({ query: 'x', urls: ['file:///private-note.md'] }), /public http\(s\) URL/)
})

test('HTTP bridge redacts credentials and reports actionable timeouts', async t => {
  const server = createServer(async (request, response) => {
    let body = ''
    for await (const chunk of request) body += chunk
    const command = JSON.parse(body).command
    if (command === 'slow') return
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ ok: true, data: { token: 'secret-token', detail: 'api_key=very-secret' } }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => { server.closeAllConnections(); server.close() })
  const address = server.address()
  const bridge = createBridge({ apiUrl: `http://127.0.0.1:${address.port}`, skillPath: 'skill', timeoutMs: 40 })
  assert.deepEqual(await bridge.run('safe', []), { token: '[REDACTED]', detail: 'api_key=[REDACTED]' })
  await assert.rejects(bridge.run('slow', []), /timed out after 40ms while running slow/)
})
