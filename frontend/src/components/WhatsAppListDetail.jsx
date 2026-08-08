import React, { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, getDocs, doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { firestore } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { logAudit } from '../utils/auditLog';
import { Users, Upload, Edit, Trash2, ArrowLeft, UserPlus, Search, X, Loader, Phone, Download } from 'lucide-react';
import Papa from 'papaparse';

export default function WhatsAppListDetail({ list, onBack, onListDeleted }) {
  const { currentUser } = useAuth();
  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditingList, setIsEditingList] = useState(false);
  
  // List Edit Form
  const [editName, setEditName] = useState(list.name || '');
  const [editCategory, setEditCategory] = useState(list.category || 'MARKETING');

  // Manual Add Modal
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (list.isDynamic) {
      const fetchDynamic = async () => {
        const temp = [];
        const processStudent = (sDoc) => {
          const data = sDoc.data();
          if (data.fatherPhone) temp.push({ id: sDoc.id + '_f', name: data.fatherName || 'Parent', phone: data.fatherPhone });
          if (data.motherPhone) temp.push({ id: sDoc.id + '_m', name: data.motherName || 'Parent', phone: data.motherPhone });
        };
        try {
          const snap = await getDocs(collection(firestore, 'students'));
          snap.forEach(processStudent);
          setMembers(temp);
        } catch (err) {
          console.error("Error fetching dynamic members:", err);
        } finally {
          setLoading(false);
        }
      };
      fetchDynamic();
      return;
    }

    const unsub = onSnapshot(collection(firestore, 'whatsapp_lists', list.id, 'members'), (snap) => {
      const data = [];
      snap.forEach(doc => data.push({ id: doc.id, ...doc.data() }));
      setMembers(data);
      setLoading(false);
    });
    return () => unsub();
  }, [list]);

  const handleDeleteList = async () => {
    if (list.isDynamic) return alert('Cannot delete the dynamic system list.');
    if (!window.confirm("Are you sure you want to delete this list? All contacts within it will be removed.")) return;
    setSaving(true);
    try {
      await deleteDoc(doc(firestore, 'whatsapp_lists', list.id));
      logAudit({
        action: 'WHATSAPP_LIST_DELETED',
        module: 'whatsapp_sender',
        targetId: list.id,
        targetName: list.name,
        performedBy: currentUser?.email,
        details: { memberCount: members.length }
      });
      onListDeleted();
    } catch (err) {
      console.error(err);
      alert('Failed to delete list');
      setSaving(false);
    }
  };

  const handleUpdateList = async () => {
    if (!editName.trim()) return alert("List name required");
    setSaving(true);
    try {
      await setDoc(doc(firestore, 'whatsapp_lists', list.id), {
        name: editName,
        category: editCategory
      }, { merge: true });
      setIsEditingList(false);
    } catch (err) {
      console.error(err);
      alert('Failed to update list metadata');
    } finally {
      setSaving(false);
    }
  };

  const handleAddContact = async (e) => {
    e.preventDefault();
    if (!newContactName.trim() || !newContactPhone.trim()) return;
    
    // Simple sanitization
    let phone = newContactPhone.replace(/\D/g, '');
    if (!phone.startsWith('91') && phone.length === 10) {
      phone = '91' + phone;
    }
    
    setSaving(true);
    try {
      const memberId = Date.now().toString();
      await setDoc(doc(firestore, 'whatsapp_lists', list.id, 'members', memberId), {
        name: newContactName,
        phone: phone
      });
      await setDoc(doc(firestore, 'whatsapp_lists', list.id), {
        count: Math.max(0, list.count) + 1
      }, { merge: true });
      
      setNewContactName('');
      setNewContactPhone('');
      setIsAddingContact(false);
    } catch (err) {
      console.error("Failed to add contact:", err);
      alert("Failed to add contact");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMember = async (memberId) => {
    if (!window.confirm("Remove this member from the list?")) return;
    const member = members.find(m => m.id === memberId);
    try {
      await deleteDoc(doc(firestore, 'whatsapp_lists', list.id, 'members', memberId));
      await setDoc(doc(firestore, 'whatsapp_lists', list.id), {
        count: Math.max(0, members.length - 1)
      }, { merge: true });

      logAudit({
        action: 'WHATSAPP_CONTACT_REMOVED',
        module: 'whatsapp_sender',
        targetId: memberId,
        targetName: member?.name || member?.phone || memberId,
        performedBy: currentUser?.email,
        details: { listId: list.id, listName: list.name, phone: member?.phone || null }
      });
    } catch (err) {
      console.error(err);
      alert('Failed to remove member');
    }
  };

  const handleCSVImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setSaving(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const batch = writeBatch(firestore);
          let count = 0;
          
          results.data.forEach(row => {
            const name = row.Name || row.name || row.NAME || 'Unknown';
            let phone = row.Phone || row.phone || row.PHONE || row.Number || row.number || '';
            
            phone = phone.toString().replace(/\D/g, '');
            if (!phone) return;
            if (!phone.startsWith('91') && phone.length === 10) phone = '91' + phone;
            
            const memberId = Date.now().toString() + Math.random().toString(36).substring(7);
            const ref = doc(firestore, 'whatsapp_lists', list.id, 'members', memberId);
            batch.set(ref, { name, phone });
            count++;
          });
          
          if (count > 0) {
            await batch.commit();
            await setDoc(doc(firestore, 'whatsapp_lists', list.id), {
              count: members.length + count
            }, { merge: true });

            logAudit({
              action: 'WHATSAPP_CONTACTS_IMPORTED',
              module: 'whatsapp_sender',
              targetId: list.id,
              targetName: list.name,
              performedBy: currentUser?.email,
              details: { importedCount: count, fileName: file.name }
            });

            alert(`Successfully imported ${count} contacts!`);
          } else {
            alert('No valid contacts found. Please ensure your CSV has "Name" and "Phone" columns.');
          }
        } catch (err) {
          console.error("CSV Import Error:", err);
          alert('Failed to import contacts.');
        } finally {
          setSaving(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      },
      error: (error) => {
        console.error("PapaParse error:", error);
        alert('Failed to parse CSV file');
        setSaving(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    });
  };

  const downloadTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8,Name,Phone\nJohn Doe,919876543210\nJane Smith,919988776655";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "audience_list_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredMembers = members.filter(m => 
    (m.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (m.phone || '').includes(search)
  );

  return (
    <div className="flex h-full bg-brand-bg rounded-xl overflow-hidden border border-brand-card-border m-6 shadow-sm flex-col animate-in fade-in zoom-in-95 duration-200">
      
      {/* Header Actions */}
      <div className="p-4 border-b border-brand-card-border bg-brand-card flex items-center justify-between shrink-0">
        <button 
          onClick={onBack}
          disabled={saving}
          className="flex items-center gap-2 text-brand-text-dim hover:text-brand-text transition-colors font-medium bg-black/5 dark:bg-white/5 px-3 py-1.5 rounded-lg disabled:opacity-50"
        >
          <ArrowLeft size={18} /> Back to Lists
        </button>

        {!list.isDynamic && (
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsEditingList(true)}
              className="p-2 text-brand-text-dim hover:text-brand-primary transition-colors hover:bg-brand-primary/10 rounded-lg"
              title="Edit List Metadata"
            >
              <Edit size={18} />
            </button>
            <button 
              onClick={handleDeleteList}
              className="p-2 text-brand-text-dim hover:text-red-500 transition-colors hover:bg-red-500/10 rounded-lg"
              title="Delete List"
            >
              <Trash2 size={18} />
            </button>
          </div>
        )}
      </div>

      {/* Hero Section */}
      <div className="bg-brand-sidebar border-b border-brand-card-border p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 shrink-0">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-extrabold text-brand-text tracking-tight">{list.name}</h1>
            <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase ${list.category === 'UTILITY' ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20' : list.category === 'INTERNAL' ? 'bg-orange-500/10 text-orange-500 border border-orange-500/20' : 'bg-purple-500/10 text-purple-500 border border-purple-500/20'}`}>
              {list.category || 'MARKETING'}
            </span>
            {list.isDynamic && (
              <span className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase bg-brand-secondary/10 text-brand-secondary border border-brand-secondary/20">
                Dynamic
              </span>
            )}
          </div>
          <p className="text-brand-text-dim flex items-center gap-2 font-medium">
            <Users size={16} className="text-brand-primary" />
            {members.length} {members.length === 1 ? 'Contact' : 'Contacts'}
          </p>
        </div>

        {/* Action Buttons */}
        {!list.isDynamic && (
          <div className="flex flex-wrap gap-3">
            <button
              onClick={downloadTemplate}
              className="bg-black/5 dark:bg-white/5 border border-brand-card-border px-4 py-2 rounded-lg font-bold text-sm text-brand-text-dim hover:text-brand-text transition-colors flex items-center gap-2 shadow-sm"
            >
              <Download size={16} /> CSV Template
            </button>
            
            <input 
              type="file" 
              accept=".csv" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleCSVImport} 
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={saving}
              className="bg-black/5 dark:bg-white/5 border border-brand-card-border px-4 py-2 rounded-lg font-bold text-sm text-brand-text hover:bg-black/10 dark:hover:bg-white/10 transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              <Upload size={16} /> {saving ? 'Importing...' : 'Import CSV'}
            </button>
            
            <button
              onClick={() => setIsAddingContact(true)}
              className="bg-brand-primary text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-brand-primary-hover transition-colors flex items-center gap-2 shadow-sm"
            >
              <UserPlus size={16} /> Add Contact
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden flex flex-col bg-brand-bg relative">
        {/* Toolbar */}
        <div className="p-4 border-b border-brand-card-border bg-brand-card/50 flex items-center shrink-0">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-dim" size={16} />
            <input 
              type="text" 
              placeholder="Search contacts by name or phone..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white dark:bg-brand-sidebar border border-brand-card-border rounded-lg py-2 pl-9 pr-4 text-sm focus:outline-none focus:border-brand-primary text-brand-text shadow-sm transition-colors"
            />
          </div>
        </div>

        {/* Contacts Grid/List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {loading ? (
            <div className="flex justify-center items-center h-32">
              <Loader className="animate-spin text-brand-primary" size={24} />
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center p-12 bg-brand-card border border-brand-card-border border-dashed rounded-xl max-w-2xl mx-auto mt-8">
              <Users size={48} className="text-brand-text-dim opacity-50 mb-4" />
              <h3 className="text-xl font-bold text-brand-text mb-2">No contacts found</h3>
              <p className="text-brand-text-dim mb-6">
                {search ? "No contacts match your search." : "This list is empty. Add contacts manually or import them via CSV."}
              </p>
              {!list.isDynamic && !search && (
                <button
                  onClick={() => setIsAddingContact(true)}
                  className="bg-brand-primary text-white px-6 py-2.5 rounded-lg font-bold flex items-center gap-2 hover:bg-brand-primary-hover transition-colors shadow-sm"
                >
                  <UserPlus size={18} /> Add First Contact
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredMembers.map(member => (
                <div key={member.id} className="bg-white dark:bg-brand-sidebar rounded-xl p-4 border border-brand-card-border flex items-center justify-between group shadow-sm hover:border-brand-primary/50 transition-colors">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-10 h-10 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center font-bold text-lg shrink-0 uppercase">
                      {(member.name || '?').charAt(0)}
                    </div>
                    <div className="overflow-hidden">
                      <div className="font-bold text-brand-text truncate">{member.name || 'Unknown'}</div>
                      <div className="text-xs text-brand-text-dim flex items-center gap-1 mt-0.5">
                        <Phone size={10} /> {member.phone}
                      </div>
                    </div>
                  </div>
                  {!list.isDynamic && (
                    <button 
                      onClick={() => handleDeleteMember(member.id)}
                      className="p-2 opacity-0 group-hover:opacity-100 text-brand-text-dim hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all shrink-0"
                      title="Remove contact"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Manual Add Contact Modal */}
      {isAddingContact && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-brand-card w-full max-w-sm rounded-2xl shadow-2xl border border-brand-card-border overflow-hidden">
            <div className="p-5 border-b border-brand-card-border flex justify-between items-center bg-brand-sidebar">
              <h2 className="text-lg font-bold text-brand-text flex items-center gap-2">
                <UserPlus className="text-brand-primary" size={20} /> Add Contact
              </h2>
              <button onClick={() => setIsAddingContact(false)} className="text-brand-text-dim hover:text-brand-text transition-colors">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddContact} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-brand-text mb-1.5">Contact Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. John Doe"
                  className="w-full bg-brand-bg border border-brand-card-border rounded-lg px-4 py-2 text-brand-text focus:outline-none focus:border-brand-primary"
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-brand-text mb-1.5">WhatsApp Number *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 919876543210"
                  className="w-full bg-brand-bg border border-brand-card-border rounded-lg px-4 py-2 text-brand-text focus:outline-none focus:border-brand-primary"
                  value={newContactPhone}
                  onChange={(e) => setNewContactPhone(e.target.value)}
                />
                <p className="text-[10px] text-brand-text-dim mt-1.5">Include country code (e.g., 91 for India).</p>
              </div>
              <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-brand-card-border">
                <button
                  type="button"
                  onClick={() => setIsAddingContact(false)}
                  className="px-4 py-2 rounded-lg font-medium text-brand-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg font-bold bg-brand-primary text-white hover:bg-brand-primary-hover transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
                  disabled={saving}
                >
                  {saving ? <><Loader className="animate-spin" size={16} /> Saving...</> : 'Add Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit List Metadata Modal */}
      {isEditingList && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-brand-card w-full max-w-sm rounded-2xl shadow-2xl border border-brand-card-border overflow-hidden">
            <div className="p-5 border-b border-brand-card-border flex justify-between items-center bg-brand-sidebar">
              <h2 className="text-lg font-bold text-brand-text flex items-center gap-2">
                <Edit className="text-brand-primary" size={20} /> Edit List
              </h2>
              <button onClick={() => setIsEditingList(false)} className="text-brand-text-dim hover:text-brand-text transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-brand-text mb-1.5">List Name</label>
                <input
                  type="text"
                  required
                  className="w-full bg-brand-bg border border-brand-card-border rounded-lg px-4 py-2 text-brand-text focus:outline-none focus:border-brand-primary"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-brand-text mb-1.5">Category</label>
                <select 
                  value={editCategory}
                  onChange={e => setEditCategory(e.target.value)}
                  className="w-full bg-brand-bg border border-brand-card-border rounded-lg py-2 px-3 focus:outline-none focus:border-brand-primary text-brand-text"
                >
                  <option value="MARKETING">Marketing (General Updates/Offers)</option>
                  <option value="UTILITY">Utility (Fees/Attendance Alerts)</option>
                  <option value="INTERNAL">Internal Tests (Testing/Reviewing)</option>
                </select>
              </div>
              <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-brand-card-border">
                <button
                  onClick={() => setIsEditingList(false)}
                  className="px-4 py-2 rounded-lg font-medium text-brand-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateList}
                  className="px-5 py-2 rounded-lg font-bold bg-brand-primary text-white hover:bg-brand-primary-hover transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
                  disabled={saving}
                >
                  {saving ? <><Loader className="animate-spin" size={16} /> Saving...</> : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
