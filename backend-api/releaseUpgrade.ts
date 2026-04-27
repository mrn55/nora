// @ts-nocheck
const crypto = require("crypto");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const Docker = require("dockerode");
const { buildAutoUpgrade, buildReleaseInfo } = require("./releaseInfo");

const DEFAULT_STATE_DIR = "/var/lib/nora-upgrade";
const DEFAULT_STATE_VOLUME = "nora_upgrade_state";
const DEFAULT_RUNNER_IMAGE = "docker:29-cli";
const DEFAULT_UPGRADE_REPO = "https://github.com/solomon2773/nora.git";
const DEFAULT_UPGRADE_REF = "master";
const DEFAULT_LOG_TAIL_LINES = 80;
const RUNNING_PHASES = new Set(["queued", "running"]);

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

function readString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function getStateDir(env = process.env) {
  return readString(env.NORA_UPGRADE_STATE_DIR) || DEFAULT_STATE_DIR;
}

function getStatePath(env = process.env) {
  return path.join(getStateDir(env), "status.json");
}

function getLogTailLines(env = process.env) {
  return parsePositiveInteger(env.NORA_UPGRADE_LOG_TAIL_LINES, DEFAULT_LOG_TAIL_LINES);
}

function normalizeGithubRepoSlug(repoUrl) {
  const normalized = readString(repoUrl)
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/^git@github\.com:/i, "")
    .replace(/\.git$/i, "")
    .replace(/^\/+|\/+$/g, "");
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(normalized) ? normalized : "";
}

function buildIdleState() {
  return {
    job: null,
    updatedAt: new Date().toISOString(),
  };
}

function isRunningJob(job) {
  return RUNNING_PHASES.has(job?.phase);
}

function publicAutoUpgrade(config, override = {}) {
  return {
    enabled: Boolean(config.enabled),
    available: override.available ?? Boolean(config.available),
    mode: config.mode || "github_direct",
    sourceRepo: config.sourceRepo || DEFAULT_UPGRADE_REPO,
    sourceRef: config.sourceRef || DEFAULT_UPGRADE_REF,
    disabledReason: override.disabledReason ?? config.disabledReason ?? null,
  };
}

function publicJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    phase: job.phase,
    currentVersion: job.currentVersion || null,
    targetVersion: job.targetVersion || null,
    releaseNotesUrl: job.releaseNotesUrl || null,
    requestedBy: job.requestedBy || null,
    requestedAt: job.requestedAt || null,
    startedAt: job.startedAt || null,
    finishedAt: job.finishedAt || null,
    exitCode: job.exitCode ?? null,
    signal: job.signal || null,
    error: job.error || null,
    containerId: job.containerId || null,
    sourceRepo: job.sourceRepo || null,
    sourceRef: job.sourceRef || null,
  };
}

function redactText(input, env = process.env) {
  let output = String(input || "");
  const secretValues = [
    env.JWT_SECRET,
    env.ENCRYPTION_KEY,
    env.DB_PASSWORD,
    env.NORA_UPGRADE_REPO,
    env.STRIPE_SECRET_KEY,
    env.STRIPE_WEBHOOK_SECRET,
    env.AWS_SECRET_ACCESS_KEY,
  ]
    .map(readString)
    .filter((value) => value.length >= 8);

  for (const secret of secretValues) {
    output = output.split(secret).join("[redacted]");
  }

  return output
    .replace(/(token|secret|password|key)=([^\s]+)/gi, "$1=[redacted]")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/g, "$1[redacted]");
}

async function ensureStateDir(env = process.env) {
  await fsp.mkdir(getStateDir(env), { recursive: true });
}

async function readState(env = process.env) {
  try {
    const payload = await fsp.readFile(getStatePath(env), "utf8");
    const parsed = JSON.parse(payload);
    if (parsed && typeof parsed === "object") return parsed;
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.error("Failed to read release upgrade state:", error?.message || error);
    }
  }
  return buildIdleState();
}

async function writeState(state, env = process.env) {
  await ensureStateDir(env);
  const nextState = {
    ...state,
    updatedAt: new Date().toISOString(),
  };
  await fsp.writeFile(getStatePath(env), `${JSON.stringify(nextState, null, 2)}\n`);
  return nextState;
}

function buildLogPath(jobId, env = process.env) {
  const safeId = String(jobId || "upgrade").replace(/[^A-Za-z0-9_.-]/g, "-");
  return path.join(getStateDir(env), `${safeId}.log`);
}

async function appendLog(logFile, text, env = process.env) {
  await ensureStateDir(env);
  await fsp.appendFile(logFile, redactText(text, env));
}

async function readLogTail(logFile, env = process.env) {
  if (!logFile) return [];

  try {
    const payload = await fsp.readFile(logFile, "utf8");
    const lines = redactText(payload, env)
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean);
    return lines.slice(-getLogTailLines(env));
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.error("Failed to read release upgrade log:", error?.message || error);
    }
    return [];
  }
}

