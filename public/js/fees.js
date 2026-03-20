/**
 * Fees and Accounting Module
 * Handles student fee management, collections, transactions, and expenses
 */

window.feesManager = {
    students: {},
    fees: {},
    plans: {},
    expenses: {},
    isSubscribed: false,
    dataLoaded: false,
    currentView: 'collections', // collections, overview, transactions, expenses, plans, student_fees

    initialize() {
        // Initial setup
    },

    subscribe() {
        if (this.isSubscribed) return;
        this.isSubscribed = true;

        // Subscribe to Students via Centralized Manager
        window.studentDataManager.subscribe();
        window.studentDataManager.onUpdate((data) => {
            this.students = data;
            this.dataLoaded = true;
            this.render();
        });

        // Subscribe to Fees (RTD)
        const feesRef = firebase.database().ref('modules/fees_accounting/student_fees');
        feesRef.on('value', (snapshot) => {
            this.fees = snapshot.val() || {};
            this.render();
        }, (error) => {
            console.error("RTDB Fees Error:", error);
        });

        // Subscribe to Plans (RTD)
        const plansRef = firebase.database().ref('modules/fees_accounting/plans');
        plansRef.on('value', (snapshot) => {
            this.plans = snapshot.val() || {};
            this.render();
        });

        // Subscribe to Expenses (RTD)
        const expensesRef = firebase.database().ref('modules/fees_accounting/expenses');
        expensesRef.on('value', (snapshot) => {
            this.expenses = snapshot.val() || {};
            this.render();
        });
    },

    switchView(viewName, studentId = null) {
        this.currentView = viewName;
        this.activeStudentId = studentId;

        // Update URL hash
        let hash = `fees/${viewName}`;
        if (studentId) hash += `/${studentId}`;
        window.location.hash = hash;

        // Update Sidebar
        document.querySelectorAll('#sidebar-nav-fees .nav-item').forEach(el => el.classList.remove('active'));
        const activeNav = document.getElementById(`nav-fees-${viewName}`);
        if (activeNav) activeNav.classList.add('active');

        // Update View Containers
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

        const subtitle = document.getElementById('fees-screen-subtitle');
        
        // Granular Sidebar Visibility
        const setNavVisible = (id, visible) => {
            const el = document.getElementById(id);
            if (el) el.style.display = visible ? 'flex' : 'none';
        };

        setNavVisible('nav-fees-collections', isMaster || perms === true || perms.view);
        setNavVisible('nav-fees-overview', isMaster || perms === true || perms.ledger);
        setNavVisible('nav-fees-transactions', isMaster || perms === true || perms.transactions);
        setNavVisible('nav-fees-expenses', isMaster || perms === true || perms.expenses);
        setNavVisible('nav-fees-plans', isMaster || perms === true || perms.config);

        // Clear Toolbar
        const toolbar = document.getElementById('fees-toolbar');
        if (toolbar) toolbar.innerHTML = '';

        if (this.currentView === 'collections') {
            this.renderCollections();
        } else if (this.currentView === 'overview') {
            this.renderOverview();
        } else if (this.currentView === 'transactions') {
            this.renderTransactions();
        } else if (this.currentView === 'expenses') {
            this.renderExpenses();
        } else if (this.currentView === 'student_fees') {
            this.renderStudentFees();
        } else if (this.currentView === 'plans') {
            this.renderPlans();
        }

        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    renderCollections() {
        const container = document.getElementById('fees-content-collections');
        if (!container) return;

        // Calculate Totals
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
                    <div class="highlight-text">
                        <h3>Expected Revenue</h3>
                        <div>₹${totalReceivable.toLocaleString()}</div>
                    </div>
                </div>
                <div class="highlight-item" style="border-left: 4px solid var(--success);">
                    <div class="highlight-text">
                        <h3>Total Collected</h3>
                        <div style="color: var(--success)">₹${totalCollected.toLocaleString()}</div>
                    </div>
                </div>
                <div class="highlight-item" style="border-left: 4px solid #f87171;">
                    <div class="highlight-text">
                        <h3>Total Expenses</h3>
                        <div style="color: #f87171">₹${expenseTotal.toLocaleString()}</div>
                    </div>
                </div>
                <div class="highlight-item" style="border-left: 4px solid var(--accent-primary);">
                    <div class="highlight-text">
                        <h3>Net Cash Flow</h3>
                        <div style="color: ${netBalance >= 0 ? 'var(--success)' : '#f87171'}">₹${netBalance.toLocaleString()}</div>
                    </div>
                </div>
            </div>

            <div class="dashboard-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
                <div class="console-card">
                    <h3 style="margin-bottom: 20px;">Collection Efficiency</h3>
                    <div style="height: 12px; background: rgba(255,255,255,0.05); border-radius: 6px; overflow: hidden; margin-bottom: 10px;">
                        <div style="height:100%; width:${collectionRate}%; background: var(--success);"></div>
                    </div>
                    <p style="font-size: 0.9rem; color: var(--text-dim)">${collectionRate}% of total fees have been collected to date.</p>
                </div>
                <div class="console-card">
                    <h3 style="margin-bottom: 20px;">Pending Receivables</h3>
                    <div style="font-size: 2rem; font-weight: 700; color: var(--accent-primary)">₹${(totalReceivable - totalCollected).toLocaleString()}</div>
                    <p style="font-size: 0.9rem; color: var(--text-dim)">Outstanding amount from ${Object.keys(this.students).length} students.</p>
                </div>
            </div>
        `;
    },

    renderOverview() {
        const container = document.getElementById('fees-content-overview');
        if (!container) return;

        if (!this.dataLoaded) {
            container.innerHTML = `<div class="empty-state"><i data-lucide="loader" style="animation: spin 1s linear infinite;"></i><p>Loading records...</p></div>`;
            return;
        }

        let html = `
            <table class="console-table">
                <thead>
                    <tr>
                        <th>Student Name</th>
                        <th>Class</th>
                        <th>Plan</th>
                        <th>Total Fee</th>
                        <th>Paid</th>
                        <th>Balance</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
        `;

        const sortedIds = Object.keys(this.students).sort((a, b) => (this.students[a].name || '').localeCompare(this.students[b].name || ''));

        sortedIds.forEach(id => {
            const s = this.students[id];
            const f = this.fees[id] || { total: 0, paid: 0 };
            const plan = this.plans[f.planId]?.name || 'No Plan';
            const balance = (f.total || 0) - (f.paid || 0);
            const statusClass = balance <= 0 ? 'status-success' : 'status-warning';

            html += `
                <tr>
                    <td><strong>${s.name || 'N/A'}</strong></td>
                    <td>${s.admissionForClass || 'N/A'}</td>
                    <td>${plan}</td>
                    <td>₹${f.total || 0}</td>
                    <td>₹${f.paid || 0}</td>
                    <td style="color: ${balance > 0 ? 'var(--accent-primary)' : 'inherit'}">₹${balance}</td>
                    <td><span class="status-pill ${statusClass}">${balance <= 0 ? 'Paid' : 'Pending'}</span></td>
                    <td>
                        <button class="btn btn-secondary btn-sm" onclick="window.feesManager.switchView('student_fees', '${id}')">
                            <i data-lucide="receipt"></i> Details
                        </button>
                    </td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        container.innerHTML = html;
    },

    renderTransactions() {
        const container = document.getElementById('fees-content-transactions');
        if (!container) return;

        let allTransactions = [];
        Object.keys(this.fees).forEach(studentId => {
            const s = this.students[studentId] || { name: 'Unknown' };
            const trans = this.fees[studentId].transactions || {};
            Object.keys(trans).forEach(tid => {
                allTransactions.push({
                    ...trans[tid],
                    studentName: s.name,
                    studentId: studentId,
                    id: tid
                });
            });
        });

        allTransactions.sort((a, b) => b.timestamp - a.timestamp);

        let html = `
            <div style="margin-bottom: 20px; display:flex; justify-content:space-between; align-items:center;">
                <h2>Global Fee Transactions</h2>
            </div>
            <table class="console-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Student</th>
                        <th>Amount</th>
                        <th>Method</th>
                        <th>Reference</th>
                        <th>Attach</th>
                    </tr>
                </thead>
                <tbody>
        `;

        allTransactions.forEach(t => {
            const attachLink = t.attachmentUrl ? `<a href="${t.attachmentUrl}" target="_blank" class="btn-icon"><i data-lucide="file-text"></i></a>` : '-';
            html += `
                <tr>
                    <td>${new Date(t.timestamp).toLocaleDateString()}</td>
                    <td>${t.studentName}</td>
                    <td style="color:var(--success); font-weight:700;">₹${t.amount}</td>
                    <td>${t.method}</td>
                    <td><small>${t.reference || '-'}</small></td>
                    <td>${attachLink}</td>
                </tr>
            `;
        });

        if (allTransactions.length === 0) html += '<tr><td colspan="6" style="text-align:center; padding: 40px;">No transactions recorded.</td></tr>';

        html += '</tbody></table>';
        container.innerHTML = html;
    },

    renderExpenses() {
        const container = document.getElementById('fees-content-expenses');
        if (!container) return;

        const toolbar = document.getElementById('fees-toolbar');
        if (toolbar) {
            toolbar.innerHTML = `
                <button class="btn btn-primary" onclick="window.feesManager.showAddExpenseForm()">
                    <i data-lucide="plus"></i> Log New Expense
                </button>
            `;
        }

        let html = `
            <div style="margin-bottom: 20px;">
                <h2>Expense Management</h2>
                <p style="color: var(--text-dim)">Track and categorize all school operational costs.</p>
            </div>
            <table class="console-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Category</th>
                        <th>Description</th>
                        <th>Amount</th>
                        <th>Ref</th>
                        <th>Attach</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
        `;

        const sortedExpenses = Object.keys(this.expenses).sort((a, b) => b.localeCompare(a));

        sortedExpenses.forEach(id => {
            const e = this.expenses[id];
            const attachLink = e.attachmentUrl ? `<a href="${e.attachmentUrl}" target="_blank" class="btn-icon"><i data-lucide="file-text"></i></a>` : '-';
            html += `
                <tr>
                    <td>${e.date}</td>
                    <td><span class="status-pill status-none">${e.category}</span></td>
                    <td>${e.description}</td>
                    <td style="color:#f87171; font-weight:700;">₹${e.amount}</td>
                    <td><small>${e.reference || '-'}</small></td>
                    <td>${attachLink}</td>
                    <td>
                        <button class="btn-icon text-danger" onclick="window.feesManager.deleteExpense('${id}')">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        if (sortedExpenses.length === 0) html += '<tr><td colspan="7" style="text-align:center; padding: 40px;">No expenses logged.</td></tr>';

        html += '</tbody></table>';
        container.innerHTML = html;
    },

    showAddExpenseForm() {
        const content = `
            <div class="form-group" style="margin-bottom:15px;">
                <label>Description / Vendor</label>
                <input type="text" id="ex-desc" class="form-control" placeholder="Electricity Bill, Stationery, etc.">
            </div>
            <div class="form-grid-2" style="margin-bottom:15px;">
                <div class="form-group">
                    <label>Amount (₹)</label>
                    <input type="number" id="ex-amount" class="form-control" placeholder="0.00">
                </div>
                <div class="form-group">
                    <label>Category</label>
                    <select id="ex-cat" class="form-control">
                        <option value="Utilities">Utilities</option>
                        <option value="Salaries">Salaries</option>
                        <option value="Maintenance">Maintenance</option>
                        <option value="Stationery">Stationery</option>
                        <option value="Marketing">Marketing</option>
                        <option value="Others">Others</option>
                    </select>
                </div>
            </div>
            <div class="form-grid-2" style="margin-bottom:15px;">
                <div class="form-group">
                    <label>Date</label>
                    <input type="date" id="ex-date" class="form-control" value="${new Date().toISOString().split('T')[0]}">
                </div>
                <div class="form-group">
                    <label>Reference #</label>
                    <input type="text" id="ex-ref" class="form-control" placeholder="Bill No, Trans ID">
                </div>
            </div>
            <div class="form-group">
                <label>Upload Receipt / Proof</label>
                <input type="file" id="ex-file" class="form-control">
            </div>
        `;

        AppDialog.confirm({
            title: 'Log School Expense',
            content: content,
            confirmText: 'Record Expense',
            onConfirm: () => {
                const data = {
                    description: document.getElementById('ex-desc').value,
                    amount: parseFloat(document.getElementById('ex-amount').value),
                    category: document.getElementById('ex-cat').value,
                    date: document.getElementById('ex-date').value,
                    reference: document.getElementById('ex-ref').value,
                };

                if (!data.description || isNaN(data.amount)) {
                    AppDialog.toast('Valid description and amount required', 'error');
                    return false;
                }

                const file = document.getElementById('ex-file').files[0];
                this.saveExpense(data, file);
                return true;
            }
        });
    },

    async saveExpense(data, file) {
        try {
            if (file) {
                const storageRef = firebase.storage().ref(`expenses/${Date.now()}_${file.name}`);
                const snapshot = await storageRef.put(file);
                data.attachmentUrl = await snapshot.ref.getDownloadURL();
            }
            await firebase.database().ref('modules/fees_accounting/expenses').push(data);
            AppDialog.toast('Expense recorded successfully', 'success');
        } catch (err) {
            AppDialog.toast('Error saving expense: ' + err.message, 'error');
        }
    },

    deleteExpense(id) {
        AppDialog.confirm({
            title: 'Delete Expense',
            content: '<p>Are you sure you want to delete this expense log?</p>',
            confirmClass: 'btn-danger',
            onConfirm: () => {
                firebase.database().ref(`modules/fees_accounting/expenses/${id}`).remove();
                return true;
            }
        });
    },

    renderStudentFees() {
        const id = this.activeStudentId;
        const container = document.getElementById('fees-content-student-fees');
        if (!container || !id) return;

        const s = this.students[id];
        const f = this.fees[id] || { total: 0, paid: 0, transactions: {} };
        if (!s) return;

        const plan = this.plans[f.planId];

        let html = `
            <div class="fee-profile-header">
                <h2>${s.name} - Fee Statement</h2>
                <p>${s.admissionForClass} | Parent: ${s.fatherName || s.motherName}</p>
                <p><strong>Plan:</strong> ${plan ? plan.name : 'No Plan Assigned'}</p>
            </div>

            <div class="highlights" style="margin-top: 20px;">
                <div class="highlight-item" style="border-left: 4px solid var(--accent-secondary);">
                    <div class="highlight-text"><h3>Total Fees</h3><div>₹${f.total || 0}</div></div>
                </div>
                <div class="highlight-item" style="border-left: 4px solid var(--success);">
                    <div class="highlight-text"><h3>Total Paid</h3><div style="color: var(--success)">₹${f.paid || 0}</div></div>
                </div>
                <div class="highlight-item" style="border-left: 4px solid var(--accent-primary);">
                    <div class="highlight-text"><h3>Balance Due</h3><div style="color: var(--accent-primary)">₹${(f.total || 0) - (f.paid || 0)}</div></div>
                </div>
            </div>
        `;

        if (plan && f.total > 0) {
            html += `<div class="section-title" style="margin-top:30px;"><span>Installment Breakdown</span></div><div class="installments-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 15px; margin-bottom: 30px;">`;
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            let runningPaid = f.paid || 0;
            plan.installments.forEach(inst => {
                const amount = (f.total * inst.percentage) / 100;
                const paidForThis = Math.min(amount, runningPaid);
                runningPaid -= paidForThis;
                const isPaid = paidForThis >= amount;
                const statusClass = isPaid ? 'status-success' : (paidForThis > 0 ? 'status-warning' : 'status-danger');
                html += `<div class="console-card" style="padding: 15px;"><div style="display:flex; justify-content:space-between;"><h4 style="margin:0">${inst.name}</h4><small style="color:var(--text-dim)">${inst.dueMonth !== undefined ? monthNames[inst.dueMonth] : ''}</small></div><div style="font-size: 1.2rem; font-weight: bold; margin: 10px 0;">₹${amount.toFixed(0)}</div><div style="display:flex; justify-content:space-between; align-items:center;"><span class="status-pill ${statusClass}" style="font-size: 0.7rem;">${isPaid ? 'Paid' : (paidForThis > 0 ? 'Partial' : 'Pending')}</span><span style="font-size: 0.8rem; color: var(--text-dim)">Paid: ₹${paidForThis.toFixed(0)}</span></div></div>`;
            });
            html += `</div>`;
        }

        html += `
            <div class="section-title" style="margin-top:30px; display:flex; justify-content:space-between; align-items:center;">
                <span>Transaction History</span>
                <button class="btn btn-primary btn-sm" onclick="window.feesManager.showPaymentForm('${id}')"><i data-lucide="plus"></i> Add Payment</button>
            </div>
            <table class="console-table">
                <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th><th>Attachment</th></tr></thead>
                <tbody>
        `;

        const trans = f.transactions || {};
        const sortedTrans = Object.keys(trans).sort((a, b) => trans[b].timestamp - trans[a].timestamp);
        sortedTrans.forEach(tid => {
            const t = trans[tid];
            html += `<tr><td>${new Date(t.timestamp).toLocaleDateString()}</td><td><strong>₹${t.amount}</strong></td><td>${t.method}</td><td><small>${t.reference || '-'}</small></td><td>${t.attachmentUrl ? `<a href="${t.attachmentUrl}" target="_blank" class="btn-icon"><i data-lucide="file-text"></i></a>` : '-'}</td></tr>`;
        });
        if (sortedTrans.length === 0) html += '<tr><td colspan="5" style="text-align:center; padding: 20px;">No transactions.</td></tr>';

        html += '</tbody></table>';
        container.innerHTML = html;
        
        const toolbar = document.getElementById('fees-toolbar');
        if (toolbar) {
            toolbar.innerHTML = `<button class="btn btn-secondary" onclick="window.feesManager.switchView('overview')"><i data-lucide="arrow-left"></i> Back to Ledger</button>
                <button class="btn btn-primary" onclick="window.feesManager.showSetupFeesForm('${id}')"><i data-lucide="settings"></i> Setup Fees</button>`;
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    showPaymentForm(studentId) {
        const content = `
            <div class="form-group" style="margin-bottom:15px;"><label>Amount (₹)</label><input type="number" id="pf-amount" class="form-control" placeholder="0.00"></div>
            <div class="form-grid-2" style="margin-bottom:15px;">
                <div class="form-group"><label>Method</label><select id="pf-method" class="form-control"><option value="Cash">Cash</option><option value="UPI">UPI / QR</option><option value="Bank Transfer">Bank Transfer</option><option value="Cheque">Cheque</option></select></div>
                <div class="form-group"><label>Reference</label><input type="text" id="pf-ref" class="form-control" placeholder="Trans ID"></div>
            </div>
            <div class="form-group"><label>Upload Proof (Bank Statement/Receipt)</label><input type="file" id="pf-file" class="form-control"></div>
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
            paymentData.timestamp = firebase.database.ServerValue.TIMESTAMP;
            const transRef = firebase.database().ref(`modules/fees_accounting/student_fees/${studentId}/transactions`).push();
            await transRef.set(paymentData);
            
            const currentPaid = this.fees[studentId]?.paid || 0;
            await firebase.database().ref(`modules/fees_accounting/student_fees/${studentId}/paid`).set(currentPaid + paymentData.amount);
            AppDialog.toast('Payment recorded', 'success');
        } catch (err) {
            AppDialog.toast('Error: ' + err.message, 'error');
        }
    },

    renderPlans() {
        const container = document.getElementById('fees-content-plans');
        if (!container) return;
        const toolbar = document.getElementById('fees-toolbar');
        if (toolbar) toolbar.innerHTML = `<button class="btn btn-primary" onclick="window.feesManager.showAddPlanForm()"><i data-lucide="plus"></i> Create New Plan</button>`;
        if (Object.keys(this.plans).length === 0) { container.innerHTML = '<div class="empty-state"><p>No fee plans defined.</p></div>'; return; }
        
        let html = `<div class="plans-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px;">`;
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        Object.keys(this.plans).forEach(id => {
            const p = this.plans[id];
            html += `<div class="console-card"><div style="display:flex; justify-content:space-between; align-items:start;"><h3>${p.name}</h3><button class="btn-icon text-danger" onclick="window.feesManager.deletePlan('${id}')"><i data-lucide="trash-2"></i></button></div><ul style="list-style: none; padding: 0; margin-top: 10px;">`;
            (p.installments || []).forEach(inst => {
                html += `<li style="padding: 8px 0; border-top: 1px solid var(--border-subtle); display:flex; justify-content:space-between;"><span>${inst.name} <small>(${inst.dueMonth !== undefined ? monthNames[inst.dueMonth] : ''})</small></span><span>${inst.percentage}%</span></li>`;
            });
            html += `</ul></div>`;
        });
        container.innerHTML = html + '</div>';
    },

    showAddPlanForm() {
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const renderFields = (count) => {
            let f = '';
            for (let i = 0; i < count; i++) {
                let opts = ''; monthNames.forEach((m, idx) => opts += `<option value="${idx}">${m}</option>`);
                f += `<div class="form-row" style="display:flex; gap:10px; margin-bottom:10px;"><input type="text" id="inst-name-${i}" class="form-control" placeholder="Name" style="flex:2"><select id="inst-month-${i}" class="form-control" style="flex:1.5">${opts}</select><input type="number" id="inst-pct-${i}" class="form-control" value="${Math.floor(100/count)}" style="flex:1"></div>`;
            }
            return f;
        };
        AppDialog.confirm({
            title: 'Create Fee Plan',
            content: `<div class="form-group"><label>Plan Name</label><input type="text" id="plan-name" class="form-control"></div><div class="form-group"><label>Installments</label><input type="number" id="plan-inst-count" class="form-control" value="3" min="1" max="12"></div><div id="inst-fields-container">${renderFields(3)}</div>`,
            onOpen: () => document.getElementById('plan-inst-count').onchange = (e) => document.getElementById('inst-fields-container').innerHTML = renderFields(parseInt(e.target.value)),
            onConfirm: () => {
                const name = document.getElementById('plan-name').value;
                const count = parseInt(document.getElementById('plan-inst-count').value);
                const installments = []; let total = 0;
                for (let i = 0; i < count; i++) {
                    const p = parseInt(document.getElementById(`inst-pct-${i}`).value) || 0;
                    installments.push({ name: document.getElementById(`inst-name-${i}`).value || `Inst ${i+1}`, percentage: p, dueMonth: parseInt(document.getElementById(`inst-month-${i}`).value) });
                    total += p;
                }
                if (total !== 100) { AppDialog.toast('Total must be 100%', 'error'); return false; }
                firebase.database().ref('modules/fees_accounting/plans').push({ name, installments });
                return true;
            }
        });
    },

    deletePlan(id) {
        AppDialog.confirm({ title: 'Delete Plan', content: '<p>Are you sure?</p>', confirmClass: 'btn-danger', onConfirm: () => { firebase.database().ref(`modules/fees_accounting/plans/${id}`).remove(); return true; } });
    },

    showSetupFeesForm(studentId) {
        const currentTotal = this.fees[studentId]?.total || 0;
        const currentPlanId = this.fees[studentId]?.planId || '';
        let opts = '<option value="">-- No Plan --</option>';
        Object.keys(this.plans).forEach(pid => opts += `<option value="${pid}" ${pid === currentPlanId ? 'selected' : ''}>${this.plans[pid].name}</option>`);
        AppDialog.confirm({
            title: 'Configure Student Fees',
            content: `<div class="form-group"><label>Total Annual Fee (₹)</label><input type="number" id="sf-total" class="form-control" value="${currentTotal}"></div><div class="form-group"><label>Fee Plan</label><select id="sf-plan-id" class="form-control">${opts}</select></div>`,
            onConfirm: () => {
                const updates = { [`modules/fees_accounting/student_fees/${studentId}/total`]: parseFloat(document.getElementById('sf-total').value) || 0, [`modules/fees_accounting/student_fees/${studentId}/planId`]: document.getElementById('sf-plan-id').value };
                firebase.database().ref().update(updates).then(() => AppDialog.toast('Updated', 'success'));
                return true;
            }
        });
    }
};
