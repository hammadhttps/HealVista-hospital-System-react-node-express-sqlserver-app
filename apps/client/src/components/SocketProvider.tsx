import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { io, Socket } from "socket.io-client";
import { useAuthStore } from "../store/authStore";

const SocketContext = createContext<Socket | null>(null);

export function useSocket() {
  return useContext(SocketContext);
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    const token = localStorage.getItem("accessToken");
    const newSocket = io("/appointments", {
      auth: { token },
      transports: ["websocket"],
    });

    newSocket.on("connect", () => {});
    newSocket.on("connect_error", () => {});

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [user]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}