async function ensureRunnerImage(image) {
  await new Promise((resolve, reject) => {
    docker.pull(image, (pullError, stream) => {
      if (pullError) {
        reject(pullError);
        return;
      }
      docker.modem.followProgress(stream, (followError) => {
        if (followError) reject(followError);
        else resolve();
      });
    });
  });
}

function buildRunnerScript() {
  return [
    "set -u",
    'STATE_DIR="/var/lib/nora-upgrade"',
    'STATE_FILE="${STATE_DIR}/status.json"',
    'LOG_FILE="${NORA_UPGRADE_LOG_FILE}"',
    'WORKSPACE="${NORA_HOST_REPO_DIR}"',
    'mkdir -p "${STATE_DIR}"',
    'touch "${LOG_FILE}"',
    "",
    "update_status() {",
    '  STATE_FILE="${STATE_FILE}" PHASE="$1" EXIT_CODE="${2:-}" ERROR_MESSAGE="${3:-}" FINISHED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \\',
    "    node <<'NODE'",
    'const fs = require("fs");',
    "const stateFile = process.env.STATE_FILE;",
    "const phase = process.env.PHASE;",
    "const exitCode = process.env.EXIT_CODE;",
    "const errorMessage = process.env.ERROR_MESSAGE;",
    "const finishedAt = process.env.FINISHED_AT;",
    "let state = {};",
    "try {",
    '  state = JSON.parse(fs.readFileSync(stateFile, "utf8"));',
    "} catch {",
    "  state = {};",
    "}",
    "const job = state.job || {};",
    "job.phase = phase;",
    'job.finishedAt = phase === "running" ? null : finishedAt;',
    'job.exitCode = exitCode === "" ? null : Number(exitCode);',
    "job.error = errorMessage || null;",
    "state.job = job;",
    "state.updatedAt = new Date().toISOString();",
    'fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + "\\n");',
    "NODE",
    "}",
    "",
    "(",
    "  set -eu",
    '  echo "Starting Nora direct GitHub upgrade job ${NORA_UPGRADE_JOB_ID}"',
    '  echo "Installing runner tools..."',
    "  apk add --no-cache bash git openssl nodejs docker-cli-compose",
    '  cd "${WORKSPACE}"',
    '  git config --global --add safe.directory "${WORKSPACE}"',
    "",
    '  if [ -n "$(git status --porcelain)" ]; then',
    '    echo "Refusing to upgrade because the host Nora checkout has uncommitted changes."',
    "    exit 20",
    "  fi",
    "",
    '  echo "Fetching Nora source from GitHub..."',
    "  git remote remove nora-upgrade >/dev/null 2>&1 || true",
    '  git remote add nora-upgrade "${NORA_UPGRADE_REPO}"',
    "  git fetch --prune --tags nora-upgrade '+refs/heads/*:refs/remotes/nora-upgrade/*' '+refs/tags/*:refs/tags/*'",
    "",
    '  TARGET_REF=""',
    '  if [ -n "${NORA_UPGRADE_TARGET_VERSION:-}" ] && git rev-parse --verify --quiet "refs/tags/${NORA_UPGRADE_TARGET_VERSION}^{commit}" >/dev/null; then',
    '    TARGET_REF="refs/tags/${NORA_UPGRADE_TARGET_VERSION}"',
    "  fi",
    '  if [ -z "${TARGET_REF}" ]; then',
    '    TARGET_REF="refs/remotes/nora-upgrade/${NORA_UPGRADE_REF:-master}"',
    '    git rev-parse --verify "${TARGET_REF}^{commit}" >/dev/null',
    "  fi",
    "",
    '  echo "Applying ${TARGET_REF}..."',
    '  CURRENT_BRANCH="$(git symbolic-ref --quiet --short HEAD || true)"',
    '  case "${TARGET_REF}" in',
    "    refs/remotes/*|refs/tags/*)",
    '      if [ -n "${CURRENT_BRANCH}" ]; then',
    '        git merge --ff-only "${TARGET_REF}"',
    "      else",
    '        git checkout --detach "${TARGET_REF}"',
    "      fi",
    "      ;;",
    "    *)",
    '      git checkout --detach "${TARGET_REF}"',
    "      ;;",
    "  esac",
    "",
    '  VERSION="${NORA_UPGRADE_TARGET_VERSION:-$(git describe --tags --always)}"',
    '  COMMIT="$(git rev-parse HEAD)"',
    '  if [ -f infra/update-release-env.sh ] && [ -f "${NORA_ENV_FILE:-.env}" ]; then',
    '    bash infra/update-release-env.sh "${NORA_ENV_FILE:-.env}" "${VERSION}" "${COMMIT}" "${NORA_UPGRADE_REPO_SLUG:-}"',
    "  fi",
    "",
    '  echo "Rebuilding and restarting Nora services..."',
    "  docker compose up -d --build",
    '  echo "Nora direct GitHub upgrade completed."',
    ') >> "${LOG_FILE}" 2>&1',
    'EXIT_CODE="$?"',
    'if [ "${EXIT_CODE}" -eq 0 ]; then',
    '  update_status "succeeded" "${EXIT_CODE}" ""',
    "else",
    '  update_status "failed" "${EXIT_CODE}" "GitHub upgrade runner exited with ${EXIT_CODE}"',
    "fi",
    'exit "${EXIT_CODE}"',
    "",
  ].join("\n");
}

