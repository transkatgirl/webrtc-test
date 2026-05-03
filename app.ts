// Simplified version of a larger project; Sorry for the mess!

import bs58 from "bs58";
import {
	createRoomCredentials,
	Room,
	type RoomCredentials,
} from "./room/webrtc";
import { idFromString, idToString, selfId, setSelfId } from "./room/core";

const defaultMqttEndpoint = "wss://broker.emqx.io:8084/mqtt";
const defaultIceServers: RTCIceServer[] = [
	{ urls: "stun:stun.l.google.com:19302" },
	{ urls: "stun:stun1.l.google.com:19302" },
	{ urls: "stun:stun2.l.google.com:19302" },
	{ urls: "stun:stun3.l.google.com:19302" },
	{ urls: "stun:stun4.l.google.com:19302" },
	{ urls: "stun:stun.cloudflare.com:3478" },
];

const fragment = new URL(window.location.href).hash.substring(1);
const params: URLSearchParams = new URL(window.location.href).searchParams;

enum Role {
	Sender = "sender",
	Receiver = "receiver",
}

if (params.has("role") && params.has("id")) {
	let roleString = params.get("role");
	let id = params.get("id");
	let password: string | undefined = fragment;

	let role;
	if (roleString == Role.Sender) {
		role = Role.Sender;
	} else if (roleString == Role.Receiver) {
		role = Role.Receiver;
	}

	if (role && id && password) {
		await launchApp(role, id, password, params);
	} else {
		helperMenu();
	}
} else {
	helperMenu();
}

function helperMenu() {
	document.title = "WebRTC Test";

	document.body.innerHTML = "<h1>WebRTC Test</h1>";

	const roomLabel = document.createElement("label");
	roomLabel.htmlFor = "room";
	roomLabel.innerText = "Room ID: ";
	const roomInput = document.createElement("input");
	roomInput.id = "room";
	roomInput.type = "text";
	roomInput.required = true;
	roomInput.size = 8;
	roomInput.value = generateRandom(4);

	const passwordLabel = document.createElement("label");
	passwordLabel.htmlFor = "pass";
	passwordLabel.innerText = "Room Password: ";
	const passwordInput = document.createElement("input");
	passwordInput.id = "pass";
	passwordInput.type = "text";
	passwordInput.required = true;
	passwordInput.size = 16;
	passwordInput.value = generateRandom(8);

	document.body.appendChild(roomLabel);
	document.body.appendChild(roomInput);
	document.body.appendChild(document.createElement("br"));
	document.body.appendChild(passwordLabel);
	document.body.appendChild(passwordInput);

	document.body.insertAdjacentHTML(
		"beforeend",
		"<p>Reloading this page will generate new random credentials.</p><p>Use the following URLs to start streaming:</p>"
	);

	const senderLabel = document.createElement("label");
	senderLabel.innerText = "Sender: ";
	senderLabel.htmlFor = "sender";
	const senderText = document.createElement("pre");
	senderText.id = "sender";
	senderText.style.backgroundColor = "lightcoral";

	const receiverLabel = document.createElement("label");
	receiverLabel.innerText = "Receiver: ";
	receiverLabel.htmlFor = "receiver";
	const receiverText = document.createElement("pre");
	receiverText.id = "receiver";
	receiverText.style.backgroundColor = "lightseagreen";

	senderText.innerText = generateURL(
		Role.Sender,
		roomInput.value,
		passwordInput.value
	);
	receiverText.innerText = generateURL(
		Role.Receiver,
		roomInput.value,
		passwordInput.value
	);

	roomInput.addEventListener("input", (event) => {
		senderText.innerText = generateURL(
			Role.Sender,
			roomInput.value,
			passwordInput.value
		);
		receiverText.innerText = generateURL(
			Role.Receiver,
			roomInput.value,
			passwordInput.value
		);
	});
	passwordInput.addEventListener("input", (event) => {
		senderText.innerText = generateURL(
			Role.Sender,
			roomInput.value,
			passwordInput.value
		);
		receiverText.innerText = generateURL(
			Role.Receiver,
			roomInput.value,
			passwordInput.value
		);
	});

	document.body.appendChild(senderLabel);
	document.body.appendChild(senderText);

	document.body.appendChild(receiverLabel);
	document.body.appendChild(receiverText);

	document.body.insertAdjacentHTML(
		"beforeend",
		'<h2>URL parameters</h2><ul><li><code>role</code> = Role (<code>sender</code> or <code>receiver</code>)</li><li><code>id</code> = Room ID</li><li>Fragment = Room Password</li><li><code>mqttEndpoint</code> (optional) = <a href="https://github.com/mqttjs/MQTT.js#mqttconnecturl-options">MQTT WebSocket endpoint URL</a> (string); Used for WebRTC signaling</li><li><code>iceServers</code> (optional) = <a href="https://w3c.github.io/webrtc-pc/#dom-rtcconfiguration-iceservers">WebRTC ICE Servers</a> (JSON-encoded list of <a href="https://w3c.github.io/webrtc-pc/#dom-rtciceserver">RTCIceServer</a> objects)</li></ul>'
	);
}

