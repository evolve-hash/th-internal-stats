#!/usr/bin/env bash
# ============================================================
#  Team Howe — Commission Dashboard
#  One-shot deploy to GitHub Pages.
#
#  WHAT THIS DOES
#    1. Makes sure the GitHub CLI is installed
#    2. Signs you in (in YOUR browser — no password is typed here)
#    3. Creates the repo, pushes these files
#    4. Turns on GitHub Pages
#    5. Optionally wires up Supabase
#    6. Prints your live URL
#
#  HOW TO RUN
#    cd into this folder, then:   bash deploy.sh
#
#  Safe to re-run. If the repo already exists it just pushes.
# ============================================================

set -euo pipefail

REPO_NAME="${REPO_NAME:-th-internal-stats}"
VISIBILITY="${VISIBILITY:-public}"   # GitHub Pages on a free plan needs public

bold()  { printf '\033[1m%s\033[0m\n' "$1"; }
info()  { printf '  \033[2m%s\033[0m\n' "$1"; }
ok()    { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn()  { printf '  \033[33m!\033[0m %s\n' "$1"; }
die()   { printf '\n  \033[31m✗ %s\033[0m\n\n' "$1" >&2; exit 1; }

echo
bold "Team Howe dashboard → GitHub Pages"
echo

# ---------- sanity: are we in the right folder? ----------
[ -f index.html ] && [ -d js ] || die "Run this from inside the unzipped teamhowe-dashboard folder (the one containing index.html)."

# ---------- 1. GitHub CLI ----------
bold "1/5  GitHub CLI"
if command -v gh >/dev/null 2>&1; then
  ok "gh is installed"
else
  warn "gh not found — installing with Homebrew"
  if ! command -v brew >/dev/null 2>&1; then
    die "Homebrew isn't installed. Install it from https://brew.sh then re-run this script. (Or follow QUICKSTART.md, which needs no terminal at all.)"
  fi
  brew install gh
  ok "gh installed"
fi

# ---------- 2. Auth ----------
bold "2/5  Sign in to GitHub"
if gh auth status >/dev/null 2>&1; then
  ok "already signed in as $(gh api user --jq .login 2>/dev/null || echo 'unknown')"
else
  info "A browser window will open. Approve there — nothing is typed in this terminal."
  gh auth login --hostname github.com --git-protocol https --web
  ok "signed in as $(gh api user --jq .login)"
fi
GH_USER="$(gh api user --jq .login)"

# ---------- 3. Repo + push ----------
bold "3/5  Repository"
[ -d .git ] || { git init -q; info "initialised a local git repo"; }
git checkout -q -B main

cat > .gitignore <<'EOF'
.DS_Store
Thumbs.db
EOF

git add -A
git commit -qm "Team Howe commission dashboard" 2>/dev/null || info "nothing new to commit"

if gh repo view "$GH_USER/$REPO_NAME" >/dev/null 2>&1; then
  ok "repo $GH_USER/$REPO_NAME already exists"
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$GH_USER/$REPO_NAME.git"
  git push -q -u origin main --force-with-lease
  ok "pushed"
else
  gh repo create "$REPO_NAME" --"$VISIBILITY" --source=. --remote=origin --push
  ok "created $GH_USER/$REPO_NAME and pushed"
fi

# ---------- 4. Pages ----------
bold "4/5  GitHub Pages"
if gh api "repos/$GH_USER/$REPO_NAME/pages" >/dev/null 2>&1; then
  ok "Pages already enabled"
else
  gh api -X POST "repos/$GH_USER/$REPO_NAME/pages" \
    -f "source[branch]=main" -f "source[path]=/" >/dev/null 2>&1 \
    && ok "Pages enabled" \
    || warn "Could not enable Pages automatically — do it once by hand: Settings → Pages → Deploy from a branch → main → / (root)"
fi

SITE_URL="$(gh api "repos/$GH_USER/$REPO_NAME/pages" --jq .html_url 2>/dev/null || echo "https://$GH_USER.github.io/$REPO_NAME/")"

# ---------- 5. Supabase (optional) ----------
bold "5/5  Supabase (optional — press Enter to skip)"
echo
info "Open your project on supabase.com in a browser, then:"
echo
info "  Project URL     Easiest: copy the address bar itself, the whole thing —"
info "                  https://supabase.com/dashboard/project/....  I'll convert it."
info "                  (A plain https://xxxx.supabase.co works too.)"
echo
info "  Publishable key  Settings ▸ API Keys.  Starts with  sb_publishable_"
echo
info "These are two different values. The publishable key is meant to be public;"
info "never paste a secret key here. Press Enter at the first prompt to skip."
echo

# Accept anything that identifies the project and normalise it ourselves:
#   https://abcdefgh.supabase.co                          → as-is
#   https://supabase.com/dashboard/project/abcdefgh/...   → derive it
#   abcdefgh                                              → derive it
# Anything else gets a specific explanation rather than a generic retry.
NORMALISED=""
normalise_url() {
  local v="${1%/}" rest ref
  NORMALISED=""
  case "$v" in
    https://*.supabase.co|https://*.supabase.in)
      NORMALISED="$v"; return 0 ;;
    https://supabase.com/dashboard/project/*|http://supabase.com/dashboard/project/*)
      rest="${v#*://supabase.com/dashboard/project/}"
      ref="${rest%%/*}"
      [ -n "$ref" ] && { NORMALISED="https://${ref}.supabase.co"; return 0; }
      warn "Couldn't find the project id in that dashboard link."; return 1 ;;
    *github.io*|*github.com*)
      warn "That's your GitHub site — nothing to do with Supabase."
      warn "The one I need is on supabase.com, in the SAME browser tab where your project is open."
      return 1 ;;
    sb_publishable_*|sb_secret_*|eyJ*)
      warn "That's an API key, not the URL. The key goes in the NEXT question."; return 1 ;;
    http://*|https://*)
      warn "Not a Supabase address. Expected https://<project-id>.supabase.co"; return 1 ;;
    '') return 1 ;;
    *)
      case "$v" in
        *[!a-zA-Z0-9]*) warn "Expected https://<project-id>.supabase.co, or just the project id."; return 1 ;;
        *) if [ ${#v} -ge 15 ]; then NORMALISED="https://${v}.supabase.co"; return 0; fi
           warn "That looks too short to be a project id."; return 1 ;;
      esac ;;
  esac
  return 1
}

SB_URL=""; SB_KEY=""
for _ in 1 2 3 4; do
  read -r -p "  Project URL      : " REPLY_URL || REPLY_URL=""
  [ -z "$REPLY_URL" ] && { SB_URL=""; break; }    # empty = skip Supabase entirely
  if normalise_url "$REPLY_URL"; then
    SB_URL="$NORMALISED"
    [ "$SB_URL" != "${REPLY_URL%/}" ] && ok "read that as  $SB_URL"
    break
  fi
  SB_URL=""
done

if [ -n "$SB_URL" ]; then
  for _ in 1 2 3; do
    read -r -p "  Publishable key  : " SB_KEY || SB_KEY=""
    [ -z "$SB_KEY" ] && break
    case "$SB_KEY" in
      sb_secret_*|*service_role*)
        die "That is a SECRET key. Copy the publishable one instead — a secret key must never go in a public repo." ;;
      https://*)
        warn "That's the project URL again, not the key. The key starts with sb_publishable_" ; SB_KEY="" ; continue ;;
      sb_publishable_*|eyJ*) break ;;
      *)
        warn "Expected a key starting with sb_publishable_ (or a legacy key starting eyJ)" ; SB_KEY="" ;;
    esac
  done
