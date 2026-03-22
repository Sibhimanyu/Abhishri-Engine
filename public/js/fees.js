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
                    <div class="highlight-item" style="border-left: 4px solid #f87171;"><h3>Outflow</h3><div class="metric-value" style="color: #f87171">₹${totalExp.toLocaleString()}</div></div>
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
        let html = `<table class="console-table"><thead><tr><th>Student Name</th><th>Class</th><th>Total Fee</th><th>Paid</th><th>Balance</th><th>Status</th><th>Actions</th></tr></thead><tbody>`;
        const q = this.searchQuery;
        const sortedIds = Object.keys(this.students).filter(id => {
            const s = this.students[id];
            return !q || (s.name || '').toLowerCase().includes(q) || (s.admissionForClass || '').toLowerCase().includes(q);
        }).sort((a, b) => (this.students[a].name || '').localeCompare(this.students[b].name || ''));

        sortedIds.forEach(id => {
            const s = this.students[id], f = this.fees[id] || { total: 0, paid: 0 }, bal = (f.total || 0) - (f.paid || 0);
            html += `<tr onclick="window.feesManager.switchView('student_fees', '${id}')" style="cursor:pointer;" class="clickable-row">
                <td><strong>${s.name}</strong></td><td>${s.admissionForClass || 'N/A'}</td>
                <td>₹${(f.total || 0).toLocaleString()}</td><td>₹${(f.paid || 0).toLocaleString()}</td>
                <td><strong style="color: ${bal > 0 ? 'var(--accent-primary)' : 'var(--success)'}">₹${bal.toLocaleString()}</strong></td>
                <td><span class="status-pill ${bal <= 0 ? 'status-success' : 'status-warning'}">${bal <= 0 ? 'Cleared' : 'Due'}</span></td>
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
        let html = `<table class="console-table"><thead><tr><th>Date</th><th>Student</th><th>Amount</th><th>Method</th><th>Actions</th></tr></thead><tbody>`;
        const q = this.searchQuery;
        const filtered = this.transactions.filter(t => !q || (this.students[t.studentId]?.name || '').toLowerCase().includes(q));
        filtered.forEach(t => {
            const s = this.students[t.studentId] || { name: 'Unknown' }, d = t.timestamp?.toDate ? t.timestamp.toDate() : new Date(t.timestamp);
            html += `<tr><td>${d.toLocaleDateString()}</td><td><strong>${s.name}</strong></td><td><strong style="color:var(--success)">₹${t.amount.toLocaleString()}</strong></td><td>${t.method}</td>
                <td><button class="btn-icon" onclick="window.feesManager.printTransactionReceipt('${t.id}')"><i data-lucide="printer"></i></button></td></tr>`;
        });
        container.innerHTML = html + '</tbody></table>';
    },

    renderOfficeExpenses() {
        const container = document.getElementById('fees-content-office_expenses');
        if (!container) return;
        const filtered = this.expenses.filter(e => e.source === 'office' && e.type !== 'funding' && (!this.searchQuery || (e.details || '').toLowerCase().includes(this.searchQuery)));
        let html = `<table class="console-table"><thead><tr><th>Date</th><th>Category</th><th>Details</th><th>Amount</th><th style="text-align:right">Actions</th></tr></thead><tbody>`;
        const userData = window.currentUserData || {};
        const isAdmin = userData.isAdmin;
        const currentUserEmail = auth.currentUser?.email?.toLowerCase();

        filtered.forEach(e => {
            const d = e.timestamp?.toDate ? e.timestamp.toDate() : new Date(e.timestamp);
            html += `<tr><td>${d.toLocaleDateString()}</td><td><span class="badge">${e.category}</span></td><td>${e.details}</td><td><strong>₹${e.amount.toLocaleString()}</strong></td>
                <td style="text-align:right">
                    <div class="table-actions" style="justify-content:flex-end">
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
                            <small style="font-size:0.75rem; color:var(--text-dim); font-weight:400; margin-left:8px;">per annum</small>
                        </div>

                        <div style="background:rgba(255,255,255,0.02); border-radius:16px; padding:16px; margin-bottom:20px;">
                            <div style="font-size:0.65rem; font-weight:800; color:var(--text-dim); text-transform:uppercase; letter-spacing:1px; margin-bottom:12px;">Component Breakdown</div>
                            <div style="display:flex; flex-direction:column; gap:8px;">
                                ${(p.components || []).map(c => `
                                    <div style="display:flex; justify-content:space-between; font-size:0.85rem;">
                                        <span style="opacity:0.8;">${c.name}</span>
                                        <span style="font-weight:600;">₹${c.amount.toLocaleString()} <small style="font-size:0.65rem; opacity:0.5;">${c.frequency === 'monthly' ? '/ mo' : '(fixed)'}</small></span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--card-border); padding-top:16px;">
                        <button class="btn btn-ghost btn-sm" style="color:var(--accent-primary);" onclick="window.feesManager.showAddPlanForm('${id}')">
                            <i data-lucide="edit-3"></i> EDIT
                        </button>
                        <button class="btn btn-ghost text-danger btn-sm" onclick="window.feesManager.deletePlan('${id}')">
                            <i data-lucide="trash-2"></i> DELETE
                        </button>
                    </div>
                </div>`;
        });
        
        container.innerHTML = html + (sortedPlanIds.length === 0 ? '<div class="empty-state" style="grid-column: 1/-1;">No templates found.</div>' : '') + '</div>';
    },

    renderStudentFees() {
        const container = document.getElementById('fees-content-student-fees'), id = this.activeStudentId;
        if (!container || !id) return;
        const s = this.students[id] || { name: 'Student' }, f = this.fees[id] || { total: 0, paid: 0, components: [], billingCycle: 12 };
        
        let html = `
            <div class="fee-profile-header">
                <h2>${s.name}</h2>
                <div class="highlights" style="margin-top:20px;">
                    <div class="highlight-item" style="border-left: 4px solid var(--accent-secondary);"><h3>Total Payable</h3><div>₹${(f.total || 0).toLocaleString()}</div></div>
                    <div class="highlight-item" style="border-left: 4px solid var(--success);"><h3>Total Paid</h3><div style="color: var(--success)">₹${(f.paid || 0).toLocaleString()}</div></div>
                    <div class="highlight-item" style="border-left: 4px solid var(--accent-primary);"><h3>Balance Due</h3><div style="color: var(--accent-primary)">₹${((f.total || 0) - (f.paid || 0)).toLocaleString()}</div></div>
                </div>
            </div>
            
            <div class="section-title" style="margin-top:40px; display:flex; justify-content:space-between; align-items:center;">
                <span>Detailed Fee Breakdown</span>
                <span style="font-size:0.75rem; background:rgba(255,255,255,0.05); padding:4px 12px; border-radius:8px;">Cycle: ${f.billingCycle || 12} Months</span>
            </div>
            
            <div class="console-card" style="padding:0; overflow:hidden; margin-bottom:40px; border: 1px solid var(--card-border);">
                <table class="console-table" style="margin:0;">
                    <thead style="background:rgba(255,255,255,0.03);">
                        <tr>
                            <th>Fee Component</th>
                            <th>Frequency</th>
                            <th style="text-align:right;">Base Rate</th>
                            <th style="text-align:center;">Multiplier</th>
                            <th style="text-align:right;">Annual Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>`;
        
        if (f.components?.length > 0) {
            const cycle = f.billingCycle || 12;
            f.components.forEach(c => {
                const subtotal = c.frequency === 'monthly' ? (c.amount * cycle) : c.amount;
                html += `
                    <tr>
                        <td>
                            <div style="font-weight:700; color:var(--text-main);">${c.name}</div>
                            <div style="font-size:0.65rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.5px;">${c.type || 'Academic'}</div>
                        </td>
                        <td>
                            <span class="status-pill" style="background:rgba(255,255,255,0.05); font-size:0.65rem;">
                                ${c.frequency === 'monthly' ? 'MONTHLY' : 'ONE-TIME / ANNUAL'}
                            </span>
                        </td>
                        <td style="text-align:right; opacity:0.8;">₹${c.amount.toLocaleString()}</td>
                        <td style="text-align:center; font-family:monospace; opacity:0.6;">${c.frequency === 'monthly' ? '× ' + cycle : '× 1'}</td>
                        <td style="text-align:right;"><strong style="color:var(--accent-secondary);">₹${subtotal.toLocaleString()}</strong></td>
                    </tr>`;
            });
            html += `
                <tr style="background:rgba(255,255,255,0.02); border-top: 2px solid var(--card-border);">
                    <td colspan="4" style="text-align:right; font-weight:700; text-transform:uppercase; font-size:0.75rem; letter-spacing:1px; color:var(--text-dim);">Total Annual Commitment</td>
                    <td style="text-align:right;"><strong style="font-size:1.1rem; color:var(--text-main);">₹${(f.total || 0).toLocaleString()}</strong></td>
                </tr>`;
        } else {
            html += '<tr><td colspan="5" style="text-align:center; padding:60px; color:var(--text-dim);"><i data-lucide="info" style="width:32px; height:32px; margin-bottom:12px; opacity:0.3;"></i><br>No fee structure configured for this student.</td></tr>';
        }
        html += `</tbody></table></div>

            <div class="section-title" style="display:flex; justify-content:space-between; align-items:center;">
                <span>Transaction History</span>
                <button class="btn btn-primary btn-sm" onclick="window.feesManager.showPaymentForm('${id}')"><i data-lucide="plus"></i> Add Payment</button>
            </div>
            <table class="console-table">
                <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Actions</th></tr></thead>
                <tbody>`;
        
        const studentTrans = this.transactions.filter(t => t.studentId === id);
        studentTrans.forEach(t => {
            const d = t.timestamp?.toDate ? t.timestamp.toDate() : new Date(t.timestamp);
            html += `<tr><td>${d.toLocaleDateString()}</td><td><strong>₹${t.amount.toLocaleString()}</strong></td><td>${t.method}</td>
                <td><button class="btn-icon" onclick="window.feesManager.printTransactionReceipt('${t.id}')"><i data-lucide="printer"></i></button></td></tr>`;
        });
        
        container.innerHTML = html + (studentTrans.length === 0 ? '<tr><td colspan="4" style="text-align:center; padding: 20px;">No transactions found.</td></tr>' : '') + '</tbody></table>';
        
        const toolbar = document.getElementById('fees-toolbar');
        if (toolbar) {
            toolbar.innerHTML = `
                <button class="btn btn-secondary" onclick="window.feesManager.switchView('overview')"><i data-lucide="arrow-left"></i> Back to Ledger</button>
                <div style="margin-left:auto; display:flex; gap:10px;">
                    <button class="btn btn-secondary" onclick="window.feesManager.printStudentInvoice('${id}')"><i data-lucide="printer"></i> Print Invoice</button>
                    <button class="btn btn-primary" onclick="window.feesManager.showSetupFeesForm('${id}')"><i data-lucide="settings"></i> Configure Fees</button>
                </div>
            `;
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    showAddPlanForm(id = null) {
        const p = id ? this.plans[id] : { name: '', billingCycle: 12, components: [] };
        
        const renderRow = (c = {name: '', frequency: 'onetime', amount: 0}) => `
            <div class="form-row plan-component-row" style="display:grid; grid-template-columns: 2fr 1.5fr 1fr 40px; gap:12px; margin-bottom:12px; align-items:center; background:rgba(255,255,255,0.02); padding:12px; border-radius:12px; border:1px solid rgba(255,255,255,0.05);">
                <div class="form-group" style="margin:0;"><label style="font-size:0.6rem; color:var(--text-dim);">Component Name</label><input type="text" class="form-control pc-name" value="${c.name}" placeholder="e.g. Tuition Fee"></div>
                <div class="form-group" style="margin:0;"><label style="font-size:0.6rem; color:var(--text-dim);">Billing Frequency</label><select class="form-control pc-freq"><option value="onetime" ${c.frequency === 'onetime' ? 'selected' : ''}>One-time / Annual</option><option value="monthly" ${c.frequency === 'monthly' ? 'selected' : ''}>Monthly</option></select></div>
                <div class="form-group" style="margin:0;"><label style="font-size:0.6rem; color:var(--text-dim);">Rate (₹)</label><input type="number" class="form-control pc-amount" value="${c.amount || ''}" placeholder="0.00"></div>
                <button onclick="this.parentElement.remove(); window.feesManager.recalcPlanTotal();" class="btn-icon text-danger" style="margin-top:15px;"><i data-lucide="x"></i></button>
            </div>`;

        AppDialog.confirm({
            title: id ? 'Edit Fee Package Template' : 'Create Fee Package Template', width: '850px',
            content: `
                <div style="display:grid; grid-template-columns: 300px 1fr; gap:32px;">
                    <div>
                        <div class="form-group"><label>Package Name</label><input type="text" id="plan-name" class="form-control" value="${p.name}" placeholder="e.g. Grade 1 standard"></div>
                        <div class="form-group" style="margin-top:20px;"><label>Academic Cycle (Months)</label><input type="number" id="plan-cycle" class="form-control" value="${p.billingCycle || 12}"></div>
                        
                        <div id="plan-summary-card" style="margin-top:32px; padding:24px; background:var(--accent-secondary); color:#000; border-radius:20px; box-shadow: 0 10px 30px rgba(115, 199, 200, 0.2);">
                            <div style="font-size:0.7rem; font-weight:800; text-transform:uppercase; opacity:0.7; letter-spacing:1px;">Annual Commitment</div>
                            <div id="plan-total-display" style="font-size:2.2rem; font-weight:900; margin:8px 0;">₹0</div>
                        </div>
                    </div>
                    <div>
                        <div class="form-section-title" style="display:flex; justify-content:space-between; align-items:center; margin:0;">
                            <span>Fee Components</span>
                            <button class="btn btn-secondary btn-sm" id="add-plan-comp-btn"><i data-lucide="plus"></i> Add Item</button>
                        </div>
                        <div id="plan-components-container" style="max-height:450px; overflow-y:auto; margin-top:20px; padding-right:10px;">
                            ${p.components.length > 0 ? p.components.map(c => renderRow(c)).join('') : renderRow()}
                        </div>
                    </div>
                </div>`,
            onOpen: (overlay) => {
                const container = overlay.querySelector('#plan-components-container'), cycleIn = overlay.querySelector('#plan-cycle'), totalOut = overlay.querySelector('#plan-total-display');
                this.recalcPlanTotal = () => {
                    let total = 0; const cycle = parseInt(cycleIn.value) || 12;
                    overlay.querySelectorAll('.plan-component-row').forEach(row => {
                        const amt = parseFloat(row.querySelector('.pc-amount').value) || 0, freq = row.querySelector('.pc-freq').value;
                        total += freq === 'monthly' ? (amt * cycle) : amt;
                    });
                    totalOut.innerText = `₹${total.toLocaleString()}`;
                    return total;
                };
                overlay.querySelector('#add-plan-comp-btn').onclick = () => {
                    const div = document.createElement('div'); div.innerHTML = renderRow();
                    container.appendChild(div.firstElementChild);
                    if (window.lucide) window.lucide.createIcons({ root: container });
                    this.recalcPlanTotal();
                };
                overlay.addEventListener('input', this.recalcPlanTotal);
                this.recalcPlanTotal();
                if (window.lucide) window.lucide.createIcons({ root: overlay });
            },
            onConfirm: async () => {
                const name = document.getElementById('plan-name').value;
                if (!name) { AppDialog.toast('Package name is required', 'error'); return false; }
                const components = [];
                document.querySelectorAll('.plan-component-row').forEach(row => {
                    const n = row.querySelector('.pc-name').value, a = parseFloat(row.querySelector('.pc-amount').value) || 0;
                    if (n) components.push({ name: n, amount: a, frequency: row.querySelector('.pc-freq').value, type: 'academic' });
                });
                if (components.length === 0) { AppDialog.toast('Add at least one fee component', 'error'); return false; }

                const data = {
                    name,
                    components,
                    billingCycle: parseInt(document.getElementById('plan-cycle').value) || 12,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedBy: auth.currentUser.email
                };
                if (!id) data.createdAt = data.updatedAt;

                const ref = firestore.collection('modules').doc('fees_accounting').collection('plans');
                if (id) await ref.doc(id).update(data);
                else await ref.add(data);
                
                AppDialog.toast(`Fee package ${id ? 'updated' : 'created'}`, 'success');
                return true;
            }
        });
    },

    showSetupFeesForm(studentId) {
        const f = this.fees[studentId] || { total: 0, planId: '', components: [], billingCycle: 12 }, s = this.students[studentId] || { name: 'Student' };
        let opts = '<option value="">-- Select Template --</option>'; 
        Object.keys(this.plans).sort((a,b)=>this.plans[a].name.localeCompare(this.plans[b].name)).forEach(pid => opts += `<option value="${pid}" ${pid === f.planId ? 'selected' : ''}>${this.plans[pid].name}</option>`);
        
        const renderRow = (c = {name: '', frequency: 'onetime', amount: 0}) => `
            <div class="form-row component-row" style="display:grid; grid-template-columns: 2fr 1.5fr 1fr 40px; gap:12px; margin-bottom:12px; align-items:center; background:rgba(255,255,255,0.02); padding:12px; border-radius:12px; border:1px solid rgba(255,255,255,0.05);">
                <div class="form-group" style="margin:0;"><label style="font-size:0.6rem; color:var(--text-dim);">Fee Name</label><input type="text" class="form-control c-name" value="${c.name}" placeholder="e.g. Tuition Fee"></div>
                <div class="form-group" style="margin:0;"><label style="font-size:0.6rem; color:var(--text-dim);">Frequency</label><select class="form-control c-freq"><option value="onetime" ${c.frequency === 'onetime' ? 'selected' : ''}>One-time</option><option value="monthly" ${c.frequency === 'monthly' ? 'selected' : ''}>Monthly</option></select></div>
                <div class="form-group" style="margin:0;"><label style="font-size:0.6rem; color:var(--text-dim);">Rate (₹)</label><input type="number" class="form-control c-amount" value="${c.amount || ''}" placeholder="0.00"></div>
                <button onclick="this.parentElement.remove(); window.feesManager.recalcSetupTotal();" class="btn-icon text-danger" style="margin-top:15px;"><i data-lucide="x"></i></button>
            </div>`;

        AppDialog.confirm({
            title: `Configure Fees: ${s.name}`, width: '850px',
            content: `
                <div style="display:grid; grid-template-columns: 300px 1fr; gap:32px;">
                    <div>
                        <div class="form-group"><label>Apply Template</label><select id="sf-plan-id" class="form-control">${opts}</select></div>
                        <div class="form-group" style="margin-top:20px;"><label>Academic Cycle (Months)</label><input type="number" id="sf-cycle" class="form-control" value="${f.billingCycle || 12}"></div>
                        
                        <div id="setup-summary-card" style="margin-top:32px; padding:24px; background:var(--accent-primary); color:#fff; border-radius:20px; box-shadow: 0 10px 30px rgba(241, 97, 91, 0.2);">
                            <div style="font-size:0.7rem; font-weight:800; text-transform:uppercase; opacity:0.8; letter-spacing:1px;">Annual Total</div>
                            <div id="sf-final-total-display" style="font-size:2.2rem; font-weight:900; margin:8px 0;">₹0</div>
                            <p style="font-size:0.75rem; margin:0; line-height:1.4; opacity:0.9;">Total liability for the current academic cycle.</p>
                        </div>
                    </div>
                    <div>
                        <div class="form-section-title" style="display:flex; justify-content:space-between; align-items:center; margin:0;">
                            <span>Fee Components</span>
                            <button class="btn btn-secondary btn-sm" id="add-custom-comp-btn"><i data-lucide="plus"></i> Add Item</button>
                        </div>
                        <div id="setup-components-container" style="max-height:450px; overflow-y:auto; margin-top:20px; padding-right:10px;">
                            ${f.components?.length > 0 ? f.components.map(c => renderRow(c)).join('') : renderRow()}
                        </div>
                    </div>
                </div>`,
            onOpen: (overlay) => {
                const ps = overlay.querySelector('#sf-plan-id'), cc = overlay.querySelector('#setup-components-container'), cy = overlay.querySelector('#sf-cycle'), totalOut = overlay.querySelector('#sf-final-total-display');
                
                this.recalcSetupTotal = () => { 
                    let t = 0; const c = parseInt(cy.value) || 12; 
                    overlay.querySelectorAll('.component-row').forEach(row => { 
                        const a = parseFloat(row.querySelector('.c-amount').value) || 0, f = row.querySelector('.c-freq').value; 
                        t += f === 'monthly' ? (a * c) : a; 
                    });
                    totalOut.innerText = `₹${t.toLocaleString()}`; 
                    return t; 
                };

                ps.onchange = (e) => { 
                    const p = this.plans[e.target.value]; 
                    if (p) { 
                        cc.innerHTML = (p.components || []).map(c => renderRow(c)).join(''); 
                        cy.value = p.billingCycle || 12; 
                        if (window.lucide) window.lucide.createIcons({ root: cc }); 
                        this.recalcSetupTotal(); 
                    } 
                };

                overlay.querySelector('#add-custom-comp-btn').onclick = () => { 
                    const div = document.createElement('div'); div.innerHTML = renderRow(); 
                    cc.appendChild(div.firstElementChild); 
                    if (window.lucide) window.lucide.createIcons({ root: cc }); 
                    this.recalcSetupTotal();
                };

                overlay.addEventListener('input', this.recalcSetupTotal);
                this.recalcSetupTotal();
                if (window.lucide) window.lucide.createIcons({ root: overlay });
            },
            onConfirm: () => {
                const components = []; 
                document.querySelectorAll('.component-row').forEach(row => { 
                    const n = row.querySelector('.c-name').value, a = parseFloat(row.querySelector('.c-amount').value) || 0; 
                    if (n) components.push({ name: n, amount: a, frequency: row.querySelector('.c-freq').value, type: 'other' }); 
                });
                const total = this.recalcSetupTotal();
                firestore.collection('modules').doc('fees_accounting').collection('student_fees').doc(studentId).set({ 
                    total, planId: document.getElementById('sf-plan-id').value, billingCycle: parseInt(document.getElementById('sf-cycle').value) || 12, components, updatedAt: firebase.firestore.FieldValue.serverTimestamp() 
                }, { merge: true });
                AppDialog.toast('Fee structure updated', 'success');
                return true;
            }
        });
    },

    showPaymentForm(studentId) {
        const s = this.students[studentId] || { name: 'Student' };
        AppDialog.confirm({
            title: `Log Payment: ${s.name}`,
            content: `<div class="form-group"><label>Amount (₹)</label><input type="number" id="pf-amount" class="form-control"></div><div class="form-group" style="margin-top:15px;"><label>Method</label><select id="pf-method" class="form-control"><option>Cash</option><option>GPay/UPI</option><option>Bank Transfer</option></select></div>`,
            onConfirm: () => {
                const amount = parseFloat(document.getElementById('pf-amount').value); if (!amount) return false;
                this.savePayment(studentId, { amount, method: document.getElementById('pf-method').value, createdBy: auth.currentUser.email });
                return true;
            }
        });
    },

    savePayment(sid, data) {
        data.studentId = sid; data.timestamp = firebase.firestore.FieldValue.serverTimestamp();
        firestore.collection('modules').doc('fees_accounting').collection('transactions').add(data).then(() => {
            const curr = this.fees[sid]?.paid || 0;
            firestore.collection('modules').doc('fees_accounting').collection('student_fees').doc(sid).set({ paid: curr + data.amount }, { merge: true });
            AppDialog.toast('Payment saved', 'success');
        });
    },

    showOfficeExpenseForm() {
        AppDialog.confirm({
            title: 'Log Office Expense',
            content: `<div class="form-group"><label>Category</label><select id="oe-cat" class="form-control"><option>Rent</option><option>Utilities</option><option>Supplies</option><option>Marketing</option></select></div><div class="form-group" style="margin-top:15px;"><label>Amount (₹)</label><input type="number" id="oe-amount" class="form-control"></div><div class="form-group" style="margin-top:15px;"><label>Details</label><input type="text" id="oe-details" class="form-control"></div>`,
            onConfirm: async () => {
                const amount = parseFloat(document.getElementById('oe-amount').value); if (!amount) return false;
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
            content: `<div class="form-group"><label>Amount (₹)</label><input type="number" id="sf-amount" class="form-control"></div><div class="form-group" style="margin-top:15px;"><label>Reason</label><input type="text" id="sf-details" class="form-control"></div>`,
            onConfirm: async () => {
                const amount = parseFloat(document.getElementById('sf-amount').value); if (!amount) return false;
                await firestore.collection('modules').doc('fees_accounting').collection('expenses').add({ source: 'staff', type: 'spend', staffId: my.id, amount, status: 'pending', category: 'General', details: document.getElementById('sf-details').value, createdBy: auth.currentUser.email, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
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
            title: 'Delete Fee Package',
            content: 'Are you sure you want to permanently delete this package template?',
            confirmClass: 'btn-danger',
            onConfirm: () => {
                firestore.collection('modules').doc('fees_accounting').collection('plans').doc(id).delete();
                return true;
            }
        });
    },

    deleteExpense(id) {
        AppDialog.confirm({
            title: 'Delete Record',
            content: 'Are you sure you want to permanently delete this financial record? This will affect wallet balances and net flow.',
            confirmClass: 'btn-danger',
            onConfirm: () => {
                firestore.collection('modules').doc('fees_accounting').collection('expenses').doc(id).delete();
                return true;
            }
        });
    },

    printSalarySlip(id) {
        const s = this.salaries.find(x => x.id === id); if (!s) return;
        const st = this.staff[s.staffId] || { name: 'Staff Member' };
        const win = window.open('', '_blank');
        win.document.write(`<html><head><title>Slip - ${st.name}</title><style>body { font-family: sans-serif; padding: 40px; color: #333; line-height: 1.6; } .header { border-bottom: 2px solid #F1615B; padding-bottom: 20px; margin-bottom: 30px; } .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; } .payout-table { width: 100%; border-collapse: collapse; margin: 30px 0; } .payout-table td { padding: 12px; border-bottom: 1px solid #eee; } .net { font-size: 24px; font-weight: 900; color: #22c55e; }</style></head><body>
            <div class="header"><h1>ABHISHRI ACADEMY</h1><p>Salary Pay Slip - ${s.month}</p></div>
            <div class="grid"><div><strong>Employee Name:</strong> ${st.name}<br><strong>Designation:</strong> ${st.designation || 'N/A'}</div><div><strong>Date:</strong> ${new Date(s.timestamp?.toDate ? s.timestamp.toDate() : s.timestamp).toLocaleDateString()}</div></div>
            <table class="payout-table">
                <tr><td>Base Salary</td><td style="text-align:right">₹${s.baseSalary.toLocaleString()}</td></tr>
                <tr><td>Allowances / Reimbursements</td><td style="text-align:right">+₹${(s.bonus || 0).toLocaleString()}</td></tr>
                <tr><td>Deductions / Advances</td><td style="text-align:right">-₹${(s.deductions || 0).toLocaleString()}</td></tr>
                <tr style="border-top: 2px solid #333;"><td style="font-weight:700;">NET DISBURSED</td><td style="text-align:right" class="net">₹${s.netSalary.toLocaleString()}</td></tr>
            </table>
            <div style="margin-top:100px; text-align:center; font-size:10px; color:#999;">Electronic record. Printed on ${new Date().toLocaleString()}</div>
            <script>window.onload=()=>{window.print(); setTimeout(()=>window.close(),500);};</script></body></html>`);
        win.document.close();
    },

    printTransactionReceipt(id) {
        const t = this.transactions.find(x => x.id === id); if (!t) return;
        const s = this.students[t.studentId] || { name: 'Student' };
        const d = t.timestamp?.toDate ? t.timestamp.toDate() : new Date(t.timestamp);
        const win = window.open('', '_blank');
        win.document.write(`<html><head><title>Invoice - ${s.name}</title><style>body { font-family: sans-serif; padding: 40px; color: #000; line-height: 1.6; } .receipt-header { border-bottom: 2px solid #000; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center; } .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px; } .payment-table { width: 100%; border-collapse: collapse; margin-bottom: 40px; } .payment-table th, .payment-table td { padding: 12px; border: 1px solid #000; } .total-amount { font-size: 24px; font-weight: 900; }</style></head><body>
            <div class="receipt-header"><div><h1>ABHISHRI ACADEMY</h1><p>Smart Campus Official Statement</p></div><div style="text-align:right;"><h2>FEE INVOICE</h2><p>No: ${id.slice(-8).toUpperCase()}</p></div></div>
            <div class="info-grid"><div><strong>Student:</strong> ${s.name}<br><strong>Class:</strong> ${s.admissionForClass || 'N/A'}</div><div><strong>Date:</strong> ${d.toLocaleDateString()}<br><strong>Mode:</strong> ${t.method}</div></div>
            <table class="payment-table"><thead><tr><th>Description</th><th>Reference</th><th style="text-align:right;">Amount</th></tr></thead><tbody><tr><td>School Fees / Academic Charges</td><td>${t.reference || '-'}</td><td style="text-align:right; font-weight:700;">₹${t.amount.toLocaleString()}</td></tr></tbody></table>
            <div style="text-align:right;"><span style="font-weight:700;">TOTAL PAID:</span> <span class="total-amount">₹${t.amount.toLocaleString()}</span></div>
            <div style="margin-top:60px; display:flex; justify-content:center;"><div style="border-top:1px solid #000; width:250px; text-align:center; padding-top:10px; font-weight:700;">SCHOOL OFFICIAL STAMP</div></div>
            <div style="margin-top:100px; text-align:center; font-size:10px; color:#999;">Generated on ${new Date().toLocaleString()}</div>
            <script>window.onload=()=>{window.print(); setTimeout(()=>window.close(),500);};</script></body></html>`);
        win.document.close();
    },

    printStudentInvoice(id) {
        const s = this.students[id] || { name: 'Student' };
        const f = this.fees[id] || { total: 0, paid: 0, components: [] };
        const win = window.open('', '_blank');
        win.document.write(`<html><head><title>Invoice - ${s.name}</title><style>body { font-family: sans-serif; padding: 40px; color: #333; line-height: 1.5; } .header { border-bottom: 3px solid #F1615B; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: flex-end; } .info-section { margin-bottom: 30px; } .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; } .fee-table { width: 100%; border-collapse: collapse; margin: 20px 0; } .fee-table th, .fee-table td { padding: 10px; border-bottom: 1px solid #eee; text-align: left; } .summary { background: #fafafa; padding: 20px; margin-top: 30px; } .due { font-size: 20px; font-weight: 900; color: #F1615B; }</style></head><body>
            <div class="header"><div><h1>ABHISHRI ACADEMY</h1><p>Fee Statement / Proforma Invoice</p></div><div style="text-align:right;">Academic Year 2025-26</div></div>
            <div class="info-section"><div class="grid"><div><strong>Bill To:</strong><br>${s.name}<br>${s.admissionForClass || 'No Class'}</div><div style="text-align:right;"><strong>Statement Date:</strong> ${new Date().toLocaleDateString()}</div></div></div>
            <table class="fee-table"><thead><tr><th>Fee Component</th><th>Frequency</th><th style="text-align:right;">Annual Amount</th></tr></thead><tbody>
                ${(f.components || []).map(c => `<tr><td>${c.name}</td><td>${c.frequency}</td><td style="text-align:right;">₹${c.amount.toLocaleString()}</td></tr>`).join('')}
            </tbody></table>
            <div class="summary"><div style="display:flex; justify-content:space-between; margin-bottom:10px;"><span>Annual Commitment:</span><strong>₹${(f.total || 0).toLocaleString()}</strong></div><div style="display:flex; justify-content:space-between; margin-bottom:10px;"><span>Total Paid to Date:</span><strong style="color:#22c55e;">- ₹${(f.paid || 0).toLocaleString()}</strong></div><div style="display:flex; justify-content:space-between; margin-top:10px; border-top:1px solid #ddd; padding-top:10px;" class="due"><span>OUTSTANDING BALANCE:</span><span>₹${((f.total || 0) - (f.paid || 0)).toLocaleString()}</span></div></div>
            <script>window.onload=()=>{window.print(); setTimeout(()=>window.close(),500);};</script></body></html>`);
        win.document.close();
    }
};
