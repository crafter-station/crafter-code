# Crafter Code - Implementation Status

> Last updated: 2026-01-26

## Current Implementation

### Backend (Rust/Tauri) - COMPLETE

#### Claude API Client (`src-tauri/src/claude/`)
| File | Status | Description |
|------|--------|-------------|
| `mod.rs` | Done | Module exports |
| `types.rs` | Done | Message, StreamEvent, Usage, WorkerStreamEvent types |
| `pricing.rs` | Done | Cost calculation per model (Opus $15/$75, Sonnet $3/$15, Haiku $0.80/$4 per 1M tokens) |
| `client.rs` | Done | ClaudeClient with `stream_message()` and `send_message()` via SSE |

#### Orchestrator Core (`src-tauri/src/orchestrator/`)
| File | Status | Description |
|------|--------|-------------|
| `mod.rs` | Done | Module exports |
| `session.rs` | Done | OrchestratorSession with workers, status tracking |
| `worker.rs` | Done | WorkerSession with task, status, output buffer, files_touched |
| `manager.rs` | Done | `plan_subtasks()` via Opus, `execute_worker()` for parallel execution |
| `commands.rs` | Done | Tauri commands for IPC |

#### Tauri Commands Registered
- `create_orchestrator_session` - Create new fleet from prompt
- `get_orchestrator_session` - Get session by ID
- `list_orchestrator_sessions` - List all sessions
- `cancel_worker` - Cancel running worker
- `retry_worker` - Retry failed worker
- `get_session_conflicts` - Get file conflicts
- `get_session_cost` - Get session cost

### Frontend (React/TypeScript) - COMPLETE (with bugs)

#### State Management
| File | Status | Description |
|------|--------|-------------|
| `stores/orchestrator-store.ts` | Done | Zustand store with sessions, workers, cost tracking |
| `lib/ipc/orchestrator.ts` | Done | IPC functions with Raw types for backend transformation |

#### UI Components (`components/orchestrator/`)
| File | Status | Description |
|------|--------|-------------|
| `orchestrator-dashboard.tsx` | Done | Main view with worker grid |
| `agent-card.tsx` | Done | Individual worker card with status, output, cost |
| `cost-tracker.tsx` | Done | Live cost display header |
| `conflict-alert.tsx` | Done | File conflict warnings |
| `new-orchestration-dialog.tsx` | Done | Launch fleet dialog (HAS BUGS) |

#### Workspace Integration
| File | Status | Description |
|------|--------|-------------|
| `workspace.tsx` | Done | Fleet/Terminal tabs, Fleet History sidebar |

### Current Bugs

1. **Dialog z-index issues** - Dialog appears but styling is broken due to Tailwind v4 + Tauri portal conflicts
2. **Select dropdown not opening** - Same z-index/portal issue
3. **UI needs polish** - Layout issues, spacing, visual hierarchy

---

## Analysis: What's Over-Engineering?

Based on the YC demo goal ("spawn 4 workers, show streaming, track costs, complete in <60 seconds"), here's what we built vs what we need:

### Essential for Demo (KEEP)
| Feature | Why |
|---------|-----|
| Claude API streaming | Core functionality |
| Orchestrator spawning workers | Core demo |
| Cost tracking per worker | Visual impact for demo |
| Real-time output streaming | Shows parallel execution |
| Worker grid UI | Visual representation |

### Nice-to-Have (SIMPLIFY)
| Feature | Current | Simpler Alternative |
|---------|---------|---------------------|
| Conflict detection | Polling every 5s, complex logic | Remove for MVP, add post-demo |
| Multiple sessions history | Full session management | Just show current session |
| Cancel/Retry workers | Full implementation | Demo doesn't need this |
| File tree integration | Full file browser | Not needed for orchestrator demo |

