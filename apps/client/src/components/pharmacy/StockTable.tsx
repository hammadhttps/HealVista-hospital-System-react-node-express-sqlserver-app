import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, PackagePlus, ScanLine, Search } from "lucide-react";
import { useMedicines, useStockHistory } from "../../hooks/queries/useLabAndPharmacy";
import { format } from "date-fns";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Skeleton } from "../primitives/Skeleton";
import { EmptyState } from "../primitives/EmptyState";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import RestockDialog from "./RestockDialog";

interface MedicineRow {
  id: string;
  name: string;
  genericName: string | null;
  barcode: string | null;
  category: string | null;
  unit: string;
  unitPrice: { toString: () => string };
  inventory: {
    quantity: number;
    reorderLevel: number;
    batchNumber: string | null;
    expiryDate: string | null;
  } | null;
}

interface Paginated {
  items: MedicineRow[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Inventory stock table — searchable, paginated, with the restock action on each
 * row. Uses the same query key as the low-stock endpoint so the two views agree.
 */
export default function StockTable() {
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [barcode, setBarcode] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [restockMedicine, setRestockMedicine] = useState<MedicineRow | null>(null);
  const [historyMedicine, setHistoryMedicine] = useState<MedicineRow | null>(null);

  const { data, isLoading, isError, refetch } = useMedicines({
    search: applied || undefined,
    lowStockOnly,
    page,
    pageSize,
  });

  const paginated = (data ?? { items: [], total: 0, page: 1, pageSize }) as Paginated;
  const totalPages = Math.max(1, Math.ceil(paginated.total / paginated.pageSize));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-md border border-gray-300 px-2 py-1.5">
          <Search className="h-4 w-4 text-gray-400" />
          <input
            className="text-sm focus:outline-none"
            placeholder="Search medicines"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setApplied(search);
                setPage(1);
              }
            }}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setApplied(search);
            setPage(1);
          }}
        >
          Search
        </Button>

        <div className="flex items-center gap-2 rounded-md border border-gray-300 px-2 py-1.5">
          <ScanLine className="h-4 w-4 text-gray-400" />
          <input
            className="text-sm focus:outline-none"
            placeholder="Barcode scan"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && barcode.trim()) {
                setApplied(barcode.trim());
                setBarcode("");
                setPage(1);
              }
            }}
          />
        </div>

        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={(e) => {
              setLowStockOnly(e.target.checked);
              setPage(1);
            }}
          />
          Low stock only
        </label>

        <span className="ml-auto text-sm text-gray-500">
          {paginated.total} item{paginated.total === 1 ? "" : "s"}
        </span>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading && <Skeleton className="h-64 m-4" />}

          {isError && (
            <div className="p-6 text-center">
              <p className="text-sm text-red-600 mb-2">Failed to load inventory.</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          )}

          {!isLoading && !isError && paginated.items.length === 0 && (
            <EmptyState
              title="No medicines found"
              description="Try a different search, or check the low-stock toggle."
            />
          )}

          {!isLoading && !isError && paginated.items.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-gray-500">
                  <th className="px-4 py-2">Medicine</th>
                  <th className="px-2 py-2">Batch</th>
                  <th className="px-2 py-2">Expiry</th>
                  <th className="px-2 py-2 text-right">In stock</th>
                  <th className="px-2 py-2 text-right">Reorder</th>
                  <th className="px-2 py-2 text-center">Status</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.items.map((m: MedicineRow) => {
                  const inv = m.inventory;
                  const isLow = !!inv && inv.quantity <= inv.reorderLevel;
                  return (
                    <tr key={m.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <div className="font-medium">{m.name}</div>
                        <div className="text-xs text-gray-500">
                          {m.genericName}
                          {m.barcode ? ` · ${m.barcode}` : ""}
                        </div>
                      </td>
                      <td className="px-2 py-2">{inv?.batchNumber ?? "—"}</td>
                      <td className="px-2 py-2">
                        {inv?.expiryDate ? format(new Date(inv.expiryDate), "yyyy-MM-dd") : "—"}
                      </td>
                      <td className="px-2 py-2 text-right font-medium">{inv?.quantity ?? 0}</td>
                      <td className="px-2 py-2 text-right text-gray-500">
                        {inv?.reorderLevel ?? "—"}
                      </td>
                      <td className="px-2 py-2 text-center">
                        {isLow ? <Badge variant="warning">Low</Badge> : <Badge>OK</Badge>}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => setHistoryMedicine(m)}>
                            History
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setRestockMedicine(m)}>
                            <PackagePlus className="h-3.5 w-3.5" /> Restock
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <div className="flex items-center justify-between border-t px-4 py-2 text-sm">
            <span className="text-gray-500">
              Page {paginated.page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Prev
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <RestockDialog
        medicineId={restockMedicine?.id ?? ""}
        medicineName={restockMedicine?.name ?? ""}
        open={!!restockMedicine}
        onOpenChange={(o) => setRestockMedicine(o ? restockMedicine : null)}
      />

      {historyMedicine && (
        <StockHistoryDialog medicine={historyMedicine} onClose={() => setHistoryMedicine(null)} />
      )}
    </div>
  );
}

function StockHistoryDialog({ medicine, onClose }: { medicine: MedicineRow; onClose: () => void }) {
  const { data: history, isLoading } = useStockHistory(medicine.id);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Stock history — {medicine.name}</DialogTitle>
        </DialogHeader>
        {isLoading && <Skeleton className="h-40" />}
        {!isLoading && history && history.length === 0 && (
          <EmptyState title="No movements yet" description="Stock changes will appear here." />
        )}
        {!isLoading && history && history.length > 0 && (
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {history.map((t: any) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <div>
                  <span
                    className={`font-semibold ${
                      t.changeAmount >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {t.changeAmount >= 0 ? "+" : ""}
                    {t.changeAmount}
                  </span>{" "}
                  <span className="text-gray-700">{t.reason}</span>
                  {t.batchNumber ? (
                    <span className="ml-2 text-xs text-gray-500">batch {t.batchNumber}</span>
                  ) : null}
                </div>
                <div className="text-xs text-gray-500">
                  {format(new Date(t.createdAt), "yyyy-MM-dd HH:mm")}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
