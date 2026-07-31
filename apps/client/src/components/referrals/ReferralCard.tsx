import { Badge } from "../ui/badge";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { useRespondToReferral } from "../../hooks/mutations/useClinicalMutations";

export interface ReferralRow {
  id: string;
  patientId: string;
  fromDoctorId: string;
  toDoctorId: string | null;
  toDepartmentId: string | null;
  appointmentId?: string | null;
  reason: string;
  notes?: string | null;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "COMPLETED";
  createdAt: string;
  patientName?: string | null;
  patientMrn?: string | null;
  fromDoctorName?: string | null;
  toDoctorName?: string | null;
  toDepartmentName?: string | null;
}

const statusTone: Record<ReferralRow["status"], "warning" | "default" | "outline" | "destructive"> =
  {
    PENDING: "warning",
    ACCEPTED: "default",
    DECLINED: "destructive",
    COMPLETED: "outline",
  };

/**
 * A referral card. `actions="incoming"` shows accept/decline/complete for the
 * addressed doctor's inbox; everything else renders read-only (outgoing list,
 * patient view).
 */
export default function ReferralCard({
  referral,
  actions = "none",
}: {
  referral: ReferralRow;
  actions?: "incoming" | "none";
}) {
  const respond = useRespondToReferral();
  const destination = referral.toDoctorName ?? referral.toDepartmentName ?? "a colleague";

  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <Badge variant={statusTone[referral.status]}>{referral.status}</Badge>
          <span className="text-xs text-gray-400">
            {new Date(referral.createdAt).toLocaleString()}
          </span>
        </div>
        <p className="text-sm">
          <span className="font-medium">{referral.patientName ?? "Patient"}</span>
          {referral.patientMrn && (
            <span className="ml-2 font-mono text-xs text-gray-500">{referral.patientMrn}</span>
          )}
        </p>
        <p className="text-sm text-gray-600">
          {referral.fromDoctorName ?? "A doctor"} → {destination}
        </p>
        <p className="text-sm">{referral.reason}</p>
        {referral.notes && <p className="text-sm text-gray-500">{referral.notes}</p>}

        {actions === "incoming" && referral.status === "PENDING" && (
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              disabled={respond.isPending}
              onClick={() => respond.mutate({ id: referral.id, status: "ACCEPTED" })}
            >
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={respond.isPending}
              onClick={() => respond.mutate({ id: referral.id, status: "DECLINED" })}
            >
              Decline
            </Button>
          </div>
        )}
        {actions === "incoming" && referral.status === "ACCEPTED" && (
          <div className="pt-1">
            <Button
              size="sm"
              variant="outline"
              disabled={respond.isPending}
              onClick={() => respond.mutate({ id: referral.id, status: "COMPLETED" })}
            >
              Mark complete
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
