import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// =================================
// 1. SCENE, CAMERA & RENDERER
// =================================

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07090c);
scene.fog = new THREE.FogExp2(0x07090c, 0.036);

const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    100
);
camera.rotation.order = 'YXZ';
camera.position.set(0, 1.7, 17);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
document.body.appendChild(renderer.domElement);

const controls = new PointerLockControls(camera, renderer.domElement);

let gameStarted = false;
let isDraggingLook = false;
let lastPointerX = 0;
let lastPointerY = 0;

function isPlayingActive() {
    return gameStarted && !gameState.cutscenePlaying && !gameState.escaped && !activeModal;
}

// =================================
// 2. PROCEDURAL WEB AUDIO (NO EXTERNAL FILES NEEDED)
// =================================

let audioCtx = null;

function ensureAudio() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            audioCtx = new AudioContextClass();
        }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playTone(freq, duration, type = 'sine', volume = 0.08, endFreq = null) {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq) {
        osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
    }
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration);
}

function playFootstep(sprinting) {
    playTone(sprinting ? 115 : 92, 0.09, 'triangle', sprinting ? 0.06 : 0.04, 48);
}

function playPickupSound() {
    playTone(520, 0.14, 'sine', 0.08, 780);
}

function playDoorSound() {
    playTone(150, 0.35, 'sawtooth', 0.04, 85);
}

function playSchoolBell() {
    playTone(220, 2.2, 'sine', 0.12, 216);
    playTone(440, 1.8, 'triangle', 0.06, 435);
}

// =================================
// 3. LIGHTING & FLASHLIGHT
// =================================

const ambientLight = new THREE.AmbientLight(0xffffff, 0.32);
scene.add(ambientLight);

const FLASHLIGHT_INTENSITY = 155;
const flashlight = new THREE.SpotLight(
    0xffe6bd,
    FLASHLIGHT_INTENSITY,
    36,
    Math.PI / 6,
    0.5,
    1
);
flashlight.position.set(0, 0, 0);
camera.add(flashlight);

const flashlightTarget = new THREE.Object3D();
flashlightTarget.position.set(0, 0, -5);
camera.add(flashlightTarget);
flashlight.target = flashlightTarget;

const playerLight = new THREE.PointLight(0xffe6bd, 0.9, 6);
camera.add(playerLight);

// =================================
// 4. PROCEDURAL TEXTURES & MATERIALS
// =================================

