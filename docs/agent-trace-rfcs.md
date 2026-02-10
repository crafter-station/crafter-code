# Agent Trace RFCs from crafter-code

These are spec feedback proposals for [cursor/agent-trace](https://github.com/cursor/agent-trace) based on implementing Agent Trace in crafter-code, a multi-agent IDE with swarm coordination.

## RFC: Multi-Agent Orchestration Metadata

**Problem**: The spec assumes a single agent produces code via a single conversation. Multi-agent IDEs coordinate multiple agents that each contribute to files. There's no standard way to express the orchestrator-worker relationship.

**Proposal**: Standardize orchestration fields in vendor metadata:

```json
{
  "metadata": {
    "orchestration": {
      "session_id": "orch-session-123",
      "coordinator_model": "anthropic/claude-opus-4-5-20251101",
      "worker_id": "worker-456",
      "worker_count": 3,
      "agent_chain": [
        { "worker_id": "leader-1", "model_id": "anthropic/claude-opus-4-5-20251101", "action": "decompose" },
        { "worker_id": "worker-2", "model_id": "anthropic/claude-sonnet-4-5-20250929", "action": "write" }
      ]
    }
  }
}
```

**Why it matters**: Without this, multi-agent traces look identical to single-agent traces. You lose the provenance chain that shows how a task was decomposed and delegated.

**Use case**: crafter-code runs 2-10 agents in a fleet. A leader agent decomposes the task, workers claim subtasks. The trace should show which worker wrote which code, and who coordinated them.

---

## RFC: Cost Attribution

**Problem**: No way to record the token/cost associated with generating code. Teams need visibility into which agents/models cost what.

**Proposal**: Add optional cost fields:

```json
{
  "metadata": {
    "cost": {
      "input_tokens": 15000,
      "output_tokens": 3500,
      "cost_usd": 0.0975,
      "currency": "USD"
    }
  }
}
```

**Why it matters**: Enterprise teams need cost-per-file and cost-per-model analytics. This enables "which model is cheapest for this type of code?" analysis.

---

## RFC: Standardize `related` Resource Types

**Problem**: The `related` array exists but types are completely undefined. Each vendor will invent their own.

**Proposal**: Define standard types:

| Type | Description | Example URL |
|------|-------------|-------------|
| `session` | Parent session/conversation | `crafter-code://session/abc` |
| `task` | Business task/issue that triggered the edit | `https://linear.app/team/issue/123` |
| `worker` | Specific agent/worker in a multi-agent system | `crafter-code://worker/xyz` |
| `prompt` | The exact prompt that generated this code | Implementation-defined |
| `review` | Code review that led to changes | `https://github.com/org/repo/pull/1` |

**Why it matters**: Interoperability. If Cursor and crafter-code both emit `type: "task"`, tooling can correlate traces to issues without knowing the vendor.

---

## RFC: Temporal Ordering for Concurrent Edits

**Problem**: When multiple agents edit files concurrently (fleet/swarm), `timestamp` alone doesn't establish ordering. Two agents can have identical timestamps but their edits may have a causal relationship.

**Proposal**: Add optional ordering fields:

```json
{
  "metadata": {
    "sequence": 42,
    "caused_by": "trace-id-of-previous-edit"
  }
}
```

- `sequence`: Monotonically increasing counter per project. Establishes total order.
- `caused_by`: Links to the trace that logically preceded this edit (e.g., agent B edits a file because agent A created it).

**Why it matters**: Without causal ordering, replay and conflict resolution are ambiguous. This is especially critical for multi-agent IDEs where agents react to each other's changes.

---

## RFC: Agent Handoff Protocol

**Problem**: When agent A finishes work on a file and agent B picks up where A left off, there's no trace of the handoff. The per-range `contributor` override helps, but doesn't capture why the handoff happened.

**Proposal**: Add handoff metadata:

```json
{
  "metadata": {
    "handoff": {
      "from_worker_id": "worker-1",
      "to_worker_id": "worker-2",
      "reason": "task_claim",
      "timestamp": "2026-01-25T10:00:00Z"
    }
  }
}
```

**Why it matters**: Understanding handoffs is critical for debugging multi-agent workflows. "Why did this code change quality?" might be answered by "it was handed off from Opus to Haiku mid-task."

---

## Implementation Reference

crafter-code's implementation: `apps/desktop/src-tauri/src/trace/`

We currently use the `metadata` extension field with `dev.crafter-code` namespace:

```json
{
  "metadata": {
    "dev.crafter-code": {
      "orchestrator_session_id": "session-123",
      "worker_id": "worker-456",
      "task_id": "task-789",
      "cost": {
        "input_tokens": 15000,
        "output_tokens": 3500,
        "cost_usd": 0.0975
      }
    }
  }
}
```

We'd like to see some of these patterns elevated to the spec level so multi-agent IDEs have a shared vocabulary.
