-- =========================================
-- CONTENTFORGE — DATABASE SCHEMA
-- Run this in Supabase SQL Editor
-- =========================================

-- Users (extends auth.users)
CREATE TABLE public.users (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  llm_provider TEXT DEFAULT 'openai',
  credits_remaining INTEGER DEFAULT 5,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'tier1', 'tier2', 'tier3')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-create user row on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, credits_remaining, plan)
  VALUES (NEW.id, NEW.email, 5, 'free');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Generations
CREATE TABLE public.generations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  input_content TEXT,
  input_type TEXT CHECK (input_type IN ('text', 'url', 'youtube')),
  tone TEXT,
  outputs JSONB NOT NULL DEFAULT '[]',
  credits_used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Payments
CREATE TABLE public.payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  razorpay_order_id TEXT NOT NULL,
  razorpay_payment_id TEXT NOT NULL,
  tier_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Users: own data only
CREATE POLICY "users_select_own" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_update_own" ON public.users FOR UPDATE USING (auth.uid() = id);

-- Generations: own data only
CREATE POLICY "gen_select_own" ON public.generations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "gen_insert_own" ON public.generations FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Payments: own data only
CREATE POLICY "pay_select_own" ON public.payments FOR SELECT USING (auth.uid() = user_id);

-- Service role bypass for API routes
CREATE POLICY "service_users" ON public.users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_gen" ON public.generations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_pay" ON public.payments FOR ALL USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX idx_gen_user_date ON public.generations (user_id, created_at DESC);
CREATE INDEX idx_pay_user ON public.payments (user_id, created_at DESC);
