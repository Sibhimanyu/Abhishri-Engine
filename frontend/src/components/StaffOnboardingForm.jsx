import React, { useState } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { firestore } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { logAudit } from '../utils/auditLog';
import { ArrowLeft, UserPlus, Save, X, User, Briefcase, Phone, DollarSign, HeartPulse, Loader, Star } from 'lucide-react';
import { calculateNakshatra, TAMIL_NATCHATRAMS, TAMIL_MONTHS } from '../utils/astrologyApi';

export default function StaffOnboardingForm({ onBack, onSuccess }) {
  const { currentUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    designation: '',
    phone: '',
    dob: '',
    birthTime: '',
    birthCity: '',
    nakshatra: '',
    tamilMonth: '',
    tamilDay: '',
    joiningDate: new Date().toISOString().split('T')[0],
    bloodGroup: '',
    worksInPreschool: false,
    worksInTuition: false,
    address: '',
    emergencyContact: ''
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert('Full Name is required.');
      return;
    }
    if (!formData.email.trim()) {
      alert('Staff Email Address is required.');
      return;
    }

    try {
      setSaving(true);
      const emailKey = formData.email.toLowerCase().trim();
      let nakshatraToSave = formData.nakshatra;
      let tamilMonthToSave = formData.tamilMonth;
      let tamilDayToSave = formData.tamilDay;
      // If dob, birthTime, and birthCity are provided, and nakshatra is not already set, fetch it.
      if (formData.dob && formData.birthTime && formData.birthCity && !nakshatraToSave) {
        const result = await calculateNakshatra(formData.dob, formData.birthTime, formData.birthCity);
        if (result.nakshatra) {
          nakshatraToSave = result.nakshatra;
          tamilMonthToSave = result.tamilMonth;
          tamilDayToSave = result.tamilDay;
        }
      }

      // 1. Create Staff Profile
      await setDoc(doc(firestore, 'staff', emailKey), {
        email: emailKey,
        name: formData.name,
        designation: formData.designation || 'Staff Member',
        worksInPreschool: formData.worksInPreschool,
        worksInTuition: formData.worksInTuition,
        phone: formData.phone,
        dob: formData.dob,
        birthTime: formData.birthTime,
        birthCity: formData.birthCity,
        nakshatra: nakshatraToSave,
        tamilMonth: tamilMonthToSave,
        tamilDay: tamilDayToSave,
        joiningDate: formData.joiningDate,
        bloodGroup: formData.bloodGroup,
        address: formData.address,
        emergencyContact: formData.emergencyContact,
        updatedAt: serverTimestamp()
      }, { merge: true });
      
      // 2. Create Login Access
      await setDoc(doc(firestore, 'allowed_users', emailKey), {
        email: emailKey,
        displayName: formData.name,
        role: 'teacher', // Default role
        updatedAt: serverTimestamp()
      }, { merge: true });

      // 3. Set Wallet Configurations
      await setDoc(doc(firestore, 'staff_wallets', emailKey), {
        walletEnabled: true,
        staffEmail: emailKey,
      }, { merge: true });

      logAudit({
        action: 'STAFF_ONBOARDED',
        module: 'staff_directory',
        targetId: emailKey,
        targetName: formData.name,
        performedBy: currentUser?.email,
        details: { designation: formData.designation, worksInPreschool: formData.worksInPreschool, worksInTuition: formData.worksInTuition }
      });

      alert('Staff member registered successfully!');
      if (onSuccess) {
        onSuccess(emailKey, formData.name);
      } else {
        onBack();
      }
    } catch (err) {
      console.error('Error during staff onboarding:', err);
      alert('Failed to register staff member. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const [suggestingNakshatra, setSuggestingNakshatra] = useState(false);
  const handleSuggestNakshatra = async (isAuto = false) => {
    if (typeof isAuto !== 'boolean') isAuto = false;

    if (!formData.dob || !formData.birthTime || !formData.birthCity) {
      if (!isAuto) alert("Please enter Date of Birth, Time of Birth, and Birth City first.");
      return;
    }
    setSuggestingNakshatra(true);
    try {
      const result = await calculateNakshatra(formData.dob, formData.birthTime, formData.birthCity);
      if (result.nakshatra) {
        setFormData(prev => ({ 
          ...prev, 
          nakshatra: result.nakshatra, 
          tamilMonth: result.tamilMonth,
          tamilDay: result.tamilDay 
        }));
      } else {
        if (!isAuto) alert("Could not fetch a suggestion. Please check your inputs.");
      }
    } catch (err) {
      console.error(err);
      if (!isAuto) alert("Failed to get suggestion.");
    } finally {
      setSuggestingNakshatra(false);
    }
  };

  React.useEffect(() => {
    if (formData.dob && formData.birthTime && formData.birthCity && formData.birthCity.length >= 3) {
      const timer = setTimeout(() => {
        handleSuggestNakshatra(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [formData.dob, formData.birthTime, formData.birthCity]);

  const inputClass = "w-full bg-brand-bg border border-brand-card-border rounded-lg px-3 py-1.5 text-brand-text text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all";

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 max-w-4xl mx-auto">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button 
          type="button"
          onClick={onBack}
          disabled={saving}
          className="flex items-center gap-2 text-brand-text-dim hover:text-brand-text transition-colors font-medium bg-black/5 dark:bg-white/5 px-3 py-1.5 rounded-lg disabled:opacity-50"
        >
          <ArrowLeft size={18} /> Cancel Onboarding
        </button>
        <h2 className="text-xl font-extrabold text-brand-text flex items-center gap-2">
          <UserPlus className="text-brand-primary" size={24} />
          New Staff Onboarding
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* Profile Card Header */}
        <div className="bg-brand-card border border-brand-card-border rounded-2xl p-6 md:p-8 shadow-sm flex flex-col md:flex-row gap-6 items-start">
          <div className="w-20 h-20 rounded-2xl text-white flex items-center justify-center font-bold text-3xl shadow-inner shrink-0 bg-gradient-to-tr from-brand-secondary/80 to-brand-primary/80 uppercase border border-brand-card-border">
            {(formData.name || 'S').charAt(0)}
          </div>
          <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-brand-text-dim uppercase block mb-1">Full Name *</label>
              <input 
                type="text" 
                name="name" 
                value={formData.name} 
                onChange={handleChange} 
                className={`${inputClass} text-base font-bold`}
                placeholder="Enter Name"
                required
              />
            </div>
            <div>
              <label className="text-xs font-bold text-brand-text-dim uppercase block mb-1">Login Email Address *</label>
              <input 
                type="email" 
                name="email" 
                value={formData.email} 
                onChange={handleChange} 
                className={inputClass}
                placeholder="e.g. staff@school.com"
                required
              />
              <p className="text-[10px] text-brand-text-dim mt-1 ml-1">This email acts as their unique ID and login.</p>
            </div>
          </div>
        </div>

        {/* Form Sections */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Employment Details */}
          <div className="bg-brand-card border border-brand-card-border p-6 rounded-2xl shadow-sm">
            <h3 className="text-lg font-bold text-brand-text flex items-center gap-2 mb-6 border-b border-brand-card-border pb-3">
              <Briefcase size={20} className="text-brand-text-dim" /> Employment Details
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-brand-text-dim text-xs block mb-1">Designation</label>
                <input 
                  type="text" 
                  name="designation"
                  value={formData.designation} 
                  onChange={handleChange} 
                  className={inputClass} 
                  placeholder="e.g. Lead Teacher"
                />
              </div>
              <div>
                <label className="text-brand-text-dim text-xs block mb-1">Joining Date</label>
                <input 
                  type="date" 
                  name="joiningDate"
                  value={formData.joiningDate} 
                  onChange={handleChange} 
                  className={inputClass} 
                />
              </div>
              <div className="col-span-1 sm:col-span-2">
                <label className="text-brand-text-dim text-xs block mb-2">Program Assignment</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer bg-black/5 dark:bg-white/5 border border-brand-card-border px-3 py-2 rounded-lg hover:border-brand-primary transition-colors">
                    <input 
                      type="checkbox" 
                      name="worksInPreschool"
                      checked={formData.worksInPreschool} 
                      onChange={handleChange}
                      className="w-4 h-4 rounded text-brand-primary focus:ring-brand-primary cursor-pointer"
                    />
                    <span className="text-sm font-bold text-brand-text">Preschool</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer bg-black/5 dark:bg-white/5 border border-brand-card-border px-3 py-2 rounded-lg hover:border-brand-secondary transition-colors">
                    <input 
                      type="checkbox" 
                      name="worksInTuition"
                      checked={formData.worksInTuition} 
                      onChange={handleChange}
                      className="w-4 h-4 rounded text-brand-secondary focus:ring-brand-secondary cursor-pointer"
                    />
                    <span className="text-sm font-bold text-brand-text">Tuition</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Personal Details */}
          <div className="bg-brand-card border border-brand-card-border p-6 rounded-2xl shadow-sm">
            <h3 className="text-lg font-bold text-brand-text flex items-center gap-2 mb-6 border-b border-brand-card-border pb-3">
              <User size={20} className="text-brand-text-dim" /> Contact & Personal
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-brand-text-dim text-xs block mb-1">Phone Number</label>
                <input 
                  type="tel" 
                  name="phone"
                  value={formData.phone} 
                  onChange={handleChange} 
                  className={inputClass} 
                  placeholder="Phone Number"
                />
              </div>
              <div>
                <label className="text-brand-text-dim text-xs block mb-1">Blood Group</label>
                <input 
                  type="text" 
                  name="bloodGroup"
                  value={formData.bloodGroup} 
                  onChange={handleChange} 
                  className={inputClass} 
                  placeholder="e.g. O+, A-"
                />
              </div>
              <div className="col-span-2 mt-2">
                <label className="text-brand-text-dim text-xs block mb-1">Home Address</label>
                <textarea 
                  name="address"
                  rows={2}
                  value={formData.address} 
                  onChange={handleChange} 
                  className={`${inputClass} resize-none`}
                  placeholder="Street Address, City, State"
                />
              </div>

              {/* Astrological Details Block for Staff */}
              <div className="col-span-2 mt-4 border-t border-brand-card-border pt-4">
                <h4 className="text-sm font-semibold text-brand-text flex items-center gap-2 mb-3">
                  <Star size={16} className="text-yellow-500"/>
                  Astrological Details
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="text-brand-text-dim text-xs block mb-1">Date of Birth</label>
                    <input type="date" name="dob" value={formData.dob} onChange={handleChange} className={inputClass} />
                  </div>
                  <div>
                    <label className="text-brand-text-dim text-xs block mb-1">Time of Birth</label>
                    <input type="time" name="birthTime" value={formData.birthTime} onChange={handleChange} className={inputClass} />
                  </div>
                  <div>
                    <label className="text-brand-text-dim text-xs block mb-1">Birth City</label>
                    <input type="text" name="birthCity" value={formData.birthCity} onChange={handleChange} className={inputClass} placeholder="e.g. Chennai"/>
                  </div>
                </div>

                <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-xs font-medium text-brand-text-dim">Calculated details:</p>
                    <button 
                      type="button"
                      onClick={handleSuggestNakshatra}
                      disabled={suggestingNakshatra}
                      className="flex items-center justify-center gap-1 bg-yellow-500 text-white hover:bg-yellow-600 px-4 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 shadow-sm"
                    >
                      {suggestingNakshatra ? <Loader size={14} className="animate-spin" /> : <Star size={14} />} Suggest Details
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="text-brand-text-dim text-xs block mb-1">Tamil Natchatram</label>
                      <select name="nakshatra" value={formData.nakshatra} onChange={handleChange} className={inputClass}>
                        <option value="">Select Nakshatra</option>
                        {TAMIL_NATCHATRAMS.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-brand-text-dim text-xs block mb-1">Tamil Month</label>
                      <select name="tamilMonth" value={formData.tamilMonth} onChange={handleChange} className={inputClass}>
                        <option value="">Select Month</option>
                        {TAMIL_MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-brand-text-dim text-xs block mb-1">Tamil Day</label>
                      <select name="tamilDay" value={formData.tamilDay} onChange={handleChange} className={inputClass}>
                        <option value="">Select Day</option>
                        {Array.from({ length: 32 }, (_, i) => i + 1).map(d => <option key={d} value={d.toString()}>{d}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Emergency Contact */}
          <div className="bg-brand-card border border-brand-card-border p-6 rounded-2xl shadow-sm">
            <h3 className="text-lg font-bold text-brand-text flex items-center gap-2 mb-6 border-b border-brand-card-border pb-3">
              <Phone size={20} className="text-orange-500" /> Emergency Information
            </h3>
            <div className="space-y-4 text-sm">
              <div>
                <label className="text-brand-text-dim text-xs block mb-1">Emergency Contact Details</label>
                <input 
                  type="text" 
                  name="emergencyContact"
                  value={formData.emergencyContact} 
                  onChange={handleChange} 
                  className={inputClass} 
                  placeholder="e.g. Jane Doe (Spouse) - 9876543210"
                />
              </div>
            </div>
          </div>

          {/* Financial & Wallet */}
          <div className="bg-brand-card border border-brand-card-border p-6 rounded-2xl shadow-sm">
            <h3 className="text-lg font-bold text-brand-text flex items-center gap-2 mb-6 border-b border-brand-card-border pb-3">
              <DollarSign size={20} className="text-emerald-500" /> Financial Settings
            </h3>
            <div className="bg-brand-secondary/5 border border-brand-secondary/20 p-4 rounded-xl mt-2">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-brand-secondary flex items-center justify-center text-white shrink-0">
                  <DollarSign size={12} />
                </div>
                <div>
                  <span className="font-bold text-brand-text text-sm">Staff Wallet</span>
                  <p className="text-xs text-brand-text-dim mt-0.5">A wallet is automatically provisioned for all staff to log expenses and receive payouts.</p>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-4 border-t border-brand-card-border">
          <button 
            type="button" 
            onClick={onBack}
            disabled={saving}
            className="flex items-center gap-1.5 bg-brand-bg border border-brand-card-border hover:bg-black/5 dark:hover:bg-white/5 px-6 py-2.5 rounded-lg font-medium text-sm transition-colors text-brand-text shadow-sm disabled:opacity-50"
          >
            <X size={16} /> Cancel
          </button>
          <button 
            type="submit" 
            disabled={saving}
            className="flex items-center justify-center gap-1.5 text-white px-8 py-2.5 rounded-lg font-bold text-sm transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed bg-brand-primary hover:bg-brand-primary-hover"
          >
            {saving ? (
              <><Loader className="animate-spin" size={16} /> Processing...</>
            ) : (
              <><Save size={16} /> Complete Onboarding</>
            )}
          </button>
        </div>

      </form>
    </div>
  );
}
