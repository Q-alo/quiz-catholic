export type QuestionType = 'multiple-choice' | 'multiple-select' | 'short-essay' | 'long-essay';
export type QuizLevel = 'Ấu nhi' | 'Thiếu nhi' | 'Nghĩa Sỹ' | 'Hiệp Sỹ' | 'Huynh Trưởng';

export interface Question {
  id?: string;
  topic: string;
  type: QuestionType;
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
  savedAt?: string;
  isNew?: boolean;
}

export interface EssayEvaluation {
  score: number;
  feedback: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export interface Profile {
  id: string;
  name: string;
  allocatedBytes: number;
}

export interface QuizState {
  currentQuestion: Question | null;
  userAnswer: string;
  userAnswers: string[]; // For essays
  isEvaluated: boolean;
  evaluationResult: string;
  essayEvaluations: EssayEvaluation[]; // For essays
  isSaved: boolean;
  loading: boolean;
  error: string | null;
}
