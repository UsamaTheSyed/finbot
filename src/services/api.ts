export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code = "REQUEST_FAILED",
    public fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
  }
}
export interface ApiClient {
  get<T>(path: string): Promise<T>;
  blob(path: string): Promise<Blob>;
  patch<T>(path: string, body: unknown): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
  delete<T>(path: string): Promise<T>;
}
export const createHttpClient = (
  baseUrl: string,
  extraHeaders: Record<string, string> = {},
): ApiClient => {
  async function request<T>(
    path: string,
    method: string,
    body?: unknown,
    binary = false,
  ): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...extraHeaders,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      credentials: "same-origin",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
        code?: string;
        fieldErrors?: Record<string, string[]>;
      } | null;
      if (response.status === 401 && typeof window !== "undefined")
        window.dispatchEvent(new Event("finbot:unauthorized"));
      throw new ApiError(
        payload?.message || `Request failed (${response.status})`,
        response.status,
        payload?.code,
        payload?.fieldErrors,
      );
    }
    if (response.status === 204) return undefined as T;
    if (binary) {
      if (!response.headers.get("content-type")?.includes("application/pdf"))
        throw new ApiError("The server did not return a PDF.", 502);
      return response.blob() as Promise<T>;
    }
    return response.json() as Promise<T>;
  }
  return {
    get: (path) => request(path, "GET"),
    blob: (path) => request<Blob>(path, "GET", undefined, true),
    post: (path, body) => request(path, "POST", body),
    patch: (path, body) => request(path, "PATCH", body),
    delete: (path) => request(path, "DELETE"),
  };
};
export const httpApi = createHttpClient(
  import.meta.env?.VITE_API_BASE_URL || "/api",
);
// Mock arrays remain deterministic Node-test fixtures; browser runtimes use API.
export const useMock = typeof window === "undefined";
export async function mockResponse<T>(fn: () => T): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, 120));
  return structuredClone(fn());
}
