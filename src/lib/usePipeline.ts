import { useQuery } from "@tanstack/react-query";
import { fetchJob, type Job } from "./pipeline";

export function useJob(jobId: string | undefined): Job | undefined {
  const { data } = useQuery({
    queryKey: ["video", jobId],
    queryFn: () => fetchJob(jobId!),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const job = query.state.data;
      if (!job) return 3000;
      if (job.stage === "done" || job.stage === "error") return false;
      return 2000;
    },
    staleTime: 0,
    retry: 3,
  });
  return data ?? undefined;
}
