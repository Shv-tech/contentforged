import type { Metadata } from 'next';
import { OnboardingFlow } from './onboarding-flow';

export const metadata: Metadata = {
  title: 'Set up Forge',
  robots: { index: false, follow: false },
};

export default function OnboardingPage() {
  return <OnboardingFlow />;
}
