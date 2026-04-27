#!/usr/bin/env bash
# ============================================================
# Nora — One-line installer & setup
# ============================================================
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/solomon2773/nora/master/setup.sh | bash
#   — or —
#   bash setup.sh        (from inside the repo)
#   bash setup.sh --update
#   bash setup.sh --clean-reinstall
#
# Clones the repo (if needed), generates secrets and database
# credentials, configures the platform, and starts Nora.
# ============================================================

set -euo pipefail

ENV_FILE=".env"
ENV_BACKUP_FILE=""
PUBLIC_NGINX_TEMPLATE="infra/nginx_public.conf.template"
TLS_NGINX_TEMPLATE="infra/nginx_tls.conf"
PUBLIC_PROD_COMPOSE_OVERRIDE_TEMPLATE="infra/docker-compose.public-prod.yml"
TLS_COMPOSE_OVERRIDE_TEMPLATE="infra/docker-compose.public-tls.yml"
PUBLIC_NGINX_CONF="nginx.public.conf"
COMPOSE_OVERRIDE_FILE="docker-compose.override.yml"
SETUP_MODE=""

# ── Color helpers ────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()  { printf "${CYAN}[info]${NC}  %s\n" "$1"; }
ok()    { printf "${GREEN}[ok]${NC}    %s\n" "$1"; }
warn()  { printf "${YELLOW}[warn]${NC}  %s\n" "$1"; }
error() { printf "${RED}[error]${NC} %s\n" "$1"; }
header(){ printf "\n${BOLD}${CYAN}── %s ──${NC}\n\n" "$1"; }

usage() {
  cat <<'EOF'
Usage: bash setup.sh [--install | --update | --clean-reinstall]

Modes:
  --install          Configure Nora and start the compose stack.
  --update           Pull code when possible and restart app services without
                     deleting .env, compose volumes, or provisioned instances.
  --clean-reinstall  Recreate local compose state and remove local Nora agent
                     containers. External Kubernetes/VM backends are untouched.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --install)
      if [ -n "$SETUP_MODE" ]; then
        error "Choose only one setup mode."
        exit 1
      fi
      SETUP_MODE="install"
      ;;
    --update)
      if [ -n "$SETUP_MODE" ]; then
        error "Choose only one setup mode."
        exit 1
      fi
      SETUP_MODE="update"
      ;;
    --clean-reinstall)
      if [ -n "$SETUP_MODE" ]; then
        error "Choose only one setup mode."
        exit 1
      fi
      SETUP_MODE="clean-reinstall"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      error "Unknown option: $1"
      usage >&2
      exit 1
      ;;
  esac
  shift
done

write_public_nginx_conf() {
  local template="$1"
  local domain="$2"
  sed "s/\${DOMAIN}/${domain}/g" "$template" > "$PUBLIC_NGINX_CONF"
}

write_compose_override() {
  local template="$1"
  cp "$template" "$COMPOSE_OVERRIDE_FILE"
}

clear_public_access_artifacts() {
  rm -f "$PUBLIC_NGINX_CONF" "$COMPOSE_OVERRIDE_FILE"
}

backup_existing_env_file() {
  local env_path="$1"
  local env_dir env_name timestamp candidate suffix

  env_dir="$(dirname "$env_path")"
  env_name="$(basename "$env_path")"
  timestamp="$(date -u +"%Y%m%d-%H%M%SZ")"
  candidate="${env_name}.backup-${timestamp}"
  if [ "$env_dir" != "." ]; then
    candidate="${env_dir}/${candidate}"
  fi

  suffix=1
  while [ -e "$candidate" ]; do
    candidate="${env_name}.backup-${timestamp}.${suffix}"
    if [ "$env_dir" != "." ]; then
      candidate="${env_dir}/${candidate}"
    fi
    suffix=$((suffix + 1))
  done

  cp "$env_path" "$candidate"
  printf "%s\n" "$candidate"
}

update_source_checkout() {
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    return 0
  fi

  if [ -n "$(git status --porcelain)" ]; then
    warn "Skipping git pull because this worktree has uncommitted changes."
    return 0
  fi

  local branch
  branch="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
  if [ -z "$branch" ]; then
    info "Skipping git pull because this checkout is detached."
    return 0
  fi

  if git rev-parse --abbrev-ref --symbolic-full-name "@{u}" >/dev/null 2>&1; then
    info "Pulling latest code for ${branch}..."
    git pull --ff-only
  else
    info "Skipping git pull because ${branch} has no upstream."
  fi
}

remove_local_agent_containers() {
  local containers
  containers="$(
    {
      docker ps -a --filter "label=openclaw.agent.id" -q 2>/dev/null || true
      docker ps -a --filter "label=nora.agent.id" -q 2>/dev/null || true
    } | sort -u
  )"

  if [ -z "$containers" ]; then
    info "No local Nora agent containers found."
    return 0
  fi

  info "Removing local Nora agent containers..."
  while IFS= read -r container_id; do
    [ -z "$container_id" ] && continue
    docker rm -f "$container_id" >/dev/null 2>&1 || true
  done <<EOF
$containers
EOF
  ok "Removed local Nora agent containers"
}

