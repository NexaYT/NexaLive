import { Link, useNavigate } from "@tanstack/react-router";
import { Search, Heart, Shield, LogOut, User as UserIcon } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import logoUrl from "@/assets/nexalive-logo.png";

export function Navbar() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="group flex items-center gap-2">
          <img src={logoUrl} alt="NexaLive" width={36} height={36} className="h-9 w-9 drop-shadow-[0_0_12px_color-mix(in_oklab,var(--primary)_60%,transparent)]" />
          <span className="text-xl font-extrabold tracking-tight">
            <span className="text-gradient-brand">Nexa</span>
            <span className="text-foreground">Live</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          <Link to="/" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground [&.active]:text-foreground">Home</Link>
          <Link to="/channels" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground [&.active]:text-foreground">Channels</Link>
          {user && (
            <Link to="/favorites" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground [&.active]:text-foreground">Favorites</Link>
          )}
          {user && (
            <Link to="/admin" className="text-sm font-medium text-primary transition-colors hover:text-primary-glow [&.active]:text-primary-glow">Manage</Link>
          )}
        </nav>

        <div className="flex items-center gap-1.5">
          <Link to="/channels" className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Search">
            <Search className="h-5 w-5" />
          </Link>
          {user ? (
            <>
              <Link to="/favorites" className="md:hidden rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Favorites">
                <Heart className="h-5 w-5" />
              </Link>
              <Link to="/admin" className="md:hidden rounded-md p-2 text-primary hover:bg-muted" aria-label="Manage">
                <Shield className="h-5 w-5" />
              </Link>
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline ml-2">Sign out</span>
              </Button>
            </>
          ) : (
            <Button asChild size="sm" className="bg-gradient-brand text-primary-foreground hover:opacity-90 shadow-glow">
              <Link to="/auth"><UserIcon className="h-4 w-4 mr-1.5" />Sign in</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
