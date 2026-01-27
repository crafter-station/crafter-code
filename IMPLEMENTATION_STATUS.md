# Crafter Code - Implementation Status

> Last updated: 2026-01-26 (Post UI Redesign)

## Current State Summary

| Layer | Status | Notes |
|-------|--------|-------|
| **Backend (Rust/Tauri)** | IMPLEMENTED | Commands registered, but need API key validation |
| **Frontend (React/TS)** | REDESIGNED | New Claude Orchestrator-style UI |
| **Integration** | NOT WORKING | IPC calls fail with "Failed to create session" |

---

## What Was Done (UI Redesign)

### New Architecture (Claude Orchestrator Style)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Titlebar: crafter/code                              ● Connected          │
├─────────────────┬────────────────────────────────────────────────────────┤
│  + New Agent    │  ┌──────────┬──────────┬──────────┐                   │
│  (inline form)  │  │ Session 1│ Session 2│ Session 3│  ← Multi-column   │
│                 │  ├──────────┼──────────┼──────────┤                   │
│ ▼ ACTIVE (N)    │  │[TOOL_USE]│[TEXT]    │[ERROR]   │  ← Message bubbles│
│   ● session-1   │  │Reading...│Done!     │Failed... │                   │
│   ● session-2   │  │          │          │          │                   │
│                 │  │[input...]│[input...]│[input...]│  ← Follow-up input│
│ ▼ WORKERS (N)   │  └──────────┴──────────┴──────────┘                   │
│   ● task $0.02  │                                                        │
│                 │                                                        │
│ TOTAL COST      │                                                        │
│ $0.00           │                                                        │
└─────────────────┴────────────────────────────────────────────────────────┘
```

### New Components Created

| Component | File | Purpose |
|-----------|------|---------|
| `OrchestratorLayout` | `orchestrator-layout.tsx` | Full-screen layout wrapper |
| `OrchestratorSidebar` | `orchestrator-sidebar.tsx` | Left sidebar with inline new agent form, sessions, workers, cost |
| `SessionColumns` | `session-columns.tsx` | Horizontal scrolling multi-column session view |
| `SessionCard` | `session-card.tsx` | Individual session column with messages |
| `SessionInput` | `session-input.tsx` | Input field for follow-ups |
| `MessageBubble` | `message-bubble.tsx` | TOOL_USE/TEXT/ERROR message display |

### Store Updates

Added to `orchestrator-store.ts`:
- `Message` type with `type`, `content`, `timestamp`, `toolName`, `rendered`
- `messages` array on both `OrchestratorSession` and `WorkerSession`
- `addSessionMessage()` and `addWorkerMessage()` actions
- `getAllWorkers()` computed function

### CSS Cleanup

Removed from `globals.css`:
- `contain: strict` on resizable panels (caused portal issues)
- Complex Radix portal z-index hacks
- Dialog/popover forced positioning

---

## Blocking Issue: IPC Failure

**Symptom:** Clicking "Launch" shows "Failed to create session"

**Likely Causes:**

1. **Missing API Key** - `ANTHROPIC_API_KEY` not set in environment
2. **Backend Command Error** - Tauri command panics or returns error
3. **Serialization Issue** - Response format mismatch between Rust and TS

### Debug Steps

```bash
# 1. Check if API key is set
echo $ANTHROPIC_API_KEY

# 2. Run with debug logging
cd apps/desktop
RUST_BACKTRACE=1 bun run tauri:dev

# 3. Check Tauri dev console for errors (Cmd+Shift+I in app)