function generateRandom(bytes: number) {
	const data = new Uint8Array(bytes);
	self.crypto.getRandomValues(data);
	return bs58.encode(data);
}

function generateURL(role: Role, id: string, pass: string): string {
	const url = new URL(window.location.href);
	url.search = "";
	url.searchParams.set("role", role);
	url.searchParams.set("id", id);
	url.hash = pass;
	return url.toString();
}

async function launchApp(
	role: Role,
	roomId: string,
	password: string,
	params: URLSearchParams
) {
	document.body.id = "app";

	if (role == Role.Sender && selfId % 2n == 0n) {
		setSelfId(selfId - 1n); // Senders have odd IDs
	}

	if (role == Role.Receiver && selfId % 2n == 1n) {
		setSelfId(selfId - 1n); // Receivers have even IDs
	}

	console.log(`role = ${role}, peer ID = ${idToString(selfId)}`);

	const credentials = await createRoomCredentials(roomId, password);

	let mqttEndpoint = defaultMqttEndpoint;
	let iceServers: any;

	if (params.has("mqttEndpoint")) {
		mqttEndpoint = params.get("mqttEndpoint") as string;
	}

	if (params.has("iceServers")) {
		iceServers = JSON.parse(params.get("iceServers") as string);

		if (!Array.isArray(iceServers)) {
			iceServers = defaultIceServers;
		}
	} else {
		iceServers = defaultIceServers;
	}

	if (role == Role.Sender) {
		await launchSender(credentials, mqttEndpoint, iceServers);
	}

	if (role == Role.Receiver) {
		await launchReceiver(credentials, mqttEndpoint, iceServers);
	}
}

async function launchSender(
	credentials: RoomCredentials,
	mqttEndpoint: string,
	iceServers: any
) {
	const stream = await navigator.mediaDevices.getUserMedia({
		video: true,
		audio: true,
	});

	const video = document.createElement("video");
	video.autoplay = true;
	video.muted = true;
	video.controls = true;
	video.playsInline = true;
	video.srcObject = stream;
	video.classList.add("preview");
	document.body.appendChild(video);

	(globalThis as any).stream = stream;
	(globalThis as any).room = new Room(
		mqttEndpoint,
		credentials,
		{
			bundlePolicy: "max-bundle",
			iceCandidatePoolSize: 10,
			iceServers,
		},
		(peerId, peer) => {
			if (peer.pc && idFromString(peerId) % 2n == 0n) {
				// only configure alive receiver peers
				stream.getTracks().forEach((track) => {
					if (!peer.pc) return;

					peer.pc.addTransceiver(track, {
						streams: [stream],
					});
				});
			}
		},
		(_peerId, _peer) => {},
		() => {},
		(_, m) => m,
		(_, m) => m,
		(_, m) => m,
		(_, m) => m,
		2_000,
		true
	);
	stream.onaddtrack = async (event) => {
		for (const [peerId, peer] of Object.entries(
			((globalThis as any).room as Room).peers
		)) {
			if (!peer.pc || idFromString(peerId) % 2n != 0n) continue; // skip dead peers and sender peers

			peer.pc.addTransceiver(event.track, {
				streams: [stream],
			});
		}
	};
	stream.onremovetrack = async (event) => {
		for (const [peerId, peer] of Object.entries(
			((globalThis as any).room as Room).peers
		)) {
			if (!peer.pc || idFromString(peerId) % 2n != 0n) continue; // skip dead peers and sender peers

			for (const transceiver of peer.pc.getTransceivers()) {
				if (transceiver.sender.track?.id == event.track.id) {
					transceiver.stop();
				}
			}
		}
	};
}

