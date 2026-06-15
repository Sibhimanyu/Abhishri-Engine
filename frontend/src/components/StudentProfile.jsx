import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { firestore } from '../firebase';
import { ArrowLeft, Edit3, MapPin, Phone, User, Users, HeartPulse, FileText, AlertTriangle, Save, X, UserCheck, Star, Loader } from 'lucide-react';
import { calculateNakshatra, TAMIL_NATCHATRAMS, TAMIL_MONTHS } from '../utils/astrologyApi';

export default function StudentProfile({ studentId, studentType, onBack, canEdit }) {
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suggestingNakshatra, setSuggestingNakshatra] = useState(false);
  
  const [editForm, setEditForm] = useState({
    name: '',
    studentType: 'preschool',
    admissionForClass: '',
    dob: '',
    birthTime: '',
    birthCity: '',
    nakshatra: '',
    tamilMonth: '',
    tamilDay: '',
    gender: '',
    aadhaarNo: '',
    enrollmentDate: '',
    appNumber: '',
    ageAsOfJune: '',
    caste: '',
    religion: '',
    nationality: '',
    studentEmail: '',
    address: '',
    city: '',
    state: '',
    pinCode: '',
    motherName: '',
    motherOccupation: '',
    motherPhone: '',
    motherEmail: '',
    fatherName: '',
    fatherOccupation: '',
    fatherPhone: '',
    fatherEmail: '',
    allergiesList: '',
    medicalConditions: '',
    physicianName: '',
    physicianPhone: '',
    emergencyContactName: '',
    emergencyRelationship: '',
    emergencyPhone: '',
    pickup1Name: '',
    pickup1Rel: '',
    hasSiblings: false,
    sibling1Name: '',
    sibling1Detail: ''
  });

  useEffect(() => {
    async function fetchStudent() {
      try {
        const directoryPath = studentType === 'preschool' ? 'preschool_directory' : 'tuition_directory';
        const docRef = doc(firestore, 'students', studentId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setStudent({ id: snap.id, ...snap.data() });
        }
      } catch (err) {
        console.error('Failed to fetch student profile:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchStudent();
  }, [studentId, studentType]);

  useEffect(() => {
    if (student) {
      setEditForm({
        name: student.name || '',
        studentType: student.studentType || 'preschool',
        admissionForClass: student.admissionForClass || '',
        dob: student.dob || '',
        birthTime: student.birthTime || '',
        birthCity: student.birthCity || '',
        nakshatra: student.nakshatra || '',
        tamilMonth: student.tamilMonth || '',
        tamilDay: student.tamilDay || '',
        gender: student.gender || '',
        aadhaarNo: student.aadhaarNo || '',
        enrollmentDate: student.enrollmentDate || '',
        appNumber: student.appNumber || '',
        ageAsOfJune: student.ageAsOfJune || '',
        caste: student.caste || '',
        religion: student.religion || '',
        nationality: student.nationality || '',
        studentEmail: student.studentEmail || '',
        address: student.address || '',
        city: student.city || '',
        state: student.state || '',
        pinCode: student.pinCode || '',
        motherName: student.motherName || '',
        motherOccupation: student.motherOccupation || '',
        motherPhone: student.motherPhone || '',
        motherEmail: student.motherEmail || '',
        fatherName: student.fatherName || '',
        fatherOccupation: student.fatherOccupation || '',
        fatherPhone: student.fatherPhone || '',
        fatherEmail: student.fatherEmail || '',
        allergiesList: student.allergiesList || '',
        medicalConditions: student.medicalConditions || '',
        physicianName: student.physicianName || '',
        physicianPhone: student.physicianPhone || '',
        emergencyContactName: student.emergencyContactName || '',
        emergencyRelationship: student.emergencyRelationship || '',
        emergencyPhone: student.emergencyPhone || '',
        pickup1Name: student.pickup1Name || '',
        pickup1Rel: student.pickup1Rel || '',
        hasSiblings: student.hasSiblings || false,
        sibling1Name: student.sibling1Name || '',
        sibling1Detail: student.sibling1Detail || ''
      });
    }
  }, [student, isEditing]);

  const handleSave = async () => {
    if (!editForm.name.trim()) {
      alert('Student Name is required.');
      return;
    }
    try {
      setSaving(true);
      const directoryPath = studentType === 'preschool' ? 'preschool_directory' : 'tuition_directory';
      const docRef = doc(firestore, 'students', studentId);
      await updateDoc(docRef, editForm);
      setStudent({ id: studentId, ...editForm });
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to update student profile:', err);
      alert('Failed to update student profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

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

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="text-center py-12">
        <h3 className="text-xl font-bold text-brand-text mb-2">Student Not Found</h3>
        <button onClick={onBack} className="text-brand-primary hover:underline">Go Back</button>
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
                  onClick={() => setIsEditing(false)}
                  disabled={saving}
                  className="flex items-center gap-1.5 bg-brand-bg border border-brand-card-border hover:bg-black/5 dark:hover:bg-white/5 px-4 py-2 rounded-md font-medium text-sm transition-colors text-brand-text shadow-sm disabled:opacity-50"
                >
                  <X size={16} /> Cancel
                </button>
                <button 
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 bg-brand-primary hover:bg-brand-primary-hover text-white px-4 py-2 rounded-md font-bold text-sm transition-colors shadow-sm disabled:opacity-50"
                >
                  {saving ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    <Save size={16} />
                  )}
                  Save Changes
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
        <div className="w-32 h-32 rounded-3xl bg-gradient-to-tr from-brand-secondary/20 to-brand-primary/20 text-brand-text flex items-center justify-center font-bold text-5xl shadow-inner border border-brand-card-border shrink-0">
          {((isEditing ? editForm.name : student.name) || 'S').charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 w-full text-center md:text-left">
          {isEditing ? (
            <div className="space-y-4 max-w-xl">
              <div>
                <label className="text-xs font-bold text-brand-text-dim uppercase block mb-1">Student Name</label>
                <input 
                  type="text" 
                  value={editForm.name} 
                  onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                  className={`${inputClass} text-lg font-bold`}
                  placeholder="Enter Name"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-brand-text-dim uppercase block mb-1">Wing</label>
                  <select
                    value={editForm.studentType}
                    onChange={e => setEditForm({ ...editForm, studentType: e.target.value, admissionForClass: '' })}
                    className={inputClass}
                  >
                    <option value="preschool">Preschool</option>
                    <option value="tuition">Tuition</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-brand-text-dim uppercase block mb-1">Class / Grade</label>
                  {editForm.studentType === 'preschool' ? (
                    <select
                      value={editForm.admissionForClass}
                      onChange={e => setEditForm({ ...editForm, admissionForClass: e.target.value })}
                      className={inputClass}
                    >
                      <option value="">Select Class</option>
                      <option value="Playgroup">Playgroup</option>
                      <option value="Nursery">Nursery</option>
                      <option value="LKG">LKG</option>
                      <option value="UKG">UKG</option>
                    </select>
                  ) : (
                    <select
                      value={editForm.admissionForClass}
                      onChange={e => setEditForm({ ...editForm, admissionForClass: e.target.value })}
                      className={inputClass}
                    >
                      <option value="">Select Grade</option>
                      <option value="Class 1">Class 1</option>
                      <option value="Class 2">Class 2</option>
                      <option value="Class 3">Class 3</option>
                      <option value="Class 4">Class 4</option>
                      <option value="Class 5">Class 5</option>
                      <option value="Class 6">Class 6</option>
                      <option value="Class 7">Class 7</option>
                      <option value="Class 8">Class 8</option>
                      <option value="Class 9">Class 9</option>
                      <option value="Class 10">Class 10</option>
                    </select>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-4xl font-extrabold text-brand-text tracking-tight mb-3">{student.name}</h1>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                  (student.studentType || 'preschool') === 'preschool' 
                    ? 'bg-brand-secondary/10 text-brand-secondary' 
                    : 'bg-yellow-500/10 text-yellow-600'
                }`}>
                  {student.studentType || 'preschool'}
                </span>
                <span className="bg-black/5 dark:bg-white/5 text-brand-text-dim px-3 py-1 rounded-full text-xs font-mono">
                  UID: {student.id.slice(-8).toUpperCase()}
                </span>
                {student.admissionForClass && (
                  <span className="bg-black/5 dark:bg-white/5 text-brand-text-dim px-3 py-1 rounded-full text-xs font-semibold">
                    Class: {student.admissionForClass}
                  </span>
                )}
                {student.appNumber && (
                  <span className="bg-brand-primary/10 text-brand-primary px-3 py-1 rounded-full text-xs font-semibold">
                    App No: {student.appNumber}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Profile Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Personal Info */}
        <div className="bg-brand-card border border-brand-card-border p-6 rounded-2xl">
          <h3 className="text-lg font-bold text-brand-text flex items-center gap-2 mb-6 border-b border-brand-card-border pb-3">
            <User size={20} className="text-brand-text-dim" /> Personal Details
          </h3>
          {isEditing ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <label className="text-brand-text-dim text-xs block mb-1">Date of Birth</label>
                <input type="date" value={editForm.dob} onChange={e => setEditForm({...editForm, dob: e.target.value})} className={inputClass} />
              </div>
              <div>
                <label className="text-brand-text-dim text-xs block mb-1">Time of Birth</label>
                <input type="time" value={editForm.birthTime} onChange={e => setEditForm({...editForm, birthTime: e.target.value})} className={inputClass} />
              </div>
              <div>
                <label className="text-brand-text-dim text-xs block mb-1">Birth City</label>
                <input type="text" value={editForm.birthCity} onChange={e => setEditForm({...editForm, birthCity: e.target.value})} className={inputClass} placeholder="e.g. Chennai"/>
              </div>

              {/* Astrological Details Block */}
              <div className="col-span-1 sm:col-span-2 md:col-span-3 bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-4 mt-2">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-semibold text-brand-text flex items-center gap-2">
                    <Star size={16} className="text-yellow-500"/>
                    Astrological Details
                  </h4>
                  <button 
                    type="button"
                    onClick={handleSuggestNakshatra}
                    disabled={suggestingNakshatra}
                    className="flex items-center justify-center gap-1 bg-yellow-500 text-white hover:bg-yellow-600 px-4 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 shadow-sm"
                  >
                    {suggestingNakshatra ? <Loader size={14} className="animate-spin" /> : <Star size={14} />} Suggest Details
                  </button>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="text-brand-text-dim text-xs block mb-1">Tamil Natchatram</label>
                    <select 
                      value={editForm.nakshatra} 
                      onChange={e => setEditForm({...editForm, nakshatra: e.target.value})} 
                      className={inputClass} 
                    >
                      <option value="">Select Nakshatra</option>
                      {TAMIL_NATCHATRAMS.map(n => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-brand-text-dim text-xs block mb-1">Tamil Month</label>
                    <select 
                      value={editForm.tamilMonth} 
                      onChange={e => setEditForm({...editForm, tamilMonth: e.target.value})} 
                      className={inputClass} 
                    >
                      <option value="">Select Month</option>
                      {TAMIL_MONTHS.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-brand-text-dim text-xs block mb-1">Tamil Day</label>
                    <select 
                      value={editForm.tamilDay} 
                      onChange={e => setEditForm({...editForm, tamilDay: e.target.value})} 
                      className={inputClass} 
                    >
                      <option value="">Select Day</option>
                      {Array.from({ length: 32 }, (_, i) => i + 1).map(d => (
                        <option key={d} value={d.toString()}>{d}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              {/* End Astrological Details Block */}

              <div>
                <label className="text-brand-text-dim text-xs block mb-1">Age as of June</label>
                <input type="text" value={editForm.ageAsOfJune} onChange={e => setEditForm({...editForm, ageAsOfJune: e.target.value})} className={inputClass} placeholder="e.g. 2 Years 10 Months" />
              </div>
              <div>
                <label className="text-brand-text-dim text-xs block mb-1">Gender</label>
                <select value={editForm.gender} onChange={e => setEditForm({...editForm, gender: e.target.value})} className={inputClass}>
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-brand-text-dim text-xs block mb-1">Aadhaar No</label>
                <input type="text" value={editForm.aadhaarNo} onChange={e => setEditForm({...editForm, aadhaarNo: e.target.value})} className={inputClass} placeholder="12-digit number"/>
              </div>
              <div>
                <label className="text-brand-text-dim text-xs block mb-1">Nationality</label>
                <input type="text" value={editForm.nationality} onChange={e => setEditForm({...editForm, nationality: e.target.value})} className={inputClass} placeholder="e.g. Indian"/>
              </div>
              <div>
                <label className="text-brand-text-dim text-xs block mb-1">Religion</label>
                <input type="text" value={editForm.religion} onChange={e => setEditForm({...editForm, religion: e.target.value})} className={inputClass} placeholder="e.g. Hindu"/>
              </div>
              <div>
                <label className="text-brand-text-dim text-xs block mb-1">Caste</label>
                <input type="text" value={editForm.caste} onChange={e => setEditForm({...editForm, caste: e.target.value})} className={inputClass} placeholder="e.g. BC"/>
              </div>
              <div>
                <label className="text-brand-text-dim text-xs block mb-1">Enrollment Date</label>
                <input type="date" value={editForm.enrollmentDate} onChange={e => setEditForm({...editForm, enrollmentDate: e.target.value})} className={inputClass} />
              </div>
              <div>
                <label className="text-brand-text-dim text-xs block mb-1">Application No</label>
                <input type="text" value={editForm.appNumber} onChange={e => setEditForm({...editForm, appNumber: e.target.value})} className={inputClass} />
              </div>
              <div className="col-span-1 sm:col-span-2 mt-2">
                <label className="text-brand-text-dim text-xs block mb-1">Student Login Email</label>
                <input type="email" value={editForm.studentEmail} onChange={e => setEditForm({...editForm, studentEmail: e.target.value})} className={inputClass} placeholder="student@example.com (Optional)"/>
              </div>
              <div className="col-span-1 sm:col-span-2 mt-2">
                <label className="text-brand-text-dim text-xs block mb-1">Street Address</label>
                <input type="text" value={editForm.address} onChange={e => setEditForm({...editForm, address: e.target.value})} className={inputClass} placeholder="Address"/>
              </div>
              <div>
                <label className="text-brand-text-dim text-xs block mb-1">City</label>
                <input type="text" value={editForm.city} onChange={e => setEditForm({...editForm, city: e.target.value})} className={inputClass} placeholder="City"/>
              </div>
              <div>
                <label className="text-brand-text-dim text-xs block mb-1">State</label>
                <input type="text" value={editForm.state} onChange={e => setEditForm({...editForm, state: e.target.value})} className={inputClass} placeholder="State"/>
              </div>
              <div>
                <label className="text-brand-text-dim text-xs block mb-1">Pin Code</label>
                <input type="text" value={editForm.pinCode} onChange={e => setEditForm({...editForm, pinCode: e.target.value})} className={inputClass} placeholder="Pin Code"/>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-4 gap-x-2 text-sm">
              <div><p className="text-brand-text-dim text-xs">Date of Birth</p><p className="font-medium text-brand-text">{student.dob || 'N/A'}</p></div>
              <div><p className="text-brand-text-dim text-xs">Time & Place of Birth</p><p className="font-medium text-brand-text">{(student.birthTime || student.birthCity) ? `${student.birthTime || ''} ${student.birthCity ? `(${student.birthCity})` : ''}` : 'N/A'}</p></div>
              <div><p className="text-brand-text-dim text-xs">Tamil Natchatram</p><p className="font-medium text-brand-text">{student.nakshatra || 'N/A'}</p></div>
              
              <div><p className="text-brand-text-dim text-xs">Tamil Birthday</p><p className="font-medium text-brand-text">{(student.tamilMonth && student.tamilDay) ? `${student.tamilMonth} ${student.tamilDay}` : 'N/A'}</p></div>
              <div><p className="text-brand-text-dim text-xs">Age (As of June)</p><p className="font-medium text-brand-text">{student.ageAsOfJune || 'N/A'}</p></div>
              <div><p className="text-brand-text-dim text-xs">Gender</p><p className="font-medium text-brand-text">{student.gender || 'N/A'}</p></div>
              
              <div><p className="text-brand-text-dim text-xs">Aadhaar No</p><p className="font-medium text-brand-text">{student.aadhaarNo || 'N/A'}</p></div>
              <div><p className="text-brand-text-dim text-xs">Nationality</p><p className="font-medium text-brand-text">{student.nationality || 'N/A'}</p></div>
              <div><p className="text-brand-text-dim text-xs">Religion & Caste</p><p className="font-medium text-brand-text">{(student.religion || student.caste) ? `${student.religion || ''} ${student.caste ? `(${student.caste})` : ''}` : 'N/A'}</p></div>
              
              <div><p className="text-brand-text-dim text-xs">Enrollment Date</p><p className="font-medium text-brand-text">{student.enrollmentDate || 'N/A'}</p></div>
              <div className="col-span-2"><p className="text-brand-text-dim text-xs">Student Login Email</p><p className="font-medium text-brand-text font-mono">{student.studentEmail || 'N/A'}</p></div>
              
              <div className="col-span-3 mt-2 border-t border-brand-card-border pt-4">
                <p className="text-brand-text-dim text-xs flex items-center gap-1 mb-1"><MapPin size={12}/> Address</p>
                <p className="font-medium text-brand-text leading-snug">
                  {student.address || 'N/A'}
                  {(student.city || student.state || student.pinCode) && <br/>}
                  {[student.city, student.state, student.pinCode].filter(Boolean).join(', ')}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Parents Details */}
        <div className="bg-brand-card border border-brand-card-border p-6 rounded-2xl flex flex-col h-full">
          <h3 className="text-lg font-bold text-brand-text flex items-center gap-2 mb-6 border-b border-brand-card-border pb-3">
            <Users size={20} className="text-brand-text-dim" /> Family Information
          </h3>
          {isEditing ? (
            <div className="space-y-6 text-sm flex-1">
              {/* Mother Details */}
              <div className="space-y-3">
                <p className="text-brand-secondary text-xs font-bold uppercase tracking-wider">Mother</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-brand-text-dim text-xs block mb-1">Name</label>
                    <input type="text" value={editForm.motherName} onChange={e => setEditForm({...editForm, motherName: e.target.value})} className={inputClass} />
                  </div>
                  <div>
                    <label className="text-brand-text-dim text-xs block mb-1">Occupation</label>
                    <input type="text" value={editForm.motherOccupation} onChange={e => setEditForm({...editForm, motherOccupation: e.target.value})} className={inputClass} />
                  </div>
                  <div>
                    <label className="text-brand-text-dim text-xs block mb-1">Phone</label>
                    <input type="tel" value={editForm.motherPhone} onChange={e => setEditForm({...editForm, motherPhone: e.target.value})} className={inputClass} />
                  </div>
                  <div>
                    <label className="text-brand-text-dim text-xs block mb-1">Email</label>
                    <input type="email" value={editForm.motherEmail} onChange={e => setEditForm({...editForm, motherEmail: e.target.value})} className={inputClass} />
                  </div>
                </div>
              </div>
              <div className="h-px bg-brand-card-border"></div>
              {/* Father Details */}
              <div className="space-y-3">
                <p className="text-brand-secondary text-xs font-bold uppercase tracking-wider">Father</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-brand-text-dim text-xs block mb-1">Name</label>
                    <input type="text" value={editForm.fatherName} onChange={e => setEditForm({...editForm, fatherName: e.target.value})} className={inputClass} />
                  </div>
                  <div>
                    <label className="text-brand-text-dim text-xs block mb-1">Occupation</label>
                    <input type="text" value={editForm.fatherOccupation} onChange={e => setEditForm({...editForm, fatherOccupation: e.target.value})} className={inputClass} />
                  </div>
                  <div>
                    <label className="text-brand-text-dim text-xs block mb-1">Phone</label>
                    <input type="tel" value={editForm.fatherPhone} onChange={e => setEditForm({...editForm, fatherPhone: e.target.value})} className={inputClass} />
                  </div>
                  <div>
                    <label className="text-brand-text-dim text-xs block mb-1">Email</label>
                    <input type="email" value={editForm.fatherEmail} onChange={e => setEditForm({...editForm, fatherEmail: e.target.value})} className={inputClass} />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6 flex-1">
              <div>
                <p className="text-brand-secondary text-xs font-bold uppercase tracking-wider mb-2">Mother</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="font-medium text-brand-text">{student.motherName || 'N/A'}</p>
                    <p className="text-brand-text-dim text-xs">{student.motherOccupation || 'No Occupation'}</p>
                  </div>
                  <div className="text-right space-y-1">
                    <p className="font-medium text-brand-text flex items-center justify-end gap-1"><Phone size={12}/> {student.motherPhone || 'N/A'}</p>
                    {student.motherEmail && <p className="text-brand-text-dim text-xs font-mono">{student.motherEmail}</p>}
                  </div>
                </div>
              </div>
              <div className="h-px bg-brand-card-border"></div>
              <div>
                <p className="text-brand-secondary text-xs font-bold uppercase tracking-wider mb-2">Father</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="font-medium text-brand-text">{student.fatherName || 'N/A'}</p>
                    <p className="text-brand-text-dim text-xs">{student.fatherOccupation || 'No Occupation'}</p>
                  </div>
                  <div className="text-right space-y-1">
                    <p className="font-medium text-brand-text flex items-center justify-end gap-1"><Phone size={12}/> {student.fatherPhone || 'N/A'}</p>
                    {student.fatherEmail && <p className="text-brand-text-dim text-xs font-mono">{student.fatherEmail}</p>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Medical & Emergency */}
        <div className="bg-brand-card border border-brand-card-border p-6 rounded-2xl grid grid-cols-1 md:grid-cols-2 gap-6 lg:col-span-2">
          {/* Medical */}
          <div>
            <h3 className="text-lg font-bold text-brand-text flex items-center gap-2 mb-6 border-b border-brand-card-border pb-3">
              <HeartPulse size={20} className="text-red-500" /> Medical Profile
            </h3>
            {isEditing ? (
              <div className="space-y-4 text-sm">
                <div>
                  <label className="text-brand-text-dim text-xs block mb-1">Allergies</label>
                  <input type="text" value={editForm.allergiesList} onChange={e => setEditForm({...editForm, allergiesList: e.target.value})} className={inputClass} placeholder="e.g. Peanuts, None" />
                </div>
                <div>
                  <label className="text-brand-text-dim text-xs block mb-1">Medical Conditions</label>
                  <textarea value={editForm.medicalConditions} onChange={e => setEditForm({...editForm, medicalConditions: e.target.value})} className={`${inputClass} h-16 resize-none`} placeholder="Describe any chronic medical conditions..." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-brand-text-dim text-xs block mb-1">Physician Name</label>
                    <input type="text" value={editForm.physicianName} onChange={e => setEditForm({...editForm, physicianName: e.target.value})} className={inputClass} />
                  </div>
                  <div>
                    <label className="text-brand-text-dim text-xs block mb-1">Physician Phone</label>
                    <input type="tel" value={editForm.physicianPhone} onChange={e => setEditForm({...editForm, physicianPhone: e.target.value})} className={inputClass} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-sm">
                <div className="flex gap-2">
                  <AlertTriangle size={16} className={student.allergiesList ? 'text-red-500' : 'text-brand-text-dim'} />
                  <div>
                    <p className="text-brand-text-dim text-xs">Allergies</p>
                    <p className={`font-medium ${student.allergiesList ? 'text-red-500 dark:text-red-400' : 'text-brand-text'}`}>{student.allergiesList || 'None Reported'}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <FileText size={16} className="text-brand-text-dim" />
                  <div>
                    <p className="text-brand-text-dim text-xs">Conditions</p>
                    <p className="font-medium text-brand-text">{student.medicalConditions || 'None Reported'}</p>
                  </div>
                </div>
                {student.physicianName && (
                  <div className="bg-black/5 dark:bg-white/5 p-3 rounded-lg border border-brand-card-border mt-2">
                    <p className="text-brand-text-dim text-xs">Primary Physician</p>
                    <p className="font-medium text-brand-text">{student.physicianName}</p>
                    <p className="text-brand-text text-xs flex items-center gap-1 mt-1"><Phone size={10}/> {student.physicianPhone || 'No Phone'}</p>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Emergency & Pickup */}
          <div>
            <h3 className="text-lg font-bold text-brand-text flex items-center gap-2 mb-6 border-b border-brand-card-border pb-3">
              <Phone size={20} className="text-orange-500" /> Emergency & Pickup
            </h3>
            {isEditing ? (
              <div className="space-y-4 text-sm">
                <p className="text-brand-text-dim text-xs font-bold uppercase tracking-wider -mb-2">Emergency Contact</p>
                <div>
                  <label className="text-brand-text-dim text-xs block mb-1">Contact Name</label>
                  <input type="text" value={editForm.emergencyContactName} onChange={e => setEditForm({...editForm, emergencyContactName: e.target.value})} className={inputClass} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-brand-text-dim text-xs block mb-1">Relationship</label>
                    <input type="text" value={editForm.emergencyRelationship} onChange={e => setEditForm({...editForm, emergencyRelationship: e.target.value})} className={inputClass} />
                  </div>
                  <div>
                    <label className="text-brand-text-dim text-xs block mb-1">Phone</label>
                    <input type="tel" value={editForm.emergencyPhone} onChange={e => setEditForm({...editForm, emergencyPhone: e.target.value})} className={inputClass} />
                  </div>
                </div>
                
                <div className="h-px bg-brand-card-border my-2"></div>
                <p className="text-brand-text-dim text-xs font-bold uppercase tracking-wider -mb-2">Authorized Pickup</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-brand-text-dim text-xs block mb-1">Name</label>
                    <input type="text" value={editForm.pickup1Name} onChange={e => setEditForm({...editForm, pickup1Name: e.target.value})} className={inputClass} />
                  </div>
                  <div>
                    <label className="text-brand-text-dim text-xs block mb-1">Relationship</label>
                    <input type="text" value={editForm.pickup1Rel} onChange={e => setEditForm({...editForm, pickup1Rel: e.target.value})} className={inputClass} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-orange-50 dark:bg-orange-950/20 p-4 rounded-xl border border-orange-100 dark:border-orange-900/30">
                  <p className="text-orange-600 dark:text-orange-500 text-xs font-bold uppercase tracking-wider mb-1">Emergency Contact</p>
                  <p className="font-bold text-brand-text text-lg">{student.emergencyContactName || 'N/A'}</p>
                  <p className="text-orange-600 dark:text-orange-400 font-medium text-sm mb-2">{student.emergencyRelationship || 'Relationship Not Set'}</p>
                  <p className="font-black text-xl text-orange-600 dark:text-orange-500 flex items-center gap-2">
                    <Phone size={18} /> {student.emergencyPhone || 'No Phone'}
                  </p>
                </div>
                
                {student.pickup1Name && (
                  <div className="flex items-center justify-between p-3 border border-brand-card-border rounded-lg bg-brand-bg">
                    <div>
                      <p className="text-brand-text-dim text-xs font-bold uppercase tracking-wider mb-0.5">Authorized Pickup</p>
                      <p className="font-medium text-brand-text">{student.pickup1Name}</p>
                    </div>
                    <div className="text-right">
                      <span className="bg-brand-primary/10 text-brand-primary px-2 py-0.5 rounded text-xs font-bold">{student.pickup1Rel}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Other Information (Siblings) */}
        <div className="bg-brand-card border border-brand-card-border p-6 rounded-2xl lg:col-span-2">
          <h3 className="text-lg font-bold text-brand-text flex items-center gap-2 mb-6 border-b border-brand-card-border pb-3">
            <UserCheck size={20} className="text-brand-text-dim" /> Sibling Information
          </h3>
          {isEditing ? (
            <div className="space-y-4 text-sm">
              <label className="flex items-center gap-2 text-brand-text cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={editForm.hasSiblings}
                  onChange={e => setEditForm({...editForm, hasSiblings: e.target.checked})}
                  className="w-4 h-4 text-brand-primary rounded focus:ring-brand-primary"
                />
                Student has siblings studying here
              </label>
              
              {editForm.hasSiblings && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-black/5 dark:bg-white/5 rounded-lg border border-brand-card-border">
                  <div>
                    <label className="text-brand-text-dim text-xs block mb-1">Sibling Name</label>
                    <input type="text" value={editForm.sibling1Name} onChange={e => setEditForm({...editForm, sibling1Name: e.target.value})} className={inputClass} placeholder="Name" />
                  </div>
                  <div>
                    <label className="text-brand-text-dim text-xs block mb-1">Class / Grade</label>
                    <input type="text" value={editForm.sibling1Detail} onChange={e => setEditForm({...editForm, sibling1Detail: e.target.value})} className={inputClass} placeholder="e.g. LKG" />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              {student.hasSiblings ? (
                <div className="inline-flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-brand-bg border border-brand-card-border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-brand-primary/10 flex items-center justify-center text-brand-primary"><Users size={18}/></div>
                    <div>
                      <p className="font-bold text-brand-text">{student.sibling1Name || 'Unnamed Sibling'}</p>
                      <p className="text-brand-text-dim text-xs">{student.sibling1Detail || 'Class Unknown'}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-brand-text-dim text-sm">No siblings reported.</p>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
