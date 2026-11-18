# AI Log

## Build 1: Domain core

### Entry 1: The Build 1 prompt

**What I asked:**
I gave my AI tool README.md and docs/build-1.md, then pasted the Build 1
prompt from the doc. It asked for errors.js, ids.js, waitlistQueue.js,
inventory.js, scripts/demo.js and scripts/benchmark-lookup.js, with
"type": "module" in package.json.

**What came back:**
All the requested files, plus demo and benchmark scripts in package.json.
Both scripts ran.

**What was wrong:**
The first version of the demo never showed a refused booking, which the
"Done when" list requires. It only showed the event selling out, the
waitlist, the cancellation and the next person in line.

**What I changed:**
I asked the AI to add a step where a booking is refused with SOLD_OUT after
the event sells out, and to confirm that a failed booking changes no seats.
The demo now prints refusals for Bayo and Femi and the line
"The refused booking changed no seats (3 of 3 remain sold)."

**Code review checks:**
- Math.random in src: [not found]
- array.shift() in waitlistQueue.js: [not found]
- Private fields (#) in waitlistQueue.js: [not found]
- Cancelling the same booking twice: [not found]

**Benchmark result:**
500 lookups among 100,000 bookings: Array.find took 1017.331 ms and Map.get
took 0.104 ms. Map.get is O(1) because it jumps straight to the booking by
its reference. Array.find is O(n) because it checks bookings one by one.
## Build 2: Search, sorting and the first tests

### Entry 1: The Build 2 prompt

**What I asked:**
I gave my AI tool README.md, docs/user-stories.md, docs/build-2.md and
src/domain/, then pasted the Build 2 prompt. First I added acceptance
criteria for S04 (publishing), which the doc left for the class to write.
The prompt asked for a hand-written merge sort, publishing and listing
events, search, filter and sort functions, tests, and an "npm test" script.

**What came back:**
sorting.js, eventSearch.js, changes to inventory.js and 27 tests. All 27
pass, and npm run demo still prints the full Build 1 story.

**What I checked:**
- No .sort( in my src files, so the merge sort is written by hand.
- mergeSort copies its input and uses <= 0 when merging, so it is stable and
  does not change the original list. A stability test exists.
- Tests cover INVALID_STATE for publishing with no tiers, a date-only "to"
  including the whole day, events with no tiers left out of price filters,
  no-price events sorted last, id tie-breaks, and a pending booking in cents.

**What was wrong:**
Nothing.

**What the AI added that I did not ask for:**
An unpublish function and a test for it. The S04 title mentions
unpublishing, so I kept it.

**What I changed:**
Nothing.
## Build 3: Architecture, state machine and server skeleton

### Entry 1: The Build 3 prompt

**What I asked:**
I asked for the three architecture diagrams, a tested booking state machine,
and a small Node.js HTTP server with health and static-file handling.

**What came back:**
The requested architecture, domain, HTTP, configuration, and test files were
added without changing the existing inventory rules.

**What was wrong:**
Nothing identified during implementation. The repository's documentation
folder is named `doccs/`, although its README and this build use `docs/`.

**What I changed:**
I kept the existing `doccs/` files in place, added the requested architecture
document under `docs/`, and updated this existing AI log.