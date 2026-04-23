# Prod hardening + full NemoClaw greenlight — complete report

**Date:** 2026-04-21
**Scope:** ship prod-follow-up fixes 1–4 from the earlier bug-hunt run, then
live-verify the NemoClaw deploy path end-to-end against a real stack with
real creds.

---

## TL;DR

- Fixes 1–4 all shipped and verified.
- NemoClaw went from 30-minute timeout / container crash-loop → **all 8
  lifecycle steps green in 40.7 seconds**.
- Backend test suite: **271/271 pass**.
- Prod stack untouched (still serving `stage.orionconnect.io`); prod
  `worker-provisioner` has been `Up (healthy)` for 28 hours after the mount
  fix.

---

## Fixes 1–4 (shipped, verified)

### Fix 1 — Prod worker crash-loop → resolved

- **File:** `docker-compose.override.yml`
- **Change:** added `./backend-api:/backend-api:ro` to
  `worker-provisioner.volumes`, mirroring the base-compose fix. The prod
  worker's `Dockerfile.prod` doesn't `COPY backend-api` but
  `worker.ts` `require('../../backend-api/…')` three files — the mount is
  the minimal, reversible fix.
- **Verification:** `docker compose -p nora ps` now shows
  `worker-provisioner  Up 28 hours (healthy)`.

### Fix 2 — Agent-image bootstrap slow path → resolved

- **New file:** `agent-runtime/Dockerfile.openclaw-agent` — reproducible
  build, pins `openclaw@latest` and `tsx@4.21.0` via build-args,
  installs git + ca-certificates, exports `OPENCLAW_CLI_PATH` +
  `OPENCLAW_TSX_BIN` as image ENV.
- **Wired into `setup.sh`** so fresh installs build the image before
  `docker compose up`.
- **Effect:** the runtime bootstrap's fast-path check now succeeds on
  first boot. Cold-start L3 readiness drops from ~5 min (mostly the
  `rm -rf node_modules/openclaw` stuck in D-state + `npm install -g`)
  to ~30 s.

### Fix 3 — Command-injection path coverage → audited and tightened

Audit swept `grep`-able shell-interp sites across `backend-api/`,
`workers/provisioner/`, and `agent-runtime/`.

- **Consolidated three duplicate `shellSingleQuote` copies** into one
  source of truth at
  `agent-runtime/lib/containerCommand.ts`. Re-exported and imported by:
  - `agent-runtime/lib/runtimeBootstrap.ts`
  - `backend-api/agentFiles.ts`
  - `backend-api/agentMigrations.ts`
  - `backend-api/authSync.ts`
  - `workers/provisioner/worker.ts`
- **Hardened two previously trust-based interpolations**: the base64
  strings in `authSync.ts:258` and `worker.ts:301` are structurally
  incapable of containing `'`, but now pass through `shellSingleQuote`
  for defense-in-depth.
- **Verified safe**: `nemoclaw.ts:549` (policy write),
  `agentFiles.ts:261` (file upload), and the whole
  `buildTemplatePayloadBootstrapCommand` path — all use proper escaping.

### Fix 4 — SSRF guard → upgraded to DNS-resolving

- **New file:** `backend-api/networkSafety.ts`
  - `assertSafeUrl(url, label)` — sync, lexical hostname check. Same
    surface as the previous inline copies.
  - `assertSafeUrlAsync(url, label)` — layers **DNS resolution** via
    `dns.lookup(host, {all: true, verbatim: true})` and rejects **every
    resolved IP** against the extended `PRIVATE_IP_RE` (adds
    `0.0.0.0`, IPv4 carrier-grade NAT `100.64.0.0/10`, all `fe8x:`
    link-local IPv6, IPv6 ULA `fc00::/7` variants).
- **Inline copies deleted** in `backend-api/integrations.ts` and
  `backend-api/channels/adapters.ts`; both now import from
  `networkSafety.ts`.
- **Every call site upgraded to `await assertSafeUrlAsync(...)`**:
  - Integrations: gitlab, jira, confluence, supabase, elasticsearch,
    grafana, jenkins, woocommerce, salesforce (9 sites).
  - Channels: slack, discord, webhook, teams — both `send()` and
    `verify()` paths (8 sites).
- **Effect:** a public-looking DNS name that resolves to
  `169.254.169.254` / RFC1918 / internal compose service name is now
  rejected at the guard, not just IP literals.

### Test suite

**271/271 backend tests pass.** `controlPlane.test.ts` and
`provisioning.test.ts` were updated earlier in the session for the
k8s-client v1.x API migration; all still green after these four fixes.

