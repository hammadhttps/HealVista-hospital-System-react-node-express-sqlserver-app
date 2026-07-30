import { useState, useEffect } from "react";

export function useCountdown(expiresAt: number | null) {
  const [remaining, setRemaining] = useState<number>(0);

  useEffect(() => {
    if (!expiresAt) {
      setRemaining(0);
      return;
    }

    const tick = () => {
      const diff = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setRemaining(diff);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  return {
    remaining,
    formatted: `${minutes}:${String(seconds).padStart(2, "0")}`,
    isExpired: remaining <= 0,
  };
}
