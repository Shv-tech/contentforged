'use client';

import { useState } from 'react';
import { X, Loader2, Download, CheckCircle2, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';

interface CheckoutModalProps {
  planId: string;
  planName: string;
  basePrice: number;
  onClose: () => void;
  onSuccess: () => void;
}

export function CheckoutModal({ planId, planName, basePrice, onClose, onSuccess }: CheckoutModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [orderDetails, setOrderDetails] = useState<any>(null);

  const taxAmount = parseFloat((basePrice * 0.18).toFixed(2));
  const totalAmount = parseFloat((basePrice + taxAmount).toFixed(2));

  // --- PDF INVOICE GENERATOR ---
  const downloadInvoice = () => {
    if (!orderDetails) return;
    
    const doc = new jsPDF();
    
    doc.setFontSize(20);
    doc.text("TAX INVOICE", 14, 22);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text("SHV Groups Pvt Ltd", 14, 30);
    doc.text("New Delhi, India", 14, 35);
    
    doc.text(`Order ID: ${orderDetails.orderId}`, 14, 45);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 50);

    autoTable(doc, {
      startY: 60,
      head: [['Description', 'Amount (USD)']],
      body: [
        [`ContentForge ${planName.toUpperCase()} Plan (Monthly)`, `$${basePrice.toFixed(2)}`],
        ['IGST (18%)', `$${taxAmount.toFixed(2)}`],
      ],
      foot: [['Total Paid', `$${totalAmount.toFixed(2)}`]],
      theme: 'grid',
      headStyles: { fillColor: [17, 24, 39] }, // Gray-900
      footStyles: { fillColor: [243, 244, 246], textColor: [17, 24, 39] }
    });

    doc.save(`ContentForge_Invoice_${orderDetails.orderId}.pdf`);
  };

  const handlePayment = async () => {
    setIsLoading(true);
    try {
      // 1. Generate Order securely on backend
      const res = await fetch('/api/razorpay/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          planId, 
          baseAmount: basePrice,
          email: 'user@example.com', // Get from Auth context
          name: 'Creator'
        }),
      });

      const orderData = await res.json();
      if (!res.ok) throw new Error(orderData.error);
      
      setOrderDetails(orderData);

      // 2. Initialize Razorpay
      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "ContentForge",
        description: `${planName} Subscription`,
        order_id: orderData.orderId,
        handler: function (response: any) {
          setPaymentComplete(true);
          toast.success("Payment verified. Workspace upgraded.");
          onSuccess(); // Triggers global state update
        },
        theme: { color: "#111827" },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', function (response: any) {
        toast.error(`Payment failed: ${response.error.description}`);
      });
      
      rzp.open();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4 font-sans animate-in fade-in">
      <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-[480px] shadow-[0_20px_60px_rgb(0,0,0,0.1)] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gray-50/50">
          <h3 className="text-[18px] font-semibold text-gray-900">Upgrade your workspace</h3>
          {!paymentComplete && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-900 hover:bg-gray-200 p-1.5 rounded-md transition-colors">
              <X className="w-5 h-5"/>
            </button>
          )}
        </div>

        <div className="p-6">
          {paymentComplete ? (
            <div className="text-center py-6 animate-in zoom-in-95">
              <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-[20px] font-bold text-gray-900 mb-2">Payment Successful</h3>
              <p className="text-[14px] text-gray-500 mb-8">A receipt has been sent to your email.</p>
              
              <div className="space-y-3">
                <button onClick={downloadInvoice} className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-900 font-medium text-[14px] py-3 rounded-xl hover:bg-gray-50 transition shadow-sm">
                  <Download className="w-4 h-4" /> Download PDF Invoice
                </button>
                <button onClick={onClose} className="w-full bg-gray-900 text-white font-medium text-[14px] py-3 rounded-xl hover:bg-gray-800 transition shadow-sm">
                  Return to Workspace
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Order Details Breakdown */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-6">
                <div className="text-[13px] font-bold text-gray-900 uppercase tracking-widest mb-4">Order Details</div>
                
                <div className="flex justify-between items-center mb-3 text-[14px] text-gray-600">
                  <span>ContentForge {planName}</span>
                  <span className="font-medium text-gray-900">USD {basePrice.toFixed(2)}</span>
                </div>
                
                <div className="flex justify-between items-center pb-4 border-b border-gray-200 text-[14px] text-gray-600">
                  <span>Tax</span>
                  <span className="font-medium text-gray-900">USD {taxAmount.toFixed(2)}</span>
                </div>

                <div className="flex justify-between items-center pt-4">
                  <span className="font-bold text-[16px] text-gray-900">Total due today</span>
                  <span className="font-bold text-[18px] text-gray-900">USD {totalAmount.toFixed(2)}</span>
                </div>
              </div>

              {/* Auto-renew Notice */}
              <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 flex gap-3 mb-6">
                <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <p className="text-[13px] text-gray-600 leading-relaxed">
                  Your subscription will auto-renew next month. You will be charged <strong>USD {totalAmount.toFixed(2)}</strong> (inclusive of tax). Cancel anytime in settings.
                </p>
              </div>

              {/* Payment Action */}
              <button 
                onClick={handlePayment}
                disabled={isLoading}
                className="w-full bg-gray-900 text-white font-medium text-[15px] py-3.5 rounded-xl hover:bg-gray-800 shadow-[0_4px_14px_rgb(0,0,0,0.1)] transition flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Pay securely with Razorpay'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}