const { contextBridge, ipcRenderer } = require("electron");

// Só expomos exatamente essas duas funções pro renderer — ele nunca tem
// acesso direto ao Node.js/filesystem, só pode pedir essas duas ações
// específicas através do processo principal.
contextBridge.exposeInMainWorld("launcherAPI", {
  getItems: () => ipcRenderer.invoke("launcher:get-items"),
  openItem: (item) => ipcRenderer.invoke("launcher:open-item", item),
});