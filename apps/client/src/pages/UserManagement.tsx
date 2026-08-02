import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { UserPlus, Search } from "lucide-react";
import { ROLES } from "@healvista/shared";
import { useUsers } from "../hooks/queries/useUsers";
import { useDepartments } from "../hooks/queries/useDepartments";
import { useCreateUser } from "../hooks/mutations/useUserMutations";
import { Skeleton } from "../components/primitives/Skeleton";
import { EmptyState } from "../components/primitives/EmptyState";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Button } from "../components/ui/button";

const ROLE_LABELS: Record<string, string> = {
  PATIENT: "Patient",
  DOCTOR: "Doctor",
  RECEPTIONIST: "Receptionist",
  PHARMACIST: "Pharmacist",
  LAB_TECHNICIAN: "Lab Technician",
  ACCOUNTANT: "Accountant",
  ADMIN: "Admin",
};

const createUserFormSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  email: z.string().email("A valid email is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  phone: z.string().optional(),
  role: z.enum(ROLES),
  departmentId: z.string().optional(),
  designation: z.string().optional(),
  licenseNumber: z.string().optional(),
  consultationFee: z.string().optional(),
  consultationMins: z.string().optional(),
  deskLocation: z.string().optional(),
  canVerify: z.boolean().optional(),
  gender: z.string().optional(),
  bloodGroup: z.string().optional(),
  dateOfBirth: z.string().optional(),
  addressLine1: z.string().optional(),
  city: z.string().optional(),
});

type CreateUserForm = z.infer<typeof createUserFormSchema>;

const inputClass =
  "w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none";

function roleBadgeClass(role: string) {
  const base = "px-2 py-0.5 rounded-full text-xs font-medium";
  switch (role) {
    case "DOCTOR":
      return `${base} bg-emerald-100 text-emerald-700`;
    case "ADMIN":
      return `${base} bg-red-100 text-red-700`;
    case "PATIENT":
      return `${base} bg-blue-100 text-blue-700`;
    default:
      return `${base} bg-gray-100 text-gray-700`;
  }
}

