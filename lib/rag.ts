import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function processRagThreshold(userInput: string, userId: string) {
  try {
    const supabase = createClient(); // Uses secure cookies to pass RLS
    
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: userInput,
    });
    const inputVector = embeddingResponse.data[0].embedding;

    // The threshold is 0.60 to allow for subtle cognitive associations
    const { data: contextMatches, error } = await supabase.rpc('match_user_context', {
      query_embedding: inputVector,
      match_threshold: 0.60, 
      match_count: 8, 
      p_user_id: userId
    });

    if (error) throw error;

    // Filter out Brand DNA so we don't duplicate it (handled by Core Identity)
    const episodicMatches = contextMatches?.filter((match: any) => match.context_type !== 'brand_dna');

    if (!episodicMatches || episodicMatches.length === 0) {
      return { needsRag: false, ragContext: "" };
    }

    const compiledContext = episodicMatches.map((match: any) => match.content).join('\n\n---\n\n');
    
    return { needsRag: true, ragContext: compiledContext };
  } catch (error) {
    console.error('Semantic Router bypassed due to error:', error);
    return { needsRag: false, ragContext: "" }; 
  }
}