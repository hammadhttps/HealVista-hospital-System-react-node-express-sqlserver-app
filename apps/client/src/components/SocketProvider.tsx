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
    const opts = { auth: { token }, transports: ["websocket"] };
    const origin: string = import.meta.env.VITE_API_URL
      ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, "")
      : "";

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
