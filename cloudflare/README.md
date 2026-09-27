# Link previews (share.courtsidebase.com)

`share-worker.js` makes a shared CourtSide link show the post's picture,
caption and author when it is pasted into iMessage, WhatsApp, Instagram DMs,
Slack or X. People who tap the link go straight on to the post in the app.

It runs on Cloudflare, which already looks after the courtsidebase.com
domain. Cloudflare's free plan covers it (100,000 link opens a day); no card
is needed.

## One-time setup (about five minutes)

1. Go to https://dash.cloudflare.com and sign in.
2. In the left sidebar open **Compute (Workers)** → **Workers & Pages**, then
   click **Create**. Choose **Start with Hello World!**, name it
   `courtside-share`, and click **Deploy**.
3. Click **Edit code**. In the editor, select everything in `worker.js`,
   delete it, and paste in the whole of `share-worker.js`. Click **Deploy**.
4. Go back to the worker's page and open **Settings** → **Domains & Routes** →
   **+ Add** → **Custom domain**. Type `share.courtsidebase.com` and click
   **Add domain**. Cloudflare sets up the address itself; give it a minute or two.
5. Tell Claude. It checks the address answers correctly, then switches the
   app's share links over (`PREVIEWS_LIVE` in `src/lib/shareLink.ts`).

## Changing it later

Paste the new `share-worker.js` over the old one in the same editor and click
**Deploy**. Nothing else changes.
