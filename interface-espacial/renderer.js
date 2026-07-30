import * as THREE from "three";
import { CSS3DRenderer, CSS3DObject } from "three/addons/renderers/CSS3DRenderer.js";

const trackingDot = document.getElementById("tracking-dot");
const trackingText = document.getElementById("tracking-text");
const fpsValue = document.getElementById("fps-value");
const cursorEl = document.getElementById("cursor");

const navItems = document.querySelectorAll(".nav-item");
const subPanel = document.getElementById("sub-panel");
const shapeTools = document.getElementById("shape-tools");
const colorRow = document.getElementById("color-row");

const launcherPanel = document.getElementById("launcher-panel");
const launcherGridEl = document.getElementById("launcher-grid");
const drawRadial = document.getElementById("draw-radial");
const drawRadialSvg = document.getElementById("draw-radial-svg");
const drawHub = document.getElementById("draw-hub");
const browserCardEl = document.getElementById("browser-card");
const browserUrl = document.getElementById("browser-url");
const browserGo = document.getElementById("browser-go");
const browserBack = document.getElementById("browser-back");
const webview = document.getElementById("webview");

const drawCanvas = document.getElementById("draw-canvas");
const drawCtx = drawCanvas.getContext("2d");
const threeCanvasContainer = document.getElementById("three-canvas");
const css3dContainer = document.getElementById("css3d-container");


// Estado — nav ativo: "draw" | "browser" | "windows" | "files" | "settings"

let activeNav = "draw";
let currentColor = "#2563eb";
let isPinching = false;
let isDrawing = false;
let lastPoint = null;
let dragLastNorm = null;
const handPositions = { Left: null, Right: null };

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getActiveObject() {

  if (currentShape)
      return currentShape;

  if (activeNav === "browser")
      return browserObject;

  return null;
}

function getActiveBaseScale() {
  return activeNav === "browser" ? BROWSER_BASE_SCALE : 1;
}

function updateThreeVisibility() {

  threeCanvasContainer.classList.toggle(
      "visible",
      currentShape !== null
  );

  css3dContainer.classList.toggle(
      "visible",
      activeNav === "browser"
  );

}

function setActiveNav(nav) {
  activeNav = nav;
  navItems.forEach((btn) => btn.classList.toggle("active", btn.dataset.nav === nav));

  launcherPanel.classList.toggle("visible", nav === "files");
  updateThreeVisibility();
  stopDrawing();
  dragLastNorm = null;

  const showSub = nav === "windows" || nav === "settings";
  subPanel.classList.toggle("visible", showSub);
  shapeTools.style.display = nav === "windows" ? "flex" : "none";
  colorRow.style.display = nav === "settings" ? "flex" : "none";

  if (nav === "windows" && !currentShape) rebuildShape("box");
}

navItems.forEach((btn)=>{


btn.addEventListener("click",()=>{


switch(btn.dataset.nav){


case "draw":

    loadRadialMenu("draw");

    toggleDrawRadial();

break;



case "windows":

    loadRadialMenu("windows");

    toggleDrawRadial();

break;



case "files":

    loadRadialMenu("files");

    toggleDrawRadial();

break;



case "browser":

    closeDrawRadial();

    setActiveNav("browser");

break;



case "settings":

    console.log("Settings future implementation");

break;


}



});


});


// Menu radial de todos os menus expandidos
// por linhas tracejadas (layout replicado de uma referência visual).

const RADIAL_MENUS = {

    draw: {
        title: "DRAW",
        items: [
            { icon: "pencil", action: "pencil" },
            { icon: "sphere", action: "sphere" },
            { icon: "cylinder", action: "cylinder" },
            { icon: "paint", action: "paint" },
            { icon: "pyramid", action: "pyramid" },
            { icon: "eraser", action: "eraser" },
            { icon: "cube", action: "cube" }
        ]
    },


    windows: {
        title: "WINDOWS",
        items: [
            { icon: "notes", action: "notes" },
            { icon: "folder", action: "folder" },
            { icon: "calculator", action: "calculator" },
            { icon: "settings", action: "settings" }
        ]
    },


    files: {
        title: "FILES",
        items: [
            { icon: "recent", action: "recent" },
            { icon: "documents", action: "documents" },
            { icon: "images", action: "images" },
            { icon: "downloads", action: "downloads" },
            { icon: "folder", action: "folder" }
        ]
    }

};


