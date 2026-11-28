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

# Straight into the app (courtsidebase.com links, Nov 27)

What it is for: a link like `courtsidebase.com/?ref=ig` today stops on a small
"Opening CourtSide" page (`public/waitlist.html`) before the app, about half a
second. This rule sends it straight to the app instead; the app itself counts
the visit for Admin → Links (`readLanding` in `src/features/guest/campaign.ts`).
Ship the app change first (it does nothing until this rule exists), then:

1. https://dash.cloudflare.com → the `courtsidebase.com` site → **Rules** →
   **Redirect Rules**. Open the rule that sends courtsidebase.com to the
   waitlist page (or **Create rule** if there is none).
2. **When incoming requests match** → **Edit expression**, paste:
   `(http.host in {"courtsidebase.com" "www.courtsidebase.com"} and http.request.uri.path eq "/" and not http.request.uri.query contains "go=app")`
3. **Then** → Type **Dynamic**, expression:
   `concat("https://app.courtsidebase.com/?", http.request.uri.query, "&from=site")`
   Status code **302**. Leave **Preserve query string** off (the expression carries it).
4. **Deploy**. `?go=app` links keep going through the waitlist page (it sends
   them on to the iPhone app), so the old rule stays for those: put it after this one.
