import { useMutation, useQueryClient } from "@tanstack/react-query";
import { patientApi } from "../../api/patients";
import { patientKeys } from "../queries/usePatients";

export function useRegisterPatient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: patientApi.register,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: patientKeys.lists }),
  });
}
