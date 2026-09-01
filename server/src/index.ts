import express from 'express';
import cors from 'cors';
import { PORT, UPLOAD_DIR } from './config.js';
import chatRouter from './routes/chat.js';
import heroesRouter from './routes/heroes.js';
import uploadRouter from './routes/upload.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// 上传图片静态访问
app.use('/uploads', express.static(UPLOAD_DIR));

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
