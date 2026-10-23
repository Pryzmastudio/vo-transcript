// Talking to VoiceOver and the browser through AppleScript.
//
// Nothing here edits VoiceOver's settings files. Libraries that switch on
// "Allow VoiceOver to be controlled with AppleScript" for you do it by
// replacing files in ~/Library/Group Containers/group.com.apple.VoiceOver,
// which is protected by macOS privacy controls, so the terminal ends up
// needing Full Disk Access. Here a person ticks that one box once, and the
// tool just asks VoiceOver to move and report what it said.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

const STARTER = '/System/Library/CoreServices/VoiceOver.app/Contents/MacOS/VoiceOverStarter';

export class SetupError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SetupError';
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function osascript(script) {
  const { stdout } = await run('osascript', ['-e', script], { timeout: 15000 });
  return stdout.trim();
}

const asString = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

export async function isVoiceOverRunning() {
  try {
    await run('pgrep', ['-x', 'VoiceOver']);
    return true;
  } catch {
    return false;
  }
}

export const PERMISSION_HELP = [
  'VoiceOver is running but does not accept AppleScript commands.',
  '',
  'Turn it on once per Mac:',
  '  1. Cmd+F5          start VoiceOver',
  '  2. Ctrl+Option+F8  open VoiceOver Utility',
  '  3. General: tick "Allow VoiceOver to be controlled with AppleScript"',
  '  4. Cmd+F5          stop VoiceOver',
  '',
  'Setting SCREnableAppleScript with `defaults write` does not work on macOS 26:',
  'VoiceOver reads its settings from a different place, so it has to be the checkbox.',
].join('\n');

/** Ask VoiceOver for its last phrase. Throws SetupError if scripting is off. */
export async function lastPhrase() {
  try {
    return await osascript('tell application "VoiceOver" to return content of last phrase');
  } catch (err) {
    const text = String(err.stderr || err.message);
    if (text.includes('-1728') || text.includes('-1743')) throw new SetupError(PERMISSION_HELP);
    throw err;
  }
}

/**
 * Start VoiceOver unless it is already on, and wait until it answers.
 * @returns {Promise<{startedByUs: boolean}>}
 */
export async function startVoiceOver({ timeout = 15000 } = {}) {
  const already = await isVoiceOverRunning();
  if (!already) await run(STARTER).catch(() => {});

  const until = Date.now() + timeout;
  let lastError;
  while (Date.now() < until) {
    try {
      await lastPhrase();
      return { startedByUs: !already };
    } catch (err) {
      if (err instanceof SetupError) {
        if (!already) await stopVoiceOver();
        throw err;
      }
      lastError = err;
    }
    await sleep(500);
  }
  if (!already) await stopVoiceOver();
  throw new SetupError(`VoiceOver did not respond within ${timeout / 1000}s: ${String(lastError?.message || '').split('\n')[0]}`);
}

async function waitUntilStopped(ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (!(await isVoiceOverRunning())) return true;
    await sleep(250);
  }
  return false;
}

/** Quit VoiceOver and wait until the process is really gone. */
export async function stopVoiceOver() {
  await osascript('tell application "VoiceOver" to quit').catch(() => {});
  if (await waitUntilStopped(4000)) return;
  await run('killall', ['VoiceOver']).catch(() => {});
  if (await waitUntilStopped(3000)) return;
  await run('killall', ['-9', 'VoiceOver']).catch(() => {});
  await waitUntilStopped(2000);
}

export async function moveCursor(command) {
  await osascript(`tell application "VoiceOver" to tell vo cursor to ${command}`);
}

const SCRIPTS = {
  Safari: {
    current: 'tell application "Safari" to if (count of documents) > 0 then return URL of front document',
    go: (url) => `tell application "Safari"
      if (count of documents) = 0 then
        make new document with properties {URL:${asString(url)}}
      else
        set URL of front document to ${asString(url)}
      end if
    end tell`,
  },
};

const sameUrl = (a, b) => String(a).replace(/\/+$/, '') === String(b).replace(/\/+$/, '');

/**
 * Load a URL in the front tab of the browser and wait until it is there.
 * Reusing one tab matters: VoiceOver stays with the tab it was reading, so a
 * new tab per page would read the old page again.
 *
 * Controlling the browser needs the macOS Automation permission ("Terminal
 * wants access to control Safari"). Without it the page is opened with
 * `open -a` and the caller relies on a fixed wait.
 * @returns {Promise<{confirmed: boolean, reason?: string}>}
 */
export async function openInBrowser(url, { browser = 'Safari', timeout = 30000 } = {}) {
  const sc = SCRIPTS[browser];
  if (!sc) throw new Error(`unsupported browser: ${browser}`);
  const denied = (err) => /-1743|not allowed|not authori[sz]ed/i.test(String(err.stderr || err.message));

  await run('open', ['-g', '-a', browser]).catch(() => {});
  let before = '';
  try {
    before = await osascript(sc.current);
    await osascript(sc.go(url));
  } catch (err) {
    await run('open', ['-a', browser, url]);
    const reason = denied(err)
      ? `no permission to control ${browser}: System Settings, Privacy & Security, Automation`
      : `could not control ${browser}: ${String(err.message).split('\n')[0]}`;
    await osascript(`tell application ${asString(browser)} to activate`).catch(() => {});
    return { confirmed: false, reason };
  }

  let wantHost = '';
  try { wantHost = new URL(url).host; } catch { /* file: URLs have no host */ }
  let result = { confirmed: false, reason: 'timed out waiting for the page' };
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const current = await osascript(sc.current).catch(() => '');
    let host = '';
    try { host = new URL(current).host; } catch { /* not a URL yet */ }
    // Exact match, or a redirect: same host and no longer the previous page.
    if (current && (sameUrl(current, url) || (host === wantHost && !sameUrl(current, before)))) {
      result = { confirmed: true };
      break;
    }
    await sleep(300);
  }
  await osascript(`tell application ${asString(browser)} to activate`).catch(() => {});
  return result;
}
