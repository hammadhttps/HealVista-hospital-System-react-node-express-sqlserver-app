import { useState } from "react";
import { useParams } from "react-router-dom";
import { usePatient } from "../hooks/queries/usePatients";
import { usePatientHistory } from "../hooks/queries/useClinical";
import { useMe } from "../hooks/queries/useAuth";
import { CardSkeleton } from "../components/primitives/Skeleton";
import { Breadcrumbs } from "../components/primitives/Breadcrumbs";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import AllergyBanner from "../components/clinical/AllergyBanner";
import HistoryPanel from "../components/clinical/HistoryPanel";
import VitalsPanel from "../components/clinical/VitalsPanel";
import RecordsPanel from "../components/records/RecordsPanel";
import LabOrdersPanel from "../components/lab/LabOrdersPanel";
import DoctorAssistantPanel from "../components/ai/DoctorAssistantPanel";

const TABS = [
  { value: "history", label: "History" },
  { value: "vitals", label: "Vitals" },
  { value: "lab", label: "Lab" },
  { value: "records", label: "Records" },
  { value: "ai", label: "AI", doctorOnly: true },
];

function ageFrom(dob?: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age -= 1;
  return Number.isFinite(age) ? age : null;
}

export default function PatientDetail() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState(TABS[0].value);

  const { data, isLoading, isError } = usePatient(id!);
  const { data: history, isLoading: historyLoading } = usePatientHistory(id!);
  const { data: me } = useMe();

  if (isLoading) return <CardSkeleton />;
  if (isError) return <div className="text-red-500">Patient not found</div>;
  if (!data) return null;

  const age = ageFrom(data.dateOfBirth);
  const canOrderLab = me?.role === "DOCTOR";
  const visibleTabs = TABS.filter((t) => !t.doctorOnly || me?.role === "DOCTOR");

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "Patients", href: "/patients" }, { label: data.fullName }]} />

      <AllergyBanner allergies={history?.allergies} isLoading={historyLoading} />

      {/* Patient header — the banner above is never tucked behind a tab. */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{data.fullName}</h1>
          <span className="font-mono text-sm text-gray-500">{data.mrn}</span>
          {data.gender && <Badge variant="outline">{data.gender}</Badge>}
          {data.bloodGroup && <Badge variant="outline">Blood {data.bloodGroup}</Badge>}
          {data.isOrganDonor && <Badge variant="default">Organ donor</Badge>}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
          {data.dateOfBirth && (
            <div>
              <span className="text-gray-500">Date of birth:</span>{" "}
              {new Date(data.dateOfBirth).toLocaleDateString()}
              {age !== null && <span className="text-gray-500"> ({age} y/o)</span>}
            </div>
          )}
          <div>
            <span className="text-gray-500">Email:</span> {data.user?.email}
          </div>
          <div>
            <span className="text-gray-500">Phone:</span> {data.user?.phone || "-"}
          </div>
          <div>
            <span className="text-gray-500">Marital status:</span> {data.maritalStatus || "-"}
          </div>
          {data.occupation && (
            <div>
              <span className="text-gray-500">Occupation:</span> {data.occupation}
            </div>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {visibleTabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="history" className="pt-4">
          <HistoryPanel patientId={id!} />
        </TabsContent>
        <TabsContent value="vitals" className="pt-4">
          <VitalsPanel patientId={id!} />
        </TabsContent>
        <TabsContent value="lab" className="pt-4">
          <LabOrdersPanel patientId={id!} canOrder={canOrderLab} />
        </TabsContent>
        <TabsContent value="records" className="pt-4">
          {/* Deletion is server-enforced via write access; showing the button just
              avoids offering an action that would fail. */}
          <RecordsPanel patientId={id!} canDelete />
        </TabsContent>
        {me?.role === "DOCTOR" && (
          <TabsContent value="ai" className="pt-4">
            <DoctorAssistantPanel patientId={id!} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
