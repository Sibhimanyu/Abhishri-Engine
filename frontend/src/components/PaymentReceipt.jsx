import React from 'react';
import { Printer, X } from 'lucide-react';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function PaymentReceipt({ receiptTransaction, student, wing, components, onClose, onPrint }) {
  if (!receiptTransaction || !student) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div id="printable-receipt" className="bg-white text-black border border-gray-200 rounded-none md:rounded-2xl shadow-2xl w-full max-w-2xl my-8">
        <div className="px-8 py-6 print:hidden flex justify-between items-center border-b border-gray-200 bg-gray-50 md:rounded-t-2xl">
          <h2 className="text-lg font-bold text-gray-800">Payment Receipt</h2>
          <div className="flex gap-3">
            <button 
              onClick={onPrint || (() => window.print())}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors text-sm"
            >
              <Printer size={16} /> Print
            </button>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-800 transition-colors bg-gray-200 hover:bg-gray-300 p-2 rounded-lg">
              <X size={20} />
            </button>
          </div>
        </div>
        
        <div className="p-8 md:p-12 bg-white">
          {/* Receipt Header */}
          <div className="flex justify-between items-start border-b-2 border-gray-100 pb-8 mb-8">
            <div>
              <h1 className="text-3xl font-black text-gray-900 tracking-tight">ABHISHRI ACADEMY</h1>
              <p className="text-sm text-gray-500 font-medium mt-1">Official Fee Receipt</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Receipt No</p>
              <p className="font-mono text-gray-900 font-bold">{receiptTransaction.id.slice(-8).toUpperCase()}</p>
            </div>
          </div>

          {/* Receipt Details */}
          <div className="grid grid-cols-2 gap-8 mb-10">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Received From</p>
              <p className="font-bold text-gray-900 text-lg">{student.name}</p>
              <p className="text-sm text-gray-500 mt-1">Student ID: {student.id.slice(-6).toUpperCase()}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Date</p>
              <p className="font-bold text-gray-900">
                {(() => {
                  const d = receiptTransaction.timestamp?.toDate ? receiptTransaction.timestamp.toDate() : new Date(receiptTransaction.timestamp || 0);
                  return d.toLocaleString('en-IN', { dateStyle: 'medium' });
                })()}
              </p>
              <div className="mt-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Payment Method</p>
                <p className="inline-block px-3 py-1 bg-gray-100 rounded-md text-sm font-bold text-gray-800">
                  {receiptTransaction.method || 'Cash'}
                </p>
              </div>
            </div>
          </div>

          {/* Payment Breakdown */}
          <div className="mb-10">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-900">
                  <th className="py-3 text-xs font-bold text-gray-900 uppercase tracking-wider">Description</th>
                  <th className="py-3 text-xs font-bold text-gray-900 uppercase tracking-wider text-right">Amount (INR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {receiptTransaction.breakdown ? (
                  Object.entries(receiptTransaction.breakdown).map(([k, v]) => {
                    let displayName = k;
                    let uidStr = k;
                    let monthStr = null;
                    
                    const monthRegex = new RegExp(`-(${MONTHS.join('|')})$`, 'i');
                    const monthMatch = uidStr.match(monthRegex);
                    if (monthMatch) {
                      monthStr = monthMatch[1];
                      uidStr = uidStr.replace(monthRegex, '');
                    }
                    
                    const yearRegex = /^(\\d{4})-/;
                    if (uidStr.match(yearRegex)) {
                      uidStr = uidStr.replace(yearRegex, '');
                    }
                    
                    const comp = components?.find(c => c.uid === uidStr || c.name === uidStr);
                    if (comp) {
                      displayName = comp.name + (monthStr ? ` (${monthStr})` : '');
                    } else if (receiptTransaction.breakdownNames && receiptTransaction.breakdownNames[k]) {
                      displayName = receiptTransaction.breakdownNames[k] + (monthStr ? ` (${monthStr})` : '');
                    } else {
                      displayName = `Archived Fee` + (monthStr ? ` (${monthStr})` : '');
                    }
                    
                    return (
                      <tr key={k}>
                        <td className="py-4 text-gray-800 font-medium">{displayName}</td>
                        <td className="py-4 text-gray-900 font-bold text-right">₹{v.toLocaleString('en-IN')}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td className="py-4 text-gray-800 font-medium">{receiptTransaction.description || 'General Fee Payment'}</td>
                    <td className="py-4 text-gray-900 font-bold text-right">₹{receiptTransaction.amount.toLocaleString('en-IN')}</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-900">
                  <td className="py-4 text-right font-bold text-gray-900 uppercase text-sm">Total Paid</td>
                  <td className="py-4 text-right font-black text-2xl text-gray-900">₹{receiptTransaction.amount.toLocaleString('en-IN')}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Footer */}
          <div className="text-center pt-8 border-t-2 border-gray-100 text-gray-500 text-xs">
            <p>This is a computer-generated receipt and does not require a physical signature.</p>
          </div>
        </div>
      </div>
      
      {/* Global Print Styles embedded */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page { margin: 10mm; }
          body { 
            -webkit-print-color-adjust: exact !important; 
            print-color-adjust: exact !important; 
          }
          body * { 
            visibility: hidden; 
          }
          #printable-receipt, #printable-receipt * { 
            visibility: visible; 
          }
          #printable-receipt { 
            position: absolute; 
            left: 0; 
            top: 0; 
            width: 100%; 
            margin: 0 !important; 
            padding: 0 !important; 
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
          }
          /* Ensure header doesn't show up even though it's inside #printable-receipt */
          #printable-receipt .print\\:hidden, #printable-receipt .print\\:hidden * {
            display: none !important;
          }
        }
      `}} />
    </div>
  );
}
