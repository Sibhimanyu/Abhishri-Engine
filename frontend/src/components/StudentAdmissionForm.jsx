import { ArrowLeft, UserPlus, Save, X, User, Users, HeartPulse, Phone, Loader, Star } from 'lucide-react';
import { calculateNakshatra, TAMIL_NATCHATRAMS, TAMIL_MONTHS } from '../utils/astrologyApi';

export default function StudentAdmissionForm({ studentType, onBack }) {
  const [saving, setSaving] = useState(false);
  const [suggestingNakshatra, setSuggestingNakshatra] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    studentType: studentType, // 'preschool' | 'tuition'
    admissionForClass: '',
    dob: '',
    birthTime: '',
    birthCity: '',
    nakshatra: '',
    tamilMonth: '',
    tamilDay: '',
    gender: '',
    aadhaarNo: '',
    enrollmentDate: new Date().toISOString().split('T')[0],
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
    emergencyContactName: '',
    emergencyRelationship: '',
    emergencyPhone: ''
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert('Student Name is required.');
      return;
    }
    if (!formData.admissionForClass) {
      alert('Please select admission class/grade.');
      return;
    }

    try {
      setSaving(true);
      
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

      const directoryPath = formData.studentType === 'preschool' ? 'preschool_directory' : 'tuition_directory';
      const studentsRef = collection(firestore, 'students');
      
      await addDoc(studentsRef, {
        ...formData,
        nakshatra: nakshatraToSave,
        tamilMonth: tamilMonthToSave,
        tamilDay: tamilDayToSave,
        createdAt: serverTimestamp()
      });

      alert('Student admission registered successfully!');
      onBack(); // Go back to student directory
    } catch (err) {
      console.error('Error during student admission:', err);
      alert('Failed to register student admission. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSuggestNakshatra = async () => {
    if (!formData.dob || !formData.birthTime || !formData.birthCity) {
      alert("Please enter Date of Birth, Time of Birth, and Birth City first.");
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
        alert("Could not fetch a suggestion. Please check your inputs.");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to get suggestion.");
    } finally {
      setSuggestingNakshatra(false);
    }
  };

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
          <ArrowLeft size={18} /> Cancel Admission
        </button>
        <h2 className="text-xl font-extrabold text-brand-text flex items-center gap-2">
          <UserPlus className={studentType === 'preschool' ? 'text-brand-primary' : 'text-brand-secondary'} size={24} />
          {studentType === 'preschool' ? 'New Preschool Admission' : 'New Tuition Admission'}
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* Profile Card Header */}
        <div className="bg-brand-card border border-brand-card-border rounded-2xl p-6 md:p-8 shadow-sm flex flex-col md:flex-row gap-6 items-start">
          <div className={`w-20 h-20 rounded-2xl text-white flex items-center justify-center font-bold text-3xl shadow-inner shrink-0 ${
            studentType === 'preschool' 
              ? 'bg-gradient-to-tr from-brand-primary/80 to-brand-primary' 
              : 'bg-gradient-to-tr from-brand-secondary/80 to-brand-secondary'
          }`}>
            {(formData.name || 'S').charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-brand-text-dim uppercase block mb-1">Student Full Name *</label>
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
              <label className="text-xs font-bold text-brand-text-dim uppercase block mb-1">Class / Grade *</label>
              {studentType === 'preschool' ? (
                <select
                  name="admissionForClass"
                  value={formData.admissionForClass}
                  onChange={handleChange}
                  className={inputClass}
                  required
                >
                  <option value="">Select Class</option>
                  <option value="Playgroup">Playgroup</option>
                  <option value="Nursery">Nursery</option>
                  <option value="LKG">LKG</option>
                  <option value="UKG">UKG</option>
                </select>
              ) : (
                <select
                  name="admissionForClass"
                  value={formData.admissionForClass}
                  onChange={handleChange}
                  className={inputClass}
                  required
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

        {/* Form Sections */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Personal Details */}
          <div className="bg-brand-card border border-brand-card-border p-6 rounded-2xl shadow-sm">
            <h3 className="text-lg font-bold text-brand-text flex items-center gap-2 mb-6 border-b border-brand-card-border pb-3">
              <User size={20} className="text-brand-text-dim" /> Personal Details
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-brand-text-dim text-xs block mb-1">Date of Birth</label>
                <input 
                  type="date" 
                  name="dob"
                  value={formData.dob} 
                  onChange={handleChange} 
                  className={inputClass} 
                />
              </div>
              <div>
                <label className="text-brand-text-dim text-xs block mb-1">Time of Birth</label>
                <input 
                  type="time" 
                  name="birthTime"
                  value={formData.birthTime} 
                  onChange={handleChange} 
                  className={inputClass} 
                />
              </div>
              <div>
                <label className="text-brand-text-dim text-xs block mb-1">Birth City</label>
                <input type="text" name="birthCity" value={formData.birthCity} onChange={handleChange} className={inputClass} placeholder="e.g. Chennai"/>
              </div>
              <div className="col-span-1 sm:col-span-2 md:col-span-1">
                <label className="text-brand-text-dim text-xs block mb-1">Gender</label>
                <select 
                  name="gender"
                  value={formData.gender} 
                  onChange={handleChange} 
                  className={inputClass} 
                >
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
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
                      name="nakshatra"
                      value={formData.nakshatra} 
                      onChange={handleChange} 
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
                      name="tamilMonth"
                      value={formData.tamilMonth} 
                      onChange={handleChange} 
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
                      name="tamilDay"
                      value={formData.tamilDay} 
                      onChange={handleChange} 
                      className={inputClass} 
                    >
                      <option value="">Select Day</option>
                      {Array.from({ length: 32 }, (_, i) => i + 1).map(d => (
                        <option key={d} value={d.toString()}>{d}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-[10px] text-yellow-600/70 mt-3 flex items-center gap-1">
                  Click 'Suggest Details' to auto-calculate based on Date, Time, and City of birth. You can manually override any dropdown if needed.
                </p>
              </div>
              {/* End Astrological Details Block */}
              <div>
                <label className="text-brand-text-dim text-xs block mb-1">Aadhaar No</label>
                <input 
                  type="text" 
                  name="aadhaarNo"
                  value={formData.aadhaarNo} 
                  onChange={handleChange} 
                  className={inputClass} 
                  placeholder="12-digit number"
                />
              </div>
              <div>
                <label className="text-brand-text-dim text-xs block mb-1">Enrollment Date</label>
                <input 
                  type="date" 
                  name="enrollmentDate"
                  value={formData.enrollmentDate} 
                  onChange={handleChange} 
                  className={inputClass} 
                />
              </div>
              <div className="col-span-2">
                <label className="text-brand-text-dim text-xs block mb-1">Student Login Email</label>
                <input 
                  type="email" 
                  name="studentEmail"
                  value={formData.studentEmail} 
                  onChange={handleChange} 
                  className={inputClass} 
                  placeholder="student@example.com (Optional)"
                />
              </div>
              <div className="col-span-2 mt-2">
                <label className="text-brand-text-dim text-xs block mb-1">Street Address</label>
                <input 
                  type="text" 
                  name="address"
                  value={formData.address} 
                  onChange={handleChange} 
                  className={inputClass} 
                  placeholder="Address"
                />
              </div>
              <div>
                <label className="text-brand-text-dim text-xs block mb-1">City</label>
                <input 
                  type="text" 
                  name="city"
                  value={formData.city} 
                  onChange={handleChange} 
                  className={inputClass} 
                  placeholder="City"
                />
              </div>
              <div>
                <label className="text-brand-text-dim text-xs block mb-1">State</label>
                <input 
                  type="text" 
                  name="state"
                  value={formData.state} 
                  onChange={handleChange} 
                  className={inputClass} 
                  placeholder="State"
                />
              </div>
              <div>
                <label className="text-brand-text-dim text-xs block mb-1">Pin Code</label>
                <input 
                  type="text" 
                  name="pinCode"
                  value={formData.pinCode} 
                  onChange={handleChange} 
                  className={inputClass} 
                  placeholder="Pin Code"
                />
              </div>
            </div>
          </div>

          {/* Parents Information */}
          <div className="bg-brand-card border border-brand-card-border p-6 rounded-2xl shadow-sm">
            <h3 className="text-lg font-bold text-brand-text flex items-center gap-2 mb-6 border-b border-brand-card-border pb-3">
              <Users size={20} className="text-brand-text-dim" /> Family Information
            </h3>
            <div className="space-y-6 text-sm">
              {/* Mother Details */}
              <div className="space-y-3">
                <p className="text-brand-secondary text-xs font-bold uppercase tracking-wider">Mother</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-brand-text-dim text-xs block mb-1">Mother's Name</label>
                    <input 
                      type="text" 
                      name="motherName"
                      value={formData.motherName} 
                      onChange={handleChange} 
                      className={inputClass} 
                    />
                  </div>
                  <div>
                    <label className="text-brand-text-dim text-xs block mb-1">Occupation</label>
                    <input 
                      type="text" 
                      name="motherOccupation"
                      value={formData.motherOccupation} 
                      onChange={handleChange} 
                      className={inputClass} 
                    />
                  </div>
                  <div>
                    <label className="text-brand-text-dim text-xs block mb-1">Phone</label>
                    <input 
                      type="tel" 
                      name="motherPhone"
                      value={formData.motherPhone} 
                      onChange={handleChange} 
                      className={inputClass} 
                    />
                  </div>
                  <div>
                    <label className="text-brand-text-dim text-xs block mb-1">Email</label>
                    <input 
                      type="email" 
                      name="motherEmail"
                      value={formData.motherEmail} 
                      onChange={handleChange} 
                      className={inputClass} 
                      placeholder="mother@example.com"
                    />
                  </div>
                </div>
              </div>
              <div className="h-px bg-brand-card-border"></div>
              {/* Father Details */}
              <div className="space-y-3">
                <p className="text-brand-secondary text-xs font-bold uppercase tracking-wider">Father</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-brand-text-dim text-xs block mb-1">Father's Name</label>
                    <input 
                      type="text" 
                      name="fatherName"
                      value={formData.fatherName} 
                      onChange={handleChange} 
                      className={inputClass} 
                    />
                  </div>
                  <div>
                    <label className="text-brand-text-dim text-xs block mb-1">Occupation</label>
                    <input 
                      type="text" 
                      name="fatherOccupation"
                      value={formData.fatherOccupation} 
                      onChange={handleChange} 
                      className={inputClass} 
                    />
                  </div>
                  <div>
                    <label className="text-brand-text-dim text-xs block mb-1">Phone</label>
                    <input 
                      type="tel" 
                      name="fatherPhone"
                      value={formData.fatherPhone} 
                      onChange={handleChange} 
                      className={inputClass} 
                    />
                  </div>
                  <div>
                    <label className="text-brand-text-dim text-xs block mb-1">Email</label>
                    <input 
                      type="email" 
                      name="fatherEmail"
                      value={formData.fatherEmail} 
                      onChange={handleChange} 
                      className={inputClass} 
                      placeholder="father@example.com"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Medical & Emergency Contact */}
          <div className="bg-brand-card border border-brand-card-border p-6 rounded-2xl md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 shadow-sm">
            {/* Medical */}
            <div>
              <h3 className="text-lg font-bold text-brand-text flex items-center gap-2 mb-6 border-b border-brand-card-border pb-3">
                <HeartPulse size={20} className="text-red-500" /> Medical Information
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="text-brand-text-dim text-xs block mb-1">Allergies</label>
                  <input 
                    type="text" 
                    name="allergiesList"
                    value={formData.allergiesList} 
                    onChange={handleChange} 
                    className={inputClass} 
                    placeholder="e.g. Peanuts, Penicillin (leave blank if none)"
                  />
                </div>
                <div>
                  <label className="text-brand-text-dim text-xs block mb-1">Medical Conditions</label>
                  <textarea 
                    name="medicalConditions"
                    value={formData.medicalConditions} 
                    onChange={handleChange} 
                    className={`${inputClass} h-20 resize-none`}
                    placeholder="Describe any chronic medical conditions or notes..."
                  />
                </div>
              </div>
            </div>
            
            {/* Emergency */}
            <div>
              <h3 className="text-lg font-bold text-brand-text flex items-center gap-2 mb-6 border-b border-brand-card-border pb-3">
                <Phone size={20} className="text-orange-500" /> Emergency Contact *
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="text-brand-text-dim text-xs block mb-1">Contact Name *</label>
                  <input 
                    type="text" 
                    name="emergencyContactName"
                    value={formData.emergencyContactName} 
                    onChange={handleChange} 
                    className={inputClass} 
                    required
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-brand-text-dim text-xs block mb-1">Relationship *</label>
                    <input 
                      type="text" 
                      name="emergencyRelationship"
                      value={formData.emergencyRelationship} 
                      onChange={handleChange} 
                      className={inputClass} 
                      placeholder="e.g. Uncle, Mother"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-brand-text-dim text-xs block mb-1">Emergency Phone *</label>
                    <input 
                      type="tel" 
                      name="emergencyPhone"
                      value={formData.emergencyPhone} 
                      onChange={handleChange} 
                      className={inputClass} 
                      required
                    />
                  </div>
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
            className={`flex items-center justify-center gap-1.5 text-white px-8 py-2.5 rounded-lg font-bold text-sm transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${
              studentType === 'preschool' 
                ? 'bg-brand-primary hover:bg-brand-primary-hover' 
                : 'bg-brand-secondary hover:brightness-95'
            }`}
          >
            {saving ? (
              <><Loader className="animate-spin" size={16} /> Processing...</>
            ) : (
              <><Save size={16} /> Complete Admission</>
            )}
          </button>
        </div>

      </form>
    </div>
  );
}
