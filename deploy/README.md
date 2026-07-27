# Shipping WAI Gramophone to waiwai.is/relativity

`./deploy/deploy-relativity.sh` builds the app and ships it. It takes about
twenty seconds and never touches nginx.

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

## Rollback

    ssh wai-web-prod
    ls -1dt /var/www/relativity/releases/*/          # newest first; [2] is the previous
    ln -sfn <that one> /var/www/relativity/.t && mv -Tf /var/www/relativity/.t /var/www/relativity/current

Five releases are kept. No reload needed.

## What is still wrong, and is not this script's job

`apps/web/public/relativity` is still committed in the wai-web repo. It is now
dead weight — nginx shadows it — but it should be deleted there in its own PR,
so that nobody is ever again misled into thinking that is where the app lives.

## Verifying by hand

    curl -sL https://waiwai.is/relativity | grep -o 'assets/index-[^"]*\.js'   # bundle hash
    curl -sI https://waiwai.is/relativity | grep -i cache-control              # must be no-cache
    curl -sSL -o /dev/null -w '%{url_effective}\n' 'https://waiwai.is/relativity?s=abc'  # ?s= must survive
