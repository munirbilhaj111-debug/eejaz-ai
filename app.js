
// DOM Elements
const steps = {
    upload: document.getElementById('step-upload'),
    options: document.getElementById('step-options'),
    processing: document.getElementById('step-processing'),
    results: document.getElementById('step-results')
};

const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const btnProcess = document.getElementById('btn-process');
const btnBackUpload = document.getElementById('btn-back-upload');

// Progress Elements
const progressRing = document.getElementById('progress-ring');
const progressText = document.getElementById('progress-text');
const progressStatus = document.getElementById('progress-status');

// Options Elements
const optLanguage = document.getElementById('opt-language');
const optCount = document.getElementById('opt-count');
const qCountDisplay = document.getElementById('q-count-display');

// State
let currentFile = null;
let lastAIData = null;
let circumference = 2 * Math.PI * 40; // r=40

// API Configuration - Key from User
const GEMINI_API_KEY = "AIzaSyCRL7oROgcwgeEUpy6XEqzrsKqVA5sfz6o";
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/";

// Initialize
function init() {
    if (progressRing) {
        progressRing.style.strokeDasharray = `${circumference} ${circumference}`;
        progressRing.style.strokeDashoffset = circumference;
    }

    setupEventListeners();
    runIntroSequence();
}

function runIntroSequence() {
    setTimeout(() => {
        const loadingScreen = document.getElementById('intro-loading');
        if (loadingScreen) {
            loadingScreen.classList.add('slide-up-exit');
            const welcomeScreen = document.getElementById('intro-welcome');
            if (welcomeScreen) welcomeScreen.classList.remove('hidden');
        }
    }, 2500);
}

window.nextIntroStep = function (nextId) {
    const current = document.querySelector('.intro-screen:not(.hidden):not(.slide-up-exit)');
    if (current) current.classList.add('slide-up-exit');

    const next = document.getElementById(nextId);
    if (next) next.classList.remove('hidden');
}

window.finishIntro = function () {
    window.nextIntroStep('none');
    const mainCard = document.getElementById('main-card');
    if (mainCard) mainCard.classList.remove('opacity-0', 'translate-y-20', 'scale-95');
}

function setupEventListeners() {
    if (dropZone) dropZone.addEventListener('click', () => fileInput.click());
    if (fileInput) fileInput.addEventListener('change', handleFileSelect);

    if (dropZone) {
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
        });
    }

    if (optCount) {
        optCount.addEventListener('input', (e) => {
            if (qCountDisplay) qCountDisplay.textContent = e.target.value;
        });
    }

    if (btnBackUpload) btnBackUpload.addEventListener('click', () => switchStep('upload'));
    if (btnProcess) btnProcess.addEventListener('click', startProcessing);
}

function handleFileSelect(e) {
    if (e.target.files.length) handleFile(e.target.files[0]);
}

function handleFile(file) {
    currentFile = file;
    console.log(`File selected: ${file.name}`);
    switchStep('options');
}

function switchStep(stepName) {
    Object.values(steps).forEach(el => {
        if (el) {
            el.classList.add('hidden');
            el.classList.remove('animate-fade-in-up');
        }
    });
    const target = steps[stepName];
    if (target) {
        target.classList.remove('hidden');
        target.classList.add('animate-fade-in-up');
    }
}

// --- Processing Logic ---

async function startProcessing() {
    switchStep('processing');
    setProgress(10, "جاري قراءة الملف...");

    try {
        const text = await extractTextFromFile(currentFile);
        setProgress(40, "تحليل النص بالذكاء الاصطناعي...");

        const lang = optLanguage.value;
        const count = optCount.value;
        const checkboxes = document.querySelectorAll('input[name="qType"]:checked');
        let selectedTypes = Array.from(checkboxes).map(cb => cb.value);
        if (selectedTypes.length === 0) selectedTypes = ['mcq', 'tf', 'fill', 'reasoning'];

        setProgress(60, "توليد الأسئلة والملخص الشامل...");
        const aiData = await callGeminiAPIWithRetry(text, lang, count, selectedTypes);

        setProgress(100, "تم الانتهاء!");
        setTimeout(() => showResults(aiData), 800);

    } catch (error) {
        console.error(error);
        alert("خطأ تقني: " + error.message);
        switchStep('options');
    }
}