export default function UserManagement() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data, isLoading, isError } = useUsers({ search, role: roleFilter || undefined });
  const { data: departments } = useDepartments();
  const createUser = useCreateUser();

  const form = useForm<CreateUserForm>({
    resolver: zodResolver(createUserFormSchema),
    defaultValues: {
      role: "DOCTOR",
      fullName: "",
      email: "",
      password: "",
      phone: "",
      departmentId: "",
      designation: "",
      licenseNumber: "",
      consultationFee: "",
      consultationMins: "",
      deskLocation: "",
      canVerify: false,
      gender: "",
      bloodGroup: "",
      dateOfBirth: "",
      addressLine1: "",
      city: "",
    },
  });

  const selectedRole = form.watch("role");
  const role = selectedRole as string;
  const showsDepartment = [
    "DOCTOR",
    "RECEPTIONIST",
    "PHARMACIST",
    "LAB_TECHNICIAN",
    "ACCOUNTANT",
  ].includes(role);
  const showsLicense = ["DOCTOR", "PHARMACIST", "LAB_TECHNICIAN"].includes(role);

  const onSubmit = (values: CreateUserForm) => {
    const clean = (v?: string) => (v && v.trim().length ? v.trim() : undefined);
    const cleanNumber = (v?: string) => (v && v.trim().length ? Number(v) : undefined);

    createUser.mutate(
      {
        fullName: values.fullName.trim(),
        email: values.email.trim(),
        password: values.password,
        phone: clean(values.phone),
        role: values.role,
        departmentId: showsDepartment ? clean(values.departmentId) : undefined,
        designation: showsDepartment ? clean(values.designation) : undefined,
        licenseNumber: showsLicense ? clean(values.licenseNumber) : undefined,
        consultationFee: role === "DOCTOR" ? cleanNumber(values.consultationFee) : undefined,
        consultationMins: role === "DOCTOR" ? cleanNumber(values.consultationMins) : undefined,
        deskLocation: role === "RECEPTIONIST" ? clean(values.deskLocation) : undefined,
        canVerify: role === "LAB_TECHNICIAN" ? values.canVerify : undefined,
        gender: role === "PATIENT" ? (clean(values.gender) as any) : undefined,
        bloodGroup: role === "PATIENT" ? clean(values.bloodGroup) : undefined,
        dateOfBirth: role === "PATIENT" ? clean(values.dateOfBirth) : undefined,
        addressLine1: role === "PATIENT" ? clean(values.addressLine1) : undefined,
        city: role === "PATIENT" ? clean(values.city) : undefined,
      },
      {
        onSuccess: () => {
          toast.success(`${ROLE_LABELS[role]} account created`);
          form.reset();
          setDialogOpen(false);
        },
        onError: (e: any) => toast.error(e.message || "Failed to create user"),
      },
    );
  };

  if (isLoading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (isError) return <EmptyState title="Failed to load users" />;

  const users: any[] = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">User Management</h1>
        <Button onClick={() => setDialogOpen(true)}>
          <UserPlus className="h-4 w-4" /> New User
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <input
            className="rounded-md border border-gray-300 pl-8 pr-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            placeholder="Search name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="">All roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-4 text-sm font-medium text-gray-500">Name</th>
              <th className="text-left p-4 text-sm font-medium text-gray-500">Email</th>
              <th className="text-left p-4 text-sm font-medium text-gray-500">Role</th>
              <th className="text-left p-4 text-sm font-medium text-gray-500">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-gray-500">
                  No users found.
                </td>
              </tr>
            )}
            {users.map((u: any) => {
              const profileName =
                u.patient?.fullName ||
                u.doctor?.fullName ||
                u.receptionist?.fullName ||
                u.pharmacist?.fullName ||
                u.labTechnician?.fullName ||
                u.accountant?.fullName;
              return (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="p-4 font-medium text-gray-800">{profileName || "—"}</td>
                  <td className="p-4 text-gray-600">{u.email}</td>
                  <td className="p-4">
                    <span className={roleBadgeClass(u.role)}>{ROLE_LABELS[u.role] ?? u.role}</span>
                  </td>
                  <td className="p-4">
                    {u.isActive ? (
                      <span className="text-green-600">Active</span>
                    ) : (
                      <span className="text-red-600">Inactive</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => !o && !createUser.isPending && setDialogOpen(false)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" /> Create User Account
            </DialogTitle>
            <DialogDescription>
              Creates the account and role profile. Doctors are verified immediately.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <div>
              <label className="mb-1 block text-sm text-gray-600">Role</label>
              <select className={inputClass} {...form.register("role")}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm text-gray-600">Full name</label>
              <input className={inputClass} {...form.register("fullName")} />
              {form.formState.errors.fullName && (
                <p className="mt-1 text-xs text-red-600">
                  {form.formState.errors.fullName.message}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm text-gray-600">Email</label>
                <input type="email" className={inputClass} {...form.register("email")} />
                {form.formState.errors.email && (
                  <p className="mt-1 text-xs text-red-600">{form.formState.errors.email.message}</p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-600">Password</label>
                <input type="password" className={inputClass} {...form.register("password")} />
                {form.formState.errors.password && (
                  <p className="mt-1 text-xs text-red-600">
                    {form.formState.errors.password.message}
                  </p>
                )}
              </div>
            </div>

            {role === "PATIENT" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm text-gray-600">Gender</label>
                    <select className={inputClass} {...form.register("gender")}>
                      <option value="">—</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm text-gray-600">Blood group</label>
                    <input className={inputClass} {...form.register("bloodGroup")} />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm text-gray-600">Date of birth</label>
                  <input type="date" className={inputClass} {...form.register("dateOfBirth")} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm text-gray-600">Address</label>
                    <input className={inputClass} {...form.register("addressLine1")} />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm text-gray-600">City</label>
                    <input className={inputClass} {...form.register("city")} />
                  </div>
                </div>
              </>
            )}

            {showsDepartment && (
              <div>
                <label className="mb-1 block text-sm text-gray-600">Department</label>
                <select className={inputClass} {...form.register("departmentId")}>
                  <option value="">—</option>
                  {(departments as any[])?.map((d: any) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {role === "DOCTOR" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm text-gray-600">Consultation fee</label>
                  <input
                    type="number"
                    min={0}
                    className={inputClass}
                    {...form.register("consultationFee")}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-gray-600">Consultation minutes</label>
                  <input
                    type="number"
                    min={5}
                    className={inputClass}
                    {...form.register("consultationMins")}
                  />
                </div>
              </div>
            )}

            {showsLicense && (
              <div>
                <label className="mb-1 block text-sm text-gray-600">License number</label>
                <input className={inputClass} {...form.register("licenseNumber")} />
              </div>
            )}

            {role === "RECEPTIONIST" && (
              <div>
                <label className="mb-1 block text-sm text-gray-600">Desk location</label>
                <input
                  className={inputClass}
                  placeholder="e.g. Front Desk B"
                  {...form.register("deskLocation")}
                />
              </div>
            )}

            {role === "LAB_TECHNICIAN" && (
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" {...form.register("canVerify")} />
                Can verify results
              </label>
            )}

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={createUser.isPending}
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createUser.isPending}>
                {createUser.isPending ? "Creating…" : "Create User"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
