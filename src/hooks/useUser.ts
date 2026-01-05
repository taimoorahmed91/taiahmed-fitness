import { useState, useEffect } from 'react';

interface User {
  id: string;
  name: string;
}

export const useUser = () => {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('fittrack-user');
    return stored ? JSON.parse(stored) : null;
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem('fittrack-user', JSON.stringify(user));
    }
  }, [user]);

  const login = (name: string) => {
    const newUser: User = {
      id: crypto.randomUUID(),
      name: name.trim(),
    };
    setUser(newUser);
    return newUser;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('fittrack-user');
  };

  return { user, login, logout, isLoggedIn: !!user };
};
