# AdeBot - WhatsApp Bot com IA

Um bot do WhatsApp inteligente com recursos de IA, incluindo processamento de imagens, conversão de áudio em texto e interação através do Google Gemini.

## 🚀 Funcionalidades

- 💬 Chat inteligente usando Google Gemini
- 🖼️ Criação e manipulação de figurinhas
- 🎵 Download de áudios e vídeos do TikTok
- 🔍 Pesquisa na internet
- 🗣️ Transcrição de áudio para texto
- 🎨 Análise de imagens com Google Vision AI

## ⚙️ Requisitos

- Node.js >= 18.0.0
- Conta no Firebase
- Credenciais do Google Cloud
- WhatsApp (número ativo)

## 📦 Instalação

1. Clone o repositório:
\\\ash
git clone https://github.com/devadeiltonlima/botdev.git
cd botdev
\\\

2. Instale as dependências:
\\\ash
npm install
\\\

3. Configure as variáveis de ambiente:
\\\ash
cp .env.example .env
# Edite o arquivo .env com suas credenciais
\\\

4. Configure o Firebase:
   - Crie um projeto no [Firebase Console](https://console.firebase.google.com)
   - Baixe o arquivo de credenciais do service account
   - Configure o FIREBASE_SERVICE_ACCOUNT no .env

5. Configure o Google Cloud:
   - Ative as APIs necessárias (Vision AI, Speech-to-Text, Gemini)
   - Configure as credenciais no .env

## 🚀 Uso

Desenvolvimento:
\\\ash
npm run dev
\\\

Produção:
\\\ash
npm start
\\\

## 🔐 Segurança

- Nunca compartilhe suas credenciais
- Não commit arquivos .env ou credentials.json
- Mantenha suas chaves de API seguras

## 📝 Licença

MIT License - veja o arquivo [LICENSE](LICENSE) para mais detalhes.

## 👤 Autor

Adeilton Lima
