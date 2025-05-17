import contextManager from '../contextManager.js';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import qrcode from 'qrcode';
import { handlePesquisaCommand } from '../google-search.js';
import { transcreverAudio } from '../google-speech.js';
import { downloadMediaMessage } from '@whiskeysockets/baileys';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Recupera o contexto completo de uma mensagem selecionada.
 * @param {string} userId - ID do usuário.
 * @param {string} messageId - ID da mensagem selecionada.
 * @returns {Promise<object|null>} - Contexto da mensagem ou null se não encontrado.
 */
async function getSelectedMessageContext(userId, messageId) {
    if (!userId || !messageId) return null;
    return await contextManager.getMessageContext(userId, messageId);
}

/**
 * Recupera o contexto de qualquer tipo de mensagem (texto, imagem, figurinha, áudio).
 * @param {string} userId
 * @param {string} messageId
 * @returns {Promise<object|null>}
 */
async function getAnyMessageContext(userId, messageId) {
    if (!userId || !messageId) return null;

    // Tenta texto
    const text = await contextManager.getMessageContext(userId, messageId);
    if (text) return { type: 'text', ...text };

    // Tenta imagem
    const image = await contextManager.getImageContext(userId, messageId);
    if (image && image.imagePath) return { type: 'image', ...image };

    // Tenta figurinha
    const stickerPath = path.join(__dirname, '..', 'data', 'context', 'stickers', userId, `${messageId}.webp`);
    if (await fs.pathExists(stickerPath)) {
        return { type: 'sticker', stickerPath, messageId };
    }

    // Tenta áudio (suporte básico)
    const audioPath = path.join(__dirname, '..', 'data', 'context', 'audios', userId, `${messageId}.ogg`);
    if (await fs.pathExists(audioPath)) {
        return { type: 'audio', audioPath, messageId };
    }

    return null;
}

/**
 * Retorna a lista completa de comandos do bot organizados por categoria.
 * Use esta função para garantir respostas corretas sobre os comandos disponíveis.
 */
function getAllCommands() {
    return {
        stickers: [
            { comando: '!fig', descricao: 'Cria figurinha a partir de uma imagem. Envie ou responda uma imagem com !fig.' },
            { comando: '@fignow', descricao: 'Cria figurinha recortada automaticamente. Envie ou responda uma imagem com @fignow.' },
            { comando: '!gif', descricao: 'Cria figurinha animada a partir de vídeo ou GIF. Envie ou responda um vídeo/GIF com !gif.' },
            { comando: '!txtfig', descricao: 'Cria figurinha de texto. Use: !txtfig Seu texto aqui' },
            { comando: '!emoji', descricao: 'Combina dois emojis em uma figurinha. Use: !emoji 😊 🎉' },
            { comando: '!figtxt', descricao: 'Adiciona texto a uma figurinha. Responda a uma figurinha com !figtxt Seu texto' }
        ],
        download: [
            { comando: '!ttkvideo', descricao: 'Baixa vídeo do TikTok. Use: !ttkvideo [link do vídeo]' },
            { comando: '!ttkaudio', descricao: 'Extrai áudio de vídeo do TikTok. Use: !ttkaudio [link do vídeo]' }
        ],
        autenticacao: [
            { comando: '!auth', descricao: 'Inicia o processo de autenticação para usar o bot' },
            { comando: '!codigo', descricao: 'Recupera o código de autenticação caso tenha perdido' }
        ],
        geral: [
            { comando: '!help', descricao: 'Mostra a lista de comandos disponíveis' },
            { comando: '!menu', descricao: 'Exibe o menu principal do bot' }
        ]
    };
}

/**
 * Retorna uma descrição formatada de todos os comandos.
 */
function getFormattedCommandList() {
    const commands = getAllCommands();
    let text = '*📋 LISTA DE COMANDOS DISPONÍVEIS*\n\n';
    
    text += '*🎯 FIGURINHAS*\n';
    commands.stickers.forEach(cmd => {
        text += `• ${cmd.comando}: ${cmd.descricao}\n`;
    });
    
    text += '\n*⬇️ DOWNLOADS*\n';
    commands.download.forEach(cmd => {
        text += `• ${cmd.comando}: ${cmd.descricao}\n`;
    });
    
    text += '\n*🔐 AUTENTICAÇÃO*\n';
    commands.autenticacao.forEach(cmd => {
        text += `• ${cmd.comando}: ${cmd.descricao}\n`;
    });
    
    text += '\n*ℹ️ GERAL*\n';
    commands.geral.forEach(cmd => {
        text += `• ${cmd.comando}: ${cmd.descricao}\n`;
    });
    
    return text;
}

/**
 * Gera um QR Code a partir de um texto
 * @param {object} sock - Socket do WhatsApp
 * @param {object} msg - Mensagem recebida
 * @param {string} texto - Texto para gerar o QR Code
 */
