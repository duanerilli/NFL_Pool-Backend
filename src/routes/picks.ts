// src/routes/picks.ts
import { Router } from 'express';
import { supabaseAdmin as supabase } from '../supa';
import { autoPhaseWeek, getCurrentWeek } from '../utils/week';

const router = Router();

/**
 * POST /api/picks/submit
 * body: { user_id: string, week: number, team: string, phase?: 'pre'|'reg'|'post' }
 * - team is a code like 'SF'
 */
router.post('/submit', async (req, res) => {
  try {
    const { user_id, week, team, phase: phaseBody } = req.body as {
      user_id?: string;
      week?: number;
      team?: string;
      phase?: 'pre' | 'reg' | 'post';
    };

    if (!user_id || !week || !team) {
      return res.status(400).json({ error: 'Missing user_id, week, or team' });
    }

    const phase: 'pre' | 'reg' | 'post' =
      phaseBody && ['pre', 'reg', 'post'].includes(phaseBody) ? phaseBody : undefined as any;

    // 1) Map team code -> UUID
    const code = String(team).trim().toUpperCase();
    const { data: t, error: tErr } = await supabase
      .from('teams')
      .select('id, code, name')
      .eq('code', code)
      .single();
    if (tErr || !t) return res.status(404).json({ error: 'Unknown team code' });

    // 2) Find local game (this week & phase if provided) for that team that hasn't started
    const nowISO = new Date().toISOString();
    let q = supabase
      .from('games')
      .select('id, week, start_time, phase, home_team_id, away_team_id')
      .eq('week', week)
      .or(`home_team_id.eq.${t.id},away_team_id.eq.${t.id}`)
      .gt('start_time', nowISO)
      .limit(1);

    if (phase) q = q.eq('phase', phase);

    const { data: g, error: gErr } = await q.single();

    if (gErr || !g) {
      return res
        .status(404)
        .json({ error: 'Game not found for this week/team (or already started).' });
    }

    // 3) Prevent duplicate pick for the week
    const { data: exists, error: eErr } = await supabase
      .from('picks')
      .select('id')
      .eq('user_id', user_id)
      .eq('week', week)
      .maybeSingle();
    if (eErr) throw eErr;
    if (exists) return res.status(409).json({ error: 'Pick already submitted for this week' });

    // 4) Insert the pick
    const { data: ins, error: iErr } = await supabase
      .from('picks')
      .insert([{ user_id, week, team_id: t.id, game_id: g.id, status: 'pending' }])
      .select(`id, week, status, team:team_id (code, name), game:game_id (start_time)`)
      .single();
    if (iErr) throw iErr;

    return res.json({ message: 'Pick submitted', pick: ins });
  } catch (e: any) {
    console.error('/api/picks/submit error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/picks/history/:user_id
 */
router.get('/history/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    if (!user_id) return res.status(400).json({ error: 'Missing user_id' });

    const { data, error } = await supabase
      .from('picks')
      .select(`
        id, week, status, created_at,
        team:team_id ( id, code, name ),
        game:game_id ( id, start_time, status )
      `)
      .eq('user_id', user_id)
      .order('week', { ascending: true });

    if (error) throw error;
    return res.json({ picks: data ?? [] });
  } catch (e: any) {
    console.error('/api/picks/history error', e);
    return res.status(500).json({ error: 'Failed to fetch history' });
  }
});

/**
 * GET /api/picks/available/:user_id
 * Optional query params:
 *   phase=pre|reg|post
 *   week=<number>
 *   ignoreLock=1
 * Returns: { phase, week, available_teams: string[] }
 */
router.get('/available/:user_id', async (req, res) => {
  const { user_id } = req.params;
  const phaseParam = (req.query.phase as string | undefined)?.toLowerCase();
  const weekParam = req.query.week ? Number(req.query.week) : undefined;
  const ignoreLock = req.query.ignoreLock === '1';

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(user_id);
  if (!isUuid) return res.status(400).json({ error: 'user_id must be a UUID' });

  try {
    // Compute phase & week (smart default)
    let phase: 'pre' | 'reg' | 'post';
    let CURRENT_WEEK: number;

    if (phaseParam === 'pre' || phaseParam === 'reg' || phaseParam === 'post') {
      phase = phaseParam;
      CURRENT_WEEK = Number.isFinite(weekParam!) ? (weekParam as number) : await getCurrentWeek(phase);
    } else {
      const auto = await autoPhaseWeek();
      phase = auto.phase;
      CURRENT_WEEK = Number.isFinite(weekParam!) ? (weekParam as number) : auto.week;
    }

    const nowISO = new Date().toISOString();

    // Already-picked teams (any week)
    const { data: picked, error: pickedErr } = await supabase
      .from('picks')
      .select('team_id')
      .eq('user_id', user_id);
    if (pickedErr) return res.status(500).json({ error: pickedErr.message });
    const pickedIds = new Set((picked ?? []).map((r) => r.team_id));

    // Teams locked (game started) — unless ignoreLock
    const lockedIds = new Set<string>();
    if (!ignoreLock) {
      const { data: started, error: startedErr } = await supabase
        .from('games')
        .select('home_team_id, away_team_id')
        .eq('phase', phase)
        .eq('week', CURRENT_WEEK)
        .lte('start_time', nowISO);
      if (startedErr) return res.status(500).json({ error: startedErr.message });
      for (const g of started ?? []) {
        lockedIds.add(g.home_team_id);
        lockedIds.add(g.away_team_id);
      }
    }

    // All teams → filter → codes
    const { data: allTeams, error: teamsErr } = await supabase
      .from('teams')
      .select('id, code')
      .order('code');
    if (teamsErr) return res.status(500).json({ error: teamsErr.message });

    const available = (allTeams ?? [])
      .filter((t) => t.code)
      .filter((t) => !pickedIds.has(t.id) && !lockedIds.has(t.id))
      .map((t) => t.code as string);

    return res.json({ phase, week: CURRENT_WEEK, available_teams: available });
  } catch (e: any) {
    console.error('/api/picks/available fatal error:', e);
    return res
      .status(500)
      .json({ error: e?.message ?? 'Failed to compute available teams' });
  }
});

export default router;