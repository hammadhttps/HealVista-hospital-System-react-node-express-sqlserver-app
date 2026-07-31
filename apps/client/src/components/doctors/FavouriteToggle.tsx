import { Heart } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "../../store/authStore";
import { useFavouriteDoctors } from "../../hooks/queries/usePatients";
import {
  useAddFavouriteDoctor,
  useRemoveFavouriteDoctor,
} from "../../hooks/mutations/usePatientMutations";

interface FavouriteToggleProps {
  doctorId: string;
}

/**
 * Favouriting is a patient-only feature — the endpoint is scoped to the caller's
 * own patient record, so the control is hidden for staff roles entirely.
 */
export function FavouriteToggle({ doctorId }: FavouriteToggleProps) {
  const role = useAuthStore((s) => s.user?.role);
  const isPatient = role === "PATIENT";

  const { data: favourites } = useFavouriteDoctors(isPatient);
  const add = useAddFavouriteDoctor();
  const remove = useRemoveFavouriteDoctor();

  if (!isPatient) return null;

  const isFavourite = Array.isArray(favourites)
    ? favourites.some((f: { doctorId: string }) => f.doctorId === doctorId)
    : false;
  const pending = add.isPending || remove.isPending;

  const toggle = (e: React.MouseEvent) => {
    // Cards are clickable — don't navigate when the heart is hit.
    e.stopPropagation();
    if (pending) return;

    if (isFavourite) {
      remove.mutate(doctorId, {
        onSuccess: () => toast.success("Removed from favourites"),
        onError: () => toast.error("Could not remove favourite"),
      });
    } else {
      add.mutate(doctorId, {
        onSuccess: () => toast.success("Added to favourites"),
        onError: () => toast.error("Could not add favourite"),
      });
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={isFavourite}
      aria-label={isFavourite ? "Remove from favourites" : "Add to favourites"}
      className="rounded-full p-2 transition hover:bg-muted disabled:opacity-50"
    >
      <Heart
        className={`h-5 w-5 ${isFavourite ? "fill-red-500 text-red-500" : "text-muted-foreground"}`}
      />
    </button>
  );
}
