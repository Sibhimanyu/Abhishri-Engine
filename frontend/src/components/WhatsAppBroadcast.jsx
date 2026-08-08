import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable, getFunctions } from 'firebase/functions';
import { ref as storageRef, uploadBytes, getDownloadURL, listAll } from 'firebase/storage';
import { ref as rtdbRef, get as rtdbGet } from 'firebase/database';
import { firestore, storage, rtdb } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { Radio, Users, LayoutTemplate, Shield, ShieldCheck, Send, FlaskConical, Eye, UploadCloud, Image as ImageIcon, X } from 'lucide-react';
import imageCompression from 'browser-image-compression';

export default function WhatsAppBroadcast() {
  const { userData } = useAuth();
  const [lists, setLists] = useState({});
  const [templates, setTemplates] = useState([]);
  const [campaignName, setCampaignName] = useState(`Broadcast ${new Date().toLocaleDateString()}`);
  const [selectedList, setSelectedList] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [variables, setVariables] = useState({});
  const [isSimulation, setIsSimulation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [preparedData, setPreparedData] = useState(null);
  const [headerImageUrl, setHeaderImageUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [existingHeaders, setExistingHeaders] = useState([]);
  const [loadingHeaders, setLoadingHeaders] = useState(false);

  // Scanner state
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [lookbackDays, setLookbackDays] = useState(7);
  const [scannerLoading, setScannerLoading] = useState(false);
  const [scannerResults, setScannerResults] = useState(null);
  const [appliedExcludedNumbers, setAppliedExcludedNumbers] = useState([]);

  // Fetch Lists
  useEffect(() => {
    const unsub = onSnapshot(collection(firestore, 'whatsapp_lists'), (snap) => {
      const listsData = {};
      snap.forEach(doc => listsData[doc.id] = { id: doc.id, ...doc.data() });
      setLists(listsData);
    });
    return () => unsub();
  }, []);

  // Fetch Templates
  useEffect(() => {
    const unsub = onSnapshot(collection(firestore, 'configs', 'whatsapp_main', 'templates'), (snap) => {
      const tmpls = [];
      snap.forEach(doc => tmpls.push({ id: doc.id, ...doc.data() }));
      setTemplates(tmpls);
    });
    return () => unsub();
  }, []);

  const activeTemplateObj = templates.find(t => (t.template_name || t.name) === selectedTemplate);
  const needsImageHeader = activeTemplateObj?.components?.some(c => c.type === 'HEADER' && c.format === 'IMAGE');

  useEffect(() => {
    if (needsImageHeader) {
      setLoadingHeaders(true);
      const listRef = storageRef(storage, 'whatsapp_headers');
      listAll(listRef).then(async (res) => {
        const urls = await Promise.all(res.items.map(async (itemRef) => {
          const url = await getDownloadURL(itemRef);
          return { name: itemRef.name, url };
        }));
        setExistingHeaders(urls);
      }).catch(err => {
        console.error("Failed to fetch headers", err);
      }).finally(() => {
        setLoadingHeaders(false);
      });
    }
  }, [needsImageHeader]);

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return alert('File size must be under 5MB');
    
    setUploadingImage(true);
    try {
      let fileToUpload = file;
      if (fileToUpload.type.startsWith('image/')) {
        try {
          const options = { maxSizeMB: 0.2, maxWidthOrHeight: 1280, useWebWorker: true };
          fileToUpload = await imageCompression(fileToUpload, options);
        } catch (e) {
          console.warn('Compression failed, using original', e);
        }
      }
      const sRef = storageRef(storage, `whatsapp_headers/${Date.now()}_${fileToUpload.name}`);
      await uploadBytes(sRef, fileToUpload, { cacheControl: 'public,max-age=31536000' });
      const url = await getDownloadURL(sRef);
      setHeaderImageUrl(url);
    } catch (err) {
      console.error("Image upload failed:", err);
      alert('Failed to upload image. Please try again.');
    }
    setUploadingImage(false);
  };

  const runScanner = async () => {
    if (!selectedTemplate || !selectedList) return alert('Please select a template and audience list.');
    setScannerLoading(true);
    setScannerResults(null);
    try {
      let tempRecipients = [];
      const listId = selectedList.replace('list:', '');
      const listObj = lists[listId];

      if (listObj?.isDynamic) {
        const snap = await getDocs(collection(firestore, 'students'));
        const processStudent = (doc) => {
          const data = doc.data();
          if (data.fatherPhone) tempRecipients.push(String(data.fatherPhone).replace(/[^\d]/g, "").slice(-10));
          if (data.motherPhone) tempRecipients.push(String(data.motherPhone).replace(/[^\d]/g, "").slice(-10));
        };
        snap.forEach(processStudent);
      } else {
        const membersSnap = await getDocs(collection(firestore, 'whatsapp_lists', listId, 'members'));
        membersSnap.forEach(doc => {
          const rawPhone = doc.data().phone ? String(doc.data().phone).replace(/[^\d]/g, "").slice(-10) : "";
          if (rawPhone.length === 10) tempRecipients.push(rawPhone);
        });
      }
      
      const uniqueRecipients = Array.from(new Set(tempRecipients)).filter(r => r.length === 10);

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);
      const historySnap = await getDocs(collection(firestore, 'whatsapp_history'));
      const matchingBroadcastIds = [];
      historySnap.forEach(doc => {
        const data = doc.data();
        if (data.template === selectedTemplate && data.timestamp && data.timestamp.toDate() >= cutoffDate) {
          matchingBroadcastIds.push(doc.id);
        }
      });

      if (matchingBroadcastIds.length === 0) {
        setScannerResults({ scannedCount: uniqueRecipients.length, excludedNumbers: [] });
        setScannerLoading(false);
        return;
      }

      const alreadySentTo = new Set();
      const normalize = (phone) => String(phone || '').replace(/\D/g, '').slice(-10);

      for (const bId of matchingBroadcastIds) {
        const logsSnap = await rtdbGet(rtdbRef(rtdb, `whatsapp_broadcast_logs/${bId}`));
        const logs = logsSnap.val() || {};
        Object.values(logs).forEach(log => {
          const status = (log.status || '').toLowerCase();
          const phone = log.recipientId || log.phone;
          if (!phone) return;
          const cleanPhone = normalize(phone);
          if (['sent', 'delivered', 'read', 'processing', 'failed', 'error'].includes(status)) {
            alreadySentTo.add(cleanPhone);
          }
        });
      }

      const excluded = uniqueRecipients.filter(r => alreadySentTo.has(r));
      setScannerResults({ scannedCount: uniqueRecipients.length, excludedNumbers: excluded });

    } catch (err) {
      console.error(err);
      alert('Failed to run scanner.');
    }
    setScannerLoading(false);
  };

  const handlePrepare = async () => {
    if (!selectedTemplate || !selectedList) return alert('Please select a template and audience list.');
    if (needsImageHeader && !headerImageUrl) return alert('This template requires an Image Header. Please upload an image.');
    setLoading(true);

    try {
      let listName = 'Unknown List';
      let recipients = [];
      const listId = selectedList.replace('list:', '');
      const listObj = lists[listId];

      if (listObj?.isDynamic) {
        listName = listObj.name || 'Dynamic List';
        const snap = await getDocs(collection(firestore, 'students'));
        
        const processStudent = (doc) => {
          const data = doc.data();
          if (data.fatherPhone) {
            const raw = String(data.fatherPhone).replace(/[^\d]/g, "");
            if (raw.length >= 10) recipients.push({ name: data.fatherName || 'Parent of ' + (data.name || 'Student'), phone: raw });
          }
          if (data.motherPhone) {
            const raw = String(data.motherPhone).replace(/[^\d]/g, "");
            if (raw.length >= 10) recipients.push({ name: data.motherName || 'Parent of ' + (data.name || 'Student'), phone: raw });
          }
        };
        
        snap.forEach(processStudent);
      } else {
        listName = listObj?.name || 'Unknown List';
        
        const membersRef = collection(firestore, 'whatsapp_lists', listId, 'members');
        const membersSnap = await getDocs(membersRef);
        
        membersSnap.forEach(doc => {
          const data = doc.data();
          const rawPhone = data.phone ? String(data.phone).replace(/[^\d]/g, "") : "";
          if (rawPhone.length >= 10) {
            recipients.push({
              name: data.name || 'Unknown',
              phone: rawPhone
            });
          }
        });
      }

      // Deduplicate recipients by phone number and apply scanner exclusions
      const uniqueMap = new Map();
      const excludedSet = new Set(appliedExcludedNumbers);
      
      recipients.forEach(r => {
        const last10 = r.phone.slice(-10);
        if (!uniqueMap.has(last10) && !excludedSet.has(last10)) {
          uniqueMap.set(last10, r);
        }
      });
      recipients = Array.from(uniqueMap.values());
      const excludedCount = appliedExcludedNumbers.length;
      
      if (recipients.length === 0) {
        alert('This list has no members.');
        setLoading(false);
        return;
      }
      
      const activeTemplateObj = templates.find(t => (t.template_name || t.name) === selectedTemplate);
      const category = activeTemplateObj?.category || 'MARKETING';
      const ratePerMsg = category === 'UTILITY' ? 0.25 : 0.95;
      const estimatedCost = recipients.length * ratePerMsg;

      setPreparedData({
        listName,
        recipients,
        estimatedCost,
        ratePerMsg,
        category,
        excludedCount,
        headerImageUrl: needsImageHeader ? headerImageUrl : null
      });
      setShowConfirmModal(true);
    } catch (err) {
      console.error(err);
      alert('Failed to prepare broadcast.');
    }
    setLoading(false);
  };

  const handleConfirmLaunch = async () => {
    if (loading) return; // re-entrancy guard: ignore a double-click/double-tap before loading flips the button off
    setShowConfirmModal(false);
    setLoading(true);

    const functions = getFunctions();
    const sendBroadcast = httpsCallable(functions, 'sendWhatsAppBroadcast');
    
    try {
      const { listName, recipients, headerImageUrl } = preparedData;
      
      const broadcastRef = doc(collection(firestore, 'whatsapp_history'));
      const broadcastId = broadcastRef.id;

      await setDoc(broadcastRef, {
        template: selectedTemplate,
        campaignName: campaignName,
        listName: listName,
        recipientsCount: recipients.length,
        contactsCount: recipients.length,
        sentCount: 0,
        deliveredCount: 0,
        readCount: 0,
        failedCount: 0,
        excludedCount: 0,
        processingCount: 0,
        queuedCount: recipients.length,
        timestamp: serverTimestamp(),
        status: 'dispatching',
        broadcastId: broadcastId,
        isSimulation: isSimulation
      });

      // Simplified mock submission
      if (isSimulation) {
        alert('Simulation launched successfully!');
      } else {
        await sendBroadcast({
          templateName: selectedTemplate,
          recipients: recipients,
          variables: Object.values(variables),
          broadcastId: broadcastId,
          contactsCount: recipients.length,
          headerImageUrl: headerImageUrl || null,
          excludedNumbers: appliedExcludedNumbers,
          isSimulation: false
        });
        alert('Broadcast launched successfully!');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to launch broadcast.');
    }
    setLoading(false);
  };

  const bodyComp = activeTemplateObj?.components?.find(c => c.type === 'BODY');
  const templateText = bodyComp?.text || '';

  // Extract {{1}}, {{2}} from template text
  const uniqueVars = [...new Set([...templateText.matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1]))].sort((a,b) => Number(a) - Number(b));

  let previewText = templateText;
  uniqueVars.forEach(v => {
    previewText = previewText.replace(new RegExp(`\\{\\{${v}\\}\\}`, 'g'), variables[v] || `{{${v}}}`);
  });

  return (
    <div className="flex h-full bg-brand-bg rounded-xl overflow-hidden border border-brand-card-border m-6 shadow-sm">
      
      {/* Left: Configuration Form */}
      <div className="w-full md:w-1/2 bg-brand-card border-r border-brand-card-border flex flex-col relative">
        <div className="p-4 border-b border-brand-card-border flex items-center gap-2 text-brand-primary font-bold bg-brand-primary/5">
          <Radio size={18} /> New Broadcast
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          <div>
            <label className="flex items-center gap-2 text-sm font-bold text-brand-text mb-2"><Radio size={14}/> Campaign Name</label>
            <input 
              type="text" 
              value={campaignName}
              onChange={e => setCampaignName(e.target.value)}
              className="w-full bg-brand-bg border border-brand-card-border rounded-lg py-2 px-3 focus:border-brand-primary outline-none" 
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-bold text-brand-text mb-2"><Users size={14}/> Audience</label>
            <select 
              value={selectedList}
              onChange={e => {
                setSelectedList(e.target.value);
                setAppliedExcludedNumbers([]);
                setScannerResults(null);
              }}
              className="w-full bg-brand-bg border border-brand-card-border rounded-lg py-2 px-3 focus:border-brand-primary outline-none"
            >
              <option value="" disabled>-- Choose Audience --</option>
              {Object.entries(lists).map(([id, list]) => (
                <option key={id} value={`list:${id}`}>{list.name} ({list.isDynamic ? 'Live' : list.count || 0})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-bold text-brand-text mb-2"><LayoutTemplate size={14}/> Template</label>
            <select 
              value={selectedTemplate}
              onChange={e => {
                setSelectedTemplate(e.target.value);
                setVariables({});
                setHeaderImageUrl('');
                setAppliedExcludedNumbers([]);
                setScannerResults(null);
              }}
              className="w-full bg-brand-bg border border-brand-card-border rounded-lg py-2 px-3 focus:border-brand-primary outline-none"
            >
              <option value="" disabled>-- Choose a Template --</option>
              {templates.map(t => {
                const name = t.template_name || t.name;
                return <option key={t.id} value={name}>{name} ({t.category})</option>;
              })}
            </select>
          </div>

          {needsImageHeader && (
            <div className="bg-blue-500/10 dark:bg-blue-500/5 p-4 rounded-xl border border-blue-500/20 mb-4">
              <label className="block text-sm font-bold text-blue-700 dark:text-blue-400 mb-2 flex items-center gap-2"><ImageIcon size={16} /> Header Image Required</label>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-brand-text mb-1">Select from Storage (whatsapp_headers/)</label>
                  <select
                    className="w-full bg-brand-bg border border-brand-card-border rounded-lg py-2 px-3 focus:border-brand-primary outline-none text-sm"
                    value={headerImageUrl}
                    onChange={(e) => setHeaderImageUrl(e.target.value)}
                  >
                    <option value="">-- Choose an image --</option>
                    {loadingHeaders ? (
                      <option disabled>Loading...</option>
                    ) : (
                      existingHeaders.map(h => (
                        <option key={h.name} value={h.url}>{h.name}</option>
                      ))
                    )}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <div className="h-px bg-brand-card-border flex-1"></div>
                  <span className="text-[10px] text-brand-text-dim font-bold uppercase tracking-widest">Or Upload New</span>
                  <div className="h-px bg-brand-card-border flex-1"></div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={handleImageUpload}
                      disabled={uploadingImage}
                      className="w-full text-sm text-brand-text-dim file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-500/10 file:text-blue-600 hover:file:bg-blue-500/20 file:cursor-pointer disabled:opacity-50 outline-none"
                    />
                  </div>
                  {uploadingImage && <span className="text-xs text-brand-text-dim font-bold animate-pulse">Uploading...</span>}
                </div>
              </div>
            </div>
          )}

          {uniqueVars.length > 0 && (
            <div className="bg-black/5 dark:bg-white/5 p-4 rounded-xl border border-brand-card-border">
              <label className="block text-sm font-bold text-brand-text mb-3">Template Variables</label>
              <div className="space-y-3">
                {uniqueVars.map(v => (
                  <input 
                    key={v}
                    type="text" 
                    placeholder={`Value for {{${v}}}`}
                    value={variables[v] || ''}
                    onChange={e => setVariables({...variables, [v]: e.target.value})}
                    className="w-full bg-white dark:bg-brand-sidebar border border-brand-card-border rounded-lg py-2 px-3 outline-none focus:border-brand-primary text-sm"
                  />
                ))}
              </div>
            </div>
          )}

          <button onClick={() => setShowScannerModal(true)} className={`w-full py-3 rounded-xl border font-bold flex justify-center items-center gap-2 transition-colors ${appliedExcludedNumbers.length > 0 ? 'bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400 hover:bg-green-500/20' : 'bg-cyan-500/10 border-cyan-500/20 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/20'}`}>
            <ShieldCheck size={18} /> {appliedExcludedNumbers.length > 0 ? `Shield Active (${appliedExcludedNumbers.length} excluded)` : 'Smart Protection Scanner'}
          </button>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-brand-card-border bg-brand-sidebar shrink-0">
          <div className="flex items-center justify-between mb-4 px-2">
            <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-500 font-bold text-sm">
              <FlaskConical size={16} /> Simulation Mode
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" checked={isSimulation} onChange={e => setIsSimulation(e.target.checked)} />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-brand-primary"></div>
            </label>
          </div>
          <button 
            onClick={handlePrepare}
            disabled={loading || uploadingImage}
            className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors shadow-sm ${
              (loading || uploadingImage) ? 'bg-brand-card-border text-brand-text-dim cursor-not-allowed' : 'bg-brand-primary text-white hover:bg-brand-primary/90'
            }`}
          >
            {(loading || uploadingImage) ? 'Processing...' : <><Send size={18} /> Launch Broadcast</>}
          </button>
        </div>
      </div>

      {/* Right: Live Preview */}
      <div className="hidden md:flex flex-1 bg-brand-sidebar flex-col items-center justify-center p-8 relative">
        <div className="absolute top-4 left-4 flex items-center gap-2 text-brand-text-dim text-sm font-bold uppercase tracking-widest">
          <Eye size={16} /> Live Preview
        </div>
        
        {/* Phone Mockup */}
        <div className="w-[320px] h-[600px] border-[8px] border-black rounded-[40px] bg-[#efeae2] dark:bg-[#0b141a] overflow-hidden relative shadow-2xl flex flex-col">
          {/* Header */}
          <div className="h-16 bg-[#005c4b] dark:bg-[#202c33] text-white flex items-center px-4 shrink-0 shadow-md z-10">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold text-sm mr-3">
              <img src="/logo-white.png" className="w-6 h-6 object-contain" loading="lazy" />
            </div>
            <div>
              <h3 className="font-bold text-[15px] leading-tight">Abhishri Academy</h3>
              <p className="text-[11px] opacity-80">Business account</p>
            </div>
          </div>
          
          {/* Chat Body */}
          <div className="flex-1 p-4 relative" style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")', backgroundSize: 'cover', backgroundBlendMode: 'multiply' }}>
            {selectedTemplate ? (
              <div className="bg-white dark:bg-[#202c33] text-black dark:text-[#e9edef] rounded-lg p-1 shadow-sm max-w-[90%] float-left clear-both text-sm relative pb-6 flex flex-col">
                {needsImageHeader && headerImageUrl ? (
                  <img src={headerImageUrl} alt="Header" className="w-full h-32 object-cover rounded mb-2" loading="lazy" />
                ) : needsImageHeader ? (
                  <div className="w-full h-32 bg-brand-bg rounded mb-2 flex items-center justify-center text-brand-text-dim border border-brand-card-border"><ImageIcon size={24}/></div>
                ) : null}
                <div className="px-2 pb-1 whitespace-pre-wrap">{previewText}</div>
                <span className="absolute bottom-1 right-2 text-[10px] text-gray-500">12:00</span>
              </div>
            ) : (
              <div className="bg-white/80 dark:bg-black/50 text-center p-3 rounded-lg text-sm shadow-sm absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                Select a template to preview it here
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && preparedData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-brand-sidebar border border-brand-card-border rounded-xl w-full max-w-md p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-brand-text mb-4">Confirm Broadcast Launch</h2>
            <div className="space-y-4 mb-6">
              <div className="flex justify-between border-b border-brand-card-border pb-2">
                <span className="text-brand-text-dim text-sm">Campaign Name</span>
                <span className="text-brand-text font-bold text-sm">{campaignName}</span>
              </div>
              <div className="flex justify-between border-b border-brand-card-border pb-2">
                <span className="text-brand-text-dim text-sm">Template</span>
                <span className="text-brand-text font-bold text-sm">{selectedTemplate}</span>
              </div>
              <div className="flex justify-between border-b border-brand-card-border pb-2">
                <span className="text-brand-text-dim text-sm">Target Audience</span>
                <span className="text-brand-text font-bold text-sm">{preparedData.listName}</span>
              </div>
              <div className="flex justify-between border-b border-brand-card-border pb-2">
                <span className="text-brand-text-dim text-sm">Total Recipients</span>
                <span className="text-brand-text font-bold text-sm">{preparedData.recipients.length}</span>
              </div>
              {preparedData.excludedCount > 0 && (
                <div className="flex justify-between border-b border-brand-card-border pb-2">
                  <span className="text-brand-text-dim text-sm text-red-500">Excluded (Scanner)</span>
                  <span className="text-red-500 font-bold text-sm">{preparedData.excludedCount}</span>
                </div>
              )}
              <div className="flex justify-between border-b border-brand-card-border pb-2">
                <span className="text-brand-text-dim text-sm">Estimated Cost</span>
                <span className="text-brand-secondary font-bold text-sm">~₹{preparedData.estimatedCost.toFixed(2)}</span>
              </div>
            </div>
            
            <p className="text-xs text-brand-text-dim mb-6 text-center italic">
              Note: Final billing is determined by Fast2SMS and may vary based on open 24-hour conversation windows.
            </p>

            <div className="flex gap-3">
              <button 
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 px-4 py-2 rounded-lg border border-brand-card-border text-brand-text-dim hover:text-brand-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors font-bold text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmLaunch}
                disabled={loading}
                className={`flex-1 px-4 py-2 rounded-lg text-white transition-colors font-bold text-sm flex justify-center items-center gap-2 ${loading ? 'bg-brand-card-border cursor-not-allowed' : 'bg-brand-primary hover:bg-brand-primary/90'}`}
              >
                {loading ? 'Sending...' : <>Confirm & Send <Send size={16}/></>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scanner Modal */}
      {showScannerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-brand-sidebar border border-brand-card-border rounded-xl w-full max-w-md p-6 shadow-2xl relative">
            <button onClick={() => setShowScannerModal(false)} className="absolute top-4 right-4 text-brand-text-dim hover:text-brand-text">
              <X size={20} />
            </button>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center">
                <ShieldCheck size={20} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-brand-text">Smart Frequency Filter</h2>
                <p className="text-xs text-brand-text-dim">Ensuring a healthy message cadence</p>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <div className="bg-black/5 dark:bg-white/5 p-4 rounded-xl border border-brand-card-border flex justify-between items-center">
                <span className="text-sm font-bold text-brand-text-dim uppercase">Lookback Window</span>
                <div className="flex items-center gap-2">
                  <input 
                    type="number" 
                    value={lookbackDays} 
                    onChange={e => setLookbackDays(parseInt(e.target.value) || 1)}
                    min="1" max="30"
                    className="w-16 bg-brand-bg border border-brand-card-border rounded-lg py-1 px-2 text-center focus:border-brand-primary outline-none text-brand-text font-bold"
                  />
                  <span className="text-sm font-bold text-brand-text">Days</span>
                </div>
              </div>

              {scannerResults && (
                <div className="p-4 rounded-xl border border-brand-card-border bg-brand-bg text-center">
                  {scannerResults.excludedNumbers.length === 0 ? (
                    <div className="text-green-500 font-bold text-sm">Perfect! No recipients found in the last {lookbackDays} days. Your entire audience is "fresh".</div>
                  ) : (
                    <div>
                      <div className="text-brand-text text-sm mb-2">Out of <span className="font-bold">{scannerResults.scannedCount}</span> targeted recipients, we found:</div>
                      <div className="text-2xl font-bold text-red-500 mb-2">{scannerResults.excludedNumbers.length}</div>
                      <div className="text-xs text-brand-text-dim">who have already received or failed this exact template in the last {lookbackDays} days.</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3">
              {!scannerResults ? (
                <button 
                  onClick={runScanner}
                  disabled={scannerLoading}
                  className="w-full py-2 bg-cyan-500 text-white rounded-lg font-bold hover:bg-cyan-600 transition-colors disabled:opacity-50"
                >
                  {scannerLoading ? 'Scanning...' : 'Run Scanner'}
                </button>
              ) : (
                <button 
                  onClick={() => {
                    setAppliedExcludedNumbers(scannerResults.excludedNumbers);
                    setShowScannerModal(false);
                  }}
                  className="w-full py-2 bg-brand-primary text-white rounded-lg font-bold hover:bg-brand-primary/90 transition-colors"
                >
                  Apply Shield
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
