import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs, doc, getDoc, setDoc, orderBy, addDoc, serverTimestamp, updateDoc, onSnapshot, limit } from 'firebase/firestore';
import { firestore } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { logAudit } from '../utils/auditLog';
import { localKey, parseISODate, toDate } from '../utils/reportUtils';
import { ArrowLeft, PlusCircle, Printer, AlertTriangle, Layers, ListChecks, Settings2, X, Check, Trash2, Plus, IndianRupee, MessageCircle, Edit2 } from 'lucide-react';
import PaymentReceipt from './PaymentReceipt';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function StudentLedgerView({ studentId, wing, onBack }) {
  const { userData } = useAuth();
  const [student, setStudent] = useState(null);
  const [fees, setFees] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [availablePlans, setAvailablePlans] = useState([]);
  const [configForm, setConfigForm] = useState({ planId: '', startMonth: 5, billingCycle: 12, academicStartYear: new Date().getFullYear(), components: [] });

  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isDiscountOpen, setIsDiscountOpen] = useState(false);
  const [isEditPaymentOpen, setIsEditPaymentOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amount: '', method: 'Cash', description: '', date: '' });
  const [discountForm, setDiscountForm] = useState({ amount: '', description: '', date: '' });
  const [editPaymentForm, setEditPaymentForm] = useState({ id: '', amount: '', method: 'Cash', description: '', date: '', type: '' });
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [selectedDues, setSelectedDues] = useState([]);
  
  const [receiptTransaction, setReceiptTransaction] = useState(null);
  const [txLimit, setTxLimit] = useState(15);
  const isAdmin = userData?.isAdmin;
  const feesPerms = userData?.permissions?.fees_accounting || {};
  const canLogPayment = isAdmin || feesPerms.trans_add;

  useEffect(() => {
    let unsubscribeFees = () => {};
    let unsubscribeTransactions = () => {};

    async function loadLedger() {
      try {
        // Real-time listener for student
        const unsubscribeStudent = onSnapshot(doc(firestore, 'students', studentId), (sDoc) => {
          if (sDoc.exists()) setStudent({ id: sDoc.id, ...sDoc.data() });
        });

        const plansSnap = await getDocs(collection(firestore, 'fee_plans'));
        const plans = [];
        plansSnap.forEach(p => {
          const data = p.data();
          const monthlyTotal = (data.components || []).filter(c => c.frequency === 'monthly').reduce((acc, c) => acc + c.amount, 0);
          const oneTimeTotal = (data.components || []).filter(c => c.frequency === 'onetime').reduce((acc, c) => acc + c.amount, 0);
          const billingCycle = data.billingCycle || 12;
          const total = (monthlyTotal * billingCycle) + oneTimeTotal;
          plans.push({ id: p.id, ...data, total });
        });
        setAvailablePlans(plans);

        // Real-time listener for fees
        unsubscribeFees = onSnapshot(doc(firestore, 'students', studentId, 'fee_ledger', 'plan_details'), (docSnap) => {
          if (docSnap.exists()) setFees(docSnap.data());
          else setFees({ total: 0, paid: 0, components: [], billingCycle: 12, startMonth: 5 });
        });

        // Real-time listener for transactions
        const txQ = query(collection(firestore, 'students', studentId, 'transactions'));
        unsubscribeTransactions = onSnapshot(txQ, (txSnap) => {
          const txs = [];
          txSnap.forEach(d => txs.push({ id: d.id, ...d.data() }));
          txs.sort((a, b) => {
            const da = a.timestamp?.toDate ? a.timestamp.toDate() : (a.timestamp ? new Date(a.timestamp) : new Date());
            const db = b.timestamp?.toDate ? b.timestamp.toDate() : (b.timestamp ? new Date(b.timestamp) : new Date());
            return db - da;
          });
          setTransactions(txs);
        });

      } catch (err) {
        console.error('Ledger error:', err);
      } finally {
        setLoading(false);
      }
    }
    loadLedger();

    return () => {
      unsubscribeFees();
      unsubscribeTransactions();
    };
  }, [studentId, wing, txLimit]);

  const openConfigModal = () => {
    const f = fees || {};
    const comps = JSON.parse(JSON.stringify(f.components || []));
    comps.forEach(c => {
      if (!c.uid) c.uid = `comp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      if (c.baseAmount === undefined) {
        c.baseAmount = c.amount;
      }
    });
    setConfigForm({
      planId: f.planId || '',
      startMonth: f.startMonth !== undefined ? f.startMonth : 5,
      billingCycle: f.billingCycle || 12,
      academicStartYear: f.academicStartYear || new Date().getFullYear(),
      components: comps
    });
    setIsConfigOpen(true);
  };

  const handlePlanSelect = (e) => {
    const pId = e.target.value;
    const plan = availablePlans.find(p => p.id === pId);
    if (plan) {
      setConfigForm({ 
        ...configForm, 
        planId: pId, 
        components: plan.components.map((c, i) => ({
          ...c,
          uid: c.uid || `comp_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 5)}`,
          baseAmount: c.baseAmount !== undefined ? c.baseAmount : c.amount
        }))
      });
    } else {
      setConfigForm({ ...configForm, planId: '', components: [] });
    }
  };

  const handleAddComponent = () => {
    setConfigForm(prev => ({
      ...prev,
      components: [
        ...prev.components,
        { uid: `comp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`, name: '', frequency: 'monthly', amount: 0 }
      ]
    }));
  };

  const handleRemoveComponent = (index) => {
    setConfigForm(prev => ({
      ...prev,
      components: prev.components.filter((c, i) => i !== index)
    }));
  };

  const handleComponentChange = (index, field, value) => {
    setConfigForm(prev => ({
      ...prev,
      components: prev.components.map((c, i) => 
        i === index ? { ...c, [field]: value } : c
      )
    }));
  };

  const handleSaveConfig = async () => {
    setIsSavingConfig(true);
    const cleanComponents = configForm.components
      .filter(c => c.name.trim() !== '')
      .map(c => ({
        uid: c.uid || `comp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        name: c.name,
        amount: parseFloat(c.amount) || 0,
        baseAmount: c.baseAmount !== undefined ? parseFloat(c.baseAmount) : parseFloat(c.amount) || 0,
        frequency: c.frequency || 'monthly',
        type: 'academic'
      }));

    try {
      const docRef = doc(firestore, 'students', studentId, 'fee_ledger', 'plan_details');
      
      const onetime = cleanComponents.filter(c => c.frequency !== 'monthly').reduce((a, b) => a + b.amount, 0);
      const monthly = cleanComponents.filter(c => c.frequency === 'monthly').reduce((a, b) => a + b.amount, 0);
      const annualNetFee = onetime + (monthly * parseInt(configForm.billingCycle));
      
      const baseOnetime = cleanComponents.filter(c => c.frequency !== 'monthly').reduce((a, b) => a + (b.baseAmount !== undefined ? b.baseAmount : b.amount), 0);
      const baseMonthly = cleanComponents.filter(c => c.frequency === 'monthly').reduce((a, b) => a + (b.baseAmount !== undefined ? b.baseAmount : b.amount), 0);
      const annualBaseFee = baseOnetime + (baseMonthly * parseInt(configForm.billingCycle));
      
      const updatedFees = {
        planId: configForm.planId,
        startMonth: parseInt(configForm.startMonth),
        billingCycle: parseInt(configForm.billingCycle),
        academicStartYear: parseInt(configForm.academicStartYear),
        components: cleanComponents,
        total: annualBaseFee,
        annualBaseFee: annualBaseFee,
        annualNetFee: annualNetFee,
        updatedAt: new Date().toISOString()
      };


      await setDoc(docRef, updatedFees, { merge: true });
      
      setFees(prev => ({ ...prev, ...updatedFees }));
      setIsConfigOpen(false);
    } catch (err) {
      console.error(err);
      alert('Failed to save fee configuration.');
    } finally {
      setIsSavingConfig(false);
    }
  };



  const getComponentKey = (c, month = null, academicYear = null) => {
    const yearPrefix = academicYear ? `${academicYear}-` : '';
    const id = c.uid || c.name;
    return month ? `${yearPrefix}${id}-${month}` : `${yearPrefix}${id}`;
  };

  const isRequirementPaid = (r, paymentsDict, academicStartYear) => {
    if (!r || r.effectiveAmount <= 0) return true;

    const mLong = r.month;
    const id = r.uid || r.name;
    const primaryKey = academicStartYear ? getComponentKey(r, mLong, academicStartYear) : (mLong ? `${id}-${mLong}` : id);

    const paid = paymentsDict[primaryKey] || 0;
    return paid >= r.effectiveAmount;
  };

  const f = fees || {};
  const components = f.components || [];
  const compPayments = f.componentPayments || {};

  const now = new Date();
  const startMonth = f.startMonth !== undefined ? f.startMonth : 5;
  const academicStartYear = f.academicStartYear !== undefined ? f.academicStartYear : ((now.getMonth() < startMonth) ? now.getFullYear() - 1 : now.getFullYear());
  const isLegacyRecord = f.academicStartYear === undefined;
  const monthsPassed = (now.getFullYear() - academicStartYear) * 12 + (now.getMonth() - startMonth);
  const installmentsExpected = Math.min(f.billingCycle || 12, Math.max(1, monthsPassed + 1));

  const monthlyTotal = components.filter(c => c.frequency === 'monthly').reduce((a, b) => a + b.amount, 0);
  const oneTimeTotal = components.filter(c => c.frequency !== 'monthly').reduce((a, b) => a + b.amount, 0);
  const expectedToDate = oneTimeTotal + (monthlyTotal * installmentsExpected);

  const effectiveRequirements = useMemo(() => {
    const allReqs = [];
    components.filter(c => (c.frequency || '').toLowerCase() !== 'monthly' && c.amount >= 0).forEach(c => {
      allReqs.push({ uid: c.uid, key: c.uid || c.name, name: c.name, baseAmount: c.baseAmount !== undefined ? c.baseAmount : c.amount, amount: c.amount, frequency: 'onetime', month: null });
    });
    for (let i = 0; i < (f.billingCycle || 12); i++) {
      const mIdx = (startMonth + i) % 12;
      const mName = MONTHS[mIdx];
      components.filter(c => (c.frequency || '').toLowerCase() === 'monthly').forEach(c => {
        allReqs.push({
          uid: c.uid, key: c.uid ? `${c.uid}-${mName}` : `${c.name}-${mName}`, name: c.name, baseAmount: c.baseAmount !== undefined ? c.baseAmount : c.amount, amount: c.amount, frequency: 'monthly', month: mName, relativeIdx: i
        });
      });
    }

    const totalDiscount = components.filter(c => (c.frequency || '').toLowerCase() !== 'monthly' && c.amount < 0)
      .reduce((acc, c) => acc + Math.abs(c.amount), 0);
    let remainingDiscount = totalDiscount;
    return allReqs.map(req => {
      const deduction = Math.min(req.amount, remainingDiscount);
      remainingDiscount -= deduction;
      const structDiscount = Math.max(0, req.baseAmount - req.amount);
      return { ...req, effectiveAmount: req.amount - deduction, appliedDiscount: deduction, structuralDiscount: structDiscount };
    });
  }, [components, f.billingCycle, startMonth]);

  // We no longer use Hybrid Allocation on the frontend. The backend correctly computes and stores this in componentPayments.
  const reallocatedPayments = compPayments;

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
    </div>
  );

  if (!student) return <div className="p-8 text-center text-brand-text-dim">Student not found.</div>;

  const totalAppliedDiscount = effectiveRequirements.reduce((acc, r) => acc + (r.appliedDiscount || 0), 0);
  const lifetimeStructuralDiscount = effectiveRequirements.reduce((acc, r) => acc + (r.structuralDiscount || 0), 0);
  
  // Realized is strictly cash paid
  const realizedToDate = f.paid || 0;
  
  const totalEffectiveExpectedToDate = effectiveRequirements
    .filter(r => (r.frequency || '').toLowerCase() !== 'monthly' || (r.relativeIdx !== undefined && r.relativeIdx < installmentsExpected))
    .reduce((acc, r) => acc + r.effectiveAmount, 0);

  const currentDuesToDisplay = Math.max(0, totalEffectiveExpectedToDate - (f.paid || 0) - (f.discounted || 0));
  
  const displayedDiscountTotal = (f.discounted || 0) + lifetimeStructuralDiscount + totalAppliedDiscount;

  const getMonthStatus = (mIdx) => {
    const mName = MONTHS[mIdx];
    const reqs = effectiveRequirements.filter(r => r.month === mName);
    if (reqs.length === 0) return 'excluded';
    const isFullyPaid = reqs.every(r => isRequirementPaid(r, reallocatedPayments, academicStartYear, isLegacyRecord));
    if (isFullyPaid) return 'covered';
    const reqIdx = reqs[0].relativeIdx;
    if (reqIdx !== undefined && reqIdx >= installmentsExpected) return 'upcoming';
    return 'pending';
  };

  const oneTimeRequirements = effectiveRequirements.filter(r => (r.frequency || '').toLowerCase() !== 'monthly');
  const oneTimePaid = oneTimeRequirements.every(r => isRequirementPaid(r, reallocatedPayments, academicStartYear, isLegacyRecord));
  const oneTimeStatus = oneTimePaid ? 'covered' : 'pending';

  const months = [];
  const monthStatuses = [];
  for (let i = 0; i < 12; i++) {
    const mIdx = (startMonth + i) % 12;
    months.push(MONTHS[mIdx]);
    monthStatuses.push(getMonthStatus(mIdx));
  }

  let firstUnpaidRelativeIdx = 12;
  for (let i = 0; i < 12; i++) {
    if (monthStatuses[i] === 'pending') { firstUnpaidRelativeIdx = i; break; }
  }

  const targetRelativeIdx = (firstUnpaidRelativeIdx < 12) ? firstUnpaidRelativeIdx : Math.max(0, installmentsExpected - 1);
  const targetMonthName = MONTHS[(startMonth + targetRelativeIdx) % 12];
  const currentStatus = monthStatuses[targetRelativeIdx];

  const isConfigured = (f.components && f.components.length > 0) || f.total > 0;

  let displayStatusName = `${targetMonthName} Status`;
  let displayStatusValue = 'PAID', displayStatusColor = 'text-green-500', displayStatusBorder = 'border-green-500';

  if (!isConfigured) {
    displayStatusName = 'Setup Status';
    displayStatusValue = 'MISSING'; displayStatusColor = 'text-brand-text-dim'; displayStatusBorder = 'border-black/10 dark:border-white/10';
  } else if (!oneTimePaid) {
    displayStatusName = 'Base Fees';
    displayStatusValue = 'PENDING'; displayStatusColor = 'text-red-500'; displayStatusBorder = 'border-red-500';
  } else if (currentStatus === 'pending') {
    displayStatusValue = 'PENDING'; displayStatusColor = 'text-red-500'; displayStatusBorder = 'border-red-500';
  } else if (currentStatus === 'excluded') {
    displayStatusValue = 'NOT INCLUDED'; displayStatusColor = 'text-brand-text-dim'; displayStatusBorder = 'border-black/10 dark:border-white/10';
  } else if (currentDuesToDisplay > 0) {
    displayStatusValue = 'DUE'; displayStatusColor = 'text-red-500'; displayStatusBorder = 'border-red-500';
  } else if (currentStatus === 'upcoming') {
    displayStatusValue = 'UPCOMING'; displayStatusColor = 'text-brand-text-dim'; displayStatusBorder = 'border-black/20 dark:border-white/20';
  }

  // Net Balance uses Effective Expected (which already subtracts structural discount).
  // We explicitly subtract manual discounts from the Expected to get an Adjusted Expected,
  // then compare that to cash paid.
  const adjustedEffectiveExpectedToDate = Math.max(0, totalEffectiveExpectedToDate - (f.discounted || 0));
  const netBalanceToDate = realizedToDate - adjustedEffectiveExpectedToDate;

  // Total Fees displayed
  const annualBaseFee = effectiveRequirements.reduce((acc, r) => acc + r.baseAmount, 0);
  const annualNetFee = effectiveRequirements.reduce((acc, r) => acc + r.effectiveAmount, 0);
  const annualAdjustedExpected = Math.max(0, annualNetFee - (f.discounted || 0));
  const annualRemaining = Math.max(0, annualAdjustedExpected - realizedToDate);

  let standingStatus = 'CLEAR', standingColor = 'text-green-500';
  if (currentDuesToDisplay > 0) {
    standingStatus = `DUE: ₹${currentDuesToDisplay.toLocaleString('en-IN')}`;
    standingColor = 'text-red-500';
  } else if (netBalanceToDate > 0) {
    standingStatus = `AHEAD: ₹${netBalanceToDate.toLocaleString('en-IN')}`;
    standingColor = 'text-green-500';
  }

  const overdueItems = [];
  if (currentDuesToDisplay > 0) {
    effectiveRequirements.forEach(r => {
      const isExpected = (r.frequency || '').toLowerCase() !== 'monthly' || (r.relativeIdx !== undefined && r.relativeIdx < installmentsExpected);
      if (!isExpected) return;

      if (!isRequirementPaid(r, reallocatedPayments, academicStartYear)) {
        const mLong = r.month;
        const id = r.uid || r.name;
        const primaryKey = academicStartYear ? getComponentKey(r, mLong, academicStartYear) : (mLong ? `${id}-${mLong}` : id);
        
        const paid = reallocatedPayments[primaryKey] || 0;
        overdueItems.push({ name: r.name, detail: r.month, due: r.effectiveAmount - paid, targetKey: primaryKey, req: r });
      }
    });
  }

  const getStyleClasses = (status) => {
    if (status === 'covered') return 'bg-green-500 text-white font-bold border-transparent';
    if (status === 'pending') return 'bg-transparent text-red-500 font-bold border-2 border-red-500';
    if (status === 'upcoming') return 'bg-black/5 dark:bg-white/5 text-brand-text-dim border border-black/10 dark:border-white/10';
    if (status === 'excluded') return 'bg-transparent text-brand-text-dim/30 border border-dashed border-black/10 dark:border-white/10 opacity-50';
    return 'bg-black/5 dark:bg-white/5 text-brand-text-dim border border-black/5 dark:border-white/5';
  };

  const handleVoidTransaction = async (tx) => {
    if (tx.isVoided || tx.type === 'void') return;
    const reason = window.prompt(`Are you sure you want to void this transaction of ₹${tx.amount.toLocaleString()}?\n\nPlease enter a reason:`);
    if (reason === null) return;
    
    try {
      const vAmt = -Math.abs(tx.amount);
      
      const breakdown = {};
      if (tx.breakdown) {
         Object.entries(tx.breakdown).forEach(([k,v]) => {
            breakdown[k] = -Math.abs(v);
         });
      }

      const txRef = doc(collection(firestore, 'students', studentId, 'transactions'));
      await setDoc(txRef, {
        studentId: studentId,
        studentName: student.name || `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Unknown',
        amount: vAmt,
        method: tx.method,
        description: `VOID: ${tx.description || 'Fee Payment'} (${reason || 'No reason provided'})`,
        category: tx.category || 'General Fees',
        type: 'void',
        breakdown: breakdown,
        breakdownNames: tx.breakdownNames || {},
        voidRefId: tx.id,
        timestamp: serverTimestamp(),
        addedBy: userData?.email || 'Unknown'
      });

      // Update original transaction to mark it as voided
      await updateDoc(doc(firestore, 'students', studentId, 'transactions', tx.id), {
        isVoided: true
      });

      logAudit({
        action: 'TRANSACTION_VOIDED',
        module: 'fees_accounting',
        targetId: tx.id,
        targetName: student.name || `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Unknown',
        performedBy: userData?.email,
        details: { amount: tx.amount, description: tx.description, reason }
      });

      alert("Transaction voided. The balancing entry has been recorded.");
    } catch (err) {
      console.error(err);
      alert("Failed to void transaction.");
    }
  };

  const allocateFunds = (amountToAllocate, currentCompPayments, manualSelectedDues = []) => {
    const breakdown = {};
    const breakdownNames = {};
    let remaining = amountToAllocate;

    if (manualSelectedDues && manualSelectedDues.length > 0) {
      manualSelectedDues.forEach(targetKey => {
         const matchedItem = overdueItems.find(o => o.targetKey === targetKey);
         if (matchedItem && remaining > 0) {
             const allocate = Math.min(remaining, matchedItem.due);
             breakdown[targetKey] = (breakdown[targetKey] || 0) + allocate;
             breakdownNames[targetKey] = matchedItem.name;
             remaining -= allocate;
         }
      });
    } else {
      if (currentDuesToDisplay > 0 && remaining > 0) {
        effectiveRequirements.forEach(r => {
          if (remaining <= 0) return;
          const isExpected = (r.frequency || '').toLowerCase() !== 'monthly' || (r.relativeIdx !== undefined && r.relativeIdx < installmentsExpected);
          if (!isExpected) return;

          if (!isRequirementPaid(r, currentCompPayments, academicStartYear)) {
            const mLong = r.month;
            const id = r.uid || r.name;
            const primaryKey = academicStartYear ? getComponentKey(r, mLong, academicStartYear) : (mLong ? `${id}-${mLong}` : id);
            
            const p = currentCompPayments[primaryKey] || 0;
            const due = r.effectiveAmount - p;
            
            if (due > 0) {
              const allocate = Math.min(remaining, due);
              breakdown[primaryKey] = (breakdown[primaryKey] || 0) + allocate;
              breakdownNames[primaryKey] = r.name;
              remaining -= allocate;
            }
          }
        });
      }

      if (remaining > 0) {
        effectiveRequirements.forEach(r => {
          if (remaining <= 0) return;
          const isExpected = (r.frequency || '').toLowerCase() !== 'monthly' || (r.relativeIdx !== undefined && r.relativeIdx < installmentsExpected);
          if (isExpected) return; 

          if (!isRequirementPaid(r, currentCompPayments, academicStartYear)) {
            const mLong = r.month;
            const id = r.uid || r.name;
            const targetKey = academicStartYear ? getComponentKey(r, mLong, academicStartYear) : (mLong ? `${id}-${mLong}` : id);
            
            const currentP = currentCompPayments[targetKey] || 0;
            const due = r.effectiveAmount - currentP;
            if (due > 0) {
               const allocate = Math.min(remaining, due);
               breakdown[targetKey] = (breakdown[targetKey] || 0) + allocate;
               breakdownNames[targetKey] = r.name;
               remaining -= allocate;
            }
          }
        });
      }
    }

    if (remaining > 0) {
       breakdown['Unallocated'] = remaining;
       breakdownNames['Unallocated'] = 'Unallocated Funds';
    }

    return { breakdown, breakdownNames };
  };
  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    if (!paymentForm.amount || isNaN(paymentForm.amount) || Number(paymentForm.amount) <= 0) {
      return alert("Please enter a valid amount.");
    }

    setIsProcessingPayment(true);
    try {
      const pAmt = Number(paymentForm.amount);

      // Auto-allocator logic for breakdown
      const { breakdown, breakdownNames } = allocateFunds(pAmt, compPayments, selectedDues);

      // We ONLY write to the 'transactions' collection. 
      // The `syncStudentFeeTotals` Cloud Function handles updating the `student_fees` document 
      // via an onSnapshot trigger, and our UI syncs via its own onSnapshot.
      // parseISODate: LOCAL midnight, matching the edit path — new Date('YYYY-MM-DD')
      // parses as UTC midnight and gives the same field two different day conventions.
      const timestampValue = paymentForm.date ? parseISODate(paymentForm.date) : serverTimestamp();

      const paymentName = student.name || `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Unknown';
      const newTxRef = await addDoc(collection(firestore, 'students', studentId, 'transactions'), {
        studentId: studentId,
        studentName: paymentName,
        amount: pAmt,
        method: paymentForm.method,
        description: paymentForm.description || 'Fee Payment',
        category: 'General Fees',
        type: 'incoming',
        breakdown: breakdown,
        breakdownNames: breakdownNames,
        timestamp: timestampValue,
        addedBy: userData?.email || 'Unknown'
      });

      logAudit({
        action: 'PAYMENT_LOGGED',
        module: 'fees_accounting',
        targetId: newTxRef.id,
        targetName: paymentName,
        performedBy: userData?.email,
        details: { amount: pAmt, method: paymentForm.method, description: paymentForm.description }
      });

      setIsPaymentOpen(false);
      setPaymentForm({ amount: '', method: 'Cash', description: '', date: '' });

    } catch (err) {
      console.error(err);
      alert("Failed to process payment.");
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleDiscountSubmit = async (e) => {
    e.preventDefault();
    if (!discountForm.amount || isNaN(discountForm.amount) || Number(discountForm.amount) <= 0) {
      return alert("Please enter a valid amount.");
    }

    setIsProcessingPayment(true);
    try {
      const pAmt = Number(discountForm.amount);
      
      const timestampValue = discountForm.date ? parseISODate(discountForm.date) : serverTimestamp();
      
      const txData = {
        amount: pAmt,
        method: 'Concession',
        description: discountForm.description || 'Fee Concession / Discount',
        date: discountForm.date ? new Date(discountForm.date).toISOString() : new Date().toISOString(),
        timestamp: timestampValue,
        category: 'Discount',
        type: 'discount',
        addedBy: userData?.email || 'Unknown'
      };

      // Auto-allocator logic for breakdown
      const { breakdown, breakdownNames } = allocateFunds(pAmt, compPayments, selectedDues);

      txData.breakdown = breakdown;
      txData.breakdownNames = breakdownNames;

      const newDiscountRef = await addDoc(collection(firestore, 'students', studentId, 'transactions'), {
        ...txData,
        studentId: studentId,
        studentName: student.name,
      });

      logAudit({
        action: 'DISCOUNT_GRANTED',
        module: 'fees_accounting',
        targetId: newDiscountRef.id,
        targetName: student.name,
        performedBy: userData?.email,
        details: { amount: pAmt, description: discountForm.description }
      });

      setIsDiscountOpen(false);
      setDiscountForm({ amount: '', description: '', date: '' });
      setSelectedDues([]);
    } catch (err) {
      console.error(err);
      alert("Failed to grant discount.");
    } finally {
      setIsProcessingPayment(false);
    }
  };

  /**
   * The transaction's calendar day as the edit form's date input shows it — the LOCAL
   * date via localKey, never toISOString() (UTC conversion shifted early-morning IST
   * timestamps back a day). '' when the stored timestamp is missing or unparseable,
   * which is also how the save handler detects a timestamp in need of repair.
   */
  const txDateStr = (tx) => {
    if (!tx?.timestamp) return '';
    const d = toDate(tx.timestamp);
    return d.getTime() > 0 ? localKey(d) : '';
  };

  const handleEditTransaction = (tx) => {
    setEditPaymentForm({
      id: tx.id,
      amount: Math.abs(tx.amount).toString(),
      method: tx.method || 'Cash',
      description: tx.description || '',
      date: txDateStr(tx),
      type: tx.type
    });
    setIsEditPaymentOpen(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editPaymentForm.amount || isNaN(editPaymentForm.amount) || Number(editPaymentForm.amount) <= 0) {
      return alert("Please enter a valid amount.");
    }
    setIsProcessingPayment(true);
    try {
      const pAmt = editPaymentForm.type === 'void' ? -Number(editPaymentForm.amount) : Number(editPaymentForm.amount);

      const { breakdown, breakdownNames } = allocateFunds(Math.abs(pAmt), compPayments, []);
      const originalTx = transactions.find(t => t.id === editPaymentForm.id);

      const update = {
        amount: pAmt,
        method: editPaymentForm.method,
        description: editPaymentForm.description || '',
        breakdown: breakdown,
        breakdownNames: breakdownNames
      };
      // Only rewrite the timestamp when the user actually changed the date. Rewriting it
      // unconditionally destroyed the original time of day on every edit (a description
      // typo fix reshuffled the transaction's position in daily reports). A changed date
      // keeps the original time of day, transplanted onto the chosen LOCAL calendar day.
      // A transaction whose stored timestamp is missing/corrupt gets stamped "now" even
      // on a no-op date — otherwise it could never be repaired and stayed permanently
      // invisible to every date-ranged report (it sorts to epoch 1970).
      const originalDateStr = txDateStr(originalTx);
      if (editPaymentForm.date !== originalDateStr) {
        if (editPaymentForm.date) {
          const d = parseISODate(editPaymentForm.date);
          const orig = toDate(originalTx?.timestamp);
          if (orig.getTime() > 0) d.setHours(orig.getHours(), orig.getMinutes(), orig.getSeconds(), orig.getMilliseconds());
          update.timestamp = d;
        } else {
          update.timestamp = serverTimestamp();
        }
      } else if (!originalDateStr) {
        update.timestamp = serverTimestamp();
      }

      await updateDoc(doc(firestore, 'students', studentId, 'transactions', editPaymentForm.id), update);

      logAudit({
        action: 'TRANSACTION_EDITED',
        module: 'fees_accounting',
        targetId: editPaymentForm.id,
        targetName: student?.name || originalTx?.studentName || 'Unknown',
        performedBy: userData?.email,
        details: {
          amount: { from: originalTx?.amount ?? null, to: pAmt },
          method: { from: originalTx?.method ?? null, to: editPaymentForm.method },
          description: { from: originalTx?.description ?? null, to: editPaymentForm.description },
          date: { from: originalTx?.timestamp ?? null, to: editPaymentForm.date || null }
        }
      });

      setIsEditPaymentOpen(false);
    } catch (err) {
      console.error(err);
      alert("Failed to edit transaction.");
    } finally {
      setIsProcessingPayment(false);
    }
  };

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-2 text-brand-text-dim hover:text-brand-text transition-colors bg-black/5 dark:bg-white/5 px-3 py-1.5 rounded-lg text-sm font-medium w-fit">
        <ArrowLeft size={16} /> Back to Ledger
      </button>

      <div className="bg-brand-card border border-brand-card-border p-6 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-brand-text flex items-center gap-2">
            {student.name}
            <span className="text-[10px] bg-black/5 dark:bg-white/5 text-brand-text-dim px-2 py-0.5 rounded-full font-mono font-medium">
              ID: {student.id.slice(-6).toUpperCase()}
            </span>
          </h1>
          <p className="text-sm font-medium text-brand-text-dim mt-1">{f.billingCycle || 12}-Month Cycle</p>
        </div>
        <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
          <div className="text-left md:text-right">
            <p className="text-[10px] font-bold text-brand-text-dim uppercase tracking-wider mb-1">Standing</p>
            <p className={`font-black text-lg ${standingColor}`}>{standingStatus}</p>
          </div>
          <div className="flex items-center gap-3">
            {(isAdmin || feesPerms.config) && (
              <button 
                onClick={openConfigModal}
                className="bg-black/5 dark:bg-white/5 hover:bg-brand-primary/10 text-brand-text-dim hover:text-brand-primary px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors text-sm"
                title="Configure Fee Plan"
              >
                <Settings2 size={18} /> Config
              </button>
            )}
            {canLogPayment && (
              <div className="flex gap-2">
                <button 
                  onClick={() => { setSelectedDues([]); setIsDiscountOpen(true); }}
                  className="bg-brand-secondary/10 hover:bg-brand-secondary/20 text-brand-secondary px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors text-sm"
                >
                  <PlusCircle size={18} /> Discount
                </button>
                <button 
                  onClick={() => { setSelectedDues([]); setIsPaymentOpen(true); }}
                  className="bg-brand-primary hover:bg-brand-primary-hover text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-sm transition-colors text-sm"
                >
                  <PlusCircle size={18} /> Log Payment
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div className="bg-brand-card border border-brand-card-border p-5 rounded-2xl flex flex-col justify-between">
          <p className="text-[10px] font-bold text-brand-text-dim uppercase tracking-wider mb-2">Base Annual Fee</p>
          <p className="text-2xl font-black text-brand-text">₹{annualBaseFee.toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-brand-card border border-brand-card-border p-5 rounded-2xl flex flex-col justify-between">
          <p className="text-[10px] font-bold text-brand-text-dim uppercase tracking-wider mb-2">Realized to Date</p>
          <p className="text-2xl font-black text-green-500">₹{realizedToDate.toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-brand-secondary/10 border-brand-secondary/20 border rounded-2xl p-5 text-brand-secondary">
          <p className="text-sm font-bold opacity-80 uppercase tracking-widest mb-1">Annual Discount</p>
          <p className="text-2xl font-black text-brand-secondary">₹{displayedDiscountTotal.toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-brand-card border border-brand-card-border p-5 rounded-2xl flex flex-col justify-between">
          <p className="text-[10px] font-bold text-brand-text-dim uppercase tracking-wider mb-2">Annual Remaining</p>
          <p className="text-2xl font-black text-brand-text">₹{annualRemaining.toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-brand-card border border-brand-card-border p-5 rounded-2xl flex flex-col justify-between">
          <p className="text-[10px] font-bold text-brand-text-dim uppercase tracking-wider mb-2">Current Dues</p>
          <p className={`text-2xl font-black ${currentDuesToDisplay > 0 ? 'text-red-500' : 'text-green-500'}`}>₹{currentDuesToDisplay.toLocaleString('en-IN')}</p>
        </div>
        <div className={`bg-brand-card border-b-4 ${displayStatusBorder} p-5 rounded-2xl flex flex-col justify-between`}>
          <p className="text-[10px] font-bold text-brand-text-dim uppercase tracking-wider mb-2">{displayStatusName}</p>
          <p className={`text-2xl font-black ${displayStatusColor}`}>{displayStatusValue}</p>
        </div>
      </div>

      {overdueItems.length > 0 && (
        <div className="bg-red-500/5 border border-red-500/20 border-l-4 border-l-red-500 p-6 rounded-2xl">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-2 text-red-500">
              <AlertTriangle size={20} />
              <h3 className="font-bold text-lg">Action Required: Pending Dues Breakdown</h3>
            </div>
            {canLogPayment && (
              <button 
                onClick={() => {
                  const phone = student.phone || student.fatherPhone || student.motherPhone;
                  if (!phone) return alert("No phone number found for this student.");
                  
                  let msg = `Dear Parent,\nThis is a gentle reminder that fee dues of ₹${currentDuesToDisplay.toLocaleString('en-IN')} are pending for ${student.name}.\n\n`;
                  if (overdueItems.length > 0) {
                     msg += `Pending Breakdown:\n`;
                     overdueItems.forEach(i => {
                        msg += `- ${i.name} ${i.detail ? `(${i.detail})` : ''}: ₹${i.due.toLocaleString('en-IN')}\n`;
                     });
                  }
                  msg += `\nPlease clear the dues at the earliest. Ignore if already paid.\n- Abhishri Academy`;
                  
                  const encodedMsg = encodeURIComponent(msg);
                  const formattedPhone = phone.replace(/\D/g, '').length === 10 ? `91${phone.replace(/\D/g, '')}` : phone.replace(/\D/g, '');
                  window.open(`https://wa.me/${formattedPhone}?text=${encodedMsg}`, '_blank');
                }}
                className="bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366] px-4 py-2 rounded-xl font-bold transition-colors flex items-center gap-2 border border-[#25D366]/20 text-sm shrink-0"
              >
                <MessageCircle size={16} /> Send Reminder
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {overdueItems.map((item, i) => (
              <div key={i} className="bg-brand-bg/50 border border-brand-card-border p-3 rounded-xl">
                <p className="text-xs font-bold text-brand-text-dim uppercase tracking-wider mb-1">{item.name} {item.detail ? `(${item.detail})` : ''}</p>
                <p className="text-lg font-black text-red-500">₹{item.due.toLocaleString('en-IN')}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-brand-card border border-brand-card-border p-6 rounded-2xl">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-bold text-lg text-brand-text">Academic Coverage Timeline</h3>
          <div className="hidden sm:flex items-center gap-4 text-[10px] font-bold text-brand-text-dim uppercase tracking-wider">
            <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-green-500 rounded-sm"></div> Covered</span>
            <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-red-500 rounded-sm"></div> Pending</span>
            <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-brand-text-dim rounded-sm opacity-20"></div> Upcoming</span>
          </div>
        </div>
        <div className="flex gap-2 w-full overflow-x-auto pb-2 custom-scrollbar">
          {oneTimeRequirements.length > 0 && (
            <div className={`shrink-0 w-16 h-12 flex items-center justify-center rounded-lg text-[10px] font-bold tracking-wider uppercase ${getStyleClasses(oneTimeStatus)}`}>SETUP</div>
          )}
          {months.map((m, i) => (
            <div key={i} className={`flex-1 min-w-[3rem] h-12 flex items-center justify-center rounded-lg text-xs font-bold tracking-wider ${getStyleClasses(monthStatuses[i])}`}>
              {m.substring(0, 3).toUpperCase()}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-6 pb-20">
        <div>
          <h3 className="font-bold text-lg text-brand-text flex items-center gap-2 mb-4"><Layers size={20} className="text-brand-secondary" /> Detailed Fee Architecture</h3>
          <div className="bg-brand-card border border-brand-card-border rounded-xl overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-black/5 dark:bg-white/5 border-b border-brand-card-border text-brand-text font-bold text-xs uppercase">
                <tr>
                  <th className="px-6 py-4">Component</th>
                  <th className="px-6 py-4">Term Rate</th>
                  <th className="px-6 py-4 text-center">Cycle</th>
                  <th className="px-6 py-4 text-right">Std Annual</th>
                  <th className="px-6 py-4 text-right">Waiver</th>
                  <th className="px-6 py-4 text-right">Net Payable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-card-border text-brand-text font-medium">
                {components.length > 0 ? components.map((c, i) => {
                  const mult = c.frequency === 'monthly' ? (f.billingCycle || 12) : 1;
                  const stdRate = c.baseAmount !== undefined ? c.baseAmount : (c.originalAmount || c.amount);
                  const stdTotal = stdRate * mult;
                  const netTotal = c.amount * mult;
                  const wav = Math.max(0, stdTotal - netTotal);
                  return (
                    <tr key={i} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold">{c.name}</div>
                        <div className="text-[10px] text-brand-text-dim uppercase mt-1">{c.frequency}</div>
                      </td>
                      <td className="px-6 py-4">₹{stdRate.toLocaleString('en-IN')}</td>
                      <td className="px-6 py-4 text-center">{mult}x</td>
                      <td className="px-6 py-4 text-right">₹{stdTotal.toLocaleString('en-IN')}</td>
                      <td className="px-6 py-4 text-right text-red-500 font-bold">{wav > 0 ? `-₹${wav.toLocaleString('en-IN')}` : '—'}</td>
                      <td className="px-6 py-4 text-right font-black text-brand-primary">₹{netTotal.toLocaleString('en-IN')}</td>
                    </tr>
                  )
                }) : <tr><td colSpan="6" className="text-center py-8 text-brand-text-dim">No components configured.</td></tr>}
              </tbody>
              <tfoot className="bg-black/5 dark:bg-white/5 border-t border-brand-card-border text-brand-text font-bold">
                {components.length > 0 && (() => {
                  const totals = components.reduce((acc, c) => {
                    const mult = c.frequency === 'monthly' ? (f.billingCycle || 12) : 1;
                    const stdRate = c.baseAmount !== undefined ? c.baseAmount : (c.originalAmount || c.amount);
                    const stdTotal = stdRate * mult;
                    const netTotal = c.amount * mult;
                    const wav = Math.max(0, stdTotal - netTotal);
                    return {
                      stdTotal: acc.stdTotal + stdTotal,
                      wav: acc.wav + wav,
                      netTotal: acc.netTotal + netTotal
                    };
                  }, { stdTotal: 0, wav: 0, netTotal: 0 });
                  return (
                    <tr>
                      <td className="px-6 py-4 text-right uppercase tracking-wider text-xs" colSpan="3">Total Annual Architecture</td>
                      <td className="px-6 py-4 text-right text-base">₹{totals.stdTotal.toLocaleString('en-IN')}</td>
                      <td className="px-6 py-4 text-right text-red-500 text-base">{totals.wav > 0 ? `-₹${totals.wav.toLocaleString('en-IN')}` : '—'}</td>
                      <td className="px-6 py-4 text-right font-black text-brand-primary text-base">₹{totals.netTotal.toLocaleString('en-IN')}</td>
                    </tr>
                  );
                })()}
              </tfoot>
            </table>
          </div>
        </div>

        <div>
          <h3 className="font-bold text-lg text-brand-text flex items-center gap-2 mb-4"><ListChecks size={20} className="text-green-500" /> Payment Audit Trail</h3>
          <div className="bg-brand-card border border-brand-card-border rounded-xl overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-black/5 dark:bg-white/5 border-b border-brand-card-border text-brand-text font-bold text-xs uppercase">
                <tr>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Ref / Details</th>
                  <th className="px-6 py-4 text-right">Amount</th>
                  <th className="px-6 py-4 text-right print:hidden">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-card-border text-brand-text font-medium">
                {transactions.length > 0 ? transactions.slice(0, txLimit).map((t) => {
                  const d = t.timestamp?.toDate ? t.timestamp.toDate() : (t.timestamp ? new Date(t.timestamp) : new Date());
                  const isDynamicallyVoided = transactions.some(v => v.type === 'void' && v.voidRefId === t.id);
                  return (
                    <tr key={t.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold">{d.toLocaleDateString()}</div>
                        <div className="text-[10px] text-brand-text-dim uppercase mt-1">{d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-normal min-w-[200px]">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-black/10 dark:bg-white/10">{t.method || 'CASH'}</span>
                          <span className="text-sm font-medium">{t.description || t.reference || t.details || 'No ref'}</span>
                        </div>
                        {t.breakdown && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {Object.entries(t.breakdown).map(([k, v]) => {
                              let displayName = k;
                              const parts = k.split('-');
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
                              } else if (t.breakdownNames && t.breakdownNames[k]) {
                                displayName = t.breakdownNames[k] + (monthStr ? ` (${monthStr})` : '');
                              } else {
                                displayName = `Archived Fee` + (monthStr ? ` (${monthStr})` : '');
                              }
                              return (
                                <span key={k} className="text-[10px] px-1.5 py-0.5 bg-black/5 dark:bg-white/5 rounded text-brand-text-dim border border-black/5 dark:border-white/5">
                                  {displayName}: <span className="font-bold text-brand-text">₹{v.toLocaleString('en-IN')}</span>
                                </span>
                              )
                            })}
                          </div>
                        )}
                      </td>
                      <td className={`px-6 py-4 text-right font-black text-lg ${t.type === 'void' ? 'text-red-500' : 'text-green-500'} ${isDynamicallyVoided ? 'line-through opacity-50' : ''}`}>
                        {t.type === 'void' ? '' : '₹'}{t.amount.toLocaleString('en-IN')}
                      </td>
                      <td className="px-6 py-4 text-right print:hidden">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => setReceiptTransaction(t)}
                            className="p-2 text-brand-primary hover:bg-brand-primary/10 rounded-lg transition-colors"
                            title="Print Receipt"
                          >
                            <Printer size={16} />
                          </button>
                          {canLogPayment && (
                            <button 
                              onClick={() => handleEditTransaction(t)}
                              className="p-2 text-blue-500 hover:bg-blue-500/10 rounded-lg transition-colors"
                              title="Edit Transaction"
                            >
                              <Edit2 size={16} />
                            </button>
                          )}
                          {canLogPayment && !isDynamicallyVoided && t.type !== 'void' && (
                            <button 
                              onClick={() => handleVoidTransaction(t)}
                              className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                              title="Void Transaction"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                }) : <tr><td colSpan="3" className="text-center py-8 text-brand-text-dim">No transactions recorded.</td></tr>}
              </tbody>
            </table>
            {transactions.length > txLimit && (
              <div className="p-4 text-center border-t border-brand-card-border bg-black/5 dark:bg-white/5">
                <button 
                  onClick={() => setTxLimit(prev => prev + 15)}
                  className="text-sm font-medium text-brand-secondary hover:text-brand-secondary-hover transition-colors"
                >
                  Load More History
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fee Config Modal */}
      {isConfigOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-brand-card border border-brand-card-border rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-brand-card-border flex items-center justify-between bg-brand-sidebar">
              <h2 className="text-xl font-bold text-brand-text flex items-center gap-2">
                <Settings2 className="text-brand-primary" />
                Fee Configuration: {student.name}
              </h2>
              <button onClick={() => setIsConfigOpen(false)} className="text-brand-text-dim hover:text-brand-text p-2 hover:bg-black/5 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Left Col: Setup */}
                <div className="space-y-6">
                  <div>
                    <label className="text-sm font-medium text-brand-text-dim mb-1 block">Fee Plan Base</label>
                    <select 
                      value={configForm.planId} 
                      onChange={handlePlanSelect}
                      className="w-full bg-brand-bg border border-brand-card-border rounded-lg px-4 py-2 text-brand-text focus:border-brand-primary outline-none"
                    >
                      <option value="">-- Custom / Select Plan --</option>
                      {availablePlans.map(p => (
                        <option key={p.id} value={p.id}>{p.name} (₹{p.total || 0})</option>
                      ))}
                    </select>
                    <p className="text-xs text-brand-text-dim mt-1">Selecting a plan overwrites the components below.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-brand-text-dim mb-1 block">Start Month</label>
                      <select 
                        value={configForm.startMonth} 
                        onChange={e => setConfigForm({...configForm, startMonth: parseInt(e.target.value)})}
                        className="w-full bg-brand-bg border border-brand-card-border rounded-lg px-4 py-2 text-brand-text focus:border-brand-primary outline-none"
                      >
                        {MONTHS.map((m, i) => (
                          <option key={m} value={i}>{m}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-brand-text-dim mb-1 block">Cycle Length (Months)</label>
                      <input 
                        type="number" min="1" max="12"
                        value={configForm.billingCycle} 
                        onChange={e => setConfigForm({...configForm, billingCycle: e.target.value})}
                        className="w-full bg-brand-bg border border-brand-card-border rounded-lg px-4 py-2 text-brand-text focus:border-brand-primary outline-none"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-brand-text-dim mb-1 block">Academic Start Year</label>
                    <input 
                      type="number"
                      value={configForm.academicStartYear} 
                      onChange={e => setConfigForm({...configForm, academicStartYear: e.target.value})}
                      className="w-full bg-brand-bg border border-brand-card-border rounded-lg px-4 py-2 text-brand-text focus:border-brand-primary outline-none"
                    />
                  </div>

                  <div className="bg-brand-bg border border-brand-card-border rounded-xl p-5 mt-6">
                    <h4 className="text-xs font-bold text-brand-text-dim uppercase tracking-wider mb-2">Estimated Annual Revenue</h4>
                    <div className="text-3xl font-black text-brand-primary flex items-center gap-1">
                      <IndianRupee size={24} className="opacity-70" />
                      {(
                        (configForm.components.filter(c => c.frequency === 'monthly').reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0) * (parseInt(configForm.billingCycle) || 12)) +
                        configForm.components.filter(c => c.frequency !== 'monthly').reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0)
                      ).toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Right Col: Components */}
                <div className="lg:col-span-2">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-brand-text">Fee Components</h3>
                    <button onClick={handleAddComponent} className="text-sm font-medium text-brand-primary hover:text-brand-primary-hover flex items-center gap-1">
                      <Plus size={14} /> Add Item
                    </button>
                  </div>
                  
                  <div className="space-y-3">
                    <datalist id="fee-categories">
                      <option value="Tuition Fee" />
                      <option value="Transport Fee" />
                      <option value="Admission Fee" />
                      <option value="Material Fee" />
                      <option value="Annual Registration Fee" />
                      <option value="Food & Dining Fee" />
                      <option value="Concession" />
                    </datalist>
                    {configForm.components.map((comp, idx) => (
                      <div key={comp.uid || idx} className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-black/5 dark:bg-white/5 p-3 rounded-lg border border-brand-card-border/50">
                        <div className="flex-1 w-full sm:w-auto">
                          <input 
                            type="text" value={comp.name} placeholder="Fee Item Name"
                            list="fee-categories"
                            onChange={(e) => handleComponentChange(idx, 'name', e.target.value)}
                            className="w-full bg-brand-bg border border-brand-card-border rounded-md px-3 py-2 text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
                          />
                        </div>
                        <div className="w-full sm:w-32">
                          <select 
                            value={comp.frequency}
                            onChange={(e) => handleComponentChange(idx, 'frequency', e.target.value)}
                            className="w-full bg-brand-bg border border-brand-card-border rounded-md px-3 py-2 text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
                          >
                            <option value="monthly">Monthly</option>
                            <option value="onetime">One-Time</option>
                          </select>
                        </div>
                        <div className="w-full sm:w-48 flex items-center gap-2">
                          <div className="flex-1 relative">
                            {comp.baseAmount !== undefined && parseFloat(comp.baseAmount) !== parseFloat(comp.amount) && (
                              <div className="absolute -top-5 left-0 text-[10px] font-bold text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded">
                                Base: ₹{comp.baseAmount}
                              </div>
                            )}
                            <input 
                              type="number" value={comp.amount} placeholder="Amount"
                              onChange={(e) => handleComponentChange(idx, 'amount', e.target.value)}
                              className="w-full bg-brand-bg border border-brand-card-border rounded-md px-3 py-2 text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
                            />
                          </div>
                          <button onClick={() => handleRemoveComponent(idx)} className="w-8 h-8 flex items-center justify-center text-red-500 hover:bg-red-500/10 rounded-md transition-colors shrink-0 sm:hidden">
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <button onClick={() => handleRemoveComponent(idx)} className="hidden sm:flex w-8 h-8 items-center justify-center text-red-500 hover:bg-red-500/10 rounded-md transition-colors shrink-0">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    
                    {configForm.components.length === 0 && (
                      <div className="text-center py-8 text-brand-text-dim border-2 border-dashed border-brand-card-border rounded-xl">
                        No components added. Click "Add Item" to start.
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>

            <div className="p-6 border-t border-brand-card-border bg-brand-sidebar flex justify-end gap-3 shrink-0">
              <button onClick={() => setIsConfigOpen(false)} className="px-4 py-2 rounded-lg font-medium text-brand-text hover:bg-black/5 transition-colors">Cancel</button>
              <button onClick={handleSaveConfig} disabled={isSavingConfig} className="px-6 py-2 bg-brand-primary hover:bg-brand-primary-hover disabled:opacity-50 text-white rounded-lg font-bold transition-colors flex items-center gap-2">
                {isSavingConfig ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <Check size={18} />} 
                {isSavingConfig ? 'Applying...' : 'Apply Configuration'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discount Modal */}
      {isDiscountOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-brand-card border border-brand-card-border rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-brand-card-border flex items-center justify-between bg-black/5 dark:bg-white/5">
              <h2 className="text-lg font-bold text-brand-text flex items-center gap-2">
                <PlusCircle className="text-brand-secondary" /> Grant Concession / Discount
              </h2>
              <button onClick={() => setIsDiscountOpen(false)} className="text-brand-text-dim hover:text-brand-text transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleDiscountSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-brand-text-dim mb-1">Amount Owed Currently</label>
                <div className="text-xl font-black text-brand-primary">₹{currentDuesToDisplay.toLocaleString('en-IN')}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-brand-text-dim mb-1">Discount Amount (₹) <span className="text-red-500">*</span></label>
                <input 
                  type="number" 
                  min="1"
                  required
                  value={discountForm.amount} 
                  onChange={(e) => {
                    setDiscountForm({...discountForm, amount: e.target.value});
                    setSelectedDues([]); 
                  }}
                  className="w-full bg-brand-bg border border-brand-card-border rounded-md px-3 py-2 text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
                  placeholder="e.g. 5000"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-brand-text-dim mb-1">Discount Date (Optional for Backdating)</label>
                <input 
                  type="date" 
                  value={discountForm.date || ''} 
                  onChange={(e) => setDiscountForm({...discountForm, date: e.target.value})}
                  className="w-full bg-brand-bg border border-brand-card-border rounded-md px-3 py-2 text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
                />
              </div>

              {overdueItems.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-brand-text-dim mb-2">Discount Allocation Checklist (Optional)</label>
                  <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar p-2 border border-brand-card-border rounded-md bg-black/5 dark:bg-white/5">
                    {overdueItems.map((item, idx) => (
                      <label key={idx} className="flex items-center gap-3 cursor-pointer p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-md transition-colors">
                        <input 
                          type="checkbox" 
                          checked={selectedDues.includes(item.targetKey)}
                          onChange={(e) => {
                            let newSelected = [...selectedDues];
                            if (e.target.checked) newSelected.push(item.targetKey);
                            else newSelected = newSelected.filter(k => k !== item.targetKey);
                            setSelectedDues(newSelected);
                            
                            if (newSelected.length > 0) {
                              const sum = newSelected.reduce((acc, k) => {
                                const matched = overdueItems.find(o => o.targetKey === k);
                                return acc + (matched ? matched.due : 0);
                              }, 0);
                              setDiscountForm(prev => ({...prev, amount: sum.toString()}));
                            }
                          }}
                          className="w-4 h-4 text-brand-primary rounded border-gray-300 focus:ring-brand-primary"
                        />
                        <div className="flex-1 text-sm font-medium text-brand-text">
                          {item.name} {item.detail && <span className="text-brand-text-dim">({item.detail})</span>}
                        </div>
                        <div className="text-sm font-bold text-red-500">
                          ₹{item.due.toLocaleString('en-IN')}
                        </div>
                      </label>
                    ))}
                  </div>
                  <p className="text-[10px] text-brand-text-dim mt-1">Check items to explicitly apply discount, or leave blank to auto-allocate.</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-brand-text-dim mb-1">Reason (Optional)</label>
                <input 
                  type="text" 
                  value={discountForm.description} 
                  onChange={(e) => setDiscountForm({...discountForm, description: e.target.value})}
                  className="w-full bg-brand-bg border border-brand-card-border rounded-md px-3 py-2 text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
                  placeholder="e.g. Scholarship, Hardship"
                />
              </div>

              <div className="pt-4 border-t border-brand-card-border flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsDiscountOpen(false)}
                  className="px-4 py-2 rounded-md font-medium text-brand-text-dim hover:text-brand-text hover:bg-black/5 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isProcessingPayment}
                  className="bg-brand-secondary hover:bg-brand-secondary-hover text-white px-6 py-2 rounded-md font-bold transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isProcessingPayment ? 'Processing...' : 'Grant Discount'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {isPaymentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-brand-card border border-brand-card-border rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-brand-card-border flex items-center justify-between bg-black/5 dark:bg-white/5">
              <h2 className="text-lg font-bold text-brand-text flex items-center gap-2">
                <IndianRupee className="text-green-500" /> Log Fee Payment
              </h2>
              <button onClick={() => setIsPaymentOpen(false)} className="text-brand-text-dim hover:text-brand-text transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handlePaymentSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-brand-text-dim mb-1">Amount Owed Currently</label>
                <div className="text-xl font-black text-brand-primary">₹{currentDuesToDisplay.toLocaleString('en-IN')}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-brand-text-dim mb-1">Payment Amount (₹) <span className="text-red-500">*</span></label>
                <input 
                  type="number" 
                  min="1"
                  required
                  value={paymentForm.amount} 
                  onChange={(e) => {
                    setPaymentForm({...paymentForm, amount: e.target.value});
                    setSelectedDues([]); // Clear manual checklist if amount is typed directly
                  }}
                  className="w-full bg-brand-bg border border-brand-card-border rounded-md px-3 py-2 text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
                  placeholder="e.g. 5000"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-brand-text-dim mb-1">Payment Date (Optional for Backdating)</label>
                <input 
                  type="date" 
                  value={paymentForm.date || ''} 
                  onChange={(e) => setPaymentForm({...paymentForm, date: e.target.value})}
                  className="w-full bg-brand-bg border border-brand-card-border rounded-md px-3 py-2 text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
                />
              </div>

              {overdueItems.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-brand-text-dim mb-2">Pending Dues Checklist (Optional)</label>
                  <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar p-2 border border-brand-card-border rounded-md bg-black/5 dark:bg-white/5">
                    {overdueItems.map((item, idx) => (
                      <label key={idx} className="flex items-center gap-3 cursor-pointer p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-md transition-colors">
                        <input 
                          type="checkbox" 
                          checked={selectedDues.includes(item.targetKey)}
                          onChange={(e) => {
                            let newSelected = [...selectedDues];
                            if (e.target.checked) newSelected.push(item.targetKey);
                            else newSelected = newSelected.filter(k => k !== item.targetKey);
                            setSelectedDues(newSelected);
                            
                            // Auto-sum amount based on checklist
                            if (newSelected.length > 0) {
                              const sum = newSelected.reduce((acc, k) => {
                                const matched = overdueItems.find(o => o.targetKey === k);
                                return acc + (matched ? matched.due : 0);
                              }, 0);
                              setPaymentForm(prev => ({...prev, amount: sum.toString()}));
                            }
                          }}
                          className="w-4 h-4 text-brand-primary rounded border-gray-300 focus:ring-brand-primary"
                        />
                        <div className="flex-1 text-sm font-medium text-brand-text">
                          {item.name} {item.detail && <span className="text-brand-text-dim">({item.detail})</span>}
                        </div>
                        <div className="text-sm font-bold text-red-500">
                          ₹{item.due.toLocaleString('en-IN')}
                        </div>
                      </label>
                    ))}
                  </div>
                  <p className="text-[10px] text-brand-text-dim mt-1">Check items to explicitly allocate payment, or leave blank to auto-allocate.</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-brand-text-dim mb-1">Payment Method</label>
                <select 
                  value={paymentForm.method} 
                  onChange={(e) => setPaymentForm({...paymentForm, method: e.target.value})}
                  className="w-full bg-brand-bg border border-brand-card-border rounded-md px-3 py-2 text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
                >
                  <option value="Cash">Cash</option>
                  <option value="GPay/UPI">GPay / UPI</option>
                  <option value="Bank Transfer">Bank Transfer / NEFT</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Card">Card</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-brand-text-dim mb-1">Description (Optional)</label>
                <input 
                  type="text" 
                  value={paymentForm.description} 
                  onChange={(e) => setPaymentForm({...paymentForm, description: e.target.value})}
                  className="w-full bg-brand-bg border border-brand-card-border rounded-md px-3 py-2 text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
                  placeholder="e.g. April Tuition Fee"
                />
              </div>

              <div className="pt-4 border-t border-brand-card-border flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsPaymentOpen(false)}
                  className="px-4 py-2 rounded-md font-medium text-brand-text-dim hover:text-brand-text hover:bg-black/5 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isProcessingPayment}
                  className="bg-brand-primary hover:bg-brand-primary-hover text-white px-6 py-2 rounded-md font-bold transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isProcessingPayment ? 'Saving...' : 'Confirm Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Payment Modal */}
      {isEditPaymentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-brand-card border border-brand-card-border rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-brand-card-border flex items-center justify-between bg-black/5 dark:bg-white/5">
              <h2 className="text-lg font-bold text-brand-text flex items-center gap-2">
                <Edit2 className="text-blue-500" /> Edit Transaction
              </h2>
              <button onClick={() => setIsEditPaymentOpen(false)} className="text-brand-text-dim hover:text-brand-text transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleEditSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-brand-text-dim mb-1">Amount (₹) <span className="text-red-500">*</span></label>
                <input 
                  type="number" 
                  min="1"
                  required
                  value={editPaymentForm.amount} 
                  onChange={(e) => setEditPaymentForm({...editPaymentForm, amount: e.target.value})}
                  className="w-full bg-brand-bg border border-brand-card-border rounded-md px-3 py-2 text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-brand-text-dim mb-1">Date</label>
                <input 
                  type="date" 
                  value={editPaymentForm.date || ''} 
                  onChange={(e) => setEditPaymentForm({...editPaymentForm, date: e.target.value})}
                  className="w-full bg-brand-bg border border-brand-card-border rounded-md px-3 py-2 text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-brand-text-dim mb-1">Method</label>
                <select 
                  value={editPaymentForm.method} 
                  onChange={(e) => setEditPaymentForm({...editPaymentForm, method: e.target.value})}
                  className="w-full bg-brand-bg border border-brand-card-border rounded-md px-3 py-2 text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
                >
                  <option value="Cash">Cash</option>
                  <option value="GPay/UPI">GPay / UPI</option>
                  <option value="Bank Transfer">Bank Transfer / NEFT</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Card">Card</option>
                  {/* 'Concession' is deliberately NOT offered: a type:'incoming' payment
                      relabelled as Concession is still counted as paid money by the dues
                      engine, so the label only made the reports disagree with the ledger.
                      Real concessions go through Grant Concession, which writes type:'discount'.
                      Keyed on the ORIGINAL method (not the live form value) so a mis-click
                      to another method doesn't unmount the option and strand the user. */}
                  {transactions.find(t => t.id === editPaymentForm.id)?.method === 'Concession' && <option value="Concession">Concession</option>}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-brand-text-dim mb-1">Description</label>
                <input 
                  type="text" 
                  value={editPaymentForm.description} 
                  onChange={(e) => setEditPaymentForm({...editPaymentForm, description: e.target.value})}
                  className="w-full bg-brand-bg border border-brand-card-border rounded-md px-3 py-2 text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
                />
              </div>

              <div className="pt-4 border-t border-brand-card-border flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsEditPaymentOpen(false)}
                  className="px-4 py-2 rounded-md font-medium text-brand-text-dim hover:text-brand-text hover:bg-black/5 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isProcessingPayment}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md font-bold transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isProcessingPayment ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {receiptTransaction && (
        <PaymentReceipt 
          receiptTransaction={receiptTransaction} 
          student={student} 
          wing={wing} 
          components={components} 
          onClose={() => setReceiptTransaction(null)} 
        />
      )}
    </div>
  );
}
