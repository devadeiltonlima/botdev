// Efeitos disponíveis para o comando !giftxt
// Seed aleatório baseado na data
const getSeed = () => Math.floor(Date.now() / 10000);

const effects = {
    // Efeito 1: Pulsante Colorido
    pulse: (i, frames, conteudo) => {
        const hue = ((i * 360 / frames) + getSeed()) % 360;
        const scale = 1 + Math.sin(i * Math.PI / frames) * 0.1;
        return {
            transform: `scale(${scale})`,
            fill: `hsl(${hue}, 100%, 50%)`,
            strokeWidth: "4",
            stroke: "#000000",
            gradient: `<linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="hsl(${hue}, 100%, 50%)" />
                <stop offset="100%" stop-color="hsl(${(hue + 60) % 360}, 100%, 70%)" />
            </linearGradient>`
        };
    },

    // Efeito 2: Neon Brilhante
    neon: (i, frames, conteudo) => {
        const hue = ((i * 360 / frames) + getSeed()) % 360;
        return {
            transform: "",
            fill: `hsl(${hue}, 100%, 70%)`,
            strokeWidth: "0",
            filter: "url(#glow)",
            gradient: `<linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="hsl(${hue}, 100%, 70%)" />
                <stop offset="100%" stop-color="hsl(${(hue + 90) % 360}, 100%, 80%)" />
            </linearGradient>
            <filter id="glow">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>`
        };
    },

    // Efeito 3: Saltitante
    bounce: (i, frames, conteudo) => {
        const offset = Math.sin(i * Math.PI / frames) * 30;
        return {
            transform: `translateY(${offset}px)`,
            fill: "white",
            strokeWidth: "4",
            stroke: "#000000",
            gradient: `<linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="white" />
                <stop offset="100%" stop-color="#e0e0e0" />
            </linearGradient>`
        };
    },

    // Efeito 4: Metálico
    metallic: (i, frames, conteudo) => {
        const lightness = 50 + Math.sin(i * Math.PI / frames) * 20;
        return {
            transform: "",
            fill: `hsl(240, 30%, ${lightness}%)`,
            strokeWidth: "3",
            stroke: "hsl(240, 30%, 30%)",
            gradient: `<linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="hsl(240, 30%, ${lightness}%)" />
                <stop offset="50%" stop-color="hsl(240, 40%, ${lightness + 15}%)" />
                <stop offset="100%" stop-color="hsl(240, 30%, ${lightness - 10}%)" />
            </linearGradient>`
        };
    }
};

module.exports = effects;
