import { Router } from 'express';
import db from '../db/database.js';

const router = Router();

// 生成迷宫路径
router.get('/generate-path', (req, res) => {
  const rows = parseInt(req.query.rows) || 4;
  const cols = parseInt(req.query.cols) || 5;
  const start = Math.floor(Math.random() * cols);
  let end = Math.floor(Math.random() * cols);
  while (end === start) end = Math.floor(Math.random() * cols);

  res.json({
    startLED: start,
    endLED: end,
    gridRows: rows,
    gridCols: cols,
  });
});

// 保存训练记录
router.post('/save-session', (req, res) => {
  const { id, date, attempts, timeSpent, correct, path } = req.body;
  db.prepare(
    'INSERT OR REPLACE INTO maze_sessions (id, date, attempts, time_spent, correct, path_start, path_end) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, date, attempts, timeSpent, correct ? 1 : 0, path?.startLED ?? -1, path?.endLED ?? -1);
  res.json({ id });
});

export default router;
