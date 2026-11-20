# Staging and handing over OG assets

Stage generated or edited files under `.grok/`, outside `public/`, so an interrupted write cannot leave a partial asset in a build. The staging file and its destination must be on the same filesystem. Use the project hand-over command for each final file:

```sh
node scripts/write-atomic.mjs .grok/og.jpg.tmp public/og.jpg
node scripts/write-atomic.mjs .grok/x-banner.jpg.tmp public/x-banner.jpg
node scripts/write-atomic.mjs .grok/site.json.tmp src/lib/og/site.json
```

Use only the commands relevant to the asset being produced. Do not stage temporary files inside `public/`; the build copies that directory verbatim. The script validates the staged path and performs the final rename atomically.
