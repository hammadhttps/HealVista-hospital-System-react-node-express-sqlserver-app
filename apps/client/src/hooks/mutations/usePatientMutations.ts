import { useMutation, useQueryClient } from "@tanstack/react-query";
import { patientApi, favouriteApi } from "../../api/patients";
import { patientKeys, favouriteKeys } from "../queries/usePatients";

export function useRegisterPatient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: patientApi.register,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: patientKeys.lists }),
  });
}

export function useAddFavouriteDoctor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: favouriteApi.add,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: favouriteKeys.all }),
  });
}

export function useRemoveFavouriteDoctor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: favouriteApi.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: favouriteKeys.all }),
  });
}
