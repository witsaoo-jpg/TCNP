let masterData = [];
let patientNotes = [];

// 1. โหลดข้อมูล Master Data เมื่อเปิดเว็บ
async function init() {
    try {
        const response = await fetch('data/master_index.json');
        masterData = await response.json();
        console.log("Loaded Master Data:", masterData);
    } catch (error) {
        console.error("Error loading master data:", error);
        alert("ไม่สามารถโหลดฐานข้อมูลโรคได้ (กรุณาตรวจสอบการรันผ่าน Web Server)");
    }
}

init();

// 2. ระบบค้นหา (Search Logic)
const searchInput = document.getElementById('focusSearch');
const suggestionsBox = document.getElementById('suggestions');

searchInput.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase();
    suggestionsBox.innerHTML = '';

    if (val.length < 1 || masterData.length === 0) {
        suggestionsBox.style.display = 'none';
        return;
    }

    const found = masterData.filter(item => {
        const matchName = item.nanda.toLowerCase().includes(val);
        const matchKey = item.keywords.some(k => k.toLowerCase().includes(val));
        return matchName || matchKey;
    });

    if (found.length > 0) {
        suggestionsBox.style.display = 'block';
        found.forEach(item => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.innerHTML = `<strong>${item.nanda}</strong>`;
            div.onclick = () => selectDiagnosis(item);
            suggestionsBox.appendChild(div);
        });
    } else {
        suggestionsBox.style.display = 'none';
    }
});

// 3. เมื่อเลือกโรค -> ดึงข้อมูล JSON ใส่ฟอร์ม + ดึง MD มาโชว์
async function selectDiagnosis(item) {
    // A. Fill Form
    document.getElementById('focusInput').value = item.nanda;
    document.getElementById('dataInput').value = item.template.d;
    document.getElementById('actionInput').value = item.template.a;
    document.getElementById('responseInput').value = item.template.r;

    // B. Fetch Markdown Content
    const guideBox = document.getElementById('guidelineBox');
    guideBox.innerHTML = "กำลังโหลดข้อมูล...";
    
    try {
        const mdResponse = await fetch(item.md_file);
        if (mdResponse.ok) {
            const mdText = await mdResponse.text();
            // แปลง Markdown เป็น HTML ด้วย marked.js
            guideBox.innerHTML = marked.parse(mdText);
        } else {
            guideBox.innerHTML = "ไม่พบไฟล์เนื้อหา";
        }
    } catch (error) {
        guideBox.innerHTML = "Error loading content.";
    }

    searchInput.value = '';
    suggestionsBox.style.display = 'none';
}

// 4. บันทึกข้อมูล (Add Note)
function addNote() {
    const focus = document.getElementById('focusInput').value;
    if (!focus) return alert("กรุณาเลือก Focus");

    const note = {
        timestamp: new Date().toLocaleString('th-TH'),
        focus: focus,
        d: document.getElementById('dataInput').value,
        a: document.getElementById('actionInput').value,
        r: document.getElementById('responseInput').value,
        nurse: "พยบ.วิษณุรักษ์"
    };

    patientNotes.unshift(note);
    renderUI();
    document.getElementById('noteForm').reset();
    document.getElementById('guidelineBox').innerHTML = "<p style='color:#777;'>เลือก Focus ใหม่เพื่อดูคำแนะนำ</p>";
}

