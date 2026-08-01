import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from "react";
import { io, Socket } from "socket.io-client";
import { useAuthStore } from "../store/authStore";

interface SocketContextValue {
  appointmentSocket: Socket | null;
  notificationSocket: Socket | null;
  chatSocket: Socket | null;
}

const SocketContext = createContext<SocketContextValue>({
  appointmentSocket: null,
  notificationSocket: null,
  chatSocket: null,
});

export function useSocket() {
  return useContext(SocketContext);
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const [appointmentSocket, setAppointmentSocket] = useState<Socket | null>(null);
  const [notificationSocket, setNotificationSocket] = useState<Socket | null>(null);
  const [chatSocket, setChatSocket] = useState<Socket | null>(null);
  const user = useAuthStore((s) => s.user);
  const prevUserRef = useRef(user);

  useEffect(() => {
    const prevUser = prevUserRef.current;
    prevUserRef.current = user;

    if (!user) {
      if (appointmentSocket) {
        appointmentSocket.disconnect();
        setAppointmentSocket(null);
      }
      if (notificationSocket) {
        notificationSocket.disconnect();
        setNotificationSocket(null);
      }
      if (chatSocket) {
        chatSocket.disconnect();
        setChatSocket(null);
      }
      return;
    }

    const token = localStorage.getItem("accessToken");

    /**
     * `polling` first, then upgrade to `websocket`.
     *
     * Websocket-only looks faster but fails hard wherever the upgrade is blocked
     * — Render's proxy during a cold start, corporate proxies, and some mobile
     * networks — and with no fallback the socket never connects at all, which
     * surfaces to the user as a network error. Polling always establishes, then
     * socket.io silently upgrades when the upgrade succeeds.
     *
     * Reconnection matters just as much here: Render idles free instances, so
     * the first connection after a spin-down will fail and must be retried.
     */
    const opts = {
      auth: { token },
      transports: ["polling", "websocket"],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
    };
    const origin: string = (
      import.meta.env.VITE_API_URL ||
      (import.meta.env.PROD ? "https://healvista-hospital-system-react-node.onrender.com/api" : "")
    ).replace(/\/api\/?$/, "");

    const aptSocket = io(`${origin}/appointments`, opts);
    setAppointmentSocket(aptSocket);

    const notifSocket = io(`${origin}/notifications`, opts);
    setNotificationSocket(notifSocket);

    const cSocket = io(`${origin}/chat`, opts);
    setChatSocket(cSocket);

    return () => {
      aptSocket.disconnect();
      notifSocket.disconnect();
      cSocket.disconnect();
    };
  }, [user]);

  return (
    <SocketContext.Provider value={{ appointmentSocket, notificationSocket, chatSocket }}>
      {children}
    </SocketContext.Provider>
  );
}
