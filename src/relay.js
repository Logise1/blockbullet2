// WebSocket Relay Connection Manager

export class GameRelay {
  constructor() {
    this.socket = null;
    this.roomID = null;
    this.username = null;
    this.callbacks = {};
  }

  connect(roomID, username, callbacks = {}) {
    this.roomID = encodeURIComponent(roomID);
    this.username = encodeURIComponent(username);
    this.callbacks = callbacks;

    const url = `wss://logiseonlineservices.arielcapdevila.com/${this.roomID}/${this.username}`;
    console.log(`[WS] Connecting to ${url}...`);
    
    try {
      this.socket = new WebSocket(url);
    } catch (e) {
      console.error("[WS] Connection setup failed:", e);
      if (this.callbacks.onError) this.callbacks.onError(e);
      return;
    }

    this.socket.onopen = () => {
      console.log(`[WS] Connected to room: ${roomID} as ${username}`);
      if (this.callbacks.onConnect) {
        this.callbacks.onConnect();
      }
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.username) {
          data.username = decodeURIComponent(data.username);
        }
        
        // 1. System messages
        if (data.type === "system") {
          console.log(`[WS SYSTEM] ${data.username}: ${data.action}`);
          if (this.callbacks.onSystem) {
            this.callbacks.onSystem(data.action, data.username, data.message);
          }
        } 
        // 2. Chat/Game messages
        else if (data.type === "chat") {
          // Prevent echoing our own messages
          const decodedUsername = decodeURIComponent(this.username);
          if (data.username === decodedUsername) return;

          try {
            const payload = JSON.parse(data.message);
            console.log(`[WS GAME] Msg from ${data.username}:`, payload);
            if (this.callbacks.onGameMessage) {
              this.callbacks.onGameMessage(data.username, payload);
            }
          } catch (e) {
            // Text messages fallback (in case players send normal text)
            console.log(`[WS CHAT] ${data.username}: ${data.message}`);
            if (this.callbacks.onChatMessage) {
              this.callbacks.onChatMessage(data.username, data.message);
            }
          }
        }
      } catch (e) {
        console.error("[WS] Error parsing message:", e);
      }
    };

    this.socket.onclose = (event) => {
      console.log("[WS] Disconnected from server.", event);
      if (this.callbacks.onDisconnect) {
        this.callbacks.onDisconnect(event);
      }
    };

    this.socket.onerror = (error) => {
      console.error("[WS] Socket error:", error);
      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }
    };
  }

  send(payload) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.error("[WS] Cannot send message: Socket is not open.");
      return false;
    }

    try {
      const msgStr = JSON.stringify(payload);
      this.socket.send(msgStr);
      return true;
    } catch (e) {
      console.error("[WS] Error stringifying or sending payload:", e);
      return false;
    }
  }

  close() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}
