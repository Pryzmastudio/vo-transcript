// Walk a page with the VoiceOver cursor and record what it says.

import { analyzeTranscript, isPermissionDialog } from './analyze.mjs';
import { lastPhrase, moveCursor, openInBrowser, sleep, startVoiceOver, stopVoiceOver } from './voiceover.mjs';

export const DEFAULTS = {
  steps: 40,
  browser: 'Safari',
  wait: 4000,
  stepDelay: 250,
  keepRunning: false,
  onPhrase: null,
};

const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();

/** "can't" after "Safari can't open the page": the cursor went inside a text run. */
function isFragmentOf(phrase, previous) {
  const p = norm(phrase);
  const q = norm(previous);
  return p.length > 0 && p.length < q.length && q.includes(p);
}

/*
 * VoiceOver has no single "next" command. Its cursor moves within a level:
 * right goes to the next item, "into" enters a group, "out of" leaves it.
 * People do the same with VO+Right, VO+Shift+Down and VO+Shift+Up.
 *
 * Each step tries right first. If nothing new is said, it goes into the item,
 * unless that only lands inside a run of text (VoiceOver then reads word by
 * word), in which case it backs out. Then it leaves the group and tries right
 * again one level up. Depth is counted so the cursor never leaves the page
 * for the browser toolbar or another app.
 *
 * "move down" looks tempting but means "deeper into the screen" and mostly
 * repeats the page title.
 */
async function walk(steps, stepDelay, onPhrase) {
  const say = () => lastPhrase().catch(() => '');
  const move = async (cmd) => {
    await moveCursor(cmd).catch(() => {});
    await sleep(stepDelay);
    return say();
  };

  await moveCursor('move to first item').catch(() => {});
  await sleep(400);

  const phrases = [];
  let previous = await say();
  let depth = 0;
  let stopReason = 'end';

  if (isPermissionDialog(previous)) return { phrases: [previous], stopReason: 'dialog' };

  for (let i = 0; i < steps; i++) {
    let next = null;

    let p = await move('move right');
    if (p && p !== previous) next = p;

    if (!next) {
      p = await move('move into item');
      if (p && p !== previous && !isFragmentOf(p, previous)) {
        next = p;
        depth++;
      } else if (p && p !== previous) {
        await move('move out of item');
      }
    }

    while (!next && depth > 0) {
      // Leaving a group makes VoiceOver name the group. That is not a new
      // item, so it is only progress if moving right then says something else.
      const groupName = await move('move out of item');
      depth--;
      p = await move('move right');
      if (p && p !== previous && p !== groupName) next = p;
    }

    if (!next) break;
    if (isPermissionDialog(next)) { phrases.push(next); stopReason = 'dialog'; break; }
    phrases.push(next);
    if (onPhrase) onPhrase(next, phrases.length - 1);
    previous = next;
    if (i === steps - 1) stopReason = 'steps';
  }
  return { phrases, stopReason };
}

/**
 * Read one or more pages with VoiceOver.
 * VoiceOver speaks aloud and takes over the keyboard while this runs.
 * If VoiceOver was already on, it is used as is and left on afterwards.
 *
 * @param {string[]} urls
 * @param {Partial<typeof DEFAULTS>} options
 */
export async function readPages(urls, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  if (process.platform !== 'darwin') throw new Error('VoiceOver only exists on macOS.');

  const { startedByUs } = await startVoiceOver();
  const cleanup = async () => { if (startedByUs && !opts.keepRunning) await stopVoiceOver(); };
  const onSignal = async (sig) => { await cleanup(); process.exit(sig === 'SIGINT' ? 130 : 143); };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  const results = [];
  try {
    for (const url of urls) {
      const opened = await openInBrowser(url, { browser: opts.browser });
      await sleep(opts.wait);
      const { phrases, stopReason } = await walk(opts.steps, opts.stepDelay,
        opts.onPhrase && ((p, i) => opts.onPhrase(url, p, i)));
      const analysis = analyzeTranscript(phrases);
      if (stopReason === 'dialog') {
        analysis.warnings.unshift('A macOS permission dialog was in front of the page, so VoiceOver read the dialog. '
          + 'Answer it (Allow lets the tool see when the page has loaded) and run again.');
      }
      if (!opened.confirmed) {
        analysis.warnings.push(`Could not confirm the page loaded (${opened.reason}). Waited --wait ms instead.`);
      }
      results.push({ url, steps: phrases.length, stopReason, phrases, ...analysis });
    }
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    await cleanup();
  }

  return {
    tool: 'vo-transcript',
    startedAt: new Date().toISOString(),
    browser: opts.browser,
    voiceOverWasRunning: !startedByUs,
    results,
  };
}
