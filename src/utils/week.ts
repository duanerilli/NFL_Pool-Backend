import { supabaseAdmin as supabase } from '../supa';

type Phase = 'pre' | 'reg' | 'post';

async function nextFutureWeek(phase: Phase): Promise<number | null> {
  const nowISO = new Date().toISOString();
  const { data, error } = await supabase
    .from('games')
    .select('week, start_time')
    .eq('phase', phase)
    .gt('start_time', nowISO)
    .order('start_time', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.week ?? null;
}

async function maxWeek(phase: Phase): Promise<number | null> {
  const { data, error } = await supabase
    .from('games')
    .select('week')
    .eq('phase', phase)
    .order('week', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.week ?? null;
}

/** Return the “best” phase+week to use right now, based on DB contents. */
export async function autoPhaseWeek(): Promise<{ phase: Phase; week: number }> {
  // Prefer the next future REGULAR-season week
  const regNext = await nextFutureWeek('reg');
  if (regNext) return { phase: 'reg', week: regNext };

  // Otherwise, if PRE has upcoming games (useful before kickoff), use that
  const preNext = await nextFutureWeek('pre');
  if (preNext) return { phase: 'pre', week: preNext };

  // Otherwise, if POST has upcoming games, use that
  const postNext = await nextFutureWeek('post');
  if (postNext) return { phase: 'post', week: postNext };

  // No future games? Fall back to the highest available REG week, then PRE, then POST
  const regMax = await maxWeek('reg');
  if (regMax) return { phase: 'reg', week: regMax };

  const preMax = await maxWeek('pre');
  if (preMax) return { phase: 'pre', week: preMax };

  const postMax = await maxWeek('post');
  if (postMax) return { phase: 'post', week: postMax };

  // Absolute fallback
  return { phase: 'reg', week: 1 };
}

/** If you explicitly want “current week for a given phase” */
export async function getCurrentWeek(phase: Phase): Promise<number> {
  return (await nextFutureWeek(phase)) ?? (await maxWeek(phase)) ?? 1;
}