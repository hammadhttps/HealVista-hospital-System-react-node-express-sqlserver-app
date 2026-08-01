import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate, useParams } from "react-router-dom";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { kbArticleSchema } from "@healvista/shared";
import { useKbArticle, useKbArticles } from "../hooks/queries/useAi";
import {
  useCreateKbArticle,
  useDeleteKbArticle,
  useUpdateKbArticle,
} from "../hooks/mutations/useAiMutations";
import { useDepartments } from "../hooks/queries/useDepartments";
import { useAuthStore } from "../store/authStore";
import type { KbArticle } from "../api/ai";
import KbAssistant from "../components/ai/KbAssistant";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Breadcrumbs } from "../components/primitives/Breadcrumbs";
import { EmptyState } from "../components/primitives/EmptyState";
import { CardSkeleton } from "../components/primitives/Skeleton";

/**
 * Staff knowledge base (Phase 5.6).
 *
 * All staff browse policies, FAQs, and guidelines; ADMIN also writes them. The
 * assistant is RAG over the same articles — its citations link back here, which
 * is why the selected article lives in the URL (`/kb/:id`).
 */
export default function KnowledgeBase() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === "ADMIN";

  const { data: articles, isLoading } = useKbArticles();
  const { data: article, isLoading: detailLoading } = useKbArticle(id ?? "");
  const del = useDeleteKbArticle();

  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<KbArticle | null>(null);

  const filtered = articles?.filter((a) =>
    `${a.title} ${a.category}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  function confirmDelete() {
    if (!article) return;
    if (!window.confirm(`Unpublish "${article.title}"? It will leave the knowledge base.`)) return;
    del.mutate(article.id, { onSuccess: () => navigate("/kb") });
  }

  return (
    <div>
      <Breadcrumbs items={[{ label: "Knowledge Base" }]} />
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Knowledge Base</h1>
        {isAdmin && (
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" /> New article
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-3">
          <div className="relative">
            <Search className="absolute top-2.5 left-3 h-4 w-4 text-gray-400" />
            <Input
              className="pl-9"
              placeholder="Search articles…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {isLoading ? (
            <CardSkeleton />
          ) : (
            <Card>
              <CardContent className="max-h-[60vh] space-y-1 overflow-auto p-2">
                {filtered && filtered.length ? (
                  filtered.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => navigate(`/kb/${a.id}`)}
                      className={`w-full rounded-lg px-3 py-2 text-left hover:bg-blue-50 ${
                        a.id === id ? "bg-blue-50 ring-1 ring-blue-200" : ""
                      }`}
                    >
                      <p className="truncate text-sm font-medium text-gray-800">{a.title}</p>
                      <p className="mt-1 flex items-center gap-2">
                        <Badge variant="secondary">{a.category}</Badge>
                        {!a.isPublished && <Badge variant="warning">Draft</Badge>}
                      </p>
                    </button>
                  ))
                ) : (
                  <p className="p-3 text-sm text-gray-400">
                    {articles && articles.length
                      ? "No articles match your search."
                      : "No articles yet."}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </aside>

        <section>
          {id ? (
            detailLoading ? (
              <CardSkeleton />
            ) : article ? (
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg">{article.title}</CardTitle>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge variant="secondary">{article.category}</Badge>
                        {!article.isPublished && <Badge variant="warning">Draft</Badge>}
                      </div>
                    </div>
                    {isAdmin && (
                      <div className="flex shrink-0 gap-2">
                        <Button variant="outline" size="sm" onClick={() => setEditing(article)}>
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={confirmDelete}
                          disabled={del.isPending}
                          aria-label="Unpublish article"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="text-sm whitespace-pre-wrap text-gray-800">
                  {article.content}
                </CardContent>
              </Card>
            ) : (
              <EmptyState
                title="Article not found"
                description="It may have been unpublished. Pick another from the list."
              />
            )
          ) : (
            <KbAssistant />
          )}
        </section>
      </div>

      {formOpen && (
        <ArticleFormDialog
          article={editing}
          onClose={() => setFormOpen(false)}
          onCreated={(createdId) => {
            setFormOpen(false);
            navigate(`/kb/${createdId}`);
          }}
        />
      )}
    </div>
  );
}

/**
 * ADMIN-only create/edit form. Mounted fresh per open so the defaults come from
 * the article being edited without reset-timing races.
 */
function ArticleFormDialog({
  article,
  onClose,
  onCreated,
}: {
  article: KbArticle | null;
  onClose: () => void;
  onCreated: (createdId: string) => void;
}) {
  const create = useCreateKbArticle();
  const update = useUpdateKbArticle();
  const { data: departments } = useDepartments();
  const isEdit = !!article;

  const {
    register,
    setValue,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof kbArticleSchema>>({
    resolver: zodResolver(kbArticleSchema),
    defaultValues: {
      title: article?.title ?? "",
      content: article?.content ?? "",
      category: article?.category ?? "",
      slug: article?.slug ?? "",
      departmentId: article?.departmentId ?? null,
      isPublished: article?.isPublished ?? true,
    },
  });

  const busy = create.isPending || update.isPending;

  function submit(values: z.input<typeof kbArticleSchema>) {
    const payload = { ...values, departmentId: values.departmentId || null };
    if (isEdit) update.mutate({ id: article.id, input: payload }, { onSuccess: onClose });
    else create.mutate(payload, { onSuccess: (created) => onCreated(created.id) });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit article" : "New article"}</DialogTitle>
          <DialogDescription>
            Published articles are embedded into the knowledge assistant as soon as they save.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="space-y-4">
          <div>
            <Label>Title</Label>
            <Input {...register("title")} className="mt-1" />
            {errors.title && <p className="mt-1 text-xs text-red-600">{errors.title.message}</p>}
          </div>
          <div>
            <Label>Category</Label>
            <Input
              {...register("category")}
              className="mt-1"
              placeholder="Policies · FAQs · Guidelines"
            />
            {errors.category && (
              <p className="mt-1 text-xs text-red-600">{errors.category.message}</p>
            )}
          </div>
          <div>
            <Label>Content</Label>
            <textarea
              {...register("content")}
              rows={8}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            {errors.content && (
              <p className="mt-1 text-xs text-red-600">{errors.content.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Slug (optional)</Label>
              <Input
                {...register("slug")}
                className="mt-1"
                placeholder="auto-generated from title"
              />
            </div>
            <div>
              <Label>Department</Label>
              <select
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                defaultValue={article?.departmentId ?? ""}
                onChange={(e) =>
                  setValue("departmentId", e.target.value || null, { shouldValidate: true })
                }
              >
                <option value="">General (all departments)</option>
                {departments?.map((d: { id: string; name: string }) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register("isPublished")} className="h-4 w-4" />
            Published — visible to staff and searchable by the assistant
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : isEdit ? "Save changes" : "Create article"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
