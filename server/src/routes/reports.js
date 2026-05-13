import { Router } from 'express';
import db from '../db/database.js';

const router = Router();

router.get('/', (req, res) => {
  const { module: mod } = req.query;
  let data;

  switch (mod) {
    case 'memory':
      data = db.prepare('SELECT * FROM memory_sessions ORDER BY created_at DESC LIMIT 50').all();
      break;
    case 'maze':
      data = db.prepare('SELECT * FROM maze_sessions ORDER BY created_at DESC LIMIT 50').all();
      break;
    case 'step':
      data = db.prepare('SELECT * FROM step_sessions ORDER BY created_at DESC LIMIT 50').all();
      break;
    default:
      return res.status(400).json({ error: 'Invalid module' });
  }

  res.json(data);
});

export default router;
