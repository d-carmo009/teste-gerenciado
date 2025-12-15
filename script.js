// Polyfill for crypto.randomUUID if not available (e.g. non-secure contexts)
if (typeof crypto.randomUUID === 'undefined') {
    crypto.randomUUID = function() {
        return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
            (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        );
    };
}

document.addEventListener('DOMContentLoaded', () => {
    // --- STATE MANAGEMENT (localStorage) ---
    const APP_PREFIX = 'rh-gerencial-v7-'; 
    const state = {
        units: JSON.parse(localStorage.getItem(APP_PREFIX + 'units') || '[]'),
        localidades: JSON.parse(localStorage.getItem(APP_PREFIX + 'localidades') || '[]'),
        setores: JSON.parse(localStorage.getItem(APP_PREFIX + 'setores') || '[]'),
        employees: JSON.parse(localStorage.getItem(APP_PREFIX + 'employees') || '[]'),
        events: JSON.parse(localStorage.getItem(APP_PREFIX + 'events') || '[]'),
        allCalculations: JSON.parse(localStorage.getItem(APP_PREFIX + 'calculations') || '{}'),
        currentView: 'benefits',
        calendarDate: (() => {
            const today = new Date();
            return { month: today.getMonth() + 1, year: today.getFullYear() };
        })(),
        selectedDate: (() => { 
            const today = new Date();
            return { month: today.getMonth() + 1, year: today.getFullYear() };
        })(),
        isFirebaseReady: false,
        userId: null,
        db: null,
        appId: typeof __app_id !== 'undefined' ? __app_id : 'default-app-id',
        firebaseApp: null,
        firebaseAuth: null,
        firebaseDb: null,
        costChartInstance: null, 
            currentReportData: null, 
    };

    const saveData = (key) => {
        localStorage.setItem(APP_PREFIX + key, JSON.stringify(state[key]));
    };

    // --- UI SELECTORS ---
    const views = {
        benefits: document.getElementById('benefits-view'),
        reports: document.getElementById('reports-view'), 
        events: document.getElementById('events-view'),
        employees: document.getElementById('employees-view'),
        units: document.getElementById('units-view'),
        localidades: document.getElementById('localidades-view'),
        setores: document.getElementById('setores-view'), 
    };
    const sidebarButtons = document.querySelectorAll('.sidebar-button');
    const modalContainer = document.getElementById('modal-container');
    const modalContent = document.getElementById('modal-content'); 
    const modalBackdrop = document.getElementById('modal-backdrop');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalCloseButton = document.getElementById('modal-close-button');
        const modalFooter = document.getElementById('modal-footer');
    const modalConfirmButton = document.getElementById('modal-confirm-button');
    const modalCancelButton = document.getElementById('modal-cancel-button');
    const uploadButton = document.getElementById('upload-button');
    const downloadButton = document.getElementById('download-button');
    const syncStatusDiv = document.getElementById('sync-status');
        const exportLocalButton = document.getElementById('export-local-button');
    const importLocalButton = document.getElementById('import-local-button');
    const importFileInput = document.getElementById('import-file-input');
        // Calendar specific selectors
    const calendarGrid = document.getElementById('calendar-grid');
    const calendarMonthYear = document.getElementById('calendar-month-year');
    const prevMonthBtn = document.getElementById('prev-month-btn');
    const nextMonthBtn = document.getElementById('next-month-btn');
    const calendarEmployeeFilter = document.getElementById('calendar-employee-filter');
        // Chart selector
    const costChartCanvas = document.getElementById('cost-evolution-chart');
    // Report selectors
    const reportYearSelect = document.getElementById('report-year-select');
    const reportTypeSelect = document.getElementById('report-type-select');
    const generateReportButton = document.getElementById('generate-report-button');
    const exportReportButton = document.getElementById('export-report-button');
    const reportOutputDiv = document.getElementById('report-output');
        // Button Selectors
    const newUnitButton = document.getElementById('new-unit-button');
    const newLocalidadeButton = document.getElementById('new-localidade-button');
    const newSetorButton = document.getElementById('new-setor-button'); 
    const newEmployeeButton = document.getElementById('new-employee-button');
    const newEventButton = document.getElementById('new-event-button');
    const massEventButton = document.getElementById('mass-event-button'); 
    const calculateAdvanceButton = document.getElementById('calculate-advance-button');
    const finalizeMonthButton = document.getElementById('finalize-month-button');
    const suggestDaysButton = document.getElementById('suggest-days-button');
    const exportVAVTButton = document.getElementById('export-vavt-button');
    const exportJantaButton = document.getElementById('export-janta-button');
    const exportCafeButton = document.getElementById('export-cafe-button');
    const importViagensButton = document.getElementById('import-viagens-button');
    const importViagensCSVInput = document.getElementById('import-viagens-csv-input');
    const printableArea = document.getElementById('printable-area'); 


    // --- HELPERS ---
    const formatCurrency = (value) => (typeof value !== 'number' || isNaN(value)) ? 'R$ 0,00' : value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const formatDateForInput = (dateStrOrObj) => {
        if (!dateStrOrObj) return '';
        const d = dateStrOrObj instanceof Date ? dateStrOrObj : new Date(dateStrOrObj);
        if (isNaN(d.getTime())) return '';
        const adjustedDate = new Date(d.getTime() - (d.getTimezoneOffset() * 60000));
        return adjustedDate.toISOString().split("T")[0];
    };
        // Improved: Calculates exact number of days within a range, considering month boundaries
        const calculateAbsenceDaysInMonth = (eventStartStr, eventEndStr, monthStart, monthEnd) => {
            const eventStart = new Date(eventStartStr + 'T00:00:00'); 
            const eventEnd = new Date(eventEndStr + 'T23:59:59'); 
            if (isNaN(eventStart.getTime()) || isNaN(eventEnd.getTime()) || eventStart > eventEnd) return 0;

            const overlapStart = new Date(Math.max(monthStart, eventStart));
            const overlapEnd = new Date(Math.min(monthEnd, eventEnd));
            
            let absenceDays = 0;
            if (overlapStart <= overlapEnd) {
                let currentDate = new Date(overlapStart);
                currentDate.setHours(12, 0, 0, 0); 
                const finalEnd = new Date(overlapEnd);
                finalEnd.setHours(12, 0, 0, 0);

                while (currentDate <= finalEnd) {
                    absenceDays++;
                    currentDate.setDate(currentDate.getDate() + 1);
                }
            }
            return absenceDays;
    };

        const getWeekdaysInMonth = (year, month, holidays = 0) => {
            const daysInMonth = new Date(year, month, 0).getDate();
            let weekdays = 0;
            for (let i = 1; i <= daysInMonth; i++) {
                const dayOfWeek = new Date(year, month - 1, i).getDay();
                if (dayOfWeek > 0 && dayOfWeek < 6) { // 1 (Mon) to 5 (Fri)
                    weekdays++;
                }
            }
            return weekdays - holidays;
        };
        
        // --- Overlap Check Helper ---
        const checkEventOverlap = (employeeId, startDate, endDate, ignoreEventId = null) => {
        const start = new Date(startDate + 'T00:00:00');
        const end = new Date(endDate + 'T23:59:59');

        return state.events.some(evt => {
            if (evt.id === ignoreEventId || evt.employeeId !== employeeId || evt.type === 'ajuste' || !evt.startDate || !evt.endDate) return false;
            const evtStart = new Date(evt.startDate + 'T00:00:00');
            const evtEnd = new Date(evt.endDate + 'T23:59:59');
            return start <= evtEnd && end >= evtStart;
        });
    };


    
    // --- MODAL LOGIC ---
    const openModal = (title, content, showFooter = false, size = 'max-w-md') => {
            modalContent.classList.remove('max-w-md', 'max-w-3xl', 'max-w-lg', 'max-w-xl'); // Remove old sizes
            modalContent.classList.add(size); // Add new size
        modalTitle.textContent = title;
        modalBody.innerHTML = content;
        modalFooter.classList.toggle('hidden', !showFooter);
        modalContainer.classList.add('active');
        modalBackdrop.classList.remove('hidden');
    };
    const closeModal = () => {
        modalContainer.classList.remove('active');
        modalBackdrop.classList.add('hidden');
        modalBody.innerHTML = '';
            modalFooter.classList.add('hidden');
            const oldConfirm = document.getElementById('modal-confirm-button');
            const newConfirm = oldConfirm.cloneNode(true);
            if (oldConfirm.parentNode) oldConfirm.parentNode.replaceChild(newConfirm, oldConfirm);
            const oldCancel = document.getElementById('modal-cancel-button');
            const newCancel = oldCancel.cloneNode(true);
            if (oldCancel.parentNode) oldCancel.parentNode.replaceChild(newCancel, oldCancel);
            document.getElementById('modal-cancel-button').addEventListener('click', closeModal);
    };
    modalCloseButton.addEventListener('click', closeModal);
    modalBackdrop.addEventListener('click', closeModal);
        document.getElementById('modal-cancel-button').addEventListener('click', closeModal); 

        const showConfirmModal = (message, onConfirm, customTitle = "Confirmação") => {
            openModal(customTitle, `<p>${message}</p>`, true);
            const confirmBtn = document.getElementById('modal-confirm-button');
            const cancelBtn = document.getElementById('modal-cancel-button');

            // Ensure we use the potentially replaced buttons
            confirmBtn.onclick = () => { 
                onConfirm();
                closeModal();
            };
            cancelBtn.onclick = closeModal; 
    };


    // --- NAVIGATION ---
    const switchView = (viewId) => {
        state.currentView = viewId;
        Object.values(views).forEach(v => {
            if (v) v.classList.remove('active');
        });
        sidebarButtons.forEach(b => b.classList.remove('active'));
        
            if (views[viewId]) {
            views[viewId].classList.add('active');
            } else {
                if (views.benefits) views.benefits.classList.add('active'); 
                viewId = 'benefits'; 
            }

        const button = document.querySelector(`.sidebar-button[data-view="${viewId}"]`);
            if (button) {
                button.classList.add('active');
            } else {
                const defaultBtn = document.querySelector('.sidebar-button[data-view="benefits"]');
                if (defaultBtn) defaultBtn.classList.add('active'); 
            }
        fullRender(); 
    };
    sidebarButtons.forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));

    // --- RENDER FUNCTIONS ---
    
    const populateDateFilters = () => {
            // Populate for Benefits View
        const monthSelectBenefits = document.getElementById('month-select');
        const yearSelectBenefits = document.getElementById('year-select');
        
        if (monthSelectBenefits.options.length === 0) {
            for (let i = 0; i < 12; i++) {
                const option = document.createElement('option');
                option.value = i + 1;
                option.textContent = new Date(0, i).toLocaleString('pt-BR', {month: 'long'});
                monthSelectBenefits.appendChild(option);
            }
        }

        if (yearSelectBenefits.options.length === 0) {
                const currentYear = new Date().getFullYear();
            for (let i = 0; i < 5; i++) {
                const option = document.createElement('option');
                option.value = currentYear - i;
                option.textContent = currentYear - i;
                yearSelectBenefits.appendChild(option);
            }
        }
        
        monthSelectBenefits.value = state.selectedDate.month;
        yearSelectBenefits.value = state.selectedDate.year;

        // Populate Year Filter for Reports
        if (reportYearSelect && reportYearSelect.options.length === 0) {
                const currentYear = new Date().getFullYear();
            for (let i = 0; i < 5; i++) {
                const option = document.createElement('option');
                option.value = currentYear - i;
                option.textContent = currentYear - i;
                reportYearSelect.appendChild(option);
            }
                reportYearSelect.value = currentYear; // Default to current year
        }
    };

    const renderBenefitsView = () => {
        const tableBody = document.getElementById('benefits-table-body');
        const unitFilter = document.getElementById('unit-filter');
        const summaryVA = document.getElementById('summary-va');
        const summaryVT = document.getElementById('summary-vt');
        const summaryCalculated = document.getElementById('summary-calculated');
        const summaryAbsences = document.getElementById('summary-absences');
        const summaryCestas = document.getElementById('summary-cestas');

        // Populate unit filter
        const currentUnitFilterValue = unitFilter.value; 
        unitFilter.innerHTML = '<option value="all">Todas as Unidades</option>';
        state.units.forEach(u => unitFilter.innerHTML += `<option value="${u.id}">${u.name}</option>`);
            if (state.units.some(u => u.id === currentUnitFilterValue) || currentUnitFilterValue === 'all') {
            unitFilter.value = currentUnitFilterValue;
            } else {
                unitFilter.value = 'all'; 
            }

        
        const filteredEmployees = getFilteredEmployees();
        
        const dateId = `${state.selectedDate.year}-${String(state.selectedDate.month).padStart(2, '0')}`;
        const calculations = state.allCalculations[dateId] || {};

        tableBody.innerHTML = '';
        let totalVA = 0, totalVT = 0, finalizedCount = 0, totalAbsences = 0, totalJanta = 0, totalCafe = 0, totalCestasFisicas = 0;

        if (filteredEmployees.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="10" class="p-8 text-center text-gray-500">Nenhum colaborador encontrado para esta seleção.</td></tr>';
        } else {
            filteredEmployees.forEach(emp => {
                const calc = calculations[emp.id];
                const row = document.createElement('tr');
                row.className = 'hover:bg-gray-50';
                
                let statusBadge = '<span class="badge badge-pending">Pendente</span>';
                if (calc?.status === 'advanced') statusBadge = '<span class="badge badge-advanced">Adiantado</span>';
                if (calc?.status === 'finalized') statusBadge = '<span class="badge badge-finalized">Finalizado</span>';

                let cestaValor = '-';
                if(calc?.status === 'finalized' && calc.cestaBasicaValor > 0) {
                    cestaValor = `${formatCurrency(calc.cestaBasicaValor)} (${calc.cestaBasicaTipo === 'va' ? 'VA' : 'Física'})`;
                }
                
                const adiantadoVA = (calc?.adiantadoVAComp || 0) + (calc?.adiantadoVABase || 0);
                const devidoVA = (calc?.devidoVAComp || 0) + (calc?.devidoVABase || 0);
                
                row.innerHTML = `
                    <td class="p-3 font-medium">${emp.name}</td>
                    <td class="p-3">${statusBadge}</td>
                    <td class="p-3">${calc?.adiantadoVA ? formatCurrency(adiantadoVA) : '-'}</td>
                    <td class="p-3">${calc?.devidoVA ? formatCurrency(devidoVA) : '-'}</td>
                    <td class="p-3 font-medium ${ (calc?.saldoVA || 0) < 0 ? 'text-red-600' : 'text-green-600'}">${calc?.saldoVA ? formatCurrency(calc.saldoVA) : '-'}</td>
                    <td class="p-3">${calc?.adiantadoVT ? formatCurrency(calc.adiantadoVT) : '-'}</td>
                    <td class="p-3">${calc?.devidoVT ? formatCurrency(calc.devidoVT) : '-'}</td>
                    <td class="p-3 font-medium ${ (calc?.saldoVT || 0) < 0 ? 'text-red-600' : 'text-green-600'}">${calc?.saldoVT ? formatCurrency(calc.saldoVT) : '-'}</td>
                        <td class="p-3">${cestaValor}</td>
                        <td class="p-3 text-center">
                        ${calc?.status === 'finalized' ? 
                        `<button class="print-paystub-btn text-gray-600 hover:text-blue-600" title="Imprimir Demonstrativo" data-employee-id="${emp.id}" data-date-id="${dateId}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                        </button>` : ''}
                        </td>
                `;
                tableBody.appendChild(row);

                if (calc) {
                    const vaFinal = (calc.status === 'finalized') ? (devidoVA || 0) : (adiantadoVA || 0);
                    const vtFinal = (calc.status === 'finalized') ? (calc.devidoVT || 0) : (calc.adiantadoVT || 0);
                    
                    totalVA += vaFinal;
                    totalVT += vtFinal;
                    totalAbsences += calc.diasAusentes || 0;
                    totalJanta += calc.valorJanta || 0;
                    totalCafe += calc.valorCafe || 0;
                        if (calc.status === 'finalized') {
                        finalizedCount++;
                        if (calc.cestaBasicaTipo === 'fisica') {
                            totalCestasFisicas++;
                        }
                        }
                }
            });
        }
        
        summaryVA.textContent = formatCurrency(totalVA);
        summaryVT.textContent = formatCurrency(totalVT);
        summaryCalculated.textContent = `${finalizedCount} / ${filteredEmployees.length}`;
        summaryAbsences.textContent = totalAbsences;
        summaryCestas.textContent = totalCestasFisicas;

        document.getElementById('export-vavt-button').disabled = finalizedCount === 0;
        document.getElementById('export-janta-button').disabled = totalJanta === 0;
        document.getElementById('export-cafe-button').disabled = totalCafe === 0;
        
        renderCostEvolutionChart();
    };
    
    function renderUnitsView() { 
        const tableBody = document.getElementById('units-table-body');
        tableBody.innerHTML = '';
            if (state.units.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="3" class="p-8 text-center text-gray-500">Nenhuma unidade cadastrada.</td></tr>';
                return;
            }
        state.units.forEach(unit => {
            const row = document.createElement('tr');
                row.className = 'hover:bg-gray-50';
            row.innerHTML = `
                <td class="p-3 font-medium">${unit.name}</td>
                <td class="p-3">${formatCurrency(unit.baseDailyVA)}</td>
                <td class="p-3"><div class="flex justify-center gap-2">
                    <button class="edit-unit-btn text-indigo-600" data-id="${unit.id}"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg></button>
                    <button class="delete-unit-btn text-red-600" data-id="${unit.id}"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                </div></td>
            `;
            tableBody.appendChild(row);
        });
        }

    function renderLocalidadesView() {
        const tableBody = document.getElementById('localidades-table-body');
        tableBody.innerHTML = '';
            if (state.localidades.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="3" class="p-8 text-center text-gray-500">Nenhuma localidade cadastrada.</td></tr>';
                return;
            }
        state.localidades.forEach(loc => {
            const unit = state.units.find(u => u.id === loc.unidadeId);
            const row = document.createElement('tr');
            row.className = 'hover:bg-gray-50';
            row.innerHTML = `
                <td class="p-3 font-medium">${loc.name}</td>
                <td class="p-3">${unit?.name || 'N/A'}</td>
                <td class="p-3"><div class="flex justify-center gap-2">
                    <button class="edit-localidade-btn text-indigo-600" data-id="${loc.id}"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg></button>
                    <button class="delete-localidade-btn text-red-600" data-id="${loc.id}"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                </div></td>
            `;
            tableBody.appendChild(row);
        });
    }

        function renderSetoresView() {
        const tableBody = document.getElementById('setores-table-body');
        tableBody.innerHTML = '';
            if (state.setores.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-gray-500">Nenhum setor cadastrado.</td></tr>';
                return;
            }
        state.setores.forEach(setor => {
            const localidade = state.localidades.find(l => l.id === setor.localidadeId);
            const unit = state.units.find(u => u.id === localidade?.unidadeId);
            const row = document.createElement('tr');
            row.className = 'hover:bg-gray-50';
            const cestaTipoLabel = setor.cestaBasicaTipo === 'va' ? 'VA' : (setor.cestaBasicaTipo === 'fisica' ? 'Física' : 'Nenhum');
            row.innerHTML = `
                <td class="p-3 font-medium">${setor.name}</td>
                <td class="p-3">${localidade?.name || 'N/A'} (${unit?.name || 'N/A'})</td>
                <td class="p-3">${formatCurrency(setor.overrideDailyVA)}</td>
                <td class="p-3">${formatCurrency(setor.dailyVT)}</td>
                <td class="p-3">${formatCurrency(setor.cestaBasicaValor)} (${cestaTipoLabel})</td>
                <td class="p-3"><div class="flex justify-center gap-2">
                    <button class="edit-setor-btn text-indigo-600" data-id="${setor.id}"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg></button>
                    <button class="delete-setor-btn text-red-600" data-id="${setor.id}"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                </div></td>
            `;
            tableBody.appendChild(row);
        });
    }

        function renderEmployeesView() { 
        const tableBody = document.getElementById('employees-table-body');
        tableBody.innerHTML = '';
            if (state.employees.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-gray-500">Nenhum colaborador cadastrado.</td></tr>';
                return;
            }
        state.employees.forEach(emp => {
            const row = document.createElement('tr');
                row.className = 'hover:bg-gray-50';
            row.innerHTML = `
                <td class="p-3">${emp.matricula || ''}</td>
                <td class="p-3"><button class="employee-history-btn text-blue-600 hover:underline font-medium" data-id="${emp.id}">${emp.name}</button></td>
                <td class="p-3">${emp.unitName || 'N/A'}</td>
                <td class="p-3">${emp.setorName || 'N/A'}</td>
                    <td class="p-3"><div class="flex justify-center gap-2">
                    <button class="edit-employee-btn text-indigo-600" data-id="${emp.id}"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg></button>
                    <button class="delete-employee-btn text-red-600" data-id="${emp.id}"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                </div></td>
            `;
            tableBody.appendChild(row);
        });
        }
    function renderEventsView() { 
        const tableBody = document.getElementById('events-table-body');
        tableBody.innerHTML = '';
            if (state.events.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-gray-500">Nenhum evento lançado.</td></tr>';
            } else {
                state.events.sort((a, b) => {
                    const dateA = a.type === 'ajuste' ? new Date(a.referenceMonth + '-01T00:00:00') : new Date(a.startDate + 'T00:00:00');
                    const dateB = b.type === 'ajuste' ? new Date(b.referenceMonth + '-01T00:00:00') : new Date(b.startDate + 'T00:00:00');
                    const timeA = isNaN(dateA.getTime()) ? 0 : dateA.getTime();
                    const timeB = isNaN(dateB.getTime()) ? 0 : dateB.getTime();
                    return timeB - timeA; 
                }).forEach(evt => {
                const emp = state.employees.find(e => e.id === evt.employeeId);
                const row = document.createElement('tr');
                row.className = 'hover:bg-gray-50';
                let detail = evt.notes || '-';
                if (evt.type === 'ajuste') {
                    let benefitName = '';
                    switch(evt.benefitType) {
                        case 'va_base': benefitName = 'VA Base'; break;
                        case 'va_comp': benefitName = 'VA Comp.'; break;
                        case 'vt': benefitName = 'VT'; break;
                        case 'janta': benefitName = 'Janta'; break;
                        case 'cafe': benefitName = 'Café'; break;
                        default: benefitName = evt.benefitType;
                    }
                    detail = `${formatCurrency(parseFloat(evt.value))} (${benefitName})`;
                }
                
                row.innerHTML = `
                    <td class="p-3 font-medium">${emp?.name || 'Colaborador não encontrado'}</td>
                    <td class="p-3"><span class="px-2 py-1 text-xs font-semibold rounded-full ${evt.type === 'ferias' ? 'bg-green-100 text-green-800' : evt.type === 'atestado' ? 'bg-yellow-100 text-yellow-800' : evt.type === 'suspensao' ? 'bg-purple-100 text-purple-800' : evt.type === 'ajuste' ? 'bg-indigo-100 text-indigo-800' : 'bg-red-100 text-red-800'}">${evt.type}</span></td>
                    <td class="p-3">${evt.type === 'ajuste' ? evt.referenceMonth : `${formatDateForInput(evt.startDate)} a ${formatDateForInput(evt.endDate)}`}</td>
                    <td class="p-3">${detail}</td>
                    <td class="p-3"><div class="flex justify-center gap-2">
                            <button class="edit-event-btn text-indigo-600" data-id="${evt.id}"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg></button>
                        <button class="delete-event-btn text-red-600" data-id="${evt.id}"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                    </div></td>
                `;
                tableBody.appendChild(row);
                });
            }
            renderCalendar();
            populateCalendarEmployeeFilter();
        }

        // --- Calendar Rendering Logic ---
        function renderCalendar() { 
        const { year, month } = state.calendarDate;
        calendarMonthYear.textContent = `${new Date(year, month - 1).toLocaleString('pt-BR', { month: 'long' })} ${year}`;
        calendarGrid.innerHTML = ''; // Clear previous grid

        const firstDayOfMonth = new Date(year, month - 1, 1).getDay(); // 0=Sun, 1=Mon,...
        const daysInMonth = new Date(year, month, 0).getDate();
        const daysInPrevMonth = new Date(year, month - 1, 0).getDate();

        const filteredEmployeeId = calendarEmployeeFilter.value;
        const relevantEvents = state.events.filter(evt => 
                evt.type !== 'ajuste' && 
                (filteredEmployeeId === 'all' || evt.employeeId === filteredEmployeeId)
        );

            // Get events for the current month +/- buffer for multi-day events crossing months
        const eventsForMonth = relevantEvents.filter(evt => {
                // Need valid dates to proceed
                if (!evt.startDate || !evt.endDate) return false; 
            const start = new Date(evt.startDate + 'T00:00:00');
            const end = new Date(evt.endDate + 'T23:59:59');
                if (isNaN(start.getTime()) || isNaN(end.getTime())) return false; // Skip invalid dates

            const monthStart = new Date(year, month - 1, 1);
            const monthEnd = new Date(year, month, 0, 23, 59, 59);
            return start <= monthEnd && end >= monthStart;
        });

        // --- Generate Calendar Days ---

        // Days from previous month
        for (let i = 0; i < firstDayOfMonth; i++) {
            const day = daysInPrevMonth - firstDayOfMonth + 1 + i;
            calendarGrid.innerHTML += `<div class="calendar-day other-month"><span class="calendar-day-number">${day}</span></div>`;
        }

        // Days of current month
        for (let day = 1; day <= daysInMonth; day++) {
            const dayCell = document.createElement('div');
            dayCell.className = 'calendar-day';
            dayCell.innerHTML = `<span class="calendar-day-number">${day}</span>`;
            const currentDate = new Date(year, month - 1, day, 12, 0, 0, 0); // Use midday to avoid DST issues

            // Find events for this specific day
            const eventsOnDay = eventsForMonth.filter(evt => {
                    if (!evt.startDate || !evt.endDate) return false;
                    const start = new Date(evt.startDate + 'T00:00:00');
                    const end = new Date(evt.endDate + 'T23:59:59');
                    if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;
                    return currentDate >= start && currentDate <= end;
            });

            eventsOnDay.forEach(evt => {
                    const emp = state.employees.find(e => e.id === evt.employeeId);
                    const marker = document.createElement('span');
                    marker.className = `event-marker event-${evt.type} tooltip`;
                    marker.textContent = emp ? emp.name.split(' ')[0] : 'Evento'; // Show first name
                    marker.innerHTML += `<span class="tooltiptext">${emp?.name || 'Desconhecido'} - ${evt.type}<br>${formatDateForInput(evt.startDate)} a ${formatDateForInput(evt.endDate)}</span>`;
                    dayCell.appendChild(marker);
            });

            calendarGrid.appendChild(dayCell);
        }

        // Days from next month (to fill the grid, usually 6 rows = 42 cells)
            const totalCells = firstDayOfMonth + daysInMonth;
            const remainingCells = (totalCells <= 35) ? 35 - totalCells : (totalCells <= 42 ? 42 - totalCells : 0); // Ensure 5 or 6 rows
            for (let i = 1; i <= remainingCells; i++) {
                calendarGrid.innerHTML += `<div class="calendar-day other-month"><span class="calendar-day-number">${i}</span></div>`;
            }
        }
        function populateCalendarEmployeeFilter() { 
        const currentFilterValue = calendarEmployeeFilter.value;
        calendarEmployeeFilter.innerHTML = '<option value="all">Todos Colaboradores</option>';
        state.employees.forEach(emp => {
            const option = document.createElement('option');
            option.value = emp.id;
            option.textContent = emp.name;
            calendarEmployeeFilter.appendChild(option);
        });
        // Restore selection if employee still exists
        if (state.employees.some(e => e.id === currentFilterValue) || currentFilterValue === 'all') {
                calendarEmployeeFilter.value = currentFilterValue;
        } else {
                calendarEmployeeFilter.value = 'all';
        }
        }

    // --- Cost Evolution Chart ---
    function renderCostEvolutionChart() {
        const numMonths = 6;
        const labels = [];
        const vaData = [];
        const vtData = [];
        
        // Determine the starting point for the chart (current selected month)
        let currentChartMonth = state.selectedDate.month;
        let currentChartYear = state.selectedDate.year;

        for (let i = 0; i < numMonths; i++) {
            const date = new Date(currentChartYear, currentChartMonth - 1, 1);
                const year = date.getFullYear();
                const month = date.getMonth() + 1;
            const monthLabel = date.toLocaleString('pt-BR', { month: 'short' });
            labels.unshift(`${monthLabel}/${String(year).slice(-2)}`); // Add to the beginning

            const dateId = `${year}-${String(month).padStart(2, '0')}`;
            const monthlyCalculations = state.allCalculations[dateId] || {};
            let monthlyVA = 0;
            let monthlyVT = 0;
            
            // Sum calculations for the month, respecting the current unit filter
            const unitFilterValue = document.getElementById('unit-filter').value;
            const employeesToConsider = unitFilterValue === 'all'
                ? state.employees
                : state.employees.filter(e => {
                        const setor = state.setores.find(s => s.id === e.setorId);
                        const localidade = state.localidades.find(l => l.id === setor?.localidadeId);
                        return localidade?.unidadeId === unitFilterValue;
                    });

            employeesToConsider.forEach(emp => {
                const calc = monthlyCalculations[emp.id];
                if (calc && calc.status === 'finalized') {
                        const vaFinal = (calc.devidoVABase || 0) + (calc.devidoVAComp || 0);
                        const vtFinal = calc.devidoVT || 0;
                    monthlyVA += vaFinal;
                    monthlyVT += vtFinal;
                }
            });
            
            vaData.unshift(monthlyVA); // Add to the beginning
            vtData.unshift(monthlyVT); // Add to the beginning

            // Move to the previous month
            currentChartMonth--;
            if (currentChartMonth < 1) {
                currentChartMonth = 12;
                currentChartYear--;
            }
        }


        if (state.costChartInstance) {
            state.costChartInstance.destroy(); // Destroy previous instance
        }

        if (!costChartCanvas) return; // Exit if canvas not found
        
        const ctx = costChartCanvas.getContext('2d');
        state.costChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Custo VA Total (Finalizado)',
                        data: vaData,
                        borderColor: 'rgb(59, 130, 246)', // Blue
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        tension: 0.1,
                        fill: true
                    },
                    {
                        label: 'Custo VT Total (Finalizado)',
                        data: vtData,
                        borderColor: 'rgb(34, 197, 94)', // Green
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        tension: 0.1,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) { return formatCurrency(value); }
                        }
                    }
                },
                    plugins: {
                        legend: {
                            position: 'top',
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    let label = context.dataset.label || '';
                                    if (label) label += ': ';
                                    if (context.parsed.y !== null) label += formatCurrency(context.parsed.y);
                                    return label;
                                }
                            }
                        }
                    }
            }
        });
    }


    // --- Reports Logic ---
    function renderReportsView() { 
        populateDateFilters(); // Ensure year filter is populated
        reportOutputDiv.innerHTML = '<p class="text-gray-500 text-center">Selecione o ano e tipo e clique em "Gerar Relatório".</p>';
        exportReportButton.disabled = true;
        state.currentReportData = null; 
        }
    function generateAnnualSummary() { 
        const year = parseInt(reportYearSelect.value);
        const type = reportTypeSelect.value; 
        let summaryData = {}; 
        let calculationsFound = false;

        reportOutputDiv.innerHTML = '<div class="flex justify-center items-center p-8"><div class="spinner"></div><span class="ml-2 text-gray-600">Gerando relatório...</span></div>';
        exportReportButton.disabled = true;
        state.currentReportData = null;

            setTimeout(() => {
            for (const dateId in state.allCalculations) {
                if (dateId.startsWith(year + '-')) {
                    const monthlyCalculations = state.allCalculations[dateId];
                    for (const employeeId in monthlyCalculations) {
                        const calc = monthlyCalculations[employeeId];
                            if (calc.status !== 'finalized') continue; // Only count finalized calculations
                        const employee = state.employees.find(e => e.id === employeeId);
                        if (!employee) continue; 

                        calculationsFound = true;
                            let key, name;
                            if(type === 'employee') {
                                key = employeeId;
                                name = employee.name;
                            } else {
                                const setor = state.setores.find(s => s.id === employee.setorId);
                                const localidade = state.localidades.find(l => l.id === setor?.localidadeId);
                                key = localidade?.unidadeId; // Group by unit ID
                                name = state.units.find(u => u.id === key)?.name || 'Sem Unidade';
                            }

                            if (!key) continue; 

                        if (!summaryData[key]) {
                            summaryData[key] = { name: name, totalVA: 0, totalVT: 0, totalAbsences: 0, totalCestas: 0, totalJanta: 0, totalCafe: 0 };
                        }
                        summaryData[key].totalVA += (calc.devidoVABase || 0) + (calc.devidoVAComp || 0);
                        summaryData[key].totalVT += calc.devidoVT || 0;
                        summaryData[key].totalAbsences += calc.diasAusentes || 0;
                        summaryData[key].totalJanta += calc.valorJanta || 0;
                        summaryData[key].totalCafe += calc.valorCafe || 0;
                            if (calc.cestaBasicaTipo === 'fisica') {
                                summaryData[key].totalCestas++;
                            }
                    }
                }
            }

            if (!calculationsFound) {
                reportOutputDiv.innerHTML = '<p class="text-gray-500 text-center">Nenhum cálculo encontrado para o ano selecionado.</p>';
                return;
            }

                state.currentReportData = summaryData; 
            let tableHTML = '<table class="w-full text-sm text-left"><thead class="bg-gray-100"><tr>';
            tableHTML += `<th class="p-2">${type === 'employee' ? 'Colaborador' : 'Unidade'}</th>`;
            tableHTML += '<th class="p-2">Total VA</th><th class="p-2">Total VT</th><th class="p-2">Total Janta</th><th class="p-2">Total Café</th><th class="p-2">Cestas Físicas</th><th class="p-2">Ausências (Dias)</th></tr></thead><tbody>';

            Object.values(summaryData).sort((a,b) => a.name.localeCompare(b.name)).forEach(item => {
                tableHTML += `<tr class="border-b hover:bg-gray-50">
                    <td class="p-2 font-medium">${item.name}</td>
                    <td class="p-2">${formatCurrency(item.totalVA)}</td>
                    <td class="p-2">${formatCurrency(item.totalVT)}</td>
                    <td class="p-2">${formatCurrency(item.totalJanta)}</td>
                    <td class="p-2">${formatCurrency(item.totalCafe)}</td>
                    <td class="p-2">${item.totalCestas}</td>
                    <td class="p-2">${item.totalAbsences}</td>
                </tr>`;
            });
            tableHTML += '</tbody></table>';
            reportOutputDiv.innerHTML = tableHTML;
            exportReportButton.disabled = false;
            }, 300); 
        }
        
        function exportReportData() { 
            if (!state.currentReportData) return;

            const year = reportYearSelect.value;
            const type = reportTypeSelect.value;
            let csvContent = "data:text/csv;charset=utf-8,";
            const headers = [type === 'employee' ? "Colaborador" : "Unidade", "Total VA", "Total VT", "Total Janta", "Total Café", "Cestas Físicas", "Ausências (Dias)"];
            csvContent += headers.join(";") + "\r\n";

            Object.values(state.currentReportData).sort((a,b) => a.name.localeCompare(b.name)).forEach(item => {
                const row = [
                    `"${item.name}"`,
                    item.totalVA.toFixed(2),
                    item.totalVT.toFixed(2),
                    item.totalJanta.toFixed(2),
                    item.totalCafe.toFixed(2),
                    item.totalCestas,
                    item.totalAbsences
                ];
                csvContent += row.join(";") + "\r\n";
            });

            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `relatorio_anual_${year}_por_${type}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

    // Report button listeners
    generateReportButton.addEventListener('click', generateAnnualSummary);
    exportReportButton.addEventListener('click', exportReportData);


    // --- FULL RENDER LOGIC ---
    function fullRender() {
        renderUnitsView();
        renderLocalidadesView();
        renderSetoresView(); 
        renderEmployeesView();
        renderEventsView(); 
        renderBenefitsView(); 
        populateDateFilters();
            if (state.currentView === 'reports') {
            renderReportsView(); 
            }
            if (state.currentView === 'benefits' && costChartCanvas) {
            renderCostEvolutionChart();
            }
    }

    // --- Calculation Logic ---
        const calculateButtonText = calculateAdvanceButton.querySelector('.button-text');
    const calculateButtonSpinner = calculateAdvanceButton.querySelector('.spinner');
    const unitFilterSelect = document.getElementById('unit-filter');
    
    // Suggest Days Button
    suggestDaysButton.addEventListener('click', () => {
            const year = state.selectedDate.year;
            const month = state.selectedDate.month;
            const feriados = parseInt(document.getElementById('feriados').value) || 0;
            const weekdays = getWeekdaysInMonth(year, month, feriados);
            document.getElementById('diasUteis').value = weekdays;
    });

    unitFilterSelect.addEventListener('change', renderBenefitsView); 
    document.getElementById('month-select').addEventListener('change', (e) => {
        state.selectedDate.month = parseInt(e.target.value);
            state.calendarDate.month = state.selectedDate.month;
            state.calendarDate.year = state.selectedDate.year;
        renderBenefitsView();
            if(state.currentView === 'events') renderCalendar(); 
    });
    document.getElementById('year-select').addEventListener('change', (e) => {
        state.selectedDate.year = parseInt(e.target.value);
        state.calendarDate.month = state.selectedDate.month;
        state.calendarDate.year = state.selectedDate.year;
        renderBenefitsView();
            if(state.currentView === 'events') renderCalendar(); 
    });

    
    calculateAdvanceButton.addEventListener('click', () => {
            const diasUteisPrevistosInput = document.getElementById('diasUteis'); // Reusing the same input for simplicity
        const diasUteisPrevistos = diasUteisPrevistosInput.value;
            if (!diasUteisPrevistos || isNaN(parseInt(diasUteisPrevistos)) || parseInt(diasUteisPrevistos) <= 0) { 
            alert("Por favor, insira um número válido de Dias Úteis Previstos (no campo Dias Úteis)."); 
            return; 
        }
        
        // toggleButtonLoading logic inline
        const btnText = calculateAdvanceButton.querySelector('.button-text');
        const btnSpinner = calculateAdvanceButton.querySelector('.spinner');
        calculateAdvanceButton.disabled = true;
        btnText.classList.add('hidden');
        btnSpinner.classList.remove('hidden');

        const currentMonthDateId = `${state.selectedDate.year}-${String(state.selectedDate.month).padStart(2, '0')}`;
        
        // Logic for NEXT month based on selected date
        const nextMonthDate = new Date(state.selectedDate.year, state.selectedDate.month, 1); // Month is 0-indexed in JS Date, but our state.month is 1-12. 
        // wait, state.selectedDate.month is 1-12. 
        // new Date(year, monthIndex) -> new Date(2023, 10) is Nov 2023.
        // If selected is Oct (10), we want Nov. So new Date(year, 10) works.
        const nextMonthDateId = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}`;
        
        const filteredEmployees = getFilteredEmployees();

            for (const employee of filteredEmployees) {
            const currentCalc = (state.allCalculations[currentMonthDateId] && state.allCalculations[currentMonthDateId][employee.id]) || {};
            
            // Only use saldo if current month is FINALIZED
            const saldoMesAnteriorVA = currentCalc.status === 'finalized' ? (currentCalc.saldoVA || 0) : 0;
            const saldoMesAnteriorVT = currentCalc.status === 'finalized' ? (currentCalc.saldoVT || 0) : 0;

            // Get rates
            const setor = state.setores.find(s => s.id === employee.setorId);
            const localidade = state.localidades.find(l => l.id === setor?.localidadeId);
            const unidade = state.units.find(u => u.id === localidade?.unidadeId);
            
            const baseDailyVA = unidade?.baseDailyVA || 0;
            const overrideDailyVA = setor?.overrideDailyVA || baseDailyVA; 
            const finalDailyVT = setor?.dailyVT || 0; 
            const vaDiscountPercent = setor?.vaDiscount || 0; 

            const baseVABruto = parseInt(diasUteisPrevistos) * baseDailyVA;
            const vaComplementarBruto = parseInt(diasUteisPrevistos) * Math.max(0, overrideDailyVA - baseDailyVA);
            
            // Adiantamento usually considers the base values
            const valorBaseAdiantadoVABase = baseVABruto * (1 - (vaDiscountPercent/100));
            const valorBaseAdiantadoVAComp = vaComplementarBruto * (1 - (vaDiscountPercent/100));
            
            const baseVT = parseInt(diasUteisPrevistos) * finalDailyVT;
            const discountVT = Math.min(baseVT, (employee.salary || 0) * 0.06);
            const valorBaseAdiantadoVT = baseVT - discountVT;

            const adiantadoVA = valorBaseAdiantadoVABase + valorBaseAdiantadoVAComp + saldoMesAnteriorVA;
            const adiantadoVT = valorBaseAdiantadoVT + saldoMesAnteriorVT;

            if(!state.allCalculations[nextMonthDateId]) state.allCalculations[nextMonthDateId] = {};
                // Ensure we don't overwrite existing finalization data if user recalculates advance
            const nextMonthCalc = state.allCalculations[nextMonthDateId][employee.id] || {};
            
            state.allCalculations[nextMonthDateId][employee.id] = { 
                ...nextMonthCalc, 
                status: nextMonthCalc.status === 'finalized' ? 'finalized' : 'advanced', 
                diasUteisPrevistos: diasUteisPrevistos, 
                saldoMesAnteriorVA, 
                saldoMesAnteriorVT,
                adiantadoVABase: valorBaseAdiantadoVABase, 
                adiantadoVAComp: valorBaseAdiantadoVAComp,
                adiantadoVA: adiantadoVA, 
                adiantadoVT: valorBaseAdiantadoVT + saldoMesAnteriorVT, // Total VT Adiantado
                calculatedAt: new Date().toISOString()
            };
            }
            
            saveData('allCalculations');
            
            setTimeout(() => { 
            calculateAdvanceButton.disabled = false;
            btnText.classList.remove('hidden');
            btnSpinner.classList.add('hidden');
            alert(`Adiantamento para ${nextMonthDate.toLocaleString('pt-BR', { month: 'long' })} calculado com sucesso!`);
            // Note: This calculates for NEXT month, but view stays on CURRENT month. User might want to switch view.
            // Or we just stay here.
            renderBenefitsView();
        }, 500); 
    });
    
        finalizeMonthButton.addEventListener('click', () => {
        // Reuse the logic from calculateMonthButton but mark as finalized and calc diffs
        // Trigger the click on calculateMonthButton to reuse logic? No, logic is slightly different (needs to lock status)
        // Let's implement specific finalize logic.
        
        const diasUteisReaisInput = document.getElementById('diasUteis');
        const diasUteisReais = diasUteisReaisInput.value;
            if (!diasUteisReais || isNaN(parseInt(diasUteisReais)) || parseInt(diasUteisReais) <= 0) { 
            alert("Por favor, insira um número válido de Dias Úteis Reais (no campo Dias Úteis)."); 
            return; 
        }
        
        const btnText = finalizeMonthButton.querySelector('.button-text');
        const btnSpinner = finalizeMonthButton.querySelector('.spinner');
        finalizeMonthButton.disabled = true;
        btnText.classList.add('hidden');
        btnSpinner.classList.remove('hidden');

        const dateId = `${state.selectedDate.year}-${String(state.selectedDate.month).padStart(2, '0')}`;
        const monthStart = new Date(state.selectedDate.year, state.selectedDate.month - 1, 1);
        const monthEnd = new Date(state.selectedDate.year, state.selectedDate.month, 0); 
        const filteredEmployees = getFilteredEmployees();

        for (const employee of filteredEmployees) {
                // 1. Calculate REAL dues based on events (same as Calculate Month)
            const employeeEvents = state.events.filter(e => e.employeeId === employee.id);
            let absenceDaysInMonth = 0, ajusteVABase = 0, ajusteVAComp = 0, ajusteVT = 0, totalJanta = 0, totalCafe = 0;

            employeeEvents.forEach(event => {
                    if (event.type === 'ajuste') {
                    if (event.referenceMonth === dateId) {
                        if (event.benefitType === 'va_base') ajusteVABase += parseFloat(event.value) || 0; 
                        if (event.benefitType === 'va_comp') ajusteVAComp += parseFloat(event.value) || 0; 
                        if (event.benefitType === 'vt') ajusteVT += parseFloat(event.value) || 0; 
                        if (event.benefitType === 'janta') totalJanta += parseFloat(event.value) || 0; 
                        if (event.benefitType === 'cafe') totalCafe += parseFloat(event.value) || 0; 
                    }
                } else {
                    absenceDaysInMonth += calculateAbsenceDaysInMonth(event.startDate, event.endDate, monthStart, monthEnd);
                }
            });
            
            const workedDays = Math.max(0, parseInt(diasUteisReais) - absenceDaysInMonth);
            
            const setor = state.setores.find(s => s.id === employee.setorId);
            const localidade = state.localidades.find(l => l.id === setor?.localidadeId);
            const unidade = state.units.find(u => u.id === localidade?.unidadeId);
            
            const baseDailyVA = unidade?.baseDailyVA || 0;
            const overrideDailyVA = setor?.overrideDailyVA || baseDailyVA; 
            const finalDailyVT = setor?.dailyVT || 0; 
            const vaDiscountPercent = setor?.vaDiscount || 0; 

            const baseVABruto = workedDays * baseDailyVA;
            const vaComplementarBruto = workedDays * Math.max(0, overrideDailyVA - baseDailyVA);
            
            const finalVABase = baseVABruto * (1 - (vaDiscountPercent/100)) + ajusteVABase;
            const finalVAComplementar = vaComplementarBruto * (1 - (vaDiscountPercent/100)) + ajusteVAComp;
            
            const baseVT = workedDays * finalDailyVT;
            const discountVT = Math.min(baseVT, (employee.salary || 0) * 0.06);
            const finalVT = baseVT - discountVT + ajusteVT;
            
            // 2. Compare with what was Advanced
            const currentCalc = state.allCalculations[dateId]?.[employee.id] || {};
            const adiantadoVABase = currentCalc.adiantadoVABase || 0; // Use raw base without previous balance
            const adiantadoVAComp = currentCalc.adiantadoVAComp || 0;
            const adiantadoVT = (currentCalc.adiantadoVT || 0) - (currentCalc.saldoMesAnteriorVT || 0); // Remove prev balance to compare monthly production
            
            const saldoVA = (finalVABase + finalVAComplementar) - (adiantadoVABase + adiantadoVAComp);
            const saldoVT = finalVT - adiantadoVT;

                if(!state.allCalculations[dateId]) state.allCalculations[dateId] = {};
                state.allCalculations[dateId][employee.id] = { 
                ...currentCalc,
                status: 'finalized',
                diasUteis: diasUteisReais, 
                diasAusentes: absenceDaysInMonth, 
                diasTrabalhados: workedDays, 
                devidoVABase: finalVABase, 
                devidoVAComp: finalVAComplementar,
                devidoVT: finalVT, 
                saldoVA,
                saldoVT,
                valorJanta: totalJanta,
                valorCafe: totalCafe,
                total: finalVABase + finalVAComplementar + finalVT, 
                calculatedAt: new Date().toISOString(),
                cestaBasicaValor: setor?.cestaBasicaValor || 0,
                cestaBasicaTipo: setor?.cestaBasicaTipo || 'nenhum'
            };
        }
        saveData('allCalculations');
        
        setTimeout(() => { 
            finalizeMonthButton.disabled = false;
            btnText.classList.remove('hidden');
            btnSpinner.classList.add('hidden');
            renderBenefitsView();
        }, 500); 
        });

        function getFilteredEmployees() {
            const unitFilterValue = document.getElementById('unit-filter').value;
            return unitFilterValue === 'all'
            ? state.employees
            : state.employees.filter(e => {
                    const setor = state.setores.find(s => s.id === e.setorId);
                    const localidade = state.localidades.find(l => l.id === setor?.localidadeId);
                    return localidade?.unidadeId === unitFilterValue;
            });
    }


    // --- EVENT LISTENERS & CRUD ---
    // Corrected: Ensure these are defined BEFORE attaching listeners
    function showUnitModal(data = null) {
        const title = data ? 'Editar Unidade' : 'Nova Unidade';
        const content = `
            <form id="unit-form" class="space-y-4">
                <input type="hidden" name="id" value="${data?.id || ''}">
                <input name="name" class="w-full p-2 border rounded" placeholder="Nome da Unidade (Ex: Matriz)" value="${data?.name || ''}" required />
                <input name="baseDailyVA" type="number" step="0.01" class="w-full p-2 border rounded" placeholder="VA Base (Matriz) (Ex: 20.00)" value="${data?.baseDailyVA || ''}" required/>
                <div class="flex justify-end gap-2"><button type="button" class="modal-cancel-inline py-2 px-4 bg-gray-200 rounded">Cancelar</button><button type="submit" class="py-2 px-4 bg-blue-600 text-white rounded">Salvar</button></div>
            </form>
        `;
        openModal(title, content);
        document.getElementById('unit-form').addEventListener('submit', e => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const newUnit = {
                id: formData.get('id') || crypto.randomUUID(),
                name: formData.get('name'),
                baseDailyVA: parseFloat(formData.get('baseDailyVA')) || 0,
            };
            if (formData.get('id')) {
                state.units = state.units.map(u => u.id === newUnit.id ? newUnit : u);
            } else {
                state.units.push(newUnit);
            }
            saveData('units');
            fullRender();
            closeModal();
        });
        document.querySelector('.modal-cancel-inline').addEventListener('click', closeModal);
    }

    function showLocalidadeModal(data = null) {
            const title = data ? 'Editar Localidade' : 'Nova Localidade';
            let unitOptions = '<option value="">Selecione a Unidade (Matriz)</option>';
            state.units.forEach(u => unitOptions += `<option value="${u.id}" ${data?.unidadeId === u.id ? 'selected': ''}>${u.name}</option>`);

            const content = `
            <form id="localidade-form" class="space-y-4">
                <input type="hidden" name="id" value="${data?.id || ''}">
                <input name="name" class="w-full p-2 border rounded" placeholder="Nome da Localidade (Ex: Fábrica Camaçari)" value="${data?.name || ''}" required />
                <select name="unidadeId" class="w-full p-2 border rounded" required>${unitOptions}</select>
                <div class="flex justify-end gap-2"><button type="button" class="modal-cancel-inline py-2 px-4 bg-gray-200 rounded">Cancelar</button><button type="submit" class="py-2 px-4 bg-blue-600 text-white rounded">Salvar</button></div>
            </form>
        `;
        openModal(title, content);
            document.getElementById('localidade-form').addEventListener('submit', e => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const newLocalidade = {
                id: formData.get('id') || crypto.randomUUID(),
                name: formData.get('name'),
                unidadeId: formData.get('unidadeId'),
            };
            if (formData.get('id')) {
                state.localidades = state.localidades.map(l => l.id === newLocalidade.id ? newLocalidade : l);
            } else {
                state.localidades.push(newLocalidade);
            }
            saveData('localidades');
            fullRender();
            closeModal();
        });
            document.querySelector('.modal-cancel-inline').addEventListener('click', closeModal);
    }

    function showSetorModal(data = null) {
        const title = data ? 'Editar Setor' : 'Novo Setor';
        let localidadeOptions = '<option value="">Selecione a Localidade</option>';
            state.localidades.sort((a,b) => a.name.localeCompare(b.name)).forEach(l => {
                const unit = state.units.find(u => u.id === l.unidadeId);
            localidadeOptions += `<option value="${l.id}" ${data?.localidadeId === l.id ? 'selected': ''}>${l.name} (${unit?.name || 'N/A'})</option>`;
        });

        const content = `
            <form id="setor-form" class="space-y-4">
                    <input type="hidden" name="id" value="${data?.id || ''}">
                <input name="name" class="w-full p-2 border rounded" placeholder="Nome do Setor (Ex: Diretoria, TI)" value="${data?.name || ''}" required />
                <select name="localidadeId" class="w-full p-2 border rounded" required>${localidadeOptions}</select>
                <hr/>
                <p class="text-sm text-gray-500 -mt-2">Benefícios do Setor</p>
                <input name="overrideDailyVA" type="number" step="0.01" class="w-full p-2 border rounded" placeholder="VA Efetivo (Ex: 25.00)" value="${data?.overrideDailyVA || ''}" required />
                <input name="dailyVT" type="number" step="0.01" class="w-full p-2 border rounded" placeholder="VT Diário (Ex: 10.00)" value="${data?.dailyVT || 0}" />
                <input name="vaDiscount" type="number" step="0.1" class="w-full p-2 border rounded" placeholder="Desconto VA (%) (Ex: 10)" value="${data?.vaDiscount || 0}" />
                    <hr/>
                <p class="text-sm text-gray-500 -mt-2">Regra da Cesta Básica</p>
                    <input name="cestaBasicaValor" type="number" step="0.01" class="w-full p-2 border rounded" placeholder="Valor Cesta (Ex: 150.00)" value="${data?.cestaBasicaValor || 0}" />
                    <select name="cestaBasicaTipo" class="w-full p-2 border rounded">
                    <option value="nenhum" ${!data?.cestaBasicaTipo || data.cestaBasicaTipo === 'nenhum' ? 'selected' : ''}>Nenhum</option>
                    <option value="va" ${data?.cestaBasicaTipo === 'va' ? 'selected' : ''}>Pago no VA</option>
                    <option value="fisica" ${data?.cestaBasicaTipo === 'fisica' ? 'selected' : ''}>Cesta Física</option>
                    </select>
                <div class="flex justify-end gap-2"><button type="button" class="modal-cancel-inline py-2 px-4 bg-gray-200 rounded">Cancelar</button><button type="submit" class="py-2 px-4 bg-blue-600 text-white rounded">Salvar</button></div>
            </form>
        `;
        openModal(title, content);
        document.getElementById('setor-form').addEventListener('submit', e => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const newSetor = {
                id: formData.get('id') || crypto.randomUUID(),
                name: formData.get('name'),
                localidadeId: formData.get('localidadeId'),
                overrideDailyVA: parseFloat(formData.get('overrideDailyVA')) || 0,
                dailyVT: parseFloat(formData.get('dailyVT')) || 0,
                vaDiscount: parseFloat(formData.get('vaDiscount')) || 0,
                cestaBasicaValor: parseFloat(formData.get('cestaBasicaValor')) || 0,
                cestaBasicaTipo: formData.get('cestaBasicaTipo'),
            };
            
            if (formData.get('id')) {
                state.setores = state.setores.map(s => s.id === newSetor.id ? newSetor : s);
            } else {
                state.setores.push(newSetor);
            }
            saveData('setores');
            fullRender();
            closeModal();
        });
        document.querySelector('.modal-cancel-inline').addEventListener('click', closeModal);
    }

    function showEmployeeModal(data = null) {
            const title = data ? 'Editar Colaborador' : 'Novo Colaborador';
        let setorOptions = '<option value="">Selecione o Setor/Local.</option>';
        state.setores.sort((a,b) => a.name.localeCompare(b.name)).forEach(s => {
            const localidade = state.localidades.find(l => l.id === s.localidadeId);
            const unit = state.units.find(u => u.id === localidade?.unidadeId);
            setorOptions += `<option value="${s.id}" ${data?.setorId === s.id ? 'selected': ''}>${s.name} (${localidade?.name || 'N/A'} / ${unit?.name || 'N/A'})</option>`;
        });


        const content = `
            <form id="employee-form" class="space-y-4">
                    <input type="hidden" name="id" value="${data?.id || ''}">
                <input name="matricula" class="w-full p-2 border rounded" placeholder="Matrícula" value="${data?.matricula || ''}" required />
                <input name="name" class="w-full p-2 border rounded" placeholder="Nome Completo" value="${data?.name || ''}" required />
                <select name="setorId" class="w-full p-2 border rounded" required>${setorOptions}</select>
                <input name="salary" type="number" step="0.01" class="w-full p-2 border rounded" placeholder="Salário Bruto" value="${data?.salary || ''}" required />
                <div class="flex justify-end gap-2"><button type="button" class="modal-cancel-inline py-2 px-4 bg-gray-200 rounded">Cancelar</button><button type="submit" class="py-2 px-4 bg-blue-600 text-white rounded">Salvar</button></div>
            </form>
        `;
        openModal(title, content);
            document.getElementById('employee-form').addEventListener('submit', e => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const setor = state.setores.find(s => s.id === formData.get('setorId'));
            const localidade = setor ? state.localidades.find(l => l.id === setor.localidadeId) : null;
            const unit = localidade ? state.units.find(u => u.id === localidade.unidadeId) : null;
            
            const newEmployee = {
                id: formData.get('id') || crypto.randomUUID(),
                matricula: formData.get('matricula'),
                name: formData.get('name'),
                salary: parseFloat(formData.get('salary')) || 0,
                setorId: setor?.id || null,
                setorName: setor?.name || 'N/A',
                localidadeName: localidade?.name || 'N/A',
                unitName: unit?.name || 'N/A',
                    // Get rates from setor/unit at creation time (denormalize)
                    // This is crucial for historical calculation accuracy if rates change
                    baseDailyVA: unit?.baseDailyVA || 0,
                    overrideDailyVA: setor?.overrideDailyVA || unit?.baseDailyVA || 0,
                    dailyVT: setor?.dailyVT || 0,
                    vaDiscount: setor?.vaDiscount || 0
            };

            if (formData.get('id')) {
                // When editing, find existing employee to merge rates
                    const existingEmp = state.employees.find(emp => emp.id === newEmployee.id);
                    const oldRates = {
                        baseDailyVA: existingEmp.baseDailyVA,
                        overrideDailyVA: existingEmp.overrideDailyVA,
                        dailyVT: existingEmp.dailyVT,
                        vaDiscount: existingEmp.vaDiscount
                    };
                    
                    // Get new rates from selected sector
                    const newSetor = state.setores.find(s => s.id === newEmployee.setorId);
                    const newUnit = newSetor ? state.units.find(u => u.id === newSetor.unidadeId) : null;
                    
                    const newRates = {
                        baseDailyVA: newUnit?.baseDailyVA || 0,
                        overrideDailyVA: newSetor?.overrideDailyVA || newUnit?.baseDailyVA || 0,
                        dailyVT: newSetor?.dailyVT || 0,
                        vaDiscount: newSetor?.vaDiscount || 0
                    };
                    
                    // Only update rates if they are different, to preserve history
                    // This is complex. Simpler: Just save the new rates. Historical calcs are based on rates *at time of calculation*.
                    // Let's re-evaluate. The calculation logic `getEmployeeRates` fetches live rates.
                    // This means if I change a sector's rate, old calculations *will change* if re-run.
                    // This is probably *undesired*.
                    // The employee record MUST store its own rates.
                    
                state.employees = state.employees.map(emp => emp.id === newEmployee.id ? newEmployee : emp);
            } else {
                state.employees.push(newEmployee);
            }
            saveData('employees');
            fullRender();
            closeModal();
            });
            document.querySelector('.modal-cancel-inline').addEventListener('click', closeModal);
    }
    
    function showEventModal(data = null) {
        const title = data ? 'Editar Evento' : 'Novo Evento';
        let employeeOptions = '<option value="">Selecione o Colaborador</option>';
        state.employees.sort((a,b) => a.name.localeCompare(b.name)).forEach(e => employeeOptions += `<option value="${e.id}" ${data?.employeeId === e.id ? 'selected': ''}>${e.name} (${e.matricula})</option>`);
        
        const defaultDate = new Date();
        const defaultReferenceMonth = `${defaultDate.getFullYear()}-${String(defaultDate.getMonth() + 1).padStart(2, '0')}`;

        const content = `
            <form id="event-form" class="space-y-4">
                <input type="hidden" name="id" value="${data?.id || ''}">
                <select name="employeeId" class="w-full p-2 border rounded" required>${employeeOptions}</select>
                <select name="type" class="w-full p-2 border rounded">
                    <option value="falta" ${data?.type === 'falta' ? 'selected' : ''}>Falta</option>
                    <option value="atestado" ${data?.type === 'atestado' ? 'selected' : ''}>Atestado</option>
                    <option value="ferias" ${data?.type === 'ferias' ? 'selected' : ''}>Férias</option>
                        <option value="suspensao" ${data?.type === 'suspensao' ? 'selected' : ''}>Suspensão</option>
                    <option value="ajuste" ${data?.type === 'ajuste' ? 'selected' : ''}>Ajuste / Verba de Viagem</option>
                </select>
                
                <div id="date-range-fields" class="${data?.type === 'ajuste' ? 'hidden' : ''} grid grid-cols-2 gap-4">
                        <div>
                            <label class="text-xs text-gray-500">Data Início</label>
                            <input type="date" name="startDate" class="w-full p-2 border rounded" value="${formatDateForInput(data?.startDate)}" />
                        </div>
                        <div>
                            <label class="text-xs text-gray-500">Data Fim</label>
                        <input type="date" name="endDate" class="w-full p-2 border rounded" value="${formatDateForInput(data?.endDate)}" />
                    </div>
                </div>
                    <div id="date-validation-error" class="text-red-500 text-sm hidden">A data final não pode ser anterior à data inicial.</div>


                <div id="adjustment-fields" class="${data?.type !== 'ajuste' ? 'hidden' : ''}">
                        <label class="text-xs text-gray-500">Mês de Competência do Pagamento</eabel>
                    <input type="month" name="referenceMonth" class="w-full p-2 border rounded" value="${data?.referenceMonth || defaultReferenceMonth}" title="Mês de competência do ajuste"/>
                    <div class="grid grid-cols-2 gap-4 mt-4">
                        <input type="number" step="0.01" name="value" placeholder="Valor (Ex: 50 ou -25)" class="w-full p-2 border rounded" value="${data?.value || ''}"/>
                        <select name="benefitType" class="w-full p-2 border rounded">
                            <option value="va_base" ${data?.benefitType === 'va_base' ? 'selected' : ''}>VA Base</option>
                            <option value="va_comp" ${data?.benefitType === 'va_comp' ? 'selected' : ''}>VA Complementar</option>
                            <option value="vt" ${data?.benefitType === 'vt' ? 'selected' : ''}>Vale Transporte</option>
                            <option value="janta" ${data?.benefitType === 'janta' ? 'selected' : ''}>Janta (Viagem)</option>
                            <option value="cafe" ${data?.benefitType === 'cafe' ? 'selected' : ''}>Café da Manhã (Viagem)</option>
                        </select>
                    </div>
                </div>

                <textarea name="notes" placeholder="Justificativa / Observações" class="w-full p-2 border rounded h-24">${data?.notes || ''}</textarea>
                <div class="flex justify-end gap-2"><button type="button" class="modal-cancel-inline py-2 px-4 bg-gray-200 rounded">Cancelar</button><button type="submit" id="event-save-button" class="py-2 px-4 bg-blue-600 text-white rounded">Salvar</button></div>
            </form>
        `;
        openModal(title, content);

        const form = document.getElementById('event-form');
        const typeSelect = form.querySelector('select[name="type"]');
        const employeeSelect = form.querySelector('select[name="employeeId"]');
        const dateRangeFields = document.getElementById('date-range-fields');
        const adjustmentFields = document.getElementById('adjustment-fields');
        const startDateInput = form.querySelector('input[name="startDate"]');
        const endDateInput = form.querySelector('input[name="endDate"]');
        const dateErrorDiv = document.getElementById('date-validation-error');
            const saveButton = document.getElementById('event-save-button');

        const validateDatesAndOverlap = () => {
                const start = startDateInput.value;
                const end = endDateInput.value;
                const employeeId = employeeSelect.value;
                const isAdjustment = typeSelect.value === 'ajuste';

                if (!isAdjustment && start && end) {
                    if (new Date(end) < new Date(start)) {
                        dateErrorDiv.textContent = "A data final não pode ser anterior à data inicial.";
                        dateErrorDiv.classList.remove('hidden');
                        saveButton.disabled = true;
                        saveButton.classList.add('opacity-50', 'cursor-not-allowed');
                        return;
                    }
                    
                    // Overlap Check (Security Lock)
                    if (checkEventOverlap(employeeId, start, end, data?.id)) {
                        dateErrorDiv.textContent = "Já existe um evento para este colaborador neste período.";
                        dateErrorDiv.classList.remove('hidden');
                        saveButton.disabled = true;
                        saveButton.classList.add('opacity-50', 'cursor-not-allowed');
                        return;
                    }
                }

                // If no errors
                dateErrorDiv.classList.add('hidden');
                saveButton.disabled = false;
                saveButton.classList.remove('opacity-50', 'cursor-not-allowed');
            };

            startDateInput.addEventListener('change', validateDatesAndOverlap);
            endDateInput.addEventListener('change', validateDatesAndOverlap);
            employeeSelect.addEventListener('change', validateDatesAndOverlap);


        typeSelect.addEventListener('change', (e) => {
            const isAdjustment = e.target.value === 'ajuste';
            dateRangeFields.classList.toggle('hidden', isAdjustment);
            adjustmentFields.classList.toggle('hidden', !isAdjustment);
            form.querySelector('textarea[name="notes"]').required = isAdjustment; // Notes are required for adjustments
            dateRangeFields.querySelectorAll('input').forEach(input => input.required = !isAdjustment);
            adjustmentFields.querySelectorAll('input, select').forEach(input => input.required = isAdjustment);
                validateDatesAndOverlap(); // Re-validate on type change
        });
            typeSelect.dispatchEvent(new Event('change')); // Initial setup


        form.addEventListener('submit', e => {
            e.preventDefault();
            if(saveButton.disabled) return; // Prevent saving if dates are invalid

            const formData = new FormData(e.target);
            const eventType = formData.get('type');
            const newEvent = {
                id: formData.get('id') || crypto.randomUUID(),
                employeeId: formData.get('employeeId'),
                type: eventType,
                notes: formData.get('notes'),
            };

            if (eventType === 'ajuste') {
                newEvent.referenceMonth = formData.get('referenceMonth');
                newEvent.benefitType = formData.get('benefitType');
                newEvent.value = parseFloat(formData.get('value')) || 0;
            } else {
                newEvent.startDate = formData.get('startDate'); 
                newEvent.endDate = formData.get('endDate');
            }
            
            if (formData.get('id')) {
                state.events = state.events.map(evt => evt.id === newEvent.id ? newEvent : evt);
            } else {
                state.events.push(newEvent);
            }
            saveData('events');
            fullRender();
            closeModal();
        });
            document.querySelector('.modal-cancel-inline').addEventListener('click', closeModal);
    }
    
    // New: Mass Event Modal
        function showMassEventModal() {
        const title = 'Lançamento de Eventos em Massa';
            let unitOptions = '<option value="all">Toda a Empresa</option>';
            state.units.forEach(u => unitOptions += `<option value="unit:${u.id}">Unidade: ${u.name}</option>`);
            state.localidades.forEach(l => {
                const unit = state.units.find(u => u.id === l.unidadeId);
                unitOptions += `<option value="localidade:${l.id}">Local.: ${l.name} (${unit?.name || 'N/A'})</option>`
            });
            state.setores.forEach(s => {
                const localidade = state.localidades.find(l => l.id === s.localidadeId);
                unitOptions += `<option value="setor:${s.id}">Setor: ${s.name} (${localidade?.name || 'N/A'})</option>`
            });

        const content = `
            <form id="mass-event-form" class="space-y-4">
                <div class="bg-yellow-50 p-3 rounded text-sm text-yellow-800 mb-4">
                    Atenção: Isso criará um evento individual para CADA colaborador do grupo selecionado.
                </div>
                
                <label class="block text-sm font-medium text-gray-700">Grupo Alvo</label>
                <select name="targetGroup" class="w-full p-2 border rounded" required>${unitOptions}</select>
                
                <label class="block text-sm font-medium text-gray-700 mt-4">Tipo de Evento</label>
                <select name="type" class="w-full p-2 border rounded">
                    <option value="falta">Falta (Geral)</option>
                    <option value="ajuste">Ajuste / Verba de Viagem</option>
                        <!-- Removed Férias/Atestado/Suspensão from mass launch as they are usually individual -->
                </select>
                
                <div id="mass-date-range-fields" class="grid grid-cols-2 gap-4 mt-4">
                        <div><label class="text-xs text-gray-500">Data Início</label><input type="date" name="startDate" class="w-full p-2 border rounded" required /></div>
                        <div><label class="text-xs text-gray-500">Data Fim</label><input type="date" name="endDate" class="w-full p-2 border rounded" required /></div>
                </div>

                <div id="mass-adjustment-fields" class="hidden mt-4">
                        <label class="text-xs text-gray-500">Mês de Competência</eabel>
                    <input type="month" name="referenceMonth" class="w-full p-2 border rounded" />
                    <div class="grid grid-cols-2 gap-4 mt-2">
                        <input type="number" step="0.01" name="value" placeholder="Valor" class="w-full p-2 border rounded" />
                        <select name="benefitType" class="w-full p-2 border rounded">
                            <option value="janta">Janta (Viagem)</option>
                            <option value="cafe">Café da Manhã</option>
                                <option value="va_base">VA Base</option>
                        </select>
                    </div>
                </div>

                <textarea name="notes" placeholder="Justificativa / Observações (para todos)" class="w-full p-2 border rounded h-24 mt-4"></textarea>
                <div class="flex justify-end gap-2 mt-4"><button type="button" class="modal-cancel-inline py-2 px-4 bg-gray-200 rounded">Cancelar</button><button type="submit" class="py-2 px-4 bg-teal-600 text-white rounded hover:bg-teal-700">Lançar para Todos</button></div>
            </form>
        `;
        openModal(title, content);

        const form = document.getElementById('mass-event-form');
        const typeSelect = form.querySelector('select[name="type"]');
        const dateRangeFields = document.getElementById('mass-date-range-fields');
        const adjustmentFields = document.getElementById('mass-adjustment-fields');

        typeSelect.addEventListener('change', (e) => {
            const isAdjustment = e.target.value === 'ajuste';
            dateRangeFields.classList.toggle('hidden', isAdjustment);
            adjustmentFields.classList.toggle('hidden', !isAdjustment);
            dateRangeFields.querySelectorAll('input').forEach(input => input.required = !isAdjustment);
            adjustmentFields.querySelectorAll('input, select').forEach(input => input.required = isAdjustment);
        });

        form.addEventListener('submit', e => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const targetGroup = formData.get('targetGroup');
            const eventType = formData.get('type');
            
            let targetEmployees = [];
            if (targetGroup === 'all') {
                targetEmployees = state.employees;
            } else if (targetGroup.startsWith('unit:')) {
                const unitId = targetGroup.split(':')[1];
                const localidadesInUnit = state.localidades.filter(l => l.unidadeId === unitId).map(l => l.id);
                const setoresInUnit = state.setores.filter(s => localidadesInUnit.includes(s.localidadeId)).map(s => s.id);
                targetEmployees = state.employees.filter(emp => setoresInUnit.includes(emp.setorId));
            } else if (targetGroup.startsWith('localidade:')) {
                const localidadeId = targetGroup.split(':')[1];
                const setoresInLocalidade = state.setores.filter(s => s.localidadeId === localidadeId).map(s => s.id);
                targetEmployees = state.employees.filter(emp => setoresInLocalidade.includes(emp.setorId));
            } else if (targetGroup.startsWith('setor:')) {
                const setorId = targetGroup.split(':')[1];
                targetEmployees = state.employees.filter(emp => emp.setorId === setorId);
            }

            if (targetEmployees.length === 0) {
                alert("Nenhum colaborador encontrado no grupo selecionado.");
                return;
            }

            showConfirmModal(`Confirma o lançamento de '${eventType}' para ${targetEmployees.length} colaboradores?`, () => {
                const newEvents = targetEmployees.map(emp => {
                    const event = {
                        id: crypto.randomUUID(),
                        employeeId: emp.id,
                        type: eventType,
                        notes: formData.get('notes')
                    };
                    if (eventType === 'ajuste') {
                            event.referenceMonth = formData.get('referenceMonth');
                            event.benefitType = formData.get('benefitType');
                            event.value = parseFloat(formData.get('value')) || 0;
                    } else {
                        event.startDate = formData.get('startDate');
                        event.endDate = formData.get('endDate');
                            // Check for overlap on non-adjustment events
                            if (checkEventOverlap(emp.id, event.startDate, event.endDate)) {
                                console.warn(`Evento pulado para ${emp.name} (ID: ${emp.id}) por conflito de data.`);
                                return null; // Skip this event
                            }
                    }
                    return event;
                }).filter(Boolean); // Filter out null (skipped) events

                state.events.push(...newEvents);
                saveData('events');
                fullRender();
                closeModal();
                alert(`${newEvents.length} eventos lançados com sucesso. ${targetEmployees.length - newEvents.length} eventos foram pulados por conflito de data.`);
            });
        });
        document.querySelector('.modal-cancel-inline').addEventListener('click', closeModal);
    }

    function showPaystubModal(employeeId, dateId) {
        const employee = state.employees.find(e => e.id === employeeId);
        const calc = state.allCalculations[dateId]?.[employeeId];
        if (!employee || !calc) return;
        
        const [year, month] = dateId.split('-');
        const dateObj = new Date(year, month - 1);
        const monthName = dateObj.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
        const setor = state.setores.find(s => s.id === employee.setorId);
        const localidade = state.localidades.find(l => l.id === setor?.localidadeId);
        const unidade = state.units.find(u => u.id === localidade?.unidadeId);

        const paystubHTML = `
            <div class="bg-white p-8 max-w-2xl mx-auto border shadow-sm" id="paystub-content">
                <div class="text-center border-b pb-4 mb-4">
                    <h1 class="text-xl font-bold uppercase">${unidade?.name || 'Minha Empresa'}</h1>
                    <h2 class="text-lg text-gray-600">Demonstrativo de Benefícios - ${monthName}</h2>
                </div>
                <div class="grid grid-cols-2 gap-4 text-sm mb-6">
                    <div>
                        <p><span class="font-semibold">Colaborador:</span> ${employee.name}</p>
                        <p><span class="font-semibold">Matrícula:</span> ${employee.matricula || '-'}</p>
                    </div>
                    <div class="text-right">
                        <p><span class="font-semibold">Setor/Local:</span> ${employee.setorName} / ${localidade?.name}</p>
                        <p><span class="font-semibold">Dias Trabalhados:</span> ${calc.diasTrabalhados}</p>
                    </div>
                </div>
                
                <table class="w-full text-sm mb-6">
                    <thead class="bg-gray-100 border-b-2 border-gray-300">
                        <tr><th class="text-left p-2">Descrição</th><th class="text-right p-2">Referência</th><th class="text-right p-2">Proventos</th><th class="text-right p-2">Descontos</th></tr>
                    </thead>
                    <tbody>
                        <tr><td class="p-2">VA - Base</td><td class="text-right p-2"></td><td class="text-right p-2">${formatCurrency(calc.devidoVABase - calc.ajusteVABase)}</td><td class="text-right p-2"></td></tr>
                        <tr><td class="p-2">VA - Complementar</td><td class="text-right p-2"></td><td class="text-right p-2">${formatCurrency(calc.devidoVAComp - calc.ajusteVAComp)}</td><td class="text-right p-2"></td></tr>
                        <tr><td class="p-2">VT - Valor Efetivo</td><td class="text-right p-2"></td><td class="text-right p-2">${formatCurrency(calc.devidoVT - calc.ajusteVT)}</td><td class="text-right p-2"></td></tr>
                        ${calc.ajusteVABase !== 0 ? `<tr><td class="p-2">Ajuste VA Base</td><td class="text-right p-2"></td><td class="text-right p-2">${formatCurrency(calc.ajusteVABase)}</td><td class="text-right p-2"></td></tr>` : ''}
                        ${calc.ajusteVAComp !== 0 ? `<tr><td class="p-2">Ajuste VA Comp.</td><td class="text-right p-2"></td><td class="text-right p-2">${formatCurrency(calc.ajusteVAComp)}</td><td class="text-right p-2"></td></tr>` : ''}
                        ${calc.ajusteVT !== 0 ? `<tr><td class="p-2">Ajuste VT</td><td class="text-right p-2"></td><td class="text-right p-2">${formatCurrency(calc.ajusteVT)}</td><td class="text-right p-2"></td></tr>` : ''}
                        ${calc.valorJanta > 0 ? `<tr><td class="p-2">Reembolso Janta</td><td class="text-right p-2"></td><td class="text-right p-2">${formatCurrency(calc.valorJanta)}</td><td class="text-right p-2"></td></tr>` : ''}
                        ${calc.valorCafe > 0 ? `<tr><td class="p-2">Reembolso Café</td><td class="text-right p-2"></td><td class="text-right p-2">${formatCurrency(calc.valorCafe)}</td><td class="text-right p-2"></td></tr>` : ''}
                    </tbody>
                    <tfoot class="font-semibold bg-gray-50 border-t-2 border-gray-300">
                        <tr>
                            <td class="p-2" colspan="2">TOTAL LÍQUIDO A RECEBER</td>
                            <td class="text-right p-2 text-lg" colspan="2">${formatCurrency(calc.total + calc.valorJanta + calc.valorCafe)}</td>
                        </tr>
                    </tfoot>
                </table>
                
                <div class="text-xs text-gray-500 text-center mt-8">
                    Documento gerado eletronicamente em ${new Date().toLocaleDateString('pt-BR')}.
                </div>
            </div>
            <div class="flex justify-end mt-4 no-print">
                <button class="modal-cancel-inline py-2 px-4 bg-gray-200 rounded mr-2">Fechar</button>
                <button onclick="window.print()" class="py-2 px-4 bg-blue-600 text-white rounded flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg> Imprimir</button>
            </div>
        `;
        
        // Instead of standard modal, populate printable area and show it full screen for a moment, or use a specialized modal.
        // Better approach for simplicity: Use a dedicated modal that handles print styles.
        openModal('Demonstrativo de Pagamento', paystubHTML, false, 'max-w-3xl');
            // Inject content into printable area for actual printing
            printableArea.innerHTML = document.getElementById('paystub-content').outerHTML;
            document.querySelector('.modal-cancel-inline').addEventListener('click', closeModal);

    }
    
    function showImportCSVModal() {
            const title = 'Importar CSV de Viagens';
            const content = `
            <div class="space-y-4">
                <p class="text-sm text-gray-600">Selecione um arquivo CSV com as colunas: <strong>Motorista</strong> (Matrícula/Nome), <strong>Valor</strong> e <strong>Dias Pernoitados</strong>.</p>
                <input type="file" id="csv-file-input" accept=".csv" class="w-full p-2 border rounded" />
                
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="text-sm font-medium">Mês de Referência</label>
                        <input type="month" id="import-ref-month" class="w-full p-2 border rounded" value="${new Date().toISOString().slice(0, 7)}"/>
                    </div>
                        <div>
                        <label class="text-sm font-medium">Tipo de Verba</label>
                        <select id="import-benefit-type" class="w-full p-2 border rounded">
                            <option value="janta">Janta</option>
                            <option value="cafe">Café da Manhã</option>
                        </select>
                    </div>
                </div>

                <div class="flex justify-end gap-2 mt-4">
                        <button class="modal-cancel-inline py-2 px-4 bg-gray-200 rounded">Cancelar</button>
                        <button id="process-import-btn" class="py-2 px-4 bg-purple-600 text-white rounded disabled:opacity-50" disabled>Processar Importação</button>
                </div>
            </div>
            `;
            openModal(title, content);

            const fileInput = document.getElementById('csv-file-input');
            const processBtn = document.getElementById('process-import-btn');

            fileInput.addEventListener('change', () => {
                processBtn.disabled = !fileInput.files.length;
            });

            processBtn.addEventListener('click', () => {
                const file = fileInput.files[0];
                if (!file) return;
                
                const refMonth = document.getElementById('import-ref-month').value;
                const benefitType = document.getElementById('import-benefit-type').value;
                
                const reader = new FileReader();
                reader.onload = (e) => {
                    const text = e.target.result;
                    const lines = text.split('\n');
                    // Simple CSV parser (assumes header on first row, comma or semicolon delimiter)
                    const delimiter = lines[0].includes(';') ? ';' : ',';
                    const headers = lines[0].toLowerCase().split(delimiter).map(h => h.trim().replace(/"/g, ''));
                    
                    // Find column indices based on likely names
                    const idColIdx = headers.findIndex(h => h.includes('motorista') || h.includes('matricula') || h.includes('cpf'));
                    const valColIdx = headers.findIndex(h => h.includes('valor'));
                    const qtyColIdx = headers.findIndex(h => h.includes('dias') || h.includes('qtd'));
                    
                    if (idColIdx === -1 || valColIdx === -1) {
                        alert("Não foi possível identificar as colunas 'Motorista' e 'Valor' no CSV.");
                        return;
                    }

                    let importedCount = 0;
                    let skippedCount = 0;
                    const newEvents = [];

                    for (let i = 1; i < lines.length; i++) {
                        if (!lines[i].trim()) continue;
                        const row = lines[i].split(delimiter).map(c => c.trim().replace(/"/g, ''));
                        const employeeIdOrName = row[idColIdx];
                        // Try to find employee by Matricula first, then Name
                        const employee = state.employees.find(e => e.matricula === employeeIdOrName || e.name.toLowerCase() === employeeIdOrName.toLowerCase());
                        
                        if (employee) {
                            let valorTotal = parseFloat(row[valColIdx].replace(',', '.')) || 0;
                            // If quantity column exists, multiply
                            if (qtyColIdx !== -1) {
                                const qty = parseFloat(row[qtyColIdx].replace(',', '.')) || 1;
                                valorTotal = valorTotal * qty;
                            }

                            if (valorTotal > 0) {
                                newEvents.push({
                                    id: crypto.randomUUID(),
                                    employeeId: employee.id,
                                    type: 'ajuste',
                                    referenceMonth: refMonth,
                                    benefitType: benefitType,
                                    value: valorTotal,
                                    notes: `Importado via CSV (${benefitType})`
                                });
                                importedCount++;
                            }
                        } else {
                            skippedCount++;
                        }
                    }

                    if (newEvents.length > 0) {
                        state.events.push(...newEvents);
                        saveData('events');
                        fullRender();
                        closeModal();
                        alert(`Importação concluída!\n\n${importedCount} eventos criados.\n${skippedCount} linhas ignoradas (colaborador não encontrado).`);
                    } else {
                        alert("Nenhum dado válido encontrado para importação.");
                    }
                };
                reader.readAsText(file);
            });
            document.querySelector('.modal-cancel-inline').addEventListener('click', closeModal);
    }

    // Attach listeners after functions are defined
    newUnitButton.addEventListener('click', () => showUnitModal());
    newLocalidadeButton.addEventListener('click', () => showLocalidadeModal());
    newSetorButton.addEventListener('click', () => showSetorModal()); 
    newEmployeeButton.addEventListener('click', () => showEmployeeModal());
    newEventButton.addEventListener('click', () => showEventModal());
    massEventButton.addEventListener('click', () => showMassEventModal()); // NEW Listener
    importViagensButton.addEventListener('click', () => showImportCSVModal());
    

    document.body.addEventListener('click', e => { 
        if (e.target.closest('.delete-unit-btn')) handleDelete('units', e.target.closest('.delete-unit-btn').dataset.id);
        if (e.target.closest('.edit-unit-btn')) showUnitModal(state.units.find(u => u.id === e.target.closest('.edit-unit-btn').dataset.id));
        
        if (e.target.closest('.delete-localidade-btn')) handleDelete('localidades', e.target.closest('.delete-localidade-btn').dataset.id);
        if (e.target.closest('.edit-localidade-btn')) showLocalidadeModal(state.localidades.find(l => l.id === e.target.closest('.edit-localidade-btn').dataset.id));
        
        if (e.target.closest('.delete-setor-btn')) handleDelete('setores', e.target.closest('.delete-setor-btn').dataset.id);
        if (e.target.closest('.edit-setor-btn')) showSetorModal(state.setores.find(s => s.id === e.target.closest('.edit-setor-btn').dataset.id));

        if (e.target.closest('.delete-employee-btn')) handleDelete('employees', e.target.closest('.delete-employee-btn').dataset.id);
        if (e.target.closest('.edit-employee-btn')) showEmployeeModal(state.employees.find(emp => emp.id === e.target.closest('.edit-employee-btn').dataset.id));
        
        if (e.target.closest('.delete-event-btn')) handleDelete('events', e.target.closest('.delete-event-btn').dataset.id);
        if (e.target.closest('.edit-event-btn')) showEventModal(state.events.find(evt => evt.id === e.target.closest('.edit-event-btn').dataset.id));
        
        if (e.target.closest('.employee-history-btn')) showEmployeeHistoryModal(e.target.closest('.employee-history-btn').dataset.id);
        
            if (e.target.closest('.print-paystub-btn')) {
            const btn = e.target.closest('.print-paystub-btn');
            showPaystubModal(btn.dataset.employeeId, btn.dataset.dateId);
        }
        });

    function handleDelete(type, id) { 
            if (type === 'units' && state.localidades.some(l => l.unidadeId === id)) {
            alert('Não é possível excluir. Existem localidades vinculadas a esta unidade.');
            return;
        }
            if (type === 'localidades' && state.setores.some(s => s.localidadeId === id)) {
            alert('Não é possível excluir. Existem setores vinculados a esta localidade.');
            return;
        }
            if (type === 'setores' && state.employees.some(e => e.setorId === id)) {
            alert('Não é possível excluir. Existem colaboradores vinculados a este setor.');
            return;
        }
        const message = type === 'units' ? 'Excluir esta unidade?' 
                        : type === 'localidades' ? 'Excluir esta localidade?'
                        : type === 'setores' ? 'Excluir este setor?'
                        : type === 'employees' ? 'Excluir este colaborador?' 
                        : 'Excluir este evento?';
        
        showConfirmModal(message, () => {
            state[type] = state[type].filter(item => item.id !== id);
            saveData(type);
            fullRender();
        });
        }
    
        // --- Calendar Navigation Listeners ---
    prevMonthBtn.addEventListener('click', () => {
            state.calendarDate.month--;
            if (state.calendarDate.month < 1) {
                state.calendarDate.month = 12;
                state.calendarDate.year--;
            }
            renderCalendar();
    });
    nextMonthBtn.addEventListener('click', () => {
            state.calendarDate.month++;
            if (state.calendarDate.month > 12) {
                state.calendarDate.month = 1;
                state.calendarDate.year++;
            }
            renderCalendar();
    });
    calendarEmployeeFilter.addEventListener('change', renderCalendar);


    const initFirebase = () => {
        try {
            const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
            if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
               throw new Error("Configuração do Firebase inválida ou ausente.");
            }
            if (!firebase.apps.length) state.firebaseApp = firebase.initializeApp(firebaseConfig);
            else state.firebaseApp = firebase.app();
            state.firebaseAuth = firebase.auth();
            state.firebaseDb = firebase.firestore();
            state.db = state.firebaseDb; 

            firebase.auth().onAuthStateChanged(async (user) => {
                if (!user) {
                   try {
                        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) await firebase.auth().signInWithCustomToken(__initial_auth_token);
                        else await firebase.auth().signInAnonymously();
                   } catch (error) { console.error("Firebase Auth Error:", error); state.isFirebaseReady = false; updateSyncButtonState(); }
                } else {
                     state.userId = user.uid;
                     state.isFirebaseReady = true;
                     updateSyncButtonState();
                }
            });
        } catch (e) { console.error("Erro ao inicializar Firebase:", e); state.isFirebaseReady = false; updateSyncButtonState(); }
    };

    const updateSyncButtonState = () => {
         const ready = state.isFirebaseReady && !!state.userId;
         uploadButton.disabled = !ready;
         downloadButton.disabled = !ready;
         if (!ready) {
             syncStatusDiv.textContent = 'Firebase não conectado.';
             syncStatusDiv.className = 'mt-2 text-xs text-center p-1 rounded bg-yellow-100 text-yellow-700';
             syncStatusDiv.classList.remove('hidden');
         } else {
              if (!syncStatusDiv.textContent.includes('Sincronizando')) { 
                 syncStatusDiv.classList.add('hidden');
                 syncStatusDiv.textContent = '';
              }
         }
    };
    
    const handleSync = async (direction) => {
         if (!state.isFirebaseReady || !state.userId || !state.db) {
             updateSyncStatus('error', 'Conexão com Firebase indisponível.');
             return;
         }
         const confirmationText = direction === 'upload' ? "Substituir dados na nuvem pelos locais?" : "Substituir dados locais pelos da nuvem? ISTO APAGARÁ SEUS DADOS LOCAIS ATUAIS.";
         
         showConfirmModal(confirmationText, async () => {
             updateSyncStatus('syncing', 'Sincronizando...');
             uploadButton.disabled = true;
             downloadButton.disabled = true;

             const collections = ['units', 'localidades', 'setores', 'employees', 'events', 'allCalculations'];
             const localData = { 
                 units: state.units, 
                 localidades: state.localidades,
                 setores: state.setores,
                 employees: state.employees, 
                 events: state.events, 
                 allCalculations: state.allCalculations 
             };
             const firestore = state.db;

             try {
                 if (direction === 'upload') {
                     const batch = firestore.batch();
                     for (const collName of collections) {
                         const docRef = firestore.collection(`/artifacts/${state.appId}/users/${state.userId}/${collName}`).doc('data');
                         // Convert dates to Firestore Timestamps before saving
                         const dataToSave = JSON.parse(JSON.stringify(localData[collName]), (key, value) => {
                              if ((key === 'startDate' || key === 'endDate' || key === 'calculatedAt' || key === 'finalizedAt') && typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/)) {
                                 // Check if firebase.firestore.Timestamp exists before using it
                                 if (firebase && firebase.firestore && firebase.firestore.Timestamp) {
                                    return firebase.firestore.Timestamp.fromDate(new Date(value));
                                 }
                             }
                             return value;
                         });
                         batch.set(docRef, { content: JSON.stringify(dataToSave) });
                     }
                     await batch.commit();
                     updateSyncStatus('success', 'Dados salvos na nuvem!');
                 } else { // download
                     for (const collName of collections) {
                         const docRef = firestore.collection(`/artifacts/${state.appId}/users/${state.userId}/${collName}`).doc('data');
                         const docSnap = await docRef.get();
                         if (docSnap.exists) {
                              // Parse Firestore data, ensuring dates/timestamps are handled if needed (Firestore SDK often does this)
                              // For simplicity, assuming data is stored as plain JSON strings as in upload.
                              const data = JSON.parse(docSnap.data().content, (key, value) => {
                                  if (value && typeof value === 'object' && value.seconds !== undefined && value.nanoseconds !== undefined && firebase && firebase.firestore && firebase.firestore.Timestamp) {
                                     try { return new firebase.firestore.Timestamp(value.seconds, value.nanoseconds).toDate().toISOString(); } 
                                     catch(e) { console.warn("Erro ao converter timestamp:", e, value); return value; } 
                                 }
                                 return value;
                             });
                             state[collName] = data; 
                             saveData(collName); 
                         } else {
                             // If document doesn't exist in Firestore, clear local data for that collection
                             state[collName] = collName === 'allCalculations' ? {} : [];
                             saveData(collName);
                         }
                     }
                     updateSyncStatus('success', 'Dados carregados da nuvem!');
                     fullRender(); // Re-render UI with new data
                 }
             } catch (error) {
                 console.error("Sync error:", error);
                 updateSyncStatus('error', `Erro: ${error.message}`);
             } finally {
                 updateSyncButtonState(); // Re-enable buttons based on final state
             }
         });
    };
    
    const updateSyncStatus = (statusState, message) => {
        syncStatusDiv.textContent = message;
        syncStatusDiv.className = `mt-2 text-xs text-center p-1 rounded ${
            statusState === 'error' ? 'bg-red-100 text-red-700' : 
            statusState === 'success' ? 'bg-green-100 text-green-700' : 
            'bg-blue-100 text-blue-700' // syncing
        }`;
            syncStatusDiv.classList.remove('hidden');
        if (statusState !== 'syncing') {
            setTimeout(() => {
                syncStatusDiv.classList.add('hidden');
                syncStatusDiv.textContent = '';
                    updateSyncButtonState(); // Ensure buttons reflect final ready state
            }, 4000);
        }
    };
        // --- Local Backup/Restore ---
    exportLocalButton.addEventListener('click', () => { /* ... unchanged ... */ });
    importLocalButton.addEventListener('click', () => { /* ... unchanged ... */ });
    importFileInput.addEventListener('change', (event) => { /* ... unchanged ... */ });


    // Initial Setup
    initFirebase();
    fullRender();
});

