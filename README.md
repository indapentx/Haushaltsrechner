# Haushaltsrechner

A personal monthly budget planner. One account, two or more named profiles,
syncs between iPhone and laptop, runs entirely on free tiers.

The budget cycle runs **the 25th to the 24th**, not the calendar month. Every
total, reset and "this month" label follows that cycle.

The interface is strictly monochrome — black, white and greys, every hex value
with R = G = B. Typography, weight, spacing and hairline rules carry the whole
hierarchy. That constraint is the design.

---

## Stack

| Layer | Choice |
|---|---|
| Frontend | React + TypeScript, built with Vite |
| Styling | Tailwind v4 with a custom monochrome token set |
| Database + auth | Supabase (free tier) |
| Hosting | Cloudflare Pages (free tier) |
| Phone | PWA — Add to Home Screen, no Apple Developer account needed |

---

## First-time setup

### 1. Supabase

1. Create a project. Region: **Central EU (Frankfurt)** if you are in Istanbul.
2. **SQL Editor → New query**, paste all of [`supabase/schema.sql`](supabase/schema.sql)
   and run it. It creates the three tables, the row-level security policies and
   the `ensure_cycle` rollover function. It is safe to re-run.
3. **Authentication → URL Configuration**: set Site URL to
   `http://localhost:5173` and add `http://localhost:5173/**` under Redirect
   URLs. Add the deployed address here too once it exists.
4. **Project Settings → API**: copy the **Project URL** and the **anon/public**
   key (newer dashboards call it the *publishable* key, `sb_publishable_…`).
   Never use the `service_role` / secret key — it bypasses row-level security.

There is nothing to do under **Authentication → Emails**. Supabase locks the
email templates on the free tier unless you connect custom SMTP, and its
default template sends a sign-in link and nothing else. That is what the app
is built around.

### 2. Local

```bash
npm install
cp .env.example .env.local   # then paste your two values in
npm run dev
```

The app runs at `http://localhost:5173`. Without the two environment
variables the sign-in screen says so plainly rather than failing silently.

---

## Signing in

Email only. No passwords, no OAuth providers. One account — the multi-profile
feature lives *inside* that account and is not multi-user.

Enter your email, tap **Send link**, then open the link from the email on the
same device. You land back in the app signed in, and the session persists and
refreshes itself from then on. In practice you sign in once per device.

Supabase's built-in email sender is rate-limited to a few messages an hour on
the free tier. Fine for something you do this rarely; rapid resends will be
refused.

### Why there is no six-digit code

A link tapped in iOS Mail opens in **Safari**. If you had installed the app to
the home screen, it would have its own storage, so a session created in Safari
would leave the installed app still signed out. A six-digit code typed straight
into the app is the usual fix for that.

Supabase will not send one on the free tier: editing the email template
requires custom SMTP, and the default template contains only the link. Rather
than add a mail provider for a once-per-device action, this app runs in Safari
on the phone — where the link works perfectly.

**If you ever connect custom SMTP**, the template unlocks. Add this to the
Magic Link body:

```html
<p>Or enter this code: <strong>{{ .Token }}</strong></p>
```

and restore the code field in `src/screens/SignIn.tsx` — a text input feeding
`supabase.auth.verifyOtp({ email, token, type: 'email' })`. That is the whole
change.

## On the phone

Open the deployed address in **Safari** and use it as a normal tab. Tapping the
sign-in link from your email works, and the session sticks.

### Adding it to the home screen

The manifest, icons and service worker are all in place, so **Share → Add to
Home Screen** in Safari does work and gives you a full-screen app with its own
icon. One catch to know about before you do:

An installed home-screen app has **separate storage from Safari**, so signing
in inside it needs the six-digit code that Supabase will not send without
custom SMTP. You would be installed but unable to sign in.

