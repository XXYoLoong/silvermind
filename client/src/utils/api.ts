const DEFAULT_API_BASE = '/api';
const API_BASE = (import.meta.env.VITE_API_BASE_URL?.trim() || DEFAULT_API_BASE).replace(/\/+$/, '');

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// Memory training API
export const memoryAPI = {
  generateItem: () => request<{
    id: string;
    name: string;
    answerKeywords?: string[];
    description: string;
    era: string;
    category: string;
    promptHint: string;
    source?: string;
  }>('/memory/generate-item'),
  generateImage: (prompt: string) => request<{ imageUrl: string; source?: string }>('/memory/generate-image', {
    method: 'POST', body: JSON.stringify({ prompt }),
  }),
  saveSession: (session: unknown) => request<{ id: string }>('/memory/save-session', {
    method: 'POST', body: JSON.stringify(session),
  }),
};

// Maze API
export const mazeAPI = {
  generatePath: (rows?: number, cols?: number) =>
    request<{ startLED: number; endLED: number; gridRows: number; gridCols: number }>(
      `/maze/generate-path?rows=${rows ?? 4}&cols=${cols ?? 5}`
    ),
  saveSession: (session: unknown) => request<{ id: string }>('/maze/save-session', {
    method: 'POST', body: JSON.stringify(session),
  }),
};

// Step training API
export const stepAPI = {
  generatePath: (rows?: number, cols?: number, mode = 'random') =>
    request<{ cells: { row: number; col: number; order: number }[]; mode: string }>(
      `/step/generate-path?rows=${rows ?? 8}&cols=${cols ?? 6}&mode=${encodeURIComponent(mode)}`
    ),
  saveSession: (session: unknown) => request<{ id: string }>('/step/save-session', {
    method: 'POST', body: JSON.stringify(session),
  }),
};

// Reports
export const reportAPI = {
  getUserReports: (module: string) => request<unknown[]>(`/reports?module=${module}`),
};
