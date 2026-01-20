/**
 * WebSocket Service for User Notifications
 */

export interface NotificationMessage {
  type: string;
  title: string;
  message: string;
  link?: string;
  level: 'info' | 'success' | 'warning' | 'error';
}

type MessageHandler = (message: NotificationMessage) => void;

class NotificationWebSocketService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 5000;
  private handlers: Set<MessageHandler> = new Set();
  private reconnectTimer: NodeJS.Timeout | null = null;

  connect() {
    // Only connect if not already connecting or open
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    // Assuming backend is on same host/port or proxied correctly. 
    // If running dev, we might need port 8003/8000 difference but usually proxy handles it.
    // Development fallback:
    const wsUrl = process.env.NODE_ENV === 'development' 
      ? 'ws://localhost:8003/ws/notifications/' 
      : `${protocol}//${host}/ws/notifications/`;

    console.log('Connecting to Notification WebSocket:', wsUrl);
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('Notification WebSocket connected');
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'notification') {
          this.notifyHandlers(data);
        }
      } catch (err) {
        console.error('Notification WS parse error', err);
      }
    };

    this.ws.onclose = () => {
      console.log('Notification WebSocket disconnected');
      this.handleReconnect();
    };

    this.ws.onerror = (err) => {
      console.error('Notification WebSocket error', err);
    };
  }

  private handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectTimer = setTimeout(() => {
        this.reconnectAttempts++;
        this.connect();
      }, this.reconnectDelay);
    }
  }

  onNotification(handler: MessageHandler) {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  private notifyHandlers(msg: NotificationMessage) {
    this.handlers.forEach(h => h(msg));
  }
}

export const notificationWS = new NotificationWebSocketService();