let currentRadial = "draw";
const RADIAL_LAYOUTS = {


    seven:[

        {x:0,y:-150},
        {x:110,y:-100},
        {x:150,y:15},
        {x:90,y:120},
        {x:-90,y:120},
        {x:-150,y:15},
        {x:-110,y:-100}

    ],



    five:[

        {x:0,y:-160},
        {x:150,y:-50},
        {x:90,y:130},
        {x:-90,y:130},
        {x:-150,y:-50}

    ],



    four:[

        {x:-140,y:-140},
        {x:140,y:-140},
        {x:140,y:140},
        {x:-140,y:140}

    ]

};
let radialOpen = false;

function layoutDrawRadial(){


    const menu = RADIAL_MENUS[currentRadial];

    drawHub.textContent = menu.title;


    const buttons = drawRadial.querySelectorAll(".radial-item");


    buttons.forEach(btn=>{
        btn.style.display="none";
    });



    let layout;


    if(menu.items.length === 7)
        layout = RADIAL_LAYOUTS.seven;


    else if(menu.items.length === 5)
        layout = RADIAL_LAYOUTS.five;


    else if(menu.items.length === 4)
        layout = RADIAL_LAYOUTS.four;


    else
        layout = RADIAL_LAYOUTS.seven;



    drawRadialSvg.innerHTML="";



    menu.items.forEach((item,index)=>{


        const btn = buttons[index];

        const pos = layout[index];


        btn.style.display="flex";

        btn.style.left = `${pos.x-38}px`;

        btn.style.top = `${pos.y-38}px`;

        btn.dataset.action = item.action;



        const img = btn.querySelector("img");

        img.src = `icons/${item.icon}.png`;



        drawRadialSvg.innerHTML += `

        <line

        x1="260"

        y1="260"

        x2="${260+pos.x}"

        y2="${260+pos.y}"

        />

        `;


    });


}
layoutDrawRadial();

function openDrawRadial() {
  radialOpen = true;
  drawRadial.classList.add("visible");
}
function closeDrawRadial() {
  radialOpen = false;
  drawRadial.classList.remove("visible");
}
function toggleDrawRadial() {
  if (radialOpen) closeDrawRadial();
  else openDrawRadial();
}
function loadRadialMenu(menuName){

    currentRadial = menuName;

    layoutDrawRadial();

}

drawHub.addEventListener("click", closeDrawRadial);

const RADIAL_SHAPE_MAP = { sphere: "sphere", cylinder: "cylinder", pyramid: "pyramid", cube: "box" };

drawRadial.querySelectorAll(".radial-item").forEach((btn)=>{


btn.onclick=()=>{


const action = btn.dataset.action;



switch(action){



// DRAW

case "pencil":

    setActiveNav("draw");

break;



case "eraser":

    drawCtx.clearRect(
        0,
        0,
        drawCanvas.width,
        drawCanvas.height
    );

break;



case "paint":

    subPanel.classList.add("visible");

    colorRow.style.display="flex";

    shapeTools.style.display="none";

break;



case "cube":

    rebuildShape("box");

break;



case "sphere":

    rebuildShape("sphere");

break;



case "cylinder":

    rebuildShape("cylinder");

break;



case "pyramid":

    rebuildShape("pyramid");

break;



// WINDOWS

case "notes":

console.log("Notes");

break;


case "folder":

console.log("Folder");

break;


case "calculator":

console.log("Calculator");

break;


case "settings":

console.log("Settings");

break;



// FILES

case "recent":

console.log("Recent");

break;


case "documents":

console.log("Documents");

break;


case "images":

console.log("Images");

break;


case "downloads":

console.log("Downloads");

break;


}



closeDrawRadial();


};


});

