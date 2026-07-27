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
# is atomic. Nothing here touches the Next.js app, the API, or any other site on
# the box, and nothing here touches /etc/nginx — config changes are a separate,
# deliberate, human act (see deploy/README.md).
#
# Every check after the flip rolls back on its own. A release that cannot be
# verified through the public URL does not get to stay live.
#
set -euo pipefail

HOST="${RELATIVITY_HOST:-wai-web-prod}"
BASE="/var/www/relativity"
PUB="https://waiwai.is/relativity"
KEEP=5
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

FLIPPED=0
PREV=""

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
warn() { printf '\033[33mwarning: %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[31mrefused: %s\033[0m\n' "$*" >&2; exit 1; }

# A verification failure after the flip is not a message, it is a rollback.
fail() {
  printf '\033[31mFAILED: %s\033[0m\n' "$*" >&2
  if [ "$FLIPPED" = 1 ] && [ -n "$PREV" ]; then
    printf 'rolling back to %s\n' "$PREV" >&2
    ssh "$HOST" "ln -sfn '$PREV' '$BASE/.current.tmp' && mv -Tf '$BASE/.current.tmp' '$BASE/current'"
    printf 'rolled back; live is now: %s\n' \
      "$(curl -fsS --max-time 20 "$PUB/RELEASE.json" || echo unknown)" >&2
  fi
  exit 1
}

# ---------------------------------------------------------------- guard rails
[ "$(id -u)" -ne 0 ] || die "do not run this as root; it needs no local privileges"
[ -d "$REPO_ROOT/app" ] || die "run this from the relativity-gramophone checkout"

git -C "$REPO_ROOT" diff --quiet -- app \
  || die "app/ has uncommitted changes — a release name must identify exactly one tree"
git -C "$REPO_ROOT" diff --cached --quiet -- app \
  || die "app/ has staged changes — commit them first"
[ -z "$(git -C "$REPO_ROOT" ls-files --others --exclude-standard -- app)" ] \
  || die "app/ has untracked files — commit or ignore them first"

SHA="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
BRANCH="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)"
[ "$BRANCH" = "main" ] || [ "${RELATIVITY_ALLOW_BRANCH:-}" = "1" ] \
  || die "on branch '$BRANCH', not main (set RELATIVITY_ALLOW_BRANCH=1 to override)"

git -C "$REPO_ROOT" fetch -q origin "$BRANCH" \
  || die "cannot reach origin — refusing to ship a commit nobody else can see"
git -C "$REPO_ROOT" merge-base --is-ancestor HEAD "origin/$BRANCH" \
  || die "HEAD is not pushed — push first, so what is live is also what is on origin"

ssh -o ConnectTimeout=15 -o BatchMode=yes "$HOST" true || die "cannot reach $HOST over ssh"

# Without the include, the files upload, the symlink flips, every check that
# reads the public URL still passes against the OLD copy, and the deploy reports
# success having changed nothing. That is the exact failure this script exists
# to end, so it is asserted before anything is built.
ssh "$HOST" 'nginx -T 2>/dev/null | grep -q "snippets/relativity.conf"' \
  || die "nginx does not include snippets/relativity.conf — install it first (deploy/README.md)"

# open_file_cache would hold the resolved path and the flip would not land.
if ssh "$HOST" 'nginx -T 2>/dev/null | grep -qE "^[[:space:]]*open_file_cache[[:space:]]+[^o]"'; then
  die "open_file_cache is enabled — the symlink flip would not be picked up"
fi

# The include glob is conf.d/*.conf. A second file there is a duplicate server
# block that `nginx -t` accepts, and the next reload — which belongs to another
# product's deploy script — is the one that dies.
ssh "$HOST" 'test "$(ls /etc/nginx/conf.d/*.conf | wc -l)" -eq 1' \
  || die "more than one .conf in /etc/nginx/conf.d — fix that before deploying"

