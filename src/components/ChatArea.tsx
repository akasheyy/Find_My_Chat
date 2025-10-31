import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, MessageCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
}

interface ChatAreaProps {
  currentUserId: string;
  selectedUserId: string | null;
}

const ChatArea = ({ currentUserId, selectedUserId }: ChatAreaProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedUserEmail, setSelectedUserEmail] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!selectedUserId) {
      setMessages([]);
      return;
    }

    // Fetch selected user's email
    const fetchUserEmail = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", selectedUserId)
        .single();
      
      if (data) {
        setSelectedUserEmail(data.email);
      }
    };

    fetchUserEmail();

    // Fetch messages between current user and selected user
    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .or(
          `and(sender_id.eq.${currentUserId},receiver_id.eq.${selectedUserId}),and(sender_id.eq.${selectedUserId},receiver_id.eq.${currentUserId})`
        )
        .order("created_at", { ascending: false });

      if (!error && data) {
        setMessages(data);
      }
    };

    fetchMessages();

    // Subscribe to new messages
    const channel = supabase
      .channel("messages")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const newMsg = payload.new as Message;
          if (
            (newMsg.sender_id === currentUserId && newMsg.receiver_id === selectedUserId) ||
            (newMsg.sender_id === selectedUserId && newMsg.receiver_id === currentUserId)
          ) {
            setMessages((prev) => [...prev, newMsg]);

            // Show notification for incoming messages (not from current user)
            if (newMsg.sender_id !== currentUserId) {
              showNotification(newMsg);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedUserId, currentUserId]);

  useEffect(() => {
    // Scroll to bottom when messages change
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const showNotification = (message: Message) => {
    if (!("Notification" in window)) {
      console.log("This browser does not support desktop notification");
      return;
    }

    if (Notification.permission === "granted") {
      new Notification(`New message from ${selectedUserEmail}`, {
        body: message.content,
        icon: "/fmc_logo.png",
        tag: `chat-message-${message.sender_id}`, // Unique tag per sender to prevent duplicate notifications
        requireInteraction: false, // Auto-dismiss after a few seconds
        silent: false, // Ensure sound/notification is played
      });
    } else if (Notification.permission === "default") {
      Notification.requestPermission().then((permission) => {
        if (permission === "granted") {
          new Notification(`New message from ${selectedUserEmail}`, {
            body: message.content,
            icon: "/fmc_logo.png",
            tag: `chat-message-${message.sender_id}`,
            requireInteraction: false,
            silent: false,
          });
        }
      });
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newMessage.trim() || !selectedUserId) return;

    setSending(true);

    const { error } = await supabase.from("messages").insert({
      sender_id: currentUserId,
      receiver_id: selectedUserId,
      content: newMessage.trim(),
    });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
    } else {
      setNewMessage("");
    }

    setSending(false);
  };

  if (!selectedUserId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="p-4 bg-primary/10 rounded-full inline-block">
            <MessageCircle className="w-12 h-12 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold mb-2">Welcome to ChatConnect</h2>
            <p className="text-muted-foreground">
              Select a user from the list to start chatting
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex-1 flex flex-col bg-background ${isMobile ? 'w-full' : ''}`}>
      <div className="border-b border-border bg-card px-6 py-4">
        <h2 className="font-semibold">{selectedUserEmail}</h2>
      </div>

      <ScrollArea className="flex-1 p-6" ref={scrollRef}>
        <div className="space-y-4">
          {messages.map((message) => {
            const isSender = message.sender_id === currentUserId;
            return (
              <div
                key={message.id}
                className={`flex ${isSender ? "justify-end" : "justify-start"}`}
              >
                <Card
                  className={`max-w-[70%] p-3 ${
                    isSender
                      ? "bg-primary text-primary-foreground"
                      : "bg-card"
                  }`}
                >
                  <p className="break-words">{message.content}</p>
                  <p
                    className={`text-xs mt-1 ${
                      isSender ? "text-primary-foreground/70" : "text-muted-foreground"
                    }`}
                  >
                    {new Date(message.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </Card>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      <div className="border-t border-border bg-card p-4">
        <form onSubmit={handleSendMessage} className="flex gap-2">
          <Input
            placeholder="Type a message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            disabled={sending}
            className="flex-1"
          />
          <Button type="submit" disabled={sending || !newMessage.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
};

export default ChatArea;
