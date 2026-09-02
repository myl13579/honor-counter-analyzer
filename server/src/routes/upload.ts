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

/** mimetype → 安全扩展名（不信任客户端 originalname 的扩展名） */
const MIME_TO_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

/** 读取文件头 16 字节用于 magic bytes 校验 */
function readMagicBytes(filePath: string): Buffer {
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(16);
  try {
    fs.readSync(fd, buf, 0, 16, 0);
  } finally {
    fs.closeSync(fd);
  }
  return buf;
}

/** 依据 magic bytes 判定真实图片类型（不信任 mimetype） */
function sniffImageType(buf: Buffer): string | null {
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return 'image/png';
  // JPEG: FF D8 FF
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  // WebP: "RIFF" + 偏移 8 处 "WEBP"
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = MIME_TO_EXT[file.mimetype] || '.png';
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    // 仅作初步过滤，真正校验由落盘后的 magic bytes 完成
    if (ALLOWED.has(file.mimetype)) cb(null, true);
    else cb(new Error('仅支持 png / jpg / webp 格式的图片'));
  },
});

/** 图片上传落盘（含 magic bytes 内容校验） */
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
    // 校验真实内容，防止伪造 Content-Type 上传任意二进制
    const realType = sniffImageType(readMagicBytes(req.file.path));
    if (!realType) {
      fs.unlinkSync(req.file.path);
      res.status(400).json({ error: '文件内容不是有效的图片' });
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
