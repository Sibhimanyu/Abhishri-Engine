import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { firestore } from '../firebase';
import { DEFAULT_CLASSES, cleanClasses } from './reportClasses';

/** The class list admins keep in configs/daily_report; the default until one is saved. */
export function useReportClasses() {
  const [classes, setClasses] = useState(DEFAULT_CLASSES);
  useEffect(() => {
    const unsub = onSnapshot(doc(firestore, 'configs', 'daily_report'), (snap) => {
      const saved = cleanClasses(snap.data()?.classes);
      setClasses(saved.length ? saved : DEFAULT_CLASSES);
    }, (err) => console.warn('Failed to load the class list:', err));
    return () => unsub();
  }, []);
  return classes;
}
