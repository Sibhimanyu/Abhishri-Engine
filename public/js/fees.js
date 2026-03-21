/**
 * Fees and Accounting Module - Firestore Edition
 * Handles student fee management, collections, transactions, and expenses using Cloud Firestore
 */

window.feesManager = {
    students: {},
    staff: {},
    fees: {},
    plans: {},
    expenses: [],
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

        // 1. Subscribe to Students
        window.studentDataManager.subscribe();
        window.studentDataManager.onUpdate((data) => {
            this.students = data;
            this.render();
        });

        // 2. Subscribe to Staff (for Expense/Wallet management)
        firestore.collection('modules').doc('staff_directory').collection('staff')
            .onSnapshot((snapshot) => {
                const staffData = {};
                snapshot.forEach(doc => staffData[doc.id] = { id: doc.id, ...doc.data() });
                this.staff = staffData;
                this.dataLoaded = true;
                this.render();
            });

        // 3. Subscribe to Fee Summaries
        firestore.collection('modules').doc('fees_accounting').collection('student_fees')
            .onSnapshot((snapshot) => {
                const feesData = {};
                snapshot.forEach(doc => feesData[doc.id] = doc.data());
                this.fees = feesData;
                this.render();
            }, (error) => console.error("Firestore Fees Error:", error));

        // 4. Subscribe to Global Transactions
        firestore.collection('modules').doc('fees_accounting').collection('transactions')
            .orderBy('timestamp', 'desc').limit(100)
            .onSnapshot((snapshot) => {
                const trans = [];
                snapshot.forEach(doc => trans.push({ id: doc.id, ...doc.data() }));
                this.transactions = trans;
                this.render();
            });

        // 5. Subscribe to Fee Packages
        firestore.collection('modules').doc('fees_accounting').collection('plans')
            .onSnapshot((snapshot) => {
                const plansData = {};
                snapshot.forEach(doc => plansData[doc.id] = doc.data());
                this.plans = plansData;
                this.render();
            });

        // 6. Subscribe to Expenses
        firestore.collection('modules').doc('fees_accounting').collection('expenses')
            .orderBy('timestamp', 'desc')
            .onSnapshot((snapshot) => {
                const exp = [];
                snapshot.forEach(doc => exp.push({ id: doc.id, ...doc.data() }));
                this.expenses = exp;
                this.render();
            });
    },

    switchView(viewName, studentId = null) {
        this.currentView = viewName;
        this.activeStudentId = studentId;
        let hash = `fees/${viewName}`;
        if (studentId) hash += `/${studentId}`;
        
        if (window.location.hash !== `#${hash}`) {
            window.location.hash = hash;
        }

        const subtitle = document.getElementById('fees-screen-subtitle');
        if (subtitle) {
            if (['collections', 'overview', 'transactions', 'plans', 'student_fees'].includes(viewName)) {
                subtitle.innerText = 'Revenue & Fee Management';
            } else if (viewName === 'expenses') {
                subtitle.innerText = 'Operational Expense Tracking';
            }
        }

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
        const toolbar = document.getElementById('fees-toolbar');
        if (toolbar) {
            toolbar.innerHTML = '';
            if (['overview', 'expenses', 'plans', 'transactions'].includes(this.currentView)) {
                const searchContainer = document.createElement('div');
                searchContainer.className = 'search-box';
                searchContainer.style.maxWidth = '400px';
                searchContainer.style.marginRight = 'auto';
                searchContainer.innerHTML = `<i data-lucide="search"></i><input type="text" placeholder="Search records..." value="${this.searchQuery || ''}">`;
                const searchInput = searchContainer.querySelector('input');
                searchInput.oninput = (e) => { this.searchQuery = e.target.value.toLowerCase(); this.renderContentOnly(); };
                toolbar.appendChild(searchContainer);
            }
        }

        if (this.currentView === 'collections') this.renderCollections();
        else if (this.currentView === 'overview') this.renderOverview();
        else if (this.currentView === 'transactions') this.renderTransactions();
        else if (this.currentView === 'expenses') this.renderExpenses();
        else if (this.currentView === 'student_fees') this.renderStudentFees();
        else if (this.currentView === 'plans') this.renderPlans();

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
        let totalRev = 0, totalCol = 0, totalExp = 0;
        Object.values(this.fees).forEach(f => { totalRev += (f.total || 0); totalCol += (f.paid || 0); });
        this.expenses.forEach(e => { if(e.type === 'spend') totalExp += (e.amount || 0); });
        const rate = totalRev > 0 ? Math.round((totalCol / totalRev) * 100) : 0;
        const net = totalCol - totalExp;

        container.innerHTML = `
            <div class="highlights" style="margin-bottom: 30px;">
                <div class="highlight-item" style="border-left: 4px solid var(--accent-secondary);"><div class="highlight-text"><h3>Expected Revenue</h3><div>₹${totalRev.toLocaleString()}</div></div></div>
                <div class="highlight-item" style="border-left: 4px solid var(--success);"><div class="highlight-text"><h3>Total Collected</h3><div style="color: var(--success)">₹${totalCol.toLocaleString()}</div></div></div>
                <div class="highlight-item" style="border-left: 4px solid #f87171;"><div class="highlight-text"><h3>Total Expenses</h3><div style="color: #f87171">₹${totalExp.toLocaleString()}</div></div></div>
                <div class="highlight-item" style="border-left: 4px solid var(--accent-primary);"><div class="highlight-text"><h3>Net Cash Flow</h3><div style="color: ${net >= 0 ? 'var(--success)' : '#f87171'}">₹${net.toLocaleString()}</div></div></div>
            </div>
            <div class="dashboard-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
                <div class="console-card"><h3>Collection Efficiency</h3><div style="height: 12px; background: rgba(255,255,255,0.05); border-radius: 6px; overflow: hidden; margin: 15px 0;"><div style="height:100%; width:${rate}%; background: var(--success);"></div></div><p style="font-size: 0.9rem; color: var(--text-dim)">${rate}% of annual revenue collected.</p></div>
                <div class="console-card"><h3>Outstanding Dues</h3><div style="font-size: 2rem; font-weight: 700; color: var(--accent-primary)">₹${(totalRev - totalCol).toLocaleString()}</div><p style="font-size: 0.9rem; color: var(--text-dim)">Remaining balance across all students.</p></div>
            </div>`;
    },

    renderOverview() {
        const container = document.getElementById('fees-content-overview');
        if (!container || !this.dataLoaded) return;
        let html = `<table class="console-table"><thead><tr><th>Student Name</th><th>Class</th><th>Package</th><th>Total Fee</th><th>Paid</th><th>Balance</th><th>Status</th><th>Actions</th></tr></thead><tbody>`;
        const q = this.searchQuery;
        const sortedIds = Object.keys(this.students).filter(id => {
            const s = this.students[id];
            return !q || (s.name || '').toLowerCase().includes(q) || (s.admissionForClass || '').toLowerCase().includes(q);
        }).sort((a, b) => (this.students[a].name || '').localeCompare(this.students[b].name || ''));

        sortedIds.forEach(id => {
            const s = this.students[id], f = this.fees[id] || { total: 0, paid: 0 }, p = this.plans[f.planId], bal = (f.total || 0) - (f.paid || 0);
            html += `<tr onclick="window.feesManager.switchView('student_fees', '${id}')" style="cursor:pointer;" class="clickable-row">
                <td><strong>${s.name}</strong></td><td>${s.admissionForClass || 'N/A'}</td><td>${p ? p.name : '<span style="color:var(--text-dim)">Custom</span>'}</td>
                <td>₹${(f.total || 0).toLocaleString()}</td><td>₹${(f.paid || 0).toLocaleString()}</td>
                <td><strong style="color: ${bal > 0 ? 'var(--accent-primary)' : 'var(--success)'}">₹${bal.toLocaleString()}</strong></td>
                <td><span class="status-pill ${bal <= 0 ? 'status-success' : 'status-warning'}">${bal <= 0 ? 'Cleared' : 'Due'}</span></td>
                <td><div class="table-actions" onclick="event.stopPropagation()"><button class="btn-icon" onclick="window.feesManager.showSetupFeesForm('${id}')"><i data-lucide="settings"></i></button></div></td></tr>`;
        });
        container.innerHTML = html + (sortedIds.length === 0 ? `<tr><td colspan="8" style="text-align:center; padding: 40px;">No results found.</td></tr>` : '') + '</tbody></table>';
    },

    renderTransactions() {
        const container = document.getElementById('fees-content-transactions');
        if (!container) return;
        let html = `<table class="console-table"><thead><tr><th>Date & Time</th><th>Student</th><th>Amount</th><th>Method</th><th>Reference</th><th style="text-align:right">Actions</th></tr></thead><tbody>`;
        const q = this.searchQuery;
        const filtered = this.transactions.filter(t => {
            if (!q) return true;
            const s = this.students[t.studentId] || { name: 'Unknown' };
            return s.name.toLowerCase().includes(q) || (t.method || '').toLowerCase().includes(q) || (t.reference || '').toLowerCase().includes(q);
        });

        filtered.forEach(t => {
            const s = this.students[t.studentId] || { name: 'Unknown' }, d = t.timestamp?.toDate ? t.timestamp.toDate() : new Date(t.timestamp);
            html += `<tr><td><div style="font-weight:600;">${d.toLocaleDateString()}</div><div style="font-size:0.7rem; opacity:0.6;">${d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div></td>
                <td><strong>${s.name}</strong></td><td><strong style="color:var(--success)">₹${t.amount.toLocaleString()}</strong></td><td>${t.method}</td><td><small>${t.reference || '-'}</small></td>
                <td><div class="table-actions" style="justify-content:flex-end"><button class="btn-icon" onclick="window.feesManager.printTransactionReceipt('${t.id}')"><i data-lucide="printer"></i></button><button class="btn-icon text-danger" onclick="window.feesManager.deleteTransaction('${t.id}', '${t.studentId}', ${t.amount})"><i data-lucide="trash-2"></i></button></div></td></tr>`;
        });
        container.innerHTML = html + (filtered.length === 0 ? '<tr><td colspan="6" style="text-align:center; padding: 40px;">No collection history.</td></tr>' : '') + '</tbody></table>';
    },

    renderExpenses() {
        const container = document.getElementById('fees-content-expenses');
        if (!container) return;
        const toolbar = document.getElementById('fees-toolbar');
        if (toolbar) {
            toolbar.innerHTML = '';
            const search = document.createElement('div'); search.className='search-box'; search.style.maxWidth='350px'; search.style.marginRight='auto';
            search.innerHTML=`<i data-lucide="search"></i><input type="text" placeholder="Search logs..." value="${this.searchQuery}">`;
            search.querySelector('input').oninput=(e)=>{this.searchQuery=e.target.value.toLowerCase(); this.renderExpenses();};
            toolbar.appendChild(search);
            const fundBtn = document.createElement('button'); fundBtn.className='btn btn-secondary'; fundBtn.innerHTML='<i data-lucide="coins"></i> Fund Staff'; fundBtn.onclick=()=>this.showFundingForm(); toolbar.appendChild(fundBtn);
            const spendBtn = document.createElement('button'); spendBtn.className='btn btn-primary'; spendBtn.innerHTML='<i data-lucide="shopping-cart"></i> Log Spend'; spendBtn.onclick=()=>this.showSpendForm(); toolbar.appendChild(spendBtn);
        }

        let walletsHtml = `<div class="section-title"><span>Staff Imprest Wallets</span></div><div class="dashboard-grid" style="grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; margin-bottom: 40px;">`;
        Object.keys(this.staff).forEach(sid => {
            const s = this.staff[sid], sFund = this.expenses.filter(e => e.staffId === sid && e.type === 'funding').reduce((a,b)=>a+b.amount, 0), sSpend = this.expenses.filter(e => e.staffId === sid && e.type === 'spend').reduce((a,b)=>a+b.amount, 0);
            const bal = sFund - sSpend;
            walletsHtml += `<div class="console-card" style="padding: 20px; border-top: 3px solid ${bal >= 0 ? 'var(--success)' : 'var(--accent-primary)'}">
                <div style="font-weight:700; margin-bottom:10px;">${s.name}</div>
                <div style="font-size:1.5rem; font-weight:900; color: ${bal >= 0 ? 'var(--success)' : 'var(--accent-primary)'}">₹${bal.toLocaleString()}</div>
                <div style="font-size:0.7rem; color:var(--text-dim); margin-top:5px; text-transform:uppercase;">${bal >= 0 ? 'Surplus Funds' : 'Reimbursement Due'}</div>
            </div>`;
        });
        
        let logHtml = `<div class="section-title"><span>Expense & Funding Logs</span></div><table class="console-table"><thead><tr><th>Date</th><th>Activity</th><th>Staff</th><th>Amount</th><th>Category/Details</th><th style="text-align:right">Actions</th></tr></thead><tbody>`;
        const q = this.searchQuery;
        const filtered = this.expenses.filter(e => {
            const st = this.staff[e.staffId] || { name: 'Unknown' };
            return !q || st.name.toLowerCase().includes(q) || (e.details || '').toLowerCase().includes(q) || (e.category || '').toLowerCase().includes(q);
        });

        filtered.forEach(e => {
            const st = this.staff[e.staffId] || { name: 'Unknown' }, d = e.timestamp?.toDate ? e.timestamp.toDate() : new Date(e.timestamp);
            logHtml += `<tr><td>${d.toLocaleDateString()}</td>
                <td><span class="status-pill" style="background:${e.type==='funding'?'rgba(74,222,128,0.1)':'rgba(241,97,91,0.1)'}; color:${e.type==='funding'?'var(--success)':'var(--accent-primary)'}; font-size:0.6rem; text-transform:uppercase;">${e.type}</span></td>
                <td><strong>${st.name}</strong></td><td><strong style="color:${e.type==='funding'?'var(--success)':'#f87171'}">₹${e.amount.toLocaleString()}</strong></td>
                <td><div style="font-size:0.85rem; font-weight:600;">${e.category || 'N/A'}</div><div style="font-size:0.75rem; color:var(--text-dim);">${e.details}</div></td>
                <td><div class="table-actions" style="justify-content:flex-end">
                    ${e.attachmentUrl ? `<button class="btn-icon" onclick="window.open('${e.attachmentUrl}', '_blank')"><i data-lucide="image"></i></button>` : ''}
                    <button class="btn-icon text-danger" onclick="window.feesManager.deleteExpense('${e.id}')"><i data-lucide="trash-2"></i></button>
                </div></td></tr>`;
        });
        container.innerHTML = walletsHtml + `</div>` + logHtml + (filtered.length === 0 ? '<tr><td colspan="6" style="text-align:center; padding: 40px;">No expense records.</td></tr>' : '') + '</tbody></table>';
    },

    renderPlans() {
        const container = document.getElementById('fees-content-plans');
        if (!container) return;
        const toolbar = document.getElementById('fees-toolbar');
        if (toolbar) {
            toolbar.innerHTML = '';
            const search = document.createElement('div'); search.className='search-box'; search.style.maxWidth='350px'; search.style.marginRight='auto';
            search.innerHTML=`<i data-lucide="search"></i><input type="text" placeholder="Search packages..." value="${this.searchQuery}">`;
            search.querySelector('input').oninput=(e)=>{this.searchQuery=e.target.value.toLowerCase(); this.renderPlans();};
            toolbar.appendChild(search);
            const btn = document.createElement('button'); btn.className='btn btn-primary'; btn.innerHTML='<i data-lucide="plus"></i> Create Fee Package'; btn.onclick=()=>this.showAddPlanForm(); toolbar.appendChild(btn);
        }

        if (Object.keys(this.plans).length === 0) { container.innerHTML = '<div class="empty-state"><p>No fee package templates defined yet.</p></div>'; return; }

        let html = `<div class="plans-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 24px;">`;
        const q = this.searchQuery;
        const filteredPlanIds = Object.keys(this.plans).filter(id => !q || this.plans[id].name.toLowerCase().includes(q));

        filteredPlanIds.forEach(id => {
            const p = this.plans[id], cycle = p.billingCycle || 12;
            let annualTotal = 0; (p.components || []).forEach(c => annualTotal += c.frequency === 'monthly' ? (c.amount * cycle) : c.amount);
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

    renderStudentFees() {
        const container = document.getElementById('fees-content-student-fees'), id = this.activeStudentId;
        if (!container || !id) return;
        const s = this.students[id] || { name: 'Student' }, f = this.fees[id] || { total: 0, paid: 0, components: [], billingCycle: 12 }, range = this.getAcademicCycleRange(f.billingCycle || 12);
        let html = `
            <div class="fee-profile-header"><h2>${s.name}</h2><p>Ledger & Billing Structure</p>
                <div class="highlights" style="margin-top:20px;">
                    <div class="highlight-item" style="border-left: 4px solid var(--accent-secondary);"><h3>Total Payable</h3><div>₹${(f.total || 0).toLocaleString()}</div></div>
                    <div class="highlight-item" style="border-left: 4px solid var(--success);"><h3>Total Paid</h3><div style="color: var(--success)">₹${(f.paid || 0).toLocaleString()}</div></div>
                    <div class="highlight-item" style="border-left: 4px solid var(--accent-primary);"><h3>Balance Due</h3><div style="color: var(--accent-primary)">₹${((f.total || 0) - (f.paid || 0)).toLocaleString()}</div></div>
                </div>
            </div>
            <div class="section-title" style="margin-top:40px; display:flex; justify-content:space-between; align-items:center;"><span>Detailed Fee Breakdown</span><span style="font-size:0.75rem; background:rgba(255,255,255,0.05); padding:4px 12px; border-radius:8px; color:var(--accent-secondary); font-weight:700;">Cycle: ${f.billingCycle || 12} Months (${range})</span></div>
            <div class="console-card" style="padding:0; overflow:hidden; margin-bottom:40px;"><table class="console-table" style="margin:0;"><thead style="background:rgba(255,255,255,0.02);"><tr><th>Component</th><th>Type</th><th>Freq.</th><th style="text-align:right;">Plan Rate</th><th style="text-align:right;">Waiver</th><th style="text-align:right;">Payable</th></tr></thead><tbody>`;
        if (f.components?.length > 0) {
            f.components.forEach(c => {
                const orig = c.originalAmount || c.amount || 0, pay = c.amount || 0, waiver = Math.max(0, orig - pay);
                html += `<tr><td><strong>${c.name}</strong></td><td><span style="text-transform:uppercase; font-size:0.7rem; opacity:0.7;">${c.type}</span></td><td><span class="status-pill" style="background:rgba(255,255,255,0.05); font-size:0.65rem;">${c.frequency}</span></td><td style="text-align:right; opacity:0.6;">₹${orig.toLocaleString()}</td><td style="text-align:right; color:var(--accent-primary); font-weight:600;">${waiver > 0 ? `-₹${waiver.toLocaleString()}` : '—'}</td><td style="text-align:right;"><strong>₹${pay.toLocaleString()}</strong> ${c.frequency==='monthly'?'<small>/mo</small>':''}</td></tr>`;
            });
            if (f.discount > 0) html += `<tr style="background:rgba(241, 97, 91, 0.03);"><td colspan="4"><strong>Global Waiver</strong> <small style="color:var(--text-dim); margin-left:10px;">${f.discountRemarks || 'Adjustment'}</small></td><td style="text-align:right; color:var(--accent-primary); font-weight:800;">-₹${f.discount.toLocaleString()}</td><td style="text-align:right; color:var(--accent-primary);"><strong>Applied</strong></td></tr>`;
        } else { html += '<tr><td colspan="6" style="text-align:center; padding:40px; color:var(--text-dim);">No components configured.</td></tr>'; }
        html += `</tbody><tfoot style="background:rgba(115, 199, 200, 0.05);"><tr><td colspan="5" style="text-align:right; font-weight:700; padding:20px;">CALCULATED ANNUAL TOTAL:</td><td style="text-align:right; font-size:1.4rem; font-weight:900; color:var(--accent-secondary); padding:20px;">₹${(f.total || 0).toLocaleString()}</td></tr></tfoot></table></div>`;
        
        html += `<div class="section-title" style="display:flex; justify-content:space-between; align-items:center;"><span>Transaction History</span><button class="btn btn-primary btn-sm" onclick="window.feesManager.showPaymentForm('${id}')"><i data-lucide="plus"></i> Add Payment</button></div><table class="console-table"><thead><tr><th>Date & Time</th><th>Amount</th><th>Method</th><th>Reference</th><th style="text-align:right">Actions</th></tr></thead><tbody>`;
        const studentTrans = this.transactions.filter(t => t.studentId === id);
        studentTrans.forEach(t => {
            const d = t.timestamp?.toDate ? t.timestamp.toDate() : new Date(t.timestamp);
            html += `<tr><td><div style="font-weight:600;">${d.toLocaleDateString()}</div><div style="font-size:0.7rem; opacity:0.6;">${d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div></td><td><strong>₹${t.amount.toLocaleString()}</strong></td><td>${t.method}</td><td><small>${t.reference || '-'}</small></td><td><div class="table-actions" style="justify-content:flex-end"><button class="btn-icon" onclick="window.feesManager.printTransactionReceipt('${t.id}')"><i data-lucide="printer"></i></button><button class="btn-icon text-danger" onclick="window.feesManager.deleteTransaction('${t.id}', '${id}', ${t.amount})"><i data-lucide="trash-2"></i></button></div></td></tr>`;
        });
        container.innerHTML = html + (studentTrans.length === 0 ? '<tr><td colspan="5" style="text-align:center; padding: 20px;">No transactions.</td></tr>' : '') + '</tbody></table>';
        const toolbar = document.getElementById('fees-toolbar');
        if (toolbar) toolbar.innerHTML = `<button class="btn btn-secondary" onclick="window.feesManager.switchView('overview')"><i data-lucide="arrow-left"></i> Back to Ledger</button> <button class="btn btn-primary" onclick="window.feesManager.showSetupFeesForm('${id}')"><i data-lucide="settings"></i> Configure Fees</button>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    showFundingForm() {
        let staffOpts = ''; Object.values(this.staff).forEach(s => staffOpts += `<option value="${s.id}">${s.name}</option>`);
        AppDialog.confirm({
            title: 'Fund Staff Wallet',
            content: `<div class="form-group"><label>Select Staff Member</label><select id="ff-staff" class="form-control">${staffOpts}</select></div>
                      <div class="form-group" style="margin-top:15px;"><label>Amount Disbursed (₹)</label><input type="number" id="ff-amount" class="form-control" placeholder="0.00"></div>
                      <div class="form-group" style="margin-top:15px;"><label>Reference</label><input type="text" id="ff-ref" class="form-control" placeholder="Cash, GPay, etc."></div>`,
            onConfirm: () => {
                const amount = parseFloat(document.getElementById('ff-amount').value);
                if (!amount || amount <= 0) { AppDialog.toast('Invalid amount', 'error'); return false; }
                firestore.collection('modules').doc('fees_accounting').collection('expenses').add({
                    type: 'funding', staffId: document.getElementById('ff-staff').value, amount, details: document.getElementById('ff-ref').value, category: 'Internal Transfer', timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
                return true;
            }
        });
    },

    showSpendForm() {
        let staffOpts = ''; Object.values(this.staff).forEach(s => staffOpts += `<option value="${s.id}">${s.name}</option>`);
        AppDialog.confirm({
            title: 'Log Operational Spending',
            content: `<div class="form-group"><label>Who Paid?</label><select id="ef-staff" class="form-control">${staffOpts}</select></div>
                      <div class="form-grid-2" style="margin-top:15px;"><div class="form-group"><label>Category</label><select id="ef-cat" class="form-control"><option>Supplies</option><option>Utilities</option><option>Travel</option><option>Other</option></select></div><div class="form-group"><label>Amount (₹)</label><input type="number" id="ef-amount" class="form-control"></div></div>
                      <div class="form-group" style="margin-top:15px;"><label>Details</label><input type="text" id="ef-details" class="form-control"></div>
                      <div class="form-group" style="margin-top:15px;"><label>Receipt Image</label><input type="file" id="ef-file" class="form-control" accept="image/*"></div>`,
            onConfirm: async () => {
                const amount = parseFloat(document.getElementById('ef-amount').value), file = document.getElementById('ef-file').files[0];
                if (!amount || amount <= 0 || !file) { AppDialog.toast('Required: Amount & Receipt', 'error'); return false; }
                try {
                    const storageRef = firebase.storage().ref(`expenses/${Date.now()}_${file.name}`), snap = await storageRef.put(file), url = await snap.ref.getDownloadURL();
                    await firestore.collection('modules').doc('fees_accounting').collection('expenses').add({
                        type: 'spend', staffId: document.getElementById('ef-staff').value, amount, category: document.getElementById('ef-cat').value, details: document.getElementById('ef-details').value, attachmentUrl: url, timestamp: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    return true;
                } catch(err) { AppDialog.toast(err.message, 'error'); return false; }
            }
        });
    },

    showAddPlanForm() {
        const renderRow = (c = { name: '', amount: 0, frequency: 'onetime', type: 'tuition' }) => `<div class="form-row plan-component-row" style="display:grid; grid-template-columns: 2fr 1fr 1fr 1fr 40px; gap:10px; margin-bottom:10px; align-items:center;"><input type="text" class="form-control pc-name" value="${c.name}"><select class="form-control pc-type"><option value="tuition">Tuition</option><option value="lunch">Lunch</option><option value="material">Material</option><option value="other">Other</option></select><select class="form-control pc-freq"><option value="onetime">One-time</option><option value="monthly">Monthly</option></select><input type="number" class="form-control pc-amount" value="${c.amount}"><button class="btn-icon text-danger" onclick="this.parentElement.remove(); window.feesManager.updatePlanTotal();"><i data-lucide="x"></i></button></div>`;
        AppDialog.confirm({
            title: 'Define Fee Package', width: '850px',
            content: `<div style="display:grid; grid-template-columns: 1fr 180px; gap:20px; align-items:flex-end;"><div class="form-group"><label>Package Name</label><input type="text" id="plan-name" class="form-control"></div><div class="form-group"><label>Cycle (Mo)</label><input type="number" id="plan-cycle" class="form-control" value="12"></div></div>
                      <div class="form-section-title" style="display:flex; justify-content:space-between; align-items:center; margin-top:25px;"><span>Components</span><button class="btn btn-secondary btn-sm" id="add-plan-comp-btn">Add Item</button></div>
                      <div id="plan-components-container" style="max-height:350px; overflow-y:auto;">${renderRow()}</div>
                      <div style="margin-top:20px; padding:15px; background:rgba(255,255,255,0.05); display:flex; justify-content:space-between; align-items:center;"><span>Calculated Revenue:</span><span id="plan-total-display" style="font-weight:900; font-size:1.2rem; color:var(--accent-secondary);">₹0</span></div>`,
            onOpen: () => {
                const cont = document.getElementById('plan-components-container'), cyc = document.getElementById('plan-cycle');
                this.updatePlanTotal = () => { let t = 0; const c = parseInt(cyc.value) || 12; document.querySelectorAll('.plan-component-row').forEach(row => { const a = parseFloat(row.querySelector('.pc-amount').value) || 0; const f = row.querySelector('.pc-freq').value; t += f === 'monthly' ? (a*c) : a; }); document.getElementById('plan-total-display').innerText = `₹${t.toLocaleString()}`; };
                document.getElementById('add-plan-comp-btn').onclick = () => { const div = document.createElement('div'); div.innerHTML = renderRow(); const row = div.firstElementChild; cont.appendChild(row); if (window.lucide) window.lucide.createIcons({ root: row }); this.updatePlanTotal(); };
                cont.addEventListener('input', this.updatePlanTotal); cyc.oninput = this.updatePlanTotal; this.updatePlanTotal();
            },
            onConfirm: () => {
                const name = document.getElementById('plan-name').value, components = [];
                document.querySelectorAll('.plan-component-row').forEach(row => { const n = row.querySelector('.pc-name').value; if (n) components.push({ name: n, amount: parseFloat(row.querySelector('.pc-amount').value) || 0, frequency: row.querySelector('.pc-freq').value, type: row.querySelector('.pc-type').value }); });
                if (!name || components.length === 0) { AppDialog.toast('Valid name & components required', 'error'); return false; }
                firestore.collection('modules').doc('fees_accounting').collection('plans').add({ name, components, billingCycle: parseInt(document.getElementById('plan-cycle').value) || 12 });
                return true;
            }
        });
    },

    showSetupFeesForm(studentId) {
        const f = this.fees[studentId] || { total: 0, planId: '', components: [], discount: 0, discountRemarks: '', billingCycle: 12 }, s = this.students[studentId] || { name: 'Student' };
        let opts = '<option value="">-- Manual Configuration --</option>'; Object.keys(this.plans).forEach(pid => opts += `<option value="${pid}" ${pid === f.planId ? 'selected' : ''}>${this.plans[pid].name}</option>`);
        const renderRow = (c) => `<div class="form-row component-row" style="display:grid; grid-template-columns: 2fr 1fr 1fr 1fr 40px; gap:10px; margin-bottom:15px; align-items:center; background:rgba(255,255,255,0.02); padding:12px; border-radius:12px; border:1px solid rgba(255,255,255,0.05);"><div class="form-group" style="margin:0"><label style="font-size:0.6rem;">Fee Name</label><input type="text" class="form-control c-name" value="${c.name}"></div><div class="form-group" style="margin:0"><label style="font-size:0.6rem;">Original</label><div style="font-size:0.85rem; opacity:0.6; padding:6px 0;">₹${(c.originalAmount || c.amount || 0).toLocaleString()}</div><input type="hidden" class="c-orig" value="${c.originalAmount || c.amount || 0}"></div><div class="form-group" style="margin:0"><label style="font-size:0.6rem; color:var(--accent-primary);">Waiver</label><div class="c-waiver-display" style="color:var(--accent-primary); font-weight:700; padding:6px 0; font-size:0.85rem;">₹0</div></div><div class="form-group" style="margin:0"><label style="font-size:0.6rem;">Payable</label><input type="number" class="form-control c-amount" value="${c.amount}"></div><input type="hidden" class="c-type" value="${c.type}"><input type="hidden" class="c-freq" value="${c.frequency}"><button class="btn-icon text-danger" onclick="this.parentElement.remove(); window.feesManager.recalcSetupTotal();" style="margin-top:15px;"><i data-lucide="x"></i></button></div>`;
        AppDialog.confirm({
            title: `Custom Structure: ${s.name}`, width: '1000px',
            content: `<div class="fee-modal-grid"><div class="fee-modal-left"><div class="form-group"><label>Apply Template</label><select id="sf-plan-id" class="form-control" style="border-color:var(--accent-secondary);">${opts}</select></div><div class="form-group" style="margin-top:15px;"><label>Academic Cycle (Mo)</label><input type="number" id="sf-cycle" class="form-control" value="${f.billingCycle || 12}"><div id="sf-date-preview" style="font-size:0.65rem; color:var(--accent-secondary); margin-top:5px; font-weight:700;">Coverage: Loading...</div></div><div class="form-group" style="margin-top:15px;"><label>Special Waiver (₹)</label><input type="number" id="sf-discount" class="form-control" value="${f.discount || 0}"></div><div class="form-group" style="margin-top:10px;"><label>Waiver Reason</label><input type="text" id="sf-discount-remarks" class="form-control" value="${f.discountRemarks || ''}"></div><div id="setup-summary-card" style="margin-top:30px; padding:20px; background:var(--sidebar-bg); border-radius:16px; border:1px solid var(--card-border);"><div style="font-weight:700; font-size:0.7rem; text-transform:uppercase; color:var(--text-dim); margin-bottom:10px;">Live Audit</div><div style="display:flex; justify-content:space-between; margin-bottom:5px;"><span>Gross:</span><span id="sf-gross-display">₹0</span></div><div style="display:flex; justify-content:space-between; color:var(--accent-primary);"><span>Waivers:</span><span id="sf-item-waiver-display">- ₹0</span></div><div style="margin-top:15px; border-top:1px solid var(--card-border); padding-top:10px; display:flex; justify-content:space-between; align-items:center;"><span>Net Payable:</span><strong id="sf-final-total-display" style="color:var(--success); font-size:1.6rem;">₹0</strong></div></div></div><div><div class="form-section-title" style="display:flex; justify-content:space-between; align-items:center; margin:0;"><span>Surgical Components</span><button class="btn btn-secondary btn-sm" id="add-custom-comp-btn"><i data-lucide="plus"></i> Add Item</button></div><div id="setup-components-container" style="max-height:450px; overflow-y:auto; margin-top:10px;">${(f.components || []).map(c => renderRow(c)).join('')}</div></div></div>`,
            onOpen: () => {
                const ps = document.getElementById('sf-plan-id'), cc = document.getElementById('setup-components-container'), di = document.getElementById('sf-discount'), cy = document.getElementById('sf-cycle'), dp = document.getElementById('sf-date-preview');
                this.recalcSetupTotal = () => { let g = 0, w = 0; const c = parseInt(cy.value) || 12; dp.innerText = `Coverage: ${this.getAcademicCycleRange(c)}`; document.querySelectorAll('.component-row').forEach(row => { const o = parseFloat(row.querySelector('.c-orig').value) || 0, p = parseFloat(row.querySelector('.c-amount').value) || 0, f = row.querySelector('.c-freq').value, m = f === 'monthly' ? c : 1; g += (o || p) * m; w += Math.max(0, (o - p) * m); row.querySelector('.c-waiver-display').innerText = `₹${(o - p).toLocaleString()}`; });
                    const d = parseFloat(di.value) || 0, ft = g - w - d; document.getElementById('sf-gross-display').innerText = `₹${g.toLocaleString()}`; document.getElementById('sf-item-waiver-display').innerText = `- ₹${w.toLocaleString()}`; document.getElementById('sf-final-total-display').innerText = `₹${ft.toLocaleString()}`; return ft; };
                ps.onchange = (e) => { const p = this.plans[e.target.value]; if (p) { cc.innerHTML = (p.components || []).map(c => renderRow({...c, originalAmount: c.amount})).join(''); cy.value = p.billingCycle || 12; if (window.lucide) window.lucide.createIcons({ root: cc }); this.recalcSetupTotal(); } };
                document.getElementById('add-custom-comp-btn').onclick = () => { const div = document.createElement('div'); div.innerHTML = renderRow({name:'', amount:0, originalAmount:0, type:'other', frequency:'onetime'}); cc.appendChild(div.firstElementChild); if (window.lucide) window.lucide.createIcons({ root: cc }); this.recalcSetupTotal(); };
                cc.addEventListener('input', this.recalcSetupTotal); di.oninput = this.recalcSetupTotal; cy.oninput = this.recalcSetupTotal; this.recalcSetupTotal();
            },
            onConfirm: () => {
                const components = []; document.querySelectorAll('.component-row').forEach(row => { const n = row.querySelector('.c-name').value, a = parseFloat(row.querySelector('.c-amount').value) || 0, o = parseFloat(row.querySelector('.c-orig').value) || a; if (n) components.push({ name: n, amount: a, originalAmount: o, type: row.querySelector('.c-type').value, frequency: row.querySelector('.c-freq').value }); });
                const ft = this.recalcSetupTotal(); firestore.collection('modules').doc('fees_accounting').collection('student_fees').doc(studentId).set({ total: ft, planId: document.getElementById('sf-plan-id').value, billingCycle: parseInt(document.getElementById('sf-cycle').value) || 12, discount: parseFloat(document.getElementById('sf-discount').value) || 0, discountRemarks: document.getElementById('sf-discount-remarks').value, components, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
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

    printTransactionReceipt(transactionId) {
        const t = this.transactions.find(item => item.id === transactionId); if (!t) return;
        const s = this.students[t.studentId] || { name: 'Student' }, d = t.timestamp?.toDate ? t.timestamp.toDate() : new Date(t.timestamp);
        const win = window.open('', '_blank');
        win.document.write(`<html><head><title>Receipt - ${s.name}</title><style>body { font-family: sans-serif; padding: 40px; color: #000; line-height: 1.6; } .receipt-header { border-bottom: 2px solid #000; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center; } .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px; } .payment-table { width: 100%; border-collapse: collapse; margin-bottom: 40px; } .payment-table th, .payment-table td { padding: 12px; border: 1px solid #000; } .total-amount { font-size: 24px; font-weight: 900; }</style></head><body>
            <div class="receipt-header"><div><h1>ABHISHRI ACADEMY</h1><p>Empowering Young Minds</p></div><div style="text-align:right;"><h2>FEE RECEIPT</h2><p>No: ${transactionId.slice(-8).toUpperCase()}</p></div></div>
            <div class="info-grid"><div><strong>Student:</strong> ${s.name}<br><strong>Class:</strong> ${s.admissionForClass || 'N/A'}</div><div><strong>Date:</strong> ${d.toLocaleDateString()}<br><strong>Parent:</strong> ${s.fatherName || 'N/A'}</div></div>
            <table class="payment-table"><thead><tr><th>Description</th><th>Mode</th><th>Reference</th><th style="text-align:right;">Amount</th></tr></thead><tbody><tr><td>School Fees / Academic Charges</td><td>${t.method}</td><td>${t.reference || 'N/A'}</td><td style="text-align:right; font-weight:700;">₹${t.amount.toLocaleString()}</td></tr></tbody></table>
            <div style="text-align:right;"><span style="font-weight:700;">TOTAL PAID:</span> <span class="total-amount">₹${t.amount.toLocaleString()}</span></div>
            <div style="margin-top:60px; display:flex; justify-content:space-between;"><div style="border-top:1px solid #000; width:200px; text-align:center;">PARENTS SIGNATURE</div><div style="border-top:1px solid #000; width:200px; text-align:center;">OFFICE STAMP</div></div>
            <div style="margin-top:100px; text-align:center; font-size:10px; color:#999;">Generated on ${new Date().toLocaleString()}</div>
            <script>window.onload=()=>{window.print(); setTimeout(()=>window.close(),500);};</script></body></html>`);
        win.document.close();
    },

    renderPlans() {
        const container = document.getElementById('fees-content-plans');
        if (!container) return;
        const toolbar = document.getElementById('fees-toolbar');
        if (toolbar) {
            toolbar.innerHTML = '';
            const search = document.createElement('div'); search.className='search-box'; search.style.maxWidth='350px'; search.style.marginRight='auto';
            search.innerHTML=`<i data-lucide="search"></i><input type="text" placeholder="Search packages..." value="${this.searchQuery}">`;
            search.querySelector('input').oninput=(e)=>{this.searchQuery=e.target.value.toLowerCase(); this.renderPlans();};
            toolbar.appendChild(search);
            const btn = document.createElement('button'); btn.className='btn btn-primary'; btn.innerHTML='<i data-lucide="plus"></i> Create Fee Package'; btn.onclick=()=>this.showAddPlanForm(); toolbar.appendChild(btn);
        }

        if (Object.keys(this.plans).length === 0) { container.innerHTML = '<div class="empty-state"><p>No fee package templates defined yet.</p></div>'; return; }

        let html = `<div class="plans-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 24px;">`;
        const q = this.searchQuery;
        const filteredPlanIds = Object.keys(this.plans).filter(id => !q || this.plans[id].name.toLowerCase().includes(q));

        filteredPlanIds.forEach(id => {
            const p = this.plans[id], cycle = p.billingCycle || 12;
            let annualTotal = 0; (p.components || []).forEach(c => annualTotal += c.frequency === 'monthly' ? (c.amount * cycle) : c.amount);
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
        const renderRow = (c = { name: '', amount: 0, frequency: 'onetime', type: 'tuition' }) => `<div class="form-row plan-component-row" style="display:grid; grid-template-columns: 2fr 1fr 1fr 1fr 40px; gap:10px; margin-bottom:10px; align-items:center;"><input type="text" class="form-control pc-name" value="${c.name}"><select class="form-control pc-type"><option value="tuition">Tuition</option><option value="lunch">Lunch</option><option value="material">Material</option><option value="other">Other</option></select><select class="form-control pc-freq"><option value="onetime">One-time</option><option value="monthly">Monthly</option></select><input type="number" class="form-control pc-amount" value="${c.amount}"><button class="btn-icon text-danger" onclick="this.parentElement.remove(); window.feesManager.updatePlanTotal();"><i data-lucide="x"></i></button></div>`;
        AppDialog.confirm({
            title: 'Define Fee Package', width: '850px',
            content: `<div style="display:grid; grid-template-columns: 1fr 180px; gap:20px; align-items:flex-end;"><div class="form-group"><label>Package Name</label><input type="text" id="plan-name" class="form-control"></div><div class="form-group"><label>Cycle (Mo)</label><input type="number" id="plan-cycle" class="form-control" value="12"></div></div>
                      <div class="form-section-title" style="display:flex; justify-content:space-between; align-items:center; margin-top:25px;"><span>Components</span><button class="btn btn-secondary btn-sm" id="add-plan-comp-btn">Add Item</button></div>
                      <div id="plan-components-container" style="max-height:350px; overflow-y:auto;">${renderRow()}</div>
                      <div style="margin-top:20px; padding:15px; background:rgba(255,255,255,0.05); display:flex; justify-content:space-between; align-items:center;"><span>Calculated Revenue:</span><span id="plan-total-display" style="font-weight:900; font-size:1.2rem; color:var(--accent-secondary);">₹0</span></div>`,
            onOpen: () => {
                const cont = document.getElementById('plan-components-container'), cyc = document.getElementById('plan-cycle');
                this.updatePlanTotal = () => { let t = 0; const c = parseInt(cyc.value) || 12; document.querySelectorAll('.plan-component-row').forEach(row => { const aInput = row.querySelector('.pc-amount'); if(!aInput) return; const a = parseFloat(aInput.value) || 0; const f = row.querySelector('.pc-freq').value; t += f === 'monthly' ? (a*c) : a; }); document.getElementById('plan-total-display').innerText = `₹${t.toLocaleString()}`; };
                document.getElementById('add-plan-comp-btn').onclick = () => { const div = document.createElement('div'); div.innerHTML = renderRow(); const row = div.firstElementChild; cont.appendChild(row); if (window.lucide) window.lucide.createIcons({ root: row }); this.updatePlanTotal(); };
                cont.addEventListener('input', this.updatePlanTotal); cyc.oninput = this.updatePlanTotal; this.updatePlanTotal();
            },
            onConfirm: () => {
                const name = document.getElementById('plan-name').value, components = [];
                document.querySelectorAll('.plan-component-row').forEach(row => { const n = row.querySelector('.pc-name').value; if (n) components.push({ name: n, amount: parseFloat(row.querySelector('.pc-amount').value) || 0, frequency: row.querySelector('.pc-freq').value, type: row.querySelector('.pc-type').value }); });
                if (!name || components.length === 0) { AppDialog.toast('Valid name & components required', 'error'); return false; }
                firestore.collection('modules').doc('fees_accounting').collection('plans').add({ name, components, billingCycle: parseInt(document.getElementById('plan-cycle').value) || 12 });
                return true;
            }
        });
    },

    savePayment(studentId, paymentData) {
        paymentData.studentId = studentId;
        paymentData.timestamp = firebase.firestore.FieldValue.serverTimestamp();
        firestore.collection('modules').doc('fees_accounting').collection('transactions').add(paymentData).then(() => {
            const currentPaid = this.fees[studentId]?.paid || 0;
            firestore.collection('modules').doc('fees_accounting').collection('student_fees').doc(studentId).set({ paid: currentPaid + paymentData.amount }, { merge: true });
            AppDialog.toast('Payment recorded successfully', 'success');
        });
    }
};
