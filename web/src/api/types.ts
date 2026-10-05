// Tipos das respostas da API (espelham server/src/routes/*).
export type Role = 'student' | 'teacher' | 'coordinator' | 'admin';
export type EnglishLevel = 2 | 3 | 4;

export interface Me {
  id: number;
  username: string;
  fullName: string;
  role: Role;
  classId: number | null;
  className?: string | null;
  englishLevel: EnglishLevel | null;
  mustChangePassword: boolean;
}

export type GradeComponent = 'exam1' | 'exam2' | 'exam3' | 'exam4' | 'project' | 'homework' | 'mock';
export type BimesterStatus = 'passing' | 'recovery' | 'partial' | 'empty';
export type YearStatus = 'approved' | 'final_recovery' | 'in_progress';

export interface SubjectRef { id: number; name: string; color: string; englishLevel?: EnglishLevel | null }

/** Quem lançou: o próprio aluno ou a equipe (professor/coordenação). */
export type GradeAuthor = 'student' | 'staff';

export interface BimesterResult {
  scores: Partial<Record<GradeComponent, number>>;
  examAverage: number | null;
  average: number | null;
  examsGraded: number;
  isPartial: boolean;
  status: BimesterStatus;
  examBelowReference: boolean;
  pointsToPass: number;
}

export interface ReportCard {
  class: { id: number; name: string; schoolYear: number } | null;
  currentBimester: number;
  subjects: Array<{ subject: SubjectRef; bimesters: Array<BimesterResult & { authors: Partial<Record<GradeComponent, GradeAuthor>> }>; sum: number; status: YearStatus; pointsToPass: number }>;
}

export interface Summary {
  bimester: number;
  overallAverage: number | null;
  subjects: Array<BimesterResult & { subject: SubjectRef }>;
  best: Array<{ subject: SubjectRef; average: number | null }>;
  attention: Array<{ subject: SubjectRef; average: number | null; pointsToPass: number; status: BimesterStatus }>;
  counts: { passing: number; recovery: number; partial: number };
}

export interface CalendarEvent {
  id: number; title: string; description: string | null;
  eventType: 'exam' | 'holiday' | 'event' | 'meeting' | 'deadline';
  startsOn: string; endsOn: string | null;
  classId: number | null; className?: string | null;
  subjectId?: number | null; subject?: string | null; color?: string | null;
  authorId?: number | null;
  bimester?: number | null;
  examNumber?: number | null;
  source?: 'manual' | 'auto';
}

export interface Announcement {
  id: number; title: string; body: string;
  category: 'general' | 'exam' | 'event' | 'urgent';
  classId: number | null; className: string | null;
  isPinned: boolean; createdAt: string;
  authorId: number | null; authorName: string | null; read: boolean;
}

export interface Homework {
  id: number; title: string; description: string | null; dueDate: string;
  classId: number; className: string; subjectId: number; subject: string; color: string;
  authorId: number | null; authorName: string | null; createdAt: string;
  done: boolean; overdue: boolean;
}

export interface Overview {
  class: ReportCard['class'];
  bimester: number;
  overallAverage: number | null;
  subjects: Array<{ subject: SubjectRef; average: number | null; status: BimesterStatus }>;
  recoveryCount: number;
  pendingHomework: Array<{ id: number; title: string; dueDate: string; subject: string; color: string }>;
  upcomingEvents: CalendarEvent[];
  unreadAnnouncements: number;
  latestAnnouncements: Array<Pick<Announcement, 'id' | 'title' | 'category' | 'createdAt' | 'isPinned' | 'read'>>;
  todayRoutine: Array<{ id: number; startTime: string; endTime: string; activity: string; subject: string | null; color: string | null; done: boolean }>;
}

export interface Routine {
  id: number; weekday: number; startTime: string; endTime: string; activity: string;
  subjectId: number | null; subject: string | null; color: string | null;
}

export interface Subject {
  id: number; name: string; colorHex: string;
  englishLevel: EnglishLevel | null; examGroup: 1 | 2 | null; examWeekday: 2 | 4 | 5 | null;
}
export interface SchoolClass { id: number; name: string; schoolYear: number; students?: number }

export interface Assignment {
  id: number; classId: number; className: string; schoolYear: number;
  subjectId: number; subject: string; color: string;
  teacherId: number; teacherName: string; students: number;
}

export interface GradeSheet {
  classId: number; subjectId: number; bimester: number;
  maxScore: Record<GradeComponent, number>;
  students: Array<BimesterResult & { student: { id: number; fullName: string; username: string } }>;
}

export interface AdminUser {
  id: number; username: string; fullName: string; role: Role;
  classId: number | null; className: string | null; englishLevel: EnglishLevel | null; isActive: boolean; lockedUntil: string | null; createdAt: string;
}

export interface AccessKeyRow {
  id: number; keyHint: string; role: 'teacher' | 'coordinator'; label: string | null;
  maxUses: number; useCount: number; expiresAt: string | null; revokedAt: string | null; createdAt: string; createdBy: string | null;
}

export interface StudyContent {
  id: number; title: string; body: string; bimester: number; examNumber: number | null;
  subjectId: number; subject: string; color: string; englishLevel: EnglishLevel | null;
  authorName: string | null; createdAt: string; updatedAt: string; examDate: string | null;
}

export interface ExamScheduleInfo {
  year: number;
  schedules: Array<{ id: number; schoolYear: number; bimester: number; firstTuesday: string; startingGroup: 1 | 2; updatedAt: string }>;
  subjects: Array<{ id: number; name: string; color: string; englishLevel: EnglishLevel | null; examGroup: 1 | 2; examWeekday: 2 | 4 | 5 }>;
  weekdayLabel: Record<string, string>;
}
