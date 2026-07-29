# Interface Espacial por Gestos

Interface para Windows controlada pelas mãos, usando apenas uma webcam. Rastreia até duas mãos em tempo real, transforma gestos em comandos e projeta uma interface flutuante (menu circular, desenho 2D e formas 3D) sobre a imagem ao vivo da câmera.

Projeto experimental, em desenvolvimento por fases.

## Funcionalidades atuais

- **Rastreamento de mãos em tempo real** (até 2 mãos simultâneas), 100% local, sem enviar vídeo pra nenhum servidor externo
- **Reconhecimento de gestos**: mão aberta, punho fechado, pinça, apontando
- **Menu circular flutuante** controlado por apontar + pinça (ou mouse), com dois modos:
  - **Launcher**: grade de atalhos pra abrir programas e pastas, com ícone por item
  - **Criar**: desenho 2D (pinça = caneta) e formas 3D pré-definidas (cubo, esfera, cilindro)
- **Redimensionar formas 3D com as duas mãos** — afastar as mãos aumenta, aproximar diminui
- **Paleta de cores simples**, selecionável por gesto ou clique
- **Configuração persistente em SQLite**: sensibilidade da pinça, suavização de gestos e o mapeamento gesto → ação, tudo ajustável sem editar código
- **Streaming da câmera ao vivo** (MJPEG) como fundo da interface

## Arquitetura

```
Webcam
  │
  ▼
Backend Python (main.py)
  ├─ OpenCV + MediaPipe Tasks  → rastreia mãos, classifica gestos
  ├─ SQLite (config.db)        → config e mapeamento gesto → ação
  ├─ WebSocket  (porta 8765)   → publica eventos de gesto/posição
  └─ HTTP MJPEG (porta 8766)   → publica o vídeo da câmera anotado
                │
                ▼
Frontend Electron (interface-espacial/)
  ├─ index.html + renderer.js  → menu circular, desenho, launcher
  ├─ Three.js                  → renderização das formas 3D
  ├─ main.js + preload.js      → abre apps/pastas via IPC (Node.js)
  └─ launcher-items.json       → itens do launcher (nome, tipo, ícone)
```

Backend e frontend são dois processos separados que conversam só por WebSocket/HTTP em `localhost` — o Electron não sabe nada sobre visão computacional, e o Python não sabe nada sobre a interface.

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Visão computacional | Python, OpenCV, MediaPipe Tasks (HandLandmarker) |
| Persistência | SQLite (biblioteca padrão do Python) |
| Comunicação em tempo real | WebSocket (`websockets`), HTTP MJPEG (`http.server`) |
| Interface desktop | Electron |
| Renderização 3D | Three.js |

## Estrutura de pastas

```
MediaPipeProjeto/
├── .venv/                      # ambiente virtual Python
├── main.py                     # ponto de entrada do backend
├── db.py                       # camada de persistência (SQLite)
├── list_config.py              # utilitário CLI pra ver/editar config
├── hand_landmarker.task         # modelo do MediaPipe (baixado automaticamente)
├── config.db                    # banco SQLite (criado automaticamente)
└── interface-espacial/
    ├── main.js                  # processo principal do Electron
    ├── preload.js                # ponte segura IPC (main ↔ renderer)
    ├── renderer.js               # lógica da interface (menu, desenho, 3D)
    ├── index.html                 # estrutura visual
    ├── launcher-items.json        # atalhos do launcher (editável)
    └── package.json
```

## Pré-requisitos

- Python 3.9–3.12 ([python.org](https://www.python.org/downloads/))
- Node.js LTS ([nodejs.org](https://nodejs.org/en/download))
- Webcam funcional

## Instalação

**Backend:**

```powershell
cd MediaPipeProjeto
python -m venv .venv
.venv\Scripts\activate
pip install mediapipe opencv-python websockets
```

**Frontend:**

```powershell
cd interface-espacial
npm install
```

## Como rodar

Em dois terminais separados:

```powershell
# Terminal 1 — backend
cd MediaPipeProjeto
.venv\Scripts\activate
python main.py

# Terminal 2 — frontend
cd MediaPipeProjeto\interface-espacial
npm start
```

O backend precisa estar rodando **antes** de abrir o Electron, senão a interface fica esperando conexão.

## Como usar

| Gesto | Ação |
|---|---|
| Apontar + Pinça sobre um botão | Clicar (equivalente a clique de mouse) |
| Pinça segurada (fora de botões, modo Desenho) | Desenhar |
| Mão esquerda aberta (modo Desenho) | Limpar o desenho |
| Duas mãos se afastando (modo Criar, com uma forma ativa) | Aumentar a forma |
| Duas mãos se aproximando | Diminuir a forma |
| Pinça segurada sobre a forma (fora de botões) | Arrastar a forma pela tela |

Tudo também funciona por mouse, caso prefira testar sem usar a câmera.

## Configuração

O `list_config.py` permite ajustar o comportamento sem mexer no código:

```powershell
python list_config.py                              # lista config e mapeamentos atuais
python list_config.py set pinch_threshold 0.3       # ajusta sensibilidade da pinça
python list_config.py map "Punho fechado" "acao_x"  # muda o que um gesto dispara
```

Personalizar os atalhos do launcher: editar `interface-espacial/launcher-items.json`. Ícones são opcionais — sem imagem, o card mostra o nome em texto.

## Status do projeto

Experimental, em desenvolvimento ativo. Ainda não há:

- Testes automatizados
- Build empacotado para distribuição no Windows
- Manipulação de modelos GLB

## Aviso

Este projeto não substitui mouse, teclado ou ferramentas CAD é uma exploração de interação espacial acessível, local-first, sem depender de headset ou sensores proprietários.


<p align="center">
  Developed by Eduardo
</p>