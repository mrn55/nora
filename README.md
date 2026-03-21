<p align="center">
  <h1 align="center">Nora</h1>
  <p align="center"><strong>The open-source control plane for autonomous AI agents.</strong></p>
  <p align="center">Deploy agents in 60 seconds. Connect 18 LLMs and 60+ tools. Monitor everything from one dashboard.</p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" />
  <img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg" alt="Node" />
  <img src="https://img.shields.io/badge/docker-compose-2496ED.svg" alt="Docker" />
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome" />
  <img src="https://img.shields.io/github/stars/solomon2773/nora?style=social" alt="Stars" />
  <img src="https://img.shields.io/github/contributors/solomon2773/nora" alt="Contributors" />
  <img src="https://img.shields.io/github/last-commit/solomon2773/nora" alt="Last Commit" />
</p>

<!-- <p align="center">
  <img src="docs/assets/nora-dashboard.gif" alt="Nora Dashboard" width="720" />
</p> -->

---

## What is Nora?

Nora is an open-source platform that gives you a complete control plane for running AI agents at scale. Provision agents as Docker-in-Docker sandboxed containers — or use NemoClaw for NVIDIA Nemotron-powered secure sandboxes — connect them to any LLM, wire up your tools, and manage everything from a clean web UI.

**Built on the OpenClaw gateway protocol** — each agent gets its own secure WS-RPC gateway with Ed25519 device identity, so you have real control over what your agents can do.

### Highlights

- **60-second deployment** — name your agent, pick an LLM, click deploy. Nora handles container provisioning, gateway setup, and key injection automatically.
- **Real agent control** — interactive terminal, streaming chat, session management, cron scheduling, and tool inventory per agent.
- **60+ integrations** — GitHub, Slack, Jira, Notion, Stripe, AWS, and more across 17 categories. Connect from the UI, no code needed.
- **18 LLM providers** — Anthropic, OpenAI, Google, Groq, Mistral, DeepSeek, OpenRouter, Together, Cohere, xAI, and more. Keys encrypted at rest with AES-256-GCM.
- **9 communication channels** — Slack, Discord, WhatsApp, Telegram, LINE, Email, Webhook, Microsoft Teams, SMS.
- **NemoClaw sandbox** — optional NVIDIA Nemotron-powered secure sandbox with deny-by-default networking and capability-restricted containers.
- **Self-hosted or PaaS** — run on your own infra with operator-controlled limits, or deploy as a SaaS with Stripe billing.
- **Pluggable backends** — Docker, Proxmox LXC, Kubernetes, or NemoClaw. Bring your own infrastructure.
- **Security first** — helmet, rate limiting, CORS whitelist, JWT + RBAC, AES-256-GCM encryption, Ed25519 device identity auth.

