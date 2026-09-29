# 12 — Version history

**Size:** M · **Depends on:** 04 · **Status:** not started

## Why

There is **no recovery path from anything**. The storage is the save file, so:

- A bad paste over a selection is undoable only while the tab stays open — and
  switching tabs calls `setValue` when storage differs from the buffer
  ([updateEditor](../scripts/index.js#L400)), which resets monaco's undo stack.
- Opening a file into the wrong pane overwrites whatever was there.
- Importing a zip replaces all three panes at once.
- Before item 01, a previewed snippet could wipe everything — which is how that
  bug was found.

Periodic snapshots turn every one of those from "gone" into "annoying".

## Approach

Once projects live in IndexedDB (item 04), snapshots are a second store:

```
store: snapshots   keyPath 'id'   index: 'projectId, takenAt'
  { id, projectId, takenAt, code, css, js, reason }
```

**When to snapshot.** Time-based alone is wasteful and misses the dangerous
moments. Take one:

- on a debounce of ~60s of idle *after* changes (not every 60s regardless)
- immediately **before** any bulk overwrite — zip import, file open, share-link
  load, project switch — tagged with `reason`, because these are precisely the
  destructive actions
- on explicit user request ("snapshot now")

**What to store.** Full copies are simplest and snippets are small; do not build
a diff engine for a few KB of text. Cap retention instead: keep the last ~50 per
project, thinning older ones (hourly for a day, daily beyond that).

**Deduplicate.** Hash the three panes and skip the write when nothing changed,
or idle snapshots will fill the store with identical rows.

## UI

A list with timestamp, reason and a size or line delta; selecting one previews it
and offers Restore. Restoring should itself take a snapshot first, so restore is
undoable too.

This pairs naturally with item 13 — comparing a snapshot against current is the
obvious way to decide whether to restore, and monaco's diff editor makes it
nearly free once history exists.

## Verification

- Edit, wait for an idle snapshot, edit again, and confirm both states are
  recoverable.
- Import a zip and confirm a `reason: 'zip-import'` snapshot exists from
  immediately before, containing the pre-import content.
- Restore a snapshot, then restore the auto-snapshot taken by that restore, and
  confirm you are back where you started.
- No duplicate snapshots accumulate while idle with no edits.
- Retention thinning actually runs and does not grow without bound over a long
  session.
- Deleting a project removes its snapshots (no orphans).

## Risks

- Unbounded growth if retention is not implemented at the same time as capture.
  Write the pruning in the same commit, not later.
- Snapshot-on-every-change plus item 04's batched writes can produce surprising
  interleaving; take snapshots from flushed state (`flushStorage()` first).
- Restore is destructive. It needs a confirmation, and the pre-restore snapshot
  above.

## Done when

An accidental bulk overwrite can be undone from the history list, restores are
themselves reversible, and the store does not grow without limit.
