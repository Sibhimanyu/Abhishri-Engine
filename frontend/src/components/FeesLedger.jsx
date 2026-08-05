import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, getDocs, setDoc, collectionGroup } from 'firebase/firestore';
import { firestore } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { Search, ChevronRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import StudentLedgerView from './StudentLedgerView';

const StudentLedgerViewWrapper = ({ wing }) => {
  const { studentId } = useParams();
  const navigate = useNavigate();
  return <StudentLedgerView studentId={studentId} wing={wing} onBack={() => navigate('..', { relative: 'path' })} />;
};

export default function FeesLedger({ wing }) {
  const { userData } = useAuth();
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    setLoading(true);

    const unsubscribe = onSnapshot(collection(firestore, 'students'), (snapshot) => {
      const studentList = [];
      snapshot.forEach(d => {
        const s = d.data();
        const sType = s.programType || s.studentType || 'preschool';
        if (wing && sType !== wing) return;

        const f = s.financialSummary || {};

        let status = f.status || 'unconfigured';

        studentList.push({
          id: d.id,
          name: s.name || 'Unknown',
          status: status,
          dueNow: f.dueNow || 0,
          aheadBy: f.aheadBy || 0,
          discount: f.totalDiscounted || 0,
          annualRemaining: f.annualRemaining || 0
        });
      });

      studentList.sort((a, b) => a.name.localeCompare(b.name));
      setStudents(studentList);
      setLoading(false);
    }, (error) => {
      console.error("Error loading fees ledger:", error);
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [wing]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
      </div>
    );
  }

  const filtered = students.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <Routes>
      <Route path="/" element={
    <div className="bg-brand-card border border-brand-card-border rounded-xl shadow-sm overflow-hidden">
      {/* Controls */}
      <div className="p-4 md:p-6 border-b border-brand-card-border flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-black/5 dark:bg-white/5">
        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-dim" size={16} />
          <input 
            type="text" placeholder="Search students..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-brand-bg border border-brand-card-border rounded-md py-1.5 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary w-full sm:w-64 text-brand-text"
          />
        </div>
        <div className="text-sm font-medium text-brand-text-dim">
          {filtered.length} Students found
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-brand-text-dim">
          <thead className="text-xs uppercase bg-brand-bg text-brand-text border-b border-brand-card-border">
            <tr>
              <th className="px-6 py-4">Student Name</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Due Now</th>
              <th className="px-6 py-4 text-right">Ahead By</th>
              <th className="px-6 py-4 text-right">Discount</th>
              <th className="px-6 py-4 text-right">Annual Remaining</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-6 py-8 text-center text-brand-text-dim">
                  No students found.
                </td>
              </tr>
            ) : (
              filtered.map(student => (
                <tr 
                  key={student.id} 
                  onClick={() => navigate(student.id)}
                  className="border-b border-brand-card-border hover:bg-black/5 dark:hover:bg-white/5 transition-colors group cursor-pointer"
                >
                  <td className="px-6 py-4 font-medium text-brand-text">
                    {student.name}
                  </td>
                  <td className="px-6 py-4">
                    {student.status === 'unconfigured' ? (
                      <span className="inline-flex items-center gap-1 text-brand-text-dim font-medium">
                        <AlertCircle size={16} /> Missing Setup
                      </span>
                    ) : student.status === 'clear' ? (
                      <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 font-medium">
                        <CheckCircle2 size={16} /> Clear
                      </span>
                    ) : student.status === 'ahead' ? (
                      <span className="inline-flex items-center gap-1 text-brand-secondary font-medium">
                        <CheckCircle2 size={16} /> Ahead
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-500 font-medium">
                        <AlertCircle size={16} /> Due
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-red-500">{student.dueNow > 0 ? `₹ ${student.dueNow.toLocaleString()}` : '-'}</td>
                  <td className="px-6 py-4 text-right font-bold text-brand-secondary">{student.aheadBy > 0 ? `₹ ${student.aheadBy.toLocaleString()}` : '-'}</td>
                  <td className="px-6 py-4 text-right text-brand-text-dim">{student.discount > 0 ? `₹ ${student.discount.toLocaleString()}` : '-'}</td>
                  <td className="px-6 py-4 text-right">₹ {student.annualRemaining.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={(e) => { e.stopPropagation(); navigate(student.id); }}
                      className="inline-flex items-center gap-1 text-brand-primary hover:text-brand-primary-hover font-medium transition-colors"
                    >
                      Open Ledger <ChevronRight size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
      } />
      <Route path=":studentId" element={<StudentLedgerViewWrapper wing={wing} />} />
    </Routes>
  );
}
