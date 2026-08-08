import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { collection, query, where, onSnapshot, getDocs, doc, addDoc, deleteDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { firestore, storage } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { Plus, X, Upload, Wallet, Receipt, ExternalLink, Building2, Trash2 } from 'lucide-react';
import imageCompression from 'browser-image-compression';

export default function FeesMyExpenses() {
  const { currentUser } = useAuth();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState(null);
  
  // Wallet info
  const [staffId, setStaffId] = useState(null);
  const [staffName, setStaffName] = useState('');
  const [walletBalance, setWalletBalance] = useState(0);

  // Modal
  const [isLogExpenseOpen, setIsLogExpenseOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    if (location.state?.action === 'add') {
      setIsLogExpenseOpen(true);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const [expenseData, setExpenseData] = useState({ 
    source: 'office', // 'office' or 'staff_wallet'
    amount: '', 
    category: 'Office Supplies', 
    details: '', 
    date: new Date().toISOString().split('T')[0], 
    file: null 
  });
  const [isSaving, setIsSaving] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const email = currentUser?.email?.toLowerCase();

  useEffect(() => {
    if (!email) return;

    let unsub = null;

    const init = async () => {
      try {
        // 1. Find Staff ID
        const staffQuery = query(collection(firestore, 'staff'), where('email', '==', email));
        const staffSnap = await getDocs(staffQuery);
        let currentStaffId = null;
        let currentStaffName = 'Me';
        
        if (!staffSnap.empty) {
          currentStaffId = staffSnap.docs[0].id;
          currentStaffName = staffSnap.docs[0].data().name || 'Me';
          setStaffId(currentStaffId);
          setStaffName(currentStaffName);
          // Wallet is implicitly enabled for all staff
        }

        // 3. Listen to Expenses
        const q1 = query(
          collection(firestore, 'expenses'),
          where('createdBy', '==', email)
        );
        const q2 = query(
          collection(firestore, 'expenses'),
          where('staffEmail', '==', email)
        );

        const processSnapshots = async () => {
          const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
          const expMap = new Map();
          
          const processDoc = (doc) => {
            const data = doc.data();
            // We only care about spends and fundings relevant to us
            if (data.type === 'spend' || data.type === 'funding' || data.type === 'expense') {
              expMap.set(doc.id, { id: doc.id, ...data });
            }
          };

          snap1.forEach(processDoc);
          snap2.forEach(processDoc);

          const allExp = Array.from(expMap.values()).sort((a, b) => {
            const tA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp || 0);
            const tB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp || 0);
            return tB - tA;
          });

          setExpenses(allExp);

          // Calculate wallet balance
          let bal = 0;
          allExp.forEach(e => {
            if (e.staffId === currentStaffId && e.source === 'staff_wallet') {
               if (e.type === 'funding') bal += (e.amount || 0);
               else bal -= (e.amount || 0);
            }
          });
          setWalletBalance(bal);
        };

        // For simplicity, we just listen to q1 if it's the primary query, but since we have two queries
        // and firestore doesn't natively support OR across fields easily without multiple listeners,
        // we'll set up listeners for both.
        
        let txns = new Map();
        let q1Loaded = false;
        let q2Loaded = false;

        const updateTxns = () => {
          if (!q1Loaded || !q2Loaded) return;
          const allExp = Array.from(txns.values()).sort((a, b) => {
            const tA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp || 0);
            const tB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp || 0);
            return tB - tA;
          });
          setExpenses(allExp);
          
          let bal = 0;
          allExp.forEach(e => {
            if (e.staffEmail === email && e.source === 'staff_wallet') {
               if (e.type === 'funding') bal += (e.amount || 0);
               else bal -= (e.amount || 0);
            }
          });
          setWalletBalance(bal);
          setLoading(false);
        };

        const u1 = onSnapshot(q1, (snap) => {
          snap.docChanges().forEach(change => {
            if (change.type === 'removed') txns.delete(change.doc.id);
            else {
              const d = change.doc.data();
              if (d.type === 'spend' || d.type === 'funding' || d.type === 'expense') {
                txns.set(change.doc.id, { id: change.doc.id, ...d });
              }
            }
          });
          q1Loaded = true;
          updateTxns();
        }, (err) => {
          console.error("Error in q1 snapshot:", err);
          setAccessError("Your permissions to view expenses were revoked.");
          setLoading(false);
        });

        const u2 = onSnapshot(q2, (snap) => {
          snap.docChanges().forEach(change => {
            if (change.type === 'removed') txns.delete(change.doc.id);
            else {
              const d = change.doc.data();
              if (d.type === 'spend' || d.type === 'funding' || d.type === 'expense') {
                txns.set(change.doc.id, { id: change.doc.id, ...d });
              }
            }
          });
          q2Loaded = true;
          updateTxns();
        }, (err) => {
          console.error("Error in q2 snapshot:", err);
          setAccessError("Your permissions to view expenses were revoked.");
          setLoading(false);
        });

        unsub = () => { u1(); u2(); };

      } catch (err) {
        console.error("Error fetching my expenses:", err);
        setLoading(false);
      }
    };

    init();

    return () => {
      if (unsub) unsub();
    };
  }, [email]);

  const handleLogExpense = async (e) => {
    e.preventDefault();
    if (!expenseData.amount || isSaving) return;
    setIsSaving(true);
    
    try {
      let attachmentUrl = '';
      if (expenseData.file) {
        let fileToUpload = expenseData.file;
        if (fileToUpload.type.startsWith('image/')) {
          try {
            const options = { maxSizeMB: 0.2, maxWidthOrHeight: 1280, useWebWorker: true };
            fileToUpload = await imageCompression(fileToUpload, options);
          } catch (e) {
            console.warn('Compression failed, using original', e);
          }
        }
        const storageRef = ref(storage, `expenses/${email}/${Date.now()}_${fileToUpload.name}`);
        const snap = await uploadBytes(storageRef, fileToUpload, { cacheControl: 'public,max-age=31536000' });
        attachmentUrl = await getDownloadURL(snap.ref);
      }
      
      const today = new Date().toISOString().split('T')[0];
      const isToday = expenseData.date === today;
      
      const payload = {
        source: expenseData.source,
        type: expenseData.source === 'office' ? 'spend' : 'expense',
        amount: parseFloat(expenseData.amount),
        category: expenseData.category,
        details: expenseData.details,
        attachmentUrl: attachmentUrl,
        createdBy: email,
        timestamp: isToday ? serverTimestamp() : new Date(expenseData.date)
      };

      if (expenseData.source === 'staff_wallet') {
        payload.staffId = staffId;
        payload.staffEmail = email;
      }
      
      await addDoc(collection(firestore, 'expenses'), payload);
      
      setIsLogExpenseOpen(false);
      setExpenseData({ source: 'office', amount: '', category: 'Office Supplies', details: '', date: today, file: null });
    } catch (err) {
      console.error("Error logging expense:", err);
      alert("Failed to log expense. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteExpense = async (expense) => {
    if (!window.confirm(`Delete this expense${expense.details ? ` ("${expense.details}")` : ''}? This cannot be undone.`)) return;
    setDeletingId(expense.id);
    try {
      await deleteDoc(doc(firestore, 'expenses', expense.id));
    } catch (err) {
      console.error("Error deleting expense:", err);
      alert("Failed to delete expense. You can only delete expenses you personally logged.");
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
      </div>
    );
  }

  if (accessError) {
    return (
      <div className="flex justify-center items-center h-64 bg-brand-card rounded-xl border border-brand-card-border">
        <div className="text-center">
          <X className="mx-auto text-red-500 mb-4" size={48} />
          <h3 className="text-xl font-bold text-brand-text mb-2">Access Denied</h3>
          <p className="text-brand-text-dim">{accessError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-brand-card border border-brand-card-border p-6 rounded-2xl flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center shrink-0">
            <Receipt size={28} />
          </div>
          <div>
            <h3 className="text-brand-text-dim text-sm font-bold uppercase tracking-wider mb-1">My Logs</h3>
            <p className="text-2xl font-black text-brand-text">{expenses.length} <span className="text-sm font-medium text-brand-text-dim">entries</span></p>
          </div>
        </div>

          <div className="bg-brand-card border border-brand-card-border p-6 rounded-2xl flex items-center gap-4">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center shrink-0 ${walletBalance >= 0 ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'}`}>
              <Wallet size={28} />
            </div>
            <div>
              <h3 className="text-brand-text-dim text-sm font-bold uppercase tracking-wider mb-1">My Wallet Balance</h3>
              <p className={`text-2xl font-black ${walletBalance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-brand-primary'}`}>
                ₹{walletBalance.toLocaleString()}
              </p>
            </div>
          </div>
      </div>

      <div className="bg-brand-card border border-brand-card-border rounded-xl shadow-sm overflow-hidden relative">
        <div className="p-4 md:p-6 border-b border-brand-card-border flex justify-between items-center bg-black/5 dark:bg-white/5">
          <h2 className="text-lg font-bold text-brand-text">Expense History</h2>
          <button 
            onClick={() => setIsLogExpenseOpen(true)}
            className="flex justify-center items-center gap-2 bg-brand-primary hover:bg-brand-primary-hover text-white px-4 py-2 rounded-md font-medium text-sm transition-colors shadow-sm"
          >
            <Plus size={16} /> Log Expense
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-brand-text-dim">
            <thead className="text-xs uppercase bg-brand-bg text-brand-text border-b border-brand-card-border">
              <tr>
                <th className="px-6 py-4">Details</th>
                <th className="px-6 py-4">Category</th>
                <th className="px-6 py-4">Source</th>
                <th className="px-6 py-4 text-right">Amount</th>
                <th className="px-6 py-4 text-right">Date</th>
                <th className="px-6 py-4 text-right">Receipt</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {expenses.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-8 text-center text-brand-text-dim">
                    You haven't logged any expenses yet.
                  </td>
                </tr>
              ) : (
                expenses.map((t) => {
                  const isCredit = t.type === 'funding';
                  const dateStr = t.timestamp?.toDate ? t.timestamp.toDate().toLocaleDateString() : new Date(t.timestamp || Date.now()).toLocaleDateString();
                  
                  return (
                    <tr key={t.id} className="border-b border-brand-card-border hover:bg-black/5 dark:bg-white/5 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-brand-text">{t.details || t.category}</div>
                        {t.source === 'office' && <div className="text-xs opacity-70">Logged for School</div>}
                      </td>
                      <td className="px-6 py-4 font-medium uppercase text-xs tracking-wider">
                        <span className="bg-black/5 dark:bg-white/5 px-2.5 py-1 rounded-md border border-brand-card-border">
                          {t.category || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {t.source === 'staff_wallet' ? (
                          <span className="inline-flex items-center gap-1.5 text-brand-secondary font-medium"><Wallet size={14}/> Wallet</span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-brand-primary font-medium"><Building2 size={14}/> School</span>
                        )}
                      </td>
                      <td className={`px-6 py-4 text-right font-bold ${isCredit ? 'text-green-500' : 'text-brand-text'}`}>
                        {isCredit ? '+' : '-'} ₹{(t.amount || 0).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {dateStr}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {t.attachmentUrl ? (
                          <button 
                            onClick={() => setPreviewImage({ url: t.attachmentUrl, title: t.details || t.category || 'Receipt' })}
                            className="inline-flex justify-end items-center gap-1 text-blue-600 dark:text-blue-400 hover:text-blue-700 font-medium transition-colors"
                          >
                            <ExternalLink size={14} /> View
                          </button>
                        ) : '-'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {t.createdBy === email ? (
                          <button
                            onClick={() => handleDeleteExpense(t)}
                            disabled={deletingId === t.id}
                            title="Delete this expense"
                            className="inline-flex justify-end items-center gap-1 text-red-500 hover:text-red-600 font-medium transition-colors disabled:opacity-50"
                          >
                            {deletingId === t.id ? (
                              <div className="w-3.5 h-3.5 border-2 border-red-300 border-t-red-500 rounded-full animate-spin" />
                            ) : (
                              <Trash2 size={14} />
                            )}
                          </button>
                        ) : '-'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Log Expense Modal */}
      {isLogExpenseOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-brand-bg rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-brand-card-border">
            <div className="px-6 py-4 border-b border-brand-card-border flex justify-between items-center bg-brand-card">
              <h2 className="text-lg font-bold text-brand-text">Log New Expense</h2>
              <button onClick={() => setIsLogExpenseOpen(false)} className="text-brand-text-dim hover:text-brand-text transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleLogExpense} className="p-6">
              <div className="space-y-4">

                <div>
                  <label className="block text-sm font-bold text-brand-text mb-1.5">Payment Source *</label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className={`border rounded-lg p-3 cursor-pointer transition-colors flex flex-col gap-1 items-start ${expenseData.source === 'office' ? 'border-brand-primary bg-brand-primary/10' : 'border-brand-card-border hover:bg-black/5'}`}>
                      <input type="radio" name="source" value="office" className="hidden" checked={expenseData.source === 'office'} onChange={() => setExpenseData({...expenseData, source: 'office'})} />
                      <Building2 size={18} className={expenseData.source === 'office' ? 'text-brand-primary' : 'text-brand-text-dim'} />
                      <span className="font-bold text-brand-text text-sm mt-1">School Acct</span>
                      <span className="text-[10px] text-brand-text-dim leading-tight">Paid by school. Logged by {staffName}.</span>
                    </label>
                    <label className={`border rounded-lg p-3 cursor-pointer transition-colors flex flex-col gap-1 items-start ${expenseData.source === 'staff_wallet' ? 'border-brand-secondary bg-brand-secondary/10' : 'border-brand-card-border hover:bg-black/5'}`}>
                      <input type="radio" name="source" value="staff_wallet" className="hidden" checked={expenseData.source === 'staff_wallet'} onChange={() => setExpenseData({...expenseData, source: 'staff_wallet'})} />
                      <Wallet size={18} className={expenseData.source === 'staff_wallet' ? 'text-brand-secondary' : 'text-brand-text-dim'} />
                      <span className="font-bold text-brand-text text-sm mt-1">My Wallet</span>
                      <span className="text-[10px] text-brand-text-dim leading-tight">Paid from my wallet balance.</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-brand-text mb-1.5">Amount (₹) *</label>
                  <input
                    type="number" required min="1"
                    className="w-full bg-black/5 dark:bg-white/5 border border-brand-card-border rounded-lg px-4 py-2 text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
                    value={expenseData.amount} onChange={(e) => setExpenseData({...expenseData, amount: e.target.value})}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-bold text-brand-text mb-1.5">Category *</label>
                  <select
                    required
                    className="w-full bg-black/5 dark:bg-white/5 border border-brand-card-border rounded-lg px-4 py-2 text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
                    value={expenseData.category} onChange={(e) => setExpenseData({...expenseData, category: e.target.value})}
                  >
                    <option value="Office Supplies">Office Supplies</option>
                    <option value="Maintenance">Maintenance & Repairs</option>
                    <option value="Utility Bills">Utility Bills</option>
                    <option value="Transport">Transport & Travel</option>
                    <option value="Meals/Entertainment">Meals/Entertainment</option>
                    <option value="Refreshments">Refreshments</option>
                    <option value="Miscellaneous">Miscellaneous</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-bold text-brand-text mb-1.5">Details/Note</label>
                  <input
                    type="text" placeholder="Brief description of expense"
                    className="w-full bg-black/5 dark:bg-white/5 border border-brand-card-border rounded-lg px-4 py-2 text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
                    value={expenseData.details} onChange={(e) => setExpenseData({...expenseData, details: e.target.value})}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-bold text-brand-text mb-1.5">Date</label>
                  <input
                    type="date" required
                    className="w-full bg-black/5 dark:bg-white/5 border border-brand-card-border rounded-lg px-4 py-2 text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
                    value={expenseData.date} onChange={(e) => setExpenseData({...expenseData, date: e.target.value})}
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-brand-text mb-1.5">Attach Bill/Receipt (Optional)</label>
                  <div className="border-2 border-dashed border-brand-card-border rounded-lg p-4 flex flex-col items-center justify-center bg-black/5 dark:bg-white/5 relative hover:bg-black/10 transition-colors cursor-pointer">
                    <input 
                      type="file" accept="image/*,.pdf" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      onChange={(e) => setExpenseData({...expenseData, file: e.target.files[0]})}
                    />
                    <Upload size={24} className="text-brand-text-dim mb-2" />
                    <span className="text-sm font-medium text-brand-text text-center">
                      {expenseData.file ? expenseData.file.name : "Click or drag to upload receipt"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex justify-end gap-3">
                <button
                  type="button" onClick={() => setIsLogExpenseOpen(false)}
                  className="px-5 py-2 rounded-lg font-bold text-brand-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg font-bold bg-brand-primary text-white hover:bg-brand-primary-hover transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Saving...</>
                  ) : "Confirm & Log"}
                </button>
              </div>
            </form>
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
            <img 
              src={previewImage.url} 
              alt={previewImage.title}
              className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl"
            />
            <div className="mt-6 flex flex-col items-center gap-4 z-20">
              <h3 className="text-white font-bold text-lg">{previewImage.title}</h3>
              <a 
                href={previewImage.url} target="_blank" rel="noreferrer"
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