# 4. Test backend directly with curl (if API endpoint exposed)
```

### Files to Check for Backend Issues

| File | Check For |
|------|-----------|
| `src-tauri/src/orchestrator/commands.rs` | Command implementation |
| `src-tauri/src/orchestrator/manager.rs` | `plan_subtasks()` logic |
| `src-tauri/src/claude/client.rs` | API client implementation |
| `src-tauri/src/main.rs` | Command registration |

---

## Backend Implementation (Reference)

### Claude API Client (`src-tauri/src/claude/`)

| File | Status | Description |
|------|--------|-------------|
| `mod.rs` | Done | Module exports |
| `types.rs` | Done | Message, StreamEvent, Usage types |
| `pricing.rs` | Done | Cost per model (Opus $15/$75, Sonnet $3/$15, Haiku $0.80/$4 per 1M) |
| `client.rs` | Done | `stream_message()` and `send_message()` via SSE |

### Orchestrator Core (`src-tauri/src/orchestrator/`)

| File | Status | Description |
|------|--------|-------------|
| `session.rs` | Done | OrchestratorSession with workers |
| `worker.rs` | Done | WorkerSession with task, output buffer |
| `manager.rs` | Done | `plan_subtasks()` via Opus |
| `commands.rs` | Done | Tauri IPC commands |

### Registered Tauri Commands

- `create_orchestrator_session(prompt, model)` → SessionResponse
- `get_orchestrator_session(sessionId)` → SessionResponse
- `list_orchestrator_sessions()` → OrchestratorSession[]
- `cancel_worker(sessionId, workerId)` → void
- `retry_worker(sessionId, workerId)` → WorkerSession
- `get_session_conflicts(sessionId)` → FileConflict[]
- `get_session_cost(sessionId)` → number

---

## Frontend Component Tree

```
Workspace
└── OrchestratorLayout (NEW)
    ├── Header (titlebar with drag region)
    ├── OrchestratorSidebar (NEW)
    │   ├── NewAgentButton (inline form, no modal)
    │   ├── CollapsibleSection: Active Sessions
    │   │   └── SessionItem[]
    │   ├── CollapsibleSection: Workers
    │   │   └── WorkerItem[]
    │   └── TotalCostFooter
    ├── SessionColumns (NEW)
    │   └── SessionCard[] (NEW)
    │       ├── Header (status dot + title + close)
    │       ├── ScrollArea with MessageBubble[]
    │       ├── Footer (workers count + cost)
    │       └── SessionInput
    └── StatusBar

Legacy (kept for reference, not used):
├── OrchestratorDashboard
├── AgentCard
├── CostTracker
├── ConflictAlert
└── NewOrchestrationDialog (replaced by inline form)
```

---

## IPC Layer (`lib/ipc/orchestrator.ts`)

### Type Transformations

```typescript
// Backend (Rust) → Frontend (TypeScript)
snake_case → camelCase

session_id → sessionId
total_cost → totalCost
output_buffer → outputBuffer
files_touched → filesTouched
```

### Event Listeners

- `worker-stream-{workerId}` → delta/complete/error events
- `worker-status-change` → status updates across all workers
- `orchestrator-session-created` → new session notifications

---

## Next Steps to Fix

### Priority 1: Debug Backend IPC

```bash
# Check if Tauri commands are registered
cd apps/desktop/src-tauri
grep -r "create_orchestrator_session" .

# Check main.rs for command registration
cat src-tauri/src/main.rs | grep -A 20 "tauri::Builder"
```

### Priority 2: Add Error Logging

In `lib/ipc/orchestrator.ts`, the error is caught but not logged:

```typescript
// Current (loses error details):
} catch (err) {
  setError(err instanceof Error ? err.message : "Failed to create session");
}

// Should be:
} catch (err) {
  console.error("IPC Error:", err);
  setError(err instanceof Error ? err.message : String(err));
}
```

### Priority 3: Verify Environment

```bash
# .env.local or shell export needed:
export ANTHROPIC_API_KEY="sk-ant-api03-..."

# Or in src-tauri/.env:
ANTHROPIC_API_KEY=sk-ant-api03-...
```

---

## Success Criteria (Updated)

- [x] UI: Sidebar with sessions/workers/cost
- [x] UI: Multi-column session view
- [x] UI: Message bubbles with TOOL_USE badges
- [x] UI: Inline form for new agents (no modals)
- [ ] Backend: IPC working (BLOCKED)
- [ ] Integration: Real-time streaming visible
- [ ] Demo: Runs smoothly in < 60 seconds

---

## Demo Script (When IPC Fixed)

```
1. Open Crafter Code - show sidebar + empty "No Active Sessions"
2. Click "+ New Agent" - inline form expands
3. Type: "Refactor auth to use Clerk" + Launch
4. Watch: Session card appears, "Planning..." status
5. Watch: Workers spawn in sidebar, messages stream
6. Watch: Cost updates: $0.05... $0.12... $0.29
7. Complete: All workers done, total $0.34 in sidebar
```

---

## Environment Setup

```bash
# Required
export ANTHROPIC_API_KEY="sk-ant-api03-..."

# Run development
cd apps/desktop
bun run tauri:dev

# Build for production
bun run tauri:build
```
