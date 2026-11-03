import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer, readConfiguration } from '../server.mjs';
import { generateWithAI, validateGenerationRequest, validateAIResult } from '../lib/topic-ai.mjs';

const profile = {
  niche: '独立创作者的效率工具', audience: '刚开始运营公众号的上班族',
  platform: '公众号', goal: '互动', tone: '真诚分享',
  keywords: '素材整理、写作流程', material: '常见问题：收藏了很多素材，写作时却找不到。',
};
const config = { apiKey: 'secret-test-key-never-expose', model: 'test-model', baseUrl: 'https://example.test/v1', jsonMode: true };

function topic(index) {
  return {
    title: `素材整理的第 ${index} 种切入角度`, angle: '从收藏、筛选到写作逐步拆解。',
    category: '实用干货', format: '方法拆解文章', reason: '帮助读者改善写作流程。',
    hook: '素材越存越多，为什么到了写作时还是没有头绪？',
    outline: ['先识别搜集素材时的障碍。', '再建立简单的分类规则。', '最后用一个真实任务检验规则。'],
    titles: [`备用标题 ${index} A`, `备用标题 ${index} B`, `备用标题 ${index} C`],
    tags: ['素材管理', '公众号写作'], effort: '低', materialHint: '准备一份自己的素材目录与使用记录。',
  };
}
const resultFixture = () => ({ analysis: '围绕写作中的具体障碍，让公众号文章同时提供方法和讨论空间。', topics: Array.from({ length: 9 }, (_, index) => topic(index + 1)) });

async function fixture(t, options = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'creator-server-test-'));
  const publicDirectory = path.join(directory, 'public');
  await mkdir(publicDirectory);
  await writeFile(path.join(publicDirectory, 'index.html'), '<!doctype html><h1>选题工作台</h1>');
  await writeFile(path.join(publicDirectory, 'app.mjs'), 'export const okay = true;');
  await writeFile(path.join(directory, '.env'), 'LLM_API_KEY=private-env-secret');
  await writeFile(path.join(directory, 'server.mjs'), 'private server source');
  const server = createServer({ publicDirectory, config: {}, ...options });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  return { server, origin: `http://127.0.0.1:${server.address().port}`, directory };
}

function rawGet(origin, requestPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(origin);
    const request = httpRequest({ hostname: url.hostname, port: url.port, path: requestPath, method: 'GET' }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => body += chunk);
      response.on('end', () => resolve({ status: response.statusCode, body }));
    });
    request.on('error', reject);
    request.end();
  });
}

