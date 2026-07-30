import { Inbox } from "lucide-react";

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
      <Inbox className="w-16 h-16 mb-4" />
      <h3 className="text-lg font-medium">{title}</h3>
      {description && <p className="text-sm mt-1">{description}</p>}
    </div>
  );
}