clean_reinstall_state() {
  warn "Clean reinstall selected: local compose containers and volumes will be removed."
  info "External Kubernetes, Proxmox, NemoClaw, and VM resources will not be touched."
  docker compose down -v --remove-orphans 2>/dev/null || true
  remove_local_agent_containers
  ok "Local Nora compose state cleaned"
}

start_compose_stack() {
  echo ""
  info "Starting Nora (docker compose up -d --build)..."
  info "Preserving Docker volumes and provisioned agent instances."
  echo ""
  docker compose up -d --build
  echo ""
  ok "Nora is running!"
}

# ── OS detection ────────────────────────────────────────────

OS="unknown"
DISTRO=""
IS_WSL=false

detect_os() {
  case "$(uname -s)" in
    Darwin*) OS="macos" ;;
    Linux*)  OS="linux" ;;
    *)       OS="unknown" ;;
  esac

  if [ "$OS" = "linux" ]; then
    if [ -f /etc/os-release ]; then
      . /etc/os-release
      DISTRO="$ID"
    fi
    if grep -qi microsoft /proc/version 2>/dev/null; then
      IS_WSL=true
    fi
  fi
}

# ── Privilege helper ────────────────────────────────────────

run_privileged() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif command -v sudo &>/dev/null; then
    sudo "$@"
  else
    error "Root privileges required. Run as root or install sudo."
    exit 1
  fi
}

# ── Package manager helper (Linux) ─────────────────────────

pkg_install() {
  case "$DISTRO" in
    ubuntu|debian|pop|linuxmint|elementary|zorin)
      run_privileged apt-get update -qq && run_privileged apt-get install -y -qq "$@" ;;
    fedora)
      run_privileged dnf install -y -q "$@" ;;
    centos|rhel|rocky|alma|amzn)
      run_privileged yum install -y -q "$@" ;;
    arch|manjaro|endeavouros)
      run_privileged pacman -S --noconfirm --needed "$@" ;;
    alpine)
      run_privileged apk add --quiet "$@" ;;
    *)
      error "Unsupported Linux distro: $DISTRO"
      error "Manually install: $*"
      exit 1 ;;
  esac
}

# ── Install functions ───────────────────────────────────────

install_git() {
  if command -v git &>/dev/null; then return 0; fi
  info "Installing git..."
  if [ "$OS" = "macos" ]; then
    if command -v brew &>/dev/null; then
      brew install git
    else
      info "Installing Xcode Command Line Tools (includes git)..."
      xcode-select --install 2>/dev/null || true
      # Wait for xcode-select to finish
      until command -v git &>/dev/null; do sleep 3; done
    fi
  else
    pkg_install git
  fi
  ok "git installed: $(git --version)"
}

install_openssl() {
  if command -v openssl &>/dev/null; then return 0; fi
  info "Installing openssl..."
  if [ "$OS" = "macos" ]; then
    if command -v brew &>/dev/null; then
      brew install openssl
    else
      error "openssl is missing. Install Homebrew first: https://brew.sh"
      exit 1
    fi
  else
    pkg_install openssl
  fi
  ok "openssl installed"
}

install_docker() {
  if command -v docker &>/dev/null; then return 0; fi
  info "Installing Docker..."

  if [ "$OS" = "macos" ]; then
    if ! command -v brew &>/dev/null; then
      info "Installing Homebrew (needed for Docker Desktop)..."
      /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
      # Add brew to PATH for Apple Silicon and Intel
      if [ -f /opt/homebrew/bin/brew ]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
      elif [ -f /usr/local/bin/brew ]; then
        eval "$(/usr/local/bin/brew shellenv)"
      fi
      ok "Homebrew installed"
    fi
    info "Installing Docker Desktop via Homebrew..."
    brew install --cask docker
    ok "Docker Desktop installed"
    info "Starting Docker Desktop..."
    open -a Docker
  else
    # Linux — use official convenience script (installs Docker Engine + Compose plugin)
    if [ "$IS_WSL" = true ]; then
      warn "WSL2 detected. Docker Desktop for Windows is recommended."
      info "Attempting Linux Docker Engine install as fallback..."
    fi
    curl -fsSL https://get.docker.com | run_privileged sh
    run_privileged systemctl enable --now docker 2>/dev/null || true
    # Add current user to docker group (takes effect on next login)
    if [ "$(id -u)" -ne 0 ]; then
      run_privileged usermod -aG docker "$USER" 2>/dev/null || true
      warn "Added $USER to docker group — may need to log out/in for group to take effect"
    fi
    ok "Docker Engine installed"
  fi
}

wait_for_docker() {
  local max=60 waited=0
  while [ $waited -lt $max ]; do
    if docker info &>/dev/null 2>&1; then return 0; fi
    sleep 2
    waited=$((waited + 2))
    printf "."
  done
  echo ""
  error "Docker daemon didn't start within ${max}s."
  error "Start Docker manually and re-run this script."
  exit 1
}

# ── Bootstrap: detect OS and install prerequisites ──────────

detect_os

REPO_URL="https://github.com/solomon2773/nora.git"
INSTALL_DIR="nora"

header "Pre-flight Checks"

# Ensure git (needed for clone)
install_git

# Ensure Docker + Compose
if ! command -v docker &>/dev/null; then
  install_docker
