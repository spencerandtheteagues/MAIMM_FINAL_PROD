import { QueryClient, QueryFunction } from "@tanstack/react-query";

// Global restriction handler reference
let globalRestrictionHandler: ((data: any) => void) | null = null;

export function setGlobalRestrictionHandler(handler: (data: any) => void) {
  globalRestrictionHandler = handler;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let errorData: any;
    try {
      const text = await res.text();
      errorData = text ? JSON.parse(text) : { message: res.statusText };
    } catch {
      errorData = { message: res.statusText };
    }
    
    // Handle platform access restrictions
    if (res.status === 403 && errorData.restrictionType) {
      if (globalRestrictionHandler) {
        globalRestrictionHandler(errorData);
        // Throw a special error that can be caught and handled differently
        const error = new Error(`Access restricted: ${errorData.message}`);
        (error as any).isRestriction = true;
        (error as any).restrictionData = errorData;
        throw error;
      }
    }
    
    const error = new Error(`${res.status}: ${errorData.message || res.statusText}`);
    (error as any).status = res.status;
    (error as any).data = errorData;
    throw error;
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "returnNull" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