function createGrimeTexture(baseHex, speckHex, repeatX, repeatY) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = baseHex;
    ctx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 1100; i++) {
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        const size = 1 + Math.random() * 3;
        ctx.fillStyle = speckHex;
        ctx.globalAlpha = 0.05 + Math.random() * 0.15;
        ctx.fillRect(x, y, size, size);
    }
    ctx.globalAlpha = 1;

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function createTileFloorTexture(repeatX, repeatY) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#504e46';
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = '#24231e';
    ctx.lineWidth = 3;
    for (let p = 0; p <= 256; p += 64) {
        ctx.beginPath();
        ctx.moveTo(p, 0);
        ctx.lineTo(p, 256);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, p);
        ctx.lineTo(256, p);
        ctx.stroke();
    }

    for (let i = 0; i < 750; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#1c1b17' : '#69665c';
        ctx.globalAlpha = 0.08;
        ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    ctx.globalAlpha = 1;

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function createWoodGrainTexture(baseHex, grainHex, repeatX = 1, repeatY = 1) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = baseHex;
    ctx.fillRect(0, 0, 256, 256);

    for (let y = 0; y < 256; y += 2) {
        ctx.strokeStyle = grainHex;
        ctx.globalAlpha = 0.08 + Math.random() * 0.12;
        ctx.lineWidth = 1 + Math.random();
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(
            85, y + (Math.random() - 0.5) * 6,
            170, y + (Math.random() - 0.5) * 6,
            256, y
        );
        ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function createSignTexture(text, bgHex, textHex) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = bgHex;
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = textHex;
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, 496, 112);

    ctx.fillStyle = textHex;
    ctx.font = 'bold 42px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 66);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

const wallMaterial = new THREE.MeshStandardMaterial({
    map: createGrimeTexture('#7c796e', '#2a2823', 6, 2),
    roughness: 0.95
});
const floorMaterial = new THREE.MeshStandardMaterial({
    map: createTileFloorTexture(5, 18),
    roughness: 0.9
});
const ceilingMaterial = new THREE.MeshStandardMaterial({ color: 0x2d2f33 });
const trimMaterial = new THREE.MeshStandardMaterial({ color: 0x292723, roughness: 0.8 });
const handleMaterial = new THREE.MeshStandardMaterial({
    color: 0xa2a8ae,
    roughness: 0.35,
    metalness: 0.75
});
const doorMaterial = new THREE.MeshStandardMaterial({
    map: createWoodGrainTexture('#3c291e', '#1c120c', 1, 2),
    roughness: 0.85
});
const deskMaterial = new THREE.MeshStandardMaterial({
    map: createWoodGrainTexture('#4e3a2c', '#241912', 2, 2),
    roughness: 0.85
});
const metalLegMaterial = new THREE.MeshStandardMaterial({ color: 0x222426, roughness: 0.6 });
const lockerMaterial = new THREE.MeshStandardMaterial({
    color: 0x3a4742,
    roughness: 0.7,
    metalness: 0.25
});
const boardMaterial = new THREE.MeshStandardMaterial({ color: 0x5c4632, roughness: 0.95 });
const chalkboardMaterial = new THREE.MeshStandardMaterial({ color: 0x1b2b23, roughness: 0.9 });
const paperMaterial = new THREE.MeshStandardMaterial({
    color: 0xe3dcc8,
    emissive: 0x262218,
    roughness: 0.85
});
const keyMaterial = new THREE.MeshStandardMaterial({
    color: 0xe0be63,
    emissive: 0x45350c,
    metalness: 0.8,
    roughness: 0.25
});
const breakerMaterial = new THREE.MeshStandardMaterial({
    color: 0x3b4248,
    metalness: 0.5,
    roughness: 0.5
});

// =================================
// 5. WORLD COLLIDERS, INTERACTABLES & STORY STATE
// =================================

function generateRandomCode() {
    return String(Math.floor(1000 + Math.random() * 9000));
}

const solidBoxes = [];
const walkableTops = [];
const interactables = [];
const animatedDoors = [];

const STAND_EYE_HEIGHT = 1.7;
const CROUCH_EYE_HEIGHT = 1.05;
const CEILING_BOTTOM_Y = 4.0;
const MAX_CAMERA_Y = CEILING_BOTTOM_Y - 0.35;
let currentEyeHeight = STAND_EYE_HEIGHT;

const gameState = {
    exitCode: generateRandomCode(),
    hasStaffKey: false,
    staffDoorUnlocked: false,
    readStudentNotebook: false,
    powerRestored: false,
    cutscenePlaying: false,
    escaped: false,
    inventory: [],
    clues: []
};

const objectiveTextEl = document.getElementById('objectiveText');
const locationTextEl = document.getElementById('locationText');
const questBannerEl = document.getElementById('questBanner');
const inventoryListEl = document.getElementById('inventoryList');
const journalListEl = document.getElementById('journalList');

function setObjective(text) {
    if (objectiveTextEl) objectiveTextEl.textContent = text;
    if (questBannerEl) {
        questBannerEl.textContent = 'OBJECTIVE UPDATED';
        questBannerEl.style.display = 'block';
        setTimeout(() => {
            questBannerEl.style.display = 'none';
        }, 2800);
    }
}

function addItemToInventory(itemName) {
    if (gameState.inventory.includes(itemName)) return;
    gameState.inventory.push(itemName);
    renderJournalAndInventory();
}

function addClue(title, body) {
    if (gameState.clues.some((c) => c.title === title)) return;
    gameState.clues.push({ title, body });
    renderJournalAndInventory();
}

function renderJournalAndInventory() {
    if (inventoryListEl) {
        inventoryListEl.innerHTML = gameState.inventory.length === 0
            ? '<li class="empty-note">No items collected yet.</li>'
            : gameState.inventory.map((item) => `<li>${item}</li>`).join('');
    }
    if (journalListEl) {
        journalListEl.innerHTML = gameState.clues.length === 0
            ? '<p class="empty-note">Inspect notes, boards, and rooms to record clues.</p>'
            : gameState.clues.map((c) => `
                <div class="journal-entry">
                    <strong>${c.title}</strong>
                    <span>${c.body}</span>
                </div>
            `).join('');
    }
}

function createBox(x, y, z, width, height, depth, material, isSolidWall = false) {
    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        material
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    if (isSolidWall) {
        solidBoxes.push({
            minX: x - width / 2,
            maxX: x + width / 2,
            minZ: z - depth / 2,
            maxZ: z + depth / 2
        });
    }
    return mesh;
}

function createSchoolDesk(x, z, inspectTitle = null, inspectText = null, includeChair = true) {
    const topHeight = 0.08;
    const topY = 0.78;
    const topSurfaceY = topY + topHeight / 2;
    const width = 1.2;
    const depth = 0.7;

    const topMesh = createBox(x, topY, z, width, topHeight, depth, deskMaterial);

    const legHeight = topY - topHeight / 2;
    const legY = legHeight / 2;
    const ox = width / 2 - 0.1;
    const oz = depth / 2 - 0.1;
    createBox(x - ox, legY, z - oz, 0.06, legHeight, 0.06, metalLegMaterial);
    createBox(x + ox, legY, z - oz, 0.06, legHeight, 0.06, metalLegMaterial);
    createBox(x - ox, legY, z + oz, 0.06, legHeight, 0.06, metalLegMaterial);
    createBox(x + ox, legY, z + oz, 0.06, legHeight, 0.06, metalLegMaterial);

    if (includeChair) {
        const chairX = x + (x < 0 ? 0.68 : -0.68);
        const seatY = 0.44;
        createBox(chairX, seatY, z, 0.42, 0.05, 0.42, deskMaterial);
        const cLegH = seatY - 0.025;
        createBox(chairX - 0.16, cLegH / 2, z - 0.16, 0.04, cLegH, 0.04, metalLegMaterial);
        createBox(chairX + 0.16, cLegH / 2, z - 0.16, 0.04, cLegH, 0.04, metalLegMaterial);
        createBox(chairX - 0.16, cLegH / 2, z + 0.16, 0.04, cLegH, 0.04, metalLegMaterial);
        createBox(chairX + 0.16, cLegH / 2, z + 0.16, 0.04, cLegH, 0.04, metalLegMaterial);
        createBox(chairX + (x < 0 ? 0.18 : -0.18), 0.66, z, 0.05, 0.42, 0.42, deskMaterial);
    }

    walkableTops.push({
        minX: x - width / 2,
        maxX: x + width / 2,
        minZ: z - depth / 2,
        maxZ: z + depth / 2,
        topY: topSurfaceY
    });

    if (inspectText) {
        interactables.push({
            mesh: topMesh,
            label: 'Inspect Desk',
            type: 'inspect',
            clueTitle: inspectTitle,
            message: inspectText
        });
    }
}

function createSwingDoor(wallSide, z, options = {}) {
    const trimX = wallSide * 3.88;
    const hingeX = wallSide * 3.9;
    const hingeZ = z - 1.0;

    createBox(trimX, 2.86, z, 0.24, 0.12, 2.24, trimMaterial);
    createBox(trimX, 1.4, z - 1.06, 0.24, 2.8, 0.12, trimMaterial);
    createBox(trimX, 1.4, z + 1.06, 0.24, 2.8, 0.12, trimMaterial);

    if (options.signText) {
        const signMat = new THREE.MeshStandardMaterial({
            map: createSignTexture(options.signText, '#1e2124', '#d8cfa8'),
            roughness: 0.7
        });
        createBox(wallSide * 3.82, 3.18, z, 0.05, 0.32, 1.35, signMat);
    }

    const pivot = new THREE.Group();
    pivot.position.set(hingeX, 0, hingeZ);
    scene.add(pivot);

    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.8, 2), doorMaterial);
    panel.position.set(0, 1.4, 1.0);
    panel.castShadow = true;
    panel.receiveShadow = true;
    pivot.add(panel);

    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.14), handleMaterial);
    handle.position.set(-wallSide * 0.1, 1.05, 1.72);
    pivot.add(handle);

    const doorData = {
        pivot,
        panel,
        wallSide,
        isOpen: false,
        targetYaw: 0,
        locked: Boolean(options.locked),
        requiresStaffKey: Boolean(options.requiresStaffKey),
        lockedMessage: options.lockedMessage || 'This door is bolted from the inside.',
        onFirstOpen: options.onFirstOpen || null,
        openedOnce: false
    };

    animatedDoors.push(doorData);

    const item = {
        mesh: panel,
        label: options.label || 'Open / Close Door',
        type: 'door',
        doorData
    };
    interactables.push(item);
    return item;
}

