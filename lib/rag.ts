import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';

export async function processRagThreshold(userInput: string, userId: string) {
  try {
    // Moved inside: Only runs when the function is actually called
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const supabase = createClient(); 
    
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: userInput,
    });
    const inputVector = embeddingResponse.data[0].embedding;

    const { data: contextMatches, error } = await supabase.rpc('match_user_context', {
      query_embedding: inputVector,
      match_threshold: 0.60, 
      match_count: 8, 
      p_user_id: userId
    });

    if (error) throw error;

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