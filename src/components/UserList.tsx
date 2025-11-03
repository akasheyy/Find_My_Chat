import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Search, Circle, UserPlus, UserMinus } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";

interface Profile {
  id: string;
  email: string;
  username: string | null;
  user_id: string;
}

interface LastMessage {
  id: string;
  content: string;
  created_at: string;
  sender_id: string;
  receiver_id: string;
}

interface PresenceState {
  user_id: string;
  online_at: string;
}

interface UserListProps {
  currentUserId: string;
  selectedUserId: string | null;
  onSelectUser: (userId: string) => void;
  isVisible?: boolean;
}

const UserList = ({ currentUserId, selectedUserId, onSelectUser, isVisible = true }: UserListProps) => {
  const [users, setUsers] = useState<Profile[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [lastMessages, setLastMessages] = useState<Record<string, LastMessage>>({});
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const isMobile = useIsMobile();
  const { toast } = useToast();

  useEffect(() => {
    // Fetch all users
    const fetchUsers = async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .neq("id", currentUserId);

      if (!error && data) {
        setUsers(data);

        // Fetch last messages for each user
        const lastMessagesData: Record<string, LastMessage> = {};
        for (const user of data) {
          const { data: messages } = await supabase
            .from("messages")
            .select("*")
            .or(
              `and(sender_id.eq.${currentUserId},receiver_id.eq.${user.id}),and(sender_id.eq.${user.id},receiver_id.eq.${currentUserId})`
            )
            .order("created_at", { ascending: false })
            .limit(1);

          if (messages && messages.length > 0) {
            lastMessagesData[user.id] = messages[0];
          }
        }
        setLastMessages(lastMessagesData);
      }
    };

    fetchUsers();

    // Fetch following status
    const fetchFollowing = async () => {
      const { data, error } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", currentUserId);

      if (!error && data) {
        setFollowing(new Set(data.map(f => f.following_id)));
      }
    };

    fetchFollowing();

    // Subscribe to profile changes
    const profileChannel = supabase
      .channel("profile-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
        },
        () => {
          fetchUsers();
        }
      )
      .subscribe();

    // Subscribe to follows changes
    const followsChannel = supabase
      .channel("follows-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "follows",
        },
        () => {
          fetchFollowing();
        }
      )
      .subscribe();

    // Subscribe to new messages to update last messages
    const messageChannel = supabase
      .channel("last-messages")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const newMsg = payload.new as LastMessage;
          if (newMsg.sender_id === currentUserId || newMsg.receiver_id === currentUserId) {
            const otherUserId = newMsg.sender_id === currentUserId ? newMsg.receiver_id : newMsg.sender_id;
            setLastMessages((prev) => ({
              ...prev,
              [otherUserId]: newMsg,
            }));
          }
        }
      )
      .subscribe();

    // Set up presence tracking
    const presenceChannel = supabase.channel("online-users");

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const online = new Set<string>();
        Object.values(state).forEach((presences) => {
          presences.forEach((presence: any) => {
            if (presence.user_id) {
              online.add(presence.user_id);
            }
          });
        });
        setOnlineUsers(online);
      })
      .on("presence", { event: "join" }, ({ newPresences }) => {
        setOnlineUsers((prev) => {
          const next = new Set(prev);
          newPresences.forEach((presence: any) => {
            if (presence.user_id) {
              next.add(presence.user_id);
            }
          });
          return next;
        });
      })
      .on("presence", { event: "leave" }, ({ leftPresences }) => {
        setOnlineUsers((prev) => {
          const next = new Set(prev);
          leftPresences.forEach((presence: any) => {
            if (presence.user_id) {
              next.delete(presence.user_id);
            }
          });
          return next;
        });
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({
            user_id: currentUserId,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(profileChannel);
      supabase.removeChannel(followsChannel);
      supabase.removeChannel(messageChannel);
      supabase.removeChannel(presenceChannel);
    };
  }, [currentUserId]);

  const handleFollow = async (userId: string, isCurrentlyFollowing: boolean) => {
    try {
      if (isCurrentlyFollowing) {
        // Unfollow
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", currentUserId)
          .eq("following_id", userId);

        if (error) throw error;
        setFollowing(prev => {
          const next = new Set(prev);
          next.delete(userId);
          return next;
        });
        toast({
          title: "Unfollowed",
          description: "You have unfollowed this user",
        });
      } else {
        // Follow
        const { error } = await supabase
          .from("follows")
          .insert({
            follower_id: currentUserId,
            following_id: userId,
          });

        if (error) throw error;
        setFollowing(prev => new Set([...prev, userId]));
        toast({
          title: "Following",
          description: "You are now following this user",
        });
      }
    } catch (error) {
      console.error('Error updating follow status:', error);
      toast({
        title: "Error",
        description: "Failed to update follow status",
        variant: "destructive",
      });
    }
  };

  const filteredUsers = users
    .filter(
      (user) =>
        user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.user_id?.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      const aLastMessage = lastMessages[a.id];
      const bLastMessage = lastMessages[b.id];

      if (!aLastMessage && !bLastMessage) return 0;
      if (!aLastMessage) return 1;
      if (!bLastMessage) return -1;

      return new Date(bLastMessage.created_at).getTime() - new Date(aLastMessage.created_at).getTime();
    });

  if (!isVisible && isMobile) {
    return null;
  }

  return (
    <div className={`${isMobile ? 'w-full' : 'w-80'} border-r border-border bg-card flex flex-col ${isMobile ? 'absolute inset-y-0 left-0 z-10' : ''}`}>
      <div className="p-4 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {filteredUsers.map((user) => {
            const isOnline = onlineUsers.has(user.id);
            const isSelected = selectedUserId === user.id;
            const isFollowing = following.has(user.id);

            return (
              <Card
                key={user.id}
                className={`p-3 cursor-pointer transition-all hover:shadow-md ${
                  isSelected ? "bg-primary/10 border-primary" : ""
                }`}
                onClick={() => onSelectUser(user.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Avatar>
                      <AvatarFallback className="bg-primary/20 text-primary">
                        {(user.username || user.email)[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <Circle
                      className={`absolute bottom-0 right-0 h-3 w-3 ${
                        isOnline ? "fill-online text-online" : "fill-offline text-offline"
                      }`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {user.username || user.email.split("@")[0]}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {user.user_id}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {lastMessages[user.id]
                        ? lastMessages[user.id].content.length > 30
                          ? `${lastMessages[user.id].content.substring(0, 30)}...`
                          : lastMessages[user.id].content
                        : user.email}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleFollow(user.id, isFollowing);
                    }}
                    className="ml-2"
                  >
                    {isFollowing ? (
                      <UserMinus className="w-4 h-4" />
                    ) : (
                      <UserPlus className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </Card>
            );
          })}
          {filteredUsers.length === 0 && (
            <p className="text-center text-muted-foreground py-8">
              No users found
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default UserList;
