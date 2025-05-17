import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Funções de manipulação de usuários
function carregarUsuarios() {
    try {
        if (fs.existsSync('./usuarios.json')) {
            return JSON.parse(fs.readFileSync('./usuarios.json', 'utf8'));
        }
        return {};
    } catch (error) {
        console.error('Erro ao carregar usuários:', error);
        return {};
    }
}

function salvarUsuarios(usuarios) {
    try {
        fs.writeFileSync('./usuarios.json', JSON.stringify(usuarios, null, 2));
    } catch (error) {
        console.error('Erro ao salvar usuários:', error);
    }
}

function gerarCodigo() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Função auxiliar
async function reagirMensagem(sock, msg, emoji) {
    await sock.sendMessage(msg.key.remoteJid, {
        react: {
            text: emoji,
            key: msg.key
        }
    });
}

// Funções de autenticação
async function iniciarAutenticacao(sock, msg, jidJson) {
    try {
        let usuarios = carregarUsuarios();
        let usuario = usuarios[jidJson];
        
        // Se já estiver autenticado
        if (usuario.autenticado) {
            await sock.sendMessage(msg.key.remoteJid, { 
                text: '✅ Você já está autenticado! Pode usar todas as funções sem limitações.'
            }, { quoted: msg });
            return;
        }
        
        // Se estiver aguardando código
        if (usuario.optouAutenticacao === 'aguardando_codigo') {
            await sock.sendMessage(msg.key.remoteJid, { 
                text: `📝 Você já tem um código pendente! Para confirmar sua autenticação, use o código: *${usuario.codigo}*\n\nResponda com o código para continuar.`
            }, { quoted: msg });
            return;
        }
        
        // Gerar novo código
        const codigo = gerarCodigo();
        usuario.codigo = codigo;
        usuario.optouAutenticacao = 'aguardando_codigo';
        salvarUsuarios(usuarios);
        
        await sock.sendMessage(msg.key.remoteJid, { 
            text: `🔑 *Autenticação Iniciada!*\n\nSeu código é: *${codigo}*\n\nResponda com este código para confirmar sua autenticação e desbloquear o uso ilimitado do bot.`
        }, { quoted: msg });
        
    } catch (error) {
        console.error('Erro ao iniciar autenticação:', error);
        await sock.sendMessage(msg.key.remoteJid, { 
            text: 'Erro ao iniciar autenticação. Tente novamente.'
        }, { quoted: msg });
    }
}

async function verificarCodigo(sock, msg, jidJson, codigoInformado) {
    try {
        let usuarios = carregarUsuarios();
        let usuario = usuarios[jidJson];
        
        // Se não estiver aguardando código
        if (usuario.optouAutenticacao !== 'aguardando_codigo') {
            await sock.sendMessage(msg.key.remoteJid, { 
                text: 'Você não solicitou autenticação. Use !auth para iniciar o processo.'
            }, { quoted: msg });
            return;
        }
        
        // Verificar código
        if (usuario.codigo === codigoInformado) {
            usuario.autenticado = true;
            usuario.optouAutenticacao = 'autenticado';
            usuario.codigo = null;
            salvarUsuarios(usuarios);
            
            await sock.sendMessage(msg.key.remoteJid, { 
                text: '✅ *Autenticação Bem-Sucedida!*\n\nVocê agora tem acesso ilimitado a todas as funções do bot! Aproveite! 🎉'
            }, { quoted: msg });
            await reagirMensagem(sock, msg, '✅');
            
        } else {
            await sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ Código incorreto! Tente novamente ou use !auth para gerar um novo código.'
            }, { quoted: msg });
            await reagirMensagem(sock, msg, '❌');
        }
        
    } catch (error) {
        console.error('Erro ao verificar código:', error);
        await sock.sendMessage(msg.key.remoteJid, { 
            text: 'Erro ao verificar código. Tente novamente.'
        }, { quoted: msg });
    }
}

async function recuperarCodigo(sock, msg, jidJson) {
    try {
        let usuarios = carregarUsuarios();
        let usuario = usuarios[jidJson];
        
        // Se já estiver autenticado
        if (usuario.autenticado) {
            await sock.sendMessage(msg.key.remoteJid, { 
                text: '✅ Você já está autenticado! Não precisa de um código.'
            }, { quoted: msg });
            return;
        }
        
        // Gerar novo código independente do estado atual
        const codigo = gerarCodigo();
        usuario.codigo = codigo;
        usuario.optouAutenticacao = 'aguardando_codigo';
        salvarUsuarios(usuarios);
        
        await sock.sendMessage(msg.key.remoteJid, { 
            text: `🔑 *Novo Código Gerado!*\n\nSeu código é: *${codigo}*\n\nResponda com este código para confirmar sua autenticação.`
        }, { quoted: msg });
        
    } catch (error) {
        console.error('Erro ao recuperar código:', error);
        await sock.sendMessage(msg.key.remoteJid, { 
            text: 'Erro ao gerar novo código. Tente novamente.'
        }, { quoted: msg });
    }
}

export {
    carregarUsuarios,
    salvarUsuarios,
    iniciarAutenticacao,
    verificarCodigo,
    recuperarCodigo
};