fi

# Start daemon if not running
if ! docker info &>/dev/null 2>&1; then
  if [ "$OS" = "macos" ]; then
    info "Starting Docker Desktop..."
    open -a Docker 2>/dev/null || true
  fi
  info "Waiting for Docker daemon..."
  wait_for_docker
fi
ok "Docker found: $(docker --version | head -1)"

# Verify Compose
if docker compose version &>/dev/null; then
  ok "Docker Compose found: $(docker compose version --short 2>/dev/null || echo 'v2+')"
elif command -v docker-compose &>/dev/null; then
  warn "Found docker-compose (v1). Docker Compose v2+ is recommended."
else
  error "Docker Compose is required but was not installed. Re-run setup."
  exit 1
fi

ok "Docker daemon is running"

# Ensure openssl
install_openssl
ok "openssl found"

# ── Clone repo if running via curl pipe ──────────────────────

if [ ! -f "docker-compose.yml" ] && [ ! -f "compose.yml" ] && [ ! -f "compose.yaml" ]; then
  header "Downloading Nora"

  if [ -d "$INSTALL_DIR" ]; then
    info "Directory '$INSTALL_DIR' already exists — pulling latest..."
    cd "$INSTALL_DIR"
    git pull --ff-only 2>/dev/null || true
  else
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
  fi

  ok "Repository ready in ./$INSTALL_DIR"
fi

# ── Select setup mode ───────────────────────────────────────

if [ -z "$SETUP_MODE" ]; then
  if [ -f "$ENV_FILE" ]; then
    header "Existing Nora Install"
    printf "  Select maintenance mode:\n"
    printf "    1) Update code only (default) — preserve .env, data volumes, and provisioned instances\n"
    printf "    2) Reconfigure install — overwrite .env but preserve data volumes and instances\n"
    printf "    3) Clean reinstall — delete local compose volumes and local Nora agent containers\n"
    printf "  Select [1/2/3]: "
    read -r setup_mode_answer < /dev/tty
    case "$setup_mode_answer" in
      2) SETUP_MODE="install" ;;
      3) SETUP_MODE="clean-reinstall" ;;
      *) SETUP_MODE="update" ;;
    esac
  else
    SETUP_MODE="install"
  fi
fi

if [ "$SETUP_MODE" = "update" ]; then
  if [ ! -f "$ENV_FILE" ]; then
    error "Update mode requires an existing $ENV_FILE. Run setup without --update for first install."
    exit 1
  fi

  header "Updating Nora"
  info "Code update mode keeps $ENV_FILE, Postgres/backup volumes, and provisioned instances."
  update_source_checkout
  start_compose_stack
  echo ""
  info "Update complete. No compose volumes or agent Docker/K8s/VM instances were removed."
  exit 0
fi

if [ "$SETUP_MODE" = "clean-reinstall" ]; then
  header "Clean Reinstall"
  if [ -f "$ENV_FILE" ]; then
    ENV_BACKUP_FILE="$(backup_existing_env_file "$ENV_FILE")"
    ok "Existing $ENV_FILE backed up to $ENV_BACKUP_FILE"
  fi
  clean_reinstall_state
elif [ -f "$ENV_FILE" ]; then
  echo ""
  warn ".env already exists."
  printf "  Overwrite configuration while preserving data volumes and instances? [y/N] "
  read -r answer < /dev/tty
  if [[ ! "$answer" =~ ^[Yy]$ ]]; then
    info "Keeping existing .env — no changes made."
    info "Use './setup.sh --update' for a non-destructive code update."
    exit 0
  fi
  ENV_BACKUP_FILE="$(backup_existing_env_file "$ENV_FILE")"
  ok "Existing $ENV_FILE backed up to $ENV_BACKUP_FILE"
fi

# ── Generate secrets ─────────────────────────────────────────

header "Generating Secrets"

JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
NEXTAUTH_SECRET=$(openssl rand -hex 32)
DB_USER="nora"
DB_NAME="nora"
DB_PASSWORD=$(openssl rand -hex 24)

ok "JWT_SECRET      (64-char hex)"
ok "ENCRYPTION_KEY  (64-char hex — AES-256-GCM)"
ok "NEXTAUTH_SECRET (64-char hex)"
ok "DB_PASSWORD     (48-char hex)"

# ── Platform mode ────────────────────────────────────────────

header "Platform Configuration"

printf "  Platform Mode:\n"
printf "    1) Self-hosted (default) — operator sets resource limits\n"
printf "    2) PaaS — Stripe billing with plan-locked resources\n"
printf "  Select [1/2]: "
read -r mode_answer < /dev/tty

MAX_VCPU="16"
MAX_RAM_MB="32768"
MAX_DISK_GB="500"
MAX_AGENTS="50"

if [[ "$mode_answer" == "2" ]]; then
  PLATFORM_MODE="paas"
  ok "PaaS mode — configure Stripe keys in .env after setup"
