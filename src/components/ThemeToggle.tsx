import { Moon, Sun } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { useTheme } from 'next-themes';

export const ThemeToggle = () => {
  const { setTheme, resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <IconButton
      label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      tooltip
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <Sun /> : <Moon />}
    </IconButton>
  );
};
