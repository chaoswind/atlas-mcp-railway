import { spawn } from 'child_process';
import { createServer } from 'http';

const MCP_PORT = process.env.PORT || 3000;

// 启动 atlascloud-mcp 子进程
const mcp = spawn('npx', ['-y', 'atlascloud-mcp'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env }
});

mcp.stderr.on('data', (d) => process.stderr.write(`[mcp] ${d}`));
mcp.on('exit', (code) => console.log(`[mcp] exited with code ${code}`));

// 缓冲区：收集子进程 stdout 的完整 JSON 行
let buffer = '';
mcp.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop(); // 保留不完整的行
  for (const line of lines) {
    if (line.trim()) pendingResponse?.(line.trim());
  }
});

let pendingResponse = null;

// 创建 HTTP 服务器
const server = createServer((req, res) => {
  // 设置 CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 健康检查
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  // 只处理 /mcp 路径的 POST 请求
  if (req.url !== '/mcp' || req.method !== 'POST') {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    // 将请求写入子进程的 stdin
    mcp.stdin.write(body + '\n');

    // 等待子进程的响应
    pendingResponse = (line) => {
      pendingResponse = null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(line);
    };

    // 30 秒超时
    setTimeout(() => {
      if (pendingResponse) {
        pendingResponse = null;
        res.writeHead(504);
        res.end(JSON.stringify({ error: 'timeout' }));
      }
    }, 30000);
  });
});

server.listen(MCP_PORT, '0.0.0.0', () => {
  console.log(`[server] listening on port ${MCP_PORT}`);
  console.log(`[server] MCP endpoint: http://0.0.0.0:${MCP_PORT}/mcp`);
});