// 5. แสดงผล (Render)
function renderUI() {
    const timeline = document.getElementById('timelineList');
    const printBody = document.getElementById('printTableBody');
    timeline.innerHTML = '';
    printBody.innerHTML = '';

    patientNotes.forEach(n => {
        // Timeline View
        timeline.innerHTML += `
            <div style="border-left:4px solid #00897b; padding-left:15px; margin-bottom:15px;">
                <div style="font-weight:bold; color:#00897b;">${n.focus} <small style="color:#888;">${n.timestamp}</small></div>
                <div><b>D:</b> ${n.d}</div>
                <div><b>A:</b> ${n.a}</div>
                <div><b>R:</b> ${n.r}</div>
            </div>
        `;

        // Print View
        printBody.innerHTML += `
            <tr>
                <td>${n.timestamp}</td>
                <td>${n.focus}</td>
                <td><b>D:</b> ${n.d}<br><b>A:</b> ${n.a}<br><b>R:</b> ${n.r}</td>
                <td>${n.nurse}</td>
            </tr>
        `;
    });
}
// --- 1. เพิ่มฟังก์ชันแปลงข้อความเป็น Bullet Point (ไว้บนสุดของ Script หรือก่อน renderUI) ---
    function formatToList(text) {
        if (!text) return "-"; // ถ้าไม่มีข้อมูล ให้ขีดแดรช
        
        // แยกบรรทัดด้วยการกด Enter (\n)
        const lines = text.split('\n').filter(line => line.trim() !== '');
        
        if (lines.length === 0) return "-";

        // สร้างเป็น HTML <ul><li>...</li></ul>
        let html = '<ul class="content-list">';
        lines.forEach(line => {
            // ลบขีดหรือจุดที่ user พิมพ์เองออก (เผื่อ user พิมพ์ "- " นำหน้ามาแล้ว)
            let cleanLine = line.replace(/^[-•*]\s*/, ''); 
            html += `<li>${cleanLine}</li>`;
        });
        html += '</ul>';
        
        return html;
    }

    // --- 2. แก้ไขฟังก์ชัน renderUI ให้เรียกใช้ formatToList ---
    function renderUI() {
        const timeline = document.getElementById('timelineList');
        const printBody = document.getElementById('printTableBody');
        
        timeline.innerHTML = '';
        printBody.innerHTML = '';

        if(patientNotes.length === 0) {
            timeline.innerHTML = `<div style="text-align:center; padding:40px; color:#90a4ae;">ยังไม่มีบันทึก...</div>`;
            return;
        }

        patientNotes.forEach(n => {
            // แปลงข้อความ D-A-R ให้เป็น List
            const d_html = formatToList(n.d);
            const a_html = formatToList(n.a);
            const r_html = formatToList(n.r);

            // 1. Timeline Card (หน้าจอปกติ) - ก็จะสวยด้วย
            timeline.innerHTML += `
                <div class="timeline-item">
                    <div class="note-card">
                        <div class="note-header">
                            <div>
                                <span class="focus-badge">${n.focus}</span>
                                <span class="note-time"><i class="far fa-calendar-alt"></i> ${n.displayTime}</span>
                            </div>
                            <div>
                                <button class="btn btn-icon btn-edit" onclick="editNote(${n.id})" title="แก้ไข"><i class="fas fa-pen"></i></button>
                                <button class="btn btn-icon btn-delete" onclick="deleteNote(${n.id})" title="ลบ"><i class="fas fa-trash"></i></button>
                            </div>
                        </div>
                        <div class="dar-grid">
                            <div class="dar-label">D:</div>
                            <div>${d_html}</div> <div class="dar-label">A:</div>
                            <div>${a_html}</div>
                            <div class="dar-label">R:</div>
                            <div>${r_html}</div>
                        </div>
                        <div style="margin-top:10px; font-size:0.8rem; text-align:right; color:#78909c;">
                            <i class="fas fa-user-check"></i> ${n.nurse}
                        </div>
                    </div>
                </div>
            `;

            // 2. Print Table (PDF) - จะเรียงเป็นข้อๆ ชัดเจน
            printBody.innerHTML += `
                <tr>
                    <td>${n.displayTime}</td>
                    <td><strong>${n.focus}</strong></td>
                    <td>
                        <div style="margin-bottom:5px;"><b>Data:</b> ${d_html}</div>
                        <div style="margin-bottom:5px;"><b>Action:</b> ${a_html}</div>
                        <div><b>Response:</b> ${r_html}</div>
                    </td>
                    <td>${n.nurse}</td>
                </tr>
            `;
        });
    }
    // ฟังก์ชันแปลงข้อความเป็นรายการ (รองรับทั้ง 1. 2. 3. และ - Bullet)
    function formatToList(text) {
        if (!text) return "-"; 

        // 1. เทคนิคพิเศษ: ถ้าเจอช่องว่างตามด้วยตัวเลขและจุด (เช่น " 2.") ให้เปลี่ยนเป็น "ขึ้นบรรทัดใหม่ + 2."
        // ทำให้พยาบาลพิมพ์ติดกันได้ ระบบจะตบลงมาเอง
        let formatted = text.replace(/(\s+)(\d+\.)/g, '\n$2');

        // 2. แยกบรรทัด
        const lines = formatted.split('\n').filter(line => line.trim() !== '');
        
        if (lines.length === 0) return "-";

        // 3. ตรวจสอบว่าบรรทัดแรกขึ้นต้นด้วยตัวเลขหรือไม่? (เช่น "1. วัดไข้")
        // ถ้าใช่ ให้ใช้ <ol> (เรียงเลข), ถ้าไม่ใช่ ให้ใช้ <ul> (จุดไข่ปลา)
        const isOrdered = /^\s*\d+\./.test(lines[0]);

        let html = isOrdered ? '<ol>' : '<ul>';

        lines.forEach(line => {
            let cleanLine = line.trim();

            if (isOrdered) {
                // ถ้าเป็นแบบตัวเลข ให้ลบเลขที่คนพิมพ์ออก (เช่น "1. วัดไข้" -> "วัดไข้")
                // เพราะเดี๋ยว HTML <ol> จะใส่เลขรันใหม่อัตโนมัติ (กันเลขกระโดด)
                cleanLine = cleanLine.replace(/^\d+\.\s*/, '');
            } else {
                // ถ้าเป็น Bullet ให้ลบขีดข้างหน้าออก
                cleanLine = cleanLine.replace(/^[-•*]\s*/, '');
            }

            html += `<li>${cleanLine}</li>`;
        });

        html += isOrdered ? '</ol>' : '</ul>';
        
        return `<div class="dar-content">${html}</div>`;
    }