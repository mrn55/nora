# Nora Open-Source Implementation Proof

This document lists which parts of Nora's OSS story are backed by code in this repository today.

## Proof table

| Claim | What exists in repo today | Where to verify | Why it matters |
|---|---|---|---|
| **Self-hosted install path** | Nora ships repo-native install flows for Bash and PowerShell plus Docker Compose setup. | `setup.sh`, `setup.ps1`, `docker-compose.yml`, `.env.example`, `README.md` | The open-source path is real, not a placeholder. |
| **Operator account flow** | The app includes login and signup surfaces plus backend auth endpoints. | `frontend-marketing/pages/login.js`, `frontend-marketing/pages/signup.js`, `backend-api/server.js` | The product has a real operator entry path, not just a landing page. |
| **Agent operations UI** | Nora includes dashboard, deploy, logs, settings, and runtime-management surfaces. | `frontend-dashboard/pages/*`, `frontend-dashboard/components/*` | The repo contains a real operator product. |
| **Runtime direction** | OpenClaw is the strongest supported runtime today, while product language and docs stay open to future runtime integrations. | `README.md`, `frontend-marketing/pages/index.js`, `frontend-marketing/pages/pricing.js` | This keeps the current proof honest without turning Nora into a permanently single-runtime story. |
| **Commercial use by anyone** | The repo is licensed under Apache 2.0. | `LICENSE` | Operators can self-host, modify, and use Nora commercially under the Apache 2.0 terms. |

## What the repo should prove first

1. **Installability** — someone can get Nora running from the repo
2. **Operator workflow** — someone can create an account, add a provider, and deploy a runtime
3. **Control-plane value** — chat, logs, terminal, and monitoring work from one surface
4. **Runtime honesty** — OpenClaw is strongest today without being framed as the permanent only-runtime future

## What should not be the main proof burden

The repo should not need to center proof around:

- maintainer-led sales intake
- enterprise packaging language
- gated commercial conversations before trust is earned
- marketing claims that outrun the repo and screenshots

The strongest proof is still the product itself.
