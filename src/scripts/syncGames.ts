// src/scripts/syncGames.ts
// Usage:
//   tsx src/scripts/syncGames.ts 2025 PRE2
//   tsx src/scripts/syncGames.ts 2025 REG1
import 'dotenv/config';
import { supabaseAdmin as supabase } from '../supa';

type Phase = 'pre' | 'reg' | 'post';
const RAPID_HOST = 'api-american-football.p.rapidapi.com';

// ---------- helpers ----------
function parseLabel(label: string): { phase: Phase; week: number } {
  const m = String(label).trim().toUpperCase().match(/^(PRE|REG|POST)\s*([0-9]+)$/);
  if (!m) throw new Error(`Invalid week label: "${label}" (expected PRE1/REG1/POST1)`);
  return { phase: m[1].toLowerCase() as Phase, week: Number(m[2]) };
}

function normalizeWeekString(w: any): string {
  const s = String(w ?? '').toUpperCase();
  const m = s.match(/\d+/);
  return m ? m[0] : s; // fallback if no digits
}

function getWeek(g: any) {
  return g?.game?.week ?? g?.week ?? g?.fixture?.week ?? g?.round ?? null;
}
function getId(g: any) {
  return String(g?.game?.id ?? g?.id ?? g?.fixture?.id ?? g?.game?.game_id ?? '');
}
function getEpoch(g: any) {
  return Number(
    g?.date?.timestamp ??
      g?.game?.date?.timestamp ??
      g?.fixture?.timestamp ??
      g?.time?.starting_at_timestamp ??
      0
  );
}
function getHomeName(g: any) {
  return g?.teams?.home?.name ?? g?.home?.name ?? g?.participants?.[0]?.name ?? null;
}
function getAwayName(g: any) {
  return g?.teams?.away?.name ?? g?.away?.name ?? g?.participants?.[1]?.name ?? null;
}
function getHomeScore(g: any) {
  return (
    g?.scores?.home?.total ??
    g?.score?.home?.total ??
    g?.scores?.home ??
    g?.goals?.home ??
    null
  );
}
function getAwayScore(g: any) {
  return (
    g?.scores?.away?.total ??
    g?.score?.away?.total ??
    g?.scores?.away ??
    g?.goals?.away ??
    null
  );
}
function deriveStatus(raw: any, epoch: number, homeScore: any, awayScore: any): string {
  const now = Date.now();
  const hs = typeof homeScore === 'object' ? homeScore?.total : homeScore;
  const as = typeof awayScore === 'object' ? awayScore?.total : awayScore;

  const rawStr = (typeof raw === 'string' ? raw : raw?.short || raw?.state || '')
    .toString()
    .toLowerCase();

  if (['final', 'finished', 'ft', 'ended', 'completed'].includes(rawStr)) return 'final';
  if (['in progress', 'live', 'halftime', 'ot', 'q1', 'q2', 'q3', 'q4'].includes(rawStr))
    return 'in_progress';

  if (hs != null && as != null) return 'final';
  if (!epoch) return 'scheduled';
  if (now < epoch * 1000) return 'scheduled';
  return 'in_progress';
}
function normName(s: string | null | undefined) {
  return (s ?? '').trim().toLowerCase();
}

// ---------- main ----------
async function main() {
  const [, , seasonArg, labelArg] = process.argv;
  if (!seasonArg || !labelArg) {
    throw new Error('Usage: tsx src/scripts/syncGames.ts <season> <PRE1|REG1|POST1>');
  }
  const season = Number(seasonArg);
  const { phase, week } = parseLabel(labelArg);

  if (!process.env.RAPIDAPI_KEY) {
    throw new Error('Missing RAPIDAPI_KEY in backend/.env');
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend/.env');
  }

  // Provider doesn’t take week reliably → fetch the whole season and filter client-side
  const url = `https://${RAPID_HOST}/games?league=1&season=${encodeURIComponent(
    season.toString()
  )}&timezone=America/Los_Angeles`;

  const resp = await fetch(url, {
    headers: {
      'X-RapidAPI-Key': process.env.RAPIDAPI_KEY!,
      'X-RapidAPI-Host': RAPID_HOST,
    },
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`RapidAPI ${resp.status}: ${txt}`);
  }

  const json: any = await resp.json();
  const items: any[] = Array.isArray(json?.response) ? json.response : [];
  if (items.length === 0) {
    console.warn(
      `No games returned for season=${season}. Sample (first 1KB): ${JSON.stringify(
        json,
        null,
        2
      ).slice(0, 1000)}`
    );
  }

  const normalized = items.map((g) => ({
    rid: getId(g),
    weekRaw: getWeek(g),
    weekNorm: normalizeWeekString(getWeek(g)), // string digits like "2"
    epoch: getEpoch(g),
    homeName: getHomeName(g),
    awayName: getAwayName(g),
    homeScore: getHomeScore(g),
    awayScore: getAwayScore(g),
    rawStatus: g?.status,
  }));

  // Filter to requested numeric week
  const weekGames = normalized.filter((n) => Number(n.weekNorm) === week);

  // Map team NAME -> UUID
  const { data: teams, error: tErr } = await supabase.from('teams').select('id, name');
  if (tErr) throw tErr;
  const nameToId = new Map((teams ?? []).map((t) => [normName(t.name), t.id]));

  const rows = [];
  for (const n of weekGames) {
    const hId = nameToId.get(normName(n.homeName));
    const aId = nameToId.get(normName(n.awayName));

    if (!n.rid || !hId || !aId) {
      console.warn('Skipping game (missing mapping):', {
        rid: n.rid,
        weekRaw: n.weekRaw,
        week: n.weekNorm,
        homeName: n.homeName,
        awayName: n.awayName,
      });
      continue;
    }

    const startISO = n.epoch ? new Date(n.epoch * 1000).toISOString() : new Date().toISOString();
    const derivedStatus = deriveStatus(n.rawStatus, n.epoch, n.homeScore, n.awayScore);
    const hs = typeof n.homeScore === 'object' ? n.homeScore?.total ?? null : n.homeScore;
    const as = typeof n.awayScore === 'object' ? n.awayScore?.total ?? null : n.awayScore;

    rows.push({
      // identity from provider for upsert
      rapidapi_source: 'api-american-football',
      rapidapi_game_id: n.rid,

      // always set these so filters work later
      season,                 // ✅
      phase,                  // ✅ 'pre' | 'reg' | 'post'
      week,                   // ✅ numeric

      // game data
      start_time: startISO,
      home_team_id: hId,
      away_team_id: aId,
      home_score: hs,
      away_score: as,
      status: derivedStatus,
    });
  }

  if (rows.length === 0) {
    console.log(`No mappable rows for season=${season} week=${labelArg} (num: ${week}).`);
    return;
  }

  // Ensure you have a unique index for (rapidapi_source, rapidapi_game_id)
  //   create unique index if not exists ux_games_source_id
  //   on public.games (rapidapi_source, rapidapi_game_id);
  const { error: upErr } = await supabase
    .from('games')
    .upsert(rows, { onConflict: 'rapidapi_source,rapidapi_game_id' });
  if (upErr) throw upErr;

  console.log(`Synced ${rows.length} games for ${labelArg}, season ${season}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});