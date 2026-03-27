# CinaMídia IPTV — Versão TV-First & Senza SDK

Interface IPTV moderna, rápida e otimizada para o uso em Smart TVs e Navegadores, focada em uma experiência "Netflix-style" com suporte nativo ao **Synamedia Senza SDK**.

## 🚀 Tecnologias
- **Frontend**: Vanilla HTML5, CSS3 e Javascript (Single Page Application).
- **Storage**: IndexedDB (via `idb-keyval`) para persistência de canais e fontes.
- **Protocolos**:
  - **MPEG-DASH (.mpd)**: Via Senza Shaka Player (TV) ou Shaka Player do Google (Web).
  - **HLS (.m3u8/TS)**: Via Hls.js com suporte a modo Foreground na Senza.
- **Backend**: API de Proxy Serverless (Vercel) para contornar CORS e Mixed Content.

## 📺 Funcionalidades Principais
- **Navegação D-Pad**: Totalmente controlável via controle remoto ou teclado (Setas, OK/Enter, Back/Voltar).
- **Sidebar Netflix**: Menu lateral retrátil com acesso rápido a Categorias e Configurações.
- **Auto Setup**: No primeiro acesso, o sistema configura e valida automaticamente as listas integradas (BR Principal e Teste DASH).
- **Senza Lifecycle**: Gerenciamento automático entre Background (DASH) e Foreground (HLS) para garantir o áudio em Smart TVs.
- **Validação de Canais**: Opção de sincronizar apenas canais que estejam online no momento.
- **HUD Dinâmico**: Controle de volume (Setas Cima/Baixo), mute (M) e troca de canais rápida (Cima/Baixo no grid).

## 🛠️ Estrutura do Projeto

```
cinamidia/
├── index.html          # Núcleo da aplicação (UI, Lógica de Player e Navegação)
├── br_categorizada.m3u # Lista principal de canais brasileiros integrada
├── dash_test.m3u       # Lista de canais DASH para testes de hardware (Senza)
├── banner.js           # Exemplo de referência técnica para o SDK Senza
├── vercel.json         # Configurações de deploy e CSP
└── api/
    └── proxy.js        # Proxy para acesso a streams HTTP e bypass de CORS
```

## ⌨️ Comandos do Controle / Teclado
- **Setas (Cima/Baixo/Esq/Dir)**: Navegam entre categorias e canais.
- **OK / Enter**: Abre o canal selecionado.
- **ESC / Back**: Fecha o player de vídeo.
- **M**: Ativa/Desativa o modo mudo.
- **Setas (Cima/Baixo) no Player**: Ajusta o volume com feedback visual (Toast).

## 🌍 Deploy e Deploy Local
Para rodar localmente ou em produção, basta clonar e hospedar em qualquer serviço estático (Vercel recomendado para suporte à API de Proxy).

```bash
# Servir arquivos estáticos (exemplo com serve)
npx serve .
```

---
*CinaMídia — Criado para elevar a experiência de IPTV em grandes telas.*
