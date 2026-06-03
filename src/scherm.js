import { db, state, setPlayIdx, setIsMuted } from "./shared/config.js";
import { dbGet, sub } from "./shared/db.js";
import { notify } from "./shared/utils.js";
import { initIdentity, loadUsers } from "./components/identity.js";
import {
    loadPlaylist,
    syncMute,
    applyMute,
    setVideo,
    renderPlaylist
} from "./components/playlist.js";
import { loadActs, doSpin } from "./components/spinWheel.js";

function tickClock() {
    const now = new Date();
    const cl = document.getElementById("s-clock");
    const dt = document.getElementById("s-date");
    if (cl)
        cl.textContent = now.toLocaleTimeString("nl-NL", {
            hour: "2-digit",
            minute: "2-digit",
        });
    if (dt)
        dt.textContent = now.toLocaleDateString("nl-NL", {
            weekday: "long",
            day: "numeric",
            month: "long",
        });
}

async function fetchQuote() {
    try {
        const r = await fetch("https://dummyjson.com/quotes/random");
        const d = await r.json();
        const q = document.getElementById("s-quote");
        const a = document.getElementById("s-quote-by");
        if (q) q.textContent = `"${d.quote}"`;
        if (a) a.textContent = `— ${d.author}`;
    } catch (e) {
        console.error("Quote fetch error: ", e);
    }
}

function initApp() {
    const domain = window.location.href;
    const domainEl = document.getElementById("domain_name");
    if (domainEl) domainEl.innerText = domain;

    tickClock();
    setInterval(tickClock, 1000);
    fetchQuote();
    setInterval(fetchQuote, 60000);

    initIdentity(false);

    loadUsers();
    loadPlaylist();
    syncMute();
    loadActs();

    setInterval(loadUsers, 12000);
    setInterval(syncMute, 15000);

    if (db) {
        sub("blokbar_state", async () => {
            const data = await dbGet("blokbar_state");

            const spin = data.find(s => s.key === "spinning");
            if (spin && spin.value === "1") {
                await loadActs();
                doSpin();
            }

            const muteRow = data.find(s => s.key === "muted");
            if (muteRow) {
                setIsMuted(muteRow.value === "1");
                applyMute();
            }

            const idxRow = data.find(s => s.key === "play_idx");
            if (idxRow) {
                setPlayIdx(
                    parseInt(idxRow.value) % Math.max(1, state.playlist.length),
                );
                setVideo();
            }

            const curRow = data.find(s => s.key === "yt_current_time");
            const durRow = data.find(s => s.key === "yt_total_duration");
            if (curRow || durRow) {
                const cur = curRow ? parseFloat(curRow.value) : 0;
                const dur = durRow ? parseFloat(durRow.value) : 0;
                renderPlaylist(cur, dur);
            }
        });

        sub("blokbar_users", payload => {
            if (
                payload.eventType === "INSERT" &&
                payload.new.id !== state.myId
            ) {
                notify(`👋 ${payload.new.name} is erbij gekomen!`, "join");
            } else if (payload.eventType === "DELETE" && payload.old?.name) {
                notify(
                    `👋 ${payload.old.name} heeft Blokbar verlaten`,
                    "leave",
                );
            }
        });

        sub("blokbar_timers", payload => {
            if (payload.eventType === "INSERT")
                notify(
                    `⏰ Timer ingesteld: "${payload.new.label}" door ${payload.new.owner_name}`,
                    "timer",
                );
        });

        sub("blokbar_playlist", async (payload) => {
            await loadPlaylist();

            if (payload.eventType === "INSERT") {
                notify(
                    `🎵 "${payload.new.title}" toegevoegd door ${payload.new.added_by}`,
                    "music",
                );
            }
        });
    }
}

window.addEventListener("DOMContentLoaded", () => {
    if (window.YT && window.YT.Player) {
        initApp();
    } else {
        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        
        window.onYouTubeIframeAPIReady = () => {
            initApp();
        };
    }
});