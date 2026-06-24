// app/share/ebook/[token]/page.tsx
import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import EbookCanvas from '@/components/EbookCanvas';

export default async function SharedEbookPage({ params }: { params: { token: string } }) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
  const { data: ebook } = await supabase.from('ebooks').select('title, content').eq('share_token', params.token).eq('is_public', true).single();
  if (!ebook) return notFound();
  return <EbookCanvas title={ebook.title} content={ebook.content} />;
}