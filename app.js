/* ==========================================================================
   Ledger — Grade Calculator
   Vanilla JS. No frameworks. Organized into clearly separated modules below.
   ========================================================================== */

(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 1. CONSTANTS & STATE
   * ------------------------------------------------------------------ */

  const STORAGE_KEY = 'ledger.gradeCalculator.state.v1';
  const THEME_KEY = 'ledger.gradeCalculator.theme.v1';

  const GRADE_SCALE = [
    { min: 90, max: 100, letter: 'A+', gpa: 4.0 },
    { min: 85, max: 89.999, letter: 'A', gpa: 4.0 },
    { min: 80, max: 84.999, letter: 'A-', gpa: 3.7 },
    { min: 75, max: 79.999, letter: 'B+', gpa: 3.3 },
    { min: 70, max: 74.999, letter: 'B', gpa: 3.0 },
    { min: 65, max: 69.999, letter: 'B-', gpa: 2.7 },
    { min: 60, max: 64.999, letter: 'C+', gpa: 2.3 },
    { min: 55, max: 59.999, letter: 'C', gpa: 2.0 },
    { min: 50, max: 54.999, letter: 'D', gpa: 1.0 },
    { min: 0, max: 49.999, letter: 'F', gpa: 0.0 },
  ];

  const PERFORMANCE_LEVELS = [
    { min: 90, key: 'excellent', label: 'Excellent', icon: 'fa-trophy' },
    { min: 75, key: 'verygood', label: 'Very good', icon: 'fa-star' },
    { min: 60, key: 'good', label: 'Good', icon: 'fa-thumbs-up' },
    { min: 50, key: 'fair', label: 'Fair', icon: 'fa-hand' },
    { min: 0, key: 'poor', label: 'Needs work', icon: 'fa-seedling' },
  ];

  const RING_CIRCUMFERENCE = 2 * Math.PI * 68; // matches r=68 in SVG

  /** @type {{studentName: string, studentId: string, subjects: {id:string,name:string,score:string}[]}} */
  let state = {
    studentName: '',
    studentId: '',
    subjects: [],
  };

  let chartInstance = null;
  let autoSaveTimer = null;

  /* ------------------------------------------------------------------ *
   * 2. DOM REFERENCES
   * ------------------------------------------------------------------ */

  const el = {
    studentName: document.getElementById('studentName'),
    studentId: document.getElementById('studentId'),
    studentNameError: document.getElementById('studentNameError'),
    subjectList: document.getElementById('subjectList'),
    subjectCountPill: document.getElementById('subjectCountPill'),
    addSubjectBtn: document.getElementById('addSubjectBtn'),
    calculateBtn: document.getElementById('calculateBtn'),
    resetBtn: document.getElementById('resetBtn'),
    rowTemplate: document.getElementById('subjectRowTemplate'),

    heroStudentName: document.getElementById('heroStudentName'),
    heroStudentId: document.getElementById('heroStudentId'),
    performanceBadge: document.getElementById('performanceBadge'),
    ringValue: document.getElementById('ringValue'),
    ringPercent: document.getElementById('ringPercent'),

    statSubjects: document.getElementById('statSubjects'),
    statHighest: document.getElementById('statHighest'),
    statLowest: document.getElementById('statLowest'),
    statAverage: document.getElementById('statAverage'),
    statGpa: document.getElementById('statGpa'),
    statGrade: document.getElementById('statGrade'),

    scoreChart: document.getElementById('scoreChart'),

    printBtn: document.getElementById('printBtn'),
    pdfBtn: document.getElementById('pdfBtn'),
    csvBtn: document.getElementById('csvBtn'),
    reportArea: document.getElementById('reportArea'),

    themeToggle: document.getElementById('themeToggle'),
    liveDateTime: document.getElementById('liveDateTime'),
    fabAdd: document.getElementById('fabAdd'),
    toastRegion: document.getElementById('toastRegion'),
    confettiCanvas: document.getElementById('confettiCanvas'),
  };

  /* ------------------------------------------------------------------ *
   * 3. UTILITIES
   * ------------------------------------------------------------------ */

  function uid() {
    return 'sub_' + Math.random().toString(36).slice(2, 10);
  }

  function clamp(n, min, max) {
    return Math.min(Math.max(n, min), max);
  }

  function round(n, decimals = 2) {
    const f = Math.pow(10, decimals);
    return Math.round((n + Number.EPSILON) * f) / f;
  }

  function debounce(fn, delay) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), delay);
    };
  }

  function getGradeFor(average) {
    return GRADE_SCALE.find((g) => average >= g.min && average <= g.max) || GRADE_SCALE[GRADE_SCALE.length - 1];
  }

  function getPerformanceFor(average) {
    return PERFORMANCE_LEVELS.find((p) => average >= p.min) || PERFORMANCE_LEVELS[PERFORMANCE_LEVELS.length - 1];
  }

  /* ------------------------------------------------------------------ *
   * 4. TOASTS
   * ------------------------------------------------------------------ */

  const TOAST_ICONS = {
    success: 'fa-circle-check',
    error: 'fa-circle-exclamation',
    info: 'fa-circle-info',
  };

  function showToast(message, type = 'info', duration = 3200) {
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.innerHTML = `<i class="fa-solid ${TOAST_ICONS[type] || TOAST_ICONS.info}" aria-hidden="true"></i><span>${message}</span>`;
    el.toastRegion.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('hide');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
    }, duration);
  }

  /* ------------------------------------------------------------------ *
   * 5. PERSISTENCE (autosave + theme)
   * ------------------------------------------------------------------ */

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          state.studentName = parsed.studentName || '';
          state.studentId = parsed.studentId || '';
          state.subjects = Array.isArray(parsed.subjects) ? parsed.subjects : [];
        }
      }
    } catch (e) {
      console.warn('Could not read saved data, starting fresh.', e);
    }
  }

  function persistState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Autosave failed.', e);
    }
  }

  const scheduleAutosave = debounce(() => {
    persistState();
  }, 500);

  function loadTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const theme = saved === 'light' ? 'light' : 'dark';
    applyTheme(theme, false);
  }

  function applyTheme(theme, announce = true) {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    el.themeToggle.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
    el.themeToggle.setAttribute('aria-label', theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
    localStorage.setItem(THEME_KEY, theme);
    if (announce) showToast(`${theme === 'light' ? 'Light' : 'Dark'} mode on`, 'info', 1600);
    if (chartInstance) updateChartTheme();
  }

  /* ------------------------------------------------------------------ *
   * 6. SUBJECT ROW RENDERING
   * ------------------------------------------------------------------ */

  function addSubject(name = '', score = '', persist = true) {
    const subject = { id: uid(), name, score };
    state.subjects.push(subject);
    renderSubjectRow(subject);
    updateSubjectCount();
    if (persist) scheduleAutosave();
  }

  function renderSubjectRow(subject) {
    const fragment = el.rowTemplate.content.cloneNode(true);
    const row = fragment.querySelector('[data-row]');
    row.dataset.id = subject.id;

    const nameInput = row.querySelector('.subject-name');
    const scoreInput = row.querySelector('.subject-score');
    const removeBtn = row.querySelector('.row-remove');

    nameInput.value = subject.name;
    scoreInput.value = subject.score;

    nameInput.addEventListener('input', () => {
      subject.name = nameInput.value;
      clearRowError(row);
      scheduleAutosave();
    });

    scoreInput.addEventListener('input', () => {
      subject.score = scoreInput.value;
      clearRowError(row);
      scheduleAutosave();
    });

    scoreInput.addEventListener('blur', () => {
      if (scoreInput.value === '') return;
      const val = clamp(Number(scoreInput.value), 0, 100);
      scoreInput.value = val;
      subject.score = String(val);
      scheduleAutosave();
    });

    removeBtn.addEventListener('click', () => removeSubject(subject.id, row));

    el.subjectList.appendChild(fragment);
  }

  function removeSubject(id, row) {
    row.classList.add('removing');
    row.addEventListener(
      'animationend',
      () => {
        row.remove();
        state.subjects = state.subjects.filter((s) => s.id !== id);
        updateSubjectCount();
        scheduleAutosave();
      },
      { once: true }
    );
    showToast('Subject removed', 'info', 1800);
  }

  function updateSubjectCount() {
    const count = state.subjects.length;
    el.subjectCountPill.textContent = `${count} subject${count === 1 ? '' : 's'}`;
  }

  function clearRowError(row) {
    row.querySelector('.subject-name').classList.remove('invalid');
    row.querySelector('.subject-score').classList.remove('invalid');
    row.querySelector('.row-error').textContent = '';
  }

  /* ------------------------------------------------------------------ *
   * 7. VALIDATION
   * ------------------------------------------------------------------ */

  function validateAll() {
    let isValid = true;
    el.studentNameError.textContent = '';
    el.studentName.classList.remove('invalid');

    if (!el.studentName.value.trim()) {
      el.studentNameError.textContent = 'Please enter the student\u2019s name.';
      el.studentName.classList.add('invalid');
      isValid = false;
    }

    if (state.subjects.length === 0) {
      showToast('Add at least one subject before calculating.', 'error');
      isValid = false;
    }

    const rows = el.subjectList.querySelectorAll('[data-row]');
    rows.forEach((row) => {
      const id = row.dataset.id;
      const subject = state.subjects.find((s) => s.id === id);
      const nameInput = row.querySelector('.subject-name');
      const scoreInput = row.querySelector('.subject-score');
      const rowError = row.querySelector('.row-error');
      let rowValid = true;

      if (!subject.name.trim()) {
        nameInput.classList.add('invalid');
        rowValid = false;
      }

      const scoreNum = Number(subject.score);
      if (subject.score === '' || subject.score === null || Number.isNaN(scoreNum)) {
        scoreInput.classList.add('invalid');
        rowError.textContent = 'Enter a score.';
        rowValid = false;
      } else if (scoreNum < 0 || scoreNum > 100) {
        scoreInput.classList.add('invalid');
        rowError.textContent = 'Score must be between 0 and 100.';
        rowValid = false;
      }

      if (!rowValid) isValid = false;
    });

    return isValid;
  }

  /* ------------------------------------------------------------------ *
   * 8. CALCULATIONS
   * ------------------------------------------------------------------ */

  function calculate() {
    if (!validateAll()) {
      showToast('Please fix the highlighted fields.', 'error');
      return;
    }

    el.calculateBtn.classList.add('btn--loading');
    el.calculateBtn.disabled = true;

    // Simulated brief processing state for a polished feel.
    setTimeout(() => {
      const scores = state.subjects.map((s) => Number(s.score));
      const total = round(scores.reduce((a, b) => a + b, 0));
      const average = round(total / scores.length);
      const highest = Math.max(...scores);
      const lowest = Math.min(...scores);
      const gradeInfo = getGradeFor(average);
      const performance = getPerformanceFor(average);

      renderHero(average, gradeInfo, performance);
      renderStats({ count: scores.length, highest, lowest, average, gpa: gradeInfo.gpa, grade: gradeInfo.letter });
      renderChart(state.subjects.map((s) => s.name || 'Untitled'), scores);

      el.calculateBtn.classList.remove('btn--loading');
      el.calculateBtn.disabled = false;

      showToast('Grades calculated successfully!', 'success');

      if (gradeInfo.letter === 'A+' || gradeInfo.letter === 'A') {
        launchConfetti();
      }

      el.reportArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 550);
  }

  function renderHero(average, gradeInfo, performance) {
    el.heroStudentName.textContent = state.studentName.trim() || 'Your report';
    el.heroStudentId.textContent = state.studentId.trim() ? `ID: ${state.studentId.trim()}` : '';

    el.performanceBadge.dataset.level = performance.key;
    el.performanceBadge.innerHTML = `<i class="fa-solid ${performance.icon}" aria-hidden="true"></i><span>${performance.label} \u2014 ${gradeInfo.letter}</span>`;

    const offset = RING_CIRCUMFERENCE - (clamp(average, 0, 100) / 100) * RING_CIRCUMFERENCE;
    requestAnimationFrame(() => {
      el.ringValue.style.strokeDashoffset = String(offset);
    });
    animateCounterRaw(el.ringPercent, average, '%');
  }

  function renderStats(stats) {
    animateCounter(el.statSubjects, stats.count);
    animateCounter(el.statHighest, stats.highest);
    animateCounter(el.statLowest, stats.lowest);
    animateCounter(el.statAverage, stats.average);
    el.statGpa.textContent = stats.gpa.toFixed(1);
    el.statGrade.textContent = stats.grade;
  }

  /* ------------------------------------------------------------------ *
   * 9. ANIMATED COUNTERS
   * ------------------------------------------------------------------ */

  function animateCounter(node, target, suffix = '') {
    const duration = 700;
    const start = performance_now();
    const from = Number(node.dataset.current || 0);

    function tick(now) {
      const progress = clamp((now - start) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = from + (target - from) * eased;
      node.textContent = (Number.isInteger(target) ? Math.round(value) : round(value, 1)) + suffix;
      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        node.dataset.current = String(target);
      }
    }
    requestAnimationFrame(tick);
  }

  function animateCounterRaw(node, target, suffix) {
    animateCounter(node, target, suffix);
  }

  function performance_now() {
    return window.performance && window.performance.now ? window.performance.now() : Date.now();
  }

  /* ------------------------------------------------------------------ *
   * 10. CHART
   * ------------------------------------------------------------------ */

  function getThemeColors() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    return {
      grid: isLight ? 'rgba(15,23,42,0.08)' : 'rgba(255,255,255,0.08)',
      text: isLight ? '#4b5675' : '#93a1c4',
    };
  }

  const BAR_PALETTE = ['#6366f1', '#f5b942', '#34d399', '#f472b6', '#60a5fa', '#fb923c', '#a78bfa', '#4ade80'];

  function renderChart(labels, scores) {
    const colors = getThemeColors();
    const barColors = scores.map((_, i) => BAR_PALETTE[i % BAR_PALETTE.length]);

    if (chartInstance) {
      chartInstance.data.labels = labels;
      chartInstance.data.datasets[0].data = scores;
      chartInstance.data.datasets[0].backgroundColor = barColors;
      chartInstance.options.scales.x.ticks.color = colors.text;
      chartInstance.options.scales.y.ticks.color = colors.text;
      chartInstance.options.scales.y.grid.color = colors.grid;
      chartInstance.update();
      return;
    }

    chartInstance = new Chart(el.scoreChart.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Score',
            data: scores,
            backgroundColor: barColors,
            borderRadius: 8,
            maxBarThickness: 46,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 800, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0f1629',
            titleFont: { family: 'Inter' },
            bodyFont: { family: 'JetBrains Mono' },
            padding: 10,
            cornerRadius: 8,
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: colors.text, font: { family: 'Inter' } } },
          y: {
            beginAtZero: true,
            max: 100,
            grid: { color: colors.grid },
            ticks: { color: colors.text, font: { family: 'JetBrains Mono' } },
          },
        },
      },
    });
  }

  function updateChartTheme() {
    if (!chartInstance) return;
    const colors = getThemeColors();
    chartInstance.options.scales.x.ticks.color = colors.text;
    chartInstance.options.scales.y.ticks.color = colors.text;
    chartInstance.options.scales.y.grid.color = colors.grid;
    chartInstance.update();
  }

  /* ------------------------------------------------------------------ *
   * 11. CONFETTI (lightweight, dependency-free)
   * ------------------------------------------------------------------ */

  function launchConfetti() {
    const canvas = el.confettiCanvas;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#6366f1', '#f5b942', '#34d399', '#f472b6', '#60a5fa'];
    const pieces = Array.from({ length: 140 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height * 0.3,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 10,
      color: colors[Math.floor(Math.random() * colors.length)],
      speedY: 2 + Math.random() * 3,
      speedX: -1.5 + Math.random() * 3,
      rotation: Math.random() * 360,
      rotationSpeed: -6 + Math.random() * 12,
    }));

    let frame = 0;
    const maxFrames = 220;

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach((p) => {
        p.x += p.speedX;
        p.y += p.speedY;
        p.rotation += p.rotationSpeed;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      frame++;
      if (frame < maxFrames) {
        requestAnimationFrame(draw);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    requestAnimationFrame(draw);
  }

  /* ------------------------------------------------------------------ *
   * 12. EXPORTS
   * ------------------------------------------------------------------ */

  function exportCSV() {
    if (state.subjects.length === 0) {
      showToast('Nothing to export yet. Add subjects first.', 'error');
      return;
    }
    const rows = [
      ['Student Name', state.studentName || ''],
      ['Student ID', state.studentId || ''],
      [],
      ['Subject', 'Score'],
      ...state.subjects.map((s) => [s.name || 'Untitled', s.score || '0']),
    ];
    const csvContent = rows.map((r) => r.map(csvEscape).join(',')).join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${(state.studentName || 'grade-report').replace(/\s+/g, '_')}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast('CSV exported.', 'success');
  }

  function csvEscape(value) {
    const str = String(value ?? '');
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  }

  function exportPDF() {
    if (typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
      showToast('PDF library failed to load. Check your connection.', 'error');
      return;
    }
    showToast('Preparing your PDF\u2026', 'info', 2000);

    html2canvas(el.reportArea, {
      backgroundColor: document.documentElement.getAttribute('data-theme') === 'light' ? '#eef1fa' : '#0a0f1e',
      scale: 2,
    }).then((canvas) => {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const imgWidth = pageWidth - 40;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 20, 20, imgWidth, imgHeight);
      pdf.save(`${(state.studentName || 'grade-report').replace(/\s+/g, '_')}.pdf`);
      showToast('PDF downloaded.', 'success');
    }).catch(() => {
      showToast('Could not generate the PDF. Try printing instead.', 'error');
    });
  }

  /* ------------------------------------------------------------------ *
   * 13. RESET
   * ------------------------------------------------------------------ */

  function resetAll() {
    const confirmed = window.confirm('This will clear all entered data. Are you sure?');
    if (!confirmed) return;

    state = { studentName: '', studentId: '', subjects: [] };
    localStorage.removeItem(STORAGE_KEY);

    el.studentName.value = '';
    el.studentId.value = '';
    el.subjectList.innerHTML = '';
    updateSubjectCount();

    el.heroStudentName.textContent = 'Your report';
    el.heroStudentId.textContent = '';
    el.performanceBadge.dataset.level = 'none';
    el.performanceBadge.innerHTML = '<i class="fa-solid fa-seedling" aria-hidden="true"></i><span>Add subjects to begin</span>';
    el.ringValue.style.strokeDashoffset = String(RING_CIRCUMFERENCE);
    el.ringPercent.textContent = '0%';
    el.ringPercent.dataset.current = '0';

    ['statSubjects', 'statHighest', 'statLowest', 'statAverage'].forEach((key) => {
      el[key].textContent = '0';
      el[key].dataset.current = '0';
    });
    el.statGpa.textContent = '0.0';
    el.statGrade.textContent = '\u2014';

    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }

    addSubject('', '', false);
    persistState();
    showToast('Everything has been reset.', 'info');
  }

  /* ------------------------------------------------------------------ *
   * 14. LIVE CLOCK
   * ------------------------------------------------------------------ */

  function updateClock() {
    const now = new Date();
    const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    el.liveDateTime.textContent = now.toLocaleString(undefined, options);
    el.liveDateTime.setAttribute('datetime', now.toISOString());
  }

  /* ------------------------------------------------------------------ *
   * 15. INIT
   * ------------------------------------------------------------------ */

  function bindEvents() {
    el.studentName.addEventListener('input', () => {
      state.studentName = el.studentName.value;
      el.studentName.classList.remove('invalid');
      el.studentNameError.textContent = '';
      scheduleAutosave();
    });

    el.studentId.addEventListener('input', () => {
      state.studentId = el.studentId.value;
      scheduleAutosave();
    });

    el.addSubjectBtn.addEventListener('click', () => addSubject());
    el.fabAdd.addEventListener('click', () => {
      addSubject();
      el.subjectList.lastElementChild?.querySelector('.subject-name')?.focus();
      showToast('New subject row added.', 'info', 1600);
    });

    el.calculateBtn.addEventListener('click', calculate);
    el.resetBtn.addEventListener('click', resetAll);

    el.printBtn.addEventListener('click', () => window.print());
    el.pdfBtn.addEventListener('click', exportPDF);
    el.csvBtn.addEventListener('click', exportCSV);

    el.themeToggle.addEventListener('click', () => {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      applyTheme(isLight ? 'dark' : 'light');
    });

    window.addEventListener('resize', () => {
      if (el.confettiCanvas) {
        el.confettiCanvas.width = window.innerWidth;
        el.confettiCanvas.height = window.innerHeight;
      }
    });
  }

  function init() {
    loadTheme();
    loadState();
    bindEvents();

    el.studentName.value = state.studentName;
    el.studentId.value = state.studentId;

    if (state.subjects.length === 0) {
      addSubject('Mathematics', '', false);
      addSubject('Physics', '', false);
    } else {
      state.subjects.forEach((s) => renderSubjectRow(s));
      updateSubjectCount();
    }

    updateClock();
    setInterval(updateClock, 30000);

    // Initialize ring at rest.
    el.ringValue.style.strokeDasharray = String(RING_CIRCUMFERENCE);
    el.ringValue.style.strokeDashoffset = String(RING_CIRCUMFERENCE);
  }

  document.addEventListener('DOMContentLoaded', init);
})();