// =================================
// 6. BUILD MAIN CORRIDOR + ENTERABLE ROOMS
// =================================

createBox(0, -0.15, 0, 8, 0.3, 44, floorMaterial);
createBox(0, 4.15, 0, 8, 0.3, 44, ceilingMaterial);

createBox(0, 2, 22.15, 8.6, 4, 0.3, wallMaterial, true);
createBox(0, 2, -22.15, 8.6, 4, 0.3, wallMaterial, true);

createBox(-4, 2, 15, 0.3, 4, 14, wallMaterial, true);
createBox(-4, 2, -8, 0.3, 4, 28, wallMaterial, true);
createBox(-4, 3.4, 7, 0.3, 1.2, 2, wallMaterial, false);

createBox(4, 2, 10, 0.3, 4, 24, wallMaterial, true);
createBox(4, 2, -13, 0.3, 4, 18, wallMaterial, true);
createBox(4, 3.4, -3, 0.3, 1.2, 2, wallMaterial, false);

createBox(-3.82, 0.1, 15, 0.08, 0.2, 14, trimMaterial);
createBox(-3.82, 0.1, -8, 0.08, 0.2, 28, trimMaterial);
createBox(3.82, 0.1, 10, 0.08, 0.2, 24, trimMaterial);
createBox(3.82, 0.1, -13, 0.08, 0.2, 18, trimMaterial);

// --- ROOM 1: SECURITY OFFICE ---
createBox(-7, -0.15, 7, 6.2, 0.3, 6.2, floorMaterial);
createBox(-7, 4.15, 7, 6.2, 0.3, 6.2, ceilingMaterial);
createBox(-10.1, 2, 7, 0.3, 4, 6.4, wallMaterial, true);
createBox(-7, 2, 10.1, 6.4, 4, 0.3, wallMaterial, true);
createBox(-7, 2, 3.9, 6.4, 4, 0.3, wallMaterial, true);

