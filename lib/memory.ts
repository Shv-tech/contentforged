import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * 1. FETCH CORE IDENTITY
 * Retrieves the most recent Brand DNA entry from the user_context table.
 * This is used to ground the AI in the user's specific persona immediately.
 */
export async function fetchCoreIdentity(userId: string) {
  const supabase = createClient(); 

  const { data, error } = await supabase
    .from('user_context')
    .select('content')
    .eq('user_id', userId)
    .eq('context_type', 'brand_dna')
    .order('created_at', { ascending: false })
    .limit(1);

  // If error or no DNA exists, return null so the AI knows it needs to extract it
  if (error || !data || data.length === 0) {
    return null;
  }
  
  return data[0].content;
}

/**
 * 2. SAVE EPISODIC MEMORY
 * Converts a text interaction into a vector embedding and stores it.
 * This allows for semantic search (RAG) in future conversations.
 */
export async function saveEpisodicMemory(
  userId: string, 
  content: string, 
  type: 'chat_message' | 'brand_dna' | 'document'
) {
  try {
    const supabase = createClient();
    
    // Generate the vector embedding (matching your SQL schema 1536 dimension)
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: content,
    });
    
    const embedding = embeddingResponse.data[0].embedding;

    // Insert the memory into user_context
    const { error } = await supabase
      .from('user_context')
      .insert({
        user_id: userId,
        context_type: type,
        content: content,
        embedding: embedding,
      });

    if (error) throw error;
    
    console.log(`[MEMORY] Successfully saved ${type} for user ${userId}`);
  } catch (error) {
    // We catch silently so a memory failure doesn't crash the main chat response
    console.error('Silently caught memory write error:', error);
  }
}