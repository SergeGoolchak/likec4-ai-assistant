import { useQuery } from '@tanstack/react-query';
import { getAISettings, getConfluenceSettings, getProject } from '../api/client';

export function useProjectReadiness(projectId?: string) {
  const project = useQuery({ queryKey: ['project', projectId], queryFn: () => getProject(projectId!), enabled: Boolean(projectId), staleTime: 30_000 });
  const confluence = useQuery({ queryKey: ['confluence-settings', projectId], queryFn: () => getConfluenceSettings(projectId!), enabled: Boolean(projectId) });
  const ai = useQuery({ queryKey: ['ai-settings', projectId], queryFn: () => getAISettings(projectId!), enabled: Boolean(projectId) });
  const modelReady = Boolean(project.data?.model && !project.data.modelError && !project.data.model.diagnostics.some((d) => d.severity === 'error'));
  const isLoading = project.isPending || confluence.isPending || ai.isPending;
  const error = project.error ?? confluence.error ?? ai.error;
  const readyCount = Number(modelReady) + Number(Boolean(confluence.data?.configured)) + Number(Boolean(ai.data?.configured));
  return {
    project, confluence, ai, modelReady, readyCount, isLoading, error,
    ready: !isLoading && !error && readyCount === 3,
    refetch: () => { void project.refetch(); void confluence.refetch(); void ai.refetch(); },
  };
}
