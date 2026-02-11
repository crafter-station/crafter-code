# Mission Control — Shaping Doc

## Frame

### Source

> Bhanu Teja's Mission Control (3.8M views, Jan 2026): 10 specialized OpenClaw agents
> with Convex-backed shared task board, activity feed, agent profiles, @mentions.
> Everyone cloning it. MissionControlHQ.ai launching as SaaS.
>
> Google Antigravity: VS Code fork that literally calls itself "Mission Control" for
> autonomous coding agents. Dashboard for managing parallel agents.
>
> GitHub Agent HQ / Copilot Mission Control: Centralized dashboard to orchestrate
> any AI agent from any provider.
>
> @Asif2BD: "Running multiple agents without a dashboard is like conducting an
> orchestra blindfolded."
>
> @fmfamaral: "Had no idea if they were healthy or burning money."
>
> Mike Mason: "Coherence through orchestration, not autonomy."
>
> Key gap: Everyone building Mission Control for generic autonomous agents (content,
> marketing, ops). Nobody has built Mission Control specifically for multi-agent
> coding IDEs. Antigravity is closest but closed-source Google.

### Problem

- crafter-code runs 2-10 agents in parallel but there's no "at a glance" view of what's happening
- Cost tracking shows total only — can't see which agent/model is burning money
- No timeline — can't see when agents ran, how long, or overlap
- Sessions die on app restart (all in-memory)
- Can only cancel workers, not pause/resume
- File conflict detection exists but no resolution UI
- Task board and agent execution are disconnected
- No session summaries — have to scroll through messages to understand what happened
- No search across sessions/messages
- Agent Trace blame view exists (just shipped) but isn't integrated into the main flow

### Outcome

- crafter-code feels like a command center for multi-agent coding work
- At a glance: what's running, what it costs, what it produced
- Sessions persist across restarts
- Conflicts are visible and resolvable
- Tasks drive agent work (not disconnected)
- Can search and review past work

---

## Requirements (R)

| ID | Requirement | Status |
|----|-------------|--------|
| R0 | See what every agent is doing right now in real-time | Core goal |
| R1 | Know how much each agent/session is costing me | Must-have |
| R2 | See a timeline of when agents ran, how long, and what they produced | Must-have |
| R3 | Know which agent wrote which code (attribution per file/line) | Must-have |
| R4 | Sessions survive app restart (persistence) | Must-have |
| R5 | Pause/resume individual workers without killing them | Must-have |
| R6 | See and resolve file conflicts when multiple agents edit the same file | Must-have |
| R7 | Track tasks and link them to the agents executing them | Must-have |
| R8 | Get a daily/session summary of what was accomplished | Must-have |
| R9 | Search across all sessions and messages | Must-have |

### Current State

| Req | What Exists |
|-----|------------|
| R0 | Partial — streaming messages exist, but no dashboard view |
| R1 | Partial — total cost shown, no per-agent/per-model breakdown |
| R2 | Missing — no timeline view |
| R3 | Done — Agent Trace blame view shipped |
| R4 | Missing — all in-memory, dies on restart |
| R5 | Missing — only cancel exists |
| R6 | Partial — conflict detection exists, no resolution UI |
| R7 | Partial — task board exists but disconnected from workers |
| R8 | Missing — no summaries |
| R9 | Missing — no search |

---

## Shapes Explored

### A: Dashboard-First

New top-level route with dedicated dashboard for observation. Session columns stay for interaction.

### B: Enhanced Sidebar

No new route. Enrich existing 3-pane layout with mission control features in sidebar + coordination panel.

### C: Hybrid (SELECTED)

Both: a Dashboard view for observation AND enhanced Session view for control. Toggle between them.

---

## Selected Shape: C — Hybrid ("Dashboard + Enhanced Layout")

| Part | Mechanism | Flag |
|------|-----------|:----:|
| **C1** | **View toggle** — Cmd+D switches between Dashboard and Session view. Tab bar or segmented control in titlebar. | |
| **C2** | **Dashboard view** — Agent status grid (live dots, current task, model, cost), cost analytics panel (per-agent, per-model, over time), timeline (Gantt: workers × time, color by status) | ⚠️ |
| **C3** | **Enhanced session view** — Sidebar shows agent roster with live status + cost. Inline conflict resolution. Task-worker binding. Summary card on completion. | |
| **C4** | **SQLite persistence** — Sessions, workers, messages, tool calls persisted to SQLite. Auto-save on state change. Resume on restart. | ⚠️ |
| **C5** | **Pause/resume** — Pause sends ACP cancel but preserves session state. Resume reconnects worker with context. | ⚠️ |
| **C6** | **Conflict resolution UI** — Side-by-side diff viewer when 2+ workers edit same file. Keep A / Keep B / Manual merge. | |
| **C7** | **Task-worker binding** — When worker starts, auto-link to task. Worker completion updates task status. Task board shows worker progress inline. | |
| **C8** | **Session summaries** — On worker/session completion, generate summary (files changed, tokens used, cost, key decisions). Show as card. | |
| **C9** | **Global search** — Cmd+Shift+F opens search overlay. Searches across sessions, messages, tool calls, file paths. Results grouped by session. | |

### Flagged Unknowns

- **C2 ⚠️** — Timeline/Gantt visualization: what library? How to render worker lifespans in real-time?
- **C4 ⚠️** — SQLite persistence: how does current in-memory Zustand store map to SQLite? What's the migration path?
- **C5 ⚠️** — Pause/resume: does ACP support pause natively, or do we fake it with cancel + session resume?

---

## Fit Check (R × C)

| Req | Requirement | Status | C |
|-----|-------------|--------|---|
| R0 | See what every agent is doing right now in real-time | Core goal | ✅ |
| R1 | Know how much each agent/session is costing me | Must-have | ✅ |
| R2 | See a timeline of when agents ran, how long, and what they produced | Must-have | ✅ |
| R3 | Know which agent wrote which code (attribution per file/line) | Must-have | ✅ |
| R4 | Sessions survive app restart (persistence) | Must-have | ✅ |
| R5 | Pause/resume individual workers without killing them | Must-have | ✅ |
| R6 | See and resolve file conflicts when multiple agents edit the same file | Must-have | ✅ |
| R7 | Track tasks and link them to the agents executing them | Must-have | ✅ |
| R8 | Get a daily/session summary of what was accomplished | Must-have | ✅ |
| R9 | Search across all sessions and messages | Must-have | ✅ |

**All requirements met.** Flagged unknowns resolved:
- R2: SVG Gantt timeline built with zero deps (Tailwind + SVG)
- R4: JSON file persistence extending existing SessionStore pattern
- R5: Fake pause via cancel + preserve state + resume

---

## Implementation Status

All 6 vertical slices shipped:

| Slice | Status | Files |
|-------|--------|-------|
| V1: Session Persistence | ✅ | session_store.rs, commands.rs, lib.rs, orchestrator.ts, orchestrator-store.ts |
| V2: Dashboard + View Toggle | ✅ | dashboard-view.tsx, view-toggle.tsx, orchestrator-layout.tsx, use-global-shortcuts.ts |
| V3: Timeline View | ✅ | worker-timeline.tsx, worker.rs (started_at/ended_at) |
| V4: Pause/Resume | ✅ | worker.rs (Paused status), commands.rs, agent-card.tsx |
| V5: Conflicts + Task Binding | ✅ | conflict-resolver.tsx, conflict-alert.tsx, worker.rs (task_id) |
| V6: Summaries + Search | ✅ | session-summary.tsx, global-search.tsx |
