import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDirectory = await realpath(path.dirname(fileURLToPath(import.meta.url)));
const host = '127.0.0.1';
const port = Number(process.env.BOOTHPATH_PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('BOOTHPATH_PORT는 1~65535 사이의 정수여야 합니다.');
}

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

function respond(response, code, message, head = false) {
  response.writeHead(code, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(head ? undefined : message);
}

const server = createServer(async (request, response) => {
  const head = request.method === 'HEAD';
  if (request.method !== 'GET' && !head) {
    response.setHeader('Allow', 'GET, HEAD');
    return respond(response, 405, 'Method not allowed');
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, `http://${host}:${port}`).pathname);
  } catch {
    return respond(response, 400, '잘못된 URL입니다.', head);
  }
  if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').some(part => part.startsWith('.'))) {
    return respond(response, 403, '접근할 수 없습니다.', head);
  }
  if (pathname === '/') pathname = '/index.html';
  const requestedPath = path.resolve(projectDirectory, `.${pathname}`);
  if (!requestedPath.startsWith(`${projectDirectory}${path.sep}`)) {
    return respond(response, 403, '접근할 수 없습니다.', head);
  }

  try {
    const resolvedPath = await realpath(requestedPath);
    if (!resolvedPath.startsWith(`${projectDirectory}${path.sep}`)) {
      return respond(response, 403, '접근할 수 없습니다.', head);
    }
    const file = await stat(resolvedPath);
    if (!file.isFile()) return respond(response, 404, '파일을 찾을 수 없습니다.', head);

    response.writeHead(200, {
      'Content-Type': types[path.extname(resolvedPath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': file.size,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    if (head) return response.end();
    createReadStream(resolvedPath).on('error', () => response.destroy()).pipe(response);
  } catch (error) {
    respond(response, error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : 500,
      error.code === 'ENOENT' || error.code === 'ENOTDIR' ? '파일을 찾을 수 없습니다.' : '파일을 읽을 수 없습니다.', head);
  }
});

server.listen(port, host, () => console.log(`Local: http://${host}:${port}`));
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `${port} 포트를 사용 중입니다. BOOTHPATH_PORT로 다른 포트를 지정하세요.` : error.message);
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