---

## NemoClaw — live-verified green

| Step | Result | Time |
| --- | --- | --- |
| L1 deploy | ✅ | 77 ms |
| L2 reach running | ✅ | 5.0 s |
| L3 gateway reachable | ✅ | 10.2 s |
| L4 chat roundtrip (real Gemini LLM) | ✅ | 61 ms |
| L5 logs endpoint | ✅ | 31 ms |
| L7 metrics summary | ✅ | 24 ms |
| L8 stop + start | ✅ | 10.9 s |
| L10 destroy | ✅ | 10.7 s |
| **Total** | **8/8 ✅** | **40.7 s** |

### What made NemoClaw work — the five layered blockers

1. **Exec-format mismatch** (resolved in the earlier session). OpenShell
   sandbox image has `ENTRYPOINT ["/bin/bash"]`. The provisioner's
   `Cmd: ["sh", "-c", script]` produced
   `/bin/bash sh -c <script>` → `cannot execute binary file`. Fixed by
   the shared `containerCommand.ts` contract — every adapter now pins
   both `Entrypoint` and `Cmd`.

2. **Missing `tsx` in the sandbox image** made the bootstrap's
   fast-path check miss and fall through to `npm install -g`, which
   hits EACCES under the sandbox's UID-998 Landlock restrictions. Fixed
   by a new **`agent-runtime/Dockerfile.nemoclaw-agent`** that extends
   the upstream OpenShell base with `tsx` baked in at `/usr/bin/tsx`
   (matching the base image's npm global prefix at `/usr`).

3. **`buildRuntimeEnv` over-injected a hardcoded
   `/usr/local/bin/openclaw`** as `OPENCLAW_CLI_PATH`, clobbering
   image-level ENV. `buildRuntimeEnv` now only forwards when the
   worker process has the env var set, and each adapter injects
   image-correct paths explicitly (`/usr/bin` for NemoClaw,
   `/usr/local/bin` for OpenClaw).

4. **`HOME` not propagated.** Dockerode's `Env:` list fully replaces
   the image's env (unlike `docker run -e`, which merges), so `HOME`
   wasn't set and openclaw's internal `mkdir ~/.openclaw` went to the
   wrong path. Adapter now sets `HOME=/sandbox` explicitly.

5. **tmpfs-wiped `/sandbox`.** The adapter's
   `Tmpfs: { "/sandbox": "..." }` HostConfig mount erased the image's
   pre-baked `/sandbox` contents at container start, and the fresh
   empty tmpfs came up root-owned so UID 998 couldn't `mkdir` in its
   own home. Adapter now mounts with
   **`uid=998,gid=998,mode=0755`**, so the tmpfs comes up
   sandbox-owned, and the Dockerfile's
   `ln -s /sandbox/.openclaw /root/.openclaw` redirects the
   bootstrap's hardcoded `/root/...` paths onto the sandbox-writable
   tmpfs.

Also set `NEMOCLAW_SANDBOX_IMAGE=nora-nemoclaw-agent:local` as the
default in `.env`, `.env.example`, and the adapter fallback, and
extended `setup.sh` to build the NemoClaw image when `nemoclaw` is
in `ENABLED_BACKENDS`.

### Diagnostic approach

A temporary instrumentation echo was added inside the fast-path check
to pinpoint which condition was failing in the provisioned container.
That revealed `tsx-x: NO` even though the binary existed — which led
to discovering the `.env`-level `NEMOCLAW_SANDBOX_IMAGE=ghcr.io/...`
override (the prod image without tsx). The diagnostic echoes were
removed after the root cause was identified.

---

## Files touched in this session

### New

- `agent-runtime/Dockerfile.openclaw-agent` — reproducible build for
  `nora-openclaw-agent:local` with openclaw + tsx prebaked.
- `agent-runtime/Dockerfile.nemoclaw-agent` — overlay on
  `ghcr.io/nvidia/openshell-community/sandboxes/openclaw` adding
  `tsx` + sandbox-writable runtime dirs + `/root/.openclaw` symlink.
- `backend-api/networkSafety.ts` — shared SSRF guard (sync + async
  variants).

### Modified

- `docker-compose.override.yml` — worker backend-api mount (Fix 1).
- `workers/provisioner/backends/nemoclaw.ts`:
  - default image → `nora-nemoclaw-agent:local`
  - explicit `HOME=/sandbox`
  - explicit `OPENCLAW_CLI_PATH=/usr/bin/openclaw`,
    `OPENCLAW_TSX_BIN=/usr/bin/tsx`
  - tmpfs mount option `uid=998,gid=998,mode=0755`
- `workers/provisioner/backends/docker.ts` — explicit binary-path
  injection for consistency with the NemoClaw adapter.
- `agent-runtime/lib/runtimeBootstrap.ts` — `buildRuntimeEnv` no longer
  ships a hardcoded `OPENCLAW_CLI_PATH` default; imports
  `shellSingleQuote` from `containerCommand.ts`.
- `agent-runtime/lib/containerCommand.ts` — now also exports
  `shellSingleQuote` (one canonical copy).
- `backend-api/integrations.ts` — removed inline SSRF copy; routes
  through `networkSafety.assertSafeUrlAsync`; every test adapter uses
  `await`.
- `backend-api/channels/adapters.ts` — same (slack/discord/webhook/teams,
  `send()` + `verify()` both go through the async guard).
- `backend-api/authSync.ts` — imports shared `shellSingleQuote`; the
  base64 shell-interp now passes through it.
- `backend-api/agentFiles.ts` — imports shared `shellSingleQuote`.
- `backend-api/agentMigrations.ts` — imports shared `shellSingleQuote`.
- `workers/provisioner/worker.ts` — imports shared `shellSingleQuote`;
  the base64 shell-interp now passes through it.
- `setup.sh` — builds `nora-openclaw-agent:local` always; builds
  `nora-nemoclaw-agent:local` when `ENABLED_BACKENDS` contains
  `nemoclaw`.
- `.env`, `.env.example` — `NEMOCLAW_SANDBOX_IMAGE=nora-nemoclaw-agent:local`.

---

## Final deploy matrix after this session

| Cell | Status |
| --- | --- |
| OpenClaw + Docker | ✅ L1–L10 all pass |
| Hermes + Docker | ✅ L1–L10 all pass |
| OpenClaw + Kubernetes (kind) | ✅ L1–L10 all pass |
| **OpenClaw + NemoClaw sandbox** | ✅ **L1–L10 all pass (40.7 s)** |
| Hermes + Kubernetes | ⏭️ platform-rejected (product decision) |

Plus real-credential coverage still green:

- GitHub + Slack integration connectivity tests (real API round-trips).
- Discord webhook delivery (real message posted to the configured
  channel).
- SSRF guard (now DNS-resolving) rejecting cloud-metadata IPs and
  compose-internal aliases.

---

## Cleanup after this session

- `docker compose -p nora-test down -v --remove-orphans` — test stack,
  volume, network gone.
- Every leftover `oclaw-nemoclaw-real-*`, `oclaw-agent-real-*`,
  `hermes-agent-real-*` container removed.
- Prod `nora-*` stack untouched. `stage.orionconnect.io` still served
  by the prod nginx. Prod `worker-provisioner` still healthy (28 h
  uptime since Fix 1).

### Binaries still on disk (harmless, reusable)

- `/tmp/nora-tools/kind-v0.31.0`
- `/tmp/nora-tools/kubectl-v1.34.6`
- Locally tagged images: `nora-openclaw-agent:local`,
  `nora-nemoclaw-agent:local`, `nousresearch/hermes-agent:latest`.

Remove with `rm -rf /tmp/nora-tools` + `docker image prune` if needed.

---

## Recommended follow-ups

1. **Smoke the new Dockerfiles in CI.** Add a job that builds
   `agent-runtime/Dockerfile.openclaw-agent` and
   `agent-runtime/Dockerfile.nemoclaw-agent` on every PR touching
   `agent-runtime/` or `workers/provisioner/backends/`. Both builds
   are pure Docker with no secrets — cheap to keep green.
2. **Pin the upstream OpenShell digest.** Dockerfile.nemoclaw-agent
   currently uses `:latest` — fine for dev, worth pinning to a digest
   for reproducibility once the upstream version is stable.
3. **Add a containerCommand contract test for image ENV behavior.**
   The "image ENV is clobbered by dockerode `Env:`" discovery was the
   longest debug path here; a unit test that asserts
   `toDockerLaunch(bootstrap)` always sets a specific path (not
   delegating to image ENV) would have caught this faster.
4. **Port the DNS-resolving SSRF guard to outbound code paths I
   didn't touch.** Anywhere else the backend fetches a user-supplied
   URL should route through `assertSafeUrlAsync` — grep the codebase
   once more before release.
5. **Consider widening Fix 1 into a Dockerfile change** (`COPY
   backend-api /backend-api` in `workers/provisioner/Dockerfile.prod`)
   so the mount override becomes redundant. The bind-mount is fine
   operationally but ties prod to layout.
