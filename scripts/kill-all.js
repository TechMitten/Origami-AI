#!/usr/bin/env node
// Cross-platform helper to kill Node processes. Uses platform-native tools.
import { exec } from 'child_process';

const platform = process.platform;
const cmd = platform === 'win32'
  ? 'taskkill /F /IM node.exe /T'
  : 'pkill -9 -f node || killall -9 node';

exec(cmd, (err, stdout, stderr) => {
  if (err) {
    console.error('No matching node processes terminated or command failed:', err.message);
    process.exit(0);
  }
  console.log('Node processes terminated.');
});
