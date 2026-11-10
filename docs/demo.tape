# VHS tape for the README demo GIF.
# Install VHS once:  https://github.com/charmbracelet/vhs  (e.g. `winget install charmbracelet.vhs`)
# Generate the GIF:  vhs docs/demo.tape   ->   writes docs/demo.gif
#
# Runs against a throwaway temp repo so your real project is untouched.

Output docs/demo.gif

Set Shell "bash"
Set FontSize 20
Set Width 1200
Set Height 640
Set Padding 20
Set Theme "Catppuccin Mocha"

Type "mkdir /tmp/ragn-demo && cd /tmp/ragn-demo && git init -q" Enter
Sleep 800ms

Type "# 1. Scaffold the governance store for any AI agent" Enter
Sleep 1s
Type "npx rational-agnostic init" Enter
Sleep 2s

Type "# 2. Record WHY a choice was made (returns a decision id)" Enter
Sleep 1s
Type 'npx rational-agnostic decision add --title "Use JWT for auth" --summary "Stateless scaling" --context "API must scale without sticky sessions" --decision "Short-lived JWT + refresh tokens" --why "Avoids shared session storage" --author agent:anthropic:claude-code' Enter
Sleep 2500ms

Type "# 3. Traceability is enforceable at commit time" Enter
Sleep 1s
Type "npx rational-agnostic verify" Enter
Sleep 2500ms

Type "# Every function can point back to the decision behind it." Enter
Sleep 2s
