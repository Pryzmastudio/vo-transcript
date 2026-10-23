# vo-transcript

Drive the real macOS VoiceOver from the command line and get a transcript of what it says on a web page.

```
$ npx github:Pryzmastudio/vo-transcript https://www.w3.org/WAI/demos/bad/before/home.html https://www.w3.org/WAI/demos/bad/after/home.html

https://www.w3.org/WAI/demos/bad/before/home.html
   18  Demo starts here
   19  border_left_top.gif image
   20  border_top.gif image
   21  border_right_top.gif image
   22  border_left.gif image
   ...
   27  QUICKMENU ----> collapsed pop up button
   28  mark.gif image

https://www.w3.org/WAI/demos/bad/after/home.html
   18  Demo starts here
   19  list 2 items
   20  link Skip to content (within demo page) 1 of 2
   21  link Skip to navigation (within demo page) 2 of 2
   22  end of list
   23  Citylights: your access to the city. image
   24  Sunny Spells image
   ...

https://www.w3.org/WAI/demos/bad/before/home.html: 45 step(s), stopped at --steps
  ? 16 image(s) announced by file name, e.g. "border_left_top.gif image": usually a missing alt attribute. Decorative images need alt="".

https://www.w3.org/WAI/demos/bad/after/home.html: 45 step(s), stopped at --steps
  no warnings. Still listen to it: this only catches the obvious.
```

That's the W3C's before-and-after demo, read by VoiceOver on macOS 26. The broken page reads out image file names; the fixed one has skip links and real alt text.

## Why

Automated checkers read the accessibility tree. VoiceOver reads it too, but then it decides what to actually say, in what order, and how to group things. Sometimes that's different from what you expected: an icon and its label read as two items, a card that turns into five separate links, a button that's announced as just "button".

The usual way to automate VoiceOver needs the terminal to have **Full Disk Access**. To switch on VoiceOver's AppleScript control for you, it replaces files in `~/Library/Group Containers/group.com.apple.VoiceOver`, a folder macOS protects. That's a lot of access to grant for a screen reader test.

vo-transcript doesn't touch those files. You tick one checkbox in VoiceOver Utility once, and the tool only asks VoiceOver to move and to tell it the last thing it said. No extra permissions beyond that.

## Setup, once per Mac

1. Press **Cmd+F5** to start VoiceOver.
2. Press **Ctrl+Option+F8** to open VoiceOver Utility.
3. In **General**, tick **Allow VoiceOver to be controlled with AppleScript**.
4. Press **Cmd+F5** to stop VoiceOver.

On the first run macOS also asks whether your terminal may control Safari. Allow it: that's how vo-transcript loads each page in the same tab and knows when it has arrived. If you say no, it still opens the page but can only wait a fixed time.

Setting `SCREnableAppleScript` with `defaults write` doesn't work on macOS 26: VoiceOver reads its settings from another place, so it has to be the checkbox. If it's missing, vo-transcript tells you and exits instead of pretending it ran.

You also need Node.js 20 or newer.

## Use

```sh
npx github:Pryzmastudio/vo-transcript https://example.com
npx github:Pryzmastudio/vo-transcript http://localhost:3000 http://localhost:3000/contact --steps 80
```

**While it runs, VoiceOver speaks out loud and takes the keyboard.** Don't type or switch windows. There's a 5 second warning before it starts (skip it with `-y`). Ctrl+C stops the run and turns VoiceOver off.

If VoiceOver was already on when you started, vo-transcript uses it and leaves it on. It only turns off what it turned on.

| Option | Default | |
|---|---|---|
| `--steps N` | 40 | VoiceOver moves per page |
| `--wait MS` | 4000 | wait after the page opens |
| `--step-delay MS` | 250 | pause between moves. Raise it if you get empty answers |
| `--json` | | print the result as JSON |
| `--out FILE` | | save the JSON to a file |
| `--keep-running` | | leave VoiceOver on at the end |
| `-y`, `--yes` | | skip the 5 second warning |

Exit codes: `0` no warnings, `1` warnings, `2` setup problem.

## How it moves

VoiceOver has no single "next" command. Its cursor moves within a level: right goes to the next item, "into" enters a group, "out of" leaves it. People do the same with VO+Right, VO+Shift+Down and VO+Shift+Up. So each step tries right first, and only if VoiceOver says nothing new, goes into the item or back out of it. When none of the three moves changes anything, that's the end of the page.

(`move down` looks like the obvious choice, but in VoiceOver it means "deeper into the screen" and mostly repeats the page title.)

## Warnings

The transcript is the real output. On top of it there are three simple checks:

- **Role only**: something announced as just "link", "button" or "image" with no name. Works for VoiceOver in English, Polish, Spanish, German and French.
- **Same phrase twice in a row**: often a duplicated link, or an icon and its text read separately.
- **Empty answers**: VoiceOver didn't keep up. Try a larger `--step-delay`.

They point at places worth listening to again. They are not a pass or fail, and a clean result doesn't mean the page works with a screen reader. Listen to it.

## Node API

```js
import { readPages } from 'vo-transcript';

const report = await readPages(['http://localhost:3000'], { steps: 60 });
for (const r of report.results) console.log(r.url, r.phrases, r.warnings);
```

## Limits

- macOS and Safari only, and one run at a time, since there's one VoiceOver. Safari is what most VoiceOver users browse with.
- It can't run on a CI machine without someone ticking the checkbox on that machine first.
- It reads the page as it is after loading. Menus, dialogs and forms need to be opened by hand or by your own script before reading.
- Speed and the exact words depend on the macOS version and VoiceOver's voice and verbosity settings.

For automated checks that run anywhere, pair it with an axe-based scanner such as [floorcheck](https://github.com/Pryzmastudio/floorcheck).

## License

MIT. Made by [Vayle](https://vayle.art), a one-person web studio. Issues and pull requests are welcome.