if ! ssh "$HOST" 'cat /etc/nginx/snippets/relativity.conf' \
     | diff -q - "$REPO_ROOT/deploy/nginx-relativity.conf" >/dev/null; then
  warn "the live nginx snippet differs from deploy/nginx-relativity.conf:"
  ssh "$HOST" 'cat /etc/nginx/snippets/relativity.conf' \
    | diff - "$REPO_ROOT/deploy/nginx-relativity.conf" || true
fi

# --------------------------------------------------------------------- build
say "Building $SHA"
npm --prefix "$REPO_ROOT/app" ci   || die "npm ci failed — fix the lockfile, do not paper over it"
npm --prefix "$REPO_ROOT/app" test || die "tests fail — nothing ships red"
rm -rf "$REPO_ROOT/app/dist"
npm --prefix "$REPO_ROOT/app" run build || die "build failed"
[ -f "$REPO_ROOT/app/dist/index.html" ] || die "build produced no index.html"

BUNDLE="$(grep -o 'assets/index-[^"]*\.js'  "$REPO_ROOT/app/dist/index.html" | head -1)"
CSS="$(   grep -o 'assets/index-[^"]*\.css' "$REPO_ROOT/app/dist/index.html" | head -1)"
[ -n "$BUNDLE" ] && [ -n "$CSS" ] || die "cannot find the asset names in the built index.html"

RELEASE="$SHA-$(date -u +%Y%m%dT%H%M%SZ)"
REL_DIR="$BASE/releases/$RELEASE"

# So "which build is live?" is one request, not a hash comparison.
printf '{"release":"%s","sha":"%s","bundle":"%s","by":"%s"}\n' \
  "$RELEASE" "$(git -C "$REPO_ROOT" rev-parse HEAD)" "$BUNDLE" "$(id -un)@$(hostname -s)" \
  > "$REPO_ROOT/app/dist/RELEASE.json"
( cd "$REPO_ROOT/app/dist" \
  && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 shasum -a 256 > SHA256SUMS )
say "Built $BUNDLE  ($RELEASE)"

# ------------------------------------------------------------------- upload
PREV="$(ssh "$HOST" "readlink -f '$BASE/current' 2>/dev/null || true")"
ssh "$HOST" "test ! -e '$REL_DIR'" || die "release $RELEASE already exists — refusing to overwrite"
ssh "$HOST" "mkdir -p '$REL_DIR'"

say "Uploading to $HOST:$REL_DIR"
# Deliberately NOT `-a`: it implies -o -g -p, which over an ssh session landing
# as root stamps this laptop's uid and mode bits onto a shared production box —
# one 0600 file and the world gets a 403. Apple's openrsync rejects --chmod
# outright, so ownership and modes are normalised on the far side instead.
# No --delete either: the destination did not exist a second ago, and --delete
# aimed one path too high would erase a live product tree.
rsync -rlt -z --no-owner --no-group "$REPO_ROOT/app/dist/" "$HOST:$REL_DIR/"

say "Normalising and verifying the uploaded bytes"
ssh "$HOST" bash -euo pipefail -s <<REMOTE || die "the uploaded release did not verify — nothing was flipped"
  test -f '$REL_DIR/index.html'
  test -d '$REL_DIR/assets'
  test ! -e '$REL_DIR/dist'            # a missing trailing slash on the rsync source
  chown -R root:root '$REL_DIR'
  find '$REL_DIR' -type d -exec chmod 755 {} +
  find '$REL_DIR' -type f -exec chmod 644 {} +
  cd '$REL_DIR' && sha256sum -c --quiet SHA256SUMS
REMOTE

