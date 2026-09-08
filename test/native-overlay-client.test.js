import test from 'node:test';
import assert from 'node:assert/strict';
import { NativeOverlayClient } from '../native-overlay-client.js';

class FakeSocket {
  static OPEN = 1;
  readyState = 0;
  listeners = {};
  sent = [];
  addEventListener(type, listener) { this.listeners[type] = listener; }
  send(message) { this.sent.push(message); }
  close() { this.readyState = 3; }
  open() { this.readyState = 1; this.listeners.open(); }
}

test('native overlay receives the latest caption as soon as it connects', () => {
  let socket;
  const states = [];
  const client = new NativeOverlayClient({
    WebSocketImpl: class extends FakeSocket { constructor() { super(); socket = this; } },
    onConnectionChange: (connected) => states.push(connected)
  });
  client.send({ type: 'caption', source: 'Hello', target: 'Hej' });
  client.connect();
  socket.open();

  assert.deepEqual(states, [true]);
  assert.deepEqual(JSON.parse(socket.sent[0]), { type: 'caption', source: 'Hello', target: 'Hej' });
  client.close();
});
