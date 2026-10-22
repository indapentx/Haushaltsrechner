# Haushaltsrechner

A monthly budget planner for a household. Everyone who lives there gets
their own account and shares the same budgets. Items can be entered in
different currencies and the totals convert. Syncs between iPhone and
laptop, runs entirely on free tiers.

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
| Exchange rates | Frankfurter — European Central Bank data, no key, free |
| Hosting | GitHub Pages (free tier) |
| Phone | PWA — Add to Home Screen, no Apple Developer account needed |

---

## First-time setup

### 1. Supabase

1. Create a project. Region: **Central EU (Frankfurt)** if you are in Istanbul.
2. **SQL Editor → New query**: run the migrations in order,
   [`001_initial.sql`](supabase/migrations/001_initial.sql) then
   [`002_households_and_currencies.sql`](supabase/migrations/002_households_and_currencies.sql).
   Each is a single transaction and safe to re-run. Together they create the
   tables, the row-level security policies, the rollover function and the
   household sharing machinery.
3. **Authentication → URL Configuration**: set Site URL to
   `http://localhost:5173` and add `http://localhost:5173/**` under Redirect
   URLs. Add the deployed address here too once it exists.
4. **Authentication → Users → Add user → Create new user**: enter your email
   and a password, and tick **Auto Confirm User**. This is the only account
   the app will ever have — there is no sign-up form, on purpose.
