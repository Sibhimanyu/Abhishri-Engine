import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, getDocs, limit } from 'firebase/firestore';
import { firestore } from '../firebase';
import { Search, User, Briefcase, ChevronRight, X, LayoutDashboard, FileText, Settings, Users, MessageSquare } from 'lucide-react';

export default function GlobalSearch() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState({ students: [], staff: [], links: [] });
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef(null);

  // Quick Links Map
  const QUICK_LINKS = [
    { id: 'dashboard', title: 'Dashboard', path: '/', icon: LayoutDashboard },
    { id: 'students', title: 'Students Directory', path: '/students', icon: Users },
    { id: 'staff', title: 'Staff Directory', path: '/staff', icon: Briefcase },
    { id: 'fees', title: 'Fees & Billing', path: '/fees', icon: FileText },
    { id: 'whatsapp', title: 'Communications', path: '/whatsapp', icon: MessageSquare },
    { id: 'settings', title: 'Settings', path: '/settings', icon: Settings },
  ];

  // Handle outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setResults({ students: [], staff: [], links: [] });
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(() => {
      performSearch(searchTerm.toLowerCase());
    }, 300); // Debounce

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const performSearch = async (term) => {
    setLoading(true);
    setIsOpen(true);
    
    try {
      // Was querying the same unfiltered `students` collection twice (leftover from when
      // preschool/tuition were separate collections) — doubled the read cost of every
      // debounced keystroke for no benefit, since results were deduped from identical data.
      const [studentsSnap, staffSnap] = await Promise.all([
        getDocs(collection(firestore, 'students')),
        getDocs(collection(firestore, 'allowed_users'))
      ]);

      const foundStudents = [];
      studentsSnap.docs.forEach(doc => {
        const data = doc.data();
        if ((data.name || '').toLowerCase().includes(term) || (data.fatherName || '').toLowerCase().includes(term)) {
          foundStudents.push({ id: doc.id, ...data });
        }
      });

      const foundStaff = [];
      staffSnap.forEach(doc => {
        const data = doc.data();
        if (data.role !== 'student' && data.permissionGroup !== 'student' && data.permissionGroup !== 'parent') {
          if ((data.displayName || '').toLowerCase().includes(term) || (data.email || '').toLowerCase().includes(term)) {
            foundStaff.push({ id: doc.id, ...data });
          }
        }
      });

      const foundLinks = QUICK_LINKS.filter(l => l.title.toLowerCase().includes(term));

      setResults({
        students: foundStudents.slice(0, 5),
        staff: foundStaff.slice(0, 5),
        links: foundLinks
      });
    } catch (err) {
      console.error("Search failed:", err);
    }
    setLoading(false);
  };

  const handleNavigate = (path, state = {}) => {
    setIsOpen(false);
    setSearchTerm('');
    navigate(path, { state });
  };

  return (
    <div className="relative w-full max-w-md" ref={wrapperRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-dim" size={16} />
        <input 
          type="text" 
          placeholder="Search students, staff, or modules..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onFocus={() => { if (searchTerm) setIsOpen(true); }}
          className="bg-brand-bg border border-brand-card-border rounded-md py-1.5 pl-9 pr-8 text-sm w-full focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all text-brand-text placeholder-brand-text-dim"
        />
        {searchTerm && (
          <button 
            onClick={() => { setSearchTerm(''); setIsOpen(false); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-brand-text-dim hover:text-brand-text"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-brand-card border border-brand-card-border rounded-xl shadow-xl z-50 max-h-96 overflow-y-auto">
          {loading && (
            <div className="p-4 text-center text-brand-text-dim text-sm">Searching...</div>
          )}
          
          {!loading && results.links.length === 0 && results.students.length === 0 && results.staff.length === 0 && (
            <div className="p-4 text-center text-brand-text-dim text-sm">No results found for "{searchTerm}"</div>
          )}

          {!loading && results.links.length > 0 && (
            <div className="p-2 border-b border-brand-card-border last:border-0">
              <div className="px-2 py-1 text-xs font-bold text-brand-text-dim uppercase tracking-wider">Quick Links</div>
              {results.links.map(link => (
                <button
                  key={link.id}
                  onClick={() => handleNavigate(link.path)}
                  className="w-full text-left flex items-center gap-3 px-3 py-2 text-sm text-brand-text hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors"
                >
                  <link.icon size={16} className="text-brand-primary" />
                  {link.title}
                </button>
              ))}
            </div>
          )}

          {!loading && results.students.length > 0 && (
            <div className="p-2 border-b border-brand-card-border last:border-0">
              <div className="px-2 py-1 text-xs font-bold text-brand-text-dim uppercase tracking-wider">Students</div>
              {results.students.map(student => (
                <button
                  key={student.id}
                  onClick={() => handleNavigate('/students', { studentId: student.id })}
                  className="w-full text-left flex items-center justify-between px-3 py-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center font-bold shrink-0">
                      {(student.name || 'S')[0]}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-brand-text truncate">{student.name}</div>
                      <div className="text-xs text-brand-text-dim truncate">{student.studentType || 'Preschool'}</div>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-brand-text-dim opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          )}

          {!loading && results.staff.length > 0 && (
            <div className="p-2 border-b border-brand-card-border last:border-0">
              <div className="px-2 py-1 text-xs font-bold text-brand-text-dim uppercase tracking-wider">Staff</div>
              {results.staff.map(staff => (
                <button
                  key={staff.id}
                  onClick={() => handleNavigate('/staff', { staffId: staff.id })}
                  className="w-full text-left flex items-center justify-between px-3 py-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-brand-secondary/20 text-brand-secondary flex items-center justify-center font-bold shrink-0 uppercase">
                      {(staff.displayName || staff.email || 'S')[0]}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-brand-text truncate">{staff.displayName || staff.email}</div>
                      <div className="text-xs text-brand-text-dim truncate">{staff.role || 'Staff'}</div>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-brand-text-dim opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
