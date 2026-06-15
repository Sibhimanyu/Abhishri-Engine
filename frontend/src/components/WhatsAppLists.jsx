import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { firestore } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { Users, Plus, Search, Tag, Loader, ChevronRight } from 'lucide-react';
import WhatsAppListDetail from './WhatsAppListDetail';

export default function WhatsAppLists() {
  const { userData } = useAuth();
  const [lists, setLists] = useState([]);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [saving, setSaving] = useState(false);

  // Create Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [listName, setListName] = useState('');
  const [listCategory, setListCategory] = useState('MARKETING');

  const [selectedList, setSelectedList] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(firestore, 'whatsapp_lists'), (snap) => {
      const data = [];
      let hasDynamic = false;
      snap.forEach(doc => {
        if (doc.id === 'dynamic_all_parents') hasDynamic = true;
        data.push({ id: doc.id, ...doc.data() });
      });
      setLists(data);

      if (!hasDynamic && !snap.metadata.hasPendingWrites) {
        setDoc(doc(firestore, 'whatsapp_lists', 'dynamic_all_parents'), {
          name: 'Dynamic: All Parents Directory',
          category: 'MARKETING',
          isDynamic: true,
          count: 'Live',
          createdAt: new Date().toISOString(),
          createdBy: 'System'
        }, { merge: true }).catch(console.error);
      }
    });
    return () => unsub();
  }, []);



  const openCreateModal = () => {
    setListName('');
    setListCategory('MARKETING');
    setShowCreateModal(true);
  };

  const handleSaveList = async () => {
    if (!listName.trim()) return alert("Please enter a list name");
    setSaving(true);
    try {
      const id = Date.now().toString();
      await setDoc(doc(firestore, 'whatsapp_lists', id), {
        name: listName,
        category: listCategory,
        count: 0,
        createdAt: new Date().toISOString(),
        createdBy: userData?.email || 'Admin'
      }, { merge: true });
      setShowCreateModal(false);
    } catch (err) {
      console.error(err);
      alert('Failed to save list');
    } finally {
      setSaving(false);
    }
  };

  const filteredLists = lists.filter(l => 
    l.name?.toLowerCase().includes(search.toLowerCase()) &&
    (filterCategory === 'ALL' || l.category === filterCategory)
  );

  if (selectedList) {
    return (
      <WhatsAppListDetail 
        list={selectedList} 
        onBack={() => setSelectedList(null)} 
        onListDeleted={() => setSelectedList(null)}
      />
    );
  }

  return (
    <div className="flex h-full bg-brand-bg rounded-xl overflow-hidden border border-brand-card-border m-6 shadow-sm flex-col">
      <div className="p-6 border-b border-brand-card-border bg-brand-card flex justify-between items-center shrink-0">
        <div>
          <h2 className="text-xl font-bold text-brand-text flex items-center gap-2"><Users size={20} className="text-brand-primary" /> Audience Lists</h2>
          <p className="text-sm text-brand-text-dim">Manage contact groups for your broadcast campaigns.</p>
        </div>
        <button 
          onClick={openCreateModal}
          className="bg-brand-primary text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-brand-primary-hover transition-colors"
        >
          <Plus size={16} /> New List
        </button>
      </div>

      <div className="p-6 shrink-0">
        <div className="flex justify-between items-center mb-4">
          <div className="relative max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-dim" size={16} />
            <input 
              type="text" 
              placeholder="Search lists..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white dark:bg-brand-sidebar border border-brand-card-border rounded-lg py-2 pl-9 pr-4 text-sm focus:outline-none focus:border-brand-primary"
            />
          </div>
          <div className="flex bg-white dark:bg-brand-sidebar rounded-lg p-1 border border-brand-card-border ml-4 shadow-sm shrink-0">
            {['ALL', 'MARKETING', 'UTILITY', 'INTERNAL'].map(cat => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors ${filterCategory === cat ? (cat === 'UTILITY' ? 'bg-blue-500 text-white shadow-sm' : cat === 'MARKETING' ? 'bg-purple-500 text-white shadow-sm' : cat === 'INTERNAL' ? 'bg-orange-500 text-white shadow-sm' : 'bg-brand-primary text-white shadow-sm') : 'text-brand-text-dim hover:text-brand-text'}`}
              >
                {cat === 'ALL' ? 'All' : cat === 'INTERNAL' ? 'Internal Tests' : cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 pt-0">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredLists.length === 0 ? (
            <div className="col-span-full p-8 text-center text-brand-text-dim bg-black/5 dark:bg-white/5 rounded-xl border border-dashed border-brand-card-border">
              No lists found. Click "New List" to create one.
            </div>
          ) : (
            filteredLists.map(list => (
              <div 
                key={list.id} 
                onClick={() => setSelectedList(list)}
                className="bg-white dark:bg-brand-sidebar rounded-xl border border-brand-card-border p-5 relative group shadow-sm hover:border-brand-primary/50 transition-colors cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start mb-1 pr-8">
                    <h3 className="font-bold text-brand-text text-lg leading-tight">{list.name}</h3>
                  </div>
                  <div className="mb-4 flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${list.category === 'UTILITY' ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20' : list.category === 'INTERNAL' ? 'bg-orange-500/10 text-orange-500 border border-orange-500/20' : 'bg-purple-500/10 text-purple-500 border border-purple-500/20'}`}>
                      {list.category || 'MARKETING'}
                    </span>
                    <span className="text-xs text-brand-text-dim">
                      {list.count} contacts
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-brand-card-border flex items-center justify-between text-brand-secondary text-sm font-medium transition-colors">
                  Manage List
                  <ChevronRight size={16} className="transform group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-brand-sidebar border border-brand-card-border rounded-xl w-full max-w-sm p-6 shadow-2xl relative">
            <button onClick={() => setShowCreateModal(false)} className="absolute top-4 right-4 text-brand-text-dim hover:text-brand-text">
              <span className="text-xl leading-none">&times;</span>
            </button>
            <h2 className="text-xl font-bold text-brand-text mb-6">Create List</h2>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-bold text-brand-text mb-2">List Name</label>
                <input 
                  type="text" 
                  value={listName} 
                  onChange={e => setListName(e.target.value)}
                  className="w-full bg-brand-bg border border-brand-card-border rounded-lg py-2 px-3 focus:border-brand-primary outline-none text-brand-text"
                  placeholder="e.g. Nursery Parents"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-brand-text mb-2 flex items-center gap-1"><Tag size={14}/> Category</label>
                <select 
                  value={listCategory}
                  onChange={e => setListCategory(e.target.value)}
                  className="w-full bg-brand-bg border border-brand-card-border rounded-lg py-2 px-3 focus:border-brand-primary outline-none text-brand-text"
                >
                  <option value="MARKETING">Marketing (General Updates/Offers)</option>
                  <option value="UTILITY">Utility (Fees/Attendance Alerts)</option>
                  <option value="INTERNAL">Internal Tests (Testing/Reviewing)</option>
                </select>
              </div>
            </div>
            
            <button 
              onClick={handleSaveList}
              disabled={saving}
              className="w-full py-2 bg-brand-primary text-white rounded-lg font-bold hover:bg-brand-primary/90 transition-colors flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? <><Loader className="animate-spin" size={18} /> Saving...</> : 'Save List'}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
