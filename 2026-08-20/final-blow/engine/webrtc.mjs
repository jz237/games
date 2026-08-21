const ICE_SERVERS = Object.freeze([{ urls: "stun:stun.cloudflare.com:3478" }]);

function candidatePayload(candidate) {
  if (!candidate) return null;
  if (typeof candidate.toJSON === "function") return candidate.toJSON();
  return {
    candidate: candidate.candidate,
    sdpMid: candidate.sdpMid,
    sdpMLineIndex: candidate.sdpMLineIndex,
    usernameFragment: candidate.usernameFragment,
  };
}

export class FinalBlowPeer {
  constructor({
    role,
    signaling,
    RTCPeerConnectionImpl = globalThis.RTCPeerConnection,
    onStatus = () => {},
    onLatency = () => {},
    onControl = () => {},
    onInput = () => {},
  }) {
    if (!['host', 'guest'].includes(role)) throw new Error("Invalid WebRTC role.");
    if (typeof RTCPeerConnectionImpl !== "function") throw new Error("This browser cannot create a WebRTC match link.");
    this.role = role;
    this.signaling = signaling;
    this.onStatus = onStatus;
    this.onLatency = onLatency;
    this.onControl = onControl;
    this.onInput = onInput;
    this.connection = new RTCPeerConnectionImpl({ iceServers: ICE_SERVERS });
    this.controlChannel = null;
    this.inputChannel = null;
    this.remoteCandidates = [];
    this.offerStarted = false;
    this.connected = false;
    this.closed = false;
    this.latencyTimer = 0;
    this.pendingLatency = new Map();
    this.signalQueue = Promise.resolve();
    this.stopSignalListener = signaling.onMessage((message) => {
      this.signalQueue = this.signalQueue.then(() => this.#handleSignal(message)).catch((error) => {
        this.onStatus("error", error instanceof Error ? error.message : "WebRTC signaling failed.");
      });
    });
    this.stopCloseListener = signaling.onClose(() => {
      if (this.connected) this.onStatus("connected", "Direct P2P link active. Signaling has closed.");
      else this.onStatus("closed", "Secure room link closed.");
    });
    this.connection.addEventListener("icecandidate", (event) => {
      signaling.send({ type: "ice", candidate: candidatePayload(event.candidate) });
    });
    this.connection.addEventListener("connectionstatechange", () => {
      const value = this.connection.connectionState;
      if (value === "failed" || value === "disconnected") this.onStatus("error", "Encrypted peer link interrupted.");
      if (value === "closed") this.onStatus("closed", "Encrypted peer link closed.");
      this.#checkReady();
    });
    this.connection.addEventListener("datachannel", (event) => this.#bindChannel(event.channel));
    if (role === "host") {
      this.#bindChannel(this.connection.createDataChannel("final-blow-control", { ordered: true }));
      this.#bindChannel(this.connection.createDataChannel("final-blow-input", { ordered: false, maxRetransmits: 0 }));
    }
    this.onStatus("signaling", "Secure signaling connected. Waiting for opponent…");
  }

