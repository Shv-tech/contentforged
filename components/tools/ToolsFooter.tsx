// components/tools/ToolsFooter.tsx

import Link from "next/link";
import { TOOLS, PLATFORM_LABELS, Platform } from "@/lib/tools-config";

export default function ToolsFooter() {
  // Automatically group all available tools by their platform
  const groupedTools = TOOLS.reduce((acc, tool) => {
    if (!acc[tool.platform]) acc[tool.platform] = [];
    acc[tool.platform].push(tool);
    return acc;
  }, {} as Record<Platform, typeof TOOLS>);

  // Only render platforms that actually have tools added to the config
  const platforms = Object.keys(groupedTools) as Platform[];

  if (platforms.length === 0) return null;

  return (
    <footer className="border-t border-neutral-200 bg-neutral-50 py-16 sm:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="mb-12">
          <h2 className="text-2xl font-semibold tracking-tight text-neutral-900">
            Forge Free AI Tools Library
          </h2>
          <p className="mt-2 text-sm text-neutral-500">
            Grow your audience across every platform with our suite of free, AI-powered generation tools. No login required.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 md:grid-cols-4">
          {platforms.map((platform) => (
            <div key={platform}>
              <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-900">
                {PLATFORM_LABELS[platform]}
              </h3>
              <ul className="mt-5 space-y-3.5">
                {groupedTools[platform].map((tool) => (
                  <li key={tool.slug}>
                    <Link
                      href={`/tools/${tool.slug}`}
                      className="text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-900"
                    >
                      {tool.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}