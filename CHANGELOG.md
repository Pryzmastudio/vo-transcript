# Changelog

## 1.0.0

First public release.

- Reads web pages with the real macOS VoiceOver through AppleScript, without Full Disk Access
- Leaves VoiceOver alone if it was already running; turns off only what it started, also on Ctrl+C
- Safari, one tab reused for every page so VoiceOver never reads a stale page
- Detects a macOS permission dialog in front of the page instead of reading it as content
- Warnings for links, buttons and images announced with only a role (English, Polish, Spanish, German, French), images read by file name, repeated phrases and empty answers
- Clear message when AppleScript control is not enabled
- JSON output and Node API