createSchoolDesk(
    -7.8, 7.0,
    'Security Logbook (Oct 14)',
    'Log entry 4:08 PM: "Principal locked the Staff Room and rerouted main exit power to the corridor breaker."'
);

const staffKeyMesh = createBox(-7.7, 0.86, 6.85, 0.22, 0.04, 0.1, keyMaterial);
const staffKeyInteractable = {
    mesh: staffKeyMesh,
    label: 'Pick Up Staff Room Key',
    type: 'pickupKey'
};
interactables.push(staffKeyInteractable);

// --- ROOM 2: STAFF & ARCHIVE ROOM ---
createBox(7.25, -0.15, -3, 6.6, 0.3, 6.2, floorMaterial);
createBox(7.25, 4.15, -3, 6.6, 0.3, 6.2, ceilingMaterial);
createBox(10.5, 2, -3, 0.3, 4, 6.4, wallMaterial, true);
createBox(7.25, 2, 0.1, 6.6, 4, 0.3, wallMaterial, true);
createBox(7.25, 2, -6.1, 6.6, 4, 0.3, wallMaterial, true);

createBox(10.28, 1.9, -3, 0.08, 1.4, 3.2, trimMaterial);
createBox(10.23, 1.9, -3, 0.04, 1.24, 3.0, chalkboardMaterial);

createSchoolDesk(7.8, -3.0, null, null, true);
const notebookMesh = createBox(7.7, 0.84, -3.05, 0.32, 0.04, 0.42, paperMaterial);
interactables.push({
    mesh: notebookMesh,
    label: 'Read Missing Student\'s Notebook',
    type: 'readNotebook'
});

// =================================
// 7. DOORS, BREAKER BOX, EXIT KEYPAD & PROPS
// =================================

createSwingDoor(-1, 7, {
    signText: 'SECURITY OFFICE',
    label: 'Open / Close Security Door',
    locked: false,
    onFirstOpen: () => {
        if (!gameState.hasStaffKey) {
            setObjective('Search the Security Office desk for the Staff Room Key.');
        }
    }
});

const staffDoorItem = createSwingDoor(1, -3, {
    signText: 'STAFF ROOM',
    label: 'Unlock Staff Room [Key Needed]',
    locked: true,
    requiresStaffKey: true,
    lockedMessage: 'Locked. You need the Staff Room Key from the Security Office.'
});

createSwingDoor(-1, -13, { signText: 'ROOM 104', locked: true });
createSwingDoor(1, 12, { signText: 'ROOM 101', locked: true });
createSwingDoor(1, -15, { signText: 'STORAGE', locked: true });

createSchoolDesk(-2.6, 13, 'Carved Desk Warning', 'Scratched deep into the wood: "WHEN THE LAST BELL RINGS, DO NOT LOOK BACK."');
createSchoolDesk(-2.6, -2);
createSchoolDesk(2.6, 5);
createSchoolDesk(2.6, -9);

for (let i = 0; i < 4; i++) {
    createBox(-3.65, 0.95, -6 - i * 0.65, 0.45, 1.9, 0.62, lockerMaterial, true);
}

const noticeBoard = createBox(3.82, 1.65, 2.2, 0.06, 1.1, 1.7, boardMaterial);
createBox(3.78, 1.8, 1.85, 0.02, 0.28, 0.22, paperMaterial);
createBox(3.78, 1.5, 2.45, 0.02, 0.28, 0.22, paperMaterial);
interactables.push({
    mesh: noticeBoard,
    label: 'Read Evacuation Notice',
    type: 'inspect',
    clueTitle: 'Evacuation Notice (1998)',
    message: 'Notice: "Due to an unexplained magnetic surge in the bell tower, classes are suspended indefinitely."'
});

const breakerBox = createBox(-3.78, 1.55, -17, 0.16, 0.85, 0.65, breakerMaterial);
const breakerIndicatorMat = new THREE.MeshStandardMaterial({
    color: 0xaa2222,
    emissive: 0x660000
});
createBox(-3.69, 1.78, -17, 0.04, 0.1, 0.1, breakerIndicatorMat);
interactables.push({
    mesh: breakerBox,
    label: 'Inspect Breaker Box',
    type: 'breaker'
});

createBox(0, 3.06, -21.9, 2.8, 0.12, 0.2, trimMaterial);
createBox(-1.36, 1.5, -21.9, 0.12, 3.0, 0.2, trimMaterial);
createBox(1.36, 1.5, -21.9, 0.12, 3.0, 0.2, trimMaterial);

const leftExitPivot = new THREE.Group();
leftExitPivot.position.set(-1.3, 0, -21.92);
scene.add(leftExitPivot);
const leftExitPanel = createBox(0.65, 1.5, 0, 1.3, 3.0, 0.14, doorMaterial);
scene.remove(leftExitPanel);
leftExitPivot.add(leftExitPanel);

