# Contract: MCP tools

Served on `/mcp/:slug` with 001's auth (`requireToken('read')`, then `requireMember()`). Every call
runs `advance` first (research L1) and counts as the caller's check-in when they have a live place.
Every text is built with `oneLine()` from structured data.

## `land_lock` — ask for the landing lock

- **Input**: none.
- **What it does**: joins the queue if the caller has no live place, then waits up to 25 s (checking
  every 2 s) until the caller holds the lock. Asking while holding renews the 60 minutes.
- **Description** (shown to the agent): "Ask for this project's landing lock before you rebase,
  run the pre-land gate and land. If you hold it, go ahead and call land_unlock when done. If not,
  call land_lock again until you hold it; each call waits up to 25 seconds. The lock opens by itself
  60 minutes after your last call."
- **Output**, one of:
  - `You hold the landing lock for main. Rebase on main, run the gate, land, then call land_unlock.`
  - `Waiting for the landing lock: position 2, @bob holds it (14 min), about 35 min. Call land_lock again to keep your place.`
  - Prefixed once, when the caller's previous hold expired within the hour (a waiter dropped for
    silence never held the lock and gets no notice):
    `Your previous hold of the landing lock expired; a land made then was not protected by the lock.`
  - Place gone (only the first poll of a call joins; a place ended during the wait is reported, not
    re-queued). The sentence is the notice if there is one, else `Your place in the landing queue is gone.`:
    `<notice> Call land_lock to ask again.`
- **Notices** (within an hour of the end; logins are the dashboard member who acted):
  - expired hold: `Your previous hold of the landing lock expired; a land made then was not protected by the lock.`
  - removed hold: `Your hold of the landing lock was opened on the dashboard by @carol; a land made after that was not protected by the lock.`
  - removed waiter: `Your place for the landing lock was removed on the dashboard by @carol.`
  - removed by the system for a non-member: no notice.
- If the client disconnects during the wait, polling stops and the caller is not granted the lock.

## `land_unlock` — open the lock or leave the queue

- **Input**: `{ landed: boolean }` (required): whether the change landed, or the agent gave up. Only landed turns feed the estimates.
- **What it does**: ends the caller's live place: `landed` or `released` when holding, `left` when
  waiting. The next waiter gets the lock in the same transaction.
- **Output**: `Opened the landing lock (landed).` · `Left the landing queue.` ·
  `You have no place in the landing queue.` · or the notice sentence when the last place expired
  (as a hold) or was removed within the hour.
Any tool that fails answers `internal error` (isError) and logs one JSON line with the tool name
and the first line of the message, never params.

## `landing` — see the queue (read-only)

- **Input**: none. `readOnlyHint: true`. Does not join, but counts as a check-in when the caller has
  a live place. A pending notice (above) is prefixed to the output as a sentence.
- **Output**:

  ```
  Landing lock for main: @bob holds it (14 min); 2 waiting; about 25 min per turn.
  1. @alice, waiting 6 min, about 18 min (you)
  2. @carol, waiting 2 min, about 43 min
  ```

  Empty: `The landing lock for main is free and nobody is waiting.`
