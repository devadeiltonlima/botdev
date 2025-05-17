import { DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage, makeWASocket, useMultiFileAuthState } from '@whiskeysockets/baileys';
import P from 'pino';
import { Boom } from '@hapi/boom';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { handleMessage, handleUserError, addUpdate } from './gemini.js';
import { analyzeImage, analyzeImageFromUrl, analyzeImageFast } from './google-vision.js';
import { v4 as uuidv4 } from 'uuid';
import firebaseManager from './firebaseManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Importar comandos modularizados
import { 
    criarFigurinhaImagem,
    criarFigurinhaRecortada,
    criarFigurinhaAnimada,
    criarFigurinhaTexto,
    combinarEmojis,
    adicionarTextoFigurinha
} from './commands/stickerCommands.js';

import {
    carregarUsuarios,
    salvarUsuarios,
    iniciarAutenticacao,
    verificarCodigo,
    recuperarCodigo
} from './commands/authCommands.js';

import {
    baixarVideoTikTok,
    baixarAudioTikTok
} from './commands/downloadCommands.js';

import {
    gerarQRCode,
    transcreverAudioWhatsApp,
    pesquisar,
    getAllCommands,
    getFormattedCommandList
} from './commands/utilityCommands.js';

// Obtém os comandos do bot de forma organizada
const BOT_COMMANDS = getAllCommands();

// Exporta os comandos e funções auxiliares
export { BOT_COMMANDS, getFormattedCommandList };

// IDs dos administradores do bot
const ADMIN_IDS = ['556992806053@s.whatsapp.net'];

// Função para verificar se um ID é de administrador
function isAdmin(id) {
    return ADMIN_IDS.includes(id) || 
           ADMIN_IDS.includes(id.replace('@s.whatsapp.net', '')) || 
           ADMIN_IDS.includes(id + '@s.whatsapp.net');
}

// Função para atualizar o Gemini sobre os comandos
async function atualizarComandosGemini() {
    console.log('Atualizando comandos no Gemini...');
    try {
        const commands = getAllCommands();
        // Cria uma versão simplificada dos comandos
        const commandsSimple = {};
        Object.entries(commands).forEach(([category, cmds]) => {
            cmds.forEach(cmd => {
                // Mantém apenas informações essenciais e evita níveis profundos
                commandsSimple[cmd.comando] = {
                    name: cmd.comando,
                    info: cmd.descricao,
                    type: category
                };
            });
        });
        
        const comandosJson = JSON.stringify(commandsSimple);
        const systemMessageId = 'system_' + Date.now();
        await handleMessage('SYSTEM', systemMessageId, 'SYSTEM_UPDATE_COMMANDS ' + comandosJson);
        console.log('Comandos atualizados no Gemini com sucesso!');
    } catch (error) {
        console.error('Erro ao atualizar comandos no Gemini:', error);
    }
}

// Função auxiliar para reagir a mensagens
async function reagirMensagem(sock, msg, emoji) {
    await sock.sendMessage(msg.key.remoteJid, {
        react: {
            text: emoji,
            key: msg.key
        }
    });
}

