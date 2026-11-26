// app/api/brand-dna/scrape/route.ts

import { NextResponse } from 'next/server';
import { scrapePublicProfile } from '@/lib/scraper';
import { createClient } from '@/lib/supabase/server';
import { observed } from '@/lib/ops/observe';

async function handlePOST(req: Request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { profileUrl } = await req.json();

    if (!profileUrl) {
      return NextResponse.json({ error: 'Profile URL is required' }, { status: 400 });
    }

    // Calls your existing scraper logic
    const profile = await scrapePublicProfile(user.id, profileUrl);

    return NextResponse.json({ profile }, { status: 200 });
  } catch (error: any) {
    console.error('[SCRAPE_ERROR]', error);
    return NextResponse.json(
      { error: error.message || 'Failed to sync profile.' },
      { status: 500 }
    );
  }
}

export const POST = observed('api/brand-dna/scrape', handlePOST);
