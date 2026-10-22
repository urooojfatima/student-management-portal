/* =========================================================================
   EduCore — Student Management Portal
   script.js
   -------------------------------------------------------------------------
   SECTIONS
   1. Utilities                 5. Mini chart library (canvas, no deps)
   2. Storage + demo seed data  6. Router, sidebar & topbar
   3. Data helpers & statistics 7. Page renderers
   4. UI primitives             8. Event delegation & boot
   -------------------------------------------------------------------------
   IMPORTANT (honest scope): this is a front-end demo. All records live in
   localStorage in THIS browser. There is no server, no authentication,
   no email/SMS/push delivery and no real payment processing.
   ========================================================================= */

'use strict';

/* ===================== 1. UTILITIES ===================== */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Escape untrusted text before inserting into HTML (XSS safe). */
function esc(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const pad2 = n => String(n).padStart(2, '0');
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "2026-03-09" -> "09 Mar 2026" */
function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return String(iso);
  return `${pad2(d)} ${MONTHS[m - 1]} ${y}`;
}
function fmtDateLong(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).split('-').map(Number);
  return `${DAYS[new Date(y, m - 1, d).getDay()]}, ${d} ${MONTHS[m - 1]} ${y}`;
}
function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}
function dayDiff(a, b) {
  const p = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
  return Math.round((p(b) - p(a)) / 86400000);
}
const isWeekend = iso => [0, 6].includes(new Date(iso + 'T00:00:00').getDay());
const money = n => '₹' + Number(n || 0).toLocaleString('en-IN');
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
const initials = name => String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const avatarColor = seedStr => {
  const palette = [['#6366f1', '#8b5cf6'], ['#2563eb', '#06b6d4'], ['#db2777', '#f472b6'], ['#059669', '#10b981'],
    ['#d97706', '#fbbf24'], ['#7c3aed', '#a78bfa'], ['#0891b2', '#22d3ee'], ['#dc2626', '#f87171']];
  let h = 0; for (const ch of String(seedStr)) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  return palette[h % palette.length];
};
const avatarStyle = seedStr => { const [a, b] = avatarColor(seedStr); return `background:linear-gradient(135deg,${a},${b})`; };

/** Generate the next sequential code, e.g. S-2031 (never reuses a deleted code). */
function nextCode(prefix, list) {
  let max = 1000;
  list.forEach(item => {
    const m = String(item.id || '').match(/(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return `${prefix}-${max + 1}`;
}
const uid = () => 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ===================== 2. STORAGE + DEMO SEED DATA ===================== */
const STORAGE_KEY = 'educore_demo_v1';

let DB = null;               // the whole demo database
const ui = {                 // per-session UI state (not persisted)
  page: 'dashboard',
  collapsed: false,
  students: { q: '', classId: '', gender: '', sort: 'name', dir: 1, page: 1, view: 'table' },
  teachers:  { q: '', subjectId: '', sort: 'name', dir: 1, view: 'table' },
  attendance:{ classId: '', date: todayISO(), historyClass: '', historyFrom: '', historyTo: '', q: '' },
  exams:     { q: '', classId: '', entryExamId: '' },
  results:   { examId: '', q: '', sort: 'rank', dir: 1 },
  classes:   { q: '' },
  subjects:  { q: '', classId: '' },
  fees:      { q: '', classId: '', status: '', month: '', sort: 'student', dir: 1 },
  homework:  { q: '', classId: '', subjectId: '', status: '' },
  resources: { q: '', type: '', subjectId: '' },
  timetable: { classId: '', day: 'Monday' },
  calendar:  { month: new Date().getMonth(), year: new Date().getFullYear() },
  announce:  { q: '', category: '' },
  reports:   { type: 'students', classId: '', from: '', to: '' }
};

function saveDB() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(DB)); }
  catch (e) { toast('Could not save to this browser (storage full or blocked).', 'error'); }
}
function loadDB() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) { DB = JSON.parse(raw); if (DB && DB.version === 1) return true; }
  } catch (e) { console.warn('Stored demo data was unreadable, reseeding.', e); }
  DB = buildSeedData();
  saveDB();
  return false;
}

/** Builds a fresh, realistic set of demo records. */
function buildSeedData() {
  const today = todayISO();
  const db = {
    version: 1,
    settings: {
      schoolName: 'Greenwood International School',
      logoText: 'EC',
      theme: 'light',
      collapsed: false,
      pageSize: 8,
      passMark: 40,
      session: '2025 - 2026',
      principal: 'Dr. Meera Iyer',
      address: '18 Hillview Road, Bengaluru 560001',
      phone: '+91 80 4123 7788',
      email: 'office@greenwood.edu',
      animations: true,
      denseTables: false,
      showDemoBanner: true
    },
    classes: [], subjects: [], teachers: [], students: [],
    attendance: {},        // key: `${date}|${classId}` -> { records: { studentId: status } }
    exams: [], marks: {},  // marks[examId][studentId][subjectId] = score
    fees: [], paymentsLog: [],
    homework: [], resources: [],
    timetable: [], events: [],
    announcements: [], notifications: [],
    activities: []
  };

  /* ---- Classes ---- */
  const classDefs = [['Grade 6', 'A', 201], ['Grade 6', 'B', 202], ['Grade 7', 'A', 203],
    ['Grade 8', 'A', 204], ['Grade 9', 'A', 205], ['Grade 10', 'A', 206]];
  db.classes = classDefs.map((c, i) => ({
    id: 'c' + (i + 1), name: c[0], section: c[1], room: 'Room ' + c[2],
    capacity: 40, teacherId: 'T-100' + (i + 1)
  }));

  /* ---- Subjects ---- */
  const subjectDefs = [
    ['Mathematics', 'MATH'], ['English', 'ENG'], ['Science', 'SCI'],
    ['Social Studies', 'SST'], ['Computer Science', 'CS'], ['Second Language', 'LAN'], ['Physical Education', 'PE']
  ];
  db.subjects = subjectDefs.map((s, i) => ({
    id: 's' + (i + 1), name: s[0], code: s[1],
    classIds: db.classes.map(c => c.id),
    teacherId: 'T-100' + ((i % 8) + 1)
  }));

  /* ---- Teachers ---- */
  const teacherDefs = [
    ['Anita Desai', 'Mathematics', 'M.Sc. Mathematics', 'Female'],
    ['Rajesh Kumar', 'Science', 'M.Sc. Physics', 'Male'],
    ['Farah Sheikh', 'English', 'M.A. English', 'Female'],
    ['Suresh Menon', 'Social Studies', 'M.A. History', 'Male'],
    ['Neha Kapoor', 'Computer Science', 'M.C.A.', 'Female'],
    ['Vikram Rao', 'Mathematics', 'M.Sc. Statistics', 'Male'],
    ['Pooja Bhatt', 'Second Language', 'M.A. Hindi', 'Female'],
    ['Arun Pillai', 'Physical Education', 'B.P.Ed.', 'Male']
  ];
  db.teachers = teacherDefs.map((t, i) => ({
    id: 'T-100' + (i + 1),
    name: t[0], subject: t[1], qualification: t[2], gender: t[3],
    email: t[0].toLowerCase().replace(/[^a-z]+/g, '.') + '@greenwood.edu',
    phone: '+91 98' + String(45000000 + i * 111317).slice(0, 8),
    subjectIds: db.subjects.filter(s => s.name === t[1] || (t[1] === 'Mathematics' && s.name === 'Mathematics')).map(s => s.id),
    classIds: db.classes.filter((c, ci) => ci === i % db.classes.length).map(c => c.id),
    joiningDate: `${2015 + (i % 8)}-06-${pad2(1 + i * 3)}`,
    experience: 3 + (i % 12),
    status: 'Active'
  }));
  // Give a couple of teachers two subjects for a realistic directory
  db.teachers[1].subjectIds = ['s3', 's5'];
  db.teachers[4].subjectIds = ['s5', 's3'];

  /* ---- Students ---- */
  const first = ['Aarav', 'Ananya', 'Vihaan', 'Diya', 'Ishaan', 'Meera', 'Kabir', 'Saanvi', 'Arjun', 'Riya',
    'Rohan', 'Aditi', 'Krishna', 'Nisha', 'Devansh', 'Tara', 'Manav', 'Priya', 'Nikhil', 'Sara',
    'Yash', 'Kavya', 'Advait', 'Zoya', 'Raghav', 'Ira', 'Veer', 'Aisha', 'Samar', 'Myra',
    'Reyansh', 'Anika'];
  const last = ['Sharma', 'Patel', 'Nair', 'Iyer', 'Khan', 'Reddy', 'Gupta', 'Menon', 'Singh', 'Bose',
    'Kapoor', 'Joshi', 'Das', 'Verma', 'Rao', 'Mehta'];
  const rollCounter = {};
  db.students = first.map((f, i) => {
    const cls = db.classes[i % db.classes.length];
    rollCounter[cls.id] = (rollCounter[cls.id] || 0) + 1;
    const gender = i % 2 === 0 ? 'Male' : 'Female';
    const grade = Number(cls.name.replace('Grade ', ''));
    return {
      id: 'S-200' + (i + 1),
      roll: String(rollCounter[cls.id]).padStart(2, '0'),
      name: `${f} ${last[i % last.length]}`,
      classId: cls.id, gender,
      dob: `${2010 + (6 - grade)}-${pad2(((i * 5) % 12) + 1)}-${pad2(((i * 7) % 27) + 1)}`,
      guardian: `${last[i % last.length]} family`,
      guardianName: `${['Ramesh', 'Sunita', 'Anil', 'Kavita', 'Farhan', 'Latha'][i % 6]} ${last[i % last.length]} (${i % 3 === 0 ? 'Father' : 'Mother'})`,
      phone: '+91 9' + String(700000000 + i * 9876543).slice(0, 9),
      email: `${f.toLowerCase()}.${last[i % last.length].toLowerCase()}${i}@demo mail`.replace(/[^a-z0-9.@]/g, '') ,
      address: `${12 + i} ${['Rose', 'Lake', 'Palm', 'Green', 'Hill'][i % 5]} Street, Bengaluru`,
      admissionDate: `${2022 + (i % 4)}-06-${pad2(((i * 3) % 27) + 1)}`,
      bloodGroup: ['A+', 'B+', 'O+', 'AB+', 'O-'][i % 5],
      status: 'Active'
    };
  });

  /* ---- Attendance for the last 24 calendar days (weekdays only) ---- */
  const statuses = ['present', 'present', 'present', 'present', 'present', 'present', 'present', 'present',
    'present', 'present', 'present', 'late', 'absent', 'leave'];
  for (let back = 23; back >= 0; back--) {
    const date = addDays(today, -back);
    if (isWeekend(date)) continue;
    db.classes.forEach((cls, ci) => {
      const roster = db.students.filter(s => s.classId === cls.id);
      const records = {};
      roster.forEach((s, si) => {
        const pick = statuses[(back * 3 + si * 5 + ci) % statuses.length];
        records[s.id] = pick;
      });
      db.attendance[`${date}|${cls.id}`] = { date, classId: cls.id, records, takenAt: date + 'T09:00:00' };
    });
  }

  /* ---- Examinations + marks ---- */
  const examSubjects = ['s1', 's2', 's3', 's4', 's5'];
  db.classes.forEach((cls, i) => {
    const past = addDays(today, -(10 + i * 3));
    const upcoming = addDays(today, 12 + i * 3);
    db.exams.push({
      id: 'e1' + i, name: 'Term 1 Examination', classId: cls.id, term: 'Term 1',
      date: past, status: 'Published',
      subjects: examSubjects.map((sid, si) => ({ subjectId: sid, maxMarks: 100, examDate: addDays(past, si) }))
    });
    db.exams.push({
      id: 'e2' + i, name: 'Half-Yearly Examination', classId: cls.id, term: 'Term 2',
      date: upcoming, status: 'Scheduled',
      subjects: examSubjects.map((sid, si) => ({ subjectId: sid, maxMarks: 100, examDate: addDays(upcoming, si) }))
    });
    const marks = {};
    db.students.filter(s => s.classId === cls.id).forEach((s, si) => {
      const row = {};
      examSubjects.forEach((sid, sj) => {
        row[sid] = Math.min(99, Math.max(28, Math.round(45 + Math.sin((i + 1) * (si + 2) + sj) * 22 + (sj * 3))));
      });
      marks[s.id] = row;
    });
    db.marks['e1' + i] = marks;
  });

  /* ---- Fees (3 months per student) ---- */
  const now = new Date();
  db.students.forEach((s, i) => {
    for (let back = 2; back >= 0; back--) {
      const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
      const monthKey = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
      const total = 1500 + (Number(s.classId.slice(1)) * 100);
      const pattern = (i + back) % 5;                 // 0,1 paid · 2,3 partial · 4 pending
      const paid = pattern <= 1 ? total : pattern <= 3 ? Math.round(total * 0.5) : 0;
      const payments = [];
      if (paid > 0) {
        payments.push({ id: uid(), date: `${monthKey}-07`, amount: paid, method: pattern === 1 ? 'Card' : 'Cash', note: 'Demo payment entry' });
      }
      db.fees.push({
        id: 'F-' + s.id.replace('S-', '') + '-' + monthKey.replace('-', ''),
        studentId: s.id, classId: s.classId, month: monthKey,
        total, paid, dueDate: `${monthKey}-10`,
        note: 'Demo record — no real money involved', payments
      });
    }
  });

  /* ---- Homework ---- */
  db.homework = [
    { id: uid(), title: 'Algebra worksheet 4', classId: 'c5', subjectId: 's1', teacherId: 'T-1001', dueDate: addDays(today, 2), description: 'Solve questions 1–20 from the quadratics worksheet.', status: 'Open', created: today },
    { id: uid(), title: 'Essay: My favourite book', classId: 'c6', subjectId: 's2', teacherId: 'T-1003', dueDate: addDays(today, 4), description: '300 words, handwritten or typed.', status: 'Open', created: today },
    { id: uid(), title: 'Lab report — refraction', classId: 'c6', subjectId: 's3', teacherId: 'T-1002', dueDate: addDays(today, -1), description: 'Submit observations from the glass-slab experiment.', status: 'Open', created: addDays(today, -6) },
    { id: uid(), title: 'Map work — rivers of India', classId: 'c4', subjectId: 's4', teacherId: 'T-1004', dueDate: addDays(today, 6), description: 'Label the seven major rivers on the outline map.', status: 'Open', created: today },
    { id: uid(), title: 'Scratch animation project', classId: 'c3', subjectId: 's5', teacherId: 'T-1005', dueDate: addDays(today, 9), description: 'Build a short animated story (min. 3 sprites).', status: 'Open', created: addDays(today, -2) },
    { id: uid(), title: 'Reading comprehension set 2', classId: 'c1', subjectId: 's2', teacherId: 'T-1003', dueDate: addDays(today, -3), description: 'Completed in class — kept for records.', status: 'Closed', created: addDays(today, -10) }
  ];

  /* ---- Study resources ---- */
  db.resources = [
    { id: uid(), title: 'Quadratic equations — revision notes', type: 'Notes', subjectId: 's1', classId: 'c5', link: 'https://example.org/maths/quadratics', description: 'Formula summary and 30 practice problems.', added: addDays(today, -8) },
    { id: uid(), title: 'Photosynthesis explained (video)', type: 'Video', subjectId: 's3', classId: 'c3', link: 'https://example.org/science/photosynthesis', description: '12 minute explainer with captions.', added: addDays(today, -5) },
    { id: uid(), title: 'Indian freedom struggle — timeline', type: 'Notes', subjectId: 's4', classId: 'c4', link: 'https://example.org/history/timeline', description: 'Printable timeline 1857–1947.', added: addDays(today, -12) },
    { id: uid(), title: 'Grammar practice — tenses', type: 'Worksheet', subjectId: 's2', classId: 'c6', link: 'https://example.org/english/tenses', description: 'Fill in the blanks + answer key.', added: addDays(today, -3) },
    { id: uid(), title: 'Typing practice portal', type: 'Link', subjectId: 's5', classId: 'c2', link: 'https://example.org/typing', description: 'Daily 10 minute typing drill.', added: addDays(today, -1) },
    { id: uid(), title: 'Class 6 Hindi vyakaran notes', type: 'Notes', subjectId: 's6', classId: 'c1', link: 'https://example.org/hindi/vyakaran', description: 'Sandbox notes for the language period.', added: addDays(today, -15) }
  ];

  /* ---- Timetable: 6 periods x 5 days for every class ---- */
  const periods = [
    ['08:00', '08:45'], ['08:50', '09:35'], ['09:40', '10:25'],
    ['10:45', '11:30'], ['11:35', '12:20'], ['12:25', '13:10']
  ];
  db.classes.forEach(cls => {
    DAYS.slice(1, 6).forEach((day, di) => {
      periods.forEach((p, pi) => {
        const subject = db.subjects[(di + pi * 2 + Number(cls.id.slice(1))) % db.subjects.length];
        db.timetable.push({
          id: uid(), classId: cls.id, day, period: pi + 1,
          startTime: p[0], endTime: p[1],
          subjectId: subject.id, teacherId: subject.teacherId || cls.teacherId,
          room: cls.room
        });
      });
    });
  });

  /* ---- Events / exam schedule ---- */
  db.events = [
    { id: uid(), title: 'Half-Yearly Examination begins', type: 'Exam', date: addDays(today, 12), description: 'Timetable shared with all classes.', classId: '' },
    { id: uid(), title: 'Annual Sports Day', type: 'Event', date: addDays(today, 6), description: 'March past, track events and prize distribution.', classId: '' },
    { id: uid(), title: 'Parent–Teacher Meeting', type: 'Event', date: addDays(today, 3), description: 'Slots from 9:00 AM to 1:00 PM.', classId: '' },
    { id: uid(), title: 'Science exhibition', type: 'Event', date: addDays(today, 18), description: 'Grades 8–10 project display in the auditorium.', classId: '' },
    { id: uid(), title: 'Winter break begins', type: 'Holiday', date: addDays(today, 30), description: 'School reopens on the 12th of January.', classId: '' },
    { id: uid(), title: 'Library week', type: 'Event', date: addDays(today, -4), description: 'Book fair and reading challenge.', classId: '' }
  ];

  /* ---- Announcements + notifications ---- */
  db.announcements = [
    { id: uid(), title: 'Fee due date reminder', body: 'Term 2 fees for all classes are due by the 10th. Please clear pending instalments at the school office. (Demo notice — no real payment link.)', category: 'Fees', date: addDays(today, -1), audience: 'All', pinned: true },
    { id: uid(), title: 'Parent–Teacher Meeting on Saturday', body: 'Class teachers will share individual slot timings. Attendance of at least one guardian is expected.', category: 'General', date: addDays(today, -2), audience: 'Parents', pinned: false },
    { id: uid(), title: 'Half-yearly exam timetable published', body: 'The subject-wise schedule is now available under Examinations. Marks entry opens one week before the exam.', category: 'Exams', date: addDays(today, -3), audience: 'All', pinned: false },
    { id: uid(), title: 'New study resources added', body: 'Revision notes and worksheets for Mathematics, Science and English were added under Study Resources.', category: 'Academics', date: addDays(today, -5), audience: 'Students', pinned: false },
    { id: uid(), title: 'Attendance policy update', body: 'Students below 75% attendance will receive an automatic reminder. Class teachers can now edit past attendance records.', category: 'General', date: addDays(today, -8), audience: 'Staff', pinned: false }
  ];
  db.notifications = db.announcements.slice(0, 3).map(a => ({
    id: uid(), title: a.title, body: a.body.slice(0, 90) + (a.body.length > 90 ? '…' : ''),
    date: a.date, read: false, type: 'announcement'
  }));
  db.notifications.push({ id: uid(), title: 'Attendance marked', body: 'Today\'s attendance was marked for 6 classes.', date: today, read: false, type: 'attendance' });
  db.notifications.push({ id: uid(), title: 'Fees recorded', body: '3 demo fee payments were recorded this week.', date: addDays(today, -1), read: true, type: 'fees' });

  /* ---- Activity feed ---- */
  db.activities = [
    { id: uid(), text: 'Attendance marked for 6 classes', when: today + ' 09:05', icon: 'i-clip' },
    { id: uid(), text: 'Half-yearly exam timetable published', when: addDays(today, -1) + ' 16:20', icon: 'i-file' },
    { id: uid(), text: '3 demo fee payments recorded', when: addDays(today, -1) + ' 12:40', icon: 'i-card' },
    { id: uid(), text: '6 study resources added to the library', when: addDays(today, -3) + ' 11:10', icon: 'i-folder' },
    { id: uid(), text: 'Term 1 results published for all classes', when: addDays(today, -6) + ' 15:00', icon: 'i-award' }
  ];
  return db;
}

/* ===================== 3. DATA HELPERS & STATISTICS ===================== */
const getClass    = id => DB.classes.find(c => c.id === id);
const getStudent  = id => DB.students.find(s => s.id === id);
const getTeacher  = id => DB.teachers.find(t => t.id === id);
const getSubject  = id => DB.subjects.find(s => s.id === id);
const getExam     = id => DB.exams.find(e => e.id === id);
const className   = id => { const c = getClass(id); return c ? `${c.name} - ${c.section}` : '—'; };
const subjectName = id => { const s = getSubject(id); return s ? s.name : '—'; };
const teacherName = id => { const t = getTeacher(id); return t ? t.name : '—'; };

function classStudentIds(classId) { return DB.students.filter(s => s.classId === classId).map(s => s.id); }
function subjectsOfExam(exam) { return (exam.subjects || []).map(s => ({ ...s, subject: getSubject(s.subjectId) })); }

/** Attendance record for a class on a date (or null). */
function getAttendance(date, classId) { return DB.attendance[`${date}|${classId}`] || null; }

function attendanceCounts(rec) {
  const out = { present: 0, absent: 0, late: 0, leave: 0, total: 0 };
  if (!rec) return out;
  Object.values(rec.records).forEach(st => { if (out[st] !== undefined) out[st]++; });
  out.total = Object.keys(rec.records).length;
  return out;
}
/** Percentage of present+late for a date/class combo. */
function attendancePct(date, classId) {
  const c = attendanceCounts(getAttendance(date, classId));
  return pct(c.present + c.late, c.total);
}
/** Last N weekdays (oldest first) that have any attendance data, or up to N school days back. */
function lastSchoolDays(n = 7) {
  const days = [];
  let cursor = todayISO();
  let guard = 0;
  while (days.length < n && guard < 90) {
    if (!isWeekend(cursor)) days.push(cursor);
    cursor = addDays(cursor, -1);
    guard++;
  }
  return days.reverse();
}
/** Attendance % for a single student across all stored records. */
function studentAttendance(studentId) {
  let present = 0, total = 0;
  Object.values(DB.attendance).forEach(rec => {
    const st = rec.records[studentId];
    if (!st) return;
    total++;
    if (st === 'present' || st === 'late') present++;
  });
  return { present, total, pct: pct(present, total) };
}
/** Whole-school attendance numbers for one date. */
function schoolAttendance(date) {
  const totals = { present: 0, absent: 0, late: 0, leave: 0, total: 0 };
  DB.classes.forEach(c => {
    const rec = getAttendance(date, c.id);
    if (!rec) return;
    const cnt = attendanceCounts(rec);
    totals.present += cnt.present; totals.absent += cnt.absent;
    totals.late += cnt.late; totals.leave += cnt.leave; totals.total += cnt.total;
  });
  return totals;
}
function feeTotals() {
  return DB.fees.reduce((acc, f) => {
    acc.total += Number(f.total) || 0;
    acc.paid += Number(f.paid) || 0;
    return acc;
  }, { total: 0, paid: 0, pending: 0 });
}
function feeStatus(fee) {
  const paid = Number(fee.paid) || 0, total = Number(fee.total) || 0;
  if (paid <= 0) return 'Pending';
  if (paid < total) return 'Partial';
  return 'Paid';
}
/** Grade for a percentage using the documented scale. */
function gradeFor(percentage, passMark) {
  const p = Number(percentage) || 0;
  if (p >= 90) return 'A+'; if (p >= 80) return 'A'; if (p >= 70) return 'B+';
  if (p >= 60) return 'B'; if (p >= 50) return 'C'; if (p >= (passMark ?? DB.settings.passMark)) return 'D';
  return 'F';
}
const gradeTone = g => ({ 'A+': 'green', 'A': 'green', 'B+': 'blue', 'B': 'blue', 'C': 'purple', 'D': 'amber', 'F': 'red' }[g] || 'gray');

/** Result of one student for one exam: totals, %, grade, pass/fail, subject breakdown. */
function examResult(exam, studentId) {
  const stored = (DB.marks[exam.id] || {})[studentId] || {};
  let total = 0, maxTotal = 0, entered = 0, failedSubjects = 0;
  const rows = (exam.subjects || []).map(sub => {
    const score = stored[sub.subjectId];
    const has = typeof score === 'number' && !Number.isNaN(score);
    if (has) { total += score; entered++; } 
    maxTotal += Number(sub.maxMarks) || 0;
    const passAt = DB.settings.passMark;
    const passed = has ? score >= passAt : false;
    if (has && !passed) failedSubjects++;
    return { subjectId: sub.subjectId, name: subjectName(sub.subjectId), maxMarks: sub.maxMarks, score: has ? score : null, passed };
  });
  const percentage = pct(total, maxTotal);
  const grade = gradeFor(percentage);
  const complete = entered === (exam.subjects || []).length && (exam.subjects || []).length > 0;
  const passed = complete && failedSubjects === 0 && percentage >= DB.settings.passMark;
  return { total, maxTotal, percentage, grade, passed, complete, entered, failedSubjects, rows };
}
function examResults(exam) {
  return classStudentIds(exam.classId).map(id => {
    const st = getStudent(id);
    return { student: st, ...examResult(exam, id) };
  }).filter(r => r.student);
}
/** Append to the activity feed (kept to the last 12 entries). */
function logActivity(text, icon = 'i-info') {
  const now = new Date();
  DB.activities.unshift({
    id: uid(), text,
    when: `${todayISO()} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`,
    icon
  });
  DB.activities = DB.activities.slice(0, 12);
}
function pushNotification(title, body, type = 'info') {
  DB.notifications.unshift({ id: uid(), title, body: String(body).slice(0, 120), date: todayISO(), read: false, type });
  DB.notifications = DB.notifications.slice(0, 25);
  renderNotifications();
}

/* ===================== 4. UI PRIMITIVES ===================== */
/* ---- Toasts ---- */
const TOAST_ICONS = { success: 'i-check', error: 'i-alert', warn: 'i-alert', info: 'i-info' };
function toast(message, type = 'success', ms = 3600) {
  const root = $('#toastRoot');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `<svg viewBox="0 0 24 24"><use href="#${TOAST_ICONS[type] || 'i-info'}"/></svg><div>${esc(message)}</div>`;
  root.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, ms);
}

