# You are riffing on someone else's prototype

This repo is a copy of [`comp4020-crit7-dachi`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-dachi) at
`4c1f830a` --- dachi's crit agent's shipped prototype for `07-anu-system`.
The copy is yours; their repo is untouched and off limits.

**The brief is to take this somewhere it hasn't been.** Not to restart it, not
to polish it, and not to finish the agent's to-do list. Read how they directed
the agent, find the thing the prototype implies but doesn't do, and build
that. You have the session's half-hour, so pick something you can get live.

**Nothing here is marked.** No cutoff, no reflection, no `PROCESS.md` entry,
no crit sweep, no repo of your own on the line. That is the point --- the
interesting move is the one you wouldn't risk in your own graded repo.

**What you show at the share-back** is the live site plus
`git diff riff-start`. Push early and keep `main` green.

**The agent's own spec tests are `spec/booking.test.ts` and `spec/readme.test.ts`.** They encode the crit brief,
not yours, and they gate the deploy --- a red check means no live site to show
at the share-back. If your riff moves past that brief, change them or delete
them; keep `spec/invariants.test.ts` green, since that one is true of any good
site.

Everything below this line was written for that crit submission. The marks,
the cutoff, the private-repo phase, the weekly `start` skill and the
reflection are all done, and none of it governs what you do here. Read it for
how they worked, not for what you owe.

---

# Your harness

This file is yours, and it arrives empty on purpose. The rules you hold the
agent to are part of what gets marked, so they should be rules you decided on.

Nothing about the starter is recorded here. What the repo ships is explained
where it lives --- `fly.toml`, the `Dockerfile`, the CI workflow and
`spec/README.md` each say what they fix --- and the
[course website](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/)
publishes this deliverable's brief and spec. Read them before you plan or build;
what the agent needs to carry from any of it is your call.

## Scope

This models one slice of ANU crit-room booking, not a full room-booking
system: no accounts, no editing or cancelling a booking, no recurring
bookings, a fixed seeded room list. `README.md`'s "what I chose not to build"
is the reasoning; don't widen any of it without deciding to on purpose.

## Data

- Every timestamp in `bookings` is a bare `YYYY-MM-DDTHH:mm` string with no
  timezone, assumed to be Australia/Canberra local (every room is on this one
  campus). Don't convert this to UTC or attach an offset --- `nowLocal()` and
  the overlap check in `src/lib/db.ts` both depend on plain lexicographic
  string comparison, which only stays correct if every timestamp is in the
  same, timezone-less shape.
- `createBooking` revalidates the room id and time range server-side even
  though the form only ever submits values it populated itself --- keep it
  that way; never trust a client-submitted booking without rechecking it.
- `bookings.room_id`'s `FOREIGN KEY` to `rooms` in the schema is only
  enforced because `src/lib/db.ts` turns on `PRAGMA foreign_keys` --- SQLite
  ignores a declared foreign key by default. `createBooking` already checks
  room existence before insert, so this is a safety net for any future write
  path (a migration, a script, a second insert path), not something the
  current API depends on. Don't remove the pragma on the assumption nothing
  uses it.