function setProgress(percent, msg) {
    if (progressRing) {
        const offset = circumference - (percent / 100) * circumference;
        progressRing.style.strokeDashoffset = offset;
    }
    if (progressText) progressText.textContent = `${percent}%`;
    if (msg && progressStatus) progressStatus.textContent = msg;
}

// --- File Extraction ---

async function extractTextFromFile(file) {
    if (file.type === 'application/pdf') {
        return await extractPDF(file);
    } else {
        return await extractPlainText(file);
    }
}

async function extractPlainText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsText(file);
    });
}

async function extractPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument(arrayBuffer);
    const pdf = await loadingTask.promise;
    let text = "";
    const maxPages = Math.min(pdf.numPages, 15);
    for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const strings = content.items.map(item => item.str);
        text += strings.join(" ") + "\n";
    }
    return text;
}

// --- Gemini API with Auto-Retry and Multiple Model Support ---

async function callGeminiAPIWithRetry(text, lang, count, types, retries = 3) {
    const langName = lang === 'ar' ? "Arabic" : "English";
    const prompt = `
        You are an elite educational AI. 
        Task: Provide a very structured, comprehensive summary AND a wide variety of exam questions in ${langName} based on the input text.
        
        Requirements:
        1. Summary: Detailed, using Markdown formatting (bullet points, bolding).
        2. Questions: Generate about ${count} questions. 
        3. Types: Mix of mcq, tf, fill, reasoning.
        4. Format: Strictly valid JSON.

        Text Context: "${text.substring(0, 35000)}"

        JSON Schema:
        {
            "summary": "Full summary text...",
            "questions": [
                {
                    "type": "mcq" | "tf" | "fill" | "reasoning",
                    "text": "Question text...",
                    "options": ["A", "B", "C", "D"] (mcq only),
                    "correctAnswer": "The answer",
                    "explanation": "Reasoning"
                }
            ]
        }
    `;

    const body = { contents: [{ parts: [{ text: prompt }] }] };

    // Models supported by the provided API key (Confirmed via ListModels)
    const models = [
        'gemini-flash-latest', // Stable alias for 1.5 Flash
        'gemini-2.0-flash',
        'gemini-2.0-flash-lite'
    ];

    let lastError = null;

    for (let i = 0; i < retries; i++) {
        for (const model of models) {
            try {
                console.log(`Attempting Gemini (${model})...`);
                const response = await fetch(`${BASE_URL}${model}:generateContent?key=${GEMINI_API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });

                if (response.status === 429) {
                    const sleepTime = (i + 1) * 7000;
                    setProgress(60, `زحام في الطلبات... محاولة ${i + 1} من ${retries}`);
                    await new Promise(r => setTimeout(r, sleepTime));
                    break; // Retry the loop for quota
                }

                if (!response.ok) {
                    const errText = await response.text();
                    lastError = new Error(`Error ${response.status}: ${errText}`);
                    continue; // Try next model
                }

                const data = await response.json();
                const rawResult = data.candidates[0].content.parts[0].text;
                const jsonString = rawResult.replace(/```json/g, '').replace(/```/g, '').trim();
                return JSON.parse(jsonString);

            } catch (error) {
                lastError = error;
                console.error(`Model ${model} failed:`, error);
            }
        }
        if (i < retries - 1) await new Promise(r => setTimeout(r, 2000));
    }
    throw lastError || new Error("All models failed.");
}

// --- Results Rendering ---

function showResults(data) {
    lastAIData = data; // Store globally
    const summaryEl = document.getElementById('result-summary');
    if (summaryEl) {
        let formattedSummary = data.summary
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>');
        summaryEl.innerHTML = formattedSummary;
    }

    const container = document.getElementById('questions-container');
    if (!container) return;

    container.innerHTML = `<h3 class="text-2xl font-bold text-white mb-6 border-b border-gray-700 pb-2">📂 الأسئلة والتمارين</h3>`;

    data.questions.forEach((q, index) => {
        const card = document.createElement('div');
        card.className = "bg-gray-800/50 backdrop-blur-md rounded-2xl p-6 border border-gray-700/50 mb-6 shadow-xl";

        let typeName = q.type.toUpperCase();
        let html = `
            <div class="flex justify-between items-center mb-4">
                <span class="text-purple-400 font-bold text-xl">#${index + 1}</span>
                <span class="px-3 py-1 rounded-full text-xs font-bold bg-purple-500/20 text-purple-300 border border-white/5 font-mono">${typeName}</span>
            </div>
            <p class="text-white text-lg mb-6 leading-relaxed font-semibold">${q.text}</p>
        `;

        if (q.type === 'mcq' && q.options) {
            html += `<div class="grid gap-3">`;
            q.options.forEach(opt => {
                html += `<button onclick="checkAnswer(this, '${opt === q.correctAnswer}')" class="w-full text-right bg-gray-900/80 p-4 rounded-xl border border-gray-700 hover:border-purple-500 transition-all text-gray-300">
                    ${opt}
                </button>`;
            });
            html += `</div>`;
        } else if (q.type === 'tf') {
            html += `<div class="flex gap-4">
                <button onclick="checkAnswer(this, '${String(q.correctAnswer).toLowerCase().includes('t') || q.correctAnswer === 'صحيح'}')" class="flex-1 bg-gray-900/80 p-4 rounded-xl border border-gray-700 hover:border-green-500 transition-all">صح (صحيح)</button>
                <button onclick="checkAnswer(this, '${String(q.correctAnswer).toLowerCase().includes('f') || q.correctAnswer === 'خطأ'}')" class="flex-1 bg-gray-900/80 p-4 rounded-xl border border-gray-700 hover:border-red-500 transition-all">خطأ</button>
            </div>`;
        } else {
            html += `
                <button onclick="this.nextElementSibling.classList.toggle('hidden')" class="text-sm text-purple-400 underline py-2 font-medium">🔍 إظهار الإجابة النموذجية</button>
                <div class="hidden mt-4 p-4 bg-purple-900/20 border border-purple-500/30 rounded-xl text-green-300">
                    <strong>الإجابة:</strong> ${q.correctAnswer}
                    ${q.explanation ? `<p class="text-gray-400 text-sm mt-2 font-light">${q.explanation}</p>` : ''}
                </div>
            `;
        }

        card.innerHTML = html;
        container.appendChild(card);
    });

    switchStep('results');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.checkAnswer = function (btn, isCorrect) {
    const isSuccess = (String(isCorrect) === 'true');
    const buttons = btn.parentElement.querySelectorAll('button');
    buttons.forEach(b => b.classList.remove('bg-green-600', 'bg-red-600', 'border-green-400', 'border-red-400', 'text-white'));

    if (isSuccess) {
        btn.classList.add('bg-green-600', 'border-green-400', 'text-white');
    } else {
        btn.classList.add('bg-red-600', 'border-red-400', 'text-white');
    }
}

// --- Print-to-PDF Logic (Real Text Support) ---
function preparePrintArea(withAnswers) {
    // Remove old print area if exists
    const oldArea = document.getElementById('print-area');
    if (oldArea) oldArea.remove();

    const includeSummary = document.getElementById('chk-include-summary')?.checked;
    const printArea = document.createElement('div');
    printArea.id = 'print-area';

    let html = `
        <div style="text-align: center; border-bottom: 2px solid #8B5CF6; padding-bottom: 20px; margin-bottom: 30px;">
            <h1 style="font-size: 28px; color: #8B5CF6; margin-bottom: 5px;">تقرير إيجاز الذكي</h1>
            <p style="color: #666; font-family: sans-serif; letter-spacing: 2px;">Eejaz AI Report</p>
        </div>
    `;

    if (includeSummary) {
        html += `
            <div style="margin-bottom: 40px;">
                <h2 style="font-size: 22px; border-right: 4px solid #EC4899; padding-right: 15px; margin-bottom: 15px;">الملخص الشامل</h2>
                <div style="font-size: 16px; line-height: 1.8; color: #333; text-align: justify;">
                    ${lastAIData.summary.replace(/\n/g, '<br>')}
                </div>
            </div>
        `;
    }

    html += `
        <div>
            <h2 style="font-size: 22px; border-right: 4px solid #8B5CF6; padding-right: 15px; margin-bottom: 20px;">الأسئلة والتمارين</h2>
    `;

    lastAIData.questions.forEach((q, i) => {
        html += `
            <div style="margin-bottom: 25px; padding: 15px; border: 1px solid #eee; border-radius: 10px;">
                <p style="font-weight: bold; margin-bottom: 10px;">س${i + 1}: ${q.text}</p>
        `;

        if (q.type === 'mcq' && q.options) {
            html += `<ul style="list-style: none; padding-right: 20px;">`;
            q.options.forEach(opt => {
                html += `<li style="margin-bottom: 5px;">- ${opt}</li>`;
            });
            html += `</ul>`;
        }

        if (withAnswers) {
            html += `
                <div style="margin-top: 10px; padding: 10px; background: #f0fdf4; color: #166534; border-radius: 5px; font-size: 14px;">
                    <strong>الإجابة:</strong> ${q.correctAnswer}
                    ${q.explanation ? `<p style="margin-top:5px; color:#666; font-style:italic;">${q.explanation}</p>` : ''}
                </div>
            `;
        } else {
            // Add writing space if downloading for students without answers
            if (q.type === 'reasoning' || q.type === 'fill' || q.type === 'tf') {
                html += `
                    <div style="margin-top: 15px; border-bottom: 1px dotted #ccc; height: 30px;"></div>
                    <div style="margin-top: 5px; border-bottom: 1px dotted #ccc; height: 30px;"></div>
                    ${q.type === 'reasoning' ? '<div style="margin-top: 5px; border-bottom: 1px dotted #ccc; height: 30px;"></div>' : ''}
                `;
            }
        }

        html += `</div>`;
    });

    html += `</div>`;
    printArea.innerHTML = html;
    document.body.appendChild(printArea);
}

document.getElementById('btn-download-no-answers')?.addEventListener('click', () => {
    if (!lastAIData) return;
    preparePrintArea(false);
    window.print();
});

document.getElementById('btn-download-with-answers')?.addEventListener('click', () => {
    if (!lastAIData) return;
    preparePrintArea(true);
    window.print();
});

// --- Exam Modal Logic ---
let examLogoBase64 = null;

document.getElementById('btn-print-exam')?.addEventListener('click', () => {
    document.getElementById('exam-modal').classList.remove('hidden');
});

document.getElementById('btn-close-exam')?.addEventListener('click', () => {
    document.getElementById('exam-modal').classList.add('hidden');
});

document.getElementById('exam-logo')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            examLogoBase64 = event.target.result;
        };
        reader.readAsDataURL(file);
    }
});

document.getElementById('btn-confirm-exam')?.addEventListener('click', () => {
    if (!lastAIData) return;

    const instName = document.getElementById('exam-inst-name').value || "مؤسسة تعليمية";
    const teacherName = document.getElementById('exam-teacher-name').value || "أستاذ المادة";
    const subjectName = document.getElementById('exam-subject-name').value || "امتحان تقييمي";
    const note = document.getElementById('exam-note').value || "";
    const totalMark = parseFloat(document.getElementById('exam-total-mark').value) || 0;

    prepareOfficialExamArea(instName, teacherName, note, totalMark, subjectName);
    document.getElementById('exam-modal').classList.add('hidden');

    // Give a small delay for the image to render in the print area before opening dialog
    setTimeout(() => {
        window.print();
    }, 500);
});

function prepareOfficialExamArea(instName, teacherName, note, totalMark, subjectName) {
    const oldArea = document.getElementById('print-area');
    if (oldArea) oldArea.remove();

    const printArea = document.createElement('div');
    printArea.id = 'print-area';

    const today = new Date().toLocaleDateString('ar-EG');

    let html = `
        <!-- Official Header -->
        <div style="display: flex; justify-content: space-between; align-items: stretch; border-bottom: 2px solid #000; padding-bottom: 15px; margin-bottom: 25px;">
            <div style="flex: 1; text-align: right; display: flex; flex-direction: column; justify-content: flex-end;">
                <p style="font-weight: bold;">الأستاذ: ${teacherName}</p>
            </div>
            <div style="flex: 1.5; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;">
                ${examLogoBase64 ? `<img src="${examLogoBase64}" style="max-height: 80px; max-width: 150px; object-fit: contain;">` : ''}
                <h2 style="font-weight: bold; font-size: 20px; margin: 0;">${instName}</h2>
            </div>
            <div style="flex: 1; text-align: left; display: flex; flex-direction: column; justify-content: flex-end;">
                <p style="font-weight: bold; margin-bottom: 5px;">المادة: ${subjectName}</p>
                <p style="font-weight: bold;">التاريخ: ${today}</p>
            </div>
        </div>

        <!-- Student Info Grid -->
        <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 20px; border: 1px solid #000; padding: 10px; margin-bottom: 30px; border-radius: 5px;">
            <div style="text-align: right;">اسم الطالب: ................................................................................</div>
            <div style="text-align: left; border-right: 1px solid #000; padding-right: 15px;">الدرجة: ............ / ${totalMark > 0 ? totalMark : '............'}</div>
        </div>

        <h2 style="text-align: center; text-decoration: underline; margin-bottom: 25px;">أجب عن الأسئلة التالية</h2>
    `;

    const markPerQuestion = totalMark > 0 ? (totalMark / lastAIData.questions.length).toFixed(1) : null;

    lastAIData.questions.forEach((q, i) => {
        html += `
            <div style="margin-bottom: 30px; position: relative; padding-right: 45px;">
                <!-- Mark Selection Area -->
                <div style="position: absolute; right: 0; top: 0; width: 40px; height: 35px; border: 1px solid #000; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 11px; font-weight: bold;">
                    <span>${markPerQuestion ? markPerQuestion : '...'}</span>
                    <span style="font-size: 8px; border-top: 1px solid #eee; width: 100%; text-align: center;">درجة</span>
                </div>
                
                <p style="font-weight: bold; margin-bottom: 12px; font-size: 17px;">س${i + 1}: ${q.text}</p>
        `;

        if (q.type === 'mcq' && q.options) {
            html += `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding-right: 20px;">`;
            q.options.forEach(opt => {
                html += `<div>( ) ${opt}</div>`;
            });
            html += `</div>`;
        } else if (q.type === 'tf') {
            html += `
                <div style="display: flex; gap: 40px; padding-right: 20px;">
                    <div>( ) صح</div>
                    <div>( ) خطأ</div>
                </div>
            `;
        } else {
            html += `
                <div style="margin-top: 15px; border-bottom: 1px dotted #000; height: 35px; width: 95%;"></div>
                <div style="margin-top: 5px; border-bottom: 1px dotted #000; height: 35px; width: 95%;"></div>
                ${q.type === 'reasoning' ? '<div style="margin-top: 5px; border-bottom: 1px dotted #000; height: 35px; width: 95%;"></div>' : ''}
            `;
        }

        html += `</div>`;
    });

    if (note) {
        html += `
            <div style="margin-top: 50px; border-top: 1px solid #eee; padding-top: 15px;">
                <p style="font-weight: 600; font-size: 14px; color: #333;">⚠️ ملاحظة هامة: ${note}</p>
            </div>
        `;
    }

    html += `
        <div style="margin-top: 40px; text-align: center; color: #000; font-style: italic; border-top: 2px solid #000; padding-top: 15px; font-weight: bold; font-size: 16px;">
            انتهت الأسئلة - مع تمنياتي لكم بالتوفيق والنجاح
        </div>

        <div style="margin-top: 20px; text-align: center; color: #666; font-size: 10px; opacity: 0.6;">
            تمت طباعة واختيار الاسئلة عن طريق منصة ايجاز eejaz ai
        </div>
    `;

    html += `</div>`;
    printArea.innerHTML = html;
    document.body.appendChild(printArea);
}

document.addEventListener('DOMContentLoaded', init);
