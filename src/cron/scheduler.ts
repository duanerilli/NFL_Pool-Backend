// src/cron/scheduler.ts
import 'dotenv/config';
import { autoPhaseWeek, type Phase } from '../utils/week';
import { spawn } from 'child_process';

function run(cmd: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`))));
  });
}

async function main() {
  const season = String(new Date().getFullYear());

  // Detect current phase/week from DB
  const auto = await autoPhaseWeek();
  const phase: Phase = auto.phase;     // 'pre' | 'reg' | 'post'
  const curr = auto.week;

  console.log('🕑 Cron scheduler started.', { season, phase, week: curr });

  const currLabel = `${phase.toUpperCase()}${curr}`;

  // A) Sync current label
  console.log(`[cron] syncing ${season} ${currLabel}`);
  await run('npx', ['tsx', 'src/scripts/syncGames.ts', season, currLabel]);

  // B) Optionally settle previous week in same phase
  if (curr > 1) {
    const prevLabel = `${phase.toUpperCase()}${curr - 1}`;
    console.log(`[cron] settling ${season} ${prevLabel}`);
    await run('npx', ['tsx', 'src/scripts/settlePicks.ts', season, prevLabel]);
  } else {
    console.log('[cron] no previous week to settle');
  }

  console.log('✅ Cron finished.');
}

main().catch((e) => {
  console.error('[cron] error:', e);
  process.exit(1);
});