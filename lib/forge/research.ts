/**
 * lib/forge/research.ts
 *
 * Web research through Tavily, for posts that state current facts.
 *
 * Results are cached for an hour by normalised query: the same question asked
 * twice in a session, or by two users, costs one search. When Tavily is not
 * configured the call fails with a clear message instead of returning
 * simulated results, because a post built on simulated facts is worse than
 * one that says it could not check.
 */

import { cached } from './cache';
import { sha256Hex } from './crypto';

export interface ResearchResult {
  query: string;
  answer: string | null;
  sources: Array<{ title: string; url: string; snippet: string; publishedDate: string | null }>;
}

export class ResearchUnavailableError extends Error {}

export async function researchWeb(query: string): Promise<ResearchResult> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new ResearchUnavailableError('Web research is not configured on this server (TAVILY_API_KEY).');

  const normalised = query.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 400);
  const { value } = await cached(`research:${sha256Hex(normalised)}`, 3600, async () => {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      // The key goes in both places: Tavily's current API reads the bearer
      // header, and older accounts still read api_key from the body.
      body: JSON.stringify({
        api_key: apiKey,
        query: normalised,
        search_depth: 'advanced',
        include_answer: true,
        include_raw_content: false,
        max_results: 6,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      throw new Error(`Web search failed (${response.status}).`);
    }

    const data = await response.json();
    const result: ResearchResult = {
      query: normalised,
      answer: typeof data.answer === 'string' ? data.answer : null,
      sources: Array.isArray(data.results)
        ? data.results.slice(0, 6).map((item: Record<string, unknown>) => ({
            title: String(item.title ?? ''),
            url: String(item.url ?? ''),
            snippet: String(item.content ?? '').slice(0, 600),
            publishedDate: typeof item.published_date === 'string' ? item.published_date : null,
          }))
        : [],
    };
    return result;
  });

  return value;
}

export function formatResearchForModel(result: ResearchResult): string {
  const lines = [`Search: "${result.query}"`];
  if (result.answer) lines.push(`Summary from search provider: ${result.answer}`);
  result.sources.forEach((source, index) => {
    lines.push(`[${index + 1}] ${source.title}${source.publishedDate ? ` (${source.publishedDate})` : ''}\n${source.url}\n${source.snippet}`);
  });
  lines.push('Cite sources by title and URL when you use them. If the sources do not support a claim, do not make it.');
  return lines.join('\n\n');
}