- That revalidation is one layer; Astro's own same-origin check is another,
  underneath it. `POST /api/bookings` (and any other unsafe method) 403s with
  "Cross-site ... forbidden" unless the request's `Origin` header matches its
  own origin --- checked directly with `curl` against a local server, both
  with a forged `Origin` and with none at all. `spec/booking.test.ts`'s `post`
  helper sets a matching `Origin` header for exactly this reason (real browser
  form submissions carry one automatically; a bare `fetch`/`curl` doesn't).
  `GET /api/bookings` and `POST`/`PUT`/`DELETE` on `/api/events` all 404,
  Astro's default for a method with no exported handler. Neither needed a
  fix --- confirmed clean, not assumed, since the field-level revalidation
  above doesn't by itself say anything about the method/origin boundary.

## Resilience

- `POST /api/bookings` calls `request.formData()` unconditionally, which
  throws if the `Content-Type` isn't `multipart/form-data` or
  `application/x-www-form-urlencoded` --- a request shape the real form can
  never send, but a bare `curl`/`fetch` can (e.g. a JSON body). Checked
  directly against a locally-run production build (`NODE_ENV=production`,
  matching the Dockerfile): the unhandled exception surfaces as a 500 with
  an **empty** response body --- no stack trace, no path, nothing Astro's
  production error handling leaks to the client --- and the server keeps
  answering normally on the very next request, so this isn't a crash or an
  info-disclosure risk, just an unhandled-but-harmless exception. No fix
  needed; a confirmed pass, and the same "what could a request that isn't
  the form send" question this file already asks of individual fields and
  the HTTP method/origin boundary, applied to the request body's shape
  instead.
- Unlike the malformed-`Content-Type` case above, this one was a real bug,
  not a confirmed pass: `@astrojs/node` defaults `bodySizeLimit` to 1GB, and
  `astro.config.ts` didn't override it. The deployed machine has 256MB of
  RAM (`fly.toml`), and a real booking POST is a handful of short fields
  --- well under 1KB even at the 80-char pod/tutor cap in `src/lib/db.ts`
  --- so nothing stood between an oversized POST and the machine's actual
  memory ceiling. Confirmed live against a local production build: baseline
  RSS ~245MB, a single 5MB oversized `pod` field pushed it to ~279MB (the
  raw body gets copied several times over — buffered, decoded, and, for a
  rejected submission, echoed whole into the redirect's query string by
  `withInput` in `api/bookings.ts`) --- on a 256MB machine, a POST far
  smaller than the 1GB default limit would OOM it. Fixed by setting
  `bodySizeLimit: 64 * 1024` in `astro.config.ts`'s node adapter options: 64KB
  is generous headroom over any legitimate submission and far below anything
  that could threaten the machine. Verified both directions: a booking at the
  80-char field cap still succeeds, and a 100KB body gets a clean 500 (empty
  body, same harmless shape as the content-type case) with the server still
  answering the very next request. Regression test in
  `spec/booking.test.ts` ("rejects a request body far larger than any real
  booking could be"). General lesson: a framework's default resource limit
  is only safe if it's checked against the *actual* deployed machine's
  resources, not assumed --- a 1GB body limit reads as reasonable in the
  abstract and is wildly unsafe on a 256MB box.
- Whether `EventSource`'s native auto-reconnect (a real network blip, not
  just a graceful or forced-kill client disconnect) can leave a stale
  listener on `bus` was worth checking beyond the single- and multi-subscriber
  tests above. Read `astro`'s own Node adapter (`writeResponse` in
  `node_modules/astro/dist/core/app/node.js`) rather than trying to simulate
  a silent network death live: it wires `destination.on("close", () =>
  reader.cancel())` on the underlying `http.ServerResponse` unconditionally
  --- Node fires that `close` event for *any* connection teardown (a clean
  end, an RST from a killed process, or an eventual write failure once TCP
  gives up on an unreachable peer), not only the graceful case already
  confirmed live. So `GET /api/events`'s own `cancel()` (`bus.off` in
  `src/pages/api/events.ts`) fires on every path, bounded in the worst case
  (a truly silent black hole with no FIN/RST ever) only by the OS's own TCP
  retransmission timeout --- an inherent property of streaming-over-HTTP in
  general, not something this app's code could tighten further without
  adding its own liveness-tracking layer, which would be over-engineering for
  this scope. No fix needed, a confirmed pass from reading the framework's
  own cleanup wiring rather than re-running a live test that couldn't
  actually produce a silent network death in this sandbox anyway.
- The "does the app fight the browser's own input handling" family that
  found six real bugs across the crit-4/crit-5 static prototypes doesn't
  apply here: the only client-side script (`src/pages/index.astro`) is ten
  lines --- one `EventSource`, one `message` listener that prepends an
  `<li>` --- with no keydown, pointer, or touch handling at all. Confirmed
  by reading the script directly rather than assuming; there's nothing for
  that family of bug to attach to.

## Tests

`spec/booking.test.ts` is this project's own contract: persistence, the SSE
broadcast, and conflict rejection. Extend it when a new mechanic needs a
guarantee, rather than checking it by hand and moving on. `spec/invariants.
test.ts` and `spec/readme.test.ts` are the starter's, unchanged --- keep them
green.

`findConflict`'s overlap query (`existing.start < new.end && existing.end >
new.start`) is a single symmetric formula, so it's correct for containment,
envelopment, and exact-match overlap in every direction by construction --- no
need to test each shape separately. The one genuine edge it could still get
wrong is the half-open boundary itself: a booking that starts exactly when
another ends in the same room shouldn't conflict, and nothing in this file
asserted that until now. Checked by hand first (direct `curl` POSTs against a
local server: touching-before, touching-after, and a 1-minute genuine overlap
all resolved correctly), then locked in as a permanent regression test rather
than left as a one-off check, since an off-by-one on `</<=` or `>/>=` here is
exactly the kind of change a future edit could make silently.

The SSE test only ever has one subscriber. It proves `bus.emit` reaches *a*
listener, not that the real app broadcasts to every open tab at once. Checked
this directly instead of trusting the single-subscriber test to stand in for
it: a local server against a throwaway database, three separate real
`agent-browser` sessions, one submitting through the actual form while the
other two watched `#live` --- both received the booking, confirming
`EventEmitter`'s fan-out (`src/lib/events.ts`) really does reach every open
connection, not just the first. A clean result, not a bug; worth re-running
if the broadcast path is ever touched, since nothing in `spec/` would catch a
regression that only breaks the second listener.

