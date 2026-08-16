-- =========================================
-- FORGE — UNIFIED DATABASE SCHEMA
-- Contains: Core App (RAG/Chat/Tokens/Devices) + Marketing Tools (Leads)
-- =========================================

-- =========================================
-- 1. EXTENSIONS & UTILITY FUNCTIONS
-- =========================================
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Used by the Leads table to auto-update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =========================================
-- 2. CORE APP TABLES (Authenticated)
-- =========================================

-- PROFILES (Replaces 'users', links directly to auth.users)
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  subscription_status TEXT DEFAULT 'free',
  monthly_token_limit INTEGER DEFAULT 100000,
  tokens_used_this_month INTEGER DEFAULT 0,
  tokens_used_today INTEGER DEFAULT 0,
  last_token_reset TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  razorpay_customer_id TEXT,
  razorpay_subscription_id TEXT,
  current_period_end TIMESTAMP WITH TIME ZONE
);

-- CHAT SESSIONS (Sidebar titles)
CREATE TABLE public.chat_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  title TEXT NOT NULL DEFAULT 'New Workspace',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- CHAT MESSAGES
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES public.chat_sessions(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  attachments JSONB DEFAULT NULL,
  pdfs JSONB DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- USER CONTEXT (RAG / Brand DNA / Vectors)
CREATE TABLE public.user_context (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  context_type TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- DEVICE SESSIONS
CREATE TABLE public.device_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  device_type TEXT NOT NULL,
  location TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  is_current_session BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_active TIMESTAMP WITH TIME ZONE DEFAULT now()
);


-- =========================================
-- 3. MARKETING / FREE TOOLS TABLES
-- =========================================

-- LEADS (Unauthenticated capture from free tools)
CREATE TABLE public.leads (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);


-- =========================================
-- 4. TRIGGERS & AUTO-FUNCTIONS
-- =========================================

-- Auto-update Leads updated_at timestamp
CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Auto-create Profile row when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (new.id);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- =========================================
-- 5. VECTOR INDEXES & BUSINESS LOGIC
-- =========================================

-- IVFFlat Index for lightning-fast retrieval
CREATE INDEX ON public.user_context USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- RAG Retrieval Function
CREATE OR REPLACE FUNCTION public.match_user_context (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_user_id uuid
)
RETURNS TABLE (
  id uuid,
  content text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    user_context.id,
    user_context.content,
    1 - (user_context.embedding <=> query_embedding) as similarity
  FROM user_context
  WHERE user_context.user_id = p_user_id
    AND 1 - (user_context.embedding <=> query_embedding) > match_threshold
  ORDER BY user_context.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Token Increment Logic
CREATE OR REPLACE FUNCTION public.increment_token_usage(p_user_id UUID, p_tokens INTEGER, p_is_new_day BOOLEAN)
RETURNS VOID AS $$
BEGIN
  IF p_is_new_day THEN
    UPDATE public.profiles
    SET tokens_used_this_month = tokens_used_this_month + p_tokens,
        tokens_used_today = p_tokens,
        last_token_reset = NOW()
    WHERE id = p_user_id;
  ELSE
    UPDATE public.profiles
    SET tokens_used_this_month = tokens_used_this_month + p_tokens,
        tokens_used_today = tokens_used_today + p_tokens
    WHERE id = p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =========================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- =========================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- PROFILES
CREATE POLICY "Users can view own profile" 
ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);

-- CHAT SESSIONS
CREATE POLICY "Enable insert for users based on user_id" 
ON public.chat_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Enable read for users based on user_id" 
ON public.chat_sessions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Enable update for users based on user_id" 
ON public.chat_sessions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Enable delete for users based on user_id" 
ON public.chat_sessions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- CHAT MESSAGES (Enterprise Relationship Policies)
CREATE POLICY "Users can read own messages" 
ON public.chat_messages FOR SELECT TO authenticated USING (
  session_id IN (SELECT id FROM public.chat_sessions WHERE user_id = auth.uid())
);
CREATE POLICY "Users can insert own messages" 
ON public.chat_messages FOR INSERT TO authenticated WITH CHECK (
  session_id IN (SELECT id FROM public.chat_sessions WHERE user_id = auth.uid())
);
CREATE POLICY "Users can delete own messages" 
ON public.chat_messages FOR DELETE TO authenticated USING (
  session_id IN (SELECT id FROM public.chat_sessions WHERE user_id = auth.uid())
);

-- USER CONTEXT (RAG)
CREATE POLICY "Enable insert context for users" 
ON public.user_context FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Enable read context for users" 
ON public.user_context FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Enable update context for users" 
ON public.user_context FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Enable delete context for users" 
ON public.user_context FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- DEVICE SESSIONS
CREATE POLICY "Users can view own devices" 
ON public.device_sessions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own devices" 
ON public.device_sessions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- LEADS
-- Locked down to public. ONLY accessible via Backend API (Service Role Key)
CREATE POLICY "leads_no_public_access" ON public.leads FOR ALL USING (false);