const rightExitPivot = new THREE.Group();
rightExitPivot.position.set(1.3, 0, -21.92);
scene.add(rightExitPivot);
const rightExitPanel = createBox(-0.65, 1.5, 0, 1.3, 3.0, 0.14, doorMaterial);
scene.remove(rightExitPanel);
rightExitPivot.add(rightExitPanel);

let exitDoorsOpen = false;

const exitSignMat = new THREE.MeshStandardMaterial({
    map: createSignTexture('EXIT', '#1a0808', '#441111'),
    emissive: 0x000000
});
createBox(0, 3.42, -21.9, 1.1, 0.34, 0.08, exitSignMat);

const keypadMesh = createBox(1.75, 1.35, -21.92, 0.26, 0.36, 0.08, breakerMaterial);
interactables.push({
    mesh: keypadMesh,
    label: 'Use Exit Keypad',
    type: 'keypad'
});

// =================================
// 8. FLICKERING CEILING LIGHTS
// =================================

const ceilingLights = [];
for (let z = -18; z <= 16; z += 11) {
    const lamp = new THREE.Mesh(
        new THREE.BoxGeometry(1.3, 0.08, 0.5),
        new THREE.MeshBasicMaterial({ color: 0x888877 })
    );
    lamp.position.set(0, 3.95, z);
    scene.add(lamp);

    const light = new THREE.PointLight(0x7c8794, 2.2, 10);
    light.position.set(0, 3.7, z);
    scene.add(light);
    ceilingLights.push(light);
}

// =================================
// 9. INTERACTION, JOURNAL, KEYPAD & CUTSCENE LOGIC
// =================================

const raycaster = new THREE.Raycaster();
const centerScreen = new THREE.Vector2(0, 0);
const interactPromptEl = document.getElementById('interactPrompt');
const messageBoxEl = document.getElementById('messageBox');
const journalModalEl = document.getElementById('journalModal');
const keypadModalEl = document.getElementById('keypadModal');
const keypadInputEl = document.getElementById('keypadInput');
const keypadFeedbackEl = document.getElementById('keypadFeedback');
const cutsceneOverlayEl = document.getElementById('cutsceneOverlay');
const cutsceneLineEl = document.getElementById('cutsceneLine');
const nextCutsceneBtnEl = document.getElementById('nextCutsceneBtn');
const endingScreenEl = document.getElementById('endingScreen');

const cutsceneLines = [
    'The security lock clicks open... the heavy exit doors part into the cold night.',
    'Behind you, the school bell rings one final time... and the hallway goes quiet.'
];
let cutsceneIndex = 0;

let currentTarget = null;
let messageTimeout = null;
let activeModal = null;

function showMessage(text, duration = 4200) {
    if (!messageBoxEl) return;
    messageBoxEl.textContent = text;
    messageBoxEl.style.display = 'block';
    if (messageTimeout) clearTimeout(messageTimeout);
    messageTimeout = setTimeout(() => {
        messageBoxEl.style.display = 'none';
    }, duration);
}

function openModal(type) {
    activeModal = type;
    isDraggingLook = false;
    try { controls.unlock(); } catch (_) {}
    if (type === 'journal' && journalModalEl) journalModalEl.style.display = 'flex';
    if (type === 'keypad' && keypadModalEl) {
        keypadFeedbackEl.textContent = '';
        keypadInputEl.value = '';
        keypadModalEl.style.display = 'flex';
        setTimeout(() => keypadInputEl.focus(), 50);
    }
    if (type === 'ending' && endingScreenEl) endingScreenEl.style.display = 'flex';
}

function closeModalsAndResume() {
    activeModal = null;
    if (journalModalEl) journalModalEl.style.display = 'none';
    if (keypadModalEl) keypadModalEl.style.display = 'none';
    if (!gameState.cutscenePlaying && !gameState.escaped) {
        enterGameplayView();
    }
}

function startEndingCutscene() {
    gameState.cutscenePlaying = true;
    exitDoorsOpen = true;
    cutsceneIndex = 0;

    if (keypadModalEl) keypadModalEl.style.display = 'none';
    if (messageBoxEl) messageBoxEl.style.display = 'none';
    if (interactPromptEl) interactPromptEl.style.display = 'none';

    playDoorSound();
    playSchoolBell();

    if (cutsceneOverlayEl && cutsceneLineEl) {
        cutsceneOverlayEl.style.display = 'flex';
        requestAnimationFrame(() => cutsceneOverlayEl.classList.add('active'));
        cutsceneLineEl.textContent = cutsceneLines[0];
    }
    if (nextCutsceneBtnEl) {
        nextCutsceneBtnEl.textContent = cutsceneLines.length > 1 ? 'NEXT [ ENTER ]' : 'FINISH [ ENTER ]';
    }
}

