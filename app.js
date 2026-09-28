(() => {
  'use strict';

  const ACCOUNT_STORE = 'studyspark.accounts.v1';
  const SESSION_STORE = 'studyspark.session.v1';
  const MODEL_ID = 'nvidia/nemotron-3-super-120b-a12b';
  const API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
  const MAX_GUIDE_CHARS = 100000;
  const $ = (id) => document.getElementById(id);

  const els = {
    authView: $('authView'), workspace: $('workspace'), authTitle: $('authTitle'), authSubtitle: $('authSubtitle'), authForm: $('authForm'),
    authUsername: $('authUsername'), authPassword: $('authPassword'), authMessage: $('authMessage'), authSubmit: $('authSubmit'), authSwitch: $('authSwitch'),
    authSwitchText: $('authSwitchText'), passwordToggle: $('passwordToggle'), accountButton: $('accountButton'), accountMenu: $('accountMenu'),
    userNameLabel: $('userNameLabel'), userAvatar: $('userAvatar'), menuAvatar: $('menuAvatar'), menuUsername: $('menuUsername'),
    signOutButton: $('signOutButton'), fileInput: $('fileInput'), dropZone: $('dropZone'), fileList: $('fileList'), studyText: $('studyText'),
    wordCount: $('wordCount'), sourceStatus: $('sourceStatus'), apiKeyInput: $('apiKeyInput'), keyToggle: $('keyToggle'),
    saveKeyButton: $('saveKeyButton'), keySavedStatus: $('keySavedStatus'), referenceLookup: $('referenceLookup'), generateButton: $('generateButton'), progressArea: $('progressArea'),
    progressTitle: $('progressTitle'), progressDetail: $('progressDetail'), generationError: $('generationError'), resultsSection: $('resultsSection'),
    resultsTitle: $('resultsTitle'), resultsSummary: $('resultsSummary'), quizRows: $('quizRows'), sourcesBox: $('sourcesBox'), sourceCards: $('sourceCards'),
    xlsxButton: $('xlsxButton'), csvButton: $('csvButton'), newQuizButton: $('newQuizButton'), privacyButton: $('privacyButton'),
    noticeDialog: $('noticeDialog'), dialogClose: $('dialogClose'), dialogDone: $('dialogDone'), toast: $('toast')
  };

  let isRegisterMode = false;
  let currentUser = null;
  let generatedRows = [];
  let uploadedFiles = [];
  let toastTimer;

  function getAccounts() {
    try {
      const value = JSON.parse(localStorage.getItem(ACCOUNT_STORE) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (_) { return []; }
  }

  function saveAccounts(accounts) {
    localStorage.setItem(ACCOUNT_STORE, JSON.stringify(accounts));
  }

  function safeStorageSet(key, value) {
    try { localStorage.setItem(key, value); return true; }
    catch (_) { return false; }
  }

  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2800);
  }

  function setAuthMessage(text, isError = true) {
    els.authMessage.textContent = text;
    els.authMessage.style.color = isError ? '#c34848' : '#3f9d7c';
  }

  function setAuthMode(register) {
    isRegisterMode = register;
    els.authTitle.innerHTML = register ? 'Your notes,<br><span>your quiz.</span>' : 'Learn it.<br><span>Play it.</span>';
    els.authSubtitle.textContent = register ? 'Create a local account to keep your NVIDIA key on this device.' : 'Sign in to turn your notes into a Blooket-ready quiz.';
    els.authSubmit.innerHTML = register ? 'Create account <span>→</span>' : 'Sign in <span>→</span>';
    els.authSwitchText.textContent = register ? 'Already have an account?' : 'New around here?';
    els.authSwitch.textContent = register ? 'Sign in' : 'Create an account';
    els.authPassword.autocomplete = register ? 'new-password' : 'current-password';
    els.authMessage.textContent = '';
  }

  async function derivePassword(password, saltText) {
    if (!window.crypto || !crypto.subtle) {
      throw new Error('Secure password storage needs a modern browser on HTTPS. Open this app from GitHub Pages or localhost.');
    }
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({
      name: 'PBKDF2', salt: Uint8Array.from(atob(saltText), (c) => c.charCodeAt(0)), iterations: 120000, hash: 'SHA-256'
    }, key, 256);
    return Array.from(new Uint8Array(bits), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function randomSalt() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
  }

  function renderSignedIn() {
    const accounts = getAccounts();
    const user = accounts.find((entry) => entry.username.toLowerCase() === currentUser);
    if (!user) {
      currentUser = null;
      localStorage.removeItem(SESSION_STORE);
      els.authView.hidden = false;
      els.workspace.hidden = true;
      els.accountButton.hidden = true;
      return;
    }
    els.authView.hidden = true;
    els.workspace.hidden = false;
    els.accountButton.hidden = false;
    els.userNameLabel.textContent = user.username;
    els.menuUsername.textContent = user.username;
    const initial = user.username.trim().charAt(0).toUpperCase() || 'S';
    els.userAvatar.textContent = initial;
    els.menuAvatar.textContent = initial;
    els.apiKeyInput.value = user.apiKey || '';
    updateKeyStatus(Boolean(user.apiKey));
  }

  function updateKeyStatus(saved) {
    els.keySavedStatus.textContent = saved ? 'Saved to this browser' : 'Not saved';
    els.keySavedStatus.classList.toggle('is-saved', saved);
  }

  async function handleAuth(event) {
    event.preventDefault();
    setAuthMessage('');
    const username = els.authUsername.value.trim();
    const password = els.authPassword.value;
    const normalized = username.toLowerCase();
    if (!/^[a-zA-Z0-9_-]{3,24}$/.test(username)) {
      setAuthMessage('Use 3–24 letters, numbers, underscores, or hyphens for your username.');
      return;
    }
    if (password.length < 8) {
      setAuthMessage('Your password needs at least 8 characters.');
      return;
    }
    els.authSubmit.disabled = true;
    try {
      const accounts = getAccounts();
      const existing = accounts.find((entry) => entry.username.toLowerCase() === normalized);
      if (isRegisterMode) {
        if (existing) {
          setAuthMessage('That username is already in use on this browser. Try signing in.');
          return;
        }
        const salt = randomSalt();
        accounts.push({ username, salt, passwordHash: await derivePassword(password, salt), apiKey: '' });
        saveAccounts(accounts);
        toast('Your account is ready.');
      } else {
        if (!existing) {
          setAuthMessage('No local account found. Create one on this device first.');
          return;
        }
        const digest = await derivePassword(password, existing.salt);
        if (digest !== existing.passwordHash) {
          setAuthMessage('That password does not match this local account.');
          return;
        }
      }
      currentUser = normalized;
      safeStorageSet(SESSION_STORE, currentUser);
      els.authForm.reset();
      renderSignedIn();
    } catch (error) {
      setAuthMessage(error.message || 'Could not save this account in browser storage.');
    } finally {
      els.authSubmit.disabled = false;
    }
  }

  function handleSignOut() {
    currentUser = null;
    localStorage.removeItem(SESSION_STORE);
    els.accountMenu.hidden = true;
    els.studyText.value = '';
    uploadedFiles = [];
    renderFileList();
    updateWordCount();
    els.apiKeyInput.value = '';
    clearResults();
    renderSignedIn();
  }

  function saveApiKey() {
    if (!currentUser) return;
    const key = els.apiKeyInput.value.trim();
    if (key && key.length < 12) {
      toast('That key looks too short. Check it and try again.');
      return;
    }
    const accounts = getAccounts();
    const user = accounts.find((entry) => entry.username.toLowerCase() === currentUser);
    if (!user) return;
    user.apiKey = key;
    try {
      saveAccounts(accounts);
      updateKeyStatus(Boolean(key));
      toast(key ? 'NVIDIA key saved on this device.' : 'Saved key removed.');
    } catch (_) {
      toast('Browser storage is full or unavailable.');
    }
  }

  function updateWordCount() {
    const text = [els.studyText.value, ...uploadedFiles.filter((f) => f.status === 'done').map((f) => f.text)].join('\n');
    const count = (text.match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu) || []).length;
    els.wordCount.textContent = `${count.toLocaleString()} ${count === 1 ? 'word' : 'words'}`;
    els.sourceStatus.textContent = text.trim() ? 'Your guide is ready to use.' : 'Your guide is only used to make this quiz.';
  }

  function renderFileList() {
    els.fileList.replaceChildren();
    uploadedFiles.forEach((file) => {
      const chip = document.createElement('div');
      chip.className = 'file-chip';
      const name = document.createElement('span');
      name.textContent = file.name;
      const state = document.createElement('small');
      state.textContent = file.status === 'reading' ? 'Reading…' : file.status === 'error' ? 'Could not read' : 'Added';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remove ${file.name}`);
      remove.textContent = '×';
      remove.addEventListener('click', () => {
        uploadedFiles = uploadedFiles.filter((item) => item.id !== file.id);
        renderFileList();
        updateWordCount();
      });
      chip.append(name, state, remove);
      els.fileList.append(chip);
    });
  }

  async function extractPdf(file) {
    if (!window.pdfjsLib) throw new Error('PDF reader did not load. Check your internet connection and try again.');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const doc = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => item.str).join(' '));
    }
    const result = pages.join('\n\n');
    if (!result.trim()) throw new Error('No selectable text was found in that PDF. Try uploading it as a photo for OCR.');
    return result;
  }

  async function extractImage(file, fileEntry) {
    if (!window.Tesseract) throw new Error('Photo text reader did not load. Check your internet connection and try again.');
    const result = await window.Tesseract.recognize(file, 'eng', {
      logger: (message) => {
        if (message.status === 'recognizing text' && typeof message.progress === 'number') {
          els.sourceStatus.textContent = `Reading photo… ${Math.round(message.progress * 100)}%`;
        }
      }
    });
    fileEntry.ocrConfidence = result.data.confidence;
    return result.data.text || '';
  }

  async function extractFile(file, fileEntry) {
    const lower = file.name.toLowerCase();
    if (file.size > 15 * 1024 * 1024) throw new Error('Each file must be smaller than 15 MB.');
    if (/\.pdf$/.test(lower) || file.type === 'application/pdf') return extractPdf(file);
    if (/\.docx$/.test(lower) || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      if (!window.mammoth) throw new Error('Word document reader did not load.');
      const result = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      return result.value;
    }
    if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|tiff?)$/.test(lower)) return extractImage(file, fileEntry);
    if (file.type === 'text/plain' || /\.(txt|md)$/.test(lower)) return file.text();
    throw new Error('Unsupported file type. Use TXT, MD, PDF, DOCX, or a common image.');
  }

  async function addFiles(fileList) {
    const files = Array.from(fileList || []);
    for (const file of files) {
      const entry = { id: `${Date.now()}-${Math.random()}`, name: file.name, status: 'reading', text: '' };
      uploadedFiles.push(entry);
      renderFileList();
      try {
        entry.text = (await extractFile(file, entry)).trim();
        if (!entry.text) throw new Error('No text was found in this file.');
        entry.status = 'done';
      } catch (error) {
        entry.status = 'error';
        entry.error = error.message;
        toast(`${file.name}: ${error.message}`);
      }
      renderFileList();
      updateWordCount();
    }
    els.fileInput.value = '';
  }

  function setProgress(title, detail) {
    els.progressTitle.textContent = title;
    els.progressDetail.textContent = detail;
  }

  function topSearchTerms(text) {
    const stop = new Set(('about above after again against also among another any are because been before being between both could does doing down during each few from further have having here itself just more most other over same should some such than that the their them then there these they this those through under until very what when where which while with would your into onto than then also used use using based guide notes study learn learned material important example examples following according define definition include includes including').split(' '));
    const words = text.match(/[A-Za-z][A-Za-z'-]{4,}/g) || [];
    const counts = new Map();
    for (const word of words) {
      const normalized = word.toLowerCase().replace(/['-]/g, '');
      if (stop.has(normalized) || /^\d+$/.test(normalized)) continue;
      counts.set(normalized, (counts.get(normalized) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([word]) => word);
  }

  async function findReferenceSources(guide) {
    const terms = topSearchTerms(guide);
    if (!terms.length) return [];
    const query = terms.slice(0, 4).join(' ');
    const searchUrl = new URL('https://en.wikipedia.org/w/api.php');
    searchUrl.search = new URLSearchParams({ action: 'query', list: 'search', srsearch: query, srlimit: '4', format: 'json', origin: '*' }).toString();
    try {
      setProgress('Looking up background references…', 'Searching a few key terms, not uploading your full guide.');
      const searchResponse = await fetch(searchUrl, { signal: AbortSignal.timeout(12000) });
      if (!searchResponse.ok) return [];
      let searchData = await searchResponse.json();
      let hits = searchData.query?.search || [];
      if (!hits.length && terms.length > 1) {
        searchUrl.searchParams.set('srsearch', terms[0]);
        const fallbackResponse = await fetch(searchUrl, { signal: AbortSignal.timeout(12000) });
        if (fallbackResponse.ok) {
          searchData = await fallbackResponse.json();
          hits = searchData.query?.search || [];
        }
      }
      if (!hits.length) return [];
      const titles = hits.slice(0, 4).map((hit) => hit.title).join('|');
      const detailUrl = new URL('https://en.wikipedia.org/w/api.php');
      detailUrl.search = new URLSearchParams({ action: 'query', titles, prop: 'extracts|info', exintro: '1', explaintext: '1', exchars: '1400', inprop: 'url', redirects: '1', format: 'json', origin: '*' }).toString();
      const detailResponse = await fetch(detailUrl, { signal: AbortSignal.timeout(12000) });
      if (!detailResponse.ok) return [];
      const detailData = await detailResponse.json();
      return Object.values(detailData.query?.pages || {}).filter((page) => page.extract && page.fullurl).slice(0, 4).map((page) => ({
        title: page.title, url: page.fullurl, excerpt: page.extract.slice(0, 1400)
      }));
    } catch (_) {
      return [];
    }
  }

  function makeModelPrompt(guide, sources) {
    const sourceText = sources.length ? sources.map((source, index) => `Reference ${index + 1}: ${source.title}\nURL: ${source.url}\nExcerpt: ${source.excerpt}`).join('\n\n') : 'No outside reference results were available.';
    return `Create a comprehensive multiple-choice review quiz based ONLY on the study guide below. Preserve the guide's scope: every tested fact must explicitly appear in the guide. Do not introduce outside topics or facts, even if they seem useful or more accurate. External references below may only help disambiguate/verify context already stated in the guide; they are not permission to add content. If a detail is absent from the guide, do not test it.\n\nCreate as many distinct, useful questions as the guide supports, covering its key facts, definitions, relationships, and processes without duplicating questions. Use clear, specific wording with exactly one defensible answer. Each question must have four distinct answer choices. Make every wrong answer realistic and close to the guide's concepts—not silly or unrelated. Keep all four answer choices close in length and provide enough detail to show understanding without needless precision. Randomize the correct answer position across 1, 2, 3, and 4; avoid a predictable pattern. Do not add explanations, source claims, or question numbers.\n\nReturn ONLY a valid JSON object in this exact shape (no markdown):\n{"questions":[{"question":"...","answers":["...","...","...","..."],"correctAnswer":1}]}\nThe correctAnswer value must be the numeric position 1, 2, 3, or 4.\n\nSTUDY GUIDE (the sole source of quiz content):\n---\n${guide}\n---\n\nOPTIONAL REFERENCE CONTEXT (context checking only; never a source for new testable facts):\n${sourceText}`;
  }

  async function requestModel(apiKey, guide, sources) {
    const body = {
      model: MODEL_ID,
      messages: [
        { role: 'system', content: 'You create accurate, fair study quizzes. Follow the user data boundaries and JSON-only format exactly. Never add facts that are not in the provided study guide.' },
        { role: 'user', content: makeModelPrompt(guide, sources) }
      ],
      temperature: 0.25,
      top_p: 0.8,
      max_tokens: 10000,
      stream: false,
      response_format: { type: 'json_object' }
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180000);
    try {
      let response = await fetch(API_URL, {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body)
      });
      if (!response.ok && response.status === 400) {
        const errorText = await response.clone().text();
        if (/response_format|json_object|json mode/i.test(errorText)) {
          delete body.response_format;
          response = await fetch(API_URL, {
            method: 'POST', signal: controller.signal,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify(body)
          });
        }
      }
      if (!response.ok) {
        const detail = await response.text();
        let message = detail;
        try { message = JSON.parse(detail).detail || JSON.parse(detail).message || detail; } catch (_) { /* keep raw response */ }
        throw new Error(`NVIDIA returned ${response.status}: ${String(message).slice(0, 450)}`);
      }
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) throw new Error('The model returned an empty response. Please try again.');
      return parseQuestions(content);
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('The model request timed out. Try a shorter guide or generate again.');
      if (error instanceof TypeError) throw new Error('Could not reach NVIDIA. Check your connection, API key, and whether the NVIDIA endpoint is available from your browser.');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  function parseQuestions(content) {
    let text = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) text = text.slice(start, end + 1);
    let parsed;
    try { parsed = JSON.parse(text); }
    catch (_) { throw new Error('The model response was not valid quiz data. Please try generating again.'); }
    const questions = Array.isArray(parsed) ? parsed : parsed.questions;
    if (!Array.isArray(questions) || !questions.length) throw new Error('The model did not return any questions. Try adding more study material.');
    const rows = [];
    for (const item of questions) {
      const answers = Array.isArray(item.answers) ? item.answers : [item.answer1, item.answer2, item.answer3, item.answer4];
      const rawCorrect = item.correctAnswer ?? item.correct_answer ?? item.correctAnswerNumber ?? item.correct_answer_number;
      const correct = typeof rawCorrect === 'number' ? rawCorrect : Number(String(rawCorrect).match(/[1-4]/)?.[0]);
      const question = String(item.question ?? item.questionText ?? '').trim();
      if (!question || !Array.isArray(answers) || answers.length !== 4 || answers.some((answer) => typeof answer !== 'string' || !answer.trim()) || ![1, 2, 3, 4].includes(correct)) continue;
      const cleanedAnswers = answers.map((answer) => String(answer).trim());
      if (new Set(cleanedAnswers.map((answer) => answer.toLowerCase())).size !== 4) continue;
      rows.push({ question, answers: cleanedAnswers, correctAnswer: correct });
    }
    if (!rows.length) throw new Error('The model response did not include valid four-choice questions. Please generate again.');
    return rows;
  }

  function renderSources(sources) {
    els.sourceCards.replaceChildren();
    els.sourcesBox.hidden = !sources.length;
    sources.forEach((source) => {
      const link = document.createElement('a');
      link.className = 'source-card';
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const title = document.createElement('b');
      title.textContent = source.title;
      const description = document.createElement('span');
      description.textContent = source.excerpt.replace(/\s+/g, ' ').slice(0, 190);
      link.append(title, description);
      els.sourceCards.append(link);
    });
  }

  function renderQuestions(rows) {
    els.quizRows.replaceChildren();
    rows.forEach((row) => {
      const tr = document.createElement('tr');
      const values = [row.question, ...row.answers, '300', String(row.correctAnswer)];
      values.forEach((value, index) => {
        const td = document.createElement('td');
        td.textContent = value;
        if (index === row.correctAnswer) td.classList.add('correct-cell');
        tr.append(td);
      });
      els.quizRows.append(tr);
    });
  }

  function clearResults() {
    generatedRows = [];
    els.resultsSection.hidden = true;
    els.sourcesBox.hidden = true;
    els.quizRows.replaceChildren();
  }

  async function generateQuiz() {
    els.generationError.hidden = true;
    const guide = [els.studyText.value.trim(), ...uploadedFiles.filter((file) => file.status === 'done').map((file) => file.text)].filter(Boolean).join('\n\n');
    const accounts = getAccounts();
    const user = accounts.find((entry) => entry.username.toLowerCase() === currentUser);
    const apiKey = (user?.apiKey || '').trim();
    if (!guide) {
      els.generationError.textContent = 'Add some study-guide text or upload a readable file first.';
      els.generationError.hidden = false;
      return;
    }
    if (guide.length > MAX_GUIDE_CHARS) {
      els.generationError.textContent = `This guide is ${guide.length.toLocaleString()} characters. Please split it into smaller sections (up to ${MAX_GUIDE_CHARS.toLocaleString()} characters at a time).`;
      els.generationError.hidden = false;
      return;
    }
    if (!apiKey) {
      els.generationError.textContent = 'Save your NVIDIA NIM key above before creating a quiz.';
      els.generationError.hidden = false;
      els.apiKeyInput.focus();
      return;
    }
    if (uploadedFiles.some((file) => file.status === 'reading')) {
      els.generationError.textContent = 'Wait for your files to finish reading before creating a quiz.';
      els.generationError.hidden = false;
      return;
    }
    const failed = uploadedFiles.filter((file) => file.status === 'error');
    if (failed.length && !guide.trim()) {
      els.generationError.textContent = 'One or more files could not be read. Try another file format.';
      els.generationError.hidden = false;
      return;
    }
    els.generateButton.disabled = true;
    els.progressArea.hidden = false;
    els.progressArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
    clearResults();
    try {
      const sources = els.referenceLookup.checked ? await findReferenceSources(guide) : [];
      setProgress('Building your quiz…', 'Nemotron is making questions from your guide only.');
      const rows = await requestModel(apiKey, guide, sources);
      generatedRows = rows;
      renderQuestions(rows);
      renderSources(sources);
      const lengths = rows.flatMap((row) => row.answers.map((answer) => answer.length));
      const avg = lengths.reduce((sum, value) => sum + value, 0) / lengths.length;
      const uneven = lengths.some((value) => Math.abs(value - avg) > avg * 0.55);
      els.resultsTitle.textContent = `${rows.length} questions, ready to review.`;
      els.resultsSummary.textContent = uneven
        ? 'Check the answer choices for balance, then download your Blooket-ready sheet.'
        : 'Four choices per question · 300 seconds each · no spreadsheet headers.';
      els.resultsSection.hidden = false;
      els.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      els.generationError.textContent = error.message || 'Quiz generation failed. Check your key and try again.';
      els.generationError.hidden = false;
    } finally {
      els.generateButton.disabled = false;
      els.progressArea.hidden = true;
    }
  }

  function getSheetRows() {
    return generatedRows.map((row) => [row.question, ...row.answers, 300, row.correctAnswer]);
  }

  function downloadXlsx() {
    if (!generatedRows.length) return;
    if (!window.XLSX) {
      toast('Spreadsheet tools did not load. Use Download CSV instead.');
      return;
    }
    const sheet = XLSX.utils.aoa_to_sheet(getSheetRows());
    sheet['!cols'] = [{ wch: 48 }, { wch: 36 }, { wch: 36 }, { wch: 36 }, { wch: 36 }, { wch: 13 }, { wch: 23 }];
    sheet['!sheetViews'] = [{ showGridLines: true }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Blooket Quiz');
    const safeName = `studyspark-blooket-${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(workbook, safeName, { bookType: 'xlsx', compression: true });
  }

  function downloadCsv() {
    if (!generatedRows.length) return;
    const quote = (value) => `"${String(value).replace(/"/g, '""')}"`;
    const csv = getSheetRows().map((row) => row.map(quote).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `studyspark-blooket-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function resetQuiz() {
    clearResults();
    els.studyText.value = '';
    uploadedFiles = [];
    renderFileList();
    updateWordCount();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  els.authForm.addEventListener('submit', handleAuth);
  els.authSwitch.addEventListener('click', () => setAuthMode(!isRegisterMode));
  els.passwordToggle.addEventListener('click', () => {
    const visible = els.authPassword.type === 'password';
    els.authPassword.type = visible ? 'text' : 'password';
    els.passwordToggle.textContent = visible ? 'Hide' : 'Show';
    els.passwordToggle.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
  });
  els.keyToggle.addEventListener('click', () => {
    const visible = els.apiKeyInput.type === 'password';
    els.apiKeyInput.type = visible ? 'text' : 'password';
    els.keyToggle.textContent = visible ? 'Hide' : 'Show';
    els.keyToggle.setAttribute('aria-label', visible ? 'Hide API key' : 'Show API key');
  });
  els.saveKeyButton.addEventListener('click', saveApiKey);
  els.apiKeyInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') saveApiKey(); });
  els.accountButton.addEventListener('click', () => { els.accountMenu.hidden = !els.accountMenu.hidden; });
  els.signOutButton.addEventListener('click', handleSignOut);
  document.addEventListener('click', (event) => {
    if (!els.accountMenu.hidden && !els.accountMenu.contains(event.target) && !els.accountButton.contains(event.target)) els.accountMenu.hidden = true;
  });
  els.fileInput.addEventListener('change', (event) => addFiles(event.target.files));
  els.studyText.addEventListener('input', updateWordCount);
  els.dropZone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); els.fileInput.click(); }
  });
  ['dragenter', 'dragover'].forEach((type) => els.dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    els.dropZone.classList.add('drag-over');
  }));
  ['dragleave', 'drop'].forEach((type) => els.dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    els.dropZone.classList.remove('drag-over');
    if (type === 'drop' && event.dataTransfer?.files) addFiles(event.dataTransfer.files);
  }));
  els.generateButton.addEventListener('click', generateQuiz);
  els.xlsxButton.addEventListener('click', downloadXlsx);
  els.csvButton.addEventListener('click', downloadCsv);
  els.newQuizButton.addEventListener('click', resetQuiz);
  els.privacyButton.addEventListener('click', () => els.noticeDialog.showModal());
  els.dialogClose.addEventListener('click', () => els.noticeDialog.close());
  els.dialogDone.addEventListener('click', () => els.noticeDialog.close());
  els.noticeDialog.addEventListener('click', (event) => {
    if (event.target === els.noticeDialog) els.noticeDialog.close();
  });

  try { currentUser = localStorage.getItem(SESSION_STORE); } catch (_) { currentUser = null; }
  if (currentUser) currentUser = currentUser.toLowerCase();
  setAuthMode(false);
  renderSignedIn();
  updateWordCount();
})();
