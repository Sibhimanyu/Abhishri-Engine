import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, orderBy } from 'firebase/firestore';
import { firestore } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { logAudit } from '../utils/auditLog';
import { ShieldCheck, Search, UserPlus, X, Check, AlertCircle, Clock, Loader } from 'lucide-react';

export default function AdminUserPermissions() {
  const { currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let usersLoaded = false;
    let pendingLoaded = false;
    const checkLoading = () => { if (usersLoaded && pendingLoaded) setLoading(false); };

    const usersRef = collection(firestore, 'allowed_users');
    const unsubscribeUsers = onSnapshot(query(usersRef), (snap) => {
      const usersData = [];
      snap.forEach((doc) => {
        usersData.push({ id: doc.id, ...doc.data() });
      });
      setUsers(usersData);
      usersLoaded = true;
      checkLoading();
    }, (err) => {
      console.warn('Failed to fetch allowed_users:', err);
      usersLoaded = true;
      checkLoading();
    });

    const pendingRef = collection(firestore, 'unauthorized_logins');
    const unsubscribePending = onSnapshot(query(pendingRef, orderBy('timestamp', 'desc')), (snap) => {
      const pendingData = [];
      snap.forEach((doc) => {
        pendingData.push({ id: doc.id, ...doc.data() });
      });
      setPendingRequests(pendingData);
      pendingLoaded = true;
      checkLoading();
    }, (err) => {
      console.warn('Failed to fetch unauthorized logins:', err);
      pendingLoaded = true;
      checkLoading();
    });

    return () => {
      unsubscribeUsers();
      unsubscribePending();
    };
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
      </div>
    );
  }

  const filteredUsers = users.filter(user => 
    user.email?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    user.displayName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const openAddModal = () => {
    setEditingUser({ 
      email: '', 
      displayName: '', 
      role: 'teacher', 
      isAdmin: false
    });
    setIsModalOpen(true);
  };

  const openEditModal = (user) => {
    setEditingUser({ ...JSON.parse(JSON.stringify(user)) });
    setIsModalOpen(true);
  };

  const handleSaveUser = async () => {
    if (!editingUser?.email) return alert('Email is required');
    setSaving(true);
    const emailKey = editingUser.email.toLowerCase().trim();
    const existingUser = users.find(u => u.id === emailKey || u.email?.toLowerCase() === emailKey);
    const newRole = editingUser.role || 'staff';
    const newIsAdmin = !!editingUser.isAdmin;
    try {
      await setDoc(doc(firestore, 'allowed_users', emailKey), {
        email: emailKey,
        displayName: editingUser.displayName || '',
        role: newRole,
        isAdmin: newIsAdmin,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // This is the privilege-escalation surface — log every access-level change with an
      // explicit before/after on role and isAdmin, not just "something was edited".
      logAudit({
        action: existingUser ? 'USER_ACCESS_UPDATED' : 'USER_ACCESS_CREATED',
        module: 'staff_directory',
        targetId: emailKey,
        targetName: editingUser.displayName || emailKey,
        performedBy: currentUser?.email,
        details: {
          role: { from: existingUser?.role ?? null, to: newRole },
          isAdmin: { from: existingUser?.isAdmin ?? false, to: newIsAdmin }
        }
      });

      setIsModalOpen(false);
      setEditingUser(null);
    } catch (err) {
      console.error('Error saving user:', err);
      alert('Failed to save user permissions.');
    } finally {
      setSaving(false);
    }
  };

  const handlePermChange = (module, perm, value) => {
    setEditingUser(prev => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [module]: {
          ...(prev.permissions[module] || {}),
          [perm]: value
        }
      }
    }));
  };

  const dismissRequest = async (email) => {
    try {
      await deleteDoc(doc(firestore, 'unauthorized_logins', email));
    } catch (err) {
      console.error('Failed to dismiss request:', err);
    }
  };

  const approveRequest = (req) => {
    openAddModal();
    setEditingUser(prev => ({ ...prev, email: req.email, displayName: req.displayName }));
    dismissRequest(req.email);
  };

  const filteredPending = pendingRequests.filter(req => 
    !users.some(u => u.email === req.email)
  );

  return (
    <div className="space-y-6">
      
      {/* Pending Requests Alert Block */}
      {filteredPending.length > 0 && (
        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-4">
          <div className="p-4 border-b border-orange-200 dark:border-orange-800/50 flex items-center gap-2 bg-orange-100/50 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200 font-bold">
            <AlertCircle size={18} className="text-orange-600 dark:text-orange-400" />
            Pending Access Requests ({filteredPending.length})
          </div>
          <div className="divide-y divide-orange-200/50 dark:divide-orange-800/30">
            {filteredPending.map(req => {
              const date = req.timestamp?.toDate ? req.timestamp.toDate() : new Date();
              return (
                <div key={req.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-orange-100/20 dark:hover:bg-orange-900/10 transition-colors">
                  <div className="flex items-center gap-3">
                    {req.photoURL ? (
                      <img src={req.photoURL} alt="Avatar" className="w-10 h-10 rounded-full shadow-sm" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-orange-200 dark:bg-orange-800/50 flex items-center justify-center text-orange-700 dark:text-orange-300 font-bold">
                        {req.email?.[0]?.toUpperCase() || '?'}
                      </div>
                    )}
                    <div className="flex flex-col">
                      <span className="font-bold text-brand-text">{req.displayName || 'Unknown User'}</span>
                      <span className="text-sm text-brand-text-dim">{req.email}</span>
                      <span className="text-xs text-brand-text-dim flex items-center gap-1 mt-0.5">
                        <Clock size={12} /> {date.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => dismissRequest(req.email)} className="px-3 py-1.5 rounded-lg text-sm font-medium text-brand-text-dim hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                      Dismiss
                    </button>
                    <button onClick={() => approveRequest(req)} className="px-3 py-1.5 bg-brand-primary hover:bg-brand-primary-hover text-white rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center gap-1.5">
                      <UserPlus size={14} /> Add User
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-brand-card border border-brand-card-border rounded-xl shadow-sm overflow-hidden">
        
        {/* Header Actions */}
        <div className="p-6 border-b border-brand-card-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h3 className="font-semibold text-brand-text flex items-center gap-2 text-lg">
            <ShieldCheck size={20} className="text-brand-primary" />
            Staff & Access Management
          </h3>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-dim" size={16} />
              <input 
                type="text" 
                placeholder="Search staff by email..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-brand-bg border border-brand-card-border rounded-md py-1.5 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all text-brand-text w-full sm:w-64"
              />
            </div>
            <button onClick={openAddModal} className="flex items-center justify-center gap-2 bg-brand-primary hover:bg-brand-primary-hover text-white px-4 py-2 rounded-md font-medium text-sm transition-colors shadow-sm whitespace-nowrap">
              <UserPlus size={16} />
              Add User
            </button>
          </div>
        </div>
        
        {/* Users Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-brand-text-dim">
            <thead className="text-xs uppercase bg-black/5 dark:bg-white/5 text-brand-text">
              <tr>
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4">Key Permissions</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-12 text-center text-brand-text-dim">
                    No users found matching your search.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="border-b border-brand-card-border hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {user.photoURL ? (
                          <img src={user.photoURL} alt="Avatar" className="w-8 h-8 rounded-full shadow-sm" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-brand-secondary/20 flex items-center justify-center text-brand-secondary font-bold">
                            {user.email?.[0]?.toUpperCase() || 'U'}
                          </div>
                        )}
                        <div className="flex flex-col">
                          <span className="font-medium text-brand-text">{user.displayName || 'Unknown Name'}</span>
                          <span className="text-xs text-brand-text-dim">{user.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {user.isAdmin ? (
                        <span className="bg-brand-primary/10 text-brand-primary text-xs font-semibold px-2.5 py-1 rounded-md border border-brand-primary/20">Admin</span>
                      ) : (
                        <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 capitalize">{user.role === 'pro' ? 'PRO' : (user.role || 'Staff')}</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-2">
                        {user.isAdmin ? (
                          <span className="text-xs text-brand-text-dim font-medium italic">Full Access (Super Admin)</span>
                        ) : (
                          <span className="text-xs text-brand-text-dim font-medium italic capitalize">{user.role === 'pro' ? 'PRO' : user.role} Access</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => openEditModal(user)} className="text-brand-primary hover:text-brand-primary-hover font-medium text-sm transition-colors">
                        Edit Access
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit User Modal */}
      {isModalOpen && editingUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-brand-card w-full max-w-2xl rounded-2xl shadow-2xl border border-brand-card-border overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-brand-card-border flex justify-between items-center bg-brand-sidebar shrink-0">
              <h2 className="text-xl font-bold text-brand-text flex items-center gap-2">
                <ShieldCheck className="text-brand-primary" />
                {editingUser.id ? 'Edit User Access' : 'Add New User'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-brand-text-dim hover:text-brand-text p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-brand-text-dim mb-1">Email Address *</label>
                  <input 
                    type="email" 
                    value={editingUser.email} 
                    onChange={e => setEditingUser({...editingUser, email: e.target.value})}
                    disabled={!!editingUser.id}
                    className="w-full bg-brand-bg border border-brand-card-border rounded-lg px-4 py-2 text-brand-text focus:outline-none focus:border-brand-primary disabled:opacity-50" 
                    placeholder="staff@school.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-brand-text-dim mb-1">Display Name</label>
                  <input 
                    type="text" 
                    value={editingUser.displayName || ''} 
                    onChange={e => setEditingUser({...editingUser, displayName: e.target.value})}
                    className="w-full bg-brand-bg border border-brand-card-border rounded-lg px-4 py-2 text-brand-text focus:outline-none focus:border-brand-primary" 
                    placeholder="John Doe"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 border-b border-brand-card-border pb-6">
                <div className="w-full sm:w-auto">
                  <label className="block text-sm font-medium text-brand-text-dim mb-1">Role</label>
                  <select 
                    value={editingUser.role} 
                    onChange={e => setEditingUser({...editingUser, role: e.target.value})}
                    className="w-full sm:w-auto bg-brand-bg border border-brand-card-border rounded-lg px-4 py-2 text-brand-text focus:outline-none focus:border-brand-primary"
                  >
                    <option value="teacher">Teacher</option>
                    <option value="pro">PRO</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="hidden sm:block flex-1"></div>
                <label className="flex items-center gap-2 cursor-pointer bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 px-4 py-2 rounded-lg border border-red-200 dark:border-red-900/30 w-full sm:w-auto">
                  <input 
                    type="checkbox" 
                    checked={editingUser.isAdmin} 
                    onChange={e => setEditingUser({...editingUser, isAdmin: e.target.checked})}
                    className="w-4 h-4 rounded text-red-600 focus:ring-red-500 cursor-pointer"
                  />
                  <span className="font-bold text-sm sm:text-base">Super Admin Access</span>
                </label>
              </div>
              <div className="text-sm text-brand-text-dim border-t border-brand-card-border pt-4 space-y-2">
                <p className="font-bold text-brand-text">Active Role Permissions:</p>
                <div className="bg-black/5 dark:bg-white/5 p-4 rounded-xl border border-brand-card-border">
                  {editingUser.isAdmin || editingUser.role === 'admin' ? (
                    <ul className="list-disc pl-5 space-y-1">
                      <li><span className="font-medium text-brand-text">Admin:</span> Full bypass access to all modules, settings, directories, and ledgers.</li>
                    </ul>
                  ) : editingUser.role === 'pro' ? (
                    <ul className="list-disc pl-5 space-y-1">
                      <li><span className="font-medium text-brand-text">Directories:</span> Full access to View and Manage Student and Staff directories</li>
                      <li><span className="font-medium text-brand-text">Attendance:</span> Full access to mark and edit past attendance</li>
                      <li><span className="font-medium text-brand-text">Fees & Accounting:</span> Can only log and view their own personal expenses</li>
                      <li><span className="font-medium text-brand-text">Communications:</span> No access to WhatsApp Broadcasts</li>
                      <li><span className="font-medium text-brand-text">Smart Campus:</span> Full access to view and control areas</li>
                    </ul>
                  ) : editingUser.role === 'teacher' ? (
                    <ul className="list-disc pl-5 space-y-1">
                      <li><span className="font-medium text-brand-text">Attendance:</span> Can mark daily attendance and view reports</li>
                      <li><span className="font-medium text-brand-text">Directories:</span> View-only access to Staff and Student directories</li>
                      <li><span className="font-medium text-brand-text">Fees & Accounting:</span> Can only log and view their own personal expenses</li>
                    </ul>
                  ) : (
                    <ul className="list-disc pl-5 space-y-1">
                      <li><span className="font-medium text-brand-text">General Staff:</span> View-only access</li>
                    </ul>
                  )}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-brand-card-border bg-brand-sidebar flex justify-end gap-3 shrink-0">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 rounded-lg font-medium text-brand-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                Cancel
              </button>
              <button onClick={handleSaveUser} disabled={saving} className="px-6 py-2 bg-brand-primary hover:bg-brand-primary-hover text-white rounded-lg font-bold transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed min-w-[180px]">
                {saving ? <><Loader className="animate-spin" size={18} /> Saving...</> : <><Check size={18} /> Save Permissions</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
