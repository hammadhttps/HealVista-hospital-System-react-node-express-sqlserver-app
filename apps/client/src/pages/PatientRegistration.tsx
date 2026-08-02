import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useRegisterPatient } from "../hooks/mutations/usePatientMutations";

export default function PatientRegistration() {
  const { t } = useTranslation(["common", "patients"]);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();
  const mutation = useRegisterPatient();
  const navigate = useNavigate();

  const onSubmit = (data: any) => {
    mutation.mutate(data, {
      onSuccess: () => {
        toast.success(t("patients:registerSuccess"));
        navigate("/patients");
      },
    });
  };

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-6">{t("patients:create")}</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium">{t("patients:fullName")}</label>
          <input
            {...register("fullName", { required: true })}
            className="w-full border p-2 rounded"
          />
          {errors.fullName && (
            <span className="text-red-500 text-sm">{t("patients:required")}</span>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium">{t("patients:email")}</label>
          <input
            type="email"
            {...register("email", { required: true })}
            className="w-full border p-2 rounded"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">{t("patients:password")}</label>
          <input
            type="password"
            {...register("password", { required: true, minLength: 8 })}
            className="w-full border p-2 rounded"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">{t("patients:phone")}</label>
          <input {...register("phone")} className="w-full border p-2 rounded" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium">{t("patients:gender")}</label>
            <select {...register("gender")} className="w-full border p-2 rounded">
              <option value="">{t("patients:select")}</option>
              <option value="Male">{t("patients:male")}</option>
              <option value="Female">{t("patients:female")}</option>
              <option value="Other">{t("patients:other")}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">{t("patients:bloodGroup")}</label>
            <select {...register("bloodGroup")} className="w-full border p-2 rounded">
              <option value="">Select</option>
              {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((bg) => (
                <option key={bg} value={bg}>
                  {bg}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {mutation.isPending ? t("patients:registering") : t("patients:create")}
        </button>
      </form>
    </div>
  );
}
