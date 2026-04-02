# Nora Adoption Checklist

Use this checklist to evaluate Nora from an OSS-first point of view.

## Three common adoption paths

| If someone says... | Recommended path | Why |
|---|---|---|
| "We want to run Nora on our own infrastructure." | **Self-host Nora** | The repo, setup scripts, and Docker Compose flow are the clearest trust path. |
| "We want to use Nora commercially inside our business or for customers." | **Apache 2.0 commercial use path** | The license allows commercial use by anyone under the Apache 2.0 terms. |
| "We want to start with OpenClaw now but avoid locking our long-term story to one runtime." | **Runtime-direction path** | Nora is strongest with OpenClaw today, while docs and product direction should remain integration-friendly. |

## Self-host checklist

- [ ] Can they use the setup script or Docker Compose flow?
- [ ] Can they create the initial operator account?
- [ ] Can they add one LLM provider key?
- [ ] Can they deploy one runtime and validate chat, logs, and terminal?
- [ ] Can they see enough operator proof to trust the self-hosted path?

## Apache 2.0 commercial-use checklist

- [ ] Do they understand Nora can be used commercially under Apache 2.0?
- [ ] Do they plan to run it for internal teams, customers, or clients?
- [ ] Do they know they can build service layers, workflows, or packaging around it?
- [ ] Do they understand that operational responsibility stays with whoever runs the deployment?

## Runtime-direction checklist

- [ ] Are they starting with OpenClaw as the best-supported runtime today?
- [ ] Do the docs avoid implying Nora is permanently OpenClaw-only?
- [ ] Is the product story broad enough for future runtime adapters?
- [ ] Do screenshots and README sections reinforce current proof without closing future direction?

## Supporting docs

- `README.md`
- `docs/OPEN_SOURCE_USAGE.md`
- `docs/IMPLEMENTATION_PROOF.md`
- `docs/README_SCREENSHOT_PLAN.md`
- `docs/MARKETING_PROOF_ASSET_PLAN.md`
