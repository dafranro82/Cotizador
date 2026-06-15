import { spawn } from 'node:child_process';

const fallbackDatabaseUrl =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRESQL_URL ||
  process.env.DATABASE_PUBLIC_URL ||
  process.env.POSTGRES_PUBLIC_URL;

if (!fallbackDatabaseUrl) {
  console.error(
    'DATABASE_URL no esta configurada. En Railway conecta el servicio PostgreSQL al servicio web o agrega DATABASE_URL manualmente.'
  );
  process.exit(1);
}

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error('Uso: node scripts/with-database-url.js <comando> [...args]');
  process.exit(1);
}

const child = spawn(command, args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    DATABASE_URL: fallbackDatabaseUrl
  }
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
