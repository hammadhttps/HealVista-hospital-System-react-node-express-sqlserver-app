import { useParams } from "react-router-dom";
import { format } from "date-fns";
import { useQueue } from "../hooks/queries/useAppointments";
import { Skeleton } from "../components/primitives/Skeleton";

/**
 * Masks a patient name for public display: "Fatima Iqbal" -> "Fatima I."
 * A waiting-room screen is visible to everyone in the room, so full names never go up.
 */
function maskName(fullName?: string): string {
  if (!fullName) return "Walk-in";
  const [first, ...rest] = fullName.trim().split(/\s+/);
  if (rest.length === 0) return first ?? "Patient";
  return `${first} ${rest[rest.length - 1]!.charAt(0).toUpperCase()}.`;
}

export default function QueueDisplay() {
  const { doctorId } = useParams<{ doctorId: string }>();
  const today = format(new Date(), "yyyy-MM-dd");
  const { data, isLoading, isError } = useQueue(doctorId ?? "", today);

  const tokens = Array.isArray(data) ? data : [];
  const nowServing = tokens.find((t: any) => t.status === "called");
  const waiting = tokens.filter((t: any) => t.status === "waiting").slice(0, 8);

  return (
    <div className="min-h-screen bg-slate-900 p-10 text-white">
      <header className="mb-10 flex items-baseline justify-between">
        <h1 className="text-4xl font-bold tracking-tight">Waiting Room</h1>
        <p className="text-2xl text-slate-400">{format(new Date(), "EEEE, d MMM · HH:mm")}</p>
      </header>

      {isLoading && <Skeleton className="h-64 bg-slate-800" />}

      {isError && (
        <p className="text-3xl text-slate-400">Queue unavailable — please ask at the front desk.</p>
      )}

      {!isLoading && !isError && (
        <div className="grid gap-10 lg:grid-cols-2">
          <section className="rounded-2xl bg-emerald-600 p-12 text-center">
            <p className="mb-4 text-2xl uppercase tracking-widest text-emerald-100">Now serving</p>
            {nowServing ? (
              <>
                <p className="text-9xl font-black leading-none">#{nowServing.tokenNumber}</p>
                <p className="mt-6 text-3xl text-emerald-50">
                  {maskName(nowServing.appointment?.patient?.fullName)}
                </p>
              </>
            ) : (
              <p className="text-5xl font-semibold text-emerald-100">—</p>
            )}
          </section>

          <section>
            <p className="mb-4 text-2xl uppercase tracking-widest text-slate-400">Next up</p>
            {waiting.length === 0 && <p className="text-3xl text-slate-500">No one waiting</p>}
            <ul className="space-y-3">
              {waiting.map((t: any) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between rounded-xl bg-slate-800 px-8 py-5"
                >
                  <span className="text-5xl font-bold">#{t.tokenNumber}</span>
                  <span className="text-2xl text-slate-300">
                    {maskName(t.appointment?.patient?.fullName)}
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
