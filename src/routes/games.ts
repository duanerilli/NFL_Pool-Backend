import { Router } from 'express';
import { supabaseAdmin as supabase } from '../supa';
import { getCurrentWeek, autoPhaseWeek, type Phase } from '../utils/week';

const router = Router();

/**
 * GET /api/games/current-week?phase=reg|pre|post
 * Returns { phase, week }
 */
router.get('/current-week', async (req, res) => {
  try {
    const phaseParam = (req.query.phase as string | undefined)?.toLowerCase() as Phase | undefined;
    if (phaseParam === 'pre' || phaseParam === 'reg' || phaseParam === 'post') {
      const week = await getCurrentWeek(phaseParam);
      return res.json({ phase: phaseParam, week });
    }
    // Auto-detect if no valid phase provided
    const auto = await autoPhaseWeek();
    return res.json(auto);
  } catch (e: any) {
    console.error('/api/games/current-week error', e);
    res.status(500).json({ error: e?.message ?? 'failed' });
  }
});

/**
 * GET /api/games/week/:week?phase=reg|pre|post
 * All games for that numeric week, filtered by phase if provided.
 */
router.get('/week/:week', async (req, res) => {
  const week = Number(req.params.week);
  if (!Number.isFinite(week)) return res.status(400).json({ error: 'week must be a number' });

  const phaseParam = (req.query.phase as string | undefined)?.toLowerCase() as Phase | undefined;

  let q = supabase
    .from('games')
    .select(`
      id, season, phase, week, start_time, status, home_score, away_score,
      home:home_team_id ( id, code, name ),
      away:away_team_id ( id, code, name )
    `)
    .eq('week', week)
    .order('start_time', { ascending: true });

  if (phaseParam === 'pre' || phaseParam === 'reg' || phaseParam === 'post') {
    q = q.eq('phase', phaseParam);
  }

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ week, phase: phaseParam ?? null, games: data ?? [] });
});

/**
 * GET /api/games/:year/:week?phase=reg|pre|post
 * Games whose start_time falls within calendar year (UTC), filtered by week and optional phase.
 */
router.get('/:year/:week', async (req, res) => {
  const year = Number(req.params.year);
  const week = Number(req.params.week);
  if (!Number.isFinite(year) || !Number.isFinite(week)) {
    return res.status(400).json({ error: 'year and week must be numbers' });
  }

  const phaseParam = (req.query.phase as string | undefined)?.toLowerCase() as Phase | undefined;

  const start = new Date(Date.UTC(year, 0, 1)).toISOString();     // Jan 1, 00:00Z
  const end   = new Date(Date.UTC(year + 1, 0, 1)).toISOString(); // next Jan 1

  let q = supabase
    .from('games')
    .select(`
      id, season, phase, week, start_time, status, home_score, away_score,
      home:home_team_id ( id, code, name ),
      away:away_team_id ( id, code, name )
    `)
    .eq('week', week)
    .gte('start_time', start)
    .lt('start_time', end)
    .order('start_time', { ascending: true });

  if (phaseParam === 'pre' || phaseParam === 'reg' || phaseParam === 'post') {
    q = q.eq('phase', phaseParam);
  }

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ year, week, phase: phaseParam ?? null, games: data ?? [] });
});

/**
 * GET /api/games/label/:label?year=2025
 * label is like PRE1, REG2, POST1
 * Optional ?year=YYYY narrows by calendar year.
 */
router.get('/label/:label', async (req, res) => {
  try {
    const labelRaw = String(req.params.label || '').trim().toUpperCase();
    const m = labelRaw.match(/^(PRE|REG|POST)\s*([0-9]+)$/);
    if (!m) return res.status(400).json({ error: 'Invalid label. Use PRE1/REG1/POST1' });

    const phase = m[1].toLowerCase() as Phase;
    const week = Number(m[2]);

    const yearParam = req.query.year ? Number(req.query.year) : undefined;
    let q = supabase
      .from('games')
      .select(`
        id, season, phase, week, start_time, status, home_score, away_score,
        home:home_team_id ( id, code, name ),
        away:away_team_id ( id, code, name )
      `)
      .eq('phase', phase)
      .eq('week', week)
      .order('start_time', { ascending: true });

    if (Number.isFinite(yearParam)) {
      const start = new Date(Date.UTC(yearParam!, 0, 1)).toISOString();
      const end   = new Date(Date.UTC(yearParam! + 1, 0, 1)).toISOString();
      q = q.gte('start_time', start).lt('start_time', end);
    }

    const { data, error } = await q;
    if (error) throw error;

    res.json({ phase, week, year: yearParam ?? null, games: data ?? [] });
  } catch (e: any) {
    console.error('/api/games/label error', e);
    res.status(500).json({ error: e?.message ?? 'failed' });
  }
});

export default router;