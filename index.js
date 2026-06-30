<!DOCTYPE html>
<html lang="km">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ស្រែមាន - ប្រព័ន្ធគ្រប់គ្រងរួម (Admin + Edit)</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <style>
        body { background-color: #f8f9fa; }
        .header-bg { background-color: #198754; color: white; }
        .grand-total-box { background-color: #e8f5e9; color: #1b5e20; font-weight: bold; }
        .nav-tabs .nav-link.active { background-color: #198754; color: white; border-color: #198754; }
        .nav-tabs .nav-link { color: #198754; font-weight: bold; }
    </style>
</head>
<body>

    <div class="container my-5" style="max-width: 1000px;">
        <div class="header-bg p-4 rounded-top shadow-sm">
            <h1 class="h3 mb-1">🌾 ហាងកសិកម្ម ស្រែមាន - Admin Dashboard</h1>
            <p class="mb-0 opacity-75 small">ប្រព័ន្ធគ្រប់គ្រងរួម៖ បញ្ចូល/កែប្រែ វិក្កយបត្រ អតិថិជន និងទំនិញ</p>
        </div>

        <ul class="nav nav-tabs bg-white px-3 pt-2 border-start border-end" id="adminTabs" role="tablist">
            <li class="nav-item">
                <button class="nav-link active" id="invoice-tab" data-bs-toggle="tab" data-bs-target="#invoice-pane" type="button">📝 វិក្កយបត្រ (Invoice)</button>
            </li>
            <li class="nav-item">
                <button class="nav-link" id="customer-tab" data-bs-toggle="tab" data-bs-target="#customer-pane" type="button">👥 គ្រប់គ្រងអតិថិជន</button>
            </li>
            <li class="nav-item">
                <button class="nav-link" id="product-tab" data-bs-toggle="tab" data-bs-target="#product-pane" type="button">📦 គ្រប់គ្រងទំនិញ</button>
            </li>
        </ul>

        <div class="tab-content bg-white p-4 rounded-bottom shadow-sm border border-top-0">
            
            <div class="tab-pane fade show active" id="invoice-pane" role="tabpanel">
                <div class="row g-4">
                    <div class="col-lg-6 border-end pe-lg-3">
                        <h5 id="invoiceFormTitle" class="text-success mb-3">➕ បង្កើតវិក្កយបត្រថ្មី</h5>
                        <form id="invoiceForm" onsubmit="submitInvoice(event)">
                            <div class="row g-2 mb-3 bg-light p-2 rounded border">
                                <div class="col-sm-6">
                                    <label class="form-label small fw-bold">លេខវិក្កយបត្រ</label>
                                    <input type="text" id="invoiceId" placeholder="ឧទាហរណ៍៖ 20260630" required class="form-control form-control-sm">
                                </div>
                                <div class="col-sm-6">
                                    <label class="form-label small fw-bold">ស្ថានភាពទូទាត់</label>
                                    <select id="invoiceStatus" class="form-select form-select-sm">
                                        <option value="Paid">ទូទាត់រួចរាល់ ✅</option>
                                        <option value="Debt">ជំពាក់ (Debt) ⚠️</option>
                                    </select>
                                </div>
                                <div class="col-12 mt-2">
                                    <label class="form-label small fw-bold">អតិថិជន</label>
                                    <select id="customerSelect" required class="form-select form-select-sm">
                                        <option value="">-- ជ្រើសរើសអតិថិជន --</option>
                                    </select>
                                </div>
                            </div>

                            <div class="mb-3">
                                <div class="d-flex justify-content-between align-items-center mb-2">
                                    <h6 class="mb-0 text-secondary small fw-bold">📦 មុខទំនិញ</h6>
                                    <button type="button" onclick="addItemRow()" class="btn btn-outline-success btn-xs py-0 px-2 small" style="font-size: 11px;">+ ថែមទំនិញ</button>
                                </div>
                                <div id="itemsContainer" class="d-flex flex-column gap-2" style="max-height: 250px; overflow-y: auto; padding-right: 3px;"></div>
                            </div>

                            <div class="p-3 rounded grand-total-box d-flex justify-content-between align-items-center mb-2">
                                <div class="small">សរុប: <span id="grandTotalDisplay" class="fs-5">0</span> ៛</div>
                                <div class="d-flex gap-2">
                                    <button type="button" id="btnCancelInvoiceEdit" onclick="resetInvoiceFormState()" class="btn btn-secondary btn-sm d-none">បោះបង់</button>
                                    <button type="submit" id="btnSubmitInvoice" class="btn btn-success btn-sm fw-bold">💾 រក្សាទុក</button>
                                </div>
                            </div>
                        </form>
                    </div>

                    <div class="col-lg-6 ps-lg-3">
                        <h5 class="text-secondary mb-3">🔍 ប្រវត្តិវិក្កយបត្រ</h5>
                        <input type="text" id="searchInvoiceInput" oninput="fetchInvoicesList(this.value)" placeholder="ស្វែងរកលេខវិក្កយបត្រ ឬ ឈ្មោះអតិថិជន..." class="form-control form-control-sm mb-3">
                        <div style="max-height: 480px; overflow-y: auto;">
                            <table class="table table-sm table-striped table-hover small">
                                <thead class="table-dark">
                                    <tr><th>លេខវិក្កយបត្រ</th><th>អតិថិជន</th><th>សរុប ($)</th><th>ស្ថានភាព</th><th class="text-center">កែប្រែ</th></tr>
                                </thead>
                                <tbody id="invoiceTableBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <div class="tab-pane fade" id="customer-pane" role="tabpanel">
                <div class="row g-4">
                    <div class="col-md-5 border-end pedig-4">
                        <h5 id="customerFormTitle" class="text-success mb-3">➕ បន្ថែមអតិថិជនថ្មី</h5>
                        <form id="customerForm" onsubmit="submitCustomer(event)">
                            <div class="mb-3">
                                <label class="form-label small fw-bold">ឈ្មោះអតិថិជន</label>
                                <input type="text" id="custName" placeholder="ឧទាហរណ៍៖ កាក់ រតនា" required class="form-control">
                            </div>
                            <div class="mb-3">
                                <label class="form-label small fw-bold">លេខទូរស័ព្ទ (Format: +855...)</label>
                                <input type="text" id="custPhone" placeholder="ឧទាហរណ៍៖ +85515612512" required class="form-control">
                            </div>
                            <div class="d-flex gap-2">
                                <button type="button" id="btnCancelCustEdit" onclick="resetCustomerFormState()" class="btn btn-secondary w-50 btn-sm d-none">បោះបង់</button>
                                <button type="submit" id="btnSubmitCust" class="btn btn-success w-100 btn-sm">💾 រក្សាទុក</button>
                            </div>
                        </form>
                    </div>
                    <div class="col-md-7 ps-md-4">
                        <h5 class="text-secondary mb-3">🔍 ស្វែងរកអតិថិជន</h5>
                        <input type="text" id="searchCustomerInput" oninput="searchCustomers(this.value)" placeholder="វាយឈ្មោះ ឬ លេខទូរស័ព្ទដើម្បីស្វែងរក..." class="form-control mb-3">
                        <div style="max-height: 350px; overflow-y: auto;">
                            <table class="table table-striped table-hover small">
                                <thead class="table-dark">
                                    <tr><th>ID</th><th>ឈ្មោះ</th><th>លេខទូរស័ព្ទ</th><th class="text-center">កែប្រែ</th></tr>
                                </thead>
                                <tbody id="customerTableBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <div class="tab-pane fade" id="product-pane" role="tabpanel">
                <div class="row g-4">
                    <div class="col-md-5 border-end pe-md-4">
                        <h5 id="productFormTitle" class="text-success mb-3">➕ បន្ថែមទំនិញថ្មី</h5>
                        <form id="productForm" onsubmit="submitProduct(event)">
                            <div class="mb-3">
                                <label class="form-label small fw-bold">ឈ្មោះទំនិញ</label>
                                <input type="text" id="prodName" placeholder="ឧទាហរណ៍៖ Padan (ដប)" required class="form-control">
                            </div>
                            <div class="mb-3">
                                <label class="form-label small fw-bold">ប្រភេទក្រុមទំនិញ</label>
                                <select id="prodCategory" required class="form-select">
                                    <option value="Granular Fertilizer">ជីគ្រាប់ (Granular Fertilizer)</option>
                                    <option value="Liquid Fertilizer">ជីទឹក (Liquid Fertilizer)</option>
                                    <option value="Powder Fertilizer">ជីម្សៅ (Powder Fertilizer)</option>
                                    <option value="Pesticide">ថ្នាំសត្វល្អិត (Pesticide)</option>
                                    <option value="Fungicide">ថ្នាំជំងឺ (Fungicide)</option>
                                    <option value="Herbicide">ថ្នាំស្មៅ (Herbicide)</option>
                                </select>
                            </div>
                            <div class="mb-3">
                                <label class="form-label small fw-bold">តម្លៃគោលរាយ (៛)</label>
                                <input type="number" id="prodPrice" placeholder="តម្លៃជារៀល" required class="form-control">
                            </div>
                            <div class="d-flex gap-2">
                                <button type="button" id="btnCancelProdEdit" onclick="resetProductFormState()" class="btn btn-secondary w-50 btn-sm d-none">បោះបង់</button>
                                <button type="submit" id="btnSubmitProd" class="btn btn-success w-100 btn-sm">💾 រក្សាទុក</button>
                            </div>
                        </form>
                    </div>
                    <div class="col-md-7 ps-md-4">
                        <h5 class="text-secondary mb-3">🔍 ស្វែងរកមុខទំនិញ</h5>
                        <input type="text" id="searchProductInput" oninput="searchProducts(this.value)" placeholder="វាយឈ្មោះទំនិញដើម្បីស្វែងរក..." class="form-control mb-3">
                        <div style="max-height: 350px; overflow-y: auto;">
                            <table class="table table-striped table-hover small">
                                <thead class="table-dark">
                                    <tr><th>ឈ្មោះទំនិញ</th><th>ប្រភេទក្រុម</th><th>តម្លៃគោល (៛)</th><th class="text-center">កែប្រែ</th></tr>
                                </thead>
                                <tbody id="productTableBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
    <script>
        const SUPABASE_URL = "https://hllsxqjyyoewkbgmwizs.supabase.co"; 
        const SUPABASE_KEY = "sb_publishable_KZbdTXvOcVfnsd9kzEgzAQ_u4T8h2Bt"; 
        const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

        let productCatalog = [];
        let globalCustomersList = [];
        
        // Trackers for edit state variables
        let editingInvoiceId = null;
        let editingCustomerId = null;
        let editingProductId = null;

        document.addEventListener("DOMContentLoaded", async () => {
            await initializeAllData();
        });

        async function initializeAllData() {
            await fetchCustomers();
            await fetchProducts();
            await fetchInvoicesList();
            resetInvoiceFormState();
        }

        async function fetchCustomers() {
            const { data, error } = await supabaseClient.from('customers').select('*').order('name');
            if (error) return console.error(error);
            globalCustomersList = data;
            
            const select = document.getElementById("customerSelect");
            select.innerHTML = '<option value="">-- ជ្រើសរើសអតិថិជន --</option>';
            data.forEach(c => {
                const opt = document.createElement("option");
                opt.value = c.id; opt.textContent = `${c.name} (ID: ${c.id})`;
                select.appendChild(opt);
            });
            renderCustomerTable(data);
        }

        async function fetchProducts() {
            const { data, error } = await supabaseClient.from('products').select('*').order('product_name');
            if (error) return console.error(error);
            productCatalog = data;
            renderProductTable(data);
        }

        async function fetchInvoicesList(searchQuery = "") {
            let query = supabaseClient.from('invoices').select('*, customers(name)').order('invoice_date', { ascending: false });
            
            if (searchQuery.trim() !== "") {
                // If it is a number, search invoice id, else search customer name via relational filter
                if (!isNaN(searchQuery)) {
                    query = query.ilike('id', `%${searchQuery}%`);
                } else {
                    // Filter based on nested inner join match fields
                    query = supabaseClient.from('invoices').select('*, customers!inner(name)').ilike('customers.name', `%${searchQuery}%`).order('invoice_date', { ascending: false });
                }
            }
            
            const { data, error } = await query;
            if (error) return console.error(error);
            
            const body = document.getElementById("invoiceTableBody");
            body.innerHTML = data.map(inv => `
                <tr>
                    <td><strong>${inv.id}</strong></td>
                    <td>${inv.customers ? inv.customers.name : 'Unknown'}</td>
                    <td>$${(inv.total_amount / 4000).toLocaleString()}</td>
                    <td><span class="badge ${inv.status === 'Paid' ? 'bg-success' : 'bg-warning text-dark'}">${inv.status}</span></td>
                    <td class="text-center"><button class="btn btn-primary btn-xs py-0 px-1 text-xs" onclick="loadInvoiceToForm('${inv.id}')">⚙️ កែ</button></td>
                </tr>
            `).join('');
        }

        // --- EDIT MODE LOADING SUB-ROUTINES ---
        async function loadInvoiceToForm(id) {
            editingInvoiceId = id;
            document.getElementById("invoiceId").value = id;
            document.getElementById("invoiceId").disabled = true; // Block identity tracking changes
            document.getElementById("invoiceFormTitle").textContent = "⚙️ កែប្រែវិក្កយបត្រ #" + id;
            document.getElementById("btnCancelInvoiceEdit").classList.remove("d-none");

            const { data: inv, error: e1 } = await supabaseClient.from('invoices').select('*').eq('id', id).single();
            const { data: lines, error: e2 } = await supabaseClient.from('invoice_items').select('*').eq('invoice_id', id);
            
            if (e1 || e2) return alert("Error loading history data details.");

            document.getElementById("invoiceStatus").value = inv.status;
            document.getElementById("customerSelect").value = inv.customer_id;

            const container = document.getElementById("itemsContainer");
            container.innerHTML = '';
            
            lines.forEach(line => {
                const rowId = 'row_' + Date.now() + Math.random().toString(36).substr(2, 4);
                let optionsHtml = productCatalog.map(p => `<option value="${p.id}" ${p.id == line.product_id ? 'selected' : ''}>${p.product_name}</option>`).join('');

                const rowTemplate = `
                    <div id="${rowId}" class="item-row row g-1 align-items-center bg-white p-1 rounded border shadow-sm mx-0">
                        <div class="col-6"><select required onchange="onProductChange('${rowId}', this.value)" class="product-select form-select form-select-sm">${optionsHtml}</select></div>
                        <div class="col-2"><input type="number" min="1" value="${line.quantity}" required oninput="calculateGrandTotal()" class="quantity-input form-control form-control-sm text-center"></div>
                        <div class="col-3"><input type="number" min="0" value="${line.unit_price}" required oninput="calculateGrandTotal()" class="price-input form-control form-control-sm"></div>
                        <div class="col-1 text-center"><button type="button" onclick="removeItemRow('${rowId}')" class="text-danger border-0 bg-transparent">❌</button></div>
                    </div>
                `;
                container.insertAdjacentHTML('beforeend', rowTemplate);
            });
            calculateGrandTotal();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        function loadCustomerToForm(id, name, phone) {
            editingCustomerId = id;
            document.getElementById("custName").value = name;
            document.getElementById("custPhone").value = phone;
            document.getElementById("customerFormTitle").textContent = "⚙️ កែប្រែព័ត៌មានអតិថិជន";
            document.getElementById("btnCancelCustEdit").classList.remove("d-none");
        }

        function loadProductToForm(id, name, cat, price) {
            editingProductId = id;
            document.getElementById("prodName").value = name;
            document.getElementById("prodCategory").value = cat;
            document.getElementById("prodPrice").value = price;
            document.getElementById("productFormTitle").textContent = "⚙️ កែប្រែព័ត៌មានទំនិញ";
            document.getElementById("btnCancelProdEdit").classList.remove("d-none");
        }

        // --- SUBMIT COMPONENT HANDLING (INSERT OR UPDATE DETECTIONS) ---
        async function submitInvoice(event) {
            event.preventDefault();
            const id = document.getElementById("invoiceId").value.trim();
            const customer_id = document.getElementById("customerSelect").value;
            const status = document.getElementById("invoiceStatus").value;
            const total_amount = calculateGrandTotal();

            try {
                if (editingInvoiceId) {
                    // Update main invoice headers
                    const { error } = await supabaseClient.from('invoices').update({ customer_id, total_amount, status }).eq('id', id);
                    if (error) throw error;
                    // Delete old items line items to overwrite cleanly with the current rows
                    await supabaseClient.from('invoice_items').delete().eq('invoice_id', id);
                } else {
                    const { error } = await supabaseClient.from('invoices').insert([{ id, customer_id, invoice_date: new Date().toISOString(), total_amount, status }]);
                    if (error) throw error;
                }

                const itemsRows = [];
                document.querySelectorAll('.item-row').forEach(row => {
                    const matched = productCatalog.find(p => p.id == row.querySelector('.product-select').value);
                    itemsRows.push({ invoice_id: id, product_id: matched.id, product_name: matched.product_name, category: matched.category, quantity: Number(row.querySelector('.quantity-input').value), unit_price: Number(row.querySelector('.price-input').value) });
                });

                const { error: itemsError } = await supabaseClient.from('invoice_items').insert(itemsRows);
                if (itemsError) throw itemsError;

                alert("✅ វិក្កយបត្រត្រូវបានរក្សាទុកដោយជោគជ័យ!");
                await initializeAllData();
            } catch (err) { alert("❌ បរាជ័យ៖ " + err.message); }
        }

        async function submitCustomer(event) {
            event.preventDefault();
            const name = document.getElementById("custName").value.trim();
            const phone = document.getElementById("custPhone").value.trim().replace(/[^0-9+]/g, '');
            const calculatedId = phone.replace(/^\+?855/, '');

            try {
                if (editingCustomerId) {
                    // Update query
                    const { error } = await supabaseClient.from('customers').update({ name, phone }).eq('id', editingCustomerId);
                    if (error) throw error;
                    alert("✅ កែប្រែទិន្នន័យអតិថិជនជោគជ័យ!");
                } else {
                    // Insert query
                    const { error } = await supabaseClient.from('customers').insert([{ id: calculatedId, name, phone }]);
                    if (error) throw error;
                    alert("✅ បន្ថែមអតិថិជនថ្មីជោគជ័យ!");
                }
                document.getElementById("customerForm").reset();
                await initializeAllData();
            } catch (err) { alert("❌ បរាជ័យ៖ " + err.message); }
        }

        async function submitProduct(event) {
            event.preventDefault();
            const product_name = document.getElementById("prodName").value.trim();
            const category = document.getElementById("prodCategory").value;
            const default_price_riel = Number(document.getElementById("prodPrice").value);

            try {
                if (editingProductId) {
                    const { error } = await supabaseClient.from('products').update({ product_name, category, default_price_riel }).eq('id', editingProductId);
                    if (error) throw error;
                    alert("✅ កែប្រែទិន្នន័យទំនិញជោគជ័យ!");
                } else {
                    const { error } = await supabaseClient.from('products').insert([{ product_name, category, default_price_riel }]);
                    if (error) throw error;
                    alert("✅ បន្ថែមទំនិញថ្មីជោគជ័យ!");
                }
                document.getElementById("productForm").reset();
                await initializeAllData();
            } catch (err) { alert("❌ បរាជ័យ៖ " + err.message); }
        }

        // --- RESET STATES RESET HANDLERS ---
        function resetInvoiceFormState() {
            editingInvoiceId = null;
            document.getElementById("invoiceForm").reset();
            document.getElementById("invoiceId").disabled = false;
            document.getElementById("invoiceFormTitle").textContent = "➕ បង្កើតវិក្កយបត្រថ្មី";
            document.getElementById("btnCancelInvoiceEdit").classList.add("d-none");
            document.getElementById("itemsContainer").innerHTML = '';
            addItemRow();
            calculateGrandTotal();
        }

        function resetCustomerFormState() {
            editingCustomerId = null;
            document.getElementById("customerForm").reset();
            document.getElementById("customerFormTitle").textContent = "➕ បន្ថែមអតិថិជនថ្មី";
            document.getElementById("btnCancelCustEdit").classList.add("d-none");
        }

        function resetProductFormState() {
            editingProductId = null;
            document.getElementById("productForm").reset();
            document.getElementById("productFormTitle").textContent = "➕ បន្ថែមទំនិញថ្មី";
            document.getElementById("btnCancelProdEdit").classList.add("d-none");
        }

        // --- SEARCH RENDERS ---
        function searchCustomers(query) {
            const filtered = globalCustomersList.filter(c => c.name.toLowerCase().includes(query.toLowerCase()) || c.phone.includes(query));
            renderCustomerTable(filtered);
        }

        function renderCustomerTable(data) {
            document.getElementById("customerTableBody").innerHTML = data.map(c => `
                <tr><td>${c.id}</td><td><strong>${c.name}</strong></td><td>${c.phone}</td>
                <td class="text-center"><button class="btn btn-warning btn-xs py-0 px-1 text-xs" onclick="loadCustomerToForm('${c.id}', '${c.name}', '${c.phone}')">✏️ កែ</button></td></tr>
            `).join('');
        }

        function searchProducts(query) {
            const filtered = productCatalog.filter(p => p.product_name.toLowerCase().includes(query.toLowerCase()));
            renderProductTable(filtered);
        }

        function renderProductTable(data) {
            document.getElementById("productTableBody").innerHTML = data.map(p => `
                <tr><td><strong>${p.product_name}</strong></td><td>${p.category}</td><td>${Number(p.default_price_riel).toLocaleString()} ៛</td>
                <td class="text-center"><button class="btn btn-warning btn-xs py-0 px-1 text-xs" onclick="loadProductToForm('${p.id}', '${p.product_name}', '${p.category}', ${p.default_price_riel})">✏️ កែ</button></td></tr>
            `).join('');
        }

        // --- ROW ENTRY MANAGEMENT INLINE COMPONENT UTILITIES ---
        function addItemRow() {
            const container = document.getElementById("itemsContainer");
            const rowId = 'row_' + Date.now() + Math.random().toString(36).substr(2, 4);
            let optionsHtml = productCatalog.map(p => `<option value="${p.id}">${p.product_name}</option>`).join('');

            const rowTemplate = `
                <div id="${rowId}" class="item-row row g-1 align-items-center bg-white p-1 rounded border shadow-sm mx-0">
                    <div class="col-6"><select required onchange="onProductChange('${rowId}', this.value)" class="product-select form-select form-select-sm"><option value="">-- ជ្រើសរើសទំនិញ --</option>${optionsHtml}</select></div>
                    <div class="col-2"><input type="number" min="1" value="1" required oninput="calculateGrandTotal()" class="quantity-input form-control form-control-sm text-center"></div>
                    <div class="col-3"><input type="number" min="0" required oninput="calculateGrandTotal()" class="price-input form-control form-control-sm"></div>
                    <div class="col-1 text-center"><button type="button" onclick="removeItemRow('${rowId}')" class="text-danger border-0 bg-transparent">❌</button></div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', rowTemplate);
        }

        function removeItemRow(id) {
            if (document.querySelectorAll('.item-row').length > 1) {
                document.getElementById(id).remove(); calculateGrandTotal();
            } else { alert("វិក្កយបត្រត្រូវមានទំនិញយ៉ាងហោចណាស់ ១ មុខ!"); }
        }

        function onProductChange(rowId, productId) {
            const row = document.getElementById(rowId);
            const prod = productCatalog.find(p => p.id == productId);
            row.querySelector('.price-input').value = prod ? prod.default_price_riel : '';
            calculateGrandTotal();
        }

        function calculateGrandTotal() {
            let total = 0;
            document.querySelectorAll('.item-row').forEach(row => {
                total += (Number(row.querySelector('.quantity-input').value || 0) * Number(row.querySelector('.price-input').value || 0));
            });
            document.getElementById("grandTotalDisplay").textContent = total.toLocaleString();
            return total;
        }
    </script>
</body>
</html>
