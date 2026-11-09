// 떠나찾 - 나를 찾아 떠나는 힐링 레코딩 웹앱
// 녹음 항목별 계속 / 신문을 받았을 때의 기분. 선물을 준 이유 추측

const STORAGE_KEYS = {
  contents: 'contique_contents',
  posts: 'contique_posts',
  activities: 'contique_activities',
  missionPhotos: 'contique_mission_photos',
  completedMissions: 'contique_completed_missions',
  splashDone: 'contique_splash_done',
  lastSession: 'contique_last_session',
  storageConsentGiven: 'contique_storage_consent_given',
  shareLink: 'contique_share_link',
  shareLinkText: 'contique_share_link_text',
  dailyQuotes: 'contique_daily_quotes',
  appVersion: 'contique_app_version',
  recordings: 'contique_recordings',
  fileSaveHintDisabled: 'contique_file_save_hint_disabled',
  sharedChecks: 'contique_shared_checks',
  missionMemos: 'contique_mission_memos',
  userNickname: 'contique_user_nickname',
  userNicknameHistory: 'contique_user_nickname_history', // string[], max 20
  userProfileImage: 'contique_user_profile_image',
  userProfileImageShape: 'contique_user_profile_image_shape', // 'circle' | 'square'
  userProfileImageHistory: 'contique_user_profile_image_history', // string[] (dataURL or 'emoji:xx'), max 20
  userAccount: 'contique_user_account', // { nickname, passHash?, createdAt, lastLoginAt, firstActivityAt }
  userSession: 'contique_user_session',
  modeCoupons: 'contique_mode_coupons',
  accessLog: 'contique_access_log', // 일별 접속 기록 [{ date: 'YYYY-MM-DD', firstAt?: ts }]
  playbackVolume: 'contique_playback_volume', // 0~100 정수, 재생 음량
};

const APP_VERSION = '1.25';
const APP_LAST_MODIFIED = '2025-03-12';

// 상태
let currentScreen = 'recording-home';
let homeMode = 'drawing'; // recording | writing | drawing (메인 기본: 드로잉)
let initialHomeModeFromUrl = null; // QR 등으로 진입 시 초기 홈 모드
let initialPartFromUrl = null;     // QR 등으로 진입 시 초기 파트 (1~4)
let currentUserId = null;          // 로그인된 사용자 ID (이 기기 전용)

// 스플래시 포스터 이미지들 (임의 순환)
const SPLASH_POSTERS = [
  'assets/App_2x.png',
  'assets/Splash_-_a_2x-b10037ee-a518-4a14-bca4-0316115cfd0d.png',
  'assets/Splash_-_b_2x-28f3cbfa-a327-4d90-a1cf-36111bc14736.png',
  'assets/Splash_-_c_2x-8e62cf64-2fda-410d-97f7-de97d3b33519.png',
  'assets/Splash_-_d_2x-74ef4a72-0fdd-48f4-bbc3-e68f6309cff6.png',
  'assets/Splash_-_e_2x-0f61809b-f11e-4911-8ad6-171a2c9e1e4c.png',
  'assets/Splash_-_f_2x-c02d98d9-a3fd-469d-900b-d16b5b47f4ae.png',
  'assets/Splash_-_g_2x-7e833d5f-6e35-42ba-95a0-7d94d0c07ef3.png',
  'assets/Splash_-_h_2x-5f88d5a6-9b60-4969-a357-40584937cbc5.png',
  'assets/Splash_-_i_2x-467d2757-8d98-448a-adb6-2a9e35e61f6e.png',
  'assets/Splash_-_j_2x-c887c9b7-0f8c-41af-b563-a101f62b12b2.png',
  'assets/Splash_-_k_2x-0637411e-c983-4ab8-a058-5f4ac1b60f9e.png',
  'assets/Splash_-_l_2x-adb4fa50-3dd4-482f-8c28-0940cda992a6.png',
  'assets/Splash_-_l_2x___1-2c4a2992-5924-46be-acee-3ad8b6ba4ee1.png',
];

let currentSplashIndex = 0;

// 모드별 쿠폰 파일 경로 (정적 txt 파일)
const MODE_COUPON_FILES = {
  writing: 'coupons/writing.txt',
  drawing: 'coupons/drawing.txt',
  recording: 'coupons/recording.txt',
};

// 런타임에 로드된 쿠폰 코드 캐시
const MODE_COUPON_CACHE = {
  writing: null,
  drawing: null,
  recording: null,
};

// ── 간단한 로그인/회원 관리 (이 기기 전용) ───────────────────────────────
function getUserAccount() {
  const raw = getData(STORAGE_KEYS.userAccount);
  if (!raw || typeof raw !== 'object') return null;
  // 레거시 {id, pass} → 신규로 마이그레이션
  if (raw.id && raw.pass && !raw.nickname) {
    return {
      nickname: String(raw.id || '').trim() || getUserNickname(),
      passHash: raw.pass,
      createdAt: Date.now(),
      lastLoginAt: null,
      firstActivityAt: null,
    };
  }
  if (!raw.nickname) return null;
  return raw;
}

function setUserAccount(acc) {
  setData(STORAGE_KEYS.userAccount, acc);
}

function getCurrentSession() {
  const raw = getData(STORAGE_KEYS.userSession);
  if (!raw || typeof raw !== 'object') return null;
  if (!raw.id) return null;
  return raw;
}

function setCurrentSession(sess) {
  setData(STORAGE_KEYS.userSession, sess);
  currentUserId = sess && sess.id ? sess.id : null;
}

function clearCurrentSession() {
  try { localStorage.removeItem(STORAGE_KEYS.userSession); } catch (_) {}
  currentUserId = null;
}

function isLoggedIn() {
  return !!currentUserId;
}

// 매우 단순한 문자열 해시 (보안 목적이 아닌, 평문 저장 방지용)
function simpleHash(str) {
  try {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return String(hash);
  } catch {
    return str;
  }
}

function formatYmd(ts) {
  try {
    if (!ts) return '';
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}.${m}.${day}`;
  } catch {
    return '';
  }
}

function diffDays(fromTs, toTs) {
  try {
    if (!fromTs || !toTs) return null;
    const a = new Date(fromTs);
    const b = new Date(toTs);
    a.setHours(0, 0, 0, 0);
    b.setHours(0, 0, 0, 0);
    const ms = b.getTime() - a.getTime();
    return Math.max(0, Math.floor(ms / 86400000));
  } catch {
    return null;
  }
}

function getTodayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getAccessLog() {
  const raw = getData(STORAGE_KEYS.accessLog);
  if (!Array.isArray(raw)) return [];
  return raw.filter(x => x && typeof x === 'object' && x.date);
}

function appendAccessLog() {
  const today = getTodayYmd();
  const log = getAccessLog();
  const has = log.some(x => x.date === today);
  if (has) return;
  const max = 90;
  const next = [...log, { date: today, firstAt: Date.now() }].slice(-max);
  setData(STORAGE_KEYS.accessLog, next);
}

function getModeCouponState() {
  const data = getData(STORAGE_KEYS.modeCoupons);
  return (data && typeof data === 'object') ? data : {};
}

function setModeCouponUnlocked(mode) {
  const cur = getModeCouponState();
  cur[mode] = true;
  setData(STORAGE_KEYS.modeCoupons, cur);
}

async function loadModeCoupons(mode) {
  if (!mode || MODE_COUPON_CACHE[mode]) return;
  const file = MODE_COUPON_FILES[mode];
  if (!file) {
    MODE_COUPON_CACHE[mode] = new Set();
    return;
  }
  try {
    const res = await fetch(file, { cache: 'no-store' });
    if (!res.ok) {
      console.warn('[쿠폰] 파일을 불러오지 못했어요:', file, res.status);
      MODE_COUPON_CACHE[mode] = new Set();
      return;
    }
    const text = await res.text();
    // 한 줄에 "코드 / MODE" 처럼 모드명이 함께 적혀 있어도
    // 앞쪽의 코드만 쿠폰으로 인식하도록 파싱
    const codes = text
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => {
        const beforeSlash = s.split('/')[0] || '';
        return beforeSlash.trim().toUpperCase();
      })
      .filter(Boolean);
    MODE_COUPON_CACHE[mode] = new Set(codes);
  } catch (e) {
    console.warn('[쿠폰] 로드 중 오류:', mode, e);
    MODE_COUPON_CACHE[mode] = new Set();
  }
}

function getAuthProfile() {
  const acc = getUserAccount();
  if (!acc) return null;
   // 항상 가장 최신 닉네임을 우선 사용
  const latestNickname = getUserNickname();
  return {
    nickname: latestNickname || String(acc.nickname || '').trim(),
    passHash: acc.passHash ? String(acc.passHash) : null,
    createdAt: acc.createdAt || Date.now(),
    lastLoginAt: acc.lastLoginAt || null,
    firstActivityAt: acc.firstActivityAt || null,
  };
}

function saveAuthProfile(profile) {
  if (!profile || !profile.nickname) return;
  setUserNickname(profile.nickname);
  setUserAccount({
    nickname: profile.nickname,
    passHash: profile.passHash || null,
    createdAt: profile.createdAt || Date.now(),
    lastLoginAt: profile.lastLoginAt || null,
    firstActivityAt: profile.firstActivityAt || null,
  });
}

let authOverlayBound = false;
let authUnlockedThisVisit = false;

function showAuthOverlay() {
  const overlay = document.getElementById('auth-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');

  const titleEl = document.getElementById('auth-title');
  const subEl = document.getElementById('auth-sub');
  const statsEl = document.getElementById('auth-stats');
  const lastLoginEl = document.getElementById('auth-last-login');
  const sinceLastLoginEl = document.getElementById('auth-since-last-login');
  const sinceFirstActivityEl = document.getElementById('auth-since-first-activity');

  const nicknameField = document.getElementById('auth-nickname-field');
  const nicknameInput = document.getElementById('auth-nickname');
  const passwordField = document.getElementById('auth-password-field');
  const passwordInput = document.getElementById('auth-password');
  const noPwHintEl = document.getElementById('auth-no-password-hint');
  const setPwRow = document.getElementById('auth-setpw-row');
  const setPwChk = document.getElementById('auth-setpw');
  const primaryBtn = document.getElementById('auth-primary');

  const now = Date.now();
  const profile = getAuthProfile();
  const isFirstLogin = !profile || !profile.nickname;

  function setHidden(el, hidden) {
    if (!el) return;
    el.classList.toggle('hidden', !!hidden);
  }

  // 기본 상태
  if (passwordInput) passwordInput.value = '';
  if (nicknameInput) nicknameInput.value = isFirstLogin ? '' : (profile?.nickname || getUserNickname());
  if (setPwChk) setPwChk.checked = false;
  if (noPwHintEl) noPwHintEl.classList.add('hidden');

  if (isFirstLogin) {
    if (titleEl) titleEl.textContent = '처음 만났네요';
    if (subEl) subEl.textContent = '';
    setHidden(statsEl, true);
    setHidden(nicknameField, false);
    setHidden(setPwRow, false);
    setHidden(passwordField, true);
    if (primaryBtn) primaryBtn.textContent = '나를 찾아 떠나요';

    if (nicknameInput) setTimeout(() => nicknameInput.focus(), 50);
  } else {
    const nickname = profile.nickname || getUserNickname();
    if (titleEl) {
      titleEl.innerHTML =
        `<span class="auth-nickname-line" style="display:block;">${nickname}님</span>` +
        `<span style="display:block; font-size:1.05rem; margin-top:20px;">` +
        `반가워요! 기다렸어요~ >.&lt; ` +
        `<img src="assets/____________-01-dc19e48e-694c-40fc-b7b2-57cbf9c74956.png" alt="" aria-hidden="true" style="height:22px; vertical-align:middle; margin-left:4px;">` +
        `</span>`;

      // 닉네임이 길 경우, 한 줄 안에 들어가도록 폰트 크기 자동 축소
      try {
        const nameSpan = titleEl.querySelector('.auth-nickname-line');
        if (nameSpan) {
          nameSpan.style.fontSize = ''; // 초기화
          const computed = window.getComputedStyle(nameSpan);
          let fontSize = parseFloat(computed.fontSize) || 32;
          const minFontSize = fontSize * 0.4; // 최소 40%까지 축소 (더 긴 닉네임 대응)
          let guard = 0;
          while (nameSpan.scrollWidth > titleEl.clientWidth && fontSize > minFontSize && guard < 60) {
            fontSize -= 1;
            nameSpan.style.fontSize = fontSize + 'px';
            guard += 1;
          }
        }
      } catch {}
    }
    if (subEl) subEl.textContent = '';
    setHidden(statsEl, false);
    if (lastLoginEl) lastLoginEl.textContent = profile.lastLoginAt ? formatYmd(profile.lastLoginAt) : '처음이에요';
    const d1 = profile.lastLoginAt ? diffDays(profile.lastLoginAt, now) : null;
    if (sinceLastLoginEl) sinceLastLoginEl.textContent = (d1 === null) ? '-' : `${d1}일`;
    const d2 = profile.firstActivityAt ? diffDays(profile.firstActivityAt, now) : null;
    if (sinceFirstActivityEl) sinceFirstActivityEl.textContent = (d2 === null) ? '아직 기록이 없어요' : `${d2 + 1}일째`;

    setHidden(nicknameField, true);
    setHidden(setPwRow, true);
    setHidden(passwordField, false);
    if (primaryBtn) primaryBtn.textContent = '나를 찾아 떠나요';

    if (profile.passHash) {
      if (noPwHintEl) noPwHintEl.classList.add('hidden');
      if (passwordInput) {
        passwordInput.placeholder = '비밀번호를 입력해 주세요';
        setTimeout(() => passwordInput.focus(), 50);
      }
    } else {
      if (noPwHintEl) noPwHintEl.classList.add('hidden');
      if (passwordInput) passwordInput.placeholder = '비밀번호 입력 (마이페이지에서 변경가능)';
    }
  }

  function unlockAndClose(nicknameForSession) {
    authUnlockedThisVisit = true;
    setCurrentSession({ id: nicknameForSession || getUserNickname() });
    updateLoginInfoUi();
    const overlayEl = document.getElementById('auth-overlay');
    if (overlayEl) {
      overlayEl.classList.add('hidden');
      overlayEl.setAttribute('aria-hidden', 'true');
    }
    // 로그인/닉네임 화면이 끝나고 항상 맨 위에서 시작하도록 스크롤 리셋
    try {
      const appEl = document.getElementById('app');
      if (appEl) appEl.scrollTop = 0;
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      window.scrollTo(0, 0);
    } catch {}
  }

  async function onPrimary() {
    const cur = getAuthProfile();
    if (!cur) {
      // 첫 로그인: 닉네임 설정 + 비번(선택)
      const nickname = (nicknameInput?.value || '').trim();
      if (!nickname) {
        alert('닉네임을 입력해 주세요.');
        nicknameInput?.focus();
        return;
      }
      let passHash = null;
      if (setPwChk?.checked) {
        const pw = (passwordInput?.value || '').trim();
        if (!pw) {
          alert('비밀번호를 입력해 주세요.');
          passwordInput?.focus();
          return;
        }
        passHash = simpleHash(pw);
      }
      const profile = {
        nickname,
        passHash,
        createdAt: now,
        lastLoginAt: now,
        firstActivityAt: null,
      };
      saveAuthProfile(profile);
      unlockAndClose(nickname);
      return;
    }

    // 재로그인: 비번이 있으면 검증, 없으면 바로 통과
    const nickname = cur.nickname || getUserNickname();
    if (cur.passHash) {
      const pw = (passwordInput?.value || '').trim();
      if (!pw) {
        alert('비밀번호를 입력해 주세요.');
        passwordInput?.focus();
        return;
      }
      if (simpleHash(pw) !== cur.passHash) {
        alert('비밀번호가 올바르지 않아요.');
        passwordInput?.focus();
        return;
      }
    }
    cur.lastLoginAt = now;
    saveAuthProfile(cur);
    unlockAndClose(nickname);
  }

  function onSetPwToggle() {
    const checked = !!setPwChk?.checked;
    setHidden(passwordField, !checked);
    if (checked && passwordInput) {
      passwordInput.placeholder = '비밀번호 입력 (마이페이지에서 변경가능)';
      passwordInput.value = '';
      setTimeout(() => passwordInput.focus(), 50);
    }
  }

  if (!authOverlayBound) {
    authOverlayBound = true;
    primaryBtn?.addEventListener('click', () => { onPrimary().catch(() => {}); });
    setPwChk?.addEventListener('change', onSetPwToggle);
    // 엔터 키
    nicknameInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') primaryBtn?.click(); });
    passwordInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') primaryBtn?.click(); });
  } else {
    // 상태만 갱신
    setPwChk?.removeEventListener('change', onSetPwToggle);
    setPwChk?.addEventListener('change', onSetPwToggle);
  }
}
let currentPostId = null;
let recordingState = { isRecording: false, mediaRecorder: null, chunks: [] };
let recordingStartTime = null;
let recordingPausedElapsed = 0;
let recordingTimerInterval = null;
let lastRecordedAudio = null;
let recordSaveContext = 'content';
let isRecordPreviewPlaying = false;

function detectInitialHomeModeFromUrl() {
  try {
    const url = new URL(window.location.href);
    const param = (url.searchParams.get('home') || url.searchParams.get('mode') || '').toLowerCase();
    const hash = (url.hash || '').replace(/^#/, '').toLowerCase();
    const path = (url.pathname || '/').toLowerCase();
    const isValid = (m) => m === 'recording' || m === 'drawing' || m === 'writing';
    // 1) 쿼리/해시 우선
    if (isValid(param)) return param;
    if (isValid(hash)) return hash;
    // 2) path 기반 (links.tunachat.net/record 등)
    if (path.startsWith('/record')) return 'recording';
    if (path.startsWith('/draw')) return 'drawing';
    if (path.startsWith('/write')) return 'writing';
  } catch (e) {
    console.warn('[detectInitialHomeModeFromUrl] 실패', e);
  }
  return null;
}

function detectInitialPartFromUrl() {
  try {
    const url = new URL(window.location.href);
    let partStr = url.searchParams.get('part') || '';
    // path 끝에 숫자가 붙은 경우 (예: /draw2, /write3)
    if (!partStr) {
      const m = (url.pathname || '').match(/(\d+)$/);
      if (m) partStr = m[1];
    }
    const n = Number(partStr);
    if (Number.isInteger(n) && n >= 1 && n <= 4) return n;
  } catch (e) {
    console.warn('[detectInitialPartFromUrl] 실패', e);
  }
  return null;
}

function setSplashPoster(index) {
  if (!Array.isArray(SPLASH_POSTERS) || SPLASH_POSTERS.length === 0) return;
  const total = SPLASH_POSTERS.length;
  currentSplashIndex = ((index % total) + total) % total;
  const posterEl = document.getElementById('splash-poster');
  const indicatorEl = document.getElementById('splash-indicator');
  const firstBtnsEl = document.getElementById('splash-btns-first');
  const mainBtnsEl = document.getElementById('splash-btns-main');
  const arrows = document.querySelectorAll('.splash-arrow');

  if (posterEl) {
    posterEl.src = SPLASH_POSTERS[currentSplashIndex];
    // 두번째 페이지부터는 이미지를 살짝 확대해서 하단 색 구분 영역이 보이지 않도록 처리
    posterEl.classList.toggle('zoomed', currentSplashIndex > 0);
  }
  if (indicatorEl) {
    if (currentSplashIndex === 0) {
      // 첫 페이지: 점(인디케이터) 숨김
      indicatorEl.innerHTML = '';
      indicatorEl.style.display = 'none';
    } else {
      let dots = '';
      for (let i = 0; i < total; i++) {
        dots += '<span class="dot' + (i === currentSplashIndex ? ' active' : '') + '"></span>';
      }
      indicatorEl.innerHTML = dots;
      indicatorEl.style.display = 'block';
    }
  }

  // 첫 페이지에는 출발! 버튼만, 나머지 페이지에는 건너뛰기/다음 버튼 + 화살표
  const isFirst = currentSplashIndex === 0;
  if (firstBtnsEl) firstBtnsEl.style.display = isFirst ? 'flex' : 'none';
  if (mainBtnsEl) mainBtnsEl.style.display = isFirst ? 'none' : 'flex';
  arrows.forEach(btn => {
    btn.style.display = isFirst ? 'none' : 'flex';
  });
}

function nextSplashPoster() {
  setSplashPoster(currentSplashIndex + 1);
}

function prevSplashPoster() {
  setSplashPoster(currentSplashIndex - 1);
}

function handleSplashNext() {
  if (currentSplashIndex < SPLASH_POSTERS.length - 1) {
    nextSplashPoster();
  } else {
    goToHomeFromSplash();
  }
}

function handleSignup() {
  const existing = getUserAccount();
  if (existing) {
    alert('이미 이 기기에 등록된 아이디가 있어요. 새로 만들려면 먼저 데이터 초기화를 해 주세요.');
    return;
  }
  const id = (prompt('이 기기에서 사용할 로그인 아이디(이메일 또는 별명)를 입력해 주세요.') || '').trim();
  if (!id) return;
  const pw1 = prompt('비밀번호를 입력해 주세요.');
  if (!pw1) return;
  const pw2 = prompt('비밀번호를 한 번 더 입력해 주세요.');
  if (pw1 !== pw2) {
    alert('비밀번호가 서로 달라요. 다시 시도해 주세요.');
    return;
  }
  const acc = { id, pass: simpleHash(pw1) };
  setUserAccount(acc);
  setCurrentSession({ id });
  updateLoginInfoUi();
  alert('회원가입이 완료되었어요. 이제 이 아이디로 로그인할 수 있어요.');
}

function handleLogin() {
  const acc = getUserAccount();
  if (!acc) {
    alert('아직 등록된 아이디가 없어요. 먼저 회원가입을 해 주세요.');
    return;
  }
  const id = (prompt('로그인 아이디를 입력해 주세요.') || '').trim();
  const pw = prompt('비밀번호를 입력해 주세요.');
  if (!id || !pw) return;
  if (id !== acc.id || simpleHash(pw) !== acc.pass) {
    alert('아이디 또는 비밀번호가 올바르지 않아요.');
    return;
  }
  setCurrentSession({ id });
  updateLoginInfoUi();
  alert('로그인되었습니다.');
}

function handleChangePassword() {
  const acc = getUserAccount();
  const profile = getAuthProfile();
  if (!acc) {
    alert('먼저 회원가입을 해 주세요.');
    return;
  }
  const currentHash = acc.pass || acc.passHash;
  if (!currentHash) {
    alert('아직 비밀번호가 설정되지 않았어요. 회원가입 시 비밀번호를 설정하거나, 로그아웃 후 다시 로그인하면서 설정할 수 있어요.');
    return;
  }
  const currentPw = prompt('현재 비밀번호를 입력해 주세요.');
  if (currentPw === null) return;
  if (simpleHash(currentPw) !== currentHash) {
    alert('현재 비밀번호가 올바르지 않아요.');
    return;
  }
  const newPw = prompt('새 비밀번호를 입력해 주세요.');
  if (newPw === null) return;
  if (!newPw.trim()) {
    alert('새 비밀번호를 입력해 주세요.');
    return;
  }
  const newPw2 = prompt('새 비밀번호를 한 번 더 입력해 주세요.');
  if (newPw2 === null) return;
  if (newPw !== newPw2) {
    alert('새 비밀번호가 서로 달라요. 다시 시도해 주세요.');
    return;
  }
  const newHash = simpleHash(newPw);
  setUserAccount({
    ...acc,
    passHash: newHash,
    pass: newHash,
  });
  updateLoginInfoUi();
  alert('비밀번호가 변경되었어요.');
}

function handleLogout() {
  if (!isLoggedIn()) {
    alert('이미 로그아웃 상태예요.');
    return;
  }
  clearCurrentSession();
  updateLoginInfoUi();
  alert('로그아웃되었습니다.');
}

function updateLoginInfoUi() {
  const acc = getUserAccount();
  const statusEl = document.getElementById('login-info-status');
  const idEl = document.getElementById('login-info-id');
  const nicknameEl = document.getElementById('login-info-nickname');
  if (statusEl) statusEl.textContent = isLoggedIn() ? '로그인됨' : '로그인 안 됨';
  if (idEl) idEl.textContent = acc ? acc.id : '등록 안 됨';
  if (nicknameEl) nicknameEl.textContent = getUserNickname();
}

// 초기 데이터
const defaultContents = [
  { id: '1', title: '신문을 받았을 때의 기분', displayTitle: 'LETTER - 미안해/고마워 편지', theme: 'LETTER', description: '미안하다, 고맙다 말하고 싶은\n사람에게 음성편지 보내기', recordings: [], hasUnrecorded: true, audioUrls: ['https://www.youtube.com/watch?v=영상ID1_여기수정', 'https://www.youtube.com/watch?v=영상ID2_여기수정'] },
  { id: '2', title: '선물을 준 이유 추측', theme: 'TIME AND MONEY', description: '시간과 돈에 대한 생각을 나눠보세요.', recordings: [], hasUnrecorded: true, audioUrls: ['https://www.youtube.com/watch?v=영상ID3_여기수정', 'https://www.youtube.com/watch?v=영상ID4_여기수정'] },
];

const defaultPosts = [
  { id: 'p1', contentId: '1', title: 'LETTER - 미안해/고마워 편지', body: '미안하다, 고맙다 말하고 싶은 사람에게 음성편지 보내기', likes: 14, date: '2026/02/28', comments: [], photos: [], audioUrls: ['https://www.youtube.com/watch?v=영상ID1_여기수정', 'https://www.youtube.com/watch?v=영상ID2_여기수정'] },
  { id: 'p2', contentId: '2', title: 'TIME AND MONEY - LOOKING BACK', body: '저는 시간보다 돈을 더 아껴 쓰는 편이라는 걸 알게됐어요. 돈을 아끼려고 너무 많', likes: 8, date: '2026/02/27', comments: [], photos: [], audioUrls: ['https://www.youtube.com/watch?v=영상ID3_여기수정'] },
  { id: 'p3', contentId: '3', title: 'FOND - 넘나 좋은 것', body: '나를 사랑하는 마음으로 내가 좋아하는 것들을 스스로 자주 선물해줘야겠다는 생각', likes: 5, date: '2026/02/26', comments: [], photos: [] },
];

// 앱 전역 캐릭터/시그널 음원
const SIGNAL_AUDIO = {
  intro: 'https://youtube.com/shorts/cpWWhxY6dkQ',
  greetJjue: 'https://youtube.com/shorts/PlTkezHEefA?feature=share',
  greetCami: 'https://youtube.com/shorts/M9WV1mMZHEc?feature=share',
};
const ENDING_AUDIO_URL = 'https://youtube.com/shorts/juEpBOUz078?feature=share';

let splashSignalPlayedThisSession = false;
let homeGreetingPlayedThisSession = false;
let splashSignalPlayer = null;
let homeGreetingPlayer = null;
let introAudioActive = false;

function stopAllIntroAudios() {
  try {
    if (splashSignalPlayer) {
      try { splashSignalPlayer.stopVideo && splashSignalPlayer.stopVideo(); } catch {}
      try { splashSignalPlayer.destroy && splashSignalPlayer.destroy(); } catch {}
      splashSignalPlayer = null;
    }
    if (homeGreetingPlayer) {
      try { homeGreetingPlayer.stopVideo && homeGreetingPlayer.stopVideo(); } catch {}
      try { homeGreetingPlayer.destroy && homeGreetingPlayer.destroy(); } catch {}
      homeGreetingPlayer = null;
    }
    introAudioActive = false;
  } catch {}
}

// 워크북 코드별 유튜브 음원 매핑 (라이팅)
const WB_AUDIO_URLS = {
  WB110: 'https://youtube.com/shorts/PlTkezHEefA?feature=share',
  WB111: 'https://youtube.com/shorts/ckC7w4HNMRQ?feature=share',
  // WB120: 편지(쇼츠 링크)
  WB120: 'https://youtube.com/shorts/rHmCQfSuD-k?feature=share',
  WB121: 'https://youtu.be/cSgEj4d8Xtg',
  WB122: 'https://youtu.be/2x0v8k7uw-k',
  WB123: 'https://youtu.be/KaqNNBO66Bg',
  WB124: 'https://youtu.be/kuNVhTNGYBo',
  WB125: 'https://youtu.be/HpNXqbv9hAQ',
  WB126: 'https://www.youtube.com/watch?v=HpNXqbv9hAQ',
  WB130: 'https://youtu.be/ejjbyjxXUD0',
  WB131: 'https://youtu.be/gbFyjsRKJUc',
  WB132: 'https://youtu.be/Dbc0k-sckLQ',
  WB140: 'https://youtu.be/sKEsGooW-1c',
  WB141: 'https://youtu.be/n6eHKFZOtug',
  WB142: 'https://youtu.be/vXFP_MltHOY',
  WB143: 'https://youtu.be/ZQ8p2A6IbZY',
  WB144: 'https://www.youtube.com/watch?v=HpNXqbv9hAQ',
  WB150: 'https://youtu.be/xvQ-EtxldM4',
  WB151: 'https://youtu.be/RB1ZUsSwaQ0',
  WB152: 'https://youtu.be/_qrdublXdGU',
  WB153: 'https://youtu.be/f6ZHmWBc3g4',
  WB154: 'https://youtu.be/iVddH1zr4Ys',
  WB160: 'https://youtu.be/9zAWpolNLW4',
  WB161: 'https://youtu.be/11FA3iRtS44',
  WB162: 'https://youtu.be/JWVEJNLX4GQ',
  WB163: 'https://youtu.be/sMCRoI96vN8',
  WB164: 'https://youtu.be/l2Dixn_8nVI',
  WB165: 'https://youtu.be/uGSbS5xMr_M',
  WB166: 'https://youtu.be/FNTy8RK-BTI', // ABOUT 릴렉싱 4 (DIY)
  WB210: 'https://youtube.com/shorts/CSfLI69p9Rk?feature=share',
  WB211: 'https://youtu.be/5raODUTkkK4',
  WB212: 'https://youtu.be/B_qtXJ1X6aY',
  WB220: 'https://youtube.com/shorts/wvZOjzERlvU?feature=share',
  WB221: 'https://youtu.be/hqn52WaGSAQ',
  WB222: 'https://youtu.be/5ALNZ4fg9LU',
  WB230: 'https://youtube.com/shorts/D35vizWVTdA',
  WB231: 'https://youtu.be/iYBlBlWvVlo',
  WB232: 'https://youtu.be/iqQK4UuTe7U',
  WB233: 'https://youtu.be/dZGF1xp__p4',
  WB234: 'https://youtu.be/b-Wae14fIEw',
  WB240: 'https://youtu.be/evTWDiL4hoY',
  WB241: 'https://youtu.be/a4dsQ0noPKg',
  WB242: 'https://youtu.be/HvyYw-3-uAA',
  WB250: 'https://youtu.be/znU6zTfkJ-k',
  WB251: 'https://youtu.be/Zyh3qAQuKrk',
  WB252: 'https://youtu.be/2OdrdaO6H78',
  WB253: 'https://youtu.be/YVZJNGFExUk',
  WB260: 'https://youtu.be/s0GoM7DH_k0',
  WB261: 'https://youtu.be/nhiPKVQQEIs',
  WB262: 'https://youtu.be/OTjlNOMJY3Q',
  WB270: 'https://youtu.be/3LhlpOLi8vQ',
  WB271: 'https://youtu.be/I5KRiRHvqgI',
  WB272: 'https://youtu.be/V5NqOcao1gQ',
  WB273: 'https://youtu.be/eoMXVqAZQ_w',
  WB274: 'https://youtu.be/ZpXkTYUqvYE',
  WB275: 'https://youtu.be/fC-uSpvhtV4',
  WB276: 'https://youtu.be/FNTy8RK-BTI', // FLEX 릴렉싱 4 (DIY)
  WB310J: 'https://youtu.be/nEBGwX5NQ60',
  WB310C: 'https://youtu.be/_3WbCNIkqYA',
  WB311: 'https://youtu.be/Yf82kcft65o',
  WB312: 'https://youtu.be/JY8lnoiFmbQ',
  WB320: 'https://youtu.be/8cgQ-yzAoRg',
  WB321: 'https://youtu.be/XNjN_Yl4k6E',
  WB322: 'https://youtu.be/GHAMr9rhHHs',
  WB330: 'https://youtu.be/gT0JlH0py_4',
  WB331: 'https://youtu.be/fyyagNx8RdY',
  WB332: 'https://youtu.be/s2bPlFbiK_E',
  WB340: 'https://youtu.be/AWAl42xidEI',
  WB341: 'https://youtu.be/oRGtUbI46Mc',
  WB342: 'https://youtu.be/RaOPM-sx3oY',
  WB343: 'https://youtu.be/6zzBqPClw4Q',
  WB344: 'https://youtu.be/xu_rsK8oNE4',
  WB345: 'https://youtu.be/FNTy8RK-BTI',
  WB346: '',
  WB350: 'https://youtu.be/pdGgYSAgiNk',
  WB351: 'https://youtu.be/ZWSLjrOWv4I',
  WB352: 'https://youtu.be/TZQjdf7i8Xg',
  WB353: 'https://youtu.be/RittrDqQYQ8',
  WB354: 'https://youtu.be/OGXrJ0o_Pyo',
  WB355: 'https://youtu.be/_kPuaPTdTmA',
  WB356: 'https://youtu.be/FNTy8RK-BTI', // SAY 릴렉싱 4 (DIY)
  WB410: 'https://youtu.be/8AeyhxcXuVU',
  WB411: 'https://youtu.be/oYaQpOwJqNo',
  WB412: 'https://youtu.be/dFYYk39vqwU',
  WB413: 'https://youtu.be/k48Yf9uUgB4',
  WB414: 'https://youtu.be/X4SRVQJ2u1M',
  WB420: 'https://youtu.be/TORdoygbtK0',
  WB421: 'https://youtu.be/DnEePY_Ul7E',
  WB422: 'https://youtu.be/HK65SC9UGR8',
  WB423: 'https://youtu.be/lDAjFge09T4',
  WB424: 'https://youtu.be/V_QIX8n4Wvc',
  WB425: 'https://youtu.be/8fL8fmURwWg', // 라이팅 NEWME_W 릴렉싱 3 (배리어프리1)
  /** NEWME_W 릴렉싱 WB425와 함께 표시되는 추가 박스 (0화 오리지널) */
  WB425B: 'https://youtu.be/F3KTcIKuus8',
  WB426: 'https://youtu.be/lPKAVLu-ocg', // 라이팅 NEWME_W 릴렉싱 4 (배리어프리2)
};

function getWbUrl(code) {
  return WB_AUDIO_URLS[code] || '';
}

// 드로잉 콘텐츠 DB 코드별 유튜브 음원 매핑
// **0=편지, **1=본활동(편지와 같은 페이지), **2=돌아보기, **3,4,5...=릴렉싱
const DB_AUDIO_URLS = {
  DB110: 'https://youtu.be/u0JUZu3PdPs', DB111: 'https://youtu.be/hiS-9lf5s0A', DB112: 'https://youtu.be/K-O8qMkIu7A',
  DB120: 'https://youtu.be/lRVJrylUX6I', DB121: 'https://youtu.be/TsIc56CvI4Y', DB122: 'https://youtu.be/WiZjPZrqRd8', DB123: 'https://youtu.be/TqKSOka0XfY',
  DB130: 'https://youtu.be/CzbBUiJGwOE', DB131: 'https://youtu.be/FrzuYyjQ4os', DB132: 'https://youtu.be/V9puABY20eI',
  DB140: 'https://youtu.be/43rauitEHQQ', DB141: 'https://youtu.be/FvIOTkDUl1c', DB142: 'https://youtu.be/7BKSMDwilFg', DB143: 'https://youtu.be/B3xRUrxBvV8',
  DB210: 'https://youtu.be/jseFRXY7MS0', DB211: 'https://youtu.be/P1RMAc-J0Kg', DB212: 'https://youtu.be/GpMu9b3DwGI',
  DB220: 'https://youtu.be/bxZTQ0BNngk', DB221: 'https://youtu.be/IXFmxcMOiLc', DB222: 'https://youtu.be/xelO87YaoWY', DB223: 'https://youtu.be/h8-P9GbljYU',
  DB230: 'https://youtube.com/shorts/kPPI_QXEnGw?feature=share', DB231: 'https://youtu.be/r31_ghwk0Nw', DB232: 'https://youtu.be/ZNXs5veNClo',
  DB240: 'https://youtu.be/YTznWjyjFdk', DB241: 'https://youtu.be/InBPdu79jNE', DB242: 'https://youtu.be/qFkjY3qnWRQ', DB243: 'https://youtu.be/edpl58QPbqg',
  DB250: 'https://youtu.be/SzGSpp6S2pk', DB251: 'https://youtu.be/6mAaHFhhWTE', DB252: 'https://youtu.be/D72xYVN6MAk',
  DB260: 'https://youtu.be/Q8y49_oOEUI', DB261: 'https://youtu.be/JPSBfwIIdtI', DB262: 'https://youtu.be/RyulpKShAJg', DB263: 'https://youtu.be/HgF9tr3rGJ4',
  DB264: 'https://youtu.be/8fL8fmURwWg', // 드로잉 TRIP_D 특별기획 배리어프리1(윌유메리미)
  /** TRIP_D 릴렉싱 DB264와 함께 표시되는 추가 박스 (0화 오리지널) */
  DB264B: 'https://youtu.be/F3KTcIKuus8',
  DB310: 'https://youtu.be/okl5rMXoCGM', DB311: 'https://youtu.be/JTaSx7uaR7A', DB312: 'https://youtu.be/pqH3pHBvpmA',
  DB320: 'https://youtube.com/shorts/2YfeWEKjA1U?feature=share', DB321: 'https://youtu.be/5owCGbZAT08', DB322: 'https://youtu.be/J8WD0ne_Uuk', DB323: 'https://youtu.be/lFviHZlFy10',
  DB330: 'https://youtu.be/mW_Vr5FGCZY', DB331: 'https://youtu.be/VceVGjEv34k', DB332: 'https://youtu.be/N0p1LSVk2hs',
  DB340: 'https://youtu.be/6pWFennsAkw', DB341: 'https://youtu.be/i0zIDLNr9kM', DB342: 'https://youtu.be/e0RiZd6ubuI', DB343: 'https://youtu.be/li0IH3v5q7g',
  DB350: 'https://youtu.be/1374LJHWHiM', DB351: 'https://youtu.be/UMz3Ekx3kK0', DB352: 'https://youtu.be/UEudGx4ZXro',
  DB360: 'https://youtu.be/GFY-XgKORAs', DB361: 'https://youtu.be/5IjlxUQv4Tw', DB362: 'https://youtu.be/91xX34FobFY', DB363: 'https://youtu.be/Du1Bh1sPHso',
  DB364: 'https://youtu.be/lPKAVLu-ocg', // 드로잉 LOOK 특별기획 배리어프리2(어린 왕자 삽화 묘사)
  DB410: 'https://youtu.be/VuRAT-9ZWCE', DB411: 'https://youtu.be/n0u97jRCVw8', DB412: 'https://youtu.be/u1SOCwpeipY',
  DB420: 'https://youtu.be/lAlNntbVmMI', DB421: 'https://youtu.be/S2EUXD4MlE0', DB422: 'https://youtu.be/0MeGLHL73Pk', DB423: 'https://youtu.be/VaQUAbsVkG0',
};

function getDbUrl(code) {
  return DB_AUDIO_URLS[code] || '';
}

/** 릴렉싱 WB425(NEWME_W idx2) / DB264(TRIP_D idx1) 추가 음원 박스 표시 여부 */
let lastMissionRelaxAltSlotKey = '';

function isRelaxAltPlaybackVisible() {
  if (typeof currentMissionViewMode === 'undefined' || currentMissionViewMode !== 'relaxing') return false;
  const idx = Number(currentRelaxingIdx) || 0;
  if (currentMissionId === 'NEWME_W' && idx === 2) return true;
  if (currentMissionId === 'TRIP_D' && idx === 1) return true;
  return false;
}

function getMissionRelaxAltUrl() {
  if (!isRelaxAltPlaybackVisible()) return null;
  if (currentMissionId === 'NEWME_W') return getWbUrl('WB425B');
  if (currentMissionId === 'TRIP_D') return getDbUrl('DB264B');
  return null;
}

// 레코딩 콘텐츠 RB 코드별 유튜브 음원 매핑
// **0=편지, **1=본활동(편지와 같은 페이지), **2=돌아보기, **3,4,5...=릴렉싱
const RB_AUDIO_URLS = {
  RB110: 'https://youtu.be/Yjd3beto_zI',
  RB111: 'https://youtu.be/FoCLU7lSGUQ',
  RB112: 'https://youtu.be/TZQjdf7i8Xg',
  RB120: 'https://youtu.be/w9XWfleBqPU',
  RB121: 'https://youtu.be/_nq1WkWax-g',
  RB122: 'https://youtu.be/LfWBn1eCWHc',
  RB130: 'https://youtu.be/otJc5mH0YQ0',
  RB131: 'https://youtube.com/shorts/vHHs9zCN1PU?feature=share',
  RB132: 'https://youtu.be/7VPV0Y5PtSw',
  RB133: 'https://youtu.be/HpNXqbv9hAQ',
  RB140: 'https://youtu.be/lA4CG0bMdfg',
  RB141: 'https://youtube.com/shorts/k-UkCyyFrzU?feature=share',
  RB142: 'https://youtu.be/W8XeHtMW92I',
  RB150: 'https://youtu.be/ZMeeO-LZ5u8',
  RB151: 'https://youtube.com/shorts/UXuoFb_YwJw?feature=share',
  RB152: 'https://youtu.be/8OTKb9aOdWM',
  RB160: 'https://youtu.be/etnBQwtTdv4',
  RB161: 'https://youtu.be/7EBNAoNLRew',
  RB162: 'https://youtu.be/C8uisW_p8Kw',
  RB163: 'https://youtu.be/ZQ8p2A6IbZY',
  RB210: 'https://youtu.be/vjYit9wxUvo',
  RB211: 'https://youtu.be/vb6Xx9WG-aQ',
  RB212: 'https://youtu.be/u2SK2SpGvwo',
  RB220: 'https://youtube.com/shorts/YuzLRo5IxTQ?feature=share',
  RB221: 'https://youtu.be/0yef-bP3WGY',
  RB222: 'https://youtu.be/gTEfxtBk4dI',
  RB230: 'https://youtu.be/Bl6gU5q8l2Q',
  RB231: 'https://youtu.be/w-8ObXFZVbE',
  RB232: 'https://youtu.be/WpAtR4-iC4c',
  RB233: 'https://youtu.be/82wrfZ2AydQ',
  RB240: 'https://youtube.com/shorts/i9caUzi3oB8?feature=share',
  RB241: 'https://youtube.com/shorts/qWqScYCsCt4?feature=share',
  RB242: 'https://youtu.be/1MReeXRRcWQ',
  RB250: 'https://youtu.be/xhICyAd5TOY',
  RB251: 'https://youtu.be/O43tyfGMD8A',
  RB252: 'https://youtu.be/TPl1ZMOI7J0',
  RB253: 'https://youtu.be/f6ZHmWBc3g4',
  RB310: 'https://youtu.be/It9SJ49PjEw',
  RB311: 'https://youtube.com/shorts/IY2KSYO9x8I?feature=share',
  RB312: 'https://youtu.be/mPIVkp7wGrg',
  RB320: 'https://youtu.be/YCWlgN9qQik',
  RB321: 'https://youtube.com/shorts/S-iKQ0dHiAo?feature=share',
  RB322: 'https://youtu.be/n_jgC6ZGzsk',
  RB323: 'https://youtu.be/iVddH1zr4Ys',
  RB330: 'https://youtu.be/DQgiuihCDdA',
  RB331: 'https://youtu.be/Pgqikz4_OK8',
  RB332: 'https://youtu.be/CQBRQRC9yEg',
  RB340: 'https://youtu.be/dF61ncVFXZ0',
  RB341: 'https://youtu.be/adZBCdUNGfc',
  RB342: 'https://youtu.be/fhdJ4PRdz3A',
  RB343: 'https://youtu.be/sMCRoI96vN8',
  RB410: 'https://youtu.be/75_UE7HvfuM',
  RB411: 'https://youtu.be/Fn5CF_Y1-5g',
  RB412: 'https://youtu.be/UkSZXCTG4uE',
  RB420: 'https://youtu.be/eAD9z8eS3Ag',
  RB421: 'https://youtu.be/iSNGTCS3jaY',
  RB422: 'https://youtu.be/VklSzoAkDYg',
};

function getRbUrl(code) {
  return RB_AUDIO_URLS[code] || '';
}

// 레코딩 미션별 기본 RB 음원 매핑 (entries[0]=편지, entries[1]=본활동, lookingBackUrls[0]=돌아보기, relaxingUrls=릴렉싱)
const DEFAULT_RECORDING_MISSION_AUDIO = {
  VOICE:           { entries: [{ url: getRbUrl('RB110') }, { url: getRbUrl('RB111') }].filter(e => e.url), lookingBackUrls: [getRbUrl('RB112')].filter(Boolean) },
  MYSELF:          { entries: [{ url: getRbUrl('RB120') }, { url: getRbUrl('RB121') }].filter(e => e.url), lookingBackUrls: [getRbUrl('RB122')].filter(Boolean) },
  TODAY:           { entries: [{ url: getRbUrl('RB130') }, { url: getRbUrl('RB131') }].filter(e => e.url), lookingBackUrls: [getRbUrl('RB132')].filter(Boolean), relaxingUrls: [getRbUrl('RB133')].filter(Boolean) },
  DIARY:           { entries: [{ url: getRbUrl('RB140') }, { url: getRbUrl('RB141') }].filter(e => e.url), lookingBackUrls: [getRbUrl('RB142')].filter(Boolean) },
  POINT:           { entries: [{ url: getRbUrl('RB150') }, { url: getRbUrl('RB151') }].filter(e => e.url), lookingBackUrls: [getRbUrl('RB152')].filter(Boolean) },
  LIST:            { entries: [{ url: getRbUrl('RB160') }, { url: getRbUrl('RB161') }].filter(e => e.url), lookingBackUrls: [getRbUrl('RB162')].filter(Boolean), relaxingUrls: [getRbUrl('RB163')].filter(Boolean) },
  'TIME AND MONEY':{ entries: [{ url: getRbUrl('RB210') }, { url: getRbUrl('RB211') }].filter(e => e.url), lookingBackUrls: [getRbUrl('RB212')].filter(Boolean) },
  FOND:            { entries: [{ url: getRbUrl('RB220') }, { url: getRbUrl('RB221') }].filter(e => e.url), lookingBackUrls: [getRbUrl('RB222')].filter(Boolean) },
  DISLIKE:         { entries: [{ url: getRbUrl('RB230') }, { url: getRbUrl('RB231') }].filter(e => e.url), lookingBackUrls: [getRbUrl('RB232')].filter(Boolean), relaxingUrls: [getRbUrl('RB233')].filter(Boolean) },
  REMAIN:          { entries: [{ url: getRbUrl('RB240') }, { url: getRbUrl('RB241') }].filter(e => e.url), lookingBackUrls: [getRbUrl('RB242')].filter(Boolean) },
  EMOTION:         { entries: [{ url: getRbUrl('RB250') }, { url: getRbUrl('RB251') }].filter(e => e.url), lookingBackUrls: [getRbUrl('RB252')].filter(Boolean), relaxingUrls: [getRbUrl('RB253')].filter(Boolean) },
  PARTNER:         { entries: [{ url: getRbUrl('RB310') }, { url: getRbUrl('RB311') }].filter(e => e.url), lookingBackUrls: [getRbUrl('RB312')].filter(Boolean) },
  ONCE:            { entries: [{ url: getRbUrl('RB320') }, { url: getRbUrl('RB321') }].filter(e => e.url), lookingBackUrls: [getRbUrl('RB322')].filter(Boolean), relaxingUrls: [getRbUrl('RB323')].filter(Boolean) },
  SUPPORT:         { entries: [{ url: getRbUrl('RB330') }, { url: getRbUrl('RB331') }].filter(e => e.url), lookingBackUrls: [getRbUrl('RB332')].filter(Boolean) },
  LETTER:          { entries: [{ url: getRbUrl('RB340') }, { url: getRbUrl('RB341') }].filter(e => e.url), lookingBackUrls: [getRbUrl('RB342')].filter(Boolean), relaxingUrls: [getRbUrl('RB343')].filter(Boolean) },
  'ABOUT ME':      { entries: [{ url: getRbUrl('RB343') }].filter(e => e.url) },
  'MY SIDE':       { entries: [{ url: getRbUrl('RB410') }, { url: getRbUrl('RB411') }].filter(e => e.url), lookingBackUrls: [getRbUrl('RB412')].filter(Boolean) },
  "IT'S ME":       { entries: [{ url: getRbUrl('RB420') }, { url: getRbUrl('RB421') }].filter(e => e.url), lookingBackUrls: [getRbUrl('RB422')].filter(Boolean) },
};

// 드로잉 미션별 기본 DB 음원 매핑 (entries[0]=편지, entries[1]=본활동, lookingBackUrls[0]=돌아보기, relaxingUrls[0]=릴렉싱)
const DEFAULT_DRAWING_MISSION_AUDIO = {
  MUSIC:   { entries: [{ url: getDbUrl('DB110') }, { url: getDbUrl('DB111') }], lookingBackUrls: [getDbUrl('DB112')].filter(Boolean) },
  PAINT:   { entries: [{ url: getDbUrl('DB120') }, { url: getDbUrl('DB121') }], lookingBackUrls: [getDbUrl('DB122')].filter(Boolean), relaxingUrls: [getDbUrl('DB123')].filter(Boolean) },
  COLOR:   { entries: [{ url: getDbUrl('DB130') }, { url: getDbUrl('DB131') }], lookingBackUrls: [getDbUrl('DB132')].filter(Boolean) },
  ONE:     { entries: [{ url: getDbUrl('DB140') }, { url: getDbUrl('DB141') }], lookingBackUrls: [getDbUrl('DB142')].filter(Boolean), relaxingUrls: [getDbUrl('DB143')].filter(Boolean) },
  Favorite:{ entries: [{ url: getDbUrl('DB210') }, { url: getDbUrl('DB211') }], lookingBackUrls: [getDbUrl('DB212')].filter(Boolean) },
  JANUS:   { entries: [{ url: getDbUrl('DB220') }, { url: getDbUrl('DB221') }], lookingBackUrls: [getDbUrl('DB222')].filter(Boolean), relaxingUrls: [getDbUrl('DB223')].filter(Boolean) },
  IF:      { entries: [{ url: getDbUrl('DB230') }, { url: getDbUrl('DB231') }], lookingBackUrls: [getDbUrl('DB232')].filter(Boolean) },
  ROAD:    { entries: [{ url: getDbUrl('DB240') }, { url: getDbUrl('DB241') }], lookingBackUrls: [getDbUrl('DB242')].filter(Boolean), relaxingUrls: [getDbUrl('DB243')].filter(Boolean) },
  FACE:    { entries: [{ url: getDbUrl('DB250') }, { url: getDbUrl('DB251') }], lookingBackUrls: [getDbUrl('DB252')].filter(Boolean) },
  TRIP_D:  { entries: [{ url: getDbUrl('DB260') }, { url: getDbUrl('DB261') }], lookingBackUrls: [getDbUrl('DB262')].filter(Boolean), relaxingUrls: [getDbUrl('DB263'), getDbUrl('DB264')] },
  SINKHOLE:{ entries: [{ url: getDbUrl('DB310') }, { url: getDbUrl('DB311') }], lookingBackUrls: [getDbUrl('DB312')].filter(Boolean) },
  RAIN:    { entries: [{ url: getDbUrl('DB320') }, { url: getDbUrl('DB321') }], lookingBackUrls: [getDbUrl('DB322')].filter(Boolean), relaxingUrls: [getDbUrl('DB323')].filter(Boolean) },
  ANIMAL:  { entries: [{ url: getDbUrl('DB330') }, { url: getDbUrl('DB331') }], lookingBackUrls: [getDbUrl('DB332')].filter(Boolean) },
  NETWORK: { entries: [{ url: getDbUrl('DB340') }, { url: getDbUrl('DB341') }], lookingBackUrls: [getDbUrl('DB342')].filter(Boolean), relaxingUrls: [getDbUrl('DB343')].filter(Boolean) },
  THINK:   { entries: [{ url: getDbUrl('DB350') }, { url: getDbUrl('DB351') }], lookingBackUrls: [getDbUrl('DB352')].filter(Boolean) },
  LOOK:    { entries: [{ url: getDbUrl('DB360') }, { url: getDbUrl('DB361') }], lookingBackUrls: [getDbUrl('DB362')].filter(Boolean), relaxingUrls: [getDbUrl('DB363'), getDbUrl('DB364')] },
  RETOUCH: { entries: [{ url: getDbUrl('DB410') }, { url: getDbUrl('DB411') }], lookingBackUrls: [getDbUrl('DB412')].filter(Boolean) },
  NEWME:   { entries: [{ url: getDbUrl('DB420') }, { url: getDbUrl('DB421') }], lookingBackUrls: [getDbUrl('DB422')].filter(Boolean), relaxingUrls: [getDbUrl('DB423')].filter(Boolean) },
};

// 미션별 기본 WB 음원 매핑 (entries[0]=편지, entries[1]=본활동, lookingBackUrls[0]=돌아보기, relaxingUrls=릴렉싱)
const DEFAULT_MISSION_AUDIO = {
  // Part 1
  ALONG:   {
    entries: [
      { url: getWbUrl('WB110') },
      { url: getWbUrl('WB111') },
    ].filter(e => e.url),
  },
  'STAR I': {
    entries:        [{ url: getWbUrl('WB120') }, { url: getWbUrl('WB121') }].filter(e => e.url),
    lookingBackUrls:[getWbUrl('WB122')].filter(Boolean),
    relaxingUrls:   [getWbUrl('WB123'), getWbUrl('WB124'), getWbUrl('WB125'), getWbUrl('WB126')].filter(Boolean),
  },
  ASK: {
    entries:        [{ url: getWbUrl('WB130') }, { url: getWbUrl('WB131') }].filter(e => e.url),
    lookingBackUrls:[getWbUrl('WB132')].filter(Boolean),
  },
  NAME: {
    entries:        [{ url: getWbUrl('WB140') }, { url: getWbUrl('WB141') }].filter(e => e.url),
    lookingBackUrls:[getWbUrl('WB142')].filter(Boolean),
    relaxingUrls:   [getWbUrl('WB143'), getWbUrl('WB144')].filter(Boolean),
  },
  'STAR II': {
    entries:        [{ url: getWbUrl('WB150') }, { url: getWbUrl('WB151') }].filter(e => e.url),
    lookingBackUrls:[getWbUrl('WB152')].filter(Boolean),
    relaxingUrls:   [getWbUrl('WB153'), getWbUrl('WB154')].filter(Boolean),
  },
  ABOUT: {
    entries:        [{ url: getWbUrl('WB160') }, { url: getWbUrl('WB161') }].filter(e => e.url),
    lookingBackUrls:[getWbUrl('WB162')].filter(Boolean),
    relaxingUrls:   [getWbUrl('WB163'), getWbUrl('WB164'), getWbUrl('WB165'), getWbUrl('WB166')].filter(Boolean),
  },
  // Part 2
  WORDS: {
    entries:        [{ url: getWbUrl('WB210') }, { url: getWbUrl('WB211') }].filter(e => e.url),
    lookingBackUrls:[getWbUrl('WB212')].filter(Boolean),
  },
  DAY: {
    entries:        [{ url: getWbUrl('WB220') }, { url: getWbUrl('WB221') }].filter(e => e.url),
    lookingBackUrls:[getWbUrl('WB222')].filter(Boolean),
  },
  LIST_W: {
    entries:        [{ url: getWbUrl('WB230') }, { url: getWbUrl('WB231') }].filter(e => e.url),
    lookingBackUrls:[getWbUrl('WB232')].filter(Boolean),
    relaxingUrls:   [getWbUrl('WB233'), getWbUrl('WB234')].filter(Boolean),
  },
  BRAIN: {
    entries:        [{ url: getWbUrl('WB240') }, { url: getWbUrl('WB241') }].filter(e => e.url),
    lookingBackUrls:[getWbUrl('WB242')].filter(Boolean),
  },
  HARD: {
    entries:        [{ url: getWbUrl('WB250') }, { url: getWbUrl('WB251') }].filter(e => e.url),
    lookingBackUrls:[getWbUrl('WB252')].filter(Boolean),
    relaxingUrls:   [getWbUrl('WB253')].filter(Boolean),
  },
  DIARY_W: {
    entries:        [{ url: getWbUrl('WB260') }, { url: getWbUrl('WB261') }].filter(e => e.url),
    lookingBackUrls:[getWbUrl('WB262')].filter(Boolean),
  },
  FLEX: {
    entries:        [{ url: getWbUrl('WB270') }, { url: getWbUrl('WB271') }].filter(e => e.url),
    lookingBackUrls:[getWbUrl('WB272')].filter(Boolean),
    relaxingUrls:   [getWbUrl('WB273'), getWbUrl('WB274'), getWbUrl('WB275'), getWbUrl('WB276')].filter(Boolean),
  },
  // Part 3
  GIFT: {
    // 0: 편지1(WB310J), 1: 편지2(WB310C), 2: 미션(WB311)
    entries:        [{ url: getWbUrl('WB310J') }, { url: getWbUrl('WB310C') }, { url: getWbUrl('WB311') }].filter(e => e.url),
    lookingBackUrls:[getWbUrl('WB312')].filter(Boolean),
  },
  RELATION: {
    entries:        [{ url: getWbUrl('WB320') }, { url: getWbUrl('WB321') }].filter(e => e.url),
    lookingBackUrls:[getWbUrl('WB322')].filter(Boolean),
  },
  FRIEND: {
    entries:        [{ url: getWbUrl('WB330') }, { url: getWbUrl('WB331') }].filter(e => e.url),
    lookingBackUrls:[getWbUrl('WB332')].filter(Boolean),
  },
  TRIP: {
    entries:        [{ url: getWbUrl('WB340') }, { url: getWbUrl('WB341') }].filter(e => e.url),
    lookingBackUrls:[getWbUrl('WB342')].filter(Boolean),
    relaxingUrls:   [getWbUrl('WB343'), getWbUrl('WB344'), getWbUrl('WB345'), getWbUrl('WB346')].filter(Boolean),
  },
  SAY: {
    entries:        [{ url: getWbUrl('WB350') }, { url: getWbUrl('WB351') }].filter(e => e.url),
    lookingBackUrls:[getWbUrl('WB352')].filter(Boolean),
    relaxingUrls:   [getWbUrl('WB353'), getWbUrl('WB354'), getWbUrl('WB355'), getWbUrl('WB356')].filter(Boolean),
  },
  // Part 4
  HOPE: {
    entries:        [{ url: getWbUrl('WB410') }, { url: getWbUrl('WB411') }].filter(e => e.url),
    lookingBackUrls:[getWbUrl('WB412')].filter(Boolean),
    relaxingUrls:   [getWbUrl('WB413'), getWbUrl('WB414')].filter(Boolean),
  },
  NEWME_W: {
    entries:        [{ url: getWbUrl('WB420') }, { url: getWbUrl('WB421') }].filter(e => e.url),
    lookingBackUrls:[getWbUrl('WB422')].filter(Boolean),
    relaxingUrls:   [getWbUrl('WB423'), getWbUrl('WB424'), getWbUrl('WB425'), getWbUrl('WB426')],
  },
};

// 본활동별 Looking Back 전용 오디오 키 (관리자 페이지에서 각기 다른 음원 설정용)
const LOOKING_BACK_AUDIO_KEYS = {
  // 레코딩
  VOICE: 'VOICE_LB',
  'TIME AND MONEY': 'TIME AND MONEY_LB',
  FOND: 'FOND_LB',
  DISLIKE: 'DISLIKE_LB',
  REMAIN: 'REMAIN_LB',
  EMOTION: 'EMOTION_LB',
  PARTNER: 'PARTNER_LB',
  ONCE: 'ONCE_LB',
  SUPPORT: 'SUPPORT_LB',
  LETTER: 'LETTER_LB',
  'MY SIDE': 'MY SIDE_LB',
  "IT'S ME": "IT'S ME_LB",
  // 라이팅
  'STAR I': 'STAR I_LB',
  ASK: 'ASK_LB',
  NAME: 'NAME_LB',
  'STAR II': 'STAR II_LB',
  ABOUT: 'ABOUT_LB',
  WORDS: 'WORDS_LB',
  DAY: 'DAY_LB',
  LIST_W: 'LIST_W_LB',
  BRAIN: 'BRAIN_LB',
  HARD: 'HARD_LB',
  DIARY_W: 'DIARY_W_LB',
  FLEX: 'FLEX_LB',
  GIFT: 'GIFT_LB',
  RELATION: 'RELATION_LB',
  FRIEND: 'FRIEND_LB',
  TRIP: 'TRIP_LB',
  SAY: 'SAY_LB',
  HOPE: 'HOPE_LB',
  // 드로잉
  MUSIC: 'MUSIC_LB',
  PAINT: 'PAINT_LB',
  COLOR: 'COLOR_LB',
  ONE: 'ONE_LB',
  Favorite: 'Favorite_LB',
  JANUS: 'JANUS_LB',
  IF: 'IF_LB',
  ROAD: 'ROAD_LB',
  FACE: 'FACE_LB',
  TRIP_D: 'TRIP_D_LB',
  SINKHOLE: 'SINKHOLE_LB',
  RAIN: 'RAIN_LB',
  ANIMAL: 'ANIMAL_LB',
  NETWORK: 'NETWORK_LB',
  THINK: 'THINK_LB',
  LOOK: 'LOOK_LB',
  RETOUCH: 'RETOUCH_LB',
  NEWME: 'NEWME_LB',
};

// 유틸리티
function getData(key) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

function setData(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function bootstrapMissionAudioDefaultsFromWb() {
  try {
    const raw = localStorage.getItem('contique_mission_audio');
    let data = {};
    if (raw) {
      try { data = JSON.parse(raw) || {}; } catch { data = {}; }
    }
    // 모든 라이팅 미션의 음원을 DEFAULT_MISSION_AUDIO 기준으로 항상 덮어씀
    Object.entries(DEFAULT_MISSION_AUDIO).forEach(([missionId, cfg]) => {
      const entries = (cfg.entries || []).filter(e => e && e.url);
      const lookingBackUrls = (cfg.lookingBackUrls || []).filter(Boolean);
      // NEWME_W: 릴렉싱 4칸 인덱스 유지(빈 URL 슬롯 보존). 나머지는 빈 링크 제거.
      const relaxingUrls = missionId === 'NEWME_W'
        ? (cfg.relaxingUrls || []).map((u) => (u != null && String(u).trim() ? String(u).trim() : ''))
        : (cfg.relaxingUrls || []).filter(Boolean);
      if (!entries.length && !lookingBackUrls.length && !relaxingUrls.length) return;
      data[missionId] = {};
      if (entries.length) {
        // ASK: 편지 박스 라벨을 '25문 25답'으로 설정
        if (missionId === 'ASK' && entries[0]) entries[0] = { ...entries[0], text: '25문 25답' };
        data[missionId].entries = entries;
      }
      if (lookingBackUrls.length) data[missionId].lookingBackUrls = lookingBackUrls;
      if (relaxingUrls.length) data[missionId].relaxingUrls = relaxingUrls;
    });
    localStorage.setItem('contique_mission_audio', JSON.stringify(data));
  } catch (e) {
    console.error('[bootstrapMissionAudioDefaultsFromWb] error:', e);
  }
}

function bootstrapDrawingMissionAudio() {
  try {
    const raw = localStorage.getItem('contique_mission_audio');
    let data = {};
    if (raw) {
      try { data = JSON.parse(raw) || {}; } catch { data = {}; }
    }
    Object.entries(DEFAULT_DRAWING_MISSION_AUDIO).forEach(([missionId, cfg]) => {
      const entries = (cfg.entries || []).map(e => (typeof e === 'string' ? { url: e } : e)).filter(e => e && e.url);
      const lookingBackUrls = (cfg.lookingBackUrls || []).filter(Boolean);
      // TRIP_D / LOOK: 릴렉싱 2칸 인덱스 유지(빈 URL 슬롯 보존)
      const relaxingUrls = missionId === 'TRIP_D' || missionId === 'LOOK'
        ? (cfg.relaxingUrls || []).map((u) => (u != null && String(u).trim() ? String(u).trim() : ''))
        : (cfg.relaxingUrls || []).filter(Boolean);
      if (!entries.length && !lookingBackUrls.length && !relaxingUrls.length) return;
      data[missionId] = {};
      if (entries.length) data[missionId].entries = entries;
      if (lookingBackUrls.length) data[missionId].lookingBackUrls = lookingBackUrls;
      if (relaxingUrls.length) data[missionId].relaxingUrls = relaxingUrls;
    });
    localStorage.setItem('contique_mission_audio', JSON.stringify(data));
  } catch (e) {
    console.error('[bootstrapDrawingMissionAudio] error:', e);
  }
}

function bootstrapRecordingMissionAudio() {
  try {
    const raw = localStorage.getItem('contique_mission_audio');
    let data = {};
    if (raw) {
      try { data = JSON.parse(raw) || {}; } catch { data = {}; }
    }
    Object.entries(DEFAULT_RECORDING_MISSION_AUDIO).forEach(([missionId, cfg]) => {
      const mission = MISSION_DATA[missionId];
      const mainActivityText = mission?.mainActivity;
      let entries = (cfg.entries || []).map(e => (typeof e === 'string' ? { url: e } : e)).filter(e => e && e.url);
      // ABOUT ME(6): 릴렉싱 구조 — 편지 박스 없이 미션 박스에만 음원 연결
      if (missionId === 'ABOUT ME') {
        // entries[0]을 미션 박스(entries[1])로 이동, entries[0]은 비움
        const missionUrl = entries[0]?.url || '';
        entries = [
          { url: '', text: '' },
          { url: missionUrl, text: mainActivityText || '' },
        ];
        data[missionId] = { entries };
        return;
      }
      if (entries.length > 0) {
        entries = [...entries];
        entries[0] = { ...entries[0], text: '"편지 왔어요~"' };
      }
      if (mainActivityText && entries.length > 1) {
        entries[1] = { ...entries[1], text: mainActivityText };
      }
      const lookingBackUrls = (cfg.lookingBackUrls || []).filter(Boolean);
      const relaxingUrls = (cfg.relaxingUrls || []).filter(Boolean);
      if (!entries.length && !lookingBackUrls.length && !relaxingUrls.length) return;
      data[missionId] = {};
      if (entries.length) data[missionId].entries = entries;
      if (lookingBackUrls.length) data[missionId].lookingBackUrls = lookingBackUrls;
      if (relaxingUrls.length) data[missionId].relaxingUrls = relaxingUrls;
    });
    localStorage.setItem('contique_mission_audio', JSON.stringify(data));
  } catch (e) {
    console.error('[bootstrapRecordingMissionAudio] error:', e);
  }
}

function checkAppVersion() {
  const stored = getData(STORAGE_KEYS.appVersion);
  if (stored === APP_VERSION) return;
  setData(STORAGE_KEYS.appVersion, APP_VERSION);
}

function getContents() {
  const data = getData(STORAGE_KEYS.contents);
  return data && data.length ? data : defaultContents;
}

function getPosts() {
  const data = getData(STORAGE_KEYS.posts);
  return data && data.length ? data : defaultPosts;
}

function getActivities() {
  const data = getData(STORAGE_KEYS.activities);
  return data || [];
}

function getMissionPhotos() {
  const data = getData(STORAGE_KEYS.missionPhotos);
  return Array.isArray(data) ? data : [];
}

function getRecordings() {
  const data = getData(STORAGE_KEYS.recordings);
  return Array.isArray(data) ? data : [];
}

function getPhotoActivityKey(p) {
  return `${p.mode || 'writing'}_${p.part ?? 1}_${p.missionId || ''}_${p.viewMode || 'main'}_${p.relaxingIdx ?? 0}`;
}

function saveMissionPhoto(photo) {
  let photos = getMissionPhotos();
  const newKey = getPhotoActivityKey(photo);
  photos = photos.filter(p => getPhotoActivityKey(p) !== newKey);
  photos.unshift(photo);
  setData(STORAGE_KEYS.missionPhotos, photos);
}

function updateMissionPhotoImpression(photoId, impression) {
  const photos = getMissionPhotos();
  const idx = photos.findIndex(p => p.id === photoId);
  if (idx !== -1) {
    photos[idx] = { ...photos[idx], impression: impression || '' };
    setData(STORAGE_KEYS.missionPhotos, photos);
  }
}

function deleteMissionPhoto(photoId) {
  if (!confirm('이 사진을 삭제하시겠습니까?')) return;
  const photos = getMissionPhotos().filter(p => p.id !== photoId);
  setData(STORAGE_KEYS.missionPhotos, photos);
  renderMyContents();
}

function openPhotoFullscreen(dataUrl) {
  const modal = document.getElementById('photo-fullscreen-modal');
  const img = document.getElementById('photo-fullscreen-img');
  if (modal && img) {
    img.src = dataUrl;
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
}

function openPhotoFullscreenById(photoId) {
  const p = getMissionPhotos().find(x => x.id === photoId);
  if (p && p.photoDataUrl) {
    window.__fullscreenPhotoId = photoId;
    openPhotoFullscreen(p.photoDataUrl);
  }
}

function sharePhotoToCafeFromFullscreen() {
  if (window.__fullscreenPhotoId) {
    sharePhotoToCafe(window.__fullscreenPhotoId);
    const modal = document.getElementById('photo-fullscreen-modal');
    const img = document.getElementById('photo-fullscreen-img');
    if (modal) modal.classList.add('hidden');
    if (img) img.src = '';
    document.body.style.overflow = '';
  }
  window.__fullscreenPhotoId = null;
}

function closePhotoFullscreen(e) {
  if (e && e.target !== e.currentTarget && !e.target.classList.contains('photo-fullscreen-close')) return;
  const modal = document.getElementById('photo-fullscreen-modal');
  const img = document.getElementById('photo-fullscreen-img');
  if (modal && img) {
    modal.classList.add('hidden');
    img.src = '';
    document.body.style.overflow = '';
    window.__fullscreenPhotoId = null;
  }
}

function updateMissionPhotoImpressionFromInput(elOrId, value) {
  let photoId, val;
  if (typeof elOrId === 'string') {
    photoId = elOrId;
    val = value;
  } else if (elOrId && elOrId.dataset) {
    photoId = elOrId.dataset.photoId;
    val = elOrId.value;
  }
  if (photoId) updateMissionPhotoImpression(photoId, (val || '').trim());
}

function updateRecordingMemo(recordingId, text) {
  const recordings = getRecordings();
  const idx = recordings.findIndex(r => String(r.id) === String(recordingId));
  if (idx !== -1) {
    recordings[idx] = { ...recordings[idx], memo: (text || '').trim() };
    setData(STORAGE_KEYS.recordings, recordings);
  }
}

function updateRecordingMemoFromInput(el) {
  if (!el || !el.dataset) return;
  const id = el.dataset.recordingId;
  if (id) updateRecordingMemo(id, el.value);
}

function getCompletedMissionKey(mode, part, missionId, viewMode, relaxingIdx) {
  return `${mode}_${part}_${missionId || ''}_${viewMode || 'main'}_${relaxingIdx || 0}`;
}

function getActivityKey(a) {
  const mode = partActivityMode;
  const part = partActivityPart;
  let missionId, viewMode, relaxingIdx;
  if (a.relaxingFor !== undefined) {
    missionId = a.relaxingFor;
    viewMode = 'relaxing';
    relaxingIdx = a.relaxingIdx || 0;
  } else if (a.lookingBackFor) {
    missionId = a.lookingBackFor;
    viewMode = 'lookingback';
    relaxingIdx = 0;
  } else {
    missionId = getMissionIdFromActivity(a);
    viewMode = 'main';
    relaxingIdx = 0;
  }
  return getCompletedMissionKey(mode, part, missionId, viewMode, relaxingIdx);
}

function getCompletedMissions() {
  const data = getData(STORAGE_KEYS.completedMissions);
  return Array.isArray(data) ? data : [];
}

function markMissionCompleted() {
  const key = getCompletedMissionKey(partActivityMode, partActivityPart, currentMissionId, currentMissionViewMode, currentRelaxingIdx);
  const set = new Set(getCompletedMissions());
  set.add(key);
  setData(STORAGE_KEYS.completedMissions, [...set]);
}

function unmarkMissionCompleted() {
  const key = getCompletedMissionKey(partActivityMode, partActivityPart, currentMissionId, currentMissionViewMode, currentRelaxingIdx);
  const set = new Set(getCompletedMissions());
  set.delete(key);
  setData(STORAGE_KEYS.completedMissions, [...set]);
}

function isCurrentMissionCompleted() {
  const key = getCompletedMissionKey(partActivityMode, partActivityPart, currentMissionId, currentMissionViewMode, currentRelaxingIdx);
  return getCompletedMissions().includes(key);
}

function isActivityCompletedInGrid(a) {
  const mode = partActivityMode;
  const part = partActivityPart;
  let missionId, viewMode, relaxingIdx;
  if (a.relaxingFor !== undefined) {
    missionId = a.relaxingFor;
    viewMode = 'relaxing';
    relaxingIdx = a.relaxingIdx || 0;
  } else if (a.lookingBackFor) {
    missionId = a.lookingBackFor;
    viewMode = 'lookingback';
    relaxingIdx = 0;
  } else {
    missionId = a.label && MISSION_DATA[a.label] ? a.label : (a.sub && MISSION_DATA[a.sub] ? a.sub : a.label || a.sub || '');
    viewMode = 'main';
    relaxingIdx = 0;
  }
  const key = getCompletedMissionKey(mode, part, missionId, viewMode, relaxingIdx);
  return getCompletedMissions().includes(key);
}

// 직전 세션: 진행중/완료 저장 (콘텐츠 활동 이어서 하기용) - 모드별로 분리 저장
function saveLastSessionProgress(mode, part, missionId, viewMode, relaxingIdx) {
  const all = getData(STORAGE_KEYS.lastSession) || {};
  const perMode = (typeof all === 'object' && !all.type) ? all : {};
  perMode[mode] = {
    type: 'in_progress',
    mode, part, missionId,
    viewMode: viewMode || 'main',
    relaxingIdx: relaxingIdx || 0,
    timestamp: Date.now(),
  };
  setData(STORAGE_KEYS.lastSession, perMode);
}

function saveLastSessionCompleted(mode, part, missionId, viewMode, relaxingIdx) {
  const modeData = PART_ACTIVITIES[mode];
  const activities = (modeData && modeData[part]) || [];
  const idx = findCurrentActivityIndex(activities, missionId, viewMode, relaxingIdx);
  const nextActivity = idx >= 0 && idx < activities.length - 1 ? activities[idx + 1] : null;
  const all = getData(STORAGE_KEYS.lastSession) || {};
  const perMode = (typeof all === 'object' && !all.type) ? all : {};
  if (nextActivity && nextActivity.style !== 'current') {
    perMode[mode] = {
      type: 'completed',
      mode, part,
      nextMissionId: getMissionIdFromActivity(nextActivity),
      nextActivity,
      nextOnclick: buildActivityOnclick(nextActivity),
      timestamp: Date.now(),
    };
  } else {
    delete perMode[mode];
  }
  setData(STORAGE_KEYS.lastSession, Object.keys(perMode).length ? perMode : null);
}

function findCurrentActivityIndex(activities, missionId, viewMode, relaxingIdx) {
  for (let i = 0; i < activities.length; i++) {
    const a = activities[i];
    if (viewMode === 'relaxing') {
      if (a.relaxingFor === missionId && (a.relaxingIdx || 0) === (relaxingIdx || 0)) return i;
    } else if (viewMode === 'lookingback') {
      if (a.lookingBackFor === missionId) return i;
    } else {
      // 본활동(main) 모드: 활동 카드가 가리키는 실제 미션 ID 기준으로 비교
      // (예: 라이팅 ALONG은 label이 '기록완료', sub가 'ALONG'이므로 getMissionIdFromActivity를 사용)
      const mid = getMissionIdFromActivity(a);
      if (mid === missionId && !a.lookingBackFor && a.relaxingFor === undefined) return i;
    }
  }
  return -1;
}

function getMissionIdFromActivity(a) {
  if (a.label === 'ABOUT ME' && a.sub) return 'ABOUT ME';
  if (a.label && MISSION_DATA[a.label]) return a.label;
  if (a.sub && MISSION_DATA[a.sub]) return a.sub; // completed 카드(기록완료 등)
  return a.label || a.sub || 'LETTER';
}

function isFreeMission(mode, part, missionId, viewMode, relaxingIdx) {
  try {
    // 레코딩: VOICE / TIME AND MONEY와 그에 연결된 LOOKING BACK만 무료
    if (mode === 'recording') {
      if (part === 1 && missionId === 'VOICE') return true;
      if (part === 2 && missionId === 'TIME AND MONEY') return true;
      return false;
    }
    // 라이팅: 일부 릴렉싱 콘텐츠는 추가로 무료
    if (mode === 'writing' && viewMode === 'relaxing') {
      if (missionId === 'THINGS' || missionId === 'ANY' || missionId === 'COMPLETE' || missionId === 'TRASHCAN') return true;
    }
    // 라이팅/드로잉: 각 모드의 Part1/2 첫 번째, 두 번째 콘텐츠까지 무료
    if (part !== 1 && part !== 2) return false;
    const modeData = PART_ACTIVITIES[mode] || {};
    const acts = modeData[part] || [];
    if (!acts.length) return false;
    const idx = findCurrentActivityIndex(acts, missionId, viewMode, relaxingIdx);
    return idx === 0 || idx === 1;
  } catch {
    return false;
  }
}

async function ensureModeCouponUnlocked(mode, part, missionId, viewMode, relaxingIdx) {
  // 라이팅 릴렉싱: 특정 카드(THINGS/ANY/COMPLETE/TRASHCAN)는 항상 무료
  if (mode === 'writing' && viewMode === 'relaxing') {
    try {
      const modeData = PART_ACTIVITIES[mode] || {};
      const acts = modeData[part] || [];
      const a = acts.find(x => x.relaxingFor === missionId && (x.relaxingIdx || 0) === (relaxingIdx || 0));
      if (a) {
        const freeRelaxingLabels = new Set(['THINGS', 'ANY', 'COMPLETE', 'TRASHCAN']);
        if (freeRelaxingLabels.has(a.label)) return true;
      }
    } catch {}
  }

  // 무료 구간(각 모드 Part1/2의 1·2번째 콘텐츠 등)은 쿠폰 없이 사용 가능
  if (isFreeMission(mode, part, missionId, viewMode, relaxingIdx)) return true;

  const state = getModeCouponState();
  if (state[mode]) return true;

  await loadModeCoupons(mode);
  const set = MODE_COUPON_CACHE[mode] || new Set();
  if (!set.size) {
    showCouponToast('쿠폰 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.', true);
    return false;
  }
  const label = mode === 'writing' ? '라이팅'
    : mode === 'drawing' ? '드로잉'
    : mode === 'recording' ? '레코딩'
    : mode;

  let errorMessage = '';
  for (;;) {
    const code = await showCouponModal(label + ' 모드', errorMessage);
    if (code === null) return false;
    const trimmed = (code || '').trim();
    const normalized = trimmed.toUpperCase();
    if (!trimmed) {
      errorMessage = '쿠폰 번호를 입력해 주세요.';
      continue;
    }
    if (!set.has(normalized)) {
      errorMessage = '쿠폰 번호가 올바르지 않아요. 다시 확인해 주세요.';
      continue;
    }
    setModeCouponUnlocked(mode);
    closeCouponModal();
    showCouponToast(label + ' 모드의 모든 콘텐츠가 열렸어요!', false);
    return true;
  }
}

function showCouponToast(message, isError) {
  const toast = document.createElement('div');
  toast.className = 'mission-memo-toast' + (isError ? ' coupon-toast-error' : '');
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

let couponModalResolve = null;

function showCouponModal(modeLabel, errorMessage) {
  return new Promise((resolve) => {
    couponModalResolve = resolve;
    const modal = document.getElementById('coupon-modal');
    const titleEl = document.getElementById('coupon-modal-title');
    const descEl = document.getElementById('coupon-modal-desc');
    const inputEl = document.getElementById('coupon-modal-input');
    const errorEl = document.getElementById('coupon-modal-error');
    if (!modal || !titleEl || !inputEl || !errorEl) {
      resolve(null);
      return;
    }
    titleEl.textContent = modeLabel + ' 쿠폰';
    if (descEl) descEl.textContent = '해당 모드의 쿠폰 번호를 입력해 주세요.';
    inputEl.value = '';
    inputEl.focus();
    if (errorMessage) {
      errorEl.textContent = errorMessage;
      errorEl.classList.remove('hidden');
    } else {
      errorEl.textContent = '';
      errorEl.classList.add('hidden');
    }
    modal.classList.remove('hidden');
  });
}

function closeCouponModal() {
  const modal = document.getElementById('coupon-modal');
  if (modal) modal.classList.add('hidden');
  if (couponModalResolve) {
    couponModalResolve(null);
    couponModalResolve = null;
  }
}

function confirmCouponModal() {
  const inputEl = document.getElementById('coupon-modal-input');
  if (!couponModalResolve) return;
  const value = inputEl ? (inputEl.value || '').trim() : '';
  const resolve = couponModalResolve;
  couponModalResolve = null;
  const modal = document.getElementById('coupon-modal');
  if (modal) modal.classList.add('hidden');
  resolve(value);
}

function cancelCouponModal() {
  if (couponModalResolve) {
    couponModalResolve(null);
    couponModalResolve = null;
  }
  closeCouponModal();
}

function buildActivityOnclick(a) {
  if (a.style === 'current') return "navigate('recording-home')";
  if (a.relaxingFor !== undefined) {
    const parentId = (a.relaxingFor || '').replace(/'/g, "\\'");
    const idx = a.relaxingIdx || 0;
    const thumbArg = a.thumb ? ("'" + (a.thumb || '').replace(/'/g, "\\'") + "'") : "''";
    return `openRelaxingMission('${parentId}', ${idx}, ${thumbArg})`;
  }
  if (a.lookingBackFor) {
    const refId = (a.lookingBackFor || '').replace(/'/g, "\\'");
    const thumbArg = a.thumb ? ("'" + (a.thumb || '').replace(/'/g, "\\'") + "'") : "''";
    return `openMissionDetail('${refId}', ${thumbArg}, 1)`;
  }
  const id = (getMissionIdFromActivity(a) || '').replace(/'/g, "\\'");
  const thumbArg = a.thumb ? ("'" + (a.thumb || '').replace(/'/g, "\\'") + "'") : "''";
  return "openMissionDetail('" + id + "', " + thumbArg + ")";
}

// mode: 'writing' | 'drawing' | 'recording' - 해당 모드의 이어하기만 반환
function getLastSessionContinueTarget(mode) {
  const raw = getData(STORAGE_KEYS.lastSession);
  let s = null;
  if (raw && typeof raw === 'object') {
    if (raw.type) {
      // 구 형식: 단일 세션 → 요청한 모드와 일치할 때만 사용
      s = raw.mode === mode ? raw : null;
    } else {
      s = raw[mode] || null;
    }
  }
  if (!s || !s.timestamp) return null;
  const dayMs = 24 * 60 * 60 * 1000;
  if (Date.now() - s.timestamp > 7 * dayMs) return null; // 7일 이상 지나면 무시
  const prefix = `partActivityMode='${s.mode}'; partActivityPart=${s.part}; `;
  if (s.type === 'in_progress') {
    const modeData = PART_ACTIVITIES[s.mode];
    const activities = (modeData && modeData[s.part]) || [];
    const a = activities.find(x =>
      (x.label === s.missionId || x.lookingBackFor === s.missionId) ||
      (x.relaxingFor === s.missionId && (x.relaxingIdx || 0) === (s.relaxingIdx || 0))
    );
    if (!a || a.style === 'current') return null;
    const mission = MISSION_DATA[a.label || a.lookingBackFor || a.relaxingFor] || {};
    const basePath = ASSET_PATHS[s.mode] || 'assets/';
    const thumbSrc = a.thumb ? basePath + a.thumb : '';
    return {
      label: mission.title || a.label || a.lookingBackFor || a.relaxingFor || '활동',
      sub: (s.mode === 'recording' ? '레코딩' : s.mode === 'writing' ? '라이팅' : '드로잉') + ' · Part ' + s.part,
      desc: mission.mainActivity || '',
      thumbSrc,
      onclick: prefix + buildActivityOnclick(a),
      mode: s.mode,
      part: s.part,
    };
  }
  if (s.type === 'completed' && s.nextActivity && s.nextOnclick) {
    const mission = MISSION_DATA[getMissionIdFromActivity(s.nextActivity)] || {};
    const basePath = ASSET_PATHS[s.mode] || 'assets/';
    const thumbSrc = s.nextActivity.thumb ? basePath + s.nextActivity.thumb : '';
    return {
      label: mission.title || s.nextActivity.label || s.nextActivity.lookingBackFor || s.nextActivity.relaxingFor || '다음 활동',
      sub: (s.mode === 'recording' ? '레코딩' : s.mode === 'writing' ? '라이팅' : '드로잉') + ' · Part ' + s.part,
      desc: mission.mainActivity || '',
      thumbSrc,
      onclick: prefix + s.nextOnclick,
      mode: s.mode,
      part: s.part,
    };
  }
  return null;
}

// 파트1 첫번째 콘텐츠 (이어하기 없을 때 '바로 시작하기'용)
function getPart1FirstActivity(mode) {
  const modeData = PART_ACTIVITIES[mode];
  const activities = (modeData && modeData[1]) || [];
  const a = activities.find(x => x.style !== 'current');
  if (!a) return null;
  const missionId = (a.style === 'completed' && a.sub) ? a.sub : (a.label || a.lookingBackFor || a.relaxingFor);
  const mission = MISSION_DATA[missionId] || {};
  const basePath = ASSET_PATHS[mode] || 'assets/';
  const thumbSrc = a.thumb ? basePath + a.thumb : '';
  const prefix = `partActivityMode='${mode}'; partActivityPart=1; `;
  return {
    label: mission.title || missionId || a.label || a.lookingBackFor || a.relaxingFor || '활동',
    sub: (mode === 'recording' ? '레코딩' : mode === 'writing' ? '라이팅' : '드로잉') + ' · Part 1',
    desc: mission.mainActivity || '',
    thumbSrc,
    onclick: prefix + buildActivityOnclick(a),
    mode,
    part: 1,
  };
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// 네비게이션 (opts.skipPushState: true면 history에 넣지 않음 — 뒤로가기 처리용)
function navigate(screenId, opts) {
  // 화면 전환 시 메모장이 열려 있으면 먼저 닫기 (폰 뒤로가기 시에도 함께 닫히도록)
  const memoSheet = document.getElementById('mission-memo-sheet');
  if (memoSheet && memoSheet.classList.contains('open')) {
    try { closeMissionMemo(); } catch (_) {}
  }
  // 화면 전환 시 현재 화면에서 재생 중인 음원 정지
  try {
    if (currentScreen === 'content-detail' || currentScreen === 'post-detail') {
      stopAllContentAudio();
    }
    if (currentScreen === 'mission-detail') {
      try { stopMissionPlayback(); } catch {}
      try { stopMissionMissionPlayback(); } catch {}
    }
  } catch {}

  // 더보기에서 진입한 서브 화면이면 뒤로가기 시 더보기로 복귀
  const moreSubScreens = ['backup-screen', 'activity-stats', 'login-info-screen', 'recording-options', 'account-history-screen', 'privacy-policy-screen', 'app-management-screen', 'settings-general-screen', 'app-info-screen'];
  if (currentScreen === 'recording-overview' && moreSubScreens.includes(screenId)) {
    window._backToMore = true;
  }
  if (screenId === 'recording-overview') {
    window._backToMore = false;
  }
  if (screenId === 'my-activity') {
    window._backToMore = false;
  }
  if (screenId === 'login-info-screen') {
    window._backToScreen = (currentScreen === 'recording-options') ? 'recording-options' : null;
  }
  if (screenId === 'account-history-screen' && currentScreen === 'recording-options') {
    window._backToScreen = 'recording-options';
  }
  if (screenId === 'privacy-policy-screen' && currentScreen === 'recording-options') {
    window._backToScreen = 'recording-options';
  }
  if (screenId === 'settings-general-screen' && currentScreen === 'recording-options') {
    window._backToScreen = 'recording-options';
  }
  if (screenId === 'app-info-screen' && currentScreen === 'recording-options') {
    window._backToScreen = 'recording-options';
  }
  if (screenId === 'backup-screen') {
    window._backToScreen = (currentScreen === 'app-management-screen') ? 'app-management-screen' : (currentScreen === 'my-activity' ? 'my-activity' : (window._backToScreen || 'my-activity'));
  }

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(screenId);
  if (screen) screen.classList.add('active');
  // 스크롤 컨테이너(#app)를 맨 위로 이동
  const appEl = document.getElementById('app');
  if (appEl) appEl.scrollTop = 0;
  window.scrollTo(0, 0);
  currentScreen = screenId;
  if (document.body && typeof getProfileImageShape === 'function') document.body.dataset.profileShape = getProfileImageShape() || 'circle';
  const frame = document.querySelector('.phone-frame');
  if (frame) {
    frame.classList.remove('mypage-active');
    const navLightWhiteScreens = new Set([
      'character-intro-screen',
      'my-activity',
      'activity-stats',
      'login-info-screen',
      'backup-screen',
      'nickname-history-screen',
      'profile-history-screen',
      'recording-options',
      'account-history-screen',
      'privacy-policy-screen',
      'app-management-screen',
      'settings-general-screen',
      'app-info-screen'
    ]);
    frame.classList.toggle('nav-light-white', navLightWhiteScreens.has(screenId));
  }
  // 메인 FAB 오버레이가 열려 있다면 화면 전환 시 닫기
  const navFabOverlay = document.getElementById('nav-fab-overlay');
  const navFabToggle = document.getElementById('nav-fab-toggle');
  if (navFabOverlay && navFabOverlay.classList.contains('open')) {
    navFabOverlay.classList.remove('open');
    if (navFabToggle) navFabToggle.classList.remove('open');
  }
  const moreScreens = ['recording-overview', 'drawing-overview', 'recording-list', 'recording-new', 'recording-memo', 'recording-options', 'recording-timeline', 'recording-playback', 'recording-edit', 'recording-transcription', 'drawing-new-doc', 'drawing-canvas', 'drawing-tools', 'drawing-doc-details', 'drawing-text-editor', 'drawing-review', 'drawing-gallery', 'drawing-view', 'drawing-version', 'shared-board', 'post-detail', 'account-history-screen', 'privacy-policy-screen', 'app-management-screen', 'settings-general-screen', 'app-info-screen'];
  document.querySelectorAll('.nav-item').forEach(n => {
    const target = n.dataset.screen;
    const isActive = target === screenId || (target === 'recording-overview' && moreScreens.includes(screenId));
    n.classList.toggle('active', isActive);
  });

  // FAB 표시 (게시물 상세에서만)
  const fabContainer = document.querySelector('.fab-container');
  if (fabContainer) {
    fabContainer.style.display = screenId === 'post-detail' ? 'block' : 'none';
  }

  // 화면별 렌더링
  if (screenId === 'recording-home') renderHomeContent();
  if (screenId === 'part-activity') renderPartActivity();
  if (screenId === 'mission-detail') renderMissionDetail();
  if (screenId === 'shared-board') renderBoard();
  if (screenId === 'my-contents') renderMyContents();
  if (screenId === 'my-activity') renderMyPage();
  if (screenId === 'login-info-screen') updateLoginInfoUi();
  if (screenId === 'activity-stats') renderActivityStats();
  if (screenId === 'nickname-history-screen') renderNicknameHistoryList();
  if (screenId === 'profile-history-screen') renderProfileHistoryGrid();
  if (screenId === 'recording-options') renderAppSettings();
  if (screenId === 'account-history-screen') renderAccountHistoryPage();
  if (screenId === 'settings-general-screen') renderSettingsGeneralScreen();
  if (screenId === 'app-info-screen') renderAppInfoScreen();

  // 브라우저/폰 뒤로가기 시 앱 내 이전 화면으로 (첫 진입은 replaceState, 이후는 pushState)
  if (opts?.skipPushState || !history) return;
  if (typeof window._tunachatFirstHistory === 'undefined') {
    window._tunachatFirstHistory = true;
    if (history.replaceState) history.replaceState({ screenId: screenId }, '', location.href);
  } else {
    if (history.pushState) history.pushState({ screenId: screenId }, '', location.href);
  }
  if (screenId === 'recording-list') renderRecordingList();
  if (screenId === 'drawing-overview') renderDrawingDocList();
  if (screenId === 'drawing-doc-details') renderDocSublist();
  if (screenId === 'drawing-gallery') renderDrawingGallery();
  if (screenId === 'drawing-version') renderVersionList();
}

/** 캐릭터 소개 화면으로 이동 (뒤로가기 시 returnScreenId로 복귀) */
function openCharacterIntroFrom(returnScreenId) {
  window._characterIntroReturn = returnScreenId || 'recording-home';
  navigate('character-intro-screen');
}

function closeCharacterIntroScreen() {
  const t = window._characterIntroReturn || 'recording-home';
  window._characterIntroReturn = null;
  navigate(t);
}

function navigateBack() {
  if (currentScreen === 'character-intro-screen') {
    closeCharacterIntroScreen();
    return;
  }
  const moreSubScreens = ['backup-screen', 'activity-stats', 'login-info-screen', 'recording-options', 'account-history-screen', 'privacy-policy-screen', 'app-management-screen', 'settings-general-screen', 'app-info-screen'];
  if (window._backToMore && moreSubScreens.includes(currentScreen)) {
    window._backToMore = false;
    navigate('recording-overview');
    return;
  }
  if ((currentScreen === 'login-info-screen' || currentScreen === 'account-history-screen' || currentScreen === 'privacy-policy-screen' || currentScreen === 'backup-screen' || currentScreen === 'settings-general-screen' || currentScreen === 'app-info-screen') && window._backToScreen) {
    const target = window._backToScreen;
    window._backToScreen = null;
    navigate(target);
    return;
  }
  const backMap = {
    'login-info-screen': 'my-activity',
    'account-history-screen': 'recording-options',
    'privacy-policy-screen': 'recording-options',
    'app-management-screen': 'recording-options',
    'settings-general-screen': 'recording-options',
    'app-info-screen': 'recording-options',
    'nickname-history-screen': 'my-activity',
    'profile-history-screen': 'my-activity',
    'backup-screen': 'my-activity',
    'post-detail': 'shared-board',
    'mission-detail': 'part-activity',
    'part-activity': 'recording-home',
    'content-detail': 'recording-home',
    'my-activity': 'recording-home',
    'activity-stats': 'my-activity',
    'recording-new': 'recording-overview',
    'recording-list': 'recording-overview',
    'recording-memo': 'recording-overview',
    'recording-options': 'recording-overview',
    'recording-timeline': 'recording-overview',
    'recording-playback': 'recording-list',
    'recording-edit': 'recording-list',
    'recording-transcription': 'recording-overview',
    'drawing-new-doc': 'drawing-overview',
    'drawing-canvas': 'drawing-overview',
    'drawing-tools': 'drawing-overview',
    'drawing-doc-details': 'drawing-overview',
    'drawing-text-editor': 'drawing-doc-details',
    'drawing-review': 'drawing-overview',
    'drawing-gallery': 'drawing-overview',
    'drawing-view': 'drawing-gallery',
    'drawing-version': 'drawing-doc-details',
  };
  const target = backMap[currentScreen];
  if (target) {
    if (currentScreen === 'content-detail' || currentScreen === 'post-detail') {
      stopAllContentAudio();
    }
    // 파트 활동 → 홈: 현재 모드(녹음/라이팅/드로잉) 유지
    if (currentScreen === 'part-activity' && target === 'recording-home') {
      setHomeMode(partActivityMode);
    }
    navigate(target);
  } else if (currentScreen === 'post-detail') {
    stopAllContentAudio();
    navigate('shared-board');
  }
  else if (currentScreen === 'my-activity') navigate('recording-home');
}

function goToHomeFromSplash() {
  try {
  const consentGiven = getData(STORAGE_KEYS.storageConsentGiven);
  if (!consentGiven) {
    const msg = '이 앱은 다음 경로에 데이터를 저장합니다.\n\n' +
      '• 브라우저 로컬 저장소: 활동 사진, 녹음본, 게시물, 진행 상황 등\n' +
      '• 기기 다운로드 폴더: 촬영한 사진 파일\n\n' +
      '위 저장 경로로 진행하시겠습니까?';
    if (!confirm(msg)) return;
    setData(STORAGE_KEYS.storageConsentGiven, true);
  }
  } catch (e) {
    console.warn('[goToHomeFromSplash] storage 설정 실패', e);
  }
  const splashEl = document.getElementById('splash-overlay');
  if (splashEl) splashEl.remove();
  // 스플래시가 끝나면 닉네임/비밀번호(선택) 진입 화면을 보여준다
  showAuthOverlay();
}

// 하단 네비 클릭
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.screen;
    if (target === 'recording-home') {
      setHomeMode('writing');
    }
    navigate(target);
  });
});

// 메인 FAB (Recording / Drawing / Writing)
const navFabOverlayEl = document.getElementById('nav-fab-overlay');
const navFabToggleEl = document.getElementById('nav-fab-toggle');

if (navFabOverlayEl && navFabToggleEl) {
  const setNavFabOpen = (open) => {
    navFabOverlayEl.classList.toggle('open', open);
    navFabToggleEl.classList.toggle('open', open);
  };

  navFabToggleEl.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = navFabOverlayEl.classList.contains('open');
    setNavFabOpen(!isOpen);
  });

  navFabOverlayEl.addEventListener('click', (e) => {
    if (e.target === navFabOverlayEl) {
      setNavFabOpen(false);
    }
  });

  navFabOverlayEl.querySelectorAll('.nav-fab-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.fabMode;
      if (mode === 'recording' || mode === 'drawing' || mode === 'writing') {
        setHomeMode(mode);
        navigate('recording-home');
      }
      setNavFabOpen(false);
    });
  });
}

// ── 스플래시 시그널 및 홈 첫인사 재생 ─────────────────────────────

function ensureYouTubeApiReady(callback) {
  if (window.YT && window.YT.Player) {
    callback();
    return;
  }
  const prev = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = function() {
    if (typeof prev === 'function') prev();
    callback();
  };
}

function playSignalOnSplash() {
  try {
    const skip = getData('contique_skip_signal_intro');
    const startBtn = document.getElementById('splash-start-btn');
    if (skip) {
      if (startBtn) startBtn.disabled = false;
      return;
    }
    if (startBtn) startBtn.disabled = false;
    ensureYouTubeApiReady(() => {
      const videoId = getYouTubeVideoId(SIGNAL_AUDIO.intro);
      if (!videoId) {
        if (startBtn) startBtn.disabled = false;
        return;
      }
      // 이미 플레이어가 있다면 (자동재생이 막혔더라도) 사용자 입력 시 다시 재생 시도
      if (splashSignalPlayer) {
        try {
          splashSignalPlayer.setVolume && splashSignalPlayer.setVolume(50);
          splashSignalPlayer.playVideo && splashSignalPlayer.playVideo();
        } catch {}
        return;
      }
      // 숨겨진 플레이어 div 생성
      const existing = document.getElementById('splash-signal-player');
      const container = existing || Object.assign(document.createElement('div'), { id: 'splash-signal-player' });
      container.style.position = 'fixed';
      container.style.left = '-9999px';
      container.style.top = '0';
      if (!existing) document.body.appendChild(container);
      introAudioActive = true;
      splashSignalPlayer = new YT.Player('splash-signal-player', {
        videoId,
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, fs: 0, rel: 0, playsinline: 1 },
        events: {
          onReady: (e) => {
            try {
              e.target.setVolume(50);
              e.target.playVideo();
              splashSignalPlayedThisSession = true;
            } catch {}
          },
          onStateChange: (e) => {
            if (e.data === YT.PlayerState.ENDED) {
              introAudioActive = false;
            }
          },
          onError: () => {
            introAudioActive = false;
          },
        },
      });
    });
  } catch {
    const startBtn2 = document.getElementById('splash-start-btn');
    if (startBtn2) startBtn2.disabled = false;
  }
}

// 자동재생이 막힌 경우를 대비해, 첫 사용자 입력에서 한 번 더 시도
document.addEventListener('pointerdown', () => {
  try {
    playSignalOnSplash();
  } catch {}
}, { once: true });

function initSplashSkipCheckbox() {
  const cb = document.getElementById('splash-skip-signal-checkbox');
  if (!cb) return;
  const skip = getData('contique_skip_signal_intro');
  cb.checked = !!skip;
  cb.addEventListener('change', () => {
    setData('contique_skip_signal_intro', cb.checked);
  });
}

function playHomeGreetingsSequence(onFinished) {
  ensureYouTubeApiReady(() => {
    const videoIds = [
      getYouTubeVideoId(SIGNAL_AUDIO.greetJjue),
      getYouTubeVideoId(SIGNAL_AUDIO.greetCami),
    ].filter(Boolean);
    if (!videoIds.length) return;

    const hintEl = document.querySelector('.part-greeting-sub');
    const originalHint = hintEl ? hintEl.textContent : '';
    introAudioActive = true;
    let index = 0;

    const playNext = () => {
      if (index >= videoIds.length) {
        if (hintEl) hintEl.textContent = originalHint;
        introAudioActive = false;
        try {
          setData('contique_home_greeting_done', true);
        } catch {}
        if (typeof onFinished === 'function') {
          try { onFinished(); } catch {}
        }
        return;
      }
      if (hintEl) hintEl.textContent = '캐릭터 첫인사를 듣는 중입니다...';
      const id = 'home-greeting-player';
      let container = document.getElementById(id);
      if (!container) {
        container = document.createElement('div');
        container.id = id;
        container.style.position = 'fixed';
        container.style.left = '-9999px';
        container.style.top = '0';
        document.body.appendChild(container);
      }
      if (homeGreetingPlayer) {
        try { homeGreetingPlayer.destroy && homeGreetingPlayer.destroy(); } catch {}
        homeGreetingPlayer = null;
      }
      homeGreetingPlayer = new YT.Player(id, {
        videoId: videoIds[index],
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, fs: 0, rel: 0, playsinline: 1 },
        events: {
          onReady: (e) => {
            try {
              e.target.setVolume(50);
              e.target.playVideo();
            } catch {}
          },
          onStateChange: (e) => {
            if (e.data === YT.PlayerState.ENDED) {
              index += 1;
              playNext();
            }
          },
        },
      });
    };

    playNext();
  });
}

function handleGreetingIntroChoice(mode) {
  // 이전 자동 첫인사 로직은 사용하지 않음 (버튼 기반으로 변경)
}

// 홈 인사 버튼용 재생 모달
let currentGreetingType = null; // 'jjue' | 'cami'
let greetingPlayer = null;
let greetingProgressTimer = null;
let endingPlayer = null;
let endingAutoCloseTimer = null;

function openHomeGreetingModal(type) {
  currentGreetingType = type;
  ensureYouTubeApiReady(() => {
    const modalEl = document.getElementById('greeting-intro-modal');
    const textEl = document.getElementById('greeting-intro-text');
    const progressEl = document.getElementById('greeting-intro-progress');
    const timeEl = document.getElementById('greeting-intro-time');
    const playBtn = document.getElementById('greeting-intro-play-btn');
    if (!modalEl || !textEl || !progressEl || !timeEl || !playBtn) return;

    textEl.textContent = type === 'jjue' ? '쮸이가 처음 인사할게요.' : '까미가 처음 인사할게요.';
    progressEl.value = 0;
    timeEl.textContent = '00:00 | 00:00';
    playBtn.textContent = '▶';

    const url = type === 'jjue' ? SIGNAL_AUDIO.greetJjue : SIGNAL_AUDIO.greetCami;
    const videoId = getYouTubeVideoId(url);
    if (!videoId) return;

    if (greetingPlayer) {
      try { greetingPlayer.destroy && greetingPlayer.destroy(); } catch {}
      greetingPlayer = null;
    }

    greetingPlayer = new YT.Player('greeting-intro-player', {
      videoId,
      playerVars: { autoplay: 1, controls: 0, disablekb: 1, fs: 0, rel: 0, playsinline: 1 },
      events: {
        onReady: (e) => {
          try {
            e.target.setVolume(50);
            const dur = e.target.getDuration();
            if (dur && timeEl) timeEl.textContent = '00:00 | ' + formatTime(Math.floor(dur));
            e.target.playVideo();
          } catch {}
        },
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.PLAYING) {
            playBtn.textContent = '⏸';
            if (greetingProgressTimer) clearInterval(greetingProgressTimer);
            greetingProgressTimer = setInterval(() => {
              try {
                const cur = greetingPlayer.getCurrentTime() || 0;
                const dur = greetingPlayer.getDuration() || 0;
                if (dur > 0) {
                  progressEl.value = (cur / dur) * 100;
                  timeEl.textContent = formatTime(Math.floor(cur)) + ' | ' + formatTime(Math.floor(dur));
                }
              } catch {}
            }, 250);
          } else {
            playBtn.textContent = '▶';
            if (greetingProgressTimer) { clearInterval(greetingProgressTimer); greetingProgressTimer = null; }
          }
        },
      },
    });

    modalEl.classList.remove('hidden');
    const mini = document.getElementById('greeting-mini-btn');
    if (mini) mini.classList.add('hidden');
  });
}

function toggleGreetingIntroPlayback() {
  if (!greetingPlayer || !greetingPlayer.getPlayerState) return;
  try {
    const state = greetingPlayer.getPlayerState();
    if (state === YT.PlayerState.PLAYING) {
      greetingPlayer.pauseVideo();
    } else {
      greetingPlayer.playVideo();
    }
  } catch {}
}

function closeGreetingIntroModal() {
  const modalEl = document.getElementById('greeting-intro-modal');
  if (modalEl) modalEl.classList.add('hidden');
  const mini = document.getElementById('greeting-mini-btn');
  if (mini) mini.classList.add('hidden');
  if (greetingProgressTimer) {
    clearInterval(greetingProgressTimer);
    greetingProgressTimer = null;
  }
  if (greetingPlayer) {
    try { greetingPlayer.stopVideo && greetingPlayer.stopVideo(); } catch {}
  }
}

function playEndingAfterMissionComplete() {
  ensureYouTubeApiReady(() => {
    const modalEl = document.getElementById('ending-modal');
    if (!modalEl) return;

    const videoId = getYouTubeVideoId(ENDING_AUDIO_URL);
    if (!videoId) return;

    if (endingPlayer) {
      try { endingPlayer.destroy && endingPlayer.destroy(); } catch {}
      endingPlayer = null;
    }
    if (endingAutoCloseTimer) {
      clearTimeout(endingAutoCloseTimer);
      endingAutoCloseTimer = null;
    }

    endingPlayer = new YT.Player('ending-player', {
      videoId,
      playerVars: { autoplay: 1, controls: 0, disablekb: 1, fs: 0, rel: 0, playsinline: 1 },
      events: {
        onReady: (e) => {
          try {
            e.target.setVolume(50);
            e.target.playVideo();
          } catch {}
        },
        onStateChange: (e) => {
          // 재생이 실제로 시작되면 1초 후에 팝업만 닫고, 소리는 계속 나게 둠
          if (e.data === YT.PlayerState.PLAYING && !endingAutoCloseTimer) {
            endingAutoCloseTimer = setTimeout(() => {
              endingAutoCloseTimer = null;
              closeEndingModal();
            }, 1000);
          }
          // 재생이 완전히 끝나면 플레이어 정리
          if (e.data === YT.PlayerState.ENDED) {
            if (endingPlayer) {
              try { endingPlayer.destroy && endingPlayer.destroy(); } catch {}
              endingPlayer = null;
            }
          }
        },
      },
    });

    modalEl.classList.remove('hidden');
  });
}

function toggleEndingPlayback() {
  if (!endingPlayer || !endingPlayer.getPlayerState) return;
  try {
    const state = endingPlayer.getPlayerState();
    if (state === YT.PlayerState.PLAYING) {
      endingPlayer.pauseVideo();
    } else {
      endingPlayer.playVideo();
    }
  } catch {}
}

function closeEndingModal() {
  const modalEl = document.getElementById('ending-modal');
  if (modalEl) modalEl.classList.add('hidden');
  if (endingAutoCloseTimer) {
    clearTimeout(endingAutoCloseTimer);
    endingAutoCloseTimer = null;
  }
  // 플레이어는 그대로 두어 소리가 계속 나게 함 (ENDED 시점에 정리)
}

function minimizeGreetingIntroModal() {
  const modalEl = document.getElementById('greeting-intro-modal');
  const mini = document.getElementById('greeting-mini-btn');
  if (modalEl) modalEl.classList.add('hidden');
  if (mini) mini.classList.remove('hidden');
}

function restoreGreetingIntroModal() {
  const modalEl = document.getElementById('greeting-intro-modal');
  const mini = document.getElementById('greeting-mini-btn');
  if (modalEl) modalEl.classList.remove('hidden');
  if (mini) mini.classList.add('hidden');
}

// 마음톡 표시 시 마지막 줄에 덧붙일 출처 (HTML용)
const MIND_TALK_ATTRIBUTION = '<span class="mission-mind-talk-attribution">- 온마음심리상담센터 박정란 원장</span>';

// 미션 데이터 (PDF: [J]_드로잉 돌아보기+미션·마음톡·릴렉싱미션_211122)
// 구조: 본활동 → 돌아보기 → 마음톡 → 릴렉싱미션
const MISSION_DATA = {
  // === 힐링 레코딩 ===
  VOICE: {
    title: 'VOICE - 최고의 악기, 내 목소리', theme: 'VOICE', playLabel: '질문',
    mainActivity: '발성연습하며 내 목소리와 친해지기. 좋아하는 시나 책의 구절 낭송 또는 노래 부르기',
    lookingBack: ['글을 소리내서 읽어보니 어때? 눈으로만 볼 때랑 달라?', '어떤 책을 골랐어? 왜 그 책을 골랐어?', '녹음한 걸 한번 들어볼래? 들어보니 어떤 기분이 들어?'],
    mindTalk: '목소리 좋은 사람들도 예전에는 자신의 목소리를 콤플렉스로 여긴 적이 있었다고 해요. 목소리도 나의 일부이니 싫어하지 말고 사랑해 주세요. 사람마다 목소리는 다 달라요. 내 목소리만의 색깔을 찾아보아요.',
    relaxingMission: null,
  },
  MYSELF: { title: 'MYSELF - 나는 이런 사람', theme: 'MYSELF', playLabel: '질문', mainActivity: '자연스럽고 편안하게 자기 소개 해보기', lookingBack: ['자기 소개 하느라 수고했어. 기분이 어때?', '왜 그런 기분이 드는 것 같아?', '짧은 소개와 긴 소개 중에 어떤 게 더 어려웠어?'], mindTalk: '첫모임에서 자기소개를 잘못했다고 해서 자책하지 마세요. 처음은 언제나 어려운 것 같아요. 만회할 기회는 얼마든지 있어요.', relaxingMission: null },
  TODAY: { title: 'TODAY - 나의 하루는', theme: 'TODAY', playLabel: '질문', mainActivity: '오늘 하루를 어떻게 보냈는지 되돌아보기', lookingBack: ['나의 하루 잘 기억 났어? 쭉 떠올리면서 기분이 어땠어?', '왜 그런 기분이 들었는데?', '나의 하루 중에 마음에 드는 일 하나만 꼽으라면 어느 걸 고를 거야?'], mindTalk: '오늘 한 일 없이 보낸 게 아니에요. 가만히 떠올려보면 TV를 본 것도 밥을 먹은 것도 뒹굴거린 것도 모두 무엇인가를 한 거예요.', relaxingMission: null },
  DIARY: { title: 'DIARY - Good and Bad', theme: 'DIARY', playLabel: '질문', mainActivity: '오늘 하루를 되돌아보며 좋았던 일과 좋지 않았던 일 떠올려 보기', lookingBack: ['좋았던 일, 나빴던 일 하나하나 꼽아보니 기분이 어때?', '왜 그런 기분이 드는 거 같아?', '가장 기억에 남는 일 하나만 꼽으라면 어떤 일을 고를까? 왜?'], mindTalk: '비가 많이 오는 장마철에는 맑은 날이 정말 반갑고 소중하지요. 좋기만 한 것도 나쁘기만 한 것도 없어요. 나에게 일어난 일들을 어떻게 바라보고 받아들이는지는 나의 선택이예요.', relaxingMission: null },
  POINT: { title: 'POINT - 힐링포인트', theme: 'POINT', playLabel: '질문', mainActivity: '내가 무엇을 할 때 행복한지 찾아보기', lookingBack: ['나만의 힐링 포인트를 생각해 보면서 어떤 기분이 들었어?', '왜 그런 기분이 들었을까?', '힐링 포인트들의 공통점이 있는지 한번 살펴볼래?'], mindTalk: '다음날 출근하지 않는 밤이 가장 행복한가요? 열심히 살고 있는 자신을 많이 칭찬해 주세요!', relaxingMission: null },
  LIST: { title: 'LIST - 버킷리스트', theme: 'LIST', playLabel: '질문', mainActivity: '살면서 꼭 해보고싶은 것, 이루고 싶은 것들 생각해보기', lookingBack: ['버킷리스트 적은 거 함 봐봐. 어떤 생각이 들어?', '왜 그런 기분이 들었는지 아주아주 구체적으로 한 번 얘기해 줄래?', '버킷리스트 중에서 제일 먼저 이룰 수 있을 거 같은 일은 어느 거야?'], mindTalk: '목표를 이룬 자신을 많이 칭찬해 주세요. 그리고 목표를 이루지 못한 일에 대해서도 열심히 노력한 자신을 아주 많이 칭찬해 주세요. 도전해 본 것만으로도 멋져요!', relaxingMission: null },
  'TIME AND MONEY': { title: 'TIME AND MONEY - 나의 시간과 돈', theme: 'TIME AND MONEY', playLabel: '질문', mainActivity: '자신의 경험을 바탕으로 시간과 돈에 대해 생각해보기', lookingBack: ['나의 시간과 돈에 대해 생각해 보면서 기분이 어땠어?', '왜 그런 기분이 들었던 거 같아?', '시간과 돈에 대해 어떻게 생각하고 있는지 알고 나니까 어떤 생각이 들어?'], mindTalk: '시간이 있으면 돈이 없고 돈이 있으면 시간이 없다고요? 지금 지금 당장이 제일 중요해요. 지금 내가 할 수 있는 것, 하고싶은 것 무엇이 있을까요?', relaxingMission: null },
  FOND: { title: 'FOND - 넘나 좋은 것', theme: 'FOND', playLabel: '질문', mainActivity: '좋아하는 것들과 그 이유 생각해보기', lookingBack: ['좋아하는 것들 생각해 보면서 기분이 어땠어?', '왜 그런 기분이 들었던 거 같아?', '내가 좋아하는 것들에 대해 녹음한 거 다시 들어볼래?'], mindTalk: '무엇을 좋아하든 괜찮아요. 좋아하는 이유도 상관없어요. 내 마음이 가장 옳아요. 다만 남에게 피해를 주거나 내 삶이 휘청거리지 않도록 중심잡는 걸 잊지 말아요.', relaxingMission: null },
  DISLIKE: { title: 'DISLIKE - 쫌 그래', theme: 'DISLIKE', playLabel: '질문', mainActivity: '싫어하는 것들과 그 이유 생각해보기', lookingBack: ['내가 싫어하는 것들에 대해 생각해 보면서 기분이 어땠어?', '왜 그런 기분이 든 거 같아?', '내가 싫어하는 것들을 찾아 얘기해보니 어떤 기분이 들어?'], mindTalk: '싫어하는 것이 있을 때는 왜 싫어하는지 생각해 보면 나의 마음에 한 발짝 다가서는 시간이 될 수 있어요. 불편을 끌어안고 나의 일부로 인정했을 때 보다 나에 대한 이해의 폭이 넓어질 거예요.', relaxingMission: null },
  REMAIN: { title: 'REMAIN - 기억 속 그 감정', theme: 'REMAIN', playLabel: '질문', mainActivity: '기억에 남는 일화를 하나 골라 그때의 감정 탐구해 보기', lookingBack: ['그 일을 떠올렸을 때 기분이 어땠어?', '왜 그런 기분이 들었어?', '그 당시의 너에게 해줄 한마디를 생각해보니 기분이 어땠어?'], mindTalk: '어떤 감정이 들었든 괜찮아요. 좋았던 감정은 잘 기억해 두고 싫었던 감정은 잘 토닥여 주세요. 그런 감정이 드는 게 당연했다고 인정해 주면 나의 마음이 더 건강해집니다.', relaxingMission: null },
  EMOTION: { title: 'EMOTION - 감정일기', theme: 'EMOTION', playLabel: '질문', mainActivity: '하루 동안 있었던 일들과 그때의 감정 떠올려보기', lookingBack: ['오늘 하루 감정의 변화를 말해줄 수 있어?', '왜 그런 기분이 들었을까?', '생각과 감정을 구분해서 생각해보니 어땠어?'], mindTalk: '내가 어떻게 느끼고 있는지 아는 것은 중요합니다. 대개 감정은 하나씩 오지 않고 여럿이 같이 오지요. 그래서 감정을 살펴보는 일은 내 마음을 더 잘 알기 위해 중요합니다.', relaxingMission: null },
  PARTNER: { title: 'PARTNER - 당신은 나의 동반자', theme: 'PARTNER', playLabel: '질문', mainActivity: '나와 관계 맺고 있는 사람 파악해 보기', lookingBack: ['나랑 가장 밀접한 관계를 맺고 있는 사람은 누구라고 생각해?', '왜 그런 기분이 들었을까?', '잘 맞는 사람과 거리를 두고 싶은 사람을 떠올려보니 어땠어?'], mindTalk: '가까우니까 싸우는 거예요. 나에게 의미 있는 사람이기에 감정이 올라오지요. 관계를 돌아보고 내 생각을 탐색해 보면 조금 더 좋은 관계를 유지하기 위한 방법이 조금씩 보일 거예요.', relaxingMission: null },
  ONCE: { title: 'ONCE - 그때 그 사람', theme: 'ONCE', playLabel: '질문', mainActivity: '과거에 관계 맺었던 사람 떠올려 보고, 관계 유지를 위한 노력 파악해 보기', lookingBack: ['한 때 가깝게 지냈던 그 사람을 떠올려보니 어떤 기분이 들었어?', '왜 그런 기분이 드는 것 같아?', '다른 사람에게 관심과 애정을 표현할 수 있는 방법이 잘 떠올랐어?'], mindTalk: '살아가면서 스쳐 지나가는 수많은 사람들 중에서 내 기억의 한 부분을 차지하고 있는 사람은 분명 내게 크고 작은 성장의 기회를 준 사람일 거예요.', relaxingMission: null },
  SUPPORT: { title: 'SUPPORT - 살짝 기대도 돼', theme: 'SUPPORT', playLabel: '질문', mainActivity: '타인과 도움을 주고받는 것에 대해 생각해보기', lookingBack: ['도움을 주고받았던 경험을 떠올려보니 어떤 기분이 들었어?', '왜 그런 기분이 들었지?', '도움을 주고 싶은 대상으로 그 사람을 떠올린 이유가 있어?'], mindTalk: '사람마다 성향과 능력이 다른 이유는 서로 부족한 점을 보완하며 함께 지내라는 뜻이 아닐까요? 힘들 때는 살짝 기대도 괜찮아요.', relaxingMission: null },
  LETTER: { title: 'LETTER - 미안해/고마워 편지', theme: 'LETTER', playLabel: '편지', mainActivity: '미안하다, 고맙다 말하고 싶은 사람에게 음성편지 쓰기', lookingBack: ['고맙다는 음성편지를 녹음해보니 기분이 어때?', '왜 그런 기분이 들었을까?', '서운하게 한 사람에게 음성편지를 띄우고 나서는 어떤 기분이 들었어?'], mindTalk: '미안하다고 말하고 고맙다고 말하는 일이 생각보다 쉽지 않을 수 있어요. 괜찮아요. 이번에는 마음 먹은 것만으로도 큰 걸음마를 뗀 거지요. 나는 지금 여기 그대로 있어요.', relaxingMission: null },
  'MY SIDE': { title: 'MY SIDE - 나는 언제나 내 편', theme: 'MY SIDE', playLabel: '질문', mainActivity: '실수나 후회되는 일을 떠올려보며 내 편 되어주기. 현재의 나와 미래의 나에게 음성편지 보내기', lookingBack: ['최근에 한 실수나 후회되는 일에 대해 떠올려보니 어땠어?', '지금의 나에게 쓴 음성편지를 찬찬히 한번 들어봐. 어떤 기분이 들어?', '5년 후의 나에게 편지를 써보니 어땠어?'], mindTalk: '나의 가장 든든한 후원자는 바로 나지요. 내가 나를 믿을 때 남들도 내 편을 들어줄 수 있어요. 이번에 알았으니 다음엔 더 잘 할 거예요.', relaxingMission: null },
  'IT\'S ME': { title: "IT'S ME - 다시, 나는 이런 사람", theme: "IT'S ME", playLabel: '질문', mainActivity: '활동을 마치며 활동 전·후 달라진 점에 대해 생각해보기. 다시 멋지게 자기소개 해보기', lookingBack: ['이제 다시 자기소개를 해보니 어때? 저번과는 어떻게 다른 것 같아?', '왜 그런 기분이 들었을까?', '힐링 레코딩 미션이 이제 모두 끝났어. 지금 기분이 어때?'], mindTalk: '여기까지 정주행하느라 정말 수고 많았어요! 이제 이 힐링북을 알기 전으로는 돌아갈 수 없답니다.', relaxingMission: null },
  // === 힐링 라이팅 ===
  ALONG: { title: 'ALONG - WRITE ALONG', theme: 'ALONG', playLabel: '질문', mainActivity: '듣고 적기', lookingBack: null, mindTalk: null, relaxingMission: null },
  'STAR I': {
    title: 'STAR I - 별 하나에 I',
    theme: 'STAR I',
    playLabel: '질문',
    mainActivity: "윤동주의 '별 헤는 밤' 듣고 별에 아름다운 이름 붙여보기",
    // 인사말: 한 줄씩만 줄바꿈, 중간에 쓸데없는 개행 제거
    lookingBackIntro: '안녕? 난 초초라고 해.\n만나서 반가워~ 첫 번째 미션 잘 했어!!',
    // 번호가 붙는 질문들(사용자 제공 순서)
    lookingBack: [
      '아름다운 말을 고른 기준이 뭐였어?',
      '왜 그 말들이 아름답다고 생각했어?',
      '별이 하나 밖에 없다면 어느 말을 고를 거야?',
      '아름다운 말을 고르면서 기분이 어땠어?',
      '그동안은 몰랐는데 새롭게 알게 된 사실이 있어? 뭐야?',
      '직접 쓴 글을 보면서 스스로에게 묻고 싶은 질문이 있다면? 왜?',
    ],
    mindTalk: '좋은 기억을 떠올리는 일은 마음에 평안을 주고 긍정적인 에너지를 줍니다. 긍정심리학에서는 불안, 우울, 스트레스와 같은 부정적인 감정보다 내가 가진 강점, 장점 등 긍정적 심리에 초점을 맞추어 긍정적 가치를 돌아보게 하지요.',
    relaxingMission: '3LINES 3행시 - 내 이름으로 3행시 짓기\nREPLY 답장 - 쮸이에게 답장쓰기\nMEMO 자유메모 - 잊지 말아야 할 일들 적어두기\nTRASHCAN 감쓰 - 나를 화나게 했던 일, 우울하게 했던 일 등 나쁜 감정들 쏟아 버리기',
  },
  ASK: {
    title: 'ASK - ASK ME',
    theme: 'ASK',
    playLabel: '질문',
    mainActivity: '25문 25답. 질문에 대해 답해보기. 마지막 질문 3개는 직접 질문 만들어서 답해보기.',
    lookingBackIntro: '안녕? 나야 초초! 헤헤',
    lookingBack: [
      '나야 초초! 가장 재미있었던 질문은 뭐였어? 이유는?',
      '가장 대답하기 오래 걸렸던 질문은 뭐였어? 이유는?',
      '어떤 기분으로 질문들에 답을 썼어?',
      '답을 쭉 훑어보면 어떤 기분이 들어?',
      '혹시 바꾸고 싶은 답이 있어? 이유는?',
      '25문 25답을 끝낸 지금, 가장 하고 싶은 일이 뭐야?',
      '답하느라 수고한 자신에게 뭐라고 말해주고 싶어?',
      '그동안은 몰랐는데 새롭게 알게 된 사실이 있어? 뭐야?',
    ],
    mindTalk: '평소 잘 생각해 보지 않은 질문에 대한 대답을 생각하다 보면, 나를 탐색하고 생각을 정리해 보는 의미 있는 시간을 가질 수 있을 거예요. 대답이 잘 생각나지 않아도 괜찮아요. 지금은 시작하는 단계이니 생각해보는데 의의를 두어요. 나중에 떠오를 거예요.',
    relaxingMission: 'REPLY 답장 - 쮸이에게 답장 쓰기 (어린 왕자에게 써도 됨)',
  },
  NAME: {
    title: 'NAME - 나의 이름은',
    theme: 'NAME',
    playLabel: '질문',
    mainActivity: '내 별명과 좌우명 변천사 정리해보기',
    lookingBackIntro: '안녕? 나야 초초! 헤헤',
    lookingBack: [
      '목록을 적으면서 기분이 어땠어?',
      '가장 기억에 남는 별명은 어느 거야? 왜?',
      '갖고 싶은 별명이 있어? 뭐야?',
      '목록의 별명들을 보면 어떤 생각이 들어?',
      '그동안은 몰랐는데 새롭게 알게 된 사실이 있어? 뭐야?',
      '그 별명을 지어준 사람들에게 하고 싶은 말 있어?',
    ],
    mindTalk: '별명이 무엇이든 나는 나예요. 좋은 별명은 즐겁게 받아들이고 싫은 별명은 허허 웃어 넘기는 여유를 가져보세요.',
    relaxingMission: 'REPLY 답장 - 까미에게 답장쓰기\nANY 아무말 - 생각나는 말 다 적어보기 (십자낱말을 만들어도 됨)',
  },
  'STAR II': {
    title: 'STAR II - 별 하나에 II',
    theme: 'STAR II',
    playLabel: '질문',
    mainActivity: "윤동주의 '별 헤는 밤'을 듣고 나만의 시로 만들어 보기",
    lookingBackIntro: '안녕? 나야 초초! 헤헤',
    lookingBack: [
      '시를 써본 적 있어?',
      '어렵진 않았어?',
      '나만의 시가 생겼는데 기분이 어때?',
      '시를 다시 한 번 읽어봐. 느낌이 어때?',
      '멋지다. 가사 같아. 시에 음악을 붙이면 노래가 되잖아.',
    ],
    mindTalk: '평소 해보지 않은 일을 하다보면 몰랐던 자신의 모습을 발견할 수 있어요. 나에게 이런 면이 있나? 하며 깜짝 놀랄 만한 얘기를 많이 적어 보세요. 내 마음은 항상 옳다고 하잖아요.',
    relaxingMission: '5LINES 5행시 - 다섯 글자로 된 단어로 5행시 지어보기 (마땅한 단어가 없으면 배리어프리로 짓기)\nLYRICS 최애가사 - 제일 좋아하는 가사 찾아서 적어보기',
  },
  ABOUT: {
    title: 'ABOUT - 나는 이런 사람',
    theme: 'ABOUT',
    playLabel: '질문',
    mainActivity: '자연스럽고 편하게 자기 소개하기',
    lookingBackIntro: '안녕? 나야 초초! 헤헤',
    lookingBack: [
      '자기 소개글 적으면서 기분이 어땠어?',
      '어떤 내용을 적을 때 가장 쉬웠어?',
      '어떤 내용을 적을 때 가장 어려웠어? 왜 그런 거 같아?',
      '자기 소개가 얼마나 마음에 들어? 왜?',
      '고치고 싶은 부분, 채우고 싶은 부분이 있어? 왜?',
    ],
    mindTalk: '자기소개를 시도해 보면서 꺼내기 힘든 말이 무엇인지보면, 나도 몰랐던 마음의 소리를 듣는 데에 도움이 되지요. 잘 들어주고 잘 보듬어 주세요.\n\n나를 어디서부터 소개해야할지 어렵진 않았나요? 이름, 나이, 직업 등 그런 것을 빼면 어떤것들로 나를 소개할 수 있을까요? 소개, 나에 대해 알아야 나를 소개할 수 있겠죠? 나를 알아가 보아요.',
    relaxingMission: 'COMPLETE 컬러링 - 쮸이, 까미, 초초 색칠하기 (배경도 덧입혀도 됨)\nMAKE 색깔이름 - 색깔을 보고 나만의 멋진 이름 붙여보기 (한글로 붙여도 됨)\nTHINGS 물건이름 - 내가 가진 물건들에 애칭 이름표 붙여주기\nDIY (Do It Youself) - 직접 만들어 보기. 뭐든.',
  },
  WORDS: {
    title: 'WORDS - 어울리는 단어',
    theme: 'WORDS',
    playLabel: '질문',
    mainActivity: '나와 어울린다고 생각하는 단어 100개 적어보기 (연상되는 단어로 해도 됨)',
    lookingBackIntro: '안녕? 나야 초초! 헤헤',
    lookingBack: [
      '이 중 나와 가장 어울린다고 생각하는 단어들이 있어?',
      '어떤 단어가 마음에 들어?',
      '주변 사람들이 나를 어떤 단어로 기억해줬으면 좋겠어?',
      '100가지 단어를 쓰는 게 힘들지 않았어?',
    ],
    mindTalk: '100개를 다 채우지 못해도 괜찮아요. 100개가 많다고 느껴질수도 있어요. 하지만 분명 나도 미처 알지 못하는 나와 어울리는 단어가 100개보다 훨씬 더 많을 거예요. 천천히 떠올려봐요.',
    relaxingMission: null,
  },
  DAY: {
    title: 'DAY - 하루 일과',
    theme: 'DAY',
    playLabel: '질문',
    mainActivity: '오늘 하루 일과 정리해 보기',
    lookingBackIntro: '안녕? 나야 초초! 헤헤',
    lookingBack: [
      '오늘 일어나서 기분이 어땠어?',
      '가장 먼저 든 생각이 뭐야?',
      '오늘 하루 중 기억이 남는 일이 있어?',
      '점수로 매기자면 오늘 하루는 몇 점인 것 같아?',
    ],
    mindTalk: '특정한 활동을 리추얼로 정해서 매일 지키도록 노력하다 보면 훨씬 건강한 몸과 마음을 가질 수 있어요. 하지만 아주 가끔은 모두 무시하고 이불 속에서 뒹굴뒹굴해도 괜찮아요. 내 몸이 쉬고 싶다는 것일 테니까요.',
    relaxingMission: null,
  },
  BRAIN: {
    title: 'BRAIN - 내 머릿속 구름',
    theme: 'BRAIN',
    playLabel: '질문',
    mainActivity: '현재 머릿속을 차지하고 있는 생각들, 마음에 담고 있는 감정들 탐색해 보기',
    lookingBackIntro: '안녕? 나야 초초! 헤헤',
    lookingBack: [
      '지금 가장 많은 비중을 차지하는 생각은 뭐야?',
      '그 생각 때문에 걱정이 돼?',
      '가장 큰 걱정이 해결된다면 어떤 기분일 것 같아?',
    ],
    mindTalk: '수십 가지의 장난감이 펼쳐져 있는 거실을 떠올려 보세요. 괜찮아요. 장난감 박스에 한 번에 하나씩 담아서 정리하면 돼요. 이왕이면 잘 분류해서 담고 자주 쓰는 장난감은 손이 잘 닿는 곳에 두면 좋겠죠.',
    relaxingMission: null,
  },
  HARD: {
    title: 'HARD - 힘들었지?',
    theme: 'HARD',
    playLabel: '질문',
    mainActivity: '힘들었던 일 떠올려 보고 그날의 나에게 위로편지 쓰기',
    lookingBackIntro: '안녕? 나야 초초! 헤헤',
    lookingBack: [
      '힘들었던 일을 다시 떠올려보기가 힘들지?',
      '많이 힘들면 굳이 힘겹게 떠올리지 않아도 괜찮아.',
      '그냥 지난 시간 동안 고생했을 나를 위해서 한번 토닥여주자.',
      '괜찮고, 잘해왔고, 앞으로 잘해나갈거니까.',
    ],
    mindTalk: '너무 힘들었던 일은 떠올리지 않아도 돼요. 마음의 준비가 되면 다시 시도해 보면 돼요. 그 일이 없던 일이 되진 않을 수 있지만 내가 모르는 새 나는 무엇인가를 배웠을 거예요. 그때의 나와 지금의 나는 달라요.',
    relaxingMission: 'WISH 재구성 - 힘들었던 그 일을 내가 원하는 대로 재구성해보기',
  },
  GIFT: {
    title: 'GIFT - GIVE & TAKE',
    theme: 'GIFT',
    playLabel: '질문',
    mainActivity: '받은 선물 목록, 준 선물 목록 적기. 받고 싶은 선물을 양상자에 넣고 묘사해보기',
    lookingBackIntro: '안녕? 나야 초초! 헤헤',
    lookingBack: [
      '가장 마음에 들었던 선물이 뭐야?',
      '그 선물이 왜 가장 마음에 들었어?',
      '가장 의미 있는 선물은 뭐였어?',
      '그 선물이 왜 가장 의미가 있었어?',
      '내가 준 선물중에 가장 의미가 있었던 선물은 있어?',
    ],
    mindTalk: '나 자신에게도 가끔 선물을 주세요. 잘했어, 고마워, 축하해 하면서요. 소소한 행복이 큰 행복을 불러 올 수 있으니까요.',
    relaxingMission: null,
  },
  RELATION: {
    title: 'RELATION - 나는 OO의 ㅁㅁ',
    theme: 'RELATION',
    playLabel: '질문',
    mainActivity: '나와 관계를 맺고 있는 사람들을 적어보고 어떤 관계인지 생각해 보기',
    lookingBackIntro: '안녕? 나야 초초! 헤헤',
    lookingBack: [
      '나랑 가장 밀접한 관계를 맺고 있는 사람은 누구라고 생각해?',
      '나와의 관계에서 가장 의미있는 관계는 누구야?',
      '누구와 가장 오래된 관계를 맺었어?',
      '나와 가장 소중한 관계에 있는 사람은 누구야?',
    ],
    mindTalk: '세상에 좋은 관계만 있는 건 아니에요. 과거든 현재든 나를 힘들게 하는 관계는 멀리해도 괜찮아요. 나를 우선적으로 보듬어 주세요. 관계 사이에서 어떤 것이 불편한지 들여다 보아요. 그 불편한 점이 다른사람과의 관계에서도 비슷한가요? 내가 가진 불편함으로 인한 것일수도 있고, 상대방이 가지고 있는 것 일수도 있어요.',
    relaxingMission: null,
  },
  FRIEND: {
    title: 'FRIEND - 친구란 _______',
    theme: 'FRIEND',
    playLabel: '질문',
    mainActivity: '친구 정의 내려보기. 나에게 친구란, 친구에게 나란 무엇인지 생각해보기',
    lookingBackIntro: '안녕? 나야 초초! 헤헤',
    lookingBack: [
      '나에게 친구란 어떤 의미야?',
      '친구를 떠올렸을 때 가장 먼저 떠오르는 이름이 있어?',
      '그 친구라고 생각해봤을 때 나는 어떤 친구인 것 같아?',
    ],
    mindTalk: '진정한 친구 한 명만 있어도 성공한 인생이다. 맞아요. 소중한 우정을 오래 이어가길 바랄게요. 친구가 없다면요? 없어도 괜찮아요. 친구가 많지 않아도 괜찮아요. 다만 내가 나 혼자만의 시간으로도 충분히 괜찮은지, 다른 사람과의 관계 속에서 에너지를 얻고 행복한 사람인지는 생각해 보면 좋겠어요. 어느 것이든 나에요. 나를 소중히 여길 줄 알게 되면 남도 소중히 여길 수 있게 된답니다.',
    relaxingMission: null,
  },
  TRIP: {
    title: 'TRIP - 나랑 여행갈까?',
    theme: 'TRIP',
    playLabel: '질문',
    mainActivity: '함께 여행 가고 싶은 사람 떠올려 보고, 가고 싶은 장소 생각해 보기',
    lookingBackIntro: '안녕? 나야 초초! 헤헤',
    lookingBack: [
      '왜 그 사람과 함께 가고 싶다고 생각했어?',
      '그 여행지를 선택한 이유가 있을까?',
      '그곳에 가장 가고싶은 이유가 뭐야?',
      '가상으로 짐을 챙겨본다면 가장 먼저 챙길 5가지를 말해줘.',
      '왜 그거를 골랐어?',
    ],
    mindTalk: '여행은 보통 설레는 기분이 들게 하지만 과거 여행이 행복하고 만족스러울 수도, 그렇지 못했을 수도 있겠지요? 기대가 컸지만 계획대로 되지 않아 속상했을 수도 있구요. 여행은 나의 다양한 면을 발견하게 해주는 것 같아요. 여행하는 내가 어떤 모습이었는지 객관적으로 바라보는 시간도 가져보세요.',
    relaxingMission: 'PACK 짐 - 가방에 챙겨넣을 물건 목록 적어보기\nPLAN 일정 - 여행 계획 세워보기 (비현실적인 일정도 됨)\nPHOTO 사진 - 여행을 마치고 사진을 정리중이라고 상상하면서 Best4 골라보기 (실제 사진을 붙여도 됨)\nSOUVENIR 기념품 - 여행 가면 사고 싶은 기념품들 목록 적기 (선물해도 되고 모두 내가 가져도 됨)',
  },
  SAY: {
    title: 'SAY - 내일은 늦으리',
    theme: 'SAY',
    playLabel: '질문',
    mainActivity: '모의 장례식을 떠올려 보고, 미루지 말고 지금 미안하다고/고맙다고/사랑한다고 말하기. 편지로 보내도 됨',
    lookingBackIntro: '안녕? 나야 초초! 헤헤',
    lookingBack: [
      '나의 장례식에 초대하고 싶은 사람이 있어?',
      '그 사람에게 미안하다고 말하면서 어떤 기분이 들었어?',
      '미안하다, 고맙다, 사랑한다 글을 적어보니 어때?',
    ],
    mindTalk: '극한 상황을 떠올리다보면 평소 생각하지 못했던 부분들이 중요해질 때가 있지요. 그러면 나의 소중함, 관계의 소중함도 알게 되고 한 뼘 정도 마음이 자라서 내적으로 더욱 풍요로운 삶을 살 수 있을 거예요.',
    relaxingMission: 'COMPLETE 컬러링 - 드림카를 타고 해안도로를 달리고 있는 쮸이와 까미와 초초 색칠하기 (내가 타고 싶은 드림카의 색깔로 칠하기)\nANY 아무말 - 아무말 대잔치 (맥락은 신경쓰지 않기)\nSCRIBBLE 낙서 - 낙서하기\nDIY (Do It Youself) - 직접 만들어 보기. 뭐든.',
  },
  HOPE: {
    title: 'HOPE - 짜아식, 잘 컸구나',
    theme: 'HOPE',
    playLabel: '질문',
    mainActivity: '미래의 내 모습 상상해 보고, 미래의 나에게 편지 보내기',
    lookingBackIntro: '안녕? 나야 초초! 헤헤',
    lookingBack: [
      '생각하는 미래까지 이루고 싶은 나의 목표나 모습이 있어?',
      '상상해보니 어떤 것 같아?',
      '고생한 나를 위한 한마디를 한다면?',
    ],
    mindTalk: '생각한대로 이루어진대요!',
    relaxingMission: 'FUTURE 친구미래 - 내가 잠깐 자리 비운 사이 친구들이 왔다갔다라고 생각하고, 지금의 친구들이 미래의 나에게 적은 쪽지 상상해 보기 (친구 본인의 근황 넣기)\nTHEM 미래친구 - 지금은 친구가 아니지만 미래에 친구가 되어 있을 사람들을 적어보기 (필수: 이름 옆에 직업 적기, 지금은 알려지지 않은 사람이면 이름 지어서 적기)',
  },
  LIST_W: {
    title: 'LIST - 버킷리스트',
    theme: 'LIST',
    playLabel: '질문',
    mainActivity: '죽기 전에 이루고 싶은 일들을 적어 보기',
    lookingBackIntro: '안녕? 나야 초초! 헤헤',
    lookingBack: [
      '내가 가장 이루고 싶은 건 뭐야?',
      '가고 싶은 곳이 있어?',
      '어떤 사람으로 기억되고 싶어?',
      '버킷리스트를 다 이루고나면 기분이 어떨 것 같아?',
      '이것들을 다 이룰 수 있을 것 같아?',
    ],
    mindTalk: '목표를 이룬 자신을 많이 칭찬해 주세요. 그리고 목표를 이루지 못한 일에 대해서도 열심히 노력한 자신을 아주 많이 칭찬해 주세요. 사정이 있어서 많이 노력하지 못했다고요? 도전해 본 것만으로도 멋져요! 거창하지 않아도 소소한 것부터 시작해 봐요.',
    relaxingMission: 'HALF 반으로 - 내 소중한 버킷리스트에서 정말 소중한 리스트들만 남게 절반 솎아내 보기\nONE 한 개만 - 가장 중요한 일 한 가지만 명예의 전당에 올려보기',
  },
  DIARY_W: {
    title: 'DIARY - 감정일기',
    theme: 'DIARY',
    playLabel: '질문',
    mainActivity: '하루 동안 있었던 일들 돌이켜 보고, 기억에 남는 감정 떠올려 보기',
    lookingBackIntro: '안녕? 나야 초초! 헤헤',
    lookingBack: [
      '오늘 하루 감정의 변화를 말해줄 수 있어?',
      '오늘 하루 제일 큰 사건이 있었어?',
      '아니면 혹시 무탈하게 하루가 흘러갔어?',
      '그 순간을 떠올려보면 어떤 기분이 들어?',
      '다시 떠올렸을 때 그때 느꼈던 그 감정처럼 똑같이 느껴져?',
    ],
    mindTalk: '내가 어떻게 느끼고 있는지 알면 내 감정의 주인이 될 수 있어요. 유체이탈이 된 것처럼 나를 객관적으로 바라보는 것도 도움이 된답니다.',
    relaxingMission: null,
  },
  FLEX: {
    title: 'FLEX - 플렉스',
    theme: 'FLEX',
    playLabel: '질문',
    mainActivity: '자기 자랑 마음껏 해보기',
    lookingBackIntro: '안녕? 나야 초초! 헤헤',
    lookingBack: [
      '너의 가장 마음에 드는 부분이 뭐야?',
      '나 이거까지 해봤다 자랑할만한 거 있어?',
    ],
    mindTalk: '내 자랑도 맘껏 하고 남의 자랑도 맘껏 축하해 주세요. 축하를 주고 받으면 마음의 그릇이 더 커진답니다.',
    relaxingMission: 'COMPLETE 컬러링 - 평상에서 낮잠자는 쮸이와 까미, 드론카메라로 그 모습을 찍고 있는 초초 색칠하기\nTRASHCAN 감쓰 - 다 털어내기\nSQUARE 네모로직 - 네모칸에 색칠해서 글자나 그림 만들어 보기 (필수: 이름이나 별명)\nDIY (Do It Youself) - 직접 만들어 보기. 뭐든.',
  },
  NEWME_W: {
    title: 'NEWME - 다시, 나는 이런 사람',
    theme: 'NEWME',
    playLabel: '질문',
    mainActivity: '활동 전과 후에 달라진 부분이 있는지 잘 생각해 보면서, 다시 자신감 있고 멋지게 자기 소개 해보기',
    lookingBackIntro: '안녕? 나야 초초! 헤헤',
    lookingBack: [
      '활동 전후로 기분이 달라졌어?',
      '다시 해보고 싶다고 생각하는 활동이 있어?',
      '이제 나를 다시 멋지게 소개해볼까?',
    ],
    mindTalk: '여기까지 정주행하느라 정말 수고 많았어요! 이제 이 힐링북을 알기 전으로는 돌아갈 수 없답니다! (찡긋~).',
    relaxingMission: "FINISH 완주 - 완주증 완성하기\nNEWS 신문 - 인터뷰 내용 적기\n특별기획 · 배리어프리1 — 편한 마음으로 ‘소리로 보는 웹툰 <윌유메리미> 0화’ 듣고 느낀 점 적어보기.\n특별기획 · 배리어프리2 — 1. ‘새로운 배리어프리 콘텐츠를 기획하고 제작을 시도하는 소리꼴라쥬의 새 콘텐츠 ’격월간 [시도]‘ 4호. 어린 왕자 삽화 묘사’ 들어보고 삽화 하나 골라서 듣고 그려보기. 2. 나도 삽화 묘사 해보기.",
  },
  'LOOKING BACK': { title: 'LOOKING BACK - 돌아보기', theme: 'LOOKING BACK', playLabel: '질문', mainActivity: '지금까지의 활동들을 돌아보며 느낌 나누기', lookingBack: ['활동들을 돌아보니 어떤 기분이 들어?', '왜 그런 기분이 드는 것 같아?', '특히 기억에 남는 활동이 있어?'], mindTalk: '돌아봄은 성장의 시작이에요. 지금까지 잘 해온 자신을 칭찬해 주세요.', relaxingMission: 'TRASHCAN 휴지통 - 버리기\nABOUT ME 나에 대해 - 나에 대해 돌아보기' },
  // === 힐링 드로잉 ===
  MUSIC: { title: 'MUSIC - 음악도형', theme: 'MUSIC', playLabel: '질문', mainActivity: '음악 들으며 연상되는 것 그리기. (도형 자유낙서)', lookingBackIntro: '안녕? 난 초초라고 해. 만나서 반가워~ 첫 번째 미션 잘 했어!! 좋아하는 음악 있어? 가벼운 마음으로 음악을 한번 들어봐. 어때?', lookingBack: ['그 느낌을 바탕으로 손 가는대로 이것저것 한번 그려보는 건 어때?', '그림이 아니라도 괜찮아. 부담 없이 자유롭게 그려봐.', '정답은 없어. 하나밖에 없는 너만의 그림이 완성되었어.', '그림에 의미가 없어도 괜찮아. 그림 그대로를 받아들여 보는 게 어떨까?'], mindTalk: '빈 종이에 그림을 그리려고 하니 어땠나요? 무엇을 그려야 할지 막막하거나 어색했을 수도 있어요. 손이 움직이는 대로 자유롭게 떠오르는 것을 그려서 표현해 보세요. 정답은 없어요.', relaxingMission: 'SQUARE 네모 - 세상의 네모난 물건들 생각해 보고 찾아서 그리고 적어보기. 놀이공원에서 컵놀이기구 타고 있는 쮸이와 까미와 초초 색칠하기 (배경도 덧칠하기)' },
  PAINT: { title: 'PAINT - 가볍게 색칠', theme: 'PAINT', playLabel: '질문', mainActivity: '밑그림에 색칠하기. 빈 캔버스에는 직접 그림을 그려서 색칠하기', lookingBackIntro: '안녕? 나야 초초! 헤헤', lookingBack: ['지금 기분을 반영해서 마음껏 그리고 색칠해봐. 칸 밖으로 튀어나가도 괜찮아. 지금 어떤 색깔 펜을 들고 있어?', '그 색을 선택한 이유가 있어?', '완성된 걸 보고나니 기분이 어때?'], mindTalk: '색은 마음의 언어라고도 해요. 좋아하는 색을 사용하면서 몸과 마음이 쾌적해지는 것을 경험할 수도 있구요. 내 마음이 표현하는 색을 찾아 색칠해 보면서 마음을 가만히 들여다 보세요.', relaxingMission: 'SQUARE 네모 - 세상의 네모난 물건들 생각해 보고, 찾아서 그리고 적어보기. 놀이공원에서 컵놀이기구 타고 있는 쮸이와 까미와 초초 색칠하기 (배경도 덧칠하기)' },
  COLOR: { title: 'COLOR - 무슨 색일까', theme: 'COLOR', playLabel: '질문', mainActivity: '각 단어를 보고 가만히 눈을 감은 채 느낌을 떠올린 후, 그 느낌과 어울리는 색을 골라 칸에 칠하고 그 느낌을 단어로 표현해 보기', lookingBackIntro: '나야, 초초. 색칠 재미있게 잘 했어?', lookingBack: ['어떤 색깔이 가장 좋았어?', '왜 그 색깔이 가장 좋았지?', '색칠할 때 어떤 기분으로 했어?', '색을 모두 칠한 그림을 보니까 어떤 기분이 들어?', '혹시 색이 다 비슷한 계열의 색이야? 노랑 계열이라거나, 파랑 계열이라거나, 회색계열이라거나 등등', '그 색깔들 중에서 나와 가장 가까운 색 혹은 나를 대표하는 색은 무슨 색인 거 같아?', '나의 색은 무엇으로 칠했어? (그림형상? 도구?)', '나의 색이 주는 이미지와 느낌은 어때? 자신이 그 색과 닮았어?', 'ㅇㅇ의 색은 무엇으로 칠했어? 왜 그 색을 떠올렸어?', '여러 가지 색 중 어떤 색이 되고 싶어?', '혹시 바꾸고 싶은 색깔 있어?', '색깔을 칠하기 전과 후에 생각이 달라진 점이 있어?', '혹시 자신에게 묻고 싶은 말이나 해주고 싶은 말이 있어?'], mindTalk: '색으로 표현되는 무의식. 잠재되어 있는 우리의 무의식이 여러 색으로 표현되었을 거예요. 색은 우리에게 여러 측면에서 영향력을 미칩니다. 색칠된 그림을 보면서 내 마음이 무엇을 이야기하고 싶어 하는지 곰곰이 생각해 보세요.', relaxingMission: 'CIRCLE 동그라미 - 세상의 동그란 물건들 생각해 보고, 찾아서 그리고 적어보기. 공원에 나들이가서 재미있게 지내고 있는 쮸이와 까미와 초초 색칠하기 (배경도 덧칠하기)' },
  ONE: { title: 'ONE - 특정 컬러만 사용해서 그리기', theme: 'ONE', playLabel: '질문', mainActivity: '한가지 색상(빨강, 파랑, 연두, 카키색 등)만 사용하여 자유화 그리기', lookingBackIntro: '안녕? 나야 초초! 헤헤', lookingBack: ['왜 그 색깔을 가장 먼저 선택했는지 알 수 있을까?', '평소에 좋아하던 색깔이야?', '원래 어떤 색을 좋아해?', '한 가지 색으로만 그림을 그려본 기분이 어때?', '한 가지 색으로만 그림을 그려본 적 있어?'], mindTalk: '색에는 힘이 있어요. 색이 나를 자극할 수도 있고 평온하게 할 수도 있고 혹은 흥분시키거나 진정시킬 수도 있지요. 내가 표현한 색이 내게 어떤 기분을 주는지 찬찬히 그 감정을 들여다 보세요.', relaxingMission: 'CIRCLE 동그라미 - 세상의 동그란 물건들 생각해 보고, 찾아서 그리고 적어보기. 공원에 나들이가서 재미있게 지내고 있는 쮸이와 까미와 초초 색칠하기 (배경도 덧칠하기)' },
  Favorite: { title: 'FAVORITE - 내가 좋아하는 것', theme: 'Favorite', playLabel: '질문', mainActivity: '내가 좋아하는 것들 그려보기. 혹은 글자로 적거나 색상으로 표현해 보기', lookingBackIntro: '안녕? 나야 초초! 헤헤', lookingBack: ['· 색깔 : 좋아하는 색깔이 있나요? / 그 색깔을 특별히 좋아하는 이유가 있나요? / 그 색을 보면 어떤 기분이 드나요?', '· 음식 : 좋아하는 음식이 있나요? / 그 음식을 주고 싶은 사람이 있나요? / 주고 싶은 이유가 있나요? / 그 음식에 관한 특별한 기억이 있나요?', '· 사람 : 당신은 어떤 사람인가요? / 어떤 유형의 사람과 잘맞다고 생각하나요? / 어떤 사람이 되고 싶나요? / 닮고 싶은 사람이 있나요?', '· 장소 : 당신에게 특별한 장소가 있나요? / 특별한 이유가 있나요? / 그곳에 가면 기분이 어떤가요?', '· 시간 : 당신이 좋아하는 특정한 시간대가 있나요? / 그 시간을 좋아하는 이유가 있나요? / 그 시간이 되면 당신은 어떤 기분인가요?', '· 음악 : 당신이 가장 좋아하는 음악은 무엇인가요? / 그 음악을 좋아하는 이유는 무엇인가요? / 그 음악을 느끼면 무슨 기분이 드나요? / 어떤 장르의 음악을 좋아하나요?', '· 책/영화/프로그램 : 당신이 좋아하는 책, 영화, 프로그램이 있나요? / 어떤 때 즐겨하나요? / 좋아하는 이유가 있나요? / 어떤 장르를 좋아하나요? / 얼마나 자주 하나요? / 하는 동안 기분이 어떤가요?', '· 날씨/온도 : 당신은 어떤 계절/날씨를 가장 좋아하나요? / 좋아하는 이유가 있나요?', '· 동식물 : 당신이 좋아하는 동식물이 있나요? / 좋아하는 이유가 있나요? / 그 동식물과 함께 있을 때 어떤 감정이 드나요?'], mindTalk: "무엇을 좋아하세요? 라는 말을 들으면 막연한 느낌이 들지 않나요? 평소 생각해 보지 않았던 것에 대해 생각해 보면서 내가 좋아하는 것들을 찾아보는 시간을 가져봐요. 나에 대해 조금 더 알 수 있을 거예요.", relaxingMission: null },
  JANUS: { title: 'JANUS - 나는 이런 사람', theme: 'JANUS', playLabel: '질문', mainActivity: '거울 안에 현재의 내 모습 그리기. 동그라미 안에 타인에게 보이고 싶은 내 모습 그리기', lookingBackIntro: '안녕? 나야 초초! 헤헤', lookingBack: ['본인이 생각하는 나는 어떤 사람이라고 생각해?', '남들이 생각하는 나는 어떤 사람이라고 생각해?', '나는 남들에게 어떻게 보였으면 해?', '지금 나는 어떤 표정을 짓고 있어?', "'누구로 살아보고 싶다.' 이런 생각 해 본 적 있어?", '지금 나의 모습에 영향을 끼친 인물이 있어?'], mindTalk: '우리는 타인과 살아가면서 타인의 시선을 나도 모르게 의식하고 살아가요. \'내가 이런 말을 하면 어떻게 생각할까, 내가 이런 행동을 하면 저사람이 나를 안 좋게 보면 어떻게 하지?\' 하면서요. 내가 생각하는 나와 남들이 생각하는 나는 같을 수도 다를 수도 있어요. 하지만 그 모든 모습이 나예요. 내가 어떤 사람인지 알게 되면, 나답게 살아갈 수 있는 힘이 됩니다.', relaxingMission: 'OCTAGON 팔각 - 세상의 팔각형 물건들 생각해 보고, 찾아서 그리고 적어보기. 해변에서 일광욕과 수영을 즐기고 있는 쮸이와 까미와 초초 색칠하기 (배경도 덧칠하기)' },
  IF: { title: 'IF - 내가 만약', theme: 'IF', playLabel: '질문', mainActivity: '나를 식물, 동물 or 사물로 그려보기. 타인이 등장해도 됨', lookingBackIntro: '안녕? 나야 초초! 헤헤', lookingBack: ['나는 어떤 식물(동물)이야? 설명해 줄 수 있어?', '좋아하는 식물(동물)이 있어?', '어떤 식물이나 동물을 유심히 본 적이 있어?', '어떤점이 나랑 닮았다고 생각하게 되었어?', '혹시 키우고 있는 반려 식물이나 동물이 있어?'], mindTalk: '나를 식물, 동물 혹은 사물로 표현하려면 나의 특성부터 먼저 생각해 봐야할 거예요. 내 특성이나 성격과 비슷한 것이 떠오를 수도 있고 겉모습이 비슷한 것이 떠오를 수도 있지요. 이 또한 나를 인식하는 하나의 과정이랍니다.', relaxingMission: null },
  ROAD: { title: 'ROAD - 길그림', theme: 'ROAD', playLabel: '질문', mainActivity: '지금까지 살아온 날들을 되짚어 보고, 기억에 남는 일들을 순서대로 길 위에(옆에) 그려보기', lookingBackIntro: '안녕? 나야 초초! 헤헤', lookingBack: ['나의 인생길을 바라보니 어떤 기분이 드나요?', '각 구간마다 어떤 기분을 가지고 그렸나요?', '기분에 따라 색깔이 달라졌나요?', '현재의 나는 어떤 것 같나요?', '과거부터 지금까지 자신의 인생을 천천히 되돌아보았을 때 가장 행복했던 일은 언제인가요?', '과거에 행복한 순간 누구와 함께 했나요?', '그 감정을 떠올려 지금 다시 행복한 일이 생긴다면 자신의 옆에 누가 있으면 좋을까요? 왜 그 사람이 떠올랐나요?', '과거 자신이 힘들었던 순간은 언제인가요? 그때 무엇이 가장 자신을 힘들게 했나요?', '앞으로 바라는 미래는 어떤가요? 바라는 미래를 위해 현재까지 어떠한 노력을 하고 있나요?', '지금 나는 그 길 위에 어디쯤에 있는 것일까요?', '앞으로 원하는 미래는 어떤가요?', '당신이 바라는 미래를 향해 잘 가고 있다는 증거는 무엇일까요?', '원하는 미래에 왔다고 가정한다면 무엇을 하였기에 가능하게 했을까요?'], mindTalk: '길그림은 무의식적, 자연적, 자발적 심상을 나타내요. 태어나서 성장해온 역사, 현재까지의 경험들, 그리고 미래를 향한 계획 등을 한 장의 그림으로 확인할 수 있지요. 미래에는 나의 인생길을 누가 함께하면 좋을지도 생각해 보는 것은 어떨까요.', relaxingMission: 'STAR 별 - 세상의 별모양 물건들 생각해 보고, 찾아서 그리고 적어보기. 즐겁게 자전거를 타고 있는 쮸이와 까미와 초초 색칠하기 (배경도 덧칠하기)' },
  FACE: { title: 'FACE - 나의 표정', theme: 'FACE', playLabel: '질문', mainActivity: '가장 기억에 남는 순간 떠올려 보고 그날의 내 표정 그리기', lookingBackIntro: '안녕? 나야 초초! 헤헤', lookingBack: ['평소 나는 어떤 표정을 많이 지을까?', '내가 좋아하는 내 표정이 있어?', '그린 표정은 어떤 순간이었어?', '그 순간이 왜 가장 기억이 남았어?', '그때를 떠올려보면 어떤 기분이 들어?'], mindTalk: '내 기억 속의 자기상을 통해 내 생각, 행동, 감정 등을 탐색해 볼 수 있어요. 그때의 나와 지금의 나는 어떤 점이 같고 어떤 점이 다른지 생각해 보는 일도 나를 알게 되는 좋은 활동이 될 거예요.', relaxingMission: null },
  TRIP_D: { title: 'TRIP - 여행', theme: 'TRIP', playLabel: '질문', mainActivity: '내가 가장 여행하고 싶은 곳 그리기. 그곳에 함께 가고 싶은 사람 그리거나 적기', lookingBackIntro: '안녕? 나야 초초! 헤헤', lookingBack: ['그곳을 여행지로 선택하게 된 이유가 있나요?', '어느 곳이 가장 기대가 되나요?', '왜 여행을 떠나게 되었나요?', '여행 계획을 짜는 일이 즐거운가요?', '여행을 가서 가장 먼저 하고 싶은 일이 무엇인가요?', '여행을 함께 가고 싶은 사람이 있나요?'], mindTalk: '여행은 보통 설레는 기분이 들게 하지만, 과거의 여행이 행복하고 만족스러울 수도 있고, 그렇지 못했을 수도 있겠지요? 기대가 컸지만 계획대로 되지 않아 속상했을 수도 있구요. 여행은 나의 다양한 면을 발견하게 해주는 것 같아요. 여행하는 내가 어떤 모습이었는지 객관적으로 바라보는 시간도 가져보세요.', relaxingMission: "TRIANGLE 세모 - 세상의 세모난 물건들 생각해 보고, 찾아서 그리고 적어보기. 신나게 여행을 떠나는 쮸이와 까미와 초초 색칠하기 (배경도 덧칠하기)\n특별기획 · 배리어프리1 — 편한 마음으로 ‘소리로 보는 웹툰 <윌유메리미> 0화’ 듣고 느낀 점 그려보기 (또는 적어보기)." },
  RAIN: { title: 'RAIN - 빗속의 사람', theme: 'RAIN', playLabel: '질문', mainActivity: '비가 내리는 상황 속에 있는 내 모습 그리기', lookingBackIntro: '안녕? 나야 초초! 헤헤', lookingBack: ['그림을 어떤 순서로 그렸나요?', '비를 맞고 있는 그림속의 인물은 누구인가요?', '그 인물은 지금 무엇을 하고 있나요?', '그 인물이 느끼는 기분은 어떤가요?'], mindTalk: '빗속의 사람 그림은 스트레스와 스트레스 대처방식을 알아보기 위해 그려봅니다. 비, 구름, 번개 등은 스트레스를 나타내며 우산, 비옷, 장화 등은 스트레스 대처 자원으로 봅니다. 현재 겪고 있는 스트레스의 양이 얼마큼인지, 내가 그 스트레스를 적절히 이겨낼 수 있는 자원을 가지고 있는지 생각해 보세요.', relaxingMission: 'CUP 컵 - 세상의 컵들 생각해 보고, 나만의 컵 그려보기. 내가 가진 컵과 용도 적기. 비내리는 창밖을 바라보는 쮸이와 까미와 초초 색칠하기 (배경도 덧칠하기)' },
  SINKHOLE: { title: 'SINKHOLE - 웅덩이', theme: 'SINKHOLE', playLabel: '질문', mainActivity: '혼자 걷다가 씽크홀에 빠져버렸다. 빠진 직후의 내 모습 그리기. 웅덩이 그림 포함해서 그리기', lookingBackIntro: '안녕? 나야 초초! 헤헤', lookingBack: ['평소 자신이 해결하지 못한 일이 지금은 어떻게 느껴지나요?', '지금 현재 가장 바라는 일이 무엇인가요?', '지금 여기서 나간다면 무엇이 달라질까요?'], mindTalk: '무의식에 사로잡히면 눈 앞에 혹은 나에게 일어나고 있는 일들을 있는 그대로 바라보기 어려워요. 내 마음의 싱크홀에 빠졌다면 지금 그대로의 나에게 집중해 보는 것은 어떨까요? 있는 그대로의 나를 바라보다 보면 내가 미처 발견하지 못했던 상황들이 새롭게 보일 수도 있어요.', relaxingMission: null },
  ANIMAL: { title: 'ANIMAL - 동물가족화', theme: 'ANIMAL', playLabel: '질문', mainActivity: '가족들을 동물에 빗대어 가족화 그려보기. 일부 가족만 그려도 됨', lookingBackIntro: '안녕? 나야 초초! 헤헤', lookingBack: ['어떤 순서로 그림을 그렸나요?', '어떤 동물이 내 가족과 비슷한가요?', '고른 동물과 가족들은 각각 어떤 점이 닮았나요?', '동물들은 서로 누구랑 잘 지내나요?', '가족들 중 다른 동물로 변하길 바라는 사람이 있나요? 왜그렇게 생각했나요?', '앞으로 나는 어떤 동물이 되고 싶나요? 왜그런가요?', '그림의 느낌은 어떤가요?'], mindTalk: '이 작업을 통해 나와 가족 구성원을 어떻게 지각하고 있는지 알 수 있어요. 또한 가족 간의 상호작용이 어떻게 이루어지고 있는지, 역동성은 어떤지도 파악 할 수 있습니다. 내가 가장 신뢰하는 가족/나를 힘들게 하는 가족은 누구인지, 그 가족을 떠올렸을 때 어떤 감정이 드는지 등을 생각하고 이유를 떠올려 보면, 가족 관계에 대해 돌아볼 수 있고 내 마음도 보듬어 줄 수 있을 거예요.', relaxingMission: null },
  NETWORK: { title: 'NETWORK - 관계 마인드맵', theme: 'NETWORK', playLabel: '질문', mainActivity: '내 주변의 인맥을 시각화 해보기. 중요한 사람부터 큰 동그라미에서 시작해 그려보기', lookingBackIntro: '안녕? 나야 초초! 헤헤', lookingBack: ['나를 중심으로 오른쪽과 왼쪽 각각엔 어떤 관계가 그려져 있나요?', '나와의 관계와 색칠한 색이 관련이 있나요?', '다 그려진 관계망을 바라보니 어떤 기분이 드나요?', '현재 관계에 만족하시나요?', '발전시키고 싶은 관계가 있나요?', '내가 그린 관계망의 색결정과 왜 그렇게 배열했는지 말해보세요.', '대인관계를 맺을 때 나에게 가장 필요한 것을 보여주는 이미지는 무엇인가요?', '어느 이미지가 가장 어려운 장애물을 상징하는 것 같나요?', '당신에게 매력적으로 보이는 사람들은 어떤 유형의 사람들인가요?', '내담자가 생각하는 중요한 사람들은 당신의 어떤 점을 좋아하나요?', '관계망 안에서 이러한 장점과 능력을 잘 알아주는 사람은 누구인가요?', '그런 장점과 기술들을 가지고 있는데 지금보다 더 많이 어떻게 활용할 수 있을까요'], mindTalk: '우리는 여러 관계 속에서 살아갑니다. 인간의 모든 문제는 관계에서 시작된다고 해도 과언이 아닐 겁니다. 우리는 관계를 맺고 관계 안에서 경험하고 사고하고 다양한 감정을 느끼게 되지요. 내면의 대상관계를 탐색하여 자기의 성격이 그 사람들과의 관계에 미치는 영향에 대해 생각해 보세요.', relaxingMission: 'CANDLE 양초 - 세상의 양초들 생각해 보고, 나만의 양초 그려보기. 내가 가진 양초 적기. 캠핑가서 맛있게 바비큐 파티 중인 쮸이와 까미와 초초 색칠하기 (배경도 덧칠하기)' },
  THINK: { title: 'THINK - 내가 생각하는 나', theme: 'THINK', playLabel: '질문', mainActivity: '나의 진실된 본모습은 어떤지 그려보기. 원하는 표정, 헤어스타일, 옷, 장신구 등을 자세하고 재미있게 그려보기', lookingBackIntro: '안녕? 나야 초초! 헤헤', lookingBack: ['그림을 바라보면 어떤 느낌이 드나요?', '왼쪽 그림과 오른쪽 그림을 바라봤을 때 각각 어떤 단어가 떠오르나요?', '어떤 그림이 진짜 나와 가깝다고 생각하시나요?', '어떤 모습이 더 나의 마음에 드나요?', '내가 바라는 모습이 있나요?', '자신이 생각하는 나는 어떤 사람인가요? 왜 그렇게 생각하나요?', '자신이 생각하는 나의 상징적 단어에 관련된 일이 있나요?', '다른 사람이 생각하는 나는 어떤 사람인가요?', '그 사람이 자신을 그렇게 생각하게 된 일은 무엇일까요?', '내가 생각하는 나와 남이 생각하는 나와 공통점은 무엇인가요?', '다른 점은 무엇인가요?', '내가 되고 나의 모습은 무엇인가요'], mindTalk: '\'페르조나\'라는 단어 들어보신 적 있나요? 「가면」을 뜻하는 희랍어로, 개인이 사회적 요구들에 대한 반응으로 가지는 공적인 얼굴이라는 뜻이에요. 사회적 지위나 대상에 따라 바꾸는 나의 모습일 수 있겠네요. 그래서 사람들은 여러 모습의 페르조나를 가지고 있어요. 진짜 내 본모습과 페르조나가 헷갈리게 된다면 진짜 나를 인식하기 어렵겠죠? 나의 내면과 대화를 시도함으로써 나를 더 사랑하고, 나에 대해 좀 더 파악하는 기회를 가져보세요.', relaxingMission: 'BAG 가방 - 세상의 가방들 생각해 보고, 나만의 가방 그려보기. 내가 가진 가방과 갖고 싶은 가방 적어보기. 크루즈에서 포식하고 있는 쮸이와 까미와 초초 색칠하기 (배경도 덧칠하기)' },
  LOOK: { title: 'LOOK - 타인이 생각하는 나', theme: 'LOOK', playLabel: '질문', mainActivity: '남들이 생각하는 나는 어떤 모습일지 그려보기. 남들에게 나를 어느 정도 보여주고 있는지 생각해보고 겉으로 드러나는 나를 그려보기', lookingBackIntro: '안녕? 나야 초초! 헤헤', lookingBack: ['그림을 바라보면 어떤 느낌이 드나요?', '왼쪽 그림과 오른쪽 그림을 바라봤을 때 각각 어떤 단어가 떠오르나요?', '어떤 그림이 진짜 나와 가깝다고 생각하시나요?', '어떤 모습이 더 나의 마음에 드나요?', '내가 바라는 모습이 있나요?', '자신이 생각하는 나는 어떤 사람인가요? 왜 그렇게 생각하나요?', '자신이 생각하는 나의 상징적 단어에 관련된 일이 있나요?', '다른 사람이 생각하는 나는 어떤 사람인가요?', '그 사람이 자신을 그렇게 생각하게 된 일은 무엇일까요?', '내가 생각하는 나와 남이 생각하는 나와 공통점은 무엇인가요?', '다른 점은 무엇인가요?', '내가 되고 나의 모습은 무엇인가요?'], mindTalk: '가면을 쓴다는 것은 가식적이라거나 나쁘다는 것이 아니예요. 내가 남들에게 얼마든지 다양한 모습을 보여주고 싶을 수 있잖아요. 가면을 썼을 때 더 편안함을 느낄 수도 있구요. 하지만 내가 쓴 가면과 나를 구분하는 것은 매우 중요하지요. 타의에 이끌려 가면이 형성 되기도 하니, 가면 속에 감춰진 본모습을 자꾸 찾아봐야 합니다. 가면과 본모습의 간극을 조금씩 줄여 보려는 노력이 내 마음을 돌보는 데에 도움이 될 거예요.', relaxingMission: "BAG 가방 - 세상의 가방들 생각해 보고, 나만의 가방 그려보기. 내가 가진 가방과 갖고 싶은 가방 적어보기. 크루즈에서 포식하고 있는 쮸이와 까미와 초초 색칠하기 (배경도 덧칠하기)\n특별기획 · 배리어프리2 — 1. ‘새로운 배리어프리 콘텐츠를 기획하고 제작을 시도하는 소리꼴라쥬의 새 콘텐츠 ’격월간 [시도]‘ 4호. 어린 왕자 삽화 묘사’ 들어보고 삽화 하나 골라서 듣고 그려보기. 2. 나도 삽화 묘사 해보기." },
  RETOUCH: { title: 'RETOUCH - 그림 추가해 보기', theme: 'RETOUCH', playLabel: '질문', mainActivity: '여태까지 그렸던 콘텐츠를 다시 한 번 보고, 추가하고 싶은 것이 있으면 그려넣거나 아예 다시 그려보기', lookingBackIntro: '안녕? 나야 초초! 헤헤', lookingBack: ['그린 그림에 대해 이야기 해볼까요?', '더 이상 추가 하고 싶은 것은 없나요?', '이걸 통해 자신이 느낀 것은 무엇인가요?'], mindTalk: '여러 작업이 나를 알아가는 데 있어서 도움이 되었으면 합니다. 중간중간 문득 떠오르는 장면이나 표현하고 싶은 것이 있었다면 지금 편안하게 표현해보세요.', relaxingMission: null },
  NEWME: { title: 'NEWME - 다시, 나는 이런 사람', theme: 'NEWME', playLabel: '질문', mainActivity: '활동 전과 후에 달라진 부분이 있는지 잘 생각해 보면서, 자신이 멋지게 소개된 브로셔 만들어 보기', lookingBackIntro: '안녕? 나야 초초! 헤헤', lookingBack: ['첫번째 칸부터 자신이 소개하는 내용을 이야기 해볼까요?', '브로셔 중에 꼭 이야기 하고 싶은 내용이 있다면 무엇일까요?', '자신만의 브로셔를 만들고 나니 기분이 어떤가요?', '누구에게 주고 싶나요?'], mindTalk: '나를 소개하는 방법은 다양해요. 나를 표현할 수 있는 것이라면 무엇이든 좋습니다. 내가 나를 잘 알게된 만큼 다른 사람에게도 나를 소개하고 표현할 수 있을 거예요.', relaxingMission: 'HEART 하트 - 세상의 하트모양 물건들 생각해 보고, 찾아서 그리고 적어보기. 바다 위로 펼쳐지는 아름다운 노을을 바라보는 쮸이와 까미와 초초 색칠하기 (배경도 덧칠하기)' },
  // === 공통/기타 ===
  VOICE: { title: 'VOICE - 나의 목소리', theme: 'VOICE', playLabel: '편지', mainActivity: '발성연습하며 내 목소리와 친해지기. 좋아하는 시나 책의 구절 낭송 또는 노래 부르기', lookingBack: ['글을 소리내서 읽어보니 어때? 눈으로만 볼 때랑 달라?', '어떤 책을 골랐어? 왜 그 책을 골랐어?', '녹음한 걸 한번 들어볼래? 들어보니 어떤 기분이 들어?'], mindTalk: '목소리 좋은 사람들도 예전에는 자신의 목소리를 콤플렉스로 여긴 적이 있었다고 해요. 목소리도 나의 일부이니 싫어하지 말고 사랑해 주세요. 사람마다 목소리는 다 달라요. 내 목소리만의 색깔을 찾아보아요.', relaxingMission: null },
  'LOOKING BACK': { title: 'LOOKING BACK', theme: 'LOOKING BACK', playLabel: '질문', mainActivity: '마음 톡 활동을 끝낸 후에 보세요! 내 답변 되돌아보며 나를 탐구하기', lookingBack: ['고맙다는 편지를 써보니 어떤 기분이 들었어?'], mindTalk: null, relaxingMission: null },
  'ABOUT ME': { title: 'RELAXING - ABOUT ME(6)', theme: 'ABOUT ME (6)', playLabel: '질문', mainActivity: '나에 대한 간단한 질문들에 대답해보기', lookingBack: ['좋아하는 음료와 그 이유.'], mindTalk: null, relaxingMission: null },
};

// DEFAULT_MISSION_AUDIO / DEFAULT_RECORDING_MISSION_AUDIO / DEFAULT_DRAWING_MISSION_AUDIO의
// lookingBackUrls[0]를 각 미션의 기본 돌아보기 음원으로 연결
Object.entries(DEFAULT_MISSION_AUDIO).forEach(([missionId, cfg]) => {
  const mission = MISSION_DATA[missionId];
  const lb = (cfg.lookingBackUrls || []).filter(Boolean);
  if (mission && lb.length && !mission.lookingBackAudioUrl) {
    mission.lookingBackAudioUrl = lb[0];
  }
});

Object.entries(DEFAULT_RECORDING_MISSION_AUDIO).forEach(([missionId, cfg]) => {
  const mission = MISSION_DATA[missionId];
  const lb = (cfg.lookingBackUrls || []).filter(Boolean);
  if (mission && lb.length && !mission.lookingBackAudioUrl) {
    mission.lookingBackAudioUrl = lb[0];
  }
});

Object.entries(DEFAULT_DRAWING_MISSION_AUDIO).forEach(([missionId, cfg]) => {
  const mission = MISSION_DATA[missionId];
  const lb = (cfg.lookingBackUrls || []).filter(Boolean);
  if (mission && lb.length && !mission.lookingBackAudioUrl) {
    mission.lookingBackAudioUrl = lb[0];
  }
});

// 에셋 썸네일 경로 (영문 폴더명으로 배포 호환)
const ASSET_PATHS = {
  recording: 'assets/recording/',
  drawing: 'assets/drawing/',
  writing: 'assets/writing/',
};

// 파트별 활동 데이터 (모드 x 파트 x 9개 활동)
const PART_ACTIVITIES = {
  recording: {
    1: [
      { label: '기록완료', sub: 'VOICE', extra: '재활동', style: 'card', bg: '#4A4A4A', thumb: 'RB111_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'VOICE',  style: 'card', bg: '#EDE7DC', thumb: 'RB112_a.png' },
      { label: 'MYSELF',       style: 'card', bg: '#7B8C4A', thumb: 'RB121_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'MYSELF', style: 'card', bg: '#5B7BA8', thumb: 'RB122_a.png' },
      { label: 'TODAY',        style: 'card', bg: '#AEBFD9', thumb: 'RB131_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'TODAY',  style: 'card', bg: '#6BAA7A', thumb: 'RB132_a.png' },
      { label: 'DIARY',        style: 'card', bg: '#7B4A8C', thumb: 'RB141_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'DIARY',  style: 'card', bg: '#C89060', thumb: 'RB142_a.png' },
      { label: 'POINT',        style: 'card', bg: '#E8B8B0', thumb: 'RB151_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'POINT',  style: 'card', bg: '#C8A8A0', thumb: 'RB152_a.png' },
      { label: 'LIST',         style: 'card', bg: '#3AADA8', thumb: 'RB161_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'LIST',   style: 'card', bg: '#F0B8A8', thumb: 'RB162_a.png' },
      { label: '', style: 'current', bg: '#FCE4EC', icon: 'grid' },
    ],
    2: [
      { label: 'TIME AND MONEY', style: 'card', bg: '#B8A888', thumb: 'RB211_a.png' },
      { label: 'LOOKING BACK',   lookingBackFor: 'TIME AND MONEY', style: 'card', bg: '#D8A8A8', thumb: 'RB212_a.png' },
      { label: 'FOND',           style: 'card', bg: '#F8C8C8', thumb: 'RB221_a.png' },
      { label: 'LOOKING BACK',   lookingBackFor: 'FOND',           style: 'card', bg: '#F0B8A0', thumb: 'RB222_a.png' },
      { label: 'DISLIKE',        style: 'card', bg: '#D0D0D0', thumb: 'RB231_a.png' },
      { label: 'LOOKING BACK',   lookingBackFor: 'DISLIKE',        style: 'card', bg: '#C0C0C0', thumb: 'RB232_a.png' },
      { label: 'REMAIN',         style: 'card', bg: '#D88080', thumb: 'RB241_a.png' },
      { label: 'LOOKING BACK',   lookingBackFor: 'REMAIN',         style: 'card', bg: '#C87070', thumb: 'RB242_a.png' },
      { label: 'EMOTION',        style: 'card', bg: '#E8A0A8', thumb: 'RB251_a.png' },
      { label: 'LOOKING BACK',   lookingBackFor: 'EMOTION',        style: 'card', bg: '#D89098', thumb: 'RB252_a.png' },
      { label: '', style: 'current', bg: '#FCE4EC', icon: 'grid' },
    ],
    3: [
      { label: 'PARTNER',      style: 'card', bg: '#5B7BA8', thumb: 'RB311_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'PARTNER', style: 'card', bg: '#4A6A97', thumb: 'RB312_a.png' },
      { label: 'ONCE',         style: 'card', bg: '#A8A8A8', thumb: 'RB321_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'ONCE',    style: 'card', bg: '#989898', thumb: 'RB322_a.png' },
      { label: 'SUPPORT',      style: 'card', bg: '#6BAA7A', thumb: 'RB331_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'SUPPORT', style: 'card', bg: '#5A9A69', thumb: 'RB332_a.png' },
      { label: 'LETTER',       style: 'card', bg: '#E8D8D0', thumb: 'RB341_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'LETTER',  style: 'card', bg: '#6888C8', thumb: 'RB342_a.png' },
      { label: 'ABOUT ME', sub: '(6)', style: 'card', bg: '#7ABCB0', thumb: 'RB343_a.png' },
      { label: '', style: 'current', bg: '#FCE4EC', icon: 'grid' },
    ],
    4: [
      { label: 'MY SIDE',      style: 'card', bg: '#8C3A58', thumb: 'RB411_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'MY SIDE', style: 'card', bg: '#7A2A48', thumb: 'RB412_a.png' },
      { label: "IT'S ME",      style: 'card', bg: '#E06858', thumb: 'RB421_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: "IT'S ME", style: 'card', bg: '#C85848', thumb: 'RB422_a.png' },
      { label: '', style: 'current', bg: '#FCE4EC', icon: 'grid' },
    ],
  },
  writing: {
    1: [
      // ALONG: 처음부터 완료 표시가 뜨지 않도록 style을 일반 카드로 유지
      { label: '기록완료', sub: 'ALONG', extra: '재활동', style: 'card', bg: '#4A4A4A', thumb: 'WB111_a.png' },
      { label: 'STAR I',       style: 'card', bg: '#FFF5F5', thumb: 'WB121_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'STAR I', style: 'card', bg: '#FFF0F5', thumb: 'WB122_a.png' },
      { label: '3LINES',   relaxingFor: 'STAR I',   relaxingIdx: 0, style: 'card', bg: '#D9D0C0', thumb: 'WB123_a.png' },
      { label: 'REPLY',    relaxingFor: 'STAR I',   relaxingIdx: 1, style: 'card', bg: '#FFFFFF',  thumb: 'WB124_a.png' },
      { label: 'MEMO',     relaxingFor: 'STAR I',   relaxingIdx: 2, style: 'card', bg: '#F0E6FF', thumb: 'WB125_a.png' },
      { label: 'TRASHCAN', relaxingFor: 'STAR I',   relaxingIdx: 3, style: 'card', bg: '#E8E8E8', thumb: 'WB126_a.png' },
      { label: 'ASK',          style: 'card', bg: '#FFFFF0', thumb: 'WB131_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'ASK',     style: 'card', bg: '#FAF0E6', thumb: 'WB132_a.png' },
      { label: 'NAME',         style: 'card', bg: '#D4E6F5', thumb: 'WB141_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'NAME',   style: 'card', bg: '#5B9BD5', thumb: 'WB142_a.png' },
      { label: 'REPLY',    relaxingFor: 'NAME',      relaxingIdx: 0, style: 'card', bg: '#D9D0C0', thumb: 'WB143_a.png' },
      { label: 'ANY',      relaxingFor: 'NAME',      relaxingIdx: 1, style: 'card', bg: '#5B9BD5', thumb: 'WB144_a.png' },
      { label: 'STAR II',      style: 'card', bg: '#E0F0FF', thumb: 'WB151_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'STAR II', style: 'card', bg: '#E0F0FF', thumb: 'WB152_a.png' },
      { label: '5LINES',  relaxingFor: 'STAR II', relaxingIdx: 0, style: 'card', bg: '#E0F0FF', thumb: 'WB153_a.png' },
      { label: 'LYRICS',  relaxingFor: 'STAR II', relaxingIdx: 1, style: 'card', bg: '#E0F0FF', thumb: 'WB154_a.png' },
      { label: 'ABOUT',        style: 'card', bg: '#E8F5F0', thumb: 'WB161_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'ABOUT',   style: 'card', bg: '#89CCC5', thumb: 'WB162_a.png' },
      { label: 'COMPLETE',     relaxingFor: 'ABOUT', relaxingIdx: 0, style: 'card', bg: '#D0D0D0', thumb: 'WB163_a.png' },
      { label: 'MAKE',         relaxingFor: 'ABOUT', relaxingIdx: 1, style: 'card', bg: '#5B9BD5', thumb: 'WB164_a.png' },
      { label: 'THINGS',       relaxingFor: 'ABOUT', relaxingIdx: 2, style: 'card', bg: '#E6F2FF', thumb: 'WB165_a.png' },
      { label: 'DIY (Do It Youself)', relaxingFor: 'ABOUT', relaxingIdx: 3, style: 'card', bg: '#E0F7FA', thumb: 'WB166_a.png' },
      { label: '', style: 'current', bg: '#FCE4EC', icon: 'grid' },
    ],
    2: [
      { label: 'WORDS',        style: 'card', bg: '#FCE4EC', thumb: 'WB211_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'WORDS',   style: 'card', bg: '#F8BBD9', thumb: 'WB212_a.png' },
      { label: 'DAY',          style: 'card', bg: '#E0F7FA', thumb: 'WB221_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'DAY',      style: 'card', bg: '#FFFFFF',  thumb: 'WB222_a.png' },
      { label: 'LIST_W',       style: 'card', bg: '#E8EDF5', thumb: 'WB231_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'LIST_W',  style: 'card', bg: '#89CCC5', thumb: 'WB232_a.png' },
      { label: 'HALF',  relaxingFor: 'LIST_W', relaxingIdx: 0, style: 'card', bg: '#B39DDB', thumb: 'WB233_a.png' },
      { label: 'ONE_W', relaxingFor: 'LIST_W', relaxingIdx: 1, style: 'card', bg: '#E3F2FF', thumb: 'WB234_a.png' },
      { label: 'BRAIN',        style: 'card', bg: '#E3F2FD', thumb: 'WB241_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'BRAIN',   style: 'card', bg: '#E1F5FE', thumb: 'WB242_a.png' },
      { label: 'HARD',         style: 'card', bg: '#F0FFF0', thumb: 'WB251_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'HARD',     style: 'card', bg: '#FFF8F7', thumb: 'WB252_a.png' },
      { label: 'WISH',         relaxingFor: 'HARD',        relaxingIdx: 0, style: 'card', bg: '#E0F7FA', thumb: 'WB253_a.png' },
      { label: 'DIARY_W',      style: 'card', bg: '#DDEEF8', thumb: 'WB261_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'DIARY_W', style: 'card', bg: '#B3D9F0', thumb: 'WB262_a.png' },
      { label: 'FLEX',         style: 'card', bg: '#E0F7FA', thumb: 'WB271_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'FLEX',    style: 'card', bg: '#E0F7FA', thumb: 'WB272_a.png' },
      { label: 'COMPLETE',     relaxingFor: 'FLEX', relaxingIdx: 0, style: 'card', bg: '#F0FFF0', thumb: 'WB273_a.png' },
      { label: 'TRASHCAN',     relaxingFor: 'FLEX', relaxingIdx: 1, style: 'card', bg: '#B2DFDB', thumb: 'WB274_a.png' },
      { label: 'SQUARE',       relaxingFor: 'FLEX', relaxingIdx: 2, style: 'card', bg: '#FFFDE7', thumb: 'WB275_a.png' },
      { label: 'DIY (Do It Youself)', relaxingFor: 'FLEX', relaxingIdx: 3, style: 'card', bg: '#E0F2F1', thumb: 'WB276_a.png' },
      { label: '', style: 'current', bg: '#FCE4EC', icon: 'grid' },
    ],
    3: [
      { label: 'GIFT',         style: 'card', bg: '#F5F0E8', thumb: 'WB311_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'GIFT',     style: 'card', bg: '#FFFDE7', thumb: 'WB312_a.png' },
      { label: 'RELATION',     style: 'card', bg: '#D9EDF7', thumb: 'WB321_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'RELATION', style: 'card', bg: '#FFE8D0', thumb: 'WB322_a.png' },
      { label: 'FRIEND',       style: 'card', bg: '#A8D8CF', thumb: 'WB331_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'FRIEND',   style: 'card', bg: '#FFD0DC', thumb: 'WB332_a.png' },
      { label: 'TRIP',         style: 'card', bg: '#87CEEB', thumb: 'WB341_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'TRIP',     style: 'card', bg: '#87CEEB', thumb: 'WB342_a.png' },
      { label: 'PACK',     relaxingFor: 'TRIP', relaxingIdx: 0, style: 'card', bg: '#87CEEB', thumb: 'WB343_a.png' },
      { label: 'PLAN',     relaxingFor: 'TRIP', relaxingIdx: 1, style: 'card', bg: '#87CEEB', thumb: 'WB344_a.png' },
      { label: 'PHOTO',    relaxingFor: 'TRIP', relaxingIdx: 2, style: 'card', bg: '#87CEEB', thumb: 'WB345_a.png' },
      { label: 'SOUVENIR', relaxingFor: 'TRIP', relaxingIdx: 3, style: 'card', bg: '#B3E5FC', thumb: 'WB346_a.png' },
      { label: 'SAY',          style: 'card', bg: '#FFFFFF', thumb: 'WB351_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'SAY',      style: 'card', bg: '#F3E8FF', thumb: 'WB352_a.png' },
      { label: 'COMPLETE', relaxingFor: 'SAY', relaxingIdx: 0, style: 'card', bg: '#FFBBAA', thumb: 'WB353_a.png' },
      { label: 'ANY',      relaxingFor: 'SAY', relaxingIdx: 1, style: 'card', bg: '#D0E8FF', thumb: 'WB354_a.png' },
      { label: 'SCRIBBLE', relaxingFor: 'SAY', relaxingIdx: 2, style: 'card', bg: '#CCEE88', thumb: 'WB355_a.png' },
      { label: 'DIY (Do It Youself)', relaxingFor: 'SAY', relaxingIdx: 3, style: 'card', bg: '#E8F5E9', thumb: 'WB356_a.png' },
      { label: '', style: 'current', bg: '#FCE4EC', icon: 'grid' },
    ],
    4: [
      { label: 'HOPE',         style: 'card', bg: 'linear-gradient(135deg,#FFFACD,#FFA07A)', thumb: 'WB411_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'HOPE', style: 'card', bg: '#FFE0B2', thumb: 'WB412_a.png' },
      { label: 'FUTURE',       relaxingFor: 'HOPE', relaxingIdx: 0, style: 'card', bg: '#FFF9C4', thumb: 'WB413_a.png' },
      { label: 'THEM',         relaxingFor: 'HOPE', relaxingIdx: 1, style: 'card', bg: '#FFFDE7', thumb: 'WB414_a.png' },
      { label: 'NEWME',        style: 'card', bg: 'linear-gradient(135deg,#E8F5E9,#A5D6A7)', thumb: 'WB421_a.jpg' },
      { label: 'LOOKING BACK', lookingBackFor: 'NEWME_W', style: 'card', bg: '#C8E6C9', thumb: 'WB422_a.jpg' },
      { label: 'FINISH',       relaxingFor: 'NEWME_W', relaxingIdx: 0, style: 'card', bg: '#DCEDC8', thumb: 'WB423_a.jpg' },
      { label: 'NEWS',         relaxingFor: 'NEWME_W', relaxingIdx: 1, style: 'card', bg: '#F1F8E9', thumb: 'WB424_a.jpg' },
      { label: '배리어프리1',  relaxingFor: 'NEWME_W', relaxingIdx: 2, style: 'card', bg: '#E8F5E9', thumb: 'WB425_a.png' },
      { label: '배리어프리2',  relaxingFor: 'NEWME_W', relaxingIdx: 3, style: 'card', bg: '#F1F8E9', thumb: 'WB426_a.png' },
      { label: '', style: 'current', bg: '#FCE4EC', icon: 'grid' },
    ],
  },
  drawing: {
    1: [
      { label: 'MUSIC',        style: 'card', bg: '#E3F2FD', thumb: 'DB111_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'MUSIC',  style: 'card', bg: '#E3F2FD', thumb: 'DB112_a.png' },
      { label: 'PAINT',    style: 'card', bg: '#FFFFFF', thumb: 'DB121.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'PAINT',  style: 'card', bg: '#B2DFDB', thumb: 'DB122.png' },
      { label: 'SQUARE_D', relaxingFor: 'PAINT', relaxingIdx: 0, style: 'card', bg: '#B2DFDB', thumb: 'DB123.png' },
      { label: 'COLOR',        style: 'card', bg: '#FCE4EC', thumb: 'DB131_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'COLOR',  style: 'card', bg: '#FFF3E0', thumb: 'DB132_a.png' },
      { label: 'ONE',          style: 'card', bg: '#FFFFFF', thumb: 'DB141_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'ONE',    style: 'card', bg: '#F3E5F5', thumb: 'DB142_a.png' },
      { label: 'CIRCLE',       relaxingFor: 'ONE', relaxingIdx: 0, style: 'card', bg: '#FFCCBC', thumb: 'DB143_a.png' },
      { label: '', style: 'current', bg: '#FCE4EC', icon: 'grid' },
    ],
    2: [
      { label: 'Favorite',     style: 'card', bg: '#D9EDF7', thumb: 'DB211_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'Favorite', style: 'card', bg: '#D9EDF7', thumb: 'DB212_a.png' },
      { label: 'JANUS',        style: 'card', bg: '#FFFFFF', thumb: 'DB221_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'JANUS',    style: 'card', bg: '#F0FFF0', thumb: 'DB222_a.png' },
      { label: 'OCTAGON',      relaxingFor: 'JANUS', relaxingIdx: 0, style: 'card', bg: '#E0F7F4', thumb: 'DB223_a.png' },
      { label: 'IF',           style: 'card', bg: '#FFFDE7', thumb: 'DB231_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'IF',       style: 'card', bg: '#FFFDE7', thumb: 'DB232_a.png' },
      { label: 'ROAD',         style: 'card', bg: '#E3F2FD', thumb: 'DB241.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'ROAD',     style: 'card', bg: '#F5F5F5', thumb: 'DB242.png' },
      { label: 'STAR_D',       relaxingFor: 'ROAD', relaxingIdx: 0, style: 'card', bg: '#FFF8E1', thumb: 'DB243.png' },
      { label: 'FACE',         style: 'card', bg: '#B2DFDB', thumb: 'DB251_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'FACE',     style: 'card', bg: '#FFFDE7', thumb: 'DB252_a.png' },
      { label: 'TRIP_D',       style: 'card', bg: '#E1F5FE', thumb: 'DB261_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'TRIP_D',   style: 'card', bg: '#E1F5FE', thumb: 'DB262_a.png' },
      { label: 'TRIANGLE',     relaxingFor: 'TRIP_D', relaxingIdx: 0, style: 'card', bg: '#E1F5FE', thumb: 'DB263_a.png' },
      { label: '배리어프리1',  relaxingFor: 'TRIP_D', relaxingIdx: 1, style: 'card', bg: '#E8F5E9', thumb: 'DB264_a.png' },
      { label: '', style: 'current', bg: '#FCE4EC', icon: 'grid' },
    ],
    3: [
      { label: 'SINKHOLE',    style: 'card', bg: '#FFFFFF', thumb: 'DB311_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'SINKHOLE', style: 'card', bg: '#F0FFF0', thumb: 'DB312_a.png' },
      { label: 'RAIN',        style: 'card', bg: '#F0F8F0', thumb: 'DB321_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'RAIN',     style: 'card', bg: '#F0F8F0', thumb: 'DB322_a.png' },
      { label: 'CUP',          relaxingFor: 'RAIN', relaxingIdx: 0, style: 'card', bg: '#F0F8F0', thumb: 'DB323_a.png' },
      { label: 'ANIMAL',      style: 'card', bg: '#A8D8CF', thumb: 'DB331_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'ANIMAL',   style: 'card', bg: '#FFD0DC', thumb: 'DB332_a.png' },
      { label: 'NETWORK',     style: 'card', bg: '#FFFDE7', thumb: 'DB341_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'NETWORK',  style: 'card', bg: '#FFFDE7', thumb: 'DB342_a.png' },
      { label: 'CANDLE',       relaxingFor: 'NETWORK', relaxingIdx: 0, style: 'card', bg: '#FFFDE7', thumb: 'DB343_a.png' },
      { label: 'THINK',       style: 'card', bg: '#FFFFFF', thumb: 'DB351_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'THINK',    style: 'card', bg: '#FFF0F5', thumb: 'DB352_a.png' },
      { label: 'LOOK',        style: 'card', bg: '#F5F0FF', thumb: 'DB361_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'LOOK',     style: 'card', bg: '#F0F5FF', thumb: 'DB362_a.png' },
      { label: 'BAG',          relaxingFor: 'LOOK', relaxingIdx: 0, style: 'card', bg: '#F5F0FF', thumb: 'DB363_a.png' },
      { label: '배리어프리2',  relaxingFor: 'LOOK', relaxingIdx: 1, style: 'card', bg: '#F1F8E9', thumb: 'DB364_a.png' },
      { label: '', style: 'current', bg: '#FCE4EC', icon: 'grid' },
    ],
    4: [
      { label: 'RETOUCH',      style: 'card', bg: '#FFFFFF', thumb: 'DB411_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'RETOUCH', style: 'card', bg: '#B2DFDB', thumb: 'DB412_a.png' },
      { label: 'NEWME',        style: 'card', bg: '#FFFDE7', thumb: 'DB421_a.png' },
      { label: 'LOOKING BACK', lookingBackFor: 'NEWME',   style: 'card', bg: '#F3E5F5', thumb: 'DB422_a.png' },
      { label: 'HEART',        relaxingFor: 'NEWME', relaxingIdx: 0, style: 'card', bg: '#E1F5FE', thumb: 'DB423_a.png' },
      { label: '', style: 'current', bg: '#FCE4EC', icon: 'grid' },
    ],
  },
};

// 홈 모드별 데이터
const HOME_MODES = {
  recording: {
    tag: '힐링레코딩',
    bannerClass: 'banner-recording',
    cards: [
      { label: 'VOICE', part: 1, color: '#E5D8C8', onclick: "openPartActivity('recording', 1)" },
      { label: 'TIME AND MONEY', part: 2, color: '#B8D4E8', onclick: "openPartActivity('recording', 2)" },
      { label: 'PARTNER', part: 3, color: '#D8E8C8', onclick: "openPartActivity('recording', 3)" },
      { label: 'MY SIDE', part: 4, color: '#E8D4D0', onclick: "openPartActivity('recording', 4)" },
    ],
    posts: [
      { id: 'p1', title: 'LETTER - 미안해/고마워 편지', body: '미안하다, 고맙다 말하고 싶은 사람에게 음성편지 보내기', icon: 'LETTER', color: '#8B7355' },
      { id: 'p2', title: '표현이 중요하다는 걸 알면서도...', body: '힐링북 활동을 하면서 주변 사람', icon: 'leaf', color: '#7EC400' },
      { id: 'p3', title: 'MY SIDE - LOOKING BACK', body: '', icon: 'LOOKING BACK', color: '#5B9BD5' },
    ],
  },
  writing: {
    tag: '힐링라이팅',
    bannerClass: 'banner-writing',
    cards: [
      { label: 'ALONG', part: 1, page: 'p9', color: '#B8E4DC', onclick: "openPartActivity('writing', 1)" },
      { label: 'WORDS', part: 2, page: 'p51', color: '#E8D4E8', onclick: "openPartActivity('writing', 2)" },
      { label: 'GIFT', part: 3, page: 'p82', color: '#D8E8C8', onclick: "openPartActivity('writing', 3)" },
      { label: 'HOPE', part: 4, page: 'p128', color: '#FFE4D0', onclick: "openPartActivity('writing', 4)" },
    ],
    posts: [
      { id: 'p1', title: 'WORDS - 어울리는 단어', body: '나와 어울리는 단어를 생각하다보니 스스로를 어떻게 생각하고 있는지도 알 수 있어 재미', icon: 'WORDS', color: '#E8B4E8' },
      { id: 'p2', title: 'GIFT - 서무', body: '', icon: 'GIFT', color: '#98FB98' },
    ],
  },
  drawing: {
    tag: '힐링드로잉',
    bannerClass: 'banner-drawing',
    cards: [
      { label: 'MUSIC', part: 1, page: 'p6', color: '#F5D0D8', onclick: "openPartActivity('drawing', 1)" },
      { label: 'Favorite', part: 2, page: 'p16', color: '#C8E8E0', onclick: "openPartActivity('drawing', 2)" },
      { label: 'SINKHOLE', part: 3, page: 'p30', color: '#E8D8E8', onclick: "openPartActivity('drawing', 3)" },
      { label: 'RETOUCH', part: 4, page: 'p44', color: '#FFF0D8', onclick: "openPartActivity('drawing', 4)" },
    ],
    posts: [
      { id: 'p1', title: 'RAIN - LOOKING BACK', body: '요즘 스트레스를 많이 받아왔는데 그게 그림에도 이렇게 나타나는게 신기했어요. 적절한', icon: 'RAIN', color: '#87CEEB' },
      { id: 'p2', title: 'DAIN - LOOK CK', body: '', icon: 'leaf', color: '#98FB98' },
    ],
  },
};

// 오늘의 한 문장 (매일 변경, 한국어+영어)
const DAILY_QUOTES = [
  { ko: '오늘 하루, 나를 위한 시간을 조금만 가져보세요.', en: 'Take a little time for yourself today.' },
  { ko: '지금 이 순간이 가장 소중합니다.', en: 'This moment right now is the most precious.' },
  { ko: '나를 알아가는 여정, 천천히 걸어도 괜찮아요.', en: 'It\'s okay to take your time getting to know yourself.' },
  { ko: '작은 변화가 큰 힘이 됩니다.', en: 'Small changes become great strength.' },
  { ko: '내 마음의 소리에 귀 기울여 보세요.', en: 'Listen to the voice of your heart.' },
  { ko: '오늘도 나를 위해 한 걸음 내딛은 당신, 수고했어요.', en: 'You did well taking a step for yourself today.' },
  { ko: '완벽하지 않아도 괜찮아요. 그대로의 나를 받아주세요.', en: 'It\'s okay to be imperfect. Accept yourself as you are.' },
  { ko: '숨을 고르며 잠시 멈춰 보세요.', en: 'Take a moment to pause and breathe.' },
  { ko: '나만의 속도로 가도 괜찮습니다.', en: 'It\'s okay to go at your own pace.' },
  { ko: '지금 여기, 이 순간에 집중해 보세요.', en: 'Focus on this moment, right here, right now.' },
  { ko: '나를 돌아보는 시간이 마음을 가볍게 합니다.', en: 'Taking time to reflect lightens your heart.' },
  { ko: '작은 감사가 마음을 밝게 합니다.', en: 'Small gratitude brightens the heart.' },
  { ko: '오늘 하루도 나를 위해 존재하는 하루입니다.', en: 'Today is a day that exists for you.' },
  { ko: '마음이 무거울 때는 잠시 쉬어가도 돼요.', en: 'When your heart feels heavy, it\'s okay to rest.' },
  { ko: '나의 이야기를 들어주는 것, 그것만으로도 힐링이 됩니다.', en: 'Being heard is healing in itself.' },
  { ko: '내일을 위해 오늘을 채우기보다, 오늘을 위해 오늘을 살아보세요.', en: 'Live today for today, not for tomorrow.' },
  { ko: '나를 사랑하는 마음으로 나를 대해 보세요.', en: 'Treat yourself with love.' },
  { ko: '지금의 나는 충분히 잘하고 있어요.', en: 'You are doing well enough right now.' },
  { ko: '한 걸음씩, 천천히 나아가도 괜찮아요.', en: 'It\'s okay to move forward slowly, step by step.' },
  { ko: '나의 감정을 있는 그대로 인정해 주세요.', en: 'Acknowledge your feelings as they are.' },
  { ko: '오늘 하루 작은 기쁨을 하나 찾아보세요.', en: 'Find one small joy today.' },
  { ko: '나를 위한 시간은 결코 낭비가 아닙니다.', en: 'Time for yourself is never wasted.' },
  { ko: '지금 이 순간, 나는 여기 있습니다.', en: 'In this moment, I am here.' },
  { ko: '마음이 가벼워지는 순간을 찾아보세요.', en: 'Find moments that lighten your heart.' },
  { ko: '나를 알아가는 것은 평생의 선물입니다.', en: 'Getting to know yourself is a lifelong gift.' },
  { ko: '오늘도 나를 위해 조금만 더 다정해져 보세요.', en: 'Be a little kinder to yourself today.' },
  { ko: '작은 휴식이 큰 힘이 됩니다.', en: 'Small rest brings great strength.' },
  { ko: '나의 이야기는 소중합니다.', en: 'Your story matters.' },
  { ko: '지금 여기, 지금 이대로 괜찮아요.', en: 'Right here, right now, you are okay.' },
  { ko: '나를 돌보는 것부터 시작해 보세요.', en: 'Start by taking care of yourself.' },
  { ko: '오늘 하루, 나에게 한마디 위로를 건네 보세요.', en: 'Offer yourself a word of comfort today.' },
  { ko: '마음이 편해지는 순간을 만들어 보세요.', en: 'Create moments that put your mind at ease.' },
  { ko: '나를 위한 작은 선물을 해 보세요.', en: 'Give yourself a small gift.' },
  { ko: '지금의 나를 있는 그대로 받아주세요.', en: 'Accept yourself as you are right now.' },
  { ko: '한 걸음 내딛은 오늘의 나, 잘했어요.', en: 'You did well taking that step today.' },
  { ko: '나의 마음에 귀 기울이는 시간을 가져보세요.', en: 'Take time to listen to your heart.' },
  { ko: '오늘도 나를 위해 존재하는 하루입니다.', en: 'Today exists for you too.' },
  { ko: '작은 변화가 쌓여 큰 힘이 됩니다.', en: 'Small changes add up to great power.' },
  { ko: '나를 알아가는 여정, 오늘도 한 걸음.', en: 'One more step on the journey to know yourself.' },
  { ko: '지금 이 순간이 가장 소중한 시간입니다.', en: 'This moment is the most precious time.' },
  { ko: '나를 위한 시간, 아깝지 않아요.', en: 'Time for yourself is never a waste.' },
  { ko: '마음이 무거울 때는 잠시 멈춰도 괜찮아요.', en: 'When your heart is heavy, it\'s okay to pause.' },
  { ko: '나만의 속도로 가도 괜찮습니다.', en: 'Your own pace is fine.' },
  { ko: '작은 감사가 마음을 밝게 합니다.', en: 'Small thanks brighten the heart.' },
  { ko: '마음이 가벼워지는 순간을 찾아보세요.', en: 'Seek moments that lighten your heart.' },
  { ko: '내일을 위해 오늘을 채우기보다, 오늘을 위해 오늘을 살아보세요.', en: 'Live today for today.' },
  { ko: '나의 이야기를 들어주는 것, 그것만으로도 힐링이 됩니다.', en: 'Being heard can be healing.' },
  { ko: '마음이 무거울 때는 잠시 쉬어가도 돼요.', en: 'When your heart is heavy, rest a while.' },
  { ko: '내 마음의 소리에 귀 기울여 보세요.', en: 'Listen to your heart.' },
];

function getDailyQuote() {
  const custom = getData(STORAGE_KEYS.dailyQuotes);
  const customQuotes = Array.isArray(custom) ? custom : [];
  const all = [...DAILY_QUOTES, ...customQuotes];
  if (!all.length) return { ko: '', en: '' };
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now - start;
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
  const idx = dayOfYear % all.length;
  return all[idx];
}

// 레코딩 홈 렌더링 (모드별)
function renderHomeContent() {
  const mode = homeMode;
  const data = HOME_MODES[mode] || HOME_MODES.recording;

  // 배너
  const banner = document.getElementById('home-banner');
  const tagEl = document.getElementById('banner-tag');
  if (banner) {
    banner.className = 'home-banner ' + data.bannerClass;
    if (tagEl) tagEl.textContent = data.tag;
  }

  // 콘텐츠 카드
  const cardsEl = document.getElementById('home-quick-cards');
  if (cardsEl) {
    const isDrawing = mode === 'drawing';
  cardsEl.innerHTML = data.cards.map(c => `
      <div class="quick-card content-card ${isDrawing ? 'card-round' : ''}" style="background:${c.color || '#E8E4E0'}; border-color:transparent" onclick="${c.onclick}">
        <span class="card-part">Part ${c.part}</span>
      </div>
    `).join('');
  }

  // 콘텐츠 활동 이어서 하기 / 바로 시작하기 (이어하기 없으면 파트1 첫 콘텐츠 표시)
  const continueSection = document.getElementById('continue-section');
  const continueCardWrap = document.getElementById('home-continue-card');
  const continueTitleEl = document.getElementById('continue-section-title');
  const target = getLastSessionContinueTarget(mode) || getPart1FirstActivity(mode);
  if (continueSection && continueCardWrap) {
    if (target) {
      continueSection.style.display = 'block';
      const isStart = !getLastSessionContinueTarget(mode);
      if (continueTitleEl) continueTitleEl.textContent = isStart ? '콘텐츠 활동 바로 시작하기' : '콘텐츠 활동 이어서 하기';
      const styleStr = 'background:transparent; border:2px solid #9ED94D';
      const descHtml = target.desc ? `<span class="continue-card-desc">${(target.desc || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>` : '';
      const thumbHtml = target.thumbSrc ? `<img class="continue-card-thumb" src="${encodeURI(target.thumbSrc).replace(/"/g, '&quot;')}" alt="">` : '';
      continueCardWrap.innerHTML = `
        <div class="continue-card" style="${styleStr}" onclick="${target.onclick}">
          ${thumbHtml}
          <div class="continue-card-text">
            <span class="continue-card-label">${target.label}</span>
            <span class="continue-card-sub">${target.sub}</span>
            ${descHtml}
          </div>
        </div>
      `;
    } else {
      continueSection.style.display = 'none';
    }
  }

  // 오늘의 한 문장 (한국어 + 영어)
  const q = getDailyQuote();
  const quoteEl = document.getElementById('daily-quote-text');
  const quoteEnEl = document.getElementById('daily-quote-text-en');
  if (quoteEl) quoteEl.textContent = q.ko;
  if (quoteEnEl) quoteEnEl.textContent = q.en;
}

function setHomeMode(mode) {
  homeMode = mode;
  document.querySelectorAll('.mode-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
  renderHomeContent();
}

function openContentDetail(contentId) {
  window.currentContentId = contentId;
  const contents = getContents();
  const content = contents.find(c => c.id === contentId);
  const titleEl = document.getElementById('content-detail-title');
  if (titleEl && content) titleEl.textContent = content.title || '콘텐츠 상세';
  navigate('content-detail');
  renderContentDetailCover();
  renderContentDetailAudio();
}

function goToNextContentFromDetail() {
  try {
    const contents = getContents();
    const curId = window.currentContentId;
    if (!contents || !contents.length || !curId) {
      alert('다음으로 넘어갈 수 있는 콘텐츠를 찾지 못했어요.');
      return;
    }
    const idx = contents.findIndex(c => String(c.id) === String(curId));
    if (idx === -1 || idx >= contents.length - 1) {
      alert('마지막 콘텐츠예요. 다음 콘텐츠가 더 이상 없어요.');
      return;
    }
    const next = contents[idx + 1];
    const ok = confirm('현재 콘텐츠는 아직 저장되지 않았을 수 있어요.\n\n다음 콘텐츠로 바로 넘어갈까요?');
    if (!ok) return;
    openContentDetail(next.id);
  } catch (e) {
    console.warn('[goToNextContentFromDetail] 실패', e);
    alert('다음 콘텐츠로 이동하는 중 오류가 났어요. 잠시 후 다시 시도해 주세요.');
  }
}

// ── YouTube 유틸리티 ──────────────────────────────────────────────
// URL에서 YouTube 비디오 ID 추출
// 지원: https://www.youtube.com/watch?v=ID, https://youtu.be/ID, https://youtube.com/embed/ID
function getYouTubeVideoId(url) {
  if (!url || typeof url !== 'string') return '';
  // 지원 형식:
  //   https://youtu.be/VIDEO_ID          (공유 단축 URL)
  //   https://youtu.be/VIDEO_ID?si=XXX   (공유 단축 URL + 추적 파라미터)
  //   https://www.youtube.com/watch?v=VIDEO_ID
  //   https://www.youtube.com/watch?v=VIDEO_ID&t=30s
  //   https://www.youtube.com/shorts/VIDEO_ID
  //   https://www.youtube.com/embed/VIDEO_ID
  //   https://www.youtube.com/live/VIDEO_ID  (라이브)
  //   https://m.youtube.com/watch?v=VIDEO_ID  (모바일)
  const m = url.match(
    /(?:youtube(?:-nocookie)?\.com\/(?:.*?[?&]v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_\-]{11})/i
  );
  return m ? m[1] : '';
}

// ── 유튜브 오디오 플레이어 초기화 (커스텀 컨트롤 연동) ─────────────
// playerDivPrefix: 각 재생 div의 id prefix (e.g. 'yt-player-cd-')
// blockPrefix:     각 블록의 id prefix (e.g. 'content-audio-block-')
// urls:            audioUrls 배열
const CONTENT_YT_PLAYERS = [];

function stopAllContentAudio() {
  try {
    CONTENT_YT_PLAYERS.forEach(p => {
      try { p.stopVideo && p.stopVideo(); } catch {}
      try { p.destroy && p.destroy(); } catch {}
    });
  } catch {}
  CONTENT_YT_PLAYERS.length = 0;
  try {
    document.querySelectorAll('#content-detail audio.content-audio-native, #post-detail audio.content-audio-native')
      .forEach(a => {
        try { a.pause(); a.currentTime = 0; } catch {}
      });
  } catch {}
}

function initYouTubeAudioPlayers(urls, playerDivPrefix, blockPrefix) {
  const doInit = () => {
    urls.forEach((url, i) => {
      const videoId = getYouTubeVideoId(url);
      if (!videoId) return;
      const playerDivId = playerDivPrefix + i;
      const blockId = blockPrefix + i;
      const block = document.getElementById(blockId);
      const playerDiv = document.getElementById(playerDivId);
      if (!block || !playerDiv) return;

      const playBtn = block.querySelector('.content-audio-btn.play');
      const stopBtn = block.querySelector('.content-audio-btn.stop');
      const progressEl = block.querySelector('.content-audio-progress');
      const timeEl = block.querySelector('.content-audio-time');
      let progressInterval = null;

      const ytPlayer = new YT.Player(playerDivId, {
        videoId: videoId,
        playerVars: {
          autoplay: 0, controls: 0, disablekb: 1, fs: 0,
          iv_load_policy: 3, modestbranding: 1, rel: 0, playsinline: 1,
        },
        events: {
          onReady: function(e) {
            const dur = e.target.getDuration();
            if (timeEl && dur) timeEl.textContent = '00:00 | ' + formatTime(Math.floor(dur));
          },
          onStateChange: function(e) {
            if (e.data === YT.PlayerState.PLAYING) {
              if (playBtn) { playBtn.textContent = '⏸'; playBtn.classList.add('paused'); }
              if (progressInterval) clearInterval(progressInterval);
              progressInterval = setInterval(() => {
                const cur = ytPlayer.getCurrentTime();
                const dur = ytPlayer.getDuration();
                if (progressEl && dur) progressEl.value = (cur / dur) * 100;
                if (timeEl && dur) timeEl.textContent = formatTime(Math.floor(cur)) + ' | ' + formatTime(Math.floor(dur));
              }, 250);
            } else {
              if (playBtn) { playBtn.textContent = '▶'; playBtn.classList.remove('paused'); }
              if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
            }
            if (e.data === YT.PlayerState.ENDED) {
              if (progressEl) progressEl.value = 0;
              const dur = ytPlayer.getDuration();
              if (timeEl && dur) timeEl.textContent = '00:00 | ' + formatTime(Math.floor(dur));
            }
          },
          onError: function(e) {
            if (playBtn) { playBtn.textContent = '▶'; playBtn.classList.remove('paused'); }
            if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
            const msg = (e.data === 150 || e.data === 101)
              ? '이 영상은 비공개입니다. 유튜브에서 "일부 공개"로 변경해 주세요.'
              : (e.data === 100)
              ? '영상을 찾을 수 없습니다. 링크를 확인해 주세요.'
              : '영상을 재생할 수 없습니다. (오류: ' + e.data + ')';
            if (timeEl) timeEl.textContent = '재생 불가';
            alert(msg);
          },
        },
      });
      CONTENT_YT_PLAYERS.push(ytPlayer);

      if (playBtn) playBtn.addEventListener('click', () => {
        const s = ytPlayer.getPlayerState();
        if (s === YT.PlayerState.PLAYING) ytPlayer.pauseVideo();
        else ytPlayer.playVideo();
      });
      if (stopBtn) stopBtn.addEventListener('click', () => {
        ytPlayer.stopVideo();
        if (progressEl) progressEl.value = 0;
        const dur = ytPlayer.getDuration();
        if (timeEl && dur) timeEl.textContent = '00:00 | ' + formatTime(Math.floor(dur));
      });
      if (progressEl) progressEl.addEventListener('input', () => {
        const dur = ytPlayer.getDuration();
        if (dur) ytPlayer.seekTo((parseFloat(progressEl.value) / 100) * dur, true);
      });
    });
  };

  if (typeof YT !== 'undefined' && YT.Player) {
    doInit();
  } else {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function() {
      if (typeof prev === 'function') prev();
      doInit();
    };
  }
}

// 콘텐츠 상세: 유튜브 음성 → 블록 레이아웃 + 커스텀 재생 UI + 활동완료
function renderContentDetailAudio() {
  const container = document.getElementById('content-detail-audio-urls');
  const coverEl = document.getElementById('content-cover');
  if (!container) return;
  const contentId = window.currentContentId;
  const contents = getContents();
  const content = contents.find(c => c.id === contentId);
  const urls = content?.audioUrls;
  if (!urls || !urls.length) {
    container.innerHTML = '';
    container.style.display = 'none';
    if (coverEl) coverEl.style.display = '';
    return;
  }
  if (coverEl) coverEl.style.display = 'none';
  container.style.display = 'block';

  container.innerHTML = urls.map((url, i) => {
    const videoId = getYouTubeVideoId(url);
    const label = urls.length > 1 ? `음성 ${i + 1}` : '음성';
    const blockId = `content-audio-block-${i}`;
    const playerDivId = `yt-player-cd-${i}`;
    if (videoId) {
      return `
        <div class="detail-block content-audio-block" id="${blockId}">
          <p class="content-audio-block-prompt">${label}</p>
          <div class="content-audio-controls">
            <button type="button" class="content-audio-btn play" aria-label="재생">▶</button>
            <button type="button" class="content-audio-btn stop" aria-label="정지">■</button>
            <input type="range" class="content-audio-progress" value="0" max="100" min="0" step="0.1">
            <span class="content-audio-time">00:00 | 00:00</span>
          </div>
          <div class="yt-player-hidden"><div id="${playerDivId}"></div></div>
          <button type="button" class="activity-complete-btn">활동완료</button>
        </div>`;
    }
    return `
      <div class="detail-block content-audio-block" id="${blockId}">
        <p class="content-audio-block-prompt">${label}</p>
        <audio src="${url}" controls class="content-audio-native"></audio>
        <button type="button" class="activity-complete-btn">활동완료</button>
      </div>`;
  }).join('');

  initYouTubeAudioPlayers(urls, 'yt-player-cd-', 'content-audio-block-');
}
function renderContentDetailCover() {
  const contentId = window.currentContentId;
  const contents = getContents();
  const content = contents.find(c => c.id === contentId);
  const themeEl = document.getElementById('content-detail-theme-badge');
  const descEl = document.getElementById('content-detail-description');
  const titleEl = document.getElementById('content-detail-title');
  if (!content) return;
  if (titleEl) titleEl.textContent = content.displayTitle || content.title || '콘텐츠 상세';
  if (themeEl) themeEl.textContent = content.theme || content.title?.split(' - ')[0] || '';
  if (descEl) {
    const desc = content.description || content.title || '';
    descEl.innerHTML = desc.split('\n').map(line => line.trim()).filter(Boolean).join('<br>') || content.title || '';
  }
}


// 미션 상세 화면 (콘텐츠와 동일한 썸네일·한글타이틀/미션 표시)
let currentMissionId = 'LETTER';
let currentMissionThumb = '';
// viewMode: 'main'(본활동) | 'lookingback'(돌아보기) | 'relaxing'(릴렉싱)
let currentMissionViewMode = 'main';
let missionRevealPhase = 0;
let currentRelaxingIdx = 0; // 릴렉싱 인덱스 (0=3번, 1=4번, 2=5번 파일)
let currentMissionActivityIndex = -1;

async function openMissionDetail(missionId, thumb, startPhase) {
  const mode = partActivityMode;
  const part = partActivityPart;
  const ok = await ensureModeCouponUnlocked(mode, part, missionId, 'main', 0);
  if (!ok) return;
  currentMissionId = missionId;
  currentMissionThumb = thumb || '';
  currentRelaxingIdx = 0;
  if (typeof startPhase === 'number' && startPhase >= 1) {
    currentMissionViewMode = 'lookingback';
    missionRevealPhase = 1;
  } else {
    currentMissionViewMode = 'main';
    missionRevealPhase = 0;
  }
  try {
    const modeData = PART_ACTIVITIES[partActivityMode] || {};
    const acts = modeData[partActivityPart] || [];
    currentMissionActivityIndex = findCurrentActivityIndex(acts, missionId, currentMissionViewMode, currentRelaxingIdx);
  } catch {
    currentMissionActivityIndex = -1;
  }
  saveLastSessionProgress(partActivityMode, partActivityPart, missionId, currentMissionViewMode, 0);
  renderMissionDetail();
  navigate('mission-detail');
}

function moveMissionByStep(step) {
  try {
    const modeData = PART_ACTIVITIES[partActivityMode] || {};
    const acts = modeData[partActivityPart] || [];
    if (!acts.length) return;

    // 화면에 보이는 카드들(현재 파트의 활동 카드들, style !== 'current') 기준으로 이전/다음 계산
    const visibleIndices = [];
    for (let i = 0; i < acts.length; i++) {
      if (acts[i] && acts[i].style !== 'current') visibleIndices.push(i);
    }
    if (!visibleIndices.length) return;

    const fullIdx = findCurrentActivityIndex(acts, currentMissionId, currentMissionViewMode, currentRelaxingIdx);
    if (fullIdx < 0) return;
    const pos = visibleIndices.indexOf(fullIdx);
    if (pos < 0) return;

    const nextPos = pos + step;
    if (nextPos < 0 || nextPos >= visibleIndices.length) return;

    const nextIdx = visibleIndices[nextPos];
    const a = acts[nextIdx];
    if (!a) return;

    currentMissionActivityIndex = nextIdx;
    const thumbArg = a.thumb || '';

    if (a.relaxingFor !== undefined) {
      openRelaxingMission(a.relaxingFor, a.relaxingIdx || 0, thumbArg);
    } else if (a.lookingBackFor) {
      openMissionDetail(a.lookingBackFor, thumbArg, 1);
    } else {
      const mid = getMissionIdFromActivity(a);
      openMissionDetail(mid, thumbArg);
    }
  } catch (e) {
    console.error('[moveMissionByStep] error', e);
  }
}

function goMissionPrev() {
  moveMissionByStep(-1);
}

function goMissionNext() {
  moveMissionByStep(1);
}

// 릴렉싱 미션 카드 클릭 — 직전 본활동 미션의 릴렉싱 URL(relaxingUrls[idx]) 사용
async function openRelaxingMission(parentId, relaxingIdx, thumb) {
  const mode = partActivityMode;
  const part = partActivityPart;
  const ok = await ensureModeCouponUnlocked(mode, part, parentId, 'relaxing', relaxingIdx || 0);
  if (!ok) return;
  currentMissionId = parentId;
  currentMissionThumb = thumb || '';
  currentMissionViewMode = 'relaxing';
  currentRelaxingIdx = relaxingIdx || 0;
  missionRevealPhase = 0;
  try {
    const modeData = PART_ACTIVITIES[partActivityMode] || {};
    const acts = modeData[partActivityPart] || [];
    currentMissionActivityIndex = findCurrentActivityIndex(acts, parentId, 'relaxing', currentRelaxingIdx);
  } catch {
    currentMissionActivityIndex = -1;
  }
  saveLastSessionProgress(partActivityMode, partActivityPart, parentId, 'relaxing', relaxingIdx || 0);
  renderMissionDetail();
  navigate('mission-detail');
}

// 돌아보기 완료 버튼 클릭 → 마음톡 표시
function completeLookingBack() {
  missionRevealPhase = 2;
  applyMissionRevealPhase();
  const btn = document.getElementById('looking-back-complete-btn');
  if (btn) {
    btn.textContent = '완료 ✓';
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.style.pointerEvents = 'none';
  }
}

// 현재 viewMode·phase에 따라 섹션 표시 갱신
function applyMissionRevealPhase() {
  const baseMissionId = LOOKING_BACK_AUDIO_KEYS[currentMissionId] ? currentMissionId.replace(/_LB$/, '') : currentMissionId;
  const mission = MISSION_DATA[baseMissionId] || MISSION_DATA.LETTER;
  const lookingBack = mission.lookingBack || (mission.question ? [mission.question] : null);
  const hasLookingBack = Array.isArray(lookingBack) ? lookingBack.length > 0 : !!lookingBack;
  const hasMindTalk = !!mission.mindTalk;

  const lookingBackWrap = document.getElementById('mission-looking-back-wrap');
  const mindTalkWrap   = document.getElementById('mission-mind-talk-wrap');
  const playLabelEl    = document.getElementById('mission-play-label');
  const mainActivityTopEl = document.getElementById('mission-detail-main-activity-top');

  const relaxingWrap = document.getElementById('mission-relaxing-wrap');

  // 관리자 저장 텍스트 읽기
  let adminOverride = null;
  try {
    const raw = localStorage.getItem('contique_mission_audio');
    const all = (JSON.parse(raw || '{}') || {});
    const lbKey = (currentMissionViewMode === 'lookingback' && LOOKING_BACK_AUDIO_KEYS[currentMissionId]) ? LOOKING_BACK_AUDIO_KEYS[currentMissionId] : null;
    const key = lbKey || currentMissionId;
    adminOverride = all[key] || null;
  } catch(e) {}

  // 관리자 entries 포맷에서 텍스트 추출 헬퍼
  const getAdminText = (idx) => {
    if (!adminOverride) return null;
    if (adminOverride.entries && adminOverride.entries.length > 0) {
      const entry = adminOverride.entries[idx];
      return entry?.text || null;
    }
    return null;
  };

  const playbackSection = document.getElementById('mission-playback-section');
  const playbackAnchor  = document.getElementById('mission-playback-anchor');
  const lbCompleteBtn   = document.getElementById('looking-back-complete-btn');
  const missionMissionSection = document.getElementById('mission-mission-playback-section');
  const giftMissionSection = document.getElementById('gift-mission-playback-section');

  // 캐릭터 클래스는 화면 전환 시 잔상 방지를 위해 기본으로 정리
  if (missionMissionSection) {
    missionMissionSection.classList.remove('has-letter-avatar', 'has-letter-avatar-joy', 'has-letter-avatar-cami');
  }
  if (giftMissionSection) {
    giftMissionSection.classList.remove('has-letter-avatar', 'has-letter-avatar-joy', 'has-letter-avatar-cami');
  }

  // 돌아보기 모드: 음원 재생 칸을 looking-back-wrap 안으로 이동
  if (currentMissionViewMode === 'lookingback') {
    if (playbackSection && lookingBackWrap && lbCompleteBtn &&
        playbackSection.parentElement !== lookingBackWrap) {
      lookingBackWrap.insertBefore(playbackSection, lbCompleteBtn);
    }
  } else {
    // 다른 모드: 음원 재생 칸을 원래 앵커 위치로 복원
    if (playbackSection && playbackAnchor &&
        playbackSection.parentElement !== playbackAnchor.parentElement) {
      playbackAnchor.parentElement.insertBefore(playbackSection, playbackAnchor.nextSibling);
    }
  }

  // (ASK 편지 재생 박스 숨김 조건 제거 — WB130에 음원이 추가됨)

  // "편지 왔어요~" 재생 박스에 조이/까미 아이콘 표시 (라이팅/드로잉)
  if (playbackSection) {
    const isWritingMain =
      partActivityMode === 'writing' &&
      currentMissionViewMode === 'main';
    const isDrawingMain =
      partActivityMode === 'drawing' &&
      currentMissionViewMode === 'main';
    const isRecordingMain =
      partActivityMode === 'recording' &&
      currentMissionViewMode === 'main';

    // 조이는 사용자 지정 "본활동 목록"에서만 표시
    const JOY_LETTER_MISSIONS = [
      'ALONG',    // 1-1 (WB110)
      'NAME',     // 1-4 (WB140)
      'ABOUT',    // 1-6 (WB160)
      'DAY',      // 2-2 (WB220)
      'BRAIN',    // 2-4 (WB240)
      'DIARY_W',  // 2-6 (WB260)
      'FLEX',     // 2-7 (WB270)
      'GIFT',     // 3-1 (WB310C)
      'TRIP',     // 3-4 (WB340)
      'HOPE',     // 4-1 (WB410)
    ];
    // 레코딩(첨부 명단) — "편지 왔어요~" 박스에 캐릭터 1명만 표시
    // - 까미 목록(첫 번째 첨부): r130, r150, r230, r250, r310, r330, r410
    // - 쮸이 목록(두 번째 첨부): r110, r120, r140, r160, r210, r220, r240, r320, r340, r420
    const recordingShowCami = isRecordingMain && [
      'TODAY',    // RB130
      'POINT',    // RB150
      'DISLIKE',  // RB230
      'EMOTION',  // RB250
      'PARTNER',  // RB310
      'SUPPORT',  // RB330
      'MY SIDE',  // RB410
    ].includes(currentMissionId);

    const recordingShowJoy = isRecordingMain && [
      'VOICE',          // RB110
      'MYSELF',         // RB120
      'DIARY',          // RB140
      'LIST',           // RB160
      'TIME AND MONEY', // RB210
      'FOND',           // RB220
      'REMAIN',         // RB240
      'ONCE',           // RB320
      'LETTER',         // RB340
      "IT'S ME",        // RB420
    ].includes(currentMissionId);

    const shouldShowJoy =
      (isWritingMain && JOY_LETTER_MISSIONS.includes(currentMissionId)) ||
      (isDrawingMain && [
        // 사용자 첨부 목록: d110, d140, d220, d230, d250, d310, d330, d350, d410
        'MUSIC',    // DB110
        'ONE',      // DB140
        'JANUS',    // DB220
        'IF',       // DB230
        'FACE',     // DB250
        'SINKHOLE', // DB310
        'ANIMAL',   // DB330
        'THINK',    // DB350
        'RETOUCH',  // DB410
      ].includes(currentMissionId)) ||
      (isRecordingMain && recordingShowJoy && !recordingShowCami);

    // 까미는 특정 WB 코드(사용자 캡처 목록)에 해당하는 편지 음원에서만 표시
    const CAMI_LETTER_MISSIONS = [
      'STAR I',   // WB120
      'WORDS',    // WB210
      'LIST_W',   // WB230
      'HARD',     // WB250
      'GIFT',     // WB310C
      'RELATION', // WB320
      'FRIEND',   // WB330
      'SAY',      // WB350
      'NEWME',    // 라이팅 본활동 카드 라벨
      'NEWME_W',  // WB420
    ];
    const shouldShowCami =
      (isWritingMain && CAMI_LETTER_MISSIONS.includes(currentMissionId)) ||
      (isDrawingMain && [
        // 사용자 첨부 목록(까미): d120, d130, d210, d240(정정), d260, d320, d340, d360, d420
        'PAINT',   // DB120
        'COLOR',   // DB130
        'Favorite',// DB210
        'ROAD',    // DB240 (d230 → d240 정정)
        'TRIP_D',  // DB260
        'RAIN',    // DB320
        'NETWORK', // DB340
        'LOOK',    // DB360
        'NEWME',   // DB420
      ].includes(currentMissionId)) ||
      recordingShowCami;

    // 둘 중 하나라도 표시하면 카드에 포지셔닝 클래스 부여
    const shouldShowAny = shouldShowJoy || shouldShowCami;
    playbackSection.classList.toggle('has-letter-avatar', shouldShowAny);
    playbackSection.classList.toggle('has-letter-avatar-joy', shouldShowJoy);
    playbackSection.classList.toggle('has-letter-avatar-cami', shouldShowCami);
  }

  if (currentMissionViewMode === 'lookingback') {
    // 돌아보기 독립 모드: LB 즉시 표시, 마음톡 칸은 미리 보이되 내용은 활동완료 후 표시
    if (lookingBackWrap) lookingBackWrap.style.display = hasLookingBack ? 'block' : 'none';
    // 레코딩 모드: 돌아보기 활동완료 버튼 숨김 → 녹음 저장 후 녹음창의 활동완료만 사용
    const lbCompleteBtn = document.getElementById('looking-back-complete-btn');
    if (lbCompleteBtn) {
      lbCompleteBtn.style.display = (partActivityMode === 'recording') ? 'none' : '';
    }
    if (mindTalkWrap) {
      mindTalkWrap.style.display = hasMindTalk ? 'block' : 'none';
      const mindTalkEl = document.getElementById('mission-mind-talk');
      const placeholder = (partActivityMode === 'recording') ? '녹음 저장 후 활동완료를 누르면 마음톡을 확인할 수 있어요' : '활동 완료 후 마음톡을 확인할 수 있어요';
      if (mindTalkEl) {
        if (missionRevealPhase >= 2 && mission.mindTalk) {
          mindTalkEl.innerHTML = `${mission.mindTalk}${MIND_TALK_ATTRIBUTION}`;
        } else {
          mindTalkEl.textContent = placeholder;
        }
      }
    }
    if (relaxingWrap)   relaxingWrap.style.display   = 'none';
    // 레코딩 돌아보기: "편지 왔어요" 대신 "음악을 들으면서 녹음해 보세요" 표시
    // 기타 모드 돌아보기: 기본 문구를 "음악을 들으면서 편안한 마음으로 천천히 작성해 보세요"로 표시
    if (playLabelEl) {
      if (partActivityMode === 'recording') {
        playLabelEl.textContent = '음악을 들으면서 녹음해 보세요';
      } else {
        playLabelEl.textContent = getAdminText(0) || '음악을 들으면서 편안한 마음으로 천천히 작성해 보세요';
      }
    }
    // 돌아보기 모드에서는 상단 설명 칸을 보여주고,
    // renderMissionDetail()에서 설정한 공통 설명 문구를 그대로 노출한다.
    if (mainActivityTopEl) mainActivityTopEl.style.display = '';
  } else if (currentMissionViewMode === 'relaxing') {
    // 릴렉싱 독립 모드: 별도 섹션 숨기고, 음원재생 칸 텍스트에 "[ 미션 ] " 접두사 + 미션 내용
    if (lookingBackWrap) lookingBackWrap.style.display = 'none';
    if (mindTalkWrap)   mindTalkWrap.style.display   = 'none';
    if (relaxingWrap)   relaxingWrap.style.display   = 'none';
    // 릴렉싱 모드에서는 상단 설명(mainActivityTopEl)을 사용해 '활동 내용' 텍스트를 보여준다.
    if (mainActivityTopEl) mainActivityTopEl.style.display = '';
    if (playLabelEl) {
      const RELAX_PREFIX = '[ 미션 ] ';
      const adminText = getAdminText(currentRelaxingIdx);
      if (adminText) {
        playLabelEl.textContent = RELAX_PREFIX + adminText;
      } else {
        const parts = (mission.relaxingMission || '').split(/\n|;/).map(s => s.trim()).filter(Boolean);
        const relaxText = parts[currentRelaxingIdx] || parts[0] || '';
        const { desc: rDesc, title: rTitle } = splitRelaxingMissionLine(relaxText);
        const fallback = rDesc || rTitle || relaxText || '미션';
        playLabelEl.textContent = RELAX_PREFIX + fallback;
      }
    }
    if (playbackSection) {
      const relaxAltSection = document.getElementById('mission-relax-alt-playback-section');
      if (relaxAltSection) {
        const rk = `${currentMissionId}_${Number(currentRelaxingIdx) || 0}`;
        const showAlt =
          currentMissionViewMode === 'relaxing' &&
          isRelaxAltPlaybackVisible() &&
          !!getMissionRelaxAltUrl();
        if (showAlt) {
          if (lastMissionRelaxAltSlotKey !== rk) {
            lastMissionRelaxAltSlotKey = rk;
            missionRelaxAltAudioCompleted = false;
            stopMissionRelaxAltPlayback();
          }
          relaxAltSection.style.display = '';
          if (relaxAltSection.previousElementSibling !== playbackSection) {
            playbackSection.parentElement.insertBefore(relaxAltSection, playbackSection.nextSibling);
          }
        } else {
          lastMissionRelaxAltSlotKey = '';
          missionRelaxAltAudioCompleted = false;
          stopMissionRelaxAltPlayback();
          relaxAltSection.style.display = 'none';
        }
      }
    }
  } else {
    // 본활동 독립 모드: 돌아보기·마음톡·릴렉싱 숨김, [ 미션 ] 박스 표시
    if (lookingBackWrap) lookingBackWrap.style.display = 'none';
    if (mindTalkWrap)   mindTalkWrap.style.display   = 'none';
    if (relaxingWrap)   relaxingWrap.style.display   = 'none';
    // 레코딩 본활동의 **0 링크(편지) 제목: "편지 왔어요~" (큰따옴표 포함)
    // 라이팅 STAR II: 편지 왔어요가 아니라 시낭송 라벨을 사용
    if (playLabelEl) {
      if (partActivityMode === 'writing' && currentMissionId === 'STAR II') {
        playLabelEl.textContent = '(시낭송) 별 헤는 밤 - 윤동주';
      } else if (partActivityMode === 'writing' && currentMissionId === 'ASK') {
        playLabelEl.textContent = '25문 25답';
      } else {
        playLabelEl.textContent = (partActivityMode === 'recording') ? '"편지 왔어요~"' : (getAdminText(0) || '"편지 왔어요~"');
      }
    }
    if (mainActivityTopEl) mainActivityTopEl.style.display = '';
    const missionMissionLabel  = document.getElementById('mission-mission-play-label');
    // WB310(GIFT): 편지 2개 + 미션 1개(음원)
    const isGiftTwoLetters = partActivityMode === 'writing' && currentMissionId === 'GIFT';
    // ABOUT ME(6): 릴렉싱 구조 — 편지 박스 숨기고 미션 박스에 음원 연결
    const isAboutMeRelaxing = partActivityMode === 'recording' && currentMissionId === 'ABOUT ME';
    if (isAboutMeRelaxing) {
      if (playbackSection) playbackSection.style.display = 'none';
    } else {
      if (playbackSection) playbackSection.style.display = '';
    }
    if (missionMissionSection) missionMissionSection.style.display = 'block';
    if (isGiftTwoLetters) {
      // 두 번째 박스는 entries[1]을 재생하므로, 라벨도 "편지 왔어요~"로 맞춘다.
      if (missionMissionLabel) missionMissionLabel.textContent = getAdminText(1) || '"편지 왔어요~"';

      // 세 번째(미션) 음원 재생 박스 생성/업데이트: entries[2] = WB311
      let giftMissionSection = document.getElementById('gift-mission-playback-section');
      if (!giftMissionSection) {
        giftMissionSection = document.createElement('div');
        giftMissionSection.id = 'gift-mission-playback-section';
        giftMissionSection.className = 'mission-audio-card detail-block';
        giftMissionSection.innerHTML =
          '<div class="mission-audio-label" id="gift-mission-play-label">[ 미션 ]</div>' +
          '<p class="mission-playback-hint">음악을 들으면서 편안한 마음으로 천천히 작성해 보세요</p>' +
          '<div class="mission-audio-controls">' +
            '<button class="mission-audio-btn" id="gift-mission-play-btn" onclick="toggleGiftMissionPlayback()" title="재생">▶</button>' +
            '<button class="mission-audio-btn" id="gift-mission-play-pause-btn" onclick="pauseGiftMissionPlayback()" style="display:none" title="일시정지">⏸</button>' +
            '<button class="mission-audio-btn" id="gift-mission-play-stop-btn" onclick="stopGiftMissionPlayback()" style="display:none" title="정지">■</button>' +
            '<input type="range" class="mission-progress" id="gift-mission-play-progress" value="0" max="100" oninput="seekGiftMissionPlayback(this.value)">' +
            '<span class="mission-time" id="gift-mission-play-time">00:00 | 00:00</span>' +
          '</div>' +
          '<button type="button" class="activity-complete-btn" id="gift-mission-complete-btn" onclick="completeGiftMissionBox()">활동완료</button>';
        missionMissionSection.parentElement.insertBefore(giftMissionSection, missionMissionSection.nextSibling);
      } else {
        giftMissionSection.style.display = '';
      }
      const giftMissionLabel = document.getElementById('gift-mission-play-label');
      if (giftMissionLabel) {
        const missionLabelText = mission.mainActivity || mission.desc || '';
        giftMissionLabel.textContent = '[ 미션 ] ' + (missionLabelText || '');
      }

      // 캐릭터: 편지1은 조이, 편지2는 까미
      if (playbackSection) {
        playbackSection.classList.add('has-letter-avatar', 'has-letter-avatar-joy');
        playbackSection.classList.remove('has-letter-avatar-cami');
      }
      if (missionMissionSection) {
        missionMissionSection.classList.add('has-letter-avatar', 'has-letter-avatar-cami');
        missionMissionSection.classList.remove('has-letter-avatar-joy');
      }
    } else {
      // 기본: [ 미션 ] 박스는 본활동 설명을 보여준다.
      // 레코딩 본활동(**1): 콘텐츠 표(MISSION_DATA) mainActivity 또는 관리자 설정 텍스트
      if (missionMissionLabel) {
        let missionLabelText = getAdminText(1) || mission.mainActivity || mission.desc || '';
        // STAR I만: 첫 줄은 시낭송, 둘째 줄에 [ 미션 ] 본문
        if (!getAdminText(1) && currentMissionId === 'STAR I') {
          missionMissionLabel.innerText =
            '(시낭송) 별 헤는 밤 - 윤동주\n[ 미션 ] ' + (missionLabelText || '');
        } else {
          missionMissionLabel.textContent = '[ 미션 ] ' + missionLabelText;
        }
      }
      // GIFT가 아닐 때는 혹시 남아있을 수 있는 섹션 숨김/정리
      const giftMissionSection = document.getElementById('gift-mission-playback-section');
      if (giftMissionSection) giftMissionSection.style.display = 'none';
    }
  }
  // 돌아보기·릴렉싱 모드에서는 [ 미션 ] 박스 숨김
  if (currentMissionViewMode !== 'main') {
    const missionMissionSection = document.getElementById('mission-mission-playback-section');
    if (missionMissionSection) missionMissionSection.style.display = 'none';
    const giftMissionSection = document.getElementById('gift-mission-playback-section');
    if (giftMissionSection) giftMissionSection.style.display = 'none';
  }
  if (currentMissionViewMode !== 'relaxing') {
    const relaxAltSection = document.getElementById('mission-relax-alt-playback-section');
    if (relaxAltSection) {
      lastMissionRelaxAltSlotKey = '';
      missionRelaxAltAudioCompleted = false;
      stopMissionRelaxAltPlayback();
      relaxAltSection.style.display = 'none';
    }
  }
  updateMissionAudioBoxButtons();
  updateMissionPhotoButton();
}

function isAllMissionActivitiesCompleted() {
  const missionSection = document.getElementById('mission-mission-playback-section');
  const giftSection = document.getElementById('gift-mission-playback-section');
  const recSection = document.getElementById('mission-recording-section');
  const hasMissionBox = missionSection && missionSection.style.display !== 'none';
  const hasGiftBox = giftSection && giftSection.style.display !== 'none';
  const hasRecBox = recSection && recSection.style.display !== 'none';
  const recBtn = document.getElementById('mission-recording-complete-btn');
  if (hasRecBox) {
    if (partActivityMode === 'recording') {
      // 레코딩 본활동: **1 활동완료 없음 → 편지 완료 + 녹음 저장 후 활동완료만 확인
      return missionAudioBox1Completed && recBtn?.dataset.recCompleted === '1';
    }
    return missionAudioBox1Completed && missionAudioBox2Completed && recBtn?.dataset.recCompleted === '1';
  }
  if (hasMissionBox) {
    // GIFT는 편지2개 + 미션1개
    if (partActivityMode === 'writing' && currentMissionId === 'GIFT' && hasGiftBox) {
      return missionAudioBox1Completed && missionAudioBox2Completed && giftMissionAudioBoxCompleted;
    }
    return missionAudioBox1Completed && missionAudioBox2Completed;
  }
  const relaxAltSection = document.getElementById('mission-relax-alt-playback-section');
  if (relaxAltSection && relaxAltSection.style.display !== 'none') {
    return missionAudioBox1Completed && missionRelaxAltAudioCompleted;
  }
  return missionAudioBox1Completed;
}

function updateMissionPhotoButton() {
  const btn = document.getElementById('mission-photo-btn');
  if (!btn) return;
  const isWritingOrDrawing = partActivityMode === 'writing' || partActivityMode === 'drawing';
  // 레코딩 모드에서는 이 버튼을 숨긴다 (녹음 저장은 팝업에서 처리)
  if (!isWritingOrDrawing) {
    btn.style.display = 'none';
    return;
  }
  btn.style.display = 'block';
  const currentKey = `${partActivityMode}_${partActivityPart}_${currentMissionId}_${currentMissionViewMode}_${currentRelaxingIdx ?? 0}`;
  const hasPhotoForMission = getMissionPhotos().some(p => getPhotoActivityKey(p) === currentKey);
  btn.textContent = hasPhotoForMission ? '다시 촬영' : '사진촬영';
  const allDone = isAllMissionActivitiesCompleted();
  if (allDone) {
    btn.disabled = false;
    btn.style.opacity = '';
    btn.style.pointerEvents = '';
  } else {
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.style.pointerEvents = 'none';
  }
}

let missionCameraStream = null;

function openMissionCamera() {
  const isWritingOrDrawing = partActivityMode === 'writing' || partActivityMode === 'drawing';
  if (isWritingOrDrawing && !isAllMissionActivitiesCompleted()) {
    alert('모든 활동을 완료한 후 사진촬영을 누를 수 있습니다.');
    return;
  }
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(stream => {
        missionCameraStream = stream;
        const video = document.getElementById('camera-video');
        if (video) {
          video.srcObject = stream;
          video.play();
        }
        document.getElementById('camera-modal')?.classList.remove('hidden');
      })
      .catch(() => {
        navigator.mediaDevices.getUserMedia({ video: true })
          .then(stream => {
            missionCameraStream = stream;
            const video = document.getElementById('camera-video');
            if (video) {
              video.srcObject = stream;
              video.play();
            }
            document.getElementById('camera-modal')?.classList.remove('hidden');
          })
          .catch(() => fallbackToFileInput());
      });
  } else {
    fallbackToFileInput();
  }
}

function fallbackToFileInput() {
  const input = document.getElementById('mission-photo-input');
  if (input) {
    input.value = '';
    input.click();
  }
}

function closeCameraModal() {
  if (missionCameraStream) {
    missionCameraStream.getTracks().forEach(t => t.stop());
    missionCameraStream = null;
  }
  const video = document.getElementById('camera-video');
  if (video) video.srcObject = null;
  document.getElementById('camera-modal')?.classList.add('hidden');
}

function captureFromCamera() {
  const video = document.getElementById('camera-video');
  const canvas = document.getElementById('camera-canvas');
  if (!video || !canvas || !video.videoWidth) return;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  closeCameraModal();
  onMissionPhotoCaptured(dataUrl);
}

function updateMissionAudioBoxButtons() {
  const playBtn = document.getElementById('mission-play-complete-btn');
  const missionBtn = document.getElementById('mission-mission-complete-btn');
  const giftBtn = document.getElementById('gift-mission-complete-btn');
  const recBtn = document.getElementById('mission-recording-complete-btn');
  const missionSection = document.getElementById('mission-mission-playback-section');
  const giftSection = document.getElementById('gift-mission-playback-section');
  const recSection = document.getElementById('mission-recording-section');
  const isMain = currentMissionViewMode === 'main';
  const hasMissionBox = isMain && missionSection && missionSection.style.display !== 'none';
  const hasGiftBox = isMain && giftSection && giftSection.style.display !== 'none';
  const hasRecBox = recSection && recSection.style.display !== 'none';

  const setComplete = (btn, completed) => {
    if (!btn) return;
    btn.disabled = completed;
    btn.textContent = completed ? '완료 ✓' : '활동완료';
    btn.style.opacity = completed ? '0.5' : '';
    btn.style.pointerEvents = completed ? 'none' : '';
  };
  const setEnabled = (btn, enabled) => {
    if (!btn) return;
    btn.disabled = !enabled;
    btn.style.opacity = enabled ? '' : '0.5';
    btn.style.pointerEvents = enabled ? '' : 'none';
  };

  if (playBtn) {
    setComplete(playBtn, missionAudioBox1Completed);
    if (!missionAudioBox1Completed) setEnabled(playBtn, true);
  }
  if (missionBtn) {
    if (!hasMissionBox) {
      setEnabled(missionBtn, true);
      missionBtn.textContent = '활동완료';
    } else if (missionAudioBox1Completed) {
      setComplete(missionBtn, missionAudioBox2Completed);
      if (!missionAudioBox2Completed) setEnabled(missionBtn, true);
    } else {
      setEnabled(missionBtn, false);
      missionBtn.textContent = '활동완료';
    }
  }
  if (giftBtn) {
    // GIFT 전용: 편지1/편지2 완료 후에만 미션 박스 완료 가능
    const canUseGift = hasGiftBox && missionAudioBox1Completed && missionAudioBox2Completed;
    setComplete(giftBtn, giftMissionAudioBoxCompleted);
    if (!giftMissionAudioBoxCompleted) setEnabled(giftBtn, canUseGift);
  }
  const relaxAltSection = document.getElementById('mission-relax-alt-playback-section');
  const relaxAltCompleteBtn = document.getElementById('mission-relax-alt-play-complete-btn');
  const hasRelaxAlt = relaxAltSection && relaxAltSection.style.display !== 'none';
  if (relaxAltCompleteBtn && hasRelaxAlt) {
    setComplete(relaxAltCompleteBtn, missionRelaxAltAudioCompleted);
    if (!missionRelaxAltAudioCompleted && missionAudioBox1Completed) setEnabled(relaxAltCompleteBtn, true);
    else if (!missionRelaxAltAudioCompleted && !missionAudioBox1Completed) setEnabled(relaxAltCompleteBtn, false);
  }
  if (recBtn) {
    if (!hasRecBox) {
      // 녹음 박스가 아예 없으면 버튼도 사용할 수 없음
      setEnabled(recBtn, false);
      recBtn.textContent = '활동완료';
    } else if (!hasMissionBox) {
      // 본활동 박스가 없는 미션(돌아보기): 녹음 저장 후에만 활동완료 가능 (레코딩 모드)
      if (recBtn.dataset.recCompleted === '1') {
        setComplete(recBtn, true);
      } else if (partActivityMode === 'recording') {
        const canComplete = missionRecordingSavedThisSession;
        setEnabled(recBtn, canComplete);
        recBtn.textContent = '활동완료';
      } else {
        const canComplete = missionAudioBox1Completed;
        setEnabled(recBtn, canComplete);
        recBtn.textContent = '활동완료';
      }
    } else if (hasMissionBox && partActivityMode === 'recording') {
      // 레코딩 본활동: **1 칸 활동완료 버튼 없음 → 녹음 저장 후에만 활동완료 가능
      if (recBtn.dataset.recCompleted === '1') {
        setComplete(recBtn, true);
      } else {
        const canComplete = missionRecordingSavedThisSession;
        setEnabled(recBtn, canComplete);
        recBtn.textContent = '활동완료';
      }
    } else if (missionAudioBox2Completed) {
      // 본활동 박스까지 끝낸 뒤에만 레코딩 활동완료 허용
      if (recBtn.dataset.recCompleted === '1') {
        setComplete(recBtn, true);
      } else {
        setEnabled(recBtn, true);
        recBtn.textContent = '활동완료';
      }
    } else {
      setEnabled(recBtn, false);
      recBtn.textContent = '활동완료';
    }
  }
}

function completeMissionPlayBox() {
  if (missionAudioBox1Completed) return;
  missionAudioBox1Completed = true;
  updateMissionAudioBoxButtons();
  updateMissionPhotoButton();
}

function completeMissionRelaxAltPlayBox() {
  if (!missionAudioBox1Completed || missionRelaxAltAudioCompleted) return;
  missionRelaxAltAudioCompleted = true;
  updateMissionAudioBoxButtons();
  updateMissionPhotoButton();
}

function completeMissionMissionBox() {
  if (!missionAudioBox1Completed || missionAudioBox2Completed) return;
  missionAudioBox2Completed = true;
  updateMissionAudioBoxButtons();
  updateMissionPhotoButton();
}

function completeGiftMissionBox() {
  // GIFT 전용: 편지1/편지2 완료 후, 미션 박스 완료 가능
  if (!missionAudioBox1Completed || !missionAudioBox2Completed || giftMissionAudioBoxCompleted) return;
  giftMissionAudioBoxCompleted = true;
  updateMissionAudioBoxButtons();
  updateMissionPhotoButton();
}

function completeMissionRecordingBox() {
  const missionSection = document.getElementById('mission-mission-playback-section');
  const hasMissionBox = currentMissionViewMode === 'main' && missionSection && missionSection.style.display !== 'none';
  let canComplete;
  if (hasMissionBox && partActivityMode === 'recording') {
    // 레코딩 본활동: **1 칸 활동완료 없음 → 녹음 저장 후에만 완료 가능
    canComplete = missionRecordingSavedThisSession;
  } else if (hasMissionBox) {
    canComplete = missionAudioBox2Completed;
  } else if (partActivityMode === 'recording') {
    canComplete = missionRecordingSavedThisSession;
  } else {
    canComplete = missionAudioBox1Completed;
  }
  if (!canComplete) return;
  const recBtn = document.getElementById('mission-recording-complete-btn');
  if (recBtn) {
    recBtn.dataset.recCompleted = '1';
    recBtn.textContent = '완료 ✓';
    recBtn.disabled = true;
    recBtn.style.opacity = '0.5';
    recBtn.style.pointerEvents = 'none';
  }
  // 레코딩 돌아보기: 녹음 완료 후 마음톡 표시
  if (partActivityMode === 'recording' && currentMissionViewMode === 'lookingback') {
    missionRevealPhase = 2;
    applyMissionRevealPhase();
  }
  updateMissionPhotoButton();
}

let pendingPhotoDataUrl = null;

function closePhotoSaveConfirmModal() {
  pendingPhotoDataUrl = null;
  const modal = document.getElementById('photo-save-confirm-modal');
  const img = document.getElementById('photo-save-confirm-img');
  if (modal) modal.classList.add('hidden');
  if (img) img.src = '';
}

function confirmSavePhoto() {
  if (pendingPhotoDataUrl) {
    saveMissionPhotoDataUrl(pendingPhotoDataUrl);
    closePhotoSaveConfirmModal();
  }
}

function onMissionPhotoCaptured(fileOrDataUrl) {
  const showConfirm = (dataUrl) => {
    pendingPhotoDataUrl = dataUrl;
    const modal = document.getElementById('photo-save-confirm-modal');
    const img = document.getElementById('photo-save-confirm-img');
    if (img) img.src = dataUrl;
    if (modal) modal.classList.remove('hidden');
  };
  if (typeof fileOrDataUrl === 'string') {
    showConfirm(fileOrDataUrl);
    return;
  }
  if (fileOrDataUrl && fileOrDataUrl.type?.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = () => showConfirm(reader.result);
    reader.readAsDataURL(fileOrDataUrl);
  }
}

function saveMissionPhotoDataUrl(dataUrl) {
    const mission = MISSION_DATA[currentMissionId] || MISSION_DATA.LETTER;
    const photo = {
      id: 'mp_' + Date.now(),
      missionId: currentMissionId,
      missionTitle: mission.title || currentMissionId,
      photoDataUrl: dataUrl,
      date: new Date().toISOString().slice(0, 10).replace(/-/g, '/'),
      mode: partActivityMode || 'writing',
      part: partActivityPart,
      viewMode: currentMissionViewMode,
      relaxingIdx: currentRelaxingIdx,
      impression: '',
      thumb: currentMissionThumb || '',
    };
    saveMissionPhoto(photo);
    if (currentScreen === 'my-contents') renderMyContents();
    showMissionPhotoPreview(dataUrl);
    updateMissionPhotoButton();
}

function deleteRecordingItem(recId) {
  if (!confirm('이 녹음을 삭제하시겠습니까?')) return;
  const idStr = String(recId);

  // 1) 별도 recordings 스토어에서 삭제
  let recordings = getRecordings();
  const beforeLen = recordings.length;
  recordings = recordings.filter(r => String(r.id) !== idStr);
  if (recordings.length !== beforeLen) {
    setData(STORAGE_KEYS.recordings, recordings);
  } else {
    // 2) 레거시: contents 배열 안에 있는 recordings 필드에서 삭제
    const contents = getContents();
    let changed = false;
    contents.forEach(c => {
      if (String(c.id) === idStr && Array.isArray(c.recordings) && c.recordings.length) {
        c.recordings = [];
        changed = true;
      }
    });
    if (changed) {
      setData(STORAGE_KEYS.contents, contents);
    }
  }

  if (currentScreen === 'my-contents') {
    renderMyContents();
  }
}

let lastMissionPhotoPreviewDataUrl = '';

function showMissionPhotoPreview(dataUrl) {
  const wrap = document.getElementById('mission-photo-preview-wrap');
  const img = document.getElementById('mission-photo-preview-img');
  if (!wrap || !img) return;
  if (dataUrl) {
    img.src = dataUrl;
    lastMissionPhotoPreviewDataUrl = dataUrl;
    wrap.style.display = 'block';
    wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else {
    wrap.style.display = 'none';
    img.src = '';
    lastMissionPhotoPreviewDataUrl = '';
  }
}

function openMissionPhotoPreviewFullscreen() {
  if (lastMissionPhotoPreviewDataUrl) openPhotoFullscreen(lastMissionPhotoPreviewDataUrl);
}

/** 추가 미션(relaxing) 한 줄에서 제목(라벨)과 본문을 분리. ' — '(em dash) 우선, 없으면 ' - '. */
function splitRelaxingMissionLine(line) {
  if (line == null || line === '') return { title: '', desc: '' };
  const em = ' — ';
  let idx = line.indexOf(em);
  let sepLen = em.length;
  if (idx === -1) {
    const hy = ' - ';
    idx = line.indexOf(hy);
    sepLen = hy.length;
  }
  if (idx === -1) return { title: line.trim(), desc: '' };
  return {
    title: line.substring(0, idx).trim(),
    desc: line.substring(idx + sepLen).trim(),
  };
}

function renderMissionDetail() {
  stopMissionPlayback();
  resetMissionMissionPlaybackUI();
  stopGiftMissionPlayback();
  stopMissionRelaxAltPlayback();
  missionAudioBox1Completed = false;
  missionAudioBox2Completed = false;
  missionRelaxAltAudioCompleted = false;
  lastMissionRelaxAltSlotKey = '';
  missionRecordingSavedThisSession = false;
  const recBtn = document.getElementById('mission-recording-complete-btn');
  if (recBtn) recBtn.dataset.recCompleted = '';
  const mission = MISSION_DATA[currentMissionId] || MISSION_DATA.LETTER;
  const titleEl = document.getElementById('mission-title');
  const themeEl = document.getElementById('mission-theme-badge');
  const mainActivityEl = document.getElementById('mission-main-activity');
  const lookingBackEl = document.getElementById('mission-looking-back');
  const lookingBackWrap = document.getElementById('mission-looking-back-wrap');
  const mindTalkEl = document.getElementById('mission-mind-talk');
  const mindTalkWrap = document.getElementById('mission-mind-talk-wrap');
  const relaxingEl = document.getElementById('mission-relaxing');
  const relaxingWrap = document.getElementById('mission-relaxing-wrap');
  const playLabelEl = document.getElementById('mission-play-label');

  if (titleEl) {
    const engPart = (mission.title || '').indexOf(' - ') !== -1
      ? mission.title.split(' - ')[0]
      : (mission.title || '');
    if (currentMissionViewMode === 'relaxing') {
      titleEl.textContent = engPart + ' - 미션';
    } else if (currentMissionViewMode === 'lookingback') {
      titleEl.textContent = engPart + ' - LOOKING BACK';
    } else {
      titleEl.textContent = mission.title;
    }
  }
  // 기본 설명 텍스트
  var defaultMainActivityText = mission.mainActivity || mission.desc || '';
  // 돌아보기 공통 설명 텍스트
  var lookingBackTitleText = '돌아보기';
  var lookingBackDescText = '활동한 내용을 찬찬히 돌아보며 \n몰랐던 나를 조금씩 알아가는 시간';
  if (mainActivityEl) {
    if (currentMissionViewMode === 'lookingback') {
      mainActivityEl.textContent = lookingBackDescText;
      mainActivityEl.classList.add('looking-back-desc');
    } else {
      mainActivityEl.textContent = defaultMainActivityText;
      mainActivityEl.classList.remove('looking-back-desc');
    }
  }

  // 상세 썸네일: 이미지 + 한글타이틀 + 미션 설명
  const thumbEl = document.getElementById('mission-detail-thumb');
  const thumbRow = document.getElementById('mission-detail-thumb-row');
  const koreanTitleEl = document.getElementById('mission-detail-korean-title');
  const mainActivityTopEl = document.getElementById('mission-detail-main-activity-top');
  const basePath = ASSET_PATHS[partActivityMode] || 'assets/';
  const koreanTitle = mission.koreanTitle || (mission.title && mission.title.indexOf(' - ') !== -1 ? mission.title.split(' - ')[1] : null) || mission.theme;
  if (thumbEl && thumbRow) {
    if (currentMissionThumb) {
      thumbEl.src = encodeURI(basePath + currentMissionThumb);
      thumbEl.alt = koreanTitle;
      thumbRow.style.display = 'flex';
    } else {
      thumbRow.style.display = 'none';
    }
  }
  if (koreanTitleEl) {
    if (currentMissionViewMode === 'relaxing') {
      const rParts = (mission.relaxingMission || '').split(/\n|;/).map(s => s.trim()).filter(Boolean);
      const rText = rParts[currentRelaxingIdx] || rParts[0] || '';
      const { title: titlePart, desc: descPart } = splitRelaxingMissionLine(rText);
      const tokens = titlePart.split(' ');
      const firstKorIdx = tokens.findIndex(w => /[가-힣]/.test(w));
      const engPart = firstKorIdx > 0 ? tokens.slice(0, firstKorIdx).join(' ') : '';
      const korPart = firstKorIdx !== -1 ? tokens.slice(firstKorIdx).join(' ') : titlePart;
      const combinedTitle = engPart ? engPart + ' / ' + korPart : korPart;
      koreanTitleEl.textContent = combinedTitle;
      // 릴렉싱(추가) 활동: '활동 내용' 텍스트를 상단/본문 설명으로 노출
      const relaxingBodyText = descPart || titlePart || defaultMainActivityText;
      if (mainActivityTopEl) mainActivityTopEl.textContent = relaxingBodyText;
      if (mainActivityEl) mainActivityEl.textContent = relaxingBodyText;
    } else if (currentMissionViewMode === 'lookingback') {
      // 돌아보기: 윗줄은 작은 뱃지, 그 옆/아래에 개별 타이틀
      // (위와 동일한 뱃지 스타일 재사용)
      const baseTitle = koreanTitle || lookingBackTitleText;
      koreanTitleEl.innerHTML = '<span class="relaxing-mission-badge">돌아보기</span>' + baseTitle;
    } else {
      koreanTitleEl.textContent = koreanTitle;
    }
  }
  if (mainActivityTopEl) {
    if (currentMissionViewMode === 'lookingback') {
      mainActivityTopEl.textContent = lookingBackDescText;
    } else if (currentMissionViewMode !== 'relaxing') {
      // 릴렉싱 모드는 위에서 별도로 descPart로 설정함
      mainActivityTopEl.textContent = defaultMainActivityText;
    }
  }

  // 1. 본활동 (intro card에 이미 표시됨)
  // 2. 돌아보기 (Looking Back) — 표시 여부는 applyMissionRevealPhase()에서 phase로 제어
  const lookingBack = mission.lookingBack || (mission.question ? [mission.question] : null);
  let lookingBackIntro = mission.lookingBackIntro || '';
  // 드로잉/레코딩 돌아보기에도 라이팅과 동일한 구성(인사말 + 초초 이미지)을 사용
  if (!lookingBackIntro && currentMissionViewMode === 'lookingback' && (partActivityMode === 'drawing' || partActivityMode === 'recording')) {
    lookingBackIntro = '안녕? 나야 초초! 헤헤';
  }
  if (lookingBackEl && lookingBackWrap) {
    const blocks = [];
    // STAR I 등에서 사용하는 인사말(번호 없는 도입부)
    if (lookingBackIntro) {
      blocks.push(
        `<div class="lb-item lb-intro"><p class="lb-text">${lookingBackIntro}</p></div>`
      );
    }
    if (Array.isArray(lookingBack) && lookingBack.length) {
      const multi = lookingBack.length > 1;
      blocks.push(
        lookingBack.map((q, i) =>
          `<div class="lb-item">${multi ? `<span class="lb-num">${i + 1}</span>` : ''}<p class="lb-text">${q}</p></div>`
        ).join('')
      );
    } else if (typeof lookingBack === 'string') {
      blocks.push(`<div class="lb-item"><p class="lb-text">${lookingBack}</p></div>`);
    }
    lookingBackEl.innerHTML = blocks.join('');
    // visibility는 applyMissionRevealPhase()에서 처리
  }

  // 3. 마음 톡! — 표시 여부는 applyMissionRevealPhase()에서 phase로 제어
  if (mindTalkEl && mindTalkWrap) {
    if (mission.mindTalk) {
      mindTalkEl.innerHTML = `${mission.mindTalk}${MIND_TALK_ATTRIBUTION}`;
    }
    // visibility는 applyMissionRevealPhase()에서 처리
  }

  // 4. 추가 미션 목록(relaxingMission 원문) — relaxing 모드에서만 표시 (visibility는 applyMissionRevealPhase에서 처리)
  if (relaxingEl && mission.relaxingMission) {
    // relaxingMission 텍스트를 인덱스별로 분리 (세미콜론 또는 줄바꿈으로 구분 시도)
    const parts = mission.relaxingMission.split(/\n|;/).map(s => s.trim()).filter(Boolean);
    const text = parts[currentRelaxingIdx] || parts[0] || mission.relaxingMission;
    relaxingEl.textContent = text;
  }

  if (playLabelEl) playLabelEl.textContent = mission.playLabel || '질문';

  // 라이팅·드로잉 모드에서는 녹음 영역만 숨김 (재생은 표시)
  const recordingSection = document.getElementById('mission-recording-section');
  if (recordingSection) {
    recordingSection.style.display = (partActivityMode === 'writing' || partActivityMode === 'drawing') ? 'none' : 'block';
  }
  const missionBody = document.querySelector('#mission-detail .mission-body');
  if (missionBody) {
    missionBody.classList.toggle('recording-mode', partActivityMode === 'recording');
  }
  // 레코딩 모드에서는 하단 '사진촬영/녹음저장' 버튼 숨기기
  const missionPhotoBtn = document.getElementById('mission-photo-btn');
  if (missionPhotoBtn) {
    missionPhotoBtn.style.display = (partActivityMode === 'recording') ? 'none' : 'block';
  }
  // 재생 UI 초기화
  resetMissionPlaybackUI();

  // 돌아보기 완료 버튼 상태 초기화
  const lbBtn = document.getElementById('looking-back-complete-btn');
  if (lbBtn) {
    lbBtn.textContent = '활동완료';
    lbBtn.disabled = false;
    lbBtn.style.opacity = '';
    lbBtn.style.pointerEvents = '';
  }

  // 테마별 상단 박스 배경색
  const themeColors = { LETTER: '#FCE4EC', 'LOOKING BACK': '#E8E8F5', FOND: '#FCE4EC', DISLIKE: '#FFF8E1', 'ABOUT ME': '#E8F5E9', 'ABOUT ME (6)': '#E8F5E9', 'TIME AND MONEY': '#F5F0E8', PARTNER: '#E3F2FD', 'MY SIDE': '#EFEBE9', VOICE: '#E8F5E9', MUSIC: '#E3F2FD', Favorite: '#E8F5E9', SINKHOLE: '#E8E8E8', RETOUCH: '#F5F5F5', ALONG: '#E8F5E9', WORDS: '#E8F5E9', GIFT: '#E8F5E9', HOPE: '#FFF3E0', TRIP: '#E8F5E9', TRIP_D: '#E8F5E9', FLEX: '#FFF9C4', PAINT: '#FCE4EC', COLOR: '#E3F2FD', ONE: '#FFF8E1', JANUS: '#E8E8F5', IF: '#E0F2F1', ROAD: '#FFE0B2', FACE: '#F5F0E8', RAIN: '#B3E5FC', ANIMAL: '#C8E6C9', NETWORK: '#E1BEE7', THINK: '#F5F5F5', LOOK: '#E8E8E8', NEWME: '#FFF3E0' };
  if (thumbRow) thumbRow.style.background = themeColors[mission.theme] || '#F5F5F5';

  applyMissionRevealPhase();
  if (isCurrentMissionCompleted()) {
    setMissionDetailCompletedState(true);
  } else {
    setMissionDetailCompletedState(false);
  }

  // 해당 콘텐츠(활동)에 촬영한 사진이 있으면 미리보기 표시
  const currentKey = `${partActivityMode}_${partActivityPart}_${currentMissionId}_${currentMissionViewMode}_${currentRelaxingIdx ?? 0}`;
  const photos = getMissionPhotos().filter(p => getPhotoActivityKey(p) === currentKey);
  showMissionPhotoPreview(photos.length > 0 ? photos[0].photoDataUrl : null);

  // 레코딩 모드: 해당 콘텐츠(활동)에 저장된 녹음이 있으면 미리보기 표시
  updateMissionRecordingPreview();
}

function getSharedChecks() {
  const raw = getData(STORAGE_KEYS.sharedChecks);
  return (raw && typeof raw === 'object') ? raw : {};
}

function setSharedCheck(activityKey, checked) {
  const checks = getSharedChecks();
  if (checked) {
    checks[activityKey] = true;
  } else {
    delete checks[activityKey];
  }
  setData(STORAGE_KEYS.sharedChecks, checks);
}

function toggleSharedCheck(key, checked) {
  setSharedCheck(key, checked);
  if (currentScreen === 'my-contents') renderMyContents();
}

function getMissionMemoKey() {
  return `${partActivityMode}_${partActivityPart}_${currentMissionId}_${currentMissionViewMode}_${currentRelaxingIdx ?? 0}`;
}

function getMissionMemos() {
  const raw = getData(STORAGE_KEYS.missionMemos);
  return (raw && typeof raw === 'object') ? raw : {};
}

function getMissionMemoEntry(key) {
  const memos = getMissionMemos();
  const v = memos[key];
  if (v == null) return { text: '', drawing: '' };
  if (typeof v === 'string') return { text: v, drawing: '' };
  return { text: v.text || '', drawing: v.drawing || '' };
}

function setMissionMemoEntry(key, text, drawing) {
  const memos = getMissionMemos();
  memos[key] = { text: text || '', drawing: drawing || '' };
  setData(STORAGE_KEYS.missionMemos, memos);
}

let missionMemoDrawColor = '#000000';
let missionMemoDrawing = false;
let missionMemoEraserMode = false;
let missionMemoDrawHistory = [];
const MISSION_MEMO_DRAW_HISTORY_MAX = 30;

function setMissionMemoTab(tab) {
  const textWrap = document.getElementById('mission-memo-text-wrap');
  const drawWrap = document.getElementById('mission-memo-draw-wrap');
  const tabs = document.querySelectorAll('.mission-memo-tab');
  if (!textWrap || !drawWrap) return;
  textWrap.classList.toggle('hidden', tab !== 'text');
  drawWrap.classList.toggle('hidden', tab !== 'draw');
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  if (tab === 'draw') {
    requestAnimationFrame(() => {
      resizeMissionMemoCanvas();
      initMissionMemoCanvasImage();
    });
  }
}

function resizeMissionMemoCanvas() {
  const wrap = document.getElementById('mission-memo-draw-wrap');
  const canvas = document.getElementById('mission-memo-canvas');
  if (!wrap || !canvas) return;
  const w = wrap.clientWidth;
  const h = wrap.clientHeight;
  if (w <= 0 || h <= 0) return;
  canvas.width = w;
  canvas.height = h;
}

function setMissionMemoDrawColor(color) {
  missionMemoEraserMode = false;
  missionMemoDrawColor = color;
  document.getElementById('mission-memo-eraser-btn')?.classList.remove('active');
  document.querySelectorAll('.mission-memo-draw-btn[data-color]').forEach(btn => {
    btn.style.borderColor = btn.dataset.color === color ? color : 'rgba(0,0,0,0.2)';
    btn.style.borderWidth = btn.dataset.color === color ? '3px' : '2px';
  });
}

function setMissionMemoEraser(on) {
  missionMemoEraserMode = !!on;
  const btn = document.getElementById('mission-memo-eraser-btn');
  if (btn) btn.classList.toggle('active', missionMemoEraserMode);
  if (!on) {
    document.querySelectorAll('.mission-memo-draw-btn[data-color]').forEach(b => {
      b.style.borderColor = b.dataset.color === missionMemoDrawColor ? missionMemoDrawColor : 'rgba(0,0,0,0.2)';
      b.style.borderWidth = b.dataset.color === missionMemoDrawColor ? '3px' : '2px';
    });
  }
}

function setMissionMemoEraserToggle() {
  setMissionMemoEraser(!missionMemoEraserMode);
}

function pushMissionMemoDrawState() {
  const canvas = document.getElementById('mission-memo-canvas');
  if (!canvas) return;
  try {
    const data = canvas.toDataURL('image/png');
    missionMemoDrawHistory.push(data);
    if (missionMemoDrawHistory.length > MISSION_MEMO_DRAW_HISTORY_MAX) missionMemoDrawHistory.shift();
  } catch (_) {}
  document.querySelector('.mission-memo-draw-undo')?.toggleAttribute('disabled', missionMemoDrawHistory.length <= 1);
}

function undoMissionMemoCanvas() {
  if (missionMemoDrawHistory.length <= 1) return;
  const canvas = document.getElementById('mission-memo-canvas');
  if (!canvas) return;
  missionMemoDrawHistory.pop();
  const prev = missionMemoDrawHistory[missionMemoDrawHistory.length - 1];
  if (!prev) return;
  const img = new Image();
  img.onload = () => {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, canvas.width, canvas.height);
    }
  };
  img.src = prev;
  document.querySelector('.mission-memo-draw-undo')?.toggleAttribute('disabled', missionMemoDrawHistory.length <= 1);
}

function clearMissionMemoCanvas() {
  const canvas = document.getElementById('mission-memo-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  missionMemoDrawHistory = [];
  pushMissionMemoDrawState();
  document.querySelector('.mission-memo-draw-undo')?.setAttribute('disabled', '');
}

function initMissionMemoCanvasDraw() {
  const canvas = document.getElementById('mission-memo-canvas');
  if (!canvas || !canvas.getContext) return;
  if (canvas.__memoDrawInited) return;
  canvas.__memoDrawInited = true;
  const ctx = canvas.getContext('2d');
  const getCoords = (e) => {
    if (e.touches && e.touches[0]) {
      const r = canvas.getBoundingClientRect();
      const s = canvas.width / r.width;
      return { x: (e.touches[0].clientX - r.left) * s, y: (e.touches[0].clientY - r.top) * s };
    }
    const r = canvas.getBoundingClientRect();
    const s = canvas.width / r.width;
    return { x: (e.clientX - r.left) * s, y: (e.clientY - r.top) * s };
  };
  const start = (e) => {
    e.preventDefault();
    missionMemoDrawing = true;
    const c = getCoords(e);
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    if (missionMemoEraserMode) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth = 14;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = missionMemoDrawColor;
      ctx.lineWidth = 2;
    }
    ctx.lineCap = 'round';
  };
  const move = (e) => {
    if (!missionMemoDrawing) return;
    e.preventDefault();
    const c = getCoords(e);
    ctx.lineTo(c.x, c.y);
    ctx.stroke();
  };
  const end = () => {
    if (missionMemoDrawing) pushMissionMemoDrawState();
    missionMemoDrawing = false;
  };
  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  canvas.addEventListener('mouseup', end);
  canvas.addEventListener('mouseleave', end);
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end);
}

function initMissionMemoCanvasImage() {
  const canvas = document.getElementById('mission-memo-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const key = getMissionMemoKey();
  const entry = getMissionMemoEntry(key);
  if (entry.drawing) {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, canvas.width, canvas.height);
      missionMemoDrawHistory = [];
      pushMissionMemoDrawState();
      document.querySelector('.mission-memo-draw-undo')?.toggleAttribute('disabled', true);
    };
    img.src = entry.drawing;
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    missionMemoDrawHistory = [];
    pushMissionMemoDrawState();
    document.querySelector('.mission-memo-draw-undo')?.setAttribute('disabled', '');
  }
}

function initMissionMemoSheetResize() {
  const handle = document.getElementById('mission-memo-sheet-resize');
  const sheet = document.getElementById('mission-memo-sheet');
  if (!handle || !sheet) return;
  if (handle.__resizeInited) return;
  handle.__resizeInited = true;
  let startY = 0;
  let startHeight = 0;
  const minH = 200;
  const maxH = Math.round(window.innerHeight * 0.9);

  const onMove = (e) => {
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    let h = startHeight + (startY - y);
    if (h < minH) h = minH;
    if (h > maxH) h = maxH;
    sheet.style.setProperty('--mission-memo-sheet-height', h + 'px');
    updateMissionMemoAppPadding();
    requestAnimationFrame(() => {
      const drawWrap = document.getElementById('mission-memo-draw-wrap');
      if (drawWrap && !drawWrap.classList.contains('hidden')) resizeMissionMemoCanvas();
    });
  };
  const onEnd = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onEnd);
    document.removeEventListener('touchmove', onMove, { passive: true });
    document.removeEventListener('touchend', onEnd);
  };
  const onStart = (e) => {
    e.preventDefault();
    startY = e.touches ? e.touches[0].clientY : e.clientY;
    const h = sheet.getBoundingClientRect().height;
    startHeight = Math.round(h);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd);
  };
  handle.addEventListener('mousedown', onStart);
  handle.addEventListener('touchstart', onStart, { passive: false });
}

function openMissionMemo() {
  const overlay = document.getElementById('mission-memo-overlay');
  const sheet = document.getElementById('mission-memo-sheet');
  const textEl = document.getElementById('mission-memo-text');
  if (!overlay || !sheet || !textEl) return;
  const key = getMissionMemoKey();
  const entry = getMissionMemoEntry(key);
  textEl.value = entry.text;
  sheet.style.setProperty('--mission-memo-sheet-height', '50vh');
  overlay.classList.remove('hidden');
  sheet.classList.remove('hidden');
  document.querySelectorAll('.mission-memo-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'text'));
  document.getElementById('mission-memo-text-wrap')?.classList.remove('hidden');
  document.getElementById('mission-memo-draw-wrap')?.classList.add('hidden');
  requestAnimationFrame(() => {
    overlay.classList.add('open');
    sheet.classList.add('open');
    updateMissionMemoAppPadding();
  });
  initMissionMemoCanvasDraw();
  initMissionMemoSheetResize();
  setMissionMemoDrawColor(missionMemoDrawColor);
  setMissionMemoEraser(false);
  setTimeout(() => {
    textEl.focus();
    updateMissionMemoAppPadding();
  }, 350);
}

function updateMissionMemoAppPadding() {
  const app = document.getElementById('app');
  const sheet = document.getElementById('mission-memo-sheet');
  if (!app || !sheet) return;
  if (sheet.classList.contains('hidden') || !sheet.classList.contains('open')) {
    app.style.paddingBottom = '';
    return;
  }
  const h = sheet.getBoundingClientRect().height;
  app.style.paddingBottom = (Math.round(h) || 0) + 'px';
}

function closeMissionMemo() {
  saveMissionMemoContent();
  const overlay = document.getElementById('mission-memo-overlay');
  const sheet = document.getElementById('mission-memo-sheet');
  const app = document.getElementById('app');
  if (app) app.style.paddingBottom = '';
  if (!overlay || !sheet) return;
  overlay.classList.remove('open');
  sheet.classList.remove('open');
  setTimeout(() => {
    overlay.classList.add('hidden');
    sheet.classList.add('hidden');
  }, 300);
}

function saveMissionMemoContent() {
  const textEl = document.getElementById('mission-memo-text');
  const canvas = document.getElementById('mission-memo-canvas');
  if (!textEl) return;
  const key = getMissionMemoKey();
  const text = (textEl.value || '').trim();
  let drawing = '';
  if (canvas) {
    try {
      drawing = canvas.toDataURL('image/png') || '';
    } catch (_) {}
  }
  setMissionMemoEntry(key, text, drawing);
}

function saveMissionMemo() {
  saveMissionMemoContent();
  const toast = document.createElement('div');
  toast.className = 'mission-memo-toast';
  toast.textContent = '저장되었습니다';
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

function updateMissionRecordingPreview() {
  const recordingPreviewWrap = document.getElementById('mission-recording-preview-wrap');
  const recordingPreviewAudio = document.getElementById('mission-recording-preview-audio');
  if (!recordingPreviewWrap || !recordingPreviewAudio) return;
  if (partActivityMode === 'recording' && currentScreen === 'mission-detail') {
    const recordings = getRecordings().filter(r =>
      (r.mode || 'recording') === partActivityMode &&
      (r.part ?? 1) === partActivityPart &&
      (r.missionId || '') === currentMissionId &&
      (r.viewMode || 'main') === currentMissionViewMode
    );
    const rec = recordings[0] || null;
    if (rec && rec.audioUrl) {
      recordingPreviewAudio.src = rec.audioUrl;
      recordingPreviewWrap.style.display = 'block';
    } else {
      recordingPreviewAudio.removeAttribute('src');
      recordingPreviewWrap.style.display = 'none';
    }
  } else {
    recordingPreviewAudio.removeAttribute('src');
    recordingPreviewWrap.style.display = 'none';
  }
}

let missionRecordingTimer = null;

// 음성 재생 (미션 가이드/듣고 적기용)
let missionPlaybackAudio = null;
let missionPlaybackProgressInterval = null;
let missionYouTubePlayer = null;
let missionMissionPlaybackAudio = null;
let missionMissionPlaybackProgressInterval = null;
let missionMissionYouTubePlayer = null;
let giftMissionPlaybackAudio = null;
let giftMissionPlaybackProgressInterval = null;
let giftMissionYouTubePlayer = null;
let missionAudioBox1Completed = false;
let missionAudioBox2Completed = false;
let missionRelaxAltAudioCompleted = false;
let missionRelaxAltYouTubePlayer = null;
let missionRelaxAltPlaybackAudio = null;
let missionRelaxAltPlaybackProgressInterval = null;
let giftMissionAudioBoxCompleted = false;
let missionRecordingSavedThisSession = false; // 레코딩: 녹음 저장 후 활동완료 가능
let missionPlaybackVolume = 0.5; // 녹음 시 재생 음원 음량 (0~1), 기본 중간 음량

function getSavedPlaybackVolume() {
  const raw = getData(STORAGE_KEYS.playbackVolume);
  if (raw === null || raw === undefined) return 50;
  const n = Math.max(0, Math.min(100, Number(raw)));
  return Number.isNaN(n) ? 50 : n;
}

function setSavedPlaybackVolume(pct) {
  const v = Math.max(0, Math.min(100, Math.round(pct)));
  setData(STORAGE_KEYS.playbackVolume, v);
}

function applyMissionPlaybackVolume() {
  const v = missionPlaybackVolume;
  if (missionPlaybackAudio) missionPlaybackAudio.volume = v;
  if (missionMissionPlaybackAudio) missionMissionPlaybackAudio.volume = v;
  if (giftMissionPlaybackAudio) giftMissionPlaybackAudio.volume = v;
  if (missionYouTubePlayer && missionYouTubePlayer.setVolume) {
    try { missionYouTubePlayer.setVolume(Math.round(v * 100)); } catch (_) {}
  }
  if (missionMissionYouTubePlayer && missionMissionYouTubePlayer.setVolume) {
    try { missionMissionYouTubePlayer.setVolume(Math.round(v * 100)); } catch (_) {}
  }
  if (giftMissionYouTubePlayer && giftMissionYouTubePlayer.setVolume) {
    try { giftMissionYouTubePlayer.setVolume(Math.round(v * 100)); } catch (_) {}
  }
  if (missionRelaxAltYouTubePlayer && missionRelaxAltYouTubePlayer.setVolume) {
    try { missionRelaxAltYouTubePlayer.setVolume(Math.round(v * 100)); } catch (_) {}
  }
}

function isYouTubeUrl(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.includes('youtube.com') || lower.includes('youtu.be');
}

// 관리자 페이지에서 설정한 유튜브 링크를 우선 사용
// entryIdx: 본활동 entries[0]=편지, entries[1]=미션 등
function getMissionAudioUrlForEntryIndex(entryIdx) {
  try {
    const raw = localStorage.getItem('contique_mission_audio');
    const adminData = JSON.parse(raw || '{}');
    const key = currentMissionId;
    const override = adminData[key];
    if (override?.entries && override.entries.length > entryIdx) {
      const entry = override.entries[entryIdx];
      if (entry?.url) return entry.url;
    }
  } catch (e) {}
  return null;
}

function getMissionAudioUrl(phase) {
  try {
    const raw = localStorage.getItem('contique_mission_audio');
    const adminData = JSON.parse(raw || '{}');
    const key = currentMissionId;
    const override = adminData[key];

    if (override) {
      // --- 릴렉싱 모드: relaxingUrls만 사용 (절대 entries/audioUrls로 폴백하지 않음) ---
      if (currentMissionViewMode === 'relaxing') {
        if (override.relaxingUrls && override.relaxingUrls.length > 0) {
          const idx = Number(currentRelaxingIdx) || 0;
          const list = override.relaxingUrls;
          if (idx >= 0 && idx < list.length) {
            const url = list[idx];
            if (url != null && String(url).trim()) return String(url).trim();
          }
        }
        return null;
      }

      // --- 돌아보기 모드: lookingBackUrls만 사용 ---
      if (currentMissionViewMode === 'lookingback') {
        if (override.lookingBackUrls && override.lookingBackUrls.length > 0) {
          const url = override.lookingBackUrls[0];
          if (url && String(url).trim()) return String(url).trim();
        }
        return null;
      }

      // --- 본활동 모드: entries[0] = 편지 박스 음원 ---
      if (override.entries && override.entries.length > 0) {
        const preferred = override.entries[0];
        if (preferred && preferred.url) return preferred.url;
      }
    }
  } catch (e) {
    console.error('[getMissionAudioUrl] localStorage 파싱 오류:', e);
  }
  return null;
}

function hasMissionAdminUrl(phase) {
  try {
    const adminData = JSON.parse(localStorage.getItem('contique_mission_audio') || '{}');
    const key = currentMissionId;
    const override = adminData[key];
    if (!override) return false;
    if (currentMissionViewMode === 'relaxing') {
      return !!(override.relaxingUrls && override.relaxingUrls.length > 0 && override.relaxingUrls.some(u => u && String(u).trim()));
    }
    if (currentMissionViewMode === 'lookingback') {
      return !!(override.lookingBackUrls && override.lookingBackUrls.length > 0 && override.lookingBackUrls.some(u => u && String(u).trim()));
    }
    return !!(override.entries && override.entries.length > 0 && override.entries.some(e => e && e.url && String(e.url).trim()));
  } catch { return false; }
}

function resetMissionPlaybackUI() {
  stopMissionPlayback();
  stopMissionRelaxAltPlayback();
  resetMissionMissionPlaybackUI();
}

// 미션 유튜브 플레이어 초기화 (관리자 페이지에서 설정한 유튜브 링크 재생)
function initMissionYouTubePlayer(url, phase) {
  const videoId = getYouTubeVideoId(url);
  if (!videoId) {
    alert('유효한 유튜브 링크가 아닙니다.');
    return;
  }

  // 이전 플레이어 정리
  if (missionYouTubePlayer) {
    try { missionYouTubePlayer.destroy(); } catch (e) { /* ignore */ }
    missionYouTubePlayer = null;
  }

  // 히든 플레이어 div 생성 (없으면)
  let playerDiv = document.getElementById('mission-yt-player');
  if (!playerDiv) {
    playerDiv = document.createElement('div');
    playerDiv.id = 'mission-yt-player';
    playerDiv.className = 'yt-player-hidden';
    const section = document.getElementById('mission-playback-section');
    if (section) section.appendChild(playerDiv);
  }

  const setupPlayer = () => {
    missionYouTubePlayer = new YT.Player('mission-yt-player', {
      height: '1', width: '1',
      videoId: videoId,
      playerVars: { autoplay: 1, controls: 0, disablekb: 1 },
      events: {
        onError: (err) => {
          console.warn('[Mission YouTube] embed error', err && err.data, 'url=', url);
          alert('이 유튜브 음원은 앱 안에서 재생할 수 없어.\n유튜브 앱에서 대신 열어볼게.');
          window.open(url, '_blank');
          stopMissionPlayback();
        },
        onReady: (e) => {
          const dur = e.target.getDuration();
          const timeEl = document.getElementById('mission-play-time');
          if (timeEl) timeEl.textContent = '00:00 | ' + formatTime(Math.floor(dur || 0));
          try { e.target.setVolume(Math.round(missionPlaybackVolume * 100)); } catch (_) {}
          document.getElementById('mission-play-btn').style.display = 'none';
          document.getElementById('mission-play-pause-btn').style.display = 'inline-block';
          document.getElementById('mission-play-stop-btn').style.display = 'inline-block';
          startPlaybackProgressInterval();
        },
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.ENDED) {
            onMissionPlaybackEnded(phase);
          }
          if (e.data === YT.PlayerState.PAUSED) {
            document.getElementById('mission-play-btn').style.display = 'inline-block';
            document.getElementById('mission-play-pause-btn').style.display = 'none';
          }
          if (e.data === YT.PlayerState.PLAYING) {
            document.getElementById('mission-play-btn').style.display = 'none';
            document.getElementById('mission-play-pause-btn').style.display = 'inline-block';
            document.getElementById('mission-play-stop-btn').style.display = 'inline-block';
          }
        },
        onError: (e) => {
          resetMissionPlaybackUI();
          missionYouTubePlayer = null;
          // 오류 코드별 안내 메시지
          const msg = (e.data === 150 || e.data === 101)
            ? '이 영상은 비공개로 설정되어 있어 재생할 수 없습니다.\n유튜브에서 "일부 공개(미등록)"으로 변경해 주세요.'
            : (e.data === 100)
            ? '영상을 찾을 수 없습니다. 삭제되었거나 링크가 올바르지 않습니다.'
            : '유튜브 영상을 재생할 수 없습니다. (오류 코드: ' + e.data + ')';
          alert(msg);
        }
      }
    });
  };

  if (window.YT && window.YT.Player) {
    setupPlayer();
  } else {
    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prevReady === 'function') prevReady();
      setupPlayer();
    };
  }
}

// 음성 재생 종료 — 본활동/돌아보기가 독립 카드로 분리되어 자동 phase 전환하지 않음
function onMissionPlaybackEnded(phase) {
  stopMissionPlayback();
  missionPlaybackAudio = null;
}

function toggleMissionPlayback() {
  stopMissionMissionPlayback();
  stopMissionRelaxAltPlayback();
  // 유튜브 플레이어가 활성화된 경우
  if (missionYouTubePlayer) {
    try {
      const state = missionYouTubePlayer.getPlayerState();
      if (state === YT.PlayerState.PLAYING) { pauseMissionPlayback(); return; }
      if (state === YT.PlayerState.PAUSED)  {
        missionYouTubePlayer.playVideo();
        document.getElementById('mission-play-btn').style.display = 'none';
        document.getElementById('mission-play-pause-btn').style.display = 'inline-block';
        document.getElementById('mission-play-stop-btn').style.display = 'inline-block';
        startPlaybackProgressInterval();
        return;
      }
    } catch { /* ignore */ }
  }

  if (missionPlaybackAudio && !missionPlaybackAudio.paused) {
    pauseMissionPlayback();
    return;
  }
  if (missionPlaybackAudio && missionPlaybackAudio.paused && missionPlaybackAudio.currentTime > 0) {
    missionPlaybackAudio.play();
    document.getElementById('mission-play-btn').style.display = 'none';
    document.getElementById('mission-play-pause-btn').style.display = 'inline-block';
    document.getElementById('mission-play-stop-btn').style.display = 'inline-block';
    startPlaybackProgressInterval();
    return;
  }
  const phase = missionRevealPhase;
  // 본활동 모드에서만 entries[0] 사용, 릴렉싱/돌아보기는 getMissionAudioUrl 사용
  const url = (currentMissionViewMode === 'main')
    ? (getMissionAudioUrlForEntryIndex(0) || getMissionAudioUrl(phase))
    : getMissionAudioUrl(phase);
  if (!url) { alert('재생할 음원이 등록되지 않았습니다.'); return; }

  // 유튜브 링크이면 유튜브 플레이어 사용
  if (isYouTubeUrl(url)) {
    initMissionYouTubePlayer(url, phase);
    return;
  }
  missionPlaybackAudio = new Audio(url);
  missionPlaybackAudio.volume = missionPlaybackVolume;
  missionPlaybackAudio.onloadedmetadata = () => {
    document.getElementById('mission-play-time').textContent = '00:00 | ' + formatTime(Math.floor(missionPlaybackAudio.duration));
  };
  missionPlaybackAudio.onerror = () => {
    // 돌아보기 전용 파일이 없으면 본활동 음원으로 재시도 (phase 1일 때)
    if (phase >= 1 && url.includes('_lookingback')) {
      missionPlaybackAudio = null;
      const fallback = getMissionAudioUrl(0);
      // 폴백 URL이 유튜브 링크이면 유튜브 플레이어로 처리
      if (isYouTubeUrl(fallback)) {
        initMissionYouTubePlayer(fallback, phase);
        return;
      }
      missionPlaybackAudio = new Audio(fallback);
      missionPlaybackAudio.volume = missionPlaybackVolume;
      missionPlaybackAudio.onloadedmetadata = () => {
        document.getElementById('mission-play-time').textContent = '00:00 | ' + formatTime(Math.floor(missionPlaybackAudio.duration));
      };
      missionPlaybackAudio.onerror = () => {
        resetMissionPlaybackUI();
        missionPlaybackAudio = null;
        alert('관리자 페이지에서 이 미션의 유튜브 링크를 등록해 주세요.\n(미션: ' + currentMissionId + ')');
      };
      missionPlaybackAudio.onended = () => { onMissionPlaybackEnded(phase); };
      missionPlaybackAudio.play();
      return;
    }
    resetMissionPlaybackUI();
    missionPlaybackAudio = null;
    console.warn('[오디오 오류] missionId:', currentMissionId, '| URL:', url);
    alert('관리자 페이지에서 이 미션의 유튜브 링크를 등록해 주세요.\n(미션: ' + currentMissionId + ')');
  };
  missionPlaybackAudio.onended = () => { onMissionPlaybackEnded(phase); };
  missionPlaybackAudio.play();
  document.getElementById('mission-play-btn').style.display = 'none';
  document.getElementById('mission-play-pause-btn').style.display = 'inline-block';
  document.getElementById('mission-play-stop-btn').style.display = 'inline-block';
  startPlaybackProgressInterval();
}

function startPlaybackProgressInterval() {
  if (missionPlaybackProgressInterval) clearInterval(missionPlaybackProgressInterval);
  // 맥북/크롬 끊김 방지: 녹음 중에는 진행바 타이머를 아예 사용하지 않음
  if (recordingState.isRecording) return;
  const intervalMs = 200;
  missionPlaybackProgressInterval = setInterval(() => {
    const p = document.getElementById('mission-play-progress');
    const t = document.getElementById('mission-play-time');
    if (!p || !t) return;

    // 유튜브 플레이어
    if (missionYouTubePlayer && missionYouTubePlayer.getPlayerState) {
      try {
        const state = missionYouTubePlayer.getPlayerState();
        if (state !== YT.PlayerState.PLAYING) return;
        const cur = missionYouTubePlayer.getCurrentTime() || 0;
        const dur = missionYouTubePlayer.getDuration() || 0;
        if (dur > 0) {
          p.value = (cur / dur) * 100;
          t.textContent = formatTime(Math.floor(cur)) + ' | ' + formatTime(Math.floor(dur));
        }
      } catch { /* ignore */ }
      return;
    }

    // 네이티브 오디오
    if (!missionPlaybackAudio || missionPlaybackAudio.paused) return;
    if (missionPlaybackAudio.duration) {
      const percent = (missionPlaybackAudio.currentTime / missionPlaybackAudio.duration) * 100;
      p.value = percent;
      t.textContent = formatTime(Math.floor(missionPlaybackAudio.currentTime)) + ' | ' + formatTime(Math.floor(missionPlaybackAudio.duration));
    }
  }, intervalMs);
}

function pauseMissionPlayback() {
  if (missionYouTubePlayer) {
    try { missionYouTubePlayer.pauseVideo(); } catch { /* ignore */ }
    document.getElementById('mission-play-btn').style.display = 'inline-block';
    document.getElementById('mission-play-pause-btn').style.display = 'none';
    if (missionPlaybackProgressInterval) clearInterval(missionPlaybackProgressInterval);
    return;
  }
  if (missionPlaybackAudio) {
    missionPlaybackAudio.pause();
    document.getElementById('mission-play-btn').style.display = 'inline-block';
    document.getElementById('mission-play-pause-btn').style.display = 'none';
    if (missionPlaybackProgressInterval) clearInterval(missionPlaybackProgressInterval);
  }
}

function stopMissionPlayback() {
  if (missionYouTubePlayer) {
    try { missionYouTubePlayer.stopVideo(); missionYouTubePlayer.destroy(); } catch { /* ignore */ }
    missionYouTubePlayer = null;
    const ytDiv = document.getElementById('mission-yt-player');
    if (ytDiv) ytDiv.remove();
  }
  if (missionPlaybackAudio) {
    missionPlaybackAudio.pause();
    missionPlaybackAudio.currentTime = 0;
    missionPlaybackAudio = null;
  }
  if (missionPlaybackProgressInterval) {
    clearInterval(missionPlaybackProgressInterval);
    missionPlaybackProgressInterval = null;
  }
  const playBtn  = document.getElementById('mission-play-btn');
  const pauseBtn = document.getElementById('mission-play-pause-btn');
  const stopBtn  = document.getElementById('mission-play-stop-btn');
  const progress = document.getElementById('mission-play-progress');
  const timeEl   = document.getElementById('mission-play-time');
  if (playBtn)  playBtn.style.display  = 'inline-block';
  if (pauseBtn) pauseBtn.style.display = 'none';
  if (stopBtn)  stopBtn.style.display  = 'none';
  if (progress) progress.value = 0;
  if (timeEl)   timeEl.textContent = '00:00 | 00:00';
}

function seekMissionPlayback(value) {
  const percent = parseFloat(value) || 0;
  if (missionYouTubePlayer) {
    try {
      const dur = missionYouTubePlayer.getDuration() || 0;
      if (dur > 0) missionYouTubePlayer.seekTo((percent / 100) * dur, true);
    } catch { /* ignore */ }
    return;
  }
  if (!missionPlaybackAudio || !missionPlaybackAudio.duration) return;
  missionPlaybackAudio.currentTime = (percent / 100) * missionPlaybackAudio.duration;
}

// [ 미션 ] 박스 전용 재생 (본활동, entries[1] 우선)
function resetMissionMissionPlaybackUI() {
  stopMissionMissionPlayback();
}

function resetGiftMissionPlaybackUI() {
  stopGiftMissionPlayback();
}

function toggleMissionMissionPlayback() {
  if (missionMissionYouTubePlayer) {
    try {
      const state = missionMissionYouTubePlayer.getPlayerState();
      if (state === YT.PlayerState.PLAYING) { pauseMissionMissionPlayback(); return; }
      if (state === YT.PlayerState.PAUSED) {
        missionMissionYouTubePlayer.playVideo();
        document.getElementById('mission-mission-play-btn').style.display = 'none';
        document.getElementById('mission-mission-play-pause-btn').style.display = 'inline-block';
        document.getElementById('mission-mission-play-stop-btn').style.display = 'inline-block';
        startMissionMissionPlaybackProgressInterval();
        return;
      }
    } catch { /* ignore */ }
  }
  if (missionMissionPlaybackAudio && !missionMissionPlaybackAudio.paused) {
    pauseMissionMissionPlayback();
    return;
  }
  if (missionMissionPlaybackAudio && missionMissionPlaybackAudio.paused && missionMissionPlaybackAudio.currentTime > 0) {
    missionMissionPlaybackAudio.play();
    document.getElementById('mission-mission-play-btn').style.display = 'none';
    document.getElementById('mission-mission-play-pause-btn').style.display = 'inline-block';
    document.getElementById('mission-mission-play-stop-btn').style.display = 'inline-block';
    startMissionMissionPlaybackProgressInterval();
    return;
  }
  stopMissionPlayback();
  stopMissionRelaxAltPlayback();
  const url = getMissionAudioUrlForEntryIndex(1);
  if (!url) return;
  if (isYouTubeUrl(url)) {
    initMissionMissionYouTubePlayer(url);
    return;
  }
  missionMissionPlaybackAudio = new Audio(url);
  missionMissionPlaybackAudio.volume = missionPlaybackVolume;
  missionMissionPlaybackAudio.onloadedmetadata = () => {
    document.getElementById('mission-mission-play-time').textContent = '00:00 | ' + formatTime(Math.floor(missionMissionPlaybackAudio.duration));
  };
  missionMissionPlaybackAudio.onerror = () => {
    resetMissionMissionPlaybackUI();
    missionMissionPlaybackAudio = null;
    alert('관리자 페이지에서 이 미션의 유튜브 링크를 등록해 주세요.\n(미션: ' + currentMissionId + ')');
  };
  missionMissionPlaybackAudio.onended = () => { stopMissionMissionPlayback(); missionMissionPlaybackAudio = null; };
  missionMissionPlaybackAudio.play();
  document.getElementById('mission-mission-play-btn').style.display = 'none';
  document.getElementById('mission-mission-play-pause-btn').style.display = 'inline-block';
  document.getElementById('mission-mission-play-stop-btn').style.display = 'inline-block';
  startMissionMissionPlaybackProgressInterval();
}

// GIFT 전용 미션 박스 재생 (entries[2] 우선)
function toggleGiftMissionPlayback() {
  stopMissionPlayback();
  stopMissionMissionPlayback();
  stopMissionRelaxAltPlayback();
  if (giftMissionYouTubePlayer) {
    try {
      const state = giftMissionYouTubePlayer.getPlayerState();
      if (state === YT.PlayerState.PLAYING) { pauseGiftMissionPlayback(); return; }
      if (state === YT.PlayerState.PAUSED) {
        giftMissionYouTubePlayer.playVideo();
        document.getElementById('gift-mission-play-btn').style.display = 'none';
        document.getElementById('gift-mission-play-pause-btn').style.display = 'inline-block';
        document.getElementById('gift-mission-play-stop-btn').style.display = 'inline-block';
        startGiftMissionPlaybackProgressInterval();
        return;
      }
    } catch { /* ignore */ }
  }
  if (giftMissionPlaybackAudio && !giftMissionPlaybackAudio.paused) {
    pauseGiftMissionPlayback();
    return;
  }
  if (giftMissionPlaybackAudio && giftMissionPlaybackAudio.paused && giftMissionPlaybackAudio.currentTime > 0) {
    giftMissionPlaybackAudio.play();
    document.getElementById('gift-mission-play-btn').style.display = 'none';
    document.getElementById('gift-mission-play-pause-btn').style.display = 'inline-block';
    document.getElementById('gift-mission-play-stop-btn').style.display = 'inline-block';
    startGiftMissionPlaybackProgressInterval();
    return;
  }
  const url = getMissionAudioUrlForEntryIndex(2);
  if (isYouTubeUrl(url)) {
    initGiftMissionYouTubePlayer(url);
    return;
  }
  giftMissionPlaybackAudio = new Audio(url);
  giftMissionPlaybackAudio.volume = missionPlaybackVolume;
  giftMissionPlaybackAudio.onloadedmetadata = () => {
    document.getElementById('gift-mission-play-time').textContent = '00:00 | ' + formatTime(Math.floor(giftMissionPlaybackAudio.duration));
  };
  giftMissionPlaybackAudio.onerror = () => {
    resetGiftMissionPlaybackUI();
    giftMissionPlaybackAudio = null;
    alert('관리자 페이지에서 이 미션의 유튜브 링크를 등록해 주세요.\n(미션: ' + currentMissionId + ')');
  };
  giftMissionPlaybackAudio.onended = () => { stopGiftMissionPlayback(); giftMissionPlaybackAudio = null; };
  giftMissionPlaybackAudio.play();
  document.getElementById('gift-mission-play-btn').style.display = 'none';
  document.getElementById('gift-mission-play-pause-btn').style.display = 'inline-block';
  document.getElementById('gift-mission-play-stop-btn').style.display = 'inline-block';
  startGiftMissionPlaybackProgressInterval();
}

function startGiftMissionPlaybackProgressInterval() {
  if (giftMissionPlaybackProgressInterval) clearInterval(giftMissionPlaybackProgressInterval);
  if (recordingState.isRecording) return;
  const intervalMs = 200;
  giftMissionPlaybackProgressInterval = setInterval(() => {
    const p = document.getElementById('gift-mission-play-progress');
    const t = document.getElementById('gift-mission-play-time');
    if (!p || !t) return;
    if (giftMissionYouTubePlayer && giftMissionYouTubePlayer.getPlayerState) {
      try {
        if (giftMissionYouTubePlayer.getPlayerState() !== YT.PlayerState.PLAYING) return;
        const cur = giftMissionYouTubePlayer.getCurrentTime() || 0;
        const dur = giftMissionYouTubePlayer.getDuration() || 0;
        if (dur > 0) {
          p.value = (cur / dur) * 100;
          t.textContent = formatTime(Math.floor(cur)) + ' | ' + formatTime(Math.floor(dur));
        }
      } catch { /* ignore */ }
      return;
    }
    if (!giftMissionPlaybackAudio || giftMissionPlaybackAudio.paused) return;
    if (giftMissionPlaybackAudio.duration) {
      const percent = (giftMissionPlaybackAudio.currentTime / giftMissionPlaybackAudio.duration) * 100;
      p.value = percent;
      t.textContent = formatTime(Math.floor(giftMissionPlaybackAudio.currentTime)) + ' | ' + formatTime(Math.floor(giftMissionPlaybackAudio.duration));
    }
  }, intervalMs);
}

function pauseGiftMissionPlayback() {
  if (giftMissionYouTubePlayer) {
    try { giftMissionYouTubePlayer.pauseVideo(); } catch { /* ignore */ }
    document.getElementById('gift-mission-play-btn').style.display = 'inline-block';
    document.getElementById('gift-mission-play-pause-btn').style.display = 'none';
    if (giftMissionPlaybackProgressInterval) clearInterval(giftMissionPlaybackProgressInterval);
    return;
  }
  if (!giftMissionPlaybackAudio) return;
  giftMissionPlaybackAudio.pause();
  document.getElementById('gift-mission-play-btn').style.display = 'inline-block';
  document.getElementById('gift-mission-play-pause-btn').style.display = 'none';
  if (giftMissionPlaybackProgressInterval) clearInterval(giftMissionPlaybackProgressInterval);
}

function stopGiftMissionPlayback() {
  if (giftMissionPlaybackProgressInterval) clearInterval(giftMissionPlaybackProgressInterval);
  if (giftMissionYouTubePlayer) {
    try { giftMissionYouTubePlayer.stopVideo(); } catch { /* ignore */ }
    try { giftMissionYouTubePlayer.destroy(); } catch { /* ignore */ }
    giftMissionYouTubePlayer = null;
  }
  if (giftMissionPlaybackAudio) {
    try { giftMissionPlaybackAudio.pause(); } catch { /* ignore */ }
    giftMissionPlaybackAudio.currentTime = 0;
  }
  const playBtn  = document.getElementById('gift-mission-play-btn');
  const pauseBtn = document.getElementById('gift-mission-play-pause-btn');
  const stopBtn  = document.getElementById('gift-mission-play-stop-btn');
  const progress = document.getElementById('gift-mission-play-progress');
  const timeEl   = document.getElementById('gift-mission-play-time');
  if (playBtn)  playBtn.style.display  = 'inline-block';
  if (pauseBtn) pauseBtn.style.display = 'none';
  if (stopBtn)  stopBtn.style.display  = 'none';
  if (progress) progress.value = 0;
  if (timeEl)   timeEl.textContent = '00:00 | 00:00';
}

function seekGiftMissionPlayback(value) {
  const percent = parseFloat(value) || 0;
  if (giftMissionYouTubePlayer) {
    try {
      const dur = giftMissionYouTubePlayer.getDuration() || 0;
      if (dur > 0) giftMissionYouTubePlayer.seekTo((percent / 100) * dur, true);
    } catch { /* ignore */ }
    return;
  }
  if (!giftMissionPlaybackAudio || !giftMissionPlaybackAudio.duration) return;
  giftMissionPlaybackAudio.currentTime = (percent / 100) * giftMissionPlaybackAudio.duration;
}

function initGiftMissionYouTubePlayer(url) {
  const videoId = getYouTubeVideoId(url);
  if (!videoId) {
    alert('유효한 유튜브 링크가 아닙니다.');
    return;
  }
  if (giftMissionYouTubePlayer) {
    try { giftMissionYouTubePlayer.destroy(); } catch (e) { /* ignore */ }
    giftMissionYouTubePlayer = null;
  }
  let playerDiv = document.getElementById('gift-mission-yt-player');
  if (!playerDiv) {
    playerDiv = document.createElement('div');
    playerDiv.id = 'gift-mission-yt-player';
    playerDiv.className = 'yt-player-hidden';
    const section = document.getElementById('gift-mission-playback-section');
    if (section) section.appendChild(playerDiv);
  }
  const setupPlayer = () => {
    giftMissionYouTubePlayer = new YT.Player('gift-mission-yt-player', {
      height: '1', width: '1',
      videoId: videoId,
      playerVars: { autoplay: 1, controls: 0, disablekb: 1 },
      events: {
        onError: (err) => {
          console.warn('[GiftMission YouTube] embed error', err && err.data, 'url=', url);
          alert('이 유튜브 음원은 앱 안에서 재생할 수 없어.\n유튜브 앱에서 대신 열어볼게.');
          window.open(url, '_blank');
          stopGiftMissionPlayback();
        },
        onReady: (e) => {
          const dur = e.target.getDuration();
          const timeEl = document.getElementById('gift-mission-play-time');
          if (timeEl) timeEl.textContent = '00:00 | ' + formatTime(Math.floor(dur || 0));
          try { e.target.setVolume(Math.round(missionPlaybackVolume * 100)); } catch (_) {}
          document.getElementById('gift-mission-play-btn').style.display = 'none';
          document.getElementById('gift-mission-play-pause-btn').style.display = 'inline-block';
          document.getElementById('gift-mission-play-stop-btn').style.display = 'inline-block';
          startGiftMissionPlaybackProgressInterval();
        },
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.ENDED) {
            stopGiftMissionPlayback();
            giftMissionYouTubePlayer = null;
          }
          if (e.data === YT.PlayerState.PAUSED) {
            document.getElementById('gift-mission-play-btn').style.display = 'inline-block';
            document.getElementById('gift-mission-play-pause-btn').style.display = 'none';
          }
          if (e.data === YT.PlayerState.PLAYING) {
            document.getElementById('gift-mission-play-btn').style.display = 'none';
            document.getElementById('gift-mission-play-pause-btn').style.display = 'inline-block';
            document.getElementById('gift-mission-play-stop-btn').style.display = 'inline-block';
          }
        },
        onError: (e) => {
          resetGiftMissionPlaybackUI();
          giftMissionYouTubePlayer = null;
          const msg = (e.data === 150 || e.data === 101)
            ? '이 영상은 비공개로 설정되어 있어 재생할 수 없습니다.'
            : (e.data === 100) ? '영상을 찾을 수 없습니다.' : '유튜브 영상을 재생할 수 없습니다.';
          alert(msg);
        }
      }
    });
  };
  if (window.YT && window.YT.Player) {
    setupPlayer();
  } else {
    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prevReady === 'function') prevReady();
      setupPlayer();
    };
  }
}

// 릴렉싱 WB425 / DB264 추가 박스 (0화 오리지널 버전)
function toggleMissionRelaxAltPlayback() {
  stopMissionPlayback();
  stopMissionMissionPlayback();
  stopGiftMissionPlayback();
  const url = getMissionRelaxAltUrl();
  if (!url) {
    alert('재생할 음원이 없습니다.');
    return;
  }
  if (missionRelaxAltYouTubePlayer) {
    try {
      const state = missionRelaxAltYouTubePlayer.getPlayerState();
      if (state === YT.PlayerState.PLAYING) { pauseMissionRelaxAltPlayback(); return; }
      if (state === YT.PlayerState.PAUSED) {
        missionRelaxAltYouTubePlayer.playVideo();
        const pb = document.getElementById('mission-relax-alt-play-btn');
        const ps = document.getElementById('mission-relax-alt-play-pause-btn');
        const st = document.getElementById('mission-relax-alt-play-stop-btn');
        if (pb) pb.style.display = 'none';
        if (ps) ps.style.display = 'inline-block';
        if (st) st.style.display = 'inline-block';
        startMissionRelaxAltPlaybackProgressInterval();
        return;
      }
    } catch { /* ignore */ }
  }
  if (missionRelaxAltPlaybackAudio && !missionRelaxAltPlaybackAudio.paused) {
    pauseMissionRelaxAltPlayback();
    return;
  }
  if (missionRelaxAltPlaybackAudio && missionRelaxAltPlaybackAudio.paused && missionRelaxAltPlaybackAudio.currentTime > 0) {
    missionRelaxAltPlaybackAudio.play();
    const pb = document.getElementById('mission-relax-alt-play-btn');
    const ps = document.getElementById('mission-relax-alt-play-pause-btn');
    const st = document.getElementById('mission-relax-alt-play-stop-btn');
    if (pb) pb.style.display = 'none';
    if (ps) ps.style.display = 'inline-block';
    if (st) st.style.display = 'inline-block';
    startMissionRelaxAltPlaybackProgressInterval();
    return;
  }
  if (isYouTubeUrl(url)) {
    initMissionRelaxAltYouTubePlayer(url);
    return;
  }
  missionRelaxAltPlaybackAudio = new Audio(url);
  missionRelaxAltPlaybackAudio.volume = missionPlaybackVolume;
  missionRelaxAltPlaybackAudio.onloadedmetadata = () => {
    const t = document.getElementById('mission-relax-alt-play-time');
    if (t) t.textContent = '00:00 | ' + formatTime(Math.floor(missionRelaxAltPlaybackAudio.duration));
  };
  missionRelaxAltPlaybackAudio.onerror = () => {
    stopMissionRelaxAltPlayback();
    missionRelaxAltPlaybackAudio = null;
    alert('관리자 페이지에서 이 미션의 유튜브 링크를 등록해 주세요.\n(미션: ' + currentMissionId + ')');
  };
  missionRelaxAltPlaybackAudio.onended = () => { stopMissionRelaxAltPlayback(); missionRelaxAltPlaybackAudio = null; };
  missionRelaxAltPlaybackAudio.play();
  const pb = document.getElementById('mission-relax-alt-play-btn');
  const ps = document.getElementById('mission-relax-alt-play-pause-btn');
  const st = document.getElementById('mission-relax-alt-play-stop-btn');
  if (pb) pb.style.display = 'none';
  if (ps) ps.style.display = 'inline-block';
  if (st) st.style.display = 'inline-block';
  startMissionRelaxAltPlaybackProgressInterval();
}

function startMissionRelaxAltPlaybackProgressInterval() {
  if (missionRelaxAltPlaybackProgressInterval) clearInterval(missionRelaxAltPlaybackProgressInterval);
  if (recordingState.isRecording) return;
  const intervalMs = 200;
  missionRelaxAltPlaybackProgressInterval = setInterval(() => {
    const p = document.getElementById('mission-relax-alt-play-progress');
    const t = document.getElementById('mission-relax-alt-play-time');
    if (!p || !t) return;
    if (missionRelaxAltYouTubePlayer && missionRelaxAltYouTubePlayer.getPlayerState) {
      try {
        if (missionRelaxAltYouTubePlayer.getPlayerState() !== YT.PlayerState.PLAYING) return;
        const cur = missionRelaxAltYouTubePlayer.getCurrentTime() || 0;
        const dur = missionRelaxAltYouTubePlayer.getDuration() || 0;
        if (dur > 0) {
          p.value = (cur / dur) * 100;
          t.textContent = formatTime(Math.floor(cur)) + ' | ' + formatTime(Math.floor(dur));
        }
      } catch { /* ignore */ }
      return;
    }
    if (!missionRelaxAltPlaybackAudio || missionRelaxAltPlaybackAudio.paused) return;
    if (missionRelaxAltPlaybackAudio.duration) {
      const percent = (missionRelaxAltPlaybackAudio.currentTime / missionRelaxAltPlaybackAudio.duration) * 100;
      p.value = percent;
      t.textContent = formatTime(Math.floor(missionRelaxAltPlaybackAudio.currentTime)) + ' | ' + formatTime(Math.floor(missionRelaxAltPlaybackAudio.duration));
    }
  }, intervalMs);
}

function pauseMissionRelaxAltPlayback() {
  if (missionRelaxAltYouTubePlayer) {
    try { missionRelaxAltYouTubePlayer.pauseVideo(); } catch { /* ignore */ }
    const pb = document.getElementById('mission-relax-alt-play-btn');
    const ps = document.getElementById('mission-relax-alt-play-pause-btn');
    if (pb) pb.style.display = 'inline-block';
    if (ps) ps.style.display = 'none';
    if (missionRelaxAltPlaybackProgressInterval) clearInterval(missionRelaxAltPlaybackProgressInterval);
    return;
  }
  if (missionRelaxAltPlaybackAudio) {
    missionRelaxAltPlaybackAudio.pause();
    const pb = document.getElementById('mission-relax-alt-play-btn');
    const ps = document.getElementById('mission-relax-alt-play-pause-btn');
    if (pb) pb.style.display = 'inline-block';
    if (ps) ps.style.display = 'none';
    if (missionRelaxAltPlaybackProgressInterval) clearInterval(missionRelaxAltPlaybackProgressInterval);
  }
}

function stopMissionRelaxAltPlayback() {
  if (missionRelaxAltPlaybackProgressInterval) clearInterval(missionRelaxAltPlaybackProgressInterval);
  missionRelaxAltPlaybackProgressInterval = null;
  if (missionRelaxAltYouTubePlayer) {
    try { missionRelaxAltYouTubePlayer.stopVideo(); } catch { /* ignore */ }
    try { missionRelaxAltYouTubePlayer.destroy(); } catch { /* ignore */ }
    missionRelaxAltYouTubePlayer = null;
  }
  const ytDiv = document.getElementById('mission-relax-alt-yt-player');
  if (ytDiv) ytDiv.remove();
  if (missionRelaxAltPlaybackAudio) {
    try { missionRelaxAltPlaybackAudio.pause(); } catch { /* ignore */ }
    missionRelaxAltPlaybackAudio.currentTime = 0;
    missionRelaxAltPlaybackAudio = null;
  }
  const playBtn  = document.getElementById('mission-relax-alt-play-btn');
  const pauseBtn = document.getElementById('mission-relax-alt-play-pause-btn');
  const stopBtn  = document.getElementById('mission-relax-alt-play-stop-btn');
  const progress = document.getElementById('mission-relax-alt-play-progress');
  const timeEl   = document.getElementById('mission-relax-alt-play-time');
  if (playBtn)  playBtn.style.display  = 'inline-block';
  if (pauseBtn) pauseBtn.style.display = 'none';
  if (stopBtn)  stopBtn.style.display  = 'none';
  if (progress) progress.value = 0;
  if (timeEl)   timeEl.textContent = '00:00 | 00:00';
}

function seekMissionRelaxAltPlayback(value) {
  const percent = parseFloat(value) || 0;
  if (missionRelaxAltYouTubePlayer) {
    try {
      const dur = missionRelaxAltYouTubePlayer.getDuration() || 0;
      if (dur > 0) missionRelaxAltYouTubePlayer.seekTo((percent / 100) * dur, true);
    } catch { /* ignore */ }
    return;
  }
  if (!missionRelaxAltPlaybackAudio || !missionRelaxAltPlaybackAudio.duration) return;
  missionRelaxAltPlaybackAudio.currentTime = (percent / 100) * missionRelaxAltPlaybackAudio.duration;
}

function initMissionRelaxAltYouTubePlayer(url) {
  const videoId = getYouTubeVideoId(url);
  if (!videoId) {
    alert('유효한 유튜브 링크가 아닙니다.');
    return;
  }
  if (missionRelaxAltYouTubePlayer) {
    try { missionRelaxAltYouTubePlayer.destroy(); } catch (e) { /* ignore */ }
    missionRelaxAltYouTubePlayer = null;
  }
  let playerDiv = document.getElementById('mission-relax-alt-yt-player');
  if (!playerDiv) {
    playerDiv = document.createElement('div');
    playerDiv.id = 'mission-relax-alt-yt-player';
    playerDiv.className = 'yt-player-hidden';
    const section = document.getElementById('mission-relax-alt-playback-section');
    if (section) section.appendChild(playerDiv);
  }
  const setupPlayer = () => {
    missionRelaxAltYouTubePlayer = new YT.Player('mission-relax-alt-yt-player', {
      height: '1', width: '1',
      videoId: videoId,
      playerVars: { autoplay: 1, controls: 0, disablekb: 1 },
      events: {
        onError: (err) => {
          const code = err && err.data;
          console.warn('[MissionRelaxAlt YouTube] embed error', code, 'url=', url);
          if (code === 2 || code === 5) {
            alert('이 유튜브 음원은 앱 안에서 재생할 수 없어.\n유튜브 앱에서 대신 열어볼게.');
            window.open(url, '_blank');
          } else {
            const msg = (code === 150 || code === 101)
              ? '이 영상은 비공개로 설정되어 있어 재생할 수 없습니다.'
              : (code === 100) ? '영상을 찾을 수 없습니다.' : '유튜브 영상을 재생할 수 없습니다.';
            alert(msg);
          }
          stopMissionRelaxAltPlayback();
          missionRelaxAltYouTubePlayer = null;
        },
        onReady: (e) => {
          const dur = e.target.getDuration();
          const timeEl = document.getElementById('mission-relax-alt-play-time');
          if (timeEl) timeEl.textContent = '00:00 | ' + formatTime(Math.floor(dur || 0));
          try { e.target.setVolume(Math.round(missionPlaybackVolume * 100)); } catch (_) {}
          const pb = document.getElementById('mission-relax-alt-play-btn');
          const ps = document.getElementById('mission-relax-alt-play-pause-btn');
          const st = document.getElementById('mission-relax-alt-play-stop-btn');
          if (pb) pb.style.display = 'none';
          if (ps) ps.style.display = 'inline-block';
          if (st) st.style.display = 'inline-block';
          startMissionRelaxAltPlaybackProgressInterval();
        },
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.ENDED) {
            stopMissionRelaxAltPlayback();
            missionRelaxAltYouTubePlayer = null;
          }
          if (e.data === YT.PlayerState.PAUSED) {
            const pb = document.getElementById('mission-relax-alt-play-btn');
            const ps = document.getElementById('mission-relax-alt-play-pause-btn');
            if (pb) pb.style.display = 'inline-block';
            if (ps) ps.style.display = 'none';
          }
          if (e.data === YT.PlayerState.PLAYING) {
            const pb = document.getElementById('mission-relax-alt-play-btn');
            const ps = document.getElementById('mission-relax-alt-play-pause-btn');
            const st = document.getElementById('mission-relax-alt-play-stop-btn');
            if (pb) pb.style.display = 'none';
            if (ps) ps.style.display = 'inline-block';
            if (st) st.style.display = 'inline-block';
          }
        }
      }
    });
  };
  if (window.YT && window.YT.Player) {
    setupPlayer();
  } else {
    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prevReady === 'function') prevReady();
      setupPlayer();
    };
  }
}

function startMissionMissionPlaybackProgressInterval() {
  if (missionMissionPlaybackProgressInterval) clearInterval(missionMissionPlaybackProgressInterval);
  // 맥북/크롬 끊김 방지: 녹음 중에는 진행바 타이머를 아예 사용하지 않음
  if (recordingState.isRecording) return;
  const intervalMs = 200;
  missionMissionPlaybackProgressInterval = setInterval(() => {
    const p = document.getElementById('mission-mission-play-progress');
    const t = document.getElementById('mission-mission-play-time');
    if (!p || !t) return;
    if (missionMissionYouTubePlayer && missionMissionYouTubePlayer.getPlayerState) {
      try {
        if (missionMissionYouTubePlayer.getPlayerState() !== YT.PlayerState.PLAYING) return;
        const cur = missionMissionYouTubePlayer.getCurrentTime() || 0;
        const dur = missionMissionYouTubePlayer.getDuration() || 0;
        if (dur > 0) {
          p.value = (cur / dur) * 100;
          t.textContent = formatTime(Math.floor(cur)) + ' | ' + formatTime(Math.floor(dur));
        }
      } catch { /* ignore */ }
      return;
    }
    if (!missionMissionPlaybackAudio || missionMissionPlaybackAudio.paused) return;
    if (missionMissionPlaybackAudio.duration) {
      const percent = (missionMissionPlaybackAudio.currentTime / missionMissionPlaybackAudio.duration) * 100;
      p.value = percent;
      t.textContent = formatTime(Math.floor(missionMissionPlaybackAudio.currentTime)) + ' | ' + formatTime(Math.floor(missionMissionPlaybackAudio.duration));
    }
  }, intervalMs);
}

function pauseMissionMissionPlayback() {
  if (missionMissionYouTubePlayer) {
    try { missionMissionYouTubePlayer.pauseVideo(); } catch { /* ignore */ }
    document.getElementById('mission-mission-play-btn').style.display = 'inline-block';
    document.getElementById('mission-mission-play-pause-btn').style.display = 'none';
    if (missionMissionPlaybackProgressInterval) clearInterval(missionMissionPlaybackProgressInterval);
    return;
  }
  if (missionMissionPlaybackAudio) {
    missionMissionPlaybackAudio.pause();
    document.getElementById('mission-mission-play-btn').style.display = 'inline-block';
    document.getElementById('mission-mission-play-pause-btn').style.display = 'none';
    if (missionMissionPlaybackProgressInterval) clearInterval(missionMissionPlaybackProgressInterval);
  }
}

function stopMissionMissionPlayback() {
  if (missionMissionYouTubePlayer) {
    try { missionMissionYouTubePlayer.stopVideo(); missionMissionYouTubePlayer.destroy(); } catch { /* ignore */ }
    missionMissionYouTubePlayer = null;
    const ytDiv = document.getElementById('mission-mission-yt-player');
    if (ytDiv) ytDiv.remove();
  }
  if (missionMissionPlaybackAudio) {
    missionMissionPlaybackAudio.pause();
    missionMissionPlaybackAudio.currentTime = 0;
    missionMissionPlaybackAudio = null;
  }
  if (missionMissionPlaybackProgressInterval) {
    clearInterval(missionMissionPlaybackProgressInterval);
    missionMissionPlaybackProgressInterval = null;
  }
  const playBtn  = document.getElementById('mission-mission-play-btn');
  const pauseBtn = document.getElementById('mission-mission-play-pause-btn');
  const stopBtn  = document.getElementById('mission-mission-play-stop-btn');
  const progress = document.getElementById('mission-mission-play-progress');
  const timeEl   = document.getElementById('mission-mission-play-time');
  if (playBtn)  playBtn.style.display  = 'inline-block';
  if (pauseBtn) pauseBtn.style.display = 'none';
  if (stopBtn)  stopBtn.style.display  = 'none';
  if (progress) progress.value = 0;
  if (timeEl)   timeEl.textContent = '00:00 | 00:00';
}

function seekMissionMissionPlayback(value) {
  const percent = parseFloat(value) || 0;
  if (missionMissionYouTubePlayer) {
    try {
      const dur = missionMissionYouTubePlayer.getDuration() || 0;
      if (dur > 0) missionMissionYouTubePlayer.seekTo((percent / 100) * dur, true);
    } catch { /* ignore */ }
    return;
  }
  if (!missionMissionPlaybackAudio || !missionMissionPlaybackAudio.duration) return;
  missionMissionPlaybackAudio.currentTime = (percent / 100) * missionMissionPlaybackAudio.duration;
}

function initMissionMissionYouTubePlayer(url) {
  const videoId = getYouTubeVideoId(url);
  if (!videoId) {
    alert('유효한 유튜브 링크가 아닙니다.');
    return;
  }
  if (missionMissionYouTubePlayer) {
    try { missionMissionYouTubePlayer.destroy(); } catch (e) { /* ignore */ }
    missionMissionYouTubePlayer = null;
  }
  let playerDiv = document.getElementById('mission-mission-yt-player');
  if (!playerDiv) {
    playerDiv = document.createElement('div');
    playerDiv.id = 'mission-mission-yt-player';
    playerDiv.className = 'yt-player-hidden';
    const section = document.getElementById('mission-mission-playback-section');
    if (section) section.appendChild(playerDiv);
  }
  const setupPlayer = () => {
    missionMissionYouTubePlayer = new YT.Player('mission-mission-yt-player', {
      height: '1', width: '1',
      videoId: videoId,
      playerVars: { autoplay: 1, controls: 0, disablekb: 1 },
      events: {
        onError: (err) => {
          console.warn('[Mission2 YouTube] embed error', err && err.data, 'url=', url);
          alert('이 유튜브 음원은 앱 안에서 재생할 수 없어.\n유튜브 앱에서 대신 열어볼게.');
          window.open(url, '_blank');
          stopMissionMissionPlayback();
        },
        onReady: (e) => {
          const dur = e.target.getDuration();
          const timeEl = document.getElementById('mission-mission-play-time');
          if (timeEl) timeEl.textContent = '00:00 | ' + formatTime(Math.floor(dur || 0));
          try { e.target.setVolume(Math.round(missionPlaybackVolume * 100)); } catch (_) {}
          document.getElementById('mission-mission-play-btn').style.display = 'none';
          document.getElementById('mission-mission-play-pause-btn').style.display = 'inline-block';
          document.getElementById('mission-mission-play-stop-btn').style.display = 'inline-block';
          startMissionMissionPlaybackProgressInterval();
        },
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.ENDED) {
            stopMissionMissionPlayback();
            missionMissionYouTubePlayer = null;
          }
          if (e.data === YT.PlayerState.PAUSED) {
            document.getElementById('mission-mission-play-btn').style.display = 'inline-block';
            document.getElementById('mission-mission-play-pause-btn').style.display = 'none';
          }
          if (e.data === YT.PlayerState.PLAYING) {
            document.getElementById('mission-mission-play-btn').style.display = 'none';
            document.getElementById('mission-mission-play-pause-btn').style.display = 'inline-block';
            document.getElementById('mission-mission-play-stop-btn').style.display = 'inline-block';
          }
        },
        onError: (e) => {
          resetMissionMissionPlaybackUI();
          missionMissionYouTubePlayer = null;
          const msg = (e.data === 150 || e.data === 101)
            ? '이 영상은 비공개로 설정되어 있어 재생할 수 없습니다.'
            : (e.data === 100) ? '영상을 찾을 수 없습니다.' : '유튜브 영상을 재생할 수 없습니다.';
          alert(msg);
        }
      }
    });
  };
  if (window.YT && window.YT.Player) {
    setupPlayer();
  } else {
    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prevReady === 'function') prevReady();
      setupPlayer();
    };
  }
}

// 레코딩 모드: 녹음 중에도 음원이 계속 재생되도록 유지 (브라우저가 일시정지했을 수 있음)
function resumeMissionPlaybackIfWasPlaying() {
  if (missionYouTubePlayer) {
    try {
      const state = missionYouTubePlayer.getPlayerState();
      if (state === YT.PlayerState.PAUSED) {
        missionYouTubePlayer.playVideo();
        document.getElementById('mission-play-btn')?.style.setProperty('display', 'none');
        document.getElementById('mission-play-pause-btn')?.style.setProperty('display', 'inline-block');
        document.getElementById('mission-play-stop-btn')?.style.setProperty('display', 'inline-block');
        startPlaybackProgressInterval();
        return;
      }
    } catch { /* ignore */ }
  }
  if (missionPlaybackAudio && missionPlaybackAudio.paused && missionPlaybackAudio.currentTime > 0) {
    missionPlaybackAudio.play();
    document.getElementById('mission-play-btn')?.style.setProperty('display', 'none');
    document.getElementById('mission-play-pause-btn')?.style.setProperty('display', 'inline-block');
    document.getElementById('mission-play-stop-btn')?.style.setProperty('display', 'inline-block');
    startPlaybackProgressInterval();
    return;
  }
  if (missionMissionYouTubePlayer) {
    try {
      const state = missionMissionYouTubePlayer.getPlayerState();
      if (state === YT.PlayerState.PAUSED) {
        missionMissionYouTubePlayer.playVideo();
        document.getElementById('mission-mission-play-btn')?.style.setProperty('display', 'none');
        document.getElementById('mission-mission-play-pause-btn')?.style.setProperty('display', 'inline-block');
        document.getElementById('mission-mission-play-stop-btn')?.style.setProperty('display', 'inline-block');
        startMissionMissionPlaybackProgressInterval();
        return;
      }
    } catch { /* ignore */ }
  }
  if (missionMissionPlaybackAudio && missionMissionPlaybackAudio.paused && missionMissionPlaybackAudio.currentTime > 0) {
    missionMissionPlaybackAudio.play();
    document.getElementById('mission-mission-play-btn')?.style.setProperty('display', 'none');
    document.getElementById('mission-mission-play-pause-btn')?.style.setProperty('display', 'inline-block');
    document.getElementById('mission-mission-play-stop-btn')?.style.setProperty('display', 'inline-block');
    startMissionMissionPlaybackProgressInterval();
  }
}

async function toggleMissionRecording() {
  if (recordingState.isRecording) return;
  try {
    // 맥북 크롬: 마이크 후처리 최소화해 재생·녹음 동시 시 끊김 완화
    const audioConstraints = {
      audio: {
        echoCancellation: false,
        autoGainControl: false,
        noiseSuppression: false,
      },
    };
    const stream = await navigator.mediaDevices.getUserMedia(audioConstraints).catch(() =>
      navigator.mediaDevices.getUserMedia({ audio: true })
    );
    // 녹음 볼륨 증폭: Web Audio API GainNode로 마이크 입력 키움
    let streamToRecord = stream;
    let recordCtx = null;
    let recordSource = null;
    try {
      recordCtx = new (window.AudioContext || window.webkitAudioContext)();
      recordSource = recordCtx.createMediaStreamSource(stream);
      const gainNode = recordCtx.createGain();
      gainNode.gain.value = 2.2;
      const dest = recordCtx.createMediaStreamDestination();
      recordSource.connect(gainNode);
      gainNode.connect(dest);
      streamToRecord = dest.stream;
      recordingState.recordAudioContext = recordCtx;
      recordingState.recordSource = recordSource;
      if (recordCtx.state === 'suspended') await recordCtx.resume();
    } catch (_) {
      recordingState.recordAudioContext = null;
      recordingState.recordSource = null;
    }
    // 맥북/크롬 끊김 방지: 코덱·비트레이트·timeslice로 인코딩/콜백 부하 감소
    let mediaRecorder;
    try {
      const mimeOpt = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      // 비트레이트 낮추면 인코딩 부하 감소(맥북에서 끊김 완화)
      const options = mimeOpt ? { mimeType: mimeOpt, audioBitsPerSecond: 96000 } : { audioBitsPerSecond: 96000 };
      mediaRecorder = new MediaRecorder(streamToRecord, options);
    } catch (_) {
      mediaRecorder = new MediaRecorder(streamToRecord);
    }
    const chunks = [];
    mediaRecorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mediaRecorder.onstop = () => {
      const mime = mediaRecorder.mimeType || 'audio/webm';
      const blob = new Blob(chunks, { type: mime });
      window.lastRecordedBlob = blob;
      window.lastRecordedUrl = URL.createObjectURL(blob);
      stream.getTracks().forEach(t => t.stop());
      if (recordingState.recordSource) {
        try { recordingState.recordSource.disconnect(); } catch (_) {}
        recordingState.recordSource = null;
      }
      if (recordingState.recordAudioContext) {
        try { recordingState.recordAudioContext.close(); } catch (_) {}
        recordingState.recordAudioContext = null;
      }
      openRecordSaveOptionsForMission();
    };
    // 2초 단위로 수집해 맥북 크롬에서 ondataavailable 호출 최소화
    try {
      mediaRecorder.start(2000);
    } catch (_) {
    mediaRecorder.start();
    }
    recordingState.mediaRecorder = mediaRecorder;
    recordingState.chunks = chunks;
    recordingState.isRecording = true;
    recordingStartTime = Date.now();
    document.getElementById('mission-recording-indicator')?.classList.remove('hidden');
    document.getElementById('mission-record-btn').style.display = 'none';
    document.getElementById('mission-pause-btn').style.display = 'inline-block';
    document.getElementById('mission-stop-btn').style.display = 'inline-block';
    missionRecordingTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
      document.getElementById('mission-rec-time').textContent = formatTime(elapsed) + ' | 10:00';
    }, 1000);
    // 녹음 중에는 진행바 타이머를 걸지 않음(위에서 이미 clear만 함)
    if (missionMissionPlaybackProgressInterval) {
      clearInterval(missionMissionPlaybackProgressInterval);
      missionMissionPlaybackProgressInterval = null;
    }
    if (missionPlaybackProgressInterval) {
      clearInterval(missionPlaybackProgressInterval);
      missionPlaybackProgressInterval = null;
    }
    // 레코딩 모드: 음원이 재생 중이었는데 브라우저가 일시정지했을 수 있음 → 다시 재생
    setTimeout(resumeMissionPlaybackIfWasPlaying, 150);
  } catch (err) {
    alert('마이크 접근 권한이 필요합니다.');
  }
}

function pauseMissionRecording() {
  if (recordingState.mediaRecorder && recordingState.isRecording) {
    recordingState.mediaRecorder.pause();
    recordingState.isRecording = false;
    document.getElementById('mission-recording-indicator')?.classList.add('hidden');
    document.getElementById('mission-pause-btn').style.display = 'none';
    document.getElementById('mission-record-btn').style.display = 'inline-block';
    document.getElementById('mission-record-btn').textContent = '▶';
    if (missionRecordingTimer) clearInterval(missionRecordingTimer);
  }
}

function stopMissionRecording() {
  if (recordingState.mediaRecorder) {
    recordingState.mediaRecorder.stop();
    recordingState.mediaRecorder = null;
    recordingState.isRecording = false;
    document.getElementById('mission-recording-indicator')?.classList.add('hidden');
    document.getElementById('mission-pause-btn').style.display = 'none';
    document.getElementById('mission-stop-btn').style.display = 'none';
    document.getElementById('mission-record-btn').style.display = 'inline-block';
    document.getElementById('mission-record-btn').textContent = '●';
    if (missionRecordingTimer) clearInterval(missionRecordingTimer);
    // **1 칸(본활동) 음원 재생 중이면 녹음 정지 시 음원도 함께 정지
    try { stopMissionMissionPlayback(); } catch (_) {}
    try { stopMissionPlayback(); } catch (_) {}
  }
}

function saveMissionRecordingForMyContents() {
  const addRecording = (recordingUrl) => {
    if (!recordingUrl) return;
    const recordings = getRecordings();
    const mission = MISSION_DATA[currentMissionId] || {};
    const now = new Date();
    const dateStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
    let title = mission.title || `미션 ${currentMissionId || ''}`;
    if (currentMissionViewMode === 'lookingback') {
      title = title + ' - Looking Back';
    }
    recordings.unshift({
      id: Date.now(),
      source: 'mission',
      missionId: currentMissionId,
      title,
      description: mission.subtitle || '',
      audioUrl: recordingUrl,
      date: dateStr,
      mode: partActivityMode,
      part: partActivityPart,
      viewMode: currentMissionViewMode,
      memo: '',
    });
    setData(STORAGE_KEYS.recordings, recordings);
    // 레코딩 모드: 녹음 저장 후 활동완료 버튼 활성화 (본활동·돌아보기 공통)
    if (partActivityMode === 'recording') {
      missionRecordingSavedThisSession = true;
      updateMissionAudioBoxButtons();
      updateMissionRecordingPreview();
    }
  };

  if (window.lastRecordedBlob && (!window.lastRecordedUrl || !String(window.lastRecordedUrl).startsWith('data:'))) {
    try {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result;
        window.lastRecordedUrl = dataUrl;
        addRecording(dataUrl);
      };
      reader.readAsDataURL(window.lastRecordedBlob);
    } catch {
      addRecording(window.lastRecordedUrl || null);
    }
  } else {
    addRecording(window.lastRecordedUrl || null);
  }
}

// 파트 활동 화면
let partActivityMode = 'recording';
let partActivityPart = 1;
let partTouchStartX = null;
let partTouchStartY = null;
let partTouchStartTime = 0;
let partMouseStartX = null;
let partMouseStartY = null;
let partMouseStartTime = 0;

function openPartActivity(mode, part) {
  // 첫 활동 기준일 기록 (첫 파트 화면 진입을 '첫 활동'으로 간주)
  try {
    const profile = getAuthProfile();
    if (profile && !profile.firstActivityAt) {
      profile.firstActivityAt = Date.now();
      saveAuthProfile(profile);
    }
  } catch {}
  partActivityMode = mode;
  partActivityPart = part;
  renderPartActivity();
  navigate('part-activity');
}

function onPartActivityTouchStart(e) {
  try {
    if (currentScreen !== 'part-activity') return;
    if (!e.touches || e.touches.length !== 1) return;
    const t = e.touches[0];
    partTouchStartX = t.clientX;
    partTouchStartY = t.clientY;
    partTouchStartTime = Date.now();
  } catch {}
}

function onPartActivityTouchEnd(e) {
  try {
    if (currentScreen !== 'part-activity') return;
    if (partTouchStartX == null || partTouchStartY == null) return;
    const t = (e.changedTouches && e.changedTouches[0]) || null;
    if (!t) return;
    const dx = t.clientX - partTouchStartX;
    const dy = t.clientY - partTouchStartY;
    const dt = Date.now() - partTouchStartTime;
    partTouchStartX = partTouchStartY = null;
    partTouchStartTime = 0;
    // 가로 스와이프만 인식 (짧고 빠른 제스처)
    if (dt > 700) return;
    if (Math.abs(dx) < 40) return;
    if (Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) {
      goToPartActivityNext();
    } else {
      goToPartActivityPrev();
    }
  } catch {}
}

function onPartActivityMouseDown(e) {
  try {
    if (currentScreen !== 'part-activity') return;
    if (e.button !== 0) return; // left button only
    partMouseStartX = e.clientX;
    partMouseStartY = e.clientY;
    partMouseStartTime = Date.now();
    // PC: 드래그 후 영역 밖에서 놓아도 인식하도록 document에 mouseup 한 번만 등록
    document.addEventListener('mouseup', onPartActivityMouseUpDocument, { once: true });
  } catch {}
}

function onPartActivityMouseUpDocument(e) {
  try {
    if (partMouseStartX == null || partMouseStartY == null) return;
    const dx = e.clientX - partMouseStartX;
    const dy = e.clientY - partMouseStartY;
    const dt = Date.now() - partMouseStartTime;
    partMouseStartX = partMouseStartY = null;
    partMouseStartTime = 0;
    if (currentScreen !== 'part-activity') return;
    if (dt > 700) return;
    if (Math.abs(dx) < 40) return;
    if (Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) {
      goToPartActivityNext();
    } else {
      goToPartActivityPrev();
    }
  } catch {}
}

function onPartActivityMouseUp(e) {
  try {
    if (currentScreen !== 'part-activity') return;
    if (partMouseStartX == null || partMouseStartY == null) return;
    const dx = e.clientX - partMouseStartX;
    const dy = e.clientY - partMouseStartY;
    const dt = Date.now() - partMouseStartTime;
    partMouseStartX = partMouseStartY = null;
    partMouseStartTime = 0;
    if (dt > 700) return;
    if (Math.abs(dx) < 40) return;
    if (Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) {
      goToPartActivityNext();
    } else {
      goToPartActivityPrev();
    }
  } catch {}
}

function goToPartActivityPrev() {
  if (partActivityPart > 1) {
    partActivityPart--;
    renderPartActivity();
  }
}

function goToPartActivityNext() {
  if (partActivityPart < 4) {
    partActivityPart++;
    renderPartActivity();
  }
}

function renderPartActivity() {
  const titleEl = document.getElementById('part-activity-title');
  const gridEl = document.getElementById('part-activity-grid');
  if (!titleEl || !gridEl) return;

  const modeLabel = { recording: '레코딩', writing: '라이팅', drawing: '드로잉' }[partActivityMode] || '';
  titleEl.textContent = modeLabel ? `${modeLabel} · Part ${partActivityPart}` : `Part ${partActivityPart}`;
  titleEl.className = `part-title-badge mode-${partActivityMode}`;

  // 닉네임/프로필 인삿말을 마이페이지와 동일한 데이터로 갱신
  applyPartGreetingHeader();

  const modeData = PART_ACTIVITIES[partActivityMode];
  const activities = (modeData && modeData[partActivityPart]) || PART_ACTIVITIES.recording[1];

  const getMissionId = (a) => {
    if (a.label === 'ABOUT ME' && a.sub) return 'ABOUT ME';
    if (a.label && MISSION_DATA[a.label]) return a.label;
    if (a.sub && MISSION_DATA[a.sub]) return a.sub;
    return a.label || a.sub || 'LETTER';
  };
  const getCardAction = (a) => {
    if (a.style === 'current') return "navigate('recording-home')";
    // relaxingFor가 있는 카드(digit3/4/5 = 릴렉싱)
    if (a.relaxingFor !== undefined) {
      const parentId = a.relaxingFor.replace(/'/g, "\\'");
      const idx = a.relaxingIdx || 0;
      const thumbArg = a.thumb ? ("'" + a.thumb.replace(/'/g, "\\'") + "'") : "''";
      return `openRelaxingMission('${parentId}', ${idx}, ${thumbArg})`;
    }
    // lookingBackFor가 있는 카드(digit2 = 돌아보기)는 phase 1로 열기
    if (a.lookingBackFor) {
      const refId = a.lookingBackFor.replace(/'/g, "\\'");
      const thumbArg = a.thumb ? ("'" + a.thumb.replace(/'/g, "\\'") + "'") : "''";
      return `openMissionDetail('${refId}', ${thumbArg}, 1)`;
    }
    const id = getMissionId(a);
    const thumbArg = a.thumb ? ("'" + a.thumb.replace(/'/g, "\\'") + "'") : "''";
    return "openMissionDetail('" + id.replace(/'/g, "\\'") + "', " + thumbArg + ")";
  };

  const basePath = ASSET_PATHS[partActivityMode] || 'assets/';

  // 전체 콘텐츠 표시 (current 제외), ㄹ자 배치
  const items = activities.filter(a => a.style !== 'current');
  const numRows = Math.ceil(items.length / 3) || 1;

  // ㄹ자 그리드 위치 생성: 홀수행 L→R, 짝수행 R→L
  const gridPos = [];
  for (let r = 0; r < numRows; r++) {
    const baseRow = 2 * r + 1;
    const cols = r % 2 === 0 ? [1, 3, 5] : [5, 3, 1];
    const rowItems = items.slice(r * 3, r * 3 + 3);
    rowItems.forEach((_, c) => gridPos.push([cols[c], baseRow]));
  }

  const escHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const makeCard = (a, gridCol, gridRow) => {
    const isCompleted = a.style === 'completed';
    const userCompleted = isActivityCompletedInGrid(a);
    const rawBg = isCompleted ? '#fff' : (a.bg || '#fff');
    let bgStyle = typeof rawBg === 'string' && rawBg.startsWith('linear') ? `background:${rawBg}` : `background:${rawBg}`;
    if (!isCompleted && a.bgSize) bgStyle += `; background-size:${a.bgSize}`;
    const borderLeaf = a.border === 'leaf' ? ' activity-card-leaf' : '';
    const onClick = getCardAction(a);
    const thumbSrc = a.thumb ? basePath + a.thumb : '';
    const showCheck = isCompleted || userCompleted;
    const thumbSrcEnc = thumbSrc ? encodeURI(thumbSrc).replace(/"/g, '&quot;') : '';
    const thumbAlt = [a.label, a.sub].filter(Boolean).join(' ').replace(/"/g, '&quot;');
    const thumbCaption = (thumbSrcEnc && a.sub && a.label && a.relaxingFor !== undefined) ? `
        <div class="activity-thumb-caption">
          <span class="activity-thumb-caption__line1">${escHtml(a.label)}</span>
          <span class="activity-thumb-caption__line2">${escHtml(a.sub)}</span>
        </div>` : '';
    const state = getModeCouponState();
    const isUnlocked = !!(state && state[partActivityMode]);
    let showFreeBadge = false;
    if (!isUnlocked) {
      // 릴렉싱 카드: (writing) 특정 카드 라벨은 무료 배지 표시
      if (a.relaxingFor !== undefined) {
        const freeRelaxingLabels = new Set(['THINGS', 'ANY', 'COMPLETE', 'TRASHCAN']);
        if (partActivityMode === 'writing' && freeRelaxingLabels.has(a.label)) {
          showFreeBadge = true;
        }
      } else {
        // 메인/돌아보기 카드: 기존 무료 판정 사용
        const freeMissionId = a.lookingBackFor ? a.lookingBackFor : getMissionId(a);
        showFreeBadge = isFreeMission(partActivityMode, partActivityPart, freeMissionId, 'main', 0);
      }
    }
    return `
      <div class="activity-card activity-card-${a.style}${borderLeaf}${showFreeBadge ? ' has-free-badge' : ''}" style="${bgStyle}; grid-column:${gridCol}; grid-row:${gridRow};" onclick="${onClick}">
        ${thumbSrcEnc ? `<img class="activity-thumb" src="${thumbSrcEnc}" alt="${thumbAlt}">` : ''}
        ${thumbCaption}
        ${showFreeBadge ? '<span class="free-badge">FREE</span>' : ''}
        ${showCheck ? '<span class="completed-check">✓</span>' : ''}
        ${!thumbSrc && a.icon === '🍃' ? '<span class="activity-icon">🍃</span>' : ''}
        ${!thumbSrc && a.icon === 'grid' ? '<span class="activity-grid-icon">▦</span>' : ''}
        ${!thumbSrc && a.label ? `<span class="activity-label">${a.label}</span>` : ''}
        ${!thumbSrc && a.sub ? `<span class="activity-sub">${a.sub}</span>` : ''}
        ${!thumbSrc && a.extra ? `<span class="activity-extra">${a.extra}</span>` : ''}
      </div>
    `;
  };

  // 연결선: 가로(같은 행), 세로(행 사이)
  // ㄹ자 배치: 짝수행 L→R(cols 1,3,5), 홀수행 R→L(cols 5,3,1)
  const connectors = [];
  for (let r = 0; r < numRows; r++) {
    const baseRow = 2 * r + 1;
    const rowLen = Math.min(3, items.length - r * 3);
    // 가로: 짝수행은 col 2(1-3), 4(3-5) / 홀수행은 col 4(5-3), 2(3-1)
    if (rowLen > 1) {
      if (r % 2 === 0) {
        connectors.push(`<div class="grid-connector grid-connector-h" style="grid-column:2; grid-row:${baseRow};"></div>`);
        if (rowLen > 2) connectors.push(`<div class="grid-connector grid-connector-h" style="grid-column:4; grid-row:${baseRow};"></div>`);
      } else {
        connectors.push(`<div class="grid-connector grid-connector-h" style="grid-column:4; grid-row:${baseRow};"></div>`);
        if (rowLen > 2) connectors.push(`<div class="grid-connector grid-connector-h" style="grid-column:2; grid-row:${baseRow};"></div>`);
      }
    }
    // 세로: 현재 행이 3개 꽉 찼을 때만 (끝 카드가 모서리에 있음). 다음 행 개수 무관.
    if (r < numRows - 1 && rowLen === 3) {
      const lastCol = r % 2 === 0 ? 5 : 1;
      connectors.push(`<div class="grid-connector grid-connector-v" style="grid-column:${lastCol}; grid-row:${baseRow + 1};"></div>`);
    }
  }

  gridEl.style.gridTemplateRows = Array.from({ length: 2 * numRows - 1 }, (_, i) => i % 2 === 0 ? '1fr' : '14px').join(' ');
  const cardsHtml = items.map((a, i) => makeCard(a, gridPos[i][0], gridPos[i][1])).join('');
  gridEl.innerHTML = cardsHtml + connectors.join('');
}

// 녹음 기능
async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    const chunks = [];

    mediaRecorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      const url = URL.createObjectURL(blob);
      window.lastRecordedBlob = blob;
      window.lastRecordedUrl = url;
      stream.getTracks().forEach(t => t.stop());
      openRecordSaveOptionsForContent();
    };

    mediaRecorder.start();
    recordingState.mediaRecorder = mediaRecorder;
    recordingState.chunks = chunks;
    recordingState.isRecording = true;
    recordingStartTime = Date.now();

    document.getElementById('record-btn').classList.add('hidden');
    document.getElementById('pause-btn').classList.remove('hidden');
    document.getElementById('recording-indicator').classList.remove('hidden');

    // 파형 애니메이션
    startWaveformAnimation();

    recordingTimerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
      document.getElementById('recording-timer').textContent = formatTime(elapsed);
    }, 1000);
  } catch (err) {
    alert('마이크 접근 권한이 필요합니다.');
  }
}

function pauseRecording() {
  if (recordingState.mediaRecorder && recordingState.isRecording) {
    recordingState.mediaRecorder.pause();
    recordingState.isRecording = false;
    recordingPausedElapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    clearInterval(recordingTimerInterval);
    document.getElementById('pause-btn').classList.add('hidden');
    document.getElementById('record-btn').classList.remove('hidden');
    document.getElementById('record-btn').textContent = '● 이어서 녹음';
    document.getElementById('recording-indicator').classList.add('hidden');
    stopWaveformAnimation();
  }
}

function resumeRecording() {
  if (recordingState.mediaRecorder && !recordingState.isRecording) {
    recordingState.mediaRecorder.resume();
    recordingState.isRecording = true;
    recordingStartTime = Date.now() - recordingPausedElapsed * 1000;
    document.getElementById('record-btn').classList.add('hidden');
    document.getElementById('record-btn').textContent = '● 녹음';
    document.getElementById('pause-btn').classList.remove('hidden');
    document.getElementById('recording-indicator').classList.remove('hidden');
    startWaveformAnimation();
    recordingTimerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
      document.getElementById('recording-timer').textContent = formatTime(elapsed);
    }, 1000);
  }
}

function stopRecording() {
  if (recordingState.mediaRecorder) {
    recordingState.mediaRecorder.stop();
    recordingState.mediaRecorder = null;
    recordingState.isRecording = false;
    recordingPausedElapsed = 0;
    clearInterval(recordingTimerInterval);
    document.getElementById('pause-btn').classList.add('hidden');
    document.getElementById('record-btn').classList.remove('hidden');
    document.getElementById('record-btn').textContent = '● 녹음';
    document.getElementById('play-recorded-btn').classList.remove('hidden');
    document.getElementById('recording-indicator').classList.add('hidden');
    stopWaveformAnimation();
    openRecordSaveOptionsForContent();
  }
}

function startWaveformAnimation() {
  const waveform = document.getElementById('waveform');
  waveform.innerHTML = Array(20).fill(0).map(() =>
    `<div class="wave-bar" style="height: ${20 + Math.random() * 30}px"></div>`
  ).join('');
}

function stopWaveformAnimation() {
  const waveform = document.getElementById('waveform');
  waveform.innerHTML = '';
}

let pendingFileSaveTask = null;

function runWithFileSaveHint(task) {
  const skip = !!getData(STORAGE_KEYS.fileSaveHintDisabled);
  if (skip) {
    task();
    return;
  }
  pendingFileSaveTask = task;
  const modal = document.getElementById('file-save-hint-modal');
  const chk = document.getElementById('file-save-hint-dont-ask');
  if (chk) chk.checked = false;
  if (modal) modal.classList.remove('hidden');
}

function confirmFileSaveHint() {
  const modal = document.getElementById('file-save-hint-modal');
  const chk = document.getElementById('file-save-hint-dont-ask');
  if (chk && chk.checked) {
    setData(STORAGE_KEYS.fileSaveHintDisabled, true);
  }
  if (modal) modal.classList.add('hidden');
  const task = pendingFileSaveTask;
  pendingFileSaveTask = null;
  if (typeof task === 'function') {
    task();
  }
}

function downloadLastRecording(filenamePrefix) {
  const blob = window.lastRecordedBlob;
  if (!blob) {
    alert('저장할 녹음이 없어.');
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const safePrefix = (filenamePrefix || 'recording').replace(/[^\w\-]+/g, '_');
  a.href = url;
  a.download = `${safePrefix}_${ts}.webm`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function downloadLastRecordingFromContent() {
  const contentId = window.currentContentId;
  const contents = getContents();
  const content = contents.find(c => c.id === contentId);
  const prefix = content?.title || 'recording';
  downloadLastRecording(prefix);
}

function downloadLastRecordingFromMission() {
  const mission = MISSION_DATA[currentMissionId] || {};
  const prefix = mission.title || currentMissionId || 'recording';
  downloadLastRecording(prefix);
}

function playLastRecording() {
  if (!window.lastRecordedUrl) {
    alert('재생할 녹음이 없어.');
    return;
  }
  try {
    if (lastRecordedAudio) {
      lastRecordedAudio.pause();
      lastRecordedAudio = null;
    }
    lastRecordedAudio = new Audio(window.lastRecordedUrl);
    lastRecordedAudio.onended = () => { lastRecordedAudio = null; };
    lastRecordedAudio.play();
  } catch (e) {
    console.error('playLastRecording error', e);
  }
}

function openRecordSaveOptions() {
  // context: content / mission
  const modal = document.getElementById('record-save-options-modal');
  if (modal) modal.classList.remove('hidden');
}

function openRecordSaveOptionsForContent() {
  recordSaveContext = 'content';
  const modal = document.getElementById('record-save-options-modal');
  if (modal) modal.classList.remove('hidden');
}

function openRecordSaveOptionsForMission() {
  recordSaveContext = 'mission';
  const modal = document.getElementById('record-save-options-modal');
  if (modal) modal.classList.remove('hidden');
}

function recordReviewBeforeSave() {
  const textEl = document.getElementById('record-save-text');
  const mainBtns = document.getElementById('record-save-main-buttons');
  const previewBtns = document.getElementById('record-preview-buttons');
  const previewSection = document.getElementById('record-preview-section');
  const audioEl = document.getElementById('record-preview-audio');
  if (textEl) textEl.textContent = '저장할까요? 저장된 내용은 내콘텐츠에서도 확인하고 공유할 수 있어요';
  if (mainBtns) mainBtns.classList.add('hidden');
  if (previewBtns) previewBtns.classList.remove('hidden');
  if (previewSection) previewSection.classList.remove('hidden');
  if (audioEl && window.lastRecordedUrl) {
    audioEl.src = window.lastRecordedUrl;
    audioEl.currentTime = 0;
    audioEl.play().catch(() => {});
  }
}

function recordSaveNow() {
  const modal = document.getElementById('record-save-options-modal');
  if (modal) modal.classList.add('hidden');
  if (recordSaveContext === 'content') {
      saveContent();
      markRecordingSavedButtons();
  } else if (recordSaveContext === 'mission') {
      saveMissionRecordingForMyContents();
      markRecordingSavedButtons();
  }
}

function recordConfirmSave() {
  if (recordSaveContext === 'content') {
      saveContent();
      markRecordingSavedButtons();
  } else if (recordSaveContext === 'mission') {
      saveMissionRecordingForMyContents();
      markRecordingSavedButtons();
  }
  closeRecordSaveOptions();
}

function closeRecordSaveOptions() {
  const modal = document.getElementById('record-save-options-modal');
  if (modal) modal.classList.add('hidden');
  const mainBtns = document.getElementById('record-save-main-buttons');
  const previewBtns = document.getElementById('record-preview-buttons');
  const textEl = document.getElementById('record-save-text');
  const previewSection = document.getElementById('record-preview-section');
  const audioEl = document.getElementById('record-preview-audio');
  if (mainBtns) mainBtns.classList.remove('hidden');
  if (previewBtns) previewBtns.classList.add('hidden');
  if (textEl) textEl.textContent = '녹음을 어떻게 저장할까?';
  if (previewSection) previewSection.classList.add('hidden');
  if (audioEl) {
    try {
      audioEl.pause();
      audioEl.currentTime = 0;
    } catch {}
  }
  if (lastRecordedAudio) {
    try { lastRecordedAudio.pause(); } catch {}
    lastRecordedAudio = null;
  }
  isRecordPreviewPlaying = false;
  const btn = document.getElementById('record-preview-play-btn');
  if (btn) btn.textContent = '▶ 재생';
}

function markRecordingSavedButtons() {
  const dlBtn = document.getElementById('record-download-btn');
  if (dlBtn) {
    dlBtn.textContent = '녹음 저장 완료';
    dlBtn.disabled = true;
    dlBtn.style.opacity = '0.5';
    dlBtn.style.pointerEvents = 'none';
  }
}

// 저장
function saveContent() {
  const contentId = window.currentContentId;
  const hasRecorded = !!window.lastRecordedBlob;

  if (!hasRecorded) {
    document.getElementById('unrecorded-modal').classList.remove('hidden');
    return;
  }

  performSave(contentId);
}

function confirmSaveAnyway() {
  document.getElementById('unrecorded-modal').classList.add('hidden');
  performSave(window.currentContentId);
}

function closeUnrecordedModal() {
  document.getElementById('unrecorded-modal').classList.add('hidden');
}

function performSave(contentId) {
  const finalizeSave = (recordingUrl) => {
    const contents = getContents();
    const content = contents.find(c => c.id === contentId);
    if (content && recordingUrl) {
      content.recordings = [recordingUrl];
      content.hasUnrecorded = false;
      setData(STORAGE_KEYS.contents, contents);
    }

    if (recordingUrl) {
      const recordings = getRecordings();
      const now = new Date();
      const dateStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
      recordings.unshift({
        id: Date.now(),
        source: 'content',
        contentId,
        title: content?.title || '콘텐츠',
        description: content?.description || content?.displayTitle || '',
        audioUrl: recordingUrl,
        date: dateStr,
      });
      setData(STORAGE_KEYS.recordings, recordings);
    }

    const activities = getActivities();
    const activity = { id: Date.now(), contentId, title: content?.title || '콘텐츠', photos: [] };
    activities.unshift(activity);
    setData(STORAGE_KEYS.activities, activities);
    document.getElementById('save-modal').classList.remove('hidden');
  };

  if (window.lastRecordedBlob && (!window.lastRecordedUrl || !String(window.lastRecordedUrl).startsWith('data:'))) {
    try {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result;
        window.lastRecordedUrl = dataUrl;
        finalizeSave(dataUrl);
      };
      reader.readAsDataURL(window.lastRecordedBlob);
    } catch {
      finalizeSave(window.lastRecordedUrl || null);
    }
  } else {
    finalizeSave(window.lastRecordedUrl || null);
  }
}

function goToPostCreate() {
  document.getElementById('save-modal').classList.add('hidden');
  const contentId = window.currentContentId;
  const content = getContents().find(c => c.id === contentId);
  if (content) {
    document.getElementById('post-title').value = content.title;
  }
  navigate('post-create');
}

function goToHome() {
  document.getElementById('save-modal').classList.add('hidden');
  const target = (currentScreen === 'mission-detail' || window.lastSaveFromMission) ? 'part-activity' : 'recording-home';
  window.lastSaveFromMission = false;
  navigate(target);
}

function completeMissionActivity() {
  saveLastSessionCompleted(partActivityMode, partActivityPart, currentMissionId, currentMissionViewMode, currentRelaxingIdx);
  markMissionCompleted();
  window.lastSaveFromMission = true;
  setMissionDetailCompletedState(true);
  // 활동 완료 후 엔딩 멘트 안내
  try {
    playEndingAfterMissionComplete();
  } catch {}
}

function redoMissionActivity() {
  unmarkMissionCompleted();
  // 미션 상세 화면 전체를 다시 그려서
  // 오디오 완료 상태, 버튼, 마음톡/릴렉싱 표시를 모두 초기화
  renderMissionDetail();
}

function setMissionDetailCompletedState(completed) {
  const photoBtn = document.getElementById('mission-photo-btn');
  const completeBtn = document.getElementById('mission-complete-activity-btn');
  const shareBtn = document.getElementById('mission-share-btn');
  const audioCompleteBtns = [
    document.getElementById('mission-play-complete-btn'),
    document.getElementById('mission-mission-complete-btn'),
    document.getElementById('mission-recording-complete-btn'),
  ].filter(Boolean);
  if (completed) {
    if (photoBtn) {
      // 레코딩 모드에서는 녹음 저장 버튼은 계속 활성로 두고,
      // 라이팅/드로잉 모드의 사진촬영만 비활성화
      if (partActivityMode === 'writing' || partActivityMode === 'drawing') {
        photoBtn.disabled = true;
        photoBtn.style.opacity = '0.5';
        photoBtn.style.pointerEvents = 'none';
      }
    }
    audioCompleteBtns.forEach(btn => {
      btn.disabled = true;
      btn.style.opacity = '0.5';
      btn.style.pointerEvents = 'none';
    });
    if (completeBtn) {
      completeBtn.textContent = '한번더 활동';
      completeBtn.disabled = false;
      completeBtn.style.opacity = '';
      completeBtn.style.pointerEvents = '';
      completeBtn.onclick = () => redoMissionActivity();
    }
    if (shareBtn) {
      shareBtn.disabled = false;
      shareBtn.style.opacity = '';
      shareBtn.style.pointerEvents = '';
    }
  } else {
    if (photoBtn) updateMissionPhotoButton();
    audioCompleteBtns.forEach(btn => {
      btn.disabled = false;
      btn.style.opacity = '';
      btn.style.pointerEvents = '';
    });
    updateMissionAudioBoxButtons();
    if (completeBtn) {
      completeBtn.textContent = '활동완료';
      completeBtn.disabled = false;
      completeBtn.style.opacity = '';
      completeBtn.style.pointerEvents = '';
      completeBtn.onclick = () => completeMissionActivity();
    }
    if (shareBtn) {
      shareBtn.disabled = false;
      shareBtn.style.opacity = '';
      shareBtn.style.pointerEvents = '';
    }
  }
}

function getShareLinkUrl() {
  const url = getData(STORAGE_KEYS.shareLink);
  if (url && typeof url === 'string' && url.trim()) return url.trim();
  return 'https://cafe.naver.com/f-e/cafes/31681312/menus/4?viewType=L';
}

function getCafeShareUrlForPhoto(photo) {
  if (photo && photo.mode === 'drawing') {
    return 'https://cafe.naver.com/f-e/cafes/31681312/menus/3?viewType=L';
  }
  return getShareLinkUrl();
}

function sharePhotoToCafe(photoId) {
  const photos = getMissionPhotos();
  const photo = photos.find(p => String(p.id) === String(photoId));
  if (!photo || !photo.photoDataUrl) {
    alert('사진을 찾을 수 없어요.');
    return;
  }
  openSharePhotoOptionsModal(photo);
}

let __sharePhotoOptionsPending = null;
let __sharePhotoPanX = 0;
let __sharePhotoPanY = 0;
let __sharePhotoDragging = false;
let __sharePhotoDragStartX = 0;
let __sharePhotoDragStartY = 0;
let __sharePhotoPanStartX = 0;
let __sharePhotoPanStartY = 0;
let __sharePhotoBaseScale = 1; // 슬라이더 50일 때의 기준 스케일

function openSharePhotoOptionsModal(photo) {
  __sharePhotoOptionsPending = photo;
  const row = document.getElementById('share-photo-profile-size-row');
  if (row) row.style.display = getUserProfileImage() ? '' : 'none';
  document.getElementById('share-photo-flip').checked = false;
  const sizeEl = document.getElementById('share-photo-size');
  const sizeValueEl = document.getElementById('share-photo-size-value');
  if (sizeEl) sizeEl.value = '50';
  if (sizeValueEl) sizeValueEl.textContent = '50';
  __sharePhotoBaseScale = 1; // 기본 1배 확대를 50으로 맞춤
  document.getElementById('share-photo-ratio').value = 'original';
  document.getElementById('share-photo-profile-size').value = 'medium';
  // 미리보기 초기화
  const previewImg = document.getElementById('share-photo-preview-img');
  if (previewImg && photo.photoDataUrl) {
    previewImg.src = photo.photoDataUrl;
    __sharePhotoPanX = 0;
    __sharePhotoPanY = 0;
    previewImg.style.transform = 'translate(-50%, -50%) translate(0px, 0px) scale(1) scaleX(1)';
  }
  // 슬라이더/옵션 변경 시 실시간 미리보기 반영
  const sizeSlider = document.getElementById('share-photo-size');
  const ratioSelect = document.getElementById('share-photo-ratio');
  const flipCheckbox = document.getElementById('share-photo-flip');
  const applyPreview = () => {
    const img = document.getElementById('share-photo-preview-img');
    if (!img) return;
    const sizeVal = document.getElementById('share-photo-size')?.value ?? '50';
    const ratioVal = document.getElementById('share-photo-ratio')?.value ?? 'original';
    const flip = document.getElementById('share-photo-flip')?.checked ?? false;
    const valNum = parseInt(sizeVal, 10) || 50;
    const rel = valNum / 50; // 50이 기준, 100이면 2배, 25이면 0.5배
    img.style.transform =
      `translate(-50%, -50%) translate(${__sharePhotoPanX}px, ${__sharePhotoPanY}px) ` +
      (flip ? 'scaleX(-1) ' : '') +
      `scale(${__sharePhotoBaseScale * rel})`;
    const inner = img.parentElement;
    if (inner && inner.classList.contains('share-photo-preview-inner')) {
      let pad = '75%';
      if (ratioVal !== 'original') {
        const r = parseFloat(ratioVal);
        pad = (1 / r) * 100 + '%';
      }
      inner.style.paddingTop = pad;
    }
  };
  if (sizeSlider) sizeSlider.oninput = applyPreview;
  if (ratioSelect) {
    ratioSelect.onchange = () => {
      // 비율을 바꿀 때 현재 보이는 크기를 기준으로 슬라이더를 50으로 재설정
      const sizeInput = document.getElementById('share-photo-size');
      const displayEl = document.getElementById('share-photo-size-value');
      const curVal = sizeInput ? parseInt(sizeInput.value || '50', 10) || 50 : 50;
      const curRel = curVal / 50;
      // 현재 실제 스케일 = baseScale * curRel
      const currentScale = __sharePhotoBaseScale * curRel;
      __sharePhotoBaseScale = currentScale || 1;
      if (sizeInput) sizeInput.value = '50';
      if (displayEl) displayEl.textContent = '50';
      applyPreview();
    };
  }
  if (flipCheckbox) flipCheckbox.onchange = applyPreview;
  // 드래그로 위치 조정
  if (previewImg) {
    const startDrag = (clientX, clientY) => {
      __sharePhotoDragging = true;
      __sharePhotoDragStartX = clientX;
      __sharePhotoDragStartY = clientY;
      __sharePhotoPanStartX = __sharePhotoPanX;
      __sharePhotoPanStartY = __sharePhotoPanY;
    };
    const moveDrag = (clientX, clientY) => {
      if (!__sharePhotoDragging) return;
      const dx = clientX - __sharePhotoDragStartX;
      const dy = clientY - __sharePhotoDragStartY;
      __sharePhotoPanX = __sharePhotoPanStartX + dx;
      __sharePhotoPanY = __sharePhotoPanStartY + dy;
      applyPreview();
    };
    const endDrag = () => {
      __sharePhotoDragging = false;
    };
    previewImg.onmousedown = (e) => {
      e.preventDefault();
      startDrag(e.clientX, e.clientY);
    };
    document.addEventListener('mousemove', (e) => {
      if (__sharePhotoDragging) moveDrag(e.clientX, e.clientY);
    });
    document.addEventListener('mouseup', endDrag);
    // 터치 지원
    previewImg.ontouchstart = (e) => {
      const t = e.touches[0];
      if (!t) return;
      startDrag(t.clientX, t.clientY);
    };
    document.addEventListener('touchmove', (e) => {
      if (!__sharePhotoDragging) return;
      const t = e.touches[0];
      if (!t) return;
      moveDrag(t.clientX, t.clientY);
    }, { passive: false });
    document.addEventListener('touchend', endDrag);
  }
  applyPreview();
  document.getElementById('share-photo-options-modal')?.classList.remove('hidden');
  const btn = document.getElementById('share-photo-confirm-btn');
  if (btn) {
    btn.onclick = () => confirmSharePhotoWithOptions();
  }
}

function closeSharePhotoOptionsModal() {
  document.getElementById('share-photo-options-modal')?.classList.add('hidden');
  __sharePhotoOptionsPending = null;
}

function confirmSharePhotoWithOptions() {
  const photo = __sharePhotoOptionsPending;
  if (!photo || !photo.photoDataUrl) return;
  const flip = document.getElementById('share-photo-flip')?.checked ?? false;
  const sizeVal = document.getElementById('share-photo-size')?.value ?? '50';
  const ratioVal = document.getElementById('share-photo-ratio')?.value ?? 'original';
  const profileSizeVal = document.getElementById('share-photo-profile-size')?.value ?? 'medium';
  const sizeNum = parseInt(sizeVal, 10) || 50;
  const rel = sizeNum / 50;
  const outputScale = Math.min(2, Math.max(0.25, __sharePhotoBaseScale * rel));
  const aspectRatio = ratioVal === 'original' ? null : parseFloat(ratioVal);
  const profileScaleMap = { small: 0.15, medium: 0.2, large: 0.25 };
  const profileScale = profileScaleMap[profileSizeVal] ?? 0.2;
  closeSharePhotoOptionsModal();

  const cafeUrl = getCafeShareUrlForPhoto(photo);
  const doDownloadAndOpen = () => {
    compositePhotoWithProfileCorner(photo.photoDataUrl, { flipHorizontal: flip, outputScale, profileScale, aspectRatio }, (compositeDataUrl) => {
      const a = document.createElement('a');
      a.download = '떠나찾_사진_' + (photo.missionTitle || photo.missionId || '') + '.png';
      a.href = compositeDataUrl;
      a.click();
      window.open(cafeUrl, '_blank');
    });
  };
  showShareFileHintThenRun(doDownloadAndOpen);
}

/**
 * 사진 옵션 적용(좌우 반전, 크기 조절, 비율 크롭, 프로필 귀퉁이) 후 데이터 URL을 callback으로 전달.
 * options: { flipHorizontal?: boolean, outputScale?: number (0.25~1), profileScale?: number, aspectRatio?: number|null (가로/세로 비율, 원본이면 null) }
 */
function compositePhotoWithProfileCorner(photoDataUrl, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  const flipHorizontal = options.flipHorizontal ?? false;
  const outputScale = Math.min(1, Math.max(0.25, options.outputScale ?? 1));
  const profileScaleRatio = Math.min(0.35, Math.max(0.1, options.profileScale ?? 0.2));
  const aspectRatio = options.aspectRatio ?? null;
  const profileRaw = getUserProfileImage();

  const mainImg = new Image();
  mainImg.onload = () => {
    let w = mainImg.naturalWidth;
    let h = mainImg.naturalHeight;
    let sx = 0, sy = 0, cropW = w, cropH = h;
    if (aspectRatio != null && aspectRatio > 0) {
      const srcAspect = w / h;
      if (srcAspect > aspectRatio) {
        cropW = Math.round(h * aspectRatio);
        cropH = h;
        sx = Math.round((w - cropW) / 2);
        sy = 0;
      } else {
        cropW = w;
        cropH = Math.round(w / aspectRatio);
        sx = 0;
        sy = Math.round((h - cropH) / 2);
      }
    }
    const outW = Math.round(cropW * outputScale);
    const outH = Math.round(cropH * outputScale);
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      callback(photoDataUrl);
      return;
    }
    if (flipHorizontal) {
      ctx.translate(outW, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(mainImg, sx, sy, cropW, cropH, 0, 0, outW, outH);
    if (flipHorizontal) ctx.setTransform(1, 0, 0, 1, 0, 0);

    if (profileRaw) {
      const size = Math.min(outW, outH) * profileScaleRatio;
      const pad = Math.max(6, size * 0.15);
      const x = outW - size - pad;
      const y = outH - size - pad;

      if (profileRaw.startsWith('data:image')) {
        const profileImg = new Image();
        profileImg.onload = () => {
          ctx.save();
          ctx.beginPath();
          ctx.arc(x + size / 2, y + size / 2, size / 2 + 2, 0, Math.PI * 2);
          ctx.fillStyle = '#fff';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.closePath();
          ctx.beginPath();
          ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(profileImg, x, y, size, size);
          ctx.restore();
          try {
            callback(canvas.toDataURL('image/png'));
          } catch (_) {
            callback(photoDataUrl);
          }
        };
        profileImg.onerror = () => callback(canvas.toDataURL('image/png'));
        profileImg.src = profileRaw;
      } else {
        const emoji = profileRaw.startsWith('emoji:') ? profileRaw.slice(6) : '😊';
        ctx.save();
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, size / 2 + 2, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
        ctx.font = `${Math.round(size * 0.6)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emoji, x + size / 2, y + size / 2);
        try {
          callback(canvas.toDataURL('image/png'));
        } catch (_) {
          callback(photoDataUrl);
        }
      }
    } else {
      try {
        callback(canvas.toDataURL('image/png'));
      } catch (_) {
        callback(photoDataUrl);
      }
    }
  };
  mainImg.onerror = () => callback(photoDataUrl);
  mainImg.src = photoDataUrl;
}

function shareRecordingToCafe(recordingId) {
  const recordings = getRecordings();
  const rec = recordings.find(r => String(r.id) === String(recordingId));
  if (!rec || !rec.audioUrl) {
    alert('녹음을 찾을 수 없어요.');
    return;
  }
  const cafeUrl = 'https://cafe.naver.com/f-e/cafes/31681312/menus/2';
  const ext = (rec.audioUrl.indexOf('webm') !== -1) ? 'webm' : 'ogg';
  const doDownloadAndOpen = () => {
    const a = document.createElement('a');
    a.download = '떠나찾_녹음_' + (rec.title || '') + '.' + ext;
    a.href = rec.audioUrl;
    a.click();
    window.open(cafeUrl, '_blank');
  };
  showShareFileHintThenRun(doDownloadAndOpen);
}

function showShareFileHintThenRun(callback) {
  const msg = '공유하기 위해 우선 파일을 내 기기에 저장합니다';
  const el = document.getElementById('share-file-hint-toast');
  if (el) {
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(callback, 350);
    }, 2200);
  } else {
    callback();
  }
}

function getShareLinkText() {
  const text = getData(STORAGE_KEYS.shareLinkText);
  return (text && typeof text === 'string') ? text.trim() : '해당 링크로 이동하시겠습니까?';
}

function shareMissionContent() {
  const url = getShareLinkUrl();
  if (!url) {
    alert('공유 링크가 설정되지 않았습니다. 관리자 페이지에서 링크를 설정해 주세요.');
    return;
  }
  if (!confirm(getShareLinkText())) return;
  window.location.href = url;
}

// 게시물 작성
function submitPost() {
  const title = document.getElementById('post-title').value.trim();
  const body = document.getElementById('post-body').value.trim();
  const tags = document.getElementById('post-tags').value;
  const contentId = window.currentContentId;

  if (!body) {
    alert('본문을 입력해주세요.');
    return;
  }

  const posts = getPosts();
  const newPost = {
    id: 'p' + Date.now(),
    contentId: contentId || '1',
    title: title || getContents().find(c => c.id === contentId)?.title || '콘텐츠 제목',
    body,
    tags: tags ? tags.split(/[\s,]+/).filter(Boolean) : [],
    likes: 0,
    date: new Date().toISOString().slice(0, 10).replace(/-/g, '/'),
    comments: [],
    photos: [],
  };
  posts.unshift(newPost);
  setData(STORAGE_KEYS.posts, posts);

  document.getElementById('post-title').value = '';
  document.getElementById('post-body').value = '';
  document.getElementById('post-tags').value = '';
  navigate('shared-board');
}

// 공유 게시판 렌더링
function renderBoard() {
  const list = document.getElementById('board-post-list');
  const posts = getPosts();
  const contents = getContents();

  const filterSelect = document.getElementById('content-filter');
  filterSelect.innerHTML = '<option>모든 콘텐츠</option>' +
    contents.map(c => `<option value="${c.id}">${c.title}</option>`).join('');

  const filterValue = filterSelect.value;
  const filtered = filterValue === '모든 콘텐츠'
    ? posts
    : posts.filter(p => p.contentId === filterValue);

  list.innerHTML = filtered.map(p => `
    <div class="post-card" onclick="openPostDetail('${p.id}')">
      <input type="checkbox" onclick="event.stopPropagation()">
      <div class="post-card-content">
        <div class="post-card-title">${p.title}</div>
        <div class="post-card-body">${p.body}</div>
        <div class="post-card-thumb"></div>
      </div>
      <div class="profile-pic placeholder-circle"></div>
    </div>
  `).join('');
}

function openPostDetail(postId) {
  currentPostId = postId;
  const posts = getPosts();
  const post = posts.find(p => p.id === postId);
  if (post) {
    document.getElementById('post-detail-title').textContent = post.title;
    document.getElementById('post-detail-body').textContent = post.body;
    document.getElementById('like-count').textContent = post.likes;
    document.getElementById('post-date').textContent = post.date;

    const mediaEl = document.getElementById('post-detail-media');
    const audioUrls = post.audioUrls;
    if (audioUrls && audioUrls.length > 0) {
      mediaEl.innerHTML = audioUrls.map((url, i) => {
        const videoId = getYouTubeVideoId(url);
        const label = audioUrls.length > 1 ? `음성 ${i + 1}` : '';
        const blockId = `post-audio-block-${i}`;
        const playerDivId = `yt-player-post-${i}`;
        if (videoId) {
          return `<div class="audio-player post-yt-block" id="${blockId}">
            ${label ? `<span class="audio-player-label">${label}</span>` : ''}
            <button type="button" class="play-small content-audio-btn play">▶</button>
            <button type="button" class="play-small content-audio-btn stop" style="border-radius:4px;background:#666">■</button>
            <input type="range" class="progress content-audio-progress" value="0" max="100" min="0" step="0.1">
            <span class="time content-audio-time">00:00 | 00:00</span>
            <div class="yt-player-hidden"><div id="${playerDivId}"></div></div>
          </div>`;
        }
        return `<div class="audio-player" id="${blockId}">${label ? `<span class="audio-player-label">${label}</span>` : ''}<button class="play-small">▶</button><input type="range" class="progress" value="0" max="100"><span class="time">00:00</span></div>`;
      }).join('');
      initYouTubeAudioPlayers(audioUrls, 'yt-player-post-', 'post-audio-block-');
    } else if (post.audioUrl) {
      mediaEl.innerHTML = `<div class="audio-player"><button class="play-small">▶</button><input type="range" class="progress" value="0" max="100"><span class="time">00:00</span></div>`;
    } else {
      mediaEl.innerHTML = '';
    }

    const photosEl = document.getElementById('post-detail-photos');
    const photoCount = (post.photos || []).length || 2;
    photosEl.innerHTML = Array.from({ length: photoCount }, (_, i) =>
      `<div class="post-photo">사진${i + 1}</div>`
    ).join('');

    const commentList = document.getElementById('comment-list');
    commentList.innerHTML = (post.comments || []).map(c =>
      `<div class="comment-item">${c}</div>`
    ).join('');
  }
  navigate('post-detail');
}

function toggleLike() {
  const posts = getPosts();
  const post = posts.find(p => p.id === currentPostId);
  if (post) {
    post.likes = (post.likes || 0) + 1;
    setData(STORAGE_KEYS.posts, posts);
    document.getElementById('like-count').textContent = post.likes;
  }
}

function addComment() {
  const input = document.getElementById('comment-input');
  const text = input.value.trim();
  if (!text) return;

  const posts = getPosts();
  const post = posts.find(p => p.id === currentPostId);
  if (post) {
    post.comments = post.comments || [];
    post.comments.push(text);
    setData(STORAGE_KEYS.posts, posts);
    document.getElementById('comment-list').innerHTML +=
      `<div class="comment-item">${text}</div>`;
    input.value = '';
  }
}

// missionId로 PART_ACTIVITIES에서 썸네일 파일명 찾기 (thumb가 없을 때 폴백)
function getThumbForMissionId(mode, missionId) {
  if (!missionId || !mode) return '';
  const modeData = PART_ACTIVITIES[mode];
  if (!modeData) return '';
  // "STAR I - 별 하나에 I" 형태면 "STAR I" 추출
  const id = String(missionId).split(' - ')[0].trim();
  for (const part of [1, 2, 3, 4]) {
    const activities = modeData[part];
    if (!activities) continue;
    for (const a of activities) {
      if (!a.thumb) continue;
      if (a.label === id || a.lookingBackFor === id || a.relaxingFor === id || a.sub === id ||
          a.label === missionId || a.lookingBackFor === missionId || a.relaxingFor === missionId || a.sub === missionId)
        return a.thumb;
    }
  }
  return '';
}

let myContentsActiveTab = 'writing';

function setMyContentsTab(tab) {
  myContentsActiveTab = tab;
  document.querySelectorAll('.my-contents-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  renderMyContents();
}

// 저장된 사진 불러오기 (다운로드 폴더 등에서)
function importPhotosFromFiles(files) {
  if (!files || !files.length) return;
  const tab = myContentsActiveTab || 'writing';
  const mode = (tab === 'drawing') ? 'drawing' : 'writing';
  const modeLabel = mode === 'drawing' ? '드로잉' : '라이팅';
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
  let added = 0;
  const process = (i) => {
    if (i >= files.length) {
      renderMyContents();
      if (currentScreen === 'my-activity') renderMyPage();
      alert(`총 ${added}장의 사진을 ${modeLabel} 활동에 추가했어요.`);
      return;
    }
    const f = files[i];
    if (!f.type.startsWith('image/')) {
      process(i + 1);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const uniqueId = 'imported_' + Date.now() + '_' + i;
      const photo = {
        id: 'mp_' + uniqueId,
        missionId: uniqueId,
        missionTitle: '가져온 사진',
        photoDataUrl: reader.result,
        date: dateStr,
        mode,
        part: 1,
        impression: '',
      };
      saveMissionPhoto(photo);
      added++;
      process(i + 1);
    };
    reader.readAsDataURL(f);
  };
  process(0);
}

// My Contents 렌더링
function renderMyContents() {
  const list = document.getElementById('my-contents-list');
  const missionPhotos = getMissionPhotos();
  const contents = getContents();
  const tab = myContentsActiveTab || 'writing';

  document.querySelectorAll('.my-contents-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  const escapeHtml = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const renderPhotoItem = (p) => {
    const safeTitle = escapeHtml(p.missionTitle || p.missionId || '');
    const safeImpression = escapeHtml(p.impression || '');
    const safeId = escapeHtml(p.id);
    const safeIdAttr = String(p.id).replace(/'/g, "\\'").replace(/\\/g, '\\\\');
    const sharedKey = 'p_' + p.id;
    const sharedChecked = getSharedChecks()[sharedKey] ? ' checked' : '';
    const isShared = !!getSharedChecks()[sharedKey];
    const shareBtnDisabled = isShared ? ' disabled' : '';
    const shareBtnText = isShared ? '공유됨' : '카페에 공유';
    const mode = p.mode || 'writing';
    const basePath = ASSET_PATHS[mode] || 'assets/';
    const thumbFile = p.thumb || getThumbForMissionId(mode, p.missionId || p.missionTitle);
    const contentThumbUrl = thumbFile ? basePath + thumbFile : '';
    const contentThumbClass = contentThumbUrl ? 'mission-photo-content-thumb' : 'mission-photo-content-thumb mission-photo-content-thumb-empty';
    const contentThumbHtml = contentThumbUrl
      ? `<img src="${encodeURI(contentThumbUrl).replace(/"/g, '&quot;')}" alt="" class="mission-photo-content-thumb-img">`
      : '';
    return `
      <div class="content-item mission-photo-item">
        <div class="mission-photo-row">
          <div class="${contentThumbClass}" title="${safeTitle}">${contentThumbHtml}</div>
          <div class="mission-photo-thumb-wrap" onclick="openPhotoFullscreenById('${safeIdAttr}')" onkeydown="if(event.key==='Enter')openPhotoFullscreenById('${safeIdAttr}')" role="button" tabindex="0">
            <div class="mission-photo-thumb" style="background-image:url(${p.photoDataUrl})"></div>
            <span class="mission-photo-expand-icon" aria-hidden="true" title="확대 보기"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg></span>
            <button type="button" class="mission-photo-delete-btn" onclick="event.stopPropagation(); deleteMissionPhoto('${safeIdAttr}')" title="삭제">🗑</button>
          </div>
        </div>
        <div class="content-item-info">
          <div class="content-item-title">${safeTitle}</div>
          <div class="content-item-meta">${p.date || ''}</div>
          <textarea class="mission-photo-impression" placeholder="감상을 적어주세요" data-photo-id="${safeId}" onblur="updateMissionPhotoImpressionFromInput(this)">${safeImpression}</textarea>
          <div class="share-and-check-row">
            <button type="button" class="share-to-cafe-btn"${shareBtnDisabled} onclick="${isShared ? '' : "event.stopPropagation(); sharePhotoToCafe('" + safeIdAttr + "')"}" title="${shareBtnText}">${shareBtnText}</button>
            <label class="shared-check-wrap">
              <input type="checkbox" class="shared-check" data-shared-key="p_${safeId}" onchange="toggleSharedCheck('p_${safeId}', this.checked)"${sharedChecked}>
              <span class="shared-check-label">공유했으면 체크해 주세요</span>
            </label>
          </div>
        </div>
      </div>
    `;
  };

  let html = '';
  const writingPhotos = missionPhotos.filter(p => (p.mode || 'writing') === 'writing');
  const drawingPhotos = missionPhotos.filter(p => p.mode === 'drawing');
  const storedRecordings = getRecordings();
  const legacyRecordingContents = contents.filter(c => Array.isArray(c.recordings) && c.recordings.length);
  const recordingItems = storedRecordings.length
    ? storedRecordings
    : legacyRecordingContents.map(c => ({
        id: c.id,
        source: 'content',
        contentId: c.id,
        title: c.title,
        description: c.description || c.displayTitle || '',
        audioUrl: c.recordings[0],
        memo: '',
      }));

  const renderRecordingItem = (item) => {
    let displayTitle = '';
    if (item.source === 'mission') {
      const mission = MISSION_DATA[item.missionId] || {};
      const rawTitle = item.title || mission.title || '';
      let baseTitle = rawTitle;
      const hyphenIdx = rawTitle.indexOf(' - ');
      if (hyphenIdx !== -1) {
        baseTitle = rawTitle; // 전체 타이틀 사용 (예: TIME AND MONEY - 나의 시간과 돈)
      }
      let suffix = '';
      if (item.viewMode === 'lookingback' || (baseTitle && baseTitle.includes(' - Looking Back'))) {
        suffix = ''; // 이미 제목에 Looking Back 포함됨
      } else if (item.part === 3) {
        // 추후활동(돌아보기)
        suffix = ' - Looking Back';
      } else if (item.part === 4) {
        // part 4: 미션 줄 제목만 괄호 안에 표시
        let relaxLabel = '';
        if (mission.relaxingMission) {
          relaxLabel = String(mission.relaxingMission).split('-')[0].trim();
        }
        suffix = relaxLabel ? ` (${relaxLabel})` : ' (미션)';
      }
      displayTitle = escapeHtml(baseTitle + suffix);
    } else {
      // 콘텐츠 녹음은 콘텐츠 제목 그대로 사용
      const baseTitle = item.title || '콘텐츠';
      displayTitle = escapeHtml(baseTitle);
    }

    const metaText = escapeHtml(item.date ? item.date : '');
    const idAttr = String(item.id ?? '').replace(/'/g, "\\'").replace(/\\/g, '\\\\');

    const safeMemo = escapeHtml(item.memo || '');
    const safeRecordingId = escapeHtml(String(item.id ?? ''));
    const sharedKey = 'r_' + (item.id ?? '');
    const sharedChecked = getSharedChecks()[sharedKey] ? ' checked' : '';
    const isShared = !!getSharedChecks()[sharedKey];
    const shareBtnDisabled = isShared ? ' disabled' : '';
    const shareBtnText = isShared ? '공유됨' : '카페에 공유';

    let thumbUrl = '';
    if (item.source === 'mission') {
      const mode = item.mode || 'recording';
      const basePath = ASSET_PATHS[mode] || 'assets/';
      const missionId = item.missionId || '';
      const thumbFile = getThumbForMissionId(mode, missionId);
      if (thumbFile) {
        thumbUrl = basePath + thumbFile;
      }
    }

    const thumbHtml = thumbUrl
      ? `<img src="${encodeURI(thumbUrl).replace(/"/g, '&quot;')}" alt="" class="recording-thumb-img">`
      : '';

    const audioUrl = escapeHtml(item.audioUrl || '');
    return `
      <div class="content-item recording-item">
        <div class="recording-row">
          <div class="recording-thumb" aria-hidden="true">${thumbHtml}</div>
          <div class="recording-main">
            <div class="content-item-title">${displayTitle}</div>
            <div class="recording-meta-row">
              <span class="content-item-meta">${metaText}</span>
            <button type="button" class="recording-delete-btn" onclick="deleteRecordingItem('${idAttr}')" title="삭제">삭제</button>
          </div>
            <audio class="my-contents-audio" controls src="${audioUrl}"></audio>
          </div>
        </div>
        <textarea class="recording-memo-input" placeholder="감상을 적어주세요" data-recording-id="${safeRecordingId}" onblur="updateRecordingMemoFromInput(this)">${safeMemo}</textarea>
        <div class="share-and-check-row recording-share-row">
          <button type="button" class="share-to-cafe-btn"${shareBtnDisabled} onclick="${isShared ? '' : "shareRecordingToCafe('" + idAttr + "')"}" title="${shareBtnText}">${shareBtnText}</button>
          <label class="shared-check-wrap">
            <input type="checkbox" class="shared-check" data-shared-key="r_${safeRecordingId}" onchange="toggleSharedCheck('r_${safeRecordingId}', this.checked)"${sharedChecked}>
            <span class="shared-check-label">공유했으면 체크해 주세요</span>
          </label>
        </div>
      </div>
    `;
  };

  if (tab === 'writing') {
    html = '<div class="my-contents-section"><h3 class="my-contents-section-title">라이팅 활동</h3>';
    html += writingPhotos.length ? writingPhotos.map(renderPhotoItem).join('') : '<div class="empty-state">저장된 라이팅 활동 사진이 없습니다</div>';
    html += '</div>';
  } else if (tab === 'drawing') {
    html = '<div class="my-contents-section"><h3 class="my-contents-section-title">드로잉 활동</h3>';
    html += drawingPhotos.length ? drawingPhotos.map(renderPhotoItem).join('') : '<div class="empty-state">저장된 드로잉 활동 사진이 없습니다</div>';
    html += '</div>';
  } else if (tab === 'recording') {
    html = '<div class="my-contents-section"><h3 class="my-contents-section-title">레코딩 활동</h3>';
    html += recordingItems.length ? recordingItems.map(renderRecordingItem).join('') : '<div class="empty-state">저장된 레코딩 녹음이 없습니다</div>';
    html += '</div>';
  }

  list.innerHTML = html || '<div class="empty-state">저장된 콘텐츠가 없습니다</div>';

  const hintEl = document.getElementById('my-contents-hint');
  if (hintEl) hintEl.style.display = tab === 'recording' ? 'block' : 'none';
}

// 내 활동 렌더링 (활동 중 촬영한 사진) - 마이페이지에서 제거됨, 내콘텐츠 등에서만 참조
function renderActivities() {
  const list = document.getElementById('activity-list');
  if (!list) return;
  const photos = getMissionPhotos();
  const sortBy = document.querySelector('input[name="activity-sort"]:checked')?.value || 'latest';

  let sorted = [...photos];
  if (sortBy === 'content') {
    sorted.sort((a, b) => (a.missionTitle || a.missionId || '').localeCompare(b.missionTitle || b.missionId || ''));
  } else {
    sorted.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }

  if (sorted.length === 0) {
    list.innerHTML = `
      <div class="activity-empty">
        <span class="activity-empty-icon">📷</span>
        <p>아직 촬영한 사진이 없어요</p>
        <p class="activity-empty-hint">콘텐츠 활동을 하면서 사진을 촬영해 보세요</p>
        </div>
    `;
    return;
  }

  const escapeHtml = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  list.innerHTML = sorted.map(p => {
    const safeTitle = escapeHtml(p.missionTitle || p.missionId || '활동');
    const safeId = String(p.id || '').replace(/"/g, '&quot;');
    return `
      <div class="activity-photo-card" data-photo-id="${safeId}" role="button" tabindex="0">
        <div class="activity-photo-thumb" style="background-image:url(${p.photoDataUrl || ''})"></div>
        <div class="activity-photo-info">
          <span class="activity-photo-title">${safeTitle}</span>
          <span class="activity-photo-date">${p.date || ''}</span>
      </div>
    </div>
    `;
  }).join('');

  list.querySelectorAll('.activity-photo-card').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-photo-id');
      if (id) openPhotoFullscreenById(id);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        el.click();
      }
    });
  });
}

function renderMyPage() {
  const photos = getMissionPhotos();
  const recordings = getRecordings();
  // 내가 만든 실제 콘텐츠만 카운트: 사진 + 녹음
  const userContentCount = (photos?.length || 0) + (recordings?.length || 0);
  const completed = getCompletedMissions().length || 0;

  const missionCountEl = document.getElementById('mypage-mission-count');
  const contentCountEl = document.getElementById('mypage-content-count');
  const nameEl = document.getElementById('mypage-name-display');

  if (missionCountEl) missionCountEl.textContent = String(completed);
  if (contentCountEl) contentCountEl.textContent = String(userContentCount);
  if (nameEl) nameEl.textContent = getUserNickname();
  applyProfileImageToPage();
}

function getCompletedByMode() {
  const completedKeys = getCompletedMissions();
  const byMode = { writing: 0, drawing: 0, recording: 0 };
  if (Array.isArray(completedKeys)) {
    completedKeys.forEach(key => {
      if (typeof key !== 'string') return;
      const mode = key.split('_')[0];
      if (byMode[mode] !== undefined) byMode[mode] += 1;
    });
  }
  return byMode;
}

function renderActivityStats() {
  const photos = getMissionPhotos();
  const recordings = getRecordings();
  const userContentCount = (photos?.length || 0) + (recordings?.length || 0);
  const completed = getCompletedMissions().length || 0;
  const byMode = getCompletedByMode();

  const missionCountEl = document.getElementById('stats-mission-count');
  const contentCountEl = document.getElementById('stats-content-count');
  const totalLabelEl = document.getElementById('stats-mode-total-label');
  const barWriting = document.getElementById('stats-bar-writing');
  const barDrawing = document.getElementById('stats-bar-drawing');
  const barRecording = document.getElementById('stats-bar-recording');
  const countWriting = document.getElementById('stats-count-writing');
  const countDrawing = document.getElementById('stats-count-drawing');
  const countRecording = document.getElementById('stats-count-recording');
  const dailyCalendarEl = document.getElementById('stats-daily-calendar');
  const dailyWeekdaysEl = document.getElementById('stats-daily-weekdays');
  const dailyChartEl = document.getElementById('stats-daily-chart');

  if (missionCountEl) missionCountEl.textContent = String(completed);
  if (contentCountEl) contentCountEl.textContent = String(userContentCount);
  if (totalLabelEl) totalLabelEl.textContent = completed ? `총 ${completed}개 완료` : '아직 완료한 미션이 없어요';

  const maxValue = Math.max(byMode.writing, byMode.drawing, byMode.recording, 1);
  const toHeight = value => 8 + (value / maxValue) * 56;
  if (barWriting) barWriting.style.height = `${toHeight(byMode.writing)}px`;
  if (barDrawing) barDrawing.style.height = `${toHeight(byMode.drawing)}px`;
  if (barRecording) barRecording.style.height = `${toHeight(byMode.recording)}px`;
  if (countWriting) countWriting.textContent = String(byMode.writing);
  if (countDrawing) countDrawing.textContent = String(byMode.drawing);
  if (countRecording) countRecording.textContent = String(byMode.recording);

  if (dailyCalendarEl && dailyWeekdaysEl && dailyChartEl) {
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    dailyWeekdaysEl.innerHTML = weekdays.map(w => `<span class="stats-daily-weekday">${w}</span>`).join('');

    if (!window._statsCalendarView) {
      const now = new Date();
      window._statsCalendarView = { year: now.getFullYear(), month: now.getMonth() };
    }
    const view = window._statsCalendarView;
    const monthTitleEl = document.getElementById('stats-calendar-month-title');
    const prevBtn = document.getElementById('stats-calendar-prev');
    const nextBtn = document.getElementById('stats-calendar-next');
    if (monthTitleEl) monthTitleEl.textContent = `${view.year}년 ${view.month + 1}월`;

    const log = getAccessLog();
    const set = new Set(log.map(x => x.date));
    const firstDate = new Date(view.year, view.month, 1);
    const lastDate = new Date(view.year, view.month + 1, 0);
    const daysInMonth = lastDate.getDate();
    const startDay = firstDate.getDay();
    const cells = [];
    for (let i = 0; i < startDay; i++) cells.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${view.year}-${String(view.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      cells.push({ dayNum: day, date: dateStr, active: set.has(dateStr) });
    }
    const remainder = cells.length % 7;
    const trailingEmpty = remainder === 0 ? 0 : 7 - remainder;
    for (let i = 0; i < trailingEmpty; i++) cells.push(null);

    dailyChartEl.innerHTML = cells.map(c => {
      if (c === null) return '<div class="stats-daily-cell stats-daily-cell--empty" aria-hidden="true"></div>';
      return `<div class="stats-daily-cell ${c.active ? 'active' : ''}" title="${c.date} ${c.active ? '접속' : '미접속'}">${c.dayNum}</div>`;
    }).join('');

    const goMonth = (delta) => {
      let { year, month } = window._statsCalendarView;
      month += delta;
      if (month > 11) { year += 1; month = 0; }
      if (month < 0) { year -= 1; month = 11; }
      window._statsCalendarView = { year, month };
      renderActivityStats();
    };
    if (prevBtn) prevBtn.onclick = () => goMonth(-1);
    if (nextBtn) nextBtn.onclick = () => goMonth(1);
  }
}

function getUserProfileImage() {
  return getData(STORAGE_KEYS.userProfileImage) || '';
}

function setUserProfileImage(value) {
  setData(STORAGE_KEYS.userProfileImage, value || '');
}

var PROFILE_IMAGE_HISTORY_MAX = 20;

function _normalizeProfileImageHistory(raw) {
  if (!Array.isArray(raw)) {
    if (raw && typeof raw === 'string') try { raw = JSON.parse(raw); } catch (e) { return []; }
    else return [];
  }
  return raw.map(function (v) {
    if (v && typeof v === 'object' && typeof v.value === 'string') return { value: v.value, at: v.at || 0 };
    if (typeof v === 'string') return { value: v, at: 0 };
    return null;
  }).filter(Boolean);
}

function getProfileImageHistory() {
  var raw = getData(STORAGE_KEYS.userProfileImageHistory);
  return _normalizeProfileImageHistory(raw);
}

function addToProfileImageHistory(value) {
  if (!value || typeof value !== 'string') return;
  var list = getProfileImageHistory();
  list = list.filter(function (v) { return v.value !== value; });
  list.unshift({ value: value, at: Date.now() });
  list = list.slice(0, PROFILE_IMAGE_HISTORY_MAX);
  setData(STORAGE_KEYS.userProfileImageHistory, list);
}

function openProfileImageHistoryModal() {
  var modal = document.getElementById('profile-history-modal');
  if (modal) modal.classList.remove('hidden');
  renderProfileHistoryGrid();
}

function closeProfileImageHistoryModal() {
  document.getElementById('profile-history-modal')?.classList.add('hidden');
}

function renderAccountHistoryPage() {
  var acc = getUserAccount();
  var createdAt = acc && acc.createdAt ? formatYmd(acc.createdAt) : '—';
  var nickname = getUserNickname() || '—';
  var loginStatus = getCurrentSession() && getCurrentSession().id ? '로그인됨' : '로그인 안 됨';
  var lastLogin = acc && acc.lastLoginAt ? formatYmd(acc.lastLoginAt) : '—';
  var accessLogList = getAccessLog();
  var accessDays = accessLogList.length ? accessLogList.length + '일' : '—';
  var completed = getCompletedMissions().length || 0;
  var photos = getMissionPhotos();
  var recordings = getRecordings();
  var contentCount = (photos && photos.length || 0) + (recordings && recordings.length || 0);
  var firstActivity = acc && acc.firstActivityAt ? formatYmd(acc.firstActivityAt) : '—';

  setTextById('account-history-created-at', createdAt);
  setTextById('account-history-nickname', nickname);
  setTextById('account-history-login-status', loginStatus);
  setTextById('account-history-last-login', lastLogin);
  setTextById('account-history-access-days', accessDays);
  setTextById('account-history-missions', String(completed));
  setTextById('account-history-contents', String(contentCount));
  setTextById('account-history-first-activity', firstActivity);
}

function setTextById(id, text) {
  var el = document.getElementById(id);
  if (el) el.textContent = text;
}

function renderProfileHistoryGrid() {
  var grid = document.getElementById('profile-history-grid');
  if (!grid) return;
  var list = getProfileImageHistory();
  grid.innerHTML = '';
  list.forEach(function (entry) {
    var value = entry.value;
    var dateStr = entry.at ? formatYmd(entry.at) : '—';
    var wrap = document.createElement('div');
    wrap.className = 'profile-history-cell';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'profile-history-item';
    btn.setAttribute('aria-label', '이 프로필로 변경');
    if (value.startsWith('data:image')) {
      var img = document.createElement('img');
      img.src = value;
      img.alt = '';
      btn.appendChild(img);
    } else if (value.startsWith('emoji:')) {
      btn.textContent = value.slice(6) || '😊';
    } else {
      btn.textContent = '?';
    }
    btn.onclick = function () {
      setUserProfileImage(value);
      applyProfileImageToPage();
      // 페이지 버전에서는 선택 후 이전 화면으로
      if (typeof navigateBack === 'function') navigateBack();
      else closeProfileImageHistoryModal();
    };
    wrap.appendChild(btn);
    var dateEl = document.createElement('span');
    dateEl.className = 'profile-history-date';
    dateEl.textContent = dateStr;
    wrap.appendChild(dateEl);
    grid.appendChild(wrap);
  });
  if (list.length === 0) {
    var empty = document.createElement('p');
    empty.className = 'profile-history-empty';
    empty.style.cssText = 'grid-column:1/-1;text-align:center;color:var(--text-muted,#888);font-size:0.9rem;margin:0;';
    empty.textContent = '사용한 프사 기록이 없어요.';
    grid.appendChild(empty);
  }
}

function getProfileImageShape() {
  return getData(STORAGE_KEYS.userProfileImageShape) || 'circle';
}

function setProfileImageShape(shape) {
  setData(STORAGE_KEYS.userProfileImageShape, shape === 'square' ? 'square' : 'circle');
}

function applyProfileImageToPage() {
  var raw = getUserProfileImage();
  var emojiEl = document.getElementById('mypage-avatar-emoji');
  var imgEl = document.getElementById('mypage-avatar-img');
  if (emojiEl && imgEl) {
    if (raw && raw.startsWith('data:image')) {
      imgEl.src = raw;
      imgEl.classList.remove('hidden');
      emojiEl.classList.add('hidden');
    } else {
      if (!raw || !raw.startsWith('emoji:')) {
        emojiEl.textContent = '☘️';
        emojiEl.classList.remove('hidden');
        imgEl.classList.add('hidden');
        imgEl.removeAttribute('src');
      } else {
        emojiEl.textContent = raw.slice(6);
        emojiEl.classList.remove('hidden');
        imgEl.classList.add('hidden');
        imgEl.removeAttribute('src');
      }
    }
  }
  var settingsInitial = document.getElementById('settings-account-initial');
  var settingsImg = document.getElementById('settings-account-img');
  var nickname = getUserNickname();
  if (settingsInitial && settingsImg) {
    if (raw && raw.startsWith('data:image')) {
      settingsImg.src = raw;
      settingsImg.classList.remove('hidden');
      settingsInitial.classList.add('hidden');
    } else if (raw && raw.startsWith('emoji:')) {
      settingsInitial.textContent = raw.slice(6) || '☘️';
      settingsInitial.classList.remove('hidden');
      settingsImg.classList.add('hidden');
      settingsImg.removeAttribute('src');
    } else {
      var first = (nickname && nickname.trim()) ? nickname.trim().charAt(0).toUpperCase() : '?';
      settingsInitial.textContent = first;
      settingsInitial.classList.remove('hidden');
      settingsImg.classList.add('hidden');
      settingsImg.removeAttribute('src');
    }
  }
  if (document.body) document.body.dataset.profileShape = getProfileImageShape() || 'circle';
}

function applyPartGreetingHeader() {
  try {
    const name = getUserNickname();
    const nameEl = document.querySelector('.part-greeting-text');
    if (nameEl) {
      nameEl.textContent = name ? `안녕하세요, ${name}님 👋` : '안녕하세요 👋';
    }
    const profileEl = document.querySelector('.part-greeting-profile');
    if (profileEl) {
      const raw = getUserProfileImage();
      profileEl.style.backgroundImage = '';
      profileEl.textContent = '';
      if (raw && raw.startsWith('data:image')) {
        profileEl.style.backgroundImage = `url(${raw})`;
        profileEl.style.backgroundSize = 'cover';
        profileEl.style.backgroundPosition = 'center';
      } else if (raw && raw.startsWith('emoji:')) {
        const emoji = raw.slice(6) || '☘️';
        profileEl.textContent = emoji;
      } else {
        profileEl.textContent = '☘️';
      }
    }
    if (document.body) document.body.dataset.profileShape = getProfileImageShape() || 'circle';
  } catch (e) {
    console.error('[applyPartGreetingHeader] error', e);
  }
}

function openProfileImageModal() {
  profileImageCancelPreview();
  document.getElementById('profile-image-modal')?.classList.remove('hidden');
}

function closeProfileImageModal() {
  profileImageCancelPreview();
  document.getElementById('profile-image-modal')?.classList.add('hidden');
}

function applyProfileImageCropZoom() {
  var inner = document.getElementById('profile-image-crop-inner');
  var baseW = window._profileImageCropBaseW;
  var baseH = window._profileImageCropBaseH;
  var zoom = window._profileImageCropZoom != null ? window._profileImageCropZoom : 1;
  if (inner && baseW != null && baseH != null) {
    inner.style.width = (baseW * zoom) + 'px';
    inner.style.height = (baseH * zoom) + 'px';
  }
}

function applyProfileImageCropShape(shape) {
  var container = document.getElementById('profile-image-crop-container');
  if (!container) return;
  container.classList.toggle('shape-square', shape === 'square');
}

function getProfileImageSmoothFilter(smooth) {
  if (smooth <= 0.01) return '';
  var b = (1.04 + smooth * 0.14).toFixed(2);
  var s = (1.05 + smooth * 0.18).toFixed(2);
  var blurPx = (0.3 + smooth * 0.9).toFixed(1);
  return 'brightness(' + b + ') saturate(' + s + ') blur(' + blurPx + 'px)';
}

function applyProfileImageSmoothPreview() {
  var smoothSlider = document.getElementById('profile-image-smooth-slider');
  var cropImg = document.getElementById('profile-image-crop-img');
  var smooth = smoothSlider ? parseFloat(smoothSlider.value) || 0 : 0;
  if (cropImg) cropImg.style.filter = getProfileImageSmoothFilter(smooth);
}

function profileImageConfirmGallery() {
  var dataUrl = window._profileImagePendingDataUrl;
  var panX = window._profileImageCropPanX != null ? window._profileImageCropPanX : 0;
  var panY = window._profileImageCropPanY != null ? window._profileImageCropPanY : 0;
  var zoom = window._profileImageCropZoom != null ? window._profileImageCropZoom : 1;
  var shape = window._profileImageCropShape || 'circle';
  var baseScale = window._profileImageCropBaseScale;
  var cropImg = document.getElementById('profile-image-crop-img');
  if (!dataUrl || !cropImg || !cropImg.complete) {
    if (dataUrl && !cropImg.complete) {
      var img = new Image();
      img.onload = function() { window._profileImageCropImgReady = true; profileImageConfirmGallery(); };
      img.src = dataUrl;
      return;
    }
    if (dataUrl) {
      setUserProfileImage(dataUrl);
      applyProfileImageToPage();
      window._profileImagePendingDataUrl = null;
      closeProfileImageModal();
    }
    return;
  }
  var img = cropImg;
  var size = 200;
  var smoothSlider = document.getElementById('profile-image-smooth-slider');
  var smooth = smoothSlider ? parseFloat(smoothSlider.value) || 0 : 0;
  var scale = (baseScale != null ? baseScale : Math.max(size / img.naturalWidth, size / img.naturalHeight)) * zoom;
  var w = img.naturalWidth * scale;
  var h = img.naturalHeight * scale;
  var cornerRadius = 14;
  var canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  var ctx = canvas.getContext('2d');
  ctx.save();
  if (shape === 'square') {
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(0, 0, size, size, cornerRadius);
    } else {
      var r = Math.min(cornerRadius, size / 2);
      ctx.moveTo(r, 0);
      ctx.lineTo(size - r, 0);
      ctx.arcTo(size, 0, size, r, r);
      ctx.lineTo(size, size - r);
      ctx.arcTo(size, size, size - r, size, r);
      ctx.lineTo(r, size);
      ctx.arcTo(0, size, 0, size - r, r);
      ctx.lineTo(0, r);
      ctx.arcTo(0, 0, r, 0, r);
    }
    ctx.closePath();
    ctx.clip();
  } else {
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, 2 * Math.PI);
    ctx.closePath();
    ctx.clip();
  }
  ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, size / 2 + panX - w / 2, size / 2 + panY - h / 2, w, h);
  ctx.restore();
  var outputCanvas = canvas;
  if (smooth > 0.01) {
    var filterStr = getProfileImageSmoothFilter(smooth);
    if (filterStr) {
      var temp = document.createElement('canvas');
      temp.width = size;
      temp.height = size;
      var tctx = temp.getContext('2d');
      if (tctx && typeof tctx.filter !== 'undefined') {
        tctx.filter = filterStr;
        tctx.drawImage(canvas, 0, 0);
        outputCanvas = temp;
      }
    }
  }
  try {
    var cropped = outputCanvas.toDataURL('image/png');
    var cur = getUserProfileImage();
    if (cur && cur !== cropped) addToProfileImageHistory(cur);
    setUserProfileImage(cropped);
    setProfileImageShape(shape);
    applyProfileImageToPage();
  } catch (e) {
    var cur = getUserProfileImage();
    if (cur && cur !== dataUrl) addToProfileImageHistory(cur);
    setUserProfileImage(dataUrl);
    applyProfileImageToPage();
  }
  window._profileImagePendingDataUrl = null;
  window._profileImageCropPanX = 0;
  window._profileImageCropPanY = 0;
  window._profileImageCropZoom = 1;
  window._profileImageCropShape = 'circle';
  window._profileImageCropSmooth = 0;
  closeProfileImageModal();
}

function profileImageCancelPreview() {
  window._profileImagePendingDataUrl = null;
  window._profileImageCropPanX = 0;
  window._profileImageCropPanY = 0;
  window._profileImageCropZoom = 1;
  window._profileImageCropShape = 'circle';
  window._profileImageCropSmooth = 0;
  var wrap = document.getElementById('profile-image-preview-wrap');
  var options = document.getElementById('profile-image-options');
  var emojiLabel = document.querySelector('.profile-image-emoji-label');
  var emojiGrid = document.getElementById('profile-image-emoji-grid');
  var modalBtns = document.getElementById('profile-image-modal-buttons');
  var input = document.getElementById('mypage-profile-input');
  var inner = document.getElementById('profile-image-crop-inner');
  var container = document.getElementById('profile-image-crop-container');
  var zoomSlider = document.getElementById('profile-image-zoom-slider');
  var smoothSlider = document.getElementById('profile-image-smooth-slider');
  var shapeCircle = document.getElementById('profile-image-shape-circle');
  var shapeSquare = document.getElementById('profile-image-shape-square');
  if (inner) inner.style.transform = 'translate(-50%, -50%) translate(0px, 0px)';
  if (container) container.classList.remove('shape-square');
  if (zoomSlider) zoomSlider.value = '1';
  if (smoothSlider) smoothSlider.value = '0';
  var cropImgReset = document.getElementById('profile-image-crop-img');
  if (cropImgReset) cropImgReset.style.filter = '';
  if (shapeCircle) shapeCircle.classList.add('active');
  if (shapeSquare) shapeSquare.classList.remove('active');
  if (wrap) wrap.classList.add('hidden');
  if (options) options.classList.remove('hidden');
  if (emojiLabel) emojiLabel.style.display = '';
  if (emojiGrid) emojiGrid.style.display = '';
  if (modalBtns) modalBtns.style.display = '';
  if (input) input.value = '';
}

function initProfileImageCropDrag() {
  var container = document.getElementById('profile-image-crop-container');
  var inner = document.getElementById('profile-image-crop-inner');
  if (!container || !inner) return;
  var panX = 0, panY = 0;
  var startX, startY, startPanX, startPanY;

  function getPoint(e) {
    var t = e.touches && e.touches[0];
    return t ? { x: t.clientX, y: t.clientY } : { x: e.clientX, y: e.clientY };
  }
  function onStart(e) {
    e.preventDefault();
    var p = getPoint(e);
    startX = p.x; startY = p.y; startPanX = panX; startPanY = panY;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  }
  function onMove(e) {
    e.preventDefault();
    var p = getPoint(e);
    panX = startPanX + (p.x - startX);
    panY = startPanY + (p.y - startY);
    window._profileImageCropPanX = panX;
    window._profileImageCropPanY = panY;
    inner.style.transform = 'translate(-50%, -50%) translate(' + panX + 'px, ' + panY + 'px)';
  }
  function onEnd() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onEnd);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onEnd);
  }
  container.addEventListener('mousedown', onStart);
  container.addEventListener('touchstart', onStart, { passive: false });
}

function initProfileImageModal() {
  var input = document.getElementById('mypage-profile-input');
  if (input) {
    input.addEventListener('change', function(e) {
      var file = e.target && e.target.files && e.target.files[0];
      if (!file || !file.type.startsWith('image/')) return;
      var reader = new FileReader();
      reader.onload = function() {
        var dataUrl = reader.result;
        if (dataUrl && typeof dataUrl === 'string') {
          window._profileImagePendingDataUrl = dataUrl;
          window._profileImageCropPanX = 0;
          window._profileImageCropPanY = 0;
          var cropImg = document.getElementById('profile-image-crop-img');
          var inner = document.getElementById('profile-image-crop-inner');
          var container = document.getElementById('profile-image-crop-container');
          var wrap = document.getElementById('profile-image-preview-wrap');
          var options = document.getElementById('profile-image-options');
          var emojiLabel = document.querySelector('.profile-image-emoji-label');
          var emojiGrid = document.getElementById('profile-image-emoji-grid');
          var modalBtns = document.getElementById('profile-image-modal-buttons');
          if (cropImg) {
            window._profileImageCropZoom = 1;
            window._profileImageCropShape = 'circle';
            window._profileImageCropSmooth = 0;
            var zoomSlider = document.getElementById('profile-image-zoom-slider');
            if (zoomSlider) zoomSlider.value = '1';
            var smoothSlider = document.getElementById('profile-image-smooth-slider');
            if (smoothSlider) smoothSlider.value = '0';
            var sc = document.getElementById('profile-image-shape-circle');
            var sq = document.getElementById('profile-image-shape-square');
            if (sc) sc.classList.add('active');
            if (sq) sq.classList.remove('active');
            if (container) container.classList.remove('shape-square');
            cropImg.style.filter = '';
            cropImg.onload = function() {
              var w = cropImg.naturalWidth, h = cropImg.naturalHeight;
              var size = 200;
              var scale = Math.max(size / w, size / h);
              window._profileImageCropBaseScale = scale;
              window._profileImageCropBaseW = w * scale;
              window._profileImageCropBaseH = h * scale;
              var z = window._profileImageCropZoom != null ? window._profileImageCropZoom : 1;
              inner.style.width = (w * scale * z) + 'px';
              inner.style.height = (h * scale * z) + 'px';
            };
            cropImg.src = dataUrl;
          }
          if (wrap) wrap.classList.remove('hidden');
          if (options) options.classList.add('hidden');
          if (emojiLabel) emojiLabel.style.display = 'none';
          if (emojiGrid) emojiGrid.style.display = 'none';
          if (modalBtns) modalBtns.style.display = 'none';
        }
      };
      reader.readAsDataURL(file);
    });
  }
  initProfileImageCropDrag();
  var zoomSlider = document.getElementById('profile-image-zoom-slider');
  if (zoomSlider) {
    zoomSlider.addEventListener('input', function() {
      window._profileImageCropZoom = parseFloat(zoomSlider.value) || 1;
      applyProfileImageCropZoom();
    });
  }
  var smoothSlider = document.getElementById('profile-image-smooth-slider');
  if (smoothSlider) {
    smoothSlider.addEventListener('input', function() {
      window._profileImageCropSmooth = parseFloat(smoothSlider.value) || 0;
      applyProfileImageSmoothPreview();
    });
  }
  document.querySelectorAll('.profile-image-shape-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var shape = btn.dataset.shape || 'circle';
      window._profileImageCropShape = shape;
      applyProfileImageCropShape(shape);
      document.querySelectorAll('.profile-image-shape-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
    });
  });
  document.getElementById('profile-image-emoji-grid')?.addEventListener('click', function(e) {
    var btn = e.target.closest('.profile-image-emoji-btn');
    if (!btn || !btn.dataset.emoji) return;
    var newVal = 'emoji:' + btn.dataset.emoji;
    var cur = getUserProfileImage();
    if (cur && cur !== newVal) addToProfileImageHistory(cur);
    setUserProfileImage(newVal);
    applyProfileImageToPage();
    closeProfileImageModal();
  });
  var saveBtn = document.getElementById('profile-image-save-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', function() { profileImageConfirmGallery(); });
    saveBtn.addEventListener('touchend', function(e) {
      e.preventDefault();
      profileImageConfirmGallery();
    }, { passive: false });
  }
}

function getUserNickname() {
  const name = getData(STORAGE_KEYS.userNickname);
  return (name && String(name).trim()) ? String(name).trim() : '즐거운알파카';
}

function setUserNickname(name) {
  var v = (name && String(name).trim()) ? String(name).trim() : '';
  setData(STORAGE_KEYS.userNickname, v || '즐거운알파카');
}

var NICKNAME_HISTORY_MAX = 20;

function _normalizeNicknameHistory(raw) {
  if (!Array.isArray(raw)) {
    if (raw && typeof raw === 'string') try { raw = JSON.parse(raw); } catch (e) { return []; }
    else return [];
  }
  return raw.map(function (v) {
    if (v && typeof v === 'object' && typeof v.value === 'string') return { value: v.value, at: v.at || 0 };
    if (typeof v === 'string') return { value: String(v).trim(), at: 0 };
    return null;
  }).filter(function (v) { return v && v.value; });
}

function getNicknameHistory() {
  var raw = getData(STORAGE_KEYS.userNicknameHistory);
  return _normalizeNicknameHistory(raw);
}

function addToNicknameHistory(name) {
  if (!name || typeof name !== 'string') return;
  var trimmed = name.trim();
  if (!trimmed) return;
  var list = getNicknameHistory();
  list = list.filter(function (v) { return v.value !== trimmed; });
  list.unshift({ value: trimmed, at: Date.now() });
  list = list.slice(0, NICKNAME_HISTORY_MAX);
  setData(STORAGE_KEYS.userNicknameHistory, list);
}

function applyNicknameToPage() {
  var name = getUserNickname();
  var el = document.getElementById('mypage-name-display');
  if (el) el.textContent = name;
  el = document.getElementById('login-info-nickname');
  if (el) el.textContent = name;
  el = document.getElementById('settings-account-name');
  if (el) el.textContent = name || '닉네임';
}

function openNicknameHistoryModal() {
  var modal = document.getElementById('nickname-history-modal');
  if (modal) modal.classList.remove('hidden');
  renderNicknameHistoryList();
}

function closeNicknameHistoryModal() {
  document.getElementById('nickname-history-modal')?.classList.add('hidden');
}

function renderNicknameHistoryList() {
  var listEl = document.getElementById('nickname-history-list');
  if (!listEl) return;
  var list = getNicknameHistory();
  listEl.innerHTML = '';
  list.forEach(function (entry) {
    var name = entry.value;
    var dateStr = entry.at ? formatYmd(entry.at) : '—';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nickname-history-item';
    var left = document.createElement('span');
    left.className = 'nickname-history-item-name';
    left.textContent = name;
    var right = document.createElement('span');
    right.className = 'nickname-history-item-date';
    right.textContent = dateStr;
    btn.appendChild(left);
    btn.appendChild(right);
    btn.onclick = function () {
      setUserNickname(name);
      applyNicknameToPage();
      // 페이지 버전에서는 히스토리 선택 후 마이페이지로 돌아가기
      if (typeof navigateBack === 'function') navigateBack();
      else closeNicknameHistoryModal();
    };
    listEl.appendChild(btn);
  });
  if (list.length === 0) {
    var empty = document.createElement('p');
    empty.className = 'profile-history-empty';
    empty.style.cssText = 'text-align:center;color:var(--text-muted,#888);font-size:0.9rem;margin:0;padding:12px;';
    empty.textContent = '사용한 닉네임 기록이 없어요.';
    listEl.appendChild(empty);
  }
}

function openNicknameEdit() {
  var current = getUserNickname();
  var newName = prompt('닉네임을 입력해 주세요', current);
  if (newName === null) return;
  var trimmed = String(newName).trim();
  if (trimmed) {
    if (current && current !== trimmed) addToNicknameHistory(current);
    setUserNickname(trimmed);
    applyNicknameToPage();
  }
}

function openLoginInfoModal() {
  navigate('login-info-screen');
}

function closeLoginInfoModal() {
  navigate('my-activity');
}

function openBackupModal() {
  navigate('backup-screen');
}

function closeBackupModal() {
  navigate('my-activity');
}

function backFromBackupScreen() {
  var target = window._backToScreen || 'my-activity';
  window._backToScreen = null;
  navigate(target);
}

function renderAppSettings() {
  var nameEl = document.getElementById('settings-account-name');
  var initialEl = document.getElementById('settings-account-initial');
  var imgEl = document.getElementById('settings-account-img');
  var nickname = getUserNickname();
  if (nameEl) nameEl.textContent = nickname || '닉네임';

  var raw = getUserProfileImage();
  if (initialEl && imgEl) {
    if (raw && raw.startsWith('data:image')) {
      imgEl.src = raw;
      imgEl.classList.remove('hidden');
      initialEl.classList.add('hidden');
    } else if (raw && raw.startsWith('emoji:')) {
      initialEl.textContent = raw.slice(6) || '☘️';
      initialEl.classList.remove('hidden');
      imgEl.classList.add('hidden');
      imgEl.removeAttribute('src');
    } else {
      var first = (nickname && nickname.trim()) ? nickname.trim().charAt(0).toUpperCase() : '?';
      initialEl.textContent = first;
      initialEl.classList.remove('hidden');
      imgEl.classList.add('hidden');
      imgEl.removeAttribute('src');
    }
  }
  if (document.body) document.body.dataset.profileShape = getProfileImageShape() || 'circle';
}

function confirmAppReset() {
  if (!confirm('저장된 모든 데이터(계정·녹음·사진·진행 상황 등)가 삭제됩니다. 정말 앱을 초기화할까요?')) return;
  try {
    Object.values(STORAGE_KEYS).forEach(key => {
      try { localStorage.removeItem(key); } catch (_) {}
    });
    try { localStorage.removeItem('contique_mission_audio'); } catch (_) {}
    alert('앱이 초기화되었습니다. 새로고침합니다.');
    location.reload();
  } catch (e) {
    alert('초기화 중 오류가 났어요. 다시 시도해 주세요.');
  }
}

function initSettingsGeneralScreen() {
  var volEl = document.getElementById('settings-general-volume');
  var valEl = document.getElementById('settings-general-volume-value');
  if (!volEl) return;
  var pct = Math.round(missionPlaybackVolume * 100);
  volEl.value = pct;
  if (valEl) valEl.textContent = pct;
  volEl.addEventListener('input', function() {
    var pct = Math.max(0, Math.min(100, Number(volEl.value) || 50));
    missionPlaybackVolume = pct / 100;
    setSavedPlaybackVolume(pct);
    applyMissionPlaybackVolume();
    if (valEl) valEl.textContent = pct;
  });
}

function renderSettingsGeneralScreen() {
  var volEl = document.getElementById('settings-general-volume');
  var valEl = document.getElementById('settings-general-volume-value');
  if (volEl) volEl.value = Math.round(missionPlaybackVolume * 100);
  if (valEl) valEl.textContent = Math.round(missionPlaybackVolume * 100);
}

function renderAppInfoScreen() {
  var versionEl = document.getElementById('app-info-version');
  var modifiedEl = document.getElementById('app-info-modified');
  if (versionEl) versionEl.textContent = 'v.' + (typeof APP_VERSION !== 'undefined' ? APP_VERSION : '1.25');
  if (modifiedEl) modifiedEl.textContent = typeof APP_LAST_MODIFIED !== 'undefined' ? APP_LAST_MODIFIED : '2025-03-12';
}

function openCafeConfirm() {
  var modal = document.getElementById('cafe-confirm-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeCafeConfirmModal() {
  document.getElementById('cafe-confirm-modal')?.classList.add('hidden');
}

function goToCafeAndCloseModal() {
  closeCafeConfirmModal();
  window.location.href = 'https://cafe.naver.com/tunachat';
}

function copyAppShareUrl() {
  const url = typeof location !== 'undefined' && location.href ? location.href : 'https://links.tunachat.net';
  const text = url.replace(/\/$/, '');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      alert('떠나찾앱 주소가 복사되었어요. 친구들과 공유해보세요. 메신저나 메일에 붙여넣을 수 있어요.');
    }).catch(() => {
      fallbackCopyUrl(text);
    });
  } else {
    fallbackCopyUrl(text);
  }
}

function fallbackCopyUrl(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    alert('떠나찾앱 주소가 복사되었어요. 친구들과 공유해보세요. 메신저나 메일에 붙여넣을 수 있어요.');
  } catch (_) {
    alert('복사에 실패했어요. 주소를 직접 복사해 주세요: ' + text);
  }
}

function confirmClearAllData() {
  if (!confirm('저장된 모든 데이터(사진·녹음·메모·진행 상황 등)가 삭제됩니다. 정말 초기화할까요?')) return;
  try {
    Object.values(STORAGE_KEYS).forEach(key => {
      try { localStorage.removeItem(key); } catch (_) {}
    });
    closeLoginInfoModal();
    alert('데이터가 초기화되었습니다. 앱을 새로고침합니다.');
    location.reload();
  } catch (e) {
    alert('초기화 중 오류가 났어요. 다시 시도해 주세요.');
  }
}

// ─────────────────────────────────────────────
// 데이터 백업 / 복원 (기기 간 이동용)
// ─────────────────────────────────────────────
function exportUserData() {
  try {
    const bundle = {};
    Object.entries(STORAGE_KEYS).forEach(([k, storageKey]) => {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw !== null && raw !== undefined) {
          bundle[storageKey] = raw;
        }
      } catch (_) {}
    });
    const payload = {
      v: 1,
      exportedAt: new Date().toISOString(),
      data: bundle,
    };
    const textarea = document.getElementById('login-info-backup-text');
    if (textarea) {
      textarea.value = JSON.stringify(payload);
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
    }
    alert('백업 코드가 생성되었습니다. 전체를 복사해서 다른 기기에서 붙여넣어 주세요.');
  } catch (e) {
    console.error('[exportUserData] error', e);
    alert('백업 코드를 만들다가 오류가 났어요. 다시 시도해 주세요.');
  }
}

function exportUserDataAsFile() {
  try {
    const bundle = {};
    Object.entries(STORAGE_KEYS).forEach(([k, storageKey]) => {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw !== null && raw !== undefined) {
          bundle[storageKey] = raw;
        }
      } catch (_) {}
    });
    const payload = {
      v: 1,
      exportedAt: new Date().toISOString(),
      data: bundle,
    };
    const json = JSON.stringify(payload, null, 2);

    const textarea = document.getElementById('login-info-backup-text');
    if (textarea) textarea.value = json;

    const fileWrap = document.getElementById('login-info-backup-file');
    const fileLink = document.getElementById('backup-file-link');
    if (fileWrap && fileLink) {
      fileLink.textContent = 'my-record.json (탭하면 파일 다시 저장)';
      fileWrap.style.display = 'flex';
    }
    triggerJsonDownload(json);
  } catch (e) {
    console.error('[exportUserDataAsFile] error', e);
    alert('백업 파일을 만드는 중 오류가 났어요. 다시 시도해 주세요.');
  }
}

function triggerJsonDownload(json) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'my-record.json';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadBackupAsFile() {
  const textarea = document.getElementById('login-info-backup-text');
  if (!textarea) return;
  const text = (textarea.value || '').trim();
  if (!text) {
    alert('먼저 "백업 파일로 저장"을 눌러 주세요.');
    return;
  }
  triggerJsonDownload(text);
}

function copyBackupJson() {
  try {
    const textarea = document.getElementById('login-info-backup-text');
    if (!textarea) {
      alert('복사할 백업 코드 영역을 찾을 수 없어요.');
      return;
    }
    const text = textarea.value || '';
    if (!text.trim()) {
      alert('먼저 "백업 파일로 저장"을 눌러 주세요.');
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        alert('클립보드에 복사되었어요. 메신저나 메일에 붙여넣을 수 있어요.');
      }).catch(() => {
        textarea.select();
        document.execCommand('copy');
        alert('클립보드에 복사되었어요. 메신저나 메일에 붙여넣을 수 있어요.');
      });
    } else {
      textarea.select();
      document.execCommand('copy');
      alert('클립보드에 복사되었어요. 메신저나 메일에 붙여넣을 수 있어요.');
    }
  } catch (e) {
    console.error('[copyBackupJson] error', e);
    alert('코드를 복사하는 중 문제가 생겼어요. 텍스트를 직접 드래그해서 복사해 주세요.');
  }
}

function importUserData() {
  const textarea = document.getElementById('login-info-backup-text');
  if (!textarea) return;
  const text = (textarea.value || '').trim();
  if (!text) {
    alert('붙여넣은 백업 코드가 없어요.');
    return;
  }
  if (!confirm('이 백업 코드를 적용하면 현재 이 기기의 기록이 덮어쓰여질 수 있어요.\n그래도 불러올까요?')) {
    return;
  }
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || !parsed.data || typeof parsed.data !== 'object') {
      alert('백업 코드 형식이 올바르지 않아요.');
      return;
    }
    const data = parsed.data;
    Object.values(STORAGE_KEYS).forEach(storageKey => {
      if (Object.prototype.hasOwnProperty.call(data, storageKey)) {
        try {
          localStorage.setItem(storageKey, data[storageKey]);
        } catch (_) {}
      }
    });
    alert('백업 코드가 적용되었어요. 앱을 새로고침하면 반영됩니다.');
  } catch (e) {
    console.error('[importUserData] error', e);
    alert('백업 코드를 읽는 중 오류가 났어요. 코드가 잘못되지 않았는지 확인해 주세요.');
  }
}

function importUserDataFromFile(file) {
  if (!file) {
    alert('선택된 백업 파일이 없어요.');
    return;
  }
  const reader = new FileReader();
  reader.onload = function() {
    try {
      const text = String(reader.result || '').trim();
      if (!text) {
        alert('백업 파일 내용이 비어 있어요.');
        return;
      }
      const textarea = document.getElementById('login-info-backup-text');
      if (textarea) textarea.value = text;
      // 기존 importUserData 로직 재사용
      importUserData();
    } catch (e) {
      console.error('[importUserDataFromFile] error', e);
      alert('백업 파일을 읽는 중 문제가 생겼어요. 올바른 JSON 백업 파일인지 확인해 주세요.');
    }
  };
  reader.onerror = function() {
    alert('백업 파일을 여는 중 오류가 났어요. 다시 시도해 주세요.');
  };
  reader.readAsText(file, 'utf-8');
}

// 이벤트 바인딩
document.addEventListener('DOMContentLoaded', () => {
  // QR 코드 등으로 진입 시 초기 홈 모드 감지 (?home=recording 등)
  initialHomeModeFromUrl = detectInitialHomeModeFromUrl();
  initialPartFromUrl = detectInitialPartFromUrl();
  if (initialHomeModeFromUrl) {
    homeMode = initialHomeModeFromUrl;
  }

  // 이 기기 로그인 세션 복원
  const sess = getCurrentSession();
  if (sess && sess.id) {
    currentUserId = sess.id;
  }

  // 일별 접속 기록 (활동 통계용)
  try { appendAccessLog(); } catch (_) {}

  // 스플래시 포스터 초기화 (a,b,c… 순서 시작)
  try {
    setSplashPoster(0);
  } catch (e) {
    console.warn('[splash poster init]', e);
  }

  checkAppVersion();
  missionPlaybackVolume = getSavedPlaybackVolume() / 100;
  var missionVolEl = document.getElementById('mission-playback-volume');
  if (missionVolEl) missionVolEl.value = Math.round(missionPlaybackVolume * 100);
  bootstrapMissionAudioDefaultsFromWb();
  bootstrapDrawingMissionAudio();
  bootstrapRecordingMissionAudio();
  renderHomeContent();
  // 항상 홈 화면을 기본으로 렌더링하고,
  // 스플래시 오버레이는 사용자가 출발/건너뛰기를 누를 때까지 유지
    currentScreen = 'recording-home';
  const mode = initialHomeModeFromUrl || 'drawing';
  setHomeMode(mode);
  if (initialPartFromUrl && mode) {
    openPartActivity(mode, initialPartFromUrl);
  } else {
    navigate('recording-home');
  }
  // 브라우저/폰 뒤로가기 시 앱 내 이전 화면으로 이동 (앱에서 나가지 않음)
  window.addEventListener('popstate', function(e) {
    const screenId = (e.state && e.state.screenId) ? e.state.screenId : 'recording-home';
    navigate(screenId, { skipPushState: true });
  });
  const partEl = document.getElementById('part-activity');
  if (partEl) {
    partEl.addEventListener('touchstart', onPartActivityTouchStart, { passive: true });
    partEl.addEventListener('touchend', onPartActivityTouchEnd, { passive: true });
    partEl.addEventListener('mousedown', onPartActivityMouseDown);
    partEl.addEventListener('mouseup', onPartActivityMouseUp);
  }
  document.getElementById('coupon-modal-input')?.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') confirmCouponModal();
  });
  document.getElementById('coupon-modal')?.addEventListener('click', function(e) {
    if (e.target.id === 'coupon-modal' && !e.target.classList.contains('hidden')) cancelCouponModal();
  });
  document.querySelectorAll('.mode-tab').forEach(btn => {
    btn.addEventListener('click', () => setHomeMode(btn.dataset.mode));
  });

  document.getElementById('record-btn')?.addEventListener('click', () => {
    if (recordingState.isRecording) return;
    if (document.getElementById('pause-btn').classList.contains('hidden')) {
      startRecording();
    } else {
      resumeRecording();
    }
  });

  document.getElementById('pause-btn')?.addEventListener('click', pauseRecording);
  document.getElementById('stop-btn')?.addEventListener('click', stopRecording);
   document.getElementById('play-recorded-btn')?.addEventListener('click', playLastRecording);
  document.getElementById('save-content-btn')?.addEventListener('click', saveContent);

  document.getElementById('fab-btn')?.addEventListener('click', () => {
    document.getElementById('fab-menu').classList.toggle('hidden');
  });

  document.getElementById('content-filter')?.addEventListener('change', renderBoard);

  document.querySelectorAll('input[name="activity-sort"]').forEach(radio => {
    radio.addEventListener('change', renderActivities);
  });

  document.getElementById('mission-photo-input')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) onMissionPhotoCaptured(file);
    e.target.value = '';
  });

  initProfileImageModal();

  const sharePhotoSizeEl = document.getElementById('share-photo-size');
  const sharePhotoSizeValueEl = document.getElementById('share-photo-size-value');
  if (sharePhotoSizeEl && sharePhotoSizeValueEl) {
    sharePhotoSizeEl.addEventListener('input', () => { sharePhotoSizeValueEl.textContent = sharePhotoSizeEl.value; });
  }

  document.getElementById('mission-playback-volume')?.addEventListener('input', (e) => {
    const pct = Math.max(0, Math.min(100, Number(e.target.value) || 100));
    missionPlaybackVolume = pct / 100;
    setSavedPlaybackVolume(pct);
    applyMissionPlaybackVolume();
  });
  initSettingsGeneralScreen();

  document.getElementById('import-photos-input')?.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files && files.length) importPhotosFromFiles(Array.from(files));
    e.target.value = '';
  });

  // 스플래시 시그널 및 체크박스 초기화
  initSplashSkipCheckbox();
  playSignalOnSplash();

  // 맨 위로 가기 버튼
  const appEl = document.getElementById('app');
  const scrollTopBtn = document.getElementById('scroll-to-top-btn');
  if (appEl && scrollTopBtn) {
    appEl.addEventListener('scroll', () => {
      if (appEl.scrollTop > 300) {
        scrollTopBtn.classList.add('visible');
      } else {
        scrollTopBtn.classList.remove('visible');
      }
    });
    scrollTopBtn.addEventListener('click', () => {
      appEl.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
});

// Recording 리스트 렌더링
function renderRecordingList() {
  const list = document.getElementById('recording-list-items');
  if (!list) return;
  const items = [
    { id: 1, title: '제목 1', date: '2026-02-28' },
    { id: 2, title: '제목 2', date: '2026-02-27' },
    { id: 3, title: '제목 3', date: '2026-02-26' },
  ];
  list.innerHTML = items.map(i => `
    <div class="recording-item" onclick="navigate('recording-playback')">
      <input type="checkbox" onclick="event.stopPropagation()">
      <span>📊</span>
      <div>
        <div>${i.title}</div>
        <div class="version-date">${i.date}</div>
      </div>
    </div>
  `).join('');
}

// Drawing 문서 목록 렌더링
function renderDrawingDocList() {
  const list = document.getElementById('drawing-doc-list');
  if (!list) return;
  const docs = [
    { id: 1, title: '제목', date: '2026-02-28' },
    { id: 2, title: '제목', date: '2026-02-27' },
    { id: 3, title: '제목', date: '2026-02-26' },
  ];
  list.innerHTML = docs.map(d => `
    <div class="doc-item" onclick="navigate('drawing-doc-details')">
      <input type="checkbox" onclick="event.stopPropagation()">
      <div>
        <div>${d.title}</div>
        <div class="version-date">${d.date}</div>
      </div>
    </div>
  `).join('');
}

function renderDocSublist() {
  const list = document.getElementById('doc-sublist');
  if (!list) return;
  const items = [
    { title: '제목', date: '2026-02-28' },
    { title: '제목', date: '2026-02-27' },
  ];
  list.innerHTML = items.map(i => `
    <div class="doc-item">
      <input type="checkbox">
      <div>${i.title}</div>
      <div class="version-date">${i.date}</div>
    </div>
  `).join('');
}

function renderDrawingGallery() {
  const grid = document.getElementById('drawing-gallery-grid');
  if (!grid) return;
  grid.innerHTML = Array.from({ length: 9 }, (_, i) =>
    `<div class="gallery-item" onclick="navigate('drawing-view')"></div>`
  ).join('');
}

function renderVersionList() {
  const list = document.getElementById('version-list');
  if (!list) return;
  const versions = [
    { date: '2026-02-28 14:30', desc: '최종 수정' },
    { date: '2026-02-27 10:15', desc: '초안' },
  ];
  list.innerHTML = versions.map(v => `
    <div class="version-item">
      <div class="version-date">${v.date}</div>
      <div>${v.desc}</div>
    </div>
  `).join('');
}

// 개발자용: 콘솔에서 음원 URL 직접 확인/설정
window.__missionAudioDebug = {
  // 저장된 모든 미션 URL 확인
  show() {
    const d = JSON.parse(localStorage.getItem('contique_mission_audio') || '{}');
    console.table(Object.entries(d).map(([id, v]) => ({
      missionId: id,
      본활동URL: (v.audioUrls || [])[0] || '(없음)',
      돌아보기URL: (v.lookingBackUrls || [])[0] || '(없음)',
    })));
    return d;
  },
  // 특정 미션에 URL 직접 저장 (예: __missionAudioDebug.set('ALONG', 'https://youtu.be/xxxxx'))
  set(missionId, audioUrl, lookingBackUrl) {
    const d = JSON.parse(localStorage.getItem('contique_mission_audio') || '{}');
    d[missionId] = { audioUrls: audioUrl ? [audioUrl] : [], lookingBackUrls: lookingBackUrl ? [lookingBackUrl] : [] };
    localStorage.setItem('contique_mission_audio', JSON.stringify(d));
    console.log('✅ 저장됨:', missionId, d[missionId]);
  },
};
console.log('%c[떠나찾 앱] 음원 디버그: window.__missionAudioDebug.show() 로 저장된 URL 확인 가능', 'color:#7BC74E; font-weight:bold');
