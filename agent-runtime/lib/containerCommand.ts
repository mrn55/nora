// @ts-nocheck
// Shared helper for producing a deterministic container-launch shape across
// every provisioner backend (docker, k8s, nemoclaw, hermes).
//
// Problem this prevents: when a base image already defines ENTRYPOINT (e.g.
// the OpenShell sandbox ships with ENTRYPOINT ["/bin/bash"]) and we only set
// Cmd: ["sh", "-c", <script>], Docker concatenates them into
// "/bin/bash sh -c <script>" — bash then tries to execute the file named
// `sh` found in PATH (i.e. /usr/bin/sh) as a shell script, which fails with
// "cannot execute binary file". The only safe contract is to ALWAYS set both
// ENTRYPOINT (explicit interpreter) and CMD (the script payload).
//
// The helper is interpreter-agnostic and shape-agnostic: a single canonical
// bootstrap descriptor is converted to the dockerode/createContainer shape
// (`Entrypoint` + `Cmd`) or the Kubernetes PodSpec shape (`command` + `args`)
// via the two `toXLaunch` adapters. Adding a new backend (Proxmox, Podman,
// etc.) means implementing a new `toXLaunch` and nothing else.

const DEFAULT_SHELL = "/bin/sh";

/**
 * Build the canonical bootstrap descriptor.
 *
 * @param {string} script  Shell script body to run inside the container.
 * @param {object} [opts]
 * @param {string} [opts.shell="/bin/sh"]  Interpreter path. Prefer /bin/sh
 *   (POSIX-universal across alpine/busybox/debian/ubuntu). Override only when
 *   the target image is known to lack /bin/sh or when the script genuinely
 *   requires bashisms.
 * @param {boolean} [opts.login=false]  Run as a login shell (`-lc`) so the
 *   shell sources /etc/profile and ~/.bash_profile. Needed when the image
 *   relies on profile-level env setup (e.g. Hermes).
 *
 * Returns a plain object with `interpreter` (argv for the shell) and `script`.
 * The script is always passed as a SINGLE positional argument so word-
 * splitting under custom $IFS settings can never slice it.
 */
function buildContainerBootstrap(script, opts = {}) {
  const shell = typeof opts.shell === "string" && opts.shell ? opts.shell : DEFAULT_SHELL;
  const flag = opts.login ? "-lc" : "-c";
  return {
    interpreter: [shell, flag],
    script: String(script || ""),
  };
}

/**
 * dockerode createContainer shape. Pair with `WorkingDir`, `Env`, etc. on the
 * same options object.
 */
function toDockerLaunch(bootstrap) {
  return {
    Entrypoint: bootstrap.interpreter,
    Cmd: [bootstrap.script],
  };
}

/**
 * Kubernetes PodSpec container shape. In Kubernetes, `command` overrides the
 * image's ENTRYPOINT and `args` overrides CMD — exactly the semantics we want.
 */
function toK8sLaunch(bootstrap) {
  return {
    command: bootstrap.interpreter,
    args: [bootstrap.script],
  };
}

module.exports = {
  buildContainerBootstrap,
  toDockerLaunch,
  toK8sLaunch,
  DEFAULT_SHELL,
};
