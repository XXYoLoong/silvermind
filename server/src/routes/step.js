import { Router } from 'express';
import db from '../db/database.js';

const router = Router();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function generatePath(rows, cols, mode = 'random') {
  const path = [];
  let col = Math.floor(cols / 2);

  if (mode === 'straight') {
    col = Math.floor(cols / 2);
    for (let row = 0; row < rows; row += 1) path.push({ row, col, order: row + 1 });
    return path;
  }

  if (mode === 'diagonal') {
    col = Math.max(0, Math.floor(cols / 2) - 2);
    for (let row = 0; row < rows; row += 1) {
      path.push({ row, col: clamp(col, 0, cols - 1), order: row + 1 });
      col += row % 2 === 0 ? 1 : 0;
    }
    return path;
  }

  if (mode === 'cross') {
    col = Math.floor(cols / 2);
    for (let row = 0; row < rows; row += 1) {
      const offset = row % 4 === 1 ? -1 : row % 4 === 3 ? 1 : 0;
      path.push({ row, col: clamp(col + offset, 0, cols - 1), order: row + 1 });
    }
    return path;
  }

  col = Math.floor(Math.random() * cols);
  for (let row = 0; row < rows; row += 1) {
    path.push({ row, col, order: row + 1 });
    if (row < rows - 1 && Math.random() > 0.4) {
      const delta = Math.random() > 0.5 ? 1 : -1;
      col = clamp(col + delta, 0, cols - 1);
    }
  }
  return path;
}

// 生成方步路径
router.get('/generate-path', (req, res) => {
  const rows = parseInt(req.query.rows) || 8;
  const cols = parseInt(req.query.cols) || 6;
  const mode = String(req.query.mode || 'random');
  const path = generatePath(rows, cols, mode);

  res.json({ cells: path, mode });
});

// 保存训练记录
router.post('/save-session', (req, res) => {
  const { id, date, path, accuracy, timeSpent, totalSteps, correctSteps } = req.body;
  db.prepare(
    'INSERT OR REPLACE INTO step_sessions (id, date, path_cells, accuracy, time_spent, total_steps, correct_steps) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, date, JSON.stringify(path?.cells ?? []), accuracy, timeSpent, totalSteps, correctSteps);
  res.json({ id });
});

export default router;
