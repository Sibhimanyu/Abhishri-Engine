import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, getDocs, collectionGroup } from 'firebase/firestore';
import { firestore } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { Search, ArrowUpRight, ArrowDownRight, ExternalLink, X, RefreshCw, Briefcase } from 'lucide-react';

export default function FeesTransactions() {
  const { currentUser, userData } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all', 'incoming', 'outgoing', 'wallet'
  
  const [previewImage, setPreviewImage] = useState(null);
  const [isImageLoading, setIsImageLoading] = useState(true);
  const [previewTx, setPreviewTx] = useState(null);

  const isAdmin = userData?.isAdmin;
  const feesPerms = userData?.permissions?.fees_accounting || {};
  
  const canViewIncoming = isAdmin || feesPerms === true || feesPerms.view === true || feesPerms.ledger === true;
  const canViewAllExp = isAdmin || feesPerms === true || feesPerms.exp_all === true;

  useEffect(() => {
    if (previewImage) setIsImageLoading(true);
  }, [previewImage]);

  useEffect(() => {
    if (!currentUser) return;

    let unsubTransactions = null;
    let unsubExpenses = null;

    const staffMap = {};
    const staffEmailMap = {};
    const studentMap = {};
    const allTxns = new Map();

    const updateState = () => {
      const sorted = Array.from(allTxns.values()).sort((a, b) => {
        const tA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp || 0);
        const tB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp || 0);
        return tB - tA;
      });
      setTransactions(sorted);
    };

    const init = async () => {
      setLoading(true);
      try {
        const [staffSnap, studentSnap] = await Promise.all([
          getDocs(collection(firestore, 'staff')),
          getDocs(collection(firestore, 'students'))
        ]);

        staffSnap.forEach(s => {
          const data = s.data();
          const fullName = data.name || `${data.firstName || ''} ${data.lastName || ''}`.trim();
          staffMap[s.id] = fullName;
          if (data.email) staffEmailMap[data.email.toLowerCase()] = fullName;
        });

        studentSnap.forEach(s => {
          const data = s.data();
          studentMap[s.id] = data.name || `${data.firstName || ''} ${data.lastName || ''}`.trim();
        });

        // Fee collection listener
        if (canViewIncoming) {

        unsubTransactions = onSnapshot(collectionGroup(firestore, 'transactions'), (snap) => {
            snap.docChanges().forEach(change => {
              if (change.type === 'removed') {
                allTxns.delete(`in-${change.doc.id}`);
              } else {
                const data = change.doc.data();
                if (data.type === 'discount' || (data.type === 'void' && (data.category === 'Discount' || data.category === 'Fee Concession'))) {
                  return; // Exclude discounts from the global financial ledger
                }
                allTxns.set(`in-${change.doc.id}`, {
                  ...data,
                  id: `in-${change.doc.id}`,
                  masterType: 'incoming',
                  studentName: data.studentName || studentMap[data.studentId] || `Anonymous (ID: ${data.studentId || '?'})`
                });
              }
            });
            updateState();
          });
        }

        // Expenses / Wallets listener
        if (canViewAllExp) {
          unsubExpenses = onSnapshot(collection(firestore, 'expenses'), (snap) => {
            snap.docChanges().forEach(change => {
              if (change.type === 'removed') {
                allTxns.delete(`out-${change.doc.id}`);
              } else {
                const data = change.doc.data();
                if (data.type === 'spend' || data.type === 'funding' || data.type === 'expense') {
                  const isWallet = data.source === 'staff_wallet';
                  let staffName = 'Staff Member';
                  if (data.staffId && staffMap[data.staffId]) {
                    staffName = staffMap[data.staffId];
                  } else if (data.staffEmail && staffEmailMap[data.staffEmail.toLowerCase()]) {
                    staffName = staffEmailMap[data.staffEmail.toLowerCase()];
                  } else if (data.createdBy && staffEmailMap[data.createdBy.toLowerCase()]) {
                    staffName = staffEmailMap[data.createdBy.toLowerCase()];
                  } else if (data.staffEmail) {
                    staffName = data.staffEmail.split('@')[0];
                  } else if (data.createdBy) {
                    staffName = data.createdBy.split('@')[0];
                  }

                  allTxns.set(`out-${change.doc.id}`, {
                    ...data,
                    id: `out-${change.doc.id}`,
                    masterType: 'outgoing',
                    isWallet: isWallet,
                    staffName: staffName
                  });
                }
              }
            });
            updateState();
          });
        }
        
        setLoading(false);
      } catch (err) {
        console.error("Error initializing transactions view:", err);
        setLoading(false);
      }
    };

    init();

    return () => {
      if (unsubTransactions) unsubTransactions();
      if (unsubExpenses) unsubExpenses();
    };
  }, [currentUser, canViewIncoming, canViewAllExp]);

  if (loading && transactions.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
      </div>
    );
  }

  const filtered = transactions.filter(t => {
    if (filterType === 'incoming' && t.masterType !== 'incoming') return false;
    if (filterType === 'outgoing' && t.masterType !== 'outgoing') return false;
    if (filterType === 'wallet' && !t.isWallet) return false;

    const searchTarget = (
      (t.studentName || '') + ' ' + 
      (t.staffName || '') + ' ' + 
      (t.description || '') + ' ' + 
      (t.method || '') + ' ' + 
      (t.category || '') + ' ' + 
      (t.createdBy || '')
    ).toLowerCase();
    
    return searchTarget.includes(searchTerm.toLowerCase());
  });

  return (
    <div className="bg-brand-card border border-brand-card-border rounded-xl shadow-sm overflow-hidden relative">
      <div className="p-4 md:p-6 border-b border-brand-card-border flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-black/5 dark:bg-white/5">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-dim" size={16} />
            <input 
              type="text" placeholder="Search transactions..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-brand-bg border border-brand-card-border rounded-md py-1.5 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary w-full text-brand-text"
            />
          </div>
          <div className="flex bg-black/5 dark:bg-white/5 rounded-lg p-1 self-start">
            <button onClick={() => setFilterType('all')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${filterType === 'all' ? 'bg-white dark:bg-brand-card shadow-sm text-brand-text' : 'text-brand-text-dim hover:text-brand-text'}`}>All</button>
            <button onClick={() => setFilterType('incoming')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${filterType === 'incoming' ? 'bg-white dark:bg-brand-card shadow-sm text-brand-text' : 'text-brand-text-dim hover:text-brand-text'}`}>Credit</button>
            <button onClick={() => setFilterType('outgoing')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${filterType === 'outgoing' ? 'bg-white dark:bg-brand-card shadow-sm text-brand-text' : 'text-brand-text-dim hover:text-brand-text'}`}>Debit</button>
            <button onClick={() => setFilterType('wallet')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${filterType === 'wallet' ? 'bg-white dark:bg-brand-card shadow-sm text-brand-text' : 'text-brand-text-dim hover:text-brand-text'}`}>Wallets</button>
          </div>
        </div>
        <div className="text-sm font-medium text-brand-text-dim">
          {filtered.length} entries found
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-brand-text-dim">
          <thead className="text-xs uppercase bg-brand-bg text-brand-text border-b border-brand-card-border">
            <tr>
              <th className="px-6 py-4">Details</th>
              <th className="px-6 py-4">Category</th>
              <th className="px-6 py-4 text-right">Amount</th>
              <th className="px-6 py-4 text-right">Date</th>
              <th className="px-6 py-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan="5" className="px-6 py-12 text-center text-brand-text-dim">
                  No transactions found.
                </td>
              </tr>
            ) : (
              filtered.map((t) => {
                let Icon, iconColor, amountColor, title, subtitle, badgeText, amountPrefix;
                
                if (t.isWallet) {
                  const isFunding = t.type === 'funding';
                  Icon = isFunding ? RefreshCw : Briefcase;
                  iconColor = isFunding ? 'text-blue-500 bg-blue-100 dark:bg-blue-900/30' : 'text-orange-500 bg-orange-100 dark:bg-orange-900/30';
                  amountColor = isFunding ? 'text-blue-500 dark:text-blue-400' : 'text-orange-500 dark:text-orange-400';
                  title = `Wallet: ${t.staffName || 'Staff'}`;
                  subtitle = t.details || t.description || (isFunding ? 'Internal Transfer' : 'Wallet Expense');
                  badgeText = isFunding ? 'WALLET FUND' : 'WALLET SPEND';
                  amountPrefix = isFunding ? '+' : '-'; 
                } else if (t.masterType === 'incoming') {
                  const isVoid = t.type === 'void' || t.amount < 0;
                  const isDiscount = t.type === 'discount';
                  Icon = isVoid ? ArrowUpRight : (isDiscount ? ArrowUpRight : ArrowDownRight);
                  iconColor = isVoid ? 'text-red-500 bg-red-100 dark:bg-red-900/30' : (isDiscount ? 'text-purple-500 bg-purple-100 dark:bg-purple-900/30' : 'text-green-600 bg-green-100 dark:bg-green-900/30');
                  amountColor = isVoid ? 'text-red-500' : (isDiscount ? 'text-purple-500' : 'text-green-600 dark:text-green-400');
                  title = t.studentName || 'Anonymous Payment';
                  subtitle = t.description || (isDiscount ? 'Fee Concession' : 'General Fees');
                  badgeText = isVoid ? 'VOIDED' : (isDiscount ? 'DISCOUNT' : (t.method || 'Cash'));
                  amountPrefix = isVoid ? '' : (isDiscount ? '-' : '+');
                } else {
                  Icon = ArrowUpRight;
                  iconColor = 'text-red-600 bg-red-100 dark:bg-red-900/30';
                  amountColor = 'text-brand-text';
                  title = t.category || 'General Expense';
                  subtitle = t.description || t.details || t.createdBy || '-';
                  badgeText = 'SCHOOL EXP';
                  amountPrefix = '-';
                }

                const dateStr = t.timestamp?.toDate ? t.timestamp.toDate().toLocaleDateString() : new Date(t.timestamp || Date.now()).toLocaleDateString();

                return (
                  <tr key={t.id} className="border-b border-brand-card-border hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${iconColor}`}>
                        <Icon size={16} />
                      </div>
                      <div>
                        <div className="font-medium text-brand-text capitalize">{title}</div>
                        <div className="text-xs opacity-70">{subtitle}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-medium uppercase text-xs tracking-wider">
                      <span className="bg-black/5 dark:bg-white/5 px-2.5 py-1 rounded-md border border-brand-card-border">
                        {badgeText || '-'}
                      </span>
                    </td>
                    <td className={`px-6 py-4 text-right font-bold ${amountColor}`}>
                      {amountPrefix} ₹ {(Math.abs(t.amount || 0)).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {dateStr}
                    </td>
                    <td className="px-6 py-4 text-right flex items-center justify-end gap-3">
                      {t.masterType === 'incoming' && (
                        <button onClick={() => setPreviewTx(t)} className="inline-flex items-center gap-1 text-brand-primary hover:text-brand-primary-hover font-medium transition-colors">
                          <ExternalLink size={14} /> View
                        </button>
                      )}
                      {t.masterType === 'outgoing' && (t.attachmentUrl || t.fileUrl) && (
                        <button 
                          onClick={() => setPreviewImage({ url: t.attachmentUrl || t.fileUrl, title: t.category || 'Bill' })}
                          className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:text-blue-700 font-medium transition-colors"
                        >
                          <ExternalLink size={14} /> Bill
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Image Preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex flex-col items-center justify-center p-4">
          <div className="absolute top-4 right-4 md:top-6 md:right-6">
            <button onClick={() => setPreviewImage(null)} className="bg-white/10 hover:bg-white/20 text-white rounded-full p-2 backdrop-blur-md transition-colors">
              <X size={24} />
            </button>
          </div>
          <div className="max-w-4xl max-h-[80vh] w-full flex flex-col items-center relative min-h-[200px]">
            {isImageLoading && (
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <div className="animate-spin rounded-full h-10 w-10 border-4 border-white/20 border-t-white"></div>
              </div>
            )}
            <img 
              src={previewImage.url} 
              alt={previewImage.title}
              onLoad={() => setIsImageLoading(false)}
              className={`max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl transition-opacity duration-300 ${isImageLoading ? 'opacity-0' : 'opacity-100'}`}
            />
            <div className="mt-6 flex flex-col items-center gap-4 z-20">
              <h3 className="text-white font-bold text-lg">{previewImage.title}</h3>
              <a href={previewImage.url} target="_blank" rel="noreferrer" className="bg-white text-black px-6 py-2 rounded-full font-bold text-sm hover:bg-gray-200 transition-colors">
                Open Original
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Transaction Details Modal */}
      {previewTx && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-brand-card rounded-2xl w-full max-w-md shadow-2xl border border-brand-card-border overflow-hidden">
            <div className="p-6 border-b border-brand-card-border flex justify-between items-center bg-black/5 dark:bg-white/5">
              <h3 className="font-bold text-brand-text text-lg">Transaction Receipt</h3>
              <button onClick={() => setPreviewTx(null)} className="text-brand-text-dim hover:text-brand-text">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4 text-sm">
              <div className="flex justify-between border-b border-brand-card-border pb-2">
                <span className="text-brand-text-dim font-medium">Student Name:</span>
                <span className="font-bold text-brand-text">{previewTx.studentName || 'Unknown'}</span>
              </div>
              <div className="flex justify-between border-b border-brand-card-border pb-2">
                <span className="text-brand-text-dim font-medium">Amount:</span>
                <span className="font-black text-green-500">₹{(Math.abs(previewTx.amount || 0)).toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-b border-brand-card-border pb-2">
                <span className="text-brand-text-dim font-medium">Date:</span>
                <span className="font-bold text-brand-text">{previewTx.timestamp?.toDate ? previewTx.timestamp.toDate().toLocaleString() : new Date(previewTx.timestamp).toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-b border-brand-card-border pb-2">
                <span className="text-brand-text-dim font-medium">Method:</span>
                <span className="font-bold text-brand-text">{previewTx.method || 'Cash'}</span>
              </div>
              <div className="flex justify-between border-b border-brand-card-border pb-2">
                <span className="text-brand-text-dim font-medium">Description:</span>
                <span className="font-bold text-brand-text text-right max-w-[200px] break-words">{previewTx.description || previewTx.category || 'Fee Payment'}</span>
              </div>
              <div className="pt-4 flex justify-center">
                <button onClick={() => setPreviewTx(null)} className="bg-brand-primary text-white px-6 py-2 rounded-xl font-bold hover:bg-brand-primary-hover transition-colors">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
