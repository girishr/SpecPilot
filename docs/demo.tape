# VHS tape for the SpecPilot CLI demo GIF.
# Install VHS: brew install vhs
# Regenerate:  vhs docs/demo.tape   (run from the repo root)
# Then compress (~35-40% smaller, no visible quality loss):
#   brew install gifsicle
#   gifsicle -O3 --lossy=80 docs/demo.gif -o docs/demo.gif.tmp && mv docs/demo.gif.tmp docs/demo.gif
# Docs: https://github.com/charmbracelet/vhs

Output docs/demo.gif

# VHS locks terminal size for the whole recording (Set Height/FontSize
# changes mid-tape are ignored), so this is sized to fit the tallest
# scene: the interactive `init` Q&A + banner/tree/success/onboarding-prompt,
# which all print as one continuous burst with no pause point to `clear`
# mid-command.
Set Shell "zsh"
Set FontSize 15
Set Width 1200
Set Height 800
Set Padding 20
Set Theme "Dracula"
Set TypingSpeed 40ms

# Fresh scratch workspace so the recording never touches the repo.
Hide
Type "rm -rf /tmp/specpilot-demo && mkdir -p /tmp/specpilot-demo && cd /tmp/specpilot-demo"
Enter
Type "clear"
Enter
Show

Type "specpilot init demo-app --lang typescript --framework react"
Sleep 500ms
Enter
Sleep 1500ms

# Greenfield vs brownfield — accept default (Greenfield)
Enter
Sleep 1s

# API paradigm — accept default (REST / OpenAPI)
Enter
Sleep 1s

# Developer handle
Type "jsmith"
Sleep 500ms
Enter
Sleep 1s

# IDE/Agent — arrow down to Claude Code (Copilot, Cursor, Windsurf, Antigravity, Claude Code, Codex)
Down 4
Sleep 500ms
Enter
Sleep 1s

# Project context — "what it does" is required; skip the 3 optional
# follow-ups (Enter to skip) to keep the scene shorter.
Type "A CLI for spec-driven development with AI coding agents"
Sleep 500ms
Enter
Sleep 500ms

Enter
Sleep 300ms
Enter
Sleep 300ms
Enter
Sleep 4s

# Dismiss the two pagers: "Press Enter to continue..." (after the file
# tree) and "Press Enter to see your onboarding prompt..." (before the
# full prompt dump) — both must be cleared before the shell is live again.
Enter
Sleep 500ms
Enter
Sleep 1500ms

Type "clear"
Enter
Type "cd demo-app"
Enter
Sleep 500ms

Type "specpilot validate"
Sleep 500ms
Enter
Sleep 4s

Type "clear"
Enter
Type "specpilot validate --fix | head -39"
Sleep 500ms
Enter
Sleep 5s

Type "clear"
Enter
Type "specpilot refine 'REST API for user profile management' --no-prompts | head -33"
Sleep 500ms
Enter
Sleep 5s

Type "clear"
Enter
Type "specpilot list"
Sleep 500ms
Enter
Sleep 4s

Sleep 2s
