# Crafter Code Desktop - TODO

## Immediate (To Make Demo Work)

### 1. Set ANTHROPIC_API_KEY

The backend requires this environment variable. Options:

```bash
# Option A: Export in shell before running
export ANTHROPIC_API_KEY="sk-ant-api03-..."
bun run tauri:dev

# Option B: Create src-tauri/.env file
# File: apps/desktop/src-tauri/.env
ANTHROPIC_API_KEY=sk-ant-api03-...

# Option C: Add to ~/.zshrc for persistent access
echo 'export ANTHROPIC_API_KEY="sk-ant-api03-..."' >> ~/.zshrc
source ~/.zshrc
```

### 2. Test Backend IPC

After setting API key, test with console logging:

1. Open app with `bun run tauri:dev`
2. Open DevTools (Cmd+Shift+I)
3. Click "+ New Agent"
4. Enter test prompt: "Hello world test"
5. Click Launch
6. Check console for:
   - `[Orchestrator] Creating session with prompt: Hello world test`
   - `[Orchestrator] Session created: {...}` (success)
   - OR error details (failure)

### 3. Debug Checklist

If still failing after API key set:

- [ ] Check Rust logs in terminal running `tauri:dev`
- [ ] Add `RUST_BACKTRACE=1` for stack traces
- [ ] Verify API key format (should start with `sk-ant-api03-`)
- [ ] Check network connectivity to api.anthropic.com
- [ ] Verify Tauri permissions in `tauri.conf.json`

---

## Backend Improvements

### Better Error Messages

In `src-tauri/src/orchestrator/commands.rs`, improve error handling:

```rust
// Current
let client = ClaudeClient::from_env().map_err(|e| e.to_string())?;

// Better
let client = ClaudeClient::from_env().map_err(|e| {
    match e {
        ClaudeError::MissingApiKey => "ANTHROPIC_API_KEY environment variable not set".to_string(),
        _ => e.to_string()
    }
})?;
```

### Add Health Check Command

```rust
#[tauri::command]
pub fn check_api_key() -> Result<bool, String> {
    match std::env::var("ANTHROPIC_API_KEY") {
        Ok(key) if !key.is_empty() => Ok(true),
        _ => Err("ANTHROPIC_API_KEY not configured".to_string()),
    }
}
```

---

## Frontend Improvements

### 1. Show API Key Status

Add status indicator in sidebar:

```tsx
// In OrchestratorSidebar
const [apiKeyValid, setApiKeyValid] = useState<boolean | null>(null);

useEffect(() => {
  invoke('check_api_key')
    .then(() => setApiKeyValid(true))
    .catch(() => setApiKeyValid(false));
}, []);

// In render
{apiKeyValid === false && (
  <div className="px-3 py-2 bg-destructive/10 text-destructive text-xs">
    API key not configured
  </div>
)}
```

### 2. Better Error Display

Show actual error from backend:

```tsx
{error && (
  <div className="p-2 bg-destructive/10 rounded text-xs text-destructive">
    <p className="font-medium">Error:</p>
    <pre className="mt-1 whitespace-pre-wrap">{error}</pre>
  </div>
)}
```

---

## Demo Polish

### Visual Improvements

- [ ] Add loading spinner in empty state when planning
- [ ] Animate cost counter updates
- [ ] Add subtle pulse on active session dot
- [ ] Smooth scroll to new messages

### UX Improvements

- [ ] Auto-focus textarea when "+ New Agent" clicked
- [ ] Keyboard shortcut (Cmd+N) for new agent
- [ ] Cmd+Enter to submit form
- [ ] Escape to cancel form

---

## Files Changed in UI Redesign

| File | Status | Notes |
|------|--------|-------|
| `orchestrator-layout.tsx` | NEW | Main layout component |
| `orchestrator-sidebar.tsx` | NEW | Sidebar with inline form |
| `session-columns.tsx` | NEW | Multi-column session view |
| `session-card.tsx` | NEW | Individual session display |
| `session-input.tsx` | NEW | Follow-up input |
| `message-bubble.tsx` | NEW | Message display |
| `workspace.tsx` | SIMPLIFIED | Now just renders OrchestratorLayout |
| `orchestrator-store.ts` | UPDATED | Added Message type, actions |
| `lib/ipc/orchestrator.ts` | UPDATED | Added messages to transforms |
| `globals.css` | CLEANED | Removed portal hacks |
| `index.ts` | UPDATED | New exports |

---

## Success Metrics

- [ ] Can create session (requires API key)
- [ ] Workers spawn in parallel
- [ ] Messages stream to UI
- [ ] Cost updates in real-time
- [ ] Session completes successfully
- [ ] Demo runs in < 60 seconds