/* ---- Modals ---- */
let modalStack = [];
function openModal({ title, subtitle = '', body = '', footer = '', size = '' }) {
  const root = $('#modalRoot');
  const wrap = document.createElement('div');
  wrap.className = 'modal-root open';
  wrap.innerHTML = `
    <div class="modal ${size}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head">
        <div><h3>${esc(title)}</h3>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>
        <button class="icon-btn" data-modal-close aria-label="Close dialog"><svg viewBox="0 0 24 24"><use href="#i-x"/></svg></button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>`;
  root.appendChild(wrap);
  modalStack.push(wrap);
  document.body.style.overflow = 'hidden';
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) closeModal(wrap); });
  wrap.querySelectorAll('[data-modal-close]').forEach(b => b.addEventListener('click', () => closeModal(wrap)));
  const first = wrap.querySelector('input,select,textarea,button.btn-primary');
  if (first) setTimeout(() => first.focus(), 60);
  return wrap;
}
function closeModal(wrap) {
  const target = wrap || modalStack[modalStack.length - 1];
  if (!target) return;
  target.remove();
  modalStack = modalStack.filter(m => m !== target);
  if (!modalStack.length) document.body.style.overflow = '';
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

/** Accessible confirmation dialog (used for every destructive action). */
function openConfirm({ title = 'Are you sure?', message = '', confirmText = 'Yes, continue', danger = true, onConfirm }) {
  const wrap = openModal({
    title, size: 'sm',
    body: `<div class="alert ${danger ? 'error' : 'warn'}" style="margin-bottom:.5rem">
             <svg viewBox="0 0 24 24"><use href="#i-alert"/></svg><span>${message}</span></div>`,
    footer: `<button class="btn btn-ghost" data-modal-close>Cancel</button>
             <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm>${esc(confirmText)}</button>`
  });
  wrap.querySelector('[data-confirm]').addEventListener('click', () => {
    closeModal(wrap);
    if (typeof onConfirm === 'function') onConfirm();
  });
}

/* ---- Form builder -------------------------------------------------------
   fields: [{ key, label, type, required, options, min, max, help, span,
              placeholder, step, unique }]                                    */
function fieldHTML(f, values = {}) {
  const val = values[f.key] !== undefined && values[f.key] !== null ? values[f.key] : (f.value !== undefined ? f.value : '');
  const req = f.required ? ' <span class="req">*</span>' : '';
  const attrs = `name="${esc(f.key)}" id="f-${esc(f.key)}" ${f.required ? 'data-required="1"' : ''} ${f.step ? `step="${f.step}"` : ''} ${f.min !== undefined ? `min="${f.min}"` : ''} ${f.max !== undefined ? `max="${f.max}"` : ''}`;
  const wrapOpen = `<div class="field ${f.span ? 'span-2' : ''}" data-field="${esc(f.key)}">`;
  let control = '';
  switch (f.type) {
    case 'select':
      control = `<select ${attrs}>
          <option value="">${esc(f.placeholder || 'Select…')}</option>
          ${(f.options || []).map(o => `<option value="${esc(o.value)}" ${String(o.value) === String(val) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
        </select>`;
      break;
    case 'textarea':
      control = `<textarea ${attrs} placeholder="${esc(f.placeholder || '')}">${esc(val)}</textarea>`;
      break;
    case 'checkboxes':
      control = `<div class="check-grid">${(f.options || []).map(o => `
          <label class="check-item"><input type="checkbox" name="${esc(f.key)}" value="${esc(o.value)}" ${(Array.isArray(val) ? val : []).includes(o.value) ? 'checked' : ''}> ${esc(o.label)}</label>`).join('')}
        </div>`;
      break;
    case 'switch':
      return `<div class="field span-2"><label class="switch" style="border:none;padding:.2rem 0">
          <span><strong style="font-size:.85rem">${esc(f.label)}</strong>${f.help ? `<br><small class="help">${esc(f.help)}</small>` : ''}</span>
          <input type="checkbox" name="${esc(f.key)}" ${val ? 'checked' : ''}><span class="switch-track"></span></label></div>`;
    case 'date':
      control = `<input type="date" ${attrs} value="${esc(val)}">`; break;
    case 'time':
      control = `<input type="time" ${attrs} value="${esc(val)}">`; break;
    case 'number':
      control = `<input type="number" ${attrs} value="${esc(val)}" placeholder="${esc(f.placeholder || '')}">`; break;
    case 'email':
      control = `<input type="email" ${attrs} value="${esc(val)}" placeholder="${esc(f.placeholder || '')}">`; break;
    case 'tel':
      control = `<input type="tel" ${attrs} value="${esc(val)}" placeholder="${esc(f.placeholder || '')}">`; break;
    case 'url':
      control = `<input type="url" ${attrs} value="${esc(val)}" placeholder="${esc(f.placeholder || '')}">`; break;
    default:
      control = `<input type="text" ${attrs} value="${esc(val)}" placeholder="${esc(f.placeholder || '')}">`;
  }
  return `${wrapOpen}<label for="f-${esc(f.key)}">${esc(f.label)}${req}</label>${control}
    ${f.help ? `<small class="help">${esc(f.help)}</small>` : ''}
    <small class="err"></small></div>`;
}
function formHTML(fields, values, grid = true) {
  return `<form novalidate class="${grid ? 'form-grid' : ''}" data-autoform>${fields.map(f => fieldHTML(f, values)).join('')}</form>`;
}
/** Read + validate a generated form. Returns {values, errors} — errors keyed by field. */
function readForm(scope, fields) {
  const form = scope.querySelector('[data-autoform]');
  const values = {}, errors = {};
  fields.forEach(f => {
    const control = form.querySelector(`[name="${CSS.escape(f.key)}"]`);
    if (!control) return;
    let value;
    if (f.type === 'checkboxes') {
      value = Array.from(form.querySelectorAll(`[name="${CSS.escape(f.key)}"]:checked`)).map(c => c.value);
    } else if (f.type === 'switch') {
      value = control.checked;
    } else {
      value = control.value.trim();
    }
    values[f.key] = value;

    // validation rules
    const label = f.label || f.key;
    if (f.required) {
      if (f.type === 'checkboxes') { if (!value.length) errors[f.key] = `${label}: select at least one option.`; }
      else if (value === '' || value === false) errors[f.key] = `${label} is required.`;
    }
    if (!errors[f.key] && value !== '' && f.type === 'number') {
      const n = Number(value);
      if (Number.isNaN(n)) errors[f.key] = `${label} must be a number.`;
      else if (f.min !== undefined && n < Number(f.min)) errors[f.key] = `${label} cannot be lower than ${f.min}.`;
      else if (f.max !== undefined && n > Number(f.max)) errors[f.key] = `${label} cannot be higher than ${f.max}.`;
    }
    if (!errors[f.key] && value && f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      errors[f.key] = 'Enter a valid email address.';
    }
    if (!errors[f.key] && value && f.type === 'tel' && !/^[0-9+\-\s()]{7,18}$/.test(value)) {
      errors[f.key] = 'Enter a valid phone number (7–18 digits).';
    }
    if (!errors[f.key] && value && f.type === 'url' && !/^https?:\/\/.+\..+/.test(value)) {
      errors[f.key] = 'Enter a full link starting with http:// or https://';
    }
    if (!errors[f.key] && typeof f.validate === 'function') {
      const custom = f.validate(value, values);
      if (custom) errors[f.key] = custom;
    }
  });

  // paint the errors
  Object.keys(errors).forEach(key => {
    const box = form.querySelector(`.field[data-field="${CSS.escape(key)}"]`);
    if (!box) return;
    box.classList.add('invalid');
    box.querySelector('.err').textContent = errors[key];
    const ctl = box.querySelector('input,select,textarea');
    if (ctl) ctl.setAttribute('aria-invalid', 'true');
  });
  return { values, errors, ok: Object.keys(errors).length === 0 };
}
/** Modal containing a generated form. onSubmit(values) -> true closes the modal. */
function openForm({ title, subtitle = '', fields, values = {}, submitText = 'Save', size = '', onSubmit, grid = true }) {
  const wrap = openModal({
    title, subtitle, size,
    body: formHTML(fields, values, grid),
    footer: `<button class="btn btn-ghost" data-modal-close type="button">Cancel</button>
             <button class="btn btn-primary" type="button" data-submit>${esc(submitText)}</button>`
  });
  const submit = () => {
    wrap.querySelectorAll('.field').forEach(f => { f.classList.remove('invalid'); const e = f.querySelector('.err'); if (e) e.textContent = ''; });
    wrap.querySelectorAll('[aria-invalid]').forEach(c => c.removeAttribute('aria-invalid'));
    const { values: vals, errors, ok } = readForm(wrap, fields);
    if (!ok) {
      toast(`Please fix ${Object.keys(errors).length} field${Object.keys(errors).length > 1 ? 's' : ''}.`, 'error');
      const firstBad = wrap.querySelector('.field.invalid input,.field.invalid select,.field.invalid textarea');
      if (firstBad) firstBad.focus();
      return;
    }
    if (onSubmit(vals) !== false) closeModal(wrap);
  };
  wrap.querySelector('[data-submit]').addEventListener('click', submit);
  wrap.querySelector('[data-autoform]').addEventListener('submit', e => { e.preventDefault(); submit(); });
  return wrap;
}

/* ---- Empty state ---- */
function emptyState(icon, title, text, actionHTML = '') {
  return `<div class="empty">
    <div class="ic"><svg viewBox="0 0 24 24"><use href="#${icon}"/></svg></div>
    <h4>${esc(title)}</h4><p>${esc(text)}</p>${actionHTML}</div>`;
}

/* ---- CSV + print helpers ---- */
function downloadCSV(filename, rows) {
  if (!rows || !rows.length) { toast('Nothing to export yet.', 'warn'); return; }
  const csv = rows.map(r => r.map(cell => {
    const v = cell === null || cell === undefined ? '' : String(cell);
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  toast(`${filename} downloaded (${rows.length - 1} rows).`, 'success');
}
function downloadJSON(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
/** Print only the generated sheet (real browser print of the current demo data). */
function printSheet(title, innerHTML) {
  $('#printArea').innerHTML = `<div class="print-sheet">${innerHTML}</div>`;
  const prev = document.title;
  document.title = title;
  window.print();
  document.title = prev;
}
function sheetHeader(subtitle) {
  return `<div class="ph">
      <div><h1>${esc(DB.settings.schoolName)}</h1>
      <div class="muted">${esc(DB.settings.address)} · ${esc(DB.settings.phone)}</div></div>
      <div style="text-align:right"><div class="muted">Session ${esc(DB.settings.session)}</div>
      <div class="muted">${esc(subtitle)} · generated ${fmtDate(todayISO())}</div></div>
    </div>`;
}

/* ===================== 5. MINI CHART LIBRARY ===================== */
const Charts = {
  cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#6366f1'; },
  prep(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(200, rect.width), h = Math.max(120, rect.height);
    canvas.width = w * dpr; canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  },
  line(canvas, labels, values, { color = '#6366f1', suffix = '%' } = {}) {
    if (!canvas || !values.length) return;
    const { ctx, w, h } = Charts.prep(canvas);
    const grid = Charts.cssVar('--border'), text = Charts.cssVar('--muted');
    const pl = 34, pr = 12, pt = 14, pb = 26;
    const cw = w - pl - pr, ch = h - pt - pb;
    const max = Math.max(100, Math.ceil(Math.max(...values) / 10) * 10);
    ctx.strokeStyle = grid; ctx.fillStyle = text; ctx.font = '10px sans-serif'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pt + (ch / 4) * i;
      ctx.beginPath(); ctx.moveTo(pl, y); ctx.lineTo(w - pr, y); ctx.stroke();
      ctx.fillText(String(max - (max / 4) * i), 4, y + 3);
    }
    const stepX = cw / Math.max(1, values.length - 1);
    const pts = values.map((v, i) => [pl + stepX * i, pt + ch - (v / max) * ch]);
    // area fill
    const grad = ctx.createLinearGradient(0, pt, 0, pt + ch);
    grad.addColorStop(0, color + '55'); grad.addColorStop(1, color + '05');
    ctx.beginPath(); ctx.moveTo(pts[0][0], pt + ch);
    pts.forEach(p => ctx.lineTo(p[0], p[1]));
    ctx.lineTo(pts[pts.length - 1][0], pt + ch); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();
    // line
    ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    ctx.strokeStyle = color; ctx.lineWidth = 2.4; ctx.stroke();
    // points + labels
    pts.forEach((p, i) => {
      ctx.beginPath(); ctx.arc(p[0], p[1], 3.4, 0, Math.PI * 2);
      ctx.fillStyle = Charts.cssVar('--surface'); ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = text; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(labels[i], p[0], h - 8);
      ctx.fillStyle = color; ctx.fillText(values[i] + suffix, p[0], p[1] - 9);
      ctx.textAlign = 'start';
    });
  },
  bar(canvas, labels, values, { color = '#6366f1', suffix = '' } = {}) {
    if (!canvas || !values.length) return;
    const { ctx, w, h } = Charts.prep(canvas);
    const grid = Charts.cssVar('--border'), text = Charts.cssVar('--muted');
    const pl = 30, pr = 8, pt = 12, pb = 26;
    const cw = w - pl - pr, ch = h - pt - pb;
    const max = Math.max(...values, 1);
    ctx.strokeStyle = grid; ctx.fillStyle = text; ctx.font = '10px sans-serif';
    for (let i = 0; i <= 3; i++) {
      const y = pt + (ch / 3) * i;
      ctx.beginPath(); ctx.moveTo(pl, y); ctx.lineTo(w - pr, y); ctx.stroke();
      ctx.fillText(String(Math.round(max - (max / 3) * i)), 4, y + 3);
    }
    const slot = cw / values.length;
    const bw = Math.min(38, slot * 0.62);
    values.forEach((v, i) => {
      const x = pl + slot * i + (slot - bw) / 2;
      const bh = (v / max) * ch;
      const g = ctx.createLinearGradient(0, pt + ch - bh, 0, pt + ch);
      g.addColorStop(0, color); g.addColorStop(1, color + '66');
      ctx.fillStyle = g;
      const r = Math.min(6, bw / 2, bh);
      ctx.beginPath();
      ctx.moveTo(x, pt + ch); ctx.lineTo(x, pt + ch - bh + r);
      ctx.quadraticCurveTo(x, pt + ch - bh, x + r, pt + ch - bh);
      ctx.lineTo(x + bw - r, pt + ch - bh);
      ctx.quadraticCurveTo(x + bw, pt + ch - bh, x + bw, pt + ch - bh + r);
      ctx.lineTo(x + bw, pt + ch); ctx.closePath(); ctx.fill();
      ctx.fillStyle = text; ctx.textAlign = 'center';
      ctx.fillText(labels[i], x + bw / 2, h - 8);
      if (suffix) { ctx.fillStyle = color; ctx.fillText(v + suffix, x + bw / 2, pt + ch - bh - 5); }
      ctx.textAlign = 'start';
    });
  },
  donut(canvas, segments, { thickness = 22 } = {}) {
    if (!canvas || !segments.length) return;
    const { ctx, w, h } = Charts.prep(canvas);
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 6;
    const total = segments.reduce((a, s) => a + s.value, 0) || 1;
    let start = -Math.PI / 2;
    segments.forEach(s => {
      const angle = (s.value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r - thickness / 2, start, start + angle);
      ctx.strokeStyle = s.color; ctx.lineWidth = thickness; ctx.lineCap = 'butt';
      ctx.stroke();
      start += angle;
    });
    ctx.fillStyle = Charts.cssVar('--text'); ctx.textAlign = 'center';
    ctx.font = '700 18px sans-serif';
    ctx.fillText(String(total), cx, cy + 2);
    ctx.fillStyle = Charts.cssVar('--muted'); ctx.font = '10px sans-serif';
    ctx.fillText('total', cx, cy + 16);
  }
};

/* ===================== 6. ROUTER, SIDEBAR & TOPBAR ===================== */
const PAGE_META = {
  dashboard:    { title: 'Dashboard',      crumb: 'School overview' },
  students:     { title: 'Students',       crumb: 'People' },
  teachers:     { title: 'Teachers',       crumb: 'People' },
  attendance:   { title: 'Attendance',     crumb: 'Academics' },
  examinations: { title: 'Examinations',   crumb: 'Academics' },
  results:      { title: 'Results',        crumb: 'Academics' },
  classes:      { title: 'Classes',        crumb: 'Academics' },
  subjects:     { title: 'Subjects',       crumb: 'Academics' },
  fees:         { title: 'Fees',           crumb: 'Administration' },
  homework:     { title: 'Homework',       crumb: 'Administration' },
  resources:    { title: 'Study Resources',crumb: 'Administration' },
  timetable:    { title: 'Timetable',      crumb: 'Administration' },
  calendar:     { title: 'Calendar',       crumb: 'Administration' },
  announcements:{ title: 'Announcements',  crumb: 'Communication' },
  reports:      { title: 'Reports',        crumb: 'Insights' },
  settings:     { title: 'Settings',       crumb: 'System' },
  profile:      { title: 'My profile',     crumb: 'Account' }
};
const TONES = {
  indigo: ['#4f46e5', 'rgba(99,102,241,.13)'], blue: ['#2563eb', 'rgba(59,130,246,.13)'],
  green: ['#059669', 'rgba(16,185,129,.14)'], amber: ['#d97706', 'rgba(245,158,11,.16)'],
  red: ['#dc2626', 'rgba(239,68,68,.13)'], purple: ['#7c3aed', 'rgba(139,92,246,.14)'],
  cyan: ['#0891b2', 'rgba(6,182,212,.13)'], pink: ['#db2777', 'rgba(236,72,153,.13)']
};
function statCard({ label, value, sub, icon, tone = 'indigo' }) {
  const [c, t] = TONES[tone] || TONES.indigo;
  return `<div class="stat" style="--tone:${c};--tint:${t}">
    <div class="stat-ic"><svg viewBox="0 0 24 24"><use href="#${icon}"/></svg></div>
    <div class="stat-body"><small>${esc(label)}</small><strong>${value}</strong>${sub ? `<span>${sub}</span>` : ''}</div></div>`;
}
function icon(name, cls = '') { return `<svg class="${cls}" viewBox="0 0 24 24"><use href="#${name}"/></svg>`; }

function showProgress() {
  const bar = $('#loadBar');
  bar.classList.add('active');
  setTimeout(() => bar.classList.remove('active'), 420);
}

/** Switch to a page: hides others, marks nav active, renders content. */
function navigate(page, { updateHash = true } = {}) {
  if (!PAGE_META[page]) page = 'dashboard';
  ui.page = page;
  $$('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + page));
  $$('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.nav === page));
  $('#pageTitle').textContent = PAGE_META[page].title;
  $('#pageCrumb').textContent = PAGE_META[page].crumb;
  if (updateHash && location.hash !== '#' + page) history.replaceState(null, '', '#' + page);
  closeSidebar();
  closeDropdowns();
  showProgress();
  renderPage(page);
  $('#main-content').parentElement.scrollTop = 0;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function renderPage(page) {
  switch (page) {
    case 'dashboard':     renderDashboard(); break;
    case 'students':      renderStudents(); break;
    case 'teachers':      renderTeachers(); break;
    case 'attendance':    renderAttendance(); break;
    case 'examinations':  renderExams(); break;
    case 'results':       renderResults(); break;
    case 'classes':       renderClasses(); break;
    case 'subjects':      renderSubjects(); break;
    case 'fees':          renderFees(); break;
    case 'homework':      renderHomework(); break;
    case 'resources':     renderResources(); break;
    case 'timetable':     renderTimetable(); break;
    case 'calendar':      renderCalendar(); break;
    case 'announcements': renderAnnouncements(); break;
    case 'reports':       renderReports(); break;
    case 'settings':      renderSettings(); break;
    case 'profile':       renderProfile(); break;
    default: renderDashboard();
  }
}
const rerender = () => renderPage(ui.page);

/* ---- Sidebar ---- */
function openSidebar() {
  $('#sidebar').classList.add('open');
  $('#backdrop').hidden = false;
  $('#menuBtn').setAttribute('aria-expanded', 'true');
}
function closeSidebar() {
  $('#sidebar').classList.remove('open');
  $('#backdrop').hidden = true;
  $('#menuBtn').setAttribute('aria-expanded', 'false');
}
function setCollapsed(state, persist = true) {
  ui.collapsed = state;
  $('#app').classList.toggle('collapsed', state);
  $('#collapseBtn').setAttribute('aria-pressed', String(state));
  if (persist) { DB.settings.collapsed = state; saveDB(); }
  setTimeout(() => { if (ui.page === 'dashboard') drawDashboardCharts(); }, 320);
}

/* ---- Theme ---- */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $('#themeIcon').innerHTML = `<use href="#${theme === 'dark' ? 'i-sun' : 'i-moon'}"/>`;
  DB.settings.theme = theme;
  saveDB();
  setTimeout(() => { drawDashboardCharts(); rerenderChartsOnPage(); }, 60);
}
function rerenderChartsOnPage() {
  // Charts are drawn on canvas, so they need a repaint when colours change
  if (ui.page === 'reports') renderReports();
  if (ui.page === 'attendance') renderAttendanceCharts();
}

/* ---- Dropdowns ---- */
function closeDropdowns(except) {
  ['notifPanel', 'profilePanel', 'searchResults'].forEach(id => {
    const el = $('#' + id);
    if (el && el !== except) { el.hidden = true; }
  });
  $('#notifBtn').setAttribute('aria-expanded', 'false');
  $('#profileBtn').setAttribute('aria-expanded', 'false');
}

/* ---- Notifications ---- */
function renderNotifications() {
  const list = $('#notifList'), count = $('#notifCount');
  const unread = DB.notifications.filter(n => !n.read).length;
  count.hidden = unread === 0;
  count.textContent = unread > 9 ? '9+' : unread;
  if (!DB.notifications.length) {
    list.innerHTML = `<div class="search-empty">No notifications yet.</div>`;
    return;
  }
  const icons = { announcement: 'i-mega', attendance: 'i-clip', fees: 'i-card', info: 'i-info' };
  list.innerHTML = DB.notifications.slice(0, 12).map(n => `
    <div class="notif-item ${n.read ? '' : 'unread'}">
      <div class="ic">${icon(icons[n.type] || 'i-info')}</div>
      <div style="min-width:0;flex:1">
        <strong>${esc(n.title)}</strong>
        <p>${esc(n.body)}</p>
        <time>${fmtDate(n.date)} · in-app demo notification</time>
      </div>
      ${n.read ? '' : `<button class="icon-btn" data-action="notif-read" data-id="${esc(n.id)}" title="Mark as read" aria-label="Mark as read">${icon('i-check')}</button>`}
    </div>`).join('');
}

/* ---- Global search ---- */
function globalSearch(q) {
  const box = $('#searchResults');
  const term = q.trim().toLowerCase();
  if (term.length < 2) { box.hidden = true; return; }
  const results = [];
  DB.students.forEach(s => {
    if ((s.name + ' ' + s.id + ' ' + s.roll).toLowerCase().includes(term))
      results.push({ page: 'students', icon: 'i-users', title: s.name, sub: `${s.id} · ${className(s.classId)} · Roll ${s.roll}`, id: s.id });
  });
  DB.teachers.forEach(t => {
    if ((t.name + ' ' + t.id + ' ' + t.subject).toLowerCase().includes(term))
      results.push({ page: 'teachers', icon: 'i-cap', title: t.name, sub: `${t.id} · ${t.subject}`, id: t.id });
  });
  DB.announcements.forEach(a => {
    if ((a.title + ' ' + a.body).toLowerCase().includes(term))
      results.push({ page: 'announcements', icon: 'i-mega', title: a.title, sub: `Announcement · ${a.category}`, id: a.id });
  });
  DB.homework.forEach(h => {
    if ((h.title + ' ' + h.description).toLowerCase().includes(term))
      results.push({ page: 'homework', icon: 'i-pencil', title: h.title, sub: `Homework · ${className(h.classId)}`, id: h.id });
  });
  DB.resources.forEach(r => {
    if ((r.title + ' ' + r.description).toLowerCase().includes(term))
      results.push({ page: 'resources', icon: 'i-folder', title: r.title, sub: `Resource · ${r.type}`, id: r.id });
  });
  ui.searchResults = results;
  if (!results.length) {
    box.innerHTML = `<div class="search-empty">No records match “${esc(q)}”.</div>`;
  } else {
    box.innerHTML = results.slice(0, 12).map((r, i) => `
      <button class="search-item" data-action="search-go" data-index="${i}">
        ${icon(r.icon)}<span style="min-width:0"><strong style="font-size:.85rem">${esc(r.title)}</strong><small>${esc(r.sub)}</small></span>
      </button>`).join('') + (results.length > 12 ? `<div class="search-empty">${results.length - 12} more matches…</div>` : '');
  }
  box.hidden = false;
}

/* ---- Branding sync (settings -> header/footer) ---- */
function applyBranding() {
  $('#brandLogo').textContent = DB.settings.logoText || 'EC';
  $('#brandName').textContent = DB.settings.schoolName || 'EduCore';
  $('#footSchool').textContent = DB.settings.schoolName || 'EduCore';
  $('#profileName').textContent = DB.settings.principal ? DB.settings.principal : 'Admin Demo';
  $('#profileAvatar').textContent = initials(DB.settings.principal || 'Admin Demo');
  $('#dashSchoolName').textContent = DB.settings.schoolName;
}

/* ===================== 7a. DASHBOARD ===================== */
function renderDashboard() {
  const date = ui.attendance.date && getAttendance(ui.attendance.date, DB.classes[0].id) ? ui.attendance.date : lastSchoolDays(1)[0];
  const att = schoolAttendance(date);
  const fees = feeTotals();
  // the demo banner can be switched off in Settings
  const banner = document.querySelector('#page-dashboard .alert.info');
  if (banner) banner.style.display = DB.settings.showDemoBanner === false ? 'none' : '';

  $('#dashStats').innerHTML = [
    statCard({ label: 'Total students', value: DB.students.length, sub: `${DB.classes.length} classes`, icon: 'i-users', tone: 'indigo' }),
    statCard({ label: 'Total teachers', value: DB.teachers.length, sub: `${DB.subjects.length} subjects`, icon: 'i-cap', tone: 'purple' }),
    statCard({ label: 'Present today', value: att.present + att.late, sub: `${att.late} late arrivals`, icon: 'i-check', tone: 'green' }),
    statCard({ label: 'Absent today', value: att.absent, sub: `${att.leave} on leave`, icon: 'i-alert', tone: 'red' }),
    statCard({ label: 'Total classes', value: DB.classes.length, sub: `${DB.timetable.length} timetable slots`, icon: 'i-layers', tone: 'blue' }),
    statCard({ label: 'Subjects', value: DB.subjects.length, sub: 'Across all classes', icon: 'i-book', tone: 'cyan' }),
    statCard({ label: 'Fees collected', value: money(fees.paid), sub: `of ${money(fees.total)} billed`, icon: 'i-card', tone: 'green' }),
    statCard({ label: 'Fees pending', value: money(fees.total - fees.paid), sub: `${DB.fees.filter(f => feeStatus(f) !== 'Paid').length} records open`, icon: 'i-clock', tone: 'amber' })
  ].join('');

  $('#quickActions').innerHTML = [
    ['i-plus', 'Add student', 'data-action="student-add"'],
    ['i-clip', 'Mark attendance', 'data-nav="attendance"'],
    ['i-file', 'New exam', 'data-action="exam-add"'],
    ['i-card', 'Record fee', 'data-action="fee-add"'],
    ['i-pencil', 'Assign homework', 'data-action="homework-add"'],
    ['i-mega', 'Announcement', 'data-action="announce-add"'],
    ['i-cal', 'Add event', 'data-action="event-add"'],
    ['i-chart', 'Reports', 'data-nav="reports"']
  ].map(([ic, label, attr]) => `<button class="quick" ${attr}>${icon(ic)}<span>${label}</span></button>`).join('');

  // Activity feed
  $('#activityList').innerHTML = DB.activities.length ? DB.activities.map(a => `
    <li><span class="ic">${icon(a.icon)}</span>
      <span><strong style="font-weight:600">${esc(a.text)}</strong><time>${esc(a.when)}</time></span></li>`).join('')
    : `<li><span class="muted">No activity recorded yet.</span></li>`;

  // Upcoming exams + events (next 45 days)
  const upcoming = [
    ...DB.exams.filter(e => e.date >= todayISO()).map(e => ({ kind: 'Exam', title: e.name, sub: `${className(e.classId)} · ${e.subjects.length} subjects`, date: e.date, tone: 'red' })),
    ...DB.events.filter(e => e.date >= todayISO()).map(e => ({ kind: e.type, title: e.title, sub: e.description, date: e.date, tone: e.type === 'Holiday' ? 'green' : 'purple' }))
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
  $('#upcomingList').innerHTML = upcoming.length ? upcoming.map(u => `
    <div class="list-row">
      <div class="date-badge"><b>${Number(u.date.slice(8, 10))}</b><small>${MONTHS[Number(u.date.slice(5, 7)) - 1]}</small></div>
      <div style="min-width:0;flex:1">
        <h4>${esc(u.title)} <span class="chip ${u.tone}">${esc(u.kind)}</span></h4>
        <p>${esc(u.sub)} · ${dayDiff(todayISO(), u.date) === 0 ? 'Today' : 'in ' + dayDiff(todayISO(), u.date) + ' day(s)'}</p>
      </div></div>`).join('')
    : emptyState('i-cal', 'Nothing scheduled', 'No exams or events in the next 45 days.');

  // Notice board
  const notices = [...DB.announcements].sort((a, b) => (b.pinned - a.pinned) || b.date.localeCompare(a.date)).slice(0, 4);
  $('#noticeBoard').innerHTML = notices.map(n => `
    <div class="notice-card">
      <div class="card-head" style="margin-bottom:.35rem">
        <span class="chip soft">${esc(n.category)}</span>${n.pinned ? `<span class="chip amber">${icon('i-star')} Pinned</span>` : ''}
      </div>
      <h4>${esc(n.title)}</h4>
      <p>${esc(n.body.length > 130 ? n.body.slice(0, 130) + '…' : n.body)}</p>
      <small class="muted">${fmtDate(n.date)} · ${esc(n.audience)}</small>
    </div>`).join('') || emptyState('i-mega', 'No announcements', 'Create your first announcement to see it here.');

  // Fee mini panel
  $('#feeMini').innerHTML = `
    <div class="row"><span>Billed</span><strong>${money(fees.total)}</strong></div>
    <div class="row"><span>Collected</span><strong style="color:#059669">${money(fees.paid)}</strong></div>
    <div class="row"><span>Pending</span><strong style="color:#d97706">${money(fees.total - fees.paid)}</strong></div>
    <div class="progress" style="margin-top:.3rem"><i style="width:${pct(fees.paid, fees.total)}%"></i></div>
    <small class="muted">${pct(fees.paid, fees.total)}% of billed demo fees recorded as paid</small>`;

  drawDashboardCharts();
  applyBranding();
}

/** Draws the four dashboard charts from the current demo data. */
function drawDashboardCharts() {
  // 1. Attendance trend
  const days = lastSchoolDays(7);
  const values = days.map(d => {
    const t = schoolAttendance(d);
    return pct(t.present + t.late, t.total);
  });
  Charts.line($('#chartAttendance'), days.map(d => DAYS_SHORT[new Date(d + 'T00:00:00').getDay()]), values, { color: '#10b981', suffix: '%' });

  // 2. Students per class
  Charts.bar($('#chartClass'), DB.classes.map(c => c.name.replace('Grade ', 'G') + c.section),
    DB.classes.map(c => DB.students.filter(s => s.classId === c.id).length), { color: '#6366f1' });

  // 3. Grade distribution for the most recent exam that has marks
  const exam = DB.exams.filter(e => DB.marks[e.id] && Object.keys(DB.marks[e.id]).length)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (exam) {
    const counts = {};
    examResults(exam).forEach(r => { counts[r.grade] = (counts[r.grade] || 0) + 1; });
    const order = ['A+', 'A', 'B+', 'B', 'C', 'D', 'F'];
    const colors = ['#059669', '#10b981', '#3b82f6', '#6366f1', '#8b5cf6', '#f59e0b', '#ef4444'];
    const segs = order.filter(g => counts[g]).map((g, i) => ({ label: g, value: counts[g], color: colors[order.indexOf(g)] }));
    Charts.donut($('#chartGrades'), segs);
    $('#gradeLegend').innerHTML = segs.map(s => `<span><i style="background:${s.color}"></i>Grade ${s.label}: ${s.value}</span>`).join('')
      + `<span class="muted">· ${esc(exam.name)}, ${esc(className(exam.classId))}</span>`;
  } else {
    Charts.donut($('#chartGrades'), []);
    $('#gradeLegend').innerHTML = '<span class="muted">Enter marks for an exam to see the grade spread.</span>';
  }

  // 4. Collected vs pending
  const fees = feeTotals();
  Charts.donut($('#chartFees'), [
    { label: 'Collected', value: fees.paid, color: '#10b981' },
    { label: 'Pending', value: Math.max(0, fees.total - fees.paid), color: '#f59e0b' }
  ], { thickness: 18 });
}

/* ===================== 7b. STUDENTS ===================== */
function studentFields(existing) {
  return [
    { key: 'id', label: 'Student ID', required: true, span: true, placeholder: 'S-2033',
      help: 'Must be unique — used for search and reports.',
      validate: v => {
        const clash = DB.students.some(s => s.id.toLowerCase() === v.trim().toLowerCase() && (!existing || s.id !== existing.id));
        return clash ? 'This student ID already exists.' : (/^[A-Za-z0-9\-]{3,15}$/.test(v.trim()) ? '' : 'Use 3–15 letters, numbers or dashes.');
      } },
    { key: 'roll', label: 'Roll number', required: true, type: 'number', min: 1, max: 999, placeholder: '01' },
    { key: 'name', label: 'Full name', required: true, placeholder: 'e.g. Ananya Sharma' },
    { key: 'classId', label: 'Class & section', required: true, type: 'select',
      options: DB.classes.map(c => ({ value: c.id, label: `${c.name} - ${c.section}` })) },
    { key: 'gender', label: 'Gender', required: true, type: 'select',
      options: [{ value: 'Male', label: 'Male' }, { value: 'Female', label: 'Female' }, { value: 'Other', label: 'Other' }] },
    { key: 'dob', label: 'Date of birth', required: true, type: 'date',
      validate: v => (v > todayISO() ? 'Date of birth cannot be in the future.' : (v < '1995-01-01' ? 'Please check the year.' : '')) },
    { key: 'bloodGroup', label: 'Blood group', type: 'select', options: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(b => ({ value: b, label: b })) },
    { key: 'guardianName', label: 'Parent / guardian', placeholder: 'Name and relation' },
    { key: 'phone', label: 'Contact number', type: 'tel', required: true, placeholder: '+91 98xxxxxxx' },
    { key: 'email', label: 'Email', type: 'email', placeholder: 'student@example.com' },
    { key: 'admissionDate', label: 'Admission date', type: 'date' },
    { key: 'address', label: 'Address', type: 'textarea', span: true, placeholder: 'House, street, city' }
  ];
}
function openStudentForm(existing) {
  openForm({
    title: existing ? 'Edit student' : 'Add new student',
    subtitle: existing ? `Updating ${existing.name} (${existing.id})` : 'Demo record stored in this browser only',
    fields: studentFields(existing),
    values: existing || { id: nextCode('S', DB.students), admissionDate: todayISO(), classId: DB.classes[0].id, gender: 'Female', status: 'Active' },
    submitText: existing ? 'Save changes' : 'Add student',
    size: 'lg',
    onSubmit: v => {
      const record = {
        id: v.id.trim(), roll: String(v.roll).padStart(2, '0'), name: v.name.trim(),
        classId: v.classId, gender: v.gender, dob: v.dob, bloodGroup: v.bloodGroup,
        guardianName: v.guardianName.trim(), phone: v.phone.trim(), email: v.email.trim(),
        address: v.address.trim(), admissionDate: v.admissionDate || todayISO(), status: 'Active'
      };
      if (existing) {
        const oldClass = existing.classId;
        Object.assign(existing, record);
        if (oldClass !== existing.classId) {
          // keep attendance of the old class intact, but drop the moved student from future marks of other class exams
          Object.values(DB.marks).forEach(examMarks => { if (examMarks[existing.id]) delete examMarks[existing.id]; });
        }
        logActivity(`Student record updated: ${existing.name} (${existing.id})`, 'i-pencil');
        toast(`${existing.name} updated successfully.`, 'success');
      } else {
        DB.students.push(record);
        logActivity(`New student enrolled: ${record.name} (${record.id})`, 'i-plus');
        pushNotification('New student enrolled', `${record.name} joined ${className(record.classId)}.`, 'info');
        toast(`${record.name} added to ${className(record.classId)}.`, 'success');
      }
      saveDB(); rerender();
    }
  });
}
function viewStudent(id) {
  const s = getStudent(id); if (!s) return;
  const att = studentAttendance(id);
  const cls = getClass(s.classId);
  const teacher = cls ? getTeacher(cls.teacherId) : null;
  const feeRows = DB.fees.filter(f => f.studentId === id);
  const due = feeRows.reduce((a, f) => a + (f.total - f.paid), 0);
  const exam = DB.exams.filter(e => e.classId === s.classId && DB.marks[e.id] && DB.marks[e.id][id])
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const res = exam ? examResult(exam, id) : null;
  openModal({
    title: s.name, subtitle: `${s.id} · ${className(s.classId)} · Roll ${s.roll}`, size: 'lg',
    body: `
      <div class="profile-card" style="border:none;padding:0;box-shadow:none">
        <div class="top">
          <span class="avatar" style="${avatarStyle(s.id + s.name)}">${esc(initials(s.name))}</span>
          <div>
            <h4>${esc(s.name)}</h4>
            <small class="muted">${esc(s.gender)} · DOB ${fmtDate(s.dob)} · Blood group ${esc(s.bloodGroup || '—')}</small>
          </div>
          <span class="chip ${s.status === 'Active' ? 'green' : 'gray'}" style="margin-left:auto">${esc(s.status)}</span>
        </div>
        <ul style="margin-top:.6rem">
          <li>${icon('i-user')} Guardian: ${esc(s.guardianName || '—')}</li>
          <li>${icon('i-phone')} ${esc(s.phone)}</li>
          <li>${icon('i-mail')} ${esc(s.email || '—')}</li>
          <li>${icon('i-pin')} ${esc(s.address || '—')}</li>
          <li>${icon('i-cal')} Admitted ${fmtDate(s.admissionDate)} · Class teacher: ${esc(teacher ? teacher.name : 'Not assigned')}</li>
        </ul>
      </div>
      <div class="att-summary" style="margin-top:1rem">
        <div class="box"><b>${att.pct}%</b><small>Attendance</small></div>
        <div class="box"><b>${att.present}/${att.total}</b><small>Days present</small></div>
        <div class="box"><b>${money(due)}</b><small>Pending fees</small></div>
        <div class="box"><b>${res ? res.grade : '—'}</b><small>Latest grade</small></div>
      </div>
      ${res ? `<table style="min-width:0;margin-top:1rem"><thead><tr><th>Subject</th><th class="num">Score</th><th class="num">Max</th><th>Status</th></tr></thead>
        <tbody>${res.rows.map(r => `<tr><td>${esc(r.name)}</td><td class="num">${r.score === null ? '—' : r.score}</td><td class="num">${r.maxMarks}</td>
        <td><span class="chip ${r.passed ? 'green' : 'red'}">${r.passed ? 'Pass' : (r.score === null ? 'Pending' : 'Fail')}</span></td></tr>`).join('')}</tbody></table>
        <small class="muted">From ${esc(exam.name)} · ${res.percentage}% · ${res.passed ? 'PASS' : 'FAIL'}</small>` : '<div class="alert info" style="margin-top:1rem">' + icon('i-info') + '<span>No published marks for this student yet.</span></div>'}`,
    footer: `<button class="btn btn-ghost" data-modal-close>Close</button>
      <button class="btn btn-ghost" data-action="student-edit" data-id="${esc(s.id)}">${icon('i-pencil')} Edit</button>
      <button class="btn btn-danger" data-action="student-delete" data-id="${esc(s.id)}">${icon('i-trash')} Delete</button>`
  });
}
function deleteStudent(id) {
  const s = getStudent(id); if (!s) return;
  openConfirm({
    title: 'Delete student record?',
    message: `<strong>${esc(s.name)}</strong> (${esc(s.id)}) will be removed along with their attendance, marks and fee records in this demo. This cannot be undone.`,
    confirmText: 'Delete student',
    onConfirm: () => {
      DB.students = DB.students.filter(x => x.id !== id);
      Object.keys(DB.attendance).forEach(k => { delete DB.attendance[k].records[id]; });
      Object.keys(DB.marks).forEach(eid => { delete DB.marks[eid][id]; });
      DB.fees = DB.fees.filter(f => f.studentId !== id);
      logActivity(`Student deleted: ${s.name} (${s.id})`, 'i-trash');
      saveDB(); toast(`${s.name} was deleted.`, 'success'); rerender();
    }
  });
}
function sortStudents(list) {
  const { sort, dir } = ui.students;
  const attCache = {};
  return list.slice().sort((a, b) => {
    let r = 0;
    if (sort === 'name') r = a.name.localeCompare(b.name);
    else if (sort === 'roll') r = Number(a.roll) - Number(b.roll);
    else if (sort === 'class') r = className(a.classId).localeCompare(className(b.classId)) || Number(a.roll) - Number(b.roll);
    else if (sort === 'gender') r = a.gender.localeCompare(b.gender);
    else if (sort === 'attendance') {
      attCache[a.id] = attCache[a.id] || studentAttendance(a.id).pct;
      attCache[b.id] = attCache[b.id] || studentAttendance(b.id).pct;
      r = attCache[a.id] - attCache[b.id];
    }
    return r * dir;
  });
}
function paginationHTML(total, page, size, action) {
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(page, pages);
  const nums = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - current) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== '…') nums.push('…');
  }
  const btn = (label, target, opts = {}) =>
    `<button ${opts.disabled ? 'disabled' : `data-action="${action}" data-page="${target}"`} class="${opts.active ? 'active' : ''}" aria-label="Page ${target}">${label}</button>`;
  return `<div class="pagination">
    <span class="info">Showing ${total === 0 ? 0 : (current - 1) * size + 1}–${Math.min(current * size, total)} of ${total}</span>
    <div class="pages">
      ${btn(icon('i-chevL'), Math.max(1, current - 1), { disabled: current === 1 })}
      ${nums.map(n => n === '…' ? `<span class="info" style="padding:.4rem">…</span>` : btn(n, n, { active: n === current })).join('')}
      ${btn(icon('i-chevR'), Math.min(pages, current + 1), { disabled: current === pages })}
    </div></div>`;
}
function renderStudents() {
  const f = ui.students;
  const q = f.q.trim().toLowerCase();
  let list = DB.students.filter(s => {
    const matchQ = !q || (s.name + ' ' + s.id + ' ' + s.roll + ' ' + (s.guardianName || '') + ' ' + (s.phone || '')).toLowerCase().includes(q);
    const matchC = !f.classId || s.classId === f.classId;
    const matchG = !f.gender || s.gender === f.gender;
    return matchQ && matchC && matchG;
  });
  list = sortStudents(list);
  const size = Number(DB.settings.pageSize) || 8;
  const pages = Math.max(1, Math.ceil(list.length / size));
  const page = Math.min(f.page, pages);
  const rows = list.slice((page - 1) * size, page * size);

  const toolbar = `
    <div class="toolbar">
      <div class="field grow"><label for="st-q">Search</label>
        <input type="search" id="st-q" data-filter="students.q" value="${esc(f.q)}" placeholder="Name, ID, roll or guardian…"></div>
      <div class="field"><label for="st-class">Class</label>
        <select id="st-class" data-filter="students.classId">
          <option value="">All classes</option>
          ${DB.classes.map(c => `<option value="${c.id}" ${f.classId === c.id ? 'selected' : ''}>${esc(className(c.id))}</option>`).join('')}
        </select></div>
      <div class="field"><label for="st-gender">Gender</label>
        <select id="st-gender" data-filter="students.gender">
          <option value="">All</option>
          ${['Male', 'Female', 'Other'].map(g => `<option ${f.gender === g ? 'selected' : ''}>${g}</option>`).join('')}
        </select></div>
      <div class="field"><label for="st-size">Rows</label>
        <select id="st-size" data-filter="settings.pageSize">${[8, 12, 20, 50].map(n => `<option value="${n}" ${size === n ? 'selected' : ''}>${n} / page</option>`).join('')}</select></div>
      <div class="view-toggle" role="group" aria-label="View mode">
        <button class="${f.view === 'table' ? 'active' : ''}" data-action="students-view" data-view="table" title="Table view" aria-label="Table view">${icon('i-menu')}</button>
        <button class="${f.view === 'cards' ? 'active' : ''}" data-action="students-view" data-view="cards" title="Card view" aria-label="Card view">${icon('i-grid')}</button>
      </div>
      <button class="btn btn-ghost btn-sm" data-action="students-clear">${icon('i-refresh')} Reset</button>
      <span class="result-count">${list.length} student${list.length === 1 ? '' : 's'}</span>
    </div>`;

  if (!list.length) {
    $('#studentsBody').innerHTML = `<div class="card">${toolbar}
      ${emptyState('i-users', 'No students found', 'No student matches these filters. Try clearing the search or add a new student.',
        '<button class="btn btn-primary" data-action="student-add">' + icon('i-plus') + ' Add student</button>')}</div>`;
    return;
  }

  const body = f.view === 'cards'
    ? `<div class="cards-grid">${rows.map(s => {
        const att = studentAttendance(s.id);
        return `<article class="profile-card">
          <div class="top"><span class="avatar" style="${avatarStyle(s.id + s.name)}">${esc(initials(s.name))}</span>
            <div><h4>${esc(s.name)}</h4><small class="muted">${esc(s.id)} · Roll ${esc(s.roll)}</small></div></div>
          <div class="tags"><span class="chip soft">${esc(className(s.classId))}</span><span class="chip gray">${esc(s.gender)}</span>
            <span class="chip ${att.pct >= 75 ? 'green' : att.pct >= 60 ? 'amber' : 'red'}">${att.pct}% attendance</span></div>
          <ul><li>${icon('i-phone')} ${esc(s.phone)}</li><li>${icon('i-mail')} ${esc(s.email || '—')}</li>
            <li>${icon('i-user')} ${esc(s.guardianName || '—')}</li></ul>
          <div class="actions">
            <button class="btn btn-soft btn-sm" data-action="student-view" data-id="${esc(s.id)}">${icon('i-eye')} View</button>
            <button class="icon-btn" data-action="student-edit" data-id="${esc(s.id)}" aria-label="Edit">${icon('i-pencil')}</button>
            <button class="icon-btn danger" data-action="student-delete" data-id="${esc(s.id)}" aria-label="Delete">${icon('i-trash')}</button>
          </div></article>`;
      }).join('')}</div>`
    : `<div class="table-wrap"><table class="stack">
        <thead><tr>
          <th class="sortable" data-action="students-sort" data-key="name">Student <span class="sort-ic">${f.sort === 'name' ? (f.dir > 0 ? '▲' : '▼') : '↕'}</span></th>
          <th class="sortable" data-action="students-sort" data-key="roll">Roll <span class="sort-ic">${f.sort === 'roll' ? (f.dir > 0 ? '▲' : '▼') : '↕'}</span></th>
          <th class="sortable" data-action="students-sort" data-key="class">Class <span class="sort-ic">${f.sort === 'class' ? (f.dir > 0 ? '▲' : '▼') : '↕'}</span></th>
          <th class="sortable" data-action="students-sort" data-key="gender">Gender <span class="sort-ic">${f.sort === 'gender' ? (f.dir > 0 ? '▲' : '▼') : '↕'}</span></th>
          <th>Contact</th>
          <th class="sortable" data-action="students-sort" data-key="attendance">Attendance <span class="sort-ic">${f.sort === 'attendance' ? (f.dir > 0 ? '▲' : '▼') : '↕'}</span></th>
          <th style="text-align:right">Actions</th>
        </tr></thead>
        <tbody>${rows.map(s => {
          const att = studentAttendance(s.id);
          return `<tr>
            <td data-label="Student"><div class="person"><span class="avatar" style="${avatarStyle(s.id + s.name)}">${esc(initials(s.name))}</span>
              <span>${esc(s.name)}<small>${esc(s.id)}</small></span></div></td>
            <td data-label="Roll">${esc(s.roll)}</td>
            <td data-label="Class"><span class="chip soft">${esc(className(s.classId))}</span></td>
            <td data-label="Gender">${esc(s.gender)}</td>
            <td data-label="Contact"><small>${esc(s.phone)}<br><span class="muted">${esc(s.guardianName || '—')}</span></small></td>
            <td data-label="Attendance"><div style="display:flex;align-items:center;gap:.4rem">
              <span class="progress ${att.pct >= 75 ? 'green' : att.pct >= 60 ? 'amber' : 'red'}"><i style="width:${att.pct}%"></i></span><small>${att.pct}%</small></div></td>
            <td data-label="Actions"><div class="row-actions">
              <button class="icon-btn" data-action="student-view" data-id="${esc(s.id)}" title="View profile" aria-label="View">${icon('i-eye')}</button>
              <button class="icon-btn" data-action="student-edit" data-id="${esc(s.id)}" title="Edit" aria-label="Edit">${icon('i-pencil')}</button>
              <button class="icon-btn danger" data-action="student-delete" data-id="${esc(s.id)}" title="Delete" aria-label="Delete">${icon('i-trash')}</button>
            </div></td></tr>`;
        }).join('')}</tbody></table></div>
      ${paginationHTML(list.length, page, size, 'students-page')}`;

  $('#studentsBody').innerHTML = `<div class="card">${toolbar}${body}</div>`;
}
function exportStudentsCSV() {
  downloadCSV('students-' + todayISO() + '.csv', [
    ['Student ID', 'Name', 'Roll', 'Class', 'Section', 'Gender', 'DOB', 'Guardian', 'Phone', 'Email', 'Address', 'Admission date', 'Attendance %'],
    ...DB.students.map(s => [s.id, s.name, s.roll, getClass(s.classId)?.name || '', getClass(s.classId)?.section || '',
      s.gender, s.dob, s.guardianName || '', s.phone, s.email || '', s.address || '', s.admissionDate || '', studentAttendance(s.id).pct])
  ]);
}

/* ===================== 7c. TEACHERS ===================== */
function teacherFields(existing) {
  return [
    { key: 'id', label: 'Teacher ID', required: true, validate: v => {
        const clash = DB.teachers.some(t => t.id.toLowerCase() === v.trim().toLowerCase() && (!existing || t.id !== existing.id));
        return clash ? 'This teacher ID already exists.' : ''; } },
    { key: 'name', label: 'Full name', required: true },
    { key: 'gender', label: 'Gender', type: 'select', options: ['Male', 'Female', 'Other'].map(g => ({ value: g, label: g })) },
    { key: 'qualification', label: 'Qualification', placeholder: 'M.Sc., B.Ed. …' },
    { key: 'email', label: 'Email', type: 'email', required: true },
    { key: 'phone', label: 'Phone', type: 'tel', required: true },
    { key: 'joiningDate', label: 'Joining date', type: 'date' },
    { key: 'experience', label: 'Experience (years)', type: 'number', min: 0, max: 45 },
    { key: 'subjectIds', label: 'Subjects taught', type: 'checkboxes', span: true,
      options: DB.subjects.map(s => ({ value: s.id, label: s.name })) },
    { key: 'classIds', label: 'Class teacher / in-charge of', type: 'checkboxes', span: true,
      options: DB.classes.map(c => ({ value: c.id, label: className(c.id) })) }
  ];
}
function openTeacherForm(existing) {
  openForm({
    title: existing ? 'Edit teacher' : 'Add teacher',
    subtitle: existing ? existing.id : 'Demo staff record',
    fields: teacherFields(existing),
    values: existing || { id: nextCode('T', DB.teachers), joiningDate: todayISO(), experience: 1, gender: 'Female' },
    submitText: existing ? 'Save changes' : 'Add teacher',
    size: 'lg',
    onSubmit: v => {
      const rec = {
        id: v.id.trim(), name: v.name.trim(), gender: v.gender, qualification: v.qualification.trim(),
        email: v.email.trim(), phone: v.phone.trim(), joiningDate: v.joiningDate || todayISO(),
        experience: Number(v.experience) || 0, subjectIds: v.subjectIds, classIds: v.classIds, status: 'Active',
        subject: v.subjectIds.length ? subjectName(v.subjectIds[0]) : 'Not assigned'
      };
      if (existing) {
        Object.assign(existing, rec);
        // a class can only have one class teacher — release other classes
        DB.classes.forEach(c => { if (c.teacherId === existing.id && !v.classIds.includes(c.id)) c.teacherId = ''; });
        DB.classes.forEach(c => { if (v.classIds.includes(c.id)) c.teacherId = existing.id; });
        logActivity(`Teacher record updated: ${existing.name}`, 'i-pencil');
        toast(`${existing.name} updated.`, 'success');
      } else {
        DB.teachers.push(rec);
        v.classIds.forEach(cid => { const c = getClass(cid); if (c) c.teacherId = rec.id; });
        logActivity(`New teacher joined: ${rec.name} (${rec.id})`, 'i-plus');
        toast(`${rec.name} added to the staff directory.`, 'success');
      }
      saveDB(); rerender();
    }
  });
}
function renderTeachers() {
  const f = ui.teachers, q = f.q.trim().toLowerCase();
  let list = DB.teachers.filter(t => {
    const subjects = t.subjectIds.map(subjectName).join(' ');
    const matchQ = !q || (t.name + ' ' + t.id + ' ' + t.subject + ' ' + subjects + ' ' + t.email).toLowerCase().includes(q);
    const matchS = !f.subjectId || t.subjectIds.includes(f.subjectId);
    return matchQ && matchS;
  });
  list.sort((a, b) => {
    const r = f.sort === 'id' ? a.id.localeCompare(b.id)
      : f.sort === 'experience' ? (a.experience - b.experience)
      : f.sort === 'classes' ? (b.classIds.length - a.classIds.length)
      : a.name.localeCompare(b.name);
    return r * f.dir;
  });
  const toolbar = `
    <div class="toolbar">
      <div class="field grow"><label for="tc-q">Search</label>
        <input type="search" id="tc-q" data-filter="teachers.q" value="${esc(f.q)}" placeholder="Name, ID, subject or email…"></div>
      <div class="field"><label for="tc-sub">Subject</label>
        <select id="tc-sub" data-filter="teachers.subjectId"><option value="">All subjects</option>
          ${DB.subjects.map(s => `<option value="${s.id}" ${f.subjectId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
      <div class="view-toggle" role="group" aria-label="View mode">
        <button class="${f.view === 'table' ? 'active' : ''}" data-action="teachers-view" data-view="table" aria-label="Table view">${icon('i-menu')}</button>
        <button class="${f.view === 'cards' ? 'active' : ''}" data-action="teachers-view" data-view="cards" aria-label="Card view">${icon('i-grid')}</button>
      </div>
      <span class="result-count">${list.length} teacher${list.length === 1 ? '' : 's'}</span>
    </div>`;
  if (!list.length) {
    $('#teachersBody').innerHTML = `<div class="card">${toolbar}${emptyState('i-cap', 'No teachers found', 'Adjust the filters or add a new teacher.',
      '<button class="btn btn-primary" data-action="teacher-add">' + icon('i-plus') + ' Add teacher</button>')}</div>`;
    return;
  }
  const body = f.view === 'cards'
    ? `<div class="cards-grid">${list.map(t => `
      <article class="profile-card">
        <div class="top"><span class="avatar" style="${avatarStyle(t.id + t.name)}">${esc(initials(t.name))}</span>
          <div><h4>${esc(t.name)}</h4><small class="muted">${esc(t.id)} · ${esc(t.qualification || '—')}</small></div></div>
        <div class="tags">${t.subjectIds.map(sid => `<span class="chip soft">${esc(subjectName(sid))}</span>`).join('') || '<span class="chip gray">No subject</span>'}</div>
        <ul><li>${icon('i-mail')} ${esc(t.email)}</li><li>${icon('i-phone')} ${esc(t.phone)}</li>
          <li>${icon('i-layers')} ${t.classIds.map(className).join(', ') || 'No class assigned'}</li>
          <li>${icon('i-cal')} Joined ${fmtDate(t.joiningDate)} · ${t.experience} yr experience</li></ul>
        <div class="actions">
          <button class="btn btn-soft btn-sm" data-action="teacher-edit" data-id="${esc(t.id)}">${icon('i-pencil')} Edit</button>
          <button class="icon-btn danger" data-action="teacher-delete" data-id="${esc(t.id)}" aria-label="Delete">${icon('i-trash')}</button>
        </div></article>`).join('')}</div>`
    : `<div class="table-wrap"><table class="stack">
      <thead><tr>
        <th class="sortable" data-action="teachers-sort" data-key="name">Teacher <span class="sort-ic">${f.sort === 'name' ? (f.dir > 0 ? '▲' : '▼') : '↕'}</span></th>
        <th class="sortable" data-action="teachers-sort" data-key="id">ID <span class="sort-ic">${f.sort === 'id' ? (f.dir > 0 ? '▲' : '▼') : '↕'}</span></th>
        <th>Subjects</th>
        <th class="sortable" data-action="teachers-sort" data-key="classes">Classes <span class="sort-ic">${f.sort === 'classes' ? (f.dir > 0 ? '▲' : '▼') : '↕'}</span></th>
        <th>Contact</th>
        <th class="sortable" data-action="teachers-sort" data-key="experience">Exp. <span class="sort-ic">${f.sort === 'experience' ? (f.dir > 0 ? '▲' : '▼') : '↕'}</span></th>
        <th style="text-align:right">Actions</th></tr></thead>
      <tbody>${list.map(t => `<tr>
        <td data-label="Teacher"><div class="person"><span class="avatar" style="${avatarStyle(t.id + t.name)}">${esc(initials(t.name))}</span>
          <span>${esc(t.name)}<small>${esc(t.qualification || '—')}</small></span></div></td>
        <td data-label="ID">${esc(t.id)}</td>
        <td data-label="Subjects">${t.subjectIds.map(sid => `<span class="chip soft" style="margin:2px">${esc(subjectName(sid))}</span>`).join('') || '<span class="muted">—</span>'}</td>
        <td data-label="Classes">${t.classIds.map(className).join(', ') || '<span class="muted">None</span>'}</td>
        <td data-label="Contact"><small>${esc(t.phone)}<br><span class="muted">${esc(t.email)}</span></small></td>
        <td data-label="Exp.">${t.experience} yr</td>
        <td data-label="Actions"><div class="row-actions">
          <button class="icon-btn" data-action="teacher-edit" data-id="${esc(t.id)}" aria-label="Edit">${icon('i-pencil')}</button>
          <button class="icon-btn danger" data-action="teacher-delete" data-id="${esc(t.id)}" aria-label="Delete">${icon('i-trash')}</button>
        </div></td></tr>`).join('')}</tbody></table></div>
      <p class="muted" style="font-size:.78rem;margin-top:.5rem">Showing all ${list.length} matching teachers.</p>`;
  $('#teachersBody').innerHTML = `<div class="card">${toolbar}${body}</div>`;
}
function deleteTeacher(id) {
  const t = getTeacher(id); if (!t) return;
  openConfirm({
    title: 'Remove teacher?',
    message: `<strong>${esc(t.name)}</strong> will be removed from the staff directory. Classes taught by them will be kept but shown as “no class teacher”.`,
    confirmText: 'Remove teacher',
    onConfirm: () => {
      DB.teachers = DB.teachers.filter(x => x.id !== id);
      DB.classes.forEach(c => { if (c.teacherId === id) c.teacherId = ''; });
      DB.subjects.forEach(s => { if (s.teacherId === id) s.teacherId = ''; });
      DB.timetable.forEach(p => { if (p.teacherId === id) p.teacherId = ''; });
      logActivity(`Teacher removed: ${t.name} (${t.id})`, 'i-trash');
      saveDB(); toast(`${t.name} removed.`, 'success'); rerender();
    }
  });
}

/* ===================== 7d. ATTENDANCE ===================== */
const ATT_STATUSES = ['present', 'absent', 'late', 'leave'];
function attDraft() {
  const { date, classId } = ui.attendance;
  if (!classId) ui.attendance.classId = DB.classes[0]?.id || '';
  const stored = getAttendance(ui.attendance.date, ui.attendance.classId);
  const roster = DB.students.filter(s => s.classId === ui.attendance.classId);
  const draft = {};
  roster.forEach(s => { draft[s.id] = stored ? (stored.records[s.id] || '') : ''; });
  ui.attendance.draft = draft;
  ui.attendance.saved = !!stored;
  return draft;
}
function renderAttendance() {
  if (!ui.attendance.classId) ui.attendance.classId = DB.classes[0]?.id || '';
  if (!ui.attendance.draft || ui.attendance._loadedFor !== ui.attendance.classId + ui.attendance.date) {
    attDraft();
    ui.attendance._loadedFor = ui.attendance.classId + ui.attendance.date;
  }
  const draft = ui.attendance.draft;
  const counts = { present: 0, absent: 0, late: 0, leave: 0, unmarked: 0 };
  Object.values(draft).forEach(v => { if (counts[v] !== undefined) counts[v]++; else counts.unmarked++; });
  const roster = DB.students.filter(s => s.classId === ui.attendance.classId);
  const marked = counts.total = roster.length - counts.unmarked;

  $('#attendanceBody').innerHTML = `
    <div class="toolbar">
      <div class="field"><label for="at-class">Class</label>
        <select id="at-class" data-filter="attendance.classId">
          ${DB.classes.map(c => `<option value="${c.id}" ${ui.attendance.classId === c.id ? 'selected' : ''}>${esc(className(c.id))}</option>`).join('')}
        </select></div>
      <div class="field"><label for="at-date">Date</label>
        <input type="date" id="at-date" data-filter="attendance.date" value="${esc(ui.attendance.date)}" max="${esc(addDays(todayISO(), 365))}"></div>
      <button class="btn btn-ghost btn-sm" data-action="att-today">${icon('i-cal')} Today</button>
      <button class="btn btn-ghost btn-sm" data-action="att-prev">${icon('i-chevL')} Previous day</button>
      <button class="btn btn-ghost btn-sm" data-action="att-next">Next day ${icon('i-chevR')}</button>
      <span class="result-count">${ui.attendance.saved ? 'Saved record found for this date' : 'No record saved for this date yet'}</span>
    </div>

    <div class="grid-2">
      <article class="card">
        <header class="card-head"><h3>Mark attendance · ${esc(className(ui.attendance.classId))}</h3>
          <span class="chip soft">${fmtDateLong(ui.attendance.date)}</span></header>
        <div class="att-summary" style="margin-bottom:.85rem">
          <div class="box"><b style="color:#059669">${counts.present}</b><small>Present</small></div>
          <div class="box"><b style="color:#dc2626">${counts.absent}</b><small>Absent</small></div>
          <div class="box"><b style="color:#d97706">${counts.late}</b><small>Late</small></div>
          <div class="box"><b style="color:#2563eb">${counts.leave}</b><small>Leave</small></div>
          <div class="box"><b>${counts.unmarked}</b><small>Unmarked</small></div>
        </div>
        ${roster.length ? `
        <div class="table-wrap" style="max-height:380px;overflow:auto"><table>
          <thead><tr><th>Roll</th><th>Student</th><th>Status</th></tr></thead>
          <tbody>${roster.map(s => `<tr>
            <td>${esc(s.roll)}</td>
            <td><div class="person"><span class="avatar" style="${avatarStyle(s.id + s.name)}">${esc(initials(s.name))}</span>
              <span>${esc(s.name)}<small>${esc(s.id)}</small></span></div></td>
            <td><div class="att-status" role="group" aria-label="Attendance for ${esc(s.name)}">
              ${ATT_STATUSES.map(st => `<button data-action="att-set" data-id="${esc(s.id)}" data-s="${st}"
                class="${draft[s.id] === st ? 'on' : ''}" aria-pressed="${draft[s.id] === st}">${st[0].toUpperCase() + st.slice(1)}</button>`).join('')}
            </div></td></tr>`).join('')}</tbody></table></div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.85rem">
          <button class="btn btn-success btn-sm" data-action="att-all-present">${icon('i-check')} All present</button>
          <button class="btn btn-ghost btn-sm" data-action="att-clear">Clear all</button>
          <button class="btn btn-primary btn-sm" data-action="att-save" ${marked === 0 ? '' : ''}>${icon('i-save')} Save attendance</button>
        </div>` : emptyState('i-users', 'No students in this class', 'Add students to this class first, then mark attendance.')}
      </article>

      <article class="card">
        <header class="card-head"><h3>Class attendance trend</h3><span class="chip soft">Last 7 school days</span></header>
        <div class="chart-wrap"><canvas id="chartAttClass"></canvas></div>
        <p class="muted" style="font-size:.78rem;margin-top:.5rem">Percentage of present + late students for ${esc(className(ui.attendance.classId))}.</p>
        <div class="card-head" style="margin:1rem 0 .5rem"><h3>Lowest attendance</h3></div>
        ${(() => {
          const rows = roster.map(s => ({ s, a: studentAttendance(s.id) })).sort((a, b) => a.a.pct - b.a.pct).slice(0, 5);
          return rows.length ? `<table style="min-width:0"><tbody>${rows.map(r => `<tr>
            <td>${esc(r.s.name)}</td><td style="width:120px"><span class="progress ${r.a.pct >= 75 ? 'green' : r.a.pct >= 60 ? 'amber' : 'red'}"><i style="width:${r.a.pct}%"></i></span></td>
            <td style="text-align:right">${r.a.pct}%</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No data.</p>';
        })()}
      </article>
    </div>

    <article class="card">
      <header class="card-head"><h3>Attendance history</h3><span class="chip soft">${Object.keys(DB.attendance).length} saved records</span></header>
      <div class="toolbar" style="box-shadow:none;border-style:dashed">
        <div class="field"><label for="ah-class">Class</label>
          <select id="ah-class" data-filter="attendance.historyClass"><option value="">All classes</option>
            ${DB.classes.map(c => `<option value="${c.id}" ${ui.attendance.historyClass === c.id ? 'selected' : ''}>${esc(className(c.id))}</option>`).join('')}</select></div>
        <div class="field"><label for="ah-from">From</label><input type="date" id="ah-from" data-filter="attendance.historyFrom" value="${esc(ui.attendance.historyFrom)}"></div>
        <div class="field"><label for="ah-to">To</label><input type="date" id="ah-to" data-filter="attendance.historyTo" value="${esc(ui.attendance.historyTo)}"></div>
        <button class="btn btn-ghost btn-sm" data-action="att-history-clear">${icon('i-refresh')} Clear filters</button>
      </div>
      <div id="attHistory">${attendanceHistoryHTML()}</div>
    </article>`;
  renderAttendanceCharts();
}
function renderAttendanceCharts() {
  const days = lastSchoolDays(7);
  Charts.line($('#chartAttClass'), days.map(d => DAYS_SHORT[new Date(d + 'T00:00:00').getDay()]),
    days.map(d => attendancePct(d, ui.attendance.classId)), { color: '#6366f1', suffix: '%' });
}
function attendanceHistoryHTML() {
  const { historyClass: hc, historyFrom: hf, historyTo: ht } = ui.attendance;
  const rows = Object.values(DB.attendance)
    .filter(r => (!hc || r.classId === hc) && (!hf || r.date >= hf) && (!ht || r.date <= ht))
    .sort((a, b) => b.date.localeCompare(a.date) || className(a.classId).localeCompare(className(b.classId)))
    .slice(0, 40);
  if (!rows.length) return emptyState('i-clip', 'No attendance records', 'Mark attendance for a class to build history.');
  return `<div class="table-wrap"><table class="stack">
    <thead><tr><th>Date</th><th>Class</th><th class="num">Present</th><th class="num">Absent</th><th class="num">Late</th><th class="num">Leave</th><th>Rate</th><th style="text-align:right">Actions</th></tr></thead>
    <tbody>${rows.map(r => {
      const c = attendanceCounts(r);
      const p = pct(c.present + c.late, c.total);
      return `<tr><td data-label="Date">${fmtDate(r.date)}</td>
        <td data-label="Class"><span class="chip soft">${esc(className(r.classId))}</span></td>
        <td class="num" data-label="Present">${c.present}</td><td class="num" data-label="Absent">${c.absent}</td>
        <td class="num" data-label="Late">${c.late}</td><td class="num" data-label="Leave">${c.leave}</td>
        <td data-label="Rate"><div style="display:flex;align-items:center;gap:.4rem">
          <span class="progress ${p >= 75 ? 'green' : p >= 60 ? 'amber' : 'red'}"><i style="width:${p}%"></i></span><small>${p}%</small></div></td>
        <td data-label="Actions"><div class="row-actions">
          <button class="icon-btn" data-action="att-edit" data-date="${esc(r.date)}" data-id="${esc(r.classId)}" title="Edit this record" aria-label="Edit">${icon('i-pencil')}</button>
          <button class="icon-btn danger" data-action="att-delete" data-date="${esc(r.date)}" data-id="${esc(r.classId)}" title="Delete record" aria-label="Delete">${icon('i-trash')}</button>
        </div></td></tr>`;
    }).join('')}</tbody></table></div>
    <p class="muted" style="font-size:.78rem;margin-top:.5rem">Showing the ${rows.length} most recent matching records. Use “Edit” to load a saved day back into the marking sheet.</p>`;
}
function saveAttendance() {
  const { date, classId, draft } = ui.attendance;
  if (isWeekend(date)) toast('Note: this date falls on a weekend.', 'warn');
  const marked = Object.values(draft).filter(Boolean).length;
  if (!marked) { toast('Mark at least one student before saving.', 'error'); return; }
  const unmarked = Object.values(draft).filter(v => !v).length;
  const commit = () => {
    DB.attendance[`${date}|${classId}`] = { date, classId, records: { ...draft }, takenAt: new Date().toISOString() };
    logActivity(`Attendance saved for ${className(classId)} on ${fmtDate(date)}`, 'i-clip');
    saveDB();
    toast(`Attendance saved for ${marked} student${marked > 1 ? 's' : ''}${unmarked ? ` (${unmarked} left unmarked)` : ''}.`, 'success');
    ui.attendance._loadedFor = '';
    rerender();
  };
  if (unmarked) {
    openConfirm({
      title: 'Some students are unmarked',
      message: `${unmarked} student(s) have no status. They will be saved as unmarked and counted as neither present nor absent. Save anyway?`,
      confirmText: 'Save attendance', danger: false, onConfirm: commit
    });
  } else commit();
}
function exportAttendanceCSV() {
  const rows = [['Date', 'Class', 'Student ID', 'Student', 'Roll', 'Status']];
  Object.values(DB.attendance).sort((a, b) => a.date.localeCompare(b.date)).forEach(rec => {
    Object.entries(rec.records).forEach(([sid, st]) => {
      const s = getStudent(sid); if (!s) return;
      rows.push([rec.date, className(rec.classId), s.id, s.name, s.roll, st]);
    });
  });
  downloadCSV('attendance-' + todayISO() + '.csv', rows);
}

/* ===================== 7e. EXAMINATIONS ===================== */
function subjectRowHTML(sub, index) {
  return `<div class="form-grid" style="align-items:end;border:1px dashed var(--border);border-radius:12px;padding:.6rem;margin-bottom:.6rem" data-exam-row="${index}">
    <div class="field" style="margin:0"><label>Subject</label>
      <select data-exam-subject>
        <option value="">Select subject…</option>
        ${DB.subjects.map(s => `<option value="${s.id}" ${sub.subjectId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
      </select></div>
    <div class="field" style="margin:0"><label>Maximum marks</label>
      <input type="number" min="1" max="500" value="${esc(sub.maxMarks)}" data-exam-max></div>
    <div class="field" style="margin:0"><label>Exam date</label>
      <input type="date" value="${esc(sub.examDate || '')}" data-exam-date></div>
    <div style="display:flex;justify-content:flex-end">
      <button class="icon-btn danger" type="button" data-action="exam-row-remove" aria-label="Remove subject">${icon('i-trash')}</button></div>
  </div>`;
}
function openExamForm(existing) {
  const rows = existing ? subjectsOfExam(existing).map(s => ({ subjectId: s.subjectId, maxMarks: s.maxMarks, examDate: s.examDate }))
    : [{ subjectId: DB.subjects[0]?.id || '', maxMarks: 100, examDate: todayISO() }];
  const wrap = openModal({
    title: existing ? 'Edit examination' : 'New examination',
    subtitle: 'Add the subjects and maximum marks for this paper',
    size: 'lg',
    body: `<form class="form-grid" data-examform novalidate>
        <div class="field span-2"><label for="ex-name">Examination name <span class="req">*</span></label>
          <input id="ex-name" data-exam-name value="${esc(existing ? existing.name : '')}" placeholder="e.g. Term 2 Examination">
          <small class="err"></small></div>
        <div class="field"><label for="ex-class">Class <span class="req">*</span></label>
          <select id="ex-class" data-exam-class>${DB.classes.map(c => `<option value="${c.id}" ${existing && existing.classId === c.id ? 'selected' : ''}>${esc(className(c.id))}</option>`).join('')}</select></div>
        <div class="field"><label for="ex-term">Term</label>
          <select id="ex-term" data-exam-term>${['Term 1', 'Term 2', 'Term 3', 'Annual'].map(t => `<option ${existing && existing.term === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="field"><label for="ex-date">Start date <span class="req">*</span></label>
          <input type="date" id="ex-date" data-exam-date-start value="${esc(existing ? existing.date : todayISO())}"><small class="err"></small></div>
        <div class="field"><label for="ex-status">Status</label>
          <select id="ex-status" data-exam-status>${['Scheduled', 'Ongoing', 'Published'].map(s => `<option ${existing && existing.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        <div class="span-2">
          <div class="card-head" style="margin-bottom:.4rem"><h3>Subjects &amp; maximum marks</h3>
            <button class="btn btn-soft btn-sm" type="button" data-action="exam-row-add">${icon('i-plus')} Add subject</button></div>
          <div id="examRows">${rows.map((r, i) => subjectRowHTML(r, i)).join('')}</div>
          <small class="err" id="examRowsErr" style="color:var(--red-500);display:none"></small>
        </div>
      </form>`,
    footer: `<button class="btn btn-ghost" data-modal-close>Cancel</button>
             <button class="btn btn-primary" data-exam-save>${existing ? 'Save changes' : 'Create examination'}</button>`
  });
  const getRows = () => Array.from(wrap.querySelectorAll('[data-exam-row]')).map((row, i) => ({
    subjectId: row.querySelector('[data-exam-subject]').value,
    maxMarks: Number(row.querySelector('[data-exam-max]').value),
    examDate: row.querySelector('[data-exam-date]').value,
    index: i
  }));
  wrap.querySelector('[data-exam-save]').addEventListener('click', () => {
    const name = wrap.querySelector('[data-exam-name]').value.trim();
    const classId = wrap.querySelector('[data-exam-class]').value;
    const date = wrap.querySelector('[data-exam-date-start]').value;
    let bad = false;
    const errBox = wrap.querySelector('#examRowsErr');
    const nameField = wrap.querySelector('[data-exam-name]').closest('.field');
    nameField.classList.remove('invalid'); nameField.querySelector('.err').textContent = '';
    errBox.style.display = 'none';
    if (!name) { nameField.classList.add('invalid'); nameField.querySelector('.err').textContent = 'Examination name is required.'; bad = true; }
    const rws = getRows();
    if (!rws.length) { errBox.textContent = 'Add at least one subject.'; errBox.style.display = 'block'; bad = true; }
    const seen = new Set();
    rws.forEach(r => {
      if (!r.subjectId) { errBox.textContent = 'Every subject row needs a subject.'; errBox.style.display = 'block'; bad = true; }
      else if (seen.has(r.subjectId)) { errBox.textContent = 'Each subject can appear only once in an exam.'; errBox.style.display = 'block'; bad = true; }
      seen.add(r.subjectId);
      if (!(r.maxMarks > 0) || r.maxMarks > 500) { errBox.textContent = 'Maximum marks must be between 1 and 500.'; errBox.style.display = 'block'; bad = true; }
    });
    if (!date) { errBox.textContent = 'Please choose a start date.'; errBox.style.display = 'block'; bad = true; }
    if (bad) return;
    const subjects = rws.map(r => ({ subjectId: r.subjectId, maxMarks: r.maxMarks, examDate: r.examDate }));
    if (existing) {
      Object.assign(existing, { name, classId, date, term: wrap.querySelector('[data-exam-term]').value, status: wrap.querySelector('[data-exam-status]').value, subjects });
      // drop marks for subjects no longer part of the exam
      const marks = DB.marks[existing.id] || {};
      Object.keys(marks).forEach(sid => {
        Object.keys(marks[sid]).forEach(sub => { if (!subjects.some(s => s.subjectId === sub)) delete marks[sid][sub]; });
      });
      logActivity(`Exam updated: ${name} (${className(classId)})`, 'i-pencil');
      toast('Examination updated.', 'success');
    } else {
      const id = uid();
      DB.exams.push({ id, name, classId, date, term: wrap.querySelector('[data-exam-term]').value, status: wrap.querySelector('[data-exam-status]').value, subjects });
      logActivity(`New exam created: ${name} (${className(classId)})`, 'i-file');
      pushNotification('New examination created', `${name} for ${className(classId)} on ${fmtDate(date)}.`, 'info');
      toast('Examination created.', 'success');
    }
    saveDB(); closeModal(wrap); rerender();
  });
  return wrap;
}
function deleteExam(id) {
  const e = getExam(id); if (!e) return;
  openConfirm({
    title: 'Delete examination?',
    message: `<strong>${esc(e.name)}</strong> (${esc(className(e.classId))}) and all marks entered for it will be deleted.`,
    confirmText: 'Delete exam',
    onConfirm: () => {
      DB.exams = DB.exams.filter(x => x.id !== id);
      delete DB.marks[id];
      if (ui.exams.entryExamId === id) ui.exams.entryExamId = '';
      logActivity(`Exam deleted: ${e.name}`, 'i-trash');
      saveDB(); toast('Examination deleted.', 'success'); rerender();
    }
  });
}
function renderExams() {
  const f = ui.exams, q = f.q.trim().toLowerCase();
  const list = DB.exams.filter(e => {
    const mq = !q || (e.name + ' ' + className(e.classId) + ' ' + e.term).toLowerCase().includes(q);
    return mq && (!f.classId || e.classId === f.classId);
  }).sort((a, b) => b.date.localeCompare(a.date));

  if (f.entryExamId && getExam(f.entryExamId)) return renderMarksEntry();

  const toolbar = `<div class="toolbar">
      <div class="field grow"><label for="ex-q">Search</label>
        <input type="search" id="ex-q" data-filter="exams.q" value="${esc(f.q)}" placeholder="Exam name, class or term…"></div>
      <div class="field"><label for="ex-fclass">Class</label>
        <select id="ex-fclass" data-filter="exams.classId"><option value="">All classes</option>
          ${DB.classes.map(c => `<option value="${c.id}" ${f.classId === c.id ? 'selected' : ''}>${esc(className(c.id))}</option>`).join('')}</select></div>
      <span class="result-count">${list.length} examin${list.length === 1 ? 'ation' : 'ations'}</span></div>`;

  $('#examsBody').innerHTML = `<div class="card">${toolbar}${list.length ? `
    <div class="table-wrap"><table class="stack">
      <thead><tr><th>Examination</th><th>Class</th><th>Date</th><th class="num">Subjects</th><th class="num">Max total</th><th>Status</th><th style="text-align:right">Actions</th></tr></thead>
      <tbody>${list.map(e => {
        const total = e.subjects.reduce((a, s) => a + Number(s.maxMarks || 0), 0);
        const entered = Object.keys(DB.marks[e.id] || {}).length;
        return `<tr>
          <td data-label="Exam"><strong>${esc(e.name)}</strong><br><small class="muted">${esc(e.term)} · ${e.subjects.map(s => subjectName(s.subjectId)).slice(0, 3).join(', ')}${e.subjects.length > 3 ? '…' : ''}</small></td>
          <td data-label="Class"><span class="chip soft">${esc(className(e.classId))}</span></td>
          <td data-label="Date">${fmtDate(e.date)}</td>
          <td class="num" data-label="Subjects">${e.subjects.length}</td>
          <td class="num" data-label="Max total">${total}</td>
          <td data-label="Status"><span class="chip ${e.status === 'Published' ? 'green' : e.status === 'Ongoing' ? 'amber' : 'blue'}">${esc(e.status)}</span>
            <small class="muted" style="display:block">${entered} student mark-sheet${entered === 1 ? '' : 's'} entered</small></td>
          <td data-label="Actions"><div class="row-actions">
            <button class="btn btn-soft btn-sm" data-action="exam-marks" data-id="${esc(e.id)}">${icon('i-pencil')} Marks</button>
            <button class="icon-btn" data-action="exam-edit" data-id="${esc(e.id)}" aria-label="Edit">${icon('i-pencil')}</button>
            <button class="icon-btn danger" data-action="exam-delete" data-id="${esc(e.id)}" aria-label="Delete">${icon('i-trash')}</button>
          </div></td></tr>`;
      }).join('')}</tbody></table></div>`
    : emptyState('i-file', 'No examinations yet', 'Create an examination, choose its subjects and maximum marks, then enter student marks.',
      '<button class="btn btn-primary" data-action="exam-add">' + icon('i-plus') + ' New examination</button>')}</div>`;
}
function renderMarksEntry() {
  const exam = getExam(ui.exams.entryExamId);
  if (!exam) { ui.exams.entryExamId = ''; return renderExams(); }
  const subs = subjectsOfExam(exam);
  const marks = DB.marks[exam.id] || {};
  const roster = DB.students.filter(s => s.classId === exam.classId);
  $('#examsBody').innerHTML = `
    <div class="toolbar">
      <button class="btn btn-ghost btn-sm" data-action="exam-back">${icon('i-chevL')} Back to exams</button>
      <strong style="margin-left:.4rem">${esc(exam.name)}</strong>
      <span class="chip soft">${esc(className(exam.classId))}</span>
      <span class="chip gray">${fmtDate(exam.date)}</span>
      <span class="result-count">Pass mark ${DB.settings.passMark}% · grades: A+ ≥90, A ≥80, B+ ≥70, B ≥60, C ≥50, D ≥${DB.settings.passMark}, F below</span>
    </div>
    <div class="card">
      <header class="card-head"><h3>Marks entry</h3>
        <div style="display:flex;gap:.4rem;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" data-action="marks-clear">${icon('i-trash')} Clear all marks</button>
          <button class="btn btn-primary btn-sm" data-action="marks-save">${icon('i-save')} Save marks</button>
        </div></header>
      ${roster.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Roll</th><th>Student</th>${subs.map(s => `<th class="num" data-label="">${esc(s.subject.name)}<br><small class="muted">/ ${s.maxMarks}</small></th>`).join('')}<th class="num">Total</th><th class="num">%</th><th>Grade</th><th>Result</th></tr></thead>
        <tbody>${roster.map(s => `<tr data-marks-row="${esc(s.id)}">
          <td>${esc(s.roll)}</td>
          <td><strong style="font-weight:600">${esc(s.name)}</strong><br><small class="muted">${esc(s.id)}</small></td>
          ${subs.map(sub => {
            const val = marks[s.id]?.[sub.subjectId];
            return `<td class="num"><input class="marks-cell" type="number" min="0" max="${sub.maxMarks}" step="1"
              value="${val === undefined || val === null ? '' : val}" data-marks="${esc(s.id)}" data-subject="${esc(sub.subjectId)}" data-max="${sub.maxMarks}"
              aria-label="${esc(s.name)} ${esc(sub.subject.name)} marks out of ${sub.maxMarks}"></td>`;
          }).join('')}
          <td class="num" data-total>—</td><td class="num" data-pct>—</td>
          <td data-grade><span class="chip gray">—</span></td><td data-result><span class="chip gray">—</span></td>
        </tr>`).join('')}</tbody></table></div>
      <p class="muted" style="font-size:.78rem;margin-top:.6rem">${icon('i-info')} Marks are validated live: a score cannot be empty-and-saved, negative, or higher than the subject maximum. Totals, percentage, grade and pass/fail update as you type.</p>`
        : emptyState('i-users', 'No students in this class', 'Add students to this class before entering marks.')}
    </div>`;
  $$('#examsBody [data-marks]').forEach(inp => inp.addEventListener('input', () => updateMarksRow(inp)));
}
function updateMarksRow(input) {
  const row = input.closest('[data-marks-row]');
  if (!row) return;
  const exam = getExam(ui.exams.entryExamId);
  const max = Number(input.dataset.max);
  let v = input.value.trim();
  input.classList.remove('err');
  if (v !== '') {
    const n = Number(v);
    if (Number.isNaN(n) || n < 0) { input.classList.add('err'); v = ''; }
    else if (n > max) { input.classList.add('err'); input.value = max; v = String(max); toast(`Marks cannot exceed the maximum of ${max}.`, 'error', 2200); }
  }
  const values = Array.from(row.querySelectorAll('[data-marks]')).map(i => {
    const raw = i.value.trim();
    if (raw === '' || i.classList.contains('err')) return null;
    const num = Number(raw);
    return Number.isNaN(num) ? null : num;
  });
  const total = values.reduce((a, b) => a + (b || 0), 0);
  const maxTotal = Array.from(row.querySelectorAll('[data-marks]')).reduce((a, i) => a + Number(i.dataset.max), 0);
  const percentage = pct(total, maxTotal);
  const complete = values.every(v2 => v2 !== null) && values.length > 0;
  row.querySelector('[data-total]').textContent = values.some(v2 => v2 !== null) ? total : '—';
  row.querySelector('[data-pct]').textContent = values.some(v2 => v2 !== null) ? percentage + '%' : '—';
  const gradeCell = row.querySelector('[data-grade]'), resCell = row.querySelector('[data-result]');
  if (!values.some(v2 => v2 !== null)) { gradeCell.innerHTML = '<span class="chip gray">—</span>'; resCell.innerHTML = '<span class="chip gray">Pending</span>'; return; }
  const g = gradeFor(percentage);
  gradeCell.innerHTML = `<span class="chip ${gradeTone(g)}">${g}</span>`;
  resCell.innerHTML = complete
    ? `<span class="chip ${percentage >= DB.settings.passMark ? 'green' : 'red'}">${percentage >= DB.settings.passMark ? 'Pass' : 'Fail'}</span>`
    : `<span class="chip amber">In progress</span>`;
}
function saveMarks() {
  const exam = getExam(ui.exams.entryExamId);
  if (!exam) return;
  const subs = subjectsOfExam(exam);
  const errors = [];
  $$('#examsBody [data-marks]').forEach(inp => {
    const raw = inp.value.trim();
    if (raw === '') return;
    const max = Number(inp.dataset.max), n = Number(raw);
    if (Number.isNaN(n) || n < 0 || n > max || !Number.isInteger(n)) {
      errors.push(`${inp.dataset.marks}: ${subjectName(inp.dataset.subject)} must be a whole number between 0 and ${max}.`);
      inp.classList.add('err');
    }
  });
  if (errors.length) { toast(errors[0] + (errors.length > 1 ? ` (+${errors.length - 1} more)` : ''), 'error', 5000); return; }
  const store = DB.marks[exam.id] || {};
  let count = 0;
  $$('#examsBody tr[data-marks-row]').forEach(row => {
    const sid = row.dataset.marksRow;
    const entry = {};
    row.querySelectorAll('[data-marks]').forEach(inp => {
      const raw = inp.value.trim();
      if (raw !== '') entry[inp.dataset.subject] = Number(raw);
    });
    if (Object.keys(entry).length) { store[sid] = entry; count++; } else delete store[sid];
  });
  DB.marks[exam.id] = store;
  exam.status = exam.status === 'Scheduled' ? 'Ongoing' : exam.status;
  logActivity(`Marks saved for ${exam.name} (${count} students)`, 'i-file');
  saveDB();
  toast(`Marks saved for ${count} student${count === 1 ? '' : 's'} in ${exam.name}.`, 'success');
  rerender();
}

/* ===================== 7f. RESULTS ===================== */
function renderResults() {
  const f = ui.results;
  const exams = DB.exams.slice().sort((a, b) => b.date.localeCompare(a.date));
  if (!f.examId || !getExam(f.examId)) f.examId = exams.find(e => Object.keys(DB.marks[e.id] || {}).length)?.id || exams[0]?.id || '';
  const exam = getExam(f.examId);
  if (!exam) {
    $('#resultsBody').innerHTML = `<div class="card">${emptyState('i-award', 'No examinations yet', 'Create an examination and enter marks to see results.',
      '<button class="btn btn-primary" data-action="exam-add">' + icon('i-plus') + ' New examination</button>')}</div>`;
    return;
  }
  const q = f.q.trim().toLowerCase();
  let rows = examResults(exam).map(r => {
    const att = studentAttendance(r.student.id);
    return { ...r, attendance: att.pct };
  });
  if (q) rows = rows.filter(r => (r.student.name + ' ' + r.student.roll + ' ' + r.student.id).toLowerCase().includes(q));
  const sorted = rows.slice().sort((a, b) => {
    if (f.sort === 'percentage') return (b.percentage - a.percentage) * f.dir;
    if (f.sort === 'name') return a.student.name.localeCompare(b.student.name) * f.dir;
    if (f.sort === 'roll') return (Number(a.student.roll) - Number(b.student.roll)) * f.dir;
    return b.percentage - a.percentage;
  });
  const ranked = rows.slice().sort((a, b) => b.percentage - a.percentage);
  const appeared = rows.filter(r => r.entered > 0);
  const passed = rows.filter(r => r.complete && r.passed);
  const failed = rows.filter(r => r.complete && !r.passed);
  const avg = appeared.length ? Math.round(appeared.reduce((a, r) => a + r.percentage, 0) / appeared.length * 10) / 10 : 0;
  const subs = subjectsOfExam(exam);

  $('#resultsBody').innerHTML = `
    <div class="toolbar">
      <div class="field grow"><label for="rs-exam">Examination</label>
        <select id="rs-exam" data-filter="results.examId">
          ${exams.map(e => `<option value="${e.id}" ${f.examId === e.id ? 'selected' : ''}>${esc(e.name)} · ${esc(className(e.classId))} · ${fmtDate(e.date)}</option>`).join('')}
        </select></div>
      <div class="field grow"><label for="rs-q">Search student</label>
        <input type="search" id="rs-q" data-filter="results.q" value="${esc(f.q)}" placeholder="Name, roll or ID…"></div>
      <div class="field"><label for="rs-sort">Sort by</label>
        <select id="rs-sort" data-filter="results.sort">
          <option value="rank" ${f.sort === 'rank' ? 'selected' : ''}>Rank (highest %)</option>
          <option value="percentage" ${f.sort === 'percentage' ? 'selected' : ''}>Percentage</option>
          <option value="name" ${f.sort === 'name' ? 'selected' : ''}>Name</option>
          <option value="roll" ${f.sort === 'roll' ? 'selected' : ''}>Roll number</option>
        </select></div>
      <button class="btn btn-ghost btn-sm" data-action="results-dir">${f.dir > 0 ? 'Ascending ↑' : 'Descending ↓'}</button>
      <span class="result-count">${rows.length} students</span>
    </div>

    <div class="stat-grid">
      ${statCard({ label: 'Appeared', value: appeared.length, sub: `of ${rows.length} enrolled`, icon: 'i-users', tone: 'indigo' })}
      ${statCard({ label: 'Passed', value: passed.length, sub: `${pct(passed.length, appeared.length || 1)}% pass rate`, icon: 'i-check', tone: 'green' })}
      ${statCard({ label: 'Failed', value: failed.length, sub: `Below ${DB.settings.passMark}% or subject fail`, icon: 'i-alert', tone: 'red' })}
      ${statCard({ label: 'Class average', value: avg + '%', sub: appeared.length ? `Top: ${ranked[0]?.student.name} (${ranked[0]?.percentage}%)` : 'No marks yet', icon: 'i-chart', tone: 'purple' })}
    </div>

    <div class="card">
      <header class="card-head"><h3>${esc(exam.name)} · ${esc(className(exam.classId))}</h3>
        <span class="chip gray">Maximum ${exam.subjects.reduce((a, s) => a + s.maxMarks, 0)} marks</span></header>
      ${sorted.length ? `<div class="table-wrap"><table class="stack">
        <thead><tr><th>Rank</th><th>Student</th>${subs.map(s => `<th class="num">${esc(s.subject.name.slice(0, 8))}<br><small class="muted">/${s.maxMarks}</small></th>`).join('')}
          <th class="num">Total</th><th class="num">%</th><th>Grade</th><th>Result</th><th style="text-align:right">Card</th></tr></thead>
        <tbody>${sorted.map(r => {
          const rank = ranked.findIndex(x => x.student.id === r.student.id) + 1;
          return `<tr>
            <td data-label="Rank">${r.entered ? (rank <= 3 ? `<span class="chip ${rank === 1 ? 'green' : rank === 2 ? 'blue' : 'amber'}">#${rank}</span>` : '#' + rank) : '—'}</td>
            <td data-label="Student"><div class="person"><span class="avatar" style="${avatarStyle(r.student.id + r.student.name)}">${esc(initials(r.student.name))}</span>
              <span>${esc(r.student.name)}<small>Roll ${esc(r.student.roll)} · ${r.attendance}% attendance</small></span></div></td>
            ${r.rows.map(row => `<td class="num" data-label="${esc(row.name)}">${row.score === null ? '<span class="muted">—</span>' : row.score}</td>`).join('')}
            <td class="num" data-label="Total">${r.entered ? r.total : '—'}</td>
            <td class="num" data-label="%">${r.entered ? r.percentage + '%' : '—'}</td>
            <td data-label="Grade">${r.entered ? `<span class="chip ${gradeTone(r.grade)}">${r.grade}</span>` : '<span class="chip gray">—</span>'}</td>
            <td data-label="Result">${r.entered ? (r.complete
              ? `<span class="chip ${r.passed ? 'green' : 'red'}">${r.passed ? 'Pass' : 'Fail'}</span>`
              : '<span class="chip amber">Incomplete</span>') : '<span class="chip gray">No marks</span>'}</td>
            <td data-label="Card"><div class="row-actions">
              <button class="icon-btn" data-action="result-card" data-id="${esc(r.student.id)}" aria-label="Result card">${icon('i-eye')}</button>
            </div></td></tr>`;
        }).join('')}</tbody></table></div>`
        : emptyState('i-users', 'No students match', 'Try a different search term.')}
    </div>

    <div class="grid-2">
      <article class="card">
        <header class="card-head"><h3>Subject-wise averages</h3></header>
        <div class="table-wrap"><table style="min-width:0"><thead><tr><th>Subject</th><th class="num">Average</th><th class="num">Highest</th><th class="num">Pass %</th></tr></thead>
          <tbody>${subs.map(s => {
            const scores = rows.map(r => r.rows.find(x => x.subjectId === s.subjectId)).filter(x => x && x.score !== null).map(x => x.score);
            const passedCount = scores.filter(sc => sc >= DB.settings.passMark).length;
            const avg2 = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10 : 0;
            return `<tr><td>${esc(s.subject.name)}</td><td class="num">${scores.length ? avg2 : '—'}</td>
              <td class="num">${scores.length ? Math.max(...scores) : '—'}</td>
              <td class="num">${scores.length ? pct(passedCount, scores.length) + '%' : '—'}</td></tr>`;
          }).join('')}</tbody></table></div>
      </article>
      <article class="card">
        <header class="card-head"><h3>Grade distribution</h3></header>
        <div class="chart-wrap sm"><canvas id="chartResultGrades"></canvas></div>
        <div class="legend" id="resultLegend"></div>
      </article>
    </div>`;
  // grade donut
  const counts = {}; rows.forEach(r => { if (r.entered) counts[r.grade] = (counts[r.grade] || 0) + 1; });
  const order = ['A+', 'A', 'B+', 'B', 'C', 'D', 'F'];
  const colors = ['#059669', '#10b981', '#3b82f6', '#6366f1', '#8b5cf6', '#f59e0b', '#ef4444'];
  const segs = order.filter(g => counts[g]).map(g => ({ label: g, value: counts[g], color: colors[order.indexOf(g)] }));
  Charts.donut($('#chartResultGrades'), segs);
  $('#resultLegend').innerHTML = segs.length ? segs.map(s => `<span><i style="background:${s.color}"></i>${s.label}: ${s.value}</span>`).join('') : '<span class="muted">No marks entered yet.</span>';
}
function showResultCard(studentId) {
  const exam = getExam(ui.results.examId);
  const s = getStudent(studentId);
  if (!exam || !s) return;
  const res = examResult(exam, studentId);
  const cls = getClass(exam.classId);
  const all = examResults(exam).filter(r => r.entered).sort((a, b) => b.percentage - a.percentage);
  const rank = all.findIndex(r => r.student.id === studentId) + 1;
  const cardHTML = `
    ${sheetHeader('Student result card')}
    <h2 style="margin:0 0 4px">${esc(s.name)}</h2>
    <div class="muted">${esc(s.id)} · Roll ${esc(s.roll)} · ${esc(cls ? cls.name + ' - ' + cls.section : '')} · ${esc(exam.name)} (${esc(exam.term)})</div>
    <table style="margin-top:12px"><thead><tr><th>Subject</th><th>Max marks</th><th>Marks obtained</th><th>Result</th></tr></thead>
      <tbody>${res.rows.map(r => `<tr><td>${esc(r.name)}</td><td>${r.maxMarks}</td><td>${r.score === null ? '—' : r.score}</td>
        <td>${r.score === null ? 'Not entered' : (r.passed ? 'Pass' : 'Fail')}</td></tr>`).join('')}
      <tr><th>Total</th><th>${res.maxTotal}</th><th>${res.total}</th><th>${res.percentage}%</th></tr></tbody></table>
    <div class="cards" style="margin-top:12px">
      <div class="pcard"><b>${res.percentage}%</b><small>Percentage</small></div>
      <div class="pcard"><b>${res.grade}</b><small>Grade</small></div>
      <div class="pcard"><b>${res.complete ? (res.passed ? 'PASS' : 'FAIL') : 'Pending'}</b><small>Result</small></div>
      <div class="pcard"><b>${rank || '—'}</b><small>Class rank</small></div>
    </div>
    <p class="muted">Grading scale: A+ 90–100, A 80–89, B+ 70–79, B 60–69, C 50–59, D 40–49, F below 40. Pass mark ${DB.settings.passMark}%.
    Generated from demo data on ${fmtDate(todayISO())}.</p>
    <div class="sign"><span>Class teacher</span><span>Examination cell</span><span>Principal</span></div>`;
  openModal({
    title: 'Result card', subtitle: `${s.name} · ${exam.name}`, size: 'lg',
    body: `<div style="border:1px solid var(--border);border-radius:12px;padding:1rem;background:var(--surface-2)">${cardHTML}</div>`,
    footer: `<button class="btn btn-ghost" data-modal-close>Close</button>
             <button class="btn btn-primary" data-print-card>${icon('i-print')} Print card</button>`
  });
  const active = modalStack[modalStack.length - 1];
  active.querySelector('[data-print-card]').addEventListener('click', () => printSheet(`Result card - ${s.name}`, cardHTML));
}
function exportResultsCSV() {
  const exam = getExam(ui.results.examId);
  if (!exam) { toast('Select an examination first.', 'warn'); return; }
  const subs = subjectsOfExam(exam);
  const rows = [['Rank', 'Student ID', 'Student', 'Roll',
    ...subs.map(s => `${s.subject.name} (${s.maxMarks})`), 'Total', 'Percentage', 'Grade', 'Result']];
  const all = examResults(exam).filter(r => r.entered).sort((a, b) => b.percentage - a.percentage);
  examResults(exam).forEach(r => {
    const rank = all.findIndex(x => x.student.id === r.student.id) + 1;
    rows.push([r.entered ? rank : '', r.student.id, r.student.name, r.student.roll,
      ...r.rows.map(x => x.score === null ? '' : x.score), r.total, r.percentage + '%', r.grade,
      r.complete ? (r.passed ? 'Pass' : 'Fail') : 'Incomplete']);
  });
  downloadCSV(`results-${exam.name.replace(/\s+/g, '-').toLowerCase()}.csv`, rows);
}
function printResultsReport() {
  const exam = getExam(ui.results.examId);
  if (!exam) { toast('Select an examination first.', 'warn'); return; }
  const subs = subjectsOfExam(exam);
  const rows = examResults(exam);
  const all = rows.filter(r => r.entered).sort((a, b) => b.percentage - a.percentage);
  const passed = rows.filter(r => r.complete && r.passed).length;
  const html = `${sheetHeader('Examination result report')}
    <h2>${esc(exam.name)} — ${esc(className(exam.classId))}</h2>
    <p class="muted">${esc(exam.term)} · exam date ${fmtDate(exam.date)} · ${rows.length} students · ${all.length} with marks · ${passed} passed</p>
    <table><thead><tr><th>Rank</th><th>Student</th><th>Roll</th>${subs.map(s => `<th>${esc(s.subject.name)}</th>`).join('')}<th>Total</th><th>%</th><th>Grade</th><th>Result</th></tr></thead>
    <tbody>${rows.map(r => {
      const rank = all.findIndex(x => x.student.id === r.student.id) + 1;
      return `<tr><td>${r.entered ? rank : ''}</td><td>${esc(r.student.name)}</td><td>${esc(r.student.roll)}</td>
        ${r.rows.map(x => `<td>${x.score === null ? '' : x.score}</td>`).join('')}
        <td>${r.total}</td><td>${r.percentage}%</td><td>${r.grade}</td><td>${r.complete ? (r.passed ? 'Pass' : 'Fail') : 'Incomplete'}</td></tr>`;
    }).join('')}</tbody></table>
    <p class="muted">Grading scale: A+ 90–100, A 80–89, B+ 70–79, B 60–69, C 50–59, D 40–49, F below 40 · Pass mark ${DB.settings.passMark}%</p>
    <div class="sign"><span>Class teacher</span><span>Examination cell</span><span>Principal</span></div>`;
  printSheet(`Result report - ${exam.name}`, html);
}

/* ===================== 7g. CLASSES ===================== */
function openClassForm(existing) {
  openForm({
    title: existing ? 'Edit class' : 'Add class',
    subtitle: 'The combination of class name and section must be unique',
    fields: [
      { key: 'name', label: 'Class name', required: true, placeholder: 'e.g. Grade 11' },
      { key: 'section', label: 'Section', required: true, placeholder: 'A / B / C' },
      { key: 'room', label: 'Room number', placeholder: 'Room 101' },
      { key: 'capacity', label: 'Capacity', type: 'number', min: 1, max: 200 },
      { key: 'teacherId', label: 'Class teacher', type: 'select', span: true,
        options: [{ value: '', label: 'Not assigned' }, ...DB.teachers.map(t => ({ value: t.id, label: `${t.name} (${t.id})` }))] }
    ],
    values: existing || { capacity: 40 },
    submitText: existing ? 'Save changes' : 'Add class',
    onSubmit: v => {
      const dup = DB.classes.some(c => c.name.trim().toLowerCase() === v.name.trim().toLowerCase()
        && c.section.trim().toLowerCase() === v.section.trim().toLowerCase() && (!existing || c.id !== existing.id));
      if (dup) { toast('A class with this name and section already exists.', 'error'); return false; }
      const rec = { name: v.name.trim(), section: v.section.trim().toUpperCase(), room: v.room.trim(), capacity: Number(v.capacity) || 40, teacherId: v.teacherId };
      if (existing) {
        Object.assign(existing, rec);
        logActivity(`Class updated: ${className(existing.id)}`, 'i-pencil');
        toast('Class updated.', 'success');
      } else {
        DB.classes.push({ id: uid(), ...rec });
        logActivity(`New class created: ${v.name} - ${v.section}`, 'i-plus');
        toast(`Class ${v.name} - ${v.section} created.`, 'success');
      }
      saveDB(); rerender();
    }
  });
}
function viewClassStudents(id) {
  const cls = getClass(id); if (!cls) return;
  const roster = DB.students.filter(s => s.classId === id).sort((a, b) => Number(a.roll) - Number(b.roll));
  const subs = DB.subjects.filter(s => s.classIds.includes(id));
  const printHTML = `${sheetHeader('Class student list')}
    <h2>${esc(className(id))}</h2>
    <p class="muted">Class teacher: ${esc(cls.teacherId ? teacherName(cls.teacherId) : 'Not assigned')} · Room ${esc(cls.room)} · ${roster.length} students · Subjects: ${subs.map(s => esc(s.name)).join(', ') || '—'}</p>
    <table><thead><tr><th>Roll</th><th>Student ID</th><th>Name</th><th>Gender</th><th>Guardian</th><th>Contact</th></tr></thead>
    <tbody>${roster.map(s => `<tr><td>${esc(s.roll)}</td><td>${esc(s.id)}</td><td>${esc(s.name)}</td><td>${esc(s.gender)}</td>
      <td>${esc(s.guardianName || '')}</td><td>${esc(s.phone)}</td></tr>`).join('')}</tbody></table>`;
  openModal({
    title: className(id), subtitle: `${roster.length} students · class teacher: ${cls.teacherId ? teacherName(cls.teacherId) : 'not assigned'}`, size: 'lg',
    body: roster.length ? `<div class="table-wrap"><table><thead><tr><th>Roll</th><th>Student</th><th>Gender</th><th>Guardian</th><th>Contact</th><th>Attendance</th></tr></thead>
      <tbody>${roster.map(s => { const a = studentAttendance(s.id); return `<tr><td>${esc(s.roll)}</td>
        <td>${esc(s.name)}<br><small class="muted">${esc(s.id)}</small></td><td>${esc(s.gender)}</td>
        <td>${esc(s.guardianName || '—')}</td><td>${esc(s.phone)}</td>
        <td><span class="chip ${a.pct >= 75 ? 'green' : a.pct >= 60 ? 'amber' : 'red'}">${a.pct}%</span></td></tr>`; }).join('')}</tbody></table></div>`
      : emptyState('i-users', 'This class is empty', 'No students are assigned to this class yet.',
        `<button class="btn btn-primary" data-action="student-add">${icon('i-plus')} Add student</button>`),
    footer: `<button class="btn btn-ghost" data-modal-close>Close</button>
      <button class="btn btn-ghost" data-action="class-edit" data-id="${esc(id)}">${icon('i-pencil')} Edit class</button>
      <button class="btn btn-primary" data-print-class>${icon('i-print')} Print list</button>`
  });
  modalStack[modalStack.length - 1].querySelector('[data-print-class]').addEventListener('click', () => printSheet(`Class list - ${className(id)}`, printHTML));
}
function deleteClass(id) {
  const cls = getClass(id); if (!cls) return;
  const count = DB.students.filter(s => s.classId === id).length;
  if (count) {
    openConfirm({
      title: 'This class cannot be deleted yet',
      message: `<strong>${esc(className(id))}</strong> still has <strong>${count}</strong> student(s). Move them to another class or delete their records first.`,
      confirmText: 'OK, understood', danger: false, onConfirm: null
    });
    return;
  }
  openConfirm({
    title: 'Delete class?',
    message: `<strong>${esc(className(id))}</strong> will be removed together with its timetable slots, attendance records, subject allocation and examinations.`,
    confirmText: 'Delete class',
    onConfirm: () => {
      DB.classes = DB.classes.filter(c => c.id !== id);
      DB.subjects.forEach(s => { s.classIds = s.classIds.filter(cid => cid !== id); });
      DB.timetable = DB.timetable.filter(p => p.classId !== id);
      Object.keys(DB.attendance).forEach(k => { if (DB.attendance[k].classId === id) delete DB.attendance[k]; });
      DB.exams = DB.exams.filter(e => e.classId !== id);
      DB.homework = DB.homework.filter(h => h.classId !== id);
      DB.resources = DB.resources.filter(r => r.classId !== id);
      logActivity(`Class deleted: ${className(id)}`, 'i-trash');
      saveDB(); toast('Class deleted.', 'success'); rerender();
    }
  });
}
function renderClasses() {
  const q = ui.classes.q.trim().toLowerCase();
  const list = DB.classes.filter(c => !q || (c.name + ' ' + c.section + ' ' + c.room + ' ' + (c.teacherId ? teacherName(c.teacherId) : '')).toLowerCase().includes(q));
  const last = lastSchoolDays(1)[0];
  $('#classesBody').innerHTML = `
    <div class="toolbar">
      <div class="field grow"><label for="cl-q">Search</label>
        <input type="search" id="cl-q" data-filter="classes.q" value="${esc(ui.classes.q)}" placeholder="Class, section, room or teacher…"></div>
      <span class="result-count">${list.length} class${list.length === 1 ? '' : 'es'} · ${DB.students.length} students total</span>
    </div>
    ${list.length ? `<div class="cards-grid">${list.map(c => {
      const roster = DB.students.filter(s => s.classId === c.id);
      const fill = pct(roster.length, c.capacity || 1);
      const att = attendancePct(last, c.id);
      return `<article class="profile-card">
        <div class="top"><span class="avatar" style="${avatarStyle(c.id + c.name)}">${esc(c.name.replace('Grade ', 'G'))}</span>
          <div><h4>${esc(c.name)} - ${esc(c.section)}</h4><small class="muted">${esc(c.room)} · ${esc(DB.settings.session)}</small></div></div>
        <div class="tags"><span class="chip soft">${roster.length} students</span>
          <span class="chip ${fill > 90 ? 'red' : fill > 70 ? 'amber' : 'green'}">${fill}% full</span>
          <span class="chip ${att >= 75 ? 'green' : att >= 60 ? 'amber' : 'gray'}">${att}% attendance</span></div>
        <ul><li>${icon('i-cap')} ${esc(c.teacherId ? teacherName(c.teacherId) : 'No class teacher assigned')}</li>
          <li>${icon('i-book')} ${DB.subjects.filter(s => s.classIds.includes(c.id)).length} subjects allocated</li>
          <li>${icon('i-clock2')} ${DB.timetable.filter(p => p.classId === c.id).length} timetable slots</li></ul>
        <div class="actions">
          <button class="btn btn-soft btn-sm" data-action="class-students" data-id="${esc(c.id)}">${icon('i-users')} Students</button>
          <button class="icon-btn" data-action="class-edit" data-id="${esc(c.id)}" aria-label="Edit">${icon('i-pencil')}</button>
          <button class="icon-btn danger" data-action="class-delete" data-id="${esc(c.id)}" aria-label="Delete">${icon('i-trash')}</button>
        </div></article>`;
    }).join('')}</div>` : emptyState('i-layers', 'No classes found', 'Create a class to start grouping students.',
      '<button class="btn btn-primary" data-action="class-add">' + icon('i-plus') + ' Add class</button>')}`;
}

/* ===================== 7h. SUBJECTS ===================== */
function openSubjectForm(existing) {
  openForm({
    title: existing ? 'Edit subject' : 'Add subject',
    subtitle: 'Allocate the subject to the classes where it is taught',
    fields: [
      { key: 'name', label: 'Subject name', required: true,
        validate: v => (DB.subjects.some(s => s.name.toLowerCase() === v.trim().toLowerCase() && (!existing || s.id !== existing.id)) ? 'A subject with this name already exists.' : '') },
      { key: 'code', label: 'Subject code', required: true, placeholder: 'MATH',
        validate: v => (DB.subjects.some(s => s.code.toLowerCase() === v.trim().toLowerCase() && (!existing || s.id !== existing.id)) ? 'This code is already used.' : '') },
      { key: 'teacherId', label: 'Subject teacher', type: 'select',
        options: [{ value: '', label: 'Not assigned' }, ...DB.teachers.map(t => ({ value: t.id, label: t.name }))] },
      { key: 'classIds', label: 'Taught in classes', type: 'checkboxes', span: true, required: true,
        options: DB.classes.map(c => ({ value: c.id, label: className(c.id) })) }
    ],
    values: existing || { classIds: DB.classes.map(c => c.id) },
    submitText: existing ? 'Save changes' : 'Add subject',
    onSubmit: v => {
      const rec = { name: v.name.trim(), code: v.code.trim().toUpperCase(), teacherId: v.teacherId, classIds: v.classIds };
      if (existing) Object.assign(existing, rec);
      else DB.subjects.push({ id: uid(), ...rec });
      logActivity(`${existing ? 'Subject updated' : 'Subject added'}: ${rec.name}`, 'i-book');
      saveDB(); toast(`Subject ${rec.name} saved.`, 'success'); rerender();
    }
  });
}
function deleteSubject(id) {
  const s = getSubject(id); if (!s) return;
  const usedIn = DB.exams.filter(e => e.subjects.some(x => x.subjectId === id));
  openConfirm({
    title: 'Delete subject?',
    message: `<strong>${esc(s.name)}</strong> is used in <strong>${usedIn.length}</strong> examination(s) and ${DB.timetable.filter(p => p.subjectId === id).length} timetable slot(s). Deleting it removes those entries and the related marks.`,
    confirmText: 'Delete subject',
    onConfirm: () => {
      DB.subjects = DB.subjects.filter(x => x.id !== id);
      DB.exams.forEach(e => { e.subjects = e.subjects.filter(x => x.subjectId !== id); });
      DB.timetable = DB.timetable.filter(p => p.subjectId !== id);
      DB.homework = DB.homework.filter(h => h.subjectId !== id);
      Object.values(DB.marks).forEach(m => Object.keys(m).forEach(sid => delete m[sid][id]));
      logActivity(`Subject deleted: ${s.name}`, 'i-trash');
      saveDB(); toast('Subject deleted.', 'success'); rerender();
    }
  });
}
function renderSubjects() {
  const { q, classId } = ui.subjects;
  const term = q.trim().toLowerCase();
  const list = DB.subjects.filter(s => {
    const mq = !term || (s.name + ' ' + s.code + ' ' + (s.teacherId ? teacherName(s.teacherId) : '')).toLowerCase().includes(term);
    return mq && (!classId || s.classIds.includes(classId));
  });
  $('#subjectsBody').innerHTML = `
    <div class="toolbar">
      <div class="field grow"><label for="sb-q">Search</label>
        <input type="search" id="sb-q" data-filter="subjects.q" value="${esc(q)}" placeholder="Subject name, code or teacher…"></div>
      <div class="field"><label for="sb-class">Allocated to class</label>
        <select id="sb-class" data-filter="subjects.classId"><option value="">All classes</option>
          ${DB.classes.map(c => `<option value="${c.id}" ${classId === c.id ? 'selected' : ''}>${esc(className(c.id))}</option>`).join('')}</select></div>
      <span class="result-count">${list.length} subject${list.length === 1 ? '' : 's'}</span>
    </div>
    <div class="card">${list.length ? `<div class="table-wrap"><table class="stack">
      <thead><tr><th>Subject</th><th>Code</th><th>Teacher</th><th>Classes</th><th style="text-align:right">Actions</th></tr></thead>
      <tbody>${list.map(s => `<tr>
        <td data-label="Subject"><strong style="font-weight:600">${esc(s.name)}</strong></td>
        <td data-label="Code"><span class="chip purple">${esc(s.code)}</span></td>
        <td data-label="Teacher">${esc(s.teacherId ? teacherName(s.teacherId) : '—')}</td>
        <td data-label="Classes">${s.classIds.length ? s.classIds.map(cid => `<span class="chip soft" style="margin:2px">${esc(className(cid))}</span>`).join('') : '<span class="chip amber">Not allocated</span>'}</td>
        <td data-label="Actions"><div class="row-actions">
          <button class="icon-btn" data-action="subject-edit" data-id="${esc(s.id)}" aria-label="Edit">${icon('i-pencil')}</button>
          <button class="icon-btn danger" data-action="subject-delete" data-id="${esc(s.id)}" aria-label="Delete">${icon('i-trash')}</button>
        </div></td></tr>`).join('')}</tbody></table></div>`
      : emptyState('i-book', 'No subjects found', 'Add a subject and allocate it to classes.', '<button class="btn btn-primary" data-action="subject-add">' + icon('i-plus') + ' Add subject</button>')}</div>`;
}

/* ===================== 7i. FEES ===================== */
function openFeeForm(existing) {
  openForm({
    title: existing ? 'Edit fee record' : 'New fee record',
    subtitle: 'Demo record only — no real payment is processed',
    fields: [
      { key: 'studentId', label: 'Student', required: true, type: 'select',
        options: DB.students.slice().sort((a, b) => a.name.localeCompare(b.name)).map(s => ({ value: s.id, label: `${s.name} · ${className(s.classId)} (${s.id})` })) },
      { key: 'month', label: 'Fee month', required: true, type: 'select',
        options: Array.from({ length: 12 }, (_, i) => {
          const d = new Date(); d.setMonth(d.getMonth() - i);
          const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
          return { value: key, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` };
        }) },
      { key: 'total', label: 'Total fee amount', required: true, type: 'number', min: 1, max: 1000000 },
      { key: 'paid', label: 'Already paid (optional)', type: 'number', min: 0, max: 1000000,
        validate: (v, all) => (Number(v || 0) > Number(all.total || 0) ? 'Paid cannot exceed the total.' : '') },
      { key: 'dueDate', label: 'Due date', type: 'date' },
      { key: 'note', label: 'Note', type: 'textarea', span: true, placeholder: 'e.g. Term 2 tuition fee (demo)' }
    ],
    values: existing || { month: todayISO().slice(0, 7), dueDate: todayISO().slice(0, 8) + '10', total: 1500, paid: 0 },
    submitText: existing ? 'Save changes' : 'Create record',
    onSubmit: v => {
      const student = getStudent(v.studentId);
      if (!student) { toast('Select a valid student.', 'error'); return false; }
      const rec = { studentId: v.studentId, classId: student.classId, month: v.month,
        total: Number(v.total), paid: Number(v.paid) || 0, dueDate: v.dueDate, note: v.note.trim() };
      if (existing) { Object.assign(existing, rec); logActivity(`Fee record updated: ${student.name} (${v.month})`, 'i-card'); toast('Fee record updated.', 'success'); }
      else { DB.fees.push({ id: uid(), ...rec, payments: [] }); logActivity(`Fee record created: ${student.name} (${v.month})`, 'i-card'); toast(`Fee record created for ${student.name}.`, 'success'); }
      saveDB(); rerender();
    }
  });
}
function openPaymentModal(feeId) {
  const fee = DB.fees.find(f => f.id === feeId); if (!fee) return;
  const student = getStudent(fee.studentId);
  const pending = Math.max(0, Number(fee.total) - Number(fee.paid));
  if (!student) { toast('The student for this record no longer exists.', 'error'); return; }
  openForm({
    title: 'Record a demo payment',
    subtitle: `${student.name} · ${fee.month} · pending ${money(pending)}`,
    fields: [
      { key: 'amount', label: `Amount (max ${pending})`, required: true, type: 'number', min: 1, max: pending,
        help: 'Demo entry only — no money is transferred.' },
      { key: 'date', label: 'Payment date', required: true, type: 'date' },
      { key: 'method', label: 'Method', required: true, type: 'select', options: ['Cash', 'Card', 'Bank transfer', 'UPI', 'Cheque'].map(m => ({ value: m, label: m })) },
      { key: 'note', label: 'Reference / note', span: true, placeholder: 'Demo receipt reference' }
    ],
    values: { amount: pending, date: todayISO(), method: 'Cash' },
    submitText: 'Record payment',
    onSubmit: v => {
      const amount = Number(v.amount);
      if (!(amount > 0) || amount > pending) { toast(`Amount must be between 1 and ${pending}.`, 'error'); return false; }
      fee.payments = fee.payments || [];
      fee.payments.push({ id: uid(), date: v.date, amount, method: v.method, note: v.note.trim() });
      fee.paid = Number(fee.paid) + amount;
      logActivity(`Demo payment recorded: ${money(amount)} from ${student.name} (${fee.month})`, 'i-card');
      saveDB();
      toast(`Demo payment of ${money(amount)} recorded for ${student.name}.`, 'success');
      rerender();
    }
  });
}
function feeReceiptHTML(feeId) {
  const fee = DB.fees.find(f => f.id === feeId); if (!fee) return '';
  const s = getStudent(fee.studentId) || { name: 'Unknown student', id: '—', roll: '—' };
  return `${sheetHeader('Fee receipt (demo)')}
    <h2>Fee receipt — ${esc(fee.month)}</h2>
    <p class="muted">Receipt ${esc(fee.id)} · status <strong>${esc(feeStatus(fee))}</strong> · generated ${fmtDate(todayISO())}</p>
    <table><tbody>
      <tr><th>Student</th><td>${esc(s.name)} (${esc(s.id)})</td><th>Class</th><td>${esc(className(fee.classId))}</td></tr>
      <tr><th>Roll</th><td>${esc(s.roll)}</td><th>Due date</th><td>${fmtDate(fee.dueDate)}</td></tr>
      <tr><th>Total fee</th><td>${money(fee.total)}</td><th>Paid</th><td>${money(fee.paid)}</td></tr>
      <tr><th>Balance</th><td>${money(Math.max(0, fee.total - fee.paid))}</td><th>Note</th><td>${esc(fee.note || '—')}</td></tr>
    </tbody></table>
    <table style="margin-top:12px"><thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th></tr></thead>
      <tbody>${(fee.payments || []).length ? fee.payments.map(p => `<tr><td>${fmtDate(p.date)}</td><td>${money(p.amount)}</td><td>${esc(p.method)}</td><td>${esc(p.note || '—')}</td></tr>`).join('')
        : '<tr><td colspan="4">No payments recorded yet.</td></tr>'}</tbody></table>
    <p class="muted">This is a demonstration receipt produced by a front-end demo. No payment has been processed and no money has been received.</p>
    <div class="sign"><span>Payer</span><span>Accountant</span><span>Principal</span></div>`;
}
function printFeeReceipt(feeId) {
  const fee = DB.fees.find(f => f.id === feeId); if (!fee) return;
  const s = getStudent(fee.studentId);
  printSheet(`Fee receipt - ${s ? s.name : 'student'} - ${fee.month}`, feeReceiptHTML(feeId));
}
function feeHistoryModal(feeId) {
  const fee = DB.fees.find(f => f.id === feeId); if (!fee) return;
  const s = getStudent(fee.studentId);
  openModal({
    title: 'Payment history', subtitle: `${s ? s.name : ''} · ${fee.month} · ${feeStatus(fee)}`, size: 'lg',
    body: (fee.payments || []).length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th class="num">Amount</th><th>Method</th><th>Reference</th><th style="text-align:right">Action</th></tr></thead>
      <tbody>${fee.payments.map(p => `<tr><td>${fmtDate(p.date)}</td><td class="num">${money(p.amount)}</td><td>${esc(p.method)}</td>
        <td>${esc(p.note || '—')}</td><td><div class="row-actions">
        <button class="icon-btn danger" data-action="payment-delete" data-id="${esc(fee.id)}" data-pay="${esc(p.id)}" aria-label="Delete payment">${icon('i-trash')}</button></div></td></tr>`).join('')}
      </tbody></table></div>` : emptyState('i-card', 'No payments yet', 'Record a demo payment to build the history.'),
    footer: `<button class="btn btn-ghost" data-modal-close>Close</button>
      <button class="btn btn-soft" data-action="fee-pay" data-id="${esc(fee.id)}">${icon('i-plus')} Record payment</button>
      <button class="btn btn-primary" data-action="fee-receipt" data-id="${esc(fee.id)}">${icon('i-print')} Print receipt</button>`
  });
}
function deletePayment(feeId, paymentId) {
  const fee = DB.fees.find(f => f.id === feeId); if (!fee) return;
  const pay = (fee.payments || []).find(p => p.id === paymentId); if (!pay) return;
  openConfirm({
    title: 'Delete this demo payment?',
    message: `Payment of <strong>${money(pay.amount)}</strong> on ${fmtDate(pay.date)} will be removed and the paid total reduced.`,
    confirmText: 'Delete payment',
    onConfirm: () => {
      fee.payments = fee.payments.filter(p => p.id !== paymentId);
      fee.paid = Math.max(0, Number(fee.paid) - Number(pay.amount));
      saveDB(); toast('Demo payment removed.', 'success');
      closeModal(); rerender();
    }
  });
}
function renderFees() {
  const f = ui.fees, q = f.q.trim().toLowerCase();
  const months = Array.from(new Set(DB.fees.map(x => x.month))).sort().reverse();
  const totals = feeTotals();
  let list = DB.fees.filter(x => {
    const s = getStudent(x.studentId);
    const hay = `${s ? s.name + ' ' + s.id + ' ' + s.roll : ''} ${x.month} ${x.note || ''}`.toLowerCase();
    return (!q || hay.includes(q)) && (!f.classId || x.classId === f.classId)
      && (!f.status || feeStatus(x) === f.status) && (!f.month || x.month === f.month);
  });
  list.sort((a, b) => {
    const sa = getStudent(a.studentId), sb = getStudent(b.studentId);
    if (f.sort === 'month') return b.month.localeCompare(a.month);
    if (f.sort === 'total') return b.total - a.total;
    if (f.sort === 'pending') return (b.total - b.paid) - (a.total - a.paid);
    if (f.sort === 'status') return feeStatus(a).localeCompare(feeStatus(b)) * f.dir;
    return (sa ? sa.name : '').localeCompare(sb ? sb.name : '') * f.dir;
  });
  $('#feesBody').innerHTML = `
    <div class="stat-grid">
      ${statCard({ label: 'Total billed', value: money(totals.total), sub: `${DB.fees.length} records`, icon: 'i-card', tone: 'indigo' })}
      ${statCard({ label: 'Collected', value: money(totals.paid), sub: pct(totals.paid, totals.total) + '% of billed', icon: 'i-check', tone: 'green' })}
      ${statCard({ label: 'Pending', value: money(totals.total - totals.paid), sub: `${DB.fees.filter(x => feeStatus(x) === 'Pending').length} unpaid records`, icon: 'i-clock', tone: 'amber' })}
      ${statCard({ label: 'Fully paid', value: DB.fees.filter(x => feeStatus(x) === 'Paid').length, sub: `${DB.fees.filter(x => feeStatus(x) === 'Partial').length} partially paid`, icon: 'i-users', tone: 'purple' })}
    </div>
    <div class="toolbar">
      <div class="field grow"><label for="fe-q">Search</label>
        <input type="search" id="fe-q" data-filter="fees.q" value="${esc(f.q)}" placeholder="Student, ID, month or note…"></div>
      <div class="field"><label for="fe-class">Class</label>
        <select id="fe-class" data-filter="fees.classId"><option value="">All classes</option>
          ${DB.classes.map(c => `<option value="${c.id}" ${f.classId === c.id ? 'selected' : ''}>${esc(className(c.id))}</option>`).join('')}</select></div>
      <div class="field"><label for="fe-status">Status</label>
        <select id="fe-status" data-filter="fees.status"><option value="">All</option>
          ${['Paid', 'Partial', 'Pending'].map(s => `<option ${f.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="field"><label for="fe-month">Month</label>
        <select id="fe-month" data-filter="fees.month"><option value="">All months</option>
          ${months.map(m => `<option value="${m}" ${f.month === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></div>
      <div class="field"><label for="fe-sort">Sort</label>
        <select id="fe-sort" data-filter="fees.sort">
          <option value="student" ${f.sort === 'student' ? 'selected' : ''}>Student name</option>
          <option value="month" ${f.sort === 'month' ? 'selected' : ''}>Newest month</option>
          <option value="total" ${f.sort === 'total' ? 'selected' : ''}>Highest total</option>
          <option value="pending" ${f.sort === 'pending' ? 'selected' : ''}>Highest pending</option>
          <option value="status" ${f.sort === 'status' ? 'selected' : ''}>Status</option></select></div>
      <span class="result-count">${list.length} record${list.length === 1 ? '' : 's'}</span>
    </div>
    <div class="card">${list.length ? `<div class="table-wrap"><table class="stack">
      <thead><tr><th>Student</th><th>Class</th><th>Month</th><th class="num">Total</th><th class="num">Paid</th><th class="num">Pending</th><th>Status</th><th style="text-align:right">Actions</th></tr></thead>
      <tbody>${list.map(x => {
        const s = getStudent(x.studentId);
        const st = feeStatus(x);
        const pending = Math.max(0, x.total - x.paid);
        return `<tr>
          <td data-label="Student"><strong style="font-weight:600">${esc(s ? s.name : 'Deleted student')}</strong><br><small class="muted">${esc(x.studentId)} · Roll ${esc(s ? s.roll : '—')}</small></td>
          <td data-label="Class"><span class="chip soft">${esc(className(x.classId))}</span></td>
          <td data-label="Month">${esc(x.month)}<br><small class="muted">due ${fmtDate(x.dueDate)}</small></td>
          <td class="num" data-label="Total">${money(x.total)}</td>
          <td class="num" data-label="Paid">${money(x.paid)}</td>
          <td class="num" data-label="Pending">${money(pending)}</td>
          <td data-label="Status"><span class="chip ${st === 'Paid' ? 'green' : st === 'Partial' ? 'amber' : 'red'}">${st}</span>
            <span class="progress ${st === 'Paid' ? 'green' : st === 'Partial' ? 'amber' : 'red'}" style="display:block;margin-top:.25rem"><i style="width:${pct(x.paid, x.total)}%"></i></span></td>
          <td data-label="Actions"><div class="row-actions">
            <button class="btn btn-soft btn-sm" data-action="fee-pay" data-id="${esc(x.id)}" ${pending === 0 ? 'disabled title="Nothing pending"' : ''}>Pay</button>
            <button class="icon-btn" data-action="fee-history" data-id="${esc(x.id)}" title="Payment history" aria-label="History">${icon('i-clock')}</button>
            <button class="icon-btn" data-action="fee-receipt" data-id="${esc(x.id)}" title="Print receipt" aria-label="Receipt">${icon('i-print')}</button>
            <button class="icon-btn" data-action="fee-edit" data-id="${esc(x.id)}" aria-label="Edit">${icon('i-pencil')}</button>
            <button class="icon-btn danger" data-action="fee-delete" data-id="${esc(x.id)}" aria-label="Delete">${icon('i-trash')}</button>
          </div></td></tr>`;
      }).join('')}</tbody></table></div>
      <p class="muted" style="font-size:.78rem;margin-top:.6rem">${icon('i-info')} All amounts are demo values. Nothing is charged and no payment gateway is connected.</p>`
      : emptyState('i-card', 'No fee records', 'Create a fee record for a student to start tracking demo payments.',
        '<button class="btn btn-primary" data-action="fee-add">' + icon('i-plus') + ' New fee record</button>')}</div>`;
}
function deleteFee(feeId) {
  const fee = DB.fees.find(f => f.id === feeId); if (!fee) return;
  const s = getStudent(fee.studentId);
  openConfirm({
    title: 'Delete fee record?',
    message: `The ${esc(fee.month)} record for <strong>${esc(s ? s.name : 'this student')}</strong> and its ${(fee.payments || []).length} payment entr${(fee.payments || []).length === 1 ? 'y' : 'ies'} will be deleted.`,
    confirmText: 'Delete record',
    onConfirm: () => {
      DB.fees = DB.fees.filter(f => f.id !== feeId);
      logActivity(`Fee record deleted (${fee.month})`, 'i-trash');
      saveDB(); toast('Fee record deleted.', 'success'); rerender();
    }
  });
}
function exportFeesCSV() {
  downloadCSV('fees-' + todayISO() + '.csv', [
    ['Record', 'Student ID', 'Student', 'Class', 'Month', 'Due date', 'Total', 'Paid', 'Pending', 'Status', 'Payments'],
    ...DB.fees.map(f => { const s = getStudent(f.studentId);
      return [f.id, f.studentId, s ? s.name : '', className(f.classId), f.month, f.dueDate, f.total, f.paid,
        Math.max(0, f.total - f.paid), feeStatus(f), (f.payments || []).map(p => `${p.date}:${p.amount}:${p.method}`).join(' | ')]; })
  ]);
}

/* ===================== 7j. HOMEWORK & RESOURCES ===================== */
function openHomeworkForm(existing) {
  openForm({
    title: existing ? 'Edit homework' : 'Assign homework',
    subtitle: 'Demo assignment record',
    fields: [
      { key: 'title', label: 'Title', required: true, span: true },
      { key: 'classId', label: 'Class', required: true, type: 'select', options: DB.classes.map(c => ({ value: c.id, label: className(c.id) })) },
      { key: 'subjectId', label: 'Subject', required: true, type: 'select', options: DB.subjects.map(s => ({ value: s.id, label: s.name })) },
      { key: 'teacherId', label: 'Assigned by', type: 'select', options: [{ value: '', label: 'Not specified' }, ...DB.teachers.map(t => ({ value: t.id, label: t.name }))] },
      { key: 'dueDate', label: 'Due date', required: true, type: 'date' },
      { key: 'status', label: 'Status', required: true, type: 'select', options: [{ value: 'Open', label: 'Open' }, { value: 'Closed', label: 'Closed' }] },
      { key: 'description', label: 'Description / instructions', type: 'textarea', span: true }
    ],
    values: existing || { dueDate: addDays(todayISO(), 3), status: 'Open', created: todayISO() },
    submitText: existing ? 'Save changes' : 'Assign homework',
    onSubmit: v => {
      const rec = { title: v.title.trim(), classId: v.classId, subjectId: v.subjectId, teacherId: v.teacherId, dueDate: v.dueDate, status: v.status, description: v.description.trim() };
      if (existing) { Object.assign(existing, rec); toast('Homework updated.', 'success'); }
      else { DB.homework.push({ id: uid(), ...rec, created: todayISO() }); logActivity(`Homework assigned: ${rec.title} (${className(rec.classId)})`, 'i-pencil'); toast('Homework assigned.', 'success'); }
      saveDB(); rerender();
    }
  });
}
function renderHomework() {
  const f = ui.homework, q = f.q.trim().toLowerCase();
  const today = todayISO();
  const list = DB.homework.filter(h => {
    const mq = !q || (h.title + ' ' + h.description).toLowerCase().includes(q);
    return mq && (!f.classId || h.classId === f.classId) && (!f.subjectId || h.subjectId === f.subjectId) && (!f.status || h.status === f.status);
  }).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const overdue = list.filter(h => h.status === 'Open' && h.dueDate < today).length;
  const soon = list.filter(h => h.status === 'Open' && h.dueDate >= today && dayDiff(today, h.dueDate) <= 7).length;
  $('#homeworkBody').innerHTML = `
    <div class="stat-grid">
      ${statCard({ label: 'Open assignments', value: list.filter(h => h.status === 'Open').length, sub: `${list.length} total`, icon: 'i-pencil', tone: 'indigo' })}
      ${statCard({ label: 'Due in 7 days', value: soon, sub: 'Needs attention', icon: 'i-clock', tone: 'blue' })}
      ${statCard({ label: 'Overdue', value: overdue, sub: 'Past due date', icon: 'i-alert', tone: 'red' })}
      ${statCard({ label: 'Closed', value: list.filter(h => h.status === 'Closed').length, sub: 'Completed records', icon: 'i-check', tone: 'green' })}
    </div>
    <div class="toolbar">
      <div class="field grow"><label for="hw-q">Search</label>
        <input type="search" id="hw-q" data-filter="homework.q" value="${esc(f.q)}" placeholder="Title or description…"></div>
      <div class="field"><label for="hw-class">Class</label>
        <select id="hw-class" data-filter="homework.classId"><option value="">All classes</option>
          ${DB.classes.map(c => `<option value="${c.id}" ${f.classId === c.id ? 'selected' : ''}>${esc(className(c.id))}</option>`).join('')}</select></div>
      <div class="field"><label for="hw-sub">Subject</label>
        <select id="hw-sub" data-filter="homework.subjectId"><option value="">All subjects</option>
          ${DB.subjects.map(s => `<option value="${s.id}" ${f.subjectId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="hw-status">Status</label>
        <select id="hw-status" data-filter="homework.status"><option value="">All</option>
          <option ${f.status === 'Open' ? 'selected' : ''}>Open</option><option ${f.status === 'Closed' ? 'selected' : ''}>Closed</option></select></div>
      <span class="result-count">${list.length} assignment${list.length === 1 ? '' : 's'}</span>
    </div>
    ${list.length ? `<div class="cards-grid">${list.map(h => {
      const diff = dayDiff(today, h.dueDate);
      const badge = h.status === 'Closed' ? '<span class="chip gray">Closed</span>'
        : diff < 0 ? `<span class="chip red">Overdue by ${Math.abs(diff)} day(s)</span>`
        : diff === 0 ? '<span class="chip amber">Due today</span>'
        : `<span class="chip blue">Due in ${diff} day(s)</span>`;
      return `<article class="profile-card">
        <div class="top"><span class="avatar" style="${avatarStyle(h.title)}">${icon('i-pencil')}</span>
          <div><h4>${esc(h.title)}</h4><small class="muted">${esc(className(h.classId))} · ${esc(subjectName(h.subjectId))}</small></div></div>
        <div class="tags">${badge}<span class="chip soft">${fmtDate(h.dueDate)}</span></div>
        <p style="font-size:.82rem;color:var(--muted)">${esc(h.description || 'No description provided.')}</p>
        <ul><li>${icon('i-cap')} ${esc(h.teacherId ? teacherName(h.teacherId) : 'Not specified')}</li>
          <li>${icon('i-cal')} Created ${fmtDate(h.created || today)}</li></ul>
        <div class="actions">
          <button class="btn btn-soft btn-sm" data-action="homework-toggle" data-id="${esc(h.id)}">${h.status === 'Open' ? icon('i-check') + ' Mark closed' : icon('i-refresh') + ' Reopen'}</button>
          <button class="icon-btn" data-action="homework-edit" data-id="${esc(h.id)}" aria-label="Edit">${icon('i-pencil')}</button>
          <button class="icon-btn danger" data-action="homework-delete" data-id="${esc(h.id)}" aria-label="Delete">${icon('i-trash')}</button>
        </div></article>`;
    }).join('')}</div>` : emptyState('i-pencil', 'No homework found', 'Assign homework to a class and subject, or clear the filters.',
      '<button class="btn btn-primary" data-action="homework-add">' + icon('i-plus') + ' Assign homework</button>')}`;
}
function deleteHomework(id) {
  const h = DB.homework.find(x => x.id === id); if (!h) return;
  openConfirm({ title: 'Delete homework?', message: `<strong>${esc(h.title)}</strong> (${esc(className(h.classId))}) will be removed.`,
    confirmText: 'Delete', onConfirm: () => { DB.homework = DB.homework.filter(x => x.id !== id); saveDB(); toast('Homework deleted.', 'success'); rerender(); } });
}
function openResourceForm(existing) {
  openForm({
    title: existing ? 'Edit resource' : 'Add study resource',
    subtitle: 'Links open in a new tab',
    fields: [
      { key: 'title', label: 'Title', required: true, span: true },
      { key: 'type', label: 'Type', required: true, type: 'select', options: ['Notes', 'Worksheet', 'Video', 'Link', 'Presentation'].map(t => ({ value: t, label: t })) },
      { key: 'subjectId', label: 'Subject', required: true, type: 'select', options: DB.subjects.map(s => ({ value: s.id, label: s.name })) },
      { key: 'classId', label: 'Class', type: 'select', options: [{ value: '', label: 'All classes' }, ...DB.classes.map(c => ({ value: c.id, label: className(c.id) }))] },
      { key: 'link', label: 'Link (http/https)', required: true, type: 'url', span: true, placeholder: 'https://example.org/resource' },
      { key: 'description', label: 'Description', type: 'textarea', span: true }
    ],
    values: existing || { type: 'Notes', added: todayISO() },
    submitText: existing ? 'Save changes' : 'Add resource',
    onSubmit: v => {
      const rec = { title: v.title.trim(), type: v.type, subjectId: v.subjectId, classId: v.classId, link: v.link.trim(), description: v.description.trim() };
      if (existing) Object.assign(existing, rec);
      else DB.resources.push({ id: uid(), ...rec, added: todayISO() });
      logActivity(`${existing ? 'Resource updated' : 'Resource added'}: ${rec.title}`, 'i-folder');
      saveDB(); toast('Study resource saved.', 'success'); rerender();
    }
  });
}
function renderResources() {
  const f = ui.resources, q = f.q.trim().toLowerCase();
  const list = DB.resources.filter(r => {
    const mq = !q || (r.title + ' ' + r.description).toLowerCase().includes(q);
    return mq && (!f.type || r.type === f.type) && (!f.subjectId || r.subjectId === f.subjectId);
  }).sort((a, b) => (b.added || '').localeCompare(a.added || ''));
  $('#resourcesBody').innerHTML = `
    <div class="toolbar">
      <div class="field grow"><label for="re-q">Search</label>
        <input type="search" id="re-q" data-filter="resources.q" value="${esc(f.q)}" placeholder="Title or description…"></div>
      <div class="field"><label for="re-type">Type</label>
        <select id="re-type" data-filter="resources.type"><option value="">All types</option>
          ${['Notes', 'Worksheet', 'Video', 'Link', 'Presentation'].map(t => `<option ${f.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="field"><label for="re-sub">Subject</label>
        <select id="re-sub" data-filter="resources.subjectId"><option value="">All subjects</option>
          ${DB.subjects.map(s => `<option value="${s.id}" ${f.subjectId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
      <span class="result-count">${list.length} resource${list.length === 1 ? '' : 's'}</span>
    </div>
    ${list.length ? `<div class="cards-grid">${list.map(r => `<article class="profile-card">
      <div class="top"><span class="avatar" style="${avatarStyle(r.title)}">${icon('i-folder')}</span>
        <div><h4>${esc(r.title)}</h4><small class="muted">${esc(r.type)} · ${esc(subjectName(r.subjectId))}</small></div></div>
      <div class="tags"><span class="chip purple">${esc(r.type)}</span><span class="chip soft">${esc(r.classId ? className(r.classId) : 'All classes')}</span></div>
      <p style="font-size:.82rem;color:var(--muted)">${esc(r.description || 'No description.')}</p>
      <ul><li>${icon('i-cal')} Added ${fmtDate(r.added || todayISO())}</li></ul>
      <div class="actions">
        <a class="btn btn-soft btn-sm" href="${esc(r.link)}" target="_blank" rel="noopener noreferrer">${icon('i-eye')} Open link</a>
        <button class="icon-btn" data-action="resource-edit" data-id="${esc(r.id)}" aria-label="Edit">${icon('i-pencil')}</button>
        <button class="icon-btn danger" data-action="resource-delete" data-id="${esc(r.id)}" aria-label="Delete">${icon('i-trash')}</button>
      </div></article>`).join('')}</div>`
      : emptyState('i-folder', 'No resources found', 'Add notes, worksheets or links for your students.',
        '<button class="btn btn-primary" data-action="resource-add">' + icon('i-plus') + ' Add resource</button>')}`;
}
function deleteResource(id) {
  const r = DB.resources.find(x => x.id === id); if (!r) return;
  openConfirm({ title: 'Delete resource?', message: `<strong>${esc(r.title)}</strong> will be removed from the library.`,
    confirmText: 'Delete', onConfirm: () => { DB.resources = DB.resources.filter(x => x.id !== id); saveDB(); toast('Resource deleted.', 'success'); rerender(); } });
}

/* ===================== 7k. TIMETABLE ===================== */
function openPeriodForm(existing) {
  const classId = existing ? existing.classId : (ui.timetable.classId || DB.classes[0].id);
  openForm({
    title: existing ? 'Edit timetable entry' : 'Add timetable entry',
    subtitle: 'Periods are shown in the weekly grid for the selected class',
    fields: [
      { key: 'classId', label: 'Class', required: true, type: 'select', options: DB.classes.map(c => ({ value: c.id, label: className(c.id) })) },
      { key: 'day', label: 'Day', required: true, type: 'select', options: DAYS.slice(1, 6).map(d => ({ value: d, label: d })) },
      { key: 'period', label: 'Period number', required: true, type: 'number', min: 1, max: 12 },
      { key: 'subjectId', label: 'Subject', required: true, type: 'select', options: DB.subjects.map(s => ({ value: s.id, label: s.name })) },
      { key: 'teacherId', label: 'Teacher', required: true, type: 'select', options: DB.teachers.map(t => ({ value: t.id, label: t.name })) },
      { key: 'startTime', label: 'Start time', required: true, type: 'time' },
      { key: 'endTime', label: 'End time', required: true, type: 'time',
        validate: (v, all) => (v && all.startTime && v <= all.startTime ? 'End time must be after the start time.' : '') },
      { key: 'room', label: 'Room', placeholder: 'Room 101' }
    ],
    values: existing || { classId, day: ui.timetable.day, period: 1, startTime: '08:00', endTime: '08:45' },
    submitText: existing ? 'Save changes' : 'Add period',
    onSubmit: v => {
      // prevent the same class having two subjects in the same slot
      const clash = DB.timetable.find(p => p.id !== (existing && existing.id) && p.classId === v.classId
        && p.day === v.day && Number(p.period) === Number(v.period));
      if (clash) {
        openConfirm({
          title: 'Slot already used',
          message: `${esc(className(v.classId))} already has ${esc(subjectName(clash.subjectId))} in period ${esc(v.period)} on ${esc(v.day)}. Replace it with this new entry?`,
          confirmText: 'Replace slot', danger: false,
          onConfirm: () => { DB.timetable = DB.timetable.filter(p => p.id !== clash.id); commitPeriod(v, existing); }
        });
        return;
      }
      commitPeriod(v, existing);
    }
  });
}
function commitPeriod(v, existing) {
  const rec = { classId: v.classId, day: v.day, period: Number(v.period), subjectId: v.subjectId,
    teacherId: v.teacherId, startTime: v.startTime, endTime: v.endTime, room: v.room.trim() };
  if (existing) { Object.assign(existing, rec); toast('Timetable entry updated.', 'success'); }
  else { DB.timetable.push({ id: uid(), ...rec }); toast('Timetable entry added.', 'success'); }
  ui.timetable.classId = v.classId; ui.timetable.day = v.day;
  logActivity(`${existing ? 'Timetable entry updated' : 'Timetable entry added'}: ${className(v.classId)} ${v.day} P${v.period}`, 'i-clock2');
  saveDB(); closeModal(); rerender();
}
function renderTimetable() {
  if (!ui.timetable.classId) ui.timetable.classId = DB.classes[0]?.id || '';
  const cid = ui.timetable.classId;
  const entries = DB.timetable.filter(p => p.classId === cid);
  const periodKeys = Array.from(new Set(entries.map(p => p.period))).sort((a, b) => a - b);
  const days = DAYS.slice(1, 6);
  $('#timetableBody').innerHTML = `
    <div class="toolbar">
      <div class="field"><label for="tt-class">Class</label>
        <select id="tt-class" data-filter="timetable.classId">
          ${DB.classes.map(c => `<option value="${c.id}" ${cid === c.id ? 'selected' : ''}>${esc(className(c.id))}</option>`).join('')}</select></div>
      <div class="day-tabs" role="tablist" aria-label="Day">
        <button class="${ui.timetable.day === 'Full week' ? 'active' : ''}" data-action="tt-day" data-day="Full week">Full week</button>
        ${days.map(d => `<button class="${ui.timetable.day === d ? 'active' : ''}" data-action="tt-day" data-day="${d}">${d.slice(0, 3)}</button>`).join('')}
      </div>
      <span class="result-count">${entries.length} period${entries.length === 1 ? '' : 's'} · class teacher ${esc(getClass(cid)?.teacherId ? teacherName(getClass(cid).teacherId) : 'not assigned')}</span>
    </div>
    <div class="card">
      <header class="card-head"><h3>Weekly timetable · ${esc(className(cid))}</h3>
        <button class="btn btn-primary btn-sm" data-action="period-add">${icon('i-plus')} Add period</button></header>
      ${entries.length ? `<div class="tt-grid"><table>
        <thead><tr><th>Period</th>${ui.timetable.day === 'Full week' ? days.map(d => `<th>${d}</th>`).join('') : `<th>${esc(ui.timetable.day)}</th>`}</tr></thead>
        <tbody>${periodKeys.map(p => {
          const sample = entries.find(e => e.period === p);
          const cols = ui.timetable.day === 'Full week' ? days : [ui.timetable.day];
          return `<tr><td data-label="Period"><strong>P${p}</strong><br><small class="muted">${esc(sample.startTime)}–${esc(sample.endTime)}</small></td>
            ${cols.map(day => {
              const e = entries.find(x => x.period === p && x.day === day);
              if (!e) return `<td data-label="${esc(day)}"><div class="tt-cell free">Free</div></td>`;
              return `<td data-label="${esc(day)}"><div class="tt-cell">
                <b>${esc(subjectName(e.subjectId))}</b>
                <small>${esc(teacherName(e.teacherId))}</small>
                <small>${esc(e.room || '')}</small>
                <span class="mini">
                  <button class="icon-btn" data-action="period-edit" data-id="${esc(e.id)}" aria-label="Edit period">${icon('i-pencil')}</button>
                  <button class="icon-btn danger" data-action="period-delete" data-id="${esc(e.id)}" aria-label="Delete period">${icon('i-trash')}</button>
                </span></div></td>`;
            }).join('')}</tr>`;
        }).join('')}</tbody></table></div>
      <p class="muted" style="font-size:.78rem;margin-top:.6rem">Hover a cell to reveal edit and delete controls. Saving two subjects in the same slot asks for confirmation and replaces the old entry.</p>`
        : emptyState('i-clock2', 'No periods scheduled', 'Add periods to build the weekly timetable for this class.',
          '<button class="btn btn-primary" data-action="period-add">' + icon('i-plus') + ' Add period</button>')}
    </div>`;
}
function printTimetable() {
  const cid = ui.timetable.classId;
  const entries = DB.timetable.filter(p => p.classId === cid);
  if (!entries.length) { toast('No periods to print for this class.', 'warn'); return; }
  const periods = Array.from(new Set(entries.map(p => p.period))).sort((a, b) => a - b);
  const days = DAYS.slice(1, 6);
  printSheet(`Timetable - ${className(cid)}`, `${sheetHeader('Weekly timetable')}
    <h2>${esc(className(cid))}</h2>
    <p class="muted">Class teacher: ${esc(getClass(cid)?.teacherId ? teacherName(getClass(cid).teacherId) : 'Not assigned')} · Session ${esc(DB.settings.session)}</p>
    <table><thead><tr><th>Period</th>${days.map(d => `<th>${d}</th>`).join('')}</tr></thead>
    <tbody>${periods.map(p => { const sample = entries.find(e => e.period === p);
      return `<tr><th>P${p} (${esc(sample.startTime)}–${esc(sample.endTime)})</th>
      ${days.map(d => { const e = entries.find(x => x.period === p && x.day === d);
        return `<td>${e ? esc(subjectName(e.subjectId)) + '<br><span style="font-size:10px">' + esc(teacherName(e.teacherId)) + '</span>' : '—'}</td>`; }).join('')}</tr>`; }).join('')}
    </tbody></table>`);
}

/* ===================== 7l. CALENDAR ===================== */
function openEventForm(existing, presetDate) {
  openForm({
    title: existing ? 'Edit calendar entry' : 'Add calendar entry',
    fields: [
      { key: 'title', label: 'Title', required: true, span: true },
      { key: 'type', label: 'Type', required: true, type: 'select', options: ['Event', 'Exam', 'Holiday'].map(t => ({ value: t, label: t })) },
      { key: 'date', label: 'Date', required: true, type: 'date' },
      { key: 'classId', label: 'Class (optional)', type: 'select', options: [{ value: '', label: 'Whole school' }, ...DB.classes.map(c => ({ value: c.id, label: className(c.id) }))] },
      { key: 'description', label: 'Description', type: 'textarea', span: true }
    ],
    values: existing || { type: 'Event', date: presetDate || todayISO() },
    submitText: existing ? 'Save changes' : 'Add entry',
    onSubmit: v => {
      const rec = { title: v.title.trim(), type: v.type, date: v.date, classId: v.classId, description: v.description.trim() };
      if (existing) { Object.assign(existing, rec); toast('Calendar entry updated.', 'success'); }
      else { DB.events.push({ id: uid(), ...rec }); logActivity(`Calendar entry added: ${rec.title} (${fmtDate(rec.date)})`, 'i-cal'); toast('Calendar entry added.', 'success'); }
      saveDB(); rerender();
    }
  });
}
function renderCalendar() {
  const { month, year } = ui.calendar;
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDow = first.getDay();
  const cells = Math.ceil((startDow + daysInMonth) / 7) * 7;
  const eventsByDate = {};
  DB.events.forEach(e => { (eventsByDate[e.date] = eventsByDate[e.date] || []).push(e); });
  const examsByDate = {};
  DB.exams.forEach(e => { (examsByDate[e.date] = examsByDate[e.date] || []).push(e); });
  let cellsHTML = DAYS_SHORT.map(d => `<div class="dow">${d}</div>`).join('');
  for (let i = 0; i < cells; i++) {
    const dayNum = i - startDow + 1;
    if (dayNum < 1 || dayNum > daysInMonth) {
      const other = new Date(year, month, dayNum);
      cellsHTML += `<div class="cal-day other"><span class="d">${other.getDate()}</span></div>`;
      continue;
    }
    const iso = `${year}-${pad2(month + 1)}-${pad2(dayNum)}`;
    const items = (eventsByDate[iso] || []).map(e => `<button class="ev ${e.type.toLowerCase()}" data-action="event-view" data-id="${esc(e.id)}" title="${esc(e.title)}">${esc(e.title)}</button>`).join('');
    const ex = (examsByDate[iso] || []).map(e => `<button class="ev exam" data-action="exam-marks" data-id="${esc(e.id)}" title="${esc(e.name)} · ${esc(className(e.classId))}">${esc(e.name)}</button>`).join('');
    cellsHTML += `<div class="cal-day ${iso === todayISO() ? 'today' : ''}">
      <span class="d">${dayNum}</span>${ex}${items}
      <button class="add-ev" data-action="event-add-date" data-date="${iso}">+ add</button></div>`;
  }
  const upcoming = DB.events.filter(e => e.date >= todayISO()).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
  $('#calendarBody').innerHTML = `
    <div class="grid-2" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr)">
      <article class="card">
        <div class="cal-head">
          <div style="display:flex;gap:.3rem">
            <button class="icon-btn" data-action="cal-prev" aria-label="Previous month">${icon('i-chevL')}</button>
            <button class="icon-btn" data-action="cal-next" aria-label="Next month">${icon('i-chevR')}</button>
          </div>
          <h3>${['January','February','March','April','May','June','July','August','September','October','November','December'][month]} ${year}</h3>
          <button class="btn btn-ghost btn-sm" data-action="cal-today">Today</button>
        </div>
        <div class="cal">${cellsHTML}</div>
        <div class="legend" style="margin-top:.7rem">
          <span><i style="background:#6366f1"></i>Event</span><span><i style="background:#ef4444"></i>Exam</span>
          <span><i style="background:#10b981"></i>Holiday</span><span class="muted">Click an entry to edit it, or “+ add” on any day.</span>
        </div>
      </article>
      <article class="card">
        <header class="card-head"><h3>Upcoming</h3>
          <button class="btn btn-soft btn-sm" data-action="event-add">${icon('i-plus')} Add</button></header>
        ${upcoming.length ? upcoming.map(e => `<div class="list-row">
          <div class="date-badge"><b>${Number(e.date.slice(8, 10))}</b><small>${MONTHS[Number(e.date.slice(5, 7)) - 1]}</small></div>
          <div style="flex:1;min-width:0"><h4>${esc(e.title)} <span class="chip ${e.type === 'Exam' ? 'red' : e.type === 'Holiday' ? 'green' : 'purple'}">${esc(e.type)}</span></h4>
            <p>${esc(e.description || '')} ${e.classId ? '· ' + esc(className(e.classId)) : ''}</p></div>
          <div class="row-actions">
            <button class="icon-btn" data-action="event-edit" data-id="${esc(e.id)}" aria-label="Edit">${icon('i-pencil')}</button>
            <button class="icon-btn danger" data-action="event-delete" data-id="${esc(e.id)}" aria-label="Delete">${icon('i-trash')}</button>
          </div></div>`).join('')
          : emptyState('i-cal', 'Nothing upcoming', 'No school events or exams are scheduled after today.')}
      </article>
    </div>`;
}

/* ===================== 7m. ANNOUNCEMENTS ===================== */
function openAnnouncementForm(existing) {
  openForm({
    title: existing ? 'Edit announcement' : 'New announcement',
    subtitle: 'Saving also creates an in-app notification in the bell menu',
    fields: [
      { key: 'title', label: 'Title', required: true, span: true },
      { key: 'category', label: 'Category', required: true, type: 'select', options: ['General', 'Academics', 'Exams', 'Fees', 'Event', 'Urgent'].map(c => ({ value: c, label: c })) },
      { key: 'audience', label: 'Audience', required: true, type: 'select', options: ['All', 'Students', 'Parents', 'Staff'].map(a => ({ value: a, label: a })) },
      { key: 'date', label: 'Date', required: true, type: 'date' },
      { key: 'pinned', label: 'Pin to the top of the notice board', type: 'switch' },
      { key: 'body', label: 'Message', required: true, type: 'textarea', span: true }
    ],
    values: existing || { date: todayISO(), category: 'General', audience: 'All' },
    submitText: existing ? 'Save changes' : 'Publish announcement',
    onSubmit: v => {
      const rec = { title: v.title.trim(), category: v.category, audience: v.audience, date: v.date, pinned: !!v.pinned, body: v.body.trim() };
      if (existing) { Object.assign(existing, rec); toast('Announcement updated.', 'success'); }
      else {
        DB.announcements.unshift({ id: uid(), ...rec });
        pushNotification('New announcement: ' + rec.title, rec.body.slice(0, 100), 'announcement');
        logActivity(`Announcement published: ${rec.title}`, 'i-mega');
        toast('Announcement published to the notice board.', 'success');
      }
      saveDB(); rerender();
    }
  });
}
function renderAnnouncements() {
  const f = ui.announce, q = f.q.trim().toLowerCase();
  const list = DB.announcements.filter(a => (!q || (a.title + ' ' + a.body).toLowerCase().includes(q)) && (!f.category || a.category === f.category))
    .sort((a, b) => (b.pinned - a.pinned) || b.date.localeCompare(a.date));
  const categories = Array.from(new Set(DB.announcements.map(a => a.category)));
  $('#announcementsBody').innerHTML = `
    <div class="alert info">${icon('i-info')}<span>Announcements are stored in this browser and shown in the bell menu as in-app demo notifications. No email, SMS or push message is sent.</span></div>
    <div class="toolbar">
      <div class="field grow"><label for="an-q">Search</label>
        <input type="search" id="an-q" data-filter="announce.q" value="${esc(f.q)}" placeholder="Search titles and messages…"></div>
      <div class="field"><label for="an-cat">Category</label>
        <select id="an-cat" data-filter="announce.category"><option value="">All categories</option>
          ${categories.map(c => `<option ${f.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
      <span class="result-count">${list.length} notice${list.length === 1 ? '' : 's'} · ${DB.notifications.filter(n => !n.read).length} unread notification(s)</span>
    </div>
    <div class="card">${list.length ? list.map(a => `
      <div class="list-row">
        <div class="date-badge"><b>${Number(a.date.slice(8, 10))}</b><small>${MONTHS[Number(a.date.slice(5, 7)) - 1]}</small></div>
        <div style="flex:1;min-width:0">
          <h4>${esc(a.title)} ${a.pinned ? `<span class="chip amber">${icon('i-star')} Pinned</span>` : ''}
            <span class="chip soft">${esc(a.category)}</span><span class="chip gray">${esc(a.audience)}</span></h4>
          <p>${esc(a.body)}</p>
          <small class="muted">Published ${fmtDate(a.date)} · notice board entry</small>
        </div>
        <div class="row-actions">
          <button class="icon-btn" data-action="announce-pin" data-id="${esc(a.id)}" title="${a.pinned ? 'Unpin' : 'Pin'}" aria-label="${a.pinned ? 'Unpin' : 'Pin'}">${icon('i-star')}</button>
          <button class="icon-btn" data-action="announce-edit" data-id="${esc(a.id)}" aria-label="Edit">${icon('i-pencil')}</button>
          <button class="icon-btn danger" data-action="announce-delete" data-id="${esc(a.id)}" aria-label="Delete">${icon('i-trash')}</button>
        </div>
      </div>`).join('') : emptyState('i-mega', 'No announcements', 'Publish an announcement to add it to the notice board.',
        '<button class="btn btn-primary" data-action="announce-add">' + icon('i-plus') + ' New announcement</button>')}</div>`;
}
function deleteAnnouncement(id) {
  const a = DB.announcements.find(x => x.id === id); if (!a) return;
  openConfirm({ title: 'Delete announcement?', message: `<strong>${esc(a.title)}</strong> will be removed from the notice board.`,
    confirmText: 'Delete', onConfirm: () => { DB.announcements = DB.announcements.filter(x => x.id !== id); saveDB(); toast('Announcement deleted.', 'success'); rerender(); } });
}

/* ===================== 7n. REPORTS ===================== */
const REPORT_TABS = [
  ['students', 'Student report'], ['attendance', 'Attendance report'], ['exams', 'Examination report'],
  ['fees', 'Fee report'], ['classes', 'Class summary']
];
function reportData() {
  const r = ui.reports;
  const from = r.from || addDays(todayISO(), -30);
  const to = r.to || todayISO();
  if (r.type === 'students') {
    const list = DB.students.filter(s => !r.classId || s.classId === r.classId);
    return {
      title: 'Student report', from, to,
      cards: [
        ['Total students', list.length, 'i-users', 'indigo'],
        ['Male / Female / Other', `${list.filter(s => s.gender === 'Male').length} / ${list.filter(s => s.gender === 'Female').length} / ${list.filter(s => s.gender === 'Other').length}`, 'i-users', 'purple'],
        ['Average attendance', (list.length ? Math.round(list.reduce((a, s) => a + studentAttendance(s.id).pct, 0) / list.length * 10) / 10 : 0) + '%', 'i-clip', 'green'],
        ['Below 75% attendance', list.filter(s => studentAttendance(s.id).pct < 75).length, 'i-alert', 'red']
      ],
      chart: { type: 'bar', labels: DB.classes.map(c => c.name.replace('Grade ', 'G') + c.section),
        values: DB.classes.map(c => DB.students.filter(s => s.classId === c.id && (!r.classId || c.id === r.classId)).length), color: '#6366f1' },
      head: ['ID', 'Student', 'Class', 'Roll', 'Gender', 'Attendance %', 'Pending fees'],
      rows: list.map(s => { const cls = getClass(s.classId);
        return [s.id, s.name, cls ? `${cls.name} - ${cls.section}` : '', s.roll, s.gender, studentAttendance(s.id).pct,
          money(DB.fees.filter(f => f.studentId === s.id).reduce((a, f) => a + Math.max(0, f.total - f.paid), 0))]; })
    };
  }
  if (r.type === 'attendance') {
    const recs = Object.values(DB.attendance).filter(x => (!r.classId || x.classId === r.classId) && x.date >= from && x.date <= to)
      .sort((a, b) => a.date.localeCompare(b.date));
    const rates = recs.map(x => pct(attendanceCounts(x).present + attendanceCounts(x).late, attendanceCounts(x).total));
    const avg = rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length * 10) / 10 : 0;
    const roster = DB.students.filter(s => !r.classId || s.classId === r.classId);
    return {
      title: 'Attendance report', from, to,
      cards: [
        ['Records in range', recs.length, 'i-clip', 'indigo'],
        ['Average rate', avg + '%', 'i-check', 'green'],
        ['Students covered', roster.length, 'i-users', 'purple'],
        ['Below 75% average', roster.filter(s => studentAttendance(s.id).pct < 75).length, 'i-alert', 'red']
      ],
      chart: { type: 'line', labels: recs.slice(-10).map(x => x.date.slice(8, 10) + '/' + x.date.slice(5, 7)),
        values: rates.slice(-10), color: '#10b981' },
      head: ['Student ID', 'Student', 'Class', 'Present', 'Absent', 'Late', 'Leave', 'Attendance %'],
      rows: roster.map(s => {
        let p = 0, a = 0, l = 0, lv = 0;
        recs.forEach(x => { const st = x.records[s.id]; if (st === 'present') p++; else if (st === 'absent') a++; else if (st === 'late') l++; else if (st === 'leave') lv++; });
        return [s.id, s.name, className(s.classId), p, a, l, lv, pct(p + l, p + a + l + lv)];
      }).sort((x, y) => x[7] - y[7])
    };
  }
  if (r.type === 'exams') {
    const exams = DB.exams.filter(e => !r.classId || e.classId === r.classId).sort((a, b) => b.date.localeCompare(a.date));
    const marked = exams.filter(e => Object.keys(DB.marks[e.id] || {}).length);
    const stats = exams.map(e => {
      const rows = examResults(e);
      const done = rows.filter(x => x.entered);
      const passed = rows.filter(x => x.complete && x.passed).length;
      return { e, avg: done.length ? Math.round(done.reduce((a, x) => a + x.percentage, 0) / done.length * 10) / 10 : 0,
        passRate: done.length ? pct(passed, done.length) : 0, appeared: done.length };
    });
    return {
      title: 'Examination report', from, to,
      cards: [
        ['Examinations', exams.length, 'i-file', 'indigo'],
        ['With marks entered', marked.length, 'i-pencil', 'purple'],
        ['Best class average', stats.length ? Math.max(...stats.map(s => s.avg)) + '%' : '0%', 'i-chart', 'green'],
        ['Lowest class average', stats.length ? Math.min(...stats.map(s => s.avg)) + '%' : '0%', 'i-alert', 'red']
      ],
      chart: { type: 'bar', labels: stats.map(s => className(s.e.classId).replace('Grade ', 'G') + ' ' + s.e.term),
        values: stats.map(s => s.avg), color: '#8b5cf6' },
      head: ['Examination', 'Class', 'Date', 'Term', 'Subjects', 'Max total', 'Students', 'Average %', 'Pass rate %'],
      rows: stats.map(s => [s.e.name, className(s.e.classId), fmtDate(s.e.date), s.e.term, s.e.subjects.length,
        s.e.subjects.reduce((a, x) => a + x.maxMarks, 0), s.appeared, s.avg, s.passRate])
    };
  }
  if (r.type === 'fees') {
    const fees = DB.fees.filter(f => (!r.classId || f.classId === r.classId) && (!r.month || f.month === r.month));
    const t = fees.reduce((a, f) => ({ total: a.total + f.total, paid: a.paid + f.paid }), { total: 0, paid: 0 });
    const perClass = DB.classes.map(c => {
      const rows = fees.filter(f => f.classId === c.id);
      const total = rows.reduce((a, f) => a + f.total, 0), paid = rows.reduce((a, f) => a + f.paid, 0);
      return { c, total, paid, pending: total - paid };
    });
    return {
      title: 'Fee report (demo)', from, to,
      cards: [
        ['Billed', money(t.total), 'i-card', 'indigo'],
        ['Collected', money(t.paid), 'i-check', 'green'],
        ['Pending', money(t.total - t.paid), 'i-clock', 'amber'],
        ['Records', fees.length, 'i-users', 'purple']
      ],
      chart: { type: 'bar', labels: perClass.map(x => x.c.name.replace('Grade ', 'G') + x.c.section),
        values: perClass.map(x => x.paid), color: '#10b981' },
      head: ['Class', 'Records', 'Billed', 'Collected', 'Pending', 'Collection %'],
      rows: perClass.map(x => [className(x.c.id), fees.filter(f => f.classId === x.c.id).length, money(x.total), money(x.paid), money(x.pending), pct(x.paid, x.total) + '%'])
    };
  }
  // class summary
  const perClass = DB.classes.map(c => {
    const roster = DB.students.filter(s => s.classId === c.id);
    const fees = DB.fees.filter(f => f.classId === c.id);
    const days = Object.values(DB.attendance).filter(x => x.classId === c.id);
    const rate = days.length ? Math.round(days.reduce((a, x) => a + attendancePct(x.date, c.id), 0) / days.length * 10) / 10 : 0;
    return [className(c.id), c.teacherId ? teacherName(c.teacherId) : '—', roster.length, c.capacity || 0, pct(roster.length, c.capacity || 1) + '%',
      rate + '%', DB.subjects.filter(s => s.classIds.includes(c.id)).length,
      DB.timetable.filter(p => p.classId === c.id).length,
      money(fees.reduce((a, f) => a + Math.max(0, f.total - f.paid), 0))];
  });
  return {
    title: 'Class summary', from, to,
    cards: [
      ['Classes', DB.classes.length, 'i-layers', 'indigo'],
      ['Students', DB.students.length, 'i-users', 'purple'],
      ['Timetable slots', DB.timetable.length, 'i-clock2', 'blue'],
      ['Demo fees pending', money(DB.fees.reduce((a, f) => a + Math.max(0, f.total - f.paid), 0)), 'i-card', 'amber']
    ],
    chart: { type: 'bar', labels: DB.classes.map(c => c.name.replace('Grade ', 'G') + c.section),
      values: DB.classes.map(c => Math.round(Object.values(DB.attendance).filter(x => x.classId === c.id)
        .reduce((a, x) => a + attendancePct(x.date, c.id), 0) / Math.max(1, Object.values(DB.attendance).filter(x => x.classId === c.id).length))), color: '#2563eb' },
    head: ['Class', 'Class teacher', 'Students', 'Capacity', 'Fill %', 'Avg attendance', 'Subjects', 'Periods', 'Pending fees'],
    rows: perClass
  };
}
function renderReports() {
  const r = ui.reports;
  const data = reportData();
  $('#reportsBody').innerHTML = `
    <div class="report-tabs" role="tablist">
      ${REPORT_TABS.map(([k, label]) => `<button class="${r.type === k ? 'active' : ''}" data-action="report-tab" data-type="${k}" role="tab" aria-selected="${r.type === k}">${label}</button>`).join('')}
    </div>
    <div class="toolbar">
      <div class="field"><label for="rp-class">Class filter</label>
        <select id="rp-class" data-filter="reports.classId"><option value="">All classes</option>
          ${DB.classes.map(c => `<option value="${c.id}" ${r.classId === c.id ? 'selected' : ''}>${esc(className(c.id))}</option>`).join('')}</select></div>
      ${r.type === 'fees' ? `<div class="field"><label for="rp-month">Month</label>
        <select id="rp-month" data-filter="reports.month"><option value="">All months</option>
          ${Array.from(new Set(DB.fees.map(f => f.month))).sort().reverse().map(m => `<option ${r.month === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></div>` : ''}
      <div class="field"><label for="rp-from">From</label><input type="date" id="rp-from" data-filter="reports.from" value="${esc(r.from || '')}"></div>
      <div class="field"><label for="rp-to">To</label><input type="date" id="rp-to" data-filter="reports.to" value="${esc(r.to || '')}"></div>
      <button class="btn btn-ghost btn-sm" data-action="report-clear">${icon('i-refresh')} Clear</button>
      <span class="result-count">Built from ${DB.students.length} students · ${Object.keys(DB.attendance).length} attendance records</span>
    </div>
    <div class="stat-grid">${data.cards.map(([label, value, ic, tone]) => statCard({ label, value, icon: ic, tone })).join('')}</div>
    <div class="grid-2">
      <article class="card"><header class="card-head"><h3>${esc(data.title)} chart</h3></header>
        <div class="chart-wrap"><canvas id="chartReport"></canvas></div></article>
      <article class="card"><header class="card-head"><h3>Summary</h3>
        <span class="chip soft">${esc(r.from ? fmtDate(r.from) + ' → ' + fmtDate(r.to || todayISO()) : 'All saved records')}</span></header>
        <div class="table-wrap"><table style="min-width:0"><thead><tr><th>Metric</th><th class="num">Value</th></tr></thead>
          <tbody>${data.head.map((h, i) => `<tr><td>${esc(h)}</td><td class="num" style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(String(data.rows[0]?.[i] ?? '—'))}</td></tr>`).join('')}</tbody></table></div>
        <p class="muted" style="font-size:.75rem;margin-top:.5rem">First row preview — open the full table below or export to CSV for everything.</p>
      </article>
    </div>
    <div class="card"><header class="card-head"><h3>Detail table</h3><span class="chip gray">${data.rows.length} row(s)</span></header>
      ${data.rows.length ? `<div class="table-wrap"><table class="stack"><thead><tr>${data.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${data.rows.map(row => `<tr>${row.map((cell, i) => `<td data-label="${esc(data.head[i])}">${esc(String(cell))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
        : emptyState('i-chart', 'No data for these filters', 'Widen the date range or clear the class filter.')}</div>`;
  if (data.chart.type === 'line') Charts.line($('#chartReport'), data.chart.labels, data.chart.values, { color: data.chart.color, suffix: '%' });
  else Charts.bar($('#chartReport'), data.chart.labels, data.chart.values, { color: data.chart.color });
  ui._reportData = data;
}
function exportReport() {
  const d = ui._reportData || reportData();
  if (!d.rows.length) { toast('Nothing to export for these filters.', 'warn'); return; }
  downloadCSV(`${ui.reports.type}-report-${todayISO()}.csv`, [d.head, ...d.rows]);
}
function printReport() {
  const d = ui._reportData || reportData();
  printSheet(d.title, `${sheetHeader(d.title)}
    <h2>${esc(d.title)}</h2>
    <p class="muted">Filters: class ${esc(ui.reports.classId ? className(ui.reports.classId) : 'all')} · range ${esc(ui.reports.from ? fmtDate(ui.reports.from) : 'start')} → ${esc(fmtDate(ui.reports.to || todayISO()))}</p>
    <div class="cards">${d.cards.map(c => `<div class="pcard"><b>${esc(String(c[1]))}</b><small>${esc(c[0])}</small></div>`).join('')}</div>
    <table><thead><tr>${d.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${d.rows.map(r => `<tr>${r.map(c => `<td>${esc(String(c))}</td>`).join('')}</tr>`).join('')}</tbody></table>
    <p class="muted">Generated from demo data on ${fmtDate(todayISO())}. Front-end demo — no backend involved.</p>`);
}

/* ===================== 7o. SETTINGS & PROFILE ===================== */
function renderSettings() {
  const s = DB.settings;
  $('#settingsBody').innerHTML = `
    <div class="alert info">${icon('i-info')}<span><strong>What this demo can and cannot do.</strong> Everything you see runs in your browser: records are saved in localStorage, print/CSV use your real data, and navigation, forms and validation are genuine. There is <strong>no server, no login security, no multi-user sync, no email/SMS/push delivery and no payment processing</strong>. Real school deployment needs a secure backend, database, server-side authentication, role-based permissions and backups.</span></div>
    <div class="settings-grid">
      <article class="card">
        <header class="card-head"><h3>School branding</h3></header>
        <div class="logo-preview"><span class="brand-logo" id="settingsLogo">${esc(s.logoText)}</span>
          <div><strong>${esc(s.schoolName)}</strong><br><small class="muted">Session ${esc(s.session)}</small></div></div>
        <div class="form-grid" style="margin-top:.9rem">
          <div class="field span-2"><label for="set-name">School name</label><input id="set-name" value="${esc(s.schoolName)}"></div>
          <div class="field"><label for="set-logo">Logo initials (1–3 chars)</label><input id="set-logo" maxlength="3" value="${esc(s.logoText)}"></div>
          <div class="field"><label for="set-session">Academic session</label><input id="set-session" value="${esc(s.session)}"></div>
          <div class="field"><label for="set-principal">Principal / account name</label><input id="set-principal" value="${esc(s.principal)}"></div>
          <div class="field"><label for="set-phone">Phone</label><input id="set-phone" value="${esc(s.phone)}"></div>
          <div class="field span-2"><label for="set-address">Address</label><input id="set-address" value="${esc(s.address)}"></div>
          <div class="field span-2"><label for="set-email">Contact email</label><input id="set-email" type="email" value="${esc(s.email)}"></div>
        </div>
        <button class="btn btn-primary" data-action="settings-save">${icon('i-save')} Save branding</button>
      </article>

      <div style="display:flex;flex-direction:column;gap:1.15rem">
        <article class="card">
          <header class="card-head"><h3>Appearance &amp; preferences</h3></header>
          <div class="field"><label for="set-theme">Theme</label>
            <select id="set-theme" data-filter="settings.theme">
              <option value="light" ${s.theme === 'light' ? 'selected' : ''}>Light</option>
              <option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>Dark</option></select></div>
          <label class="switch"><span><strong style="font-size:.86rem">Animations</strong><br><small class="help">Smooth page and panel transitions</small></span>
            <input type="checkbox" data-action="settings-switch" data-key="animations" ${s.animations ? 'checked' : ''}><span class="switch-track"></span></label>
          <label class="switch"><span><strong style="font-size:.86rem">Compact tables</strong><br><small class="help">Smaller row padding in tables</small></span>
            <input type="checkbox" data-action="settings-switch" data-key="denseTables" ${s.denseTables ? 'checked' : ''}><span class="switch-track"></span></label>
          <label class="switch"><span><strong style="font-size:.86rem">Show demo banner</strong><br><small class="help">Remind users this is sample data</small></span>
            <input type="checkbox" data-action="settings-switch" data-key="showDemoBanner" ${s.showDemoBanner ? 'checked' : ''}><span class="switch-track"></span></label>
          <div class="form-grid" style="margin-top:.7rem">
            <div class="field"><label for="set-size">Rows per page</label>
              <select id="set-size" data-filter="settings.pageSize">${[8, 12, 20, 50].map(n => `<option value="${n}" ${Number(s.pageSize) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
            <div class="field"><label for="set-pass">Pass mark (%)</label>
              <input type="number" id="set-pass" min="10" max="90" value="${esc(s.passMark)}"></div>
          </div>
          <button class="btn btn-primary" data-action="settings-prefs">${icon('i-save')} Save preferences</button>
        </article>

        <article class="card">
          <header class="card-head"><h3>Demo data</h3></header>
          <p class="muted" style="font-size:.83rem;margin-bottom:.8rem">Your records live in this browser only (localStorage). Use the buttons below to back them up, restore a backup, or start again with fresh sample data.</p>
          <div style="display:flex;gap:.5rem;flex-wrap:wrap">
            <button class="btn btn-ghost" data-action="export-all">${icon('i-down')} Download backup (JSON)</button>
            <button class="btn btn-ghost" data-action="import-json">${icon('i-folder')} Restore backup</button>
            <button class="btn btn-danger" data-action="reset-demo">${icon('i-refresh')} Reset demo data</button>
          </div>
          <input type="file" id="importFile" accept="application/json" hidden>
          <div class="alert warn" style="margin-top:.9rem">${icon('i-alert')}<span><strong>Reset</strong> replaces every record with the original sample data set. Export a backup first if you want to keep your entries.</span></div>
        </article>

        <article class="card">
          <header class="card-head"><h3>Storage &amp; privacy notes</h3></header>
          <ul style="margin:0;padding-left:1.1rem;font-size:.83rem;color:var(--muted);display:flex;flex-direction:column;gap:.35rem">
            <li>localStorage keeps data per browser and per device — records are never shared between users.</li>
            <li>Do not store real student personal data here; there is no encryption or access control.</li>
            <li>The profile menu is decorative: it is not a secure login and offers no authentication.</li>
            <li>Notifications are in-app only. Fees are demo entries. No money moves.</li>
          </ul>
        </article>
      </div>
    </div>`;
}
function renderProfile() {
  const s = DB.settings;
  $('#profileBody').innerHTML = `
    <div class="grid-2">
      <article class="card">
        <div class="profile-card" style="box-shadow:none;border:none;padding:0">
          <div class="top"><span class="avatar" style="${avatarStyle(s.principal)}">${esc(initials(s.principal || 'AD'))}</span>
            <div><h4>${esc(s.principal || 'Admin Demo')}</h4><small class="muted">Administrator · demo account</small></div></div>
        </div>
        <div class="alert warn" style="margin-top:1rem">${icon('i-alert')}<span>This is <strong>not a login system</strong>. There is no password, no session and no server-side authentication. Anyone using this browser can see and edit the demo data.</span></div>
        <ul style="margin:1rem 0 0;padding-left:1.1rem;font-size:.85rem;color:var(--muted);display:flex;flex-direction:column;gap:.35rem">
          <li>Signed in as: demo administrator (front-end only)</li>
          <li>School: ${esc(s.schoolName)}</li>
          <li>Session: ${esc(s.session)}</li>
          <li>Storage: localStorage key <code>${STORAGE_KEY}</code></li>
        </ul>
      </article>
      <article class="card">
        <header class="card-head"><h3>Current demo data set</h3></header>
        <div class="att-summary">
          <div class="box"><b>${DB.students.length}</b><small>Students</small></div>
          <div class="box"><b>${DB.teachers.length}</b><small>Teachers</small></div>
          <div class="box"><b>${DB.classes.length}</b><small>Classes</small></div>
          <div class="box"><b>${DB.subjects.length}</b><small>Subjects</small></div>
          <div class="box"><b>${DB.exams.length}</b><small>Exams</small></div>
          <div class="box"><b>${Object.keys(DB.attendance).length}</b><small>Attendance days</small></div>
          <div class="box"><b>${DB.fees.length}</b><small>Fee records</small></div>
          <div class="box"><b>${DB.announcements.length}</b><small>Notices</small></div>
        </div>
        <button class="btn btn-ghost btn-block" style="margin-top:.9rem" data-action="export-all">${icon('i-down')} Download a JSON backup</button>
      </article>
    </div>`;
}
function saveBranding() {
  const name = $('#set-name').value.trim();
  const logo = $('#set-logo').value.trim();
  const email = $('#set-email').value.trim();
  if (!name) { toast('School name cannot be empty.', 'error'); return; }
  if (!/^[A-Za-z0-9&.\- ]{1,3}$/.test(logo)) { toast('Logo initials must be 1–3 letters, numbers or dashes.', 'error'); return; }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { toast('Enter a valid contact email.', 'error'); return; }
  Object.assign(DB.settings, {
    schoolName: name, logoText: logo.toUpperCase(), session: $('#set-session').value.trim(),
    principal: $('#set-principal').value.trim(), phone: $('#set-phone').value.trim(),
    address: $('#set-address').value.trim(), email
  });
  saveDB(); applyBranding(); toast('Branding saved.', 'success'); rerender();
}
function savePrefs() {
  const pass = Number($('#set-pass').value);
  if (!(pass >= 10 && pass <= 90)) { toast('Pass mark must be between 10 and 90.', 'error'); return; }
  DB.settings.passMark = pass;
  DB.settings.pageSize = Number($('#set-size').value) || 8;
  DB.settings.theme = $('#set-theme').value;
  saveDB(); applyTheme(DB.settings.theme);
  toast('Preferences saved.', 'success'); rerender();
}
function resetDemo() {
  openConfirm({
    title: 'Reset all demo data?',
    message: 'Every student, teacher, attendance, exam, fee, homework and announcement record you created will be replaced with the original sample data. This cannot be undone.',
    confirmText: 'Reset demo data',
    onConfirm: () => {
      const theme = DB.settings.theme;
      DB = buildSeedData();
      DB.settings.theme = theme;
      saveDB();
      Object.keys(ui).forEach(k => { if (typeof ui[k] === 'object' && !Array.isArray(ui[k])) Object.keys(ui[k]).forEach(key => { if (key !== 'view' && key !== 'sort' && key !== 'dir') delete ui[k][key]; }); });
      ui.attendance.date = todayISO();
      applyBranding(); renderNotifications(); navigate('dashboard', { updateHash: false });
      toast('Demo data has been reset to the original sample set.', 'success');
    }
  });
}

/* ===================== 8. EVENT DELEGATION & BOOT ===================== */
function setPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
  cur[parts[parts.length - 1]] = value;
}
const PAGINATED = ['students.q', 'students.classId', 'students.gender', 'settings.pageSize', 'teachers.q', 'teachers.subjectId',
  'results.q', 'fees.q', 'homework.q', 'resources.q', 'announce.q', 'subjects.q', 'classes.q', 'exams.q'];
function applyFilter(path, value) {
  // remember focus so typing in a search box keeps the caret after re-render
  const active = document.activeElement;
  const activeId = active && active.id;
  setPath(ui, path, value);
  if (PAGINATED.includes(path)) ui.students.page = 1;
  if (path === 'settings.theme') { applyTheme(value); return; }
  if (path === 'settings.pageSize') {          // rows-per-page lives in the saved settings
    DB.settings.pageSize = Number(value) || 8;
    saveDB(); rerender(); return;
  }
  if (path === 'attendance.classId' || path === 'attendance.date') { ui.attendance._loadedFor = ''; }
  if (path === 'timetable.classId') ui.timetable.day = 'Full week';
  rerender();
  if (activeId) {
    const again = document.getElementById(activeId);
    if (again) {
      again.focus();
      const end = again.value ? again.value.length : 0;
      try { again.setSelectionRange(end, end); } catch (err) { /* not a text control */ }
    }
  }
}
const ACTIONS = {
  /* students */
  'student-add': () => openStudentForm(null),
  'student-edit': el => { closeModal(); openStudentForm(getStudent(el.dataset.id)); },
  'student-view': el => viewStudent(el.dataset.id),
  'student-delete': el => deleteStudent(el.dataset.id),
  'export-students': () => exportStudentsCSV(),
  'students-view': el => { ui.students.view = el.dataset.view; renderStudents(); },
  'students-sort': el => { const k = el.dataset.key; ui.students.dir = ui.students.sort === k ? -ui.students.dir : 1; ui.students.sort = k; renderStudents(); },
  'students-page': el => { ui.students.page = Number(el.dataset.page); renderStudents(); },
  'students-clear': () => { ui.students = { q: '', classId: '', gender: '', sort: 'name', dir: 1, page: 1, view: ui.students.view }; renderStudents(); },
  /* teachers */
  'teacher-add': () => openTeacherForm(null),
  'teacher-edit': el => openTeacherForm(getTeacher(el.dataset.id)),
  'teacher-delete': el => deleteTeacher(el.dataset.id),
  'export-teachers': () => downloadCSV('teachers-' + todayISO() + '.csv', [
    ['ID', 'Name', 'Gender', 'Qualification', 'Subjects', 'Classes', 'Email', 'Phone', 'Joined', 'Experience'],
    ...DB.teachers.map(t => [t.id, t.name, t.gender, t.qualification || '', t.subjectIds.map(subjectName).join(' | '),
      t.classIds.map(className).join(' | '), t.email, t.phone, t.joiningDate, t.experience])]),
  'teachers-view': el => { ui.teachers.view = el.dataset.view; renderTeachers(); },
  'teachers-sort': el => { const k = el.dataset.key; ui.teachers.dir = ui.teachers.sort === k ? -ui.teachers.dir : 1; ui.teachers.sort = k; renderTeachers(); },
  /* attendance */
  'att-today': () => { ui.attendance.date = todayISO(); ui.attendance._loadedFor = ''; renderAttendance(); },
  'att-prev': () => { ui.attendance.date = addDays(ui.attendance.date, -1); ui.attendance._loadedFor = ''; renderAttendance(); },
  'att-next': () => { ui.attendance.date = addDays(ui.attendance.date, 1); ui.attendance._loadedFor = ''; renderAttendance(); },
  'att-set': el => { ui.attendance.draft[el.dataset.id] = el.dataset.s; renderAttendance(); },
  'att-all-present': () => { Object.keys(ui.attendance.draft).forEach(id => { ui.attendance.draft[id] = 'present'; }); renderAttendance(); },
  'att-clear': () => { Object.keys(ui.attendance.draft).forEach(id => { ui.attendance.draft[id] = ''; }); renderAttendance(); },
  'att-save': () => saveAttendance(),
  'att-edit': el => { ui.attendance.date = el.dataset.date; ui.attendance.classId = el.dataset.id; ui.attendance._loadedFor = ''; toast('Loaded the saved record into the marking sheet.', 'info'); renderAttendance(); },
  'att-delete': el => openConfirm({ title: 'Delete attendance record?', message: `The record for <strong>${esc(className(el.dataset.id))}</strong> on ${fmtDate(el.dataset.date)} will be deleted.`, confirmText: 'Delete record',
    onConfirm: () => { delete DB.attendance[`${el.dataset.date}|${el.dataset.id}`]; saveDB(); toast('Attendance record deleted.', 'success'); renderAttendance(); } }),
  'att-history-clear': () => { ui.attendance.historyClass = ''; ui.attendance.historyFrom = ''; ui.attendance.historyTo = ''; renderAttendance(); },
  'export-attendance': () => exportAttendanceCSV(),
  /* exams */
  'exam-add': () => openExamForm(null),
  'exam-edit': el => openExamForm(getExam(el.dataset.id)),
  'exam-delete': el => deleteExam(el.dataset.id),
  'exam-marks': el => { ui.exams.entryExamId = el.dataset.id; renderExams(); },
  'exam-back': () => { ui.exams.entryExamId = ''; renderExams(); },
  'exam-row-add': () => { const box = $('#examRows'); box.insertAdjacentHTML('beforeend', subjectRowHTML({ subjectId: '', maxMarks: 100, examDate: todayISO() }, box.children.length)); },
  'exam-row-remove': el => el.closest('[data-exam-row]').remove(),
  'marks-save': () => saveMarks(),
  'marks-clear': () => openConfirm({ title: 'Clear all marks?', message: 'Every score entered for this examination will be removed.', confirmText: 'Clear marks',
    onConfirm: () => { const exam = getExam(ui.exams.entryExamId); delete DB.marks[exam.id]; saveDB(); toast('Marks cleared.', 'success'); renderMarksEntry(); } }),
  /* results */
  'results-dir': () => { ui.results.dir = -ui.results.dir; renderResults(); },
  'result-card': el => showResultCard(el.dataset.id),
  'export-results': () => exportResultsCSV(),
  'print-results': () => printResultsReport(),
  /* classes & subjects */
  'class-add': () => openClassForm(null),
  'class-edit': el => { closeModal(); openClassForm(getClass(el.dataset.id)); },
  'class-delete': el => deleteClass(el.dataset.id),
  'class-students': el => viewClassStudents(el.dataset.id),
  'subject-add': () => openSubjectForm(null),
  'subject-edit': el => openSubjectForm(getSubject(el.dataset.id)),
  'subject-delete': el => deleteSubject(el.dataset.id),
  /* fees */
  'fee-add': () => openFeeForm(null),
  'fee-edit': el => openFeeForm(DB.fees.find(f => f.id === el.dataset.id)),
  'fee-delete': el => deleteFee(el.dataset.id),
  'fee-pay': el => { closeModal(); openPaymentModal(el.dataset.id); },
  'fee-history': el => feeHistoryModal(el.dataset.id),
  'fee-receipt': el => printFeeReceipt(el.dataset.id),
  'payment-delete': el => deletePayment(el.dataset.id, el.dataset.pay),
  'export-fees': () => exportFeesCSV(),
  /* homework & resources */
  'homework-add': () => openHomeworkForm(null),
  'homework-edit': el => openHomeworkForm(DB.homework.find(h => h.id === el.dataset.id)),
  'homework-delete': el => deleteHomework(el.dataset.id),
  'homework-toggle': el => { const h = DB.homework.find(x => x.id === el.dataset.id); h.status = h.status === 'Open' ? 'Closed' : 'Open'; saveDB(); toast(`Assignment marked ${h.status.toLowerCase()}.`, 'success'); renderHomework(); },
  'resource-add': () => openResourceForm(null),
  'resource-edit': el => openResourceForm(DB.resources.find(r => r.id === el.dataset.id)),
  'resource-delete': el => deleteResource(el.dataset.id),
  /* timetable */
  'period-add': () => openPeriodForm(null),
  'period-edit': el => openPeriodForm(DB.timetable.find(p => p.id === el.dataset.id)),
  'period-delete': el => openConfirm({ title: 'Delete period?', message: 'This timetable slot will be removed.', confirmText: 'Delete',
    onConfirm: () => { DB.timetable = DB.timetable.filter(p => p.id !== el.dataset.id); saveDB(); toast('Period removed.', 'success'); renderTimetable(); } }),
  'tt-day': el => { ui.timetable.day = el.dataset.day; renderTimetable(); },
  'print-timetable': () => printTimetable(),
  /* calendar */
  'event-add': () => openEventForm(null),
  'event-add-date': el => openEventForm(null, el.dataset.date),
  'event-edit': el => openEventForm(DB.events.find(e => e.id === el.dataset.id)),
  'event-view': el => openEventForm(DB.events.find(e => e.id === el.dataset.id)),
  'event-delete': el => openConfirm({ title: 'Delete calendar entry?', message: `<strong>${esc((DB.events.find(e => e.id === el.dataset.id) || {}).title || '')}</strong> will be removed.`, confirmText: 'Delete',
    onConfirm: () => { DB.events = DB.events.filter(e => e.id !== el.dataset.id); saveDB(); toast('Calendar entry deleted.', 'success'); renderCalendar(); } }),
  'cal-prev': () => { const d = new Date(ui.calendar.year, ui.calendar.month - 1, 1); ui.calendar.month = d.getMonth(); ui.calendar.year = d.getFullYear(); renderCalendar(); },
  'cal-next': () => { const d = new Date(ui.calendar.year, ui.calendar.month + 1, 1); ui.calendar.month = d.getMonth(); ui.calendar.year = d.getFullYear(); renderCalendar(); },
  'cal-today': () => { const n = new Date(); ui.calendar.month = n.getMonth(); ui.calendar.year = n.getFullYear(); renderCalendar(); },
  /* announcements & notifications */
  'announce-add': () => openAnnouncementForm(null),
  'announce-edit': el => openAnnouncementForm(DB.announcements.find(a => a.id === el.dataset.id)),
  'announce-delete': el => deleteAnnouncement(el.dataset.id),
  'announce-pin': el => { const a = DB.announcements.find(x => x.id === el.dataset.id); a.pinned = !a.pinned; saveDB(); toast(a.pinned ? 'Pinned to the notice board.' : 'Unpinned.', 'success'); renderAnnouncements(); },
  'notif-read': el => { const n = DB.notifications.find(x => x.id === el.dataset.id); if (n) n.read = true; saveDB(); renderNotifications(); },
  'notif-read-all': () => { DB.notifications.forEach(n => { n.read = true; }); saveDB(); renderNotifications(); toast('All notifications marked as read.', 'success'); },
  /* search */
  'search-go': el => { const r = (ui.searchResults || [])[Number(el.dataset.index)]; if (!r) return; $('#globalSearch').value = ''; $('#searchResults').hidden = true; navigate(r.page); },
  /* reports */
  'report-tab': el => { ui.reports.type = el.dataset.type; renderReports(); },
  'report-clear': () => { ui.reports = { type: ui.reports.type, classId: '', from: '', to: '' }; renderReports(); },
  'export-report': () => exportReport(),
  'print-report': () => printReport(),
  /* settings & data */
  'settings-save': () => saveBranding(),
  'settings-prefs': () => savePrefs(),
  'settings-switch': el => { DB.settings[el.dataset.key] = el.checked; saveDB(); applySettingsSideEffects(); },
  'export-all': () => { downloadJSON(`educore-backup-${todayISO()}.json`, DB); toast('Backup file downloaded.', 'success'); },
  'import-json': () => $('#importFile').click(),
  'reset-demo': () => resetDemo()
};
function applySettingsSideEffects() {
  document.documentElement.style.setProperty('--row-pad', DB.settings.denseTables ? '.4rem' : '.66rem');
  if (!DB.settings.animations) document.body.classList.add('no-anim'); else document.body.classList.remove('no-anim');
}

/* ---- delegated listeners ---- */
document.addEventListener('click', e => {
  const navEl = e.target.closest('[data-nav]');
  const actEl = e.target.closest('[data-action]');
  // close dropdowns when clicking outside
  if (!e.target.closest('.notif-wrap') && !e.target.closest('.profile-wrap') && !e.target.closest('#searchWrap')) closeDropdowns();
  if (actEl) {
    const fn = ACTIONS[actEl.dataset.action];
    if (fn) { e.preventDefault(); fn(actEl); return; }
  }
  if (navEl) { e.preventDefault(); navigate(navEl.dataset.nav); }
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.id === 'globalSearch') { globalSearch(el.value); return; }
  if (el.matches('[data-marks]')) return;         // handled by its own listener
  if (el.matches('[data-filter]') && (el.tagName === 'INPUT')) applyFilter(el.dataset.filter, el.value);
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.matches('[data-filter]') && el.tagName === 'SELECT') applyFilter(el.dataset.filter, el.value);
  if (el.id === 'importFile' && el.files && el.files[0]) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.students)) throw new Error('Unexpected file structure');
        DB = parsed; saveDB(); applyTheme(DB.settings.theme); applyBranding(); renderNotifications();
        navigate('dashboard', { updateHash: false }); toast('Backup restored successfully.', 'success');
      } catch (err) { toast('That file is not a valid EduCore backup.', 'error'); }
    };
    reader.readAsText(el.files[0]);
    el.value = '';
  }
});
$('#menuBtn').addEventListener('click', () => $('#sidebar').classList.contains('open') ? closeSidebar() : openSidebar());
$('#sidebarClose').addEventListener('click', closeSidebar);
$('#backdrop').addEventListener('click', closeSidebar);
$('#collapseBtn').addEventListener('click', () => setCollapsed(!ui.collapsed));
$('#themeBtn').addEventListener('click', () => applyTheme(DB.settings.theme === 'dark' ? 'light' : 'dark'));
$('#notifBtn').addEventListener('click', e => { e.stopPropagation(); const p = $('#notifPanel'); const open = p.hidden; closeDropdowns(p); p.hidden = !open; $('#notifBtn').setAttribute('aria-expanded', String(open)); });
$('#profileBtn').addEventListener('click', e => { e.stopPropagation(); const p = $('#profilePanel'); const open = p.hidden; closeDropdowns(p); p.hidden = !open; $('#profileBtn').setAttribute('aria-expanded', String(open)); });
$('#globalSearch').addEventListener('keydown', e => { if (e.key === 'Escape') { e.target.value = ''; $('#searchResults').hidden = true; } });
window.addEventListener('hashchange', () => {
  const page = location.hash.replace('#', '');
  if (PAGE_META[page] && page !== ui.page) navigate(page, { updateHash: false });
});
window.addEventListener('resize', debounce(() => { if (ui.page === 'dashboard') drawDashboardCharts(); if (ui.page === 'results') renderResults(); if (ui.page === 'reports') renderReports(); if (ui.page === 'attendance') renderAttendanceCharts(); }, 250));
window.addEventListener('error', ev => { console.error(ev.error || ev.message); });
window.addEventListener('beforeunload', () => saveDB());

/* ---- boot ---- */
(function boot() {
  const fresh = loadDB();
  applyTheme(DB.settings.theme || 'light');
  applySettingsSideEffects();
  setCollapsed(!!DB.settings.collapsed, false);
  applyBranding();
  renderNotifications();
  const start = location.hash.replace('#', '');
  navigate(PAGE_META[start] ? start : 'dashboard', { updateHash: false });
  if (fresh) setTimeout(() => toast('Welcome! Sample school data has been loaded into this browser.', 'info', 5000), 700);
})();







