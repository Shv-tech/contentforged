'use client';

import { useCallback } from 'react';
import toast from 'react-hot-toast';

declare global {
  interface Window {
    Razorpay: any;
  }
}

interface PayArgs {
  tierId: string;
  userId: string;
  email: string;
  onSuccess: () => void;
}

export function useRazorpay() {
  const loadScript = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      if (typeof window !== 'undefined' && window.Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }, []);

  const pay = useCallback(
    async ({ tierId, userId, email, onSuccess }: PayArgs) => {
      const loaded = await loadScript();
      if (!loaded) {
        toast.error('Payment gateway failed to load. Refresh and try again.');
        return;
      }

      try {
        const res = await fetch('/api/razorpay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tier_id: tierId, user_id: userId }),
        });

        if (!res.ok) throw new Error('Could not create payment order');

        const { order_id, amount, currency } = await res.json();

        const options = {
          key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
          amount,
          currency,
          name: 'ContentForge',
          description: `ContentForge ${tierId} Plan`,
          order_id,
          handler: async (response: any) => {
            const verifyRes = await fetch('/api/razorpay/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                tier_id: tierId,
                user_id: userId,
              }),
            });

            if (verifyRes.ok) {
              toast.success('Payment successful. Your credits are ready.');
              onSuccess();
            } else {
              toast.error('Payment verification failed. Contact support.');
            }
          },
          prefill: { email },
          theme: { color: '#0071e3' },
          modal: {
            ondismiss: () => {
              toast('Payment cancelled.', { icon: '↩' });
            },
          },
        };

        const rzp = new window.Razorpay(options);
        rzp.open();
      } catch (err: any) {
        toast.error(err.message || 'Payment failed');
      }
    },
    [loadScript]
  );

  return { pay };
}
