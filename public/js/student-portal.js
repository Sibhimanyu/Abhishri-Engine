// Student Portal — parent dashboard and tuition student dashboard

window.studentPortal = {
    studentData: null,

    async initialize() {
        const container = document.getElementById('student-portal-content');
        if (!container) return;
        container.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:60vh;gap:20px;opacity:0.7;"><div class="loading-spinner"></div><p style="font-weight:600;color:var(--text-dim);letter-spacing:1px;">Loading your dashboard…</p></div>`;

        const userData = window.currentUserData || {};
        const dashboardType = userData.dashboardType || 'parent';
        let student = null;

        if (userData.linkedStudentId) {
            try {
                const snap = await firestore.collection('modules').doc('student_directory').collection('students').doc(userData.linkedStudentId).get();
                if (snap.exists) student = { id: snap.id, ...snap.data() };
            } catch (e) {
                if (e?.code === 'permission-denied') {
                    this._showRulesError(container);
                    return;
                }
                console.warn('Student fetch failed:', e);
            }
        }

        this.studentData = student;
        if (!student) { this._showNotLinked(container); return; }

        if (dashboardType === 'student') {
            await this.renderStudentDashboard(student, container);
        } else {
            await this.renderParentDashboard(student, container);
        }
        if (window.lucide) lucide.createIcons();
    },

    // ── Shared helpers ────────────────────────────────────────────────────────
    _showNotLinked(container) {
        container.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;gap:24px;text-align:center;padding:40px;">
                <div style="background:rgba(251,191,36,0.1);width:80px;height:80px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fbbf24;">
                    <i data-lucide="link-2" style="width:40px;height:40px;"></i>
                </div>
                <h2 style="font-size:1.8rem;font-weight:800;">Profile Not Linked</h2>
                <p style="color:var(--text-dim);max-width:380px;line-height:1.6;">Your account hasn't been linked to a student record yet. Please contact the school administrator.</p>
                <button class="btn btn-secondary" onclick="logout()"><i data-lucide="log-out"></i> Sign Out</button>
            </div>`;
        if (window.lucide) lucide.createIcons();
    },

    _showRulesError(container) {
        container.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;gap:20px;text-align:center;padding:40px;">
                <div style="background:rgba(232,105,102,0.1);width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--accent-primary);">
                    <i data-lucide="lock" style="width:36px;height:36px;"></i>
                </div>
                <h2 style="font-size:1.6rem;font-weight:800;">Access Not Configured</h2>
                <p style="color:var(--text-dim);max-width:400px;line-height:1.6;">Your account is linked but Firestore rules are blocking the read. Please ask the administrator to add the student portal rule.</p>
                <button class="btn btn-secondary" onclick="logout()"><i data-lucide="log-out"></i> Sign Out</button>
            </div>`;
        if (window.lucide) lucide.createIcons();
    },

    _wingBadge(type) {
        if (type === 'tuition') return `<span style="background:rgba(251,191,36,0.15);color:#fbbf24;padding:4px 14px;border-radius:8px;font-size:0.72rem;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;">Tuition</span>`;
        return `<span style="background:rgba(115,199,200,0.15);color:var(--accent-secondary);padding:4px 14px;border-radius:8px;font-size:0.72rem;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;">Preschool</span>`;
    },

    _feeCalc(feeData) {
        if (!feeData || !(feeData.components || []).length) return null;
        const now = new Date();
        const startMonth = feeData.startMonth !== undefined ? feeData.startMonth : 5;
        const academicStartYear = feeData.academicStartYear !== undefined ? feeData.academicStartYear
            : (now.getMonth() < startMonth ? now.getFullYear() - 1 : now.getFullYear());
        const monthsPassed = (now.getFullYear() - academicStartYear) * 12 + (now.getMonth() - startMonth);
        const installmentsExpected = Math.min(feeData.billingCycle || 12, Math.max(1, monthsPassed + 1));
        const monthly = (feeData.components || []).filter(c => c.frequency === 'monthly').reduce((a, b) => a + (b.amount || 0), 0);
        const onetime = (feeData.components || []).filter(c => c.frequency !== 'monthly' && (c.amount || 0) > 0).reduce((a, b) => a + (b.amount || 0), 0);
        const totalAnnual = onetime + (monthly * (feeData.billingCycle || 12));
        const expectedToDate = onetime + (monthly * installmentsExpected);
        const paid = feeData.paid || 0;
        const due = Math.max(0, expectedToDate - paid);
        return { monthly, onetime, totalAnnual, expectedToDate, paid, due, installmentsExpected, components: feeData.components || [], startMonth, academicStartYear, billingCycle: feeData.billingCycle || 12 };
    },

    // ── Tuition Student Dashboard ─────────────────────────────────────────────
    async renderStudentDashboard(student, container) {
        const today = new Date().toISOString().split('T')[0];
        const hour = new Date().getHours();
        const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
        const dateStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        let att = null;
        try { const s = await db.ref(`modules/student_directory/attendance/${today}/${student.id}`).once('value'); att = s.val(); } catch (e) {}

        let feeData = null;
        try { const s = await firestore.collection('modules').doc('fees_accounting').collection('student_fees').doc(student.id).get(); if (s.exists) feeData = s.data(); } catch (e) {}
        const fees = this._feeCalc(feeData);

        const attStatus = att?.status || 'none';
        const attMap = { present: ['var(--success)', 'check-circle', 'Present'], absent: ['var(--accent-primary)', 'user-x', 'Absent'], late: ['#fbbf24', 'clock', 'Late'], none: ['var(--text-dim)', 'minus-circle', 'Not Marked'] };
        const [attColor, attIcon, attLabel] = attMap[attStatus] || attMap.none;

        container.innerHTML = `
            <div style="width:100%;max-width:640px;padding:20px 0 80px;">
                <div style="padding:28px;background:linear-gradient(135deg,var(--surface-light),var(--surface));border:1px solid var(--card-border);border-radius:28px;margin-bottom:28px;">
                    <div style="font-size:0.82rem;color:var(--text-dim);margin-bottom:4px;">${greeting}</div>
                    <h1 style="font-size:2rem;font-weight:900;margin-bottom:10px;letter-spacing:-0.5px;">${student.name}</h1>
                    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">${this._wingBadge(student.studentType)}${student.admissionForClass ? `<span style="background:rgba(255,255,255,0.06);color:var(--text-dim);padding:4px 14px;border-radius:8px;font-size:0.72rem;font-weight:700;">${student.admissionForClass}</span>` : ''}</div>
                    <div style="font-size:0.75rem;color:var(--text-dim);margin-top:12px;">${dateStr}</div>
                </div>

                <div class="portal-cards-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:28px;">
                    <div style="background:var(--surface);border:1px solid var(--card-border);border-left:4px solid ${attColor};border-radius:20px;padding:24px;">
                        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
                            <div style="background:rgba(255,255,255,0.04);width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;color:${attColor};"><i data-lucide="${attIcon}" style="width:18px;height:18px;"></i></div>
                            <span style="font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;">Today</span>
                        </div>
                        <div style="font-size:1.6rem;font-weight:900;color:${attColor};">${attLabel}</div>
                    </div>
                    <div style="background:var(--surface);border:1px solid var(--card-border);border-left:4px solid ${fees ? (fees.due > 0 ? 'var(--accent-primary)' : 'var(--success)') : 'rgba(255,255,255,0.1)'};border-radius:20px;padding:24px;">
                        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
                            <div style="background:rgba(255,255,255,0.04);width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;color:${fees ? (fees.due > 0 ? 'var(--accent-primary)' : 'var(--success)') : 'var(--text-dim)'};"><i data-lucide="wallet" style="width:18px;height:18px;"></i></div>
                            <span style="font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;">Fees</span>
                        </div>
                        ${fees ? `<div style="font-size:1.6rem;font-weight:900;color:${fees.due > 0 ? 'var(--accent-primary)' : 'var(--success)'};">${fees.due > 0 ? '₹' + fees.due.toLocaleString('en-IN') : 'Clear'}</div><div style="font-size:0.75rem;color:var(--text-dim);margin-top:4px;">${fees.due > 0 ? 'Balance due' : 'Up to date'}</div>` : `<div style="font-size:0.9rem;color:var(--text-dim);font-weight:600;opacity:0.5;">Not configured</div>`}
                    </div>
                </div>

                <div style="margin-top:32px;text-align:center;">
                    <button class="btn btn-secondary" onclick="logout()"><i data-lucide="log-out" style="width:15px;height:15px;"></i> Sign Out</button>
                </div>
            </div>`;
    },

    // ── Parent Dashboard ──────────────────────────────────────────────────────
    async renderParentDashboard(student, container) {
        container.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:50vh;gap:16px;opacity:0.6;"><div class="loading-spinner"></div><p style="font-weight:600;color:var(--text-dim);">Loading dashboard…</p></div>`;

        const hour = new Date().getHours();
        const greeting = `${hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening'}, Parent`;
        const todayStr = new Date().toISOString().split('T')[0];
        const dateStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        // Fetch last 35 days of attendance, fee plan, and recent transactions in parallel
        const last35 = Array.from({ length: 35 }, (_, i) => {
            const d = new Date(); d.setDate(d.getDate() - i); return d;
        });
        const dateKeys = last35.map(d => d.toISOString().split('T')[0]);

        const [attResults, feeSnap, txSnap] = await Promise.all([
            Promise.all(dateKeys.map(dk => db.ref(`modules/student_directory/attendance/${dk}/${student.id}`).once('value').then(s => ({ date: dk, data: s.val() })).catch(() => ({ date: dk, data: null })))),
            firestore.collection('modules').doc('fees_accounting').collection('student_fees').doc(student.id).get().catch(() => null),
            firestore.collection('modules').doc('fees_accounting').collection('collections').where('studentId', '==', student.id).orderBy('date', 'desc').limit(10).get().catch(() => null)
        ]);

        const attMap = {};
        attResults.forEach(r => { attMap[r.date] = r.data; });

        const feeData = feeSnap?.exists ? feeSnap.data() : null;
        const fees = this._feeCalc(feeData);

        const transactions = [];
        txSnap?.forEach(doc => transactions.push({ id: doc.id, ...doc.data() }));

        // Today's status
        const todayAtt = attMap[todayStr];
        const todayStatus = todayAtt?.status || 'none';
        const statusStyle = {
            present: { color: 'var(--success)',       icon: 'check-circle', label: 'Present' },
            absent:  { color: 'var(--accent-primary)', icon: 'user-x',      label: 'Absent'  },
            late:    { color: '#fbbf24',               icon: 'clock',        label: 'Late'    },
            none:    { color: 'var(--text-dim)',        icon: 'minus-circle', label: 'Not Marked' }
        };
        const ts = statusStyle[todayStatus] || statusStyle.none;

        // Attendance stats over last 30 school days (Mon–Sat)
        const schoolDays = last35.filter(d => d.getDay() !== 0); // exclude Sundays
        const statCounts = { present: 0, absent: 0, late: 0, total: 0 };
        schoolDays.slice(0, 30).forEach(d => {
            const dk = d.toISOString().split('T')[0];
            const s = attMap[dk]?.status;
            statCounts.total++;
            if (s === 'present') statCounts.present++;
            else if (s === 'absent') statCounts.absent++;
            else if (s === 'late') { statCounts.present++; statCounts.late++; }
        });
        const attPct = statCounts.total > 0 ? Math.round((statCounts.present / statCounts.total) * 100) : 0;

        // Calendar grid — last 28 days (4 weeks), Mon–Sun columns
        const calendarHtml = this._buildCalendar(attMap);

        // Fee progress bar
        const feeProgressHtml = fees ? this._buildFeeProgress(fees) : '';
        const feeComponentsHtml = fees ? this._buildFeeComponents(fees, feeData) : '';
        const txHtml = transactions.length ? this._buildTransactions(transactions) : '<div style="padding:20px 0;color:var(--text-dim);font-size:0.85rem;text-align:center;">No payments recorded yet.</div>';

        container.innerHTML = `
            <div style="width:100%;max-width:720px;padding:20px 0 100px;">

                <!-- Header -->
                <div style="padding:28px 32px;background:linear-gradient(135deg,var(--surface-light),var(--surface));border:1px solid var(--card-border);border-radius:28px;margin-bottom:28px;">
                    <div style="font-size:0.82rem;color:var(--text-dim);margin-bottom:6px;">${greeting}</div>
                    <h1 style="font-size:2.2rem;font-weight:900;margin-bottom:10px;letter-spacing:-1px;">${student.name}</h1>
                    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
                        ${this._wingBadge(student.studentType)}
                        ${student.admissionForClass ? `<span style="background:rgba(255,255,255,0.06);color:var(--text-dim);padding:4px 14px;border-radius:8px;font-size:0.72rem;font-weight:700;">${student.admissionForClass}</span>` : ''}
                    </div>
                    <div style="font-size:0.75rem;color:var(--text-dim);margin-top:10px;opacity:0.7;">${dateStr}</div>
                </div>

                <!-- Quick stats -->
                <div class="portal-cards-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:32px;">
                    <div style="background:var(--surface);border:1px solid var(--card-border);border-left:4px solid ${ts.color};border-radius:20px;padding:24px;">
                        <div style="font-size:0.65rem;font-weight:800;color:var(--text-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Today's Attendance</div>
                        <div style="display:flex;align-items:center;gap:10px;">
                            <i data-lucide="${ts.icon}" style="width:22px;height:22px;color:${ts.color};flex-shrink:0;"></i>
                            <div style="font-size:1.5rem;font-weight:900;color:${ts.color};">${ts.label}</div>
                        </div>
                        <div style="margin-top:12px;font-size:0.78rem;color:var(--text-dim);">
                            <span style="color:var(--success);font-weight:700;">${attPct}%</span> attendance this month
                            &nbsp;·&nbsp; ${statCounts.present}P &nbsp;${statCounts.absent}A &nbsp;${statCounts.late}L
                        </div>
                    </div>
                    <div style="background:var(--surface);border:1px solid var(--card-border);border-left:4px solid ${fees ? (fees.due > 0 ? 'var(--accent-primary)' : 'var(--success)') : 'rgba(255,255,255,0.1)'};border-radius:20px;padding:24px;">
                        <div style="font-size:0.65rem;font-weight:800;color:var(--text-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Fee Status</div>
                        ${fees
                            ? `<div style="font-size:1.5rem;font-weight:900;color:${fees.due > 0 ? 'var(--accent-primary)' : 'var(--success)'};">${fees.due > 0 ? '₹' + fees.due.toLocaleString('en-IN') : 'All Clear'}</div>
                               <div style="font-size:0.78rem;color:var(--text-dim);margin-top:4px;">${fees.due > 0 ? 'Balance due now' : 'Paid up to date'} &nbsp;·&nbsp; ₹${fees.paid.toLocaleString('en-IN')} paid</div>`
                            : `<div style="font-size:1rem;color:var(--text-dim);font-weight:600;opacity:0.5;">Not configured</div>`
                        }
                    </div>
                </div>

                <!-- Attendance Section -->
                <div style="background:var(--surface);border:1px solid var(--card-border);border-radius:24px;padding:28px;margin-bottom:20px;">
                    <div style="font-size:0.65rem;font-weight:800;color:var(--text-dim);text-transform:uppercase;letter-spacing:1.2px;margin-bottom:20px;">Attendance — Last 28 Days</div>

                    <!-- Stats bar -->
                    <div style="display:flex;gap:20px;margin-bottom:24px;flex-wrap:wrap;">
                        ${[['Present', statCounts.present, 'var(--success)'], ['Absent', statCounts.absent, 'var(--accent-primary)'], ['Late', statCounts.late, '#fbbf24']].map(([label, count, color]) => `
                            <div style="text-align:center;">
                                <div style="font-size:1.6rem;font-weight:900;color:${color};">${count}</div>
                                <div style="font-size:0.7rem;color:var(--text-dim);font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">${label}</div>
                            </div>`).join('')}
                        <div style="text-align:center;">
                            <div style="font-size:1.6rem;font-weight:900;color:var(--text-main);">${attPct}%</div>
                            <div style="font-size:0.7rem;color:var(--text-dim);font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Rate</div>
                        </div>
                        <div style="flex:1;display:flex;align-items:center;min-width:120px;">
                            <div style="width:100%;background:rgba(255,255,255,0.06);border-radius:8px;height:8px;overflow:hidden;">
                                <div style="width:${attPct}%;background:var(--success);height:100%;border-radius:8px;transition:width 0.6s;"></div>
                            </div>
                        </div>
                    </div>

                    <!-- Calendar grid -->
                    ${calendarHtml}

                    <!-- Legend -->
                    <div style="display:flex;gap:16px;margin-top:16px;flex-wrap:wrap;">
                        ${[['var(--success)','Present'],['var(--accent-primary)','Absent'],['#fbbf24','Late'],['rgba(255,255,255,0.08)','Not Marked'],['rgba(255,255,255,0.03)','Weekend']].map(([c,l]) =>
                            `<div style="display:flex;align-items:center;gap:6px;"><div style="width:10px;height:10px;border-radius:3px;background:${c};border:1px solid rgba(255,255,255,0.1);"></div><span style="font-size:0.72rem;color:var(--text-dim);">${l}</span></div>`
                        ).join('')}
                    </div>
                </div>

                <!-- Fees Section -->
                <div style="background:var(--surface);border:1px solid var(--card-border);border-radius:24px;padding:28px;margin-bottom:20px;">
                    <div style="font-size:0.65rem;font-weight:800;color:var(--text-dim);text-transform:uppercase;letter-spacing:1.2px;margin-bottom:20px;">Fee Breakdown</div>
                    ${fees ? feeProgressHtml + feeComponentsHtml : '<div style="color:var(--text-dim);text-align:center;padding:20px 0;opacity:0.5;">Fee plan not configured yet.</div>'}
                </div>

                <!-- Payment History -->
                <div style="background:var(--surface);border:1px solid var(--card-border);border-radius:24px;padding:28px;margin-bottom:28px;">
                    <div style="font-size:0.65rem;font-weight:800;color:var(--text-dim);text-transform:uppercase;letter-spacing:1.2px;margin-bottom:20px;">Payment History</div>
                    ${txHtml}
                </div>

                <div style="text-align:center;">
                    <button class="btn btn-secondary" onclick="logout()"><i data-lucide="log-out" style="width:15px;height:15px;"></i> Sign Out</button>
                </div>
            </div>`;

        if (window.lucide) lucide.createIcons();
    },

    // ── Calendar grid builder ─────────────────────────────────────────────────
    _buildCalendar(attMap) {
        const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const cells = [];

        // Build 28-day grid starting from the nearest past Monday
        const today = new Date();
        const dayOfWeek = today.getDay(); // 0=Sun
        const daysToMonday = (dayOfWeek === 0 ? 6 : dayOfWeek - 1);
        const startMonday = new Date(today);
        startMonday.setDate(today.getDate() - daysToMonday - 21); // go back 3 weeks + current

        for (let i = 0; i < 28; i++) {
            const d = new Date(startMonday);
            d.setDate(startMonday.getDate() + i);
            const dk = d.toISOString().split('T')[0];
            const isFuture = d > today;
            const isWeekend = d.getDay() === 0; // Sunday only (Sat is school day)
            const att = attMap[dk];
            const status = att?.status || 'none';

            let bg, border;
            if (isFuture) { bg = 'rgba(255,255,255,0.02)'; border = 'rgba(255,255,255,0.05)'; }
            else if (isWeekend) { bg = 'rgba(255,255,255,0.03)'; border = 'rgba(255,255,255,0.05)'; }
            else if (status === 'present') { bg = 'rgba(74,222,128,0.2)'; border = 'var(--success)'; }
            else if (status === 'absent') { bg = 'rgba(232,105,102,0.2)'; border = 'var(--accent-primary)'; }
            else if (status === 'late') { bg = 'rgba(251,191,36,0.2)'; border = '#fbbf24'; }
            else { bg = 'rgba(255,255,255,0.06)'; border = 'rgba(255,255,255,0.1)'; }

            const isToday = dk === today.toISOString().split('T')[0];
            cells.push({ dk, d, bg, border, isToday, isFuture, isWeekend, day: d.getDate(), month: d.getMonth() + 1 });
        }

        const dayHeaders = DAYS.map(d => `<div style="text-align:center;font-size:0.65rem;font-weight:800;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;padding-bottom:6px;">${d}</div>`).join('');
        const dayCells = cells.map(c => `
            <div title="${c.dk}" style="aspect-ratio:1;border-radius:8px;background:${c.bg};border:1.5px solid ${c.isToday ? 'white' : c.border};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;${c.isToday ? 'box-shadow:0 0 0 2px rgba(255,255,255,0.3);' : ''}">
                <div style="font-size:0.7rem;font-weight:${c.isToday ? 800 : 600};color:${c.isFuture || c.isWeekend ? 'rgba(255,255,255,0.2)' : 'var(--text-main)'};">${c.day}</div>
                ${!c.isFuture && !c.isWeekend ? `<div style="font-size:0.55rem;color:var(--text-dim);opacity:0.6;">${String(c.month).padStart(2,'0')}</div>` : ''}
            </div>`).join('');

        return `<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;">${dayHeaders}${dayCells}</div>`;
    },

    // ── Fee progress bar ──────────────────────────────────────────────────────
    _buildFeeProgress(fees) {
        const pct = fees.totalAnnual > 0 ? Math.min(100, Math.round((fees.paid / fees.totalAnnual) * 100)) : 0;
        return `
            <div style="margin-bottom:24px;">
                <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:10px;">
                    <div>
                        <div style="font-size:0.75rem;color:var(--text-dim);font-weight:600;">Annual Fee</div>
                        <div style="font-size:1.6rem;font-weight:900;">₹${fees.totalAnnual.toLocaleString('en-IN')}</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:0.75rem;color:var(--text-dim);font-weight:600;">Paid</div>
                        <div style="font-size:1.3rem;font-weight:800;color:var(--success);">₹${fees.paid.toLocaleString('en-IN')}</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:0.75rem;color:var(--text-dim);font-weight:600;">Due</div>
                        <div style="font-size:1.3rem;font-weight:800;color:${fees.due > 0 ? 'var(--accent-primary)' : 'var(--success)'};">${fees.due > 0 ? '₹' + fees.due.toLocaleString('en-IN') : '₹0'}</div>
                    </div>
                </div>
                <div style="background:rgba(255,255,255,0.06);border-radius:10px;height:10px;overflow:hidden;">
                    <div style="width:${pct}%;background:linear-gradient(90deg,var(--success),var(--accent-secondary));height:100%;border-radius:10px;transition:width 0.8s;"></div>
                </div>
                <div style="display:flex;justify-content:space-between;margin-top:6px;">
                    <span style="font-size:0.7rem;color:var(--text-dim);">0%</span>
                    <span style="font-size:0.7rem;color:var(--accent-secondary);font-weight:700;">${pct}% paid</span>
                    <span style="font-size:0.7rem;color:var(--text-dim);">100%</span>
                </div>
            </div>`;
    },

    // ── Fee components table ──────────────────────────────────────────────────
    _buildFeeComponents(fees, feeData) {
        const MONTHS = ['Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May'];
        const rows = fees.components.filter(c => c.amount > 0).map(c => {
            const isMonthly = (c.frequency || '').toLowerCase() === 'monthly';
            const cycle = isMonthly ? fees.billingCycle : 1;
            const annual = (c.amount || 0) * cycle;
            const paidForThis = c.amount; // simplified — actual per-component tracking is complex
            return `<tr>
                <td style="padding:12px 8px;font-size:0.85rem;font-weight:600;">${c.name}</td>
                <td style="padding:12px 8px;font-size:0.8rem;color:var(--text-dim);text-align:center;">${isMonthly ? `₹${(c.amount||0).toLocaleString('en-IN')}/mo` : `₹${(c.amount||0).toLocaleString('en-IN')}`}</td>
                <td style="padding:12px 8px;font-size:0.85rem;font-weight:700;text-align:right;">₹${annual.toLocaleString('en-IN')}</td>
            </tr>`;
        }).join('');

        const startMonthName = MONTHS[fees.startMonth] || 'Jun';
        const endMonthIdx = (fees.startMonth + fees.billingCycle - 1) % 12;
        const endMonthName = MONTHS[endMonthIdx] || 'Mar';

        return `
            <div style="font-size:0.72rem;color:var(--text-dim);margin-bottom:16px;">
                Academic year: <strong>${startMonthName} ${fees.academicStartYear}</strong> – <strong>${endMonthName} ${fees.academicStartYear + 1}</strong>
                &nbsp;·&nbsp; ${fees.billingCycle}-month cycle &nbsp;·&nbsp; ₹${fees.monthly.toLocaleString('en-IN')}/month
            </div>
            <table style="width:100%;border-collapse:collapse;">
                <thead><tr style="border-bottom:1px solid var(--card-border);">
                    <th style="padding:8px;text-align:left;font-size:0.7rem;font-weight:800;color:var(--text-dim);text-transform:uppercase;">Component</th>
                    <th style="padding:8px;text-align:center;font-size:0.7rem;font-weight:800;color:var(--text-dim);text-transform:uppercase;">Rate</th>
                    <th style="padding:8px;text-align:right;font-size:0.7rem;font-weight:800;color:var(--text-dim);text-transform:uppercase;">Annual</th>
                </tr></thead>
                <tbody style="border-bottom:1px solid var(--card-border);">${rows}</tbody>
                <tfoot><tr>
                    <td colspan="2" style="padding:12px 8px;font-size:0.85rem;font-weight:800;">Total</td>
                    <td style="padding:12px 8px;font-size:1rem;font-weight:900;text-align:right;">₹${fees.totalAnnual.toLocaleString('en-IN')}</td>
                </tr></tfoot>
            </table>`;
    },

    // ── Payment history table ─────────────────────────────────────────────────
    _buildTransactions(transactions) {
        return `<table style="width:100%;border-collapse:collapse;">
            <thead><tr style="border-bottom:1px solid var(--card-border);">
                <th style="padding:8px;text-align:left;font-size:0.7rem;font-weight:800;color:var(--text-dim);text-transform:uppercase;">Date</th>
                <th style="padding:8px;text-align:left;font-size:0.7rem;font-weight:800;color:var(--text-dim);text-transform:uppercase;">Description</th>
                <th style="padding:8px;text-align:right;font-size:0.7rem;font-weight:800;color:var(--text-dim);text-transform:uppercase;">Amount</th>
            </tr></thead>
            <tbody>${transactions.map(tx => {
                const dateVal = tx.date?.toDate ? tx.date.toDate() : (tx.date ? new Date(tx.date) : null);
                const dateStr = dateVal ? dateVal.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';
                const desc = tx.description || tx.notes || tx.method || 'Payment';
                return `<tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                    <td style="padding:12px 8px;font-size:0.82rem;color:var(--text-dim);white-space:nowrap;">${dateStr}</td>
                    <td style="padding:12px 8px;font-size:0.85rem;">${desc}</td>
                    <td style="padding:12px 8px;font-size:0.9rem;font-weight:800;color:var(--success);text-align:right;">+ ₹${(tx.amount||0).toLocaleString('en-IN')}</td>
                </tr>`;
            }).join('')}</tbody>
        </table>`;
    },

    // Legacy render — called by old flow
    async render(student, dashboardType = 'parent') {
        const container = document.getElementById('student-portal-content');
        if (!container) return;
        if (!student) { this._showNotLinked(container); return; }
        if (dashboardType === 'student') await this.renderStudentDashboard(student, container);
        else await this.renderParentDashboard(student, container);
        if (window.lucide) lucide.createIcons();
    }
};
