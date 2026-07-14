import { spawn } from 'child_process';
import { createServer } from 'http';
import { createInterface } from 'readline';

const PORT = process.env.PORT || 3000;

// 启动 atlascloud-mcp
const mcp = spawn('npx', ['-y', 'atlascloud-mcp'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env }
});

mcp.stderr.on('data', (d) => process.stderr.write(`[mcp] ${d}`));
mcp.on('exit', (code) => {
  console.log(`[mcp] exited with code ${code}`);
  process.exit(1);
});

// 用 readline 逐行读取 stdout
const rl = createInterface({ input: mcp.stdout });
const pending = {};

rl.on('line', (line) => {
  if (!line.trim()) return;
  try {
    const msg = JSON.parse(line);
    const id = msg.id;
    if (id !== undefined && pending[id]) {
      pending[id](msg);
      delete pending[id];
    }
  } catch (e) {
    // 忽略无法解析的行
  }
});

const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 健康检查
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  // 只处理 POST /mcp
  if (req.url !== '/mcp' || req.method !== 'POST') {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    let requestId;
    try {
      requestId = JSON.parse(body).id;
    } catch (e) {
      requestId = null;
    }
    // 确保有 id
    const id = requestId !== undefined && requestId !== null ? requestId : Date.now();

    // 注册待处理响应
    pending[id] = (response) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
    };

    // 写入子进程 stdin
    mcp.stdin.write(body + '\n');

    // 30 秒超时
    const timer = setTimeout(() => {
      if (pending[id]) {
        delete pending[id];
        try {
          res.writeHead(504, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'timeout', id }));
        } catch (e) {
          // 忽略：响应可能已发送
        }
      }
    }, 30000);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`MCP endpoint: http://0.0.0.0:${PORT}/mcp`);
});    };

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
