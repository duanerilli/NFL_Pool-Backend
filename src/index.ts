// src/index.ts
import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';

// Route imports (make sure these files exist)
import picksRouter from './routes/picks';
import usersRouter from './routes/users';
import gamesRouter from './routes/games';
import leaderboardRouter from './routes/leaderboard';
import 'dotenv/config';

const app = express();

// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// --- Healthcheck ---
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: '🟢 Server is running' });
});

// --- Routes ---
app.use('/api/picks', picksRouter);
app.use('/api/users', usersRouter);
app.use('/api/games', gamesRouter);
app.use('/api/leaderboard', leaderboardRouter);

// --- 404 handler ---
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
});

// --- Global error handler ---
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// --- Start server ---
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
});