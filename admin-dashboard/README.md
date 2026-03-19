# Admin Dashboard

Internal administration panel for Nora platform operators. Built with Next.js.

## Overview

Runs on `/admin/*` behind nginx. Provides platform-wide visibility into users, agents, and system health.

## Features

- **User Management** — view registered users, roles, and account status
- **Agent Monitoring** — platform-wide agent fleet overview
- **Node Capacity** — provisioner backend health and resource usage
- **System Logs** — centralized log viewer

## Development

```bash
# Runs automatically in Docker Compose with hot reload
docker compose logs -f admin-dashboard

# Local development (outside Docker)
cd admin-dashboard
npm install
npm run dev   # Starts on port 3002
```
