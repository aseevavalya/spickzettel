// Add future semesters and their subjects here. Existing content keeps its IDs.
const semesters = [
  { id: '4', subjects: [
    { id: 'dt', title: 'Digitaltechnik' },
    { id: 'dm', title: 'Diskrete Mathematik' },
    { id: 'ap', title: 'Algorithmen & Programmierung' }
  ] },
  { id: '5', subjects: [
    { id: 's5-ti', title: 'Theoretische Informatik' },
    { id: 's5-db', title: 'Datenbanken' },
    { id: 's5-grn', title: 'Grundlagen der Rechnernetze' }
  ] }
];

(() => {
  const grid = document.querySelector('main.grid');
  const nav = document.getElementById('semesterNav');
  const tabs = document.getElementById('subjectTabs');
  const select = document.getElementById('mobileSubjectSelect');
  const search = document.getElementById('search');
  const mobile = window.matchMedia('(max-width:760px)');
  let semester;
  let subject = 'all';

  semesters.forEach(entry => entry.subjects.forEach(course => {
    if (grid.querySelector(`[data-subject="${course.id}"]`)) return;
    const section = document.createElement('section');
    section.className = 'subject hidden';
    section.dataset.semester = entry.id;
    section.dataset.subject = course.id;
    const heading = document.createElement('h2');
    heading.textContent = course.title;
    const badge = document.createElement('div');
    badge.className = 'badge';
    badge.textContent = 'In Vorbereitung';
    const empty = document.createElement('div');
    empty.className = 'empty-subject';
    empty.innerHTML = '<p><strong>Hier entsteht dein neuer Spickzettel.</strong></p><p>Noch keine Themen oder Materialien vorhanden.</p>';
    section.append(heading, badge, empty);
    grid.insertBefore(section, document.getElementById('noResults'));
  }));

  const sections = [...grid.querySelectorAll('.subject')];
  function button(label, action) {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'tab';
    element.textContent = label;
    element.addEventListener('click', action);
    return element;
  }

  function applyFilter() {
    const query = search.value.trim().toLowerCase();
    let visible = 0;
    sections.forEach(section => {
      const matches = section.dataset.semester === semester.id &&
        (subject === 'all' || section.dataset.subject === subject) &&
        (!query || section.textContent.toLowerCase().includes(query));
      section.classList.toggle('hidden', !matches);
      section.classList.toggle('mobile-active', matches);
      if (matches) visible++;
    });
    document.getElementById('noResults').classList.toggle('hidden', visible > 0);
    tabs.querySelectorAll('button').forEach(tab => {
      const active = tab.dataset.filter === subject;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-pressed', String(active));
    });
    select.value = subject;
  }

  function chooseSemester(id, updateUrl = true, requestedSubject) {
    semester = semesters.find(entry => entry.id === id) || semesters.at(-1);
    subject = requestedSubject === 'all' || semester.subjects.some(course => course.id === requestedSubject)
      ? requestedSubject : (mobile.matches ? semester.subjects[0].id : 'all');
    search.value = '';
    search.placeholder = 'Thema im gewählten Semester suchen …';
    tabs.replaceChildren();
    select.replaceChildren();
    [{ id: 'all', title: 'Alle Fächer' }, ...semester.subjects].forEach(course => {
      const tab = button(course.title, () => chooseSubject(course.id));
      tab.dataset.filter = course.id;
      tabs.append(tab);
      select.add(new Option(course.title, course.id));
    });
    nav.querySelectorAll('button').forEach(tab => {
      const active = tab.dataset.semester === semester.id;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-pressed', String(active));
    });
    document.getElementById('semesterBadge').textContent = `${semester.id}. SEMESTER`;
    applyFilter();
    if (updateUrl) writeUrl();
  }

  function writeUrl() {
    const url = new URL(location.href);
    url.searchParams.set('semester', semester.id);
    url.searchParams.set('subject', subject);
    history.pushState(null, '', url);
  }
  function chooseSubject(id) {
    subject = id;
    applyFilter();
    writeUrl();
  }
  function readUrl() {
    const params = new URLSearchParams(location.search);
    chooseSemester(params.get('semester'), false, params.get('subject'));
  }
  semesters.forEach(entry => {
    const tab = button(`${entry.id}. Semester`, () => chooseSemester(entry.id));
    tab.dataset.semester = entry.id;
    nav.append(tab);
  });
  select.addEventListener('change', () => chooseSubject(select.value));
  search.addEventListener('input', applyFilter);
  window.addEventListener('popstate', readUrl);
  readUrl();
})();
