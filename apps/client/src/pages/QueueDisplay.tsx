import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { format } from "date-fns";
import { useQueue } from "../hooks/queries/useAppointments";
import { Skeleton } from "../components/primitives/Skeleton";

/**
 * Masks a patient name for public display: "Fatima Iqbal" -> "Fatima I."
 * A waiting-room screen is visible to everyone in the room, so full names never go up.
 */
function maskName(fullName: string | undefined, t: TFunction): string {
  if (!fullName) return t("reception:walkInName");
  const [first, ...rest] = fullName.trim().split(/\s+/);
  if (rest.length === 0) return first ?? t("reception:patientName");
  return `${first} ${rest[rest.length - 1]!.charAt(0).toUpperCase()}.`;
}

export default function QueueDisplay() {
  const { t } = useTranslation(["common", "reception"]);
  const { doctorId } = useParams<{ doctorId: string }>();
  const today = format(new Date(), "yyyy-MM-dd");
  const { data, isLoading, isError } = useQueue(doctorId ?? "", today);

  const tokens = Array.isArray(data) ? data : [];
  const nowServing = tokens.find((token: any) => token.status === "called");
  const waiting = tokens.filter((token: any) => token.status === "waiting").slice(0, 8);

  return (
    <div className="min-h-screen bg-slate-900 p-10 text-white">
      <header className="mb-10 flex items-baseline justify-between">
        <h1 className="text-4xl font-bold tracking-tight">{t("reception:waitingRoom")}</h1>
        <p className="text-2xl text-slate-400">{format(new Date(), "EEEE, d MMM · HH:mm")}</p>
      </header>

      {isLoading && <Skeleton className="h-64 bg-slate-800" />}

      {isError && <p className="text-3xl text-slate-400">{t("reception:queueUnavailable")}</p>}

      {!isLoading && !isError && (
        <div className="grid gap-10 lg:grid-cols-2">
          <section className="rounded-2xl bg-emerald-600 p-12 text-center">
            <p className="mb-4 text-2xl uppercase tracking-widest text-emerald-100">
              {t("reception:nowServing")}
            </p>
            {nowServing ? (
              <>
                <p className="text-9xl font-black leading-none">#{nowServing.tokenNumber}</p>
                <p className="mt-6 text-3xl text-emerald-50">
                  {maskName(nowServing.appointment?.patient?.fullName, t)}
                </p>
              </>
            ) : (
              <p className="text-5xl font-semibold text-emerald-100">{t("common:notAvailable")}</p>
            )}
          </section>

          <section>
            <p className="mb-4 text-2xl uppercase tracking-widest text-slate-400">
              {t("reception:nextUp")}
            </p>
            {waiting.length === 0 && (
              <p className="text-3xl text-slate-500">{t("reception:noOneWaiting")}</p>
            )}
            <ul className="space-y-3">
              {waiting.map((token: any) => (
                <li
                  key={token.id}
                  className="flex items-center justify-between rounded-xl bg-slate-800 px-8 py-5"
                >
                  <span className="text-5xl font-bold">#{token.tokenNumber}</span>
                  <span className="text-2xl text-slate-300">
                    {maskName(token.appointment?.patient?.fullName, t)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
