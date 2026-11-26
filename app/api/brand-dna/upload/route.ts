// app/api/brand-dna/upload/route.ts

import { NextResponse } from 'next/server';
import { createBrandDnaSource } from '@/lib/brand-dna';
import { createClient } from '@/lib/supabase/server';
import { observed } from '@/lib/ops/observe';

async function handlePOST(req: Request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const sourceType = formData.get('sourceType') as 'pdf' | 'md' | 'text';
    const title = formData.get('title') as string;

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    // Convert the native File object into the RawAttachment shape expected by lib/file-parsers.ts
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    
    const rawAttachment = {
      name: file.name,
      mimeType: file.type,
      base64: base64,
    };

    // Pass the correctly shaped object to your existing brand-dna logic
    const source = await createBrandDnaSource({
      userId: user.id,
      sourceType,
      title,
      file: rawAttachment, 
    });

    return NextResponse.json({ source }, { status: 200 });
  } catch (error: any) {
    console.error('[UPLOAD_ERROR]', error);
    return NextResponse.json(
      { error: error.message || 'Failed to upload document.' },
      { status: 500 }
    );
  }
}

export const POST = observed('api/brand-dna/upload', handlePOST);
