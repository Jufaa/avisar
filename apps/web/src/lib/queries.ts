import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AccountMode,
  AppointmentDto,
  MessageTemplateDto,
  NotificationLogDto,
  OrganizationDto,
  PatientDto,
  ProfessionalDto,
  ReminderRuleDto,
} from '@avisar/shared';
import { api } from './api';

// --- professionals ---------------------------------------------------------

export function useProfessionals(includeInactive = false) {
  return useQuery({
    queryKey: ['professionals', includeInactive],
    queryFn: () =>
      api<ProfessionalDto[]>(`/professionals${includeInactive ? '?includeInactive=true' : ''}`),
  });
}

export function useSaveProfessional() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { id?: string } & Record<string, unknown>) =>
      input.id
        ? api<ProfessionalDto>(`/professionals/${input.id}`, { method: 'PATCH', body: input })
        : api<ProfessionalDto>('/professionals', { method: 'POST', body: input }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['professionals'] }),
  });
}

export function useArchiveProfessional() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api<ProfessionalDto>(`/professionals/${id}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['professionals'] }),
  });
}

// --- patients --------------------------------------------------------------

interface PatientPage {
  items: PatientDto[];
  total: number;
}

export function usePatients(search: string) {
  return useQuery({
    queryKey: ['patients', search],
    queryFn: () =>
      api<PatientPage>(`/patients${search ? `?search=${encodeURIComponent(search)}` : ''}`),
    // Keeps the list on screen while a new search runs, instead of flashing
    // an empty state at the user on every keystroke.
    placeholderData: (previous) => previous,
  });
}

export function useSavePatient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { id?: string } & Record<string, unknown>) =>
      input.id
        ? api<PatientDto>(`/patients/${input.id}`, { method: 'PATCH', body: input })
        : api<PatientDto>('/patients', { method: 'POST', body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['patients'] });
      void queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
  });
}

export function useDeletePatient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api<void>(`/patients/${id}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['patients'] }),
  });
}

// --- appointments ----------------------------------------------------------

export function useAppointments(from: Date, to: Date, professionalId?: string) {
  const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
  if (professionalId) params.set('professionalId', professionalId);

  return useQuery({
    queryKey: ['appointments', params.toString()],
    queryFn: () => api<AppointmentDto[]>(`/appointments?${params.toString()}`),
    placeholderData: (previous) => previous,
  });
}

function invalidateAgenda(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['appointments'] });
  void queryClient.invalidateQueries({ queryKey: ['notifications'] });
}

export function useCreateAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      api<{ appointment: AppointmentDto; remindersScheduled: number }>('/appointments', {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      invalidateAgenda(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['patients'] });
    },
  });
}

export function useUpdateAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Record<string, unknown>) =>
      api<AppointmentDto>(`/appointments/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => invalidateAgenda(queryClient),
  });
}

export function useCancelAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      api<AppointmentDto>(`/appointments/${id}/cancel`, { method: 'POST', body: { reason } }),
    onSuccess: () => invalidateAgenda(queryClient),
  });
}

export function useConfirmAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api<AppointmentDto>(`/appointments/${id}/confirm`, { method: 'POST' }),
    onSuccess: () => invalidateAgenda(queryClient),
  });
}

// --- reminders -------------------------------------------------------------

export interface ProviderStatus {
  name: string;
  live: boolean;
  description: string;
}

export function useProviderStatus() {
  return useQuery({
    queryKey: ['provider'],
    queryFn: () => api<ProviderStatus>('/notifications/provider'),
    staleTime: 10 * 60_000,
  });
}

export function useReminderRules() {
  return useQuery({
    queryKey: ['reminder-rules'],
    queryFn: () => api<ReminderRuleDto[]>('/reminder-rules'),
  });
}

export function useSaveReminderRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { id?: string } & Record<string, unknown>) =>
      input.id
        ? api<ReminderRuleDto>(`/reminder-rules/${input.id}`, { method: 'PATCH', body: input })
        : api<ReminderRuleDto>('/reminder-rules', { method: 'POST', body: input }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['reminder-rules'] }),
  });
}

export function useDeleteReminderRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api<void>(`/reminder-rules/${id}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['reminder-rules'] }),
  });
}

export function useTemplates() {
  return useQuery({
    queryKey: ['message-templates'],
    queryFn: () => api<MessageTemplateDto[]>('/message-templates'),
  });
}

export function useSaveTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Record<string, unknown>) =>
      api<MessageTemplateDto>(`/message-templates/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['message-templates'] }),
  });
}

export function useSendTestMessage() {
  return useMutation({
    mutationFn: (input: { phone: string; templateBody?: string }) =>
      api<{ body: string; providerMessageId: string }>('/notifications/test', {
        method: 'POST',
        body: input,
      }),
  });
}

export function useNotificationLog() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<{ items: NotificationLogDto[]; total: number }>('/notifications?limit=100'),
  });
}

// --- organization ----------------------------------------------------------

export function useUpdateOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { name?: string; timezone?: string; mode?: AccountMode }) =>
      api<OrganizationDto>('/organization', { method: 'PATCH', body: input }),
    onSuccess: () => {
      // The mode decides which sections exist, so the whole shell has to
      // re-read the account, not just this screen.
      void queryClient.invalidateQueries();
    },
  });
}

export function useCompleteOnboarding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api<OrganizationDto>('/organization/onboarding/complete', { method: 'POST' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['me'] }),
  });
}
