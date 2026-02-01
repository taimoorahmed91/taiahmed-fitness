import { useSessionValidator } from '@/hooks/useSessionValidator';

// This component just initializes the session validator hook
// It should be rendered inside the UserProvider
export const SessionValidator = () => {
  useSessionValidator();
  return null;
};
