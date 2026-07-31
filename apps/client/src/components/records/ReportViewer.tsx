import { toast } from "sonner";
import { ExternalLink, Trash2, FileText, File } from "lucide-react";
import { useOpenRecord } from "../../hooks/mutations/useLabPharmacyMutations";
import { Card, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { EmptyState } from "../primitives/EmptyState";
import { Skeleton } from "../primitives/Skeleton";

export interface RecordRow {
  id: string;
  title: string;
  category: string | null;
  fileType: string;
  uploadedAt: string;
  uploadedById: string | null;
}

/**
 * Presents a list of records. Data-fetching lives in RecordsPanel so the same
 * viewer renders both the staff per-patient view and the patient's own "mine" view.
 * Opening one mints a short-lived signed URL (an audited action on the server) and
 * opens it in a new tab — the list itself never carries live URLs.
 */
export default function ReportViewer({
  records,
  isLoading,
  canDelete = false,
  onDelete,
}: {
  records: RecordRow[];
  isLoading: boolean;
  canDelete?: boolean;
  onDelete?: (id: string, title: string) => void;
}) {
  const openRecord = useOpenRecord();

  function open(id: string) {
    openRecord.mutate(id, {
      onSuccess: (res: { url: string }) => {
        window.open(res.url, "_blank", "noopener,noreferrer");
      },
      onError: (e) => toast.error(e.message),
    });
  }

  if (isLoading) return <Skeleton className="h-40" />;

  if (records.length === 0) {
    return (
      <EmptyState
        title="No documents"
        description="Uploaded reports and records will appear here."
      />
    );
  }

  return (
    <div className="space-y-2">
      {records.map((r) => (
        <Card key={r.id}>
          <CardContent className="flex items-center justify-between gap-3 p-3">
            <div className="flex min-w-0 items-center gap-3">
              {r.fileType === "pdf" ? (
                <FileText className="h-5 w-5 shrink-0 text-red-500" />
              ) : (
                <File className="h-5 w-5 shrink-0 text-blue-500" />
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{r.title}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  <span className="uppercase">{r.fileType}</span>
                  {r.category && <Badge variant="outline">{r.category.replace("_", " ")}</Badge>}
                  <span>{new Date(r.uploadedAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => open(r.id)}
                disabled={openRecord.isPending}
              >
                <ExternalLink className="h-4 w-4" /> Open
              </Button>
              {canDelete && onDelete && (
                <Button size="sm" variant="ghost" onClick={() => onDelete(r.id, r.title)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
