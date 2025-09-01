// src/utils/week.ts
import { supabaseAdmin as supabase } from '../supa';

export type Phase = 'pre' | 'reg' | 'post';

/** Auto-detect the active phase/week based on the next kickoff in DB. */
export async function autoPhaseWeek(): Promise<{ phase: Phase; week: number }> {
  const nowISO = new Date().toISOString();

  // 1) Try the next future kickoff among all phases
  const { data: next } = await supabase
    .from('games')
    .select('phase, week, start_time')
    .gt('start_time', nowISO)
    .order('start_time', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (next?.phase && typeof next.week === 'number') {
    return { phase: next.phase as Phase, week: next.week };
  }

  // 2) Fallback: the max regular week present
  const { data: maxReg } = await supabase
    .from('games')
    .select('week')
    .eq('phase', 'reg')
    .order('week', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (typeof maxReg?.week === 'number') {
    return { phase: 'reg', week: maxReg.week };
  }

  // 3) Safe fallback
  return { phase: 'reg', week: 1 };
}

/** Returns the next future game's week for the given phase (default 'reg'). */
export async function getCurrentWeek(phase: Phase = 'reg'): Promise<number> {
  const nowISO = new Date().toISOString();

  const { data: next } = await supabase
    .from('games')
    .select('week, start_time')
    .eq('phase', phase)
    .gt('start_time', nowISO)
    .order('start_time', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (next?.week) return next.week;

  const { data: maxRow } = await supabase
    .from('games')
    .select('week')
    .eq('phase', phase)
    .order('week', { ascending: false })
    .limit(1)
    .maybeSingle();

  return maxRow?.week ?? 1;
}