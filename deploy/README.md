# Shipping WAI Gramophone to waiwai.is/relativity

`./deploy/deploy-relativity.sh` builds the app and ships it. It takes about
twenty seconds, never touches nginx, and rolls itself back if any check after
the flip fails.

## Why this exists

The app used to live at `/var/www/waiuni/apps/web/public/relativity` — inside
another product's Next.js tree, tracked in *that* product's git. Two consequences,
both of which actually happened:

- it could only ship when that product shipped, and
- any checkout there restored an old build.

That is how a bundle from months ago stayed live at `waiwai.is/relativity`
through five rounds of visual work, while every deploy of this repo went green.

## What replaced it

    /var/www/relativity/releases/<sha>-<utc>/   one immutable directory per release
    /var/www/relativity/current -> releases/…   the live one
    /etc/nginx/snippets/relativity.conf         the routes (deploy/nginx-relativity.conf)

nginx's waiwai.is server block gains exactly one line: `include
/etc/nginx/snippets/relativity.conf;`. Nothing else on that box — the Next.js
site, the API, trinitymonsters.com, reverse-ai, history — is involved.

A deploy is an rsync into a new directory and an atomic symlink flip. Because
`open_file_cache` is off on that box, the flip takes effect on the next request
with no reload, so a deploy cannot disturb any other site even in principle.

Each release carries a `RELEASE.json`, so *which build is live* is one request
rather than a hash comparison:

    curl -s https://waiwai.is/relativity/RELEASE.json

## Rollback

**The build is wrong** — about thirty seconds, no nginx involvement at all. This
is the one to reach for by default; it restores a known-good state.

    ssh wai-web-prod
    ls -1dt /var/www/relativity/releases/*/          # newest first; [2] is the previous
    ln -sfn <that one> /var/www/relativity/.t && mv -Tf /var/www/relativity/.t /var/www/relativity/current
    exit
    curl -s https://waiwai.is/relativity/RELEASE.json

Five releases are kept, and the one `current` points at is never pruned. No
reload needed.

**The snippet is wrong** (routes broken rather than content) — restore the file
and keep the include line:

    scp deploy/nginx-relativity.conf wai-web-prod:/etc/nginx/snippets/relativity.conf
    ssh wai-web-prod 'nginx -t && systemctl reload nginx && sleep 1 &&
      (journalctl -u nginx --since "1 min ago" --no-pager | grep -i emerg && echo REJECTED || echo reloaded)'

**Emergency: remove the route entirely** — note this is a *downgrade, not a
restore*. It re-exposes the months-stale copy still sitting in the waiuni tree,
which answers 200 and looks perfectly healthy, which is the worst failure
signature available. Order matters: the include line first, the file second — a
non-wildcard `include` of a missing file is a parse-time `[emerg]` that blocks
every later reload, including the one at the end of the waiuni deploy script.

    ssh wai-web-prod
    cp -a /etc/nginx/conf.d/wai-origin.conf /root/nginx-backups/wai-origin.conf.$(date -u +%Y%m%dT%H%M%SZ)
    sed -i '\#^\s*include /etc/nginx/snippets/relativity.conf;#d' /etc/nginx/conf.d/wai-origin.conf
    nginx -t && systemctl reload nginx && sleep 1
    journalctl -u nginx --since '1 min ago' --no-pager | grep -i emerg && echo REJECTED
    rm -f /etc/nginx/snippets/relativity.conf     # ONLY after the reload succeeded

## Must not be done on this box, and why

Each of these was measured, not assumed.

- **Never `systemctl restart nginx`.** `ExecStartPre=nginx -t -q` means a bad
  config leaves nginx *down*, and all five products go dark at once behind the
  edge. `reload` fails safe — the old workers keep serving. `restart` does not.
- **`systemctl reload nginx` exits 0 even when the master rejects the config.**
  Check `journalctl -u nginx --since '1 min ago' | grep -i emerg`, not `$?`.
- **Never leave an nginx backup in `/etc/nginx/conf.d/`.** The include glob is
  `*.conf`; a copy of `wai-origin.conf` there is a duplicate `log_format` — a
  hard `[emerg]`, reproduced. Backups live in `/root/nginx-backups/`.
- **Never a bare `return 30x /path;` in this server block.** TLS terminates at
  the edge and this origin listens on `10.77.0.2:8080`, so nginx emits
  `http://<host>:8080/…`, unroutable from the internet — *and* `return` never
  appends `$args`, so the query string vanishes, cached forever if it is a 301.
  (`/pitch` is broken in production today for exactly this reason.) If a
  redirect is ever genuinely needed, the only safe form is `absolute_redirect
  off;` **plus** `$is_args$args`, both, scoped to the location.
- **Never invert `/relativity` to `/relativity/`.** The Next.js app published a
  permanent 308 the other way; browsers cache 308 with unbounded freshness, and
  the pair is an `ERR_TOO_MANY_REDIRECTS` no server-side change can undo. The
  no-slash form is canonical and is served as a 200.
- **Never `alias` inside a regex location.** `nginx -t` passes; every asset 301s
  to itself-plus-slash and then 403s; the page is white. Prefix locations only.
- **Never add an `add_header` to a location without restating all three security
  headers** — `add_header` replaces the inherited set wholesale.
- **Never `rsync -a` to this box, and never `--delete` at a path shorter than the
  fresh release directory.** `-a` implies `-o -g -p` and stamps this laptop's uid
  and modes onto production; a misaimed `--delete` erases a live product tree,
  and there is no snapshot.
- **Never delete `/var/www/waiuni/apps/web/public/relativity` on the server.** It
  is git-tracked there; a `git pull` would restore it and leave that working tree
  dirty in the middle of someone else's deploy. Shadowed, it is harmless.
- **Never let this script reload nginx or touch `/etc/nginx`.** The repeatable
  path must need no root-shaped privilege on a five-product box.

## What is still wrong, and is not this script's job

- `apps/web/public/relativity` is still committed in the wai-web repo. It is dead
  weight — nginx shadows it — but it should be deleted there in its own PR, so
  nobody is ever again misled into thinking that is where the app lives.
- `.github/workflows/deploy-pages.yml` publishes this app to GitHub Pages on
  every push to main. That copy is a white page: `vite.config.mjs` sets
  `base: "/relativity/"`, Pages serves the project at `/relativity-gramophone/`,
  so `mikwiseman.github.io/relativity-gramophone/` answers 200 and every asset it
  names 404s. Sharing would be broken there regardless — `scoreStore.js` resolves
  the API against the page origin, which on Pages has no API.
- `/pitch` and `/pitch/` are broken in production right now, for the redirect
  reason above. Fixing it means editing another product's routes; separate change,
  separate backup, separate reload.

## Verifying by hand

    curl -s  https://waiwai.is/relativity/RELEASE.json                                  # what is live
    curl -sI https://waiwai.is/relativity | grep -i 'cache-control\|location'           # no-cache, no Location
    curl -sSL -o /dev/null -w '%{url_effective}\n' 'https://waiwai.is/relativity?s=abc' # ?s= must survive
    curl -s -o /dev/null -w '%{http_code}\n' https://waiwai.is/relativity/assets/nope.js # must be 404
