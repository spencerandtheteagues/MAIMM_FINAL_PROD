import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "../lib/queryClient";

export const USER_QUERY_KEY = ["/api/user"] as const;

export function useCurrentUser() {
  return useQuery({
    queryKey: USER_QUERY_KEY,
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: false,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
