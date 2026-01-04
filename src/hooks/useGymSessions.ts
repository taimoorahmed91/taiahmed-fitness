import { useState, useEffect } from 'react';
import { GymSession } from '@/types';

export const useGymSessions = () => {
  const [sessions, setSessions] = useState<GymSession[]>(() => {
    const stored = localStorage.getItem('fittrack-gym');
    return stored ? JSON.parse(stored) : [];
  });

  useEffect(() => {
    localStorage.setItem('fittrack-gym', JSON.stringify(sessions));
  }, [sessions]);

  const addSession = (session: Omit<GymSession, 'id'>) => {
    const newSession: GymSession = {
      ...session,
      id: crypto.randomUUID(),
    };
    setSessions((prev) => [...prev, newSession]);
  };

  const deleteSession = (id: string) => {
    setSessions((prev) => prev.filter((session) => session.id !== id));
  };

  const getThisWeekSessions = () => {
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    weekStart.setHours(0, 0, 0, 0);
    
    return sessions.filter((session) => {
      const sessionDate = new Date(session.date);
      return sessionDate >= weekStart;
    });
  };

  const getWeeklyWorkoutData = () => {
    const days: { date: string; duration: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dayDuration = sessions
        .filter((session) => session.date === dateStr)
        .reduce((sum, session) => sum + session.duration, 0);
      days.push({
        date: date.toLocaleDateString('en-US', { weekday: 'short' }),
        duration: dayDuration,
      });
    }
    return days;
  };

  return { sessions, addSession, deleteSession, getThisWeekSessions, getWeeklyWorkoutData };
};
