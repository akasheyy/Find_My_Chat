-- Add user_id column to profiles table
ALTER TABLE public.profiles ADD COLUMN user_id TEXT UNIQUE;

-- Create a sequence for user_id generation
CREATE SEQUENCE public.user_id_seq START 1000;

-- Function to generate unique user_id
CREATE OR REPLACE FUNCTION public.generate_user_id()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  new_id TEXT;
BEGIN
  LOOP
    new_id := 'USER' || nextval('public.user_id_seq')::TEXT;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = new_id);
  END LOOP;
  RETURN new_id;
END;
$$;

-- Update existing profiles with user_id
UPDATE public.profiles SET user_id = generate_user_id() WHERE user_id IS NULL;

-- Make user_id NOT NULL after populating
ALTER TABLE public.profiles ALTER COLUMN user_id SET NOT NULL;

-- Update handle_new_user function to include user_id
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username, user_id)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    generate_user_id()
  );
  RETURN new;
END;
$$;

-- Add media_url and message_type to messages table
ALTER TABLE public.messages ADD COLUMN media_url TEXT;
ALTER TABLE public.messages ADD COLUMN message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'voice'));

-- Create message_reactions table
CREATE TABLE public.message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('like', 'heart', 'laugh', 'angry', 'sad')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id, reaction_type)
);

-- Enable RLS on message_reactions
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- Message reactions policies
CREATE POLICY "Message reactions are viewable by everyone in the conversation"
  ON public.message_reactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_reactions.message_id
      AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
    )
  );

CREATE POLICY "Users can insert their own reactions"
  ON public.message_reactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reactions"
  ON public.message_reactions FOR DELETE
  USING (auth.uid() = user_id);

-- Create follows table
CREATE TABLE public.follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(follower_id, following_id),
  CHECK (follower_id != following_id)
);

-- Enable RLS on follows
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- Follows policies
CREATE POLICY "Follows are viewable by everyone"
  ON public.follows FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own follows"
  ON public.follows FOR INSERT
  WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users can delete their own follows"
  ON public.follows FOR DELETE
  USING (auth.uid() = follower_id);

-- Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.follows;

-- Update messages policy to allow deletion by sender
CREATE POLICY "Users can delete their own messages"
  ON public.messages FOR DELETE
  USING (auth.uid() = sender_id);