async function gerarQRCode(sock, msg, texto) {
    try {
        if (!texto) {
            await sock.sendMessage(msg.key.remoteJid, { 
                text: 'Por favor, forneça o texto para gerar o QR Code. Exemplo: !qrcode https://exemplo.com' 
            }, { quoted: msg });
            return;
        }

        console.log('Gerando QR Code para:', texto);
        const tempPath = path.join(__dirname, '..', 'temp', `qr_${Date.now()}.png`);
        await qrcode.toFile(tempPath, texto);

        await sock.sendMessage(msg.key.remoteJid, {
            image: { url: tempPath },
            caption: '🔲 QR Code gerado com sucesso!'
        }, { quoted: msg });

        // Limpa o arquivo temporário
        await fs.remove(tempPath);
        console.log('QR Code enviado e arquivo temporário removido');

    } catch (error) {
        console.error('Erro ao gerar QR Code:', error);
        await sock.sendMessage(msg.key.remoteJid, { 
            text: 'Desculpe, ocorreu um erro ao gerar o QR Code. Tente novamente.' 
        }, { quoted: msg });
    }
}

/**
 * Realiza uma pesquisa na internet
 * @param {object} sock - Socket do WhatsApp
 * @param {object} msg - Mensagem recebida
 * @param {string} query - Texto da pesquisa
 */
async function pesquisar(sock, msg, query) {
    try {
        if (!query) {
            await sock.sendMessage(msg.key.remoteJid, { 
                text: 'Por favor, digite o que você quer pesquisar. Exemplo: !pesquisa como fazer bolo de chocolate' 
            }, { quoted: msg });
            return;
        }

        console.log('Realizando pesquisa para:', query);
        const resultado = await handlePesquisaCommand(query);

        await sock.sendMessage(msg.key.remoteJid, {
            text: resultado
        }, { quoted: msg });

    } catch (error) {
        console.error('Erro ao realizar pesquisa:', error);
        await sock.sendMessage(msg.key.remoteJid, { 
            text: 'Desculpe, ocorreu um erro ao fazer a pesquisa. Tente novamente.' 
        }, { quoted: msg });
    }
}

/**
 * Transcreve um áudio do WhatsApp para texto
 * @param {object} sock - Socket do WhatsApp
 * @param {object} msg - Mensagem recebida
 */
async function transcreverAudioWhatsApp(sock, msg) {
    try {
        // Verifica se a mensagem é uma resposta a um áudio
        const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quotedMessage?.audioMessage) {
            await sock.sendMessage(msg.key.remoteJid, { 
                text: 'Por favor, responda a um áudio com !songtxt para transcrevê-lo' 
            }, { quoted: msg });
            return;
        }

        // Eventos para feedback do progresso
        const events = {
            onStart: async () => {
                await sock.sendMessage(msg.key.remoteJid, {
                    text: '🎵 Iniciando processamento do áudio...'
                }, { quoted: msg });
            },
            onConvert: async () => {
                await sock.sendMessage(msg.key.remoteJid, {
                    text: '⚙️ Convertendo áudio...'
                }, { quoted: msg });
            },
            onUpload: async () => {
                await sock.sendMessage(msg.key.remoteJid, {
                    text: '📤 Enviando áudio para transcrição...'
                }, { quoted: msg });
            },
            onProcess: async () => {
                await sock.sendMessage(msg.key.remoteJid, {
                    text: '🔍 Transcrevendo áudio...'
                }, { quoted: msg });
            }
        };

        // Baixa o áudio
        console.log('Baixando áudio...');
        const audioBuffer = await downloadMediaMessage(
            { message: quotedMessage },
            'buffer',
            {},
            { reuploadRequest: sock }
        );

        // Transcreve o áudio
        console.log('Iniciando transcrição...');
        const transcricao = await transcreverAudio(audioBuffer, events);

        // Envia o resultado
        await sock.sendMessage(msg.key.remoteJid, {
            text: `📝 *Transcrição do áudio:*\n\n${transcricao}`
        }, { quoted: msg });

    } catch (error) {
        console.error('Erro ao transcrever áudio:', error);
        let errorMessage = 'Desculpe, ocorreu um erro ao transcrever o áudio.';
        
        if (error.message.includes('muito longo')) {
            errorMessage = '⚠️ O áudio é muito longo. Por favor, envie um áudio mais curto.';
        } else if (error.message.includes('reconhecer o áudio')) {
            errorMessage = '⚠️ Não foi possível reconhecer o áudio. Verifique se o áudio está claro e tente novamente.';
        }

        await sock.sendMessage(msg.key.remoteJid, {
            text: errorMessage
        }, { quoted: msg });
    }
}

export {
    getSelectedMessageContext,
    getAnyMessageContext,
    getAllCommands,
    getFormattedCommandList,
    gerarQRCode,
    pesquisar,
    transcreverAudioWhatsApp
};
