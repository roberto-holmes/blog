import { initMidiDropdown } from "./midi.js";
import { initGame } from "./dissonance-game.js";

initMidiDropdown(document.getElementById("midi-selector") as HTMLSelectElement);

(document.getElementById("start-game") as HTMLElement).addEventListener("click", (_) => {
    initGame();
});

let audioContext: AudioContext | null = null;

class Tone {
    context: AudioContext;
    osc: OscillatorNode;
    gainNode: GainNode;
    constructor(context: AudioContext) {
        this.context = context;
        this.osc = this.context.createOscillator();
        this.gainNode = this.context.createGain();
        this.init();
    }
    init() {
        this.osc = this.context.createOscillator();
        this.gainNode = this.context.createGain();
        this.osc.connect(this.gainNode);
        this.gainNode.connect(this.context.destination);
    }
    play(freq: number, gain: number, duration_ms: number) {
        console.log(`Playing a tone at ${freq} Hz for ${duration_ms} ms`);
        this.init();
        this.gainNode.gain.value = gain;
        this.osc.frequency.value = freq;
        this.osc.start();
        const release_ms = 50;
        setTimeout(() => {
            this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, this.context.currentTime);
            this.gainNode.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + release_ms / 1000);
        }, duration_ms - release_ms);
    }
}

let tone1: Tone | null = null;
let tone2: Tone | null = null;

let sweepButton = document.getElementById("sweep") as HTMLButtonElement;
sweepButton.addEventListener("click", (_) => {
    audioContext = new AudioContext();
    if (audioContext === null) {
        console.log("audioContext is null");
        return;
    }
    tone1 = new Tone(audioContext);
    tone2 = new Tone(audioContext);
    playIntervals(12, 1200);
});

// Interval is a number between 0 and 1 where 0 is the same note as baseFreq and 1 is twice the frequency
function playInterval(interval: number, delay_ms: number, note_duration_ms: number, baseFreq = 440) {
    const intervalFreq = baseFreq * Math.pow(2, interval);
    console.log(`Playing ${interval} interval in ${delay_ms} ms`);
    return new Promise(() => {
        setTimeout(() => {
            const volume = Number((document.getElementById("volume") as HTMLInputElement).value);
            tone1?.play(baseFreq, volume, note_duration_ms);
            tone2?.play(intervalFreq, volume, note_duration_ms);
        }, delay_ms);
    });
}

async function playIntervals(intervals: number, duration_ms: number) {
    for (let i = 0; i <= 1.0; i += 1.0 / intervals) {
        playInterval(i, duration_ms * i, duration_ms / (intervals + 1), 220);
    }
}
