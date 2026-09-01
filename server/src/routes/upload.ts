import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { UPLOAD_DIR } from '../config.js';
import { AGENT_MODE, hasCredentials } from '../config.js';

const router = Router();

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.has(file.mimetype)) cb(null, true);
    else cb(new Error('仅支持 png / jpg / webp 格式的图片'));
  },
});

/** 图片上传落盘 */
router.post('/upload', (req, res) => {
  upload.single('file')(req, res, (err: any) => {
    if (err) {
      res.status(400).json({ error: err?.message || '上传失败' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: '未接收到文件' });
      return;
    }
    res.json({
      fileId: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
    });
  });
});

/**
 * 图片识别：真 Agent 模式下由 Agent Read 读图识别英雄名单；
 * 演示模式（无认证/无多模态）下不支持，返回明确提示。
 */
router.post('/recognize', async (req, res) => {
  const { filename } = req.body ?? {};
  if (!filename) {
    res.status(400).json({ error: '缺少 filename' });
    return;
  }
  const filePath = path.join(UPLOAD_DIR, path.basename(filename));
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: '图片文件不存在' });
    return;
  }

  const useAgent = AGENT_MODE === 'agent' || (AGENT_MODE !== 'demo' && hasCredentials());
  if (!useAgent) {
    res.json({
      heroes: [],
      notice: '当前为演示模式，暂不支持图片自动识别，请在左侧面板手动勾选敌方英雄。',
    });
    return;
  }

  // 真 Agent 读图识别：复用 /api/chat 的 Agent 能力（由前端发起识别对话）
  res.json({
    heroes: [],
    filePath: path.relative(process.cwd(), filePath),
    notice: '已进入识别流程，请在对话中确认识别出的英雄名单。',
  });
});

export default router;
