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
4. **Authentication → Users → Add user → Create new user**: enter your email
   and a password, and tick **Auto Confirm User**. This is the only account
   the app will ever have — there is no sign-up form, on purpose.
5. **Authentication → Sign In / Providers → Email**: turn **off** "Allow new
   users to sign up". Without this, anyone who finds the deployed URL could
   create accounts in your project.
6. **Project Settings → API**: copy the **Project URL** and the **anon/public**
   key (newer dashboards call it the *publishable* key, `sb_publishable_…`).
   Never use the `service_role` / secret key — it bypasses row-level security.

There is nothing to do under **Authentication → Emails**. The app does not
send any email.

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

Email and password. One account — the multi-profile feature lives *inside*
that account and is not multi-user.

The form is marked up so **iCloud Keychain** offers to save the password the
first time and fills it thereafter, which makes signing in two taps.

### Why not the magic link the spec asked for

The spec called for magic-link auth and no passwords. That was changed
deliberately, because of how this app actually gets used — once or twice a
month:

- **iOS deletes a website's stored data after seven days without a visit.**
  At monthly usage, a magic link meant a full email round trip on *every*
  visit: open app, type email, wait for mail, tap link.
- **Supabase locks its email templates** on the free tier unless you connect
  custom SMTP, so its emails could not carry a six-digit code — and a link
  tapped in Mail opens Safari, which has separate storage from an installed
  home-screen app. That combination made installing the app impossible.

A password removes both problems at once. Keychain autofills it, and because
an installed home-screen app is exempt from the seven-day rule, the session
now persists indefinitely.

### Forgotten password

There is no reset flow in the app, because there is no email sending. Set a
new one in **Supabase → Authentication → Users → ⋯ → Reset password**, or
delete the user and create it again.

## On the phone

Open the deployed `https://….pages.dev` address in **Safari**, then
**Share → Add to Home Screen**.

That gives you a full-screen app with its own icon, no browser chrome, and —
the part that matters here — **exemption from Apple's seven-day storage
wipe**. Signed in once, you stay signed in, however rarely you open it.

Safari is required for installing; Chrome on iOS cannot do it. Once installed
it runs on its own.

The app shell is cached, so it opens instantly and works offline. Data always
needs the network: there are no offline writes in v1, so there is no sync
conflict to resolve.

## Keeping Supabase awake

Supabase pauses a free project after about a week with no activity. Unpausing
is one button in their dashboard and **loses no data**, but for an app opened
once a month it would mean arriving to a sleeping database every single time.

[`.github/workflows/keepalive.yml`](.github/workflows/keepalive.yml) prevents
that: a GitHub Action pings the REST API twice a week. Add two repository
secrets under **Settings → Secrets and variables → Actions**:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

You can trigger it by hand from the **Actions** tab to check it works — a
green run means HTTP 200 and an awake project.

GitHub disables scheduled workflows after 60 days with no commits to the
repository. It emails you first, and re-enabling is one button.

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
