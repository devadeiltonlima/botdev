import path from 'path';
import { spawn } from 'child_process';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Função auxiliar
async function reagirMensagem(sock, msg, emoji) {
    await sock.sendMessage(msg.key.remoteJid, {
        react: {
            text: emoji,
            key: msg.key
        }
    });
}

// Função para baixar vídeo do TikTok
async function baixarVideoTikTok(sock, msg, url) {
    try {
        console.log('\n=== INÍCIO DO PROCESSO DE DOWNLOAD DO TIKTOK ===');
        console.log('Mensagem recebida:', {
            remoteJid: msg.key.remoteJid,
            messageType: 'command',
            command: '!ttkvideo',
            url: url
        });

        if (!url) {
            console.log('❌ URL não fornecida');
            await sock.sendMessage(msg.key.remoteJid, { 
                text: 'Envie o link do vídeo do TikTok. Ex: !ttkvideo https://vm.tiktok.com/...'
            }, { quoted: msg });
            await reagirMensagem(sock, msg, '❌');
            return;
        }
        
        console.log('✨ Iniciando processo de download...');
        await reagirMensagem(sock, msg, '⏳');
        console.log('💬 Enviando mensagem de status...');
        await sock.sendMessage(msg.key.remoteJid, { 
            text: 'Baixando vídeo do TikTok... Isso pode levar alguns segundos ⏳'
        }, { quoted: msg });
        
        console.log('🐍 Iniciando processo Python...');
        const pythonProcess = spawn('python', [
            path.join(__dirname, '../tiktok_downloader.py'),
            url,
            'video'
        ]);
        
        let outputData = '';
        pythonProcess.stdout.on('data', (data) => {
            const output = data.toString();
            outputData += output;
            console.log('📤 Python stdout:', output);
        });
        
        let errorData = '';
        pythonProcess.stderr.on('data', (data) => {
            const error = data.toString();
            errorData += error;
            console.log('📥 Python stderr:', error);
        });
        
        await new Promise((resolve, reject) => {
            pythonProcess.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`Processo Python terminou com código ${code}`));
            });
            pythonProcess.on('error', reject);
        });
        
        try {
            console.log('🔄 Processando resultado do Python...');
            const resultado = JSON.parse(outputData);
            if (resultado.error) {
                console.log('❌ Erro retornado pelo Python:', resultado.error);
                throw new Error(resultado.error);
            }
            
            if (resultado.filePath && resultado.type === 'video') {
                console.log('📁 Lendo arquivo de vídeo:', resultado.filePath);
                const videoBuffer = await fs.readFile(resultado.filePath);
                
                console.log('📤 Enviando vídeo...');
                await sock.sendMessage(msg.key.remoteJid, { 
                    video: videoBuffer,
                    caption: '✅ Vídeo baixado com sucesso!'
                }, { quoted: msg });
                
                console.log('✅ Vídeo enviado com sucesso');
                await reagirMensagem(sock, msg, '✅');
            } else {
                throw new Error('Formato de resposta inválido');
            }
            
        } catch (jsonError) {
            console.log('❌ Erro ao processar resposta do Python:', {
                error: jsonError.message,
                outputData,
                errorData
            });
            await sock.sendMessage(msg.key.remoteJid, { 
                text: 'Não foi possível baixar este vídeo. Verifique se o link é válido e tente novamente.'
            }, { quoted: msg });
            await reagirMensagem(sock, msg, '❌');
        }
        
        console.log('=== FIM DO PROCESSO DE DOWNLOAD DO TIKTOK ===\n');
        
    } catch (error) {
        console.log('❌ Erro geral:', error.message);
        await sock.sendMessage(msg.key.remoteJid, { 
            text: 'Erro ao baixar vídeo do TikTok. Verifique se o link é válido e tente novamente.'
        }, { quoted: msg });
        await reagirMensagem(sock, msg, '❌');
    }
}

// Função para baixar áudio do TikTok
async function baixarAudioTikTok(sock, msg, url) {
    try {
        console.log('\n=== INÍCIO DO PROCESSO DE EXTRAÇÃO DE ÁUDIO DO TIKTOK ===');
        console.log('Mensagem recebida:', {
            remoteJid: msg.key.remoteJid,
            messageType: 'command',
            command: '!ttkaudio',
            url: url
        });

        if (!url) {
            console.log('❌ URL não fornecida');
            await sock.sendMessage(msg.key.remoteJid, { 
                text: 'Envie o link do vídeo do TikTok para extrair o áudio. Ex: !ttkaudio https://vm.tiktok.com/...'
            }, { quoted: msg });
            await reagirMensagem(sock, msg, '❌');
            return;
        }
        
        console.log('✨ Iniciando processo de extração de áudio...');
        await reagirMensagem(sock, msg, '⏳');
        
        console.log('💬 Enviando mensagem de status...');
        await sock.sendMessage(msg.key.remoteJid, { 
            text: 'Extraindo áudio do TikTok... Isso pode levar alguns segundos ⏳'
        }, { quoted: msg });
        
        console.log('🐍 Iniciando processo Python...');
        const pythonProcess = spawn('python', [
            path.join(__dirname, '../tiktok_downloader.py'),
            url,
            'audio'
        ]);
        
        let outputData = '';
        pythonProcess.stdout.on('data', (data) => {
            const output = data.toString();
            outputData += output;
            console.log('📤 Python stdout:', output);
        });
        
        let errorData = '';
        pythonProcess.stderr.on('data', (data) => {
            const error = data.toString();
            errorData += error;
            console.log('📥 Python stderr:', error);
        });
        
        await new Promise((resolve, reject) => {
            pythonProcess.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`Processo Python terminou com código ${code}`));
            });
            pythonProcess.on('error', reject);
        });
        
        try {
            console.log('🔄 Processando resultado do Python...');
            const resultado = JSON.parse(outputData);
            if (resultado.error) {
                console.log('❌ Erro retornado pelo Python:', resultado.error);
                throw new Error(resultado.error);
            }
            
            if (resultado.filePath && resultado.type === 'audio') {
                console.log('📁 Lendo arquivo de áudio:', resultado.filePath);
                const audioBuffer = await fs.readFile(resultado.filePath);
                
                console.log('📤 Enviando áudio...');
                await sock.sendMessage(msg.key.remoteJid, { 
                    audio: audioBuffer,
                    mimetype: 'audio/mpeg',
                    ptt: false
                }, { quoted: msg });
                
                console.log('✅ Áudio enviado com sucesso');
                await reagirMensagem(sock, msg, '✅');
            } else {
                throw new Error('Formato de resposta inválido');
            }
            
        } catch (jsonError) {
            console.log('❌ Erro ao processar resposta do Python:', {
                error: jsonError.message,
                outputData,
                errorData
            });
            await sock.sendMessage(msg.key.remoteJid, { 
                text: 'Não foi possível extrair o áudio deste vídeo. Verifique se o link é válido e tente novamente.'
            }, { quoted: msg });
            await reagirMensagem(sock, msg, '❌');
        }
        
        console.log('=== FIM DO PROCESSO DE EXTRAÇÃO DE ÁUDIO DO TIKTOK ===\n');
        
    } catch (error) {
        console.log('❌ Erro geral:', error.message);
        await sock.sendMessage(msg.key.remoteJid, { 
            text: 'Erro ao extrair áudio do TikTok. Verifique se o link é válido e tente novamente.'
        }, { quoted: msg });
        await reagirMensagem(sock, msg, '❌');
    }
}

export {
    baixarVideoTikTok,
    baixarAudioTikTok
};
