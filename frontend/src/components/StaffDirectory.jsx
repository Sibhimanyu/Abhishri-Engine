import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, doc, setDoc } from 'firebase/firestore';
import { firestore } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { Search, Briefcase, Phone, Mail, Calendar, ChevronRight, UserPlus, Filter, X, Loader } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import StaffProfile from './StaffProfile';
import StaffOnboardingForm from './StaffOnboardingForm';

export default function StaffDirectory() {
  const { userData } = useAuth();
  const navigate = useNavigate();
  const [staff, setStaff] = useState({});
  const [allowed_users, setAllowedUsers] = useState({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedStaffId, setSelectedStaffId] = useState(null);
  const [selectedStaffDefaultName, setSelectedStaffDefaultName] = useState('');
  const [isAddingStaff, setIsAddingStaff] = useState(false);

  const handleCreateStaff = async (e) => {
    // Migrated to StaffOnboardingForm
  };

  useEffect(() => {
    // Only fetch if user has permission (Admin or staff_directory perms)
    const perms = userData?.permissions?.staff_directory;
    const isMaster = userData?.isAdmin || perms === true;
    
    if (!isMaster && !perms?.view) {
      setLoading(false);
      return;
    }

    const staffRef = collection(firestore, 'staff');
    const unsubStaff = onSnapshot(query(staffRef), (snap) => {
      const staffData = {};
      snap.forEach(doc => {
        staffData[doc.id] = { id: doc.id, ...doc.data() };
      });
      setStaff(staffData);
      setLoading(false);
    }, (error) => {
      console.error("Firestore Error (StaffDirectory):", error);
      setLoading(false);
    });

    const usersRef = collection(firestore, 'allowed_users');
    const unsubFirestore = onSnapshot(query(usersRef), (snap) => {
      const usersData = {};
      snap.forEach((doc) => {
        usersData[doc.id] = { id: doc.id, ...doc.data() };
      });
      setAllowedUsers(usersData);
    });

    return () => {
      unsubStaff();
      unsubFirestore();
    };
  }, [userData]);

  const hasAccess = userData?.isAdmin || userData?.permissions?.staff_directory?.view || userData?.permissions?.staff_directory === true;

  if (!hasAccess) {
    return (
      <div className="flex justify-center items-center h-64 bg-brand-card rounded-xl border border-brand-card-border">
        <div className="text-center">
          <Briefcase className="mx-auto text-brand-text-dim mb-4" size={48} />
          <h3 className="text-xl font-bold text-brand-text mb-2">Access Denied</h3>
          <p className="text-brand-text-dim">You do not have permission to view the Staff Directory.</p>
        </div>
      </div>
    );
  }

  if (isAddingStaff) {
    return (
      <StaffOnboardingForm 
        onBack={() => setIsAddingStaff(false)}
        onSuccess={(id, name) => {
          setIsAddingStaff(false);
          setSelectedStaffId(id);
          setSelectedStaffDefaultName(name);
        }}
      />
    );
  }

  if (selectedStaffId) {
    const perms = userData?.permissions?.staff_directory;
    const isMaster = userData?.isAdmin || perms === true;
    const canEdit = isMaster || perms?.manage;

    return (
      <StaffProfile 
        uid={selectedStaffId}
        defaultName={selectedStaffDefaultName}
        onBack={() => {
          setSelectedStaffId(null);
          setSelectedStaffDefaultName('');
        }}
        canEdit={canEdit}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
      </div>
    );
  }

  // Group everything by email to prevent duplicates if IDs mismatch
  const staffByEmail = new Map();

  // Add from allowed_users
  Object.entries(allowed_users).forEach(([uid, data]) => {
    if (data?.role === 'student' || data?.permissionGroup === 'student' || data?.permissionGroup === 'parent') return;
    const email = (data.email || uid).toLowerCase();
    staffByEmail.set(email, {
      uid: uid,
      data: data,
      profile: Object.values(staff).find(s => s.email && s.email.toLowerCase() === email) || {}
    });
  });

  // Add from staff
  Object.entries(staff).forEach(([uid, profile]) => {
    const email = (profile.email || uid).toLowerCase();
    if (!staffByEmail.has(email)) {
      staffByEmail.set(email, {
        uid: uid,
        data: {}, // No login access
        profile: profile
      });
    } else {
      // Update the profile if it was empty from allowed_users
      const existing = staffByEmail.get(email);
      if (!existing.profile.name) {
         existing.profile = profile;
         staffByEmail.set(email, existing);
      }
    }
  });

  const staffList = Array.from(staffByEmail.values()).map(({ uid, data, profile }) => {
    const userEmail = data.email || profile.email || uid;
    return {
      id: uid,
      email: userEmail,
      name: profile.name || data.displayName || userEmail.split('@')[0],
      designation: profile.designation || (data.isAdmin ? 'Administrator' : 'Staff Member'),
        phone: profile.phone || '',
        joiningDate: profile.joiningDate || '',
        wing: profile.wing || '',
        department: profile.department || '',
        baseSalary: profile.baseSalary || 0,
        bloodGroup: profile.bloodGroup || '',
        address: profile.address || '',
        emergencyContact: profile.emergencyContact || '',
        walletEnabled: !!profile.walletEnabled,
        hasProfile: !!profile.name
      };
    })
    .filter(s => 
      (s.name || '').toLowerCase().includes(search.toLowerCase()) || 
      (s.designation || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.email || '').toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  return (
    <div className="flex flex-col h-full space-y-6">
      
      {/* Controls */}
      <div className="bg-brand-card border border-brand-card-border rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="text-sm font-medium text-brand-text-dim px-2">
          {staffList.length} Staff Profiles
        </div>
        
        <div className="flex flex-1 md:justify-end items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-dim" size={16} />
            <input 
              type="text" 
              placeholder="Search staff..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-brand-bg border border-brand-card-border rounded-lg py-2 pl-9 pr-4 text-sm focus:outline-none focus:border-brand-primary text-brand-text w-full md:w-64 transition-colors"
            />
          </div>
          <button className="bg-brand-bg border border-brand-card-border p-2 rounded-lg text-brand-text-dim hover:text-brand-text hover:border-brand-primary transition-colors">
            <Filter size={18} />
          </button>
          {(userData?.isAdmin || userData?.permissions?.staff_directory?.manage || userData?.permissions?.staff_directory === true) && (
            <button onClick={() => setIsAddingStaff(true)} className="bg-brand-primary text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-brand-primary-hover transition-colors shadow-sm">
              <UserPlus size={16} /> New Staff
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto">
        {staffList.length === 0 ? (
          <div className="bg-brand-card border border-brand-card-border border-dashed rounded-xl p-12 text-center">
            <Briefcase className="mx-auto text-brand-text-dim opacity-50 mb-4" size={48} />
            <h3 className="text-lg font-bold text-brand-text mb-1">No staff members found</h3>
            <p className="text-brand-text-dim text-sm">Try adjusting your search or add a new staff member.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {staffList.map(member => (
              <div 
                key={member.id} 
                onClick={() => { setSelectedStaffId(member.id); setSelectedStaffDefaultName(member.name); }} 
                className="group border border-brand-card-border hover:border-brand-primary/40 rounded-xl p-5 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-primary/5 transition-all cursor-pointer bg-brand-card"
              >
                {/* Card Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-brand-secondary/10 text-brand-secondary flex items-center justify-center font-bold text-xl uppercase">
                      {(member.name || 'S').charAt(0)}
                    </div>
                    <div>
                      <h4 className="font-bold text-brand-text transition-colors">{member.name || 'Unnamed'}</h4>
                      {member.wing && (
                        <span className="text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
                          {member.wing}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Body */}
                <div className="space-y-2 text-sm text-brand-text-dim">
                  <div className="flex justify-between"><span>Designation:</span> <span className="text-brand-text truncate max-w-[140px]">{member.designation || 'Staff Member'}</span></div>
                  <div className="flex justify-between"><span>Phone:</span> <span className="text-brand-text">{member.phone || 'N/A'}</span></div>
                  <div className="flex justify-between"><span>Email:</span> <span className="text-brand-text truncate max-w-[140px] font-mono text-xs">{member.email || 'N/A'}</span></div>
                </div>

                {/* Card Footer */}
                <div className="mt-4 pt-4 border-t border-brand-card-border flex items-center justify-between text-brand-secondary text-sm font-medium transition-colors">
                  View Full Profile
                  <ChevronRight size={16} className="transform group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