shapeTools.querySelectorAll(".tool-btn").forEach((btn) => {
  btn.addEventListener("click", () => {

    rebuildShape(btn.dataset.shape);

    // Esconde o painel de ferramentas
    subPanel.classList.remove("visible");
    shapeTools.style.display = "none";
    colorRow.style.display = "none";

  });
});

colorRow.querySelectorAll(".color-swatch").forEach((btn) => {
  btn.addEventListener("click", () => {
    currentColor = btn.dataset.color;
    colorRow.querySelectorAll(".color-swatch").forEach((b) => b.classList.toggle("active", b === btn));
    drawCtx.strokeStyle = currentColor;
    if (currentShape) currentShape.material.color.set(currentColor);
  });
});


// Canvas de desenho

function resizeCanvas() {
  drawCanvas.width = window.innerWidth;
  drawCanvas.height = window.innerHeight;
  drawCtx.lineJoin = "round";
  drawCtx.lineCap = "round";
  drawCtx.lineWidth = 4;
  drawCtx.strokeStyle = currentColor;
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

function startDrawing() { isDrawing = true; lastPoint = null; }
function stopDrawing() { isDrawing = false; lastPoint = null; }

function drawTo(x, y) {
  if (lastPoint) {
    drawCtx.beginPath();
    drawCtx.moveTo(lastPoint.x, lastPoint.y);
    drawCtx.lineTo(x, y);
    drawCtx.stroke();
  }
  lastPoint = { x, y };
}


// Cena 3D (WebGL)  formas geométricas (modo "Windows")

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.z = 4;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0);
renderer.setSize(window.innerWidth, window.innerHeight);
threeCanvasContainer.appendChild(renderer.domElement);

const SHAPE_GEOMETRIES = {
  box: () => new THREE.BoxGeometry(1, 1, 1),
  sphere: () => new THREE.SphereGeometry(0.6, 32, 32),
  cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1.1, 32),
  pyramid: () => new THREE.ConeGeometry(0.7, 1.2, 4), // 4 lados = pirâmide, não cone redondo
};

let currentShape = null;
let currentShapeType = null;

function rebuildShape(shapeType) {
  if (currentShapeType === shapeType) return;
  const previousScale = currentShape ? currentShape.scale.x : 1;
  if (currentShape) scene.remove(currentShape);

  const geometry = SHAPE_GEOMETRIES[shapeType]();
  const material = new THREE.MeshBasicMaterial({ color: currentColor });
  currentShape = new THREE.Mesh(geometry, material);
  currentShape.scale.setScalar(previousScale);
  scene.add(currentShape);
  currentShapeType = shapeType;

  shapeTools.querySelectorAll(".tool-btn").forEach((b) => b.classList.toggle("active", b.dataset.shape === shapeType));
  updateThreeVisibility();
}


// Cena CSS3D — navegador flutuante (modo "Browser")

const cssScene = new THREE.Scene();
const cssRenderer = new CSS3DRenderer();
cssRenderer.setSize(window.innerWidth, window.innerHeight);
css3dContainer.appendChild(cssRenderer.domElement);

const BROWSER_BASE_SCALE = 0.0032;

browserCardEl.style.display = "flex";
const browserObject = new CSS3DObject(browserCardEl);
browserObject.scale.setScalar(BROWSER_BASE_SCALE);
cssScene.add(browserObject);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  cssRenderer.setSize(window.innerWidth, window.innerHeight);
});

function normalizeUrl(value) {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.includes(".") && !trimmed.includes(" ")) return `https://${trimmed}`;
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}
function navigateBrowser() { webview.src = normalizeUrl(browserUrl.value); }

browserGo.addEventListener("click", navigateBrowser);
browserUrl.addEventListener("keydown", (e) => { if (e.key === "Enter") navigateBrowser(); });
browserBack.addEventListener("click", () => { if (webview.canGoBack()) webview.goBack(); });
webview.addEventListener("did-navigate", () => { browserUrl.value = webview.src; });


// Loop de render + contador de FPS real

let frameCount = 0;
let lastFpsUpdate = performance.now();

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
  cssRenderer.render(cssScene, camera);

  frameCount++;
  const now = performance.now();
  if (now - lastFpsUpdate >= 1000) {
    fpsValue.textContent = frameCount;
    frameCount = 0;
    lastFpsUpdate = now;
  }
}
animate();


