import Link from "next/link";
import { type ToolConfig, PLATFORM_LABELS } from "@/lib/tools-config";

export default function MoreTools({ tools }: { tools: ToolConfig[] }) {
  if (tools.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {tools.map((tool) => (
        <Link
          key={tool.slug}
          href={`/tools/${tool.slug}`}
          className="group flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-5 py-4 text-sm transition-all hover:border-neutral-300 hover:bg-neutral-50 hover:shadow-sm"
        >
          <span className="font-medium text-neutral-900">
            {PLATFORM_LABELS[tool.platform]} {tool.name}
          </span>
          <span className="text-neutral-400 transition-all duration-200 group-hover:translate-x-1 group-hover:text-neutral-900">
            →
          </span>
        </Link>
      ))}
    </div>
  );
}