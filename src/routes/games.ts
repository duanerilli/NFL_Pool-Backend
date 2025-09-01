import { Router } from 'express';
import { supabaseAdmin as supabase } from '../supa';
import { getCurrentWeek } from '../utils/week';

const router = Router();

/** GET /api/games/current-week -> { week } */
router.get('/current-week', async (_req, res) => {
  try {
    const week = await getCurrentWeek();
    res.json({ week });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? 'failed' });
  }
});

/** GET /api/games/week/:week  -> all games for that week (any year) */
router.get('/week/:week', async (req, res) => {
  const week = Number(req.params.week);
  if (!Number.isFinite(week)) return res.status(400).json({ error: 'week must be a number' });

  const { data, error } = await supabase
    .from('games')
    .select(`
      id, week, start_time, status, home_score, away_score,
      home:home_team_id ( id, code, name ),
      away:away_team_id ( id, code, name )
    `)
    .eq('week', week)
    .order('start_time', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ week, games: data ?? [] });
});

/** GET /api/games/:year/:week -> games where start_time falls in that calendar year */
router.get('/:year/:week', async (req, res) => {
  const year = Number(req.params.year);
  const week = Number(req.params.week);
  if (!Number.isFinite(year) || !Number.isFinite(week)) {
    return res.status(400).json({ error: 'year and week must be numbers' });
  }

  const start = new Date(Date.UTC(year, 0, 1)).toISOString();         // Jan 1, 00:00Z
  const end   = new Date(Date.UTC(year + 1, 0, 1)).toISOString();     // next Jan 1

  const { data, error } = await supabase
    .from('games')
    .select(`
      id, week, start_time, status, home_score, away_score,
      home:home_team_id ( id, code, name ),
      away:away_team_id ( id, code, name )
    `)
    .eq('week', week)
    .gte('start_time', start)
    .lt('start_time', end)
    .order('start_time', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ year, week, games: data ?? [] });
});

export default router;