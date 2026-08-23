import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, addDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { firestore } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { Search, Plus, Edit2, Trash2, X, IndianRupee } from 'lucide-react';
import { logAudit } from '../utils/auditLog';

export default function FeesPlans() {
  const { currentUser, userData } = useAuth();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [saving, setSaving] = useState(false);

  const isMaster = userData?.isAdmin || userData?.role === 'admin' || userData?.permissions === true;
  const perms = userData?.permissions?.fees_accounting || {};
  const canEdit = isMaster || perms.config === true;

  const loadPlans = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(firestore, 'fee_plans'));
      const data = [];
      snap.forEach(d => {
        data.push({ id: d.id, ...d.data() });
      });
      
      data.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setPlans(data);
    } catch (err) {
      console.error("Failed to load plans", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadPlans();
  }, []);

  const openNewPlan = () => {
    setEditingPlan({
      id: null,
      name: '',
      billingCycle: 12,
      startMonth: 5,
      components: [
        { uid: `comp_${Date.now()}_1`, name: '', frequency: 'monthly', amount: 0 }
      ]
    });
    setIsModalOpen(true);
  };

  const openEditPlan = (plan) => {
    setEditingPlan({ ...plan });
    setIsModalOpen(true);
  };

  const handleAddComponent = () => {
    setEditingPlan(prev => ({
      ...prev,
      components: [
        ...prev.components,
        { uid: `comp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`, name: '', frequency: 'monthly', amount: 0 }
      ]
    }));
  };

  const handleRemoveComponent = (uid) => {
    setEditingPlan(prev => ({
      ...prev,
      components: prev.components.filter(c => c.uid !== uid)
    }));
  };

  const handleComponentChange = (uid, field, value) => {
    setEditingPlan(prev => ({
      ...prev,
      components: prev.components.map(c => 
        c.uid === uid ? { ...c, [field]: value } : c
      )
    }));
  };

  const handleSave = async () => {
    if (!editingPlan.name.trim()) return alert("Plan name is required.");
    
    // Clean up empty components
    const cleanComponents = editingPlan.components.filter(c => c.name.trim() !== '');
    
    setSaving(true);
    try {
      const payload = {
        name: editingPlan.name.trim(),
        billingCycle: parseInt(editingPlan.billingCycle) || 12,
        startMonth: parseInt(editingPlan.startMonth) || 5,
        components: cleanComponents.map(c => ({
          uid: c.uid,
          name: c.name,
          amount: parseFloat(c.amount) || 0,
          frequency: c.frequency,
          type: 'academic'
        })),
        updatedAt: serverTimestamp(),
        updatedBy: currentUser?.email || null
      };

      const plansRef = collection(firestore, 'fee_plans');

      if (editingPlan.id) {
        await updateDoc(doc(plansRef, editingPlan.id), payload);
        logAudit({
          action: 'FEE_PLAN_UPDATED',
          module: 'fees_accounting',
          targetId: editingPlan.id,
          targetName: payload.name,
          performedBy: currentUser?.email,
          details: { billingCycle: payload.billingCycle, componentCount: payload.components.length }
        });
      } else {
        const newPlanRef = await addDoc(plansRef, payload);
        logAudit({
          action: 'FEE_PLAN_CREATED',
          module: 'fees_accounting',
          targetId: newPlanRef.id,
          targetName: payload.name,
          performedBy: currentUser?.email,
          details: { billingCycle: payload.billingCycle, componentCount: payload.components.length }
        });
      }

      setIsModalOpen(false);
      loadPlans();
    } catch (err) {
      console.error("Failed to save plan", err);
      alert("Failed to save the fee package.");
    }
    setSaving(false);
  };

  const handleDelete = async (planId, planName) => {
    if (window.confirm(`Are you sure you want to delete the package "${planName}"? This action cannot be undone.`)) {
      try {
        await deleteDoc(doc(firestore, 'fee_plans', planId));
        logAudit({
          action: 'FEE_PLAN_DELETED',
          module: 'fees_accounting',
          targetId: planId,
          targetName: planName,
          performedBy: currentUser?.email,
          details: {}
        });
        loadPlans();
      } catch (err) {
        console.error("Failed to delete plan", err);
        alert("Failed to delete the fee package.");
      }
    }
  };

  if (loading && plans.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
      </div>
    );
  }

  const filtered = plans.filter(p => 
    (p.name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="bg-brand-card border border-brand-card-border rounded-xl shadow-sm overflow-hidden relative">
      <div className="p-4 md:p-6 border-b border-brand-card-border flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-black/5 dark:bg-white/5">
        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-dim" size={16} />
          <input 
            type="text" placeholder="Search fee packages..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-brand-bg border border-brand-card-border rounded-md py-1.5 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary w-full sm:w-64 text-brand-text"
          />
        </div>
        {canEdit && (
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button onClick={openNewPlan} className="w-full sm:w-auto flex justify-center items-center gap-2 bg-brand-primary hover:bg-brand-primary-hover text-white px-4 py-2 rounded-md font-medium text-sm transition-colors shadow-sm">
              <Plus size={16} /> New Package
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
        {filtered.length === 0 ? (
          <div className="col-span-full py-12 text-center text-brand-text-dim border-2 border-dashed border-brand-card-border rounded-xl">
            No fee packages found.
          </div>
        ) : (
          filtered.map(p => {
            const monthlyTotal = (p.components || []).filter(c => c.frequency === 'monthly').reduce((acc, c) => acc + c.amount, 0);
            const oneTimeTotal = (p.components || []).filter(c => c.frequency === 'onetime').reduce((acc, c) => acc + c.amount, 0);
            
            const billingCycle = p.billingCycle || 12;
            const annualTotal = (monthlyTotal * billingCycle) + oneTimeTotal;

            return (
              <div key={p.id} className="border border-brand-card-border rounded-xl p-5 hover:border-brand-primary/50 hover:shadow-md transition-all bg-brand-bg dark:bg-black/20 group relative">
                <h3 className="font-bold text-lg text-brand-text mb-1 pr-16">{p.name}</h3>
                <div className="text-xs text-brand-text-dim mb-4 uppercase tracking-wider font-semibold">
                  {p.wing || 'All Wings'}
                </div>

                <div className="space-y-3 mb-6">
                  <div className="flex justify-between items-center pb-2 border-b border-brand-card-border border-dashed">
                    <span className="text-sm text-brand-text-dim">Monthly Base</span>
                    <span className="font-bold text-brand-text">₹ {monthlyTotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-brand-card-border border-dashed">
                    <span className="text-sm text-brand-text-dim">One Time (Admission)</span>
                    <span className="font-bold text-brand-text">₹ {oneTimeTotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-brand-text-dim font-bold">Annual Total <span className="font-normal opacity-70">({billingCycle} mo)</span></span>
                    <span className="font-black text-brand-primary text-lg">₹ {annualTotal.toLocaleString()}</span>
                  </div>
                </div>

                {canEdit && (
                  <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEditPlan(p)} className="w-8 h-8 rounded-md bg-black/5 dark:bg-white/5 hover:bg-brand-primary/10 text-brand-text-dim hover:text-brand-primary flex items-center justify-center transition-colors">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => handleDelete(p.id, p.name)} className="w-8 h-8 rounded-md bg-black/5 dark:bg-white/5 hover:bg-red-500/10 text-brand-text-dim hover:text-red-500 flex items-center justify-center transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* React Modal Overlay */}
      {isModalOpen && editingPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-brand-card border border-brand-card-border rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-brand-card-border flex items-center justify-between bg-black/5 dark:bg-white/5">
              <h2 className="text-lg font-bold text-brand-text">
                {editingPlan.id ? 'Edit Fee Package' : 'Create Fee Package'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-brand-text-dim hover:text-brand-text transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Left Col: Setup */}
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-brand-text-dim mb-1">Package Name</label>
                    <input 
                      type="text" 
                      value={editingPlan.name} 
                      onChange={(e) => setEditingPlan({...editingPlan, name: e.target.value})}
                      className="w-full bg-brand-bg border border-brand-card-border rounded-md px-3 py-2 text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
                      placeholder="e.g. Nursery Regular 2024"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-brand-text-dim mb-1">Billing Cycle</label>
                      <input 
                        type="number" min="1" max="12"
                        value={editingPlan.billingCycle} 
                        onChange={(e) => setEditingPlan({...editingPlan, billingCycle: e.target.value})}
                        className="w-full bg-brand-bg border border-brand-card-border rounded-md px-3 py-2 text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-brand-text-dim mb-1">Start Month</label>
                      <select 
                        value={editingPlan.startMonth} 
                        onChange={(e) => setEditingPlan({...editingPlan, startMonth: e.target.value})}
                        className="w-full bg-brand-bg border border-brand-card-border rounded-md px-3 py-2 text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
                      >
                        {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, i) => (
                          <option key={i} value={i}>{m}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="bg-brand-bg border border-brand-card-border rounded-xl p-5 mt-6">
                    <h4 className="text-xs font-bold text-brand-text-dim uppercase tracking-wider mb-2">Estimated Annual Revenue</h4>
                    <div className="text-3xl font-black text-brand-primary flex items-center gap-1">
                      <IndianRupee size={24} className="opacity-70" />
                      {(
                        (editingPlan.components.filter(c => c.frequency === 'monthly').reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0) * (parseInt(editingPlan.billingCycle) || 12)) +
                        editingPlan.components.filter(c => c.frequency === 'onetime').reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0)
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
                    {editingPlan.components.map((comp, idx) => (
                      <div key={comp.uid} className="flex items-center gap-3 bg-black/5 dark:bg-white/5 p-3 rounded-lg border border-brand-card-border/50">
                        <div className="flex-1">
                          <input 
                            type="text" value={comp.name} placeholder="Fee Item Name (e.g. Tuition Fee)"
                            onChange={(e) => handleComponentChange(comp.uid, 'name', e.target.value)}
                            className="w-full bg-brand-bg border border-brand-card-border rounded-md px-3 py-2 text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
                          />
                        </div>
                        <div className="w-32">
                          <select 
                            value={comp.frequency}
                            onChange={(e) => handleComponentChange(comp.uid, 'frequency', e.target.value)}
                            className="w-full bg-brand-bg border border-brand-card-border rounded-md px-3 py-2 text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
                          >
                            <option value="monthly">Monthly</option>
                            <option value="onetime">One-Time</option>
                          </select>
                        </div>
                        <div className="w-32">
                          <input 
                            type="number" value={comp.amount} placeholder="Amount"
                            onChange={(e) => handleComponentChange(comp.uid, 'amount', e.target.value)}
                            className="w-full bg-brand-bg border border-brand-card-border rounded-md px-3 py-2 text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
                          />
                        </div>
                        <button onClick={() => handleRemoveComponent(comp.uid)} className="w-8 h-8 flex items-center justify-center text-red-500 hover:bg-red-500/10 rounded-md transition-colors shrink-0">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    
                    {editingPlan.components.length === 0 && (
                      <div className="text-center py-8 text-brand-text-dim border-2 border-dashed border-brand-card-border rounded-xl">
                        No components added. Click "Add Item" to start.
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>

            <div className="px-6 py-4 border-t border-brand-card-border bg-black/5 dark:bg-white/5 flex justify-end gap-3">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 rounded-md font-medium text-sm text-brand-text-dim hover:text-brand-text transition-colors">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving} className="px-6 py-2 rounded-md font-medium text-sm bg-brand-primary hover:bg-brand-primary-hover text-white transition-colors shadow-sm disabled:opacity-70 flex items-center gap-2">
                {saving ? (
                  <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></div> Saving...</>
                ) : 'Save Package'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
