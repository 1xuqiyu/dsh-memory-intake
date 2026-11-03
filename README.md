# dsh-memory-intake

> **Semantic recall is optional.** Agent memory that routes deterministically instead of embedding.

A minimal, zero-dependency pattern for giving an agent long-term memory — built on **one always-injected rules file** plus **plain Markdown archives routed by a keyword index**.

No vector DB. No embeddings. No SQLite. No plugin runtime. No lock-in.

---

## The problem it solves

Most agent memory systems solve *"the model can't remember."*

The failure people actually hit is different:

> **The model wrote it down and never reads it again.**

You accumulate notes, externalise them into tidy archives to save context budget, and then discover that the archive is never opened — because nothing in the always-injected prompt says *when* to open it.

This project treats that as **a routing problem, not a retrieval problem**.

## The thesis

| Conventional approach | This approach |
|---|---|
| Embed everything, retrieve by cosine similarity | **Route by literal keyword match** |
| Recall quality depends on embedding luck | **Recall is deterministic and auditable** |
| Needs a vector store + model | **Needs a text file** |
| Data locked in a DB | **Data is Markdown, readable in ten years** |
| Silent truncation when over budget | **Budget failure is loud and visible** |

**The trade-off is honest**: routing tables are hand-maintained. For a single person's project that is a *feature* — you get exactly the recall you wrote, and you can debug it by reading a table. It does not scale to a team of fifty. That is fine.

---

## Three layers

```
┌─ CORE     AGENTS.md            always injected · hard byte budget
│           identity, preferences, hard rules,
│           recurring mistakes, KEYWORD ROUTING TABLE
│
├─ ROUTED   memory/*.md          NOT injected · read on demand
│           runbooks, parameters, forensic detail
│
└─ ENGINE   memory-doctor.mjs    verifies the invariants above still hold
```

**Two invariants:**

1. **A fact lives in exactly one layer.** Promoting a fact means deleting the old copy.
2. **Every routed file needs a keyword row.** No row → the file is dead weight.

---

## Quick start

```bash
git clone https://github.com/<you>/dsh-memory-intake.git
cd dsh-memory-intake

# 1. install the skill into your DSH home
node scripts/init.mjs --install

# 2. scaffold a project
node scripts/init.mjs --scaffold /path/to/your/project

# 3. edit templates/AGENTS.snippet.md into your project AGENTS.md,
#    then verify:
node scripts/memory-doctor.mjs
```

`memory-doctor` checks five invariants and exits non-zero on failure:

```
=== memory-doctor ===
✓ byte budget      24005 / 65536 (headroom 41531)
✓ stale wording    none
✓ section numbering contiguous, no duplicates
✓ index pointers   11/11 resolve
✓ reverse index    every archived file is registered
5/5 passed
```

The fifth check is the important one — **it catches "the file exists but nothing points at it"**, which is the exact failure this project exists to prevent.

---

## What goes where

Ask three questions. Any **yes** → it belongs in the core file:

- Must this be obeyed on nearly every turn? *(preference, hard rule)*
- Would getting it wrong be expensive? *(security, money, data loss, secrets)*
- Is it a literal identifier used every time? *(command, field, path, port, version)*

Otherwise it goes to a routed file.

Tie-breaker: **"If the next session does not load this, will something break?"**

---

## Why not an embedding-based memory plugin

Those are good at *"surface related past content."* They are bad at *"obey this constraint every single turn."*

Conflating the two produces a system where:
- constraints compete with twelve irrelevant paragraphs for attention
- you cannot explain why a rule was or wasn't applied
- an upgrade can silently change what the model believes

Separating them is cheaper and easier to reason about.

---

## Scope and honesty

**This is not a framework.** It's a skill, a checker, and a document format — roughly 500 lines. It will not manage your Kubernetes cluster.

**Known limits:**
- Keyword routing misses synonyms you didn't list. Mitigation: the routing table is the first thing you edit when you notice a miss.
- The core file has a hard budget. It will fill up. When it does, externalise — that is the designed loop.
- Human-maintained routing does not scale past personal use.

---

## License

MIT
