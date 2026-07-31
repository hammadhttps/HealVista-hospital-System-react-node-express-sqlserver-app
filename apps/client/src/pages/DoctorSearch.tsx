import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { doctorSearchApi } from "../api/appointments";
import { Button } from "../components/UI/button";
import { Input } from "../components/UI/input";
import { Card, CardContent, CardHeader, CardTitle } from "../components/UI/card";
import { Badge } from "../components/UI/badge";
import { Skeleton } from "../components/primitives/Skeleton";
import { EmptyState } from "../components/primitives/EmptyState";
import { FavouriteToggle } from "../components/doctors/FavouriteToggle";

export default function DoctorSearch() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  // Seeded so the page lists doctors on first load rather than showing a false
  // "no doctors found" empty state before anyone has typed anything.
  const [filters, setFilters] = useState<Record<string, string | number>>({
    page: 1,
    limit: 20,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["doctors", "search", filters],
    queryFn: () => doctorSearchApi.search(filters),
  });

  const doctors = data?.data ?? data ?? [];

  const handleSearch = () => {
    setFilters({ search, page: 1, limit: 20 });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Find a Doctor</h1>

      <div className="flex gap-2">
        <Input
          placeholder="Search by name, specialty..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
        <Button onClick={handleSearch}>Search</Button>
      </div>

      {isLoading && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      )}

      {!isLoading && doctors.length === 0 && (
        <EmptyState title="No doctors found" description="Try a different search term." />
      )}

      {!isLoading && doctors.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {doctors.map((doc: any) => (
            <Card
              key={doc.id}
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => navigate(`/doctors/${doc.id}`)}
            >
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <CardTitle className="text-lg">{doc.fullName}</CardTitle>
                <FavouriteToggle doctorId={doc.id} />
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-muted-foreground">{doc.bio}</p>
                <div className="flex flex-wrap gap-1">
                  {doc.departments?.map((dd: any) => (
                    <Badge key={dd.department.id} variant="secondary">
                      {dd.department.name}
                    </Badge>
                  ))}
                </div>
                <p className="text-sm">
                  Fee: ${Number(doc.consultationFee).toFixed(2)} &middot; {doc.experienceYears}{" "}
                  years exp
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
