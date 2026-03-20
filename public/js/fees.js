/**
 * Fees and Accounting Module
 * Handles student fee management and transactions
 */

window.feesManager = {
    students: {},
    fees: {},
    isSubscribed: false,
    currentView: 'overview', // overview, student_fees, transactions

    initialize() {
        // Initial setup
    },

    subscribe() {
        if (this.isSubscribed) return;

        // Subscribe to Students (Firestore)
        const studentsRef = firestore.collection('modules').doc('student_directory').collection('students');
        studentsRef.onSnapshot((querySnapshot) => {
            const data = {};
            querySnapshot.forEach((doc) => {
                data[doc.id] = doc.data();
            });
            this.students = data;
            this.render();
        });

        // Subscribe to Fees (RTD)
        const feesRef = firebase.database().ref('modules/fees_accounting/student_fees');
        feesRef.on('value', (snapshot) => {
            this.fees = snapshot.val() || {};
            this.render();
        });

        this.isSubscribed = true;
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
        const isMaster = isAdmin || perms === true;

        const subtitle = document.getElementById('fees-screen-subtitle');
        if (subtitle) {
            subtitle.innerText = `Managing fees for ${Object.keys(this.students).length} students`;
        }

        // Clear Toolbar
        const toolbar = document.getElementById('fees-toolbar');
        if (toolbar) toolbar.innerHTML = '';

        if (this.currentView === 'overview') {
            this.renderOverview();
        } else if (this.currentView === 'student_fees') {
            this.renderStudentFees();
        }

        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    renderOverview() {
        const container = document.getElementById('fees-content-overview');
        if (!container) return;

        if (Object.keys(this.students).length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No students found.</p></div>';
            return;
        }

        let html = `
            <table class="console-table">
                <thead>
                    <tr>
                        <th>Student Name</th>
                        <th>Class</th>
                        <th>Total Fee</th>
                        <th>Paid</th>
                        <th>Balance</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
        `;

        const sortedIds = Object.keys(this.students).sort((a, b) => {
            return (this.students[a].name || '').localeCompare(this.students[b].name || '');
        });

        sortedIds.forEach(id => {
            const s = this.students[id];
            const f = this.fees[id] || { total: 0, paid: 0 };
            const balance = (f.total || 0) - (f.paid || 0);
            const status = balance <= 0 ? 'Paid' : 'Pending';
            const statusClass = balance <= 0 ? 'status-success' : 'status-warning';

            html += `
                <tr>
                    <td><strong>${s.name || 'N/A'}</strong></td>
                    <td>${s.admissionForClass || 'N/A'}</td>
                    <td>₹${f.total || 0}</td>
                    <td>₹${f.paid || 0}</td>
                    <td style="color: ${balance > 0 ? 'var(--accent-primary)' : 'inherit'}">₹${balance}</td>
                    <td><span class="status-pill ${statusClass}">${status}</span></td>
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

    renderStudentFees() {
        const id = this.activeStudentId;
        const container = document.getElementById('fees-content-student-fees');
        if (!container || !id) return;

        const s = this.students[id];
        const f = this.fees[id] || { total: 0, paid: 0, transactions: {} };
        if (!s) return;

        let html = `
            <div class="fee-profile-header">
                <h2>${s.name} - Fee Statement</h2>
                <p>${s.admissionForClass} | Parent: ${s.fatherName || s.motherName}</p>
            </div>

            <div class="highlights" style="margin-top: 20px;">
                <div class="highlight-item">
                    <div class="highlight-text">
                        <h3>Total Fees</h3>
                        <div>₹${f.total || 0}</div>
                    </div>
                </div>
                <div class="highlight-item">
                    <div class="highlight-text">
                        <h3>Total Paid</h3>
                        <div style="color: var(--success)">₹${f.paid || 0}</div>
                    </div>
                </div>
                <div class="highlight-item">
                    <div class="highlight-text">
                        <h3>Balance Due</h3>
                        <div style="color: var(--accent-primary)">₹${(f.total || 0) - (f.paid || 0)}</div>
                    </div>
                </div>
            </div>

            <div class="section-title" style="margin-top:30px; display:flex; justify-content:space-between; align-items:center;">
                <span>Transaction History</span>
                <button class="btn btn-primary btn-sm" onclick="window.feesManager.showPaymentForm('${id}')">
                    <i data-lucide="plus"></i> Add Payment
                </button>
            </div>

            <table class="console-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Method</th>
                        <th>Reference</th>
                        <th>Remarks</th>
                    </tr>
                </thead>
                <tbody>
        `;

        const transactions = f.transactions || {};
        const sortedTrans = Object.keys(transactions).sort((a, b) => transactions[b].timestamp - transactions[a].timestamp);

        if (sortedTrans.length === 0) {
            html += '<tr><td colspan="5" style="text-align:center; padding: 20px;">No transactions recorded.</td></tr>';
        } else {
            sortedTrans.forEach(tid => {
                const t = transactions[tid];
                html += `
                    <tr>
                        <td>${new Date(t.timestamp).toLocaleDateString()}</td>
                        <td><strong>₹${t.amount}</strong></td>
                        <td>${t.method || 'Cash'}</td>
                        <td style="font-family: monospace; font-size: 0.8rem;">${t.reference || '-'}</td>
                        <td>${t.remarks || '-'}</td>
                    </tr>
                `;
            });
        }

        html += '</tbody></table>';
        container.innerHTML = html;
        
        const toolbar = document.getElementById('fees-toolbar');
        if (toolbar) {
            toolbar.innerHTML = `
                <button class="btn btn-secondary" onclick="window.feesManager.switchView('overview')">
                    <i data-lucide="arrow-left"></i> Back to Overview
                </button>
                <button class="btn btn-secondary" onclick="window.feesManager.showSetTotalFeeForm('${id}')">
                    <i data-lucide="edit"></i> Set Total Fee
                </button>
            `;
        }
    },

    showPaymentForm(studentId) {
        const content = `
            <div class="form-group">
                <label>Amount (₹)</label>
                <input type="number" id="pf-amount" class="form-control" placeholder="0.00">
            </div>
            <div class="form-group">
                <label>Payment Method</label>
                <select id="pf-method" class="form-control">
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI / QR</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cheque">Cheque</option>
                </select>
            </div>
            <div class="form-group">
                <label>Reference Number</label>
                <input type="text" id="pf-ref" class="form-control" placeholder="Transaction ID, Cheque No, etc.">
            </div>
            <div class="form-group">
                <label>Remarks</label>
                <input type="text" id="pf-remarks" class="form-control" placeholder="Optional notes">
            </div>
        `;

        AppDialog.confirm({
            title: 'Record Payment',
            content: content,
            confirmText: 'Save Payment',
            onConfirm: () => {
                const amount = parseFloat(document.getElementById('pf-amount').value);
                const method = document.getElementById('pf-method').value;
                const reference = document.getElementById('pf-ref').value;
                const remarks = document.getElementById('pf-remarks').value;

                if (!amount || amount <= 0) {
                    AppDialog.toast('Invalid amount', 'error');
                    return false;
                }

                this.savePayment(studentId, { amount, method, reference, remarks });
                return true;
            }
        });
    },

    showSetTotalFeeForm(studentId) {
        const currentTotal = this.fees[studentId]?.total || 0;
        const content = `
            <div class="form-group">
                <label>Total Fee Amount (₹)</label>
                <input type="number" id="sf-total" class="form-control" value="${currentTotal}">
                <p style="font-size: 0.8rem; color: var(--text-dim); margin-top: 4px;">This is the total annual fee for the student.</p>
            </div>
        `;

        AppDialog.confirm({
            title: 'Set Total Fee',
            content: content,
            confirmText: 'Update Total',
            onConfirm: () => {
                const total = parseFloat(document.getElementById('sf-total').value);
                if (isNaN(total)) return false;

                firebase.database().ref(`modules/fees_accounting/student_fees/${studentId}/total`).set(total)
                    .then(() => AppDialog.toast('Total fee updated', 'success'))
                    .catch(err => AppDialog.toast('Error: ' + err.message, 'error'));
                return true;
            }
        });
    },

    savePayment(studentId, paymentData) {
        const timestamp = firebase.database.ServerValue.TIMESTAMP;
        const transRef = firebase.database().ref(`modules/fees_accounting/student_fees/${studentId}/transactions`).push();
        
        const payment = {
            ...paymentData,
            timestamp: timestamp
        };

        transRef.set(payment)
            .then(() => {
                // Update total paid
                const currentPaid = this.fees[studentId]?.paid || 0;
                return firebase.database().ref(`modules/fees_accounting/student_fees/${studentId}/paid`).set(currentPaid + paymentData.amount);
            })
            .then(() => AppDialog.toast('Payment recorded', 'success'))
            .catch(err => AppDialog.toast('Error: ' + err.message, 'error'));
    }
};
