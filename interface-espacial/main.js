const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    backgroundColor: "#111111",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  win.loadFile("index.html");
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// --- IPC: lista os itens do launcher a partir do JSON local ---
ipcMain.handle("launcher:get-items", async () => {
  const itemsPath = path.join(__dirname, "launcher-items.json");
  const raw = fs.readFileSync(itemsPath, "utf-8");
  return JSON.parse(raw);
});

// --- IPC: abre um app ou uma pasta/arquivo ---
ipcMain.handle("launcher:open-item", async (_event, item) => {
  try {
    const target = String(item.target).replace(/%USERPROFILE%/gi, os.homedir());

    if (item.type === "path") {
      const errorMessage = await shell.openPath(target); // "" em caso de sucesso
      if (errorMessage) throw new Error(errorMessage);
    } else if (item.type === "app") {
      spawn(target, [], { shell: true, detached: true, stdio: "ignore" }).unref();
    } else {
      throw new Error(`Tipo de item desconhecido: ${item.type}`);
    }

    return { ok: true };
  } catch (err) {
    console.error("[launcher] falha ao abrir item:", err);
    return { ok: false, error: String(err.message || err) };
  }
});