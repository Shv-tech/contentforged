'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { jsPDF } from 'jspdf';
import { Upload, FileText, ArrowRight, X, Settings2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface ImagePreview {
  url: string;
  file: File;
}

export default function JpgToPdfTool() {
  const [images, setImages] = useState<ImagePreview[]>([]);
  const [orientation, setOrientation] = useState<'p' | 'l'>('p'); // Portrait or Landscape
  const [isConverting, setIsConverting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const validFiles = files.filter(f => f.type.includes('image/'));
    if (validFiles.length !== files.length) {
      toast.error('Some files were skipped. Only images (JPG, PNG) are allowed.');
    }

    const newImages = validFiles.map(file => ({
      url: URL.createObjectURL(file),
      file
    }));

    setImages(prev => [...prev, ...newImages]);
    if (fileInputRef.current) fileInputRef.current.value = ''; // Reset input
  };

  const removeImage = (index: number) => {
    setImages(prev => {
      const newArr = [...prev];
      URL.revokeObjectURL(newArr[index].url); // Clean up memory
      newArr.splice(index, 1);
      return newArr;
    });
  };

  const generatePDF = async () => {
    if (images.length === 0) return;
    setIsConverting(true);
    toast.loading('Compiling high-res PDF...', { id: 'pdf' });

    try {
      const pdf = new jsPDF(orientation, 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      for (let i = 0; i < images.length; i++) {
        if (i > 0) pdf.addPage();
        
        // Convert Blob URL to base64 for jsPDF
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(images[i].file);
        });

        const imgProps = pdf.getImageProperties(base64);
        
        // Scale to fit page while maintaining aspect ratio
        const ratio = Math.min(pdfWidth / imgProps.width, pdfHeight / imgProps.height);
        const finalWidth = imgProps.width * ratio;
        const finalHeight = imgProps.height * ratio;
        
        // Center the image
        const x = (pdfWidth - finalWidth) / 2;
        const y = (pdfHeight - finalHeight) / 2;

        pdf.addImage(base64, 'JPEG', x, y, finalWidth, finalHeight);
      }

      pdf.save(`ContentForge_Carousel_${Date.now()}.pdf`);
      toast.success('PDF Downloaded!', { id: 'pdf' });
    } catch (err) {
      toast.error('Failed to generate PDF.', { id: 'pdf' });
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#faf9f5] flex flex-col items-center pt-24 px-6 pb-20 text-[#141413]">
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-md h-[60px] flex items-center justify-between px-8 z-50 border-b border-black/5">
        <Link href="/" className="font-bold text-[18px] tracking-tight">ContentForge Tools</Link>
        <Link href="/signup" className="bg-[#141413] text-white px-4 py-2 rounded-lg text-[13px] font-medium">Unlock Pro</Link>
      </nav>

      <div className="text-center max-w-[600px] mb-10 mt-10">
        <h1 className="text-[36px] font-bold tracking-tight mb-4">Multi-Image to PDF</h1>
        <p className="text-[16px] text-black/60">Upload multiple images, arrange them, and generate a high-res PDF Carousel. Processed 100% locally on your device.</p>
      </div>

      <div className="w-full max-w-[800px] bg-white rounded-2xl p-6 shadow-sm border border-black/5">
        {/* Controls */}
        <div className="flex items-center justify-between mb-6 pb-6 border-b border-black/5">
          <div className="flex items-center gap-4">
            <span className="text-[13px] font-bold flex items-center gap-2"><Settings2 className="w-4 h-4"/> Layout:</span>
            <div className="flex bg-gray-100 p-1 rounded-lg">
              <button onClick={() => setOrientation('p')} className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition ${orientation === 'p' ? 'bg-white shadow-sm' : 'text-black/50'}`}>Portrait</button>
              <button onClick={() => setOrientation('l')} className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition ${orientation === 'l' ? 'bg-white shadow-sm' : 'text-black/50'}`}>Landscape</button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input type="file" multiple accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
            <button onClick={() => fileInputRef.current?.click()} className="bg-gray-100 hover:bg-gray-200 text-black px-4 py-2 rounded-lg text-[13px] font-semibold transition">
              + Add Images
            </button>
            <button onClick={generatePDF} disabled={images.length === 0 || isConverting} className="bg-[#141413] hover:bg-black text-white px-6 py-2 rounded-lg text-[13px] font-semibold transition disabled:opacity-50 flex items-center gap-2">
              {isConverting ? 'Processing...' : 'Download PDF'} <FileText className="w-4 h-4"/>
            </button>
          </div>
        </div>

        {/* Preview Grid */}
        {images.length === 0 ? (
          <div onClick={() => fileInputRef.current?.click()} className="w-full py-20 border-2 border-dashed border-black/10 rounded-xl bg-gray-50 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-100 transition">
            <Upload className="w-10 h-10 text-black/30 mb-4" />
            <p className="text-[14px] font-semibold text-black/60">Drag & Drop or Click to Upload</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {images.map((img, idx) => (
              <div key={idx} className="relative group aspect-[4/5] bg-gray-100 rounded-lg overflow-hidden border border-black/10">
                <img src={img.url} alt={`Preview ${idx}`} className="w-full h-full object-cover" />
                <div className="absolute top-2 right-2 bg-black/50 text-white text-[10px] px-2 py-1 rounded-md backdrop-blur-sm">Page {idx + 1}</div>
                <button onClick={() => removeImage(idx)} className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity backdrop-blur-sm">
                  <Trash2 className="w-6 h-6 text-red-400" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}