// Launcher 

let launcherItems = [];

async function loadLauncherItems() {
  launcherItems = await window.launcherAPI.getItems();
  launcherGridEl.innerHTML = "";
  for (const item of launcherItems) {
    const el = document.createElement("div");
    el.className = "item-card hand-clickable";
    el.dataset.name = item.name;

    if (item.icon) {
      const img = document.createElement("img");
      img.src = item.icon;
      img.alt = item.name;
      img.onerror = () => { img.remove(); el.appendChild(makeLabel(item.name)); };
      el.appendChild(img);
    } else {
      el.appendChild(makeLabel(item.name));
    }

    el.addEventListener("click", () => window.launcherAPI.openItem(item));
    launcherGridEl.appendChild(el);
  }
}
function makeLabel(text) {
  const span = document.createElement("span");
  span.textContent = text;
  return span;
}
loadLauncherItems();


// Interação por gesto: hover + Pinca (uma mão) "clica" em QUALQUER
// elemento .hand-clickable visível na tela.

function updateHoveredClickable(clientX, clientY) {
  const elements = document.querySelectorAll(".hand-clickable");
  let found = null;
  elements.forEach((el) => {
    if (el.offsetParent === null) {
      el.classList.remove("hovered");
      return;
    }
    const rect = el.getBoundingClientRect();
    const inside =
      clientX >= rect.left && clientX <= rect.right &&
      clientY >= rect.top && clientY <= rect.bottom;
    el.classList.toggle("hovered", inside);
    if (inside) found = el;
  });
  return found;
}


// Bridge WebSocket

function connect() {
  const ws = new WebSocket("ws://localhost:8765");

  ws.onopen = () => {
    trackingDot.classList.add("online");
    trackingText.textContent = "ON";
  };
  ws.onclose = () => {
    trackingDot.classList.remove("online");
    trackingText.textContent = "OFF";
    setTimeout(connect, 1500);
  };
  ws.onerror = () => ws.close();

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "position") {
      handPositions[data.hand] = { x: data.x, y: data.y };

      const active = getActiveObject();
      if (active && handPositions.Left && handPositions.Right) {
        const dx = handPositions.Left.x - handPositions.Right.x;
        const dy = handPositions.Left.y - handPositions.Right.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        active.scale.setScalar(getActiveBaseScale() * clamp(dist * 3.2, 0.3, 3.2));
      }

      if (data.hand === "Right") {
        const x = data.x * window.innerWidth;
        const y = data.y * window.innerHeight;
        cursorEl.style.left = `${x}px`;
        cursorEl.style.top = `${y}px`;

        updateHoveredClickable(x, y);

        if (activeNav === "draw" && isDrawing) {
          drawTo(x, y);
        } else if (active && isPinching) {
          const hoveredUi = document.querySelector(".hand-clickable.hovered");
          if (hoveredUi) {
            dragLastNorm = null;
          } else {
            if (dragLastNorm) {
              active.rotation.y += (data.x - dragLastNorm.x) * 6;
              active.rotation.x += (data.y - dragLastNorm.y) * 6;
            }
            dragLastNorm = { x: data.x, y: data.y };
            active.position.x = (data.x - 0.5) * 4.5;
            active.position.y = (0.5 - data.y) * 3.2;
          }
        }
      }
    }

    if (data.type === "gesture" && data.hand === "Right") {
      isPinching = data.gesture === "Pinca";
      cursorEl.classList.toggle("selecting", isPinching);
      if (!isPinching) dragLastNorm = null;

      if (isPinching) {
        const hovered = document.querySelector(".hand-clickable.hovered");
        if (hovered) {
          hovered.click();
        } else if (activeNav === "draw") {
          startDrawing();
        }
      } else if (activeNav === "draw") {
        stopDrawing();
      }
    }

    if (data.type === "gesture" && data.hand === "Left" && data.gesture === "Mao aberta" && activeNav === "draw") {
      drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    }
  };
}
connect();

setActiveNav("draw");