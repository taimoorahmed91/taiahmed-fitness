export interface Meal {
  id: string;
  food: string;
  calories: number;
  time: string;
  date: string;
}

export interface GymSession {
  id: string;
  exercise: string;
  duration: number;
  date: string;
  notes?: string;
}
