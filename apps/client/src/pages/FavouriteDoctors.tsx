import { useNavigate } from "react-router-dom";
import { useFavouriteDoctors } from "../hooks/queries/usePatients";
import { Card, CardContent, CardHeader, CardTitle } from "../components/UI/card";
import { Badge } from "../components/UI/badge";
import { Skeleton } from "../components/primitives/Skeleton";
import { EmptyState } from "../components/primitives/EmptyState";
import { FavouriteToggle } from "../components/doctors/FavouriteToggle";

export default function FavouriteDoctors() {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useFavouriteDoctors();

  const favourites = Array.isArray(data) ? data : [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Favourite Doctors</h1>

      {isLoading && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      )}

      {isError && (
        <EmptyState
          title="Could not load favourites"
          description="Something went wrong. Try refreshing the page."
        />
      )}

      {!isLoading && !isError && favourites.length === 0 && (
        <EmptyState
          title="No favourites yet"
          description="Tap the heart on a doctor's card to save them here."
        />
      )}

      {!isLoading && favourites.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {favourites.map((fav: any) => (
            <Card
              key={fav.id}
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => navigate(`/doctors/${fav.doctorId}`)}
            >
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <CardTitle className="text-lg">{fav.doctor?.fullName}</CardTitle>
                <FavouriteToggle doctorId={fav.doctorId} />
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex flex-wrap gap-1">
                  {fav.doctor?.departments?.map((dd: any) => (
                    <Badge key={dd.department.id} variant="secondary">
                      {dd.department.name}
                    </Badge>
                  ))}
                </div>
                {fav.doctor?.consultationFee != null && (
                  <p className="text-sm">
                    Fee: ${Number(fav.doctor.consultationFee).toFixed(2)}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
