import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api.js";

// Every server read and write the app makes, as React hooks.
// TanStack Query caches the results, shares one request between components
// that ask for the same thing, and refetches when a mutation says data changed.

export function useLinks({ page, search }) {
  const params = new URLSearchParams({ page: String(page), limit: "10" });
  if (search) params.set("search", search);

  return useQuery({
    queryKey: ["links", "list", { page, search }],
    queryFn: () => api(`/urls?${params}`),
    placeholderData: keepPreviousData, // keep showing the old page while the next one loads
  });
}

export function useOverview(days) {
  return useQuery({
    queryKey: ["analytics", "overview", days],
    queryFn: () => api(`/analytics/overview?days=${days}`),
    placeholderData: keepPreviousData,
  });
}

export function useLinkAnalytics(id, days) {
  return useQuery({
    queryKey: ["analytics", "link", id, days],
    queryFn: () => api(`/analytics/links/${id}?days=${days}`),
    placeholderData: keepPreviousData,
    retry: (failures, error) => error.status !== 404 && failures < 2,
  });
}

// After any change to links, both the lists and the numbers are out of date.
function useRefreshEverything() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["links"] }),
      queryClient.invalidateQueries({ queryKey: ["analytics"] }),
    ]);
}

export function useCreateLink() {
  const refresh = useRefreshEverything();
  return useMutation({
    mutationFn: (body) => api("/urls", { method: "POST", body }).then((data) => data.link),
    onSuccess: refresh,
  });
}

export function useUpdateLink() {
  const refresh = useRefreshEverything();
  return useMutation({
    mutationFn: ({ id, ...changes }) =>
      api(`/urls/${id}`, { method: "PATCH", body: changes }).then((data) => data.link),
    onSuccess: refresh,
  });
}

export function useDeleteLink() {
  const refresh = useRefreshEverything();
  return useMutation({
    mutationFn: (id) => api(`/urls/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
}