fi

if [ -n "${SB_URL:-}" ] && [ -n "${SB_KEY:-}" ]; then
  [ "$SB_URL" = "$SB_KEY" ] && die "You pasted the same value twice. The URL and the key are different things, on different pages."
  python3 - "$SB_URL" "$SB_KEY" <<'PY'
import re, sys, pathlib
url, key = sys.argv[1].strip().rstrip('/'), sys.argv[2].strip()
p = pathlib.Path('js/config.js'); s = p.read_text()
s = re.sub(r"(SUPABASE_URL:\s*)'[^']*'",      lambda m: m.group(1) + repr(url).replace('"', "'"), s, count=1)
s = re.sub(r"(SUPABASE_ANON_KEY:\s*)'[^']*'", lambda m: m.group(1) + repr(key).replace('"', "'"), s, count=1)
p.write_text(s)
print("  \033[32m✓\033[0m js/config.js updated")
PY
  git add js/config.js
  git commit -qm "Connect Supabase" || true
  git push -q origin main
  ok "pushed — the dashboard will run in Live mode"
  echo
  warn "Don't forget to run supabase/schema.sql in the Supabase SQL Editor,"
  warn "or the site will fall back to local mode."
else
  info "skipped — the site runs in 'This device' mode until you add these"
  info "later: edit js/config.js, then  git add -A && git commit -m sb && git push"
fi

# ---------- done ----------
echo
bold "Done."
echo
printf '  Your site:  \033[4m%s\033[0m\n' "$SITE_URL"
printf '  Repo:       https://github.com/%s/%s\n' "$GH_USER" "$REPO_NAME"
echo
info "First publish takes about a minute. If you get a 404, wait and refresh."
echo
