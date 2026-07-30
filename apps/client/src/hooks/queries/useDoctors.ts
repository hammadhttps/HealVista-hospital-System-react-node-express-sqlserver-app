import { useQuery } from "@tanstack/react-query";
import { doctorApi } from "../../api/doctors";

export const doctorKeys = {
  all: ["doctors"] as const,
};

export function useDoctors(search?: string) {
  return useQuery({
    queryKey: [...doctorKeys.all, search],
    queryFn: () => doctorApi.list(search),
  });
}
