#!/usr/bin/env node
// Lightweight monitor wrapper that spawns a command and kills it if CPU usage exceeds threshold.
// Usage: node ./scripts/monitor-and-run.js --max-cpu=85 -- <command> <args...>

const rawArgs = process.argv.slice(2);
const sep = rawArgs.indexOf('--');
const opts = sep === -1 ? rawArgs : rawArgs.slice(0, sep);
const cmdParts = sep === -1 ? [] : rawArgs.slice(sep + 1);

function parseOpts(options) {
  const parsed = { maxCpu: 85, checkIntervalMs: 2000, consecutiveChecks: 3 };
  for (const o of options) {
    if (o.startsWith('--max-cpu=')) parsed.maxCpu = Number(o.split('=')[1]) || parsed.maxCpu;
    if (o.startsWith('--check-interval=')) parsed.checkIntervalMs = Number(o.split('=')[1]) || parsed.checkIntervalMs;
    if (o.startsWith('--consecutive=')) parsed.consecutiveChecks = Number(o.split('=')[1]) || parsed.consecutiveChecks;
  }
  return parsed;
}

if (!cmdParts.length) {
  console.error('No command provided. Usage: monitor-and-run.js --max-cpu=85 -- <command> <args...>');
  process.exit(1);
}

const { maxCpu, checkIntervalMs, consecutiveChecks } = parseOpts(opts);

const { spawn } = await import('child_process');
const treeKillMod = await import('tree-kill');
const treeKill = treeKillMod.default || treeKillMod;
const pidusageMod = await import('pidusage');
const pidusage = pidusageMod.default || pidusageMod;

const cmdStr = cmdParts.join(' ');
console.log(`Running: ${cmdStr}`);
const child = spawn(cmdStr, { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });

child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);

let consecutive = 0;
const interval = setInterval(async () => {
  try {
    const stat = await pidusage(child.pid);
    const cpu = stat.cpu || 0;
    if (cpu >= maxCpu) {
      consecutive += 1;
      console.warn(`High CPU detected: ${cpu.toFixed(1)}% (threshold ${maxCpu}%) [${consecutive}/${consecutiveChecks}]`);
    } else {
      consecutive = 0;
    }
    if (consecutive >= consecutiveChecks) {
      console.error(`CPU exceeded ${maxCpu}% for ${consecutiveChecks} checks — terminating process.`);
      treeKill(child.pid, 'SIGKILL', (err) => {
        if (err) console.error('Error killing process:', err);
        process.exit(1);
      });
    }
  } catch (e) {
    // If pidusage fails (process exited), stop monitoring.
  }
}, checkIntervalMs);

child.on('exit', (code, signal) => {
  clearInterval(interval);
  if (signal) {
    console.log(`Process terminated by signal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 0);
});

child.on('error', (err) => {
  clearInterval(interval);
  console.error('Failed to start child process:', err);
  process.exit(1);
});
