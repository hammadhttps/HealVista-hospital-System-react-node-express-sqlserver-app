import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../UI/dialog";
import { Button } from "../UI/button";
import { Skeleton } from "../primitives/Skeleton";

interface AppointmentQRProps {
  qrToken: string;
  appointmentNo?: string;
  /** Renders the trigger as a compact icon-sized button. */
  size?: "sm" | "default";
}

/**
 * Renders the appointment's `qrToken` as a scannable QR code for reception to scan.
 * The token is generated server-side per appointment; this only encodes it.
 */
export function AppointmentQR({ qrToken, appointmentNo, size = "sm" }: AppointmentQRProps) {
  const [open, setOpen] = useState(false);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  // Imperative library init — allowed under CLAUDE.md §6. Not data fetching.
  useEffect(() => {
    if (!open || !qrToken) return;
    let cancelled = false;

    QRCode.toDataURL(qrToken, { width: 320, margin: 2, errorCorrectionLevel: "M" })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [open, qrToken]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size={size} variant="outline" />}>Show QR</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            Check-in code{appointmentNo ? ` · #${appointmentNo}` : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          {!dataUrl && !error && <Skeleton className="h-[320px] w-[320px]" />}

          {error && (
            <p className="text-sm text-destructive">
              Could not render the code. Show this reference to reception instead:
            </p>
          )}

          {dataUrl && (
            <img
              src={dataUrl}
              alt={`QR check-in code for appointment ${appointmentNo ?? ""}`}
              className="rounded-lg border"
              width={320}
              height={320}
            />
          )}

          <p className="text-center text-sm text-muted-foreground">
            Show this at the front desk to check in.
          </p>
          <code className="text-xs text-muted-foreground break-all">{qrToken}</code>
        </div>
      </DialogContent>
    </Dialog>
  );
}
