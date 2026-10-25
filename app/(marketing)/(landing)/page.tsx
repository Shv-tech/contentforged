// app/(marketing)/(landing)/page.tsx
// The route for "/". Server component: it sets the page metadata and renders
// the client-side landing page.
import type { Metadata } from 'next';
import { landingMetadata } from '../lib/seo-metadata';
import LandingClient from './landing-client';

export const metadata: Metadata = landingMetadata;

export default function Page() {
  return <LandingClient />;
}
