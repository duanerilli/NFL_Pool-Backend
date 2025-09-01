// Usage examples:
//   tsx src/scripts/settlePicks.ts 2025 PRE1
//   tsx src/scripts/settlePicks.ts 2025 REG1
//   tsx src/scripts/settlePicks.ts 2025 1 pre      // also works
//   npm run settle:week -- 2025 PRE1
import 'dotenv/config';
import { supabaseAdmin as supabase } from '../supa';

type Phase = 'pre' | 'reg' | 'post';

type GameRow = {
  id: string;
  week: number;
  phase: Phase | null;
  home_team_id: string;
  away_team_id: string;
  home_score: number | null;
  away_score: number | null;
  status: string | null;
};

function parseArgs(): { season: number; week: number; phase: Phase } {
  const [, , seasonArg, arg2, arg3] = process.argv;

  if (!seasonArg) throw new Error('Usage: settlePicks <season> <PRE1|REG1|POST1|weekNumber> [phase]');
  const season = Number(seasonArg);
  if (!Number.isFinite(season)) throw new Error(`Invalid season: ${seasonArg}`);

  // Accept formats:
  //  - "PRE1", "REG1", "POST1"
  //  - "<number> pre|reg|post"
  //  - "<number>" (defaults to 'reg')
  const label = (arg2 || '').toString().trim().toUpperCase();
  const explicitPhase = (arg3 || '').toString().trim().toLowerCase() as Phase | '';

  const m = label.match(/^(PRE|REG|POST)\s*([0-9]+)$/i);
  if (m) {
    const phase = (m[1].toLowerCase() as Phase);
    const week = Number(m[2]);
    return { season, week, phase };
  }

  const maybeNum = Number(label);
  if (Number.isFinite(maybeNum)) {
    const phase: Phase = (explicitPhase === 'pre' || explicitPhase === 'post' || explicitPhase === 'reg')
      ? explicitPhase
      : 'reg';
    return { season, week: maybeNum, phase };
  }

  throw new Error(`Week arg must be like PRE1/REG1/POST1 or a number. Got: "${arg2}"`);
}

async function main() {
  const { season, week, phase } = parseArgs();
  console.log(`[settle] season=${season} week=${week} phase=${phase}`);

  // 1) Get all games for this (phase, week) — we store season as the year of start_time
  const start = new Date(Date.UTC(season, 0, 1)).toISOString();
  const end   = new Date(Date.UTC(season + 1, 0, 1)).toISOString();

  const { data: games, error: gErr } = await supabase
    .from('games')
    .select('id, week, phase, home_team_id, away_team_id, home_score, away_score, status, start_time')
    .eq('phase', phase)
    .eq('week', week)
    .gte('start_time', start)
    .lt('start_time', end);

  if (gErr) throw gErr;

  // 2) Treat any game with both scores present as final, regardless of status text
  const finals: GameRow[] = (games ?? []).filter(
    g => g.home_score !== null && g.away_score !== null
  );

  if (finals.length === 0) {
    console.log(`No final (scored) games found to settle for ${phase.toUpperCase()}${week}, season ${season}.`);
    return;
  }

  // 3) Determine winner per game
  const results = finals.map(g => {
    if (g.home_score! > g.away_score!) return { game_id: g.id, winner: g.home_team_id as string, tie: false };
    if (g.away_score! > g.home_score!) return { game_id: g.id, winner: g.away_team_id as string, tie: false };
    return { game_id: g.id, winner: null as string | null, tie: true };
  });

  // 4) Fetch pending picks for these games
  const gameIds = results.map(r => r.game_id);
  const { data: picks, error: pErr } = await supabase
    .from('picks')
    .select('id, user_id, week, game_id, team_id, status')
    .in('game_id', gameIds)
    .or('status.is.null,status.eq.pending'); // null -> pending
  if (pErr) throw pErr;

  if (!picks || picks.length === 0) {
    console.log('No pending picks to settle.');
    return;
  }

  // 5) Bucket updates (avoid UPSERT — we only UPDATE, so no NOT NULL issues)
  const idsWin: string[] = [];
  const idsLoss: string[] = [];
  const idsPush: string[] = [];

  for (const p of picks) {
    const r = results.find(x => x.game_id === p.game_id);
    if (!r) continue;
    if (r.tie) idsPush.push(p.id);
    else if (r.winner && p.team_id === r.winner) idsWin.push(p.id);
    else idsLoss.push(p.id);
  }

  const doUpdate = async (ids: string[], status: 'win'|'loss'|'push') => {
    if (!ids.length) return;
    const { error } = await supabase.from('picks').update({ status }).in('id', ids);
    if (error) throw error;
  };

  await doUpdate(idsWin, 'win');
  await doUpdate(idsLoss, 'loss');
  await doUpdate(idsPush, 'push');

  console.log(`Settled ${idsWin.length + idsLoss.length + idsPush.length} picks across ${finals.length} final games for ${phase.toUpperCase()}${week}.`);
}

main().catch(e => {
  console.error('settlePicks error:', e);
  process.exit(1);
});