else
  PLATFORM_MODE="selfhosted"
  echo ""
  printf "  Max vCPU per agent [16]: "
  read -r input < /dev/tty; MAX_VCPU="${input:-16}"
  printf "  Max RAM (MB) per agent [32768]: "
  read -r input < /dev/tty; MAX_RAM_MB="${input:-32768}"
  printf "  Max Disk (GB) per agent [500]: "
  read -r input < /dev/tty; MAX_DISK_GB="${input:-500}"
  printf "  Max agents per user [50]: "
  read -r input < /dev/tty; MAX_AGENTS="${input:-50}"
  ok "Self-hosted: ${MAX_VCPU} vCPU, ${MAX_RAM_MB}MB RAM, ${MAX_DISK_GB}GB disk, ${MAX_AGENTS} agents"
fi

# ── Deploy backends ──────────────────────────────────────────

header "Deploy Backends"

DOCKER_BACKEND_ENABLED="true"
K8S_BACKEND_ENABLED="false"
PROXMOX_BACKEND_ENABLED="false"
HERMES_RUNTIME_ENABLED="false"
NEMOCLAW_SANDBOX_ENABLED="false"
K8S_NAMESPACE="openclaw-agents"
K8S_EXPOSURE_MODE="cluster-ip"
K8S_RUNTIME_NODE_PORT=""
K8S_GATEWAY_NODE_PORT=""
K8S_RUNTIME_HOST=""
PROXMOX_API_URL=""
PROXMOX_TOKEN_ID=""
PROXMOX_TOKEN_SECRET=""
PROXMOX_NODE="pve"
PROXMOX_TEMPLATE="local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst"
PROXMOX_HERMES_TEMPLATE=""
PROXMOX_NEMOCLAW_TEMPLATE=""
PROXMOX_ROOTFS_STORAGE="local-lvm"
PROXMOX_BRIDGE="vmbr0"
PROXMOX_SSH_HOST=""
PROXMOX_SSH_USER="root"
PROXMOX_SSH_PRIVATE_KEY_PATH=""
PROXMOX_SSH_PASSWORD=""
NVIDIA_API_KEY=""

printf "  Enable Docker backend for local socket provisioning? [Y/n] "
read -r docker_backend_answer < /dev/tty
if [[ "$docker_backend_answer" =~ ^[Nn]$ ]]; then
  DOCKER_BACKEND_ENABLED="false"
  info "Docker backend disabled"
else
  ok "Docker backend enabled"
fi

printf "  Enable Kubernetes backend? [y/N] "
read -r k8s_backend_answer < /dev/tty
if [[ "$k8s_backend_answer" =~ ^[Yy]$ ]]; then
  K8S_BACKEND_ENABLED="true"
  ok "Kubernetes backend enabled — ensure kubeconfig is available in backend-api and worker-provisioner"
else
  info "Kubernetes backend disabled"
fi

printf "  Enable Proxmox backend? [y/N] "
read -r proxmox_backend_answer < /dev/tty
if [[ "$proxmox_backend_answer" =~ ^[Yy]$ ]]; then
  PROXMOX_BACKEND_ENABLED="true"
  echo ""
  printf "  Proxmox API URL (e.g., https://proxmox.local:8006/api2/json): "
  read -r PROXMOX_API_URL < /dev/tty
  printf "  Proxmox Token ID (e.g., user@pam!tokenname): "
  read -r PROXMOX_TOKEN_ID < /dev/tty
  printf "  Proxmox Token Secret: "
  read -r PROXMOX_TOKEN_SECRET < /dev/tty
  printf "  Proxmox Node [pve]: "
  read -r input < /dev/tty; PROXMOX_NODE="${input:-pve}"
  printf "  Proxmox OpenClaw template [local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst]: "
  read -r input < /dev/tty; PROXMOX_TEMPLATE="${input:-local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst}"
  printf "  Proxmox Hermes template [optional, required for Hermes + Proxmox]: "
  read -r PROXMOX_HERMES_TEMPLATE < /dev/tty
  printf "  Proxmox NemoClaw template [optional, required for NemoClaw + Proxmox]: "
  read -r PROXMOX_NEMOCLAW_TEMPLATE < /dev/tty
  printf "  Proxmox rootfs storage [local-lvm]: "
  read -r input < /dev/tty; PROXMOX_ROOTFS_STORAGE="${input:-local-lvm}"
  printf "  Proxmox network bridge [vmbr0]: "
  read -r input < /dev/tty; PROXMOX_BRIDGE="${input:-vmbr0}"
  printf "  Proxmox SSH host for pct bootstrap: "
  read -r PROXMOX_SSH_HOST < /dev/tty
  printf "  Proxmox SSH user [root]: "
  read -r input < /dev/tty; PROXMOX_SSH_USER="${input:-root}"
  printf "  Proxmox SSH private key path [optional]: "
  read -r PROXMOX_SSH_PRIVATE_KEY_PATH < /dev/tty
  if [ -z "$PROXMOX_SSH_PRIVATE_KEY_PATH" ]; then
    printf "  Proxmox SSH password [optional]: "
    read -r PROXMOX_SSH_PASSWORD < /dev/tty
  fi
  ok "Proxmox backend configured"
else
  info "Proxmox backend disabled"
fi

printf "  Enable Hermes runtime family? [y/N] "
read -r hermes_runtime_answer < /dev/tty
if [[ "$hermes_runtime_answer" =~ ^[Yy]$ ]]; then
  HERMES_RUNTIME_ENABLED="true"
  ok "Hermes runtime family enabled"
