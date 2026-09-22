const { spawn } = require('node:child_process');

const [command, fallbackPort] = process.argv.slice(2);

if (!command || !fallbackPort) {
  console.error('Usage: node next-with-port.cjs <dev|start> <fallback-port>');
  process.exit(1);
}

const nextBinary = process.platform === 'win32' ? 'next.cmd' : 'next';
const port = process.env.PORT || fallbackPort;
const nextProcess = spawn(nextBinary, [command, '-p', port], {
  env: process.env,
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

nextProcess.on('error', (error) => {
  console.error(error);
  process.exit(1);
});

nextProcess.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
