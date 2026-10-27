-- =============================================================================
-- FORGE LANGUAGES
--
-- Widens the writing language from English, Hindi and Hinglish to every
-- language in lib/forge/languages.ts: nine more mixes with English in Roman
-- script (Tenglish, Tanglish, Banglish, Marathi-English, Kanglish, Manglish,
-- Gujarati-English, Punjabi-English, Taglish), nine more Indian languages in
-- their own script, and twenty world languages.
--
-- The three checks are replaced, not added to. Existing values ('en', 'hi',
-- 'hinglish') are all still allowed, so no row changes. Idempotent: safe to
-- re-run. Run after 20261101000000_forge_platform.sql.
--
-- When a language is added to lib/forge/languages.ts, add its code to
-- forge_writing_languages() below and run this file again.
-- =============================================================================

create or replace function public.forge_writing_languages()
returns text[]
language sql
immutable
as $$
  select array[
    'en',
    'hinglish', 'te-en', 'ta-en', 'bn-en', 'mr-en', 'kn-en', 'ml-en', 'gu-en', 'pa-en', 'tl-en',
    'hi', 'bn', 'te', 'ta', 'mr', 'gu', 'kn', 'ml', 'pa', 'ur',
    'es', 'pt', 'fr', 'de', 'it', 'nl', 'sv', 'pl', 'tr', 'id', 'vi', 'ru', 'uk', 'el', 'ar', 'he', 'th', 'ja', 'ko', 'zh'
  ]::text[];
$$;

alter table public.profiles drop constraint if exists profiles_writing_language_check;
alter table public.profiles
  add constraint profiles_writing_language_check check (writing_language = any (public.forge_writing_languages()));

alter table public.workspaces drop constraint if exists workspaces_writing_language_check;
alter table public.workspaces
  add constraint workspaces_writing_language_check check (writing_language = any (public.forge_writing_languages()));

alter table public.drafts drop constraint if exists drafts_language_check;
alter table public.drafts
  add constraint drafts_language_check check (language = any (public.forge_writing_languages()));
