export const SUPA_URL = 'https://fpyhywgluieifxeianpp.supabase.co';
export const SUPA_KEY = 'sb_publishable_CkawR7F0S7KgkmxwtrH3bA_CLNLy5gE';

export let db = null;
try {
  if (!SUPA_URL.includes('YOUR_PROJECT')) {
    db = supabase.createClient(SUPA_URL, SUPA_KEY);
  }
} catch(e) {
  console.error("Supabase failed to initialize:", e);
}

export const state = {
  myId: localStorage.getItem('blokbar_uid') || (() => {
    const id = crypto.randomUUID();
    localStorage.setItem('blokbar_uid', id);
    return id;
  })(),
  myName: localStorage.getItem('blokbar_name') || null,
  
  studyActive: false,
  studyStart: null,
  
  // Track separate bases for accurate dynamic additions
  sessionBase: 0, 
  totalBase: parseInt(localStorage.getItem('blokbar_secs') || '0'), 
  
  isMuted: false,
  playlist: [],
  playIdx: 0,
  timers: [],
  activities: [],
  allUsers: {},
  prevRanks: {}
};

export function setMyName(name) { state.myName = name; }
export function setStudyActive(val) { state.studyActive = val; }
export function setStudyStart(val) { state.studyStart = val; }
export function setSessionBase(val) { state.sessionBase = val; }
export function setTotalBase(val) { state.totalBase = val; }
export function setIsMuted(val) { state.isMuted = val; }
export function setPlaylist(val) { state.playlist = val; }
export function setPlayIdx(val) { state.playIdx = val; }
export function setTimers(val) { state.timers = val; }
export function setActivities(val) { state.activities = val; }
export function setAllUsers(val) { state.allUsers = val; }