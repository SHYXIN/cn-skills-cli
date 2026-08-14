# Triage Labels

The skills speak in terms of canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

## Category roles (exactly one per issue)

| Role            | Label in our tracker | Meaning                       |
| --------------- | -------------------- | ----------------------------- |
| `bug`           | `bug`                | Something is broken           |
| `enhancement`   | `enhancement`        | New feature or improvement    |

## State roles (exactly one per issue)

| Role in mattpocock/skills | Label in our tracker | Meaning                                  |
| ------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`            | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`              | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`         | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`         | `ready-for-human`    | Requires human implementation            |
| `wontfix`                 | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Our tracker uses the canonical names verbatim — no remapping needed. If you later switch to different vocabulary, edit the right-hand column to match.
