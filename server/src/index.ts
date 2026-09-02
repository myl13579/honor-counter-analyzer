import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { PORT, UPLOAD_DIR } from './config.js';
import chatRouter from './routes/chat.js';
import heroesRouter from './routes/heroes.js';
import uploadRouter from './routes/upload.js';

const app = express();

// CORS 白名单：默认放行本地 Vite 开发端口，部署时用 CORS_ORIGINS 环境变量扩展
const ALLOWED_ORIGINS = new Set(
  (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);
app.use(
  cors({
    origin(origin, cb) {
      // 无 origin（同源 / curl / 服务端调用）放行；白名单内放行；其余拒绝
      if (!origin || ALLOWED_ORIGINS.has(origin)) cb(null, true);
      else cb(new Error('Not allowed by CORS'));
    },
  })
);
app.use(express.json({ limit: '2mb' }));

// 上传图片静态访问：仅放行图片扩展名 + nosniff/CSP，防止上传文件被当作可执行内容
app.use(
  '/uploads',
  (req, res, next) => {
    const ext = path.extname(req.path).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      res.status(404).end();
      return;
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    next();
  },
  express.static(UPLOAD_DIR)
);

// 路由
app.use('/api', chatRouter);
app.use('/api', heroesRouter);
app.use('/api', uploadRouter);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: Date.now() });
});

app.listen(PORT, () => {
  console.log(`[honor-counter-analyzer] 后端服务已启动: http://localhost:${PORT}`);
  console.log(`[honor-counter-analyzer] 知识库目录已就绪，运行模式见 /api/auth/status`);
});
