import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="text-center">
        <p className="mb-2 text-sm font-medium text-muted-foreground">Error 404</p>
        <h1 className="mb-4 text-4xl font-bold">Page not found</h1>
        <p className="mb-6 text-lg text-muted-foreground">We couldn't find the page you were looking for.</p>
        <Link
          to="/"
          className="inline-flex min-h-11 items-center rounded-md px-2 text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(hover:hover)]:hover:text-primary/90"
        >
          Return to Home
        </Link>
      </div>
    </main>
  );
};

export default NotFound;