// Função principal de conexão e manipulação de mensagens
async function connectToWhatsApp() {
    try {
        console.log('Carregando credenciais...');
        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
        
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: true,
            logger: P({ level: 'silent' }),
            browser: ['AdeBot', 'Chrome', '1.0.0'],
            version: (await fetchLatestBaileysVersion()).version,
        });

        // Evento de atualização de credenciais
        sock.ev.on('creds.update', saveCreds);

        // Evento de atualização de conexão
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('Conexão fechada devido a ', lastDisconnect.error, ', reconectando:', shouldReconnect);
                
                if (shouldReconnect) {
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    connectToWhatsApp();
                }
            } else if (connection === 'open') {
                console.log('Bot conectado com sucesso!');
                await atualizarComandosGemini();
            }
        });

        // Manipulador de mensagens
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;

            const msg = messages[0];
            if (!msg.message || msg.key.fromMe) return;

            // Confirmação de leitura e indicador de digitação
            await sock.readMessages([msg.key]);
            await sock.sendPresenceUpdate('composing', msg.key.remoteJid);

            // Autenticação e limite de uso
            let jidJson = (msg.key.participant || msg.key.remoteJid).replace(/(@g\.us|@s\.whatsapp\.net)$/i, '');
            let jidEnvio = msg.key.remoteJid;
            let usuarios = carregarUsuarios();
            
            // Registro ou atualização do usuário
            if (!usuarios[jidJson]) {
                usuarios[jidJson] = {
                    nome: msg.pushName || null,
                    autenticado: false,
                    codigo: null,
                    usosHoje: 0,
                    ultimoUso: null,
                    optouAutenticacao: null
                };
                salvarUsuarios(usuarios);
            }
            let usuario = usuarios[jidJson];

            // Verificação de limite diário
            const hoje = new Date().toISOString().slice(0, 10);
            if (usuario.ultimoUso !== hoje) {
                usuario.usosHoje = 0;
                usuario.ultimoUso = hoje;
            }

            // Se houver uma imagem
            if (msg.message.imageMessage) {
                const texto = msg.message.imageMessage.caption || '';
                
                if (texto.startsWith('!') || texto.startsWith('@')) {
                    // Processamento de comandos de imagem
                    try {
                        if (texto.startsWith('!fig')) {
                            await criarFigurinhaImagem(sock, msg);
                        } else if (texto.startsWith('@fignow')) {
                            const textoFigura = texto.replace('@fignow', '').trim();
                            await criarFigurinhaRecortada(sock, msg, textoFigura);
                        }
                    } catch (error) {
                        console.error('Erro ao processar comando de imagem:', error);
                        await sock.sendMessage(msg.key.remoteJid, { 
                            text: 'Ocorreu um erro ao processar sua solicitação.' 
                        }, { quoted: msg });
                        await reagirMensagem(sock, msg, '❌');
                    }
                } else {
                    // Análise natural da imagem
                    try {
                        console.log('\n[WhatsApp] Imagem recebida, iniciando processamento...');
                        
                        // Verifica se é uma resposta a outra mensagem
                        let finalText = texto || "O que você vê nesta imagem?";
                        const quotedMessage = msg.message?.imageMessage?.contextInfo?.quotedMessage;
                        
                        if (quotedMessage) {
                            const quotedId = msg.message.imageMessage.contextInfo.stanzaId;
                            finalText = `${finalText} context_ref:${quotedId}`;
                        }
                        
                        console.log(`[WhatsApp] Texto da mensagem: "${finalText}"`);
                        
                        console.log('[WhatsApp] Baixando imagem...');
                        const buffer = await downloadMediaMessage(msg, 'buffer', {}, { reuploadRequest: sock });
                        console.log('[WhatsApp] Imagem baixada com sucesso');
                        
                        console.log('[WhatsApp] Enviando para análise...');
                        const messageId = msg.key.id || uuidv4();
                        const response = await handleMessage(jidJson, messageId, finalText, null, buffer);
                        console.log('[WhatsApp] Análise completa, resposta recebida');
                        
                        await sock.sendMessage(msg.key.remoteJid, { text: response }, { quoted: msg });
                    } catch (error) {
                        console.error('Erro ao analisar imagem:', error);
                        await sock.sendMessage(msg.key.remoteJid, { 
                            text: 'Desculpe, tive um problema ao analisar a imagem. Pode tentar novamente?' 
                        }, { quoted: msg });
                    }
                }
                return;
            }

            // Processar outros tipos de mensagem
            const texto = msg.message.conversation || 
                       msg.message.extendedTextMessage?.text || 
                       msg.message.videoMessage?.caption;

            if (texto) {
                if (texto.startsWith('!') || texto.startsWith('@')) {
                    // Processamento de comandos
                    const partes = texto.split(' ');
                    const comando = partes[0];
                    const conteudo = texto.replace(comando, '').trim();

                    try {
                        // Switch para diferentes comandos
                        switch (comando) {
                            case '!help':
                                const helpMessage = getFormattedCommandList();
                                await sock.sendMessage(msg.key.remoteJid, { text: helpMessage }, { quoted: msg });
                                await reagirMensagem(sock, msg, '✅');
                                break;
                            case '!gif':
                                await criarFigurinhaAnimada(sock, msg);
                                break;
                            case '!txtfig':
                                await criarFigurinhaTexto(sock, msg, conteudo);
                                break;
                            case '!qrcode':
                                await gerarQRCode(sock, msg, conteudo);
                                break;
                            case '!ttkvideo':
                                await baixarVideoTikTok(sock, msg, conteudo);
                                break;
                            case '!ttkaudio':
                                await baixarAudioTikTok(sock, msg, conteudo);
                                break;
                            case '!songtxt':
                                await transcreverAudioWhatsApp(sock, msg);
                                break;
                            case '!emoji':
                                await combinarEmojis(sock, msg, conteudo);
                                break;
                            case '!auth':
                                await iniciarAutenticacao(sock, msg, jidJson);
                                break;
                            case '!authperdi':
                                await recuperarCodigo(sock, msg, jidJson);
                                break;
                            case '!pesquisa':
                                await pesquisar(sock, msg, conteudo);
                                break;
                            case '!figtxt':
                                await adicionarTextoFigurinha(sock, msg, conteudo);
                                break;
                            case '!giftxt':
                                // Implementação pendente - será adicionada em breve
                                await sock.sendMessage(msg.key.remoteJid, { 
                                    text: 'Desculpe, este comando está em manutenção. Tente novamente mais tarde.'
                                }, { quoted: msg });
                                await reagirMensagem(sock, msg, '⚠️');
                                break;
                            default:
                                const errorResponse = await handleUserError(jidJson, 'commandNotFound');
                                await sock.sendMessage(msg.key.remoteJid, { text: errorResponse }, { quoted: msg });
                                await reagirMensagem(sock, msg, '❌');
                        }
                    } catch (error) {
                        console.error('Erro ao processar comando:', error);
                        const errorResponse = await handleUserError(jidJson, 'default');
                        await sock.sendMessage(msg.key.remoteJid, { text: errorResponse }, { quoted: msg });
                    }
                } else {
                    // Verifica se é uma mensagem respondida
                    let finalMessage = texto;
                    const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                    
                    if (quotedMessage) {
                        // Adiciona o ID da mensagem citada como referência
                        const quotedId = msg.message.extendedTextMessage.contextInfo.stanzaId;
                        finalMessage = `${texto} context_ref:${quotedId}`;
                    }
                    
                    // Mensagem normal para o Gemini
                    const messageId = msg.key.id || uuidv4();
                    const response = await handleMessage(jidJson, messageId, finalMessage);
                    await sock.sendMessage(msg.key.remoteJid, { text: response }, { quoted: msg });
                }
            }

            await sock.sendPresenceUpdate('paused', msg.key.remoteJid);
        });

        // Manipulador de mensagens deletadas
        sock.ev.on('messages.delete', async (deletedMessages) => {
            try {
                console.log('Mensagens deletadas detectadas:', deletedMessages);
                
                // Se for uma mensagem única deletada
                if (typeof deletedMessages === 'object' && deletedMessages.keys) {
                    for (const key of deletedMessages.keys) {
                        const userId = key.remoteJid.replace(/(@g\.us|@s\.whatsapp\.net)$/i, '');
                        const messageId = key.id;
                        
                        // Tenta deletar a mensagem do Firebase
                        const deleted = await firebaseManager.deleteMessageContext(userId, messageId);
                        if (deleted) {
                            console.log(`Mensagem ${messageId} do usuário ${userId} deletada do Firebase com sucesso`);
                        }
                    }
                }
                // Se for uma limpeza de chat (todas as mensagens)
                else if (deletedMessages.jid) {
                    const userId = deletedMessages.jid.replace(/(@g\.us|@s\.whatsapp\.net)$/i, '');
                    console.log(`Chat limpo detectado para usuário ${userId}`);
                    
                    // Aqui você pode implementar a lógica para deletar todas as mensagens do usuário
                    // Por enquanto, vamos apenas registrar o evento
                    console.log(`Detecção de limpeza de chat para ${userId}`);
                }
            } catch (error) {
                console.error('Erro ao processar mensagens deletadas:', error);
            }
        });

        // Manipulador de atualização de mensagens (para detectar exclusões)
        sock.ev.on('messages.update', async (updates) => {
            try {
                for (const update of updates) {
                    // Verifica se é uma atualização de exclusão de mensagem
                    if (update.update?.protocolMessage?.type === 5 ||  // Tipo 5 = exclusão de mensagem
                        (update.update && update.update.message === null)) { // Outra forma de detectar exclusão
                        
                        const remoteJid = update.key.remoteJid;
                        const userId = remoteJid.replace(/(@g\.us|@s\.whatsapp\.net)$/i, '');
                        const messageId = update.key.id;
                        
                        console.log(`[WhatsApp] Mensagem ${messageId} do usuário ${userId} foi apagada`);
                        
                        // Tenta deletar a mensagem do Firebase
                        const deleted = await firebaseManager.deleteMessageContext(userId, messageId);
                        if (deleted) {
                            console.log(`[Firebase] Mensagem ${messageId} excluída com sucesso`);
                        }
                    }
                }
            } catch (error) {
                console.error('Erro ao processar mensagens apagadas:', error);
            }
        });
        
        // Manipulador de exclusão de chats (limpeza de todas as mensagens)
        sock.ev.on('chats.delete', async (deletedChats) => {
            try {
                for (const chat of deletedChats) {
                    const userId = chat.replace(/(@g\.us|@s\.whatsapp\.net)$/i, '');
                    console.log(`[WhatsApp] Chat com usuário ${userId} foi limpo/excluído`);
                    
                    // Exclui todas as mensagens desse usuário no Firebase
                    await firebaseManager.deleteAllUserMessages(userId);
                }
            } catch (error) {
                console.error('Erro ao processar exclusão de chat:', error);
            }
        });
        
        // Manipulador adicional para limpeza de chats pela API update
        sock.ev.on('chats.update', async (updates) => {
            try {
                for (const update of updates) {
                    // Verifica se o chat foi limpo (mensagens foram deletadas mas o chat permanece)
                    if (update.messages === null || update.messages?.length === 0 || update.clearChat) {
                        const userId = update.id.replace(/(@g\.us|@s\.whatsapp\.net)$/i, '');
                        console.log(`[WhatsApp] Detectada limpeza de mensagens para ${userId}`);
                        
                        // Exclui todas as mensagens desse usuário no Firebase
                        await firebaseManager.deleteAllUserMessages(userId);
                    }
                }
            } catch (error) {
                console.error('Erro ao processar limpeza de mensagens:', error);
            }
        });

    } catch (error) {
        console.error('Erro ao inicializar o bot:', error);
        process.exit(1);
    }
}

// Inicia o bot
connectToWhatsApp().catch(err => {
    console.error('Erro fatal ao iniciar o bot:', err);
    process.exit(1);
});

// Tratamento de erros não capturados
process.on('uncaughtException', err => {
    console.error('Erro não capturado:', err);
});

process.on('unhandledRejection', err => {
    console.error('Promise rejeitada não tratada:', err);
});

// Limpeza periódica de arquivos temporários
const tempDir = path.join(__dirname, 'temp');
fs.ensureDirSync(tempDir);

setInterval(async () => {
    try {
        const files = await fs.readdir(tempDir);
        for (const file of files) {
            const filePath = path.join(__dirname, 'temp', file);
            const stats = await fs.stat(filePath);
            const age = Date.now() - stats.mtimeMs;
            if (age > 3600000) {
                await fs.remove(filePath);
                console.log(`Arquivo temporário removido: ${filePath}`);
            }
        }
    } catch (error) {
        console.error('Erro ao limpar arquivos temporários:', error);
    }
}, 3600000);
