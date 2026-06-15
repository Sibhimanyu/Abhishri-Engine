import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, where } from 'firebase/firestore';
import { firestore } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useLocation } from 'react-router-dom';
import { Users, Search, ChevronRight, UserPlus } from 'lucide-react';
import StudentProfile from './StudentProfile';
import StudentAdmissionForm from './StudentAdmissionForm';

export default function StudentDirectory() {
  const { userData } = useAuth();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [wingFilter, setWingFilter] = useState('preschool');
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [addingStudentType, setAddingStudentType] = useState(null);
  const location = useLocation();

  useEffect(() => {
    if (location.state?.studentId) {
      setSelectedStudentId(location.state.studentId);
    }
    if (location.state?.action === 'add') {
      setAddingStudentType(wingFilter || 'preschool');
      // clear state so it doesn't reopen on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state, wingFilter]);

  const isAdmin = userData?.isAdmin;
  const perms = userData?.permissions?.student_directory || {};
  const canView = isAdmin || perms === true || perms.view || perms.manage;

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }

    setStudents([]);
    setLoading(true);

    const studentsRef = collection(firestore, 'students');
    const unsubscribe = onSnapshot(studentsRef, (snap) => {
      const studentsData = [];
      snap.forEach((d) => {
        const data = d.data();
        const sType = data.programType || data.studentType || 'preschool';
        if (sType === wingFilter) {
          studentsData.push({ id: d.id, ...data });
        }
      });
      
      // Sort alphabetically
      studentsData.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setStudents(studentsData);
      setLoading(false);
    }, (err) => {
      console.warn('Failed to fetch students:', err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [canView, wingFilter]);

  if (selectedStudentId) {
    return <StudentProfile 
             studentId={selectedStudentId}
             studentType={wingFilter}
             onBack={() => setSelectedStudentId(null)} 
             canEdit={isAdmin || perms.manage}
           />;
  }

  if (addingStudentType) {
    return <StudentAdmissionForm 
             studentType={addingStudentType} 
             onBack={() => setAddingStudentType(null)} 
           />;
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 p-8 rounded-xl text-center">
        <h3 className="text-xl font-bold text-brand-text mb-2">Access Denied</h3>
        <p className="text-brand-text-dim">You do not have permission to view the Student Directory.</p>
      </div>
    );
  }

  const filteredStudents = students.filter(s => {
    return (s.name || '').toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <div className="space-y-6">
      
      <div className="bg-brand-card border border-brand-card-border rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 md:p-6 border-b border-brand-card-border flex flex-col lg:flex-row justify-between gap-4">
          <div className="flex bg-black/5 dark:bg-white/5 rounded-lg p-1 self-start">
            <button onClick={() => setWingFilter('preschool')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${wingFilter === 'preschool' ? 'bg-white dark:bg-brand-card shadow-sm text-brand-text' : 'text-brand-text-dim hover:text-brand-text'}`}>Preschool</button>
            <button onClick={() => setWingFilter('tuition')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${wingFilter === 'tuition' ? 'bg-white dark:bg-brand-card shadow-sm text-brand-text' : 'text-brand-text-dim hover:text-brand-text'}`}>Tuition</button>
          </div>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 lg:justify-end">
            <div className="text-sm font-medium text-brand-text-dim px-2 hidden sm:block">
              {students.length} Enrolled
            </div>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-dim" size={16} />
              <input 
                type="text" placeholder="Search by name..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-brand-bg border border-brand-card-border rounded-md py-1.5 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary w-full sm:w-64 text-brand-text"
              />
            </div>
            {(isAdmin || perms.manage) && (
              <div className="flex flex-col sm:flex-row gap-2">
                {wingFilter === 'preschool' && (
                  <button 
                    onClick={() => setAddingStudentType('preschool')}
                    className="flex items-center justify-center gap-2 bg-brand-primary hover:bg-brand-primary-hover text-white px-3 md:px-4 py-2 rounded-md font-medium text-sm transition-colors shadow-sm whitespace-nowrap"
                  >
                    <UserPlus size={16} /> Preschool Admission
                  </button>
                )}
                {wingFilter === 'tuition' && (
                  <button 
                    onClick={() => setAddingStudentType('tuition')}
                    className="flex items-center justify-center gap-2 bg-brand-secondary hover:brightness-95 text-white px-3 md:px-4 py-2 rounded-md font-medium text-sm transition-colors shadow-sm whitespace-nowrap"
                  >
                    <UserPlus size={16} /> Tuition Admission
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Directory Grid/List */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
          {filteredStudents.length === 0 ? (
            <div className="col-span-full py-12 text-center text-brand-text-dim">No students match your criteria.</div>
          ) : (
            filteredStudents.map(student => (
              <div 
                key={student.id} 
                onClick={() => setSelectedStudentId(student.id)}
                className="group border border-brand-card-border hover:border-brand-primary/40 rounded-xl p-5 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-primary/5 transition-all cursor-pointer bg-brand-card"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center font-bold text-xl">
                      {(student.name || 'S').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="font-bold text-brand-text transition-colors">{student.name}</h4>
                      <span className={`text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-full ${
                        wingFilter === 'preschool' 
                          ? 'bg-brand-secondary/10 text-brand-secondary' 
                          : 'bg-yellow-500/10 text-yellow-600'
                      }`}>
                        {wingFilter}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2 text-sm text-brand-text-dim">
                  <div className="flex justify-between"><span>Parent:</span> <span className="text-brand-text">{student.fatherName || student.motherName || 'N/A'}</span></div>
                  <div className="flex justify-between"><span>Phone:</span> <span className="text-brand-text">{student.fatherPhone || student.motherPhone || 'N/A'}</span></div>
                  <div className="flex justify-between"><span>UID:</span> <span className="text-brand-text font-mono text-xs">{student.id.slice(-6).toUpperCase()}</span></div>
                </div>

                <div className="mt-4 pt-4 border-t border-brand-card-border flex items-center justify-between text-brand-secondary text-sm font-medium transition-colors">
                  View Full Profile
                  <ChevronRight size={16} className="transform group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
