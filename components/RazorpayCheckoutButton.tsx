'use client';

import { useState } from 'react';
import Script from 'next/script';
import { Loader2, Download, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';

interface CheckoutButtonProps {
  planId: string;
  baseAmount: number;
  userId: string;
  email: string;
  name?: string;
  onSuccess?: () => void;
}

export function RazorpayCheckoutButton({ planId, baseAmount, userId, email, name = 'Workspace Owner', onSuccess }: CheckoutButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);

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
        amount: orderData.amount, // from your backend (base + 18% tax in cents/paise)
        currency: orderData.currency,
        name: 'Forge',
        description: `${planId.toUpperCase()} Workspace Upgrade`,
        order_id: orderData.orderId,
        handler: async function (response: any) {
          toast.loading('Cryptographically verifying transaction...', { id: toastId });
          
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
              toast.success('Workspace upgraded successfully.', { id: toastId });
              setIsSuccess(true);
              
              // 4. Capture the invoice URL returned from your backend
              if (verifyData.invoiceUrl) {
                setInvoiceUrl(verifyData.invoiceUrl);
              }

              if (onSuccess) onSuccess();
            } else {
              throw new Error(verifyData.error || 'Cryptographic verification failed.');
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
        modal: {
          // Gracefully handle if the user closes the pop-up without paying
          ondismiss: function() {
            setIsLoading(false);
            toast.dismiss(toastId);
          }
        }
      };

      const rzp = new (window as any).Razorpay(options);
      
      rzp.on('payment.failed', function (response: any) {
        toast.error(`Transaction declined: ${response.error.description}`, { id: toastId });
        setIsLoading(false);
      });

      rzp.open();
    } catch (error: any) {
      toast.error(error.message || 'Unable to establish secure connection.', { id: toastId });
      setIsLoading(false);
    }
  };

  // ========================================================================
  // SUCCESS STATE UI (Renders after successful payment & verification)
  // ========================================================================
  if (isSuccess) {
    return (
      <div className="flex flex-col gap-3 mt-4 w-full">
        <div className="w-full bg-green-50 text-green-700 font-medium text-[14px] py-3 rounded-xl border border-green-200 flex items-center justify-center gap-2">
          <CheckCircle className="w-5 h-5" />
          Upgrade Complete
        </div>
        
        {invoiceUrl && (
          <a 
            href={invoiceUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="w-full bg-white text-gray-900 border border-gray-200 font-medium text-[14px] py-3 rounded-xl hover:bg-gray-50 transition flex items-center justify-center gap-2 shadow-sm"
          >
            <Download className="w-4 h-4" />
            Download Receipt
          </a>
        )}
      </div>
    );
  }

  // ========================================================================
  // DEFAULT CHECKOUT UI
  // ========================================================================
  return (
    <>
      {/* Required Razorpay Script */}
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      
      <button
        onClick={handlePayment}
        disabled={isLoading}
        className="w-full mt-4 bg-gray-900 text-white font-medium text-[14px] py-3 rounded-xl hover:bg-gray-800 transition disabled:opacity-70 flex items-center justify-center gap-2 shadow-sm"
      >
        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : `Upgrade to ${planId.toUpperCase()}`}
      </button>
    </>
  );
}