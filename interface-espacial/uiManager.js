export class UIManager {
  constructor(options) {
    Object.assign(this, options);
    this.activeNav = null;
  }

  bindNavigation() {
    this.navItems.forEach((button) => {
      button.addEventListener("click", () => this.open(button.dataset.nav));
    });
  }

  open(nav) {
    if (!nav) return;

    this.closeEverything();
    this.activeNav = nav;
    this.navItems.forEach((button) => {
      button.classList.toggle("active", button.dataset.nav === nav);
    });

    switch (nav) {
      case "draw":
        this.openMenu("draw");
        break;

      case "browser":
        this.show(this.css3dContainer);
        break;

      case "windows":
        this.openMenu("windows");
        break;

      case "files":
        this.openMenu("files");
        break;

      case "settings":
       //implemetação futura
        
        break;

      default:
        console.warn(`UIManager: menu desconhecido: ${nav}`);
    }

    this.syncVisibility?.();
  }

  openMenu(menu) {
    this.loadRadialMenu(menu);
    this.openRadial();
  }

  closeEverything() {
    this.closeRadial();
    this.hide(this.launcherPanel);
    this.hide(this.subPanel);
    this.hide(this.css3dContainer);
    this.hide(this.threeCanvasContainer);
    this.shapeTools.style.display = "none";
    this.colorRow.style.display = "none";
    this.stopDrawing();
    this.resetDrag();
  }

  show(element) {
    element.classList.add("visible");
  }

  hide(element) {
    element.classList.remove("visible");
  }
}

export default UIManager;