function advanceCutsceneLine() {
    if (!gameState.cutscenePlaying) return;

    cutsceneIndex++;
    if (cutsceneIndex < cutsceneLines.length) {
        if (cutsceneLineEl) {
            cutsceneLineEl.textContent = cutsceneLines[cutsceneIndex];
        }
        playSchoolBell();
        if (nextCutsceneBtnEl && cutsceneIndex === cutsceneLines.length - 1) {
            nextCutsceneBtnEl.textContent = 'FINISH [ ENTER ]';
        }
    } else {
        if (cutsceneOverlayEl) {
            cutsceneOverlayEl.classList.remove('active');
        }
        setTimeout(() => {
            if (cutsceneOverlayEl) cutsceneOverlayEl.style.display = 'none';
            gameState.cutscenePlaying = false;
            gameState.escaped = true;
            openModal('ending');
        }, 450);
    }
}

nextCutsceneBtnEl?.addEventListener('click', advanceCutsceneLine);

document.getElementById('closeJournalBtn')?.addEventListener('click', closeModalsAndResume);
document.getElementById('cancelCodeBtn')?.addEventListener('click', closeModalsAndResume);
document.getElementById('restartBtn')?.addEventListener('click', () => window.location.reload());

document.getElementById('submitCodeBtn')?.addEventListener('click', () => {
    const val = (keypadInputEl?.value || '').trim();
    if (val === gameState.exitCode) {
        startEndingCutscene();
    } else {
        playTone(130, 0.25, 'sawtooth', 0.08, 90);
        if (keypadFeedbackEl) keypadFeedbackEl.textContent = 'ACCESS DENIED — INCORRECT CODE';
    }
});

keypadInputEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('submitCodeBtn')?.click();
    }
});

function updateInteractionPrompt() {
    if (!isPlayingActive() || !interactPromptEl) {
        currentTarget = null;
        if (interactPromptEl) interactPromptEl.style.display = 'none';
        return;
    }

    raycaster.setFromCamera(centerScreen, camera);
    raycaster.far = 3.2;

    const meshes = interactables.map((item) => item.mesh);
    const hits = raycaster.intersectObjects(meshes, false);

    if (hits.length > 0) {
        const hitMesh = hits[0].object;
        const found = interactables.find((item) => item.mesh === hitMesh);
        if (found) {
            currentTarget = found;
            interactPromptEl.textContent = `[ E ] ${found.label}`;
            interactPromptEl.style.display = 'block';
            return;
        }
    }

    currentTarget = null;
    interactPromptEl.style.display = 'none';
}

function triggerInteraction() {
    if (!currentTarget || !isPlayingActive()) return;

    if (currentTarget.type === 'inspect') {
        if (currentTarget.clueTitle) {
            addClue(currentTarget.clueTitle, currentTarget.message);
        }
        showMessage(currentTarget.message, 4500);
        return;
    }

    if (currentTarget.type === 'pickupKey') {
        gameState.hasStaffKey = true;
        staffKeyMesh.visible = false;
        const idx = interactables.indexOf(staffKeyInteractable);
        if (idx !== -1) interactables.splice(idx, 1);

        staffDoorItem.label = 'Unlock Staff Room';
        addItemToInventory('Staff Room Key');
        addClue('Staff Room Key', 'Found on the Security Office desk. Opens the Staff Room across the corridor.');
        playPickupSound();
        showMessage('Picked up: Staff Room Key.', 3200);
        setObjective('Use the Staff Room Key to unlock the Staff Room across the hall.');
        return;
    }

    if (currentTarget.type === 'readNotebook') {
        gameState.readStudentNotebook = true;
        addItemToInventory('Missing Student\'s Notebook');
        const noteText = `"We hid in the Staff Room when the bell wouldn't stop ringing. The breaker switch is by the north end of the hall, and the main exit override code is ${gameState.exitCode}."`;
        addClue(
            `Student's Notebook (Code: ${gameState.exitCode})`,
            noteText
        );
        playPickupSound();
        showMessage(`Notebook clue recorded in Journal [J]: Exit Code is ${gameState.exitCode}. Restore power at the corridor breaker box!`, 5500);
        setObjective('Restore power at the Breaker Box near the end of the corridor.');
        return;
    }

    if (currentTarget.type === 'breaker') {
        if (!gameState.readStudentNotebook) {
            showMessage('A heavy electrical breaker panel. You should search the Staff Room first to find out which circuit controls the exit.', 4200);
            return;
        }
        if (!gameState.powerRestored) {
            gameState.powerRestored = true;
            breakerIndicatorMat.color.setHex(0x28b446);
            breakerIndicatorMat.emissive.setHex(0x136624);
            exitSignMat.map = createSignTexture('EXIT', '#380a0a', '#ff4d4d');
            exitSignMat.emissive.setHex(0xaa1111);
            exitSignMat.needsUpdate = true;
            playSchoolBell();
            showMessage('Power restored! The EXIT sign at the end of the corridor just lit up.', 4500);
            setObjective('Enter the code from the notebook on the Main Exit Keypad to escape.');
        } else {
            showMessage('Main exit circuit power is active.', 2200);
        }
        return;
    }

    if (currentTarget.type === 'keypad') {
        if (!gameState.powerRestored) {
            showMessage('The keypad screen is dead. Restore electricity at the Breaker Box first.', 3600);
            return;
        }
        openModal('keypad');
        return;
    }

    if (currentTarget.type === 'door') {
        const door = currentTarget.doorData;
        if (door.requiresStaffKey && !gameState.staffDoorUnlocked) {
            if (!gameState.hasStaffKey) {
                showMessage(door.lockedMessage, 3200);
                return;
            }
            gameState.staffDoorUnlocked = true;
            door.locked = false;
            currentTarget.label = 'Open / Close Staff Room';
            showMessage('Unlocked Staff Room with the Staff Room Key.', 2600);
            setObjective('Search the Staff Room for clues about the exit.');
        } else if (door.locked) {
            showMessage(door.lockedMessage, 2800);
            return;
        }

        door.isOpen = !door.isOpen;
        door.targetYaw = door.isOpen ? (-door.wallSide * Math.PI) / 2.1 : 0;
        playDoorSound();
        if (door.isOpen && !door.openedOnce && door.onFirstOpen) {
            door.openedOnce = true;
            door.onFirstOpen();
        }
    }
}

