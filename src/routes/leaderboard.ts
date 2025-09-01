// src/routes/leaderboard.ts
import { Router } from 'express';
import { supabaseAdmin as supabase } from '../supa';

const router = Router();

type ApiPick = {
  user_id: string;
  week: number;
  status: string | null;
  team: { code: string | null } | null;
  game?: { start_time: string | null } | null; 
};

type UiUser = {
  id: string;
  name: string;
  eliminated: boolean;
  picks: Array<{ week: number; team_code: string | null; status: string;starts_at: string | null; }>;
};

/**
 * GET /api/leaderboard
 * Response:
 * {
 *   stillIn: UiUser[],
 *   eliminated: UiUser[]
 * }
 */
router.get('/', async (_req, res) => {
  try {
    // Users
    const { data: users, error: uErr } = await supabase
      .from('users')
      .select('id, name')
      .order('name', { ascending: true });
    if (uErr) throw uErr;

    // Picks joined with team code (NULL status -> 'pending')
    const { data: picks, error: pErr } = await supabase
      .from('picks')
      .select(`
        user_id,
        week,
        status,
        team:team_id ( code ),
        game:game_id ( start_time )
      `)
      .order('week', { ascending: true });
    if (pErr) throw pErr;

    // Group picks by user
    const byUser: Record<string, ApiPick[]> = {};
    for (const p of (picks ?? []) as ApiPick[]) {
      (byUser[p.user_id] ||= []).push(p);
    }

    // Build rows
    const rows: UiUser[] = (users ?? []).map((u) => {
      const up = (byUser[u.id] ?? []) as ApiPick[];
      const uiPicks = up.map((p) => ({
        week: p.week,
        team_code: p.team?.code ?? null,
        status: (p.status ?? 'pending').toLowerCase(),
        starts_at: p.game?.start_time ?? null,
      }));
      const eliminated = uiPicks.some((p) => p.status === 'win');
      return {
        id: u.id,
        name: u.name ?? '—',
        eliminated,
        picks: uiPicks,
      };
    });

    const stillIn = rows.filter((r) => !r.eliminated);
    const eliminatedList = rows.filter((r) => r.eliminated);

    res.json({ stillIn, eliminated: eliminatedList });
  } catch (err: any) {
    console.error('🔥 /api/leaderboard error:', err);
    res.status(500).json({ error: err?.message ?? 'Failed to generate leaderboard' });
  }
});

export default router;