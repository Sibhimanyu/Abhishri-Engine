import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { firestore } from '../firebase';
import { ArrowLeft, Edit3, MapPin, Phone, Mail, User, Briefcase, HeartPulse, DollarSign, Wallet, Save, X, Calendar, Trash2, Loader, Star } from 'lucide-react';
import { calculateNakshatra, TAMIL_NATCHATRAMS, TAMIL_MONTHS } from '../utils/astrologyApi';
import { useAuth } from '../context/AuthContext';

export default function StaffProfile({ uid, defaultName, onBack, canEdit }) {
  const { userData, currentUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editForm, setEditForm] = useState({
    email: '',
    name: defaultName || '',
    designation: '',
    phone: '',
    joiningDate: '',
    bloodGroup: '',
    worksInPreschool: false,
    worksInTuition: false,
    dob: '',
    birthTime: '',
    birthCity: '',
    nakshatra: '',
    tamilMonth: '',
    tamilDay: '',
    address: '',
    emergencyContact: ''
  });

  const isAdmin = userData?.isAdmin;
  const feesPerms = userData?.permissions?.fees_accounting || {};
  
  // They can view their own wallet if they have the perm and it's their profile
  const isOwnProfile = profile && currentUser?.email && profile.email?.toLowerCase() === currentUser.email.toLowerCase();
  const canViewOwnWallet = feesPerms.wallet_view_own && isOwnProfile;
  
  // Can they see the financials block?
  const canSeeFinancials = isAdmin || canViewOwnWallet;
  
  // Can they edit the financials block?
  const canEditFinancials = canEdit && isAdmin; // Only HR/Admin should alter walletEnabled

  useEffect(() => {
    async function fetchStaffProfile() {
      try {
        const staffRef = doc(firestore, 'staff', uid);
        const snapshot = await getDoc(staffRef);
        
        let profileData = {
            email: '',
            name: defaultName || '',
            designation: 'Staff Member',
            phone: '',
            joiningDate: '',
            bloodGroup: '',
            worksInPreschool: false,
            worksInTuition: false,
            dob: '',
            birthTime: '',
            birthCity: '',
            nakshatra: '',
            tamilMonth: '',
            tamilDay: '',
            address: '',
            emergencyContact: '',
        };

        if (snapshot.exists()) {
          profileData = { ...profileData, ...snapshot.data() };
        }
        
        // Fetch financial data separately if authorized
        let financialData = { walletEnabled: false };
        
        // Optimistic check: we only fetch if we know we might have read access.
        // Even if we fetch and get blocked by rules, we catch the error.
        try {
          const walletRef = doc(firestore, 'staff_wallets', uid);
          const walletSnap = await getDoc(walletRef);
          if (walletSnap.exists()) {
            financialData = salarySnap.data();
          }
        } catch (e) {
          console.warn("Could not fetch financial data (insufficient permissions or missing doc).");
        }

        setProfile({ ...profileData, ...financialData, id: uid });
        
      } catch (err) {
        console.error('Failed to fetch staff profile:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchStaffProfile();
  }, [uid, defaultName]);

  useEffect(() => {
    if (profile) {
      setEditForm({
        email: profile.email || '',
        name: profile.name || defaultName || '',
        designation: profile.designation || '',
        phone: profile.phone || '',
        joiningDate: profile.joiningDate || '',
        bloodGroup: profile.bloodGroup || '',
        worksInPreschool: !!profile.worksInPreschool,
        worksInTuition: !!profile.worksInTuition,
        dob: profile.dob || '',
        birthTime: profile.birthTime || '',
        birthCity: profile.birthCity || '',
        nakshatra: profile.nakshatra || '',
        tamilMonth: profile.tamilMonth || '',
        tamilDay: profile.tamilDay || '',
        address: profile.address || '',
        emergencyContact: profile.emergencyContact || ''
      });
    }
  }, [profile, isEditing]);

  const handleSave = async () => {
    if (!editForm.name.trim()) {
      alert('Full Name is required.');
      return;
    }
    try {
      setSaving(true);
      const emailLower = editForm.email.toLowerCase();
      
      const staffRef = doc(firestore, 'staff', uid);
      await setDoc(staffRef, {
        email: emailLower,
        name: editForm.name || '',
        designation: editForm.designation || '',
        phone: editForm.phone || '',
        joiningDate: editForm.joiningDate || '',
        worksInPreschool: !!editForm.worksInPreschool,
        worksInTuition: !!editForm.worksInTuition,
        dob: editForm.dob || '',
        birthTime: editForm.birthTime || '',
        birthCity: editForm.birthCity || '',
        nakshatra: editForm.nakshatra || '',
        tamilMonth: editForm.tamilMonth || '',
        tamilDay: editForm.tamilDay || '',
        bloodGroup: editForm.bloodGroup || '',
        address: editForm.address || '',
        emergencyContact: editForm.emergencyContact || '',
        updatedAt: serverTimestamp(),
      }, { merge: true });

      // Save financial data separately if authorized
      if (canEditFinancials) {
        const walletRef = doc(firestore, 'staff_wallets', uid);
        await setDoc(walletRef, {
          walletEnabled: true,
          staffEmail: emailLower,
        }, { merge: true });
      }

      setProfile({ ...editForm, id: uid });
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to update staff profile:', err);
      alert('Failed to update staff profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const [suggestingNakshatra, setSuggestingNakshatra] = useState(false);
  const handleSuggestNakshatra = async () => {
    if (!editForm.dob || !editForm.birthTime || !editForm.birthCity) {
      alert("Please enter Date of Birth, Time of Birth, and Birth City first.");
      return;
    }
    setSuggestingNakshatra(true);
    try {
      const result = await calculateNakshatra(editForm.dob, editForm.birthTime, editForm.birthCity);
      if (result.nakshatra) {
        setEditForm(prev => ({ 
          ...prev, 
          nakshatra: result.nakshatra, 
          tamilMonth: result.tamilMonth,
          tamilDay: result.tamilDay 
        }));
      } else {
        alert("Could not fetch a suggestion. Please check your inputs.");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to get suggestion.");
    } finally {
      setSuggestingNakshatra(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm("Are you sure you want to completely delete this staff profile? This will also revoke their login access and cannot be undone.")) {
      try {
        setSaving(true);
        // Delete staff profile
        await deleteDoc(doc(firestore, 'staff', uid));
        
        // Delete login access
        await deleteDoc(doc(firestore, 'allowed_users', uid));
        
        // Delete financial profile if authorized (or just attempt to delete it)
        try {
          await deleteDoc(doc(firestore, 'staff_wallets', uid));
        } catch(e) {}
        
        onBack(); // Go back to directory
      } catch (err) {
        console.error("Failed to delete staff:", err);
        alert("Failed to delete staff. You might not have sufficient permissions.");
      } finally {
        setSaving(false);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
      </div>
    );
  }

  if (!profile && !loading) {
    return (
      <div className="flex flex-col justify-center items-center h-full min-h-[50vh] text-center space-y-4">
        <div className="p-4 rounded-full bg-red-100 text-red-600 dark:bg-red-900/20">
          <X size={32} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-brand-text">Access Denied or Profile Not Found</h2>
          <p className="text-brand-text-dim text-sm mt-2 max-w-md">We couldn't load this profile. Your permissions may have been recently changed or revoked, or the profile no longer exists.</p>
        </div>
        <button 
          onClick={onBack}
          className="mt-4 px-4 py-2 bg-brand-primary hover:bg-brand-primary-hover text-white rounded-md text-sm font-bold transition-colors"
        >
          Return to Directory
        </button>
      </div>
    );
  }

  const inputClass = "w-full bg-brand-bg border border-brand-card-border rounded-lg px-3 py-1.5 text-brand-text text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all";

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Header / Actions */}
      <div className="flex items-center justify-between mb-6">
        <button 
          onClick={onBack}
          disabled={saving}
          className="flex items-center gap-2 text-brand-text-dim hover:text-brand-text transition-colors font-medium bg-black/5 dark:bg-white/5 px-3 py-1.5 rounded-lg disabled:opacity-50"
        >
          <ArrowLeft size={18} /> Back to Directory
        </button>
        {canEdit && (
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <button 
                  onClick={handleDelete}
                  disabled={saving}
                  className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 dark:bg-red-900/20 dark:border-red-900/30 dark:hover:bg-red-900/40 px-4 py-2 rounded-md font-medium text-sm transition-colors shadow-sm disabled:opacity-50"
                >
                  <Trash2 size={16} /> Delete
                </button>
                <button 
                  onClick={() => setIsEditing(false)}
                  disabled={saving}
                  className="flex items-center gap-1.5 bg-brand-bg border border-brand-card-border hover:bg-black/5 dark:hover:bg-white/5 px-4 py-2 rounded-md font-medium text-sm transition-colors text-brand-text shadow-sm disabled:opacity-50"
                >
                  <X size={16} /> Cancel
                </button>
                <button 
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center justify-center gap-1.5 bg-brand-primary hover:bg-brand-primary-hover text-white px-4 py-2 rounded-md font-bold text-sm transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed min-w-[140px]"
                >
                  {saving ? (
                    <><Loader className="animate-spin" size={16} /> Saving...</>
                  ) : (
                    <><Save size={16} /> Save Changes</>
                  )}
                </button>
              </>
            ) : (
              <button 
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-2 bg-brand-bg border border-brand-card-border hover:bg-black/5 dark:hover:bg-white/5 px-4 py-2 rounded-md font-medium text-sm transition-colors text-brand-text shadow-sm"
              >
                <Edit3 size={16} /> Edit Profile
              </button>
            )}
          </div>
        )}
      </div>

      {/* Hero Card */}
      <div className="bg-brand-card border border-brand-card-border rounded-2xl p-8 mb-8 shadow-sm flex flex-col md:flex-row items-center md:items-start gap-8">
        <div className="w-32 h-32 rounded-3xl bg-gradient-to-tr from-brand-secondary/20 to-brand-primary/20 text-brand-text flex items-center justify-center font-bold text-5xl shadow-inner border border-brand-card-border shrink-0 uppercase">
          {((isEditing ? editForm.name : profile.name) || 'S').charAt(0)}
        </div>
        <div className="flex-1 w-full text-center md:text-left">
          {isEditing ? (
            <div className="space-y-4 max-w-xl">
              <div>
                <label className="text-xs font-bold text-brand-text-dim uppercase block mb-1">Full Name</label>
                <input 
                  type="text" 
                  value={editForm.name} 
                  onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                  className={`${inputClass} text-lg font-bold`}
                  placeholder="Enter Full Name"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-brand-text-dim uppercase block mb-1">Designation</label>
                  <input 
                    type="text" 
                    value={editForm.designation} 
                    onChange={e => setEditForm({ ...editForm, designation: e.target.value })}
                    className={inputClass}
                    placeholder="e.g. Lead Teacher"
                  />
                </div>
                <div className="col-span-1 sm:col-span-2">
                  <label className="text-xs font-bold text-brand-text-dim uppercase block mb-2">Program Assignment</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer bg-black/5 dark:bg-white/5 border border-brand-card-border px-3 py-2 rounded-lg hover:border-brand-primary transition-colors">
                      <input 
                        type="checkbox" 
                        checked={editForm.worksInPreschool} 
                        onChange={e => setEditForm({...editForm, worksInPreschool: e.target.checked})}
                        className="w-4 h-4 rounded text-brand-primary focus:ring-brand-primary cursor-pointer"
                      />
                      <span className="text-sm font-bold text-brand-text">Preschool</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer bg-black/5 dark:bg-white/5 border border-brand-card-border px-3 py-2 rounded-lg hover:border-brand-secondary transition-colors">
                      <input 
                        type="checkbox" 
                        checked={editForm.worksInTuition} 
                        onChange={e => setEditForm({...editForm, worksInTuition: e.target.checked})}
                        className="w-4 h-4 rounded text-brand-secondary focus:ring-brand-secondary cursor-pointer"
                      />
                      <span className="text-sm font-bold text-brand-text">Tuition</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-4xl font-extrabold text-brand-text tracking-tight mb-2">{profile.name}</h1>
              <p className="text-lg font-semibold text-brand-text-dim mb-4">{profile.designation || 'Staff Member'}</p>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
                {profile.worksInPreschool && (
                  <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
                    Preschool
                  </span>
                )}
                {profile.worksInTuition && (
                  <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-brand-secondary/10 text-brand-secondary border border-brand-secondary/20">
                    Tuition
                  </span>
                )}
                <span className="bg-black/5 dark:bg-white/5 text-brand-text-dim px-3 py-1 rounded-full text-xs font-mono">
                  {profile.email}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Profile Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Personal & Contact Details */}
        <div className="bg-brand-card border border-brand-card-border p-6 rounded-2xl">
          <h3 className="text-lg font-bold text-brand-text flex items-center gap-2 mb-6 border-b border-brand-card-border pb-3">
            <User size={20} className="text-brand-text-dim" /> Contact & Personal Details
          </h3>
          {isEditing ? (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-brand-text-dim text-xs block mb-1">Phone Number</label>
                  <input 
                    type="tel" 
                    value={editForm.phone} 
                    onChange={e => setEditForm({...editForm, phone: e.target.value})} 
                    className={inputClass} 
                    placeholder="Phone Number"
                  />
                </div>
                <div>
                  <label className="text-brand-text-dim text-xs block mb-1">Blood Group</label>
                  <input 
                    type="text" 
                    value={editForm.bloodGroup} 
                    onChange={e => setEditForm({...editForm, bloodGroup: e.target.value})} 
                    className={inputClass} 
                    placeholder="e.g. O+, A-"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-brand-text-dim text-xs block mb-1">Joining Date</label>
                  <input 
                    type="date" 
                    value={editForm.joiningDate} 
                    onChange={e => setEditForm({...editForm, joiningDate: e.target.value})} 
                    className={inputClass} 
                  />
                </div>
                <div>
                  <label className="text-brand-text-dim text-xs block mb-1">Wing / Unit</label>
                  <select 
                    value={editForm.wing} 
                    onChange={e => setEditForm({...editForm, wing: e.target.value})} 
                    className={inputClass}
                  >
                    <option value="">None</option>
                    <option value="junior">Junior Wing</option>
                    <option value="senior">Senior Wing</option>
                    <option value="admin">Administration</option>
                    <option value="operations">Operations</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-brand-text-dim text-xs block mb-1">Home Address</label>
                <textarea 
                  rows={3} 
                  value={editForm.address} 
                  onChange={e => setEditForm({...editForm, address: e.target.value})} 
                  className={`${inputClass} resize-none`}
                  placeholder="Street Address, City, State, ZIP"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <Phone size={16} className="text-brand-text-dim shrink-0" />
                  <div>
                    <p className="text-brand-text-dim text-[11px] uppercase tracking-wider">Phone</p>
                    <p className="font-semibold text-brand-text">{profile.phone || 'N/A'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <HeartPulse size={16} className="text-brand-text-dim shrink-0" />
                  <div>
                    <p className="text-brand-text-dim text-[11px] uppercase tracking-wider">Blood Group</p>
                    <p className="font-semibold text-brand-text">{profile.bloodGroup || 'N/A'}</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <Calendar size={16} className="text-brand-text-dim shrink-0" />
                  <div>
                    <p className="text-brand-text-dim text-[11px] uppercase tracking-wider">Joining Date</p>
                    <p className="font-semibold text-brand-text">
                      {profile.joiningDate ? new Date(profile.joiningDate).toLocaleDateString() : 'N/A'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Briefcase size={16} className="text-brand-text-dim shrink-0" />
                  <div>
                    <p className="text-brand-text-dim text-[11px] uppercase tracking-wider">Wing / Unit</p>
                    <p className="font-semibold text-brand-text capitalize">{profile.wing || 'None'}</p>
                  </div>
                </div>
              </div>
              <div className="h-px bg-brand-card-border my-2"></div>
              <div className="flex items-start gap-3">
                <MapPin size={16} className="text-brand-text-dim shrink-0 mt-0.5" />
                <div>
                  <p className="text-brand-text-dim text-[11px] uppercase tracking-wider">Home Address</p>
                  <p className="font-medium text-brand-text leading-snug whitespace-pre-line">{profile.address || 'N/A'}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Financial & Job Details (Conditionally rendered) */}
        {canSeeFinancials && (
          <div className="bg-brand-card border border-brand-card-border p-6 rounded-2xl flex flex-col justify-between">
            <div>
              <h3 className="text-lg font-bold text-brand-text flex items-center gap-2 mb-6 border-b border-brand-card-border pb-3">
                <DollarSign size={20} className="text-brand-text-dim" /> Financial & Wallet Info
              </h3>
              <div className="space-y-6">
                <div className="p-4 rounded-xl border flex items-center gap-4 bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                  <Wallet size={24} className="shrink-0" />
                  <div>
                    <h4 className="font-bold text-sm">Staff Wallet Active</h4>
                    <p className="text-xs opacity-80 mt-0.5">
                      This staff member has an active wallet for expenses, payouts, and advances.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Emergency Contacts */}
        <div className="bg-brand-card border border-brand-card-border p-6 rounded-2xl md:col-span-2">
          <h3 className="text-lg font-bold text-brand-text flex items-center gap-2 mb-6 border-b border-brand-card-border pb-3">
            <Phone size={20} className="text-orange-500" /> Emergency Information
          </h3>
          {isEditing ? (
            <div className="space-y-4 text-sm">
              <div>
                <label className="text-brand-text-dim text-xs block mb-1">Emergency Contact Details</label>
                <input 
                  type="text" 
                  value={editForm.emergencyContact} 
                  onChange={e => setEditForm({...editForm, emergencyContact: e.target.value})} 
                  className={inputClass} 
                  placeholder="e.g. Jane Doe (Spouse) - 9876543210"
                />
              </div>
            </div>
          ) : (
            <div className="bg-orange-50 dark:bg-orange-950/20 p-5 rounded-xl border border-orange-100 dark:border-orange-900/30 flex items-center gap-4">
              <div className="p-3 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400">
                <Phone size={20} />
              </div>
              <div>
                <p className="text-xs text-brand-text-dim uppercase tracking-wider">Emergency Contact</p>
                <p className="font-bold text-brand-text text-base mt-0.5">{profile.emergencyContact || 'None Listed'}</p>
              </div>
            </div>
          )}
        </div>

        {/* Last Updated text */}
        {!isEditing && (
          <div className="md:col-span-2 text-right mt-2">
            <p className="text-xs text-brand-text-dim italic">
              Last Updated: {profile.updatedAt ? new Date(profile.updatedAt?.toMillis ? profile.updatedAt.toMillis() : profile.updatedAt).toLocaleString() : 'Never'}
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
