// Finds source files that are not clean UTF-8 (UTF-16, broken bytes, lone
// surrogates) and NEXT_PUBLIC_ values in .env files with unusual characters.
// Usage: node scripts/check-encoding.mjs
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOTS = ['app', 'components', 'lib', 'types', 'middleware.ts', 'next.config.js'];
const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '.css']);
const bad = [];

function walk(path) {
  if (!existsSync(path)) return;
  const st = statSync(path);
  if (st.isDirectory()) return readdirSync(path).forEach((f) => walk(join(path, f)));
  if (!EXTS.has(extname(path))) return;
  const buf = readFileSync(path);
  if (buf[0] === 0xff && buf[1] === 0xfe) return bad.push([path, 'UTF-16 LE (save as UTF-8)']);
  if (buf[0] === 0xfe && buf[1] === 0xff) return bad.push([path, 'UTF-16 BE (save as UTF-8)']);
  const text = buf.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(buf)) return bad.push([path, 'invalid UTF-8 bytes (probably saved as ANSI/Windows-1252)']);
  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text)) bad.push([path, 'lone surrogate character']);
  if (/\\u[dD][89abAB][0-9a-fA-F]{2}(?!\\u[dD][c-fC-F])/.test(text)) bad.push([path, 'escaped lone surrogate like \\uD83D']);
}

ROOTS.forEach(walk);

for (const envFile of ['.env', '.env.local', '.env.production']) {
  if (!existsSync(envFile)) continue;
  readFileSync(envFile, 'utf8').split(/\r?\n/).forEach((line, i) => {
    if (!line.startsWith('NEXT_PUBLIC_')) return;
    const value = line.slice(line.indexOf('=') + 1);
    if (/[^\x20-\x7e]|\\/.test(value)) bad.push([`${envFile}:${i + 1}`, `${line.split('=')[0]} has a backslash or non-ASCII character`]);
  });
}

if (bad.length === 0) console.log('All source files are clean UTF-8 and NEXT_PUBLIC_ values look normal.');
else bad.forEach(([file, why]) => console.log(`${file}  ->  ${why}`));
