# Sift, labelled fixture set: Northgate Property Group

The measurement instrument for the property management firm. Built before it is scored, on purpose:
a fixture set authored after a run gets unconsciously shaped by what the system already does, and
the accuracy number stops meaning anything.

**All data here is synthetic.** The firm (Northgate Property Group), its properties, owners,
tenants, vendors, work orders, lease calendar entries, the City of Lakemont, Lakemont County and
every agency and HOA named, and every inbox message are invented. No client, no real mailbox, no
real correspondence. Nothing here may be presented as evidence of client work.

Status: **frozen at the first scored run, 2026-09-25 (`runs/prop/SCORECARD.md`). Any label change
after that goes in `docs/VARIANCE-LOG.md`.** 92 messages and three systems of record, authored to
the same bar as Meridian's set (`fixtures/README.md`). `fixtures.json` is the generated snapshot the
app reads; regenerate it with `pnpm --filter @builds/sift snapshot` after any edit.

## Files

- `inbox.jsonl`: hand-labelled shared-inbox messages at a deliberately imbalanced real-inbox
  distribution (maintenance and pitches lead).
- `projects.csv`: the four properties, each with its parcel number (and, for Elm Court, its housing
  assistance contract), and the next thing on its calendar with the kinds of item that wait on it.
- `log.csv`: one file for the four logs the firm keeps: the work-order log (repair windows, including
  habitability and code repairs), the compliance log (violation cure periods, HOA cure periods,
  inspection scheduling), the lease calendar (renewal offers owed, notice periods) and the rental
  assistance log.
- `contacts.csv`: staff, owners, tenants with their unit, authorities, HOA managers and vendors.

The message record shape is Meridian's: see "Message record shape" in `fixtures/README.md`.

## What the project columns mean here

A project is a property. `permits` holds its parcel number (`APN ...`) and any contract number an
authority writes to it under. `next_what` is the next dated event at the property that open items
can hold up:

| Property | Next | Waits on |
|---|---|---|
| Elm Court Apartments | housing authority HQS inspections, Sep 29 | compliance notices, maintenance |
| Riverside Apartments | heating season start, boilers on, Oct 1 | maintenance |
| Harbor View Townhomes | HOA annual exterior walk, Oct 8 | compliance notices |
| Maple Commons | unit 6 move-in, Oct 1 | maintenance, lease |

- `coordinator` is the **property manager**: Rosa Kim for Elm Court and Riverside, Grace Whitman
  herself for Harbor View and Maple Commons. Complaints go here.
- `lead` is the **leasing contact** (Hannah Cole on every property). Informational: lease matters
  go to Hannah as a fixed person, because a prospect's inquiry often names no property.
- `reviewer` is the **maintenance lead** (Luis Ortega on every property). Informational: work
  orders go to Luis as a fixed person, so a repair request from an unmatched sender still reaches him.

## The topic classes

| Class | The message | routes to |
|---|---|---|
| `maint` | is a repair or maintenance need, or an update on an open work order | maintenance (Luis Ortega) |
| `code` | is a notice from a city, county, housing authority, fire marshal or HOA about compliance | the director (Grace Whitman) |
| `lease` | is about a lease: renewal, notice to vacate, application, move-in or move-out, deposit | leasing (Hannah Cole) |
| `complaint` | is a resident's complaint, first ask or repeat chase | the property's manager |
| `payment` | is about rent or money owed to or by a property, other than a vendor's bill | accounts (Peter Idowu) |
| `vendor` | is a vendor's invoice, statement or quote | accounts (Peter Idowu) |
| `noise` | is unsolicited marketing | no one |
| `internal` | is mail among staff | no one, low priority |

There is no `other` class for this firm: every message in the set falls in one of the eight. The
clock is the separate ninth judgment, as for Meridian.

## Labelling rules

Discovered while labelling and binding on both the labels here and the rules in
`src/trades/prop.ts`. A test asserts that, given a perfect judgment, every ordinary message lands
exactly where its labels say.

**Class boundaries.**

- `maint`: a repair or maintenance need at a unit, common area, grounds or building system, from
  whoever reports it: tenant, owner, neighbour, or a vendor updating an open work order. A notice
  that orders physical repair work carries `maint` as well as `code`: the director owns the notice,
  maintenance owns the fix.
- `code`: an authority's or HOA's notice about a violation, inspection, registration, licence or
  certification, including approvals, closed cases and one forwarded by an owner, a tenant or staff.
  A private filing service imitating an official notice is `noise`. An HOA or authority writing
  about money (dues, a housing assistance remittance) is `payment`.
- `lease`: renewals, notices to vacate, applications, tours, move-in and move-out, guarantors,
  early termination and the security deposit after move-out, whoever asks (a co-signer counts).
