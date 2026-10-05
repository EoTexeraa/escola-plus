import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Assignment, SchoolClass, Subject } from '../api/types';

export const useSubjects = () =>
  useQuery({ queryKey: ['subjects'], queryFn: () => api.get<Subject[]>('/subjects'), staleTime: 10 * 60_000 });

export const useAllClasses = () =>
  useQuery({ queryKey: ['classes'], queryFn: () => api.get<SchoolClass[]>('/subjects/classes'), staleTime: 10 * 60_000 });

export const useAssignments = (enabled = true) =>
  useQuery({ queryKey: ['teacher', 'assignments'], queryFn: () => api.get<Assignment[]>('/teacher/assignments'), enabled });

/** Turmas em que o usuário pode publicar: professor → as dele; coordenação/admin → todas. */
export function usePublishTargets(role: 'teacher' | 'coordinator' | 'admin') {
  const assignments = useAssignments(role === 'teacher');
  const all = useAllClasses();
  if (role !== 'teacher') return { classes: all.data ?? [], assignments: null, isLoading: all.isLoading };
  const map = new Map<number, SchoolClass>();
  for (const a of assignments.data ?? []) map.set(a.classId, { id: a.classId, name: a.className, schoolYear: a.schoolYear });
  return { classes: [...map.values()], assignments: assignments.data ?? [], isLoading: assignments.isLoading };
}
