import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { MessageCircle, Users, Zap } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/chat");
      }
    });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/30 to-accent/20">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center space-y-8 max-w-3xl mx-auto">
          <div className="inline-block p-4 bg-primary/10 rounded-2xl">
            <img src="/fmc_logo.png" alt="FMC Logo" className="w-16 h-16" />
          </div>
          
          <h1 className="text-5xl font-bold tracking-tight">
            Welcome to ChatConnect
          </h1>

          <p className="text-xl text-muted-foreground">
            Connect and chat with people in real-time. See who's online, send messages,
            and build meaningful connections.
          </p>

          <div className="text-sm text-muted-foreground">
            Version 1.2.02
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Button size="lg" onClick={() => navigate("/auth")}>
              Get Started
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate("/auth")}>
              Sign In
            </Button>
          </div>

          <div className="grid md:grid-cols-3 gap-8 pt-16">
            <div className="space-y-3">
              <div className="p-3 bg-primary/10 rounded-lg inline-block">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-lg">See Online Users</h3>
              <p className="text-sm text-muted-foreground">
                Know who's available to chat with real-time presence tracking
              </p>
            </div>
            
            <div className="space-y-3">
              <div className="p-3 bg-primary/10 rounded-lg inline-block">
                <MessageCircle className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-lg">Real-Time Chat</h3>
              <p className="text-sm text-muted-foreground">
                Send and receive messages instantly with live updates
              </p>
            </div>
            
            <div className="space-y-3">
              <div className="p-3 bg-primary/10 rounded-lg inline-block">
                <Zap className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-lg">Fast & Secure</h3>
              <p className="text-sm text-muted-foreground">
                Built with modern technology for speed and security
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
