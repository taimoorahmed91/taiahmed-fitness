import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { LayoutDashboard, Utensils, Dumbbell, LogOut, User } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { Button } from './ui/button';
import { useUser } from '@/contexts/UserContext';

export const Navigation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useUser();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const links = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/meals', label: 'Meals', icon: Utensils },
    { to: '/gym', label: 'Gym', icon: Dumbbell },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-card/80 backdrop-blur-sm">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <Dumbbell className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-bold text-xl">FitTrack</span>
        </Link>
        <div className="flex items-center gap-2">
          <nav className="flex items-center gap-1">
            {links.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  location.pathname === link.to
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                <link.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{link.label}</span>
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2 ml-2 pl-2 border-l border-border">
            {user && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <User className="h-4 w-4" />
                <span className="hidden sm:inline">{user.name}</span>
              </div>
            )}
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={handleLogout} title="Logout">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};