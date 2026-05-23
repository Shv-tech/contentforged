import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';

export async function fetchCoreIdentity(userId: string) {
  const supabase = createClient(); 

  const { data, error } = await supabase
    .from('user_context')
    .select('content')
    .eq('user_id', userId)
    .eq('context_type', 'brand_dna')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    return null;
  }
  
  return data[0].content;
}

export async function saveEpisodicMemory(
  userId: string, 
  content: string, 
  type: 'chat_message' | 'brand_dna' | 'document'
) {
  try {
    // Moved inside: Only runs when the function is actually called
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const supabase = createClient();
    
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: content,
    });
    
    const embedding = embeddingResponse.data[0].embedding;

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
    console.error('Silently caught memory write error:', error);
  }
}