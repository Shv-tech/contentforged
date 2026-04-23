import { ReactNode } from 'react';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="h-screen w-full overflow-hidden bg-[#FAFAFA] text-gray-900 font-sans selection:bg-gray-200 flex flex-col">
      {children}
    </div>
  );
}