- `complaint`: a resident unhappy with another resident (noise, smoke, parking, pets), with how
  they were treated, or with a repair left unfixed or repeating. A plain repair request with no
  grievance is only `maint`; a neighbour's washing machine shaking a ceiling is a `complaint`, not a
  repair.
- `payment`: late or partial rent, returned payments (NSF), payment plans, fee disputes, rental
  assistance and housing assistance payments, HOA dues, owner distributions and rent reporting.
- `vendor`: a bill, statement or quote from a vendor, contractor or utility the firm uses or asked,
  including one chasing its own bill. A solicitation shaped like an invoice that says it is not a
  bill, and a painter the firm never asked, are `noise`.
- `noise`: unsolicited marketing however urgent or official it sounds: "final notice" directory
  renewals, invoice-shaped solicitations, filing services, buyers, recruiters, webinars.
- `internal`: mail between staff, including forwards among them.

**What is a clock.**

1. An open work order's repair window, an open compliance case's cure date, a lease calendar
   entry and an open rental assistance request are clocks: the log carries the date. A closed work
   order or a closed case carries none.
2. A repair request the work-order log has not seen yet has no logged clock; it is high priority
   because it needs a work order. A habitability failure (no hot water, water through a light
   fixture) is clocked by statute whatever the tenant's tone, with no date in the message.
3. A compliance notice is clocked when it obliges a cure, filing, registration, scheduling or
   readiness by a date or within a window. A passed reinspection or an approval is not.
4. A notice to vacate is clocked (the notice period ends on a date the firm works to), and so is a
   former tenant's deposit question: the statutory return window runs from move-out.
5. A date in a pitch, in team mail or on a vendor's bill is somebody's calendar, not a response
   clock. It raises no alert and does not raise priority.
6. A tenant's own promise date ("the rest by October 6") and an owner's own business timeline are
   not the firm's clock.
7. A clock whose date the message does not give has a null `deadline`. The right outcome is a
   person setting it; code never guesses one.

**Where a deadline comes from**, in order: an open log item the message names (a work order, a
compliance case, a lease calendar entry, an assistance application); a "within N days" window
counted from the day the message arrived (calendar days unless it says business, working or court
days); a dated phrase such as "by October 15" or "no later than September 29".

**Who it reaches.** A repair goes to maintenance, a compliance notice to the director, a lease
matter to leasing, a complaint to the property's manager, rent and vendor bills to accounts.
Pitches and internal mail reach no one. A complaint whose property cannot be matched goes to a
person to decide. Every clock alert goes to the director.

**Priority.** A dated item is urgent when the property's next event waits on that kind of item and
falls on or before the deadline, or when the deadline is three days out or less; high inside ten
days; normal after that. A dated compliance notice is never below high. Undated: a repair not yet
in the work-order log is high (and normal once the message names a logged work order), a repeat
complaint (a threaded `Re: Re:` or the tenant saying again, still waiting, second time) is high,
pitches and internal mail are low, everything else normal. A message's priority is the most urgent
of its topics and its clock.

## Size floors

The same floors as Meridian's: at least 12 clocked messages, and every class at least 6 ordinary
examples or a declared threshold.

**As drafted:** 92 messages, 31 `hard` (34%), 29 `clocked` (9 of them disguised as routine mail,
3 with no date at all), 12 multi-topic. Both floors hold, so no threshold is declared.

| class | ordinary | hard |
|---|---|---|
| `maint` | 10 | 10 |
| `code` | 8 | 5 |
| `lease` | 7 | 4 |
| `complaint` | 7 | 5 |
| `payment` | 7 | 5 |
| `vendor` | 6 | 3 |
| `noise` | 13 | 5 |
| `internal` | 7 | 3 |

A multi-topic message counts under each of its classes. Maintenance and pitches together are
two-fifths of the set, which is the shape of a property manager's inbox.

## How to score against this set

```bash
pnpm --filter @builds/sift score --firm prop
```

Report per class, ordinary and `hard` separately with `n` beside each, and lead with the
clocked-item catch rate beside its false-alarm counterpart, exactly as for Meridian.

## Known gaps

Recorded, not dropped, and left for the scorecard to show rather than engineered around:

- **A tenant's promise date read as a clock** (`p071`): "I'll have the rest of September's rent by
  October 6" is the tenant's date, not the firm's deadline, but a dated phrase parses and payment
  dates are not ruled out. Expect a false alarm to the director here.
- **A repeat complaint with none of the repeat words** (`p072`): "This is my third email about the
  dog", not a threaded reply. The labels say high; code reads a first ask and says normal.
