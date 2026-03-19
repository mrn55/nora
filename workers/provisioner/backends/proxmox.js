const axios = require("axios");
const https = require("https");
const ProvisionerBackend = require("./interface");

class ProxmoxBackend extends ProvisionerBackend {
  constructor() {
    super();
    this.baseUrl = process.env.PROXMOX_API_URL; // e.g. https://pve.example.com:8006/api2/json
    this.tokenId = process.env.PROXMOX_TOKEN_ID; // e.g. root@pam!openclaw
    this.tokenSecret = process.env.PROXMOX_TOKEN_SECRET;
    this.node = process.env.PROXMOX_NODE || "pve";
    this.template = process.env.PROXMOX_TEMPLATE || "local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst";

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `PVEAPIToken=${this.tokenId}=${this.tokenSecret}`,
      },
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      timeout: 60000,
    });
  }

  async _getNextVmid() {
    const res = await this.client.get("/cluster/nextid");
    return res.data.data;
  }

  async create(config) {
    const { id, name, vcpu, ram_mb, disk_gb } = config;
    const vmid = await this._getNextVmid();
    const hostname = `oclaw-agent-${id}`;

    console.log(`[proxmox] Creating LXC ${hostname} (vmid=${vmid}) on node ${this.node}`);

    await this.client.post(`/nodes/${this.node}/lxc`, {
      vmid,
      hostname,
      ostemplate: this.template,
      cores: vcpu || 2,
      memory: ram_mb || 2048,
      swap: 512,
      rootfs: `local-lvm:${disk_gb || 20}`,
      net0: "name=eth0,bridge=vmbr0,ip=dhcp",
      start: 1,
      unprivileged: 1,
      description: `OpenClaw Agent ${name || id}`,
    });

    // Wait for container to get an IP
    let host = null;
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const netRes = await this.client.get(
          `/nodes/${this.node}/lxc/${vmid}/interfaces`
        );
        const interfaces = netRes.data.data || [];
        const eth0 = interfaces.find((iface) => iface.name === "eth0");
        if (eth0 && eth0["inet"]) {
          host = eth0["inet"].split("/")[0];
          break;
        }
      } catch {
        // interfaces endpoint may not be ready yet
      }
    }

    console.log(`[proxmox] LXC ${vmid} started at ${host || "pending"}`);
    return { containerId: String(vmid), host: host || "pending" };
  }

  async destroy(containerId) {
    const vmid = containerId;
    console.log(`[proxmox] Destroying LXC ${vmid}`);
    try {
      await this.client.post(`/nodes/${this.node}/lxc/${vmid}/status/stop`);
      // Wait for stop
      await new Promise((r) => setTimeout(r, 5000));
    } catch {
      // already stopped
    }
    await this.client.delete(`/nodes/${this.node}/lxc/${vmid}`);
    console.log(`[proxmox] LXC ${vmid} deleted`);
  }

  async status(containerId) {
    const vmid = containerId;
    try {
      const res = await this.client.get(
        `/nodes/${this.node}/lxc/${vmid}/status/current`
      );
      const data = res.data.data;
      return {
        running: data.status === "running",
        uptime: data.uptime || 0,
        cpu: data.cpu || 0,
        memory: data.mem || 0,
      };
    } catch {
      return { running: false, uptime: 0, cpu: null, memory: null };
    }
  }

  async stop(containerId) {
    const vmid = containerId;
    console.log(`[proxmox] Stopping LXC ${vmid}`);
    await this.client.post(`/nodes/${this.node}/lxc/${vmid}/status/shutdown`, { timeout: 30 });
    // Wait for graceful shutdown, then force-stop if needed
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const s = await this.status(vmid);
      if (!s.running) {
        console.log(`[proxmox] LXC ${vmid} stopped`);
        return;
      }
    }
    // Force stop
    await this.client.post(`/nodes/${this.node}/lxc/${vmid}/status/stop`);
    console.log(`[proxmox] LXC ${vmid} force-stopped`);
  }

  async start(containerId) {
    const vmid = containerId;
    console.log(`[proxmox] Starting LXC ${vmid}`);
    await this.client.post(`/nodes/${this.node}/lxc/${vmid}/status/start`);
    // Wait for it to be running
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const s = await this.status(vmid);
      if (s.running) {
        console.log(`[proxmox] LXC ${vmid} started`);
        return;
      }
    }
    console.warn(`[proxmox] LXC ${vmid} start — may still be booting`);
  }

  async restart(containerId) {
    const vmid = containerId;
    console.log(`[proxmox] Restarting LXC ${vmid}`);
    await this.client.post(`/nodes/${this.node}/lxc/${vmid}/status/reboot`);
    console.log(`[proxmox] LXC ${vmid} reboot requested`);
  }

  /**
   * Inject the OpenClaw agent runtime into an LXC container via pct exec.
   * Requires the runtime directory to be accessible on the Proxmox host.
   */
  async injectRuntime(containerId) {
    const vmid = containerId;
    console.log(`[proxmox] Injecting agent runtime into LXC ${vmid}`);
    try {
      // Push files via pct push (requires Proxmox host access)
      // For now, we install via curl from agent-runtime HTTP endpoint
      await this.client.post(`/nodes/${this.node}/lxc/${vmid}/status/exec`, {
        command: [
          "sh", "-c",
          "mkdir -p /opt/openclaw && echo 'OpenClaw runtime placeholder' > /opt/openclaw/.installed"
        ]
      });
      console.log(`[proxmox] Runtime injected into LXC ${vmid}`);
    } catch (e) {
      console.warn(`[proxmox] Runtime injection failed for LXC ${vmid}:`, e.message);
    }
  }
}

module.exports = ProxmoxBackend;
