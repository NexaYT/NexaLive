import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Radio } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — NexaLive" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/" });
  }, [user, loading, navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back!");
    navigate({ to: "/" });
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { username },
      },
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Account created! You can sign in now.");
  };

  const handleGoogle = async () => {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) toast.error(result.error.message);
  };

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-4 py-8">
      <Link to="/" className="mb-8 flex items-center gap-2.5 self-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-brand shadow-glow">
          <Radio className="h-5 w-5 text-primary-foreground" />
        </span>
        <span className="text-2xl font-extrabold tracking-tight">
          <span className="text-gradient-brand">Nexa</span>
          <span className="text-foreground">Live</span>
        </span>
      </Link>

      <div className="rounded-xl bg-surface p-6 ring-1 ring-border shadow-elevated">
        <Tabs defaultValue="signin">
          <TabsList className="grid w-full grid-cols-2 bg-background">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="signup">Sign up</TabsTrigger>
          </TabsList>

          <TabsContent value="signin">
            <form onSubmit={handleSignIn} className="mt-4 space-y-3">
              <div>
                <Label>Email</Label>
                <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="bg-background" />
              </div>
              <div>
                <Label>Password</Label>
                <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="bg-background" />
              </div>
              <Button type="submit" disabled={submitting} className="w-full bg-primary hover:bg-primary/90">
                {submitting ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="signup">
            <form onSubmit={handleSignUp} className="mt-4 space-y-3">
              <div>
                <Label>Username</Label>
                <Input required value={username} onChange={(e) => setUsername(e.target.value)} className="bg-background" />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="bg-background" />
              </div>
              <div>
                <Label>Password</Label>
                <Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="bg-background" />
              </div>
              <Button type="submit" disabled={submitting} className="w-full bg-primary hover:bg-primary/90">
                {submitting ? "Creating…" : "Create account"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>

        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-surface px-2 text-muted-foreground">or</span>
          </div>
        </div>

        <Button type="button" variant="outline" onClick={handleGoogle} className="w-full bg-background hover:bg-muted">
          <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
          Continue with Google
        </Button>
      </div>
    </div>
  );
}
