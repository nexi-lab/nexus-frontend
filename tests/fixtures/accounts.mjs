import { spawn } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';

export function verificationLinkFromMessage(message) {
  const decoded = message.replaceAll('=\r\n', '').replaceAll('=3D', '=');
  const link = decoded.match(/http:\/\/127\.0\.0\.1:\d+\/verify-email\?token=[\w.%-]+/)?.[0];
  if (!link) throw new Error('Account fixture email contains no verification link');
  return link;
}

export async function startAccounts({ verificationURL = 'http://127.0.0.1:4173/verify-email' } = {}) {
  const binary = process.env.NEXUS_TEST_ACCOUNTS_BINARY;
  const schema = process.env.NEXUS_TEST_ACCOUNTS_SCHEMA;
  if (!binary && !schema) return null;
  if (!binary || !schema) throw new Error('Account browser acceptance requires both the actual Rust binary and its canonical SQL fixture');
  const root = await mkdtemp(join(tmpdir(), 'nexus-browser-accounts-'));
  const databasePath = join(root, 'accounts.db');
  const database = new DatabaseSync(databasePath);
  database.exec(await readFile(schema, 'utf8'));
  database.close();
  const mail = [];
  const sockets = new Set();
  const smtp = createServer((socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    socket.setTimeout(10000, () => socket.destroy());
    socket.on('error', () => socket.destroy());
    socket.write('220 localhost test relay\r\n');
    let buffer = '';
    let message = null;
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      if (buffer.length + (message?.length ?? 0) > 65536) return socket.destroy();
      while (true) {
        const boundary = buffer.indexOf('\r\n');
        if (boundary < 0) break;
        const line = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        if (message !== null) {
          if (line === '.') {
            mail.push(message);
            message = null;
            socket.write('250 Delivered\r\n');
          } else message += `${line.startsWith('..') ? line.slice(1) : line}\r\n`;
        } else {
          const command = line.split(' ', 1)[0].toUpperCase();
          if (command === 'EHLO' || command === 'HELO') socket.write('250-localhost\r\n250 8BITMIME\r\n');
          else if (command === 'DATA') {
            message = '';
            socket.write('354 Send message\r\n');
          } else if (command === 'QUIT') socket.end('221 Goodbye\r\n');
          else if (['MAIL', 'RCPT', 'RSET', 'NOOP'].includes(command)) socket.write('250 OK\r\n');
          else socket.write('502 Unsupported command\r\n');
        }
      }
    });
  });
  await new Promise((ready, reject) => {
    smtp.once('error', reject);
    smtp.listen(0, '127.0.0.1', ready);
  });
  const inherited = ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE'];
  const env = Object.fromEntries(inherited.filter((name) => process.env[name]).map((name) => [name, process.env[name]]));
  const child = spawn(resolve(binary), ['--grpc-addr', '127.0.0.1:0', '--http-addr', '127.0.0.1:0'], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...env,
      NEXUS_DATABASE_URL: `sqlite:///${databasePath.replaceAll('\\', '/')}`,
      NEXUS_JWT_SECRET: 'fixture-account-signing-key-32-bytes-minimum',
      NEXUS_ACCOUNTS_SMTP_URL: `smtp://127.0.0.1:${smtp.address().port}`,
      NEXUS_ACCOUNTS_EMAIL_FROM: 'nexus@example.test',
      NEXUS_ACCOUNTS_VERIFICATION_URL: verificationURL,
    },
  });
  let diagnostics = '';
  child.stderr.on('data', (bytes) => {
    diagnostics = (diagnostics + bytes.toString('utf8')).slice(-8192);
  });
  const stopped = new Promise((done) => child.once('close', done));
  const lines = createInterface({ input: child.stdout });
  const ready = new Promise((done, reject) => {
    const timer = setTimeout(() => reject(new Error('Rust account listener did not start')), 30000);
    const finish = (callback, value) => {
      clearTimeout(timer);
      callback(value);
    };
    lines.once('line', (line) => {
      try {
        finish(done, JSON.parse(line));
      } catch (error) {
        finish(reject, error);
      }
    });
    child.once('error', (error) => finish(reject, error));
    child.once('exit', (code) => finish(reject, new Error(`Rust account listener exited ${code}: ${diagnostics}`)));
  });
  const close = async () => {
    child.kill();
    await stopped;
    lines.close();
    for (const socket of sockets) socket.destroy();
    await new Promise((done) => smtp.close(done));
    if ((await realpath(root)) !== resolve(root)) throw new Error('Account fixture cleanup target changed');
    await rm(root, { recursive: true });
  };
  try {
    const address = await ready;
    return {
      base: `http://${address.http_addr}`,
      mail,
      close,
      facts(email) {
        const read = new DatabaseSync(databasePath, { readOnly: true });
        try {
          return read.prepare('SELECT email_verified, zone_id, api_key, is_global_admin FROM users WHERE email = ?').all(email);
        } finally {
          read.close();
        }
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}
