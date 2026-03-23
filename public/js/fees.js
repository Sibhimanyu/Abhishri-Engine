/**
 * Fees, Expenditure and Payroll Module - Firestore Edition
 */

window.feesManager = {
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
                const btn = document.createElement('button'); btn.className='btn btn-primary'; btn.innerHTML='<i data-lucide="plus"></i> Log Office Expense'; btn.onclick=()=>this.showOfficeExpenseForm(); toolbar.appendChild(btn);
            } else if (this.currentView === 'staff_imprest') {
                if (isAdmin || feesPerms.fund_staff) {
                    const btn = document.createElement('button'); btn.className='btn btn-secondary'; btn.innerHTML='<i data-lucide="coins"></i> Fund Staff'; btn.onclick=()=>this.showFundingForm(); toolbar.appendChild(btn);
                }
                const btn = document.createElement('button'); btn.className='btn btn-primary'; btn.innerHTML='<i data-lucide="file-plus"></i> Request Reimbursement'; btn.onclick=()=>this.showSpendForm(); toolbar.appendChild(btn);
            } else if (this.currentView === 'salaries' && (isAdmin || feesPerms.salaries_all)) {
                const btn = document.createElement('button'); btn.className='btn btn-primary'; btn.innerHTML='<i data-lucide="plus"></i> Process Payroll'; btn.onclick=()=>this.showPayrollForm(); toolbar.appendChild(btn);
            } else if (this.currentView === 'plans' && (isAdmin || feesPerms.config)) {
                const btn = document.createElement('button'); btn.className='btn btn-primary'; btn.innerHTML='<i data-lucide="plus"></i> Create Fee Package'; btn.onclick=()=>this.showAddPlanForm(); toolbar.appendChild(btn);
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

        let totalRevGoal = 0, totalCol = 0, totalExp = 0;
        const expByCat = {};

        Object.values(this.fees).forEach(f => { totalRevGoal += (f.total || 0); totalCol += (f.paid || 0); });
        this.expenses.forEach(e => {
            if (e.status === 'approved' || e.source === 'office') {
                totalExp += (e.amount || 0);
                const cat = e.category || 'Other';
                expByCat[cat] = (expByCat[cat] || 0) + (e.amount || 0);
            }
        });

        const netBal = totalCol - totalExp;
        const colRate = totalRevGoal > 0 ? Math.round((totalCol / totalRevGoal) * 100) : 0;

        container.innerHTML = `
            <div class="dashboard-sections">
                <div class="highlights" style="margin-bottom: 32px;">
                    <div class="highlight-item" style="border-left: 4px solid var(--accent-secondary);"><h3>Revenue Goal</h3><div class="metric-value">₹${totalRevGoal.toLocaleString()}</div></div>
                    <div class="highlight-item" style="border-left: 4px solid var(--success);"><h3>Collected</h3><div class="metric-value" style="color: var(--success)">₹${totalCol.toLocaleString()}</div></div>
                    <div class="highlight-item" style="border-left: 4px solid #f87171;"><h3>Total Outflow</h3><div class="metric-value" style="color: #f87171">₹${totalExp.toLocaleString()}</div></div>
                    <div class="highlight-item" style="border-left: 4px solid var(--accent-primary);"><h3>Net Balance</h3><div class="metric-value" style="color: ${netBal >= 0 ? 'var(--success)' : '#f87171'}">₹${netBal.toLocaleString()}</div></div>
                </div>
                <div class="dashboard-grid" style="grid-template-columns: 1fr 1.5fr; gap: 32px;">
                    <div class="console-card" style="padding: 24px;">
                        <div class="section-title" style="margin-top:0;"><span>Collection Progress</span></div>
                        <div style="text-align:center; padding: 20px 0;">
                            <div style="font-size:3rem; font-weight:900; color:var(--success);">${colRate}%</div>
                            <div style="color:var(--text-dim); margin-top:10px;">₹${(totalRevGoal - totalCol).toLocaleString()} Outstanding</div>
                        </div>
                    </div>
                    <div class="console-card" style="padding: 24px;">
                        <div class="section-title" style="margin-top:0;"><span>Expense Distribution</span></div>
                        <div style="display:flex; flex-direction:column; gap:12px;">
                            ${Object.entries(expByCat).map(([c, a]) => `<div style="display:flex; justify-content:space-between;"><span>${c}</span><strong>₹${a.toLocaleString()}</strong></div>`).join('')}
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

        // Prepaid Logic: Academic year starts in June (Month Index 5)
        const now = new Date();
        const currentYear = now.getFullYear();
        const academicStartYear = (now.getMonth() < 5) ? currentYear - 1 : currentYear;
        const monthsPassed = (now.getFullYear() - academicStartYear) * 12 + (now.getMonth() - 5);
        const installmentsExpected = Math.max(0, monthsPassed + 1);

        sortedIds.forEach(id => {
            const s = this.students[id], f = this.fees[id] || { total: 0, paid: 0, components: [] };
            const monthlyRate = (f.components || []).filter(c => c.frequency === 'monthly').reduce((a, b) => a + b.amount, 0);
            const oneTimeTotal = (f.components || []).filter(c => c.frequency !== 'monthly').reduce((a, b) => a + b.amount, 0);
            
            const expectedToDate = oneTimeTotal + (monthlyRate * installmentsExpected);
            const paid = f.paid || 0;
            const diff = paid - expectedToDate;

            let statusHtml = '';
            if (diff >= 0) {
                statusHtml = `<span class="status-pill status-success">Up to Date ${diff > 0 ? '(+₹' + diff.toLocaleString() + ')' : ''}</span>`;
            } else {
                statusHtml = `<span class="status-pill status-danger" style="background:rgba(241,97,91,0.1); color:var(--accent-primary);">Arrears: ₹${Math.abs(diff).toLocaleString()}</span>`;
            }
            
            html += `<tr onclick="window.feesManager.switchView('student_fees', '${id}')" style="cursor:pointer;" class="clickable-row">
                <td><strong>${s.name}</strong></td>
                <td>${s.admissionForClass || 'N/A'}</td>
                <td>₹${monthlyRate.toLocaleString()}</td>
                <td>₹${expectedToDate.toLocaleString()}</td>
                <td>₹${paid.toLocaleString()}</td>
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
            html += `<tr><td>${d.toLocaleDateString()}</td><td><strong>${s.name}</strong></td><td><strong style="color:var(--success)">₹${t.amount.toLocaleString()}</strong></td><td>${t.method}</td>
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
            html += `<tr><td>${d.toLocaleDateString()}</td><td><span class="badge">${e.category}</span></td><td>${e.details}</td><td><strong>₹${e.amount.toLocaleString()}</strong></td>
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
            const f = this.expenses.filter(e => e.staffId === sid && e.type === 'funding').reduce((a,b)=>a+b.amount, 0),
                  s = this.expenses.filter(e => e.staffId === sid && e.source === 'staff' && e.status === 'approved').reduce((a,b)=>a+b.amount, 0);
            const b = f - s;
            walHtml += `<div class="console-card" style="padding: 20px; border-top: 3px solid ${b >= 0 ? 'var(--success)' : 'var(--accent-primary)'}">
                <div style="font-weight:700;">${this.staff[sid].name}</div>
                <div style="font-size:1.5rem; font-weight:900; color: ${b >= 0 ? 'var(--success)' : 'var(--accent-primary)'}">₹${b.toLocaleString()}</div>
            </div>`;
        });

        const q = this.searchQuery;
        const filtered = this.expenses.filter(e => e.source === 'staff' && (!q || (this.staff[e.staffId]?.name || '').toLowerCase().includes(q)));
        let logHtml = `<div class="section-title"><span>Expenditure Requests</span></div><table class="console-table"><thead><tr><th>Date</th><th>Staff</th><th>Amount</th><th>Status</th><th>Details</th><th>Actions</th></tr></thead><tbody>`;
        filtered.forEach(e => {
            const st = this.staff[e.staffId] || { name: 'Unknown' }, d = e.timestamp?.toDate ? e.timestamp.toDate() : new Date(e.timestamp);
            const sClass = e.status === 'approved' ? 'status-success' : (e.status === 'rejected' ? 'status-danger' : 'status-warning');
            logHtml += `<tr><td>${d.toLocaleDateString()}</td><td><strong>${st.name}</strong></td><td><strong>₹${e.amount.toLocaleString()}</strong></td>
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
            html += `<tr><td><strong>${s.month}</strong></td><td>${st.name}</td><td>₹${s.baseSalary.toLocaleString()}</td><td><strong style="color:var(--success)">₹${s.netSalary.toLocaleString()}</strong></td>
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
                            <small style="font-size:1rem; opacity:0.5; font-weight:400; vertical-align:middle;">₹</small>${total.toLocaleString()}
                        </div>
                        <div style="background:rgba(255,255,255,0.02); border-radius:16px; padding:16px; margin-bottom:20px;">
                            <div style="display:flex; flex-direction:column; gap:8px;">
                                ${(p.components || []).map(c => `<div style="display:flex; justify-content:space-between; font-size:0.85rem;"><span style="opacity:0.8;">${c.name}</span><strong>₹${c.amount.toLocaleString()}</strong></div>`).join('')}
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
        
        // Prepaid Logic
        const now = new Date();
        const currentYear = now.getFullYear();
        const academicStartYear = (now.getMonth() < 5) ? currentYear - 1 : currentYear;
        const monthsPassed = (now.getFullYear() - academicStartYear) * 12 + (now.getMonth() - 5);
        const installmentsExpected = Math.max(0, monthsPassed + 1);

        const monthlyTotal = (f.components || []).filter(c => c.frequency === 'monthly').reduce((a, b) => a + b.amount, 0);
        const oneTimeTotal = (f.components || []).filter(c => c.frequency !== 'monthly').reduce((a, b) => a + b.amount, 0);
        const expectedToDate = oneTimeTotal + (monthlyTotal * installmentsExpected);
        const paid = f.paid || 0;
        const arrears = expectedToDate - paid;

        let html = `
            <div class="fee-profile-header">
                <h2>${s.name}</h2>
                <div class="highlights" style="margin-top:20px;">
                    <div class="highlight-item" style="border-left: 4px solid var(--accent-secondary);"><h3>Monthly Due</h3><div style="color: var(--accent-secondary)">₹${monthlyTotal.toLocaleString()}</div></div>
                    <div class="highlight-item" style="border-left: 4px solid #fff;"><h3>Expected to Date</h3><div>₹${expectedToDate.toLocaleString()}</div></div>
                    <div class="highlight-item" style="border-left: 4px solid var(--success);"><h3>Paid</h3><div style="color: var(--success)">₹${paid.toLocaleString()}</div></div>
                    <div class="highlight-item" style="border-left: 4px solid ${arrears > 0 ? 'var(--accent-primary)' : 'var(--success)'};">
                        <h3>${arrears > 0 ? 'Arrears' : 'Advance'}</h3>
                        <div style="color: ${arrears > 0 ? 'var(--accent-primary)' : 'var(--success)'}">₹${Math.abs(arrears).toLocaleString()}</div>
                    </div>
                </div>
            </div>
            <div class="section-title" style="margin-top:40px;"><span>Comprehensive Fee Architecture (Annualized)</span></div>
            <div class="console-card" style="padding:0; overflow:hidden; margin-bottom:40px; border: 1px solid var(--card-border);">
                <table class="console-table" style="margin:0;">
                    <thead style="background:rgba(255,255,255,0.03);">
                        <tr>
                            <th>Component</th>
                            <th style="text-align:right;">Std. Rate</th>
                            <th style="text-align:center;">Multiplier</th>
                            <th style="text-align:right;">Std. Total</th>
                            <th style="text-align:right; color:var(--accent-primary);">Waiver</th>
                            <th style="text-align:right;">Net Payable</th>
                        </tr>
                    </thead>
                    <tbody>`;
        
        if (f.components?.length > 0) {
            const cycle = f.billingCycle || 12;
            let tStd = 0, tWav = 0;
            f.components.forEach(c => {
                const mult = c.frequency === 'monthly' ? cycle : 1;
                const stdRate = (c.originalAmount || c.amount);
                const stdTotal = stdRate * mult;
                const netTotal = c.amount * mult;
                const wav = Math.max(0, stdTotal - netTotal);
                tStd += stdTotal; tWav += wav;
                html += `<tr><td><strong>${c.name}</strong><div style="font-size:0.6rem; opacity:0.5; text-transform:uppercase;">${c.frequency}</div></td>
                    <td style="text-align:right; opacity:0.7;">₹${stdRate.toLocaleString()}</td>
                    <td style="text-align:center; font-family:monospace; opacity:0.5;">× ${mult}</td>
                    <td style="text-align:right; opacity:0.7;">₹${stdTotal.toLocaleString()}</td>
                    <td style="text-align:right; color:var(--accent-primary); font-weight:700;">${wav > 0 ? '- ₹' + wav.toLocaleString() : '—'}</td>
                    <td style="text-align:right;"><strong style="color:var(--text-main);">₹${netTotal.toLocaleString()}</strong></td></tr>`;
            });
            html += `<tr style="background:rgba(255,255,255,0.02); border-top: 2px solid var(--card-border);"><td colspan="3" style="text-align:right; font-weight:700; font-size:0.7rem; color:var(--text-dim);">INSTITUTIONAL TOTALS</td><td style="text-align:right; opacity:0.6;">₹${tStd.toLocaleString()}</td><td style="text-align:right; color:var(--accent-primary); font-weight:800;">- ₹${tWav.toLocaleString()}</td><td style="text-align:right;"><strong style="font-size:1.1rem; color:var(--success);">₹${(f.total || 0).toLocaleString()}</strong></td></tr>`;
        } else {
            html += '<tr><td colspan="6" style="text-align:center; padding:60px; color:var(--text-dim);">No structure configured.</td></tr>';
        }
        
        html += `</tbody></table></div>
            <div class="section-title" style="display:flex; justify-content:space-between;"><span>Transaction History</span><button class="btn btn-primary btn-sm" onclick="window.feesManager.showPaymentForm('${id}')"><i data-lucide="plus"></i> Add Payment</button></div>
            <table class="console-table">
                <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Actions</th></tr></thead>
                <tbody>`;
        
        const studentTrans = this.transactions.filter(t => t.studentId === id);
        const isAdmin = (window.currentUserData || {}).isAdmin;
        studentTrans.forEach(t => {
            const d = t.timestamp?.toDate ? t.timestamp.toDate() : new Date(t.timestamp);
            html += `<tr><td>${d.toLocaleDateString()}</td><td><strong>₹${t.amount.toLocaleString()}</strong></td><td>${t.method}</td>
                <td><div class="table-actions">
                    <button class="btn-icon" onclick="window.feesManager.printTransactionReceipt('${t.id}')"><i data-lucide="printer"></i></button>
                    ${isAdmin ? `<button class="btn-icon text-danger" onclick="window.feesManager.deleteTransaction('${t.id}', '${id}', ${t.amount})"><i data-lucide="trash-2"></i></button>` : ''}
                </div></td></tr>`;
        });
        container.innerHTML = html + (studentTrans.length === 0 ? '<tr><td colspan="4" style="text-align:center; padding: 20px;">No transactions found.</td></tr>' : '') + '</tbody></table>';
        
        const toolbar = document.getElementById('fees-toolbar');
        if (toolbar) toolbar.innerHTML = `<button class="btn btn-secondary" onclick="window.feesManager.switchView('overview')"><i data-lucide="arrow-left"></i> Back to Ledger</button><div style="margin-left:auto; display:flex; gap:10px;"><button class="btn btn-secondary" onclick="window.feesManager.printStudentInvoice('${id}')"><i data-lucide="printer"></i> Print Invoice</button><button class="btn btn-primary" onclick="window.feesManager.showSetupFeesForm('${id}')"><i data-lucide="settings"></i> Configure Fees</button></div>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    showAddPlanForm(id = null) {
        const p = id ? this.plans[id] : { name: '', billingCycle: 12, components: [] };
        const renderRow = (c = {name: '', frequency: 'onetime', amount: 0}) => `
            <div class="form-row plan-component-row" style="display:grid; grid-template-columns: 1.8fr 1fr 1.2fr 40px; gap:12px; margin-bottom:12px; align-items:center; background:rgba(255,255,255,0.02); padding:12px; border-radius:12px;">
                <input type="text" class="form-control pc-name" value="${c.name}" placeholder="Fee Name"><select class="form-control pc-freq"><option value="onetime" ${c.frequency==='onetime'?'selected':''}>One-time</option><option value="monthly" ${c.frequency==='monthly'?'selected':''}>Monthly</option></select><input type="number" class="form-control pc-amount" value="${c.amount||''}" placeholder="Rate"><button onclick="this.parentElement.remove(); window.feesManager.recalcPlanTotal();" class="btn-icon text-danger"><i data-lucide="x"></i></button>
            </div>`;
        AppDialog.confirm({
            title: id ? 'Edit Template' : 'Create Template', width: '850px',
            content: `<div style="display:grid; grid-template-columns: 300px 1fr; gap:32px;"><div><div class="form-group"><label>Package Name</label><input type="text" id="plan-name" class="form-control" value="${p.name}"></div><div class="form-group" style="margin-top:20px;"><label>Cycle (Mo)</label><input type="number" id="plan-cycle" class="form-control" value="${p.billingCycle||12}"></div><div id="plan-total-display" style="font-size:2rem; font-weight:900; margin-top:20px; color:var(--accent-secondary);">₹0</div></div><div><div class="form-section-title" style="display:flex; justify-content:space-between;"><span>Components</span><button class="btn btn-secondary btn-sm" id="add-plan-comp-btn">Add Item</button></div><div id="plan-components-container" style="max-height:450px; overflow-y:auto; margin-top:20px;">${p.components.length>0?p.components.map(c=>renderRow(c)).join(''):renderRow()}</div></div></div>`,
            onOpen: (overlay) => {
                const cycI = overlay.querySelector('#plan-cycle'), totD = overlay.querySelector('#plan-total-display'), compC = overlay.querySelector('#plan-components-container');
                this.recalcPlanTotal = () => { let t = 0; const c = parseInt(cycI.value)||12; overlay.querySelectorAll('.plan-component-row').forEach(row => { const a = parseFloat(row.querySelector('.pc-amount').value)||0, f = row.querySelector('.pc-freq').value; t += f==='monthly'?(a*c):a; }); totD.innerText = `₹${t.toLocaleString()}`; return t; };
                overlay.querySelector('#add-plan-comp-btn').onclick = () => { const div = document.createElement('div'); div.innerHTML = renderRow(); compC.appendChild(div.firstElementChild); if (window.lucide) window.lucide.createIcons({root:compC}); this.recalcPlanTotal(); };
                overlay.addEventListener('input', this.recalcPlanTotal); this.recalcPlanTotal();
            },
            onConfirm: async () => {
                const name = document.getElementById('plan-name').value; if (!name) return false;
                const components = []; document.querySelectorAll('.plan-component-row').forEach(row => { const n = row.querySelector('.pc-name').value, a = parseFloat(row.querySelector('.pc-amount').value)||0; if (n) components.push({ name: n, amount: a, frequency: row.querySelector('.pc-freq').value, type: 'academic' }); });
                const data = { name, components, billingCycle: parseInt(document.getElementById('plan-cycle').value)||12, updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: auth.currentUser.email };
                if (!id) data.createdAt = data.updatedAt;
                const ref = firestore.collection('modules').doc('fees_accounting').collection('plans');
                if (id) await ref.doc(id).update(data); else await ref.add(data); return true;
            }
        });
    },

    showSetupFeesForm(studentId) {
        const f = this.fees[studentId] || { total: 0, paid: 0, planId: '', components: [], billingCycle: 12 }, s = this.students[studentId] || { name: 'Student' };
        let opts = '<option value="">-- Select Template --</option>'; 
        Object.keys(this.plans).sort((a,b)=>this.plans[a].name.localeCompare(this.plans[b].name)).forEach(pid => opts += `<option value="${pid}" ${pid === f.planId ? 'selected' : ''}>${this.plans[pid].name}</option>`);
        
        const renderRow = (c = {name: '', frequency: 'onetime', amount: 0, originalAmount: 0}) => {
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
            content: `<div style="display:grid; grid-template-columns: 300px 1fr; gap:32px;"><div><div class="form-group"><label>Apply Template</label><select id="sf-plan-id" class="form-control">${opts}</select></div><div class="form-group" style="margin-top:20px;"><label>Cycle (Mo)</label><input type="number" id="sf-cycle" class="form-control" value="${f.billingCycle || 12}"></div><div id="setup-summary-card" style="margin-top:32px; padding:20px; background:rgba(255,255,255,0.03); border-radius:24px; border:1px solid var(--card-border); word-break: break-all; overflow: hidden;"><div style="margin-bottom:10px;"><label style="font-size:0.6rem; opacity:0.6;">ANNUAL TOTAL</label><div id="sf-final-total-display" style="font-size:1.5rem; font-weight:900;">₹0</div></div><div style="margin-bottom:10px;"><label style="font-size:0.6rem; opacity:0.6;">TOTAL WAIVERS</label><div id="sf-waiver-display" style="font-size:1.2rem; color:var(--accent-primary);">₹0</div></div><div><label style="font-size:0.6rem; opacity:0.6;">BALANCE DUE</label><div id="sf-balance-display" style="font-size:1.8rem; font-weight:900; color:var(--accent-primary);">₹0</div></div></div></div><div><div class="form-section-title" style="display:flex; justify-content:space-between;"><span>Components</span><button class="btn btn-secondary btn-sm" id="add-custom-comp-btn">Add Item</button></div><div id="setup-components-container" style="max-height:450px; overflow-y:auto; margin-top:20px;">${f.components?.length > 0 ? f.components.map(c => renderRow(c)).join('') : renderRow()}</div></div></div>`,
            onOpen: (overlay) => {
                const ps = overlay.querySelector('#sf-plan-id'), cc = overlay.querySelector('#setup-components-container'), cy = overlay.querySelector('#sf-cycle');
                const totalOut = overlay.querySelector('#sf-final-total-display'), waiverOut = overlay.querySelector('#sf-waiver-display'), balOut = overlay.querySelector('#sf-balance-display');
                this.recalcSetupTotal = () => { 
                    let t = 0, w = 0; const c = parseInt(cy.value) || 12; 
                    overlay.querySelectorAll('.component-row').forEach(row => { const orig = parseFloat(row.querySelector('.c-orig').value) || 0, payable = parseFloat(row.querySelector('.c-amount').value) || 0, f = row.querySelector('.c-freq').value; const mult = f === 'monthly' ? c : 1; t += (payable * mult); w += Math.max(0, (orig - payable) * mult); });
                    totalOut.innerText = `₹${t.toLocaleString()}`; waiverOut.innerText = `₹${w.toLocaleString()}`; balOut.innerText = `₹${Math.max(0, t - (f.paid||0)).toLocaleString()}`; return t; 
                };
                ps.onchange = (e) => { const p = this.plans[e.target.value]; if (p) { cc.innerHTML = (p.components || []).map(c => renderRow({...c, originalAmount: c.amount})).join(''); cy.value = p.billingCycle || 12; if (window.lucide) window.lucide.createIcons({ root: cc }); this.recalcSetupTotal(); } };
                overlay.querySelector('#add-custom-comp-btn').onclick = () => { const div = document.createElement('div'); div.innerHTML = renderRow(); cc.appendChild(div.firstElementChild); if (window.lucide) window.lucide.createIcons({ root: cc }); this.recalcSetupTotal(); };
                overlay.addEventListener('input', this.recalcSetupTotal); this.recalcSetupTotal();
                if (window.lucide) window.lucide.createIcons({ root: overlay });
            },
            onConfirm: () => {
                const components = []; document.querySelectorAll('.component-row').forEach(row => { const n = row.querySelector('.c-name').value, a = parseFloat(row.querySelector('.c-amount').value) || 0, o = parseFloat(row.querySelector('.c-orig').value) || a; if (n) components.push({ name: n, amount: a, originalAmount: o, frequency: row.querySelector('.c-freq').value, type: 'other' }); });
                const total = this.recalcSetupTotal();
                firestore.collection('modules').doc('fees_accounting').collection('student_fees').doc(studentId).set({ total, planId: document.getElementById('sf-plan-id').value, billingCycle: parseInt(document.getElementById('sf-cycle').value) || 12, components, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
                AppDialog.toast('Fee structure updated', 'success'); return true;
            }
        });
    },

    showPaymentForm(studentId) {
        const s = this.students[studentId] || { name: 'Student' };
        const today = new Date().toISOString().split('T')[0];
        AppDialog.confirm({
            title: `Log Payment: ${s.name}`,
            content: `
                <div class="form-group"><label>Transaction Date</label><input type="date" id="pf-date" class="form-control" value="${today}"></div>
                <div class="form-group" style="margin-top:15px;"><label>Amount Received (₹)</label><input type="number" id="pf-amount" class="form-control"></div>
                <div class="form-group" style="margin-top:15px;"><label>Method</label><select id="pf-method" class="form-control"><option>Cash</option><option>GPay/UPI</option><option>Bank Transfer</option></select></div>
                <div class="form-group" style="margin-top:15px;"><label>Reference</label><input type="text" id="pf-ref" class="form-control" placeholder="TXN ID / Note"></div>`,
            onConfirm: () => {
                const amount = parseFloat(document.getElementById('pf-amount').value); 
                const customDate = document.getElementById('pf-date').value;
                if (!amount) return false;
                this.savePayment(studentId, { amount, method: document.getElementById('pf-method').value, reference: document.getElementById('pf-ref').value, backDate: customDate !== today ? customDate : null, createdBy: auth.currentUser.email });
                return true;
            }
        });
    },

    savePayment(sid, data) {
        data.studentId = sid; data.timestamp = data.backDate ? new Date(data.backDate) : firebase.firestore.FieldValue.serverTimestamp();
        firestore.collection('modules').doc('fees_accounting').collection('transactions').add(data).then(() => {
            const curr = this.fees[sid]?.paid || 0;
            firestore.collection('modules').doc('fees_accounting').collection('student_fees').doc(sid).set({ paid: curr + data.amount }, { merge: true });
            AppDialog.toast('Payment saved', 'success');
            window.AppLogger.log('COLLECT_FEE', 'fees_accounting', { studentId: sid, amount: data.amount }, sid);
        });
    },

    deleteTransaction(tid, studentId, amount) {
        AppDialog.confirm({
            title: 'Reverse Transaction',
            content: `Are you sure you want to delete this payment of ₹${amount.toLocaleString()}? This will increase the student's balance due.`,
            confirmClass: 'btn-danger',
            onConfirm: async () => {
                const curr = this.fees[studentId]?.paid || 0;
                const batch = firestore.batch();
                batch.delete(firestore.collection('modules').doc('fees_accounting').collection('transactions').doc(tid));
                batch.set(firestore.collection('modules').doc('fees_accounting').collection('student_fees').doc(studentId), { paid: Math.max(0, curr - amount) }, { merge: true });
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
        Object.values(this.staff).sort((a,b)=>a.name.localeCompare(b.name)).forEach(s => opts += `<option value="${s.id}">${s.name}</option>`);
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const now = new Date(), curM = months[now.getMonth()], curY = now.getFullYear();
        AppDialog.confirm({
            title: 'Process Monthly Payroll', width: '700px',
            content: `<div class="form-grid-2"><div class="form-group"><label>Staff Member</label><select id="p-staff" class="form-control">${opts}</select></div><div class="form-group"><label>Payroll Month</label><select id="p-month" class="form-control">${months.map(m=>`<option ${m===curM?'selected':''}>${m} ${curY}</option>`).join('')}</select></div></div><div id="payroll-calc-area" style="margin-top:20px; display:none;"><div class="form-grid-2"><div class="form-group"><label>Base Salary (₹)</label><input type="number" id="p-base" class="form-control"></div><div class="form-group"><label>Bonus / Additions (₹)</label><input type="number" id="p-bonus" class="form-control" value="0"></div></div><div id="reimb-info" style="margin-top:10px; color:var(--success); font-size:0.8rem; display:none;">Approved Reimbursements: <strong id="reimb-amt">₹0</strong></div><div class="form-group" style="margin-top:15px;"><label>Deductions (₹)</label><input type="number" id="p-ded" class="form-control" value="0"></div><div style="margin-top:20px; font-size:1.2rem; font-weight:900;">Net Payout: <span id="p-net" style="color:var(--success)">₹0</span></div></div>`,
            onOpen: (overlay) => {
                const sel = overlay.querySelector('#p-staff'), area = overlay.querySelector('#payroll-calc-area');
                const baseI = overlay.querySelector('#p-base'), bonI = overlay.querySelector('#p-bonus'), dedI = overlay.querySelector('#p-ded'), netD = overlay.querySelector('#p-net');
                const recalc = () => { netD.innerText = `₹${(parseFloat(baseI.value||0) + parseFloat(bonI.value||0) - parseFloat(dedI.value||0)).toLocaleString()}`; };
                sel.onchange = () => {
                    const s = this.staff[sel.value]; if (!s) { area.style.display = 'none'; return; }
                    area.style.display = 'block'; baseI.value = s.baseSalary || 0;
                    const r = this.expenses.filter(e => e.staffId === s.id && e.source === 'staff' && e.status === 'approved' && !e.paidInSalary);
                    const t = r.reduce((a,b) => a + b.amount, 0);
                    if (t > 0) { overlay.querySelector('#reimb-info').style.display='block'; overlay.querySelector('#reimb-amt').innerText=`₹${t.toLocaleString()}`; bonI.value = t; } else { overlay.querySelector('#reimb-info').style.display='none'; bonI.value = 0; }
                    recalc();
                };
                [baseI, bonI, dedI].forEach(i => i.oninput = recalc);
            },
            onConfirm: async () => {
                const sid = document.getElementById('p-staff').value, s = this.staff[sid]; if (!s) return false;
                const base = parseFloat(document.getElementById('p-base').value)||0, bonus = parseFloat(document.getElementById('p-bonus').value)||0, ded = parseFloat(document.getElementById('p-ded').value)||0;
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
            <table class="payout-table"><tr><td>Base Salary</td><td style="text-align:right">₹${s.baseSalary.toLocaleString()}</td></tr><tr><td>Bonus/Reimb</td><td style="text-align:right">₹${s.bonus.toLocaleString()}</td></tr><tr><td>Deductions</td><td style="text-align:right">-₹${s.deductions.toLocaleString()}</td></tr><tr style="border-top: 2px solid #333;"><td style="font-weight:700;">NET DISBURSED</td><td style="text-align:right" class="net">₹${s.netSalary.toLocaleString()}</td></tr></table><script>window.onload=()=>{window.print(); setTimeout(()=>window.close(),500);};</script></body></html>`);
        win.document.close();
    },

    printTransactionReceipt(id) {
        const t = this.transactions.find(x => x.id === id); if (!t) return;
        const s = this.students[t.studentId] || { name: 'Student' };
        const win = window.open('', '_blank');
        win.document.write(`<html><head><style>body { font-family: sans-serif; padding: 40px; } .header { border-bottom: 2px solid #000; padding-bottom: 20px; display: flex; justify-content: space-between; align-items: center; } .info { margin: 30px 0; display: grid; grid-template-columns: 1fr 1fr; } table { width: 100%; border-collapse: collapse; margin: 30px 0; } th, td { padding: 12px; border: 1px solid #000; }</style></head><body><div class="header"><div><h1>ABHISHRI ACADEMY</h1></div><div><h2>FEE INVOICE</h2><p>No: ${id.slice(-8).toUpperCase()}</p></div></div><div class="info"><div><strong>Student:</strong> ${s.name}<br><strong>Class:</strong> ${s.admissionForClass}</div><div><strong>Date:</strong> ${new Date(t.timestamp?.toDate ? t.timestamp.toDate() : t.timestamp).toLocaleDateString()}</div></div><table><thead><tr><th>Description</th><th style="text-align:right">Amount</th></tr></thead><tbody><tr><td>School Fees / Academic Charges</td><td style="text-align:right">₹${t.amount.toLocaleString()}</td></tr></tbody></table><div style="text-align:right; font-size:24px; font-weight:900;">TOTAL PAID: ₹${t.amount.toLocaleString()}</div><div style="margin-top:100px; text-align:center;"><div style="border-top:1px solid #000; width:200px; margin:0 auto; padding-top:10px;">SCHOOL OFFICIAL STAMP</div></div><script>window.onload=()=>{window.print(); setTimeout(()=>window.close(),500);};</script></body></html>`);
        win.document.close();
    },

    printStudentInvoice(id) {
        const s = this.students[id] || { name: 'Student' }, f = this.fees[id] || { total: 0, paid: 0, components: [] };
        const win = window.open('', '_blank');
        win.document.write(`<html><head><style>body { font-family: sans-serif; padding: 40px; color: #333; } .header { border-bottom: 3px solid #F1615B; padding-bottom: 20px; display: flex; justify-content: space-between; } .summary { background: #fafafa; padding: 20px; margin-top: 30px; font-size: 20px; font-weight: 900; }</style></head><body><div class="header"><div><h1>ABHISHRI ACADEMY</h1><p>Fee Statement</p></div><div>Academic Year 2025-26</div></div><p><strong>Student:</strong> ${s.name}<br><strong>Class:</strong> ${s.admissionForClass}</p><table style="width:100%; border-collapse:collapse; margin:30px 0;"><thead style="background:#eee;"><tr><th style="text-align:left; padding:10px;">Component</th><th style="text-align:right; padding:10px;">Amount</th></tr></thead><tbody>${(f.components || []).map(c => {
            const std = (c.originalAmount || c.amount);
            const wav = Math.max(0, std - c.amount);
            return `<tr><td style="padding:10px; border-bottom:1px solid #eee;">${c.name} (${c.frequency})<br><small style="color:#888;">Std: ₹${std.toLocaleString()} | Wav: -₹${wav.toLocaleString()}</small></td><td style="text-align:right; padding:10px; border-bottom:1px solid #eee;">₹${c.amount.toLocaleString()}</td></tr>`;
        }).join('')}</tbody></table><div class="summary"><div style="display:flex; justify-content:space-between;"><span>ANNUAL COMMITMENT:</span><span>₹${(f.total || 0).toLocaleString()}</span></div><div style="display:flex; justify-content:space-between; color:#22c55e; font-size:16px; margin-top:10px;"><span>TOTAL PAID:</span><span>- ₹${(f.paid || 0).toLocaleString()}</span></div><div style="display:flex; justify-content:space-between; color:#F1615B; border-top:2px solid #ddd; margin-top:10px; padding-top:10px;"><span>BALANCE DUE:</span><span>₹${((f.total || 0) - (f.paid || 0)).toLocaleString()}</span></div></div><script>window.onload=()=>{window.print(); setTimeout(()=>window.close(),500);};</script></body></html>`);
        win.document.close();
    }
};
