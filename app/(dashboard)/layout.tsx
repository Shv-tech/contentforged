import { ReactNode } from 'react';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-[#000000] text-white font-sans selection:bg-gray-200 h-screen overflow-hidden">
      {children}
    </div>
  );
}