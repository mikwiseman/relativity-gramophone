#!/usr/bin/env bash
#
# Ship WAI Gramophone to https://waiwai.is/relativity.
#
# The app used to live inside another product's Next.js tree, at
# /var/www/waiuni/apps/web/public/relativity, tracked in that product's git. It
# could therefore only ever ship when that product shipped, and any checkout
# there restored an old build — which is exactly how a bundle from months ago
# stayed live through five rounds of visual work.
#
# This deploy is isolated instead: its own directory outside every product, its
# own nginx snippet, an immutable directory per release and a symlink flip that
# is atomic. Nothing here touches the Next.js app, the API, or any other site
# on the box. Rollback is one symlink.
#
set -euo pipefail

HOST="${RELATIVITY_HOST:-wai-web-prod}"
BASE="/var/www/relativity"
PUBLIC_URL="https://waiwai.is/relativity/"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\033[31mrefused: %s\033[0m\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- guard rails
[ -d "$REPO_ROOT/app" ] || die "run this from the relativity-gramophone checkout"

git -C "$REPO_ROOT" diff --quiet -- app \
  || die "app/ has uncommitted changes — ship what is committed, or commit first"
git -C "$REPO_ROOT" diff --cached --quiet -- app \
  || die "app/ has staged changes — commit them first"

SHA="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
BRANCH="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)"
[ "$BRANCH" = "main" ] || [ "${RELATIVITY_ALLOW_BRANCH:-}" = "1" ] \
  || die "on branch '$BRANCH', not main (set RELATIVITY_ALLOW_BRANCH=1 to override)"

if [ -n "$(git -C "$REPO_ROOT" rev-list --count "origin/$BRANCH..$BRANCH" 2>/dev/null || echo 0)" ] \
   && [ "$(git -C "$REPO_ROOT" rev-list --count "origin/$BRANCH..$BRANCH" 2>/dev/null || echo 0)" != "0" ]; then
  die "HEAD is not pushed — push first, so what is live is also what is on origin"
fi

ssh -o ConnectTimeout=15 -o BatchMode=yes "$HOST" true \
  || die "cannot reach $HOST over ssh"

# --------------------------------------------------------------------- build
say "Building $SHA"
npm --prefix "$REPO_ROOT/app" ci --silent >/dev/null 2>&1 || npm --prefix "$REPO_ROOT/app" install --silent
npm --prefix "$REPO_ROOT/app" test --silent >/dev/null || die "tests fail — nothing ships red"
rm -rf "$REPO_ROOT/app/dist"
npm --prefix "$REPO_ROOT/app" run build >/dev/null
[ -f "$REPO_ROOT/app/dist/index.html" ] || die "build produced no index.html"

BUNDLE="$(grep -o 'assets/index-[^\"]*\.js' "$REPO_ROOT/app/dist/index.html" | head -1)"
[ -n "$BUNDLE" ] || die "cannot find the bundle name in the built index.html"
say "Built $BUNDLE"

# ------------------------------------------------------------------- upload
RELEASE="$SHA-$(date -u +%Y%m%dT%H%M%SZ)"
say "Uploading to $HOST:$BASE/releases/$RELEASE"
ssh "$HOST" "mkdir -p '$BASE/releases/$RELEASE'"
# Deliberately NOT `-a`: that implies -o -g -p, which as root would stamp this
# laptop's uid and mode bits onto a shared production box — one 0600 file and
# www-data serves a 403. Ownership and modes are set on the far side instead.
rsync -rlzt --delete "$REPO_ROOT/app/dist/" "$HOST:$BASE/releases/$RELEASE/"

# --------------------------------------------------------------- atomic flip
# No nginx reload: open_file_cache is off on this box, so the symlink is
# resolved per request and the flip lands on the very next one. That is what
# makes this deploy incapable of disturbing the other sites on the box.
say "Switching current -> $RELEASE"
ssh "$HOST" bash -euo pipefail -s <<REMOTE
  test -f '$BASE/releases/$RELEASE/index.html' || { echo 'upload incomplete' >&2; exit 1; }
  find '$BASE/releases/$RELEASE' -type d -exec chmod 755 {} +
  find '$BASE/releases/$RELEASE' -type f -exec chmod 644 {} +
  chown -R root:root '$BASE/releases/$RELEASE'
  ln -sfn '$BASE/releases/$RELEASE' '$BASE/.current.tmp'
  mv -Tf '$BASE/.current.tmp' '$BASE/current'
  # Keep the five most recent releases; a rollback target must survive.
  ls -1dt '$BASE'/releases/*/ | tail -n +6 | xargs -r rm -rf
  echo "live: \$(readlink '$BASE/current')"
REMOTE

# -------------------------------------------------------------------- verify
say "Verifying $PUBLIC_URL"
sleep 2
SERVED="$(curl -fsSL "$PUBLIC_URL" | grep -o 'assets/index-[^\"]*\.js' | head -1 || true)"
[ "$SERVED" = "$BUNDLE" ] \
  || die "public URL serves '$SERVED', expected '$BUNDLE' — check the edge cache"

LOCAL_SUM="$(shasum -a 256 "$REPO_ROOT/app/dist/$BUNDLE" | cut -d' ' -f1)"
LIVE_SUM="$(curl -fsSL "https://waiwai.is/relativity/$BUNDLE" | shasum -a 256 | cut -d' ' -f1)"
[ "$LOCAL_SUM" = "$LIVE_SUM" ] \
  || die "the served bundle is not byte-identical to the local build"

# Every shared universe is a link of the form /relativity?s=<id>. If anything
# ever puts a redirect in front of this path, the query string is the first
# thing to be silently dropped — and the visitor gets a blank sky, not an error.
EFFECTIVE="$(curl -sSL -o /dev/null -w '%{url_effective}' 'https://waiwai.is/relativity?s=deploycheck')"
case "$EFFECTIVE" in
  *s=deploycheck*) ;;
  *) die "a share link lost its query string (landed on $EFFECTIVE) — roll back" ;;
esac

# 404 for an unknown id is the healthy answer; a 502 or a 000 is not.
API="$(curl -s -o /dev/null -w '%{http_code}' https://waiwai.is/api/gramophone/scores/__probe__)"
case "$API" in 2*|404) ;; *) die "the score API answered $API — roll back" ;; esac

say "OK — $BUNDLE is live, byte-identical, share links intact, score API $API"
echo "rollback: ssh $HOST \"ls -1dt $BASE/releases/*/ | sed -n 2p | xargs -I{} ln -sfn {} $BASE/.t && mv -Tf $BASE/.t $BASE/current\""