async function launchRunnerContainer(job, config, env = process.env) {
  const image = config.runnerImage || DEFAULT_RUNNER_IMAGE;
  const stateVolume = config.stateVolume || DEFAULT_STATE_VOLUME;
  const sourceRepo = config.sourceRepo || DEFAULT_UPGRADE_REPO;
  const sourceRef = config.sourceRef || DEFAULT_UPGRADE_REF;
  const repoSlug = normalizeGithubRepoSlug(sourceRepo);

  await docker.createVolume({ Name: stateVolume });
  await ensureRunnerImage(image);

  const container = await docker.createContainer({
    Image: image,
    Cmd: ["sh", "-c", buildRunnerScript()],
    Env: [
      `NORA_UPGRADE_JOB_ID=${job.id}`,
      `NORA_UPGRADE_LOG_FILE=/var/lib/nora-upgrade/${path.basename(job.logFile)}`,
      `NORA_UPGRADE_REPO=${sourceRepo}`,
      `NORA_UPGRADE_REF=${sourceRef}`,
      `NORA_UPGRADE_REPO_SLUG=${repoSlug}`,
      `NORA_UPGRADE_TARGET_VERSION=${job.targetVersion || ""}`,
      `NORA_HOST_REPO_DIR=${config.hostRepoDir}`,
      `NORA_ENV_FILE=${readString(env.NORA_ENV_FILE) || ".env"}`,
    ],
    WorkingDir: config.hostRepoDir,
    Labels: {
      "nora.role": "release-upgrade-runner",
      "nora.release_upgrade.job_id": job.id,
    },
    HostConfig: {
      AutoRemove: false,
      Binds: [
        `${config.hostRepoDir}:${config.hostRepoDir}`,
        "/var/run/docker.sock:/var/run/docker.sock",
        `${stateVolume}:/var/lib/nora-upgrade`,
      ],
    },
  });

  job.containerId = container.id;
  await writeState({ job }, env);
  await container.start();
  return container;
}

async function getReleaseUpgradeStatus(env = process.env) {
  const release = await buildReleaseInfo(env);
  const config = buildAutoUpgrade(env, { includeInternal: true });
  const state = await readState(env);
  const job = state.job || null;
  const disabledReason = config.disabledReason || null;

  return {
    release,
    autoUpgrade: publicAutoUpgrade(config, {
      available: config.available,
      disabledReason,
    }),
    runnerReachable: config.available ? true : null,
    job: publicJob(job),
    logTail: await readLogTail(job?.logFile, env),
    updatedAt: state.updatedAt || null,
  };
}

async function startReleaseUpgrade({ actor = null, env = process.env } = {}) {
  const release = await buildReleaseInfo(env);
  const config = buildAutoUpgrade(env, { includeInternal: true });

  if (!config.available) {
    throw createHttpError(config.disabledReason || "Direct GitHub upgrade is not enabled", 503);
  }
  if (!release.updateAvailable) {
    throw createHttpError("This Nora control plane is already on the latest release", 409);
  }

  const currentState = await readState(env);
  if (isRunningJob(currentState.job)) {
    throw createHttpError("A release upgrade is already running", 409);
  }

  const now = new Date().toISOString();
  const jobId = `upgrade-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const job = {
    id: jobId,
    phase: "running",
    currentVersion: release.currentVersion || null,
    targetVersion: release.latestVersion || null,
    releaseNotesUrl: release.releaseNotesUrl || null,
    requestedBy: actor
      ? {
          id: actor.id || null,
          email: actor.email || null,
          role: actor.role || null,
        }
      : null,
    requestedAt: now,
    startedAt: now,
    finishedAt: null,
    exitCode: null,
    signal: null,
    error: null,
    sourceRepo: config.sourceRepo,
    sourceRef: config.sourceRef,
    logFile: buildLogPath(jobId, env),
    containerId: null,
  };

  await writeState({ job }, env);
  await appendLog(job.logFile, `Queued direct GitHub upgrade job ${job.id}\n`, env);

  try {
    await launchRunnerContainer(job, config, env);
  } catch (error) {
    const failedJob = {
      ...job,
      phase: "failed",
      finishedAt: new Date().toISOString(),
      error: error?.message || "Failed to start GitHub upgrade runner",
    };
    await appendLog(job.logFile, `${failedJob.error}\n`, env).catch(() => {});
    await writeState({ job: failedJob }, env);
    throw createHttpError(failedJob.error, 503);
  }

  const state = await readState(env);
  const currentJob = state.job || job;
  return {
    release,
    autoUpgrade: publicAutoUpgrade(config),
    runnerReachable: true,
    job: publicJob(currentJob),
    logTail: await readLogTail(currentJob.logFile, env),
    updatedAt: state.updatedAt || null,
  };
}

module.exports = {
  getReleaseUpgradeStatus,
  launchRunnerContainer,
  readState,
  redactText,
  startReleaseUpgrade,
  writeState,
};
