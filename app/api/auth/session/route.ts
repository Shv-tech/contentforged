import { NextResponse, userAgent } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: "Missing User ID" }, { status: 400 });
    }

    // 1. Extract Hardware Data
    const { browser, os } = userAgent(req);
    const deviceString = `${browser.name || 'Unknown Browser'} (${os.name || 'Unknown OS'})`;

    // 2. Extract Edge Geolocation
    const country = req.headers.get('x-vercel-ip-country') || 'IN'; 
    const city = req.headers.get('x-vercel-ip-city') || 'New Delhi';
    const locationString = `${city}, ${country}`;
    
    // 3. Extract IP Address
    const ipAddress = req.headers.get('x-forwarded-for') || '127.0.0.1';

    // 4. SECURE KEY CHECK (Strictly using your 2 specified keys)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error("CRITICAL: Missing Supabase Environment Variables in /api/auth/session");
      return NextResponse.json({ error: "Server Configuration Error" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 5. Save the session
    const { error } = await supabase.from('device_sessions').insert({
      user_id: userId,
      device_type: deviceString,
      location: locationString,
      ip_address: ipAddress,
      is_current_session: true
    });

    if (error) {
       console.error("Database Insert Error:", error.message);
       return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("Session Log Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}