# --------------------------------------------------------------- atomic flip
# `ln -sfn` alone is unlink()+symlink(), with a window where `current` does not
# exist at all. tmp-then-`mv -T` is a single rename(2) inside one directory.
# No nginx reload: open_file_cache is off, so the flip lands on the next request
# — which is what makes this deploy incapable of disturbing the other products.
say "Switching current -> $RELEASE"
ssh "$HOST" "ln -sfn '$REL_DIR' '$BASE/.current.tmp' && mv -Tf '$BASE/.current.tmp' '$BASE/current'"
FLIPPED=1

# -------------------------------------------------------------------- verify
say "Verifying through the public URL"
sleep 2
pub_sha() { curl -fsS --max-time 120 "$PUB/$1" | shasum -a 256 | cut -d' ' -f1; }

curl -fsS -o /dev/null -D - --max-time 20 "$PUB" | grep -qi '^via:.*caddy' \
  || warn "no \`via: Caddy\` — did this test the origin instead of the edge?"

curl -fsS --max-time 20 "$PUB/RELEASE.json" | grep -q "\"release\":\"$RELEASE\"" \
  || fail "the public RELEASE.json is not $RELEASE"

for f in "index.html" "$BUNDLE" "$CSS" "RELEASE.json"; do
  [ "$(pub_sha "$f")" = "$(shasum -a 256 "$REPO_ROOT/app/dist/$f" | cut -d' ' -f1)" ] \
    || fail "$PUB/$f is not byte-identical to the local build"
done

# Every shared universe is a link of the form /relativity?s=<id>. If anything
# ever puts a redirect in front of this path, the query string is the first
# thing to be silently dropped — and the visitor gets a blank sky, not an error.
# The origin listens on :8080 behind a TLS-terminating edge, so a redirect nginx
# builds itself is also unroutable; both are caught here.
EFFECTIVE="$(curl -sSL -o /dev/null --max-time 20 -w '%{url_effective}' "$PUB?s=deploycheck")"
case "$EFFECTIVE" in
  *:8080*)         fail "the origin port leaked into a redirect: $EFFECTIVE" ;;
  *s=deploycheck*) ;;
  *)               fail "a share link lost its query string (landed on $EFFECTIVE)" ;;
esac

# A missing hashed asset must 404 cleanly. If it ever answers 200 text/html the
# SPA fallback has swallowed assets/, and a module script dies on its MIME type.
MISS="$(curl -sS -o /dev/null --max-time 20 -w '%{http_code}' "$PUB/assets/__does-not-exist__.js")"
[ "$MISS" = 404 ] || fail "a missing asset answered $MISS, not 404"

# 404 for an unknown id is the healthy answer; a 502 or a 000 is not.
API="$(curl -sS -o /dev/null --max-time 20 -w '%{http_code}' \
  https://waiwai.is/api/gramophone/scores/__probe__)"
case "$API" in 2*|404) ;; *) fail "the score API answered $API" ;; esac

# This box serves five products. Prove none of them moved.
for h in waiwai.is mikwiseman.com trinitymonsters.com reverse-ai.waiwai.is history.waiwai.is; do
  C="$(curl -sS -o /dev/null --max-time 20 -w '%{http_code}' "https://$h/")"
  printf '  %-24s %s\n' "$h" "$C"
  case "$C" in 2*|3*) ;; *) fail "$h answered $C" ;; esac
done

# --------------------------------------------------------------------- prune
# After verification, never before — and never the release `current` points at,
# which is not always the newest one once somebody has rolled back.
ssh "$HOST" bash -euo pipefail -s <<REMOTE
  live="\$(readlink -f '$BASE/current')"
  ls -1dt '$BASE'/releases/*/ | tail -n +$((KEEP + 1)) | while read -r d; do
    [ "\$(readlink -f "\$d")" = "\$live" ] || rm -rf -- "\$d"
  done
REMOTE

say "OK — $RELEASE is live, byte-identical, share links intact, score API $API"
echo "live: $(curl -fsS --max-time 20 "$PUB/RELEASE.json")"
echo "rollback: ssh $HOST, then flip $BASE/current at an older release (deploy/README.md)"
