/**
 * Fees, Expenditure and Payroll Module - Firestore Edition
 */

window.feesManager = {
    MONTHS: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    students: {},
    staff: {},
    fees: {},
    plans: {},
    expenses: [],
    salaries: [],
    transactions: [],
    isSubscribed: false,
    dataLoaded: false,
    currentView: 'collections', // collections, overview, transactions, office_expenses, staff_imprest, salaries, plans, student_fees
    searchQuery: '',

    initialize() {
        this.subscribe();
    },

    subscribe() {
        if (this.isSubscribed) return;
        this.isSubscribed = true;

        // 1. Students
        window.studentDataManager.subscribe();
        window.studentDataManager.onUpdate((data) => {
            this.students = data;
            this.render();
        });

        // 2. Staff
        firestore.collection('modules').doc('staff_directory').collection('staff')
            .onSnapshot((snapshot) => {
                const staffData = {};
                snapshot.forEach(doc => staffData[doc.id] = { id: doc.id, ...doc.data() });
                this.staff = staffData;
                this.dataLoaded = true;
                this.render();
            });

        // 3. Fee Summaries
        firestore.collection('modules').doc('fees_accounting').collection('student_fees')
            .onSnapshot((snapshot) => {
                const feesData = {};
                snapshot.forEach(doc => feesData[doc.id] = doc.data());
                this.fees = feesData;
                this.render();
            });

        // 4. Global Transactions
        firestore.collection('modules').doc('fees_accounting').collection('transactions')
            .orderBy('timestamp', 'desc').limit(100)
            .onSnapshot((snapshot) => {
                const trans = [];
                snapshot.forEach(doc => trans.push({ id: doc.id, ...doc.data() }));
                this.transactions = trans;
                this.render();
            });

        // 5. Fee Packages
        firestore.collection('modules').doc('fees_accounting').collection('plans')
            .onSnapshot((snapshot) => {
                const plansData = {};
                snapshot.forEach(doc => plansData[doc.id] = doc.data());
                this.plans = plansData;
                this.render();
            });

        // 6. Expenses & Salaries
        this.subscribeExpenses();
        this.subscribeSalaries();
    },

    subscribeExpenses() {
        if (this._expensesUnsubscribe) this._expensesUnsubscribe();
        const userData = window.currentUserData || {};
        const isAdmin = userData.isAdmin;
        const feesPerms = userData.permissions?.fees_accounting || {};
        const canViewAll = isAdmin || feesPerms === true || feesPerms.expenses_all === true;
        const currentUserEmail = auth.currentUser?.email?.toLowerCase();

        this._expensesUnsubscribe = firestore.collection('modules').doc('fees_accounting').collection('expenses')
            .orderBy('timestamp', 'desc')
            .onSnapshot((snapshot) => {
                const exp = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    if (canViewAll || data.createdBy === currentUserEmail || (data.staffId && this.staff[data.staffId]?.email?.toLowerCase() === currentUserEmail)) {
                        exp.push({ id: doc.id, ...data });
                    }
                });
                this.expenses = exp;
                this.render();
            });
    },

    subscribeSalaries() {
        if (this._salariesUnsubscribe) this._salariesUnsubscribe();
        const userData = window.currentUserData || {};
        const isAdmin = userData.isAdmin;
        const feesPerms = userData.permissions?.fees_accounting || {};
        const canViewAll = isAdmin || feesPerms === true || feesPerms.salaries_all === true;
        const currentUserEmail = auth.currentUser?.email?.toLowerCase();

        this._salariesUnsubscribe = firestore.collection('modules').doc('fees_accounting').collection('salaries')
            .orderBy('timestamp', 'desc')
            .onSnapshot((snapshot) => {
                const sal = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    if (canViewAll || (data.staffId && this.staff[data.staffId]?.email?.toLowerCase() === currentUserEmail)) {
                        sal.push({ id: doc.id, ...data });
                    }
                });
                this.salaries = sal;
                this.render();
            });
    },

    resubscribe() {
        this.isSubscribed = false;
        this.subscribe();
    },

    switchView(viewName, studentId = null) {
        this.currentView = viewName;
        this.activeStudentId = studentId;
        window.location.hash = `fees/${viewName}${studentId ? '/' + studentId : ''}`;

        document.querySelectorAll('#sidebar-nav-fees .nav-item').forEach(el => el.classList.remove('active'));
        const activeNav = document.getElementById(`nav-fees-${viewName}`);
        if (activeNav) activeNav.classList.add('active');

        document.querySelectorAll('.fees-subview').forEach(el => el.style.display = 'none');
        const activeView = document.getElementById(`fees-view-${viewName}`);
        if (activeView) activeView.style.display = 'block';

        const subtitle = document.getElementById('fees-screen-subtitle');
        if (subtitle) {
            const labels = {
                collections: 'Income & Revenue Insights',
                overview: 'Student Fee Ledger',
                transactions: 'Recent Fee Collections',
                office_expenses: 'Direct Office Expenditure',
                staff_imprest: 'Staff Wallets & Reimbursements',
                salaries: 'Payroll & Salary Management',
                plans: 'Package Template Configuration'
            };
            subtitle.innerText = labels[viewName] || 'Financial Management';
        }

        this.render();
        if (typeof closeSidebar === 'function') closeSidebar();
    },

    render() {
        if (!window.location.hash.startsWith('#fees')) return;

        const toolbar = document.getElementById('fees-toolbar');
        if (toolbar) {
            toolbar.innerHTML = '';
            if (['overview', 'office_expenses', 'staff_imprest', 'salaries', 'transactions', 'plans'].includes(this.currentView)) {
                const search = document.createElement('div');
                search.className = 'search-box';
                search.style.maxWidth = '300px';
                search.style.marginRight = 'auto';
                search.innerHTML = `<i data-lucide="search"></i><input type="text" placeholder="Search..." value="${this.searchQuery}">`;
                search.querySelector('input').oninput = (e) => { this.searchQuery = e.target.value.toLowerCase(); this.render(); };
                toolbar.appendChild(search);
            }

            const userData = window.currentUserData || {};
            const feesPerms = userData.permissions?.fees_accounting || {};
            const isAdmin = userData.isAdmin;

            if (this.currentView === 'office_expenses' && (isAdmin || feesPerms.expenses_all)) {
                const btn = document.createElement('button'); btn.className = 'btn btn-primary'; btn.innerHTML = '<i data-lucide="plus"></i> Log Office Expense'; btn.onclick = () => this.showOfficeExpenseForm(); toolbar.appendChild(btn);
            } else if (this.currentView === 'staff_imprest') {
                if (isAdmin || feesPerms.fund_staff) {
                    const btn = document.createElement('button'); btn.className = 'btn btn-secondary'; btn.innerHTML = '<i data-lucide="coins"></i> Fund Staff'; btn.onclick = () => this.showFundingForm(); toolbar.appendChild(btn);
                }
                const btn = document.createElement('button'); btn.className = 'btn btn-primary'; btn.innerHTML = '<i data-lucide="file-plus"></i> Request Reimbursement'; btn.onclick = () => this.showSpendForm(); toolbar.appendChild(btn);
            } else if (this.currentView === 'salaries' && (isAdmin || feesPerms.salaries_all)) {
                const btn = document.createElement('button'); btn.className = 'btn btn-primary'; btn.innerHTML = '<i data-lucide="plus"></i> Process Payroll'; btn.onclick = () => this.showPayrollForm(); toolbar.appendChild(btn);
            } else if (this.currentView === 'plans' && (isAdmin || feesPerms.config)) {
                const btn = document.createElement('button'); btn.className = 'btn btn-primary'; btn.innerHTML = '<i data-lucide="plus"></i> Create Fee Package'; btn.onclick = () => this.showAddPlanForm(); toolbar.appendChild(btn);
            }
        }

        if (this.currentView === 'collections') this.renderCollections();
        else if (this.currentView === 'overview') this.renderOverview();
        else if (this.currentView === 'transactions') this.renderTransactions();
        else if (this.currentView === 'office_expenses') this.renderOfficeExpenses();
        else if (this.currentView === 'staff_imprest') this.renderStaffImprest();
        else if (this.currentView === 'salaries') this.renderSalaries();
        else if (this.currentView === 'student_fees') this.renderStudentFees();
        else if (this.currentView === 'plans') this.renderPlans();

        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    renderCollections() {
        const container = document.getElementById('fees-content-collections');
        if (!container) return;

        let totalRevGoal = 0, totalCol = 0, totalExp = 0, totalTargetToDate = 0;
        const expByCat = { 'Payroll': 0 };

        // 1. Calculate Income & Target
        const now = new Date();
        Object.values(this.fees).forEach(f => {
            totalRevGoal += (f.total || 0);
            totalCol += (f.paid || 0);

            const startMonth = f.startMonth !== undefined ? f.startMonth : 5;
            const academicStartYear = (now.getMonth() < startMonth) ? now.getFullYear() - 1 : now.getFullYear();
            const studentInstallmentsExpected = Math.max(0, ((now.getFullYear() - academicStartYear) * 12 + (now.getMonth() - startMonth)) + 1);

            const monthlyRate = (f.components || []).filter(c => c.frequency === 'monthly').reduce((a, b) => a + b.amount, 0);
            const oneTimeTotal = (f.components || []).filter(c => c.frequency !== 'monthly').reduce((a, b) => a + b.amount, 0);
            totalTargetToDate += (oneTimeTotal + (monthlyRate * studentInstallmentsExpected));
        });

        // 2. Calculate Expenses (Office + Reimbursements)
        this.expenses.forEach(e => {
            if (e.status === 'approved' || e.source === 'office') {
                totalExp += (e.amount || 0);
                const cat = e.category || 'Other';
                expByCat[cat] = (expByCat[cat] || 0) + (e.amount || 0);
            }
        });

        // 3. Add Salaries to Outflow
        this.salaries.forEach(s => {
            const amt = s.netSalary || 0;
            totalExp += amt;
            expByCat['Payroll'] += amt;
        });

        const netBal = totalCol - totalExp;
        const arrears = Math.max(0, totalTargetToDate - totalCol);
        const colRate = totalTargetToDate > 0 ? Math.round((totalCol / totalTargetToDate) * 100) : 0;

        container.innerHTML = `
            <div class="dashboard-sections">
                <div class="highlights" style="margin-bottom: 32px;">
                    <div class="highlight-item" style="border-left: 4px solid var(--accent-secondary);"><h3>Target to Date</h3><div class="metric-value">₹${totalTargetToDate.toLocaleString('en-IN')}</div></div>
                    <div class="highlight-item" style="border-left: 4px solid var(--success);"><h3>Realized Income</h3><div class="metric-value" style="color: var(--success)">₹${totalCol.toLocaleString('en-IN')}</div></div>
                    <div class="highlight-item" style="border-left: 4px solid #f87171;"><h3>Total Outflow</h3><div class="metric-value" style="color: #f87171">₹${totalExp.toLocaleString('en-IN')}</div></div>
                    <div class="highlight-item" style="border-left: 4px solid var(--accent-primary);"><h3>Net Balance</h3><div class="metric-value" style="color: ${netBal >= 0 ? 'var(--success)' : '#f87171'}">₹${netBal.toLocaleString('en-IN')}</div></div>
                </div>
                
                <div class="dashboard-grid" style="grid-template-columns: 1fr 1.5fr; gap: 32px;">
                    <div class="console-card" style="padding: 24px;">
                        <div class="section-title" style="margin-top:0;"><span>Collection Accuracy</span></div>
                        <div style="text-align:center; padding: 20px 0;">
                            <div style="font-size:3.5rem; font-weight:900; color:${colRate >= 90 ? 'var(--success)' : 'var(--accent-primary)'};">${colRate}%</div>
                            <div style="color:var(--text-dim); margin-top:10px; font-weight:700;">₹${arrears.toLocaleString('en-IN')} TOTAL PENDING DUES</div>
                            <p style="font-size:0.75rem; opacity:0.5; margin-top:15px; line-height:1.4;">Based on scheduled monthly installments + one-time annual fees.</p>
                        </div>
                    </div>
                    <div class="console-card" style="padding: 24px;">
                        <div class="section-title" style="margin-top:0;"><span>Institutional Outflow Breakdown</span></div>
                        <div style="display:flex; flex-direction:column; gap:16px; margin-top:20px;">
                            ${Object.entries(expByCat).filter(([_, a]) => a > 0).sort((a, b) => b[1] - a[1]).map(([c, a]) => `
                                <div>
                                    <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                                        <span style="font-weight:600;">${c}</span>
                                        <span style="opacity:0.8;">₹${a.toLocaleString('en-IN')}</span>
                                    </div>
                                    <div style="height:6px; background:rgba(255,255,255,0.05); border-radius:3px; overflow:hidden;">
                                        <div style="height:100%; background:${c === 'Payroll' ? 'var(--accent-secondary)' : 'rgba(255,255,255,0.2)'}; width:${(a / totalExp) * 100}%;"></div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>`;
    },

    renderOverview() {
        const container = document.getElementById('fees-content-overview');
        if (!container || !this.dataLoaded) return;

        let html = `<table class="console-table"><thead><tr>
            <th>Student Name</th>
            <th>Class</th>
            <th>Monthly Rate</th>
            <th>Expected to Date</th>
            <th>Paid</th>
            <th>Current Status</th>
            <th>Actions</th>
        </tr></thead><tbody>`;

        const q = this.searchQuery;
        const sortedIds = Object.keys(this.students).filter(id => {
            const s = this.students[id];
            return !q || (s.name || '').toLowerCase().includes(q) || (s.admissionForClass || '').toLowerCase().includes(q);
        }).sort((a, b) => (this.students[a].name || '').localeCompare(this.students[b].name || ''));

        const now = new Date();
        const currentYear = now.getFullYear();

        sortedIds.forEach(id => {
            const s = this.students[id], f = this.fees[id] || { total: 0, paid: 0, components: [], startMonth: 5 };
            const startMonth = f.startMonth !== undefined ? f.startMonth : 5;
            const academicStartYear = f.academicStartYear !== undefined ? f.academicStartYear : ((now.getMonth() < startMonth) ? currentYear - 1 : currentYear);
            const monthsPassed = (now.getFullYear() - academicStartYear) * 12 + (now.getMonth() - startMonth);
            const installmentsExpected = Math.min(f.billingCycle || 12, Math.max(0, monthsPassed + 2));

            const monthlyRate = (f.components || []).filter(c => c.frequency === 'monthly').reduce((a, b) => a + b.amount, 0);
            const oneTimeTotal = (f.components || []).filter(c => c.frequency !== 'monthly').reduce((a, b) => a + b.amount, 0);

            const expectedToDate = oneTimeTotal + (monthlyRate * installmentsExpected);
            const paid = f.paid || 0;
            const diff = paid - expectedToDate;

            let statusHtml = '';
            if (diff >= 0) {
                statusHtml = `<span class="status-pill status-success">Up to Date ${diff > 0 ? '(+₹' + diff.toLocaleString('en-IN') + ')' : ''}</span>`;
            } else {
                statusHtml = `<span class="status-pill status-danger" style="background:rgba(241,97,91,0.1); color:var(--accent-primary);">Pending: ₹${Math.abs(diff).toLocaleString('en-IN')}</span>`;
            }

            html += `<tr onclick="window.feesManager.switchView('student_fees', '${id}')" style="cursor:pointer;" class="clickable-row">
                <td><strong>${s.name}</strong></td>
                <td>${s.admissionForClass || 'N/A'}</td>
                <td>₹${monthlyRate.toLocaleString('en-IN')}</td>
                <td>₹${expectedToDate.toLocaleString('en-IN')}</td>
                <td>₹${paid.toLocaleString('en-IN')}</td>
                <td>${statusHtml}</td>
                <td>
                    <button class="btn btn-ghost btn-sm" style="color:var(--accent-secondary); font-weight:700; padding-left:0;">
                        OPEN LEDGER <i data-lucide="chevron-right" style="width:14px; height:14px; margin-left:4px;"></i>
                    </button>
                </td></tr>`;
        });
        container.innerHTML = html + (sortedIds.length === 0 ? '<tr><td colspan="7">No results.</td></tr>' : '') + '</tbody></table>';
    },

    renderTransactions() {
        const container = document.getElementById('fees-content-transactions');
        if (!container) return;
        const isAdmin = (window.currentUserData || {}).isAdmin;
        let html = `<table class="console-table"><thead><tr><th>Date</th><th>Student</th><th>Amount</th><th>Method</th><th>Actions</th></tr></thead><tbody>`;
        const q = this.searchQuery;
        const filtered = this.transactions.filter(t => !q || (this.students[t.studentId]?.name || '').toLowerCase().includes(q));
        filtered.forEach(t => {
            const s = this.students[t.studentId] || { name: 'Unknown' }, d = t.timestamp?.toDate ? t.timestamp.toDate() : new Date(t.timestamp);
            html += `<tr><td>${d.toLocaleDateString()}</td><td><strong>${s.name}</strong></td><td><strong style="color:var(--success)">₹${t.amount.toLocaleString('en-IN')}</strong></td><td>${t.method}</td>
                <td>
                    <div class="table-actions">
                        <button class="btn-icon" onclick="window.feesManager.printTransactionReceipt('${t.id}')" title="Print Invoice"><i data-lucide="printer"></i></button>
                        ${isAdmin ? `<button class="btn-icon text-danger" onclick="window.feesManager.deleteTransaction('${t.id}', '${t.studentId}', ${t.amount})" title="Delete record"><i data-lucide="trash-2"></i></button>` : ''}
                    </div>
                </td></tr>`;
        });
        container.innerHTML = html + (filtered.length === 0 ? '<tr><td colspan="5">No collections found.</td></tr>' : '') + '</tbody></table>';
    },

    renderOfficeExpenses() {
        const container = document.getElementById('fees-content-office_expenses');
        if (!container) return;
        const filtered = this.expenses.filter(e => e.source === 'office' && e.type !== 'funding' && (!this.searchQuery || (e.details || '').toLowerCase().includes(this.searchQuery)));
        let html = `<table class="console-table"><thead><tr><th>Date</th><th>Category</th><th>Details</th><th>Amount</th><th>Actions</th></tr></thead><tbody>`;
        const userData = window.currentUserData || {};
        const isAdmin = userData.isAdmin;
        const currentUserEmail = auth.currentUser?.email?.toLowerCase();

        filtered.forEach(e => {
            const d = e.timestamp?.toDate ? e.timestamp.toDate() : new Date(e.timestamp);
            html += `<tr><td>${d.toLocaleDateString()}</td><td><span class="badge">${e.category}</span></td><td>${e.details}</td><td><strong>₹${e.amount.toLocaleString('en-IN')}</strong></td>
                <td style="text-align:right">
                    <div class="table-actions" style="justify-content:flex-end">
                        ${e.attachmentUrl ? `<button class="btn-icon" onclick="window.open('${e.attachmentUrl}', '_blank')" title="View Receipt"><i data-lucide="paperclip"></i></button>` : ''}
                        ${(isAdmin || e.createdBy === currentUserEmail) ? `<button class="btn-icon text-danger" onclick="window.feesManager.deleteExpense('${e.id}')" title="Delete record"><i data-lucide="trash-2"></i></button>` : ''}
                    </div>
                </td></tr>`;
        });
        container.innerHTML = html + (filtered.length === 0 ? '<tr><td colspan="5">No records.</td></tr>' : '') + '</tbody></table>';
    },

    renderStaffImprest() {
        const container = document.getElementById('fees-content-staff_imprest');
        if (!container) return;
        const userData = window.currentUserData || {};
        const isAdmin = userData.isAdmin;
        const feesPerms = userData.permissions?.fees_accounting || {};
        const canApprove = isAdmin || feesPerms.fund_staff;
        const currentUserEmail = auth.currentUser?.email?.toLowerCase();

        let relStaff = Object.keys(this.staff);
        if (!canApprove) relStaff = relStaff.filter(sid => this.staff[sid].email?.toLowerCase() === currentUserEmail);

        let walHtml = `<div class="dashboard-grid" style="grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; margin-bottom: 40px;">`;
        relStaff.forEach(sid => {
            const f = this.expenses.filter(e => e.staffId === sid && e.type === 'funding').reduce((a, b) => a + b.amount, 0),
                s = this.expenses.filter(e => e.staffId === sid && e.source === 'staff' && e.status === 'approved').reduce((a, b) => a + b.amount, 0);
            const b = f - s;
            walHtml += `<div class="console-card" style="padding: 20px; border-top: 3px solid ${b >= 0 ? 'var(--success)' : 'var(--accent-primary)'}">
                <div style="font-weight:700;">${this.staff[sid].name}</div>
                <div style="font-size:1.5rem; font-weight:900; color: ${b >= 0 ? 'var(--success)' : 'var(--accent-primary)'}">₹${b.toLocaleString('en-IN')}</div>
            </div>`;
        });

        const q = this.searchQuery;
        const filtered = this.expenses.filter(e => e.source === 'staff' && (!q || (this.staff[e.staffId]?.name || '').toLowerCase().includes(q)));
        let logHtml = `<div class="section-title"><span>Expenditure Requests</span></div><table class="console-table"><thead><tr><th>Date</th><th>Staff</th><th>Amount</th><th>Status</th><th>Details</th><th>Actions</th></tr></thead><tbody>`;
        filtered.forEach(e => {
            const st = this.staff[e.staffId] || { name: 'Unknown' }, d = e.timestamp?.toDate ? e.timestamp.toDate() : new Date(e.timestamp);
            const sClass = e.status === 'approved' ? 'status-success' : (e.status === 'rejected' ? 'status-danger' : 'status-warning');
            logHtml += `<tr><td>${d.toLocaleDateString()}</td><td><strong>${st.name}</strong></td><td><strong>₹${e.amount.toLocaleString('en-IN')}</strong></td>
                <td><span class="status-pill ${sClass}">${e.status?.toUpperCase() || 'PENDING'}</span></td><td>${e.details}</td>
                <td><div class="table-actions">
                    ${e.attachmentUrl ? `<button class="btn-icon" onclick="window.open('${e.attachmentUrl}', '_blank')" title="View Receipt"><i data-lucide="image"></i></button>` : ''}
                    ${(canApprove && e.status === 'pending') ? `<button class="btn-icon text-success" onclick="window.feesManager.updateExpenseStatus('${e.id}', 'approved')"><i data-lucide="check-circle"></i></button><button class="btn-icon text-danger" onclick="window.feesManager.updateExpenseStatus('${e.id}', 'rejected')"><i data-lucide="x-circle"></i></button>` : ''}
                    ${(isAdmin || e.createdBy === currentUserEmail) ? `<button class="btn-icon text-danger" onclick="window.feesManager.deleteExpense('${e.id}')" title="Delete request"><i data-lucide="trash-2"></i></button>` : ''}
                </div></td></tr>`;
        });
        container.innerHTML = walHtml + `</div>` + logHtml + (filtered.length === 0 ? '<tr><td colspan="6">No requests.</td></tr>' : '') + '</tbody></table>';
    },

    renderSalaries() {
        const container = document.getElementById('fees-content-salaries');
        if (!container) return;
        const isAdmin = (window.currentUserData || {}).isAdmin;
        const filtered = this.salaries.filter(s => !this.searchQuery || (this.staff[s.staffId]?.name || '').toLowerCase().includes(this.searchQuery));
        let html = `<table class="console-table"><thead><tr><th>Month</th><th>Staff Member</th><th>Base</th><th>Net Payout</th><th>Actions</th></tr></thead><tbody>`;
        filtered.forEach(s => {
            const st = this.staff[s.staffId] || { name: 'Unknown' };
            html += `<tr><td><strong>${s.month}</strong></td><td>${st.name}</td><td>₹${s.baseSalary.toLocaleString('en-IN')}</td><td><strong style="color:var(--success)">₹${s.netSalary.toLocaleString('en-IN')}</strong></td>
                <td>
                    <div class="table-actions">
                        <button class="btn-icon" onclick="window.feesManager.printSalarySlip('${s.id}')" title="Print Slip"><i data-lucide="printer"></i></button>
                        ${isAdmin ? `<button class="btn-icon text-danger" onclick="window.feesManager.deleteSalary('${s.id}')" title="Delete record"><i data-lucide="trash-2"></i></button>` : ''}
                    </div>
                </td></tr>`;
        });
        container.innerHTML = html + (filtered.length === 0 ? '<tr><td colspan="7">No history.</td></tr>' : '') + '</tbody></table>';
    },

    deleteSalary(id) {
        AppDialog.confirm({
            title: 'Delete Payroll Record',
            content: 'Permanently remove this salary record? Any linked reimbursements will be marked as unpaid again.',
            confirmClass: 'btn-danger',
            onConfirm: async () => {
                const linkedReimbs = this.expenses.filter(e => e.salaryId === id);
                const batch = firestore.batch();
                linkedReimbs.forEach(e => {
                    batch.update(firestore.collection('modules').doc('fees_accounting').collection('expenses').doc(e.id), {
                        paidInSalary: firebase.firestore.FieldValue.delete(),
                        salaryId: firebase.firestore.FieldValue.delete()
                    });
                });
                batch.delete(firestore.collection('modules').doc('fees_accounting').collection('salaries').doc(id));
                await batch.commit();
                AppDialog.toast('Salary record removed', 'info');
                return true;
            }
        });
    },

    renderPlans() {
        const container = document.getElementById('fees-content-plans');
        if (!container) return;

        let html = `<div class="plans-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(400px, 1fr)); gap: 24px;">`;
        const q = this.searchQuery;
        const sortedPlanIds = Object.keys(this.plans).filter(id => !q || this.plans[id].name.toLowerCase().includes(q));

        sortedPlanIds.forEach(id => {
            const p = this.plans[id];
            let total = 0;
            const cycle = p.billingCycle || 12;
            (p.components || []).forEach(c => total += c.frequency === 'monthly' ? (c.amount * cycle) : c.amount);

            html += `
                <div class="console-card" style="padding: 24px; border-top: 4px solid var(--accent-secondary); display:flex; flex-direction:column; justify-content:space-between;">
                    <div>
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
                            <h3 style="margin:0; font-size:1.4rem;">${p.name}</h3>
                            <div style="background:rgba(115, 199, 200, 0.1); color:var(--accent-secondary); padding:4px 12px; border-radius:12px; font-size:0.7rem; font-weight:800;">${cycle} MONTHS</div>
                        </div>
                        <div style="font-size:2rem; font-weight:900; color:var(--text-main); margin-bottom:20px;">
                            <small style="font-size:1rem; opacity:0.5; font-weight:400; vertical-align:middle;">₹</small>${total.toLocaleString('en-IN')}
                        </div>
                        <div style="background:rgba(255,255,255,0.02); border-radius:16px; padding:16px; margin-bottom:20px;">
                            <div style="display:flex; flex-direction:column; gap:8px;">
                                ${(p.components || []).map(c => `<div style="display:flex; justify-content:space-between; font-size:0.85rem;"><span style="opacity:0.8;">${c.name}</span><strong>₹${c.amount.toLocaleString('en-IN')}</strong></div>`).join('')}
                            </div>
                        </div>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--card-border); padding-top:16px;">
                        <button class="btn btn-ghost btn-sm" onclick="window.feesManager.showAddPlanForm('${id}')"><i data-lucide="edit-3"></i> EDIT</button>
                        <button class="btn btn-ghost text-danger btn-sm" onclick="window.feesManager.deletePlan('${id}')"><i data-lucide="trash-2"></i> DELETE</button>
                    </div>
                </div>`;
        });
        container.innerHTML = html + '</div>';
    },

    renderStudentFees() {
        const container = document.getElementById('fees-content-student-fees'), id = this.activeStudentId;
        if (!container || !id) return;
        const s = this.students[id] || { name: 'Student' }, f = this.fees[id] || { total: 0, paid: 0, components: [], billingCycle: 12 };
        const components = f.components || [];

        // Prepaid Logic for Timeline & Calculations
        const now = new Date();
        const startMonth = f.startMonth !== undefined ? f.startMonth : 5;
        const academicStartYear = f.academicStartYear !== undefined ? f.academicStartYear : ((now.getMonth() < startMonth) ? now.getFullYear() - 1 : now.getFullYear());
        const monthsPassed = (now.getFullYear() - academicStartYear) * 12 + (now.getMonth() - startMonth);
        const installmentsExpected = Math.min(f.billingCycle || 12, Math.max(0, monthsPassed + 2));

        const monthlyTotal = (f.components || []).filter(c => c.frequency === 'monthly').reduce((a, b) => a + b.amount, 0);
        const oneTimeTotal = (f.components || []).filter(c => c.frequency !== 'monthly').reduce((a, b) => a + b.amount, 0);
        const expectedToDate = oneTimeTotal + (monthlyTotal * installmentsExpected);
        const paid = f.paid || 0;
        const arrears = expectedToDate - paid;

        // Allocation-based status tracking
        const compPayments = f.componentPayments || {};

        // Check coverage for a specific month
        const getMonthStatus = (monthIdx) => {
            const mName = this.MONTHS[monthIdx];
            const monthlyComps = (f.components || []).filter(c => c.frequency === 'monthly');
            if (monthlyComps.length === 0) return true;

            let monthTotalDue = 0;
            let monthTotalPaid = 0;

            monthlyComps.forEach(c => {
                const key = `${c.name}-${mName}`;
                monthTotalDue += c.amount;
                monthTotalPaid += (compPayments[key] || 0);
            });

            // Fallback for legacy data (if no breakdown exists, use the old pool logic)
            if (Object.keys(compPayments).length === 0 && paid > 0) {
                const amountForMonths = Math.max(0, paid - oneTimeTotal);
                const fullMonthsPaid = monthlyTotal > 0 ? Math.floor(amountForMonths / monthlyTotal) : (paid >= oneTimeTotal ? 12 : 0);

                // Determine which index this month has in the cycle
                let cycleIdx = -1;
                for (let i = 0; i < 12; i++) { if (((startMonth + i) % 12) === monthIdx) cycleIdx = i; }
                return cycleIdx < fullMonthsPaid;
            }

            return monthTotalPaid >= monthTotalDue;
        };

        const months = [];
        const monthStatuses = [];
        for (let i = 0; i < 12; i++) {
            const mIdx = (startMonth + i) % 12;
            months.push(this.MONTHS[mIdx].substring(0, 3).toUpperCase());
            monthStatuses.push(getMonthStatus(mIdx));
        }

        let firstUnpaidRelativeIdx = f.billingCycle || 12;
        for (let i = 0; i < (f.billingCycle || 12); i++) {
            const mIdx = (startMonth + i) % 12;
            if (!getMonthStatus(mIdx)) {
                firstUnpaidRelativeIdx = i;
                break;
            }
        }

        const maxAllowedRelativeIdx = Math.min((f.billingCycle || 12) - 1, Math.max(0, installmentsExpected - 1));
        const targetRelativeIdx = Math.min(firstUnpaidRelativeIdx, maxAllowedRelativeIdx);

        const targetMonthIdx = (startMonth + targetRelativeIdx) % 12;
        const isThisMonthPaid = getMonthStatus(targetMonthIdx);
        const thisMonthName = this.MONTHS[targetMonthIdx];
        
        const currentDuesToDisplay = isThisMonthPaid ? 0 : Math.max(arrears, oneTimeTotal + (targetRelativeIdx + 1) * monthlyTotal - paid);

        let html = `
            <!-- Header Banner -->
            <div class="fees-dashboard-banner" style="background:var(--surface-light); border: 1px solid var(--card-border); border-radius: 20px; padding: 32px; margin-bottom: 24px; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <div style="display:flex; align-items:center; gap:16px; margin-bottom:8px;">
                        <h1 style="margin:0; font-size:2rem; font-weight:800; letter-spacing:-0.5px;">${s.name}</h1>
                        <span style="background:var(--accent-primary); color:#000; padding:4px 10px; border-radius:6px; font-weight:800; font-size:0.7rem;">${s.admissionForClass || 'STUDENT'}</span>
                    </div>
                    <div style="color:var(--text-dim); font-size:0.85rem; font-weight:500; display:flex; gap:16px;">
                        <span>ID: ${id.slice(-8).toUpperCase()}</span>
                        <span>${f.billingCycle || 12}-Month Cycle</span>
                    </div>
                </div>
                <div style="display:flex; gap:16px; align-items:center;">
                    <div style="text-align:right; margin-right: 16px;">
                        <div style="font-size:0.65rem; font-weight:800; opacity:0.6; text-transform:uppercase; margin-bottom:4px;">Standing</div>
                        <div style="font-weight:900; color:${arrears <= 0 ? 'var(--success)' : 'var(--accent-primary)'}; font-size:1.1rem;">
                            ${arrears <= 0 ? 'CLEAR' : 'OVERDUE: ₹' + arrears.toLocaleString('en-IN')}
                        </div>
                    </div>
                    <button class="btn btn-primary" style="height:48px; padding:0 24px; border-radius:12px; font-weight:800; display:flex; align-items:center; gap:8px; box-shadow: 0 4px 12px rgba(241, 97, 91, 0.2);" onclick="window.feesManager.showPaymentForm('${id}')">
                        <i data-lucide="plus-circle" style="width:18px;"></i> LOG PAYMENT
                    </button>
                </div>
            </div>

            <!-- Core Financials -->
            <div style="display:grid; grid-template-columns: repeat(5, 1fr); gap:20px; margin-bottom:32px;">
                <div class="console-card" style="padding:24px; border-radius:16px;">
                    <div style="font-size:0.7rem; font-weight:700; color:var(--text-dim); text-transform:uppercase; margin-bottom:8px;">Net Annual Fee</div>
                    <div style="font-size:1.8rem; font-weight:900;">₹${(f.total || 0).toLocaleString('en-IN')}</div>
                </div>
                <div class="console-card" style="padding:24px; border-radius:16px;">
                    <div style="font-size:0.7rem; font-weight:700; color:var(--text-dim); text-transform:uppercase; margin-bottom:8px;">Realized to Date</div>
                    <div style="font-size:1.8rem; font-weight:900; color:var(--success);">₹${paid.toLocaleString('en-IN')}</div>
                </div>
                <div class="console-card" style="padding:24px; border-radius:16px;">
                    <div style="font-size:0.7rem; font-weight:700; color:var(--text-dim); text-transform:uppercase; margin-bottom:8px;">Annual Remaining</div>
                    <div style="font-size:1.8rem; font-weight:900; color:var(--text-main);">₹${Math.max(0, (f.total || 0) - paid).toLocaleString('en-IN')}</div>
                </div>
                <div class="console-card" style="padding:24px; border-radius:16px;">
                    <div style="font-size:0.7rem; font-weight:700; color:var(--text-dim); text-transform:uppercase; margin-bottom:8px;">Current Dues</div>
                    <div style="font-size:1.8rem; font-weight:900; color:${currentDuesToDisplay > 0 ? 'var(--accent-primary)' : 'var(--success)'};">₹${Math.max(0, currentDuesToDisplay).toLocaleString('en-IN')}</div>
                </div>
                <div class="console-card" style="padding:24px; border-radius:16px; border-bottom: 4px solid ${isThisMonthPaid ? 'var(--success)' : 'var(--accent-primary)'};">
                    <div style="font-size:0.7rem; font-weight:700; color:var(--text-dim); text-transform:uppercase; margin-bottom:8px;">${thisMonthName} Status</div>
                    <div style="font-size:1.8rem; font-weight:900; color:${isThisMonthPaid ? 'var(--success)' : 'var(--accent-primary)'};">${isThisMonthPaid ? 'PAID' : 'PENDING'}</div>
                </div>
            </div>

            <!-- Pending Dues Analysis (Conditional) -->
            ${arrears > 0 ? (() => {
                const overdueItems = [];
                components.filter(c => c.frequency !== 'monthly').forEach(c => {
                    const p = compPayments[c.name] || 0;
                    if (p < c.amount) overdueItems.push({ name: c.name, due: c.amount - p });
                });
                for (let i = 0; i < installmentsExpected; i++) {
                    const mIdx = (startMonth + i) % 12;
                    const mName = this.MONTHS[mIdx];
                    components.filter(c => c.frequency === 'monthly').forEach(c => {
                        const key = `${c.name}-${mName}`;
                        const p = compPayments[key] || 0;
                        if (p < c.amount) overdueItems.push({ name: c.name, detail: mName, due: c.amount - p });
                    });
                }
                if (overdueItems.length === 0) return '';
                return `
                <div style="background:rgba(241, 97, 91, 0.05); border: 1px solid rgba(241, 97, 91, 0.2); border-left: 4px solid var(--accent-primary); border-radius: 16px; padding: 24px; margin-bottom: 32px;">
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px; color:var(--accent-primary);">
                        <i data-lucide="alert-triangle" style="width:20px;"></i>
                        <h3 style="margin:0; font-size:1.1rem; font-weight:800;">Action Required: Pending Dues Breakdown</h3>
                    </div>
                    <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap:16px;">
                        ${overdueItems.map(item => `
                            <div style="background:var(--surface); padding:12px 16px; border-radius:10px; border:1px solid rgba(255,255,255,0.05);">
                                <div style="font-size:0.8rem; font-weight:600; text-transform:uppercase; opacity:0.8; margin-bottom:4px;">${item.name} ${item.detail ? `(${item.detail})` : ''}</div>
                                <div style="font-size:1.2rem; font-weight:800; color:var(--accent-primary);">₹${item.due.toLocaleString('en-IN')}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>`;
            })() : ''}

            <!-- Visual Timeline -->
            <div class="console-card" style="padding:24px; border-radius:16px; margin-bottom:32px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                    <h3 style="margin:0; font-size:1.1rem; font-weight:800;">Academic Coverage Timeline</h3>
                    <div style="display:flex; gap:16px; font-size:0.75rem; color:var(--text-dim); font-weight:600;">
                        <span style="display:flex; align-items:center; gap:6px;"><div style="width:10px; height:10px; background:var(--success); border-radius:3px;"></div> Covered</span>
                        <span style="display:flex; align-items:center; gap:6px;"><div style="width:10px; height:10px; background:var(--accent-primary); border-radius:3px;"></div> Pending</span>
                        <span style="display:flex; align-items:center; gap:6px;"><div style="width:10px; height:10px; background:rgba(255,255,255,0.1); border-radius:3px;"></div> Upcoming</span>
                    </div>
                </div>
                <div style="display:flex; gap:8px;">
                    ${months.map((m, i) => {
                const isFullyPaid = monthStatuses[i];
                const isExpected = i < installmentsExpected;
                let bg = 'rgba(255,255,255,0.03)';
                let col = 'var(--text-dim)';
                let border = '1px solid rgba(255,255,255,0.05)';
                if (isFullyPaid) { bg = 'var(--success)'; col = '#000'; border = 'none'; }
                else if (isExpected) { bg = 'transparent'; col = 'var(--accent-primary)'; border = '2px solid var(--accent-primary)'; }

                return `
                            <div style="flex:1; height:48px; display:flex; align-items:center; justify-content:center; background:${bg}; border:${border}; border-radius:8px; color:${col}; font-weight:800; font-size:0.8rem;">
                                ${m}
                            </div>`;
            }).join('')}
                </div>
            </div>

            <!-- Fee Architecture & Ledger Grid (Continuous Flow) -->
            <div style="display:flex; flex-direction:column; gap:32px; margin-bottom:80px;">
                <!-- Fee Architecture -->
                <div>
                    <h3 style="margin-top:0; margin-bottom:16px; font-size:1.1rem; font-weight:800; display:flex; align-items:center; gap:8px;"><i data-lucide="layers" style="width:18px;"></i> Detailed Fee Architecture</h3>
                    <div class="console-card" style="padding:0; overflow:hidden; border-radius:16px;">
                        <table class="console-table" style="margin:0;">
                            <thead style="background:rgba(255,255,255,0.02);">
                                <tr>
                                    <th style="padding:16px 24px;">Component</th>
                                    <th>Term Rate</th>
                                    <th style="text-align:center;">Cycle</th>
                                    <th style="text-align:right;">Std Annual</th>
                                    <th style="text-align:right; white-space:nowrap;">Waiver</th>
                                    <th style="text-align:right; padding:16px 24px;">Net Payable</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${f.components?.length > 0 ? f.components.map(c => {
                const mult = c.frequency === 'monthly' ? (f.billingCycle || 12) : 1;
                const stdRate = (c.originalAmount || c.amount), stdTotal = stdRate * mult, netTotal = c.amount * mult, wav = Math.max(0, stdTotal - netTotal);
                return `
                                        <tr>
                                            <td style="padding:16px 24px;">
                                                <div style="font-weight:700; font-size:0.95rem;">${c.name}</div>
                                                <div style="font-size:0.65rem; opacity:0.5; text-transform:uppercase; margin-top:4px;">${c.frequency}</div>
                                            </td>
                                            <td style="opacity:0.8;">₹${stdRate.toLocaleString('en-IN')}</td>
                                            <td style="text-align:center; font-weight:600; opacity:0.8;">${mult}x</td>
                                            <td style="text-align:right; opacity:0.8;">₹${stdTotal.toLocaleString('en-IN')}</td>
                                            <td style="text-align:right; color:var(--accent-primary); font-weight:700; white-space:nowrap;">${wav > 0 ? '-₹' + wav.toLocaleString('en-IN') : '—'}</td>
                                            <td style="text-align:right; padding:16px 24px;"><strong style="font-size:1.05rem;">₹${netTotal.toLocaleString('en-IN')}</strong></td>
                                        </tr>`;
            }).join('') : '<tr><td colspan="6" style="text-align:center; padding:40px; color:var(--text-dim);">No components configured.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Transaction Audit Trail -->
                <div>
                    <h3 style="margin-top:0; margin-bottom:16px; font-size:1.1rem; font-weight:800; display:flex; align-items:center; gap:8px;"><i data-lucide="list-checks" style="width:18px;"></i> Payment Audit Trail</h3>
                    <div class="console-card" style="padding:0; overflow:hidden; border-radius:16px;">
                        <table class="console-table" style="margin:0;">
                            <thead style="background:rgba(255,255,255,0.02);">
                                <tr>
                                    <th style="padding:16px 24px;">Date</th>
                                    <th>Ref / Details</th>
                                    <th style="text-align:right;">Amount</th>
                                    <th style="text-align:right; padding:16px 24px;">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${this.transactions.filter(t => t.studentId === id).sort((a, b) => {
                const da = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp);
                const db = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp);
                return db - da;
            }).map(t => {
                const d = t.timestamp?.toDate ? t.timestamp.toDate() : new Date(t.timestamp);
                const isAdmin = (window.currentUserData || {}).isAdmin;
                const breakdownHtml = t.breakdown ? `
                                        <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;">
                                            ${Object.entries(t.breakdown).map(([k, v]) => `
                                                <span style="font-size:0.6rem; padding:2px 6px; background:rgba(255,255,255,0.05); border-radius:4px; color:var(--text-dim);">
                                                    ${k}: <strong style="color:var(--text-main);">₹${v.toLocaleString('en-IN')}</strong>
                                                </span>
                                            `).join('')}
                                        </div>` : '';
                return `
                                        <tr>
                                            <td style="padding:16px 24px;">
                                                <div style="font-weight:700;">${d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                                                <div style="font-size:0.65rem; opacity:0.5; margin-top:4px;">${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                            </td>
                                            <td>
                                                <div style="display:flex; align-items:center; gap:8px;">
                                                    <span style="font-size:0.65rem; font-weight:800; padding:2px 6px; border-radius:4px; background:rgba(255,255,255,0.1);">${t.method || 'CASH'}</span>
                                                    <span style="font-size:0.85rem; opacity:0.9;">${t.reference || t.details || 'No ref'}</span>
                                                </div>
                                                ${breakdownHtml}
                                            </td>
                                            <td style="text-align:right;">
                                                <div style="font-weight:800; font-size:1.1rem; color:var(--success);">₹${t.amount.toLocaleString('en-IN')}</div>
                                            </td>
                                            <td style="text-align:right; padding:16px 24px;">
                                                <div style="display:flex; justify-content:flex-end; gap:8px;">
                                                    <button class="btn-icon" title="Print Receipt" onclick="window.feesManager.printTransactionReceipt('${t.id}')"><i data-lucide="printer" style="width:16px;"></i></button>
                                                    ${isAdmin ? `<button class="btn-icon text-danger" title="Delete" onclick="window.feesManager.deleteTransaction('${t.id}', '${id}', ${t.amount})"><i data-lucide="trash-2" style="width:16px;"></i></button>` : ''}
                                                </div>
                                            </td>
                                        </tr>`;
            }).join('') || '<tr><td colspan="4" style="text-align:center; padding:48px; color:var(--text-dim);">No transactions recorded.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        container.innerHTML = html;
        const toolbar = document.getElementById('fees-toolbar');
        if (toolbar) toolbar.innerHTML = `<button class="btn btn-secondary" onclick="window.feesManager.switchView('overview')"><i data-lucide="arrow-left"></i> Back to Ledger</button><div style="margin-left:auto; display:flex; gap:10px;"><button class="btn btn-secondary" onclick="window.feesManager.printStudentInvoice('${id}')"><i data-lucide="printer"></i> Print Invoice</button><button class="btn btn-primary" onclick="window.feesManager.showSetupFeesForm('${id}')"><i data-lucide="settings"></i> Configure Fees</button></div>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    showAddPlanForm(id = null) {
        const p = id ? this.plans[id] : { name: '', billingCycle: 12, components: [], startMonth: 5 };
        const renderRow = (c = { name: '', frequency: 'onetime', amount: 0 }) => `
            <div class="form-row plan-component-row" style="display:grid; grid-template-columns: 1.8fr 1fr 1.2fr 40px; gap:12px; margin-bottom:12px; align-items:center; background:rgba(255,255,255,0.02); padding:12px; border-radius:12px;">
                <input type="text" class="form-control pc-name" value="${c.name}" placeholder="Fee Name"><select class="form-control pc-freq"><option value="onetime" ${c.frequency === 'onetime' ? 'selected' : ''}>One-time</option><option value="monthly" ${c.frequency === 'monthly' ? 'selected' : ''}>Monthly</option></select><input type="number" class="form-control pc-amount" value="${c.amount || ''}" placeholder="Rate"><button onclick="this.parentElement.remove(); window.feesManager.recalcPlanTotal();" class="btn-icon text-danger"><i data-lucide="x"></i></button>
            </div>`;
        AppDialog.confirm({
            title: id ? 'Edit Template' : 'Create Template', width: '850px',
            content: `<div style="display:grid; grid-template-columns: 300px 1fr; gap:32px;"><div><div class="form-group"><label>Package Name</label><input type="text" id="plan-name" class="form-control" value="${p.name}"></div><div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:20px;"><div class="form-group"><label>Cycle (Mo)</label><input type="number" id="plan-cycle" class="form-control" value="${p.billingCycle || 12}"></div><div class="form-group"><label>Start Month</label><select id="plan-start" class="form-control">${this.MONTHS.map((m, i) => `<option value="${i}" ${i === (p.startMonth === undefined ? 5 : p.startMonth) ? 'selected' : ''}>${m}</option>`).join('')}</select></div></div><div id="plan-total-display" style="font-size:2rem; font-weight:900; margin-top:20px; color:var(--accent-secondary);">₹0</div></div><div><div class="form-section-title" style="display:flex; justify-content:space-between;"><span>Components</span><button class="btn btn-secondary btn-sm" id="add-plan-comp-btn">Add Item</button></div><div id="plan-components-container" style="max-height:450px; overflow-y:auto; margin-top:20px;">${p.components.length > 0 ? p.components.map(c => renderRow(c)).join('') : renderRow()}</div></div></div>`,
            onOpen: (overlay) => {
                const cycI = overlay.querySelector('#plan-cycle'), totD = overlay.querySelector('#plan-total-display'), compC = overlay.querySelector('#plan-components-container');
                this.recalcPlanTotal = () => { let t = 0; const c = parseInt(cycI.value) || 12; overlay.querySelectorAll('.plan-component-row').forEach(row => { const a = parseFloat(row.querySelector('.pc-amount').value) || 0, f = row.querySelector('.pc-freq').value; t += f === 'monthly' ? (a * c) : a; }); totD.innerText = `₹${t.toLocaleString('en-IN')}`; return t; };
                overlay.querySelector('#add-plan-comp-btn').onclick = () => { const div = document.createElement('div'); div.innerHTML = renderRow(); compC.appendChild(div.firstElementChild); if (window.lucide) window.lucide.createIcons({ root: compC }); this.recalcPlanTotal(); };
                overlay.addEventListener('input', this.recalcPlanTotal); this.recalcPlanTotal();
            },
            onConfirm: async () => {
                const name = document.getElementById('plan-name').value; if (!name) return false;
                const components = []; document.querySelectorAll('.plan-component-row').forEach(row => { const n = row.querySelector('.pc-name').value, a = parseFloat(row.querySelector('.pc-amount').value) || 0; if (n) components.push({ name: n, amount: a, frequency: row.querySelector('.pc-freq').value, type: 'academic' }); });
                const data = { name, components, billingCycle: parseInt(document.getElementById('plan-cycle').value) || 12, startMonth: parseInt(document.getElementById('plan-start').value), updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: auth.currentUser.email };
                if (!id) data.createdAt = data.updatedAt;
                const ref = firestore.collection('modules').doc('fees_accounting').collection('plans');
                if (id) await ref.doc(id).update(data); else await ref.add(data); return true;
            }
        });
    },

    showSetupFeesForm(studentId) {
        const f = this.fees[studentId] || { total: 0, paid: 0, planId: '', components: [], billingCycle: 12, startMonth: 5 }, s = this.students[studentId] || { name: 'Student' };
        let opts = '<option value="">-- Select Template --</option>';
        Object.keys(this.plans).sort((a, b) => this.plans[a].name.localeCompare(this.plans[b].name)).forEach(pid => opts += `<option value="${pid}" ${pid === f.planId ? 'selected' : ''}>${this.plans[pid].name}</option>`);

        const renderRow = (c = { name: '', frequency: 'onetime', amount: 0, originalAmount: 0 }) => {
            const orig = c.originalAmount || c.amount || 0;
            return `
            <div class="form-row component-row" style="display:grid; grid-template-columns: 1.8fr 1fr 1fr 1fr 40px; gap:12px; margin-bottom:12px; align-items:center; background:rgba(255,255,255,0.02); padding:12px; border-radius:12px;">
                <input type="text" class="form-control c-name" value="${c.name}" placeholder="Name">
                <select class="form-control c-freq"><option value="onetime" ${c.frequency === 'onetime' ? 'selected' : ''}>One-time</option><option value="monthly" ${c.frequency === 'monthly' ? 'selected' : ''}>Monthly</option></select>
                <div class="form-group" style="margin:0;"><label style="font-size:0.5rem; opacity:0.5;">STD</label><input type="number" class="form-control c-orig" value="${orig}"></div>
                <div class="form-group" style="margin:0;"><label style="font-size:0.5rem; opacity:0.5; color:var(--accent-primary);">PAY</label><input type="number" class="form-control c-amount" value="${c.amount === 0 ? '0' : (c.amount || '')}"></div>
                <button onclick="this.parentElement.remove(); window.feesManager.recalcSetupTotal();" class="btn-icon text-danger"><i data-lucide="x"></i></button>
            </div>`;
        };

        AppDialog.confirm({
            title: `Configure Fees: ${s.name}`, width: '950px',
            content: `<div style="display:grid; grid-template-columns: 300px 1fr; gap:32px;"><div><div class="form-group"><label>Apply Template</label><select id="sf-plan-id" class="form-control">${opts}</select></div><div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:20px;"><div class="form-group"><label>Cycle (Mo)</label><input type="number" id="sf-cycle" class="form-control" value="${f.billingCycle || 12}"></div><div class="form-group"><label>Start Month</label><select id="sf-start" class="form-control">${this.MONTHS.map((m, i) => `<option value="${i}" ${i === (f.startMonth === undefined ? 5 : f.startMonth) ? 'selected' : ''}>${m}</option>`).join('')}</select></div></div><div class="form-group" style="margin-top:12px;"><label>Start Year</label><input type="number" id="sf-start-year" class="form-control" value="${f.academicStartYear !== undefined ? f.academicStartYear : (new Date().getMonth() < (f.startMonth !== undefined ? f.startMonth : 5) ? new Date().getFullYear() - 1 : new Date().getFullYear())}"></div><div id="setup-summary-card" style="margin-top:20px; padding:20px; background:rgba(255,255,255,0.03); border-radius:24px; border:1px solid var(--card-border); word-break: break-all; overflow: hidden;"><div style="margin-bottom:10px;"><label style="font-size:0.6rem; opacity:0.6;">ANNUAL TOTAL</label><div id="sf-final-total-display" style="font-size:1.5rem; font-weight:900;">₹0</div></div><div style="margin-bottom:10px;"><label style="font-size:0.6rem; opacity:0.6;">TOTAL WAIVERS</label><div id="sf-waiver-display" style="font-size:1.2rem; color:var(--accent-primary);">₹0</div></div><div><label style="font-size:0.6rem; opacity:0.6;">BALANCE DUE</label><div id="sf-balance-display" style="font-size:1.8rem; font-weight:900; color:var(--accent-primary);">₹0</div></div></div></div><div><div class="form-section-title" style="display:flex; justify-content:space-between;"><span>Components</span><button class="btn btn-secondary btn-sm" id="add-custom-comp-btn">Add Item</button></div><div id="setup-components-container" style="max-height:450px; overflow-y:auto; margin-top:20px;">${f.components?.length > 0 ? f.components.map(c => renderRow(c)).join('') : renderRow()}</div></div></div>`,
            onOpen: (overlay) => {
                const ps = overlay.querySelector('#sf-plan-id'), cc = overlay.querySelector('#setup-components-container'), cy = overlay.querySelector('#sf-cycle'), st = overlay.querySelector('#sf-start');
                const totalOut = overlay.querySelector('#sf-final-total-display'), waiverOut = overlay.querySelector('#sf-waiver-display'), balOut = overlay.querySelector('#sf-balance-display');
                this.recalcSetupTotal = () => {
                    let t = 0, w = 0; const c = parseInt(cy.value) || 12;
                    overlay.querySelectorAll('.component-row').forEach(row => { const orig = parseFloat(row.querySelector('.c-orig').value) || 0, payable = parseFloat(row.querySelector('.c-amount').value) || 0, f = row.querySelector('.c-freq').value; const mult = f === 'monthly' ? c : 1; t += (payable * mult); w += Math.max(0, (orig - payable) * mult); });
                    totalOut.innerText = `₹${t.toLocaleString('en-IN')}`; waiverOut.innerText = `₹${w.toLocaleString('en-IN')}`; balOut.innerText = `₹${Math.max(0, t - (f.paid || 0)).toLocaleString('en-IN')}`; return t;
                };
                ps.onchange = (e) => { const p = this.plans[e.target.value]; if (p) { cc.innerHTML = (p.components || []).map(c => renderRow({ ...c, originalAmount: c.amount })).join(''); cy.value = p.billingCycle || 12; st.value = p.startMonth !== undefined ? p.startMonth : 5; if (window.lucide) window.lucide.createIcons({ root: cc }); this.recalcSetupTotal(); } };
                overlay.querySelector('#add-custom-comp-btn').onclick = () => { const div = document.createElement('div'); div.innerHTML = renderRow(); cc.appendChild(div.firstElementChild); if (window.lucide) window.lucide.createIcons({ root: cc }); this.recalcSetupTotal(); };
                overlay.addEventListener('input', this.recalcSetupTotal); this.recalcSetupTotal();
                if (window.lucide) window.lucide.createIcons({ root: overlay });
            },
            onConfirm: () => {
                const components = []; document.querySelectorAll('.component-row').forEach(row => { const n = row.querySelector('.c-name').value, a = parseFloat(row.querySelector('.c-amount').value) || 0, o = parseFloat(row.querySelector('.c-orig').value) || a; if (n) components.push({ name: n, amount: a, originalAmount: o, frequency: row.querySelector('.pc-freq')?.value || row.querySelector('.c-freq').value, type: 'other' }); });
                const total = this.recalcSetupTotal();
                firestore.collection('modules').doc('fees_accounting').collection('student_fees').doc(studentId).set({ total, planId: document.getElementById('sf-plan-id').value, billingCycle: parseInt(document.getElementById('sf-cycle').value) || 12, startMonth: parseInt(document.getElementById('sf-start').value), academicStartYear: parseInt(document.getElementById('sf-start-year').value), components, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
                AppDialog.toast('Fee structure updated', 'success'); return true;
            }
        });
    },
    showPaymentForm(studentId) {
        const s = this.students[studentId] || { name: 'Student' }, f = this.fees[studentId] || { components: [], startMonth: 5, billingCycle: 12, paid: 0 };
        const today = new Date().toISOString().split('T')[0];
        const startMonth = f.startMonth !== undefined ? f.startMonth : 5;

        // Calculate remaining for each component to suggest allocations
        const paidSoFar = f.componentPayments || {};
        const components = f.components || [];

        const renderAllocationRow = (name, total, paid, key, monthIdx = null) => {
            const due = Math.max(0, total - paid);
            if (due <= 0) return '';
            return `
                <div class="allocation-row" style="display:grid; grid-template-columns: 1fr 100px 120px; gap:12px; align-items:center; margin-bottom:8px; background:rgba(255,255,255,0.03); padding:8px 12px; border-radius:8px;">
                    <div style="font-size:0.85rem;">
                        <strong>${name}</strong>
                        ${monthIdx !== null ? `<div style="font-size:0.6rem; opacity:0.5; text-transform:uppercase;">${this.MONTHS[monthIdx]}</div>` : ''}
                    </div>
                    <div style="font-size:0.75rem; opacity:0.6; text-align:right;">Due: ₹${due.toLocaleString('en-IN')}</div>
                    <input type="number" class="form-control alloc-input" data-key="${key}" data-due="${due}" max="${due}" min="0" placeholder="₹0" style="height:32px; font-size:0.85rem;">
                </div>`;
        };

        let allocationHtml = '<div style="margin-top:20px; border-top:1px solid var(--card-border); padding-top:20px;"><label style="font-weight:800; font-size:0.7rem; color:var(--accent-secondary); text-transform:uppercase; display:block; margin-bottom:12px;">Payment Allocation</label><div id="allocation-container" style="max-height:300px; overflow-y:auto; padding-right:8px;">';

        // One-time components
        components.filter(c => c.frequency !== 'monthly').forEach(c => {
            allocationHtml += renderAllocationRow(c.name, c.amount, paidSoFar[c.name] || 0, c.name);
        });

        // Monthly components (ordered by month)
        for (let i = 0; i < (f.billingCycle || 12); i++) {
            const mIdx = (startMonth + i) % 12;
            const mName = this.MONTHS[mIdx];
            components.filter(c => c.frequency === 'monthly').forEach(c => {
                const key = `${c.name}-${mName}`;
                allocationHtml += renderAllocationRow(c.name, c.amount, paidSoFar[key] || 0, key, mIdx);
            });
        }
        allocationHtml += '</div><div id="alloc-remaining" style="font-size:0.75rem; margin-top:10px; text-align:right; font-weight:700;">Unallocated: <span style="color:var(--accent-primary);">₹0</span></div></div>';

        AppDialog.confirm({
            title: `Log Payment: ${s.name}`, width: '500px',
            content: `
                <div class="form-group"><label>Transaction Date</label><input type="date" id="pf-date" class="form-control" value="${today}"></div>
                <div class="form-group" style="margin-top:15px;"><label>Amount Received (₹)</label><input type="number" id="pf-amount" class="form-control" placeholder="Total payment amount"></div>
                <div class="form-group" style="margin-top:15px;"><label>Method</label><select id="pf-method" class="form-control"><option>Cash</option><option>GPay/UPI</option><option>Bank Transfer</option></select></div>
                <div class="form-group" style="margin-top:15px;"><label>Reference</label><input type="text" id="pf-ref" class="form-control" placeholder="TXN ID / Note"></div>
                ${allocationHtml}`,
            onOpen: (overlay) => {
                const amtI = overlay.querySelector('#pf-amount'), remD = overlay.querySelector('#alloc-remaining span');
                const inputs = overlay.querySelectorAll('.alloc-input');

                const updateRemaining = () => {
                    const total = parseFloat(amtI.value) || 0;
                    let allocated = 0;
                    inputs.forEach(i => allocated += (parseFloat(i.value) || 0));
                    const rem = total - allocated;
                    remD.innerText = `₹${rem.toLocaleString('en-IN')}`;
                    remD.style.color = rem === 0 ? 'var(--success)' : (rem < 0 ? 'var(--accent-primary)' : 'var(--text-dim)');
                };

                amtI.oninput = (e) => {
                    let totalToAlloc = parseFloat(e.target.value) || 0;
                    inputs.forEach(i => {
                        const due = parseFloat(i.dataset.due) || 0;
                        if (totalToAlloc >= due && due > 0) {
                            i.value = due;
                            totalToAlloc -= due;
                        } else if (totalToAlloc > 0 && due > 0) {
                            i.value = totalToAlloc;
                            totalToAlloc = 0;
                        } else {
                            i.value = '';
                        }
                    });
                    updateRemaining();
                };

                inputs.forEach(i => {
                    i.oninput = (e) => {
                        let val = parseFloat(e.target.value) || 0;
                        const due = parseFloat(e.target.dataset.due) || 0;
                        if (val > due) e.target.value = due;
                        else if (val < 0) e.target.value = 0;
                        updateRemaining();
                    };
                });
            },
            onConfirm: () => {
                const amount = parseFloat(document.getElementById('pf-amount').value);
                const customDate = document.getElementById('pf-date').value;
                if (!amount) return false;

                const breakdown = {};
                document.querySelectorAll('.alloc-input').forEach(i => {
                    const val = parseFloat(i.value) || 0;
                    if (val > 0) breakdown[i.dataset.key] = val;
                });

                this.savePayment(studentId, {
                    amount,
                    method: document.getElementById('pf-method').value,
                    reference: document.getElementById('pf-ref').value,
                    breakdown,
                    backDate: customDate !== today ? customDate : null,
                    createdBy: auth.currentUser.email
                });
                return true;
            }
        });
    },

    savePayment(sid, data) {
        data.studentId = sid; data.timestamp = data.backDate ? new Date(data.backDate) : firebase.firestore.FieldValue.serverTimestamp();
        firestore.collection('modules').doc('fees_accounting').collection('transactions').add(data).then(() => {
            const f = this.fees[sid] || { paid: 0, componentPayments: {} };
            const curr = f.paid || 0;
            const newCompPayments = { ...(f.componentPayments || {}) };

            if (data.breakdown) {
                Object.entries(data.breakdown).forEach(([k, v]) => {
                    newCompPayments[k] = (newCompPayments[k] || 0) + v;
                });
            }

            firestore.collection('modules').doc('fees_accounting').collection('student_fees').doc(sid).set({
                paid: curr + data.amount,
                componentPayments: newCompPayments
            }, { merge: true });
            AppDialog.toast('Payment saved', 'success');
            window.AppLogger.log('COLLECT_FEE', 'fees_accounting', { studentId: sid, amount: data.amount }, sid);
        });
    },
    deleteTransaction(tid, studentId, amount) {
        AppDialog.confirm({
            title: 'Reverse Transaction',
            content: `Are you sure you want to delete this payment of ₹${amount.toLocaleString('en-IN')}? This will increase the student's balance due.`,
            confirmClass: 'btn-danger',
            onConfirm: async () => {
                const txn = this.transactions.find(t => t.id === tid);
                const f = this.fees[studentId] || { paid: 0, componentPayments: {} };
                const curr = f.paid || 0;
                const compPayments = { ...(f.componentPayments || {}) };

                if (txn && txn.breakdown) {
                    Object.entries(txn.breakdown).forEach(([k, v]) => {
                        compPayments[k] = Math.max(0, (compPayments[k] || 0) - v);
                    });
                }

                const batch = firestore.batch();
                batch.delete(firestore.collection('modules').doc('fees_accounting').collection('transactions').doc(tid));
                batch.set(firestore.collection('modules').doc('fees_accounting').collection('student_fees').doc(studentId), {
                    paid: Math.max(0, curr - amount),
                    componentPayments: compPayments
                }, { merge: true });
                await batch.commit();
                window.AppLogger.log('DELETE_TRANSACTION', 'fees_accounting', { studentId, amount }, tid);
                AppDialog.toast('Transaction reversed', 'info');
                return true;
            }
        });
    },

    showOfficeExpenseForm() {
        AppDialog.confirm({
            title: 'Log Office Expense',
            content: `<div class="form-group"><label>Category</label><select id="oe-cat" class="form-control"><option>Rent</option><option>Utilities</option><option>Supplies</option><option>Marketing</option></select></div><div class="form-group" style="margin-top:15px;"><label>Amount (₹)</label><input type="number" id="oe-amount" class="form-control"></div><div class="form-group" style="margin-top:15px;"><label>Details</label><input type="text" id="oe-details" class="form-control"></div><div class="form-group" style="margin-top:15px;"><label>Receipt Image</label><input type="file" id="oe-file" class="form-control" accept="image/*"></div>`,
            onConfirm: async () => {
                const amount = parseFloat(document.getElementById('oe-amount').value), file = document.getElementById('oe-file').files[0];
                if (!amount) return false;
                let url = ''; if (file) { const snap = await firebase.storage().ref(`expenses/office_${Date.now()}`).put(file); url = await snap.ref.getDownloadURL(); }
                await firestore.collection('modules').doc('fees_accounting').collection('expenses').add({ source: 'office', type: 'spend', amount, category: document.getElementById('oe-cat').value, details: document.getElementById('oe-details').value, createdBy: auth.currentUser.email, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
                return true;
            }
        });
    },

    showFundingForm() {
        let opts = ''; Object.values(this.staff).forEach(s => opts += `<option value="${s.id}">${s.name}</option>`);
        AppDialog.confirm({
            title: 'Fund Staff Wallet',
            content: `<div class="form-group"><label>Staff Member</label><select id="ff-staff" class="form-control">${opts}</select></div><div class="form-group" style="margin-top:15px;"><label>Amount (₹)</label><input type="number" id="ff-amount" class="form-control"></div>`,
            onConfirm: async () => {
                const amount = parseFloat(document.getElementById('ff-amount').value); if (!amount) return false;
                await firestore.collection('modules').doc('fees_accounting').collection('expenses').add({ source: 'office', type: 'funding', staffId: document.getElementById('ff-staff').value, amount, createdBy: auth.currentUser.email, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
                return true;
            }
        });
    },

    showSpendForm() {
        const my = Object.values(this.staff).find(s => s.email?.toLowerCase() === auth.currentUser.email.toLowerCase());
        if (!my) { AppDialog.toast('No linked staff record found.', 'error'); return; }
        AppDialog.confirm({
            title: 'Reimbursement Request',
            content: `<div class="form-group"><label>Amount (₹)</label><input type="number" id="sf-amount" class="form-control"></div><div class="form-group" style="margin-top:15px;"><label>Reason</label><input type="text" id="sf-details" class="form-control"></div><div class="form-group" style="margin-top:15px;"><label>Receipt Image</label><input type="file" id="sf-file" class="form-control" accept="image/*"></div>`,
            onConfirm: async () => {
                const amount = parseFloat(document.getElementById('sf-amount').value), file = document.getElementById('sf-file').files[0];
                if (!amount) return false;
                let url = ''; if (file) { const snap = await firebase.storage().ref(`expenses/staff_${Date.now()}`).put(file); url = await snap.ref.getDownloadURL(); }
                await firestore.collection('modules').doc('fees_accounting').collection('expenses').add({ source: 'staff', type: 'spend', staffId: my.id, amount, status: 'pending', category: 'General', details: document.getElementById('sf-details').value, attachmentUrl: url, createdBy: auth.currentUser.email, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
                return true;
            }
        });
    },

    async updateExpenseStatus(id, status) {
        await firestore.collection('modules').doc('fees_accounting').collection('expenses').doc(id).update({ status, updatedBy: auth.currentUser.email });
        AppDialog.toast(`Request ${status}`, 'info');
    },

    showPayrollForm() {
        let opts = '<option value="">-- Select Staff Member --</option>';
        Object.values(this.staff).sort((a, b) => a.name.localeCompare(b.name)).forEach(s => opts += `<option value="${s.id}">${s.name}</option>`);
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const now = new Date(), curM = months[now.getMonth()], curY = now.getFullYear();
        AppDialog.confirm({
            title: 'Process Monthly Payroll', width: '700px',
            content: `<div class="form-grid-2"><div class="form-group"><label>Staff Member</label><select id="p-staff" class="form-control">${opts}</select></div><div class="form-group"><label>Payroll Month</label><select id="p-month" class="form-control">${months.map(m => `<option ${m === curM ? 'selected' : ''}>${m} ${curY}</option>`).join('')}</select></div></div><div id="payroll-calc-area" style="margin-top:20px; display:none;"><div class="form-grid-2"><div class="form-group"><label>Base Salary (₹)</label><input type="number" id="p-base" class="form-control"></div><div class="form-group"><label>Bonus / Additions (₹)</label><input type="number" id="p-bonus" class="form-control" value="0"></div></div><div id="reimb-info" style="margin-top:10px; color:var(--success); font-size:0.8rem; display:none;">Approved Reimbursements: <strong id="reimb-amt">₹0</strong></div><div class="form-group" style="margin-top:15px;"><label>Deductions (₹)</label><input type="number" id="p-ded" class="form-control" value="0"></div><div style="margin-top:20px; font-size:1.2rem; font-weight:900;">Net Payout: <span id="p-net" style="color:var(--success)">₹0</span></div></div>`,
            onOpen: (overlay) => {
                const sel = overlay.querySelector('#p-staff'), area = overlay.querySelector('#payroll-calc-area');
                const baseI = overlay.querySelector('#p-base'), bonI = overlay.querySelector('#p-bonus'), dedI = overlay.querySelector('#p-ded'), netD = overlay.querySelector('#p-net');
                const recalc = () => { netD.innerText = `₹${(parseFloat(baseI.value || 0) + parseFloat(bonI.value || 0) - parseFloat(dedI.value || 0)).toLocaleString('en-IN')}`; };
                sel.onchange = () => {
                    const s = this.staff[sel.value]; if (!s) { area.style.display = 'none'; return; }
                    area.style.display = 'block'; baseI.value = s.baseSalary || 0;
                    const r = this.expenses.filter(e => e.staffId === s.id && e.source === 'staff' && e.status === 'approved' && !e.paidInSalary);
                    const t = r.reduce((a, b) => a + b.amount, 0);
                    if (t > 0) { overlay.querySelector('#reimb-info').style.display = 'block'; overlay.querySelector('#reimb-amt').innerText = `₹${t.toLocaleString('en-IN')}`; bonI.value = t; } else { overlay.querySelector('#reimb-info').style.display = 'none'; bonI.value = 0; }
                    recalc();
                };
                [baseI, bonI, dedI].forEach(i => i.oninput = recalc);
            },
            onConfirm: async () => {
                const sid = document.getElementById('p-staff').value, s = this.staff[sid]; if (!s) return false;
                const base = parseFloat(document.getElementById('p-base').value) || 0, bonus = parseFloat(document.getElementById('p-bonus').value) || 0, ded = parseFloat(document.getElementById('p-ded').value) || 0;
                const salRef = await firestore.collection('modules').doc('fees_accounting').collection('salaries').add({ staffId: sid, month: document.getElementById('p-month').value, baseSalary: base, bonus, deductions: ded, netSalary: base + bonus - ded, createdBy: auth.currentUser.email, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
                const batch = firestore.batch();
                this.expenses.filter(e => e.staffId === sid && e.source === 'staff' && e.status === 'approved' && !e.paidInSalary).forEach(e => { batch.update(firestore.collection('modules').doc('fees_accounting').collection('expenses').doc(e.id), { paidInSalary: true, salaryId: salRef.id }); });
                await batch.commit(); return true;
            }
        });
    },

    deletePlan(id) {
        AppDialog.confirm({
            title: 'Delete Fee Package', content: 'Permanently delete this package?', confirmClass: 'btn-danger', onConfirm: () => { firestore.collection('modules').doc('fees_accounting').collection('plans').doc(id).delete(); return true; }
        });
    },

    deleteExpense(id) {
        AppDialog.confirm({
            title: 'Delete Record', content: 'Permanently remove this record?', confirmClass: 'btn-danger', onConfirm: () => { firestore.collection('modules').doc('fees_accounting').collection('expenses').doc(id).delete(); return true; }
        });
    },

    printSalarySlip(id) {
        const s = this.salaries.find(x => x.id === id); if (!s) return;
        const st = this.staff[s.staffId] || { name: 'Staff Member' };
        const win = window.open('', '_blank');
        win.document.write(`<html><head><title>Slip - ${st.name}</title><style>body { font-family: sans-serif; padding: 40px; color: #333; line-height: 1.6; } .header { border-bottom: 2px solid #F1615B; padding-bottom: 20px; } .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin: 30px 0; } .payout-table { width: 100%; border-collapse: collapse; } .payout-table td { padding: 12px; border-bottom: 1px solid #eee; } .net { font-size: 24px; font-weight: 900; color: #22c55e; }</style></head><body>
            <div class="header"><h1>ABHISHRI ACADEMY</h1><p>Salary Pay Slip - ${s.month}</p></div>
            <div class="grid"><div><strong>Name:</strong> ${st.name}<br><strong>Role:</strong> ${st.designation || 'N/A'}</div><div><strong>Date:</strong> ${new Date(s.timestamp?.toDate ? s.timestamp.toDate() : s.timestamp).toLocaleDateString()}</div></div>
            <table class="payout-table"><tr><td>Base Salary</td><td style="text-align:right">₹${s.baseSalary.toLocaleString('en-IN')}</td></tr><tr><td>Bonus/Reimb</td><td style="text-align:right">₹${s.bonus.toLocaleString('en-IN')}</td></tr><tr><td>Deductions</td><td style="text-align:right">-₹${s.deductions.toLocaleString('en-IN')}</td></tr><tr style="border-top: 2px solid #333;"><td style="font-weight:700;">NET DISBURSED</td><td style="text-align:right" class="net">₹${s.netSalary.toLocaleString('en-IN')}</td></tr></table><script>window.onload=()=>{window.print(); setTimeout(()=>window.close(),500);};</script></body></html>`);
        win.document.close();
    },

    printTransactionReceipt(id) {
        const t = this.transactions.find(x => x.id === id); if (!t) return;
        const s = this.students[t.studentId] || { name: 'Student' };
        const win = window.open('', '_blank');
        win.document.write(`<html><head><style>body { font-family: sans-serif; padding: 40px; } .header { border-bottom: 2px solid #000; padding-bottom: 20px; display: flex; justify-content: space-between; align-items: center; } .info { margin: 30px 0; display: grid; grid-template-columns: 1fr 1fr; } table { width: 100%; border-collapse: collapse; margin: 30px 0; } th, td { padding: 12px; border: 1px solid #000; }</style></head><body><div class="header"><div><h1>ABHISHRI ACADEMY</h1></div><div><h2>FEE INVOICE</h2><p>No: ${id.slice(-8).toUpperCase()}</p></div></div><div class="info"><div><strong>Student:</strong> ${s.name}<br><strong>Class:</strong> ${s.admissionForClass}</div><div><strong>Date:</strong> ${new Date(t.timestamp?.toDate ? t.timestamp.toDate() : t.timestamp).toLocaleDateString()}</div></div><table><thead><tr><th>Description</th><th style="text-align:right">Amount</th></tr></thead><tbody><tr><td>School Fees / Academic Charges</td><td style="text-align:right">₹${t.amount.toLocaleString('en-IN')}</td></tr></tbody></table><div style="text-align:right; font-size:24px; font-weight:900;">TOTAL PAID: ₹${t.amount.toLocaleString('en-IN')}</div><div style="margin-top:100px; text-align:center;"><div style="border-top:1px solid #000; width:200px; margin:0 auto; padding-top:10px;">SCHOOL OFFICIAL STAMP</div></div><script>window.onload=()=>{window.print(); setTimeout(()=>window.close(),500);};</script></body></html>`);
        win.document.close();
    },

    printStudentInvoice(id) {
        const s = this.students[id] || { name: 'Student' }, f = this.fees[id] || { total: 0, paid: 0, components: [], billingCycle: 12 };

        // Prepaid Logic for Invoice
        const now = new Date();
        const startMonth = f.startMonth !== undefined ? f.startMonth : 5;
        const academicStartYear = (now.getMonth() < startMonth) ? now.getFullYear() - 1 : now.getFullYear();
        const installmentsExpected = Math.max(0, ((now.getFullYear() - academicStartYear) * 12 + (now.getMonth() - startMonth)) + 1);

        const monthlyTotal = (f.components || []).filter(c => c.frequency === 'monthly').reduce((a, b) => a + b.amount, 0);
        const oneTimeTotal = (f.components || []).filter(c => c.frequency !== 'monthly').reduce((a, b) => a + b.amount, 0);
        const expectedToDate = oneTimeTotal + (monthlyTotal * installmentsExpected);
        const arrears = expectedToDate - (f.paid || 0);

        const win = window.open('', '_blank');
        win.document.write(`
            <html>
            <head>
                <title>Invoice - ${s.name}</title>
                <style>
                    body { font-family: 'Helvetica', 'Arial', sans-serif; padding: 20px; color: #000; line-height: 1.2; font-size: 10pt; }
                    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
                    .inst-name { font-size: 1.6rem; font-weight: bold; margin: 0; }
                    .statement-title { font-size: 1rem; font-weight: bold; text-transform: uppercase; margin-top: 2px; }

                    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
                    .info-box h3 { font-size: 0.7rem; text-transform: uppercase; margin-bottom: 5px; border-bottom: 1px solid #000; padding-bottom: 2px; }
                    .info-content { font-size: 0.9rem; }

                    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                    th { text-align: left; padding: 8px 5px; font-size: 0.7rem; text-transform: uppercase; border-bottom: 1px solid #000; border-top: 1px solid #000; }
                    td { padding: 8px 5px; border-bottom: 1px solid #eee; font-size: 0.85rem; }

                    .summary-section { display: grid; grid-template-columns: 1fr 280px; gap: 40px; }
                    .summary-card { border: 1px solid #000; padding: 15px; }
                    .summary-row { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 0.9rem; }
                    .summary-row.bold { font-weight: bold; border-top: 1px solid #000; padding-top: 5px; margin-top: 5px; }
                    .summary-row.total { border-top: 1px solid #000; padding-top: 8px; margin-top: 8px; font-weight: bold; font-size: 1.1rem; }

                    .footer { margin-top: 40px; font-size: 0.7rem; text-align: center; border-top: 1px solid #000; padding-top: 10px; }
                    .stamp-box { border: 1px dashed #000; width: 150px; height: 80px; margin-top: 20px; display: flex; align-items: center; justify-content: center; font-size: 0.6rem; text-transform: uppercase; color: #888; }
                    
                    @media print { 
                        body { padding: 0; } 
                        @page { margin: 1cm; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div>
                        <h1 class="inst-name">ABHISHRI ACADEMY</h1>
                        <div class="statement-title">Fee Statement / Invoice</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-weight: bold;">Academic Year 2025 - 2026</div>
                        <div>Date: ${new Date().toLocaleDateString('en-IN')}</div>
                        <div style="font-size: 0.7rem;">INV-F-${id.slice(-6).toUpperCase()}</div>
                    </div>
                </div>

                <div class="info-grid">
                    <div class="info-box">
                        <h3>Institution Details</h3>
                        <div class="info-content">
                            Abhishri Academy<br>
                            84, Dhalavaipattinam Road<br>
                            (Opposite to DSP Office), Dharapuram<br>
                            Tiruppur District - 638656
                        </div>
                    </div>
                    <div class="info-box" style="text-align: right;">
                        <h3>Student Details</h3>
                        <div class="info-content">
                            <strong>${s.name}</strong><br>
                            Grade / Class: ${s.admissionForClass || 'N/A'}<br>
                            Student ID: ${id.slice(-8).toUpperCase()}
                        </div>
                    </div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>Fee Description</th>
                            <th style="text-align: right;">Rate</th>
                            <th style="text-align: center;">Cycle</th>
                            <th style="text-align: right;">Standard</th>
                            <th style="text-align: right;">Waiver</th>
                            <th style="text-align: right;">Payable</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(f.components || []).map(c => {
            const mult = c.frequency === 'monthly' ? (f.billingCycle || 12) : 1;
            const stdRate = (c.originalAmount || c.amount);
            const stdTotal = stdRate * mult;
            const netTotal = c.amount * mult;
            const wav = Math.max(0, stdTotal - netTotal);
            return `
                                <tr>
                                    <td>
                                        <div style="font-weight: bold;">${c.name}</div>
                                        <div style="font-size: 0.6rem; text-transform: uppercase;">${c.frequency}</div>
                                    </td>
                                    <td style="text-align: right;">₹${stdRate.toLocaleString('en-IN')}</td>
                                    <td style="text-align: center;">${mult}</td>
                                    <td style="text-align: right;">₹${stdTotal.toLocaleString('en-IN')}</td>
                                    <td style="text-align: right;">${wav > 0 ? '- ₹' + wav.toLocaleString('en-IN') : '—'}</td>
                                    <td style="text-align: right; font-weight: bold;">₹${netTotal.toLocaleString('en-IN')}</td>
                                </tr>`;
        }).join('')}
                    </tbody>
                </table>

                <div class="summary-section">
                    <div>
                        <div style="font-size: 0.7rem; font-weight: bold; text-transform: uppercase; margin-bottom: 10px; border-bottom: 1px solid #000;">Dues Status (To Date)</div>
                        <div style="font-size: 0.85rem;">
                            Expected to Date: ₹${expectedToDate.toLocaleString('en-IN')}<br>
                            Amount Paid to Date: ₹${(f.paid || 0).toLocaleString('en-IN')}<br>
                            <strong>Outstanding Due: ₹${Math.max(0, arrears).toLocaleString('en-IN')}</strong>
                        </div>
                        <div class="stamp-box">Office Stamp & Signature</div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-row"><span>Annual Fee Total</span><span>₹${((f.components || []).reduce((acc, c) => acc + ((c.originalAmount || c.amount) * (c.frequency === 'monthly' ? (f.billingCycle || 12) : 1)), 0)).toLocaleString('en-IN')}</span></div>
                        <div class="summary-row"><span>Total Waivers</span><span>- ₹${((f.components || []).reduce((acc, c) => acc + (Math.max(0, (c.originalAmount || c.amount) - c.amount) * (c.frequency === 'monthly' ? (f.billingCycle || 12) : 1)), 0)).toLocaleString('en-IN')}</span></div>
                        <div class="summary-row bold"><span>Net Annual Commitment</span><span>₹${(f.total || 0).toLocaleString('en-IN')}</span></div>
                        <div class="summary-row total"><span>Total Received</span><span>₹${(f.paid || 0).toLocaleString('en-IN')}</span></div>
                        <div class="summary-row total" style="border-top: 2px solid #000;"><span>Balance Due</span><span>₹${Math.max(0, (f.total || 0) - (f.paid || 0)).toLocaleString('en-IN')}</span></div>
                    </div>
                </div>

                <div class="footer">
                    This is a computer-generated statement and does not require a physical signature.<br>
                    <strong>ABHISHRI ACADEMY</strong>
                </div>

                <script>
                    window.onload = () => {
                        window.print();
                        setTimeout(() => window.close(), 1000);
                    };
                </script>
            </body>
            </html>
        `);
        win.document.close();
    }
};
