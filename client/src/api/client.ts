const API_PREFIX = '/api/app';

export interface ApiErrorBody {
  error: string;
  detail?: string;
  fields?: Record<string, string>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(body.detail ?? body.error);
  }
}

let csrfToken: string | null = null;

async function getCsrfToken(): Promise<string> {
  if (csrfToken !== null) {
    return csrfToken;
  }
  const response = await fetch(`${API_PREFIX}/csrf-token`, {
    credentials: 'same-origin',
  });
  if (!response.ok) {
    throw new ApiError(response.status, { error: `HTTP ${response.status}` });
  }
  const body = (await response.json()) as { token: string };
  csrfToken = body.token;
  return csrfToken;
}

export async function apiRequest<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (method !== 'GET') {
    headers['x-csrf-token'] = await getCsrfToken();
  }
  const response = await fetch(`${API_PREFIX}${path}`, {
    method,
    credentials: 'same-origin',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    let parsed: ApiErrorBody;
    try {
      parsed = (await response.json()) as ApiErrorBody;
    } catch {
      parsed = { error: `HTTP ${response.status}` };
    }
    throw new ApiError(response.status, parsed);
  }
  return (await response.json()) as T;
}