test('only serves the public directory and returns usable content types', async t => {
  const { origin } = await fixture(t);
  const page = await fetch(origin);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.match(await page.text(), /选题工作台/);
  const script = await fetch(`${origin}/app.mjs`);
  assert.match(script.headers.get('content-type'), /text\/javascript/);
  const head = await fetch(origin, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  for (const filename of ['/.env', '/server.mjs', '/../.env', '/%2e%2e%2f.env', '/%2e%2e%5cserver.mjs']) {
    const response = await rawGet(origin, filename);
    assert.equal(response.status, 404, filename);
    assert.doesNotMatch(response.body, /private-env-secret|private server source/);
  }
  assert.equal((await rawGet(origin, '/%zz')).status, 400);
});

test('status exposes configuration readiness without returning the API key', async t => {
  const { origin } = await fixture(t, { config });
  const response = await fetch(`${origin}/api/status`);
  const text = await response.text();
  assert.deepEqual(JSON.parse(text), { configured: true, model: 'test-model' });
  assert.ok(!text.includes(config.apiKey));
});

test('unconfigured AI explicitly fails instead of returning template output', async t => {
  const { origin } = await fixture(t);
  assert.deepEqual(await (await fetch(`${origin}/api/status`)).json(), { configured: false, model: null });
  const response = await fetch(`${origin}/api/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile }),
  });
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.code, 'AI_NOT_CONFIGURED');
  assert.ok(!('topics' in body));
});

test('rejects malformed JSON, invalid fields, oversized payloads and other origins', async t => {
  let calls = 0;
  const { origin } = await fixture(t, { config, fetchImpl: async () => { calls++; throw new Error('should not run'); } });
  const post = (body, headers = { 'Content-Type': 'application/json' }) => fetch(`${origin}/api/generate`, { method: 'POST', headers, body });
  assert.equal((await post('{')).status, 400);
  assert.equal((await post(JSON.stringify({ profile: { ...profile, niche: 42 } }))).status, 400);
  assert.equal((await post(JSON.stringify({ profile: { ...profile, material: '字'.repeat(12001) } }))).status, 400);
  assert.equal((await post(JSON.stringify({ profile, seed: -1 }))).status, 400);
  assert.equal((await post(JSON.stringify({ profile }), { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await post('a'.repeat(65537))).status, 413);
  assert.equal((await post(JSON.stringify({ profile }), { 'Content-Type': 'application/json', Origin: 'https://unrelated.test' })).status, 403);
  assert.equal((await fetch(`${origin}/api/generate`)).status, 405);
  assert.equal(calls, 0);
});

test('model requests use server credentials, force WeChat, and validate structured output', async t => {
  let observed;
  const { origin } = await fixture(t, {
    config,
    fetchImpl: async (url, options) => {
      observed = { url, options, payload: JSON.parse(options.body) };
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(resultFixture()) } }] }));
    },
  });
  const response = await fetch(`${origin}/api/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ profile: { ...profile, platform: '抖音' }, seed: 2 }),
  });
  assert.equal(response.status, 200);
  const text = await response.text();
  const body = JSON.parse(text);
  assert.equal(body.mode, 'ai');
  assert.equal(body.topics.length, 9);
  assert.equal(new Set(body.topics.map(item => item.id)).size, 9);
  assert.equal(observed.url, 'https://example.test/v1/chat/completions');
  assert.equal(observed.options.headers.Authorization, `Bearer ${config.apiKey}`);
  assert.equal(observed.payload.response_format.type, 'json_object');
  assert.equal(JSON.parse(observed.payload.messages[1].content).profile.platform, '公众号');
  assert.match(observed.payload.messages[0].content, /不要声称查询了网络/);
  assert.ok(!text.includes(config.apiKey));
});

test('upstream failures cannot disclose vendor messages or secrets', async () => {
  for (const status of [400, 401, 403, 429, 500]) {
    await assert.rejects(
      generateWithAI({ profile }, config, { fetchImpl: async () => new Response(config.apiKey, { status }) }),
      error => error.status >= 400 && !error.message.includes(config.apiKey),
    );
  }
  await assert.rejects(
    generateWithAI({ profile }, config, { fetchImpl: async () => { throw new Error(config.apiKey); } }),
    error => error.code === 'AI_CONNECTION_FAILED' && !error.message.includes(config.apiKey),
  );
});

test('model timeout is bounded even if an upstream implementation ignores abort', async () => {
  await assert.rejects(
    generateWithAI({ profile }, config, { fetchImpl: () => new Promise(() => {}), timeoutMs: 20 }),
    error => error.status === 504 && error.code === 'AI_TIMEOUT',
  );
});

test('incomplete and duplicate model topics are rejected', async () => {
  assert.throws(() => validateAIResult({ analysis: '说明', topics: [] }), /9 个选题/);
  const duplicate = resultFixture();
  duplicate.topics[1].title = duplicate.topics[0].title;
  assert.throws(() => validateAIResult(duplicate), /重复/);
  const incomplete = resultFixture();
  incomplete.topics[0].outline = ['只有一段'];
  assert.throws(() => validateAIResult(incomplete), /格式不完整/);
  const response = () => new Response(JSON.stringify({ choices: [{ message: { content: 'not valid JSON' } }] }));
  await assert.rejects(generateWithAI({ profile }, config, { fetchImpl: response }), error => error.code === 'INVALID_AI_OUTPUT');
});

test('configuration reads only the local file and environment overrides without expansion', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'creator-config-test-'));
  try {
    const filename = path.join(directory, '.env');
    await writeFile(filename, '# comment\nLLM_API_KEY="file-key"\nLLM_MODEL=file-model\nLLM_JSON_MODE=false\nLLM_TIMEOUT_MS=900000\n');
    const configuration = readConfiguration({ env: { LLM_API_KEY: 'environment-key' }, envPath: filename });
    assert.equal(configuration.apiKey, 'environment-key');
    assert.equal(configuration.model, 'file-model');
    assert.equal(configuration.jsonMode, false);
    assert.equal(configuration.timeoutMs, 180000);
    assert.equal(validateGenerationRequest({ profile: {} }).profile.platform, '公众号');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
