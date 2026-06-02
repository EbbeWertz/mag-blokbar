import { db, state, setPlayIdx, setIsMuted } from "./shared/config.js";
import { dbGet, sub } from "./shared/db.js";
import { notify } from "./shared/utils.js";
import { initIdentity, loadUsers } from "./components/identity.js";
import {
	loadPlaylist,
	syncMute,
	applyMute,
	setVideo,
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
			second: "2-digit",
		});
	if (dt)
		dt.textContent = now.toLocaleDateString("nl-NL", {
			weekday: "long",
			day: "numeric",
			month: "long",
			year: "numeric",
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

window.addEventListener("DOMContentLoaded", () => {
    const domain = window.location.href;
	document.getElementById("domain_name").innerText = domain;
	// new QRCode(document.getElementById("qrcode"), {
	// 	text: domain,
	// 	width: 128, // Width in pixels
	// 	height: 128, // Height in pixels
	// 	colorDark: "#000000",
	// 	colorLight: "#ffffff",
	// 	correctLevel: QRCode.CorrectLevel.H, // High error correction (good for screens)
	// });

	// Setup clock cycles
	tickClock();
	setInterval(tickClock, 1000);
	fetchQuote();
	setInterval(fetchQuote, 60000);

	// Non-dashboard user tracking setup
	initIdentity(false);

	// Load initial elements
	loadUsers();
	loadPlaylist();
	syncMute();
	loadActs();

	// Sync fallback intervals
	setInterval(loadUsers, 12000);
	setInterval(syncMute, 15000);

	// Set up real-time stream subscriptions
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

		sub("blokbar_playlist", payload => {
			if (payload.eventType === "INSERT")
				notify(
					`🎵 "${payload.new.title}" toegevoegd door ${payload.new.added_by}`,
					"music",
				);
		});
	}
});