// =================================
// 10. PLAYER MOVEMENT & INPUTS
// =================================

const keys = {};
const walkSpeed = 4.2;
const sprintSpeed = 7.2;
const crouchSpeed = 2.5;
const playerRadius = 0.35;

let verticalVelocity = 0;
const gravity = 18;
const jumpStrength = 7.2;
let onGround = true;
let stepTimer = 0;

document.addEventListener('keydown', (event) => {
    keys[event.code] = true;

    if (gameState.cutscenePlaying) {
        if (event.code === 'Enter' && !event.repeat) {
            event.preventDefault();
            advanceCutsceneLine();
        }
        return;
    }

    if ((event.code === 'KeyJ' || event.code === 'Tab') && !event.repeat && gameStarted && !gameState.escaped) {
        if (!activeModal) {
            event.preventDefault();
            openModal('journal');
            return;
        } else if (activeModal === 'journal') {
            event.preventDefault();
            closeModalsAndResume();
            return;
        }
    }

    if (!isPlayingActive()) return;

    if (event.code === 'Space' && onGround) {
        event.preventDefault();
        verticalVelocity = jumpStrength;
        onGround = false;
    }

    if (event.code === 'KeyF' && !event.repeat) {
        flashlight.visible = !flashlight.visible;
        flashlight.intensity = flashlight.visible ? FLASHLIGHT_INTENSITY : 0;
        const lightStatusEl = document.getElementById('lightStatus');
        if (lightStatusEl) {
            lightStatusEl.textContent = flashlight.visible ? 'ON' : 'OFF';
        }
    }

    if (event.code === 'KeyE' && !event.repeat) {
        triggerInteraction();
    }
});

document.addEventListener('keyup', (event) => {
    keys[event.code] = false;
});

// Drag-to-look fallback when pointer lock is not active
renderer.domElement.addEventListener('mousedown', (e) => {
    if (!isPlayingActive() || controls.isLocked) return;
    if (e.button === 0) {
        isDraggingLook = true;
        lastPointerX = e.clientX;
        lastPointerY = e.clientY;
    }
});

window.addEventListener('mousemove', (e) => {
    if (!isDraggingLook || !isPlayingActive() || controls.isLocked) return;
    const dx = e.clientX - lastPointerX;
    const dy = e.clientY - lastPointerY;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;

    camera.rotation.y -= dx * 0.004;
    camera.rotation.x = THREE.MathUtils.clamp(
        camera.rotation.x - dy * 0.004,
        -Math.PI / 2.2,
        Math.PI / 2.2
    );
});

window.addEventListener('mouseup', () => {
    isDraggingLook = false;
});

// =================================
// 11. START & VIEW CONTROLS
// =================================

function enterGameplayView() {
    if (gameState.cutscenePlaying || gameState.escaped) return;
    gameStarted = true;
    document.getElementById('menu').style.display = 'none';
    document.getElementById('hud').style.display = 'block';
    document.getElementById('crosshair').style.display = 'block';
    try {
        controls.lock();
    } catch (_) {}
}

document.getElementById('startButton')?.addEventListener('click', (e) => {
    e.preventDefault();
    ensureAudio();
    enterGameplayView();
});

controls.addEventListener('lock', () => {
    if (gameState.cutscenePlaying || gameState.escaped) return;
    gameStarted = true;
    document.getElementById('menu').style.display = 'none';
    document.getElementById('hud').style.display = 'block';
    document.getElementById('crosshair').style.display = 'block';
});

// =================================
// 12. COLLISION & LOCATION HELPERS
// =================================

function resolveBoxPush(box) {
    const closestX = THREE.MathUtils.clamp(camera.position.x, box.minX, box.maxX);
    const closestZ = THREE.MathUtils.clamp(camera.position.z, box.minZ, box.maxZ);
    const dx = camera.position.x - closestX;
    const dz = camera.position.z - closestZ;
    const distSq = dx * dx + dz * dz;

    if (distSq < playerRadius * playerRadius) {
        const dist = Math.sqrt(distSq);
        if (dist > 0.0001) {
            const push = playerRadius - dist;
            camera.position.x += (dx / dist) * push;
            camera.position.z += (dz / dist) * push;
        } else {
            camera.position.z = box.maxZ + playerRadius;
        }
    }
}