### Potentially Over-Engineered
| Feature | Issue |
|---------|-------|
| `contain: strict` CSS | Causes portal issues, not necessary |
| Raw type transformations | Could simplify with better Rust types |
| Session persistence | Not implemented, not needed for demo |
| Complex dialog with model selection | Demo can hardcode Opus |

---

## Recommended Path Forward

### Phase 1: Fix Critical Bugs (TODAY)
1. **Fix Dialog rendering** - Use native HTML dialog or inline form instead of Radix Portal
2. **Simplify UI** - Remove dialog, use inline form in dashboard
3. **Test end-to-end** - Verify with `ANTHROPIC_API_KEY` set

### Phase 2: Demo-Ready Polish (1-2 days)
1. **Hardcode demo flow** - Single button "Run Demo" that executes preset prompt
2. **Visual polish** - Make worker cards look professional
3. **Cost animation** - Smooth cost counter updates
4. **Status indicators** - Clear visual states for pending/running/completed/failed

### Phase 3: Post-Demo Features
1. Session persistence
2. Conflict detection
3. Cancel/retry workers
4. Custom prompts
5. Model selection

---

## Simplified Demo Implementation

Instead of the complex dialog, consider this simpler approach:

```tsx
// In orchestrator-dashboard.tsx - Replace dialog with inline
function OrchestratorDashboard() {
  const [prompt, setPrompt] = useState("");
  const [isLaunching, setIsLaunching] = useState(false);

  const handleLaunch = async () => {
    if (!prompt.trim()) return;
    setIsLaunching(true);
    try {
      const session = await createOrchestratorSession(prompt, "opus");
      // ... handle success
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <div>
      {!activeSession ? (
        <div className="p-8 space-y-4">
          <h2>Launch Agent Fleet</h2>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe your task..."
            className="w-full h-32 p-3 bg-muted rounded-md"
          />
          <button
            onClick={handleLaunch}
            disabled={isLaunching || !prompt.trim()}
            className="px-4 py-2 bg-accent-orange text-white rounded-md"
          >
            {isLaunching ? "Planning..." : "Launch Fleet"}
          </button>
        </div>
      ) : (
        // Worker grid
      )}
    </div>
  );
}
```

This eliminates:
- Radix Dialog portal issues
- Z-index conflicts
- Model selection complexity (hardcode Opus for lead)

---

## YC Demo Script (Aligned with Plan)

```
1. Open Crafter Code, show empty Fleet view
2. Type: "Refactor auth system to use Clerk"
3. Click "Launch Fleet"
4. Show: Opus planning, breaking into 4 subtasks
5. Show: 4 worker cards appear, start running in parallel
6. Show: Live streaming output on each card
7. Show: Cost ticker updating ($0.05... $0.15... $0.30)
8. Show: Workers completing one by one
9. Final: "All workers complete. Total: $0.34"
```

**Key visuals for demo:**
- Orange accent color (brand)
- Clean dark theme
- Smooth animations
- Clear cost display
- Professional typography

---

## Files to Modify Next

| Priority | File | Change |
|----------|------|--------|
| P0 | `orchestrator-dashboard.tsx` | Replace dialog with inline form |
| P0 | `globals.css` | Remove complex portal overrides |
| P1 | `agent-card.tsx` | Polish visual design |
| P1 | `cost-tracker.tsx` | Add animation |
| P2 | Remove conflict detection | Simplify for demo |
| P2 | Remove session history | Focus on current session |

---

## Environment Setup for Testing

```bash
# Required
export ANTHROPIC_API_KEY="sk-ant-..."

# Run
cd apps/desktop
bun run tauri:dev
```

---

## Success Criteria (from Plan)

- [x] Can spawn parallel workers from single prompt (backend done)
- [ ] Real-time streaming from all workers visible (UI bugs)
- [x] Cost tracking per worker and total (backend done)
- [ ] Workers can be cancelled/retried (defer for demo)
- [ ] Conflict detection (defer for demo)
- [ ] Session persists across restart (defer)
- [ ] Demo runs in < 60 seconds (need to test)