async function launchReceiver(
	credentials: RoomCredentials,
	mqttEndpoint: string,
	iceServers: any
) {
	const peerVideos: Record<string, HTMLVideoElement> = {};
	const videoContainer = document.createElement("div");
	videoContainer.classList.add("gallery");
	document.body.appendChild(videoContainer);

	(globalThis as any).room = new Room(
		mqttEndpoint,
		credentials,
		{
			iceCandidatePoolSize: 10,
			iceServers,
		},
		(peerId, peer) => {
			if (!peer.pc) return;

			peer.pc.ontrack = (event) => {
				let video = peerVideos[peerId];

				if (!video) {
					video = document.createElement("video");
					video.autoplay = true;
					video.controls = true;
					video.playsInline = true;
					video.id = peerId;
					video.title = peerId;

					videoContainer.appendChild(video);
					updateGalleryStyles(videoContainer);
				}

				peerVideos[peerId] = video;

				const stream = event.streams[0];

				if (stream) {
					video.srcObject = stream;
				}
			};
		},
		(peerId, peer) => {
			if (!peer.pc) return;

			peer.pc.ontrack = null;

			let video = peerVideos[peerId];
			if (video) {
				if (video.srcObject) {
					(video.srcObject as MediaStream)
						.getTracks()
						.forEach((track) => track.stop());
				}
				video.srcObject = null;
				videoContainer.removeChild(video);
				delete peerVideos[peerId];
				updateGalleryStyles(videoContainer);
			}
		},
		() => {},
		(_, m) => m,
		(_, m) => m,
		(_, m) => m,
		(_, m) => m,
		1_000,
		false
	);

	const resizeObserver = new ResizeObserver((entries) => {
		requestAnimationFrame(() => {
			for (const entry of entries) {
				updateGalleryStyles(entry.target as HTMLElement);
			}
		});
	});

	resizeObserver.observe(videoContainer);
}

function updateGalleryStyles(container: HTMLElement) {
	if (container.childElementCount <= 1) {
		container.style.gridTemplateColumns = "1fr";
		container.style.gridTemplateRows = "1fr";
	} else {
		if (container.childElementCount == 2) {
			if (container.clientWidth > container.clientHeight) {
				container.style.gridTemplateColumns = "repeat(2, 1fr)";
				container.style.gridTemplateRows = "1fr";
			} else {
				container.style.gridTemplateColumns = "1fr";
				container.style.gridTemplateRows = "repeat(2, 1fr)";
			}
		} else if (container.childElementCount <= 4) {
			container.style.gridTemplateColumns = "repeat(2, 1fr)";
			container.style.gridTemplateRows = "repeat(2, 1fr)";
		} else if (container.childElementCount <= 6) {
			if (container.clientWidth > container.clientHeight) {
				container.style.gridTemplateColumns = "repeat(3, 1fr)";
				container.style.gridTemplateRows = "repeat(2, 1fr)";
			} else {
				container.style.gridTemplateColumns = "repeat(2, 1fr)";
				container.style.gridTemplateRows = "repeat(3, 1fr)";
			}
		} else if (container.childElementCount <= 9) {
			container.style.gridTemplateColumns = "repeat(3, 1fr)";
			container.style.gridTemplateRows = "repeat(3, 1fr)";
		} else if (container.childElementCount <= 12) {
			if (container.clientWidth > container.clientHeight) {
				container.style.gridTemplateColumns = "repeat(4, 1fr)";
				container.style.gridTemplateRows = "repeat(3, 1fr)";
			} else {
				container.style.gridTemplateColumns = "repeat(3, 1fr)";
				container.style.gridTemplateRows = "repeat(4, 1fr)";
			}
		} else if (container.childElementCount <= 16) {
			container.style.gridTemplateColumns = "repeat(4, 1fr)";
			container.style.gridTemplateRows = "repeat(4, 1fr)";
		} else if (container.childElementCount <= 20) {
			if (container.clientWidth > container.clientHeight) {
				container.style.gridTemplateColumns = "repeat(5, 1fr)";
				container.style.gridTemplateRows = "repeat(4, 1fr)";
			} else {
				container.style.gridTemplateColumns = "repeat(4, 1fr)";
				container.style.gridTemplateRows = "repeat(5, 1fr)";
			}
		} else {
			container.style.gridTemplateColumns = "repeat(5, 1fr)";
			container.style.gridTemplateRows = "repeat(5, 1fr)";
		}
	}
}