So: install it only after setting up SMTP and restoring the code field, as
described under [Signing in](#signing-in).

### One thing to know about Safari

iOS deletes a website's stored data after **seven days without visiting it**.
If you go a full week without opening the app, you will be signed out and need
a fresh link. Opening it even once a week avoids that entirely — and Supabase
pauses an idle free project on roughly the same schedule anyway.

Installed home-screen apps are exempt from that seven-day rule. It is the one
real advantage of installing, if you ever set up SMTP.

## Supabase pauses free projects

After about a week with no activity, Supabase pauses a free project and the app
will fail to load data. Unpausing is one button in the Supabase dashboard and
**loses no data**. Normal use of this app keeps it awake.

---

## Changing the cycle anchor day

The 25th is a single constant. In [`src/lib/cycle.ts`](src/lib/cycle.ts):

```ts
export const ANCHOR_DAY = 25;
```

Change it and every boundary, label and rollover follows. Days above 28 would
need clamping logic for February, which is deliberately not implemented — the
25th, like any day up to the 28th, exists in every month.

Existing cycles keep their original `start_date`; the change applies from the
next rollover.

---

## Development

```bash
npm run dev          # dev server
npm test             # unit tests under three timezones, plus the monochrome check
npm run build        # monochrome check → typecheck → production build
npm run icons        # regenerate the PWA icons from the geometric mark
```

### The monochrome check

`npm run build` runs [`scripts/check-monochrome.mjs`](scripts/check-monochrome.mjs)
first and **fails the build** on any hue found in `src/`, `scripts/`, `public/`
or `index.html`: a hex value whose channels are not equal, a saturated `rgb()`
or `hsl()`, a Tailwind colour utility such as `text-red-500`, or an emoji.

Tailwind's default palette is wiped in `src/index.css` (`--color-*: initial`),
so a hue utility generates no CSS — but Tailwind ignores unknown utilities
silently rather than complaining, which is why the check exists.

### The cycle tests

`npm test` runs the whole suite three times, under `Europe/Istanbul`,
`Pacific/Kiritimati` (UTC+14) and `America/Anchorage` (UTC−9). Cycle boundaries
are computed in local time and stored as bare `YYYY-MM-DD` strings; getting
that wrong makes the app roll over at 3am on the 24th for anyone east of UTC.

---

## Deploying to Cloudflare Pages

1. Push this repository to GitHub.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**,
   and pick the repository.
3. Build settings:
   - **Framework preset:** None
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. **Environment variables** — add both, or the deployed app cannot reach the
   database:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy, then go back to **Supabase → Authentication → URL Configuration**
   and add the new `https://….pages.dev` address to Site URL and Redirect URLs.
   Sign-in emails will not work until you do.

`public/_redirects` handles the SPA fallback and `public/_headers` sets cache
policy: hashed assets forever, the shell and service worker never.

---

## Is the anon key safe in the browser?

Yes — but only because row-level security is enabled on all three tables. The
key identifies the project, not you; the policies in `supabase/schema.sql`
restrict every row to `auth.uid()`. To confirm it works, sign out and try to
read `profiles` with the anon key: zero rows come back.

---

## How the data model works

Three tables: `profiles`, `cycles`, `items`. A cycle belongs to a profile and
is identified by its start date, always an anchor day. Items belong to a cycle.

**Rollover is lazy — there is no cron job.** On every app load and every profile
switch, the app asks the database for the cycle containing today. If it does
not exist, `ensure_cycle` creates it in a single transaction: every item from
the previous cycle is copied across with the same name, amount and order but
unticked, and the income carries forward as an editable starting value.

Doing this server-side in one function rather than client-side in four queries
means two devices opening the app on the 25th cannot half-copy the item list
between them. The `unique (profile_id, start_date)` constraint decides the
race; the loser simply reads the winner's cycle.

Every past cycle stays intact as history, reachable with the chevrons either
side of the cycle label.

---

## One thing worth knowing about the balance

**Ticking an item does not change the balance.** Entering an item with an
amount is what reduces it — the tick only records that it has been handed over.
`Still to pay` is the figure that moves when you tick.
