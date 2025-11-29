# Claude Desktop Research Results

**Date**: 2025-11-28
**Researcher**: Claude Desktop
**Source**: GitHub API, upstream repository analysis

---

## 1. Upstream Issues Summary

### Critical/Blocking Issues

| Issue | Title | Impact on Fork |
|-------|-------|----------------|
| #601 | MCP Server Windows Incompatibility | Must use WSL for MCP |
| #574 | better-sqlite3 Windows Build Failures | WSL required |
| #345 | CLI Command Registration Pattern | Explains missing verification commands |
| #171 | Version Display Hardcoded | Shows v1.0.45 instead of package.json version |

### Relevant to Fork

| Issue | Title | Notes |
|-------|-------|-------|
| #706 | Dynamic Version from package.json | PR with fix for version bug |
| #266 | Test Path Configuration | Jest expects `src/__tests__/` but tests in `tests/` |
| #872 | WSL ENOTEMPTY Error | Fixed in v2.7.35 (already merged) |
| #865 | Memory Stats Zeros | Fixed in v2.7.32 (already merged) |

### Can Ignore (Already Fixed or Not Relevant)
- Issues fixed in v2.7.33-2.7.35 (already merged)
- Deno-specific issues (we use Node.js)
- Flow Nexus cloud-specific issues

---

## 2. Pull Requests

### Should Merge/Apply Pattern From

| PR | Title | Why Relevant |
|----|-------|--------------|
| #706 | Fix version display | Uses dynamic version from package.json |

### Already Incorporated (v2.7.35)
- #886 - GitHub workflow build issues
- #866 - AgentDB update
- Multi-platform CI/CD fixes

---

## 3. MCP 2025-11 Specification Findings

### Key Details
- **Version Format**: YYYY-MM (e.g., '2025-11')
- **Progressive Disclosure**: 98.7% token reduction (150k → 2k tokens)
- **Lazy Loading**: Tools loaded on first invocation, not startup
- **10x Faster Startup**: 500-1000ms → 50-100ms
- **90% Memory Reduction**: ~50MB → ~5MB

### How to Enable
```bash
npx claude-flow mcp start --mcp2025
```

### Implementation Files
- `src/mcp/mcp-server.js` - Dual-mode operation (2025-11 + legacy)
- Server factory with automatic feature detection

---

## 4. AgentDB v1.6.1 Notes

### Performance Improvements
- 150x faster vector search (HNSW indexing)
- 56% memory reduction
- O(log n) search complexity

### API Changes
- ReasoningBank integration for semantic memory
- SQLite backend (`.swarm/memory.db`) with JSON fallback
- Pattern recognition and confidence scoring

### Key Files
- `docs/agentdb/PRODUCTION_READINESS.md`
- `src/reasoningbank/`

---

## 5. CI/CD Status Analysis

### Workflow Issues Found
- **Test paths wrong**: CI expects `src/__tests__/` but tests in `tests/`
- **Windows incompatible**: Native Windows builds fail for sqlite
- **Solution**: Run tests in WSL, update path configuration

### Fix Pattern (from Issue #266)
```json
// package.json test scripts should use:
"test": "NODE_OPTIONS='--experimental-vm-modules' jest",
"test:unit": "jest tests/unit",
"test:integration": "jest tests/integration"
```

---

## 6. ⚠️ CRITICAL: Upstream Truth Verification System

### Discovery
Upstream ALREADY HAS a built-in "Truth Verification System":

```bash
# Upstream verification commands
npx claude-flow@alpha verify init strict
npx claude-flow@alpha truth
```

### Upstream System Features
- 0.95 accuracy threshold (strict mode)
- Auto-rollback capability
- Consensus verification
- Built into main CLI

### Comparison Needed
| Aspect | Fork System (`src/verification/`) | Upstream System |
|--------|-----------------------------------|-----------------|
| Lines of Code | ~20,000 | Unknown |
| Threshold | Configurable | 0.95 strict |
| CLI Registration | ❌ Not registered | ✅ Built-in |
| Deception Detection | ✅ Yes | Unknown |

### Risk
- Possible duplication of effort
- Potential conflicts between systems
- Need to determine: merge, replace, or differentiate?

---

## 7. Recommended Actions for Claude Code

### Immediate (Do Now)

1. **Fix Version Bug**
   ```bash
   grep -r "1.0.45" src/
   # Apply PR #706 pattern: read version from package.json dynamically
   ```

2. **Register Verification Commands**
   - Study `src/cli/simple-commands/` registration pattern
   - Add verification to command registry

3. **Compare Verification Systems**
   ```bash
   # Check upstream verify commands
   grep -r "verify\|truth" src/cli/
   # Compare with src/verification/
   ```

### Short-Term

4. **Update Test Configuration**
   - Fix Jest paths in package.json
   - Update CI workflow paths

5. **Test MCP Server (in WSL)**
   ```bash
   npx @modelcontextprotocol/inspector node dist/src/cli/main.js
   ```

### Medium-Term

6. **Decide on Verification Strategy**
   - Option A: Replace fork system with upstream
   - Option B: Enhance fork system, contribute back
   - Option C: Differentiate (fork = advanced, upstream = basic)

---

## 8. Files to Examine

| File | Purpose |
|------|---------|
| `src/cli/main.ts` | CLI entry point, command registration |
| `src/cli/command-registry.js` | Where commands get registered |
| `src/cli/simple-commands/verification.js` | Fork verification (not registered) |
| `package.json` | Version field, test scripts |
| `.github/workflows/ci.yml` | Test path configuration |

---

## 9. Test Commands

```bash
# Find version hardcoding
grep -r "1.0.45" src/

# Check upstream verify commands
node dist/src/cli/main.js verify --help
node dist/src/cli/main.js truth --help

# Test MCP (WSL only)
npx @modelcontextprotocol/inspector node dist/src/cli/main.js

# Run tests (WSL)
npm test
```

---

*Research completed by Claude Desktop. Handoff back to Claude Code for implementation.*
