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

  return { sessions, addSession, deleteSession, getThisWeekSessions };
};
