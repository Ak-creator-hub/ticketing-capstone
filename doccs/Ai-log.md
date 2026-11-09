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