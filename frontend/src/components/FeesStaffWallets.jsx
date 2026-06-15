import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, setDoc, doc, serverTimestamp, deleteDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { firestore, storage } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { Wallet, Search, ArrowUpCircle, ArrowDownCircle, FileText, Upload, X, Trash2, ExternalLink } from 'lucide-react';
import imageCompression from 'browser-image-compression';

export default function FeesStaffWallets() {
  const { userData, currentUser } = useAuth();
  const [staff, setStaff] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modals state
  const [showModal, setShowModal] = useState(null); // 'credit' | 'debit' | 'statement' | null
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [walletAmount, setWalletAmount] = useState('');
  const [walletCategory, setWalletCategory] = useState('');
  const [walletDetails, setWalletDetails] = useState('');
  const [walletFile, setWalletFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [isImageLoading, setIsImageLoading] = useState(true);

  const isAdmin = userData?.isAdmin;
  const feesPerms = userData?.permissions?.fees_accounting || {};
  const canViewAll = isAdmin || feesPerms.exp_all;
  const currentUserEmail = currentUser?.email?.toLowerCase();


  useEffect(() => {
    if (previewImage) setIsImageLoading(true);
  }, [previewImage]);

  useEffect(() => {
    async function fetchData() {
      try {
        // 1. Fetch Staff
        const staffList = [];
        const staffSnap = await getDocs(collection(firestore, 'staff'));
        staffSnap.forEach(doc => staffList.push({ id: doc.id, ...doc.data() }));
        
        // 2. Wallet Configs removed since all staff have wallets

        // 3. Fetch Wallet Transactions
        let expList = [];
        const expQuery = query(
          collection(firestore, 'expenses'),
          where('source', '==', 'staff_wallet')
        );
        const expSnap = await getDocs(expQuery);
        expSnap.forEach(doc => expList.push({ id: doc.id, ...doc.data() }));
        
        setStaff(staffList);
        setExpenses(expList);
      } catch (err) {
        console.error("Error fetching staff wallets:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const getStaffWalletTotals = (staffId) => {
    const sObj = staff.find(s => s.id === staffId);
    const sEmail = (sObj?.email || '').toLowerCase();
    let credits = 0;
    let debits = 0;
    expenses.forEach(e => {
      if (e.staffId === staffId || (sEmail && e.staffEmail === sEmail)) {
        if (e.type === 'funding') credits += (e.amount || 0);
        else debits += (e.amount || 0);
      }
    });
    return { credits, debits, balance: credits - debits };
  };

  const hasStaffWallet = (staffId) => true;

  const handleWalletAction = async (type) => {
    if (!selectedStaff || !walletAmount || !walletCategory) return;
    setIsProcessing(true);
    try {
      let fileUrl = '';
      if (type === 'debit' && walletFile) {
        let fileToUpload = walletFile;
        if (fileToUpload.type.startsWith('image/')) {
          try {
            const options = { maxSizeMB: 0.2, maxWidthOrHeight: 1280, useWebWorker: true };
            fileToUpload = await imageCompression(fileToUpload, options);
          } catch (e) {
            console.warn('Compression failed, using original', e);
          }
        }
        const fileRef = ref(storage, `fees/staff_wallet/${Date.now()}_${fileToUpload.name}`);
        const snapshot = await uploadBytes(fileRef, fileToUpload, { cacheControl: 'public,max-age=31536000' });
        fileUrl = await getDownloadURL(snapshot.ref);
      }

      const sObj = staff.find(s => s.id === selectedStaff);
      const newTx = {
        source: 'staff_wallet',
        type: type === 'credit' ? 'funding' : 'expense',
        staffId: selectedStaff,
        staffEmail: (sObj?.email || '').toLowerCase(),
        amount: parseFloat(walletAmount),
        category: walletCategory,
        details: walletDetails,
        fileUrl,
        createdBy: currentUserEmail,
        timestamp: serverTimestamp()
      };
      
      await addDoc(collection(firestore, 'expenses'), newTx);
      setExpenses([...expenses, { ...newTx, timestamp: new Date() }]);
      closeModal();
    } catch (err) {
      console.error(err);
      alert("Failed to process transaction.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteTx = async (txId) => {
    if (!window.confirm("Are you sure you want to undo/delete this transaction? This will revert the wallet balance.")) return;
    try {
      await deleteDoc(doc(firestore, 'expenses', txId));
      setExpenses(expenses.filter(e => e.id !== txId));
    } catch (err) {
      console.error(err);
      alert("Failed to delete transaction.");
    }
  };

  const filteredStaff = staff.filter(s => {
    return (s.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
           (s.designation || '').toLowerCase().includes(searchTerm.toLowerCase());
  }).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const closeModal = () => {
    setShowModal(null);
    setSelectedStaff(null);
    setWalletAmount('');
    setWalletCategory('');
    setWalletDetails('');
    setWalletFile(null);
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div></div>;
  }

  const statementTxs = selectedStaff && showModal === 'statement' 
    ? expenses.filter(e => {
        const sObj = staff.find(s => s.id === selectedStaff);
        const sEmail = (sObj?.email || '').toLowerCase();
        return e.staffId === selectedStaff || (sEmail && e.staffEmail === sEmail);
      }).sort((a, b) => {
        const d1 = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp);
        const d2 = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp);
        return d2 - d1;
      })
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="bg-brand-card border border-brand-card-border p-4 rounded-xl shadow-sm flex items-center gap-4 min-w-[250px]">
          <div className="w-12 h-12 rounded-full bg-brand-secondary/10 text-brand-secondary flex items-center justify-center">
            <Wallet size={24} />
          </div>
          <div>
            <div className="text-sm font-bold text-brand-text-dim uppercase">Managed Staff Wallets</div>
            <div className="text-2xl font-black text-brand-text">{filteredStaff.length}</div>
          </div>
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-dim" size={16} />
            <input 
              type="text" 
              placeholder="Search staff..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-brand-bg border border-brand-card-border rounded-md py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary text-brand-text"
            />
          </div>
          
        </div>
      </div>

      <div className="bg-brand-card border border-brand-card-border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-brand-text-dim">
            <thead className="text-xs uppercase bg-black/5 dark:bg-white/5 text-brand-text">
              <tr>
                <th className="px-6 py-4">Staff Member</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4">Total Credits</th>
                <th className="px-6 py-4">Total Expenses</th>
                <th className="px-6 py-4">Current Balance</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-brand-text-dim">
                    No staff wallets found.
                  </td>
                </tr>
              ) : (
                filteredStaff.map((s) => {
                  const hasWallet = hasStaffWallet(s.id);
                  const totals = getStaffWalletTotals(s.id);
                  return (
                    <tr key={s.id} className="border-b border-brand-card-border hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 font-bold text-brand-text">
                        {s.name}
                      </td>
                      <td className="px-6 py-4">{s.designation || 'N/A'}</td>
                      <td className="px-6 py-4 text-green-600 dark:text-green-500 font-medium">₹{totals.credits.toLocaleString('en-IN')}</td>
                      <td className="px-6 py-4 text-brand-primary font-medium">₹{totals.debits.toLocaleString('en-IN')}</td>
                      <td className="px-6 py-4">
                          <span className={`font-black ${totals.balance >= 0 ? 'text-green-600 dark:text-green-500' : 'text-brand-primary'}`}>
                            ₹{totals.balance.toLocaleString('en-IN')}
                          </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                              <button onClick={() => { setSelectedStaff(s.id); setShowModal('credit'); }} className="p-1.5 text-brand-secondary hover:bg-brand-secondary/10 rounded-md transition-colors" title="Add Credit">
                                <ArrowUpCircle size={18} />
                              </button>
                              <button onClick={() => { setSelectedStaff(s.id); setShowModal('debit'); }} className="p-1.5 text-brand-primary hover:bg-brand-primary/10 rounded-md transition-colors" title="Log Expense">
                                <ArrowDownCircle size={18} />
                              </button>
                              <button onClick={() => { setSelectedStaff(s.id); setShowModal('statement'); }} className="p-1.5 text-brand-text-dim hover:text-brand-text hover:bg-black/5 dark:hover:bg-white/5 rounded-md transition-colors" title="View Statement">
                                <FileText size={18} />
                              </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-brand-bg rounded-2xl w-full max-w-md shadow-2xl border border-brand-card-border overflow-hidden">
            {showModal === 'statement' ? (
              <>
                <div className="p-6 border-b border-brand-card-border flex justify-between items-center bg-black/5 dark:bg-white/5">
                  <div>
                    <h3 className="font-bold text-brand-text text-lg">Wallet Statement</h3>
                    <p className="text-sm text-brand-text-dim">{staff.find(s => s.id === selectedStaff)?.name}</p>
                  </div>
                  <button onClick={closeModal} className="text-brand-text-dim hover:text-brand-text text-2xl leading-none">&times;</button>
                </div>
                <div className="p-6 overflow-y-auto max-h-[60vh]">
                  {statementTxs.length === 0 ? <p className="text-center text-brand-text-dim py-8">No transactions found.</p> : (
                    <div className="space-y-4">
                      {statementTxs.map(tx => {
                        const date = tx.timestamp?.toDate ? tx.timestamp.toDate() : new Date(tx.timestamp);
                        const isCredit = tx.type === 'funding';
                        return (
                          <div key={tx.id} className="flex justify-between items-center border-b border-brand-card-border pb-3">
                            <div className="flex-1 pr-4">
                              <div className="font-bold text-sm text-brand-text mb-1">{tx.details || tx.category}</div>
                              <div className="flex items-center gap-2">
                                <span className="bg-black/5 dark:bg-white/5 text-brand-text-dim px-2 py-0.5 rounded text-xs font-medium border border-brand-card-border">
                                  {tx.category || 'General'}
                                </span>
                                <span className="text-xs text-brand-text-dim">{date.toLocaleDateString()}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className={`font-black whitespace-nowrap ${isCredit ? 'text-green-500' : 'text-brand-primary'}`}>
                                {isCredit ? '+' : '-'} ₹{(tx.amount || 0).toLocaleString()}
                              </div>
                              {tx.attachmentUrl && (
                                <button 
                                  onClick={() => setPreviewImage({ url: tx.attachmentUrl, title: tx.details || tx.category || 'Bill' })}
                                  className="text-brand-primary hover:text-brand-primary-hover transition-colors p-1 flex items-center gap-1 text-xs font-bold" 
                                  title="View Bill"
                                >
                                  <ExternalLink size={14} /> Bill
                                </button>
                              )}
                              {(isAdmin || userData?.permissions?.fees_accounting?.trans_delete) && (
                                <button onClick={() => handleDeleteTx(tx.id)} className="text-brand-text-dim hover:text-red-500 transition-colors p-1" title="Delete Transaction">
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="px-6 py-4 border-b border-brand-card-border bg-brand-card flex justify-between items-center">
                  <h2 className="text-lg font-bold text-brand-text flex items-center gap-2">
                    {showModal === 'credit' ? <ArrowUpCircle className="text-brand-secondary" /> : <ArrowDownCircle className="text-brand-primary" />}
                    {showModal === 'credit' ? 'Credit Staff Wallet' : 'Log Wallet Expense'}
                  </h2>
                  <button onClick={closeModal} className="text-brand-text-dim hover:text-brand-text">
                    <X size={20} />
                  </button>
                </div>
                
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-brand-text-dim uppercase mb-1.5">Amount</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-dim font-medium">₹</span>
                      <input type="number" value={walletAmount} onChange={e => setWalletAmount(e.target.value)} className="w-full bg-black/5 dark:bg-white/5 border border-brand-card-border rounded-lg pl-8 pr-4 py-2 text-brand-text focus:outline-none focus:border-brand-primary" placeholder="0.00" />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold text-brand-text-dim uppercase mb-1.5">Category</label>
                    <select value={walletCategory} onChange={e => setWalletCategory(e.target.value)} className="w-full bg-black/5 dark:bg-white/5 border border-brand-card-border rounded-lg px-4 py-2 text-brand-text focus:outline-none focus:border-brand-primary">
                      <option value="">Select Category</option>
                      {showModal === 'credit' ? (
                        <><option value="Monthly Advance">Monthly Advance</option><option value="Reimbursement">Reimbursement</option><option value="Special Allowance">Special Allowance</option></>
                      ) : (
                        <><option value="Transport/Travel">Transport/Travel</option><option value="Office Supplies">Office Supplies</option><option value="Meals/Entertainment">Meals/Entertainment</option><option value="Miscellaneous">Miscellaneous</option></>
                      )}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold text-brand-text-dim uppercase mb-1.5">Details</label>
                    <textarea rows={2} value={walletDetails} onChange={e => setWalletDetails(e.target.value)} className="w-full bg-black/5 dark:bg-white/5 border border-brand-card-border rounded-lg px-4 py-2 text-brand-text focus:outline-none focus:border-brand-primary resize-none" placeholder="Enter transaction details..." />
                  </div>
                  
                  {showModal === 'debit' && (
                    <div>
                      <label className="block text-xs font-bold text-brand-text-dim uppercase mb-1.5">Bill / Receipt</label>
                      <label className="border-2 border-dashed border-brand-card-border hover:border-brand-primary/50 rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer transition-colors bg-black/5 dark:bg-white/5">
                        {walletFile ? (
                          <div className="text-center">
                            <FileText size={24} className="mx-auto text-brand-primary mb-2" />
                            <span className="text-sm font-medium text-brand-text break-all">{walletFile.name}</span>
                          </div>
                        ) : (
                          <>
                            <Upload size={24} className="text-brand-text-dim mb-2" />
                            <span className="text-sm font-medium text-brand-text">Click to upload bill image</span>
                          </>
                        )}
                        <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => e.target.files[0] && setWalletFile(e.target.files[0])} />
                      </label>
                    </div>
                  )}
                </div>
                
                <div className="px-6 py-4 bg-brand-card border-t border-brand-card-border flex justify-end gap-3">
                  <button onClick={closeModal} className="px-4 py-2 rounded-lg font-medium text-brand-text-dim hover:text-brand-text transition-colors">Cancel</button>
                  <button onClick={() => handleWalletAction(showModal)} disabled={isProcessing || !walletAmount || !walletCategory} className="px-4 py-2 rounded-lg font-bold bg-brand-primary text-white hover:bg-brand-primary-hover transition-colors shadow-sm disabled:opacity-50">
                    {isProcessing ? 'Processing...' : `Confirm ${showModal === 'credit' ? 'Credit' : 'Expense'}`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex flex-col items-center justify-center p-4">
          <div className="absolute top-4 right-4 md:top-6 md:right-6">
            <button 
              onClick={() => setPreviewImage(null)}
              className="bg-white/10 hover:bg-white/20 text-white rounded-full p-2 backdrop-blur-md transition-colors"
            >
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
              loading="lazy"
            />
            <div className="mt-6 flex flex-col items-center gap-4 z-20">
              <h3 className="text-white font-bold text-lg">{previewImage.title}</h3>
              <a 
                href={previewImage.url} 
                target="_blank" 
                rel="noreferrer"
                className="bg-white text-black px-6 py-2 rounded-full font-bold text-sm hover:bg-gray-200 transition-colors"
              >
                Open Original
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
