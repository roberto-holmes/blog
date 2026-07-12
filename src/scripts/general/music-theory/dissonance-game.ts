class Tone {
    context: AudioContext;
    osc: OscillatorNode;
    gainNode: GainNode;
    notesInFlight: number;
    constructor(context: AudioContext) {
        this.context = context;
        this.osc = this.context.createOscillator();
        this.gainNode = this.context.createGain();
        this.notesInFlight = 0;
        this.init();
    }
    init() {
        if (this.notesInFlight > 0) {
            this.osc.stop();
        }
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
        this.notesInFlight++;
        const release_ms = 50;
        setTimeout(() => {
            if (this.notesInFlight == 1) {
                this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, this.context.currentTime);
                this.gainNode.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + release_ms / 1000);
            }
            this.notesInFlight--;
        }, duration_ms - release_ms);
    }
}

class Game {
    context: AudioContext;
    counter: HTMLElement;

    currentRound: number;
    rounds: number[][];

    buttons: HTMLElement[];
    volumeSlider: HTMLInputElement;

    tone1: Tone;
    tone2: Tone;
    constructor(context: AudioContext, intervalCount: number) {
        this.context = context;
        this.counter = document.getElementById("counter") as HTMLElement;
        this.volumeSlider = document.getElementById("volume") as HTMLInputElement;

        this.tone1 = new Tone(context);
        this.tone2 = new Tone(context);

        let intervals: number[] = [];
        for (let i = 0; i <= 1.0; i += 1.0 / intervalCount) {
            intervals.push(i);
        }

        this.currentRound = 0;
        this.rounds = [];
        for (let i = 0; i < intervals.length - 1; i++) {
            for (let j = i + 1; j < intervals.length; j++) {
                // Randomise the order that the notes are played in
                if (Math.random() < 0.5) {
                    this.rounds.push([intervals[i] as number, intervals[j] as number]);
                } else {
                    this.rounds.push([intervals[j] as number, intervals[i] as number]);
                }
            }
        }

        let currentIndex = this.rounds.length;

        // Fisher–Yates shuffle
        while (currentIndex != 0) {
            // Pick a remaining element...
            let randomIndex = Math.floor(Math.random() * currentIndex--);

            if (this.rounds[currentIndex] === undefined || this.rounds[randomIndex] === undefined) {
                console.warn("Issue with shuffling the rounds");
                break;
            }
            // And swap it with the current element.
            [this.rounds[currentIndex], this.rounds[randomIndex]] = [this.rounds[randomIndex], this.rounds[currentIndex] as number[]];
        }

        this.buttons = [
            document.getElementById("selector-A") as HTMLElement,
            document.getElementById("selector-B") as HTMLElement,
            document.getElementById("selector-same") as HTMLElement,
        ];

        (this.buttons[0] as HTMLElement).addEventListener("click", () => {
            this.select("1");
        });
        (this.buttons[1] as HTMLElement).addEventListener("click", () => {
            this.select("2");
        });
        (this.buttons[2] as HTMLElement).addEventListener("click", () => {
            this.select("3");
        });

        console.log(intervals);
        console.log(this.rounds);

        this.updateCounter();

        this.play();
    }
    updateCounter() {
        this.counter.innerHTML = `${this.currentRound}/${this.rounds.length}`;
    }
    play() {
        if (this.rounds[this.currentRound] === undefined) {
            console.warn(`Trying to access a non-existant round ${this.currentRound}`);
        }
        const currentRound = this.rounds[this.currentRound] as number[];
        const noteDuration_ms = 750;
        // Play the first sound
        this.playInterval(currentRound[0] as number, 0, noteDuration_ms);
        (this.buttons[0] as HTMLElement).classList.add("playing");
        setTimeout(() => {
            (this.buttons[0] as HTMLElement).classList.remove("playing");
        }, noteDuration_ms);

        // Play the second sound
        this.playInterval(currentRound[1] as number, noteDuration_ms + 250, noteDuration_ms);
        setTimeout(() => {
            (this.buttons[1] as HTMLElement).classList.add("playing");
        }, noteDuration_ms + 250);
        setTimeout(
            () => {
                (this.buttons[1] as HTMLElement).classList.remove("playing");
            },
            2 * noteDuration_ms + 250,
        );
    }
    playInterval(interval: number, delay_ms: number, note_duration_ms: number, baseFreq = 440) {
        // Interval is a number between 0 and 1 where 0 is the same note as baseFreq and 1 is twice the frequency
        const intervalFreq = baseFreq * Math.pow(2, interval);
        console.log(`Playing ${interval} interval in ${delay_ms} ms`);
        return new Promise(() => {
            setTimeout(() => {
                const volume = Number(this.volumeSlider.value);
                this.tone1.play(baseFreq, volume, note_duration_ms);
                this.tone2.play(intervalFreq, volume, note_duration_ms);
            }, delay_ms);
        });
    }
    select(key: string) {
        let element;
        switch (key) {
            case "1":
                element = this.buttons[0];
                break;
            case "2":
                element = this.buttons[1];
                break;
            case "3":
                element = this.buttons[2];
                break;
            case " ":
                this.play();
                return;
            default:
                return;
        }
        if (element === undefined) {
            return;
        }
        element.classList.add("selected");
        setTimeout(() => {
            element.classList.remove("selected");
        }, 100);
        if (this.currentRound++ >= this.rounds.length) {
            this.finish();
        } else {
            this.updateCounter();
            this.play();
        }
    }
    finish() {
        console.log("Game complete");
    }
}

export function initGame() {
    console.log("Initialising game");
    let audioContext = new AudioContext();
    let game = new Game(audioContext, 10);

    // Hide the start button and show all of the elements
    (document.getElementById("start-game") as HTMLElement).hidden = true;
    let gameElements = document.querySelectorAll(".game-elements");
    for (let i = 0; i < gameElements.length; i++) {
        (gameElements[i] as Element).classList.remove("game-elements");
    }

    document.addEventListener("keydown", (e) => {
        game.select(e.key);
    });

    // Set up so that the play button will play the sounds
    (document.getElementById("repeat") as HTMLElement).addEventListener("click", (_) => {
        game.play();
    });
}
