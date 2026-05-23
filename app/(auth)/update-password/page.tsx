// app/update-password/page.tsx
import { Suspense } from 'react';
import UpdatePasswordClient from '../../../components/UpdatePasswordClient';
import { Loader2 } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function UpdatePasswordPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <Suspense 
        fallback={
          <div className="flex justify-center items-center">
            <Loader2 className="h-8 w-8 animate-spin text-slate-900 dark:text-slate-50" />
          </div>
        }
      >
        <UpdatePasswordClient />
      </Suspense>
    </div>
  );
}