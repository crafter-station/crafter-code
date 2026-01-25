# Crafter Code - Product Plan

> Agent-first IDE for 10-person $100B companies.

## Vision

Enable small, high-agency teams to build billion-dollar companies with AI agents. Track revenue per employee, not headcount.

## Core Pillars

### 1. Multi-Agent Orchestration
- Run multiple AI agent sessions in parallel
- Real-time visualization of agent activity
- Session handoff between agents
- Ralph Wiggum iterative loops built-in

### 2. Real-time Codebase Tracking
- Live diff visualization as agents modify files
- Git timeline of agent-made changes
- Undo/redo at any granularity
- Branch per agent session

### 3. Skills Marketplace
- Install skills with one command: `npx skills add <owner/repo>`
- Browse/search community skills
- Create and publish custom skills
- Skill analytics and ratings

### 4. Native AI Gateway
- Vercel AI Gateway integration
- Model routing (Haiku/Sonnet/Opus)
- Cost tracking per session
- Rate limiting and budgets

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Tauri Shell                       │
├─────────────────────────────────────────────────────┤
│  Next.js 15 (Turbopack)                            │
│  ├── Dashboard (Agent sessions)                     │
│  ├── Workspace (Code editor + Terminal)            │
│  ├── Skills Browser                                 │
│  └── Settings                                       │
├─────────────────────────────────────────────────────┤
│  Rust Core                                          │
│  ├── Agent Process Manager                          │
│  ├── File System Watcher                           │
│  ├── Git Operations                                │
│  └── AI Gateway Client                             │
└─────────────────────────────────────────────────────┘
```

## Phase 1: Foundation (MVP)

- [ ] Tauri app shell with Next.js
- [ ] Single terminal with agent execution
- [ ] Basic file tree viewer
- [ ] Live output streaming
- [ ] Simple session history

## Phase 2: Multi-Agent

- [ ] Split panes for multiple agents
- [ ] Agent status indicators
- [ ] Session naming and tagging
- [ ] Pause/resume/cancel controls
- [ ] Shared context between agents

## Phase 3: Skills Integration

- [ ] Skills browser UI
- [ ] One-click install to `~/.claude/skills/`
- [ ] Installed skills management
- [ ] Skill usage analytics
- [ ] Community ratings

## Phase 4: Enterprise

- [ ] Team workspaces
- [ ] Shared agent configurations
- [ ] Cost allocation per project
- [ ] Audit logs
- [ ] SSO (Clerk integration)

## Tech Stack

| Layer | Technology |
|-------|------------|
| Shell | Tauri 2.0 |
| Frontend | Next.js 15, React 19 |
| Styling | Tailwind CSS, shadcn/ui |
| State | Zustand |
| Terminal | xterm.js |
| Editor | Monaco Editor |
| Backend | Rust (agent manager) |
| AI | Vercel AI SDK + Gateway |
| Auth | Clerk |
| Analytics | PostHog |

## Metrics

Track and optimize for:
1. **Revenue per employee** - primary metric
2. Agent success rate
3. Time saved per task
4. Skills installed/used
5. Session completion rate

## Competitors

| Product | Focus | Gap |
|---------|-------|-----|
| Cursor | AI in editor | No agent orchestration |
| Windsurf | Agentic | Single agent focus |
| Claude Code CLI | Terminal | No GUI, single session |
| Cline | VSCode | Extension, not native |

**Our angle**: Native, multi-agent, skills marketplace, built for the "first 10-person $100B company" thesis.

## Revenue Model

1. **Free**: Single agent, basic skills
2. **Pro ($29/mo)**: Multi-agent, all skills, usage analytics
3. **Team ($99/seat/mo)**: Shared workspace, admin controls
4. **Enterprise**: SSO, audit, SLA

## Launch Strategy

1. **Week 1-2**: MVP with single agent + Tauri shell
2. **Week 3-4**: Skills browser integration
3. **Week 5-6**: Multi-agent support
4. **Week 7-8**: Public beta on Product Hunt

## Links

- GitHub: https://github.com/crafter-station/crafter-code
- Production: https://code.crafter.run
- Skills Ecosystem: https://skills.dev
- Ralph Wiggum: https://awesome-claude.com/ralph-wiggum