function updatePlayerLocationLabel() {
    if (!locationTextEl) return;
    if (camera.position.x < -4.1) {
        locationTextEl.textContent = 'SECURITY OFFICE';
    } else if (camera.position.x > 4.1) {
        locationTextEl.textContent = 'STAFF & ARCHIVE ROOM';
    } else {
        locationTextEl.textContent = 'MAIN CORRIDOR';
    }
}

// =================================
// 13. MAIN GAME LOOP
// =================================

let previousTime = performance.now();

function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();
    const delta = Math.min((time - previousTime) / 1000, 0.05);
    previousTime = time;

    if (isPlayingActive()) {
        const isCrouching = Boolean(keys['KeyC'] || keys['ControlLeft'] || keys['ControlRight']);
        const isSprinting = !isCrouching && Boolean(keys['ShiftLeft'] || keys['ShiftRight']);

        const activeSpeed = isCrouching
            ? crouchSpeed
            : (isSprinting ? sprintSpeed : walkSpeed);

        const targetEyeHeight = isCrouching ? CROUCH_EYE_HEIGHT : STAND_EYE_HEIGHT;
        currentEyeHeight = THREE.MathUtils.lerp(
            currentEyeHeight,
            targetEyeHeight,
            Math.min(1, delta * 12)
        );

        const forwardPressed = Boolean(keys['KeyW'] || keys['ArrowUp']);
        const backwardPressed = Boolean(keys['KeyS'] || keys['ArrowDown']);
        const rightPressed = Boolean(keys['KeyD'] || keys['ArrowRight']);
        const leftPressed = Boolean(keys['KeyA'] || keys['ArrowLeft']);

        const moveX = Number(rightPressed) - Number(leftPressed);
        const moveZ = Number(forwardPressed) - Number(backwardPressed);
        const length = Math.hypot(moveX, moveZ);

        if (length > 0) {
            controls.moveRight((moveX / length) * activeSpeed * delta);
            controls.moveForward((moveZ / length) * activeSpeed * delta);

            if (onGround) {
                stepTimer += delta * (isSprinting ? 2.4 : 1.55);
                if (stepTimer >= 0.72) {
                    stepTimer = 0;
                    playFootstep(isSprinting);
                }
            }
        }

        for (const wall of solidBoxes) {
            resolveBoxPush(wall);
        }

        let currentFloorHeight = 0;
        const playerFeetY = camera.position.y - currentEyeHeight;

        for (const box of walkableTops) {
            const withinX =
                camera.position.x >= box.minX - playerRadius * 0.55 &&
                camera.position.x <= box.maxX + playerRadius * 0.55;
            const withinZ =
                camera.position.z >= box.minZ - playerRadius * 0.55 &&
                camera.position.z <= box.maxZ + playerRadius * 0.55;

            if (withinX && withinZ && playerFeetY >= box.topY - 0.15) {
                currentFloorHeight = Math.max(currentFloorHeight, box.topY);
                continue;
            }

            if (playerFeetY < box.topY - 0.08) {
                resolveBoxPush(box);
            }
        }

        verticalVelocity -= gravity * delta;
        camera.position.y += verticalVelocity * delta;

        if (camera.position.y > MAX_CAMERA_Y) {
            camera.position.y = MAX_CAMERA_Y;
            if (verticalVelocity > 0) {
                verticalVelocity = 0;
            }
        }

        const landingCameraY = currentFloorHeight + currentEyeHeight;
        if (camera.position.y <= landingCameraY) {
            camera.position.y = landingCameraY;
            verticalVelocity = 0;
            onGround = true;
        } else if (camera.position.y > landingCameraY + 0.02) {
            onGround = false;
        }

        updatePlayerLocationLabel();
        updateInteractionPrompt();
    }

    for (const door of animatedDoors) {
        door.pivot.rotation.y = THREE.MathUtils.lerp(
            door.pivot.rotation.y,
            door.targetYaw,
            Math.min(1, delta * 8)
        );
    }

    if (exitDoorsOpen) {
        leftExitPivot.rotation.y = THREE.MathUtils.lerp(
            leftExitPivot.rotation.y,
            -Math.PI / 2.2,
            Math.min(1, delta * 3.5)
        );
        rightExitPivot.rotation.y = THREE.MathUtils.lerp(
            rightExitPivot.rotation.y,
            Math.PI / 2.2,
            Math.min(1, delta * 3.5)
        );
    }

    ceilingLights.forEach((light, index) => {
        const base = gameState.powerRestored ? 3.2 : 1.9;
        light.intensity = base + Math.sin(time * 0.004 + index * 2.1) * 0.45;
    });

    flashlight.target.updateMatrixWorld();
    renderer.render(scene, camera);
}

animate();

// =================================
// 14. WINDOW RESIZE
// =================================

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});