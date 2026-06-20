import React, { useState, useEffect } from 'react';
import { collection, doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import { firestore } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Trash2, 
  X, 
  AlertTriangle, 
  Info,
  CalendarDays,
  Sparkles,
  PartyPopper,
  CalendarCheck
} from 'lucide-react';

export default function SchoolCalendar() {
  const { userData } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedDateStr, setSelectedDateStr] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  
  // Form fields
  const [dayType, setDayType] = useState('regular_day');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const isStaffOrAdmin = !isPublic && (userData?.isAdmin || 
    ['admin', 'staff', 'teacher', 'pro'].includes(userData?.role) || 
    Object.keys(userData?.permissions || {}).length > 0);

  // Check if we are embedded or viewed standalone
  const isPublic = window.location.pathname.startsWith('/public-calendar');

  useEffect(() => {
    // Listen to school_calendar collection
    const calendarRef = collection(firestore, 'school_calendar');
    const unsubscribe = onSnapshot(calendarRef, (snapshot) => {
      const eventsMap = {};
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Skip exams entirely
        if (data.type !== 'exam') {
          eventsMap[doc.id] = { id: doc.id, ...data };
        }
      });
      setEvents(eventsMap);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching school calendar:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const handleDayClick = (dateStr) => {
    setSelectedDateStr(dateStr);
    const existing = events[dateStr];
    if (existing) {
      setDayType(existing.type || 'regular_day');
      setTitle(existing.title || '');
      setDescription(existing.description || '');
    } else {
      setDayType('regular_day');
      setTitle('');
      setDescription('');
    }
    setShowEditModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!isStaffOrAdmin || !selectedDateStr) return;

    try {
      const docRef = doc(firestore, 'school_calendar', selectedDateStr);
      if (dayType === 'regular_day' && !title && !description) {
        // If it's a regular day with no contents, delete it to keep DB clean
        await deleteDoc(docRef);
      } else {
        await setDoc(docRef, {
          type: dayType,
          title: title.trim(),
          description: description.trim(),
          updatedAt: new Date().toISOString(),
          updatedBy: userData?.displayName || userData?.email || 'Staff'
        }, { merge: true });
      }
      setShowEditModal(false);
    } catch (error) {
      console.error("Error saving calendar event:", error);
      alert("Failed to save event. Please check permissions.");
    }
  };

  const handleDelete = async () => {
    if (!isStaffOrAdmin || !selectedDateStr) return;
    if (window.confirm("Are you sure you want to clear the custom status for this day?")) {
      try {
        const docRef = doc(firestore, 'school_calendar', selectedDateStr);
        await deleteDoc(docRef);
        setShowEditModal(false);
      } catch (error) {
        console.error("Error deleting calendar event:", error);
        alert("Failed to delete event.");
      }
    }
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDayIndex = getFirstDayOfMonth(year, month); // 0 = Sunday, 1 = Monday, etc.

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const calendarCells = [];
  
  // Fill leading empty cells
  for (let i = 0; i < firstDayIndex; i++) {
    calendarCells.push(<div key={`empty-${i}`} className="aspect-square bg-transparent border border-brand-card-border/30 opacity-20"></div>);
  }

  // Fill calendar days
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const event = events[dateStr];
    const isToday = new Date().toDateString() === d.toDateString();

    let cellStyle = isPublic
      ? "hover:bg-black/5 text-brand-text border-brand-card-border/50"
      : "hover:bg-black/5 dark:hover:bg-white/5 text-brand-text border-brand-card-border/50";
    let bgBadge = "";

    if (event) {
      if (event.type === 'holiday') {
        cellStyle = isPublic
          ? "bg-red-500/10 hover:bg-red-500/20 border-red-500/30 text-red-700"
          : "bg-red-500/10 hover:bg-red-500/20 border-red-500/30 text-red-700 dark:text-red-300";
        bgBadge = "bg-red-500 text-white";
      } else if (event.type === 'event') {
        cellStyle = isPublic
          ? "bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/30 text-blue-700"
          : "bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/30 text-blue-700 dark:text-blue-300";
        bgBadge = "bg-blue-500 text-white";
      }
    }

    calendarCells.push(
      <div 
        key={dateStr} 
        onClick={() => (isStaffOrAdmin ? handleDayClick(dateStr) : event ? handleDayClick(dateStr) : null)}
        className={`aspect-square p-1 sm:p-2 border flex flex-col justify-center sm:justify-between items-center sm:items-stretch transition-all group ${cellStyle} ${
          isStaffOrAdmin ? 'cursor-pointer' : event ? 'cursor-pointer' : 'cursor-default'
        } ${isToday ? 'ring-2 ring-brand-primary shadow-md border-brand-primary' : ''} rounded-xl sm:rounded-2xl`}
      >
        <div className="flex sm:justify-between justify-center items-center w-full">
          <span className={`text-xs sm:text-sm font-black ${
            isToday 
              ? 'bg-brand-primary text-white w-5 h-5 rounded-full flex items-center justify-center sm:bg-transparent sm:text-brand-primary sm:w-auto sm:h-auto' 
              : ''
          }`}>
            {day}
          </span>
          {event && (
            <span className={`hidden sm:inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider ${bgBadge}`}>
              {event.type}
            </span>
          )}
        </div>
        
        {event?.title && (
          <div className="hidden sm:block mt-1 line-clamp-2 text-[10px] font-medium leading-tight opacity-90 group-hover:opacity-100">
            {event.title}
          </div>
        )}

        {/* Small color indicator dot for mobile portrait screens */}
        {event && (
          <span className={`sm:hidden w-1.5 h-1.5 rounded-full mt-1 ${
            event.type === 'holiday' ? 'bg-red-500' : 'bg-blue-500'
          }`}></span>
        )}

        {isStaffOrAdmin && (
          <div className="hidden sm:block text-[9px] text-brand-text-dim opacity-0 group-hover:opacity-100 transition-opacity self-end">
            Edit
          </div>
        )}
      </div>
    );
  }

  // Chronological list of events for the current month (ideal for portrait/mobile)
  const monthEvents = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const event = events[dateStr];
    if (event) {
      monthEvents.push({
        day,
        dateStr,
        ...event
      });
    }
  }

  const legendItems = [
    { type: 'holiday', label: 'Holiday / Closed', color: isPublic ? 'bg-red-500/10 border-red-500/30 text-red-700' : 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300' },
    { type: 'event', label: 'School Event', color: isPublic ? 'bg-blue-500/10 border-blue-500/30 text-blue-700' : 'bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-300' }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Calendar Header Card */}
      <div className="bg-brand-card border border-brand-card-border p-6 rounded-3xl shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-brand-primary/10 rounded-2xl text-brand-primary">
            <CalendarDays size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-brand-text tracking-tight">School Academic Calendar</h1>
            <p className="text-xs text-brand-text-dim">Holidays, academic activities, and celebrations</p>
          </div>
        </div>

        {/* Month Selector Controls */}
        <div className="flex items-center justify-between w-full md:w-auto gap-2">
          <button 
            onClick={handlePrevMonth}
            className={`p-2 border border-brand-card-border rounded-xl hover:bg-black/5 text-brand-text transition-colors ${isPublic ? '' : 'dark:hover:bg-white/5'}`}
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-bold min-w-32 text-center text-brand-text">
            {monthNames[month]} {year}
          </span>
          <button 
            onClick={handleNextMonth}
            className={`p-2 border border-brand-card-border rounded-xl hover:bg-black/5 text-brand-text transition-colors ${isPublic ? '' : 'dark:hover:bg-white/5'}`}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="bg-brand-card border border-brand-card-border p-3 sm:p-6 rounded-3xl shadow-sm">
        {/* Days of Week */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2 text-center">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, index) => (
            <div key={index} className="text-[10px] sm:text-xs font-black text-brand-text-dim uppercase tracking-wider py-1">
              <span className="hidden sm:inline">{d}</span>
              <span className="sm:hidden">{d.substring(0, 1)}</span>
            </div>
          ))}
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {calendarCells}
        </div>
      </div>

      {/* Agenda/List View (Highly readable in portrait/mobile formats) */}
      <div className="bg-brand-card border border-brand-card-border p-6 rounded-3xl shadow-sm">
        <h3 className="text-xs font-black text-brand-text uppercase tracking-widest mb-4 flex items-center gap-1.5">
          <CalendarCheck size={14} className="text-brand-primary" />
          Agenda & Events for {monthNames[month]} {year}
        </h3>
        
        {monthEvents.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {monthEvents.map((evt) => (
              <div 
                key={evt.dateStr}
                onClick={() => handleDayClick(evt.dateStr)}
                className={`p-4 border rounded-2xl cursor-pointer hover:scale-[1.01] hover:shadow-sm transition-all flex items-start gap-3.5 ${
                  evt.type === 'holiday' 
                    ? 'bg-red-500/5 hover:bg-red-500/10 border-red-500/20' 
                    : 'bg-blue-500/5 hover:bg-blue-500/10 border-blue-500/20'
                }`}
              >
                <div className={`w-10 h-10 shrink-0 rounded-xl flex flex-col items-center justify-center ${
                  evt.type === 'holiday' ? 'bg-red-500/10 text-red-600' : 'bg-blue-500/10 text-blue-600'
                }`}>
                  <span className="text-xs font-black leading-none">{evt.day}</span>
                  <span className="text-[8px] font-bold uppercase leading-none mt-0.5">{monthNames[month].substring(0, 3)}</span>
                </div>
                
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-brand-text truncate leading-tight">{evt.title}</h4>
                  <p className="text-xs text-brand-text-dim mt-1 line-clamp-2 leading-relaxed">
                    {evt.description || `No extra details specified. Click to view.`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-brand-text-dim text-xs">
            No school events or holidays scheduled for this month.
          </div>
        )}
      </div>

      {/* Legend & Summary Info */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-brand-card border border-brand-card-border p-6 rounded-3xl shadow-sm md:col-span-2">
          <h3 className="text-xs font-black text-brand-text uppercase tracking-widest mb-4">Calendar Legend</h3>
          <div className="flex flex-wrap gap-3">
            {legendItems.map((item) => (
              <div 
                key={item.type} 
                className={`px-4 py-2 border rounded-xl flex items-center gap-2.5 text-xs font-bold ${item.color}`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-current"></span>
                {item.label}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-brand-card border border-brand-card-border p-6 rounded-3xl shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-black text-brand-text uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <Sparkles size={12} className="text-brand-primary" /> Notice
            </h3>
            <p className="text-xs text-brand-text-dim leading-relaxed">
              {isStaffOrAdmin 
                ? "As a staff/admin, you can click on any calendar cell to configure days or edit details." 
                : "Click on colored dates or agenda cards to view detailed descriptions."
              }
            </p>
          </div>
          {isStaffOrAdmin && (
            <div className="mt-4 text-[10px] text-brand-primary font-bold bg-brand-primary/5 border border-brand-primary/10 rounded-lg p-2.5 flex items-start gap-2">
              <Info size={14} className="shrink-0 mt-0.5" />
              <span>Editing regular days and clearing details will reset them to normal calendar days.</span>
            </div>
          )}
        </div>
      </div>

      {/* Day Edit/Detail Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowEditModal(false)}></div>
          
          <div className="relative bg-brand-card border border-brand-card-border rounded-3xl max-w-md w-full shadow-2xl p-6 overflow-hidden animate-in zoom-in-95 duration-200">
            <button 
              onClick={() => setShowEditModal(false)}
              className={`absolute right-4 top-4 text-brand-text-dim hover:text-brand-text p-2 rounded-xl bg-black/5 transition-colors ${isPublic ? '' : 'dark:bg-white/5'}`}
            >
              <X size={16} />
            </button>

            <h2 className="text-lg font-black text-brand-text tracking-tight mb-2 flex items-center gap-2">
              <CalendarIcon size={18} className="text-brand-primary" />
              {new Date(selectedDateStr).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </h2>
            <p className="text-xs text-brand-text-dim mb-6">Configure custom title, details, and color tag</p>

            {isStaffOrAdmin ? (
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-brand-text-dim uppercase tracking-wider mb-2">Day Type / Label</label>
                  <select 
                    value={dayType} 
                    onChange={(e) => setDayType(e.target.value)}
                    className={`w-full bg-black/5 border border-brand-card-border/60 rounded-xl px-3 py-2 text-sm font-semibold text-brand-text focus:outline-none focus:border-brand-primary ${isPublic ? '' : 'dark:bg-white/5'}`}
                  >
                    <option value="regular_day">Regular Day (Normal)</option>
                    <option value="holiday">Holiday (Red)</option>
                    <option value="event">Event (Blue)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-brand-text-dim uppercase tracking-wider mb-2">Title / Subject</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Independence Day, School Opening..."
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className={`w-full bg-black/5 border border-brand-card-border/60 rounded-xl px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary font-medium ${isPublic ? '' : 'dark:bg-white/5'}`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-brand-text-dim uppercase tracking-wider mb-2">Description / Note</label>
                  <textarea 
                    rows="3"
                    placeholder="Provide detailed description, timings, or uniform instructions..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className={`w-full bg-black/5 border border-brand-card-border/60 rounded-xl px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary font-medium ${isPublic ? '' : 'dark:bg-white/5'}`}
                  />
                </div>

                <div className="flex gap-2 pt-4">
                  <button 
                    type="submit"
                    className="flex-1 bg-brand-primary hover:bg-brand-primary-hover text-white py-2.5 rounded-xl font-bold transition-colors text-sm shadow-sm"
                  >
                    Save Changes
                  </button>
                  {events[selectedDateStr] && (
                    <button 
                      type="button"
                      onClick={handleDelete}
                      className="px-3 border border-red-500/20 hover:bg-red-500/10 text-red-500 rounded-xl transition-colors"
                      title="Clear Event"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    dayType === 'holiday' ? 'bg-red-500/10 text-red-700' : 'bg-blue-500/10 text-blue-700'
                  }`}>
                    {dayType}
                  </span>
                </div>
                
                {title ? (
                  <div className="bg-black/5 p-4 rounded-2xl border border-brand-card-border/40">
                    <h4 className="text-sm font-black text-brand-text leading-tight">{title}</h4>
                    {description && (
                      <p className="text-xs text-brand-text-dim mt-2 leading-relaxed whitespace-pre-line">{description}</p>
                    )}
                  </div>
                ) : (
                  <div className="bg-black/5 p-4 rounded-2xl border border-brand-card-border/40 text-center text-xs text-brand-text-dim">
                    No custom announcements or details are added for this day.
                  </div>
                )}

                {events[selectedDateStr]?.updatedBy && (
                  <div className="text-[10px] text-brand-text-dim text-right">
                    Last updated by {events[selectedDateStr].updatedBy}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
