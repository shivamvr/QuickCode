# 12 — Version history

**Size:** M · **Depends on:** 04 · **Status:** done (see Outcome)

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

## Outcome

**Done, September 2026.** There is a way back from a bad paste, a file opened
into the wrong pane, or a zip import.

### What was built

- **A `snapshots` store**, database version 2. Whole copies of the three panes,
  as the plan said: three panes of text are small, and a diff engine for a few
  KB is more to go wrong than it saves.
- **Capture on three occasions**: after a minute of quiet following an edit (a
  restarting timer, not a clock that fires regardless), immediately before
  anything that replaces a pane wholesale, and on request.
- **Deduplication** by a hash of the three panes, so idling never writes the
  same rows again.
- **Retention in the same commit as capture**, which the plan insisted on: the
  newest 10 always, then one an hour for the first day and one a day after that,
  hard-capped at 50 per project.
- **The history dropdown**, a fourth `.select` built from the classes the other
  three already use: time, reason and the line delta, newest first, plus
  `+ snapshot now`. Restoring confirms, and takes a snapshot on the way in so
  the restore is itself undoable.
- **Deleting a project deletes its snapshots.** No orphans.

### Where this differs from the plan

The plan listed **share-link load** and **project switch** as bulk overwrites to
snapshot before. Neither is destructive any more: since item 04 a share link
opens as a *new* project and switching projects simply opens a different record,
so there is nothing to lose and nothing to snapshot. The destructive paths that
remain are opening a file into a pane, importing a zip, and restoring.

One interaction worth knowing about, found by the test: **a "file opened"
snapshot is skipped when the content already matches the last one.** If an idle
snapshot was taken and nothing was typed since, the state before the overwrite is
already saved and a second copy under a different label would be noise. The
content is what matters, and it is there.

### Added after the first pass

Two gaps the owner spotted straight away, and both were fair:

- **Nothing could be deleted by hand.** A history you cannot prune yourself is
  half a feature. Each row now carries a `×`, and there is a `clear history`
  action beside `+ snapshot now`. Both confirm, and neither touches the files.
  The cross is looked for before the row in the click handler - without that,
  every delete would restore instead, which is what the check for it proves.
- **Snapshots had no names**, only the reason they were taken for. `+ snapshot
  now` asks for one, and the list shows it in place of the reason.

The automatic snapshots deliberately do **not** ask. A `prompt()` a minute after
you stopped typing, or in the middle of opening a file, would be intolerable, so
only the deliberate ones are named.

Naming a state that is already the newest snapshot **renames that one** instead
of writing a duplicate: the point of the name is to mark this state, and the
state is already saved. Cancelling the prompt takes no snapshot at all.

### Not done

**Previewing a snapshot before restoring it.** The plan pairs that with item 13,
and it is the right pairing - comparing a snapshot against what is open is a diff
view, and monaco's diff editor makes it nearly free. For now restoring is safe
rather than previewable: it confirms, and it is undoable.

### Verification

`node test/run.js` - **124 checks**, all passing. Fourteen are new: the idle
snapshot, the dedup, a file open keeping what it replaced, a restore putting all
three panes back, the restore being undoable, landing exactly where it started
after undoing it, the menu listing them newest first with a delete on each row,
the thinning rule over sixty snapshots spread across a fortnight, a deleted
project leaving nothing behind, a snapshot taking the name you type, naming an
already-saved state renaming rather than copying it, cancelling the name taking
nothing, the cross deleting one without restoring it, and clear history emptying
one project and no other.

Mutation-checked: removing the dedup, the thinning, the pre-restore snapshot,
the snapshot cleanup, and the cross's place in the click handler each turned the
suite red.
