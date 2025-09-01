import 'dotenv/config';
import cron from 'node-cron';
import { exec } from 'child_process';
import { supabaseAdmin as supabase } from '../supa';
import { getCurrentWeek } from '../utils/week';

const SEASON = process.env.CURRENT_SEASON || String(new Date().getFullYear());

function sh(cmd: string) {
  console.log('→', cmd);
  const child = exec(cmd, { env: process.env });
  child.stdout?.on('data', d => process.stdout.write(d));
  child.stderr?.on('data', d => process.stderr.write(d));
  return child;
}

// Decide a reasonable “settle week”: usually the week before current
async function getSettleWeek(): Promise<number> {
  const curr = await getCurrentWeek();
  return Math.max(1, Number(curr) - 1);
}

// Sync the current week (and optionally previous, just in case)
async function runSyncJobs() {
  try {
    const curr = await getCurrentWeek();
    sh(`npm run sync:week -- ${SEASON} ${curr}`);
    // also sync previous week (late score corrections)
    if (curr > 1) sh(`npm run sync:week -- ${SEASON} ${curr - 1}`);
  } catch (e) {
    console.error('sync job error:', e);
  }
}

// Settle weeks that should be final (previous week by default)
async function runSettleJobs() {
  try {
    const settleWeek = await getSettleWeek();
    sh(`npm run settle:week -- ${SEASON} ${settleWeek}`);
  } catch (e) {
    console.error('settle job error:', e);
  }
}

// ── Schedules ────────────────────────────────────────────────────────────────
// Every 15 minutes: keep current/previous week synced
cron.schedule('*/15 * * * *', () => {
  console.log('[cron] sync tick');
  runSyncJobs();
});

// Every day at 02:00 local: settle previous week
cron.schedule('0 2 * * *', () => {
  console.log('[cron] settle tick');
  runSettleJobs();
});

// Optional: also settle hourly (helpful on game days)
// cron.schedule('0 * * * *', () => { console.log('[cron] hourly settle'); runSettleJobs(); });

console.log('🕑 Cron scheduler started. Season =', SEASON);