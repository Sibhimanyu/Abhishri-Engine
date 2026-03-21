/**
 * Fees and Accounting Module - Firestore Edition
 * Handles student fee management, collections, transactions, and expenses using Cloud Firestore
 */

window.feesManager = {
    students: {},
    fees: {},
    plans: {},
    expenses: {},
    transactions: [],
    isSubscribed: false,
    dataLoaded: false,
    currentView: 'collections', // collections, overview, transactions, expenses, plans, student_fees
    searchQuery: '',

    initialize() {
        // Initial setup
    },

    subscribe() {
        if (this.isSubscribed) return;
        this.isSubscribed = true;

        // 1. Subscribe to Students (Firestore)
        window.studentDataManager.subscribe();
        window.studentDataManager.onUpdate((data) => {
            this.students = data;
            this.dataLoaded = true;
            this.render();
        });

        // 2. Subscribe to Fee Summaries (Firestore)
        firestore.collection('modules').doc('fees_accounting').collection('student_fees')
            .onSnapshot((snapshot) => {
                const feesData = {};
                snapshot.forEach(doc => feesData[doc.id] = doc.data());
                this.fees = feesData;
                this.render();
            }, (error) => console.error("Firestore Fees Error:", error));

        // 3. Subscribe to Global Transactions (Firestore) - Ordered by date
        firestore.collection('modules').doc('fees_accounting').collection('transactions')
            .orderBy('timestamp', 'desc').limit(100)
            .onSnapshot((snapshot) => {
                const trans = [];
                snapshot.forEach(doc => trans.push({ id: doc.id, ...doc.data() }));
                this.transactions = trans;
                this.render();
            });

        // 4. Subscribe to Fee Packages/Plans (Firestore)
        firestore.collection('modules').doc('fees_accounting').collection('plans')
            .onSnapshot((snapshot) => {
                const plansData = {};
                snapshot.forEach(doc => plansData[doc.id] = doc.data());
                this.plans = plansData;
                this.render();
            });

        // 5. Subscribe to Expenses (Firestore)
        firestore.collection('modules').doc('fees_accounting').collection('expenses')
            .orderBy('timestamp', 'desc')
            .onSnapshot((snapshot) => {
                const expData = {};
                snapshot.forEach(doc => expData[doc.id] = doc.data());
                this.expenses = expData;
                this.render();
            });
    },

    switchView(viewName, studentId = null) {
        this.currentView = viewName;
        this.activeStudentId = studentId;

        let hash = `fees/${viewName}`;
        if (studentId) hash += `/${studentId}`;
        window.location.hash = hash;

        document.querySelectorAll('#sidebar-nav-fees .nav-item').forEach(el => el.classList.remove('active'));
        const activeNav = document.getElementById(`nav-fees-${viewName}`);
        if (activeNav) activeNav.classList.add('active');

        document.querySelectorAll('.fees-subview').forEach(el => el.style.display = 'none');
        const activeView = document.getElementById(`fees-view-${viewName}`);
        if (activeView) activeView.style.display = 'block';

        this.render();
        if (typeof closeSidebar === 'function') closeSidebar();
    },

    render() {
        if (!window.location.hash.startsWith('#fees')) return;

        const userData = window.currentUserData || {};
        const isAdmin = userData.isAdmin;
        const perms = userData.permissions?.fees_accounting || {};
        const isMaster = isAdmin === true;

        const setNavVisible = (id, visible) => {
            const el = document.getElementById(id);
            if (el) el.style.display = visible ? 'flex' : 'none';
        };

        setNavVisible('nav-fees-collections', isMaster || perms === true || perms.view);
        setNavVisible('nav-fees-overview', isMaster || perms === true || perms.ledger);
        setNavVisible('nav-fees-transactions', isMaster || perms === true || perms.transactions);
        setNavVisible('nav-fees-expenses', isMaster || perms === true || perms.expenses);
        setNavVisible('nav-fees-plans', isMaster || perms === true || perms.config);

        const toolbar = document.getElementById('fees-toolbar');
        if (toolbar) {
            toolbar.innerHTML = '';
            // Add search bar for views that need it
            if (['overview', 'expenses', 'plans', 'transactions'].includes(this.currentView)) {
                const searchContainer = document.createElement('div');
                searchContainer.className = 'search-box';
                searchContainer.style.maxWidth = '400px';
                searchContainer.style.marginRight = 'auto';
                
                searchContainer.innerHTML = `
                    <i data-lucide="search"></i>
                    <input type="text" placeholder="Search records..." value="${this.searchQuery || ''}">
                `;

                const searchInput = searchContainer.querySelector('input');
                searchInput.oninput = (e) => {
                    this.searchQuery = e.target.value.toLowerCase();
                    this.renderContentOnly();
                };
                
                toolbar.appendChild(searchContainer);
            }
        }

        if (this.currentView === 'collections') {
            this.renderCollections();
        } else if (this.currentView === 'overview') {
            const btn = document.createElement('button');
            btn.className = 'btn btn-secondary';
            btn.innerHTML = '<i data-lucide="refresh-cw"></i> Refresh Data';
            btn.onclick = () => window.studentDataManager.subscribe();
            toolbar.appendChild(btn);
            this.renderOverview();
        } else if (this.currentView === 'transactions') {
            this.renderTransactions();
        } else if (this.currentView === 'expenses') {
            const btn = document.createElement('button');
            btn.className = 'btn btn-primary';
            btn.innerHTML = '<i data-lucide="plus"></i> Log Expense';
            btn.onclick = () => this.showExpenseForm();
            toolbar.appendChild(btn);
            this.renderExpenses();
        } else if (this.currentView === 'student_fees') {
            toolbar.innerHTML = `<button class="btn btn-secondary" onclick="window.feesManager.switchView('overview')"><i data-lucide="arrow-left"></i> Back to Ledger</button> <button class="btn btn-primary" onclick="window.feesManager.showSetupFeesForm('${this.activeStudentId}')"><i data-lucide="settings"></i> Configure Fees</button>`;
            this.renderStudentFees();
        } else if (this.currentView === 'plans') {
            const btn = document.createElement('button');
            btn.className = 'btn btn-primary';
            btn.innerHTML = '<i data-lucide="plus"></i> Create Fee Package';
            btn.onclick = () => this.showAddPlanForm();
            toolbar.appendChild(btn);
            this.renderPlans();
        }

        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    renderContentOnly() {
        if (this.currentView === 'overview') this.renderOverview();
        else if (this.currentView === 'expenses') this.renderExpenses();
        else if (this.currentView === 'plans') this.renderPlans();
        else if (this.currentView === 'transactions') this.renderTransactions();
        
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    renderCollections() {
        const container = document.getElementById('fees-content-collections');
        if (!container) return;

        let totalReceivable = 0;
        let totalCollected = 0;
        let expenseTotal = 0;

        Object.keys(this.fees).forEach(id => {
            totalReceivable += (this.fees[id].total || 0);
            totalCollected += (this.fees[id].paid || 0);
        });

        Object.keys(this.expenses).forEach(id => {
            expenseTotal += (this.expenses[id].amount || 0);
        });

        const collectionRate = totalReceivable > 0 ? Math.round((totalCollected / totalReceivable) * 100) : 0;
        const netBalance = totalCollected - expenseTotal;

        container.innerHTML = `
            <div class="highlights" style="margin-bottom: 30px;">
                <div class="highlight-item" style="border-left: 4px solid var(--accent-secondary);">
                    <div class="highlight-text"><h3>Expected Revenue</h3><div>₹${totalReceivable.toLocaleString()}</div></div>
                </div>
                <div class="highlight-item" style="border-left: 4px solid var(--success);"><div class="highlight-text"><h3>Total Collected</h3><div style="color: var(--success)">₹${totalCollected.toLocaleString()}</div></div></div>
                <div class="highlight-item" style="border-left: 4px solid #f87171;"><div class="highlight-text"><h3>Total Expenses</h3><div style="color: #f87171">₹${expenseTotal.toLocaleString()}</div></div></div>
                <div class="highlight-item" style="border-left: 4px solid var(--accent-primary);"><div class="highlight-text"><h3>Net Cash Flow</h3><div style="color: ${netBalance >= 0 ? 'var(--success)' : '#f87171'}">₹${netBalance.toLocaleString()}</div></div></div>
            </div>

            <div class="dashboard-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
                <div class="console-card">
                    <h3 style="margin-bottom: 20px;">Collection Efficiency</h3>
                    <div style="height: 12px; background: rgba(255,255,255,0.05); border-radius: 6px; overflow: hidden; margin-bottom: 10px;">
                        <div style="height:100%; width:${collectionRate}%; background: var(--success);"></div>
                    </div>
                    <p style="font-size: 0.9rem; color: var(--text-dim)">${collectionRate}% of projected annual revenue collected.</p>
                </div>
                <div class="console-card">
                    <h3 style="margin-bottom: 20px;">Outstanding Balance</h3>
                    <div style="font-size: 2rem; font-weight: 700; color: var(--accent-primary)">₹${(totalReceivable - totalCollected).toLocaleString()}</div>
                    <p style="font-size: 0.9rem; color: var(--text-dim)">Total dues across all registered students.</p>
                </div>
            </div>
        `;
    },

    renderOverview() {
        const container = document.getElementById('fees-content-overview');
        if (!container) return;

        if (!this.dataLoaded) {
            container.innerHTML = `<div class="empty-state"><i data-lucide="loader" style="animation: spin 1s linear infinite;"></i><p>Accessing ledgers...</p></div>`;
            return;
        }

        let html = `
            <table class="console-table">
                <thead><tr><th>Student Name</th><th>Class</th><th>Package</th><th>Total Fee</th><th>Paid</th><th>Balance</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
        `;

        const query = this.searchQuery;
        const sortedIds = Object.keys(this.students)
            .filter(id => {
                const s = this.students[id];
                if (!query) return true;
                return (s.name || '').toLowerCase().includes(query) || (s.admissionForClass || '').toLowerCase().includes(query);
            })
            .sort((a, b) => (this.students[a].name || '').localeCompare(this.students[b].name || ''));

        sortedIds.forEach(id => {
            const s = this.students[id];
            const f = this.fees[id] || { total: 0, paid: 0 };
            const plan = this.plans[f.planId];
            const balance = (f.total || 0) - (f.paid || 0);
            const statusClass = balance <= 0 ? 'status-success' : 'status-warning';

            html += `
                <tr>
                    <td><strong>${s.name}</strong></td>
                    <td>${s.admissionForClass || 'N/A'}</td>
                    <td>${plan ? plan.name : '<span style="color:var(--text-dim)">Custom</span>'}</td>
                    <td>₹${(f.total || 0).toLocaleString()}</td>
                    <td>₹${(f.paid || 0).toLocaleString()}</td>
                    <td><strong style="color: ${balance > 0 ? 'var(--accent-primary)' : 'var(--success)'}">₹${balance.toLocaleString()}</strong></td>
                    <td><span class="status-pill ${statusClass}">${balance <= 0 ? 'Cleared' : 'Due'}</span></td>
                    <td>
                        <div class="table-actions">
                            <button class="btn-icon" onclick="window.feesManager.switchView('student_fees', '${id}')" title="Ledger"><i data-lucide="receipt"></i></button>
                            <button class="btn-icon" onclick="window.feesManager.showSetupFeesForm('${id}')" title="Configure"><i data-lucide="settings"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        });

        if (sortedIds.length === 0) html += `<tr><td colspan="8" style="text-align:center; padding: 40px;">${query ? 'No matching results found.' : 'No student records found.'}</td></tr>`;
        container.innerHTML = html + '</tbody></table>';
    },

    renderTransactions() {
        const container = document.getElementById('fees-content-transactions');
        if (!container) return;

        let html = `<table class="console-table"><thead><tr><th>Date</th><th>Student</th><th>Amount</th><th>Method</th><th>Reference</th><th>Proof</th></tr></thead><tbody>`;

        const query = this.searchQuery;
        const filteredTransactions = this.transactions.filter(t => {
            if (!query) return true;
            const s = this.students[t.studentId] || { name: 'Unknown' };
            return s.name.toLowerCase().includes(query) || (t.method || '').toLowerCase().includes(query) || (t.reference || '').toLowerCase().includes(query);
        });

        filteredTransactions.forEach(t => {
            const s = this.students[t.studentId] || { name: 'Unknown' };
            const date = t.timestamp?.toDate ? t.timestamp.toDate() : new Date(t.timestamp);
            html += `
                <tr>
                    <td>${date.toLocaleDateString()}</td>
                    <td><strong>${s.name}</strong></td>
                    <td><strong style="color:var(--success)">₹${t.amount.toLocaleString()}</strong></td>
                    <td>${t.method}</td>
                    <td><small style="color:var(--text-dim)">${t.reference || '-'}</small></td>
                    <td>${t.attachmentUrl ? `<a href="${t.attachmentUrl}" target="_blank" class="btn-icon"><i data-lucide="external-link"></i></a>` : '-'}</td>
                </tr>
            `;
        });

        if (filteredTransactions.length === 0) html += '<tr><td colspan="6" style="text-align:center; padding: 40px;">No collection history found.</td></tr>';
        container.innerHTML = html + '</tbody></table>';
    },

    renderExpenses() {
        const container = document.getElementById('fees-content-expenses');
        if (!container) return;

        const toolbar = document.getElementById('fees-toolbar');
        if (toolbar) toolbar.innerHTML = `<button class="btn btn-primary" onclick="window.feesManager.showExpenseForm()"><i data-lucide="plus"></i> Log Expense</button>`;

        let html = `<table class="console-table"><thead><tr><th>Date</th><th>Category</th><th>Amount</th><th>Details</th><th>Actions</th></tr></thead><tbody>`;

        const query = this.searchQuery;
        const filteredExpenses = Object.keys(this.expenses)
            .filter(id => {
                const e = this.expenses[id];
                if (!query) return true;
                return (e.category || '').toLowerCase().includes(query) || (e.details || '').toLowerCase().includes(query);
            });

        filteredExpenses.forEach(id => {
            const e = this.expenses[id];
            const date = e.timestamp?.toDate ? e.timestamp.toDate() : new Date(e.timestamp);
            html += `
                <tr>
                    <td>${date.toLocaleDateString()}</td>
                    <td><span class="status-pill status-warning" style="text-transform:uppercase; font-size:0.7rem;">${e.category}</span></td>
                    <td><strong style="color:#f87171">₹${(e.amount || 0).toLocaleString()}</strong></td>
                    <td>${e.details}</td>
                    <td><button class="btn-icon text-danger" onclick="window.feesManager.deleteExpense('${id}')"><i data-lucide="trash-2"></i></button></td>
                </tr>
            `;
        });

        if (filteredExpenses.length === 0) html += '<tr><td colspan="5" style="text-align:center; padding: 40px;">No operational expenses recorded.</td></tr>';
        container.innerHTML = html + '</tbody></table>';
    },

    showExpenseForm() {
        AppDialog.confirm({
            title: 'Log Operational Expense',
            content: `
                <div class="form-group" style="margin-bottom:15px;"><label>Category</label><select id="ef-cat" class="form-control"><option>Salaries</option><option>Utilities</option><option>Maintenance</option><option>Supplies</option><option>Marketing</option><option>Other</option></select></div>
                <div class="form-group" style="margin-bottom:15px;"><label>Amount (₹)</label><input type="number" id="ef-amount" class="form-control" placeholder="0.00"></div>
                <div class="form-group"><label>Expense Details</label><textarea id="ef-details" class="form-control" rows="3"></textarea></div>
            `,
            onConfirm: () => {
                const amount = parseFloat(document.getElementById('ef-amount').value);
                if (!amount || amount <= 0) { AppDialog.toast('Invalid amount', 'error'); return false; }
                const data = {
                    category: document.getElementById('ef-cat').value,
                    amount,
                    details: document.getElementById('ef-details').value,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                };
                firestore.collection('modules').doc('fees_accounting').collection('expenses').add(data);
                return true;
            }
        });
    },

    deleteExpense(id) {
        AppDialog.confirm({ title: 'Delete Expense', content: '<p>Delete this record permanently?</p>', confirmClass: 'btn-danger', onConfirm: () => { 
            firestore.collection('modules').doc('fees_accounting').collection('expenses').doc(id).delete(); 
            return true; 
        }});
    },

    renderStudentFees() {
        const container = document.getElementById('fees-content-student-fees');
        const id = this.activeStudentId;
        if (!container || !id) return;

        const s = this.students[id] || { name: 'Student' };
        const f = this.fees[id] || { total: 0, paid: 0, components: [] };

        let html = `
            <div class="fee-profile-header">
                <h2>${s.name}</h2>
                <p>Comprehensive Fee Ledger</p>
                <div class="highlights" style="margin-top:20px;">
                    <div class="highlight-item" style="border-left: 4px solid var(--accent-secondary);"><h3>Total Payable</h3><div>₹${(f.total || 0).toLocaleString()}</div></div>
                    <div class="highlight-item" style="border-left: 4px solid var(--success);"><h3>Total Paid</h3><div style="color: var(--success)">₹${(f.paid || 0).toLocaleString()}</div></div>
                    <div class="highlight-item" style="border-left: 4px solid var(--accent-primary);"><h3>Balance Due</h3><div style="color: var(--accent-primary)">₹${((f.total || 0) - (f.paid || 0)).toLocaleString()}</div></div>
                </div>
            </div>
        `;

        if (f.components && f.components.length > 0) {
            html += `<div class="section-title" style="margin-top:30px;"><span>Fee Breakdown</span></div><div class="dashboard-grid" style="grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; margin-bottom: 30px;">`;
            f.components.forEach(c => {
                const disc = (c.originalAmount || 0) - (c.amount || 0);
                html += `<div class="console-card" style="padding: 15px;">
                            <div style="color:var(--text-dim); font-size:0.75rem; text-transform:uppercase; font-weight:700;">${c.type}</div>
                            <div style="font-size: 1.25rem; font-weight: 800; margin: 5px 0;">₹${c.amount.toLocaleString()} ${c.frequency === 'monthly' ? `<small style="font-size:0.7rem; font-weight:400;">/mo (${f.billingCycle || 12}m)</small>` : ''}</div>
                            <div style="font-size: 0.85rem;">${c.name}</div>
                            ${disc > 0 ? `<div style="font-size:0.7rem; color:var(--accent-primary); margin-top:5px;">Modified (Waiver: ₹${disc.toLocaleString()})</div>` : ''}
                         </div>`;
            });
            if (f.discount > 0) html += `<div class="console-card" style="padding: 15px; border: 1px dashed var(--accent-primary);"><div style="color:var(--accent-primary); font-size:0.75rem; text-transform:uppercase; font-weight:700;">Additional Global Waiver</div><div style="font-size: 1.25rem; font-weight: 800; margin: 5px 0; color:var(--accent-primary)">- ₹${f.discount.toLocaleString()}</div><div style="font-size: 0.85rem;">${f.discountRemarks || 'Adjustment'}</div></div>`;
            html += `</div>`;
        }

        html += `
            <div class="section-title" style="margin-top:30px; display:flex; justify-content:space-between; align-items:center;">
                <span>Transaction History</span>
                <button class="btn btn-primary btn-sm" onclick="window.feesManager.showPaymentForm('${id}')"><i data-lucide="plus"></i> Add Payment</button>
            </div>
            <table class="console-table"><thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th><th>Proof</th></tr></thead><tbody>`;

        const studentTrans = this.transactions.filter(t => t.studentId === id);
        studentTrans.forEach(t => {
            const date = t.timestamp?.toDate ? t.timestamp.toDate() : new Date(t.timestamp);
            html += `<tr><td>${date.toLocaleDateString()}</td><td><strong>₹${t.amount}</strong></td><td>${t.method}</td><td><small>${t.reference || '-'}</small></td><td>${t.attachmentUrl ? `<a href="${t.attachmentUrl}" target="_blank" class="btn-icon"><i data-lucide="file-text"></i></a>` : '-'}</td></tr>`;
        });
        if (studentTrans.length === 0) html += '<tr><td colspan="5" style="text-align:center; padding: 20px;">No transactions found.</td></tr>';

        html += '</tbody></table>';
        container.innerHTML = html;

        const toolbar = document.getElementById('fees-toolbar');
        if (toolbar) toolbar.innerHTML = `<button class="btn btn-secondary" onclick="window.feesManager.switchView('overview')"><i data-lucide="arrow-left"></i> Back to Ledger</button> <button class="btn btn-primary" onclick="window.feesManager.showSetupFeesForm('${id}')"><i data-lucide="settings"></i> Configure Fees</button>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    showPaymentForm(studentId) {
        const content = `
            <div class="form-group" style="margin-bottom:15px;"><label>Amount (₹)</label><input type="number" id="pf-amount" class="form-control" placeholder="0.00"></div>
            <div class="form-grid-2" style="margin-bottom:15px;">
                <div class="form-group"><label>Method</label><select id="pf-method" class="form-control"><option value="Cash">Cash</option><option value="UPI">UPI / QR</option><option value="Bank Transfer">Bank Transfer</option><option value="Cheque">Cheque</option></select></div>
                <div class="form-group"><label>Reference</label><input type="text" id="pf-ref" class="form-control" placeholder="Trans ID"></div>
            </div>
            <div class="form-group"><label>Upload Proof (Receipt/Screenshot)</label><input type="file" id="pf-file" class="form-control"></div>
            <div class="form-group"><label>Remarks</label><input type="text" id="pf-remarks" class="form-control" placeholder="Optional"></div>
        `;

        AppDialog.confirm({
            title: 'Record Payment',
            content: content,
            onConfirm: () => {
                const amount = parseFloat(document.getElementById('pf-amount').value);
                if (!amount || amount <= 0) { AppDialog.toast('Invalid amount', 'error'); return false; }
                const file = document.getElementById('pf-file').files[0];
                this.savePayment(studentId, {
                    amount,
                    method: document.getElementById('pf-method').value,
                    reference: document.getElementById('pf-ref').value,
                    remarks: document.getElementById('pf-remarks').value
                }, file);
                return true;
            }
        });
    },

    async savePayment(studentId, paymentData, file) {
        try {
            if (file) {
                const storageRef = firebase.storage().ref(`student_fees/${studentId}/${Date.now()}_${file.name}`);
                const snapshot = await storageRef.put(file);
                paymentData.attachmentUrl = await snapshot.ref.getDownloadURL();
            }
            paymentData.studentId = studentId;
            paymentData.timestamp = firebase.firestore.FieldValue.serverTimestamp();
            
            await firestore.collection('modules').doc('fees_accounting').collection('transactions').add(paymentData);

            const currentPaid = this.fees[studentId]?.paid || 0;
            await firestore.collection('modules').doc('fees_accounting').collection('student_fees').doc(studentId).set({
                paid: currentPaid + paymentData.amount
            }, { merge: true });

            AppDialog.toast('Payment successfully verified and recorded', 'success');
        } catch (err) {
            AppDialog.toast('Firestore Error: ' + err.message, 'error');
        }
    },

    renderPlans() {
        const container = document.getElementById('fees-content-plans');
        if (!container) return;
        const toolbar = document.getElementById('fees-toolbar');
        if (toolbar) toolbar.innerHTML = `<button class="btn btn-primary" onclick="window.feesManager.showAddPlanForm()"><i data-lucide="plus"></i> Create Fee Package</button>`;
        if (Object.keys(this.plans).length === 0) { container.innerHTML = '<div class="empty-state"><p>No fee package templates defined yet.</p></div>'; return; }

        let html = `<div class="plans-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 24px;">`;
        Object.keys(this.plans).forEach(id => {
            const p = this.plans[id];
            const cycle = p.billingCycle || 12;
            let annualTotal = 0;
            (p.components || []).forEach(c => annualTotal += c.frequency === 'monthly' ? (c.amount * cycle) : c.amount);

            html += `<div class="console-card">
                        <div style="display:flex; justify-content:space-between; align-items:start;">
                            <div><h3 style="margin:0">${p.name}</h3><div style="font-size:1.1rem; font-weight:800; color:var(--accent-secondary); margin-top:4px;">₹${annualTotal.toLocaleString()} <small style="font-weight:400; font-size:0.75rem; color:var(--text-dim)">/ annual (${cycle}m cycle)</small></div></div>
                            <button class="btn-icon text-danger" onclick="window.feesManager.deletePlan('${id}')"><i data-lucide="trash-2"></i></button>
                        </div>
                        <div style="margin-top:20px;"><div style="font-size:0.75rem; font-weight:700; color:var(--text-dim); text-transform:uppercase; margin-bottom:10px;">Package Components</div><div style="display:flex; flex-direction:column; gap:8px;">${(p.components || []).map(c => `<div style="display:flex; justify-content:space-between; font-size:0.9rem; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.03);"><span>${c.name} <small style="color:var(--text-dim)">(${c.frequency})</small></span><strong>₹${c.amount}</strong></div>`).join('')}</div></div>
                    </div>`;
        });
        container.innerHTML = html + '</div>';
    },

    showAddPlanForm() {
        const renderComponentRow = (c = { name: '', amount: 0, frequency: 'onetime', type: 'tuition' }) => {
            return `<div class="form-row plan-component-row" style="display:grid; grid-template-columns: 2fr 1fr 1fr 1fr 40px; gap:10px; margin-bottom:10px; align-items:center;">
                        <div class="form-group" style="margin:0"><label style="font-size:0.6rem; margin-bottom:2px;">Name</label><input type="text" class="form-control pc-name" placeholder="e.g. Tuition" value="${c.name}" style="height:32px; font-size:0.8rem;"></div>
                        <div class="form-group" style="margin:0"><label style="font-size:0.6rem; margin-bottom:2px;">Type</label><select class="form-control pc-type" style="height:32px; font-size:0.7rem;"><option value="tuition">Tuition</option><option value="lunch">Lunch</option><option value="material">Material</option><option value="transport">Transport</option><option value="other">Other</option></select></div>
                        <div class="form-group" style="margin:0"><label style="font-size:0.6rem; margin-bottom:2px;">Freq.</label><select class="form-control pc-freq" style="height:32px; font-size:0.7rem;"><option value="onetime">One-time</option><option value="monthly">Monthly</option></select></div>
                        <div class="form-group" style="margin:0"><label style="font-size:0.6rem; margin-bottom:2px;">Amount</label><input type="number" class="form-control pc-amount" placeholder="0" value="${c.amount}" style="height:32px; font-weight:700; text-align:right; font-size:0.85rem;"></div>
                        <button class="btn-icon text-danger" onclick="this.parentElement.remove(); window.feesManager.updatePlanTotal();" style="margin-top:15px;"><i data-lucide="trash-2" style="width:14px; height:14px;"></i></button>
                    </div>`;
        };

        AppDialog.confirm({
            title: 'Define Fee Package Template',
            width: '850px',
            content: `
                <div style="display:grid; grid-template-columns: 1fr 180px; gap:20px; align-items:flex-end;">
                    <div class="form-group"><label>Package Name</label><input type="text" id="plan-name" class="form-control" placeholder="e.g. Nursery Standard Package"></div>
                    <div class="form-group"><label>Default Billing Cycle</label><input type="number" id="plan-cycle" class="form-control" value="12" min="1" max="12" style="font-weight:800; text-align:center;"></div>
                </div>
                
                <div class="form-section-title" style="display:flex; justify-content:space-between; align-items:center; margin-top:25px;">
                    <span>Template Components</span>
                    <button class="btn btn-secondary btn-sm" id="add-plan-comp-btn" style="padding:4px 10px; font-size:0.75rem;"><i data-lucide="plus" style="width:14px; height:14px;"></i> Add Item</button>
                </div>
                <div id="plan-components-container" style="max-height:350px; overflow-y:auto; padding-right:10px;">${renderComponentRow()}</div>
                <div style="margin-top:20px; padding:15px; background:rgba(255,255,255,0.05); border-radius:12px; display:flex; justify-content:space-between; align-items:center;"><span style="font-weight:700; font-size:0.9rem;">Calculated Annual Revenue (Per Student):</span><span id="plan-total-display" style="font-size:1.4rem; font-weight:900; color:var(--accent-secondary)">₹0</span></div>
            `,
            onOpen: () => {
                const compContainer = document.getElementById('plan-components-container');
                const cycleInput = document.getElementById('plan-cycle');
                this.updatePlanTotal = () => {
                    let total = 0; const cycle = parseInt(cycleInput.value) || 12;
                    document.querySelectorAll('.plan-component-row').forEach(row => {
                        const amtInput = row.querySelector('.pc-amount'); if (!amtInput) return;
                        const amt = parseFloat(amtInput.value) || 0;
                        const freq = row.querySelector('.pc-freq').value;
                        total += freq === 'monthly' ? (amt * cycle) : amt;
                    });
                    document.getElementById('plan-total-display').innerText = `₹${total.toLocaleString()}`;
                };
                document.getElementById('add-plan-comp-btn').onclick = () => {
                    const div = document.createElement('div'); div.innerHTML = renderComponentRow();
                    const row = div.firstElementChild; compContainer.appendChild(row);
                    row.querySelectorAll('input, select').forEach(el => el.oninput = this.updatePlanTotal);
                    if (window.lucide) window.lucide.createIcons({ root: row });
                    this.updatePlanTotal();
                };
                compContainer.addEventListener('input', this.updatePlanTotal);
                cycleInput.oninput = this.updatePlanTotal;
                this.updatePlanTotal();
            },
            onConfirm: () => {
                const name = document.getElementById('plan-name').value;
                if (!name) { AppDialog.toast('Package name required', 'error'); return false; }
                const components = [];
                document.querySelectorAll('.plan-component-row').forEach(row => {
                    const amtInput = row.querySelector('.pc-amount'); if (!amtInput) return;
                    const amt = parseFloat(amtInput.value) || 0;
                    if (amt >= 0) components.push({ name: row.querySelector('.pc-name').value || 'Fee Item', amount: amt, frequency: row.querySelector('.pc-freq').value, type: row.querySelector('.pc-type').value });
                });
                firestore.collection('modules').doc('fees_accounting').collection('plans').add({ name, components, billingCycle: parseInt(document.getElementById('plan-cycle').value) || 12 });
                return true;
            }
        });
    },

    deletePlan(id) {
        AppDialog.confirm({ title: 'Delete Package', content: '<p>Permanently remove this template?</p>', confirmClass: 'btn-danger', onConfirm: () => { 
            firestore.collection('modules').doc('fees_accounting').collection('plans').doc(id).delete(); 
            return true; 
        }});
    },

    showSetupFeesForm(studentId) {
        const f = this.fees[studentId] || { total: 0, planId: '', components: [], discount: 0, discountRemarks: '', billingCycle: 12 };
        const s = this.students[studentId] || { name: 'Student' };
        
        let planOpts = '<option value="">-- Start from Scratch --</option>';
        Object.keys(this.plans).forEach(pid => planOpts += `<option value="${pid}" ${pid === f.planId ? 'selected' : ''}>${this.plans[pid].name}</option>`);
        
        const renderComponentRows = (components) => {
            return (components || []).map(c => `
                <div class="form-row component-row" style="display:grid; grid-template-columns: 2fr 1fr 1fr 1fr 40px; gap:10px; margin-bottom:15px; align-items:center; background:rgba(255,255,255,0.02); padding:12px; border-radius:12px; border:1px solid rgba(255,255,255,0.05);">
                    <div class="form-group" style="margin:0"><label style="font-size:0.6rem; margin-bottom:2px;">Fee Name</label><input type="text" class="form-control c-name" value="${c.name}" style="font-size:0.85rem; height:32px;"></div>
                    <div class="form-group" style="margin:0"><label style="font-size:0.6rem; margin-bottom:2px;">Original (Plan)</label><div class="c-orig-display" style="font-size:0.85rem; opacity:0.6; padding:6px 0;">₹${(c.originalAmount || c.amount || 0).toLocaleString()}</div><input type="hidden" class="c-orig" value="${c.originalAmount || c.amount || 0}"></div>
                    <div class="form-group" style="margin:0"><label style="font-size:0.6rem; margin-bottom:2px; color:var(--accent-primary);">Waiver</label><div class="c-waiver-display" style="font-size:0.85rem; color:var(--accent-primary); font-weight:700; padding:6px 0;">₹0</div></div>
                    <div class="form-group" style="margin:0"><label style="font-size:0.6rem; margin-bottom:2px;">Payable Amount</label><input type="number" class="form-control c-amount" value="${c.amount}" style="font-size:0.9rem; font-weight:700; height:32px; text-align:right;"></div>
                    <input type="hidden" class="c-type" value="${c.type}">
                    <input type="hidden" class="c-freq" value="${c.frequency}">
                    <button class="btn-icon text-danger" onclick="this.parentElement.remove(); window.feesManager.recalcSetupTotal();" style="width:28px; height:28px; margin-top:15px;"><i data-lucide="x"></i></button>
                </div>
            `).join('');
        };

        const renderNewRow = () => {
            return `<div class="form-row component-row" style="display:grid; grid-template-columns: 2fr 1fr 1fr 1fr 40px; gap:10px; margin-bottom:15px; align-items:center; background:rgba(115, 199, 200, 0.03); padding:12px; border-radius:12px; border:1px dashed var(--accent-secondary);">
                        <div class="form-group" style="margin:0"><label style="font-size:0.6rem; margin-bottom:2px;">Fee Name</label><input type="text" class="form-control c-name" placeholder="Item Name" style="font-size:0.85rem; height:32px;"></div>
                        <div class="form-group" style="margin:0"><label style="font-size:0.6rem; margin-bottom:2px;">Category</label><select class="form-control c-type" style="font-size:0.75rem; height:32px;"><option value="tuition">Tuition</option><option value="lunch">Lunch</option><option value="material">Material</option><option value="transport">Transport</option><option value="other">Other</option></select></div>
                        <div class="form-group" style="margin:0"><label style="font-size:0.6rem; margin-bottom:2px;">Frequency</label><select class="form-control c-freq" style="font-size:0.75rem; height:32px;"><option value="onetime">One-time</option><option value="monthly">Monthly</option></select></div>
                        <div class="form-group" style="margin:0"><label style="font-size:0.6rem; margin-bottom:2px;">Amount (₹)</label><input type="number" class="form-control c-amount" placeholder="0" style="font-size:0.9rem; font-weight:700; height:32px; text-align:right;"></div>
                        <input type="hidden" class="c-orig" value="0">
                        <button class="btn-icon text-danger" onclick="this.parentElement.remove(); window.feesManager.recalcSetupTotal();" style="width:28px; height:28px; margin-top:15px;"><i data-lucide="x"></i></button>
                    </div>`;
        };

        AppDialog.confirm({
            title: `Custom Structure: ${s.name}`,
            width: '1000px',
            content: `
                <div style="display:grid; grid-template-columns: 280px 1fr; gap:30px;">
                    <div style="border-right: 1px solid var(--card-border); padding-right:30px;">
                        <div class="form-section-title" style="margin-top:0;">1. Base Template</div>
                        <div class="form-group" style="margin-bottom:20px;">
                            <label>Apply Fee Package</label>
                            <select id="sf-plan-id" class="form-control" style="border-color:var(--accent-secondary); border-width:2px; height:38px;">${planOpts}</select>
                        </div>
                        <div class="form-group" style="margin-bottom:20px;">
                            <label>Billing Cycle (Mo)</label>
                            <input type="number" id="sf-cycle" class="form-control" value="${f.billingCycle || 12}" min="1" max="12" style="height:38px; text-align:center; font-weight:800;">
                        </div>
                        
                        <div class="form-section-title">2. Global Adjustment</div>
                        <div class="form-group"><label>Additional Discount (₹)</label><input type="number" id="sf-discount" class="form-control" value="${f.discount || 0}"></div>
                        <div class="form-group" style="margin-top:10px;"><label>Reason for Waiver</label><input type="text" id="sf-discount-remarks" class="form-control" value="${f.discountRemarks || ''}" placeholder="e.g. Scholarship / Sibling" style="height:38px; font-size:0.85rem;"></div>
                        
                        <div id="setup-summary-card" style="margin-top:30px; padding:20px; background:var(--sidebar-bg); border-radius:16px; border:1px solid var(--card-border);">
                            <div style="font-size:0.7rem; font-weight:700; color:var(--text-dim); text-transform:uppercase; margin-bottom:15px;">Live Audit</div>
                            <div style="display:flex; justify-content:space-between; margin-bottom:10px; font-size:0.9rem;"><span>Gross Plan Value:</span><span id="sf-gross-display">₹0</span></div>
                            <div style="display:flex; justify-content:space-between; margin-bottom:10px; font-size:0.9rem; color:var(--accent-primary);"><span>Item Waivers:</span><span id="sf-item-waiver-display">- ₹0</span></div>
                            <div style="display:flex; justify-content:space-between; margin-bottom:15px; font-size:0.9rem; color:var(--accent-primary);"><span>Global Disc:</span><span id="sf-discount-display">- ₹0</span></div>
                            <div style="padding-top:15px; border-top:1px solid var(--card-border);">
                                <div style="font-size:0.75rem; color:var(--text-dim);">Net Annual Payable</div>
                                <div id="sf-final-total-display" style="font-size:1.8rem; font-weight:900; color:var(--success);">₹0</div>
                            </div>
                        </div>
                    </div>
                    <div>
                        <div class="form-section-title" style="margin-top:0; display:flex; justify-content:space-between; align-items:center;">
                            <span>3. Customized Components</span>
                            <button class="btn btn-secondary btn-sm" id="add-custom-comp-btn"><i data-lucide="plus"></i> New Item</button>
                        </div>
                        <div id="setup-components-container" style="max-height:450px; overflow-y:auto; padding-right:10px;">
                            ${renderComponentRows(f.components)}
                        </div>
                    </div>
                </div>`,
            onOpen: () => {
                const planSelect = document.getElementById('sf-plan-id'); const compContainer = document.getElementById('setup-components-container'); const discountInput = document.getElementById('sf-discount'); const cycleInput = document.getElementById('sf-cycle');
                
                this.recalcSetupTotal = () => {
                    let grossTotal = 0; let totalItemWaiver = 0;
                    const cycle = parseInt(cycleInput.value) || 12;
                    
                    document.querySelectorAll('.component-row').forEach(row => {
                        const origAmt = parseFloat(row.querySelector('.c-orig').value) || 0;
                        const payableAmt = parseFloat(row.querySelector('.c-amount').value) || 0;
                        const freq = row.querySelector('.c-freq')?.value || row.querySelector('.c-freq-static')?.value || 'onetime';
                        const multiplier = freq === 'monthly' ? cycle : 1;
                        
                        grossTotal += (origAmt || payableAmt) * multiplier;
                        const waiver = Math.max(0, (origAmt - payableAmt) * multiplier);
                        totalItemWaiver += waiver;
                        
                        const wDisplay = row.querySelector('.c-waiver-display');
                        if (wDisplay) wDisplay.innerText = `₹${(origAmt - payableAmt).toLocaleString()}`;
                    });
                    
                    const discount = parseFloat(discountInput.value) || 0;
                    const finalTotal = grossTotal - totalItemWaiver - discount;
                    
                    document.getElementById('sf-gross-display').innerText = `₹${grossTotal.toLocaleString()}`;
                    document.getElementById('sf-item-waiver-display').innerText = `- ₹${totalItemWaiver.toLocaleString()}`;
                    document.getElementById('sf-discount-display').innerText = `- ₹${discount.toLocaleString()}`;
                    document.getElementById('sf-final-total-display').innerText = `₹${finalTotal.toLocaleString()}`;
                    return finalTotal;
                };

                planSelect.onchange = (e) => {
                    const plan = this.plans[e.target.value];
                    if (plan) { 
                        compContainer.innerHTML = renderComponentRows(plan.components.map(c => ({...c, originalAmount: c.amount}))); 
                        cycleInput.value = plan.billingCycle || 12;
                        if (window.lucide) window.lucide.createIcons({ root: compContainer }); 
                        this.recalcSetupTotal(); 
                    }
                };

                document.getElementById('add-custom-comp-btn').onclick = () => {
                    const div = document.createElement('div'); div.innerHTML = renderNewRow(); const row = div.firstElementChild; compContainer.appendChild(row);
                    row.querySelectorAll('input, select').forEach(i => i.oninput = this.recalcSetupTotal); if (window.lucide) window.lucide.createIcons({ root: row }); this.recalcSetupTotal();
                };

                compContainer.addEventListener('input', this.recalcSetupTotal); discountInput.oninput = this.recalcSetupTotal; cycleInput.oninput = this.recalcSetupTotal;
                if (window.lucide) window.lucide.createIcons({ root: compContainer });
                this.recalcSetupTotal();
            },
            onConfirm: () => {
                const components = [];
                document.querySelectorAll('.component-row').forEach(row => {
                    const name = row.querySelector('.c-name').value;
                    const amount = parseFloat(row.querySelector('.c-amount').value) || 0;
                    const originalAmount = parseFloat(row.querySelector('.c-orig').value) || amount;
                    if (name) components.push({ name, amount, originalAmount, type: row.querySelector('.c-type').value, frequency: row.querySelector('.c-freq').value });
                });
                const finalTotal = this.recalcSetupTotal();
                firestore.collection('modules').doc('fees_accounting').collection('student_fees').doc(studentId).set({
                    total: finalTotal, planId: document.getElementById('sf-plan-id').value, billingCycle: parseInt(document.getElementById('sf-cycle').value) || 12, discount: parseFloat(document.getElementById('sf-discount').value) || 0, discountRemarks: document.getElementById('sf-discount-remarks').value, components: components, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true }).then(() => AppDialog.toast('Modified structure saved', 'success'));
                return true;
            }
        });
    }
};
