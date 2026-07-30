import { useQuery } from "@tanstack/react-query";
import { holidaysApi } from "../../api/holidays";

export const holidayKeys = {
  all: ["holidays"] as const,
};

export function useHolidays() {
  return useQuery({
    queryKey: holidayKeys.all,
    queryFn: holidaysApi.list,
  });
}
