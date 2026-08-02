import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ClipboardCheck, FlaskConical, TestTube, CheckCircle2 } from "lucide-react";
import { useLabWorklist } from "../hooks/queries/useLabAndPharmacy";
import {
  useCollectSample,
  useEnterResults,
  useStartTesting,
  useVerifyLabOrder,
} from "../hooks/mutations/useLabPharmacyMutations";
import { useMe } from "../hooks/queries/useAuth";
import { format } from "date-fns";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
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

const FILTERS = [
  { value: "", key: "lab:allOpen" },
  { value: "ORDERED", key: "lab:ordered" },
  { value: "SAMPLE_COLLECTED", key: "lab:collected" },
  { value: "TESTING", key: "lab:testing" },
  { value: "COMPLETED", key: "lab:completed" },
] as const;

interface WorkItem {
  id: string;
  orderNumber: string;
  status: string;
  orderedAt: string;
  items: {
    id: string;
    labTest: { name: string; code: string; sampleType?: string };
    resultValue: string | null;
  }[];
  patient: { fullName: string; mrn: string };
  doctor: { fullName: string };
}

const statusVariant: Record<string, "default" | "warning" | "secondary" | "outline"> = {
  ORDERED: "secondary",
  SAMPLE_COLLECTED: "outline",
  TESTING: "warning",
  COMPLETED: "warning",
};

interface ResultDraft {
  [itemId: string]: { resultValue: string; unit: string; flag: string };
}

/**
 * The laboratory worklist — every order moving through the lab, one card per stage.
 * Actions follow the legal transitions: collect, start, enter results, verify.
 */
