import { useMe } from "../hooks/queries/useAuth";
import { usePatientReferrals } from "../hooks/queries/useClinical";
import { useActingPatientStore } from "../store/actingPatientStore";
import ReferralCard, { type ReferralRow } from "../components/referrals/ReferralCard";
import { EmptyState } from "../components/primitives/EmptyState";
import { CardSkeleton } from "../components/primitives/Skeleton";

/**
 * The patient's referrals. When a guardian is acting for a dependant, this shows the
 * dependant's referrals instead of the caller's own.
 */
export default function MyReferrals() {
  const { data: me } = useMe();
  const actingPatientId = useActingPatientStore((s) => s.actingPatientId);
  const patientId = actingPatientId ?? (me?.patient?.id as string | undefined);

  const { data, isLoading } = usePatientReferrals(patientId ?? "");

  if (!patientId || isLoading) return <CardSkeleton />;

  const referrals = (data ?? []) as ReferralRow[];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">My Referrals</h1>
      {referrals.length === 0 ? (
        <EmptyState
          title="No referrals yet"
          description="When a doctor refers you, it will appear here."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {referrals.map((r) => (
            <ReferralCard key={r.id} referral={r} />
          ))}
        </div>
      )}
    </div>
  );
}
