import { localKey, parseISODate, isDiscontinued, isEnrolledOn } from '../utils/reportUtils';
import { Spinner } from './Spinner';
import React, { useState, useEffect, useMemo } from 'react';
import { collection } from 'firebase/firestore';
import { getDocs } from '../utils/firestoreRead';
import { ref, onValue, set, remove, serverTimestamp, get } from 'firebase/database';
import { firestore, rtdb } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { Calendar, CheckCircle, XCircle, Clock, BarChart2, CheckSquare, Pencil } from 'lucide-react';
import { tapAction, cleanNote, NEEDS_NOTE, NOTE_MAX } from '../utils/attendanceMark';

// Width of the attendance report window, in calendar days.
const REPORT_DAYS = 30;

export default function Attendance() {
  const { currentUser, userData } = useAuth();
  const [activeTab, setActiveTab] = useState('preschool'); // 'staff' | 'preschool' | 'tuition'
  const [mode, setMode] = useState('mark'); // 'mark' | 'report'
  const [selectedDate, setSelectedDate] = useState(() => localKey(new Date()));
  const [entities, setEntities] = useState([]);
  // The live snapshot, tagged with the tab+day it belongs to (see `attendance` below).
  const [attendanceSnap, setAttendanceSnap] = useState({ key: '', data: {} });
  const [loadingEntities, setLoadingEntities] = useState(true);
  const [reportDays, setReportDays] = useState({}); // { 'YYYY-MM-DD': { [id]: record } }
  const [loadingReport, setLoadingReport] = useState(false);

  const isAdmin = userData?.isAdmin;
  const attPerms = userData?.permissions?.attendance || {};

  // Staff attendance is part of the staff directory: it also needs staff_directory.view, so
  // roles that can't see the staff directory (teachers) only get the student tabs.
  const staffPerms = userData?.permissions?.staff_directory;
  const canSeeStaff = staffPerms === true || staffPerms?.view === true;
  const canViewStaff = isAdmin || attPerms === true || (canSeeStaff && (attPerms.view || attPerms.mark || attPerms.edit));
  const canMarkStaff = isAdmin || attPerms === true || (canSeeStaff && attPerms.mark);
  
  const canViewStudents = isAdmin || attPerms === true || attPerms.view || attPerms.mark || attPerms.edit;
  const canMarkStudents = isAdmin || attPerms === true || attPerms.mark;

  // Auto-switch away from tab if not allowed
  useEffect(() => {
    if (activeTab === 'staff' && !canViewStaff && canViewStudents) setActiveTab('preschool');
    if ((activeTab === 'preschool' || activeTab === 'tuition') && !canViewStudents && canViewStaff) setActiveTab('staff');
  }, [activeTab, canViewStaff, canViewStudents]);

  // Fetch Entities (Firestore)
  useEffect(() => {
    // Switching tabs quickly can leave an older fetch still in flight; without this its
    // result would land after the newer one and show (and let you mark) the wrong list.
    let cancelled = false;
    async function fetchEntities() {
      setEntities([]);
      setLoadingEntities(true);
      try {
        if (activeTab === 'staff') {
          if (!canViewStaff) return;
          const snap = await getDocs(collection(firestore, 'staff'));
          const data = [];
          snap.forEach(doc => data.push({ id: doc.id, ...doc.data() }));
          data.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          if (!cancelled) setEntities(data);
        } else {
          if (!canViewStudents) return;
          const snap = await getDocs(collection(firestore, 'students'));
          const data = [];
          snap.forEach(doc => {
            const sData = doc.data();
            const sType = sData.programType || sData.studentType || 'preschool';
            if (sType === activeTab) {
              data.push({ id: doc.id, ...sData });
            }
          });
          data.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          if (!cancelled) setEntities(data);
        }
      } catch (err) {
        console.error("Failed to fetch entities:", err);
      } finally {
        if (!cancelled) setLoadingEntities(false);
      }
    }
    fetchEntities();
    return () => { cancelled = true; };
  }, [activeTab, canViewStaff, canViewStudents]);

  // Fetch Attendance Records (RTDB) for Single Day
  useEffect(() => {
    if (mode !== 'mark' || !selectedDate) return;
    const key = `${activeTab}|${selectedDate}`;
    let modulePath = activeTab === 'staff' ? 'staff_directory' : 'student_directory';
    const dbRef = ref(rtdb, `modules/${modulePath}/attendance/${selectedDate}`);
    
    const unsubscribe = onValue(dbRef, (snap) => {
      setAttendanceSnap({ key, data: snap.val() || {} });
    }, (err) => {
      console.error('Failed to load attendance for', selectedDate, err);
    });

    return () => unsubscribe();
  }, [activeTab, selectedDate, mode]);

  // Report: the last REPORT_DAYS calendar days, read straight from the per-day records.
  //
  // This used to read attendance_aggregates, written by a nightly job (since removed) that only ever added TODAY's
  // marks to. So a correction to an earlier day never reached it, anything marked after
  // 23:59 was lost, and the counters were lifetime totals rather than the "30 days" this
  // screen claims. Reading the days directly is exact, and lets each student's days be
  // limited to the ones they were actually enrolled on.
  useEffect(() => {
    if (mode !== 'report') return;
    let cancelled = false;

    async function fetchReport() {
      setLoadingReport(true);
      const modulePath = activeTab === 'staff' ? 'staff_directory' : 'student_directory';
      const days = [];
      for (let i = 0; i < REPORT_DAYS; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push(localKey(d));
      }

      try {
        const snaps = await Promise.all(days.map(dk => get(ref(rtdb, `modules/${modulePath}/attendance/${dk}`))));
        const byDay = {};
        snaps.forEach((snap, i) => { if (snap.exists()) byDay[days[i]] = snap.val() || {}; });
        if (!cancelled) setReportDays(byDay);
      } catch (err) {
        console.error("Failed to fetch attendance report:", err);
        if (!cancelled) setReportDays({});
      } finally {
        if (!cancelled) setLoadingReport(false);
      }
    }
    fetchReport();
    return () => { cancelled = true; };
  }, [activeTab, mode]);

  // Only trust a snapshot for the tab+day on screen: after switching either, the old
  // day's marks would otherwise show (and count) until the new listener's first reply.
  const attendance = attendanceSnap.key === `${activeTab}|${selectedDate}` ? attendanceSnap.data : {};

  const todayKey = localKey(new Date());
  // Day-level enrollment only applies to students; staff have no discontinuation.
  const enrolledOn = (entity, dayKey) =>
    activeTab === 'staff' ? true : isEnrolledOn(entity, parseISODate(dayKey));

  // The roster to mark. A discontinued student must not sit on the daily sheet after
  // they left, but they were on it for the days they did attend, so the cutoff is their
  // exit date (and any earlier absence between leaving and re-enrolling), not "hide them
  // everywhere".
  const roster = useMemo(() => {
    if (activeTab === 'staff' || !selectedDate) return entities;
    return entities.filter(e => enrolledOn(e, selectedDate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entities, activeTab, selectedDate]);

  // Per-entity totals, counting only days the entity was enrolled on: marks left behind
  // for dates after an exit (e.g. an exit recorded late, backdated) must not drag down,
  // or pad, their percentage.
  const reportRows = useMemo(() => {
    const dayKeys = Object.keys(reportDays);
    return entities
      .map(e => {
        const r = { present: 0, absent: 0, late: 0, total: 0 };
        dayKeys.forEach(dk => {
          const status = reportDays[dk]?.[e.id]?.status;
          if (!status || !enrolledOn(e, dk)) return;
          r.total++;
          if (status === 'present') r.present++;
          else if (status === 'absent') r.absent++;
          else if (status === 'late') r.late++;
        });
        return { entity: e, ...r };
      })
      // Leavers stay listed while the window still covers days they were enrolled for,
      // then drop off; everyone on the rolls is always listed, even with nothing marked.
      .filter(row => row.total > 0 || enrolledOn(row.entity, todayKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entities, reportDays, activeTab, todayKey]);

  // Where one person's mark for the selected day lives, or null when it can't be changed.
  const markRef = (entityId) => {
    const canMark = activeTab === 'staff' ? canMarkStaff : canMarkStudents;
    if (!canMark) return null;
    // A cleared date input gives '' and would write to attendance//{id}.
    if (!selectedDate) return null;
    // Days that haven't happened can't be attended; 'YYYY-MM-DD' compares as a date.
    if (selectedDate > todayKey) return null;
    // Only people on that day's roster: never a student who had left by then.
    if (!roster.some(e => e.id === entityId)) return null;

    let modulePath = activeTab === 'staff' ? 'staff_directory' : 'student_directory';
    return ref(rtdb, `modules/${modulePath}/attendance/${selectedDate}/${entityId}`);
  };

  const saveFailed = (err) => {
    console.error('Failed to save attendance:', err);
    alert('Could not save attendance. Check your connection and permissions, then try again.');
  };

  const markAttendance = (entityId, status, note = '') => {
    const dbRef = markRef(entityId);
    if (!dbRef) return Promise.resolve(false);
    return set(dbRef, {
      status,
      ...(note ? { note } : {}),
      timestamp: serverTimestamp(),
      performedBy: currentUser?.email || null
    }).then(() => true, (err) => { saveFailed(err); return false; });
  };

  const clearAttendance = (entityId) => {
    const dbRef = markRef(entityId);
    if (dbRef) remove(dbRef).catch(saveFailed);
  };

  // Absent / Late waiting for its reason: { id, status, note }. Nothing is saved until then.
  // Tagged with the tab+day it was started on, so switching either drops it.
  const [draft, setNoteDraft] = useState(null);
  const sheetKey = `${activeTab}|${selectedDate}|${mode}`;
  const noteDraft = draft?.sheet === sheetKey ? draft : null;

  const tapStatus = (entityId, status) => {
    const current = attendance[entityId]?.status || 'none';
    const action = tapAction(current, status);
    if (action === 'note') {
      setNoteDraft({ sheet: sheetKey, id: entityId, status, note: attendance[entityId]?.note || '' });
      return;
    }
    setNoteDraft(d => (d?.id === entityId ? null : d));
    if (action === 'clear') clearAttendance(entityId);
    else markAttendance(entityId, status);
  };

  const saveNoteDraft = async () => {
    const note = cleanNote(noteDraft?.note);
    if (!noteDraft || !note) return;
    if (await markAttendance(noteDraft.id, noteDraft.status, note)) setNoteDraft(null);
  };

  // A saved Absent / Late note, opened for editing.
  const editNote = (entityId) => {
    const rec = attendance[entityId];
    if (rec && NEEDS_NOTE.includes(rec.status)) setNoteDraft({ sheet: sheetKey, id: entityId, status: rec.status, note: rec.note || '' });
  };

  const getStatusCounts = () => {
    let present = 0, absent = 0, late = 0;
    roster.forEach(e => {
      const status = attendance[e.id]?.status;
      if (status === 'present') present++;
      if (status === 'absent') absent++;
      if (status === 'late') late++;
    });
    return { present, absent, late, total: roster.length };
  };

  const stats = getStatusCounts();

  if (!canViewStaff && !canViewStudents) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 p-8 rounded-xl text-center">
        <h3 className="text-xl font-bold text-brand-text mb-2">Access Denied</h3>
        <p className="text-brand-text-dim">You do not have permission to view or mark attendance.</p>
      </div>
    );
  }

  // Disabled, not just ignored, for a future date so the sheet doesn't look markable.
  const canMarkActive = (activeTab === 'staff' ? canMarkStaff : canMarkStudents) && !!selectedDate && selectedDate <= todayKey;

  const STATUS_BUTTONS = [
    { status: 'present', label: 'PRESENT', on: 'bg-green-500 text-white border-green-500 shadow-sm', off: 'bg-transparent text-green-600 dark:text-green-500 border-green-200 dark:border-green-900/50 hover:bg-green-50 dark:hover:bg-green-900/20' },
    { status: 'absent', label: 'ABSENT', on: 'bg-red-500 text-white border-red-500 shadow-sm', off: 'bg-transparent text-red-600 dark:text-red-500 border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-900/20' },
    { status: 'late', label: 'LATE', on: 'bg-yellow-500 text-white border-yellow-500 shadow-sm', off: 'bg-transparent text-yellow-600 dark:text-yellow-500 border-yellow-200 dark:border-yellow-900/50 hover:bg-yellow-50 dark:hover:bg-yellow-900/20' },
  ];

  // Present / Absent / Late. The one already set is filled; tapping it again clears it.
  const renderStatusButtons = (entityId, currentStatus, sizing) => STATUS_BUTTONS.map(b => {
    const selected = currentStatus === b.status;
    const drafting = noteDraft?.id === entityId && noteDraft.status === b.status;
    return (
      <button
        key={b.status}
        onClick={() => tapStatus(entityId, b.status)}
        disabled={!canMarkActive}
        aria-pressed={selected}
        title={selected && canMarkActive ? 'Tap again to clear' : undefined}
        className={`${sizing} rounded-full font-bold text-xs tracking-wider transition-all border ${
          selected ? b.on : b.off
        } ${drafting ? 'ring-2 ring-offset-1 ring-brand-primary/40' : ''} ${!canMarkActive ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {b.label}
      </button>
    );
  });

  // The reason saved with an Absent / Late mark, under the name.
  const renderSavedNote = (entityId) => {
    const rec = attendance[entityId];
    if (!rec || !NEEDS_NOTE.includes(rec.status)) return null;
    return (
      <button
        type="button"
        onClick={() => editNote(entityId)}
        disabled={!canMarkActive}
        className="mt-0.5 flex items-center gap-1 text-left text-xs text-brand-text-dim hover:text-brand-text disabled:hover:text-brand-text-dim"
      >
        <span className={rec.note ? '' : 'italic'}>{rec.note || 'No note'}</span>
        {canMarkActive && <Pencil size={11} className="shrink-0" />}
      </button>
    );
  };

  // The reason a student is absent or late; required before the mark is saved.
  const renderNoteEditor = () => {
    const label = noteDraft.status === 'late' ? 'Why late?' : 'Why absent?';
    const ready = !!cleanNote(noteDraft.note);
    return (
      <form
        onSubmit={(e) => { e.preventDefault(); saveNoteDraft(); }}
        className="flex flex-col sm:flex-row gap-2 sm:items-center"
      >
        <input
          type="text"
          autoFocus
          required
          maxLength={NOTE_MAX}
          value={noteDraft.note}
          onChange={(e) => setNoteDraft(d => ({ ...d, note: e.target.value }))}
          onKeyDown={(e) => { if (e.key === 'Escape') setNoteDraft(null); }}
          placeholder={`${label} (required)`}
          aria-label={`${label} (required)`}
          className="flex-1 min-w-0 bg-brand-bg border border-brand-card-border rounded-md py-2 px-3 text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
        />
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={() => setNoteDraft(null)} className="px-3 py-2 rounded-md text-sm font-medium text-brand-text-dim hover:text-brand-text">
            Cancel
          </button>
          <button type="submit" disabled={!ready} className="px-4 py-2 rounded-md text-sm font-bold bg-brand-primary text-white disabled:opacity-50 disabled:cursor-not-allowed">
            Save
          </button>
        </div>
      </form>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Header & Controls */}
      <div className="bg-brand-card border border-brand-card-border p-4 sm:p-6 rounded-xl shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
        
        <div className="flex bg-black/5 dark:bg-white/5 rounded-lg p-1 w-full md:w-auto">
          {canViewStudents && (
            <>
              <button onClick={() => setActiveTab('preschool')} className={`flex-1 md:flex-none px-4 py-2 md:py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'preschool' ? 'bg-white dark:bg-brand-card shadow-sm text-brand-text' : 'text-brand-text-dim hover:text-brand-text'}`}>Preschool</button>
              <button onClick={() => setActiveTab('tuition')} className={`flex-1 md:flex-none px-4 py-2 md:py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'tuition' ? 'bg-white dark:bg-brand-card shadow-sm text-brand-text' : 'text-brand-text-dim hover:text-brand-text'}`}>Tuition</button>
            </>
          )}
          {canViewStaff && (
            <button onClick={() => setActiveTab('staff')} className={`flex-1 md:flex-none px-4 py-2 md:py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'staff' ? 'bg-white dark:bg-brand-card shadow-sm text-brand-text' : 'text-brand-text-dim hover:text-brand-text'}`}>Staff</button>
          )}
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto md:justify-end">
          <div className="flex bg-brand-primary/10 rounded-lg p-1 shrink-0">
            <button onClick={() => setMode('mark')} className={`px-3 py-2 md:py-1.5 rounded-md text-sm font-bold flex items-center gap-2 ${mode === 'mark' ? 'bg-brand-primary text-white shadow-sm' : 'text-brand-primary hover:bg-brand-primary/20'}`}>
              <CheckSquare size={16} /> Mark
            </button>
            <button onClick={() => setMode('report')} className={`px-3 py-2 md:py-1.5 rounded-md text-sm font-bold flex items-center gap-2 ${mode === 'report' ? 'bg-brand-primary text-white shadow-sm' : 'text-brand-primary hover:bg-brand-primary/20'}`}>
              <BarChart2 size={16} /> Report
            </button>
          </div>
          {mode === 'mark' && (
            <div className="relative flex-1 min-w-0 md:flex-none md:w-auto">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-dim" size={16} />
              <input 
                type="date" 
                value={selectedDate}
                max={todayKey}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-brand-bg border border-brand-card-border rounded-md py-2 md:py-1.5 pl-9 pr-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary w-full min-w-0 md:w-40 text-brand-text font-medium"
              />
            </div>
          )}
        </div>
      </div>

      {mode === 'mark' ? (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-brand-card border border-brand-card-border p-4 rounded-xl shadow-sm flex flex-col">
              <span className="text-brand-text-dim text-xs font-bold uppercase mb-1">Total Roster</span>
              <span className="text-2xl font-black text-brand-text">{stats.total}</span>
            </div>
            <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-900/30 p-4 rounded-xl shadow-sm flex flex-col">
              <span className="text-green-600 dark:text-green-500 text-xs font-bold uppercase mb-1 flex items-center gap-1"><CheckCircle size={14}/> Present</span>
              <span className="text-2xl font-black text-green-700 dark:text-green-400">{stats.present}</span>
            </div>
            <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 p-4 rounded-xl shadow-sm flex flex-col">
              <span className="text-red-600 dark:text-red-500 text-xs font-bold uppercase mb-1 flex items-center gap-1"><XCircle size={14}/> Absent</span>
              <span className="text-2xl font-black text-red-700 dark:text-red-400">{stats.absent}</span>
            </div>
            <div className="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-900/30 p-4 rounded-xl shadow-sm flex flex-col">
              <span className="text-yellow-600 dark:text-yellow-500 text-xs font-bold uppercase mb-1 flex items-center gap-1"><Clock size={14}/> Late</span>
              <span className="text-2xl font-black text-yellow-700 dark:text-yellow-400">{stats.late}</span>
            </div>
          </div>

          {/* Roster Table */}
          <div className="bg-brand-card border border-brand-card-border rounded-xl shadow-sm overflow-hidden">
            {loadingEntities ? (
              <div className="py-12 flex justify-center"><Spinner /></div>
            ) : roster.length === 0 ? (
              <div className="py-12 text-center text-brand-text-dim">No records found for this category.</div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-sm text-left text-brand-text-dim">
                    <thead className="text-xs uppercase bg-black/5 dark:bg-white/5 text-brand-text">
                      <tr>
                        <th className="px-6 py-4 w-1/2">Name</th>
                        <th className="px-6 py-4 text-right">Status Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roster.map(entity => {
                        const name = entity.name || entity.email;
                        const currentStatus = attendance[entity.id]?.status || 'none';
                        const editing = noteDraft?.id === entity.id;

                        return (
                          <React.Fragment key={entity.id}>
                            <tr className={`${editing ? '' : 'border-b'} border-brand-card-border hover:bg-black/5 dark:hover:bg-white/5 transition-colors`}>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center font-bold shrink-0">
                                    {(name || 'U').charAt(0).toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <span className="font-bold text-brand-text text-base">{name}</span>
                                    {!editing && renderSavedNote(entity.id)}
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex justify-end gap-2">
                                  {renderStatusButtons(entity.id, currentStatus, 'px-4 py-1.5')}
                                </div>
                              </td>
                            </tr>
                            {editing && (
                              <tr className="border-b border-brand-card-border">
                                <td colSpan={2} className="px-6 pb-4">{renderNoteEditor()}</td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards List View */}
                <div className="block sm:hidden divide-y divide-brand-card-border">
                  {roster.map(entity => {
                    const name = entity.name || entity.email;
                    const currentStatus = attendance[entity.id]?.status || 'none';
                    const editing = noteDraft?.id === entity.id;
                    return (
                      <div key={entity.id} className="p-4 space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center font-bold shrink-0">
                            {(name || 'U').charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <span className="font-bold text-brand-text text-base">{name}</span>
                            {!editing && renderSavedNote(entity.id)}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {renderStatusButtons(entity.id, currentStatus, 'flex-1 py-2 text-center')}
                        </div>
                        {editing && renderNoteEditor()}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </>
      ) : (
        /* Report Mode View */
        <div className="bg-brand-card border border-brand-card-border rounded-xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-brand-card-border">
            <h3 className="font-bold text-brand-text text-lg">{REPORT_DAYS}-Day Attendance Report</h3>
            <p className="text-sm text-brand-text-dim">Marked days in the last {REPORT_DAYS} calendar days. Students who left are counted only up to their exit date.</p>
          </div>
          
          {loadingReport || loadingEntities ? (
            <div className="py-12 flex justify-center"><Spinner /></div>
          ) : reportRows.length === 0 ? (
            <div className="py-12 text-center text-brand-text-dim">No records found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-brand-text-dim">
                <thead className="text-xs uppercase bg-black/5 dark:bg-white/5 text-brand-text">
                  <tr>
                    <th className="px-6 py-4">Name</th>
                    <th className="px-6 py-4 text-center">Present</th>
                    <th className="px-6 py-4 text-center">Absent</th>
                    <th className="px-6 py-4 text-center">Late</th>
                    <th className="px-6 py-4 text-right">Attendance %</th>
                  </tr>
                </thead>
                <tbody>
                  {reportRows.map(({ entity, ...rData }) => {
                    const name = entity.name || entity.email;
                    const attendancePct = rData.total > 0 ? Math.round(((rData.present + rData.late) / rData.total) * 100) : 0;
                    
                    return (
                      <tr key={entity.id} className="border-b border-brand-card-border hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4 font-bold text-brand-text">
                          <span className="flex items-center gap-2">
                            {name}
                            {activeTab !== 'staff' && isDiscontinued(entity) && !enrolledOn(entity, todayKey) && (
                              <span className="text-[10px] uppercase tracking-wide font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full">Left</span>
                            )}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center text-green-600 dark:text-green-500 font-medium">{rData.present}</td>
                        <td className="px-6 py-4 text-center text-red-500 font-medium">{rData.absent}</td>
                        <td className="px-6 py-4 text-center text-yellow-500 font-medium">{rData.late}</td>
                        <td className="px-6 py-4 text-right">
                          {rData.total === 0 ? (
                            // Nothing marked is not the same as 0% attendance.
                            <span className="font-black text-brand-text-dim">—</span>
                          ) : (
                            <span className={`font-black ${attendancePct >= 75 ? 'text-green-500' : attendancePct >= 50 ? 'text-yellow-500' : 'text-red-500'}`}>
                              {attendancePct}%
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
