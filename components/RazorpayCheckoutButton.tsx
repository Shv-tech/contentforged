'use client';

import { useState } from 'react';
import Script from 'next/script';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface CheckoutButtonProps {
  planId: string;
  baseAmount: number;
  userId: string;
  email: string;
  name?: string;
  onSuccess?: () => void;
}

export function RazorpayCheckoutButton({ planId, baseAmount, userId, email, name = 'Creator', onSuccess }: CheckoutButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handlePayment = async () => {
    setIsLoading(true);
    const toastId = toast.loading('Initializing secure checkout...');

    try {
      // 1. Call your existing Create Order endpoint
      const orderRes = await fetch('/api/razorpay/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, baseAmount, email, name }),
      });

      const orderData = await orderRes.json();
      if (!orderRes.ok) throw new Error(orderData.error);

      // 2. Initialize Razorpay Modal
      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: orderData.amount, // from your backend (base + 18% tax in cents)
        currency: orderData.currency,
        name: 'ContentForge',
        description: `${planId.toUpperCase()} Subscription`,
        order_id: orderData.orderId,
        handler: async function (response: any) {
          toast.loading('Verifying payment...', { id: toastId });
          
          try {
            // 3. Call your existing Verify endpoint
            const verifyRes = await fetch('/api/razorpay/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                tier_id: planId,
                user_id: userId,
              }),
            });

            const verifyData = await verifyRes.json();

            if (verifyRes.ok && verifyData.success) {
              toast.success('Payment verified successfully!', { id: toastId });
              if (onSuccess) onSuccess();
            } else {
              throw new Error(verifyData.error || 'Verification failed.');
            }
          } catch (verifyError: any) {
            toast.error(verifyError.message || 'Payment verification failed.', { id: toastId });
          }
        },
        prefill: {
          name: name,
          email: email,
        },
        theme: {
          color: '#111827', // UI Match: Gray-900
        },
      };

      const rzp = new (window as any).Razorpay(options);
      
      rzp.on('payment.failed', function (response: any) {
        toast.error(`Payment failed: ${response.error.description}`, { id: toastId });
      });

      rzp.open();
    } catch (error: any) {
      toast.error(error.message || 'Unable to initiate checkout.', { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Required Razorpay Script */}
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      
      <button
        onClick={handlePayment}
        disabled={isLoading}
        className="w-full bg-gray-900 text-white font-medium text-[14px] py-3 rounded-xl hover:bg-gray-800 transition disabled:opacity-70 flex items-center justify-center gap-2"
      >
        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : `Unlock ${planId.toUpperCase()}`}
      </button>
    </>
  );
}