  async #handleSignal(message) {
    if (this.closed) return;
    if (message.type === "welcome") {
      this.onStatus("waiting", message.peers?.includes(this.role === "host" ? "guest" : "host")
        ? "Opponent found. Negotiating encrypted peer link…"
        : "Private room open. Waiting for opponent…");
      if (this.role === "host" && message.peers?.includes("guest")) await this.#startOffer();
      return;
    }
    if (message.type === "peer") {
      if (message.state === "joined" && this.role === "host" && message.role === "guest") await this.#startOffer();
      if (message.state === "left") this.onStatus("waiting", "Opponent left. Room remains open until expiry.");
      return;
    }
    if (message.type === "offer" && this.role === "guest") {
      await this.connection.setRemoteDescription(message.description);
      await this.#flushCandidates();
      const answer = await this.connection.createAnswer();
      await this.connection.setLocalDescription(answer);
      this.signaling.send({ type: "answer", description: this.connection.localDescription });
      this.onStatus("connecting", "Answer sent. Establishing direct encrypted link…");
      return;
    }
    if (message.type === "answer" && this.role === "host") {
      await this.connection.setRemoteDescription(message.description);
      await this.#flushCandidates();
      this.onStatus("connecting", "Opponent answered. Establishing direct encrypted link…");
      return;
    }
    if (message.type === "ice") {
      if (message.candidate === null) return;
      if (!this.connection.remoteDescription) this.remoteCandidates.push(message.candidate);
      else await this.connection.addIceCandidate(message.candidate);
    }
  }

  async #startOffer() {
    if (this.offerStarted || this.closed) return;
    this.offerStarted = true;
    this.onStatus("connecting", "Opponent found. Building direct encrypted link…");
    const offer = await this.connection.createOffer();
    await this.connection.setLocalDescription(offer);
    this.signaling.send({ type: "offer", description: this.connection.localDescription });
  }

  async #flushCandidates() {
    const candidates = this.remoteCandidates.splice(0);
    for (const candidate of candidates) await this.connection.addIceCandidate(candidate);
  }

  #bindChannel(channel) {
    if (channel.label === "final-blow-control") this.controlChannel = channel;
    else if (channel.label === "final-blow-input") this.inputChannel = channel;
    else {
      channel.close();
      return;
    }
    channel.binaryType = "arraybuffer";
    channel.addEventListener("open", () => this.#checkReady());
    channel.addEventListener("close", () => {
      this.connected = false;
      this.#stopLatencyProbe();
      this.onStatus("waiting", "Peer data channel closed.");
    });
    if (channel.label === "final-blow-control") channel.addEventListener("message", (event) => this.#handleControl(event.data));
    else channel.addEventListener("message", async (event) => {
      const payload = event.data instanceof Blob ? await event.data.arrayBuffer() : event.data;
      this.onInput(payload);
    });
  }

  #checkReady() {
    const ready = this.controlChannel?.readyState === "open" && this.inputChannel?.readyState === "open";
    if (!ready || this.connected) return;
    this.connected = true;
    this.onStatus("connected", "Direct P2P link ready. Rollback combat is armed.");
    this.#startLatencyProbe();
  }

  #handleControl(raw) {
    if (typeof raw !== "string") return;
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (message?.type === "latency-ping" && typeof message.nonce === "string") {
      this.sendControl({ type: "latency-pong", nonce: message.nonce });
      return;
    }
    if (message?.type === "latency-pong" && typeof message.nonce === "string") {
      const sentAt = this.pendingLatency.get(message.nonce);
      if (sentAt !== undefined) {
        this.pendingLatency.delete(message.nonce);
        this.onLatency(Math.max(0, Math.round(performance.now() - sentAt)));
      }
      return;
    }
    this.onControl(message);
  }

  #startLatencyProbe() {
    this.#stopLatencyProbe();
    const probe = () => {
      if (!this.connected) return;
      const nonce = crypto.randomUUID();
      this.pendingLatency.set(nonce, performance.now());
      this.sendControl({ type: "latency-ping", nonce });
      if (this.pendingLatency.size > 4) {
        const first = this.pendingLatency.keys().next().value;
        if (first) this.pendingLatency.delete(first);
      }
    };
    probe();
    this.latencyTimer = globalThis.setInterval(probe, 2_000);
  }

  #stopLatencyProbe() {
    if (this.latencyTimer) globalThis.clearInterval(this.latencyTimer);
    this.latencyTimer = 0;
    this.pendingLatency.clear();
  }

  sendControl(message) {
    if (this.controlChannel?.readyState !== "open") return false;
    this.controlChannel.send(JSON.stringify(message));
    return true;
  }

  sendInput(packet) {
    if (this.inputChannel?.readyState !== "open") return false;
    this.inputChannel.send(packet);
    return true;
  }

  snapshot() {
    return {
      role: this.role,
      connectionState: this.connection.connectionState,
      controlState: this.controlChannel?.readyState || "missing",
      inputState: this.inputChannel?.readyState || "missing",
      connected: this.connected,
      controlBufferedAmount: this.controlChannel?.bufferedAmount || 0,
      inputBufferedAmount: this.inputChannel?.bufferedAmount || 0,
    };
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.#stopLatencyProbe();
    this.stopSignalListener?.();
    this.stopCloseListener?.();
    this.controlChannel?.close();
    this.inputChannel?.close();
    this.connection.close();
  }
}