`createBooking`'s five failure branches (`unknown-room`, `bad-format`,
`too-long`, `bad-range`, `conflict`) are a checklist, not just a type union:
four had a regression test and `unknown-room` didn't, found by grepping this
file for each reason string rather than re-reading the validation logic by
eye. Fixed by adding the missing case (a `roomId` outside the seeded 1-4
range). General lesson for this file specifically: whenever `db.ts` grows a
new member of `CreateBookingResult["reason"]`, grep this file for the string
before assuming its test coverage is already complete.

## Accessibility

`spec/invariants.test.ts`'s axe pass runs in jsdom, and even a real-browser
`agent-browser a11y` sweep only catches automatable rules. Neither can flag
"use of color" (WCAG 1.4.1) --- axe has no rule for it, since judging whether
a colour is the *only* signal for some state needs reading the markup, not
just measuring it. The schedule table's `tr.past` class was exactly that gap:
a finished booking was dimmed by colour alone, with nothing else in the row
saying so. Fixed by appending literal " (past)" text next to the end time
(`src/pages/index.astro`) --- when a class name encodes state that isn't
already implied by other visible text, check whether removing the CSS rule
would leave a sighted user with no way to tell, before trusting a clean axe
result to mean the row is fine.

A second axe-invisible gap, same shape (a real WCAG failure with no rule
that catches it): `.table-scroll`'s `overflow-x: auto` on the schedule table
had no `tabindex`, so once the table is wider than the viewport (any real
phone width, once a room name is long enough) there was no way for a
keyboard-only user to even reach the scrollable region, let alone scroll
it --- the table itself has no focusable cells, so it was a dead stop
between the submit button and the page bottom. Confirmed live: a real
`Tab` walkthrough at 390px skipped straight past it, and `scrollWidth >
clientWidth` was true the whole time. Fixed with `tabindex="0" role="region"
aria-label="Schedule"` on the wrapping div, re-confirmed a real `Tab` reaches
it and `ArrowRight` then moves `scrollLeft`. General lesson for any
`overflow: auto` wrapper around non-interactive content (a table, a wide
diagram): check whether the wrapper itself is keyboard-focusable, not just
whether axe is clean --- axe has no rule for "can a keyboard reach this
scroll container" either.

A third axe-invisible gap, in the same family but a different WCAG success
criterion: `#live`, the `<ul>` the client script prepends new bookings into
from the SSE stream, had no `aria-live` attribute anywhere --- a screen
reader gets no indication a new booking appeared unless it happens to have
focus inside that list at the exact moment. This is WCAG 4.1.3 (status
messages): content that updates to convey information, without a context
change or moved focus, has to be a live region. A fresh `agent-browser a11y`
sweep against the deployed app came back 0 violations/0 incomplete both
before and after adding `aria-live="polite"` --- axe checks *how* an existing
`aria-live` region is used, not whether a dynamically-updated region has one
at all. Fixed in `src/pages/index.astro`; confirmed the attribute survives
the build and that new `<li>`s still land inside it correctly. General
lesson: any element a client script mutates outside of a page navigation
(prepending, appending, replacing text) is a candidate for this exact gap ---
check it has an `aria-live` (or `role="status"`/`role="alert"`) before
trusting a clean a11y sweep, the same way the `tr.past` and `.table-scroll`
entries above already teach for colour-only state and keyboard reachability.

A fourth gap in the same family, but a different SC and a different failure
mode than the three above --- this one isn't invisible to axe because axe has
no rule for it, it's invisible because axe never even sees the state that's
wrong. Any rejected submission (a conflict, a bad range, a too-long name)
redirected to a blank form: the server already had every field, but the page
never read them back, so a real person had to retype the whole booking over
one bad field. WCAG 2.2 SC 3.3.7 (Redundant Entry). Confirmed live with
`agent-browser`: fill the form, submit into a genuine conflict, read the
fields back after the redirect --- empty every time before the fix. Fixed by
having the redirect carry the submitted fields as query params
(`withInput` in `api/bookings.ts`) and having the page refill `value=`/
`selected` from them. General lesson: the "axe can't see this" gaps above are
about markup that's always present but wrong; this one is about markup that's
only wrong on one specific navigation (a failed POST's redirect) --- an axe
sweep against the form's resting state will never catch it, only a sweep (or
a person) that actually drives the failure path will.
