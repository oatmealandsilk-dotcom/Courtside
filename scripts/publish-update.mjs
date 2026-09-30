// Sends the current code to every CourtSide iPhone build on a channel: an
// instant update, no new build. Usage:  npm run update -- "What changed"
//
// The Supabase address and key come from eas.json's build profile, the same
// ones the build was made with. Without them the update would open in demo
// mode on every tester's phone, so this refuses to run if they are missing.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const eas = JSON.parse(readFileSync(new URL('../eas.json', import.meta.url), 'utf8'));
const channel = process.env.CHANNEL || 'production';
const env = eas.build.production.env ?? {};
if (!env.EXPO_PUBLIC_SUPABASE_URL || !env.EXPO_PUBLIC_SUPABASE_KEY) {
  console.error('eas.json has no Supabase address and key in build.production.env; not publishing.');
  process.exit(1);
}
const message = process.argv.slice(2).join(' ').trim() || 'Fixes';
// iOS only: there is no Android build yet. Add 'android' here once there is.
const run = spawnSync('npx', ['eas-cli@latest', 'update', '--channel', channel, '--platform', 'ios', '--message', message, '--non-interactive'], {
  stdio: 'inherit',
  env: { ...process.env, ...env, EXPO_BASE_URL: '' },
});
process.exit(run.status ?? 1);
