import { useAuth } from './auth';

/**
 * Whether the interface should talk about "professionals" at all.
 *
 * A solo account has exactly one agenda — the owner's — so every selector,
 * filter and section about choosing a professional is noise. The data model is
 * identical in both modes; only the vocabulary changes.
 */
export function useIsSolo(): boolean {
  const { user } = useAuth();
  return user?.organization.mode !== 'CLINIC';
}
