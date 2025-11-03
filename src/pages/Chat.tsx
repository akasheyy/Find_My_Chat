import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";
import UserList from "@/components/UserList";
import ChatArea from "@/components/ChatArea";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { LogOut, Users, User as UserIcon } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

const Chat = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userListVisible, setUserListVisible] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  useEffect(() => {
    // Set up auth state listener first
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (!session) {
        navigate("/auth");
      }
    });

    // Then check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (!session) {
        navigate("/auth");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } else {
      navigate("/auth");
    }
  };

  const handleSelectUser = (userId: string) => {
    setSelectedUserId(userId);
    if (isMobile) {
      setUserListVisible(false);
    }
  };

  const handleViewProfile = () => {
    if (user) {
      navigate(`/profile/${user.id}`);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="border-b border-border bg-card px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isMobile && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setUserListVisible(!userListVisible)}
            >
              <Users className="w-4 h-4" />
            </Button>
          )}
          <div className="p-2 bg-primary/10 rounded-lg">
            <span className="text-xl">💬</span>
          </div>
          <div>
            <h1 className="text-xl font-semibold">ChatConnect</h1>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleViewProfile}>
            <UserIcon className="w-4 h-4 mr-2" />
            Profile
          </Button>
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        <UserList
          currentUserId={user.id}
          selectedUserId={selectedUserId}
          onSelectUser={handleSelectUser}
          isVisible={isMobile ? userListVisible : true}
        />
        <ChatArea
          currentUserId={user.id}
          selectedUserId={selectedUserId}
        />
      </div>
    </div>
  );
};

export default Chat;
