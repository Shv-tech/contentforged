'use client';

/**
 * /invite/[token]: accept an invitation to a workspace.
 *
 * Says what the invitation is (which workspace, who sent it, which role)
 * before anyone signs in, then asks the person to sign in or create an
 * account with the invited address. Accepting switches the workspace
 * straight in and opens the team.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { ApiError, api, useWorkspaceStore } from '@/lib/forge/client';
import { ForgeMark } from '@/components/forge/icons';
import { Button, LoadingRow, Plate, Tag } from '@/components/forge/ui';

interface InviteView {
  workspaceName: string;
  inviterName: string;
  email: string;
  role: string;
  roleLabel: string;
  roleDescription: string;
  expired: boolean;
  accepted: boolean;
}

export default function InvitePage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const [invite, setInvite] = useState<InviteView | null>(null);
  const [missing, setMissing] = useState(false);
  const [signedInAs, setSignedInAs] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadWorkspaces = useWorkspaceStore((s) => s.load);
  const switchTo = useWorkspaceStore((s) => s.switchTo);

  useEffect(() => {
    api<{ invite: InviteView }>(`/api/invites/${params.token}`)
      .then((data) => setInvite(data.invite))
      .catch(() => setMissing(true));
    createClient()
      .auth.getUser()
      .then(({ data }) => setSignedInAs(data.user?.email ?? null))
      .catch(() => setSignedInAs(null));
  }, [params.token]);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const { workspaceId } = await api<{ workspaceId: string }>(`/api/invites/${params.token}`, { method: 'POST' });
      await loadWorkspaces(true);
      await switchTo(workspaceId);
      router.replace('/dashboard?view=team');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not accept the invitation.');
      setBusy(false);
    }
  }

  async function switchAccount() {
    await createClient().auth.signOut();
    router.replace(`/login?next=${encodeURIComponent(`/invite/${params.token}`)}`);
  }

  const next = encodeURIComponent(`/invite/${params.token}`);
  const matches = invite && signedInAs && signedInAs.toLowerCase() === invite.email.toLowerCase();

  return (
    <div className="grid min-h-[100dvh] bg-black font-sans text-white lg:grid-cols-[1fr_1.1fr]">
      <Plate name="molten" className="hidden lg:block" dim={0.4} priority />
      <main className="flex items-center justify-center px-5 py-16">
        <div className="w-full max-w-[440px]">
          <ForgeMark className="h-9 w-9" />
          {missing ? (
            <>
              <h1 className="mt-10 text-[30px] font-semibold tracking-[-0.03em]">This invitation does not exist</h1>
              <p className="mt-3 text-[15px] leading-relaxed text-white/55">The link may be mistyped, or the invitation was withdrawn. Ask whoever invited you for a new one.</p>
            </>
          ) : !invite || signedInAs === undefined ? (
            <div className="mt-10">
              <LoadingRow label="Opening the invitation" />
            </div>
          ) : (
            <>
              <p className="mt-10 text-[13px] font-semibold uppercase tracking-[0.12em] text-forge-gold">Invitation</p>
              <h1 className="mt-3 text-[32px] font-semibold leading-[1.1] tracking-[-0.03em]">Join {invite.workspaceName}</h1>
              <p className="mt-3 text-[15px] leading-relaxed text-white/60">
                {invite.inviterName} invited {invite.email} to work on {invite.workspaceName} in Forge.
              </p>
              <div className="mt-6 flex items-start gap-3 rounded-[18px] border border-white/[0.08] bg-white/[0.03] p-4">
                <Tag tone="ember">{invite.roleLabel}</Tag>
                <p className="text-[13.5px] leading-relaxed text-white/65">{invite.roleDescription}</p>
              </div>

              <div className="mt-8 flex flex-col gap-3">
                {invite.accepted ? (
                  <>
                    <p className="text-[14px] text-white/60">This invitation has already been used.</p>
                    <Link href="/dashboard?view=team" className="inline-flex h-11 items-center justify-center rounded-full bg-white px-6 text-[14.5px] font-medium text-black">
                      Open Forge
                    </Link>
                  </>
                ) : invite.expired ? (
                  <p className="text-[14px] leading-relaxed text-white/60">This invitation has expired. Ask {invite.inviterName} to send a new one.</p>
                ) : !signedInAs ? (
                  <>
                    <Link href={`/signup?next=${next}`} className="inline-flex h-11 items-center justify-center rounded-full bg-white px-6 text-[14.5px] font-medium text-black hover:bg-white/85">
                      Create an account with {invite.email}
                    </Link>
                    <Link href={`/login?next=${next}`} className="inline-flex h-11 items-center justify-center rounded-full border border-white/[0.14] px-6 text-[14.5px] font-medium text-white hover:bg-white/[0.06]">
                      I already have an account
                    </Link>
                  </>
                ) : matches ? (
                  <Button variant="primary" size="lg" loading={busy} onClick={accept}>
                    Accept and open {invite.workspaceName}
                  </Button>
                ) : (
                  <>
                    <p className="text-[14px] leading-relaxed text-white/60">
                      You are signed in as {signedInAs}. This invitation is for {invite.email}.
                    </p>
                    <Button variant="secondary" size="lg" onClick={switchAccount}>
                      Sign in as {invite.email}
                    </Button>
                  </>
                )}
                {error && <p className="text-[13.5px] text-forge-bad">{error}</p>}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
