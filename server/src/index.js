import express from 'express';
import cors from 'cors';
import memoryRoutes from './routes/memory.js';
import mazeRoutes from './routes/maze.js';
import stepRoutes from './routes/step.js';
import reportRoutes from './routes/reports.js';

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Root
app.get('/', (_req, res) => {
  res.json({
    name: 'SilverMind API',
    version: '1.0.0',
    endpoints: ['/api/memory', '/api/maze', '/api/step', '/api/reports', '/api/health'],
  });
});

// Routes
app.use('/api/memory', memoryRoutes);
app.use('/api/maze', mazeRoutes);
app.use('/api/step', stepRoutes);
app.use('/api/reports', reportRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