else
  info "Hermes runtime family disabled"
fi

printf "  Enable NemoClaw sandbox profile? [y/N] "
read -r nemoclaw_sandbox_answer < /dev/tty
if [[ "$nemoclaw_sandbox_answer" =~ ^[Yy]$ ]]; then
  NEMOCLAW_SANDBOX_ENABLED="true"
  printf "  NVIDIA API key [optional during setup]: "
  read -r nvidia_key < /dev/tty
  if [ -n "$nvidia_key" ]; then
    NVIDIA_API_KEY="$nvidia_key"
    ok "NemoClaw sandbox profile enabled with NVIDIA API key"
  else
    warn "NemoClaw enabled without NVIDIA_API_KEY — add it to .env later if needed"
  fi
else
  info "NemoClaw sandbox profile disabled"
fi

enabled_backends=()
[ "$DOCKER_BACKEND_ENABLED" = "true" ] && enabled_backends+=("docker")
[ "$K8S_BACKEND_ENABLED" = "true" ] && enabled_backends+=("k8s")
[ "$PROXMOX_BACKEND_ENABLED" = "true" ] && enabled_backends+=("proxmox")

if [ ${#enabled_backends[@]} -eq 0 ]; then
  warn "No deploy backends selected — enabling Docker so Nora can deploy agents."
  DOCKER_BACKEND_ENABLED="true"
  enabled_backends=("docker")
fi

ENABLED_BACKENDS="$(IFS=,; echo "${enabled_backends[*]}")"
ok "Enabled backends: ${ENABLED_BACKENDS}"

enabled_runtime_families=("openclaw")
[ "$HERMES_RUNTIME_ENABLED" = "true" ] && enabled_runtime_families+=("hermes")

ENABLED_RUNTIME_FAMILIES="$(IFS=,; echo "${enabled_runtime_families[*]}")"
ok "Enabled runtime families: ${ENABLED_RUNTIME_FAMILIES}"

enabled_sandbox_profiles=("standard")
[ "$NEMOCLAW_SANDBOX_ENABLED" = "true" ] && enabled_sandbox_profiles+=("nemoclaw")
ENABLED_SANDBOX_PROFILES="$(IFS=,; echo "${enabled_sandbox_profiles[*]}")"
ok "Enabled sandbox profiles: ${ENABLED_SANDBOX_PROFILES}"

# ── Access mode ──────────────────────────────────────────────

header "Access Mode"

printf "  How should users reach Nora?\n"
printf "    1) Local only (default) — http://localhost:8080\n"
printf "    2) Public domain behind HTTPS proxy — nginx listens on port 80\n"
printf "    3) Public domain with TLS at nginx — nginx listens on ports 80 and 443\n"
printf "  Select [1/2/3]: "
read -r access_answer < /dev/tty

ACCESS_MODE="local"
PUBLIC_DOMAIN=""
PUBLIC_SCHEME="http"
NEXTAUTH_URL="http://localhost:8080"
CORS_ORIGINS="http://localhost:8080"
NGINX_CONFIG_FILE="nginx.conf"
NGINX_HTTP_PORT="8080"
CAN_START_NORA=true

case "$access_answer" in
  2|3)
    while true; do
      printf "  Public domain (hosted default: nora.solomontsao.com; self-hosted: your own domain): "
      read -r PUBLIC_DOMAIN < /dev/tty
      if [[ "$PUBLIC_DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] && [[ "$PUBLIC_DOMAIN" == *.* ]]; then
        break
      fi
      warn "Enter a valid hostname without http:// or path segments."
    done

    if [ "$access_answer" = "2" ]; then
      printf "  Public URL scheme [https]: "
      read -r input < /dev/tty
      PUBLIC_SCHEME="${input:-https}"
      if [ "$PUBLIC_SCHEME" != "http" ] && [ "$PUBLIC_SCHEME" != "https" ]; then
        warn "Unsupported scheme '$PUBLIC_SCHEME' — using https."
        PUBLIC_SCHEME="https"
      fi
      write_public_nginx_conf "$PUBLIC_NGINX_TEMPLATE" "$PUBLIC_DOMAIN"
      write_compose_override "$PUBLIC_PROD_COMPOSE_OVERRIDE_TEMPLATE"
      ok "Public proxy mode — nginx will serve ${PUBLIC_DOMAIN} on port 80"
    else
      PUBLIC_SCHEME="https"
      write_public_nginx_conf "$TLS_NGINX_TEMPLATE" "$PUBLIC_DOMAIN"
      write_compose_override "$TLS_COMPOSE_OVERRIDE_TEMPLATE"
      if [ ! -f "/etc/letsencrypt/live/${PUBLIC_DOMAIN}/fullchain.pem" ] || [ ! -f "/etc/letsencrypt/live/${PUBLIC_DOMAIN}/privkey.pem" ]; then
        CAN_START_NORA=false
        warn "TLS certs not found for ${PUBLIC_DOMAIN}."
        info "Run: DOMAIN=${PUBLIC_DOMAIN} EMAIL=you@example.com ./infra/setup-tls.sh"
        info "The stack will be configured, but startup will be skipped until certs are installed."
      else
        ok "Public TLS mode — certs found for ${PUBLIC_DOMAIN}"
      fi
    fi

    ACCESS_MODE=$([ "$access_answer" = "3" ] && printf "public-tls" || printf "public-proxy")
    NEXTAUTH_URL="${PUBLIC_SCHEME}://${PUBLIC_DOMAIN}"
    CORS_ORIGINS="${NEXTAUTH_URL}"
    NGINX_CONFIG_FILE="$PUBLIC_NGINX_CONF"
    NGINX_HTTP_PORT="80"
    ;;
  *)
    clear_public_access_artifacts
    ok "Local mode — Nora will be available at http://localhost:8080"
    ;;
esac

# ── Bootstrap Admin Account (Optional) ───────────────────────

header "Bootstrap Admin Account (Optional)"

printf "  Leave both fields blank to skip bootstrap admin creation.\n"
printf "  If set, the password must be at least 12 characters.\n\n"

while true; do
  printf "  Admin email [leave blank to skip]: "
  read -r admin_email_input < /dev/tty

  printf "  Admin password (min 12 chars, leave blank to skip): "
  read -rs admin_pass_input < /dev/tty
  printf "\n"

  if [ -z "$admin_email_input" ] && [ -z "$admin_pass_input" ]; then
    DEFAULT_ADMIN_EMAIL=""
    DEFAULT_ADMIN_PASSWORD=""
    info "Skipping bootstrap admin seed — create your operator account after first boot."
    break
  fi

  if [ -z "$admin_email_input" ] || [ -z "$admin_pass_input" ]; then
    warn "To pre-seed an admin, provide both email and password, or leave both blank to skip."
    continue
  fi

  if [ ${#admin_pass_input} -lt 12 ]; then
    warn "Bootstrap admin password must be at least 12 characters."
    continue
  fi

  DEFAULT_ADMIN_EMAIL="$admin_email_input"
  DEFAULT_ADMIN_PASSWORD="$admin_pass_input"
  ok "Bootstrap admin configured: $DEFAULT_ADMIN_EMAIL"
  break
done

# ── LLM Provider ─────────────────────────────────────────────

header "LLM Provider"

info "Setup no longer creates an agent automatically."
info "Add your LLM provider key from Settings after login."

# ── OAuth (optional) ─────────────────────────────────────────

header "OAuth (Optional)"

GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""

printf "  Configure Google OAuth? [y/N] "
read -r google_answer < /dev/tty
if [[ "$google_answer" =~ ^[Yy]$ ]]; then
  printf "  Google Client ID: "
  read -r GOOGLE_CLIENT_ID < /dev/tty
  printf "  Google Client Secret: "
  read -r GOOGLE_CLIENT_SECRET < /dev/tty
  if [ -n "$GOOGLE_CLIENT_ID" ]; then
    ok "Google OAuth configured"
  fi
fi

printf "  Configure GitHub OAuth? [y/N] "
read -r github_answer < /dev/tty
if [[ "$github_answer" =~ ^[Yy]$ ]]; then
  printf "  GitHub Client ID: "
  read -r GITHUB_CLIENT_ID < /dev/tty
  printf "  GitHub Client Secret: "
  read -r GITHUB_CLIENT_SECRET < /dev/tty
  if [ -n "$GITHUB_CLIENT_ID" ]; then
    ok "GitHub OAuth configured"
  fi
fi

if [ -z "$GOOGLE_CLIENT_ID" ] && [ -z "$GITHUB_CLIENT_ID" ]; then
  info "No OAuth configured — users will sign up with email/password"
fi

OAUTH_LOGIN_ENABLED="false"
NEXT_PUBLIC_OAUTH_LOGIN_ENABLED="false"
if [ -n "$GOOGLE_CLIENT_ID" ] || [ -n "$GITHUB_CLIENT_ID" ]; then
  OAUTH_LOGIN_ENABLED="true"
  NEXT_PUBLIC_OAUTH_LOGIN_ENABLED="true"
fi

# ── Write .env ───────────────────────────────────────────────

header "Writing Configuration"

info "Writing $ENV_FILE..."

cat > "$ENV_FILE" <<EOF
# ============================================================
# Nora — Environment Configuration
# ============================================================
# Auto-generated by setup.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# ============================================================

# ── Required (auto-generated) ────────────────────────────────
JWT_SECRET=${JWT_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}

# ── Bootstrap Admin Account (optional; seeded only when both are set securely) ──
DEFAULT_ADMIN_EMAIL=${DEFAULT_ADMIN_EMAIL}
DEFAULT_ADMIN_PASSWORD=${DEFAULT_ADMIN_PASSWORD}

# ── Database (defaults work with Docker Compose) ─────────────
DB_HOST=postgres
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
DB_NAME=${DB_NAME}
DB_PORT=5432

# ── Redis (defaults work with Docker Compose) ────────────────
REDIS_HOST=redis
REDIS_PORT=6379
PORT=4000

# ── Access / URL ─────────────────────────────────────────────
NGINX_CONFIG_FILE=${NGINX_CONFIG_FILE}
NGINX_HTTP_PORT=${NGINX_HTTP_PORT}

# ── OAuth ────────────────────────────────────────────────────
OAUTH_LOGIN_ENABLED=${OAUTH_LOGIN_ENABLED}
NEXT_PUBLIC_OAUTH_LOGIN_ENABLED=${NEXT_PUBLIC_OAUTH_LOGIN_ENABLED}
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID}
GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET}
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
NEXTAUTH_URL=${NEXTAUTH_URL}

# ── Platform Mode ────────────────────────────────────────────
PLATFORM_MODE=${PLATFORM_MODE}

# ── Self-hosted limits (only when PLATFORM_MODE=selfhosted) ──
MAX_VCPU=${MAX_VCPU}
MAX_RAM_MB=${MAX_RAM_MB}
MAX_DISK_GB=${MAX_DISK_GB}
MAX_AGENTS=${MAX_AGENTS}

# ── Billing (only when PLATFORM_MODE=paas) ───────────────────
BILLING_ENABLED=false
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_PRO=
STRIPE_PRICE_ENTERPRISE=

# ── Release Tracking / Admin Upgrade Banner ─────────────────
NORA_CURRENT_VERSION=
NORA_CURRENT_COMMIT=
NORA_GITHUB_REPO=solomon2773/nora
NORA_GITHUB_TOKEN=
NORA_RELEASE_CACHE_TTL_MS=300000
NORA_LATEST_VERSION=
NORA_LATEST_PUBLISHED_AT=
NORA_RELEASE_NOTES_URL=
NORA_LATEST_SEVERITY=warning
NORA_UPGRADE_REQUIRED=false
NORA_AUTO_UPGRADE_ENABLED=false
NORA_HOST_REPO_DIR=$(pwd)
NORA_UPGRADE_REPO=https://github.com/solomon2773/nora.git
NORA_UPGRADE_REF=master
NORA_UPGRADE_RUNNER_IMAGE=docker:29-cli
NORA_UPGRADE_STATE_VOLUME=nora_upgrade_state
NORA_INSTALL_METHOD=source
NORA_MANUAL_UPGRADE_COMMAND=./setup.sh --update
NORA_MANUAL_UPGRADE_STEPS=

# ── Runtime families, deploy targets, and sandbox profiles ───
ENABLED_RUNTIME_FAMILIES=${ENABLED_RUNTIME_FAMILIES}
ENABLED_BACKENDS=${ENABLED_BACKENDS}
ENABLED_SANDBOX_PROFILES=${ENABLED_SANDBOX_PROFILES}

# ── Kubernetes (when ENABLED_BACKENDS includes k8s) ──────────
K8S_NAMESPACE=${K8S_NAMESPACE}
K8S_EXPOSURE_MODE=${K8S_EXPOSURE_MODE}
K8S_RUNTIME_NODE_PORT=${K8S_RUNTIME_NODE_PORT}
K8S_GATEWAY_NODE_PORT=${K8S_GATEWAY_NODE_PORT}
K8S_RUNTIME_HOST=${K8S_RUNTIME_HOST}

# ── Proxmox (when ENABLED_BACKENDS includes proxmox) ─────────
PROXMOX_API_URL=${PROXMOX_API_URL}
PROXMOX_TOKEN_ID=${PROXMOX_TOKEN_ID}
PROXMOX_TOKEN_SECRET=${PROXMOX_TOKEN_SECRET}
PROXMOX_NODE=${PROXMOX_NODE}
PROXMOX_TEMPLATE=${PROXMOX_TEMPLATE}
PROXMOX_HERMES_TEMPLATE=${PROXMOX_HERMES_TEMPLATE}
PROXMOX_NEMOCLAW_TEMPLATE=${PROXMOX_NEMOCLAW_TEMPLATE}
PROXMOX_ROOTFS_STORAGE=${PROXMOX_ROOTFS_STORAGE}
PROXMOX_BRIDGE=${PROXMOX_BRIDGE}
PROXMOX_SSH_HOST=${PROXMOX_SSH_HOST}
PROXMOX_SSH_USER=${PROXMOX_SSH_USER}
PROXMOX_SSH_PRIVATE_KEY_PATH=${PROXMOX_SSH_PRIVATE_KEY_PATH}
PROXMOX_SSH_PASSWORD=${PROXMOX_SSH_PASSWORD}

# ── NemoClaw / NVIDIA (when ENABLED_SANDBOX_PROFILES includes nemoclaw) ──
NVIDIA_API_KEY=${NVIDIA_API_KEY}
NEMOCLAW_DEFAULT_MODEL=nvidia/nemotron-3-super-120b-a12b
NEMOCLAW_SANDBOX_IMAGE=nora-nemoclaw-agent:local

# ── Security ─────────────────────────────────────────────────
CORS_ORIGINS=${CORS_ORIGINS}

# ── LLM Key Storage ─────────────────────────────────────────
KEY_STORAGE=database

# ── Backups & TLS (optional) ────────────────────────────────
# TLS_CERT_PATH=
# TLS_KEY_PATH=
# AWS_S3_BUCKET=
# AWS_ACCESS_KEY_ID=
# AWS_SECRET_ACCESS_KEY=
EOF

ok ".env created successfully"

# ── Summary ──────────────────────────────────────────────────

echo ""
header "Setup Complete"

if [ -n "$DEFAULT_ADMIN_EMAIL" ]; then
  printf "  Admin:        %s\n" "$DEFAULT_ADMIN_EMAIL"
  printf "  Password:     %s\n" "$(echo "$DEFAULT_ADMIN_PASSWORD" | sed 's/./*/g')"
else
  printf "  Admin:        Not pre-seeded (create via signup)\n"
  printf "  Password:     Not set\n"
fi
printf "  Secrets:      auto-generated (JWT, AES, NextAuth)\n"
printf "  Database:     PostgreSQL 15 (Docker Compose)\n"
printf "  DB Access:    %s / auto-generated / %s (.env)\n" "$DB_USER" "$DB_NAME"
printf "  Redis:        Redis 7 (Docker Compose)\n"
if [ "$ACCESS_MODE" = "local" ]; then
  printf "  Access:       Local only\n"
  printf "  Runtime:      Development services\n"
else
  printf "  Access:       %s\n" "$NEXTAUTH_URL"
  printf "  Runtime:      Production services\n"
  if [ "$ACCESS_MODE" = "public-tls" ]; then
    printf "  TLS:          Terminated by nginx on this host\n"
  else
    printf "  TLS:          Terminated by your upstream proxy\n"
  fi
fi

if [ "$PLATFORM_MODE" = "paas" ]; then
  printf "  Mode:         PaaS (Stripe billing)\n"
else
  printf "  Mode:         Self-hosted\n"
  printf "  Limits:       %svCPU / %sMB / %sGB / %s agents\n" "$MAX_VCPU" "$MAX_RAM_MB" "$MAX_DISK_GB" "$MAX_AGENTS"
fi

printf "  Families:     %s\n" "$ENABLED_RUNTIME_FAMILIES"
printf "  Backends:     %s\n" "$ENABLED_BACKENDS"
printf "  Sandboxes:    %s\n" "$ENABLED_SANDBOX_PROFILES"

if [ -n "$GOOGLE_CLIENT_ID" ] || [ -n "$GITHUB_CLIENT_ID" ]; then
  providers=""
  [ -n "$GOOGLE_CLIENT_ID" ] && providers="Google"
  [ -n "$GITHUB_CLIENT_ID" ] && providers="${providers:+$providers, }GitHub"
  printf "  OAuth:        %s\n" "$providers"
else
  printf "  OAuth:        Not configured (email/password only)\n"
fi

printf "  LLM:          Configure from Settings after login\n"

echo ""

# ── Start Nora ──────────────────────────────────────────────

printf "${CYAN}[info]${NC}  Start Nora now? [Y/n] "
read -r start_answer < /dev/tty
if [[ "$start_answer" =~ ^[Nn]$ ]]; then
  echo ""
  info "Run 'docker compose up -d --build' when you're ready to start."
  echo ""
  exit 0
fi

if [ "$CAN_START_NORA" != true ]; then
  echo ""
  warn "Startup skipped until the public TLS certificate is installed."
  info "After certs exist, run 'docker compose up -d --build'."
  echo ""
  exit 0
fi

echo ""
info "Building nora-openclaw-agent:local (prebaked openclaw + tsx)..."
echo ""
docker build \
  -f agent-runtime/Dockerfile.openclaw-agent \
  -t nora-openclaw-agent:local \
  agent-runtime/
ok "OpenClaw agent image ready"

# Only build the NemoClaw variant when the operator actually enables the
# sandbox profile — pulling the 2.4GB OpenShell base on every install is wasteful.
case ",${ENABLED_SANDBOX_PROFILES:-}," in
  *,nemoclaw,*)
    echo ""
    info "Building nora-nemoclaw-agent:local (OpenShell sandbox + tsx)..."
    echo ""
    docker build \
      -f agent-runtime/Dockerfile.nemoclaw-agent \
      -t nora-nemoclaw-agent:local \
      agent-runtime/
    ok "NemoClaw sandbox image ready"
    ;;
esac

start_compose_stack

# ── Done ─────────────────────────────────────────────────────

echo ""
header "Nora is live!"

printf "  Open your browser:  %s\n" "$NEXTAUTH_URL"
if [ -n "$DEFAULT_ADMIN_EMAIL" ]; then
  printf "  Login:              %s\n" "$DEFAULT_ADMIN_EMAIL"
else
  printf "  Login:              create an account at /signup\n"
fi
echo ""

info "Next: sign in, add an LLM provider in Settings, then open Deploy when you're ready to create your first agent."

echo ""
info "Useful commands:"
echo "    docker compose logs -f              # watch logs"
echo "    docker compose logs -f backend-api  # single service"
echo "    docker compose down                 # stop everything"
echo ""
info "Useful links:"
echo "    Quick start:        https://github.com/solomon2773/nora#quick-start"
echo "    GitHub repo:        https://github.com/solomon2773/nora"
echo "    Public site:        https://nora.solomontsao.com"
echo "    Log in:             https://nora.solomontsao.com/login"
echo "    Create account:     https://nora.solomontsao.com/signup"
echo "    OSS / PaaS mode:    https://nora.solomontsao.com/pricing"
echo "    Start paths:        https://github.com/solomon2773/nora/blob/master/SUPPORT.md"
echo ""
