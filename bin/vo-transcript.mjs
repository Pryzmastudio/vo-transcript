#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { readPages } from '../src/read-page.mjs';
import { SetupError, sleep } from '../src/voiceover.mjs';

const HELP = `vo-transcript - what the real VoiceOver says on a web page

Usage
  vo-transcript <url...> [options]

Options
  --steps N            how many VoiceOver moves per page (default 40)
  --wait MS            wait after the page opens, before reading (default 4000)
  --step-delay MS      pause between moves; raise it if answers come back empty (default 250)
  --json               print the full result as JSON
  --out FILE           also save the JSON to a file
  --keep-running       leave VoiceOver on at the end
  -y, --yes            skip the 5 second warning before VoiceOver starts
  -v, --version
  -h, --help

Before the first run, once per Mac:
  Cmd+F5, then Ctrl+Option+F8 (VoiceOver Utility), General:
  tick "Allow VoiceOver to be controlled with AppleScript". Cmd+F5 again.
  On the first run macOS also asks whether your terminal may control Safari.
  Allow it: that is how the tool loads each page and knows it has arrived.

While it runs VoiceOver speaks aloud and takes the keyboard. Don't type or
switch windows. Ctrl+C stops it and turns VoiceOver off. If VoiceOver was
already on when you started, it is left on.

Exit codes
  0  no warnings   1  warnings found   2  setup problem (not macOS, no permission)
`;

function fail(msg) {
  process.stderr.write(`vo-transcript: ${msg}\n`);
  process.exit(2);
}

function num(name, value, fallback) {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) fail(`${name} needs a whole number, got "${value}"`);
  return n;
}

async function main() {
  let args;
  try {
    args = parseArgs({
      allowPositionals: true,
      options: {
        steps: { type: 'string' },
        wait: { type: 'string' },
        'step-delay': { type: 'string' },
        json: { type: 'boolean' },
        out: { type: 'string' },
        'keep-running': { type: 'boolean' },
        yes: { type: 'boolean', short: 'y' },
        version: { type: 'boolean', short: 'v' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (err) {
    fail(err.message);
  }
  const o = args.values;
  if (o.help) { process.stdout.write(HELP); return 0; }
  if (o.version) {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    process.stdout.write(`${pkg.version}\n`);
    return 0;
  }
  if (process.platform !== 'darwin') fail('VoiceOver only exists on macOS.');

  const urls = args.positionals.map((u) => (/^(https?|file):\/\//i.test(u) ? u : `https://${u}`));
  if (!urls.length) { process.stderr.write(HELP); return 2; }
  const browser = 'Safari';

  if (!o.yes) {
    process.stderr.write('VoiceOver will start in 5 seconds. It will speak aloud and take the keyboard.\n'
      + "Don't type or switch windows until it finishes. Ctrl+C to cancel.\n");
    await sleep(5000);
  }

  let current = null;
  const report = await readPages(urls, {
    steps: num('--steps', o.steps, 40),
    browser,
    wait: num('--wait', o.wait, 4000),
    stepDelay: num('--step-delay', o['step-delay'], 250),
    keepRunning: !!o['keep-running'],
    onPhrase: (url, phrase, i) => {
      if (o.json) return;
      if (url !== current) { current = url; process.stderr.write(`\n${url}\n`); }
      process.stderr.write(`  ${String(i + 1).padStart(3)}  ${phrase}\n`);
    },
  });

  let warnings = 0;
  for (const r of report.results) {
    warnings += r.warnings.length;
    if (o.json) continue;
    const why = { end: 'reached the end of the page', steps: 'stopped at --steps', dialog: 'stopped: a dialog was in front' }[r.stopReason] || '';
    process.stderr.write(`\n${r.url}: ${r.steps} step(s), ${why}\n`);
    for (const w of r.warnings) process.stderr.write(`  ? ${w}\n`);
    if (!r.warnings.length) process.stderr.write('  no warnings. Still listen to it: this only catches the obvious.\n');
  }

  if (o.out) await writeFile(o.out, `${JSON.stringify(report, null, 2)}\n`);
  if (o.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return warnings ? 1 : 0;
}

main().then((code) => process.exit(code ?? 0), (err) => {
  process.stderr.write(err instanceof SetupError ? `${err.message}\n` : `vo-transcript: ${err.stack}\n`);
  process.exit(2);
});