export default function Lab() {
  const { t } = useTranslation(["common", "lab"]);
  const [filter, setFilter] = useState<string>("");
  const [resultsOrder, setResultsOrder] = useState<WorkItem | null>(null);
  const [drafts, setDrafts] = useState<ResultDraft>({});

  const { data, isLoading } = useLabWorklist(filter);
  const collect = useCollectSample();
  const start = useStartTesting();
  const enterResults = useEnterResults();
  const verify = useVerifyLabOrder();
  const { data: me } = useMe();

  const canVerify = (me as any)?.labTechnician?.canVerify === true;
  const queue = Array.isArray(data) ? (data as WorkItem[]) : [];

  const run = (
    mutation: { isPending: boolean; mutate: (v: any, o?: any) => void },
    id: string,
    okMsg: string,
  ) =>
    mutation.mutate(id, {
      onSuccess: () => toast.success(okMsg),
      onError: (e: Error) => toast.error(e.message),
    });

  const submitResults = () => {
    if (!resultsOrder) return;
    const results = resultsOrder.items.map((item) => {
      const d = drafts[item.id] ?? { resultValue: "", unit: "", flag: "" };
      return {
        itemId: item.id,
        resultValue: d.resultValue,
        unit: d.unit || undefined,
        flag: (d.flag || undefined) as any,
      };
    });
    if (results.some((r) => !r.resultValue.trim())) {
      toast.error(t("lab:resultRequired"));
      return;
    }
    enterResults.mutate(
      { id: resultsOrder.id, results },
      {
        onSuccess: () => {
          toast.success(t("lab:resultsSaved"));
          setResultsOrder(null);
          setDrafts({});
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("lab:title")}</h1>
        <Badge variant="warning">{t("lab:openCount", { count: queue.length })}</Badge>
      </div>

      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList>
          {FILTERS.map((f) => (
            <TabsTrigger key={f.value} value={f.value}>
              {t(f.key)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={filter} className="pt-4">
          {isLoading && <Skeleton className="h-64" />}

          {!isLoading && queue.length === 0 && (
            <EmptyState title={t("common:nothingHere")} description={t("lab:noOrders")} />
          )}

          <div className="space-y-3">
            {!isLoading &&
              queue.map((order) => (
                <Card key={order.id}>
                  <CardContent className="p-4">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-semibold">{order.orderNumber}</span>
                        <span className="ml-2 text-sm text-gray-700">
                          {order.patient.fullName}
                          <span className="ml-1 text-xs text-gray-500">
                            MRN {order.patient.mrn}
                          </span>
                        </span>
                        <span className="ml-2 text-xs text-gray-500">
                          Dr. {order.doctor.fullName} ·{" "}
                          {format(new Date(order.orderedAt), "yyyy-MM-dd HH:mm")}
                        </span>
                      </div>
                      <Badge variant={statusVariant[order.status] ?? "outline"}>
                        {order.status}
                      </Badge>
                    </div>

                    <div className="mb-3 space-y-1">
                      {order.items.map((item) => (
                        <div key={item.id} className="flex items-center justify-between text-sm">
                          <span className="text-gray-700">
                            <FlaskConical className="mr-1 inline h-3.5 w-3.5 text-gray-400" />
                            {item.labTest.name}
                            <span className="ml-1 text-xs text-gray-400">
                              {item.labTest.code} · {item.labTest.sampleType}
                            </span>
                          </span>
                          {item.resultValue ? (
                            <span className="text-xs text-gray-500">{item.resultValue}</span>
                          ) : null}
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-end gap-2">
                      {order.status === "ORDERED" && (
                        <Button
                          size="sm"
                          onClick={() => run(collect, order.id, t("lab:sampleCollected"))}
                          disabled={collect.isPending}
                        >
                          <TestTube className="h-3.5 w-3.5" /> {t("lab:collectSample")}
                        </Button>
                      )}
                      {["SAMPLE_COLLECTED", "COMPLETED"].includes(order.status) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => run(start, order.id, t("lab:testingStarted"))}
                          disabled={start.isPending}
                        >
                          {t("lab:startTesting")}
                        </Button>
                      )}
                      {/* Results are entered once, from TESTING (the service rejects
                          the COMPLETED → COMPLETED transition). A completed order can
                          still be re-opened via "Start testing" for corrections. */}
                      {order.status === "TESTING" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setDrafts(
                              Object.fromEntries(
                                order.items.map((i) => [
                                  i.id,
                                  { resultValue: i.resultValue ?? "", unit: "", flag: "" },
                                ]),
                              ),
                            );
                            setResultsOrder(order);
                          }}
                        >
                          <ClipboardCheck className="h-3.5 w-3.5" /> {t("lab:enterResults")}
                        </Button>
                      )}
                      {order.status === "COMPLETED" && canVerify && (
                        <Button
                          size="sm"
                          onClick={() => run(verify, order.id, t("lab:orderVerified"))}
                          disabled={verify.isPending}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> {t("lab:verify")}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        </TabsContent>
      </Tabs>

      <ResultsDialog
        order={resultsOrder}
        drafts={drafts}
        setDrafts={setDrafts}
        onClose={() => setResultsOrder(null)}
        onSubmit={submitResults}
        pending={enterResults.isPending}
      />
    </div>
  );
}

function ResultsDialog({
  order,
  drafts,
  setDrafts,
  onClose,
  onSubmit,
  pending,
}: {
  order: WorkItem | null;
  drafts: ResultDraft;
  setDrafts: (updater: (prev: ResultDraft) => ResultDraft) => void;
  onClose: () => void;
  onSubmit: () => void;
  pending: boolean;
}) {
  const { t } = useTranslation(["common", "lab"]);
  const set = (
    itemId: string,
    patch: Partial<{ resultValue: string; unit: string; flag: string }>,
  ) =>
    setDrafts((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] ?? { resultValue: "", unit: "", flag: "" }), ...patch },
    }));

  const inputClass =
    "w-full rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none";

  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("lab:enterResultsTitle", { orderNumber: order?.orderNumber ?? "" })}
          </DialogTitle>
          <DialogDescription>{t("lab:criticalHint")}</DialogDescription>
        </DialogHeader>

        {order && (
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {order.items.map((item) => {
              const d = drafts[item.id] ?? { resultValue: "", unit: "", flag: "" };
              return (
                <div key={item.id} className="rounded-md border p-2">
                  <div className="mb-1 text-sm font-medium">
                    {item.labTest.name}
                    <span className="ml-1 text-xs text-gray-400">
                      {item.labTest.code} · {item.labTest.sampleType}
                    </span>
                  </div>
                  <div className="grid grid-cols-[1fr_80px_120px] gap-2">
                    <input
                      className={inputClass}
                      placeholder={t("lab:resultValue")}
                      value={d.resultValue}
                      onChange={(e) => set(item.id, { resultValue: e.target.value })}
                    />
                    <input
                      className={inputClass}
                      placeholder={t("lab:unit")}
                      value={d.unit}
                      onChange={(e) => set(item.id, { unit: e.target.value })}
                    />
                    <select
                      className={inputClass}
                      value={d.flag}
                      onChange={(e) => set(item.id, { flag: e.target.value })}
                    >
                      <option value="">{t("lab:flag")}</option>
                      <option value="LOW">{t("lab:low")}</option>
                      <option value="NORMAL">{t("lab:normal")}</option>
                      <option value="HIGH">{t("lab:high")}</option>
                      <option value="CRITICAL">{t("lab:critical")}</option>
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
            {t("common:cancel")}
          </Button>
          <Button onClick={onSubmit} disabled={pending}>
            {pending ? t("common:saving") : t("lab:saveResults")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
