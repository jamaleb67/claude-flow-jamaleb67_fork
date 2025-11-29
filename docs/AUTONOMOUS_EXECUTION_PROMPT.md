# Autonomous Execution Prompt
## For Claude Code / Manus 1.5 / Any LLM Agent

---

## MISSION BRIEFING

You are an autonomous software engineer working on the **claude-flow** project, specifically the **Truth Score Verification System**.

### Project Context
- **Repository:** `jamaleb67/claude-flow` (fork of `ruvnet/claude-flow`)
- **Branch:** `funny-wilbur` (worktree)
- **Primary Worktree:** `gallant-lamport` (source of truth)
- **Language:** TypeScript (ESM modules)
- **Build Tool:** SWC
- **Database:** AgentDB (SQLite-based vector store)

### Current State
The Truth Score persistence layer has been implemented but needs:
1. Commit to git
2. WSL setup for native module support
3. Integration testing
4. PR creation

---

## EXECUTION PROTOCOL

### Step 1: Environment Verification
```bash
# Verify you're in the correct directory
pwd
# Expected: /mnt/c/Users/jamal/.claude-worktrees/claude-flow/gallant-lamport

# Check git status
git status
# Expected: Modified files in src/verification/

# Verify node/npm
node --version && npm --version
```

### Step 2: Commit Changes (if not done)
```bash
git add src/verification/truth-db-adapter.ts
git add src/verification/hooks.ts
git add src/verification/index.ts
git add src/memory/backends/agentdb.js

git commit -m "feat(verification): Add TruthDBAdapter persistence layer

- Create TruthDBAdapter for AgentDB integration
- Inject persistence into VerificationHookManager
- Add fire-and-forget async saves for contexts and snapshots
- Physical segregation: .agentdb/truth-scores.db
- Graceful fallback to in-memory when AgentDB unavailable

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### Step 3: Build Verification
```bash
npm run build
# If SWC not found, use: npx swc src -d dist --config-file .swcrc

# Fix known conflict (swarm-memory.js overwrites .ts output)
rm dist/src/memory/swarm-memory.js
npx swc src/memory/swarm-memory.ts -o dist/src/memory/swarm-memory.js
```

### Step 4: Smoke Test
```bash
node dist/src/cli/main.js verification status
# Expected output:
# 📊 Verification System Status
# ================================
# Status: Active
```

### Step 5: Integration Test (WSL Required)
```bash
# Create a test verification context
node -e "
const { verificationHookManager } = require('./dist/src/verification/index.js');
console.log('Storage ready:', verificationHookManager.isStorageReady());
verificationHookManager.getStorageStats().then(console.log);
"
```

### Step 6: Create PR
```bash
git push origin funny-wilbur

gh pr create \
  --title "feat(verification): Add TruthDBAdapter persistence layer" \
  --body "## Summary
- Implements persistent storage for Truth Score verification contexts
- Uses AgentDB with physical segregation (.agentdb/truth-scores.db)
- Graceful fallback to in-memory when native modules unavailable

## Test Plan
- [x] Smoke test: verification status command works
- [ ] Integration test: contexts persist across restarts
- [ ] WSL test: native modules compile correctly

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## ERROR HANDLING

### If AgentDB fails to initialize:
```
ERROR: AgentDB is not a constructor
```
**Action:** This is expected on Windows. Either:
1. Run in WSL (recommended)
2. Accept in-memory fallback (data won't persist)

### If build fails with syntax errors:
```
SyntaxError: ...
```
**Action:** Check for:
1. Missing `.js` extensions on imports (ESM requirement)
2. Duplicate .js/.ts files in src/ causing conflicts
3. Broken exports in index.ts

### If verification command not found:
```
Unknown command: verification
```
**Action:** Ensure `src/cli/commands/index.ts` has the verification command registered.

---

## SUCCESS CRITERIA

✅ `git log` shows commit with TruthDBAdapter changes
✅ `npm run build` completes without errors
✅ `verification status` command outputs "Status: Active"
✅ PR created and visible on GitHub
✅ (Optional) AgentDB initializes in WSL environment

---

## CONTEXT FILES TO READ

If you need more context, read these files in order:
1. `docs/THREAD_HANDOFF.md` - Session summary
2. `src/verification/truth-db-adapter.ts` - The adapter implementation
3. `src/verification/hooks.ts` - Where persistence is injected
4. `src/verification/index.ts` - Module exports

---

## COMMUNICATION PROTOCOL

When reporting back, use this format:

```
## Execution Report

### Completed Steps
- [x] Step 1: Environment verified
- [x] Step 2: Changes committed (hash: abc123)
- [ ] Step 3: Build failed - see error below

### Errors Encountered
[paste error output]

### Resolution Attempted
[describe what you tried]

### Next Action Required
[what the human needs to do, or what the next agent should do]
```