---

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & [Docker Compose](https://docs.docker.com/compose/install/) v2+
- Git

### 1. Clone & configure

```bash
git clone https://github.com/solomon2773/nora.git
cd nora
cp .env.example .env
```

Edit `.env` with your secrets:

```bash
# Required
JWT_SECRET=your-jwt-secret-here
ENCRYPTION_KEY=your-32-byte-hex-key    # openssl rand -hex 32

# Optional — OAuth (Google/GitHub login)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
NEXTAUTH_SECRET=your-nextauth-secret

# Optional — Billing (Stripe)
STRIPE_SECRET_KEY=
STRIPE_PRICE_PRO=
STRIPE_PRICE_ENTERPRISE=

# Optional — NemoClaw sandbox
NEMOCLAW_ENABLED=false
```

### 2. Start everything

```bash
docker compose up -d
```

That's it. Eight services start up automatically: Nginx, two frontends, backend API, worker, admin panel, PostgreSQL, and Redis. The database schema is applied on first boot.

### 3. Open the dashboard

| URL | What |
|---|---|
| [localhost:8080](http://localhost:8080) | Landing page |
| [localhost:8080/login](http://localhost:8080/login) | Login / Sign up |
| [localhost:8080/app/agents](http://localhost:8080/app/agents) | Agent fleet |
| [localhost:8080/app/deploy](http://localhost:8080/app/deploy) | Deploy new agent |
| [localhost:8080/api/health](http://localhost:8080/api/health) | API health check |

---

## What You Can Do

### Deploy Agents
Create agents with a name, optional custom container name, deploy mode (Docker or NemoClaw), and resource allocation. Agents are provisioned as isolated containers running the OpenClaw Gateway with pre-configured device identity.

### Manage Your Fleet
The fleet page shows all agents with status, container name/ID, and quick actions (start/stop). Click into any agent for the full detail view.

### Agent Detail — 6 Tabs

| Tab | What it does |
|---|---|
| **Overview** | Container info, resource allocation, status, quick actions |
| **Terminal** | Interactive web terminal (xterm.js + WebSocket) |
| **Logs** | Real-time log streaming |
| **OpenClaw** | 7 sub-panels: Status, Chat, Sessions, Channels, Integrations, Cron, Tools |
| **NemoClaw** | Secure sandbox panel (NemoClaw-mode agents only) |
| **Settings** | Config, LLM provider keys, danger zone (delete) |

### Connect LLM Providers
Set up API keys for any of 18 supported providers. Keys are encrypted with AES-256-GCM and automatically injected into agent containers on deploy.

### Wire Up Integrations
Browse 60+ integrations across 17 categories — developer tools, communication, AI/ML, cloud, data, monitoring, CRM, and more. Connect from the UI with per-integration config forms.

### Schedule Recurring Tasks
Use the Cron sub-panel to schedule recurring prompts with standard cron syntax. Agents execute tasks on schedule in new sessions.

---

## Architecture

```
                                    Users / Operators
                                          |
                                    +-----+-----+
                                    |   Nginx   |  :8080 (reverse proxy)
                                    +-----+-----+
                                          |
                  +-----------+-----------+-----------+
                  |           |           |           |
            /     |     /app/*    |    /admin/*  |     /api/*
                  v           v           v           v
          +-------+--+  +----+-----+  +--+------+  +-+--------+
          | Marketing|  | Dashboard|  |  Admin  |  | Backend  |
          |  Next.js |  |  Next.js |  | Next.js |  | Express  |
          | (landing,|  | (agents, |  | (ops    |  | (REST +  |
          |  login,  |  |  deploy, |  |  panel) |  |  WS-RPC) |
          |  signup) |  |  monitor)|  +---------+  +----+-----+
          +----------+  +----------+                    |
                                              +---------+---------+
                                              |                   |
                                        +-----+------+    +------+------+
                                        | PostgreSQL |    |    Redis    |
                                        |    15      |    |  7 + BullMQ|
                                        +------------+    +------+------+
                                                                 |
                                                          +------+------+
                                                          |   Worker    |
                                                          | Provisioner |
                                                          +------+------+
                                                                 |
                                    +------------+---------------+---------------+
                                    |            |               |               |
                              +-----+----+ +----+-----+  +------+-----+  +------+-----+
                              |  Docker  | |  Proxmox |  | Kubernetes |  |  NemoClaw  |
                              |  (DinD)  | |   (LXC)  |  |   (Pods)   |  |  (NVIDIA)  |
                              +-----+----+ +----------+  +------------+  +------------+
                                    |
                          +---------+---------+---------+
                          |         |         |         |
                     +----+---+ +--+---+ +---+--+ +----+---+
                     | Agent  | | Agent| | Agent| | Agent  |
                     | (OC GW)| | (OC) | | (OC) | | (OC GW)|
                     | :18789 | |      | |      | | :18789 |
                     +--------+ +------+ +------+ +--------+

  OC GW = OpenClaw Gateway (WebSocket-RPC per agent)
```


See [ARCHITECTURE.md](ARCHITECTURE.md) for the full technical breakdown including data flows, database schema, module inventory, and file map.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Reverse Proxy | Nginx |
| Frontend | Next.js 14, React 18, Tailwind CSS 3.4, Lucide React |
| Terminal | xterm.js |
| Backend | Express.js 4, Node.js 20 |
| Auth | NextAuth.js (Google/GitHub), bcryptjs, JWT |
| Database | PostgreSQL 15 |
| Queue | BullMQ + Redis 7 |
| Agent Gateway | OpenClaw WS-RPC, Ed25519 device identity |
| Encryption | AES-256-GCM |
| Billing | Stripe |
| Provisioner | dockerode, Proxmox API, Kubernetes API, NemoClaw |

---

## Project Structure

```
├── backend-api/            Express.js API + OpenClaw Gateway proxy
├── frontend-marketing/     Landing page, login, signup
├── frontend-dashboard/     Agent management dashboard
├── admin-dashboard/        Operator admin panel
├── workers/provisioner/    BullMQ worker (Docker/Proxmox/K8s/NemoClaw)
├── agent-runtime/          OpenClaw CLI agent runtime (reference)
├── e2e/                    Playwright E2E tests
├── infra/                  Backup & TLS configs
├── docs/                   Additional docs (HTTPS, etc.)
├── docker-compose.yml      Service orchestration
└── nginx.conf              Reverse proxy config
```

---

## Configuration

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `JWT_SECRET` | Yes | Secret for signing JWTs |
| `ENCRYPTION_KEY` | Yes | 32-byte hex key for AES-256-GCM (`openssl rand -hex 32`) |
| `PLATFORM_MODE` | No | `selfhosted` (default) or `paas` |
| `NEMOCLAW_ENABLED` | No | `true` to enable NemoClaw sandbox mode |
| `PROVISIONER_BACKEND` | No | `docker` (default), `proxmox`, `k8s` |
| `GOOGLE_CLIENT_ID` | For OAuth | Google OAuth credentials |
| `GOOGLE_CLIENT_SECRET` | For OAuth | |
| `GITHUB_CLIENT_ID` | For OAuth | GitHub OAuth credentials |
| `GITHUB_CLIENT_SECRET` | For OAuth | |
| `NEXTAUTH_SECRET` | For OAuth | NextAuth.js session secret |
| `STRIPE_SECRET_KEY` | For billing | Stripe API key |
| `STRIPE_PRICE_PRO` | For billing | Stripe price ID (Pro tier) |
| `STRIPE_PRICE_ENTERPRISE` | For billing | Stripe price ID (Enterprise tier) |
| `CORS_ORIGINS` | No | Comma-separated allowed origins |

### Self-Hosted Limits

When running in `selfhosted` mode, you can set operator limits:

| Variable | Default | Description |
|---|---|---|
| `SELFHOSTED_MAX_AGENTS` | 50 | Max agents per user |
| `SELFHOSTED_MAX_VCPU` | 16 | Max vCPU per agent |
| `SELFHOSTED_MAX_RAM_MB` | 32768 | Max RAM per agent |
| `SELFHOSTED_MAX_DISK_GB` | 500 | Max disk per agent |

### Provisioner Backends

| Backend | Env Value | Requirements |
|---|---|---|
| Docker | `docker` | Docker socket mounted (`/var/run/docker.sock`) |
| Proxmox | `proxmox` | Proxmox VE REST API credentials |
| Kubernetes | `k8s` | Kubeconfig or in-cluster service account |
| NemoClaw | `nemoclaw` | NVIDIA Nemotron endpoint + `NEMOCLAW_ENABLED=true` |

---

## Development

### Local development (without Docker)

```bash
git clone https://github.com/solomon2773/nora.git && cd nora

# Backend API (requires PostgreSQL + Redis running)
cd backend-api && npm install && npm run dev     # API on :3001

# Frontend dashboard
cd frontend-dashboard && npm install && npm run dev  # Dashboard on :3000

# Marketing site
cd frontend-marketing && npm install && npm run dev  # Landing on :3002
```

### Docker development

```bash
docker compose logs -f                    # All services
docker compose logs -f backend-api        # Single service
docker compose up -d --build backend-api  # Rebuild a service
```

### Access the database

```bash
docker compose exec postgres psql -U platform -d platform
```

### Run tests

```bash
cd backend-api && npx jest --no-watchman
```

---

## Roadmap

- [ ] Agent-to-agent communication
- [ ] Plugin marketplace
- [ ] Visual workflow builder
- [ ] Mobile companion app
- [ ] Multi-tenant teams & orgs
- [ ] Custom tool authoring SDK
- [ ] Agent templates & sharing

Have an idea? [Open a discussion](https://github.com/solomon2773/nora/discussions).

---

## API Reference

### Auth
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/signup` | Register |
| `POST` | `/api/auth/login` | Login (returns JWT) |
| `POST` | `/api/auth/oauth-login` | OAuth login |
| `GET` | `/api/auth/me` | Current user |

### Agents
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/agents` | List agents |
| `POST` | `/api/agents/deploy` | Deploy new agent |
| `GET` | `/api/agents/:id` | Agent detail |
| `POST` | `/api/agents/:id/start` | Start |
| `POST` | `/api/agents/:id/stop` | Stop |
| `POST` | `/api/agents/:id/restart` | Restart |
| `DELETE` | `/api/agents/:id` | Delete |

### OpenClaw Gateway (per agent)
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/agents/:id/gateway/status` | Gateway status |
| `POST` | `/api/agents/:id/gateway/chat` | Send chat message |
| `GET/POST` | `/api/agents/:id/gateway/sessions` | List/create sessions |
| `GET/POST` | `/api/agents/:id/gateway/cron` | List/add cron jobs |
| `GET` | `/api/agents/:id/gateway/tools` | List tools |

### LLM Providers
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/llm-providers/available` | Supported providers |
| `GET` | `/api/llm-providers` | Configured keys (masked) |
| `POST` | `/api/llm-providers` | Add provider key |
| `DELETE` | `/api/llm-providers/:id` | Remove provider key |

### Channels & Integrations
| Method | Path | Description |
|---|---|---|
| `GET/POST` | `/api/agents/:id/channels` | List/create channels |
| `GET` | `/api/integrations/catalog` | Browse catalog |
| `GET/POST` | `/api/agents/:id/integrations` | List/connect integrations |

Full API documentation available in [ARCHITECTURE.md](ARCHITECTURE.md).

---

## HTTPS / TLS

See [docs/HTTPS_SETUP.md](docs/HTTPS_SETUP.md) for instructions on setting up TLS with Let's Encrypt, Cloudflare, or Traefik.

---

## Database Backups

```bash
docker compose run --rm backup
```

Backups are saved to the `backups` Docker volume. Configure `AWS_S3_BUCKET` for automatic S3 uploads.

---

## We're Looking for Contributors!

Nora is in active development and we're looking for developers who want to help shape the future of AI agent infrastructure. Whether you're into frontend, backend, DevOps, or AI — there's meaningful work to pick up.

**Areas we need help with:**
- **Frontend** — React components, dashboard UX, data visualization
- **Backend** — API endpoints, provisioner backends, queue workers
- **Integrations** — adding new third-party connectors (60+ and growing)
- **Documentation** — tutorials, guides, API docs
- **Testing** — unit tests, E2E tests, load testing
- **DevOps** — Kubernetes support, CI/CD, container security

**Why contribute?**
- Active development — new features shipping weekly
- Beginner-friendly — issues tagged `good first issue` with clear scope
- Real users — your code ships to production
- Clean stack — Next.js, Express, PostgreSQL. No obscure frameworks.
- Responsive maintainers — PRs reviewed within 48 hours

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## Community

- [Discussions](https://github.com/solomon2773/nora/discussions) — ideas, questions, and RFC proposals
- [Issues](https://github.com/solomon2773/nora/issues) — bug reports and feature requests

---

## License

This project is open source under the [MIT License](LICENSE).
