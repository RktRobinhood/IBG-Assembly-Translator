export class NativeOverlayClient {
  constructor({ WebSocketImpl = globalThis.WebSocket, url = 'ws://127.0.0.1:17863', onConnectionChange = () => {}, reconnectMs = 2000, heartbeatMs = 1000 } = {}) {
    this.WebSocketImpl = WebSocketImpl;
    this.url = url;
    this.onConnectionChange = onConnectionChange;
    this.reconnectMs = reconnectMs;
    this.heartbeatMs = heartbeatMs;
    this.socket = null;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.lastCaption = null;
  }

  connect() {
    if (!this.WebSocketImpl || this.socket) return;
    const socket = new this.WebSocketImpl(this.url);
    this.socket = socket;
    socket.addEventListener('open', () => {
      this.onConnectionChange(true);
      if (this.lastCaption) this.send(this.lastCaption);
      this.heartbeatTimer = setInterval(() => this.send({ type: 'ping' }), this.heartbeatMs);
    });
    socket.addEventListener('close', () => this.disconnected(socket));
    socket.addEventListener('error', () => socket.close());
  }

  disconnected(socket) {
    if (this.socket !== socket) return;
    this.socket = null;
    this.onConnectionChange(false);
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectMs);
  }

  send(message) {
    if (message.type === 'caption') this.lastCaption = message;
    if (this.socket?.readyState === 1) this.socket.send(JSON.stringify(message));
  }

  close() {
    clearTimeout(this.reconnectTimer);
    clearInterval(this.heartbeatTimer);
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }
}
