import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { toast } from "sonner";
import { UserPlus, ScanLine } from "lucide-react";
import { useAppointments } from "../hooks/queries/useAppointments";
import { useCheckInScan } from "../hooks/mutations/useAppointmentMutations";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Skeleton } from "../components/primitives/Skeleton";
import { EmptyState } from "../components/primitives/EmptyState";
import { getErrorMessage } from "../utils/errors";

const statusColor: Record<string, string> = {
  PENDING_PAYMENT: "warning",
  CONFIRMED: "default",
  CHECKED_IN: "info",
  IN_CONSULTATION: "info",
  COMPLETED: "success",
  CANCELLED: "destructive",
  NO_SHOW: "destructive",
};

function todayRange() {
  const now = new Date();
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);
  return { fromDate: from.toISOString(), toDate: to.toISOString() };
}

export default function ReceptionDesk() {
  const { t } = useTranslation(["common", "reception"]);
  const navigate = useNavigate();
  const [token, setToken] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const scan = useCheckInScan();

  const { data, isLoading, isError } = useAppointments({ ...todayRange(), limit: 100 });
  const appointments = data?.data ?? [];

  const submitToken = () => {
    const value = token.trim();
    if (!value) return;

    scan.mutate(value, {
      onSuccess: (apt: any) => {
        toast.success(
          t("reception:checkedIn", {
            name: apt?.patient?.fullName ?? t("reception:patientFallback"),
          }),
        );
        setToken("");
        inputRef.current?.focus();
      },
      onError: (err: any) => {
        toast.error(getErrorMessage(err, t("reception:checkInFailed")));
        setToken("");
        inputRef.current?.focus();
      },
    });
  };

  const waiting = appointments.filter((a: any) => a.status === "CHECKED_IN").length;
  const expected = appointments.filter((a: any) => a.status === "CONFIRMED").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("reception:title")}</h1>
        <Button onClick={() => navigate("/patients/register")}>
          <UserPlus className="mr-2 h-4 w-4" /> {t("reception:registerWalkIn")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ScanLine className="h-5 w-5" /> {t("reception:scanCheckInCode")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {/*
            A hardware QR/barcode scanner acts as a keyboard: it types the token and
            sends Enter. So a focused text input is the scanner integration — and it
            doubles as manual entry when the code won't scan.
          */}
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              autoFocus
              value={token}
              placeholder={t("reception:scanPlaceholder")}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitToken()}
            />
            <Button onClick={submitToken} disabled={scan.isPending || !token.trim()}>
              {scan.isPending ? t("reception:checkingIn") : t("reception:checkIn")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("reception:scannerHint")}</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{t("reception:today")}</p>
            <p className="text-2xl font-bold">{appointments.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{t("reception:expected")}</p>
            <p className="text-2xl font-bold">{expected}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{t("reception:waiting")}</p>
            <p className="text-2xl font-bold">{waiting}</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">{t("reception:todayAppointments")}</h2>

        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        )}

        {isError && (
          <EmptyState title={t("reception:loadFailed")} description={t("common:errorBody")} />
        )}

        {!isLoading && !isError && appointments.length === 0 && (
          <EmptyState
            title={t("reception:nothingBooked")}
            description={t("reception:scheduleEmpty")}
          />
        )}

        {!isLoading && appointments.length > 0 && (
          <div className="space-y-2">
            {appointments.map((apt: any) => (
              <Card key={apt.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium">{apt.patient?.fullName}</p>
                    <p className="text-sm text-muted-foreground">
                      MRN {apt.patient?.mrn} &middot; Dr. {apt.doctor?.fullName}
                      {apt.slot && ` · ${format(new Date(apt.slot.startTime), "HH:mm")}`}
                    </p>
                  </div>
                  <Badge variant={statusColor[apt.status] as any}>{apt.status}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
