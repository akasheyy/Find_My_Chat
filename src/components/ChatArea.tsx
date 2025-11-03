import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, MessageCircle, Image, Mic, Heart, Trash2, MoreVertical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  media_url?: string | null;
  message_type: string;
}

interface Reaction {
  id: string;
  message_id: string;
  user_id: string;
  reaction_type: string;
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
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
        .order("created_at", { ascending: true });

      if (!error && data) {
        setMessages(data);
        // Fetch reactions for these messages
        fetchReactions(data.map(m => m.id));
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

    // Subscribe to reactions
    const reactionsChannel = supabase
      .channel("reactions")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_reactions",
        },
        (payload) => {
          fetchReactions(messages.map(m => m.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(reactionsChannel);
    };
  }, [selectedUserId, currentUserId]);

  useEffect(() => {
    // Scroll to bottom when messages change
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const fetchReactions = async (messageIds: string[]) => {
    if (messageIds.length === 0) return;

    const { data, error } = await supabase
      .from("message_reactions")
      .select("*")
      .in("message_id", messageIds);

    if (!error && data) {
      const reactionsMap: Record<string, Reaction[]> = {};
      data.forEach(reaction => {
        if (!reactionsMap[reaction.message_id]) {
          reactionsMap[reaction.message_id] = [];
        }
        reactionsMap[reaction.message_id].push(reaction);
      });
      setReactions(reactionsMap);
    }
  };

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
      message_type: "text",
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

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedUserId) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Error",
        description: "Please select an image file",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Error",
        description: "Image size must be less than 5MB",
        variant: "destructive",
      });
      return;
    }

    try {
      // Upload to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `chat-images/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('chat-media')
        .getPublicUrl(filePath);

      // Send message with image
      const { error: messageError } = await supabase.from("messages").insert({
        sender_id: currentUserId,
        receiver_id: selectedUserId,
        content: "Sent an image",
        media_url: publicUrl,
        message_type: "image",
      });

      if (messageError) throw messageError;

      toast({
        title: "Success",
        description: "Image sent successfully",
      });
    } catch (error) {
      console.error('Error uploading image:', error);
      toast({
        title: "Error",
        description: "Failed to send image",
        variant: "destructive",
      });
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        await uploadVoiceMessage(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: "Error",
        description: "Failed to start recording",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
      setMediaRecorder(null);
    }
  };

  const uploadVoiceMessage = async (blob: Blob) => {
    if (!selectedUserId) return;

    try {
      const fileName = `voice-${Date.now()}.webm`;
      const filePath = `chat-voice/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(filePath, blob);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('chat-media')
        .getPublicUrl(filePath);

      const { error: messageError } = await supabase.from("messages").insert({
        sender_id: currentUserId,
        receiver_id: selectedUserId,
        content: "Voice message",
        media_url: publicUrl,
        message_type: "voice",
      });

      if (messageError) throw messageError;

      toast({
        title: "Success",
        description: "Voice message sent",
      });
    } catch (error) {
      console.error('Error uploading voice message:', error);
      toast({
        title: "Error",
        description: "Failed to send voice message",
        variant: "destructive",
      });
    }
  };

  const handleReaction = async (messageId: string, reactionType: string) => {
    try {
      // Check if user already reacted with this type
      const existingReaction = reactions[messageId]?.find(
        r => r.user_id === currentUserId && r.reaction_type === reactionType
      );

      if (existingReaction) {
        // Remove reaction
        const { error } = await supabase
          .from('message_reactions')
          .delete()
          .eq('id', existingReaction.id);

        if (error) throw error;
      } else {
        // Add reaction
        const { error } = await supabase
          .from('message_reactions')
          .insert({
            message_id: messageId,
            user_id: currentUserId,
            reaction_type: reactionType,
          });

        if (error) throw error;
      }

      // Refresh reactions
      fetchReactions(messages.map(m => m.id));
    } catch (error) {
      console.error('Error handling reaction:', error);
      toast({
        title: "Error",
        description: "Failed to add reaction",
        variant: "destructive",
      });
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    try {
      const { error } = await supabase
        .from('messages')
        .delete()
        .eq('id', messageId)
        .eq('sender_id', currentUserId); // Only allow deleting own messages

      if (error) throw error;

      setMessages(prev => prev.filter(m => m.id !== messageId));
      toast({
        title: "Success",
        description: "Message deleted",
      });
    } catch (error) {
      console.error('Error deleting message:', error);
      toast({
        title: "Error",
        description: "Failed to delete message",
        variant: "destructive",
      });
    }
  };

  const renderMessage = (message: Message) => {
    const isSender = message.sender_id === currentUserId;
    const messageReactions = reactions[message.id] || [];

    return (
      <div
        key={message.id}
        className={`flex ${isSender ? "justify-end" : "justify-start"} group`}
      >
        <div className="max-w-[70%]">
          <Card
            className={`p-3 ${
              isSender
                ? "bg-primary text-primary-foreground"
                : "bg-card"
            }`}
          >
            {message.message_type === 'image' && message.media_url && (
              <img
                src={message.media_url}
                alt="Shared image"
                className="max-w-full h-auto rounded mb-2"
              />
            )}
            {message.message_type === 'voice' && message.media_url && (
              <audio controls className="w-full max-w-xs">
                <source src={message.media_url} type="audio/webm" />
                Your browser does not support the audio element.
              </audio>
            )}
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

          {/* Reactions */}
          {messageReactions.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {messageReactions.map(reaction => (
                <span
                  key={reaction.id}
                  className="text-xs bg-gray-100 px-2 py-1 rounded-full"
                >
                  {reaction.reaction_type === 'like' && '👍'}
                  {reaction.reaction_type === 'heart' && '❤️'}
                  {reaction.reaction_type === 'laugh' && '😂'}
                  {reaction.reaction_type === 'angry' && '😠'}
                  {reaction.reaction_type === 'sad' && '😢'}
                </span>
              ))}
            </div>
          )}

          {/* Message actions */}
          <div className={`flex items-center gap-2 mt-2 ${isSender ? 'justify-end' : 'justify-start'}`}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 p-0"
                >
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleReaction(message.id, 'like')}>
                  👍 Like
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleReaction(message.id, 'heart')}>
                  ❤️ Love
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleReaction(message.id, 'laugh')}>
                  😂 Laugh
                </DropdownMenuItem>
                {isSender && (
                  <DropdownMenuItem
                    onClick={() => handleDeleteMessage(message.id)}
                    className="text-red-600"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    );
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
          {messages.map(renderMessage)}
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
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageUpload}
            accept="image/*"
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
          >
            <Image className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={isRecording ? stopRecording : startRecording}
            disabled={sending}
            className={isRecording ? "bg-red-500 hover:bg-red-600" : ""}
          >
            <Mic className="w-4 h-4" />
          </Button>
          <Button type="submit" disabled={sending || !newMessage.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
};

export default ChatArea;
