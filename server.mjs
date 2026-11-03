import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateWithAI, GenerationError, validateGenerationRequest } from './lib/topic-ai.mjs';

const PROJECT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const MAX_BODY_BYTES = 65536;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

function readEnvFile(filename) {
  let source;
  try { source = readFileSync(filename, 'utf8'); } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw new Error('无法读取项目 .env 配置文件，请检查文件权限。');
  }
  const values = {};
  for (const line of source.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else value = value.replace(/\s+#.*$/, '').trim();
    values[match[1]] = value;
  }
  return values;
}

export function readConfiguration({ env = process.env, envPath = path.join(PROJECT_DIRECTORY, '.env') } = {}) {
  const values = { ...readEnvFile(envPath), ...env };
  const requestedTimeout = Number(values.LLM_TIMEOUT_MS);
  return {
    apiKey: values.LLM_API_KEY?.trim() || '',
    model: values.LLM_MODEL?.trim() || '',
    baseUrl: values.LLM_BASE_URL?.trim() || 'https://api.openai.com/v1',
    jsonMode: values.LLM_JSON_MODE?.trim().toLowerCase() !== 'false',
    timeoutMs: Number.isFinite(requestedTimeout) && requestedTimeout >= 1000
      ? Math.min(requestedTimeout, 180000) : 45000,
  };
}

function sendJSON(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

async function readJSON(request) {
  const type = request.headers['content-type']?.split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') {
    throw new GenerationError(415, 'UNSUPPORTED_CONTENT_TYPE', '请使用 JSON 格式提交选题需求。');
  }
  if (Number(request.headers['content-length']) > MAX_BODY_BYTES) {
    request.resume();
    throw new GenerationError(413, 'BODY_TOO_LARGE', '输入素材过长，请精简后重试。');
  }
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > MAX_BODY_BYTES) {
      throw new GenerationError(413, 'BODY_TOO_LARGE', '输入素材过长，请精简后重试。');
    }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {
    throw new GenerationError(400, 'INVALID_JSON', '请求内容不是有效的 JSON，请刷新页面后重试。');
  }
}

function isInside(root, filename) {
  const relative = path.relative(root, filename);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function serveStatic(request, response, rawPath, publicDirectory) {
  let pathname;
  try { pathname = decodeURIComponent(rawPath); } catch {
    return sendJSON(response, 400, { error: '网址格式不正确。', code: 'INVALID_PATH' });
  }
  const parts = pathname.replace(/\\/g, '/').split('/');
  if (pathname.includes('\0') || parts.some(part => part.startsWith('.'))) {
    return sendJSON(response, 404, { error: '没有找到这个文件。', code: 'NOT_FOUND' });
  }
  const root = path.resolve(publicDirectory);
  const filename = path.resolve(root, pathname === '/' ? 'index.html' : parts.filter(Boolean).join('/'));
  if (!isInside(root, filename)) return sendJSON(response, 404, { error: '没有找到这个文件。', code: 'NOT_FOUND' });
  try {
    const [actualRoot, actualFile] = await Promise.all([realpath(root), realpath(filename)]);
    if (!isInside(actualRoot, actualFile) || !(await stat(actualFile)).isFile()) {
      return sendJSON(response, 404, { error: '没有找到这个文件。', code: 'NOT_FOUND' });
    }
    const content = await readFile(actualFile);
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(actualFile).toLowerCase()] || 'application/octet-stream',
      'Content-Length': content.length,
      'Cache-Control': 'no-cache',
    });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch (error) {
    if (['ENOENT', 'ENOTDIR', 'EINVAL', 'EACCES', 'EPERM'].includes(error.code)) {
      return sendJSON(response, 404, { error: '没有找到这个文件。', code: 'NOT_FOUND' });
    }
    throw error;
  }
}

export function createServer({
  publicDirectory = path.join(PROJECT_DIRECTORY, 'public'),
  config = readConfiguration(),
  fetchImpl = globalThis.fetch,
  timeoutMs = config.timeoutMs || 45000,
} = {}) {
  let activeGenerations = 0;
  const server = http.createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'");
    try {
      const rawPath = (request.url || '/').split(/[?#]/, 1)[0];
      if (rawPath === '/api/status') {
        if (request.method !== 'GET') {
          response.setHeader('Allow', 'GET');
          return sendJSON(response, 405, { error: '此接口只支持 GET。', code: 'METHOD_NOT_ALLOWED' });
        }
        const configured = Boolean(config.apiKey && config.model);
        return sendJSON(response, 200, { configured, model: configured ? config.model : null });
      }
      if (rawPath === '/api/generate') {
        if (request.method !== 'POST') {
          response.setHeader('Allow', 'POST');
          return sendJSON(response, 405, { error: '请从选题表单提交生成请求。', code: 'METHOD_NOT_ALLOWED' });
        }
        const expectedOrigin = `http://${request.headers.host}`;
        if (request.headers.origin && request.headers.origin !== expectedOrigin) {
          return sendJSON(response, 403, { error: '请在本地工作台页面中生成选题。', code: 'ORIGIN_NOT_ALLOWED' });
        }
        if (request.headers['sec-fetch-site'] === 'cross-site') {
          return sendJSON(response, 403, { error: '请在本地工作台页面中生成选题。', code: 'ORIGIN_NOT_ALLOWED' });
        }
        const body = await readJSON(request);
        validateGenerationRequest(body);
        if (activeGenerations >= 2) {
          return sendJSON(response, 429, { error: '正在生成选题，请等待当前任务完成。', code: 'BUSY' });
        }
        activeGenerations += 1;
        try {
          const result = await generateWithAI(body, config, { fetchImpl, timeoutMs });
          return sendJSON(response, 200, result);
        } finally { activeGenerations -= 1; }
      }
      if (rawPath.startsWith('/api/')) return sendJSON(response, 404, { error: '没有找到这个接口。', code: 'NOT_FOUND' });
      if (!['GET', 'HEAD'].includes(request.method)) {
        response.setHeader('Allow', 'GET, HEAD');
        return sendJSON(response, 405, { error: '此页面不支持该操作。', code: 'METHOD_NOT_ALLOWED' });
      }
      return await serveStatic(request, response, rawPath, publicDirectory);
    } catch (error) {
      if (response.headersSent || response.destroyed) return;
      if (error instanceof GenerationError) {
        return sendJSON(response, error.status, { error: error.message, code: error.code });
      }
      sendJSON(response, 500, { error: '服务暂时无法完成请求，请稍后重试。', code: 'INTERNAL_ERROR' });
    }
  });
  server.requestTimeout = 200000;
  server.headersTimeout = 15000;
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const requestedPort = Number(process.env.PORT || 4180);
  if (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65535) {
    console.error('PORT 必须是 1～65535 的整数。');
    process.exitCode = 1;
  } else {
    const config = readConfiguration();
    const server = createServer({ config });
    server.on('error', error => {
      console.error(error.code === 'EADDRINUSE' ? '端口已被占用，请关闭旧服务或设置其他 PORT。' : '本地服务启动失败，请检查运行权限。');
      process.exitCode = 1;
    });
    server.listen(requestedPort, '127.0.0.1', () => {
      console.log(`选题工作台已启动：http://127.0.0.1:${requestedPort}`);
      console.log(config.apiKey && config.model ? 'AI 服务已配置；也可以使用离线灵感模板。' : '当前使用离线灵感模板；配置 .env 后可启用 AI 生成。');
    });
  }
}
