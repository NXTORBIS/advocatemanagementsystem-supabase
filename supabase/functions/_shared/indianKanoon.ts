// Thin client for the Indian Kanoon API (https://api.indiankanoon.org).
// All endpoints are POST with query-string params and a shared token header -
// confirmed against Indian Kanoon's own reference client (ikapi.py), since
// their prose docs don't show the HTTP method explicitly.
const IK_BASE = "https://api.indiankanoon.org";
const IK_TOKEN = Deno.env.get("INDIAN_KANOON_API_TOKEN");

export interface IKSearchDoc {
  tid: number | string;
  title: string;
  headline: string;
  docsource: string;
  docsize?: number;
}

interface IKSearchResponse {
  found: number;
  docs: IKSearchDoc[];
}

async function ikFetch<T>(path: string): Promise<T> {
  if (!IK_TOKEN) {
    throw new Error("INDIAN_KANOON_API_TOKEN is not configured");
  }
  const response = await fetch(`${IK_BASE}${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Token ${IK_TOKEN}`,
      "Accept": "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Indian Kanoon API error: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

export function isIndianKanoonConfigured(): boolean {
  return !!IK_TOKEN;
}

export function stripHtml(s: string | undefined | null): string {
  return (s || "").replace(/<[^>]+>/g, "").trim();
}

export async function searchIndianKanoon(query: string, maxResults = 3): Promise<IKSearchDoc[]> {
  const encoded = encodeURIComponent(query);
  const data = await ikFetch<IKSearchResponse>(`/search/?formInput=${encoded}&pagenum=0`);
  return (data.docs || []).slice(0, maxResults);
}

export async function getDocFragment(docId: number | string, query: string): Promise<string> {
  const encoded = encodeURIComponent(query);
  const data = await ikFetch<{ headline?: string }>(`/docfragment/${docId}/?formInput=${encoded}`);
  return stripHtml(data.headline);
}

export function indianKanoonDocUrl(docId: number | string): string {
  return `https://indiankanoon.org/doc/${docId}/`;
}
