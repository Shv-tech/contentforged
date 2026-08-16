// lib/billing/use-subscription-checkout.ts

'use client';

import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';

declare global {
  interface Window {
    Razorpay: any;
  }
}

/**
 * Opens Razorpay Checkout for a recurring subscription.
 *
 * REPLACES lib/use-razorpay.ts, which created one-time Orders. Orders cannot
 * auto-renew: there is no mandate, so the customer had to manually pay again
 * every month. This uses the Subscriptions flow, which carries the mandate
 * (card / UPI Autopay / eMandate) and the RBI-required pre-debit notification.
 *
 * WHAT THIS HOOK DOES NOT DO
 *
 * It does not grant the plan. The success handler only tells the user the
 * payment went through and then polls for entitlement. The plan itself is
 * granted exclusively by the signature-verified `subscription.charged`
 * webhook, server-side.
 *
 * This distinction is the entire security model. The previous implementation
 * granted plans from a client callback, which meant anyone could claim any
 * tier on any account by replaying a cheap payment with different parameters.
 */

const CHECKOUT_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';

/** How long to wait for the webhook to land before telling the user to sit tight. */
const ENTITLEMENT_POLL_ATTEMPTS = 10;
const ENTITLEMENT_POLL_INTERVAL_MS = 1500;

export interface StartCheckoutArgs {
  planId: 'starter' | 'pro' | 'agency';
  email: string;
  name?: string;
  /** Fired once entitlement is confirmed server-side, not merely paid. */
  onActivated?: () => void;
}

interface SubscriptionResponse {
  subscriptionId: string;
  planId: string;
  planName: string;
  currency: 'INR' | 'USD';
  amountMinor: number;
  displayAmount: string;
  availableMethods: string[];
  razorpayKeyId: string;
}

export function useSubscriptionCheckout() {
  const [isStarting, setIsStarting] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const loadScript = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      if (typeof window === 'undefined') return resolve(false);
      if (window.Razorpay) return resolve(true);

      // Reuse an in-flight tag rather than appending a second one if the user
      // clicks twice before the first load finishes.
      const existing = document.querySelector<HTMLScriptElement>(
        `script[src="${CHECKOUT_SCRIPT}"]`
      );
      if (existing) {
        existing.addEventListener('load', () => resolve(true));
        existing.addEventListener('error', () => resolve(false));
        return;
      }

      const script = document.createElement('script');
      script.src = CHECKOUT_SCRIPT;
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }, []);

  /**
   * Polls until the webhook has upgraded the account.
   *
   * Razorpay's webhook and the browser callback race, and the webhook usually
   * loses by a second or two. Without this the user would see "payment
   * successful" next to a UI still showing the free plan.
   */
  const waitForEntitlement = useCallback(
    async (expectedPlanId: string): Promise<boolean> => {
      for (let attempt = 0; attempt < ENTITLEMENT_POLL_ATTEMPTS; attempt++) {
        try {
          const res = await fetch('/api/billing/status', { cache: 'no-store' });
          if (res.ok) {
            const data = await res.json();
            if (data.planId === expectedPlanId) return true;
          }
        } catch {
          // Network blip during polling is not fatal; keep trying.
        }
        await new Promise((r) => setTimeout(r, ENTITLEMENT_POLL_INTERVAL_MS));
      }
      return false;
    },
    []
  );

  const startCheckout = useCallback(
    async ({ planId, email, name, onActivated }: StartCheckoutArgs) => {
      setIsStarting(true);

      try {
        const loaded = await loadScript();
        if (!loaded) {
          toast.error('Payment gateway failed to load. Check your connection and try again.');
          return;
        }

        // Currency is resolved server-side from geo headers. The client does
        // not send one, and could not be trusted with it anyway: pricing must
        // not be selectable by the buyer.
        const res = await fetch('/api/billing/subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId }),
        });

        const data = await res.json();

        if (!res.ok) {
          toast.error(data.error || 'Could not start the subscription.');
          return;
        }

        const subscription = data as SubscriptionResponse;

        const checkout = new window.Razorpay({
          key: subscription.razorpayKeyId,
          subscription_id: subscription.subscriptionId,
          name: 'Forge',
          description: `${subscription.planName} — ${subscription.displayAmount}/month`,
          prefill: { email, name: name || '' },
          theme: { color: '#d18a5e' },

          handler: async () => {
            setIsConfirming(true);
            const confirming = toast.loading('Payment received. Activating your workspace...');

            const activated = await waitForEntitlement(planId);
            setIsConfirming(false);

            if (activated) {
              toast.success('Your workspace is upgraded.', { id: confirming });
              onActivated?.();
            } else {
              // Not an error state. The payment succeeded; the webhook is
              // simply slow. Saying "failed" here would be wrong and would
              // generate support tickets for a working charge.
              toast.success(
                'Payment received. Your upgrade will appear shortly — refresh in a moment.',
                { id: confirming, duration: 8000 }
              );
            }
          },

          modal: {
            ondismiss: () => {
              // The subscription row stays in 'created' state and never
              // activates. The API route deletes stale 'created' rows on the
              // next attempt, and the uniqueness index no longer counts them
              // as live, so an abandoned checkout does not block resubscribing.
              toast('Checkout cancelled.');
            },
          },
        });

        checkout.on('payment.failed', (response: any) => {
          const reason = response?.error?.description || 'Payment failed.';
          // Card-based recurring is heavily restricted under RBI rules and
          // many cards simply cannot carry a mandate. Point at the
          // alternatives rather than leaving the customer to retry the same
          // card and fail again.
          const ineligible = /not eligible|recurring/i.test(reason);
          toast.error(
            ineligible
              ? `${reason} UPI Autopay or net banking (eMandate) usually work when a card does not.`
              : reason,
            { duration: 7000 }
          );
        });

        checkout.open();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Something went wrong.';
        toast.error(message);
      } finally {
        setIsStarting(false);
      }
    },
    [loadScript, waitForEntitlement]
  );

  const cancelSubscription = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/billing/subscription', { method: 'DELETE' });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Could not cancel.');
        return false;
      }

      const until = data.accessUntil
        ? new Date(data.accessUntil).toLocaleDateString()
        : 'the end of your billing period';
      toast.success(`Subscription cancelled. You keep access until ${until}.`);
      return true;
    } catch {
      toast.error('Could not cancel. Please contact support.');
      return false;
    }
  }, []);

  return { startCheckout, cancelSubscription, isStarting, isConfirming };
}