5. **Authentication → Sign In / Providers → Email**: leave "Allow new users
   to sign up" **on**. The people you live with need to be able to create
   their own accounts. An account by itself grants nothing — see
   [Sharing a household](#sharing-a-household).
6. **Project Settings → API**: copy the **Project URL** and the **anon/public**
   key (newer dashboards call it the *publishable* key, `sb_publishable_…`).
   Never use the `service_role` / secret key — it bypasses row-level security.

There is nothing to do under **Authentication → Emails**. The app does not
send any email.

### 2. Upgrading a project that already has data

If the project predates households and currencies, it only needs
[`002_households_and_currencies.sql`](supabase/migrations/002_households_and_currencies.sql).
**Take a backup first** (Database → Backups). The whole migration is one
transaction, so a failure changes nothing, and it moves your existing data
rather than replacing it: your profiles become household-owned, you become
the household's owner, each cycle's income becomes the first entry in its new
income list, and every existing item is stamped with the profile's currency.

To rehearse it, change the final `commit;` to `rollback;` and run it. That
executes every statement against your real data and then throws the result
away. If the dry run succeeds, the real one will.

Note that the deployed app will not work against the old schema once the
migration lands, nor against the new schema before it. Migrate and deploy
close together.

### 3. Local

```bash
npm install
cp .env.example .env.local   # then paste your two values in
npm run dev
```

The app runs at `http://localhost:5173`. Without the two environment
variables the sign-in screen says so plainly rather than failing silently.

---

## Signing in

Email and password. Everyone in the household has their own account; see
[Sharing a household](#sharing-a-household).

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

## Sharing a household

A **household** owns the budgets. Any number of accounts can be members of
one, and every member can do everything: add items, change prices, tick
things off, edit income.

People join with a **code**, not an email invite, because this project sends
no email. The code looks like `K7M2-QX4P` and lives under **Settings → Join
code**.

1. They create an account on the sign-in screen.
2. They choose **Join with a code** and enter it.
3. They see the same budgets you do, immediately.

**Rotate the code** from Settings when you want to stop anyone else joining.
People who are already in stay in; the old code simply stops working.

Whoever created the household is its **owner**, and that is the only
asymmetry: owners rename the household, rotate the code and remove members.
Everything about the money itself is equal. Any member can leave on their
own, which removes their access and deletes nothing.

### Why open sign-up is safe here

Anyone who finds the URL can create an account, and that account can see
precisely nothing. Row-level security grants access through household
membership alone, and membership requires the code. A stranger who signs up
lands on the "create or join a household" screen and stops there.

## Currencies

Each item and each income entry carries its own currency. Rent in euros,
groceries in lira, one balance in whichever you want to read. The display
currency is switched from the control beside **BALANCE** on the Overview, and
the switch is instant — nothing is rewritten.

### Rates are frozen by date, not stored

An item records the **date** its cycle belongs to, and the conversion uses
the European Central Bank rate for that day. ECB rates for a past date never
change, so a closed cycle keeps the value it had at the time — permanently.

This matters more than it sounds. Converting at today's rate instead would
quietly rewrite your history: with the lira's movement against the euro, a
cycle from a year ago re-valued today would be meaningless.

Because the date does the freezing rather than a stored number, changing
which currency you read the totals in needs no migration and no recompute.

Rates come from [Frankfurter](https://frankfurter.dev) (ECB data, no API key,
free) and are cached in the `fx_rates` table — fetched once, then shared by
every member and every device. If a day cannot be fetched, the app falls back
to the most recent rate it has and labels the balance *approx* rather than
showing a confident wrong number.

Two things to know: the ECB publishes once per working day, so weekends carry
Friday's figures; and these are reference rates, so your bank's rate will
differ by a percent or two.

### Rollover and currencies

When a new cycle rolls over, each copied item keeps its currency but is
re-dated to the new cycle. Next month's rent converts at next month's rate,
which is what you actually pay.

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

## Deploying

The site is published to **GitHub Pages** by
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) on every push
to `main`. It runs the tests first, so a red test never reaches the live site.

### One-time setup

1. Push this repository to GitHub. It must be **public** — GitHub Pages only
   serves private repositories on paid plans.
2. **Settings → Pages → Source**: choose **GitHub Actions**.
3. **Settings → Secrets and variables → Actions → New repository secret**, add
   both:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
4. Push, or run the **Deploy** workflow by hand from the Actions tab.

The site lands at `https://<username>.github.io/Haushaltsrechner/`.

### About the public repository

Nothing sensitive is in it. `.env.local` is git-ignored, and the anon key
lives in Actions secrets. Your budget data is in Supabase behind the
row-level security policies — see
[Is the anon key safe in the browser?](#is-the-anon-key-safe-in-the-browser)

### About the subdirectory

GitHub Pages serves a project site from `/Haushaltsrechner/`, not the domain
root, so the production build bakes that prefix in via `base` in
`vite.config.ts`. Everything that could break on a subpath is handled:

- Fonts live in `src/fonts/`, not `public/`, so the bundler rewrites their
  URLs. Absolute `/fonts/…` would 404.
- The manifest's `start_url`, `scope` and icon paths are built from `base`,
  so the installed app opens the subdirectory rather than the top of the site.
- The service worker registers with the subdirectory as its scope.

If the repository is ever renamed, set `BASE_PATH` when building, or edit the
one constant at the top of `vite.config.ts`.

GitHub Pages ignores Cloudflare's `_headers` and `_redirects`, so there is no
cache-control tuning. It makes no practical difference at this size, and the
app has a single route, so it never needs an SPA fallback.

## Is the anon key safe in the browser?

Yes — but only because row-level security is enabled on every table. The key
identifies the project, not you; the policies grant access through household
membership alone. To confirm, query any table with the anon key while signed
out and you get zero rows, and an insert is refused with error 42501.

This is exercised automatically. `supabase/migration.test.ts` stands up a
real Postgres, puts two households' worth of data in it, and asserts that a
stranger sees nothing and cannot write anything.

---

## How the data model works

`households` own `profiles` (Ev, İşyeri), profiles own `cycles`, and a cycle
owns its `items` and `incomes`. `household_members` maps accounts to
households; `household_invites` holds the join code; `fx_rates` caches
exchange rates. A cycle is identified by its start date, always an anchor day.

Income is a list rather than a single number, so it can arrive in more than
one currency.

Access is decided by household membership. The check lives in a
`security definer` function on purpose: a policy on `household_members` that
queries `household_members` raises Postgres error 42P17, infinite recursion,
and that function is what breaks the loop.

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
