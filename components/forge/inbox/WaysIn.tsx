'use client';

/**
 * Every way material reaches the inbox besides recording here: forward an
 * email, share from the phone, save from the browser.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ApiError, api } from '@/lib/forge/client';
import { useAppStore } from '@/lib/store';
import { Button, Dialog, Field, IconButton, copyText, cn, focusRing, inputClass } from '@/components/forge/ui';

interface AddressResponse {
  configured: boolean;
  accountEmail?: string;
  address: { id: string; address: string; allowed_senders: string[]; created_at: string } | null;
}

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function WaysIn({ readOnly }: { readOnly: boolean }) {
  const [address, setAddress] = useState<AddressResponse | null>(null);
  const [managing, setManaging] = useState(false);
  const [senders, setSenders] = useState('');
  const [busy, setBusy] = useState<'rotate' | 'senders' | null>(null);
  const [install, setInstall] = useState<InstallPromptEvent | null>(null);
  const setSidebarView = useAppStore((s) => s.setSidebarView);

  useEffect(() => {
    api<AddressResponse>('/api/capture/address')
      .then((data) => {
        setAddress(data);
        setSenders(data.address?.allowed_senders.join(', ') ?? '');
      })
      .catch(() => setAddress({ configured: false, address: null }));

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  async function rotate() {
    setBusy('rotate');
    try {
      const { address: next } = await api<{ address: AddressResponse['address'] }>('/api/capture/address', { method: 'POST', json: { action: 'rotate' } });
      setAddress((current) => (current ? { ...current, address: next } : current));
      toast.success('New address issued. The old one no longer works.');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not issue a new address.');
    } finally {
      setBusy(null);
    }
  }

  async function saveSenders() {
    setBusy('senders');
    try {
      const allowedSenders = senders
        .split(/[\s,]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      const { address: next } = await api<{ address: AddressResponse['address'] }>('/api/capture/address', { method: 'PATCH', json: { allowedSenders } });
      setAddress((current) => (current ? { ...current, address: next } : current));
      setManaging(false);
      toast.success('Saved.');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not save the senders.');
    } finally {
      setBusy(null);
    }
  }

  const email = address?.address?.address;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-1">
      <Way
        title="Forward an email"
        body={
          address === null
            ? 'Loading your address'
            : !address.configured
              ? 'Email-in is not set up on this server yet.'
              : 'Newsletters you wrote, client threads, notes to self. Forward them here.'
        }
        footer={
          email && (
            <div className="flex items-center gap-1">
              <code className="min-w-0 flex-1 truncate rounded-[10px] bg-white/[0.05] px-3 py-2 text-[12.5px] text-white/85">{email}</code>
              <IconButton
                label="Copy address"
                onClick={async () => {
                  if (await copyText(email)) toast.success('Address copied.');
                  else toast.error('Could not copy. Select the address and copy it.');
                }}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <rect x="8" y="8" width="12" height="12" rx="2.5" />
                  <path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" />
                </svg>
              </IconButton>
              {!readOnly && (
                <IconButton label="Manage address" onClick={() => setManaging(true)}>
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                    <path d="M5 12h.01M12 12h.01M19 12h.01" />
                  </svg>
                </IconButton>
              )}
            </div>
          )
        }
      />
      <Way
        title="Share from your phone"
        body="Install Forge, then share links, notes or screenshots of text to it from any app. Record voice notes from the home screen."
        footer={
          <div className="flex flex-wrap gap-2">
            {install ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  await install.prompt();
                  await install.userChoice;
                  setInstall(null);
                }}
              >
                Install app
              </Button>
            ) : (
              <Link href="/capture" className={cn('inline-flex h-8 items-center rounded-full border border-white/[0.12] px-3.5 text-[13px] font-medium text-white hover:bg-white/[0.06]', focusRing)}>
                Open capture
              </Link>
            )}
          </div>
        }
      />
      <Way
        title="Save from the browser"
        body="The Forge extension saves any page or selection to this inbox, and fills your X composer with a draft for you to post."
        footer={
          <Button variant="secondary" size="sm" onClick={() => setSidebarView('brand')}>
            Set up the extension
          </Button>
        }
      />

      <Dialog
        open={managing}
        onClose={() => setManaging(false)}
        title="Your email-in address"
        footer={
          <>
            <Button variant="danger" onClick={rotate} loading={busy === 'rotate'} className="mr-auto">
              Issue a new address
            </Button>
            <Button variant="primary" onClick={saveSenders} loading={busy === 'senders'}>
              Save
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <p className="text-[13.5px] leading-relaxed text-white/60">
            Mail from {address?.accountEmail ? <strong className="font-medium text-white/85">{address.accountEmail}</strong> : 'your account email'} is always accepted. Anything from other senders is dropped unless they are listed here.
          </p>
          <Field label="Also accept mail from" htmlFor="allowed-senders" hint="Addresses separated by commas, for example your work email or an assistant.">
            <input id="allowed-senders" value={senders} onChange={(e) => setSenders(e.target.value)} className={inputClass} spellCheck={false} placeholder="me@work.com, assistant@company.com" />
          </Field>
          <p className="text-[12.5px] leading-relaxed text-white/40">If the address leaks, issue a new one. The old address stops working straight away.</p>
        </div>
      </Dialog>
    </div>
  );
}

/** Stacked on tablets, side by side (text and action) beside the recorder on wide screens. */
function Way({ title, body, footer }: { title: string; body: string; footer?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-[20px] border border-white/[0.07] bg-forge-card p-5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-center lg:gap-5">
      <div className="flex flex-col gap-1.5">
        <h3 className="text-[14.5px] font-semibold text-white">{title}</h3>
        <p className="text-[13px] leading-relaxed text-white/50">{body}</p>
      </div>
      {footer && <div className="mt-auto pt-1 lg:mt-0 lg:pt-0">{footer}</div>}
    </div>
  );
}
