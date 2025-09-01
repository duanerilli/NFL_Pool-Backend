import { Router } from 'express';
import { supabaseAdmin as supabase } from '../supa';

const router = Router();

type ApiPickRow = {
  user_id: string;
  week: number;
  status: string | null;
  team?: { code: string | null } | { code: string | null }[] | null;  // handle both
  game?: { start_time: string | null } | { start_time: string | null }[] | null;
};

type UiPick = {
  week: number;
  team_code: string | null;
  status: 'pending' | 'win' | 'loss' | 'push';
  starts_at?: string | null;
};

type UiUser = {
  id: string;
  name: string;
  eliminated: boolean; // reversed logic: win => eliminated
  picks: UiPick[];
};

/**
 * GET /api/leaderboard
 */
router.get('/', async (_req, res) => {
  try {
    // Users
    const { data: users, error: uErr } = await supabase
      .from('users')
      .select('id, name')
      .order('name', { ascending: true });
    if (uErr) throw uErr;

    // Picks + team code + game start_time
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

    const safePicks: ApiPickRow[] = Array.isArray(picks) ? (picks as any) : [];

    // group by user
    const byUser: Record<string, UiPick[]> = {};
    for (const p of safePicks) {
      const team = Array.isArray(p.team) ? p.team[0] : p.team;
      const game = Array.isArray(p.game) ? p.game[0] : p.game;

      const ui: UiPick = {
        week: p.week,
        team_code: team?.code ?? null,
        status: ((p.status ?? 'pending') as UiPick['status']),
        starts_at: game?.start_time ?? null
      };

      (byUser[p.user_id] ||= []).push(ui);
    }

    const rows: UiUser[] = (users ?? []).map((u) => {
      const list = (byUser[u.id] ?? []).sort((a, b) => a.week - b.week);

      // REVERSED SUICIDE RULE: win => eliminated; loss/push => alive
      const eliminated = list.some((p) => p.status === 'win');

      return {
        id: u.id,
        name: u.name ?? '—',
        eliminated,
        picks: list
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